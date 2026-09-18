import { database } from "../db.ts";
import type { SqlDriver } from "../db/driver.ts";
import { prepareSchema } from "../db/migrate.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { VerdictError, withdrawVerdict, type Film } from "./model.ts";

/**
 * That a film is still waiting on an answer — and nothing else.
 *
 * Slice 3 of M2. This is the one thing the milestone writes automatically, and
 * §4 of the plan says exactly what it is worth: *"No knowledge about the user.
 * The only automatic write is the inert record that a film is still unanswered,
 * which exists so the question can be asked at the right moment and carries no
 * claim about taste."*
 *
 * So a question is **not** a Verdict, not evidence, not taste, and not a weaker
 * version of any of them. It is a note that Tonight has something to ask.
 *
 * ## Why it lives apart from the verdict history
 *
 * A verdict is the user's. A question is Tonight's. Storing them together —
 * even in separate columns of one table — would mean a read of somebody's
 * claims returning a row nobody authored, and one query away from a question
 * being counted as a soft opinion. They get separate modules, separate tables
 * and separate stores, the way `episodes` is kept apart from `taste` and for the
 * same reason: the boundary is only real if the shapes cannot be confused.
 *
 * `lib/verdicts/model.ts` will refuse a question outright — it is not an act and
 * has no `said` — so it cannot enter `current` or `supersession` even by
 * accident, and this store holds nothing a verdict history would recognise.
 *
 * ## What it deliberately does not record
 *
 * No answer. No guess at one. No confidence, no score, no count of how often it
 * has gone unasked, and **no meaning attached to age**. The record says a
 * question is open and when it opened; it does not say that a question open for
 * a long time means anything, because silence meaning something is precisely
 * what the milestone forbids.
 *
 * ## Asking is not this module's business
 *
 * Nothing here sends, schedules, reminds or wakes up. §2 of the plan is a scope
 * boundary rather than a preference: *"An open question about a film is a thing
 * Tonight carries until the user next appears, not a reason to appear itself."*
 * This is the carrying. Whether to ask, and when, is decided by a caller that is
 * already inside a conversation the user started — and that caller belongs to a
 * later slice.
 */

/**
 * A film Tonight has something to ask about.
 *
 * Two fields, and there is deliberately nowhere to put a third. `since` exists
 * so the question can be read back in the order it arose and so a later,
 * approved rule can retire it — not so that its age can be read as an answer.
 */
export type Question = {
  film: Film;
  /** When the question became pending, as a canonical instant. */
  since: string;
};

/**
 * Opens a question about a film.
 *
 * Validated by the verdict model, which owns what a film and an instant are —
 * the alternative is a second definition here, free to drift from the one with
 * the contracts on it.
 */
export function askAbout(film: unknown, since: unknown): Question {
  const checked = withdrawVerdict(film, since);
  return { film: checked.film, since: checked.at };
}

/**
 * What Slice 3 needs from persistence, and nothing beyond it.
 *
 * Three operations: open one, read what is open, close one. There is no
 * `answer`, because answering is giving a Verdict and that goes through the
 * verdict store; closing a question neither creates one nor changes one.
 */
export type QuestionStore = {
  /**
   * Notes that a film is waiting on an answer.
   *
   * Idempotent, and that matters: a film already waiting stays as it was, with
   * the instant it first arose. Re-opening would reset the clock and make an old
   * question look new, which is a quiet way of losing the only fact recorded.
   */
  open(question: Question): Promise<Question>;

  /** Every question this user has open, oldest first. Empty is the normal case. */
  pending(): Promise<Question[]>;

  /**
   * Closes a question about a film.
   *
   * One operation for both reasons — the user answered, or the question stopped
   * being worth asking — because the record cannot tell them apart and must not
   * pretend to. Storing *why* a question closed would be the first step toward
   * an unanswered one meaning something.
   *
   * Closing a question that was never open is not an error. The state afterwards
   * is the state that was asked for.
   */
  close(film: Film): Promise<void>;
};

/**
 * Opens the question store for one authenticated user.
 *
 * Takes the `AuthenticatedUser` rather than an id, for the reason `lib/taste/
 * store.ts` gives: reaching this function at all means having been through an
 * authentication boundary, and a bare string could be anything a request body
 * contained.
 */
export async function questionStore(user: AuthenticatedUser): Promise<QuestionStore> {
  const driver = await prepared();
  const { sqlQuestionStore } = await import("./questions/sql.ts");
  return sqlQuestionStore(driver, user);
}

export { VerdictError };

let preparing: Promise<SqlDriver> | undefined;

function prepared(): Promise<SqlDriver> {
  preparing ??= (async () => {
    const driver = await database();
    const { QUESTIONS_SCHEMA } = await import("./questions/schema.ts");
    await prepareSchema(driver, QUESTIONS_SCHEMA);
    return driver;
  })().catch((error: unknown) => {
    preparing = undefined;
    throw error;
  });
  return preparing;
}
