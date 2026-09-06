/**
 * What a taste model is, and every rule about one that does not need a database.
 *
 * Three objects and two relationships between them:
 *
 *     Genre   a reusable piece of what this person likes, in their own words
 *     Mix     one or more Genres, plus what the combination means to them
 *     Movie   a film this person told us about, and what they said about it
 *
 * A Genre is not a row from a movie database. `Action` here is whatever this
 * user says Action is, and two users with a Genre of that name may mean opposite
 * things by it — one wants set pieces and stunts, the other wants a lone figure
 * and a long silence. The instruction is the genre; the name is only how it is
 * referred to.
 *
 * A Mix is not an intersection either. `Sci-Fi` and `Thriller` are its
 * ingredients, but `Space Tension` is a third thing the user decided about them,
 * and that decision lives in the Mix's own instruction. Nothing here computes a
 * Mix's meaning from its Genres, because a Mix's meaning is not derivable.
 *
 * Their names say so too, and the difference is a product decision rather than a
 * convention: a Genre is named for what it is — `Clever thriller` — and a Mix for
 * what it feels like — `Space Tension`, `Quiet Dread`. A Mix called
 * `Clever thriller, but light` is its own ingredient list read aloud. Nothing in
 * this file enforces that, because it is a judgement and not a rule a string can
 * be checked against; it is stated here because this is where the two objects are
 * defined, and the skill and the tool descriptions are where it is asked for.
 *
 * A Movie is not a catalogue entry. Nothing here is looked up, verified or
 * fetched: a title, a year and possibly an IMDb id arrive from the caller and are
 * stored as what the user said. Two users who both saw the same film have two
 * Movies, because what is kept is not the film.
 *
 * What they said about it is one field with five answers, and it is nullable
 * because "we were never told" is a different thing from any of them. Nothing in
 * this file may turn the absence of information into a statement — see
 * `checkMovieState`.
 *
 * This is the definition — what the objects are, what spellings are accepted,
 * and how one is rejected. Every way into the product goes through it: the MCP
 * tools, the website's own writes, the store. `store/` adds only the rules that
 * need to know what else exists.
 */

/**
 * The longest a name may be.
 *
 * Names are read as chips — `[SCI-FI] + [THRILLER]` — so a name that will not fit
 * on a chip is not a name, it is an instruction in the wrong field. Sixty
 * characters is far past any real genre and far short of a paragraph. The cap
 * exists because both writers here are generous: a language model asked for a
 * playful name, and a text box.
 */
export const MAX_NAME_LENGTH = 60;

/** And the longest an instruction may be: a paragraph or two, not an essay. */
export const MAX_INSTRUCTION_LENGTH = 2_000;

/**
 * The longest a film's title may be.
 *
 * `MAX_NAME_LENGTH` cannot be reused: *Dr. Strangelove or: How I Learned to Stop
 * Worrying and Love the Bomb* is 68 characters, so a genre-sized cap would refuse
 * real films. Two hundred clears every real title with room to spare and stays
 * far below anything the handle's expression index would notice.
 *
 * Counted in the unit `characters` names below, which is Postgres' unit and not
 * JavaScript's — see `characters`.
 */
export const MAX_TITLE_LENGTH = 200;

/** Long enough for any `tt` id, short enough that the column is not free text. */
export const MAX_IMDB_ID_LENGTH = 20;

/**
 * `tt` and at least seven digits.
 *
 * Open-ended above seven on purpose: IMDb has already passed seven digits and
 * will pass eight, and pinning the count would make Tonight refuse valid ids for
 * no reason. This is a syntax rule and nothing more — no request is made to IMDb,
 * so a well-formed id for a film that does not exist is accepted.
 */
export const IMDB_ID_PATTERN = /^tt[0-9]{7,}$/u;

/** The first motion picture, and a bound loose enough for an announced film. */
export const MIN_YEAR = 1878;
export const MAX_YEAR = 2200;

/** A genre, exactly as the store holds one and the MCP tools return it. */
export type Genre = {
  name: string;
  /** What this genre means to *this* user. Never empty. */
  instruction: string;
};

/** A mix: named genres, and what the user means by having combined them. */
export type Mix = {
  name: string;
  /** What the combination means. Not derived from the genres, and never empty. */
  instruction: string;
  /**
   * The genres this mix is built from, in the order they were given.
   *
   * Always at least one, always genres this user has, and never another mix:
   * there is no chaining, and the schema cannot express one.
   */
  genres: string[];
  /**
   * The movies in this mix, as handles.
   *
   * Handles rather than names, because a title alone cannot tell `Dune / 1984`
   * from `Dune / 2021`. The films themselves — with what the user said about
   * them — are in `Taste.movies`; this is the list of which ones belong here, and
   * it is changed from the movie's side with `update_movie`, never from the mix's.
   */
  movies: MovieHandle[];
};

