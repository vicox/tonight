import { filmKey } from "../films/identity.ts";
import { effectivelySeen } from "../seen.ts";
import type { Movie, Viewing, Written } from "../taste/model.ts";
import type { Judgement, Standing } from "../verdicts/model.ts";

/**
 * What currently stands about each film, for a page that shows a collection.
 *
 * The website reads two stores and has to put them side by side: the taste model
 * says which films are saved and whether they have been watched, and the verdict
 * store says what the user thinks of them. Neither knows about the other, and
 * that separation is the point — so the joining happens here, once, rather than
 * in each control that needs it.
 *
 * Keyed by `filmKey`, which is the only thing that decides whether two mentions
 * are one film. A verdict names a film by title and year as the user spelled it
 * and a Movie stores its own canonical name; comparing the raw spellings would
 * split a film in two the moment somebody typed it differently.
 */

/** What stands about one film, reduced to what a page shows. */
export type Position = {
  /** Their judgement, where one stands. */
  judgement?: Judgement;
  /** Their words for why, where they gave them. */
  because?: string;
};

/** The standing position of every film that has one. */
export function positions(standing: readonly Standing[]): Map<string, Position> {
  const found = new Map<string, Position>();
  for (const one of standing) {
    found.set(filmKey(one), {
      judgement: one.judgement,
      ...(one.because === undefined ? {} : { because: one.because }),
    });
  }
  return found;
}

/** What stands about one film, or nothing. */
export function positionOf(
  film: { title: string; year: number },
  found: ReadonlyMap<string, Position>,
): Position | undefined {
  return found.get(filmKey(film));
}

/**
 * Whether the user has watched a film, from both things that can say so.
 *
 * The page's use of `lib/seen.ts`: `seen` on their list, or whatever a standing
 * judgement implies. Shown as a fact about
 * watching and never as an opinion — a film that counts as seen because they
 * loved it is still a film they loved, and the love is displayed separately.
 */
export function seen(
  movie: { viewing: Viewing } & { title: string; year: number },
  found: ReadonlyMap<string, Position>,
): boolean {
  const position = positionOf(movie, found);
  return effectivelySeen(
    movie.viewing,
    position?.judgement === undefined ? null : { judgement: position.judgement },
  );
}

/** Every film the user has saved, with what stands about it. */
export type Positioned<T extends Movie> = T & { position: Position | undefined };

/** A film as the website shows one: what is saved, when, and what stands about it. */
export type Shown = Positioned<Written<Movie>>;

/** The collection, each film carrying its standing position. */
export function withPositions<T extends Movie>(
  movies: readonly T[],
  found: ReadonlyMap<string, Position>,
): Positioned<T>[] {
  return movies.map((movie) => ({ ...movie, position: positionOf(movie, found) }));
}
