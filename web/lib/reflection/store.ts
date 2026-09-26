import { prepareSchema } from "../db/migrate.ts";
import type { SqlDriver } from "../db/driver.ts";
import { database } from "../db.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { ReflectionError, type Identified, type Observation, type Proposal } from "./model.ts";

/**
 * What Tonight noticed, and what it has offered, for one user.
 *
 * The same shape as every other store here: opened for an authenticated user,
 * closed over them, with no method that takes a user. A cross-tenant read is
 * something you would have to add rather than something you must remember not
 * to do.
 */
export type ReflectionStore = {
  /** Tonight writes down its own reading. Never authoritative, never evidence. */
  observe(noticed: unknown): Promise<Identified<Observation>>;

  /** Everything Tonight has noticed, newest last. */
  observations(): Promise<Identified<Observation>[]>;

  /**
   * Tonight offers a change and does not make it.
   *
   * `from` names the Observation this came out of, where there was one. A
   * proposal may stand on nothing — an offer made in the moment is still an
   * offer — and one that names an observation that is not this user's is
   * refused by the composite foreign key rather than by a lookup.
   */
  propose(from: string | null, noticed: unknown, target: unknown): Promise<Identified<Proposal>>;

  /** Everything offered, decided or not, newest last. */
  proposals(): Promise<Identified<Proposal>[]>;

  /**
   * The user says yes, and the change becomes real in the same transaction.
   *
   * Either the proposal is accepted and its target written, or neither happened.
   * The two halves cannot come apart: a proposal marked accepted whose genre
   * never appeared would be a lie about what the user authorised, and a genre
   * that appeared under a proposal still pending would be an unauthorised write
   * wearing a pending offer as cover.
   *
   * Refused unless the proposal is pending. Accepting twice would write twice.
   */
  accept(ref: string): Promise<Identified<Proposal>>;

  /**
   * The user says no, and it stays no.
   *
   * The target is not written and the row is kept: §6 requires a rejection to
   * be durable — *a rejected proposal that returns next month is a worse
   * failure than never proposing* — and a deleted row could not say it was ever
   * refused.
   */
  reject(ref: string): Promise<Identified<Proposal>>;
};

/**
 * Opens the reflection store for one authenticated user.
 *
 * Takes the `AuthenticatedUser` rather than an id, for the reason
 * `lib/taste/store.ts` gives: reaching this function at all means having been
 * through an authentication boundary.
 */
export async function reflectionStore(user: AuthenticatedUser): Promise<ReflectionStore> {
  const driver = await prepared();
  const { sqlReflectionStore } = await import("./store/sql.ts");
  return sqlReflectionStore(driver, user);
}

export { ReflectionError };

let preparing: Promise<SqlDriver> | undefined;

function prepared(): Promise<SqlDriver> {
  preparing ??= (async () => {
    const driver = await database();
    const { REFLECTION_SCHEMA } = await import("./store/schema.ts");
    await prepareSchema(driver, REFLECTION_SCHEMA);
    return driver;
  })().catch((error: unknown) => {
    preparing = undefined;
    throw error;
  });
  return preparing;
}
