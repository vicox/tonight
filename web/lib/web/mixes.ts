import type { Mix, Movie, MovieState, Written } from "../taste/model.ts";

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
export function filmsIn<T extends Movie>(mix: Mix, movies: readonly T[]): T[] {
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

/**
 * The most a card can say about what is in a mix: up to three titles.
 *
 * A name and a count tell somebody which mix this is and how much is in it, and
 * then they have to open it to find out whether it is the one they meant. Three
 * titles usually settle that without a press — the films are what a mix is
 * *for*, and reading three of them is how anybody recognises their own shelf.
 *
 * Titles only. No year, no mark, no link: this is a line to glance at, and
 * anything else on it would be the card growing back into the rows it stopped
 * being.
 *
 * `null` when the mix is empty, because there is nothing to glance at and a line
 * saying so would be an empty shelf described.
 *
 * ## Which three
 *
 * The ones most likely to be recognised: loved first, then liked, then
 * everything else — and inside each of those, the most recently saved first,
 * because a mix somebody is using is a mix they have just added to.
 *
 * A film saved before Tonight recorded creation times has no date, and no date
 * is not "old": it is unknown. So those come after the dated films of the same
 * standing rather than being treated as the oldest, and what settles the rest is
 * the handle, which makes the answer the same on every render and on every
 * machine.
 *
 * It orders a glance and nothing else. The dialog lists the mix in the order the
 * store holds it, membership is untouched, and no film is reordered anywhere a
 * count is taken.
 */
export function preview(films: readonly Written<Movie>[]): string | null {
  if (!films.length) return null;

  const titles = [...films]
    .sort(recognisable)
    .slice(0, 3)
    .map((film) => film.title);

  return films.length > titles.length ? `${titles.join(", ")}, and more` : titles.join(", ");
}

/** Loved, then liked, then whatever else somebody said or did not say. */
function standing(state: MovieState | null): number {
  return state === "loved" ? 0 : state === "liked" ? 1 : 2;
}

/** The handle, which is what makes two films with one date come out in one order. */
const handle = (film: Movie) => `${film.year} ${film.title}`;

function recognisable(one: Written<Movie>, two: Written<Movie>): number {
  if (standing(one.state) !== standing(two.state)) {
    return standing(one.state) - standing(two.state);
  }

  // Newest first, and a film with no date after every film that has one.
  if (one.createdAt !== two.createdAt) {
    if (one.createdAt === null) return 1;
    if (two.createdAt === null) return -1;
    return one.createdAt < two.createdAt ? 1 : -1;
  }

  return handle(one) < handle(two) ? -1 : handle(one) > handle(two) ? 1 : 0;
}
