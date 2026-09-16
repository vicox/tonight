/**
 * Definitions shared by the skill's own `test.sh` and the web instruction
 * contracts, so the two cannot drift apart while both claim to check the same
 * rule.
 *
 * The skill and its ChatGPT projection are written separately and asserted
 * separately — that is the point of `project:compact`. It also means a rule
 * expressed as two regexes in two languages will eventually be two rules: the
 * shared-retry prohibition below was written twice and immediately diverged,
 * with `whichever` covered on one side and in one word order only. Anything
 * stated here is stated once.
 */

/**
 * Words that make an instruction apply to **both** failure branches at once.
 *
 * R2 moved the retry out of a clause covering both branches and into each of
 * them. The factoring was semantically equivalent and behaviourally weaker —
 * it put the retry furthest from the branch that had to perform it, and one run
 * of the retained candidate dropped it — so a shared retry must not come back,
 * in either wording and in either word order.
 */
export const SHARED_QUALIFIERS = [
  "either way",
  "in both cases",
  "in either case",
  "both branches",
  "for both",
  "whichever",
];

const qualifiers = SHARED_QUALIFIERS.map((q) => q.replace(/ /g, "\\s+")).join("|");

/**
 * A retry offered as one obligation covering both branches, written either way
 * round: the qualifier before the retry ("either way, offer to retry") or after
 * it ("offer to retry, whichever branch failed").
 */
export const SHARED_RETRY = new RegExp(
  `(?:${qualifiers})[^.]{0,70}\\bretry\\b|\\bretry\\b[^.]{0,70}(?:${qualifiers})`,
  "i",
);

/** The offending text, or `null` when the retry is not stated as a shared one. */
export function sharedRetry(text) {
  const found = SHARED_RETRY.exec(text.replace(/\s+/g, " "));
  return found ? found[0] : null;
}
