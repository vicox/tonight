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
 * are six things worth asking the collection — because the sixth useful question
 * is not a state at all. `null` is the absence of an answer, and asking for it
 * asks for the films nobody has spoken about yet.
 *
 * So a `Selection` carries the *set* of states it stands for rather than a
 * single one. As the row stands each of them names exactly one state, which is
 * what makes the counts add up; the set is what lets `null` be asked for beside
 * the five, and what lets a selection be a thing the page displays rather than a
 * thing the database stores.
 *
 * Nothing here adds to the domain. `Without status` is not stored, and `null` is
 * still the absence of an answer rather than a sixth state. Silence is not
 * `not_seen` and nothing here infers one from the other.
 *
 * ## What the numbers add up to
 *
 * One invariant, held by `movie-summary.test.ts` rather than by arithmetic
 * anywhere in the page:
 *
 *     total = not seen + seen + loved + liked + disliked + without status
 *
 * Every film is counted once and every film is counted somewhere, which is what
 * lets the six be read as one line. `Seen` is the bare `seen` state and not an
 * aggregate: `liked`, `loved` and `disliked` each already say the film was
 * watched, and they are named beside it, so folding them in would count three of
 * the others a second time and make the row a sum rather than a list.
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
   * One each, as the row stands: every control is exactly its own state, so the
   * counts add up to the collection with nothing counted twice. A list rather
   * than a single state because `null` — the films with no state at all — is a
   * member here too, and it is the only member of its own selection, never mixed
   * in with a real one.
   */
  readonly states: readonly (MovieState | null)[];
  /** What the dialog is called, and how a listener is given the control. */
  readonly label: string;
  /** How it reads inline where the number comes first, if it is written that way. */
  readonly phrase?: string;
  /**
   * What the label leaves out, said to a listener.
   *
   * Only where the words alone are genuinely ambiguous: read out beside `Loved`,
   * `Liked` and `Disliked`, "Seen" sounds like it might cover them too, when in
   * fact it is the films watched with nothing said. The others say what they
   * are, and giving them a second sentence would be reading the obvious out
   * twice.
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
 * Watched, and nothing said about it.
 *
 * Exactly the `seen` state, not every film that has been watched: `liked`,
 * `loved` and `disliked` each already say the film was seen, and they are named
 * beside this one. Read as a line, the row is six words that between them
 * account for every film once — an aggregate in the middle of it would count
 * three of the others a second time and make the row a sum rather than a list.
 */
export const SEEN: Selection = {
  key: "seen",
  states: ["seen"],
  label: "Seen",
  meaning: "watched, with nothing said about it",
};

export const LOVED: Selection = { key: "loved", states: ["loved"], label: "Loved" };
export const LIKED: Selection = { key: "liked", states: ["liked"], label: "Liked" };
export const DISLIKED: Selection = { key: "disliked", states: ["disliked"], label: "Disliked" };

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
 * The two facts, read first: what has not been watched and what has.
 *
 * Not seen before Seen, which is the direction a film moves through them, and
 * the order the mark's own menu offers them in.
 */
export const FACTS: readonly Selection[] = [NOT_SEEN, SEEN];

/**
 * The three opinions, in the order the mark's own menu offers them.
 *
 * A reader meeting both should not have to learn two orders, and the menu reads
 * them warmest-last: liked, then loved, then the one nobody reaches for.
 */
export const OPINIONS: readonly Selection[] = [LIKED, LOVED, DISLIKED];

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
 * How a selection reads when the number comes first: `30 without status`.
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
 * The one that carries a `meaning` gets it appended, because there the visible
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
