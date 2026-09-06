import { isSqlState, UNIQUE_VIOLATION, type SqlDriver, type Transaction } from "../../db/driver.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import {
  byName,
  byTitle,
  checkImdbId,
  checkInstruction,
  checkMixGenres,
  checkMovieMixes,
  checkMovieTitle,
  checkName,
  checkMovieState,
  checkYear,
  genreExists,
  genreInUse,
  genreNotFound,
  mixExists,
  mixGenreMissing,
  mixNotFound,
  movieExists,
  movieImdbTaken,
  movieMixMissing,
  movieNotFound,
  normalise,
  nothingToUpdate,
  orderGenre,
  orderHandle,
  orderMix,
  orderMovie,
  TasteError,
  type Genre,
  type Mix,
  type Movie,
  type MovieState,
  type MovieHandle,
} from "../model.ts";
import type { MixDraft, GenreDraft, TasteStore } from "../store.ts";
import { TASTE_SCHEMA } from "./schema.ts";

export { TASTE_SCHEMA };

/**
 * The taste model in SQL, for one user.
 *
 * `user` is closed over, and every statement below names it. There is no code
 * path that reads a row without `user_id = $1`, and no method that takes a user
 * — which is what makes cross-tenant access a thing you would have to add rather
 * than a thing you have to remember not to do.
 *
 * Anything that changes more than one row runs in a transaction, and the ones
 * that matter lean on the schema instead of doing the work themselves: renaming
 * a genre is one `UPDATE` that writes one row and no references at all, and
 * deleting one is a `DELETE` that the database refuses while a mix still needs
 * it. See `schema.ts` for the two identities that make that possible.
 *
 * ## Ids live here and go no further
 *
 * A genre and a mix each have a uuid, and it is the thing every reference and
 * every mutation is addressed by. It is also invisible above this file: the
 * public `Genre` and `Mix` carry a name and no id, `TasteStore` takes names, and
 * the MCP tools and the website speak names. The private rows below carry both,
 * and `orderGenre`/`orderMix` rebuild the public shape field by field — so an id
 * cannot reach a caller by being forgotten about, only by somebody adding it on
 * purpose.
 *
 * Names are still what a caller says and still what Postgres resolves. The id is
 * what the answer is then addressed by.
 */
