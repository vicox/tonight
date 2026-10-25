import { JUDGEMENT, VIEWING } from "./movie-mark";
import type { Viewing } from "@/lib/taste/model";
import type { Judgement } from "@/lib/verdicts/model";
import { statusOf, type StatusKey } from "@/lib/web/stream";

/**
 * Where a film stands and what was said about it, as a card shows it: an icon
 * and a word, at a glance.
 *
 * Which of the two facts is shown is `statusOf`'s rule. How each is drawn is the
 * marks' own vocabulary — `VIEWING` and `JUDGEMENT` — so a heart on a card is
 * the heart a film's screen shows for the same verdict, and the two cannot drift.
 *
 * Read, never pressed: no button and no handler. A status changes when the
 * film's own screen or an assistant changes the film or the verdict, and the next
 * render shows it.
 *
 * Only two are coloured: loved in pink and liked in blue, the two that say a film
 * worked for them. The rest are quiet, and `disliked` is not red — a verdict is
 * not an error.
 */
export function MovieStatus({
  viewing,
  judgement,
  className = "",
}: {
  viewing: Viewing;
  judgement: Judgement | null;
  className?: string;
}) {
  return (
    <span className={`flex flex-wrap items-center justify-end gap-x-3 gap-y-1 ${className}`}>
      {statusOf(viewing, judgement).map((key) => {
        const choice = choiceFor(key);
        if (!choice) return null;
        const Icon = choice.icon;
        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1.5 text-[12px] leading-none ${TONE[key] ?? "text-ink-soft"}`}
          >
            <Icon
              aria-hidden="true"
              size={13}
              strokeWidth={1.75}
              fill={choice.filled === true ? "currentColor" : "none"}
            />
            {choice.label}
          </span>
        );
      })}
    </span>
  );
}

/** The two statuses with a colour of their own. Everything else is `ink-soft`. */
const TONE: Partial<Record<StatusKey, string>> = {
  loved: "text-loved",
  liked: "text-liked",
};

/** The mark's own drawing of one status: its icon, its fill and its word. */
function choiceFor(key: StatusKey) {
  return (
    VIEWING.choices.find((choice) => choice.value === key) ??
    JUDGEMENT.choices.find((choice) => choice.value === key)
  );
}
