import {
  Bookmark,
  Circle,
  Eye,
  EyeOff,
  Heart,
  MessageCircleOff,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import type { Viewing } from "@/lib/taste/model";
import type { Judgement } from "@/lib/verdicts/model";

/**
 * One thing the user has said about a film, shown as a mark.
 *
 * Two of these sit on a row and they say different kinds of thing. The first is
 * a **fact** — where it stands on their list. The second is an **opinion** —
 * what they made of it, which is a verdict. They are drawn alike because they
 * are both "what you said", and they are separate marks because they are
 * separate answers: a film can be seen and loved at once.
 *
 * ## Read, not pressed
 *
 * The website is a view of the taste model. Where a film stands and what the
 * user thought of it are said to an assistant, which writes them through the
 * MCP tools; this draws whatever the store holds, and nothing here can change
 * it. So a mark is an image with a name rather than a control: no button, no
 * menu, no request, and no state of its own — it renders the value it was given.
 *
 * Which also means it has no client behaviour, and no `"use client"`: a row is
 * rendered by the server page and by the dialogs alike, and this renders on
 * either side.
 *
 * ## One component, two marks
 *
 * What each mark *means* lives in `VIEWING` and `JUDGEMENT` at the bottom of
 * this file, where a reader can see both vocabularies side by side. The drawing
 * is written once and given them.
 *
 * ## What "nothing said" is on each
 *
 * On the viewing mark there is none: a film on the list always stands
 * somewhere. On the judgement mark it has its own icon, because silence is a
 * real state there — nothing said, or something taken back — and not a neutral
 * opinion.
 */

/** One answer a mark can show, and how it is drawn. */
type Choice<T> = { value: T; label: string; icon: typeof Eye; filled?: boolean };

/** What a mark is: its answers and its words. */
type Mark<T> = {
  /** The answers the mark can show. */
  choices: readonly Choice<T>[];
  /** How a value that is none of `choices` is drawn. */
  unset: { label: string; icon: typeof Eye };
  /** What this mark is asking, for its accessible name. */
  asks: string;
};

/**
 * Where it stands on their list.
 *
 * Three answers, in the direction a film moves — on the list, then seen — and
 * then the one that takes it off the table. A film always has one, so `unset`
 * is never drawn here; it is kept only because every mark has one.
 */
export const VIEWING: Mark<Viewing> = {
  choices: [
    { value: "want-to-see", label: "Want to see", icon: Bookmark },
    { value: "seen", label: "Seen", icon: Eye },
    { value: "dont-want-to-see", label: "Don't want to see", icon: EyeOff },
  ],
  unset: { label: "Not said", icon: Circle },
  asks: "Whether you have seen",
};

/**
 * What they made of it.
 *
 * The three judgements in the order the summary reads them — liked, loved, then
 * the one nobody reaches for — and then silence, which is a real answer here and
 * is why `null` appears in `choices` on this mark and not on the other.
 */
export const JUDGEMENT: Mark<Judgement | null> = {
  choices: [
    { value: "liked", label: "Liked", icon: ThumbsUp, filled: true },
    { value: "loved", label: "Loved", icon: Heart, filled: true },
    { value: "disliked", label: "Disliked", icon: ThumbsDown },
    { value: null, label: "Nothing said", icon: MessageCircleOff },
  ],
  unset: { label: "Nothing said", icon: Circle },
  asks: "What you said about",
};

export function MovieMark<T>({
  mark,
  value,
  title,
  year,
}: {
  mark: Mark<T>;
  value: T | null;
  title: string;
  year: number;
}) {
  const chosen = mark.choices.find((choice) => choice.value === value);
  const current = chosen ?? mark.unset;
  const said = value !== null;

  return (
    <span
      role="img"
      aria-label={`${mark.asks} ${title} (${year}): ${current.label}`}
      // The answer in words for a pointer, which has no other way to read an
      // icon now that there is no menu to open.
      title={current.label}
      className={[
        "flex size-7 shrink-0 items-center justify-center",
        // Lit when they have said something, muted while they have not. A
        // mark nobody can see is a missing one, so muted is still present.
        said ? "text-ink" : "text-ink-faint/50",
      ].join(" ")}
    >
      <current.icon
        aria-hidden="true"
        size={15}
        strokeWidth={1.5}
        fill={chosen?.filled === true ? "currentColor" : "none"}
      />
    </span>
  );
}
