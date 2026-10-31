import { filmKey } from "../films/identity.ts";
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

/**
 * The vibes a film is in, as its card names them: the ones it is the core of
 * first, then the rest.
 *
 * `cores` is which of `names` the film is the core of — the vibes it best
 * embodies, which its card draws in the vibe's violet — and every other name is
 * a vibe it is only filed under. Each group keeps the order the film holds its
 * vibes in, so a film that is the core of two vibes names both first, and a
 * film that is the core of none names its vibes as it always did, with `cores`
 * empty.
 *
 * Whether a vibe's core is this film is `filmKey`'s question, the one rule for
 * whether two mentions are one film: `Dune / 1984` as a core says nothing about
 * `Dune / 2021`. A vibe written before vibes had cores has `null`, and is the
 * core of nothing. A core is always one of its vibe's films — the store's key
 * holds it — so nothing is named here that the film is not in.
 */
export function coreFirst(movie: Movie, vibes: readonly Vibe[]): { names: string[]; cores: string[] } {
  const film = filmKey(movie);
  const anchored = new Set(
    vibes.flatMap((vibe) => (vibe.core !== null && filmKey(vibe.core) === film ? [vibe.name] : [])),
  );
  const cores = movie.vibes.filter((name) => anchored.has(name));
  return { names: [...cores, ...movie.vibes.filter((name) => !anchored.has(name))], cores };
}
