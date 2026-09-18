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
 * No answer. No guess at one. No confidence and no score.
 *
 * It does record how long a question has been open and how many chances to ask
 * have gone by, because the approved retirement rule needs both — and that is
 * the only thing either is for. Neither is evidence: a question that ran out of
 * time or out of chances says nothing about the film and nothing about the user.
 * **Silence never hardens into an answer**, which is the whole point of retiring
 * a question rather than concluding from it.
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
 * Three fields, and there is deliberately nowhere to put a fourth. `since` and
 * `opportunities` exist so the approved retirement rule below can be applied —
 * not so that either can be read as an answer. A question open for a long time,
 * or one that went unasked three times, means only that it is no longer worth
 * carrying.
 */
export type Question = {
  film: Film;
  /** When the question first became pending, as a canonical instant. */
  since: string;
  /**
   * How many eligible opportunities have passed without an answer.
   *
   * Counted only when a caller says one occurred — see `opportunity`. It is a
   * count of chances, never of anything about the user.
   */
  opportunities: number;
};

/**
 * When a question stops being worth carrying.
 *
 * The product decision, recorded in `docs/work/phase-2-implementation.md` §M2:
 * a pending question retires at the **third** eligible opportunity that passes
 * without an answer, or **30 days** after it first arose, whichever comes first.
 *
 * Both limits exist because either alone fails somebody. Counting only
 * opportunities leaves a question waiting years for a user who does not come
 * back; counting only days retires a question for a user who returns on day 31
 * to exactly the conversation it belonged to. Whichever is reached first is the
 * one that ends it.
 */
export const MAX_OPPORTUNITIES = 3;
export const MAX_PENDING_DAYS = 30;

const DAY = 86_400_000;

/**
 * Whether a question has retired, as of a given instant.
 *
 * Derived rather than stored, for the reason the verdict model derives standing:
 * a flag beside the fields it is computed from is a second answer that can
 * disagree with the first. The caller supplies the instant, so this is a
 * function of its arguments and of nothing else — there is no clock in here to
 * make a test depend on the day it runs.
 *
 * **Retiring is not answering.** It removes a question; it produces no verdict,
 * no rejection, no withdrawal and no observation. Silence stays silence.
 */
export function retired(question: Question, now: unknown): boolean {
  const instant = withdrawVerdict(question.film, now).at;
  if (question.opportunities >= MAX_OPPORTUNITIES) return true;
  return Date.parse(instant) - Date.parse(question.since) >= MAX_PENDING_DAYS * DAY;
}

/**
 * Opens a question about a film.
 *
 * Validated by the verdict model, which owns what a film and an instant are —
 * the alternative is a second definition here, free to drift from the one with
 * the contracts on it.
 */
export function askAbout(film: unknown, since: unknown, opportunities: unknown = 0): Question {
  const checked = withdrawVerdict(film, since);
  if (typeof opportunities !== "number" || !Number.isInteger(opportunities) || opportunities < 0) {
    throw new VerdictError("Opportunities are counted in whole numbers, from none.");
  }
  return { film: checked.film, since: checked.at, opportunities };
}

/**
 * What Slice 3 needs from persistence, and nothing beyond it.
 *
 * Four operations: open one, read what is still worth carrying, record that a
 * chance to ask went by, close one. There is no `answer`, because answering is
 * giving a Verdict and that goes through the verdict store; neither closing a
 * question nor retiring one creates or changes a claim.
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

  /**
   * Every question of this user's that is still worth carrying, oldest first.
   *
   * Takes the instant to judge against, and **writes nothing**. A question that
   * has retired is absent from the answer; its row may still be there, and that
   * is deliberate — reading must not be a way for the clock to change the
   * database behind somebody's back. Rows are cleared by the operations that
   * were called on purpose.
   */
  pending(now: unknown): Promise<Question[]>;

  /**
   * Records that an eligible opportunity to ask passed without an answer.
   *
   * The caller states this, and only the caller can: an opportunity is one where
   * the user began the interaction, Tonight was already engaged, and this
   * question could legitimately have been put. Nothing here can observe any of
   * that, so nothing here counts one by itself — in particular `pending` does
   * not, because a read that aged what it read would make every glance cost
   * something.
   *
   * Returns the question as it now stands, or `null` if that was its last
   * chance. Retiring removes the question and nothing else: no verdict is
   * written, and the user is left exactly as unasked as they were.
   */
  opportunity(film: Film, now: unknown): Promise<Question | null>;

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
