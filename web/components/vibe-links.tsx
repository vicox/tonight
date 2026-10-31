import { Sparkles } from "lucide-react";
import Link from "next/link";

import { vibeHref } from "@/lib/web/screens";

/**
 * Vibes, by name, each a way to its own screen.
 *
 * A violet ✨ and then every name, each its own link — never the first and a
 * count: a film in two vibes is in both, and "Space Tension +2" is the one form
 * of that which cannot be read. The same component on a film's card and on its
 * screen, so a vibe looks and goes the same way wherever it is named.
 *
 * Nothing at all for no names. A film in no vibe has no line, no ✨ and no word
 * standing in for the absence.
 *
 * ## On a card
 *
 * A card is one link stretched over its whole surface. `raised` lifts **each
 * name** above it — never the line around them — so a name opens its vibe, and
 * a press on the ✨, a separator or a gap between names still falls through to
 * the film.
 *
 * A card also passes `cores`: the vibes its film is the core of, which it names
 * first (`coreFirst`). Those are in the violet, and every other name is muted —
 * the same size, the same line and the same separator, only quieter. Without
 * `cores`, as on a film's screen, every name is violet.
 */
export function VibeLinks({
  names,
  cores,
  label,
  labelVisible = false,
  raised = false,
}: {
  names: readonly string[];
  /** The names to draw in the violet, the rest muted. Every name, when not given. */
  cores?: readonly string[];
  /** What the names are, said before them: visually hidden unless `labelVisible`. */
  label: string;
  labelVisible?: boolean;
  raised?: boolean;
}) {
  if (!names.length) return null;

  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[13px] leading-relaxed">
      <Sparkles aria-hidden="true" size={13} strokeWidth={1.75} className="shrink-0 self-center text-vibe" />
      <span className={labelVisible ? "text-ink-soft" : "sr-only"}>{label}</span>
      {names.map((name, index) => (
        <span key={name} className="inline-flex min-w-0 items-baseline gap-x-1.5">
          {index > 0 && (
            <span aria-hidden="true" className="text-ink-faint">
              ·
            </span>
          )}
          <Link
            href={vibeHref(name)}
            prefetch={false}
            className={[
              "min-w-0 break-words underline decoration-transparent underline-offset-4",
              cores === undefined || cores.includes(name)
                ? "text-vibe hover:decoration-vibe"
                : "text-ink-soft hover:decoration-ink-soft",
              "transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam",
              raised ? "relative z-10" : "",
            ].join(" ")}
          >
            {name}
          </Link>
        </span>
      ))}
    </p>
  );
}
