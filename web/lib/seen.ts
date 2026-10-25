import type { Viewing } from "./taste/model.ts";
import type { Judgement } from "./verdicts/model.ts";

/**
 * Whether the user has watched a film, from both places that can say so.
 *
 * Two roots know something about it and neither is the whole answer. The Movie
 * carries where the film stands on their list — `seen`, `want-to-see` or
 * `dont-want-to-see`. A standing Verdict carries what they thought, and an
 * opinion is something somebody can only have after watching, so a film they
 * liked is a film they have seen whether or not anybody ever filed it that way.
 *
 * This is the one place that joins them. It replaces the precedence rule that
 * used to live here, and the difference is worth naming: that rule existed
 * because two roots held *opinions* and something had to decide which governed.
 * Nothing holds two opinions any more. What is left is a derivation — a fact and
 * an implication of a fact — and derivations do not need a governor.
 *
 * Pure, and it decides nothing new. Both inputs are already resolved by their
 * own domains before they arrive: `standing` is what `current` says stands
 * *now*, so a judgement the user withdrew or replaced cannot reach here to imply
 * anything. That is structural rather than a check below.
 *
 * The types are imported for their names only — `import type` is erased — so
 * this module carries no runtime dependency on either domain, which is what lets
 * both use it.
 */

/** What currently stands about a film, reduced to what this question needs. */
export type Standing = { judgement: Judgement };

/**
 * Whether the user has watched the film, as far as anything here can tell.
 *
 * `viewing` is where the film stands on their list and `standing` is what
 * currently stands about liking, which may be absent. True when the list says
 * `seen` outright, or when an opinion implies it. `viewing` is `null` for a film
 * that is not on their list at all, where only an opinion can say they watched it.
 *
 * `want-to-see` or `dont-want-to-see` plus a standing judgement is a
 * contradiction the user can create, and this answers `true` — the opinion is
 * the stronger evidence about whether they watched it. It is deliberately the
 * whole of the handling: both raw facts stay
 * visible where they are stored, and a rare disagreement between two honest
 * records is not worth a machinery of its own.
 */
export function effectivelySeen(viewing: Viewing | null, standing: Standing | null): boolean {
  if (viewing === "seen") return true;
  return standing !== null && "judgement" in standing;
}
