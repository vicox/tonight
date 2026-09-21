import { database } from "../db.ts";
import type { SqlDriver } from "../db/driver.ts";
import { prepareSchema } from "../db/migrate.ts";
import type { AuthenticatedUser } from "../identity.ts";
import type { Act, Film, Identified, Standing } from "./model.ts";

/**
 * What Slice 2 of M2 needs from persistence, and nothing beyond it.
 *
 * Five operations. Something the user said goes on the end, one film's history
 * comes back for the model to resolve, what currently stands comes back for
 * recommendation work to read, the whole act set comes back for anything that
 * has to account for the history rather than act on it, and one act can be
 * forgotten outright.
 *
 * Nothing already said is ever **edited**. Changing their mind is a later
 * verdict, taking it back is a withdrawal, and both are acts in their own right
 * — so there is no `update` here and nothing for one to be. `forget` is not an
 * exception to that: it removes an act whole, on the user's say-so, and never
 * rewrites one into something they did not say.
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
  say(act: Act): Promise<Identified<Act>>;

  /**
   * Everything this user has said about one film, for the model to resolve.
   *
   * Returned in the order the database found convenient plus a stable tiebreak;
   * the model sorts by the instant the user spoke, so this order is a
   * convenience and never the answer. Empty for a film they have never
   * mentioned, which is silence rather than a gap.
   */
  history(film: Film): Promise<Identified<Act>[]>;

  /**
   * Every act this user has performed, about every film.
   *
   * The complete root set: verdicts that stand, verdicts that were superseded,
   * and withdrawals. Nothing is resolved and nothing is filtered but ownership.
   *
   * ## Why `standing` and `history` cannot serve between them
   *
   * They can, until somebody takes back everything they ever said about a film.
   * `standing` answers with what currently holds, so that film is simply absent
   * from it — and a caller that never learns the film's name cannot ask
   * `history` for it either. The film disappears from both, which is correct for
   * recommendation work and wrong for anything that has to give an honest
   * account of what was said. Completeness is this read's whole purpose.
   *
   * Grouping and ordering belong to the caller and the model. The rows arrive in
   * a stable, convenient order and that order is never the answer, exactly as
   * `history` documents.
   */
  acts(): Promise<Identified<Act>[]>;

  /**
   * Removes exactly one act, because the user asked for that one to be gone.
   *
   * The single place this store deletes anything, and it deletes a whole act
   * rather than editing one: what they said either stands in the history or is
   * not there. Nothing is written in its place — no tombstone, no "forgotten"
   * flag — because a record that something was removed is a record of what was
   * removed, which is the thing they asked to be rid of.
   *
   * Everything downstream is recomputed from what remains. Forgetting a
   * withdrawal lets the verdict it silenced stand again; forgetting the last
   * act about a film leaves that film as though nothing was ever said, and
   * whatever the Movie state says applies once more.
   *
   * A reference that names nothing, or names another user's act, is not an
   * error and is not distinguishable from one that does: both leave the store
   * as it was and answer the same way. Anything else would make this a way to
   * ask whether somebody else's act exists.
   */
  forget(ref: string): Promise<void>;

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
