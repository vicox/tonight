import type { Vibe, Movie } from "../taste/model.ts";

/**
 * The films behind a vibe.
 *
 * A vibe carries handles — `{title, year}` — and a film's record lives once, in
 * `Taste.movies`. So the join belongs somewhere every screen that asks can reach,
 * because a vibe's screen and the vibes with nothing in them on the Stream are the
 * same question and must not be able to disagree.
 */

/**
 * The films in a vibe, as the whole records rather than the handles.
 *
 * Both halves come out of one database snapshot, which is what makes a plain
 * lookup safe: there is no read here that could see a film the vibe's handle no
 * longer describes. A handle with nothing behind it is dropped rather than
 * counted, so what a vibe is said to hold is always the rows its screen shows.
 *
 * Membership, and nothing else: a film in a vibe is in it whether it has been
 * watched, loved or never mentioned.
 */
export function filmsIn<T extends Movie>(vibe: Vibe, movies: readonly T[]): T[] {
  // Keyed year-first, so the space that separates the two is unambiguous: a year
  // is digits, and the first space is therefore always the separator however the
  // title is spelled.
  const known = new Map(movies.map((movie) => [`${movie.year} ${movie.title}`, movie]));
  return vibe.movies.flatMap((handle) => known.get(`${handle.year} ${handle.title}`) ?? []);
}