export function sqlTasteStore(driver: SqlDriver, user: AuthenticatedUser): TasteStore {
  const owner = user.id;

  return {
    async taste() {
      return driver.transaction(async (tx) => {
        // Three statements, one snapshot. Postgres' default READ COMMITTED takes a
        // fresh snapshot per statement, so a mix written between the genre read and
        // the mix read would come back naming a genre this answer does not contain
        // — a state the store is never actually in, reported as though it were.
        // REPEATABLE READ fixes the snapshot for the whole transaction. It is safe
        // to ask for here and nowhere else: this transaction only reads, so it can
        // never be aborted for a serialization failure.
        await tx.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        return {
          genres: (await readGenres(tx, owner)).map(orderGenre),
          mixes: await readMixes(tx, owner),
          movies: await readMovies(tx, owner),
        };
      });
    },

    async createGenre(draft) {
      const entry = validateGenre(draft);

      try {
        await driver.query(
          `INSERT INTO tonight_genres (user_id, name, instruction) VALUES ($1, $2, $3)`,
          [owner, entry.name, entry.instruction],
        );
      } catch (error) {
        // The unique index is the real arbiter of identity, so a collision —
        // including two creates racing — is caught here rather than by a read
        // beforehand that could go stale between looking and writing.
        if (isSqlState(error, UNIQUE_VIOLATION)) throw genreExists(entry.name);
        throw error;
      }
      return entry;
    },

    async updateGenre(name, changes) {
      if (Object.values(changes).every((value) => value === undefined)) {
        throw nothingToUpdate("genre");
      }

      return driver.transaction(async (tx) => {
        // Checked before anything is locked, because it decides what has to be:
        // a rename holds the row it would land on as well as the row it moves.
        const renamingTo = changes.name === undefined ? undefined : checkName(changes.name, "genre");

        // Located and locked. Reading first and updating after leaves a window in
        // which the genre is renamed or deleted by another request, and the update
        // then matches nothing while this one reports success. Holding the row
        // means the name it was found under is still its name when the update runs.
        const { source: current, destination } = await lockGenre(tx, owner, name, renamingTo);
        if (!current) throw genreNotFound(name);

        // The destination is held, so this answer cannot go stale before the
        // update. The unique index is still the final arbiter — this only makes
        // the ordinary case say "already exists" rather than depending on a
        // constraint error to do it.
        if (destination && destination.name !== current.name) throw genreExists(destination.name);

        // `undefined` is the only thing that means "leave it alone". Anything else
        // the caller sent — including null — goes to the domain to be judged, so a
        // value that is not a valid instruction cannot be read as an omission.
        const entry = validateGenre({
          name: renamingTo === undefined ? current.name : renamingTo,
          instruction:
            changes.instruction === undefined ? current.instruction : changes.instruction,
        });

        // One statement, one row. The reference table holds this genre's id and
        // not its name, so a rename is invisible to every mix built from it —
        // there is no cascade to run and nothing that could be caught halfway.
        let changed;
        try {
          changed = await tx.query(
            `UPDATE tonight_genres SET name = $3, instruction = $4, updated_at = now()
              WHERE user_id = $1 AND id = $2
             RETURNING name`,
            [owner, current.id, entry.name, entry.instruction],
          );
        } catch (error) {
          if (isSqlState(error, UNIQUE_VIOLATION)) throw genreExists(entry.name);
          throw error;
        }
        // Unreachable while the row above is held, and checked anyway: reporting a
        // change that touched nothing is the one outcome this must never produce.
        if (!changed.length) throw genreNotFound(name);
        return entry;
      });
    },

    async deleteGenre(name) {
      return driver.transaction(async (tx) => {
        const { source: entry } = await lockGenre(tx, owner, name);
        if (!entry) throw genreNotFound(name);

        // Asked before deleting so the refusal can name the mixes that are in the
        // way — "cannot delete Sci-Fi: Space Tension is built from it" is
        // actionable, and a foreign-key error is not. The answer stays current
        // because the row is held: writing a reference to a genre takes a lock on
        // that genre, which this one already has, so no mix can start depending on
        // it between the question and the delete.
        const blocking = await tx.query<{ mix: string }>(
          `SELECT DISTINCT m.name AS mix
             FROM tonight_mix_genres AS r
             JOIN tonight_mixes AS m ON m.user_id = r.user_id AND m.id = r.mix_id
            WHERE r.user_id = $1 AND r.genre_id = $2
            ORDER BY m.name`,
          [owner, entry.id],
        );
        if (blocking.length) {
          throw genreInUse(entry.name, blocking.map((row) => row.mix));
        }

        const removed = await tx.query(
          `DELETE FROM tonight_genres WHERE user_id = $1 AND id = $2 RETURNING name`,
          [owner, entry.id],
        );
        if (!removed.length) throw genreNotFound(name);
        return orderGenre(entry);
      });
    },

    async createMix(draft) {
      return driver.transaction(async (tx) => {
        const genres = await readGenres(tx, owner);
        const { mix: entry, references } = await validateMix(tx, draft, genres);
        await holdGenres(tx, owner, references, genres);

        // The id Postgres generated for this mix, taken from the statement that
        // made it. There is no second read to go stale, and nothing above this
        // line ever sees the value.
        let created;
        try {
          created = await tx.query<{ id: string }>(
            `INSERT INTO tonight_mixes (user_id, name, instruction) VALUES ($1, $2, $3)
             RETURNING id`,
            [owner, entry.name, entry.instruction],
          );
        } catch (error) {
          if (isSqlState(error, UNIQUE_VIOLATION)) throw mixExists(entry.name);
          throw error;
        }

        await writeMixGenres(tx, owner, created[0]!.id, references);
        return entry;
      });
    },

    async updateMix(name, changes) {
      if (Object.values(changes).every((value) => value === undefined)) {
        throw nothingToUpdate("mix");
      }

      return driver.transaction(async (tx) => {
        const renamingTo = changes.name === undefined ? undefined : checkName(changes.name, "mix");

        const { source: current, destination } = await lockMix(tx, owner, name, renamingTo);
        if (!current) throw mixNotFound(name);
        if (destination && destination.name !== current.name) throw mixExists(destination.name);

        const core = {
          name: renamingTo === undefined ? current.name : renamingTo,
          instruction:
            changes.instruction === undefined ? current.instruction : changes.instruction,
        };

        /**
         * Only a caller who named genres is changing them.
         *
         * Omitting the field means "leave the references alone", and leaving them
         * alone now means exactly that: the rows hold this mix's id and each
         * genre's id, and none of those can change under an update to the mix
         * itself. The earlier version rebuilt the list from the names it had just
         * read, which was wrong twice over — it rewrote rows that were already
         * correct, and a genre renamed by another transaction in between made the
         * whole update fail with "not one of your genres" over a reference the
         * caller had not touched and that was still perfectly valid.
         */
        let references: Reference[] | undefined;
        let entry: Mix;
        if (changes.genres === undefined) {
          entry = orderMix({
            ...validateMixCore(core),
            genres: current.genres,
            movies: current.movies,
          });
        } else {
          const genres = await readGenres(tx, owner);
          const validated = await validateMix(tx, { ...core, genres: changes.genres }, genres);
          // Changing which genres a mix is built from does not change which movies
          // are filed under it, so the answer keeps the ones it had.
          entry = orderMix({ ...validated.mix, movies: current.movies });
          references = validated.references;
          await holdGenres(tx, owner, references, genres);
        }

        let changed;
        try {
          changed = await tx.query(
            `UPDATE tonight_mixes SET name = $3, instruction = $4, updated_at = now()
              WHERE user_id = $1 AND id = $2
             RETURNING name`,
            [owner, current.id, entry.name, entry.instruction],
          );
        } catch (error) {
          if (isSqlState(error, UNIQUE_VIOLATION)) throw mixExists(entry.name);
          throw error;
        }
        if (!changed.length) throw mixNotFound(name);

        // Replaced rather than merged: passing `genres` says what the mix is
        // built from now, and the model refuses an empty list, so a mix can never
        // be left built from nothing. Addressed by the mix's id, which the rename
        // above did not touch.
        if (references) {
          await tx.query(`DELETE FROM tonight_mix_genres WHERE user_id = $1 AND mix_id = $2`, [
            owner,
            current.id,
          ]);
          await writeMixGenres(tx, owner, current.id, references);
        }
        return entry;
      });
    },

    /**
     * Creates a movie, and files it under the mixes it was given.
     *
     * The order matters and is the plan's: validate, resolve the mixes **without
     * locking**, insert the movie and take its id, *then* lock the mixes and check
     * each is still the one that was resolved. Movie side before mix side, which
     * is the rule every path here obeys so the two tables cannot form a cycle.
     *
     * Inserting before locking is safe because it is all one transaction: a mix
     * that has gone or been replaced refuses the write, and the movie inserted a
     * moment earlier goes with the rollback. There is no orphan to clean up.
     */
    async createMovie(draft) {
      return driver.transaction(async (tx) => {
        const entry = validateMovie(draft);

        const known = await readMixRows(tx, owner);
        const filings =
          draft.mixes === undefined
            ? []
            : await resolveMixes(tx, checkMovieMixes(draft.mixes), known);

        const created = await orExplain(
          tx,
          MOVIE_UNIQUENESS,
          () =>
            tx.query<{ id: string }>(
              `INSERT INTO tonight_movies (user_id, title, year, imdb_id, state)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id`,
              [owner, entry.title, entry.year, entry.imdbId, entry.state],
            ),
          () => movieConflict(tx, owner, entry),
        );

        await holdMixes(tx, owner, filings, known);
        await writeMixMovies(tx, owner, created[0]!.id, filings);

        return orderMovie({ ...entry, mixes: filingNames(filings) });
      });
    },

    async updateMovie(title, year, changes) {
      if (Object.values(changes).every((value) => value === undefined)) {
        throw nothingToUpdate("movie");
      }

      return driver.transaction(async (tx) => {
        // Both halves of the handle can move, and either alone is a move. Worked
        // out before anything is locked, because it decides what has to be.
        const renaming =
          changes.title === undefined && changes.year === undefined
            ? undefined
            : {
                title: changes.title === undefined ? title : checkMovieTitle(changes.title),
                year: changes.year === undefined ? year : checkYear(changes.year),
              };

        const here = { title: checkMovieTitle(title), year: checkYear(year) };
        const { source: current, destination } = await lockMovies(tx, owner, here, renaming);
        if (!current) throw movieNotFound(title, year);

        // By id, not by handle: a case-only retitle lands on the row it started
        // from, and that is not a conflict with itself.
        if (destination && destination.id !== current.id) {
          throw movieExists(destination.title, destination.year);
        }

        /**
         * What the row will say, field by field.
         *
         * Each half of the handle comes from the **stored row** unless the caller
         * changed it. The `title` and `year` arguments only *address* the movie,
         * and the title is matched ignoring case — so taking the new spelling
         * from the argument would let somebody who typed `dune` to reach it
         * silently rewrite a stored `DUNE` while changing only the year.
         */
        const entry = validateMovie({
          title: changes.title === undefined ? current.title : checkMovieTitle(changes.title),
          year: changes.year === undefined ? current.year : checkYear(changes.year),
          imdbId: changes.imdbId === undefined ? current.imdbId : changes.imdbId,
          state: changes.state === undefined ? current.state : changes.state,
        });

        /**
         * Only a caller who named mixes is changing the filing.
         *
         * Omitting the field means leave it alone, and here that means literally
         * nothing: no read of the current names, no resolution, no mix lock, no
         * delete and no reinsert. The rows hold this movie's id and each mix's,
         * and a retitle moves neither — so rebuilding them would rewrite rows
         * that are already right, and would fail outright if another transaction
         * renamed one of those mixes in between. That is the `updateMix` bug,
         * and it is not being repeated here.
         */
        let filings: Reference[] | undefined;
        if (changes.mixes !== undefined) {
          const known = await readMixRows(tx, owner);
          filings = await resolveMixes(tx, checkMovieMixes(changes.mixes), known);
          await holdMixes(tx, owner, filings, known);
        }

        const changed = await orExplain(
          tx,
          MOVIE_UNIQUENESS,
          () =>
            tx.query(
              `UPDATE tonight_movies
                  SET title = $3, year = $4, imdb_id = $5, state = $6
                WHERE user_id = $1 AND id = $2
               RETURNING id`,
              [owner, current.id, entry.title, entry.year, entry.imdbId, entry.state],
            ),
          () => movieConflict(tx, owner, entry, current.id),
        );
        if (!changed.length) throw movieNotFound(title, year);

        if (filings) {
          await tx.query(`DELETE FROM tonight_mix_movies WHERE user_id = $1 AND movie_id = $2`, [
            owner,
            current.id,
          ]);
          await writeMixMovies(tx, owner, current.id, filings);
        }

        return orderMovie({
          ...entry,
          mixes: filings ? filingNames(filings) : await filedUnder(tx, owner, current.id),
        });
      });
    },

    async deleteMovie(title, year) {
      return driver.transaction(async (tx) => {
        const { source: entry } = await lockMovies(tx, owner, {
          title: checkMovieTitle(title),
          year: checkYear(year),
        });
        if (!entry) throw movieNotFound(title, year);

        // What it was filed under, read before the rows cascade away, so the
        // answer describes the movie that existed a moment ago.
        const mixes = await filedUnder(tx, owner, entry.id);

        const removed = await tx.query(
          `DELETE FROM tonight_movies WHERE user_id = $1 AND id = $2 RETURNING id`,
          [owner, entry.id],
        );
        if (!removed.length) throw movieNotFound(title, year);

        return orderMovie({ ...entry, mixes });
      });
    },

    async deleteMix(name) {
      return driver.transaction(async (tx) => {
        const { source: entry } = await lockMix(tx, owner, name);
        if (!entry) throw mixNotFound(name);

        // The genre list goes with it — the reference rows cascade on delete — and
        // the genres themselves are untouched. Deleting a mix is never blocked:
        // nothing in this model is built from a mix.
        const removed = await tx.query(
          `DELETE FROM tonight_mixes WHERE user_id = $1 AND id = $2 RETURNING name`,
          [owner, entry.id],
        );
        if (!removed.length) throw mixNotFound(name);
        return orderMix(entry);
      });
    },
  };
}

