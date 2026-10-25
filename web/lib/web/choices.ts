import { isSeen } from "../seen.ts";
import type { SeenViewing, Viewing } from "../taste/model.ts";
import type { FilmWrite, HeldFilm } from "../taste/store.ts";
import { isPositive, type Judgement } from "../verdicts/model.ts";

/**
 * A film's screen asks two things, and this is what pressing an answer does to
 * the model that already exists.
 *
 *     What do you think?
 *       Love it         a verdict: loved     — and the film is seen
 *       Like it         a verdict: liked     — and the film is seen
 *       Want to see     the film's viewing: want-to-see       — and no opinion
 *       Not interested  the film's viewing: dont-want-to-see  — and no opinion
 *       Dislike         a verdict: disliked  — and the film is seen
 *
 *     When did you see it?            asked only while the film is seen
 *       Seen now        the film's viewing: seen-now — watched recently
 *       Seen before     the film's viewing: seen-before — watched some time ago
 *
 * They are the website's one write, and they write nothing new: verdicts Tonight
 * already keeps, and the film's viewing. Neither seen answer asks or keeps a date.
 *
 * ## The five at the top are one answer
 *
 * An opinion says they watched the film, so it is written together with a seen
 * value: the one the film already has, or `seen-now` when it has none — so a film
 * the list called seen before keeps that, and one moved off the list is seen now
 * until they say otherwise below. *Want to see* and *Not interested* say they have
 * not watched it, or will not, so they take back the opinion that stands with it.
 * Each press is decided here, but on the film as the store holds it under its
 * lock (`TasteStore.choose`), and written in that one transaction — so the two
 * are never seen disagreeing, a refusal writes neither, and a page loaded before
 * something changed decides nothing.
 *
 * ## The two below are only when
 *
 * Shown while the stored viewing is seen — after any opinion, and for a film saved
 * as seen with none. Pressing one changes the viewing and nothing else: the
 * verdict stands as it was.
 *
 * ## Pressing what is already pressed
 *
 * An opinion that stands is taken back: a withdrawal, which leaves them having
 * said nothing — the verdict model's own word for it — and the film still seen.
 * A viewing cannot be taken back, because a saved film always stands somewhere,
 * so pressing the viewing a film already has writes nothing — unless an opinion
 * stands beside *Want to see* or *Not interested*, which pressing it again takes
 * back.
 *
 * ## What is refused, and why
 *
 * - *Love it* or *Like it* for a film in none of their vibes: a liked or loved
 *   film belongs to at least one vibe (Vibe Evolution), and the store refuses it.
 * - *Want to see* or *Not interested* for a film a vibe is anchored on: a core is
 *   a film they have seen, and the store refuses to mark it anything else. It may
 *   move between *Seen now* and *Seen before*, and keeps its seen value under an
 *   opinion.
 *
 * Both are decided here first so the page can say which, and the store still
 * decides them for itself. A refused press writes nothing at all.
 */

/** Every answer, by the value a button sends: the five at the top, then the two below. */
export const CHOICE_KEYS = [
  "love",
  "like",
  "want",
  "not-interested",
  "dislike",
  "seen-now",
  "seen-before",
] as const;
export type ChoiceKey = (typeof CHOICE_KEYS)[number];

/** A viewing that says they have not watched the film. */
export type Listing = Exclude<Viewing, SeenViewing>;

export type Choice =
  | { key: ChoiceKey; label: string; kind: "judgement"; judgement: Judgement }
  | { key: ChoiceKey; label: string; kind: "viewing"; viewing: Listing }
  | { key: ChoiceKey; label: string; kind: "when"; viewing: SeenViewing };

/** *What do you think?* — the five, in the order the screen shows them. */
export const CHOICES: readonly Choice[] = [
  { key: "love", label: "Love it", kind: "judgement", judgement: "loved" },
  { key: "like", label: "Like it", kind: "judgement", judgement: "liked" },
  { key: "want", label: "Want to see", kind: "viewing", viewing: "want-to-see" },
  { key: "not-interested", label: "Not interested", kind: "viewing", viewing: "dont-want-to-see" },
  { key: "dislike", label: "Dislike", kind: "judgement", judgement: "disliked" },
];

