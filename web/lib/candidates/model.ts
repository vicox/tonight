import { canonicalTitle, filmKey } from "../films/identity.ts";
import { effectivelySeen } from "../seen.ts";
import {
  checkImdbId,
  checkMovieTitle,
  checkYear,
  TasteError,
  type Movie,
  type Viewing,
} from "../taste/model.ts";
import type { Judgement, Standing, Told } from "../verdicts/model.ts";

/**
 * What Tonight holds about films an agent has already chosen, one film at a time.
 *
 * The reverse of a recommendation service, and the difference is the point. An
 * agent picks films with its own knowledge and tools; this answers, for each of
 * those films and no other, what the user's saved list and their standing
 * verdicts say about it. It never adds a film, drops one, ranks them or says
 * whether one should be offered: those are judgements about an evening, and they
 * belong to the skill. The one rule the store itself holds — a
 * `dont-want-to-see` film is never recommended — is reported as the fact it is.
 *
 * Like `lib/memory/model.ts`, a join across roots with no store of its own. The
 * roots arrive already resolved: `standing` is what the verdict model says stands
 * *now*, so a verdict that was withdrawn or replaced cannot reach this file.
 *
 * ## Why the answer has a third value for `seen`
 *
 * Because the misreading that matters is *"Tonight has nothing on this film, so
 * they have not seen it"*. A film Tonight was never told about is the ordinary
 * case — most films anybody recommends are — and saying nothing about watching
 * it is not saying they did not. So `seen` is `true` where something they said
 * means they watched it, `false` only where their own list says it is still to
 * see, and `null` everywhere else: not known, which is not `false`.
 *
 * ## Why matching is exact
 *
 * `filmKey` is the only thing in Tonight that decides whether two mentions are
 * one film, so it decides here as well: case and spacing aside, a title is
 * matched exactly, and the year always counts. `otherYears` and `imdbHeldBy` say
 * where Tonight might hold the film under another name, and stop there — merging
 * on either would be deciding which film somebody meant.
 */

/** The most films one check takes: a lead, its directions, and their replacements. */
export const MAX_CANDIDATES = 10;

/** One film as the agent asked about it, once checked. */
export type Asked = { title: string; year: number; imdbId?: string };

/** What Tonight holds about one asked film. Every field is always present. */
export type CandidateCheck = {
  asked: Asked;
  /**
   * `saved`: a Movie has this film's identity. `said-only`: no Movie, but a
   * verdict about it stands. `nothing`: neither.
   */
  status: "saved" | "said-only" | "nothing";
  /** The saved film as stored — its own spelling — or `null`. */
  movie: { title: string; year: number; imdbId: string | null; viewing: Viewing; vibes: string[] } | null;
  /** The verdict that stands now, or `null`. */
  verdict: { judgement: Judgement; because?: string; told: Told } | null;
  /** Watched (`true`), still to see by their own list (`false`), or not known (`null`). */
  seen: boolean | null;
  /** Saved as `dont-want-to-see`: never recommended. */
  neverRecommend: boolean;
  /** Other years in which Tonight holds a film of exactly this title, ascending. */
  otherYears: number[];
  /** The saved film that carries the IMDb id asked with, when it is a different film. */
  imdbHeldBy: { title: string; year: number } | null;
};

/**
 * The candidates, checked, or a refusal saying what is wrong with them.
 *
 * Reads nothing, so a caller can refuse before it opens a store. The schema in
 * front of this already holds the count, the year and the id's syntax; this
 * checks all of it again, the way the stores re-check every write, and adds the
 * two things a schema cannot see — a title that is only spaces, and one film
 * named twice.
 */
export function askedCandidates(
  raw: readonly { title: unknown; year: unknown; imdbId?: unknown }[],
): Asked[] {
  if (raw.length === 0) {
    throw new TasteError("name at least one film to check");
  }
  if (raw.length > MAX_CANDIDATES) {
    throw new TasteError(`a check takes at most ${MAX_CANDIDATES} films — ${raw.length} were sent`);
  }

  const asked = raw.map((one): Asked => {
    const title = checkMovieTitle(one.title);
    const year = checkYear(one.year);
    if (one.imdbId === undefined) return { title, year };
    // Null is how a write clears a stored id. A check has nothing to clear, and
    // `checkImdbId` would hand null straight back, so it is refused here.
    if (one.imdbId === null) {
      throw new TasteError("an IMDb id here is text, or left out — there is nothing to clear in a check");
    }
    return { title, year, imdbId: checkImdbId(one.imdbId)! };
  });

  const seenAt = new Map<string, Asked>();
  for (const one of asked) {
    const key = filmKey(one);
    const earlier = seenAt.get(key);
    if (earlier !== undefined) {
      throw new TasteError(
        `${earlier.title} (${earlier.year}) is in this check twice, as "${earlier.title}" and ` +
          `"${one.title}" — name each film once`,
      );
    }
    seenAt.set(key, one);
  }
  return asked;
}

/**
 * What Tonight holds about each asked film, in the order asked.
 *
 * Pure: the inputs are read and never changed, and the same inputs give the same
 * answer. Every lookup is by `filmKey`, `canonicalTitle` or an exact IMDb id.
 */
export function checkCandidates(
  asked: readonly Asked[],
  held: { movies: readonly Movie[]; standing: readonly Standing[] },
): CandidateCheck[] {
  const movies = new Map<string, Movie>();
  const byImdb = new Map<string, Movie>();
  const years = new Map<string, Set<number>>();
  const yearOf = (film: { title: string; year: number }) => {
    const title = canonicalTitle(film.title);
    const known = years.get(title) ?? new Set<number>();
    known.add(film.year);
    years.set(title, known);
  };

  for (const movie of held.movies) {
    movies.set(filmKey(movie), movie);
    if (movie.imdbId !== null) byImdb.set(movie.imdbId, movie);
    yearOf(movie);
  }
  const standing = new Map<string, Standing>();
  for (const one of held.standing) {
    standing.set(filmKey(one), one);
    yearOf(one);
  }

  return asked.map((one): CandidateCheck => {
    const key = filmKey(one);
    const movie = movies.get(key) ?? null;
    const said = standing.get(key) ?? null;
    const holder = one.imdbId === undefined ? undefined : byImdb.get(one.imdbId);

    // `lib/seen.ts` decides whether they watched it. What it cannot say is the
    // difference between "still to see" and "not known", and only their own
    // list can: `want-to-see` is the one answer that says a film is new to them.
    const watched = effectivelySeen(movie?.viewing ?? null, said);

    return {
      asked: { ...one },
      status: movie !== null ? "saved" : said !== null ? "said-only" : "nothing",
      movie:
        movie === null
          ? null
          : {
              title: movie.title,
              year: movie.year,
              imdbId: movie.imdbId,
              viewing: movie.viewing,
              vibes: [...movie.vibes],
            },
      verdict:
        said === null
          ? null
          : {
              judgement: said.judgement,
              ...(said.because === undefined ? {} : { because: said.because }),
              told: said.told,
            },
      seen: watched ? true : movie?.viewing === "want-to-see" ? false : null,
      neverRecommend: movie?.viewing === "dont-want-to-see",
      otherYears: [...(years.get(canonicalTitle(one.title)) ?? [])]
        .filter((year) => year !== one.year)
        .sort((a, b) => a - b),
      imdbHeldBy:
        holder === undefined || filmKey(holder) === key ? null : { title: holder.title, year: holder.year },
    };
  });
}
