import type { Movie } from "../taste/model.ts";

/**
 * The film collection at a glance: four counts, and the films behind each one.
 *
 * The overview page shows films where they are filed — inside the mix they
 * belong to, or under "Other movies" when they are in none. That answers "what
 * is in this mix" and cannot answer "how many films have I loved", because the
 * loved ones are spread across every mix on the page. These four selections are
 * that second question, and they are the only reason this module exists.
 *
 * ## One function behind the number and the list
 *
 * A tile shows `selected(…).length` and opens `selected(…)`. Counting and
 * listing are therefore the same statement evaluated twice rather than two
 * pieces of arithmetic that could drift — there is no expression anywhere in
 * which a tile could say four and open three films.
 *
 * ## Three states and a whole
 *
 * `loved`, `liked` and `not_seen` are three of the five `MovieState` values,
 * matched by equality with `Movie.state`; `all` is the collection. Nothing here
 * adds to the domain: there is no fourth state, no bucket a film is put into and
 * no order of its own — the store's order is the order every list on the page
 * uses.
 *
 * Which is also why `null` — Tonight was never told — is in `all` and in none of
 * the other three. `null === "not_seen"` is false, so silence being excluded from
 * "Not seen" is the shape of the comparison rather than a rule somebody has to
 * remember to keep. The two are different things: one is something the user said,
 * the other is that they have not.
 */

/**
 * The four tiles, in the order they are read.
 *
 * `all` first, because it is the whole and the other three are part of it. Then
 * the states in the direction somebody moves through them — not watched yet,
 * liked, loved — so the row reads left to right as a film's way through the
 * collection rather than as three unrelated piles.
 *
 * Order only. Which films each one holds is `selected` below, and nothing there
 * reads this sequence.
 */
export const SELECTIONS = [
  { name: "all", label: "Total" },
  { name: "not_seen", label: "Not seen" },
  { name: "liked", label: "Liked" },
  { name: "loved", label: "Loved" },
] as const;

export type Selection = (typeof SELECTIONS)[number];

/**
 * The films one tile stands for.
 *
 * Called for the count and again for the list a tile opens, and called on the
 * films the page was rendered with — so a state written from either place is
 * reflected by the next render rather than by an adjustment made here.
 */
export function selected(selection: Selection["name"], movies: readonly Movie[]): Movie[] {
  if (selection === "all") return [...movies];
  return movies.filter((movie) => movie.state === selection);
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