/** *When did you see it?* — the two, in the order the screen shows them. */
export const WHEN: readonly Choice[] = [
  { key: "seen-now", label: "Seen now", kind: "when", viewing: "seen-now" },
  { key: "seen-before", label: "Seen before", kind: "when", viewing: "seen-before" },
];

/** The answer a button sent, or nothing when it is not one of the seven. */
export function choiceFor(value: unknown): Choice | null {
  return [...CHOICES, ...WHEN].find((choice) => choice.key === value) ?? null;
}

/** Whether a choice is what the film stands at now: its verdict, or its viewing. */
export function isPressed(choice: Choice, viewing: Viewing, judgement: Judgement | null): boolean {
  return choice.kind === "judgement" ? judgement === choice.judgement : viewing === choice.viewing;
}

/** Whether the screen asks *When did you see it?*: while the film is seen, now or before. */
export function asksWhen(viewing: Viewing): boolean {
  return isSeen(viewing);
}

/**
 * What a film is, as far as a choice is concerned: the store's `HeldFilm`, read
 * under the film's lock when a press is decided (`TasteStore.choose`).
 */
export type Film = HeldFilm;

/** What a press comes to: a write, nothing, or a refusal the page can name. */
export type Outcome =
  /** The verdict, and the seen value written with it — one transaction. */
  | { write: "opinion"; judgement: Judgement; viewing: SeenViewing }
  /** The standing opinion taken back; the viewing stays. */
  | { write: "withdrawal" }
  /** The viewing set to a listing, and any standing opinion taken back — one transaction. */
  | { write: "listing"; viewing: Listing }
  /** The seen value alone; the verdict stays. */
  | { write: "viewing"; viewing: SeenViewing }
  | { write: "nothing" }
  | { refused: Refusal };

/** Why a press was not kept. */
export const REFUSALS = ["vibe-required", "core", "failed"] as const;
export type Refusal = (typeof REFUSALS)[number];

export function decide(choice: Choice, film: Film): Outcome {
  switch (choice.kind) {
    case "judgement": {
      if (film.judgement === choice.judgement) return { write: "withdrawal" };
      if (isPositive(choice.judgement) && !film.filed) return { refused: "vibe-required" };
      const viewing: SeenViewing = isSeen(film.viewing) ? (film.viewing as SeenViewing) : "seen-now";
      return { write: "opinion", judgement: choice.judgement, viewing };
    }
    case "viewing": {
      const changing = film.viewing !== choice.viewing;
      if (!changing && film.judgement === null) return { write: "nothing" };
      if (changing && film.core) return { refused: "core" };
      return { write: "listing", viewing: choice.viewing };
    }
    case "when":
      if (film.viewing === choice.viewing) return { write: "nothing" };
      return { write: "viewing", viewing: choice.viewing };
  }
}

/** What a decided press asks the store to write. A refusal is not one: it is thrown. */
export function writeFor(outcome: Exclude<Outcome, { refused: Refusal }>): FilmWrite {
  switch (outcome.write) {
    case "opinion":
      return { judgement: outcome.judgement, viewing: outcome.viewing };
    case "withdrawal":
      return { withdraw: true };
    case "listing":
      return { withdraw: true, viewing: outcome.viewing };
    case "viewing":
      return { viewing: outcome.viewing };
    case "nothing":
      return {};
  }
}

/** A refusal as the page says it. Fixed sentences: nothing from a request is echoed. */
export function refusalSentence(refusal: Refusal): string {
  switch (refusal) {
    case "vibe-required":
      return "Love it and Like it are kept for a film in at least one of your vibes. Ask your assistant to put this one in a vibe first — nothing was saved.";
    case "core":
      return "A vibe is anchored on this film, so it stays seen — now or before. Ask your assistant to anchor the vibe on another film first — nothing was saved.";
    case "failed":
      return "That could not be saved just now. Reload to see where this film stands.";
  }
}

/** The refusal a URL names, or nothing when it names none of them. */
export function refusalFor(value: string | null): Refusal | null {
  return (REFUSALS as readonly string[]).includes(value ?? "") ? (value as Refusal) : null;
}
