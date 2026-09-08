import type { Movie, MovieState } from "../taste/model.ts";

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
 * A tile shows `selected(…).length` and opens `selected(…)`. Counting and
 * listing are therefore the same statement evaluated twice rather than two
 * pieces of arithmetic that could drift — there is no expression anywhere in
 * which a tile could say four and open three films.
 *
 * ## Five states, and the absence of one
 *
 * The five tiles are the five `MovieState` values, matched by equality with
 * `Movie.state`. `null` — Tonight was never told — is what the sixth selection
 * matches, and it is deliberately *not* a sixth state: nothing here adds to the
 * domain, `selected` takes the type `Movie.state` already has, and asking for
 * `null` asks for the films that have not been spoken about rather than for the
 * films in some state called "without status". Silence is not `not_seen` and
 * nothing here infers one from the other.
 *
 * The total is not a selection at all. It is `movies.length`, it belongs beside
 * the section's heading the way a genre count does, and it includes the films
 * nobody has said anything about — they are films the user saved.
 */

/** A named part of the collection: what to match, and what to call it. */
export type Selection = {
  /** The state to match, or `null` for the films with none. */
  readonly name: MovieState | null;
  readonly label: string;
};

/**
 * The five tiles, in the order they are read: the two facts, then the three
 * ways of having an opinion. The same order the mark's own menu offers, because
 * a reader meeting both should not have to learn two.
 */
export const STATE_TILES: readonly Selection[] = [
  { name: "seen", label: "Seen" },
  { name: "not_seen", label: "Not seen" },
  { name: "liked", label: "Liked" },
  { name: "loved", label: "Loved" },
  { name: "disliked", label: "Disliked" },
];

/**
 * The films Tonight was never told about.
 *
 * Not a tile. It is one quiet line under the five, because it is not a sixth
 * thing the user said — it is the films they have not said anything about yet,
 * and giving it the same weight as `Loved` would make silence look like a
 * verdict.
 */
export const WITHOUT_STATUS: Selection = { name: null, label: "Without status" };

/**
 * The films one selection stands for.
 *
 * Called for a count and again for the list a press opens, and called on the
 * films the page was rendered with — so a state written from either place is
 * reflected by the next render rather than by an adjustment made here.
 */
export function selected(state: MovieState | null, movies: readonly Movie[]): Movie[] {
  return movies.filter((movie) => movie.state === state);
}

/**
 * How the quiet line reads: `2 without status`.
 *
 * One template for one and for many, because the phrase does not inflect — it
 * is the number of films and then the thing they are without, and "1 without
 * status" is as English as "2 without status". Written here so that the wording
 * is one decision rather than a string in a component, and so that a test can
 * hold it.
 */
export function withoutStatus(count: number): string {
  return `${count} without status`;
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
