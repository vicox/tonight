import type { SqlDriver, Transaction } from "../../db/driver.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import {
  addRound,
  checkEpisode,
  correctEpisode,
  EpisodeError,
  isEmpty,
  stated,
  UNKNOWN,
  type Episode,
  type Offer,
  type Recorded,
  type Said,
  type Source,
} from "../model.ts";
import type { EpisodeStore, Forgotten } from "../store.ts";
import { EPISODES_SCHEMA } from "./schema.ts";

export { EPISODES_SCHEMA };

/**
 * The episode store against Postgres.
 *
 * Bound to one user before it is returned: there is no method here that takes
 * a user, and no statement that reads a row without `user_id = $1`, so reaching
 * somebody else's evenings is not something a caller can express.
 *
 * ## One write path
 *
 * Every write to an existing evening is the same four steps: lock the evening's
 * row, assemble it, apply the pure model, and write the model's answer back —
 * the episode row, then the offers deleted and inserted again in order. The
 * CHECKs therefore only ever see final rows, and the model is the one place
 * every rule is enforced, identity included: no index on the title stands
 * behind it, by design, so the row lock is what keeps two writes from both
 * adding the same film.
 *
 * Offer row ids are never exposed, which is what lets a rewrite replace them.
 */
export function sqlEpisodeStore(driver: SqlDriver, user: AuthenticatedUser): EpisodeStore {
  const owner = user.id;

  /**
   * The read-modify-write every change to an existing evening goes through.
   * `change` is the pure model; its answer is written back whole, or — when it
   * leaves nothing to record (F6) — the evening is deleted.
   */
  const rewrite = (id: string, change: (episode: Episode) => Episode) =>
    driver.transaction<Recorded<Episode> | Forgotten>(async (tx) => {
      const current = await held(tx, owner, id);
      const next = change(current);

      if (isEmpty(next)) {
        const [removed] = await tx.query<{ id: string }>(
          `DELETE FROM tonight_episodes WHERE user_id = $1 AND id = $2 RETURNING id`,
          [owner, current.id],
        );
        if (!removed) throw episodeNotFound(id);
        return { forgotten: current.id };
      }

      await tx.query(
        `UPDATE tonight_episodes
            SET request = $3, request_source = $4, offered_source = $5
          WHERE user_id = $1 AND id = $2`,
        [owner, current.id, next.request, next.requestSource, next.offeredSource],
      );
      await tx.query(`DELETE FROM tonight_episode_offers WHERE user_id = $1 AND episode = $2`, [
        owner,
        current.id,
      ]);
      await insertOffers(tx, owner, current.id, next.offers);
      return { ...next, id: current.id, recordedAt: current.recordedAt };
    });

  return {
    async record(episode: Episode): Promise<Recorded<Episode>> {
      // Held to the same definition as every other write, identity included.
      const checked = checkEpisode(episode);
      if (isEmpty(checked)) {
        throw new EpisodeError("An evening records what they asked for, or a film of it.");
      }
      return driver.transaction(async (tx) => {
        const [row] = await tx.query<{ id: string; recorded_at: Date | string }>(
          `INSERT INTO tonight_episodes (user_id, request, request_source, offered_source)
                VALUES ($1, $2, $3, $4)
             RETURNING id, recorded_at`,
          [owner, checked.request, checked.requestSource, checked.offeredSource],
        );
        if (!row) throw new EpisodeError("The episode was not written down.");
        await insertOffers(tx, owner, row.id, checked.offers);
        return { ...checked, id: row.id, recordedAt: moment(row.recorded_at) };
      });
    },

    async addRound(id, round) {
      const done = await rewrite(id, (episode) => addRound(episode, round));
      // A round is additive and never empties an evening; anything else is a bug.
      if ("forgotten" in done) throw new EpisodeError("A round cannot remove an evening.");
      return done;
    },

    async episode(id: string): Promise<Recorded<Episode>> {
      return driver.transaction(async (tx) => {
        const [row] = await tx.query<EpisodeRow>(
          `SELECT id, request, request_source, offered_source, recorded_at
             FROM tonight_episodes
            WHERE user_id = $1 AND id = $2`,
          [owner, id],
        );
        if (!row) throw episodeNotFound(id);
        return assemble(row, await offersOf(tx, owner, [row.id]));
      });
    },

    async episodes(): Promise<Recorded<Episode>[]> {
      return driver.transaction(async (tx) => {
        // One snapshot for both statements, so an episode written between the two
        // reads cannot come back with no offers. Read-only, so it cannot abort.
        await tx.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        const rows = await tx.query<EpisodeRow>(
          `SELECT id, request, request_source, offered_source, recorded_at
             FROM tonight_episodes
            WHERE user_id = $1
            ORDER BY recorded_at, id`,
          [owner],
        );
        const offers = await offersOf(
          tx,
          owner,
          rows.map((row) => row.id),
        );
        return rows.map((row) => assemble(row, offers));
      });
    },

    async correct(id, correction) {
      return rewrite(id, (episode) => correctEpisode(episode, correction));
    },

    async forget(id: string): Promise<Recorded<Episode>> {
      return driver.transaction(async (tx) => {
        const going = await held(tx, owner, id);
        // The offers go with it by cascade. Nothing is flagged and nothing is
        // kept: the contract is forgetting, and a filtered row is not forgotten.
        const [removed] = await tx.query<{ id: string }>(
          `DELETE FROM tonight_episodes WHERE user_id = $1 AND id = $2 RETURNING id`,
          [owner, going.id],
        );
        if (!removed) throw episodeNotFound(id);
        return going;
      });
    },
  };
}

