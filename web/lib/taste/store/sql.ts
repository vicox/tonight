import { isSqlState, UNIQUE_VIOLATION, type SqlDriver, type Transaction } from "../../db/driver.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import {
  byName,
  checkInstruction,
  checkMixGenres,
  checkName,
  genreExists,
  genreInUse,
  genreNotFound,
  mixExists,
  mixGenreMissing,
  mixNotFound,
  normalise,
  nothingToUpdate,
  orderGenre,
  orderMix,
  type Genre,
  type Mix,
} from "../model.ts";
import type { GenreDraft, MixDraft, TasteStore } from "../store.ts";
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
          entry = orderMix({ ...validateMixCore(core), genres: current.genres });
        } else {
          const genres = await readGenres(tx, owner);
          const validated = await validateMix(tx, { ...core, genres: changes.genres }, genres);
          entry = validated.mix;
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
    ...orderMix({ ...row, genres: [] }),
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
  return {
    source: {
      ...orderMix({
        name: source.name,
        instruction: source.instruction,
        genres: references.map((reference) => reference.genre),
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

  const mixes = rows.map((row) => ({
    id: row.id,
    name: row.name,
    instruction: row.instruction,
    genres: [] as string[],
  }));
  const byId = new Map(mixes.map((mix) => [mix.id, mix]));
  for (const row of references) byId.get(row.mix_id)?.genres.push(row.genre);

  return byName(mixes).map(orderMix);
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
    mix: orderMix({ ...validateMixCore(draft), genres: references.map((one) => one.name) }),
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