// --- locating, and holding what is about to change -------------------------

/**
 * A row as the store holds it: the public object, plus the identity it is stored
 * under. Never returned — `orderGenre` and `orderMix` are what a caller sees, and
 * they rebuild from the public fields.
 */
type Stored<T> = T & { id: string };

/**
 * A genre a mix is about to be built from: the id the reference row will hold,
 * and the spelling a caller will be shown.
 *
 * Both halves travel together from the moment a name is resolved, so nothing
 * downstream has to look the genre up a second time — and a rename between the
 * two lookups cannot substitute a different genre under the name that was asked
 * for.
 */
type Reference = { id: string; name: string };

type NamedRow = Stored<{ name: string; instruction: string }>;

/** The two tables a name identifies a row in. Literals, never a caller's value. */
type Named = "tonight_genres" | "tonight_mixes";

/**
 * What the database considers each of these names to be — one key per name, in
 * the order they were given.
 *
 * The keys have to come from the database because the database is what decides
 * identity: the unique index is on `lower(name)`, so `lower(name)` is the name as
 * far as this product is concerned. Computing that here instead would be a second
 * implementation of Postgres' case folding, and the two do not agree. `İ` is the
 * example that shows it — Postgres folds it to `i`, JavaScript to `i` followed by
 * a combining dot — so a genre created under that name became unreachable by the
 * name it was created with.
 *
 * This is a lookup key and nothing else. Stored names keep the spelling the user
 * wrote, and no folding or normalisation of theirs is ever written back.
 */