/**
 * How a movie is referred to: the pair that addresses it.
 *
 * Not the title alone. A personal list runs into remakes almost immediately, and
 * the alternative — asking somebody to type `Dune (1984)` — would be the schema
 * leaking into the film's own name.
 */
export type MovieHandle = { title: string; year: number };

/**
 * What the user has said about a film, as one answer rather than several.
 *
 * The five are ordered as somebody moves through them — not seen, seen, and then
 * three ways of having an opinion — and they are exhaustive on purpose: an
 * evaluation implies having watched it, so there is no combination to keep
 * consistent and no pair of fields that can contradict each other.
 *
 * `seen` is deliberately non-evaluative. It is what somebody who watched a film
 * and said nothing about it has told you, and it is not a neutral verdict.
 */
export const MOVIE_STATES = ["not_seen", "seen", "liked", "loved", "disliked"] as const;

export type MovieState = (typeof MOVIE_STATES)[number];

/**
 * A film the user told us about.
 *
 * `state` is nullable and the null is the point: it means Tonight was never told,
 * which is not the same as `not_seen` — one is silence, the other is something
 * they said. Storing a movie is evidence of neither.
 */
export type Movie = {
  title: string;
  year: number;
  /** An outbound pointer, or nothing. Never verified, never fetched. */
  imdbId: string | null;
  /** What they said about it, or `null` when they have not said. */
  state: MovieState | null;
  /** The mixes it is in, by name. May be empty. */
  mixes: string[];
};

/** One user's whole explicit taste model, which is all Tonight knows about them. */
export type Taste = { genres: Genre[]; mixes: Mix[]; movies: Movie[] };

/**
 * Something the caller got wrong, phrased for them.
 *
 * Its own class so a store can tell a rejected genre from a database failure,
 * and so the MCP tools and the website's write endpoints can answer one as the
 * caller's problem and the other as ours. The messages are the ones the product
 * uses everywhere, so a client, a browser and a reader of the docs meet one
 * vocabulary of complaints rather than three.
 */
export class TasteError extends Error {
  override readonly name = "TasteError";
}

// --- identity --------------------------------------------------------------

/**
 * Trim the ends and collapse inner runs of whitespace to single spaces.
 *
 * Takes a string, and only a string. Coercing here — `String(value)` — is what
 * turns `{}` into `"[object Object]"` and `42` into `"42"`, so a malformed
 * request would be stored as a genre named after its own type error. Whether a
 * value is text at all is settled by `text` below, before anything is normalised.
 */
export function normalise(value: string): string {
  return value.split(/\s+/u).filter(Boolean).join(" ");
}

/** What a value is, for a message that has to say why it was not accepted. */
function kindOf(value: unknown): string {
  if (Array.isArray(value)) return "a list";
  if (value === null) return "null";
  switch (typeof value) {
    case "number":
      return "a number";
    case "boolean":
      return "a boolean";
    case "object":
      return "an object";
    default:
      return `a ${typeof value}`;
  }
}

/**
 * The value as text, or a refusal saying what arrived instead.
 *
 * The type gate for every semantic field. It runs before normalisation, because
 * normalising a non-string means coercing one, and a coerced value is
 * indistinguishable from something the user typed by the time it reaches a row.
 *
 * `absent` is the message for a field nobody mentioned, which is a different
 * mistake from one sent with the wrong type and reads better as its own sentence.
 * `wrong` is given what arrived so it can put it where the sentence needs it.
 */
function text(value: unknown, absent: string, wrong: (kind: string) => string): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) throw new TasteError(absent);
  throw new TasteError(wrong(kindOf(value)));
}

// --- the rules that need nothing but the value -----------------------------

/**
 * Checks a name, returning it normalised.
 *
 * `what` is the word the message uses — "genre" or "mix" — because the same rule
 * is being applied to two different things and a complaint that does not say
 * which is being complained about is half a message.
 */
export function checkName(value: unknown, what: "genre" | "mix"): string {
  const name = normalise(
    text(
      value,
      `a ${what} needs a name`,
      (kind) => `a ${what}'s name must be text, not ${kind}`,
    ),
  );

  if (!name) throw new TasteError(`a ${what} needs a name`);
  if (name.length > MAX_NAME_LENGTH) {
    throw new TasteError(
      `a ${what} name may be at most ${MAX_NAME_LENGTH} characters — ` +
        "put the detail in the instruction, which is where it belongs",
    );
  }
  return name;
}

