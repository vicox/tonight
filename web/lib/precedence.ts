import type { MovieState } from "./taste/model.ts";
import type { Judgement, Reach } from "./verdicts/model.ts";

/**
 * When a saved film and something they said disagree.
 *
 * One rule, in one place, because two copies of it would be two answers. The
 * memory view uses it to say which of two held roots governs; the taste model
 * uses it to hand a recommendation the same disagreement without making it
 * re-derive one. Neither owns it, which is why it lives here rather than in
 * either of them.
 *
 * Pure, and it decides nothing new: `SKILL.md` already tells the model *"a
 * verdict outranks a disagreeing state"*, and this is the "disagreeing" half of
 * that sentence written as code once.
 *
 * The types are imported for their names only — `import type` is erased, so
 * this module still carries no runtime dependency on either domain.
 */

/** What a standing verdict asserts, reduced to what the comparison needs. */
export type Governing = { judgement: Judgement } | { rejected: Reach };

/**
 * Whether a Movie state says how they felt, rather than whether they watched.
 *
 * `seen` is explicitly non-evaluative and `not_seen`/`null` are the absence of
 * experience, so a verdict beside any of them adds an opinion rather than
 * contradicting one.
 */
export const evaluative = (state: MovieState | null): boolean =>
  state === "liked" || state === "loved" || state === "disliked";

/**
 * Whether what they said pulls against how the film is filed.
 *
 * A judgement disagrees by differing. A refusal is not a rating, so it can only
 * disagree with a liking — against `disliked` it says the same thing twice, and
 * calling that a contradiction would be inventing one.
 */
export function disagrees(state: MovieState | null, governing: Governing): boolean {
  if (!evaluative(state)) return false;
  if ("judgement" in governing) return governing.judgement !== state;
  return state === "liked" || state === "loved";
}
