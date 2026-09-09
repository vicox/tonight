import type { Mix, Movie } from "../taste/model.ts";

/**
 * What a mix is worth saying on a card, and the films behind it.
 *
 * A mix carries handles — `{title, year}` — and a film's state lives once, in
 * `Taste.movies`. So the join belongs somewhere both the card and its dialog can
 * ask, because the number on the card and the list inside it are the same
 * question at two levels of detail and must not be able to disagree.
 */

/**
 * The films in a mix, as the whole records rather than the handles.
 *
 * Both halves come out of one database snapshot, which is what makes a plain
 * lookup safe: there is no read here that could see a film the mix's handle no
 * longer describes. A handle with nothing behind it is dropped rather than
 * counted, so a card's number is always the number of rows its dialog opens.
 *
 * Membership, and nothing about state: a film in a mix is in it whether it has
 * been watched, loved or never mentioned.
 */
export function filmsIn(mix: Mix, movies: readonly Movie[]): Movie[] {
  // Keyed year-first, so the space that separates the two is unambiguous: a year
  // is digits, and the first space is therefore always the separator however the
  // title is spelled.
  const known = new Map(movies.map((movie) => [`${movie.year} ${movie.title}`, movie]));
  return mix.movies.flatMap((handle) => known.get(`${handle.year} ${handle.title}`) ?? []);
}

/**
 * A mix as a listener is given it: the name, how many films, how many loved.
 *
 * The card reads as `Quiet Dread 4 ♥3`, which is three facts in the order the
 * eye wants them and a heart nobody can hear. This is the same three said the
 * way somebody would say them, and it is the button's whole accessible name.
 *
 * The loved half is absent at nought rather than said as "0 loved": on the card
 * there is nothing there to describe, and a listener should meet the same mix a
 * reader does.
 */
export function spokenMix(name: string, films: number, loved: number): string {
  const counted = `${films} ${films === 1 ? "film" : "films"}`;
  return loved > 0 ? `${name}: ${counted}, ${loved} loved` : `${name}: ${counted}`;
}