async function fold(sql: Transaction, names: readonly string[]): Promise<string[]> {
  if (!names.length) return [];

  const rows = await sql.query<{ key: string }>(
    `SELECT lower(name) AS key
       FROM unnest($1::text[]) WITH ORDINALITY AS given(name, ordinality)
      ORDER BY ordinality`,
    [[...names]],
  );
  return rows.map((row) => row.key);
}

/**
 * The one order in which anything here takes more than one of these locks.
 *
 * Deduplicated and sorted, so two sessions asking for the same rows ask for them
 * in the same sequence and one waits rather than the two holding half each. The
 * sort is over keys the database produced, which is what makes two sessions that
 * spelled a name differently agree about where it comes.
 *
 * The comparison itself only has to be the same everywhere, not the same as
 * Postgres': it decides the sequence locks are taken in, never which rows match.
 * The default string sort is a fixed code-unit ordering with no locale in it,
 * which is exactly that.
 */
function inLockOrder(keys: readonly string[]): string[] {
  return [...new Set(keys)].sort();
}

/**
 * What a change addresses: the row to change, and — for a rename — the row whose
 * name it wants. Both are held for the rest of the transaction.
 *
 * The two are locked in one fixed order, sorted by the identity they are matched
 * on, and that is the whole reason this takes both at once. Locking the source
 * first and letting the rename collide on the unique index is correct but can
 * deadlock: two renames that cross — `A → B` while `B → A` — each hold the row
 * the other needs, and Postgres resolves that by aborting one with a deadlock
 * error rather than with the "already exists" this product means. Sorting the
 * names means every session takes them in the same order, so one waits instead,
 * and then sees an ordinary conflict.
 *
 * One statement per row rather than one `= ANY(...)`, because lock order within a
 * single statement is the planner's business and `ORDER BY` does not govern it.
 * Each statement locks at most one row: the unique index is on
 * `(user_id, lower(name))`, which is exactly what is matched here.
 */
async function lockNames(
  sql: Transaction,
  table: Named,
  owner: string,
  from: string,
  to: string | undefined,
): Promise<{ source?: NamedRow; destination?: NamedRow }> {
  const [fromKey, toKey] = await fold(
    sql,
    to === undefined ? [normalise(from)] : [normalise(from), normalise(to)],
  );

  const held = new Map<string, NamedRow>();
  for (const key of inLockOrder(toKey === undefined ? [fromKey] : [fromKey, toKey])) {
    const [row] = await sql.query<NamedRow>(
      `SELECT id, name, instruction FROM ${table}
        WHERE user_id = $1 AND lower(name) = $2
        FOR UPDATE`,
      [owner, key],
    );
    if (row) held.set(key, row);
  }

  return {
    source: held.get(fromKey),
    destination: toKey === undefined ? undefined : held.get(toKey),
  };
}

/**
 * One genre, held for the rest of the transaction, with the row a rename would
 * land on when there is one.
 */
async function lockGenre(
  sql: Transaction,
  owner: string,
  name: string,
  renamingTo?: string,
): Promise<{ source?: Stored<Genre>; destination?: Stored<Genre> }> {
  const { source, destination } = await lockNames(sql, "tonight_genres", owner, name, renamingTo);
  return {
    source: source && { ...orderGenre(source), id: source.id },
    destination: destination && { ...orderGenre(destination), id: destination.id },
  };
}

/** The same for a mix, with the genres it is currently built from. */
async function lockMix(
  sql: Transaction,
  owner: string,
  name: string,
  renamingTo?: string,
): Promise<{ source?: Stored<Mix>; destination?: Stored<Mix> }> {
  const { source, destination } = await lockNames(sql, "tonight_mixes", owner, name, renamingTo);
  const empty = (row: NamedRow): Stored<Mix> => ({
    ...orderMix({ ...row, genres: [], movies: [] }),
    id: row.id,
  });
  if (!source) return { destination: destination && empty(destination) };

  // Addressed by the mix's id and joined for the genres' names: the reference
  // rows hold ids, and what a caller is shown is the spelling each genre is
  // stored under.
  const references = await sql.query<{ genre: string }>(
    `SELECT g.name AS genre
       FROM tonight_mix_genres AS r
       JOIN tonight_genres AS g ON g.user_id = r.user_id AND g.id = r.genre_id
      WHERE r.user_id = $1 AND r.mix_id = $2
      ORDER BY r.position`,
    [owner, source.id],
  );
  // Its movies too, so what a delete or an update answers with is the mix as it
  // actually stood. Handles, because a title alone does not identify a film.
  const filed = await sql.query<{ title: string; year: number }>(
    `SELECT v.title, v.year
       FROM tonight_mix_movies AS r
       JOIN tonight_movies AS v ON v.user_id = r.user_id AND v.id = r.movie_id
      WHERE r.user_id = $1 AND r.mix_id = $2
      ORDER BY lower(v.title), v.year`,
    [owner, source.id],
  );

  return {
    source: {
      ...orderMix({
        name: source.name,
        instruction: source.instruction,
        genres: references.map((reference) => reference.genre),
        movies: filed.map(orderHandle),
      }),
      id: source.id,
    },
    destination: destination && empty(destination),
  };
}

