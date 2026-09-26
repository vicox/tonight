import type { Movie, Written } from "../taste/model.ts";
import type { Judgement } from "../verdicts/model.ts";
import { effectivelySeen } from "../seen.ts";
import type { Positioned } from "./judgements.ts";

/**
 * The film collection at a glance: how many there are, what is known about them,
 * and the films behind each answer.
 *
 * The overview page shows films where they are filed — inside the vibe they
 * belong to, or under "Other movies" when they are in none. That answers "what
 * is in this vibe" and cannot answer "how many have I loved", because the loved
 * ones are spread across every vibe on the page. These selections are that second
 * question, and they are the only reason this module exists.
 *
 * ## One function behind every number and every list
 *
 * A control shows `selected(…).length` and opens `selected(…)`. Counting and
 * listing are therefore the same statement evaluated twice rather than two
 * pieces of arithmetic that could drift — there is no expression anywhere in
 * which a control could say four and open three films.
 *
 * ## Two questions, and why they no longer add up to one row
 *
 * This row used to be six mutually exclusive buckets, and it could be, because a
 * film had exactly one state out of five and the sixth was having none. That
 * arrangement is gone and nothing should try to recover it: a film now carries a
 * *fact* about watching and, separately, whatever the user has *said* about it.
 * A film can be seen and loved at once. Two of six buckets would hold it.
 *
 * So there are two rows, each exhaustive over its own question and neither
 * pretending to be exhaustive over the other:
 *
 *     watched       seen + not seen + not said        = every film
 *     said          loved + liked + disliked + no opinion    = every film
 *
 * Each row sums to the collection. The rows do not sum to each other, and
 * writing them as one line would be the arithmetic that made a film disappear
 * from the count of what it is.
 *
 * ## Seen is derived; not said is not a verdict
 *
 * A film counts as watched when the user said so, or when they have a standing
 * judgement — nobody likes a film they have not seen. That derivation is
 * `lib/seen.ts`'s, so the page and a recommendation cannot disagree about what
 * "seen" means. The raw fact stays visible underneath: a film that is only
 * `seen` because it was loved is not shown as something the user said they
 * watched.
 *
 * `No opinion` sits outside the three rather than as a fourth, because it is
 * the absence of a judgement rather than one — and it is *not* the same as
 * having said nothing: a standing `not-ever` is a great deal said, and lands
 * there too, because a refusal is not a judgement.
 */

/** A film as this module reads one: what is saved, and what stands about it. */
export type Shown = Positioned<Written<Movie>>;

/** A named part of the collection: what it stands for, and what to call it. */
export type Selection = {
  /** Stable identity, so a control can be keyed and a test can name one. */
  readonly key: string;
  /** Which films belong to it. */
  readonly holds: (movie: Shown) => boolean;
  /** What the dialog is called, and how a listener is given the control. */
  readonly label: string;
  /** How it reads inline where the number comes first, if it is written that way. */
  readonly phrase?: string;
  /**
   * What the label leaves out, said to a listener.
   *
   * Only where the words alone are genuinely ambiguous. `Seen` counts a film
   * they never marked but did judge, and that is worth saying out loud; the
   * others say what they are.
   */
  readonly meaning?: string;
};

/** Whether a standing judgement of this kind is what the film carries. */
const judged = (judgement: Judgement) => (movie: Shown) => movie.position?.judgement === judgement;

/**
 * Watched, by either route.
 *
 * The user having said so, or a standing judgement implying it. `positions` is
 * already resolved before it reaches a film here, so a judgement they withdrew
 * or replaced cannot make a film count as seen.
 */
export const SEEN: Selection = {
  key: "seen",
  holds: (movie) =>
    effectivelySeen(
      movie.viewing,
      movie.position?.judgement === undefined ? null : { judgement: movie.position.judgement },
    ),
  label: "Seen",
  meaning: "watched, or judged — which means watched",
};

/**
 * The films they said they have not watched, and nothing contradicts it.
 *
 * `unseen` beside a standing judgement is a contradiction the user can create,
 * and this row resolves it the way everything else does — the opinion wins,
 * because nobody likes a film they have not seen. So such a film is counted as
 * seen and not here, which is what keeps the three buckets exclusive.
 *
 * Nothing is hidden by that. The raw fact is still on the film's own mark, where
 * the user set it and can change it; this row is the count, not the record.
 */
export const NOT_SEEN: Selection = {
  key: "unseen",
  holds: (movie) => movie.viewing === "unseen" && !SEEN.holds(movie),
  label: "Not seen",
};

/**
 * The films nobody has said either way about watching.
 *
 * Not "not seen". A film here may well have been watched; what is true is that
 * Tonight has not been told, and a film that counts as seen through a judgement
 * is not here either — that is something it does know.
 */
export const WATCHING_UNSAID: Selection = {
  key: "watching_unsaid",
  holds: (movie) => movie.viewing === null && movie.position?.judgement === undefined,
  label: "Not said",
  phrase: "not said",
  meaning: "nobody has said whether they watched it",
};

export const LOVED: Selection = { key: "loved", holds: judged("loved"), label: "Loved" };
export const LIKED: Selection = { key: "liked", holds: judged("liked"), label: "Liked" };
export const DISLIKED: Selection = { key: "disliked", holds: judged("disliked"), label: "Disliked" };