/** Checks an instruction, which neither object may leave empty. */
export function checkInstruction(value: unknown, what: "genre" | "mix"): string {
  const missing =
    what === "genre"
      ? "a genre needs an instruction saying what it means to you — a name on its own " +
        "is a movie-database tag, not a taste"
      : "a mix needs an instruction saying what the combination means to you — the genres " +
        "are its ingredients, not its meaning";

  const instruction = text(
    value,
    missing,
    (kind) => `a ${what}'s instruction must be text, not ${kind}`,
  ).trim();

  if (!instruction) throw new TasteError(missing);
  if (instruction.length > MAX_INSTRUCTION_LENGTH) {
    throw new TasteError(
      `a ${what} instruction may be at most ${MAX_INSTRUCTION_LENGTH} characters`,
    );
  }
  return instruction;
}

/**
 * Reads the genre names a mix was given, normalised, deduplicated, in order.
 *
 * Only the shape is decided here. Whether each name is a genre this user has is
 * the store's question, because it is the only thing that knows.
 *
 * Shape only, and in particular **not** identity: two spellings of one genre are
 * both returned here, because whether they are one genre is the database's
 * decision and this function cannot reach it. The store folds and collapses them
 * while resolving them against the rows that exist.
 *
 * An empty entry or an entry that is not text does complain: both mean the caller
 * sent something it did not mean to, and skipping one would build a mix out of
 * fewer genres than they asked for without saying so. An empty list complains too
 * — a mix of nothing is not a mix.
 */
export function checkMixGenres(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (value === undefined || value === null) {
      throw new TasteError("a mix combines at least one genre — name the genres it is built from");
    }
    throw new TasteError(
      "a mix's genres must be a list of genre names, not " +
        (typeof value === "string" ? "a single name" : kindOf(value)),
    );
  }

  const wanted: string[] = [];
  for (const [index, entry] of value.entries()) {
    const name = normalise(
      text(
        entry,
        `a mix's genres must all be names, and entry ${index + 1} is empty`,
        (kind) => `a mix's genres must all be text, and entry ${index + 1} is ${kind}`,
      ),
    );
    if (!name) {
      throw new TasteError(`a mix's genres must all be names, and entry ${index + 1} is empty`);
    }
    wanted.push(name);
  }

  if (!wanted.length) {
    throw new TasteError(
      "a mix combines at least one genre — name the genres it is built from",
    );
  }
  return wanted;
}

/**
 * How long a value is, counted the way the database counts it.
 *
 * `String.length` counts UTF-16 code units, and Postgres' `length()` counts
 * characters. They agree until a title contains anything outside the basic plane
 * — an emoji is one character and two code units — and then they disagree by a
 * factor of two, which is enough to refuse a two-hundred-character title the
 * `CHECK` behind it would have accepted. Spreading a string iterates it by code
 * point, which is what Postgres is counting.
 *
 * Only the title needs this. It is the one value here with a length `CHECK`
 * underneath it, so it is the one place where two counts could disagree about
 * the same string.
 */
function characters(value: string): number {
  return [...value].length;
}

/**
 * Checks a film's title, returning it normalised.
 *
 * The normalised value is what gets **stored**, not merely what gets looked up.
 * A title kept raw beside a folded one would be two titles, and the one shown to
 * the user would eventually disagree with the one the handle matches on. So
 * `"  Dune  "` is stored as `"Dune"` and `"Dune   Part Two"` as `"Dune Part Two"`.
 *
 * Whitespace only. Casing and punctuation are the user's — `DUNE` stays `DUNE`
 * and `Dr. Strangelove or:` keeps every character. Whether two spellings are one
 * movie is Postgres' question, answered by `lower()` in the unique index, and
 * never JavaScript's: the two disagree about `İ`, and the store has the scars.
 */
export function checkMovieTitle(value: unknown): string {
  const title = normalise(
    text(value, "a movie needs a title", (kind) => `a movie's title must be text, not ${kind}`),
  );

  if (!title) throw new TasteError("a movie needs a title");
  if (characters(title) > MAX_TITLE_LENGTH) {
    throw new TasteError(`a movie title may be at most ${MAX_TITLE_LENGTH} characters`);
  }
  return title;
}

/**
 * Checks a release year, which a movie may not be without.
 *
 * Required because it is half the handle, not because a list would look tidier
 * with it: `Dune` addresses two films and `Dune / 1984` addresses one. The range
 * is wide on purpose — it is here to catch a typo, not to have an opinion about
 * which films exist.
 */
