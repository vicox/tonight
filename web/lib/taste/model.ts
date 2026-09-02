/**
 * What a taste model is, and every rule about one that does not need a database.
 *
 * Two objects and one relationship between them:
 *
 *     Genre   a reusable piece of what this person likes, in their own words
 *     Mix     one or more Genres, plus what the combination means to them
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
};

/** One user's whole explicit taste model, which is all Tonight knows about them. */
export type Taste = { genres: Genre[]; mixes: Mix[] };

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

// --- shape -----------------------------------------------------------------

/** A genre with its fields in the order the product documents them. */
export function orderGenre(genre: Genre): Genre {
  return { name: genre.name, instruction: genre.instruction };
}

/** The same for a mix: name, instruction, then the genres it is built from. */
export function orderMix(mix: Mix): Mix {
  return { name: mix.name, instruction: mix.instruction, genres: [...mix.genres] };
}

/** Alphabetically, ignoring case: the order a taste model reads best in. */
export function byName<T extends { name: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
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

export function nothingToUpdate(what: "genre" | "mix"): TasteError {
  return new TasteError(
    what === "genre"
      ? "nothing to update: pass a new name or a new instruction"
      : "nothing to update: pass a new name, a new instruction, or new genres",
  );
}