/**
 * Holds the genres a mix is about to be built from, and refuses if one has gone.
 *
 * `FOR KEY SHARE` is the lock writing a reference row would take anyway, taken a
 * moment earlier and by name. Between validating a mix's genres and writing its
 * reference rows, another request can delete or rename one of them; without this
 * the insert fails on a foreign key and the caller gets a constraint name instead
 * of a sentence. Several mixes may hold the same genre at once — the lock is
 * shared — so this serialises nothing that was not already in conflict.
 *
 * One statement per genre, in `inLockOrder`, which is the same order a rename
 * takes its two rows in. A single `= ANY(...)` would leave the sequence to the
 * planner, and that is enough to deadlock against a rename: a mix locking `B`
 * then waiting for `A` while `A → B` holds `A` and waits for `B` is a cycle, and
 * Postgres breaks it by aborting one of them. Sharing the order removes the
 * cycle — whichever session reaches the first key waits, rather than each holding
 * half of what the other needs.
 *
 * `known` is what the transaction has already read, used only to phrase the
 * refusal in the same words a name that never existed would get.
 *
 * It confirms it locked the genre that was resolved, by id and not only by
 * name. A name is not stable: between resolving one and reaching here another
 * transaction can rename that genre away and rename a second one into the name
 * it left. Matching on the name alone would then hold the wrong row and build
 * the mix out of a genre nobody asked for. Comparing ids costs a column.
 */
async function holdGenres(
  sql: Transaction,
  owner: string,
  wanted: readonly Reference[],
  known: readonly Genre[],
): Promise<void> {
  if (!wanted.length) return;

  const keys = await fold(sql, wanted.map((reference) => reference.name));
  const held = new Map<string, string>();
  for (const key of inLockOrder(keys)) {
    const [row] = await sql.query<{ id: string }>(
      `SELECT id FROM tonight_genres
        WHERE user_id = $1 AND lower(name) = $2
        FOR KEY SHARE`,
      [owner, key],
    );
    if (row) held.set(key, row.id);
  }

  // Gone, or no longer the genre it was. Both are the same answer to a caller:
  // the genre they named is not there to build from.
  for (const [index, reference] of wanted.entries()) {
    if (held.get(keys[index]!) !== reference.id) {
      throw mixGenreMissing(reference.name, known.map((genre) => genre.name));
    }
  }
}

/**
 * The lock-ordering key for a movie handle.
 *
 * A movie is addressed by two things, so a key built from one of them would make
 * `Dune / 1984` and `Dune / 2021` contend as though they were the same row — and
 * would let a lock taken for one match the other. The folded title still comes
 * from Postgres; only the *composition* happens here, which is the same division
 * `inLockOrder` already relies on: the ordering has to agree between sessions,
 * never with Postgres.
 *
 * U+0000 separates the halves because it cannot occur in a title that survived
 * `checkMovieTitle`, so `("ab", 12)` and `("ab1", 2)` cannot produce one key.
 */
function movieKey(foldedTitle: string, year: number): string {
  return `${foldedTitle}\u0000${year}`;
}

type MovieRow = Stored<{
  title: string;
  year: number;
  imdbId: string | null;
  state: MovieState | null;
}>;

/**
 * The movie a change addresses, and — when the handle is changing — the one whose
 * handle it wants. Both held for the rest of the transaction.
 *
 * The composite twin of `lockNames`, and for the same reason: taking the source
 * and letting the unique index catch the collision is correct but deadlocks when
 * two handle changes cross. Sorting both keys means one session waits and then
 * sees an ordinary conflict.
 *
 * One statement per row. Lock order inside a single statement belongs to the
 * planner, and `ORDER BY` does not govern it.
 */
async function lockMovies(
  sql: Transaction,
  owner: string,
  from: MovieHandle,
  to?: MovieHandle,
): Promise<{ source?: MovieRow; destination?: MovieRow }> {
  const wanted = to === undefined ? [from] : [from, to];
  const folded = await fold(sql, wanted.map((handle) => handle.title));

  const byKey = new Map<string, { title: string; year: number }>();
  const keys = wanted.map((handle, index) => {
    const key = movieKey(folded[index]!, handle.year);
    byKey.set(key, { title: folded[index]!, year: handle.year });
    return key;
  });

  const held = new Map<string, MovieRow>();
  for (const key of inLockOrder(keys)) {
    const at = byKey.get(key)!;
    const [row] = await sql.query<{
      id: string;
      title: string;
      year: number;
      imdb_id: string | null;
      state: MovieState | null;
    }>(
      `SELECT id, title, year, imdb_id, state FROM tonight_movies
        WHERE user_id = $1 AND lower(title) = $2 AND year = $3
        FOR UPDATE`,
      [owner, at.title, at.year],
    );
    if (row) {
      held.set(key, {
        id: row.id,
        title: row.title,
        year: row.year,
        imdbId: row.imdb_id,
        state: row.state,
      });
    }
  }

  return {
    source: held.get(keys[0]!),
    destination: keys[1] === undefined ? undefined : held.get(keys[1]),
  };
}

