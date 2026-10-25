import { filmKey } from "../films/identity.ts";
import type { Genre, Movie, MovieHandle, Vibe } from "../taste/model.ts";

/**
 * Where the signed-in screens are, and which of the user's own objects a URL
 * names.
 *
 *     /                                     the Stream: every film, newest first
 *     /vibe?name=Space+Tension              one vibe
 *     /movie?title=Dune&year=2021&from=…    one film, reached from a vibe or not
 *
 * ## Query parameters, not path segments
 *
 * A vibe's name and a film's title are whatever the user said. A vibe may be
 * called `..`, which a browser folds out of a path before the server sees it,
 * and a title such as `Face/Off` or `#Alive` is exactly what a path segment
 * carries worst. `URLSearchParams` carries any string there and back.
 *
 * ## A URL chooses, it never authorizes
 *
 * Everything here is looked up in what the page has already read for the
 * signed-in visitor. A value from the query decides *which* of their films or
 * vibes is shown, never whose — there is nothing here a URL could use to reach
 * anyone else's — and choosing writes nothing.
 */

/** One vibe's screen. */
export function vibeHref(name: string): string {
  return `/vibe?${new URLSearchParams({ name })}`;
}

/**
 * One film's screen, and the vibe it was reached through when there was one.
 *
 * `from` is navigation, not data: the film's screen shows it as the context only
 * while the film is still in that vibe (`contextOf`).
 */
export function movieHref(film: MovieHandle, from?: string | null): string {
  const query = new URLSearchParams({ title: film.title, year: String(film.year) });
  if (from) query.set("from", from);
  return `/movie?${query}`;
}

/**
 * One search-parameter value, or nothing.
 *
 * Next.js hands a repeated parameter (`?name=a&name=b`) over as a list, and a
 * page given two names has no honest way to pick one, so a list is no answer.
 */
export function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * The vibe a URL names, by its stored name exactly.
 *
 * Every link to a vibe is written from the name the store holds, so an exact
 * match is what a link always finds. A name that has since changed, or one typed
 * by hand in another case, finds nothing rather than a guess: whether two
 * spellings are one vibe is the database's question, and it is not asked here.
 */
export function findVibe<T extends Vibe>(vibes: readonly T[], name: string | null): T | null {
  if (name === null) return null;
  return vibes.find((vibe) => vibe.name === name) ?? null;
}

/** A release year as a URL can carry one: four digits, and nothing else. */
const YEAR = /^[0-9]{4}$/u;

/**
 * The film a URL names, by the identity the store indexes.
 *
 * `filmKey` is the one rule for whether two mentions are one film — the same one
 * that joins a verdict to its film — so a title spelled with other spacing or
 * case still finds the film it means, and the other year never does.
 */
export function findMovie<T extends Movie>(
  movies: readonly T[],
  title: string | null,
  year: string | null,
): T | null {
  if (title === null || year === null || !YEAR.test(year)) return null;
  const wanted = filmKey({ title, year: Number(year) });
  return movies.find((movie) => filmKey(movie) === wanted) ?? null;
}

/**
 * The vibe a film's screen was reached through, while the film is still in it.
 *
 * A link can outlive the filing it was written from — the film taken out of the
 * vibe, the vibe renamed — and then the film is shown without a context rather
 * than under a vibe it is not in.
 */
export function contextOf(movie: Movie, from: string | null): string | null {
  return from !== null && movie.vibes.includes(from) ? from : null;
}

/** The film's other vibes, beside the one it was reached through, in its own order. */
export function alsoIn(movie: Movie, context: string | null): string[] {
  return movie.vibes.filter((name) => name !== context);
}

/**
 * A vibe's genres as the genres themselves, in the order the vibe names them.
 *
 * A vibe holds its genres by name, and a genre's meaning lives once, in
 * `Taste.genres`. A name with no genre behind it cannot come from one snapshot,
 * and is skipped rather than drawn as an empty label.
 */
export function genresOf<T extends Genre>(vibe: Vibe, genres: readonly T[]): T[] {
  const known = new Map(genres.map((genre) => [genre.name, genre]));
  return vibe.genres.flatMap((name) => known.get(name) ?? []);
}
