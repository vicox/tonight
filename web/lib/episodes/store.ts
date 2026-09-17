import { database } from "../db.ts";
import type { SqlDriver } from "../db/driver.ts";
import { prepareSchema } from "../db/migrate.ts";
import type { AuthenticatedUser } from "../identity.ts";
import type { Episode, OutcomeStatement, Recorded } from "./model.ts";

/**
 * What Slice 2 of M1 needs from persistence, and nothing beyond it.
 *
 * Three operations. Write an evening down, read one back, list them. There is
 * deliberately no update and no delete here: correction and forgetting are
 * Slice 3 of the same milestone, and the plan is explicit that a memory type
 * ships with them — but shipping them in the slice that introduces the table
 * would mean writing their behaviour before the slice that defines it.
 *
 * There is also no query that derives anything. No "what do they usually ask
 * for", no counting, no grouping by film. Episodes are evidence a later
 * milestone may propose from; a store that answered questions about taste would
 * be the second, invisible model the taste schema warned about.
 */
export type EpisodeStore = {
  /**
   * Writes one evening down.
   *
   * Inserts. Never updates and never upserts: recording an episode that already
   * exists is an error, because the alternative is a caller silently rewriting
   * what was recorded the first time.
   */
  record(episode: Episode): Promise<Recorded<Episode>>;

  /** One episode of this user's, by id. Refused for anybody else's. */
  episode(id: string): Promise<Recorded<Episode>>;

  /** This user's episodes, oldest first. Empty for somebody who has none. */
  episodes(): Promise<Recorded<Episode>[]>;

  /**
   * Corrects what the user said happened.
   *
   * Takes the same statement shape as `stateOutcome`, and for the same reason:
   * each outcome is independent, `null` takes one back to unknown, and a field
   * left out is untouched. There is no general `update` here on purpose — a
   * method that took arbitrary fields could express corrections this milestone
   * has no meaning for, and would put the "chosen was offered" check somewhere a
   * caller could route around.
   *
   * What it cannot change is what was asked and what was offered. Those are what
   * Tonight observed, they were true when they happened, and an evening whose
   * offer could be rewritten afterwards would be a record of nothing.
   */
  correct(id: string, statement: OutcomeStatement): Promise<Recorded<Episode>>;

  /**
   * Forgets an episode: it and its offers, gone.
   *
   * A hard delete rather than a flag, because the promise made to the user is
   * forgetting and not hiding. A row that still exists but is filtered from one
   * read is a thing that can be forgotten to filter somewhere else, and the
   * difference is invisible until it matters.
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
 * the database on its first request is not broken for the rest of its life. The
 * taste store does the same for its own module; the two migrate independently,
 * which is the point of a migration being identified by module and version.
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