export function checkYear(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    if (value === undefined || value === null) {
      throw new TasteError(
        "a movie needs a release year — it is half of how a movie is named, " +
          "so that Dune 1984 and Dune 2021 are two films and not one",
      );
    }
    throw new TasteError(
      `a movie's year must be a whole number, not ${
        typeof value === "number" ? "a fraction" : kindOf(value)
      }`,
    );
  }

  if (value < MIN_YEAR || value > MAX_YEAR) {
    throw new TasteError(`a movie's year must be between ${MIN_YEAR} and ${MAX_YEAR}`);
  }
  return value;
}

/**
 * Checks an IMDb title id, or accepts that there is none.
 *
 * `null` is a real answer here and means "no pointer", which is why this returns
 * `string | null` rather than throwing on it. Whether the *caller* meant to clear
 * one or never mentioned it is settled before this is reached — an omitted field
 * never arrives here at all.
 *
 * **Blank is not a third way of clearing it.** `""` is a caller who built the
 * argument out of something empty, and reading it as "remove the id" would throw
 * away a stored pointer on the strength of a bug. There is one way to clear an
 * id and it is `null`, which nothing constructs by accident.
 *
 * Syntax only. Nothing asks IMDb whether the id names a film, so this refuses
 * `tt123` and accepts `tt9999999999` with equal confidence.
 */
export function checkImdbId(value: unknown): string | null {
  if (value === null) return null;

  const id = text(
    value,
    "an IMDb id must be text, or null to clear it",
    (kind) => `an IMDb id must be text, not ${kind}`,
  ).trim();

  if (!id) {
    throw new TasteError(
      "an IMDb id cannot be blank — pass null to clear the one that is stored, " +
        "or leave the field out to keep it",
    );
  }
  if (id.length > MAX_IMDB_ID_LENGTH || !IMDB_ID_PATTERN.test(id)) {
    throw new TasteError(
      `"${id}" is not an IMDb title id — they look like tt0111161: ` +
        "tt followed by at least seven digits. Tonight stores the id and never looks it up.",
    );
  }
  return id;
}

/**
 * Checks what the user said about a film.
 *
 * `null` is a value and not a refusal: it says Tonight has not been told. The one
 * thing this must never do is turn silence into `not_seen` — that would put a
 * statement in the user's mouth, which is the rule the whole taste model rests
 * on. An omitted field never reaches here; the store keeps what it had.
 */
export function checkMovieState(value: unknown): MovieState | null {
  if (value === null) return null;
  if (typeof value === "string" && (MOVIE_STATES as readonly string[]).includes(value)) {
    return value as MovieState;
  }

  throw new TasteError(
    `a movie's state must be one of ${MOVIE_STATES.join(", ")} — or null, meaning you were ` +
      `not told. Not ${typeof value === "string" ? `"${value}"` : kindOf(value)}.`,
  );
}

/**
 * Reads the mixes a movie is being put in.
 *
 * Unlike a mix's genres, an empty list is allowed and means something: a movie
 * belonging to no mix is ordinary, and passing `[]` is how a caller says "take it
 * out of all of them". Shape only — whether each name is a mix this user has is
 * the store's question.
 */
export function checkMovieMixes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new TasteError(
      "a movie's mixes must be a list of mix names, not " +
        (typeof value === "string" ? "a single name" : kindOf(value)),
    );
  }

  const wanted: string[] = [];
  for (const [index, entry] of value.entries()) {
    const name = normalise(
      text(
        entry,
        `a movie's mixes must all be names, and entry ${index + 1} is empty`,
        (kind) => `a movie's mixes must all be text, and entry ${index + 1} is ${kind}`,
      ),
    );
    if (!name) {
      throw new TasteError(`a movie's mixes must all be names, and entry ${index + 1} is empty`);
    }
    wanted.push(name);
  }
  return wanted;
}

// --- shape -----------------------------------------------------------------

/** A genre with its fields in the order the product documents them. */
export function orderGenre(genre: Genre): Genre {
  return { name: genre.name, instruction: genre.instruction };
}

/** The same for a mix: name, instruction, its genres, then its movies. */
export function orderMix(mix: Mix): Mix {
  return {
    name: mix.name,
    instruction: mix.instruction,
    genres: [...mix.genres],
    movies: mix.movies.map(orderHandle),
  };
}

/**
 * A movie with its fields in the order the product documents them.
 *
 * Rebuilt field by field, like `orderGenre` and `orderMix`, and for the same
 * reason: the store's own row carries a uuid, and building the public object by
 * naming its fields is what stops that uuid reaching a caller by being forgotten
 * about. Adding one would have to be deliberate.
 */
