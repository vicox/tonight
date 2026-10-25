import { database } from "../db.ts";
import type { SqlDriver } from "../db/driver.ts";
import { prepareSchema } from "../db/migrate.ts";
import type { AuthenticatedUser } from "../identity.ts";
import type { Correction, Episode, Recorded, Round } from "./model.ts";

/**
 * An evening that a correction emptied, and that is therefore gone (F6).
 *
 * Only an evening with no request can end up here: one the user started
 * themselves, whose last film they took back. It is deleted exactly as
 * `forget` deletes one.
 */
export type Forgotten = { forgotten: string };

/**
 * One user's evenings, and every operation on them.
 *
 * There is no query that derives anything — no "what do they usually pick", no
 * counting, no grouping by film. Evenings are history; a store that answered
 * questions about taste would be the second, invisible model the taste schema
 * warns about.
 *
 * Every write that touches an existing evening takes its row lock, assembles
 * it, hands it to the pure model and writes back the model's answer whole. The
 * model is the one place every rule — identity included — is enforced.
 */
export type EpisodeStore = {
  /**
   * Writes a new evening down. Inserts, never upserts: the evening is checked
   * whole by the model before anything is written.
   */
  record(episode: Episode): Promise<Recorded<Episode>>;

  /**
   * Adds a later round to an evening this user has: films Tonight offered, and
   * what was said in the same breath. Additive only — see `addRound`.
   */
  addRound(id: string, round: Round): Promise<Recorded<Episode>>;

  /** One episode of this user's, by id. Refused for anybody else's. */
  episode(id: string): Promise<Recorded<Episode>>;

  /** This user's episodes, oldest first. Empty for somebody who has none. */
  episodes(): Promise<Recorded<Episode>[]>;

  /**
   * Puts an evening right: its request, the films Tonight offered, and what the
   * user said about any film of it. Answers `{ forgotten }` when the correction
   * leaves an evening with no request and no film, which is then deleted (F6).
   */
  correct(id: string, correction: Correction): Promise<Recorded<Episode> | Forgotten>;

  /**
   * Forgets an episode: it and its offers, gone.
   *
   * A hard delete rather than a flag, because the promise made to the user is
   * forgetting and not hiding.
   */
  forget(id: string): Promise<Recorded<Episode>>;
};

/**
 * Opens the episode store for one authenticated user.
 *
 * Takes the `AuthenticatedUser` rather than an id, for the reason `lib/taste/
 * store.ts` gives: reaching this function at all means having been through an
 * authentication boundary, and a bare string could be anything a request body
 * contained.
 */
export async function episodeStore(user: AuthenticatedUser): Promise<EpisodeStore> {
  const driver = await prepared();
  const { sqlEpisodeStore } = await import("./store/sql.ts");
  return sqlEpisodeStore(driver, user);
}

/**
 * The connection, with this module's schema known to be current — once per
 * process, cached as a promise so concurrent first requests wait for one run.
 *
 * A failure is forgotten rather than cached, so an instance that could not reach
 * the database on its first request is not broken for the rest of its life.
 */
let preparing: Promise<SqlDriver> | undefined;

function prepared(): Promise<SqlDriver> {
  preparing ??= (async () => {
    const driver = await database();
    const { EPISODES_SCHEMA } = await import("./store/schema.ts");
    await prepareSchema(driver, EPISODES_SCHEMA);
    return driver;
  })().catch((error: unknown) => {
    preparing = undefined;
    throw error;
  });
  return preparing;
}