/**
 * Matches the mix names a movie was filed under against the mixes that exist.
 *
 * The twin of `resolveGenres`: both sides folded by the database in one round
 * trip, duplicates collapsed on the database's key rather than the caller's
 * spelling, and what comes back is the **stored** name with the id beside it.
 */
async function resolveMixes(
  sql: Transaction,
  wanted: readonly string[],
  mixes: readonly Reference[],
): Promise<Reference[]> {
  if (!wanted.length) return [];

  const keys = await fold(sql, [...wanted, ...mixes.map((mix) => mix.name)]);
  const existing = new Map(keys.slice(wanted.length).map((key, index) => [key, mixes[index]!]));

  const resolved: Reference[] = [];
  const taken = new Set<string>();
  for (const [index, name] of wanted.entries()) {
    const key = keys[index]!;
    const mix = existing.get(key);
    if (!mix) throw movieMixMissing(name, mixes.map((one) => one.name));
    if (taken.has(key)) continue;
    taken.add(key);
    resolved.push({ id: mix.id, name: mix.name });
  }
  return resolved;
}

/**
 * Holds the mixes a movie is about to be filed under, and refuses if one has gone.
 *
 * `FOR KEY SHARE` in `inLockOrder`, which is deliberately the **same** order a mix
 * rename takes its rows in — a filing that locked mixes in a different sequence
 * would form exactly the cycle `holdGenres` was written to avoid.
 *
 * It compares ids, not only names. Between resolving a mix and reaching here
 * another transaction can rename that mix away and rename a second one into the
 * name it left; matching on the name alone would then file the movie under a mix
 * nobody asked for.
 */
async function holdMixes(
  sql: Transaction,
  owner: string,
  wanted: readonly Reference[],
  known: readonly Reference[],
): Promise<void> {
  if (!wanted.length) return;

  const keys = await fold(sql, wanted.map((reference) => reference.name));
  const held = new Map<string, string>();
  for (const key of inLockOrder(keys)) {
    const [row] = await sql.query<{ id: string }>(
      `SELECT id FROM tonight_mixes
        WHERE user_id = $1 AND lower(name) = $2
        FOR KEY SHARE`,
      [owner, key],
    );
    if (row) held.set(key, row.id);
  }

  for (const [index, reference] of wanted.entries()) {
    if (held.get(keys[index]!) !== reference.id) {
      throw movieMixMissing(reference.name, known.map((mix) => mix.name));
    }
  }
}

// --- reading ---------------------------------------------------------------

async function readGenres(sql: Transaction, owner: string): Promise<Stored<Genre>[]> {
  const rows = await sql.query<{ id: string; name: string; instruction: string }>(
    `SELECT id, name, instruction FROM tonight_genres WHERE user_id = $1`,
    [owner],
  );
  return byName(rows.map((row) => ({ ...orderGenre(row), id: row.id })));
}

/**
 * Every mix this user has, with its genre list filled in.
 *
 * Two queries rather than a join, because a join would repeat each mix once per
 * genre and the assembly is clearer than the de-duplication. Both are scoped by
 * `user_id`, which is the only scoping there is.
 */
async function readMixes(sql: Transaction, owner: string): Promise<Mix[]> {
  const rows = await sql.query<{ id: string; name: string; instruction: string }>(
    `SELECT id, name, instruction FROM tonight_mixes WHERE user_id = $1`,
    [owner],
  );
  // Grouped by the mix's id and joined for each genre's stored spelling. The ids
  // never leave this function; what is assembled from them is names.
  const references = await sql.query<{ mix_id: string; genre: string }>(
    `SELECT r.mix_id, g.name AS genre
       FROM tonight_mix_genres AS r
       JOIN tonight_genres AS g ON g.user_id = r.user_id AND g.id = r.genre_id
      WHERE r.user_id = $1
      ORDER BY r.mix_id, r.position`,
    [owner],
  );

  // The movies filed under each mix, as handles. A title alone could not tell one
  // Dune from the other, which is the whole reason the handle is a pair.
  const filed = await sql.query<{ mix_id: string; title: string; year: number }>(
    `SELECT r.mix_id, v.title, v.year
       FROM tonight_mix_movies AS r
       JOIN tonight_movies AS v ON v.user_id = r.user_id AND v.id = r.movie_id
      WHERE r.user_id = $1
      ORDER BY r.mix_id, lower(v.title), v.year`,
    [owner],
  );

  const mixes = rows.map((row) => ({
    id: row.id,
    name: row.name,
    instruction: row.instruction,
    genres: [] as string[],
    movies: [] as MovieHandle[],
  }));
  const byId = new Map(mixes.map((mix) => [mix.id, mix]));
  for (const row of references) byId.get(row.mix_id)?.genres.push(row.genre);
  for (const row of filed) {
    byId.get(row.mix_id)?.movies.push(orderHandle({ title: row.title, year: row.year }));
  }

  return byName(mixes).map(orderMix);
}

