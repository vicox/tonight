import { filmKey } from "../films/identity.ts";
import type { Movie, Vibe, Viewing, Written } from "../taste/model.ts";
import type { Judgement } from "../verdicts/model.ts";
import { filmsIn } from "./vibes.ts";

/**
 * The Stream: every film once, in the order it arrived, and what its card says.
 *
 * One flat list. No section per vibe and none per status — a film the user does
 * not want to see is a card like any other, and so is one on their list or one
 * they loved. Which vibes a film is in is said on its card; it does not decide
 * where the card is.
 */

/**
 * Every film once, most recently saved first. A new array; the input is not touched.
 *
 * ## What "saved" is
 *
 * `createdAt`: the moment the film was first saved, set by the database when the
 * row was inserted and never changed after — a retitle, a viewing, a refiling or
 * a verdict leaves it where it was (see `tonight_written_at`, taste v6). So a
 * change of status never moves a card. `updatedAt` would: it moves on every one
 * of those, and would say "recently touched" rather than "recently saved".
 *
 * The value is an ISO string of fixed width, so comparing the strings compares
 * the instants.
 *
 * ## A film nobody dated
 *
 * A film saved before taste v6 has `createdAt: null`. Nobody wrote that moment
 * down, and unknown is neither old nor new, so it is not guessed: every undated
 * film comes after every dated one.
 *
 * ## Ties, and why the last one is `filmKey`
 *
 * Equal instants, and the undated films among themselves, go by title ignoring
 * case and then year — the order `byTitle` gives a list of films. That alone is
 * not total: `localeCompare` calls some distinct titles equal (`alien` and
 * `a​lien`), and the rows it would fall back on come from a query with no
 * `ORDER BY`. So what it leaves is settled by `filmKey`, compared unit by unit:
 * the canonical title and the year, which the store's unique index makes
 * different for every film one user has. The answer is then the same on every
 * render, whatever order the films arrived in.
 */
export function stream<T extends Written<Movie>>(movies: readonly T[]): T[] {
  return [...movies].sort(newestSaved);
}

function newestSaved(one: Written<Movie>, two: Written<Movie>): number {
  if (one.createdAt !== two.createdAt) {
    if (one.createdAt === null) return 1;
    if (two.createdAt === null) return -1;
    return one.createdAt < two.createdAt ? 1 : -1;
  }

  const byTitle =
    one.title.toLowerCase().localeCompare(two.title.toLowerCase()) || one.year - two.year;
  if (byTitle !== 0) return byTitle;

  const first = filmKey(one);
  const second = filmKey(two);
  return first < second ? -1 : first > second ? 1 : 0;
}

/** One thing a card's status can show: where the film stands, or what was said. */
export type StatusKey = Viewing | Judgement;

/**
 * What a card's status shows, in order. Never empty.
 *
 * The standing judgement when there is one, and where the film stands otherwise.
 * A judgement already means watched (`lib/seen.ts`), so `seen` beside it would
 * say the same thing twice, and `want-to-see` beside it is a contradiction that
 * `lib/seen.ts` already resolves as seen.
 *
 * `dont-want-to-see` is the exception, and is always shown: no judgement implies
 * it, and it is the one fact that keeps a film out of every recommendation.
 *
 * The film's own screen shows both facts separately and as they are stored; this
 * is the one-glance summary of them.
 */
export function statusOf(viewing: Viewing, judgement: Judgement | null): StatusKey[] {
  if (judgement === null) return [viewing];
  return viewing === "dont-want-to-see" ? [judgement, viewing] : [judgement];
}

/**
 * The vibes with no films in them, in the order given.
 *
 * Since vibes were anchored on a core film every new one has at least one, so
 * these are the older ones. The Stream reaches a vibe through its films, and a
 * vibe with none would otherwise be nowhere on the website.
 */
export function emptyVibes<T extends Vibe>(vibes: readonly T[], movies: readonly Movie[]): T[] {
  return vibes.filter((vibe) => filmsIn(vibe, movies).length === 0);
}
