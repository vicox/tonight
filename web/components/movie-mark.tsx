import { Bookmark, Eye, EyeOff, Heart, MessageCircleOff, ThumbsDown, ThumbsUp } from "lucide-react";

import type { Viewing } from "@/lib/taste/model";
import type { Judgement } from "@/lib/verdicts/model";

/**
 * How each thing the user has said about a film is drawn: its icon, its word,
 * and whether the icon is filled.
 *
 * Two vocabularies, and they say different kinds of thing. The first is a
 * **fact** — where the film stands on their list. The second is an **opinion** —
 * what they made of it, which is a verdict. They are kept side by side because
 * they are both "what you said", and kept apart because they are separate
 * answers: a film can be seen and loved at once.
 *
 * Drawn in two places, and from here in both: a card's status
 * (`movie-status.tsx`) and a film's five choices (`movie-choices.tsx`). So a
 * heart on a card is the heart a film's screen shows for the same verdict, and
 * the two cannot drift.
 *
 * ## Read, not pressed
 *
 * Nothing here is a control. Where a film stands and what the user thought of it
 * are said to an assistant, or chosen on the film's own screen; this is only how
 * an answer looks. No button, no request, no state, and no `"use client"`.
 */

/** One answer, and how it is drawn. */
type Choice<T> = { value: T; label: string; icon: typeof Eye; filled?: boolean };

/** One vocabulary: the answers it has. */
type Mark<T> = {
  choices: readonly Choice<T>[];
};

/**
 * Where it stands on their list.
 *
 * Three answers, in the direction a film moves — on the list, then seen — and
 * then the one that takes it off the table. A film always has one.
 */
export const VIEWING: Mark<Viewing> = {
  choices: [
    { value: "want-to-see", label: "Want to see", icon: Bookmark },
    { value: "seen", label: "Seen", icon: Eye },
    { value: "dont-want-to-see", label: "Don't want to see", icon: EyeOff },
  ],
};

/**
 * What they made of it.
 *
 * The three judgements — liked, loved, then the one nobody reaches for — and
 * then silence, which is a real answer here and is why `null` appears in
 * `choices` on this vocabulary and not on the other: nothing said, or something
 * taken back, is not a neutral opinion.
 */
export const JUDGEMENT: Mark<Judgement | null> = {
  choices: [
    { value: "liked", label: "Liked", icon: ThumbsUp, filled: true },
    { value: "loved", label: "Loved", icon: Heart, filled: true },
    { value: "disliked", label: "Disliked", icon: ThumbsDown },
    { value: null, label: "Nothing said", icon: MessageCircleOff },
  ],
};
