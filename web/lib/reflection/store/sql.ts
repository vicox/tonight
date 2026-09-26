import { isSqlState, UNIQUE_VIOLATION, type SqlDriver, type Transaction } from "../../db/driver.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import { checkInstruction, checkName, genreExists } from "../../taste/model.ts";
import {
  checkNoticed,
  checkTarget,
  noSuchProposal,
  notPending,
  ReflectionError,
  type Identified,
  type Observation,
  type Proposal,
  type ProposalState,
  type Target,
} from "../model.ts";
import type { ReflectionStore } from "../store.ts";
import { REFLECTION_SCHEMA } from "./schema.ts";

export { REFLECTION_SCHEMA };

type ObservationRow = { id: string; noticed: string; noticed_at: Date };
type ProposalRow = {
  id: string;
  from_id: string | null;
  noticed: string;
  target_kind: string;
  target_name: string;
  target_instruction: string;
  state: string;
  proposed_at: Date;
  decided_at: Date | null;
};

const asObservation = (row: ObservationRow): Identified<Observation> => ({
  ref: row.id,
  noticed: row.noticed,
  at: row.noticed_at.toISOString(),
});

const asProposal = (row: ProposalRow): Identified<Proposal> => ({
  ref: row.id,
  from: row.from_id,
  noticed: row.noticed,
  target: { kind: "genre", name: row.target_name, instruction: row.target_instruction },
  state: row.state as ProposalState,
  at: row.proposed_at.toISOString(),
  decidedAt: row.decided_at === null ? null : row.decided_at.toISOString(),
});

/**
 * Tonight's own thinking, in SQL, for one user.
 *
 * `owner` is closed over and every statement names it, the way the taste and
 * verdict stores do. What is specific to this store is `accept`: the one method
 * here that writes something the user owns, and the only place in the file
 * where two tables are touched at once.
 */
export function sqlReflectionStore(driver: SqlDriver, user: AuthenticatedUser): ReflectionStore {
  const owner = user.id;

  return {
    async observe(noticed) {
      const said = checkNoticed(noticed);
      const [row] = await driver.query<ObservationRow>(
        `INSERT INTO tonight_observations (user_id, noticed) VALUES ($1, $2)
         RETURNING id, noticed, noticed_at`,
        [owner, said],
      );
      return asObservation(row!);
    },

    async observations() {
      const rows = await driver.query<ObservationRow>(
        `SELECT id, noticed, noticed_at FROM tonight_observations
          WHERE user_id = $1 ORDER BY noticed_at, id`,
        [owner],
      );
      return rows.map(asObservation);
    },

    async propose(from, noticed, target) {
      const said = checkNoticed(noticed);
      const wanted = checkTarget(target);
      if (from !== null && typeof from !== "string") {
        throw new ReflectionError("An observation is named by the reference it was given.");
      }
      try {
        const [row] = await driver.query<ProposalRow>(
          `INSERT INTO tonight_proposals
             (user_id, from_id, noticed, target_kind, target_name, target_instruction)
           VALUES ($1, $2, $3, 'genre', $4, $5)
           RETURNING id, from_id, noticed, target_kind, target_name, target_instruction,
                     state, proposed_at, decided_at`,
          [owner, from, said, wanted.name, wanted.instruction],
        );
        return asProposal(row!);
      } catch (error) {
        // A foreign key that does not resolve means the observation is not this
        // user's, or is not there at all. The same answer either way: a
        // reference that names nothing must not become a way to find out whose
        // it is.
        if (isSqlState(error, "23503")) {
          throw new ReflectionError("No observation of yours has that reference.");
        }
        throw error;
      }
    },

    async proposals() {
      const rows = await driver.query<ProposalRow>(
        `SELECT id, from_id, noticed, target_kind, target_name, target_instruction,
                state, proposed_at, decided_at
           FROM tonight_proposals
          WHERE user_id = $1 ORDER BY proposed_at, id`,
        [owner],
      );
      return rows.map(asProposal);
    },

    async accept(ref) {
      return driver.transaction(async (tx) => {
        const proposal = await claim(tx, owner, ref, "accepted");
        await writeTarget(tx, owner, proposal.target);
        return proposal;
      });
    },

    async reject(ref) {
      return driver.transaction(async (tx) => claim(tx, owner, ref, "rejected"));
    },
  };
}

/**
 * Moves a pending proposal to a decided state, and refuses if it is not pending.
 *
 * The `state = 'pending'` in the WHERE clause is the whole concurrency story:
 * two accepts racing means the second updates nothing, reads the row it lost
 * to, and is refused — rather than both succeeding and writing the target
 * twice. The refusal is the same one a caller gets for accepting something
 * already decided, because from outside it is the same situation.
 */
async function claim(
  tx: Transaction,
  owner: string,
  ref: string,
  becomes: Exclude<ProposalState, "pending">,
): Promise<Identified<Proposal>> {
  if (typeof ref !== "string" || ref.trim() === "") throw noSuchProposal();

  const updated = await tx.query<ProposalRow>(
    `UPDATE tonight_proposals
        SET state = $3, decided_at = now()
      WHERE user_id = $1 AND id = $2 AND state = 'pending'
      RETURNING id, from_id, noticed, target_kind, target_name, target_instruction,
                state, proposed_at, decided_at`,
    [owner, asUuid(ref), becomes],
  );
  if (updated.length > 0) return asProposal(updated[0]!);

  // Nothing moved: either there is no such proposal of theirs, or it was
  // already decided. Told apart here so the refusal can say which.
  const existing = await tx.query<{ state: string }>(
    `SELECT state FROM tonight_proposals WHERE user_id = $1 AND id = $2`,
    [owner, asUuid(ref)],
  );
  if (existing.length === 0) throw noSuchProposal();
  throw notPending(existing[0]!.state as ProposalState);
}

/**
 * Writes what the proposal offered, inside the transaction that accepted it.
 *
 * The same INSERT `createGenre` makes, and the same refusal when the name is
 * taken: a proposal accepted for a genre they already have is refused whole —
 * the transaction rolls back and the proposal stays pending — rather than
 * leaving the acceptance recorded against a write that did not happen.
 *
 * The genre is validated again here by the taste model's own rules. The check
 * in `checkTarget` stopped an unwritable proposal being offered; this one is
 * what stops anything reaching the table, and it is the taste model's to make.
 */
async function writeTarget(tx: Transaction, owner: string, target: Target): Promise<void> {
  const name = checkName(target.name, "genre");
  const instruction = checkInstruction(target.instruction, "genre");
  try {
    await tx.query(
      `INSERT INTO tonight_genres (user_id, name, instruction) VALUES ($1, $2, $3)`,
      [owner, name, instruction],
    );
  } catch (error) {
    if (isSqlState(error, UNIQUE_VIOLATION)) throw genreExists(name);
    throw error;
  }
}

/** A reference is a uuid; anything else names nothing, and says so as that. */
function asUuid(ref: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(ref.trim())) {
    throw noSuchProposal();
  }
  return ref.trim();
}
