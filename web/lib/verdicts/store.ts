import { database } from "../db.ts";
import type { SqlDriver } from "../db/driver.ts";
import { prepareSchema } from "../db/migrate.ts";
import type { AuthenticatedUser } from "../identity.ts";
import type { Act, Film, Standing } from "./model.ts";

/**
 * What Slice 2 of M2 needs from persistence, and nothing beyond it.
 *
 * Three operations, because a history is append-only. Something the user said
 * goes on the end, one film's history comes back for the model to resolve, and
 * what currently stands comes back for recommendation work to read. Nothing
 * already said is ever edited. Changing their mind is
 * a later verdict, taking it back is a withdrawal, and both are acts in their
 * own right — so there is no `update` here, and nothing for one to be.
 *
 * ## Why there are no identifiers in this surface
 *
 * A withdrawal names a film, a scope and a time. It does not name the act it
 * takes back, because the model works out what stands from the order rather
 * than from a pointer. Handing row identifiers to callers would invite exactly
 * the pointer the model does without, and a second way to answer *"what
 * stands"* that could disagree with the first.
 *
 * ## Why nothing here answers a question about taste
 *
 * No counting, no grouping, no "films they usually like", and no query that
 * resolves the current verdict in SQL. `lib/verdicts/model.ts` owns which claim
 * stands and which was displaced, including how scopes layer; a store that
 * answered the same question would be a second implementation of the rule, free
 * to drift from the one with the contracts on it. This reads acts. The model
 * decides what they mean.
 */
export type VerdictStore = {
  /**
   * Appends one thing the user said — a verdict, or taking one back.
   *
   * Inserts, always. There is no upsert and no id to collide on: saying the
   * same thing twice is two acts, which is what actually happened.
   */
  say(act: Act): Promise<Act>;

  /**
   * Everything this user has said about one film, for the model to resolve.
   *
   * Returned in the order the database found convenient plus a stable tiebreak;
   * the model sorts by the instant the user spoke, so this order is a
   * convenience and never the answer. Empty for a film they have never
   * mentioned, which is silence rather than a gap.
   */
  history(film: Film): Promise<Act[]>;

  /**
   * What currently stands about every film this user has spoken about.
   *
   * The read recommendation work uses, and the only one that does. It answers
   * with the projection the model builds — current claims, globally and per
   * evening — so a superseded verdict, a withdrawn one and an evening whose
   * refusal was taken back are absent because the model resolved them away, not
   * because a query remembered to exclude them.
   *
   * Empty for somebody who has said nothing, which is the ordinary first case.
   */
  standing(): Promise<Standing[]>;
};

/**
 * Opens the verdict store for one authenticated user.
 *
 * Takes the `AuthenticatedUser` rather than an id, for the reason `lib/taste/
 * store.ts` gives: reaching this function at all means having been through an
 * authentication boundary, and a bare string could be anything a request body
 * contained.
 */
export async function verdictStore(user: AuthenticatedUser): Promise<VerdictStore> {
  const driver = await prepared();
  const { sqlVerdictStore } = await import("./store/sql.ts");
  return sqlVerdictStore(driver, user);
}

/**
 * The connection, with this module's schema known to be current — once per
 * process, cached as a promise so concurrent first requests wait for one run.
 *
 * A failure is forgotten rather than cached, so an instance that could not reach
 * the database on its first request is not broken for the rest of its life. The
 * taste and episode stores do the same for their own modules; all three migrate
 * independently, which is the point of a migration being identified by module
 * and version.
 */
let preparing: Promise<SqlDriver> | undefined;

function prepared(): Promise<SqlDriver> {
  preparing ??= (async () => {
    const driver = await database();
    const { VERDICTS_SCHEMA } = await import("./store/schema.ts");
    await prepareSchema(driver, VERDICTS_SCHEMA);
    return driver;
  })().catch((error: unknown) => {
    preparing = undefined;
    throw error;
  });
  return preparing;
}