export function orderMovie(movie: Movie): Movie {
  return {
    title: movie.title,
    year: movie.year,
    imdbId: movie.imdbId,
    state: movie.state,
    mixes: [...movie.mixes],
  };
}

/** The pair that addresses a movie, and nothing else. */
export function orderHandle(handle: MovieHandle): MovieHandle {
  return { title: handle.title, year: handle.year };
}

/** Alphabetically, ignoring case: the order a taste model reads best in. */
export function byName<T extends { name: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
}

/**
 * The same for movies, by title and then year.
 *
 * Year breaks the tie rather than leaving it to the database, because two films
 * called `Dune` would otherwise come back in whatever order the rows happened to
 * be in — and a list that reorders itself between reads is a list somebody stops
 * trusting.
 */
export function byTitle<T extends MovieHandle>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.year - b.year,
  );
}

// --- messages the store needs ---------------------------------------------
//
// Built here rather than at the query, so every complaint the product makes is
// written in one place and worded the same way each time.

export function genreNotFound(name: string): TasteError {
  return new TasteError(`no genre "${normalise(name)}" (use get_taste to see them)`);
}

export function mixNotFound(name: string): TasteError {
  return new TasteError(`no mix "${normalise(name)}" (use get_taste to see them)`);
}

export function genreExists(existing: string): TasteError {
  return new TasteError(
    `a genre called "${existing}" already exists — genres are unique, ignoring case`,
  );
}

export function mixExists(existing: string): TasteError {
  return new TasteError(
    `a mix called "${existing}" already exists — mixes are unique, ignoring case`,
  );
}

/**
 * A mix naming something that is not one of this user's genres.
 *
 * The existing genres are listed because the usual cause is a near miss — a
 * plural, a hyphen, a genre the user has not created yet — and the list is the
 * shortest way to say which of those it was.
 */
export function mixGenreMissing(wanted: string, genres: readonly string[]): TasteError {
  return new TasteError(
    `a mix may only combine genres you have, and "${wanted}" is not one of them — ` +
      `your genres: ${genres.length ? genres.map((one) => `"${one}"`).join(", ") : "none yet"}. ` +
      "A mix cannot be built from another mix.",
  );
}

/** A genre a mix still depends on. Named, so the refusal says what to do next. */
export function genreInUse(genre: string, mixes: readonly string[]): TasteError {
  return new TasteError(
    `cannot delete genre "${genre}": ${mixes.length === 1 ? "the mix" : "the mixes"} ` +
      `${mixes.map((one) => `"${one}"`).join(", ")} ${mixes.length === 1 ? "is" : "are"} ` +
      "built from it — change or delete it first",
  );
}

export function nothingToUpdate(what: "genre" | "mix" | "movie"): TasteError {
  switch (what) {
    case "genre":
      return new TasteError("nothing to update: pass a new name or a new instruction");
    case "mix":
      return new TasteError(
        "nothing to update: pass a new name, a new instruction, or new genres",
      );
    default:
      return new TasteError(
        "nothing to update: pass a new title or year, an IMDb id, a state, or new mixes",
      );
  }
}

/** How a movie is named in a message: the whole handle, because half of one is ambiguous. */
function handleOf(title: string, year: number): string {
  return `"${normalise(title)}" (${year})`;
}

export function movieNotFound(title: string, year: number): TasteError {
  return new TasteError(`no movie ${handleOf(title, year)} (use get_taste to see them)`);
}

export function movieExists(title: string, year: number): TasteError {
  return new TasteError(
    `a movie ${handleOf(title, year)} already exists — a movie is named by its title and ` +
      "year together, ignoring case",
  );
}

/**
 * The same IMDb id on a second movie.
 *
 * Names the movie already holding it, because the usual cause is the same film
 * entered twice under two titles, and the fix is to edit that one rather than add
 * another.
 */
export function movieImdbTaken(imdbId: string, title: string, year: number): TasteError {
  return new TasteError(
    `${handleOf(title, year)} already has the IMDb id ${imdbId} — one id points at one of ` +
      "your movies. Update that movie, or leave this one without an id.",
  );
}

/** A movie put into something that is not one of this user's mixes. */
export function movieMixMissing(wanted: string, mixes: readonly string[]): TasteError {
  return new TasteError(
    `a movie can only go in mixes you have, and "${wanted}" is not one of them — ` +
      `your mixes: ${mixes.length ? mixes.map((one) => `"${one}"`).join(", ") : "none yet"}`,
  );
}
