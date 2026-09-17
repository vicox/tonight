import type { SqlDriver } from "../../db/driver.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import {
  EpisodeError,
  stateOutcome,
  stated,
  UNKNOWN,
  type Episode,
  type Established,
  type Offer,
  type OutcomeStatement,
  type Recorded,
} from "../model.ts";
import type { EpisodeStore } from "../store.ts";
import { EPISODES_SCHEMA } from "./schema.ts";

export { EPISODES_SCHEMA };

/**
 * The episode store against Postgres.
 *
 * Bound to one user before it is returned, in the same way and for the same
 * reason as the taste store: there is no method here that takes a user, and no
 * statement that reads a row without `user_id = $1`, so reaching somebody else's
 * evenings is not something a caller can express.
 *
 * Three operations, which is all Slice 2 of M1 needs — write one down, read one
 * back, list them. There is no update and no delete: correcting and forgetting
 * are Slice 3, and adding them early would mean shipping a way to change history
 * before the milestone that says how changing it behaves.
 *
 * ## What this refuses to do on a caller's behalf
 *
 * `record` inserts. It never updates, and there is no upsert: an episode that
 * already exists is an error rather than a silent rewrite of what was recorded
 * the first time. History accumulates; it does not get overwritten by a caller
 * who happened to pass an id.
 */
