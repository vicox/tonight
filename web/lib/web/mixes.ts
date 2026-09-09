import type { Mix, Movie, MovieState, Written } from "../taste/model.ts";
import { LIKED, LOVED, selected } from "./movie-summary.ts";

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

/**
 * Newest first, and no date at all behind every real one.
 *
 * A row saved before Tonight recorded creation times has `null` there, and that
 * is not "old": nobody wrote the moment down. Sorting it as the earliest would
 * be inventing the answer, so it waits behind everything that can say when it
 * arrived. Used for a film's date and for a mix's, which is why it is one
 * function rather than the same three lines twice.
 */
function newestFirst(one: string | null, two: string | null): number {
  if (one === two) return 0;
  if (one === null) return 1;
  if (two === null) return -1;
  return one < two ? 1 : -1;
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

  const byDate = newestFirst(one.createdAt, two.createdAt);
  if (byDate !== 0) return byDate;

  return handle(one) < handle(two) ? -1 : handle(one) > handle(two) ? 1 : 0;
}

/**
 * The mixes in the order the overview shows them: the liveliest first.
 *
 * A taste model accumulates mixes, and the section is a list somebody scans for
 * the one they want tonight. Alphabetical says nothing, and the order the store
 * happens to hold them in says only which was made first — so the ones with the
 * most in them that the user actually loves come first, and a mix nobody has put
 * anything in for months sinks.
 *
 * Five questions, asked in order and each one a tie-break of the last. No score:
 * loved and liked are separate rungs rather than terms in a sum, because a
 * weighting would be a claim about how many likes a love is worth, and there is
 * no such number. And nothing about `updatedAt`, which moves when a name is
 * corrected: a mix does not become livelier because its wording was fixed.
 *
 *   1. how many of its films are loved
 *   2. how many are liked
 *   3. how recently a film was added to it — any film, whatever was said about it
 *   4. how recently the mix itself was made
 *   5. its name, so that two identical mixes always come out the same way round
 *
 * Presentation only. It answers with a new array, the one it was given is left
 * alone, and nothing here is written down: the store's own order is untouched,
 * and so is the order of the films inside any card, preview or dialog.
 */
export function inOrder(
  mixes: readonly Written<Mix>[],
  movies: readonly Written<Movie>[],
): Written<Mix>[] {
  /** What the five questions are asked of, worked out once per mix. */
  const standings = mixes.map((mix) => {
    const films = filmsIn(mix, movies);
    return {
      mix,
      loved: selected(LOVED, films).length,
      liked: selected(LIKED, films).length,
      newestFilm: films.reduce<string | null>(
        (newest, film) => (newestFirst(film.createdAt, newest) < 0 ? film.createdAt : newest),
        null,
      ),
    };
  });

  return standings.sort(liveliest).map((standing) => standing.mix);
}

type Standing = { mix: Written<Mix>; loved: number; liked: number; newestFilm: string | null };

function liveliest(one: Standing, two: Standing): number {
  if (one.loved !== two.loved) return two.loved - one.loved;
  if (one.liked !== two.liked) return two.liked - one.liked;

  const byFilm = newestFirst(one.newestFilm, two.newestFilm);
  if (byFilm !== 0) return byFilm;

  const byMix = newestFirst(one.mix.createdAt, two.mix.createdAt);
  if (byMix !== 0) return byMix;

  return one.mix.name < two.mix.name ? -1 : one.mix.name > two.mix.name ? 1 : 0;
}
