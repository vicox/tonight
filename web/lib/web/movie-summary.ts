import type { Movie, MovieState, Written } from "../taste/model.ts";

/**
 * The film collection at a glance: how many there are, what was said about
 * them, and the films behind each answer.
 *
 * The overview page shows films where they are filed — inside the mix they
 * belong to, or under "Other movies" when they are in none. That answers "what
 * is in this mix" and cannot answer "how many have I loved", because the loved
 * ones are spread across every mix on the page. These selections are that second
 * question, and they are the only reason this module exists.
 *
 * ## One function behind every number and every list
 *
 * A control shows `selected(…).length` and opens `selected(…)`. Counting and
 * listing are therefore the same statement evaluated twice rather than two
 * pieces of arithmetic that could drift — there is no expression anywhere in
 * which a control could say four and open three films.
 *
 * ## A selection is not a state
 *
 * This is the part worth reading. There are five `MovieState` values, and there
 * are seven things worth asking the collection — because the useful question
 * "how many have I seen" is not a state at all. It is `seen`, `liked`, `loved`
 * and `disliked` together: an opinion about a film is a statement that you
 * watched it, so counting only the bare `seen` under that word would tell
 * somebody with forty loved films that they had seen two.
 *
 * So a `Selection` carries the *set* of states it stands for, and the earlier
 * shape — one selection, one state, matched by equality — is gone. It made every
 * displayed control pretend to be a persisted state, which was true of five of
 * them and is the reason the sixth could not exist.
 *
 * Nothing here adds to the domain. `Seen` is not stored, `Without opinion` is
 * not stored, and `null` is still the absence of an answer rather than a sixth
 * state — asking for it asks for the films nobody has spoken about. Silence is
 * not `not_seen` and nothing here infers one from the other.
 *
 * ## What the numbers add up to
 *
 * Two invariants, held by `movie-summary.test.ts` rather than by arithmetic
 * anywhere in the page:
 *
 *     total          = not seen + seen + without status
 *     seen           = loved + liked + disliked + without opinion
 *
 * The second is the whole point of the layout: the three opinions and the films
 * watched without one are what `Seen` is made of, and the page is arranged so
 * that reads as a hierarchy instead of as five peers.
 *
 * The total is not a selection. It is `movies.length`, it belongs beside the
 * section's heading the way a genre count does, and it includes the films nobody
 * has said anything about — they are films the user saved.
 */

/** A named part of the collection: what it stands for, and what to call it. */
export type Selection = {
  /** Stable identity, so a control can be keyed and a test can name one. */
  readonly key: string;
  /**
   * The states this selection stands for.
   *
   * Several, for the one selection that is an aggregate. `null` in here means
   * the films with no state at all, and it is the only member of its own
   * selection — never mixed in with a real one.
   */
  readonly states: readonly (MovieState | null)[];
  /** What the dialog is called, and how a listener is given the control. */
  readonly label: string;
  /** How it reads inline where the number comes first, if it is written that way. */
  readonly phrase?: string;
  /**
   * What the label leaves out, said to a listener.
   *
   * Only where the words alone are genuinely ambiguous: "Seen" could be read as
   * the bare state, and "without opinion" only means anything once you know it
   * is a film that *was* watched. The other five say what they are, and giving
   * them a second sentence would be reading the obvious out twice.
   */
  readonly meaning?: string;
};

/** Exactly the films the user said they have not seen. */
export const NOT_SEEN: Selection = {
  key: "not_seen",
  states: ["not_seen"],
  label: "Not seen",
};

/**
 * Every film the user has watched, whatever they thought of it.
 *
 * The aggregate, and the parent of the three opinions and of the films watched
 * without one. `liked`, `loved` and `disliked` each already say the film was
 * seen, so a count under this word that left them out would be wrong rather
 * than merely narrow.
 */
export const SEEN: Selection = {
  key: "seen",
  states: ["seen", "liked", "loved", "disliked"],
  label: "Seen",
  meaning: "every film you have watched, opinion or not",
};