/** Every mix this user has, as `{id, name}` — enough to resolve a filing against. */
async function readMixRows(sql: Transaction, owner: string): Promise<Reference[]> {
  const rows = await sql.query<{ id: string; name: string }>(
    `SELECT id, name FROM tonight_mixes WHERE user_id = $1`,
    [owner],
  );
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

/**
 * Every movie this user has, with the mixes each is filed under.
 *
 * The canonical list: a movie appears here exactly once however many mixes name
 * it, so its state has one home and two copies cannot disagree. A movie in no mix
 * is here too, which is what keeps it reachable at all.
 */
async function readMovies(sql: Transaction, owner: string): Promise<Movie[]> {
  const rows = await sql.query<{
    id: string;
    title: string;
    year: number;
    imdb_id: string | null;
    state: MovieState | null;
  }>(
    `SELECT id, title, year, imdb_id, state FROM tonight_movies WHERE user_id = $1`,
    [owner],
  );

  const filed = await sql.query<{ movie_id: string; mix: string }>(
    `SELECT r.movie_id, m.name AS mix
       FROM tonight_mix_movies AS r
       JOIN tonight_mixes AS m ON m.user_id = r.user_id AND m.id = r.mix_id
      WHERE r.user_id = $1
      ORDER BY r.movie_id, lower(m.name)`,
    [owner],
  );

  const movies = rows.map((row) => ({
    id: row.id,
    title: row.title,
    year: row.year,
    imdbId: row.imdb_id,
    state: row.state,
    mixes: [] as string[],
  }));
  const byId = new Map(movies.map((movie) => [movie.id, movie]));
  for (const row of filed) byId.get(row.movie_id)?.mixes.push(row.mix);

  return byTitle(movies).map(orderMovie);
}

/**
 * Validates a complete movie.
 *
 * Every field goes through the domain, including the two the caller may have
 * left out — because "left out" was decided by the method above, which passes
 * what the row already held. By the time a value reaches here it is a value
 * somebody chose, `null` included.
 *
 * Uniqueness is not checked. The two unique indexes decide it, and asking first
 * would add a read that a concurrent write could invalidate before the insert.
 */
function validateMovie(draft: {
  title: unknown;
  year: unknown;
  imdbId?: unknown;
  state?: unknown;
}): Omit<Movie, "mixes"> {
  return {
    title: checkMovieTitle(draft.title),
    year: checkYear(draft.year),
    imdbId: draft.imdbId === undefined ? null : checkImdbId(draft.imdbId),
    state: draft.state === undefined ? null : checkMovieState(draft.state),
  };
}

/**
 * The two uniqueness rules a movie write is allowed to break, by the name
 * Postgres reports when one of them does.
 *
 * A closed list, because everything else on this table is an invariant rather
 * than a decision the caller could have made differently: `tonight_movies_pkey`
 * and `tonight_movies_id_key` guard the generated uuid, and a collision on
 * either is a fault in this code or in `gen_random_uuid`, not something to
 * explain to a user as "you already have that film".
 */
const MOVIE_UNIQUENESS = ["tonight_movies_identity", "tonight_movies_imdb_index"];

/**
 * Runs a write that two unique indexes guard, and turns a collision into the
 * product's own answer rather than a database one.
 *
 * The savepoint is what makes that possible. Working out *which* index was hit,
 * and which movie is in the way, takes a query — and Postgres refuses every
 * command in a transaction a failed statement has aborted, so without a
 * savepoint the explanation could never be fetched. Rolling back to one undoes
 * the failed write alone and leaves the transaction usable, with the row locks
 * taken before it still held.
 *
 * The alternative is to ask before writing, and that is the race the unique
 * indexes exist to close: between the question and the insert, another
 * transaction can take the handle.
 *
 * Only a collision on one of `known` is translated. A unique violation this did
 * not expect is a bug here, and dressing it up as a sentence about the user's
 * films would hide it behind an answer that sounds reasonable — so it is
 * rethrown exactly as it arrived, and the transaction rolls back with it.
 */
async function orExplain<T>(
  sql: Transaction,
  known: readonly string[],
  write: () => Promise<T>,
  explain: () => Promise<TasteError>,
): Promise<T> {
  await sql.exec(`SAVEPOINT unique_write`);
  try {
    const done = await write();
    await sql.exec(`RELEASE SAVEPOINT unique_write`);
    return done;
  } catch (error) {
    const constraint = (error as { constraint?: string } | null)?.constraint;
    if (!isSqlState(error, UNIQUE_VIOLATION) || !known.includes(constraint ?? "")) throw error;

    await sql.exec(`ROLLBACK TO SAVEPOINT unique_write`);
    throw await explain();
  }
}

/**
 * Which of the two unique indexes a write collided with, as a sentence.
 *
 * Postgres says only that something was unique; the caller needs to know whether
 * they already have this film, or whether the IMDb id they gave is on a different
 * one. The two have different fixes, so the refusal has to tell them apart —
 * which means asking, after the fact, which row is in the way.
 *
 * `except` is the row being updated, so a movie is never reported as conflicting
 * with itself.
 */
async function movieConflict(
  sql: Transaction,
  owner: string,
  entry: Omit<Movie, "mixes">,
  except?: string,
): Promise<TasteError> {
  if (entry.imdbId !== null) {
    const [holder] = await sql.query<{ title: string; year: number }>(
      `SELECT title, year FROM tonight_movies
        WHERE user_id = $1 AND imdb_id = $2 AND ($3::uuid IS NULL OR id <> $3)`,
      [owner, entry.imdbId, except ?? null],
    );
    if (holder) return movieImdbTaken(entry.imdbId, holder.title, holder.year);
  }
  return movieExists(entry.title, entry.year);
}

/**
 * The names of the mixes just written, in the order a later read will show them.
 *
 * A caller who files a movie under `["Zulu", "Alpha"]` and then reads the model
 * back would otherwise see the two lists disagree about order for no reason. The
 * database sorts by `lower(name)`; so does this.
 */
function filingNames(mixes: readonly Reference[]): string[] {
  return byName([...mixes]).map((mix) => mix.name);
}

/** The names of the mixes a movie is filed under, in reading order. */
async function filedUnder(sql: Transaction, owner: string, movieId: string): Promise<string[]> {
  const rows = await sql.query<{ mix: string }>(
    `SELECT m.name AS mix
       FROM tonight_mix_movies AS r
       JOIN tonight_mixes AS m ON m.user_id = r.user_id AND m.id = r.mix_id
      WHERE r.user_id = $1 AND r.movie_id = $2
      ORDER BY lower(m.name)`,
    [owner, movieId],
  );
  return rows.map((row) => row.mix);
}

/**
 * Writes a movie's filing rows, by id on both sides.
 *
 * No position column and none needed: a mix's genres are a composition the user
 * authored in an order, its movies are a set. They come back sorted by title.
 */
async function writeMixMovies(
  sql: Transaction,
  owner: string,
  movieId: string,
  mixes: readonly Reference[],
): Promise<void> {
  for (const mix of mixes) {
    await sql.query(
      `INSERT INTO tonight_mix_movies (user_id, mix_id, movie_id) VALUES ($1, $2, $3)`,
      [owner, mix.id, movieId],
    );
  }
}

// --- writing ---------------------------------------------------------------

/**
 * Validates a complete genre.
 *
 * Uniqueness is not checked here: the unique index decides it, and asking first
 * would only add a read that a concurrent create could invalidate before the
 * insert.
 *
 * An instruction is always required, on create and on update alike. There is no
 * wording this can supply on a caller's behalf — what a genre means is the one
 * thing the store cannot decide — so a genre arriving without one is refused and
 * says so.
 */
function validateGenre(draft: GenreDraft): Genre {
  return orderGenre({
    name: checkName(draft.name, "genre"),
    instruction: checkInstruction(draft.instruction, "genre"),
  });
}

/**
 * Validates a complete mix against the genres this user actually has.
 *
 * The rules that need only the value live in `model.ts`; the one here is the one
 * that needs to know what else exists — that every named genre is a genre of
 * theirs. A name that is not is refused rather than dropped, because a mix
 * quietly built from fewer genres than the user asked for is a mix that means
 * something other than what they said.
 */
async function validateMix(
  sql: Transaction,
  draft: MixDraft,
  genres: readonly Stored<Genre>[],
): Promise<{ mix: Mix; references: Reference[] }> {
  const references = await resolveGenres(sql, checkMixGenres(draft.genres), genres);
  return {
    mix: orderMix({
      ...validateMixCore(draft),
      genres: references.map((one) => one.name),
      // Creating a mix files no movies, and updating its genres does not change
      // which are filed under it — the caller supplies the real list.
      movies: [],
    }),
    references,
  };
}

/**
 * The parts of a mix that can be judged without knowing what else exists.
 *
 * Split out because an update that does not mention genres has nothing to
 * resolve: its references are already correct, and asking about them again is
 * what this fixes.
 */
function validateMixCore(draft: { name: unknown; instruction: unknown }): {
  name: string;
  instruction: string;
} {
  return {
    name: checkName(draft.name, "mix"),
    instruction: checkInstruction(draft.instruction, "mix"),
  };
}

/**
 * Matches the genre names a mix was given against the genres that exist.
 *
 * Both sides are folded by the database, because the database is what decides
 * whether two spellings are one genre: the unique index is on `lower(name)`, so a
 * user who has `İ` and asks for `i` is asking for the genre they have. Comparing
 * here instead meant a second opinion — JavaScript folds those two apart — and a
 * reference to a genre that plainly existed was refused.
 *
 * What comes back is the **stored** spelling of each match, never the caller's.
 * That is what makes the reference rows match the rows they point at, so the
 * foreign key holds and a rename cascades to them; and it is why no folded or
 * normalised form of a user's name is ever written anywhere.
 *
 * Duplicates collapse on the database's key rather than on the caller's spelling,
 * so asking for `İ` and `i` together is one reference and not two. First mention
 * wins the position: a mix's genres are a set, but the order they were given in
 * is what the page shows.
 */
async function resolveGenres(
  sql: Transaction,
  wanted: readonly string[],
  genres: readonly Stored<Genre>[],
): Promise<Reference[]> {
  // One round trip for both sides, so the two are folded by the same call and
  // cannot be folded by different rules.
  const keys = await fold(sql, [...wanted, ...genres.map((genre) => genre.name)]);
  const existing = new Map(keys.slice(wanted.length).map((key, index) => [key, genres[index]!]));

  const resolved: Reference[] = [];
  const taken = new Set<string>();
  for (const [index, name] of wanted.entries()) {
    const key = keys[index]!;
    const genre = existing.get(key);
    if (!genre) throw mixGenreMissing(name, genres.map((one) => one.name));
    if (taken.has(key)) continue;
    taken.add(key);
    resolved.push({ id: genre.id, name: genre.name });
  }
  return resolved;
}

/**
 * Writes a mix's genre rows, in the order they were given.
 *
 * By id on both sides. The mix's comes from the statement that created or located
 * it; each genre's comes from `holdGenres`, which is holding that row. Neither
 * name appears, which is what makes a later rename cost this table nothing.
 */
async function writeMixGenres(
  sql: Transaction,
  owner: string,
  mixId: string,
  references: readonly Reference[],
): Promise<void> {
  for (const [position, reference] of references.entries()) {
    await sql.query(
      `INSERT INTO tonight_mix_genres (user_id, mix_id, genre_id, position)
       VALUES ($1, $2, $3, $4)`,
      [owner, mixId, reference.id, position],
    );
  }
}
