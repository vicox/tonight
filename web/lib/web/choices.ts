import type { Viewing } from "../taste/model.ts";
import { isPositive, type Judgement } from "../verdicts/model.ts";

/**
 * "What do you think?" — the five choices on a film's screen, and what pressing one
 * does to the model that already exists.
 *
 * They are the website's one write, and they write nothing new: three of them are
 * the verdicts Tonight already keeps and two are the film's viewing.
 *
 *     Love it         a verdict: loved
 *     Like it         a verdict: liked
 *     Want to see     the film's viewing: want-to-see
 *     Not interested  the film's viewing: dont-want-to-see — "don't recommend it again"
 *     Dislike         a verdict: disliked
 *
 * ## The two kinds do not touch each other
 *
 * An opinion is a verdict and never writes the film's viewing; a viewing never
 * writes a verdict — the split M8 settled. So *Loved* and *Want to see* can both be
 * pressed at once (a film they loved but saved as wanted), and *Loved* and *Not
 * interested* too (loved once, not to be recommended again). Each button shows its
 * own fact, as it is stored.
 *
 * ## Pressing what is already pressed
 *
 * An opinion that stands is taken back: a withdrawal, which leaves them having
 * said nothing — the verdict model's own word for it. A viewing cannot be taken
 * back, because a saved film always stands somewhere, so pressing the viewing a
 * film already has writes nothing. A film that is `seen` shows neither viewing
 * button pressed, and is moved by pressing one.
 *
 * ## What is refused, and why
 *
 * - *Love it* or *Like it* for a film in none of their vibes: a liked or loved
 *   film belongs to at least one vibe (Vibe Evolution), and the store refuses it.
 * - *Want to see* or *Not interested* for a film a vibe is anchored on: a core is
 *   a film they have seen, and the store refuses to mark it anything else.
 *
 * Both are decided here first so the page can say which, and the store still
 * decides them for itself.
 */

/** The five, by the value a button sends. */
export const CHOICE_KEYS = ["love", "like", "want", "not-interested", "dislike"] as const;
export type ChoiceKey = (typeof CHOICE_KEYS)[number];

export type Choice =
  | { key: ChoiceKey; label: string; kind: "judgement"; judgement: Judgement }
  | { key: ChoiceKey; label: string; kind: "viewing"; viewing: Viewing };

/** In the order the screen shows them. */
export const CHOICES: readonly Choice[] = [
  { key: "love", label: "Love it", kind: "judgement", judgement: "loved" },
  { key: "like", label: "Like it", kind: "judgement", judgement: "liked" },
  { key: "want", label: "Want to see", kind: "viewing", viewing: "want-to-see" },
  { key: "not-interested", label: "Not interested", kind: "viewing", viewing: "dont-want-to-see" },
  { key: "dislike", label: "Dislike", kind: "judgement", judgement: "disliked" },
];

/** The choice a button sent, or nothing when it is not one of the five. */
export function choiceFor(value: unknown): Choice | null {
  return CHOICES.find((choice) => choice.key === value) ?? null;
}

/** Whether a choice is what the film stands at now: its verdict, or its viewing. */
export function isPressed(choice: Choice, viewing: Viewing, judgement: Judgement | null): boolean {
  return choice.kind === "judgement" ? judgement === choice.judgement : viewing === choice.viewing;
}

/** What a film is, as far as a choice is concerned. */
export type Film = {
  viewing: Viewing;
  /** The standing judgement, or `null` when nothing stands. */
  judgement: Judgement | null;
  /** Whether it is in at least one vibe. */
  filed: boolean;
  /** Whether a vibe is anchored on it. */
  core: boolean;
};

/** What a press comes to: a write, nothing, or a refusal the page can name. */
export type Outcome =
  | { write: "judgement"; judgement: Judgement }
  | { write: "withdrawal" }
  | { write: "viewing"; viewing: Viewing }
  | { write: "nothing" }
  | { refused: Refusal };

/** Why a press was not kept. */
export const REFUSALS = ["vibe-required", "core", "failed"] as const;
export type Refusal = (typeof REFUSALS)[number];

export function decide(choice: Choice, film: Film): Outcome {
  if (choice.kind === "judgement") {
    if (film.judgement === choice.judgement) return { write: "withdrawal" };
    if (isPositive(choice.judgement) && !film.filed) return { refused: "vibe-required" };
    return { write: "judgement", judgement: choice.judgement };
  }

  if (film.viewing === choice.viewing) return { write: "nothing" };
  if (film.core) return { refused: "core" };
  return { write: "viewing", viewing: choice.viewing };
}

/** A refusal as the page says it. Fixed sentences: nothing from a request is echoed. */
export function refusalSentence(refusal: Refusal): string {
  switch (refusal) {
    case "vibe-required":
      return "Love it and Like it are kept for a film in at least one of your vibes. Ask your assistant to put this one in a vibe first — nothing was saved.";
    case "core":
      return "A vibe is anchored on this film, so it stays seen. Ask your assistant to anchor the vibe on another film first — nothing was saved.";
    case "failed":
      return "That could not be saved just now. Reload to see where this film stands.";
  }
}

/** The refusal a URL names, or nothing when it names none of them. */
export function refusalFor(value: string | null): Refusal | null {
  return (REFUSALS as readonly string[]).includes(value ?? "") ? (value as Refusal) : null;
}