export const LOVED: Selection = { key: "loved", states: ["loved"], label: "Loved" };
export const LIKED: Selection = { key: "liked", states: ["liked"], label: "Liked" };
export const DISLIKED: Selection = { key: "disliked", states: ["disliked"], label: "Disliked" };

/**
 * Watched, and nothing said about it.
 *
 * The bare `seen` state, named for what it is rather than for the word stored in
 * the column: under a heading that already says "Seen", a second control called
 * "Seen" would be unreadable. It is the remainder of the aggregate once the
 * three opinions are taken out, and it is written as a sentence because that is
 * what it is.
 */
export const WITHOUT_OPINION: Selection = {
  key: "without_opinion",
  states: ["seen"],
  label: "Without opinion",
  phrase: "without opinion",
  meaning: "watched, with nothing said about it",
};

/**
 * The films Tonight was never told about.
 *
 * Outside the hierarchy above, deliberately: it is not one of the things the
 * user said, so it belongs neither under `Seen` nor beside `Not seen`. It is the
 * films they have not spoken about yet, and giving it the weight of an opinion
 * would make silence look like a verdict.
 */
export const WITHOUT_STATUS: Selection = {
  key: "without_status",
  states: [null],
  label: "Without status",
  phrase: "without status",
};

/**
 * The two facts, read first: what has been watched and what has not.
 *
 * Not seen before Seen, which is the direction a film moves through them.
 */
export const FACTS: readonly Selection[] = [NOT_SEEN, SEEN];

/**
 * The three opinions, in the order the mark's own menu offers them.
 *
 * A reader meeting both should not have to learn two orders.
 */
export const OPINIONS: readonly Selection[] = [LOVED, LIKED, DISLIKED];

/**
 * The films one selection stands for.
 *
 * Called for a count and again for the list a press opens, and called on the
 * films the page was rendered with — so a state written from either place is
 * reflected by the next render rather than by an adjustment made here.
 */
export function selected(selection: Selection, movies: readonly Movie[]): Movie[] {
  return movies.filter((movie) => selection.states.includes(movie.state));
}

/**
 * How a selection reads when the number comes first: `30 without opinion`.
 *
 * One template for one and for many, because the phrase does not inflect — it is
 * the number of films and then the thing they are without, and "1 without
 * status" is as English as "2 without status". Written here so that the wording
 * is one decision rather than a string in a component, and so that a test can
 * hold it.
 */
export function sentence(selection: Selection, count: number): string {
  return `${count} ${selection.phrase ?? selection.label}`;
}

/**
 * How a control is named to a listener.
 *
 * The words then the number, which is the order the page now sets them in too —
 * so most of these are simply the control's own text and need no label at all.
 * The two that carry a `meaning` get it appended, because for those the visible
 * words are true but not sufficient.
 */
export function spoken(selection: Selection, count: number): string | undefined {
  if (selection.meaning === undefined) return undefined;
  return `${selection.label} ${count}, ${selection.meaning}`;
}

/**
 * What the page calls the films that are in no mix.
 *
 * The same words as the section on the overview, deliberately: a film in no mix
 * already has a place and a name there, and a second word for it here — unsorted,
 * inbox, archive — would be a second idea about the same films.
 */
export const OTHER_MOVIES = "Other movies";

/**
 * Where a film is filed, for a row that is being read outside its mix.
 *
 * All of the mixes rather than the first and a count: the answer to "why is this
 * film here" is the names, and "Space Tension +2" is the one form of it that
 * cannot be read.
 */
export function filedUnder(movie: Movie): string[] {
  return movie.mixes.length ? movie.mixes : [OTHER_MOVIES];
}

/** Seven days, which is what "recently" means here and nowhere else. */
const RECENTLY = 7 * 24 * 60 * 60 * 1000;

/**
 * The films saved in the last week, newest first.
 *
 * The summary says what the collection *is*; this says what just happened to
 * it. A film somebody added yesterday is the one they are most likely to have
 * come back to mark, and finding it otherwise means remembering which mix they
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
export function recentlyAdded(
  movies: readonly Written<Movie>[],
  now: Date,
): Written<Movie>[] {
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