/**
 * The films they have not judged.
 *
 * Outside the three rather than beside them: it is what is *left over* rather
 * than something somebody answered, and giving it the weight of an opinion
 * would make an absence look like a verdict.
 *
 * "No opinion" rather than "nothing said", because the two are different and
 * the difference matters here. A film they turned down for good has a standing
 * verdict — they said a great deal about it — and it is in this bucket, because
 * a refusal is not a judgement. So is a film they marked `unseen`. What they
 * have not done is say what they made of it.
 */
export const NO_OPINION: Selection = {
  key: "no_opinion",
  holds: (movie) => movie.position?.judgement === undefined,
  label: "No opinion",
  phrase: "with no opinion",
  meaning: "nothing said about what they made of it",
};

/**
 * What is known about watching. Exhaustive: every film is in exactly one.
 *
 * `Seen` first because a judgement puts a film there, so it is the largest of
 * the three for most people, and the other two are what is left — each defined
 * as what `Seen` did not take, which is what makes the three a partition rather
 * than three questions that happen not to overlap today.
 */
export const WATCHED: readonly Selection[] = [SEEN, NOT_SEEN, WATCHING_UNSAID];

/**
 * What they have said. Exhaustive over the same collection, independently.
 *
 * The order the mark's own menu offers them in, warmest-last: liked, then loved,
 * then the one nobody reaches for, and then the films they have not judged.
 */
export const SAID: readonly Selection[] = [LIKED, LOVED, DISLIKED, NO_OPINION];

/**
 * The films one selection stands for.
 *
 * Called for a count and again for the list a press opens, and called on the
 * films the page was rendered with — so a change written from either place is
 * reflected by the next render rather than by an adjustment made here.
 */
export function selected(selection: Selection, movies: readonly Shown[]): Shown[] {
  return movies.filter((movie) => selection.holds(movie));
}

/**
 * How a selection reads when the number comes first: `30 nothing said`.
 *
 * One template for one and for many, because the phrase does not inflect — it is
 * the number of films and then the thing they are without. Written here so that
 * the wording is one decision rather than a string in a component, and so that a
 * test can hold it.
 */
export function sentence(selection: Selection, count: number): string {
  return `${count} ${selection.phrase ?? selection.label}`;
}

/**
 * How a control is named to a listener.
 *
 * The words then the number, which is the order the page sets them in too — so
 * most of these are simply the control's own text and need no label at all. The
 * ones carrying a `meaning` get it appended, because there the visible words are
 * true but not sufficient.
 */
export function spoken(selection: Selection, count: number): string | undefined {
  if (selection.meaning === undefined) return undefined;
  return `${selection.label} ${count}, ${selection.meaning}`;
}

/**
 * What the page calls the films that are in no vibe.
 *
 * The same words as the section on the overview, deliberately: a film in no vibe
 * already has a place and a name there, and a second word for it here — unsorted,
 * inbox, archive — would be a second idea about the same films.
 */
export const OTHER_MOVIES = "Other movies";

/**
 * Where a film is filed, for a row that is being read outside its vibe.
 *
 * All of the vibes rather than the first and a count: the answer to "why is this
 * film here" is the names, and "Space Tension +2" is the one form of it that
 * cannot be read.
 */
export function filedUnder(movie: Movie): string[] {
  return movie.vibes.length ? movie.vibes : [OTHER_MOVIES];
}

/** Seven days, which is what "recently" means here and nowhere else. */
const RECENTLY = 7 * 24 * 60 * 60 * 1000;

/**
 * The films saved in the last week, newest first.
 *
 * The summary says what the collection *is*; this says what just happened to
 * it. A film somebody added yesterday is the one they are most likely to have
 * come back to mark, and finding it otherwise means remembering which vibe they
 * put it in.
 *
 * All of them, however many there are. The week is the limit: a cap on top of it
 * would make the number on the control a different question from the list it
 * opens — "ten of the fourteen you added" is not something a count can say.
 *
 * Nothing about state: a film counts as recently added whether it has been
 * watched, loved or never mentioned, because the question is when it arrived.
 * And nothing about `updatedAt` — that moves when a mark is pressed, so a list
 * built on it would answer "recently touched", which is a different question and
 * one that would reorder itself under somebody's hand as they used it.
 *
 * A film with no `createdAt` is left out rather than guessed at: those predate
 * the column, so they are certainly not from this week.
 *
 * `now` is given rather than taken, so that the page decides once — on the
 * server, where the rest of the render happens — and a test can name an instant
 * instead of racing the clock.
 */
export function recentlyAdded<T extends Written<Movie>>(movies: readonly T[], now: Date): T[] {
  const since = now.getTime() - RECENTLY;

  /** Only the dated ones get this far, which is what makes the sort total. */
  const dated = movies.flatMap((movie) =>
    movie.createdAt !== null && Date.parse(movie.createdAt) >= since
      ? [{ movie, createdAt: movie.createdAt }]
      : [],
  );

  return dated
    .sort((one, two) => (one.createdAt < two.createdAt ? 1 : one.createdAt > two.createdAt ? -1 : 0))
    .map((one) => one.movie);
}