export function sqlEpisodeStore(driver: SqlDriver, user: AuthenticatedUser): EpisodeStore {
  const owner = user.id;

  return {
    async record(episode: Episode): Promise<Recorded<Episode>> {
      return driver.transaction(async (tx) => {
        const [row] = await tx.query<{ id: string; recorded_at: Date | string }>(
          `INSERT INTO tonight_episodes (user_id, request, watched, finished)
                VALUES ($1, $2, $3, $4)
             RETURNING id, recorded_at`,
          [owner, episode.request, flag(episode.watched), flag(episode.finished)],
        );
        if (!row) throw new EpisodeError("The episode was not written down.");

        // The offers go in with their position, so the order Tonight put them in
        // survives. `chosen` is carried on the row it is about, which is why no
        // statement here has to check that the chosen film was one of them.
        const chosen = episode.chosen.known ? episode.chosen.value : null;
        for (const [position, offer] of episode.offered.entries()) {
          await tx.query(
            `INSERT INTO tonight_episode_offers
                    (user_id, episode, position, title, year, lead, chosen)
                  VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              owner,
              row.id,
              position,
              offer.title,
              offer.year,
              offer.lead,
              chosen !== null && chosen.title === offer.title && chosen.year === offer.year,
            ],
          );
        }
        return { ...episode, id: row.id, recordedAt: moment(row.recorded_at) };
      });
    },

    async episode(id: string): Promise<Recorded<Episode>> {
      return driver.transaction(async (tx) => {
        const [row] = await tx.query<EpisodeRow>(
          `SELECT id, request, watched, finished, recorded_at
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
        // reads cannot come back with no offers — a state the store is never in,
        // reported as though it were. The taste store fixes its snapshot for the
        // same reason; this transaction only reads, so it cannot be aborted.
        await tx.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        const rows = await tx.query<EpisodeRow>(
          `SELECT id, request, watched, finished, recorded_at
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

    async correct(id: string, statement: OutcomeStatement): Promise<Recorded<Episode>> {
      return driver.transaction(async (tx) => {
        // Locked before it is read, because this is a read-then-write and two
        // corrections arriving together would otherwise each apply to the state
        // the other found. The taste store locks the same way for the same
        // reason; the row is this user's or there is no row.
        const [row] = await tx.query<EpisodeRow>(
          `SELECT id, request, watched, finished, recorded_at
             FROM tonight_episodes
            WHERE user_id = $1 AND id = $2
              FOR UPDATE`,
          [owner, id],
        );
        if (!row) throw episodeNotFound(id);

        // The correction is applied by the model, against the offers this
        // episode actually holds. That is what keeps a corrected `chosen` inside
        // the films Tonight put forward, and it is one code path rather than a
        // second copy of the rule living in SQL.
        const current = assemble(row, await offersOf(tx, owner, [row.id]));
        const corrected = stateOutcome(current, statement);

        await tx.query(
          `UPDATE tonight_episodes SET watched = $3, finished = $4
            WHERE user_id = $1 AND id = $2`,
          [owner, row.id, flag(corrected.watched), flag(corrected.finished)],
        );

        // Chosen lives on the offer rows, so correcting it is clearing the mark
        // and setting it again. Both statements are scoped to this episode and
        // this user, and the clear runs first so the partial unique index is
        // never asked to hold two.
        if ("chosen" in statement) {
          await tx.query(
            `UPDATE tonight_episode_offers SET chosen = false
              WHERE user_id = $1 AND episode = $2 AND chosen`,
            [owner, row.id],
          );
          if (corrected.chosen.known) {
            const { title, year } = corrected.chosen.value;
            await tx.query(
              `UPDATE tonight_episode_offers SET chosen = true
                WHERE user_id = $1 AND episode = $2 AND title = $3 AND year = $4`,
              [owner, row.id, title, year],
            );
          }
        }

        return { ...corrected, id: row.id, recordedAt: moment(row.recorded_at) };
      });
    },

    async forget(id: string): Promise<Recorded<Episode>> {
      return driver.transaction(async (tx) => {
        const [row] = await tx.query<EpisodeRow>(
          `SELECT id, request, watched, finished, recorded_at
             FROM tonight_episodes
            WHERE user_id = $1 AND id = $2
              FOR UPDATE`,
          [owner, id],
        );
        if (!row) throw episodeNotFound(id);

        // Read before the rows go, so the answer describes the evening that
        // existed a moment ago rather than an empty shell of it.
        const going = assemble(row, await offersOf(tx, owner, [row.id]));

        // The offers go with it by cascade — an offer belonging to no episode is
        // nothing. Nothing is flagged and nothing is kept: the contract is
        // forgetting, and a filtered row is not forgotten.
        const [removed] = await tx.query<{ id: string }>(
          `DELETE FROM tonight_episodes WHERE user_id = $1 AND id = $2 RETURNING id`,
          [owner, row.id],
        );
        if (!removed) throw episodeNotFound(id);

        return going;
      });
    },
  };
}

type EpisodeRow = {
  id: string;
  request: string;
  watched: boolean | null;
  finished: boolean | null;
  recorded_at: Date | string;
};

type OfferRow = {
  episode: string;
  position: number;
  title: string;
  year: number;
  lead: boolean;
  chosen: boolean;
};

async function offersOf(
  tx: Pick<SqlDriver, "query">,
  owner: string,
  episodes: readonly string[],
): Promise<OfferRow[]> {
  if (episodes.length === 0) return [];
  return tx.query<OfferRow>(
    `SELECT episode, position, title, year, lead, chosen
       FROM tonight_episode_offers
      WHERE user_id = $1 AND episode = ANY($2)
      ORDER BY episode, position`,
    [owner, episodes],
  );
}

/**
 * Rebuild one episode from its rows.
 *
 * The outcomes are reconstructed as `stated`, and that is a fact about the model
 * rather than an assumption made here: `stateOutcome` is the only way an outcome
 * is ever established and it only produces `stated`, so there is no observed
 * outcome for a column to have lost. A contract in `model.test.ts` pins that, so
 * if an outcome ever becomes observable the test fails and this has to change
 * rather than quietly mislabelling it.
 */
function assemble(row: EpisodeRow, offers: readonly OfferRow[]): Recorded<Episode> {
  const mine = offers.filter((offer) => offer.episode === row.id);
  const chosen = mine.find((offer) => offer.chosen);
  return {
    id: row.id,
    recordedAt: moment(row.recorded_at),
    request: row.request,
    offered: mine.map((offer) => ({ title: offer.title, year: offer.year, lead: offer.lead })),
    chosen: chosen ? stated(offerOf(chosen)) : UNKNOWN,
    watched: established(row.watched),
    finished: established(row.finished),
  };
}

const offerOf = (row: OfferRow): Offer => ({ title: row.title, year: row.year, lead: row.lead });

/**
 * A column back into a fact or a silence.
 *
 * `null` is unknown and `false` is a stated no, and the two must not meet. The
 * shape of this function is the guard: there is no `??` and no default, so there
 * is nowhere for a missing value to acquire one.
 */
function established(value: boolean | null): Established<boolean> {
  return value === null ? UNKNOWN : stated(value);
}

/** A fact back into a column, keeping the silence a silence. */
function flag(value: Established<boolean>): boolean | null {
  return value.known ? value.value : null;
}

const moment = (value: Date | string): string =>
  (value instanceof Date ? value : new Date(value)).toISOString();

function episodeNotFound(id: string): EpisodeError {
  return new EpisodeError(`No episode ${id}.`);
}