/**
 * One evening of this user's, its row locked for the rest of the transaction.
 *
 * Locked before it is read, because every caller writes back what it read: two
 * writes arriving together would otherwise each apply to the state the other
 * found, and two rounds could both add the same film.
 */
async function held(tx: Transaction, owner: string, id: string): Promise<Recorded<Episode>> {
  const [row] = await tx.query<EpisodeRow>(
    `SELECT id, request, request_source, offered_source, recorded_at
       FROM tonight_episodes
      WHERE user_id = $1 AND id = $2
        FOR UPDATE`,
    [owner, id],
  );
  if (!row) throw episodeNotFound(id);
  return assemble(row, await offersOf(tx, owner, [row.id]));
}

/** The offers, in the evening's order, with every fact as its column says. */
async function insertOffers(
  tx: Transaction,
  owner: string,
  episode: string,
  offers: readonly Offer[],
): Promise<void> {
  for (const [position, offer] of offers.entries()) {
    await tx.query(
      `INSERT INTO tonight_episode_offers
              (user_id, episode, position, title, year, offered, lead,
               chosen, started, finished, passed, pass_reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        owner,
        episode,
        position,
        offer.title,
        offer.year,
        offer.offered,
        offer.lead,
        flag(offer.chosen),
        flag(offer.started),
        flag(offer.finished),
        flag(offer.passed),
        offer.passReason ?? null,
      ],
    );
  }
}

type EpisodeRow = {
  id: string;
  request: string | null;
  request_source: string;
  offered_source: string;
  recorded_at: Date | string;
};

type OfferRow = {
  episode: string;
  position: number;
  title: string;
  year: number;
  offered: boolean;
  lead: boolean;
  chosen: boolean | null;
  started: boolean | null;
  finished: boolean | null;
  passed: boolean | null;
  pass_reason: string | null;
};

async function offersOf(
  tx: Pick<SqlDriver, "query">,
  owner: string,
  episodes: readonly string[],
): Promise<OfferRow[]> {
  if (episodes.length === 0) return [];
  return tx.query<OfferRow>(
    `SELECT episode, position, title, year, offered, lead,
            chosen, started, finished, passed, pass_reason
       FROM tonight_episode_offers
      WHERE user_id = $1 AND episode = ANY($2)
      ORDER BY episode, position`,
    [owner, episodes],
  );
}

/**
 * One evening rebuilt from its rows.
 *
 * Every offer fact is reconstructed as `stated`: the user is the only way one is
 * ever established, so there is no observed fact for a column to have lost.
 */
function assemble(row: EpisodeRow, offers: readonly OfferRow[]): Recorded<Episode> {
  const mine = offers.filter((offer) => offer.episode === row.id);
  return {
    id: row.id,
    recordedAt: moment(row.recorded_at),
    request: row.request,
    requestSource: sourceOf(row.request_source),
    offers: mine.map(offerOf),
    offeredSource: sourceOf(row.offered_source),
  };
}

function offerOf(row: OfferRow): Offer {
  return {
    title: row.title,
    year: row.year,
    offered: row.offered,
    lead: row.lead,
    chosen: established(row.chosen),
    started: established(row.started),
    finished: established(row.finished),
    passed: established(row.passed),
    ...(row.pass_reason === null ? {} : { passReason: row.pass_reason }),
  };
}

/**
 * A column back into a provenance, refusing anything else. The CHECK holds it
 * to two values already; this fails loudly on a row written around it.
 */
function sourceOf(value: string): Source {
  if (value !== "observed" && value !== "stated") {
    throw new EpisodeError(`No fact is known by being ${value}.`);
  }
  return value;
}

/** A column back into a fact or a silence. `null` is unknown; `false` is a stated no. */
function established(value: boolean | null): Said {
  return value === null ? UNKNOWN : stated(value);
}

/** A fact back into a column, keeping the silence a silence. */
function flag(value: Said): boolean | null {
  return value.known ? value.value : null;
}

const moment = (value: Date | string): string =>
  (value instanceof Date ? value : new Date(value)).toISOString();

function episodeNotFound(id: string): EpisodeError {
  return new EpisodeError(`No episode ${id}.`);
}
