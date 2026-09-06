import assert from "node:assert/strict";
import test, { after, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import { TasteError, type Genre, type Mix, type Movie } from "./model.ts";
import { TASTE_SCHEMA } from "./store/schema.ts";
import { sqlTasteStore } from "./store/sql.ts";
import type { TasteStore } from "./store.ts";

/**
 * One user's taste model, driven the way the MCP tools and the website drive it.
 *
 * The suite runs against the embedded Postgres always, and a real Postgres too
 * when `TEST_DATABASE_URL` is set: one run proves the statements are right, the
 * other proves they are right on a server with real connections and real row
 * locks.
 *
 * Two themes run through it. One is that a user's taste is theirs: every read is
 * scoped, and the store takes no argument that could say otherwise. The other is
 * reference integrity — a mix names genres, and neither renaming one nor deleting
 * one may leave a mix pointing at something that is not there.
 */

const ALICE = { id: "google:alice" };

/**
 * LATIN CAPITAL LETTER I WITH DOT ABOVE, the name Postgres and JavaScript fold
 * differently — `i` against `i` plus a combining dot. Written as an escape so it
 * survives every editor and diff between here and a reviewer.
 */
const DOTTED_I = "\u0130";
const BOB = { id: "google:bob" };

const drivers: { name: string; open: () => Promise<SqlDriver> }[] = [
  { name: "embedded postgres", open: () => embeddedDriver() },
];

if (process.env.TEST_DATABASE_URL) {
  drivers.push({
    name: "postgres",
    open: async () => {
      const { postgresDriver } = await import("../db/postgres.ts");
      return postgresDriver(process.env.TEST_DATABASE_URL!);
    },
  });
}

/**
 * One genre out of the whole model, by its stored name.
 *
 * Exact, deliberately. Whether two spellings are one genre is the database's
 * decision, and a test helper with an opinion of its own about that would be the
 * second identity rule these tests exist to catch. Case-insensitive lookup is
 * asserted through the store's own operations instead.
 */
async function genreOf(store: TasteStore, name: string): Promise<Genre | undefined> {
  return (await store.taste()).genres.find((one) => one.name === name);
}

/** The same for a mix. */
async function mixOf(store: TasteStore, name: string): Promise<Mix | undefined> {
  return (await store.taste()).mixes.find((one) => one.name === name);
}

/** The same for a movie, addressed the way the product addresses one. */
async function movieOf(store: TasteStore, title: string, year: number): Promise<Movie | undefined> {
  return (await store.taste()).movies.find((one) => one.title === title && one.year === year);
}

/** The message a rejected operation came back with, or "accepted". */
async function refusal(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return "accepted";
  } catch (error) {
    if (error instanceof TasteError) return error.message;
    throw error;
  }
}

for (const driver of drivers) {
  describe(driver.name, () => {
    const opened: SqlDriver[] = [];

    /** Two stores on one database, so isolation is tested rather than assumed. */
    async function fresh(): Promise<{ alice: TasteStore; bob: TasteStore; sql: SqlDriver }> {
      const sql = await driver.open();
      opened.push(sql);
      await migrate(sql, TASTE_SCHEMA);
      await sql.exec(
        `TRUNCATE tonight_mix_movies, tonight_mix_genres, tonight_movies, tonight_mixes, tonight_genres;`,
      );
      return { alice: sqlTasteStore(sql, ALICE), bob: sqlTasteStore(sql, BOB), sql };
    }

    /** When a row was last written, which a refused update must not move. */
    async function touchedAt(sql: SqlDriver, table: string, name: string): Promise<string> {
      const [row] = await sql.query<{ updated_at: Date }>(
        `SELECT updated_at FROM ${table} WHERE user_id = $1 AND name = $2`,
        [ALICE.id, name],
      );
      return row!.updated_at.toISOString();
    }

    after(async () => {
      for (const sql of opened) await sql.close().catch(() => {});
    });

    /** A genre, which most tests need one or two of. */
    const genre = (store: TasteStore, name: string) =>
      store.createGenre({ name, instruction: `what ${name} means to me` });

    /** A mix, with a genre of its own, since a mix cannot be built from nothing. */
    const mix = async (store: TasteStore, name: string) => {
      await genre(store, `${name} feeling`);
      return store.createMix({
        name,
        instruction: `what ${name} is for`,
        genres: [`${name} feeling`],
      });
    };

    // --- new users --------------------------------------------------------

    test("a new user starts with nothing, and is not seeded with examples", async () => {
      const { alice } = await fresh();

      assert.deepEqual(await alice.taste(), { genres: [], mixes: [], movies: [] });
    });

    // --- isolation --------------------------------------------------------

    test("two users can use the same genre name independently", async () => {
      const { alice, bob } = await fresh();

      await alice.createGenre({ name: "Action", instruction: "Alice's action." });
      await bob.createGenre({ name: "Action", instruction: "Bob's action." });

      assert.equal((await genreOf(alice, "Action"))?.instruction, "Alice's action.");
      assert.equal((await genreOf(bob, "Action"))?.instruction, "Bob's action.");
    });

    test("user A cannot see user B's taste", async () => {
      const { alice, bob } = await fresh();
      await genre(bob, "Bob only");
      await bob.createMix({ name: "Bob's mix", genres: ["Bob only"], instruction: "Bob's." });

      assert.deepEqual(await alice.taste(), { genres: [], mixes: [], movies: [] });
      // Asked through the operations that address one by name, which is where a
      // leak would actually show: neither can reach the other tenant's row.
      assert.match(await refusal(alice.deleteGenre("Bob only")), /^no genre "Bob only"/);
      assert.match(await refusal(alice.deleteMix("Bob's mix")), /^no mix "Bob's mix"/);
    });

    test("a mix cannot be built from another user's genre", async () => {
      const { alice, bob } = await fresh();
      await genre(bob, "Bob only");
      await genre(alice, "Sci-Fi");

      assert.match(
        await refusal(
          alice.createMix({ name: "Borrowed", genres: ["Sci-Fi", "Bob only"], instruction: "No." }),
        ),
        /"Bob only" is not one of them/,
      );
      assert.deepEqual((await alice.taste()).mixes, [], "and nothing was half-written");
    });

    // --- identity ---------------------------------------------------------

    test("genres are unique ignoring case, and found either way", async () => {
      const { alice } = await fresh();
      await alice.createGenre({ name: "Sci-Fi", instruction: "Ideas over spectacle." });

      assert.match(
        await refusal(alice.createGenre({ name: "sci-fi", instruction: "Again." })),
        /already exists/,
      );
      // Addressing it in another case finds the same row, and the stored spelling
      // is what comes back.
      assert.equal(
        (await alice.updateGenre("SCI-FI", { instruction: "Reworded." })).name,
        "Sci-Fi",
      );
    });

    test("mixes are unique ignoring case, separately from genres", async () => {
      const { alice } = await fresh();
      await genre(alice, "Noir");

      // A genre and a mix may share a name: they are separate namespaces, asked
      // for by separate parameters, so nothing can resolve one as the other.
      await alice.createMix({ name: "Noir", genres: ["Noir"], instruction: "My kind of noir." });
      assert.equal((await genreOf(alice, "Noir"))?.name, "Noir");
      assert.equal((await mixOf(alice, "Noir"))?.name, "Noir");

      assert.match(
        await refusal(alice.createMix({ name: "NOIR", genres: ["Noir"], instruction: "Again." })),
        /already exists/,
      );
    });

    test("surrounding space is trimmed and inner runs collapse", async () => {
      const { alice } = await fresh();
      await alice.createGenre({ name: "  Slow   burn ", instruction: "  Takes its time.  " });

      const [stored] = (await alice.taste()).genres;
      assert.equal(stored.name, "Slow burn");
      assert.equal(stored.instruction, "Takes its time.");
    });

    test("genres and mixes read back alphabetically, ignoring case", async () => {
      const { alice } = await fresh();
      for (const name of ["thriller", "Action", "sci-fi"]) await genre(alice, name);

      assert.deepEqual(
        (await alice.taste()).genres.map((one) => one.name),
        ["Action", "sci-fi", "thriller"],
      );
    });

    // --- instructions -----------------------------------------------------

    test("a genre always needs an instruction, and the store invents none", async () => {
      const { alice } = await fresh();

      // Even for a name everybody thinks they know. What `Action` means to this
      // person is the one thing the store cannot work out, so it refuses rather
      // than filling something in — the starting wording lives in the setup
      // skill, where the host agent can show it before anybody agrees to it.
      for (const name of ["Action", "Slow burn"]) {
        assert.match(await refusal(alice.createGenre({ name, instruction: "" })), /needs an instruction/);
      }
      assert.deepEqual((await alice.taste()).genres, []);
    });

    test("an update never refills an instruction the user cleared", async () => {
      const { alice } = await fresh();
      await alice.createGenre({ name: "Action", instruction: "Stunts over spectacle." });

      assert.match(await refusal(alice.updateGenre("Action", { instruction: "  " })), /instruction/);
      assert.equal((await genreOf(alice, "Action"))?.instruction, "Stunts over spectacle.");
    });

    test("a field that is not text is refused, never coerced into a value", async () => {
      const { alice } = await fresh();
      await genre(alice, "Sci-Fi");

      // The failure this prevents is silent: `String({})` is "[object Object]" and
      // `String(42)` is "42", so a malformed body would be stored as a genre named
      // after its own type error rather than refused.
      assert.match(
        await refusal(alice.createGenre({ name: 42, instruction: "Numbers." })),
        /name must be text, not a number/,
      );
      assert.match(
        await refusal(alice.createGenre({ name: "Odd", instruction: {} })),
        /instruction must be text, not an object/,
      );
      assert.match(
        await refusal(
          alice.createMix({ name: "Bad", instruction: "Mixed.", genres: ["Sci-Fi", 123] }),
        ),
        /genres must all be text, and entry 2 is a number/,
      );
      assert.match(
        await refusal(alice.createMix({ name: "Bad", instruction: "Mixed.", genres: "Sci-Fi" })),
        /must be a list of genre names, not a single name/,
      );

      // An entry that is text but says nothing is refused too: quietly dropping it
      // would build a mix from fewer genres than was asked for.
      assert.match(
        await refusal(
          alice.createMix({ name: "Bad", instruction: "Mixed.", genres: ["Sci-Fi", "  "] }),
        ),
        /entry 2 is empty/,
      );

      assert.deepEqual(await alice.taste(), {
        genres: [{ name: "Sci-Fi", instruction: "what Sci-Fi means to me" }],
        mixes: [],
        movies: [],
      });
    });

    test("only an omitted field means leave it alone: null is judged like any value", async () => {
      const { alice, sql } = await fresh();
      await genre(alice, "Sci-Fi");
      await genre(alice, "Thriller");
      await alice.createMix({
        name: "Space Tension",
        genres: ["Sci-Fi", "Thriller"],
        instruction: "Tense.",
      });

      const genreAt = await touchedAt(sql, "tonight_genres", "Sci-Fi");
      const mixAt = await touchedAt(sql, "tonight_mixes", "Space Tension");

      // `??` would read every one of these as "the caller said nothing", which is
      // the difference between refusing a malformed request and silently keeping
      // the old value while reporting success.
      assert.match(await refusal(alice.updateGenre("Sci-Fi", { name: null })), /needs a name/);
      assert.match(
        await refusal(alice.updateGenre("Sci-Fi", { instruction: null })),
        /needs an instruction/,
      );
      assert.match(await refusal(alice.updateMix("Space Tension", { name: null })), /needs a name/);
      assert.match(
        await refusal(alice.updateMix("Space Tension", { instruction: null })),
        /needs an instruction/,
      );
      assert.match(
        await refusal(alice.updateMix("Space Tension", { genres: null })),
        /at least one genre/,
      );
      // And a wrong type is refused by the same route as a wrong type anywhere.
      assert.match(
        await refusal(alice.updateGenre("Sci-Fi", { instruction: 7 })),
        /instruction must be text, not a number/,
      );

      // Nothing moved: not the values, not the genre list, not the timestamps.
      assert.deepEqual(await alice.taste(), {
        genres: [
          { name: "Sci-Fi", instruction: "what Sci-Fi means to me" },
          { name: "Thriller", instruction: "what Thriller means to me" },
        ],
        mixes: [
          {
            name: "Space Tension",
            instruction: "Tense.",
            genres: ["Sci-Fi", "Thriller"],
            movies: [],
          },
        ],
        movies: [],
      });
      assert.equal(await touchedAt(sql, "tonight_genres", "Sci-Fi"), genreAt);
      assert.equal(await touchedAt(sql, "tonight_mixes", "Space Tension"), mixAt);

      // A value that *is* valid still applies, so none of the above is a blanket
      // refusal to update.
      assert.equal(
        (await alice.updateGenre("Sci-Fi", { instruction: "Ideas." })).instruction,
        "Ideas.",
      );
    });

    test("renaming onto a name that is taken is a conflict, for a genre and a mix", async () => {
      const { alice } = await fresh();
      await genre(alice, "Sci-Fi");
      await genre(alice, "Thriller");
      await alice.createMix({ name: "One", genres: ["Sci-Fi"], instruction: "First." });
      await alice.createMix({ name: "Two", genres: ["Thriller"], instruction: "Second." });

      // Both rows are held before either is written, so the answer is the
      // product's conflict rather than whatever the unique index would have said.
      assert.match(await refusal(alice.updateGenre("Sci-Fi", { name: "thriller" })), /already exists/);
      assert.match(await refusal(alice.updateMix("One", { name: "TWO" })), /already exists/);

      // Changing a name's case is not a rename onto another row, and is allowed.
      assert.equal((await alice.updateGenre("Sci-Fi", { name: "SCI-FI" })).name, "SCI-FI");
    });

    test("a name the database folds differently from JavaScript stays reachable", async () => {
      const { alice, sql } = await fresh();

      // `İ` is the case where the two disagree: Postgres folds it to `i`, and
      // JavaScript to `i` followed by a combining dot. Identity here belongs to
      // the database, because the unique index is on `lower(name)` — so a lookup
      // key computed in JavaScript found nothing, and a genre became unreachable
      // by the name it was created under. Asserted rather than assumed:
      const [folding] = await sql.query<{ agree: boolean }>(
        "SELECT lower($1) = $2 AS agree",
        [DOTTED_I, DOTTED_I.toLowerCase()],
      );
      assert.equal(folding!.agree, false, "this test is only meaningful while they disagree");

      await alice.createGenre({ name: DOTTED_I, instruction: "Dotted capital I." });
      assert.equal(
        (await alice.updateGenre(DOTTED_I, { instruction: "Reworded." })).instruction,
        "Reworded.",
      );

      await alice.createMix({ name: `${DOTTED_I} mix`, genres: [DOTTED_I], instruction: "On it." });
      assert.equal(
        (await alice.updateMix(`${DOTTED_I} mix`, { instruction: "Rewritten." })).instruction,
        "Rewritten.",
      );

      // The reference held: the mix resolved the genre, and the genre cannot go
      // while the mix needs it.
      assert.match(await refusal(alice.deleteGenre(DOTTED_I)), /built from it/);

      // And the stored spelling is untouched by any of it — folding is a lookup
      // key, never something written back.
      assert.deepEqual((await alice.taste()).genres.map((one) => one.name), [DOTTED_I]);

      await alice.deleteMix(`${DOTTED_I} mix`);
      await alice.deleteGenre(DOTTED_I);
      assert.deepEqual(await alice.taste(), { genres: [], mixes: [], movies: [] });
    });

    test("a mix resolves its genres by the database's identity, not JavaScript's", async () => {
      const { alice, sql } = await fresh();
      await alice.createGenre({ name: DOTTED_I, instruction: "Dotted capital I." });

      // The premise, asked of the database rather than assumed: it considers these
      // two spellings one genre. JavaScript does not, which is what made a mix
      // reject a reference to a genre that plainly existed.
      const [folding] = await sql.query<{ same: boolean }>(
        "SELECT lower($1) = lower($2) AS same",
        [DOTTED_I, "i"],
      );
      assert.equal(folding!.same, true, "this test is only meaningful while they agree");

      // Asking for `i` reaches the genre stored as `İ`, and the reference is kept
      // under the stored spelling so the foreign key holds.
      const created = await alice.createMix({
        name: "Mix",
        genres: ["i"],
        instruction: "Built on it.",
      });
      assert.deepEqual(created.genres, [DOTTED_I]);

      // The same resolver serves updateMix, and spellings the database considers
      // one genre collapse to one reference rather than repeating it.
      const updated = await alice.updateMix("Mix", { genres: [DOTTED_I, "i", "I"] });
      assert.deepEqual(updated.genres, [DOTTED_I]);

      assert.deepEqual((await alice.taste()).mixes[0]!.genres, [DOTTED_I]);
      assert.deepEqual(
        (await alice.taste()).genres.map((one) => one.name),
        [DOTTED_I],
        "and nothing folded was written back over the stored name",
      );

      // The reference is real: the genre cannot be deleted while the mix needs it.
      assert.match(await refusal(alice.deleteGenre("i")), /built from it/);
    });

    test("conflict detection agrees with the database's own uniqueness", async () => {
      const { alice, sql } = await fresh();
      await alice.createGenre({ name: DOTTED_I, instruction: "Dotted capital I." });
      await genre(alice, "Other");

      // Whether two spellings are one name is the database's decision, and the
      // destination check has to reach the same one — otherwise it either refuses
      // a rename the index would have allowed, or waves one through for the index
      // to reject with a constraint error instead of a sentence.
      // Asked of the database, in the terms the unique index is built on: is some
      // *other* row already this name? Renaming a row onto its own name in
      // another case is not a conflict, which is why the source is excluded.
      const takenByAnother = async (spelling: string, source: string) => {
        const [row] = await sql.query<{ taken: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM tonight_genres
              WHERE user_id = $1 AND lower(name) = lower($2) AND name <> $3
           ) AS taken`,
          [ALICE.id, spelling, source],
        );
        return row!.taken;
      };

      let source = "Other";
      for (const spelling of [DOTTED_I, DOTTED_I.toLowerCase(), "OTHER", "Something else"]) {
        const expected = await takenByAnother(spelling, source);
        const outcome = await refusal(alice.updateGenre(source, { name: spelling }));

        assert.equal(
          outcome !== "accepted",
          expected,
          `renaming ${JSON.stringify(source)} onto ${JSON.stringify(spelling)}: ${outcome}`,
        );
        // A rename that went through moved the row, so the next spelling is
        // judged against where it now is.
        if (outcome === "accepted") source = spelling;
      }
    });

    test("an update that mentions nothing is refused rather than treated as a no-op", async () => {
      const { alice } = await fresh();
      await genre(alice, "Action");

      assert.match(await refusal(alice.updateGenre("Action", {})), /nothing to update/);
    });

    test("an update leaves what it does not mention alone", async () => {
      const { alice } = await fresh();
      await alice.createGenre({ name: "Horror", instruction: "Dread, not gore." });

      const renamed = await alice.updateGenre("Horror", { name: "Quiet horror" });
      assert.equal(renamed.instruction, "Dread, not gore.");
    });

    // --- what a mix is ----------------------------------------------------

    test("a mix must combine at least one genre", async () => {
      const { alice } = await fresh();
      await genre(alice, "Sci-Fi");

      assert.match(
        await refusal(alice.createMix({ name: "Nothing", genres: [], instruction: "Empty." })),
        /at least one genre/,
      );
    });

    test("a mix needs an instruction of its own", async () => {
      const { alice } = await fresh();
      await genre(alice, "Sci-Fi");

      // The genres are the ingredients; the instruction is the meaning. A mix
      // without one has not said anything its genres did not already say.
      assert.match(
        await refusal(alice.createMix({ name: "Bare", genres: ["Sci-Fi"], instruction: "" })),
        /what the combination means/,
      );
    });

    test("a mix cannot be built from another mix", async () => {
      const { alice } = await fresh();
      await genre(alice, "Sci-Fi");
      await genre(alice, "Thriller");
      await alice.createMix({
        name: "Space Tension",
        genres: ["Sci-Fi", "Thriller"],
        instruction: "Contained and tense.",
      });

      // There is no chaining. A mix's genre list can only ever name genres, and
      // the schema is what makes that true rather than a check here.
      assert.match(
        await refusal(
          alice.createMix({
            name: "Deeper",
            genres: ["Space Tension"],
            instruction: "A mix of a mix.",
          }),
        ),
        /"Space Tension" is not one of them/,
      );
    });

    test("a mix's genres keep their order, collapse duplicates and take the stored spelling", async () => {
      const { alice } = await fresh();
      await genre(alice, "Sci-Fi");
      await genre(alice, "Thriller");

      const mix = await alice.createMix({
        name: "Space Tension",
        genres: ["thriller", "SCI-FI", "Thriller"],
        instruction: "Tense.",
      });
      assert.deepEqual(mix.genres, ["Thriller", "Sci-Fi"]);
    });

    test("passing genres on an update replaces the list rather than adding to it", async () => {
      const { alice } = await fresh();
      for (const name of ["Sci-Fi", "Thriller", "Slow burn"]) await genre(alice, name);
      await alice.createMix({
        name: "Space Tension",
        genres: ["Sci-Fi", "Thriller"],
        instruction: "Tense.",
      });

      const updated = await alice.updateMix("Space Tension", { genres: ["Slow burn"] });
      assert.deepEqual(updated.genres, ["Slow burn"]);
    });

    test("an update that does not mention genres leaves the references alone", async () => {
      const { alice, sql } = await fresh();
      await genre(alice, "Sci-Fi");
      await genre(alice, "Thriller");
      await alice.createMix({
        name: "Space Tension",
        genres: ["Sci-Fi", "Thriller"],
        instruction: "Tense.",
      });

      // The rows as they stand: which genres, and the transaction that wrote
      // them. `xmin` is the part that matters — it is the only thing that can
      // tell "these rows are correct" apart from "these rows were rewritten to
      // the same values".
      const rows = async () =>
        await sql.query<{ genre_id: string; v: string }>(
          `SELECT genre_id, xmin::text AS v FROM tonight_mix_genres
            WHERE user_id = $1 ORDER BY position`,
          [ALICE.id],
        );

      const before = await rows();
      assert.equal(before.length, 2);

      await alice.updateMix("Space Tension", { instruction: "Tense, and contained." });
      assert.deepEqual(await rows(), before, "an instruction change rewrote the reference rows");

      await alice.updateMix("Space Tension", { name: "Quiet Dread" });
      assert.deepEqual(await rows(), before, "a rename rewrote the reference rows");

      // Untouched, and still saying the same thing.
      assert.deepEqual((await mixOf(alice, "Quiet Dread"))?.genres, ["Sci-Fi", "Thriller"]);

      // And the other half, so the assertions above cannot pass by the signal
      // being blind. Naming the *same* genres is the sharpest control available:
      // the relationship is identical afterwards, so the row count and the genre
      // ids must match exactly — and `xmin` must move anyway, because passing
      // `genres` replaces the rows whatever they said. A signal that held still
      // here would be one that could not have detected a rewrite above either.
      await alice.updateMix("Quiet Dread", { genres: ["Sci-Fi", "Thriller"] });
      const rewritten = await rows();

      assert.deepEqual(
        rewritten.map((row) => row.genre_id),
        before.map((row) => row.genre_id),
        "the same genres should still be the same relationships",
      );
      for (const [index, row] of rewritten.entries()) {
        assert.notEqual(
          row.v,
          before[index]!.v,
          `relationship ${index} kept its row version through an explicit replacement`,
        );
      }
    });

    // --- reference integrity ---------------------------------------------

    test("renaming a genre carries every mix built from it", async () => {
      const { alice } = await fresh();
      await genre(alice, "Sci-Fi");
      await genre(alice, "Thriller");
      for (const [name, genres] of [
        ["Space Tension", ["Sci-Fi", "Thriller"]],
        ["My Sci-Fi", ["Sci-Fi"]],
      ] as const) {
        await alice.createMix({ name, genres: [...genres], instruction: `${name} means this.` });
      }

      await alice.updateGenre("Sci-Fi", { name: "Science fiction" });

      // The reference rows hold the genre's id, so this rename wrote one row and
      // touched none of them. There is no moment in which a mix points at a name
      // that is gone, because no mix ever pointed at a name.
      const { genres, mixes } = await alice.taste();
      assert.deepEqual(genres.map((one) => one.name), ["Science fiction", "Thriller"]);
      assert.deepEqual(
        mixes.map((one) => one.genres),
        [["Science fiction"], ["Science fiction", "Thriller"]],
      );
    });

    test("renaming a genre keeps the object it was, not just the row", async () => {
      const { alice, sql } = await fresh();
      await genre(alice, "Sci-Fi");

      const idOf = async (name: string) =>
        (
          await sql.query<{ id: string }>(
            `SELECT id FROM tonight_genres WHERE user_id = $1 AND name = $2`,
            [ALICE.id, name],
          )
        )[0]?.id;

      const before = await idOf("Sci-Fi");
      await alice.updateGenre("Sci-Fi", { name: "Science fiction" });

      // A rename changes the handle. It must not produce a different object, or
      // anything that ever refers to one would be referring to the wrong thing.
      assert.equal(await idOf("Science fiction"), before);
    });

    test("renaming a genre does not write the rows that reference it", async () => {
      const { alice, sql } = await fresh();
      await genre(alice, "Sci-Fi");
      await alice.createMix({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense." });

      // `xmin` is the transaction that last wrote the row, so it is the one
      // signal that says a row was left alone. Comparing the ids would prove
      // nothing: they are what a rename leaves alone by construction.
      const versions = async () =>
        (
          await sql.query<{ v: string }>(
            `SELECT xmin::text AS v FROM tonight_mix_genres WHERE user_id = $1 ORDER BY position`,
            [ALICE.id],
          )
        ).map((row) => row.v);

      const before = await versions();
      assert.equal(before.length, 1, "the mix should have exactly one reference row");

      await alice.updateGenre("Sci-Fi", { name: "Science fiction" });

      // The property the whole migration exists for. Under the v1 schema this
      // would fail honestly: the foreign key carried ON UPDATE CASCADE, so a
      // rename rewrote every reference row.
      assert.deepEqual(await versions(), before, "the rename rewrote a reference row");
      assert.deepEqual((await mixOf(alice, "Space Tension"))?.genres, ["Science fiction"]);
    });

    test("the database refuses a mix of one user built from another user's genre", async () => {
      const { alice, bob, sql } = await fresh();
      await genre(bob, "Bob only");
      await genre(alice, "Sci-Fi");
      await alice.createMix({ name: "Mine", genres: ["Sci-Fi"], instruction: "Mine alone." });

      const [mix] = await sql.query<{ id: string }>(
        `SELECT id FROM tonight_mixes WHERE user_id = $1`,
        [ALICE.id],
      );
      const [theirs] = await sql.query<{ id: string }>(
        `SELECT id FROM tonight_genres WHERE user_id = $1`,
        [BOB.id],
      );

      // Deliberately not through the store: `createMix` takes names and resolves
      // them within one user, so it refuses this long before the database is
      // asked. That refusal is worth having and is tested elsewhere — it is not
      // evidence that the schema would refuse it too, and a single-column
      // foreign key would pass that test while allowing this row.
      const forged = sql.query(
        `INSERT INTO tonight_mix_genres (user_id, mix_id, genre_id, position)
         VALUES ($1, $2, $3, 0)`,
        [ALICE.id, mix!.id, theirs!.id],
      );

      await assert.rejects(forged, (error: unknown) => {
        // 23503 — foreign key violation. The composite key carries user_id, so
        // Alice's tenant has no such genre to point at.
        assert.equal((error as { code?: string }).code, "23503");
        return true;
      });
    });

    test("renaming onto a name that already exists is refused, and changes nothing", async () => {
      const { alice } = await fresh();
      await genre(alice, "Sci-Fi");
      await genre(alice, "Thriller");

      assert.match(await refusal(alice.updateGenre("Sci-Fi", { name: "thriller" })), /already exists/);
      assert.deepEqual(
        (await alice.taste()).genres.map((one) => one.name),
        ["Sci-Fi", "Thriller"],
      );
    });

    test("a genre a mix is built from cannot be deleted, and the refusal names the mix", async () => {
      const { alice } = await fresh();
      await genre(alice, "Sci-Fi");
      await genre(alice, "Thriller");
      await alice.createMix({
        name: "Space Tension",
        genres: ["Sci-Fi", "Thriller"],
        instruction: "Tense.",
      });

      const message = await refusal(alice.deleteGenre("Sci-Fi"));
      assert.match(message, /cannot delete genre "Sci-Fi"/);
      assert.match(message, /"Space Tension"/, "so the user knows what is in the way");
      assert.ok(await genreOf(alice, "Sci-Fi"), "and it is still there");
    });

    test("deleting the mix frees the genre", async () => {
      const { alice } = await fresh();
      await genre(alice, "Sci-Fi");
      await alice.createMix({ name: "My Sci-Fi", genres: ["Sci-Fi"], instruction: "Mine." });

      await alice.deleteMix("My Sci-Fi");
      await alice.deleteGenre("Sci-Fi");

      assert.deepEqual(await alice.taste(), { genres: [], mixes: [], movies: [] });
    });

    test("deleting a mix leaves the genres it was built from", async () => {
      const { alice } = await fresh();
      await genre(alice, "Sci-Fi");
      await genre(alice, "Thriller");
      await alice.createMix({
        name: "Space Tension",
        genres: ["Sci-Fi", "Thriller"],
        instruction: "Tense.",
      });

      await alice.deleteMix("Space Tension");

      const { genres, mixes } = await alice.taste();
      assert.deepEqual(genres.map((one) => one.name), ["Sci-Fi", "Thriller"]);
      assert.deepEqual(mixes, []);
    });

    test("the aggregate read takes one snapshot rather than one per statement", async () => {
      // What this cannot do here is prove the race: the embedded database serves
      // one connection, so there is no concurrent writer to interleave with, and a
      // harness that pretended otherwise would be testing itself. What it can do
      // is hold the mechanism — every statement under one snapshot — which is the
      // part that would be lost by an edit and is checked against a real Postgres
      // by the same suite whenever TEST_DATABASE_URL is set.
      const sql = await driver.open();
      opened.push(sql);
      await migrate(sql, TASTE_SCHEMA);

      const issued: string[] = [];
      const watched: SqlDriver = {
        ...sql,
        transaction: (work) =>
          sql.transaction((tx) =>
            work({
              query: (statement, params) => {
                issued.push(statement);
                return tx.query(statement, params);
              },
              exec: (script) => {
                issued.push(script);
                return tx.exec(script);
              },
            }),
          ),
      };

      await sqlTasteStore(watched, ALICE).taste();

      assert.match(issued[0] ?? "", /REPEATABLE READ/, "the snapshot is fixed first");
      assert.equal(
        issued.filter((statement) => /^\s*SELECT/.test(statement)).length,
        6,
        "genres, mixes, movies and the references between them, all inside it",
      );
    });

    test("renames and mix references take genre locks in one shared order", async () => {
      // What this can prove locally is the order: that both paths lock the same
      // rows in the same sequence, whatever order the caller listed them in. What
      // it cannot prove is that the sequence prevents a deadlock, because one
      // embedded database is one session and there is nothing to deadlock with.
      // That half is Postgres' lock semantics: a cycle needs two sessions holding
      // rows in opposite orders, and a shared total order is what removes it.
      const { alice, sql } = await fresh();
      for (const name of ["Sci-Fi", "Action", "Thriller"]) await genre(alice, name);

      /** The genre rows a piece of work locks, in the order it locks them. */
      const locking = async (work: (store: TasteStore) => Promise<unknown>) => {
        const taken: string[] = [];
        const watched: SqlDriver = {
          ...sql,
          transaction: (body) =>
            sql.transaction((tx) =>
              body({
                query: (statement, params) => {
                  if (/FROM tonight_genres[\s\S]*FOR (UPDATE|KEY SHARE)/.test(statement)) {
                    taken.push(String((params as unknown[])[1]));
                  }
                  return tx.query(statement, params);
                },
                exec: (script) => tx.exec(script),
              }),
            ),
        };
        await work(sqlTasteStore(watched, ALICE));
        return taken;
      };

      // A mix over the same three genres, listed two different ways round.
      const one = await locking((store) =>
        store.createMix({
          name: "One",
          genres: ["Thriller", "Action", "Sci-Fi"],
          instruction: "First.",
        }),
      );
      const other = await locking((store) =>
        store.createMix({
          name: "Two",
          genres: ["Sci-Fi", "Thriller", "Action"],
          instruction: "Second.",
        }),
      );

      assert.deepEqual(one, other, "the caller's ordering does not reach the locks");
      assert.deepEqual([...one].sort(), one, "and the order is the sorted one");

      // A rename touching two of those genres reaches for them the same way, so
      // the two kinds of work cannot take an overlapping pair in opposite orders.
      const renamed = await locking((store) =>
        store.updateGenre("Thriller", { name: "Action-ish" }),
      );
      assert.deepEqual([...renamed].sort(), renamed);
      assert.equal(new Set(renamed).size, renamed.length, "each row asked for once");
    });

    // --- movies -----------------------------------------------------------

    test("a movie is what the user said about it, and nothing more", async () => {
      const { alice } = await fresh();

      assert.deepEqual(await alice.createMovie({ title: "Arrival", year: 2016 }), {
        title: "Arrival",
        year: 2016,
        imdbId: null,
        state: null,
        mixes: [],
      });

      // The identity the row is keyed by never reaches a caller. Asserted as the
      // set of field names rather than by searching the text: "id" occurs inside
      // ordinary words, so a substring search over a model containing "I like
      // ideas over spectacle" would fail while nothing was wrong.
      const { movies } = await alice.taste();
      assert.deepEqual(Object.keys(movies[0]!).sort(), [
        "imdbId",
        "mixes",
        "state",
        "title",
        "year",
      ]);
    });

    test("the same title in two years is two movies; the same year is one", async () => {
      const { alice } = await fresh();
      await alice.createMovie({ title: "Dune", year: 1984 });
      await alice.createMovie({ title: "Dune", year: 2021 });

      assert.deepEqual(
        (await alice.taste()).movies.map((one) => [one.title, one.year]),
        [
          ["Dune", 1984],
          ["Dune", 2021],
        ],
      );

      // Half a handle is not a handle: the year is what tells the two apart, and
      // the pair is matched ignoring case exactly as a genre's name is.
      assert.match(await refusal(alice.createMovie({ title: "dune", year: 2021 })), /already exists/);
    });

    test("a movie title the database folds differently from JavaScript stays reachable", async () => {
      const { alice } = await fresh();
      const title = `${DOTTED_I}stanbul`;
      await alice.createMovie({ title, year: 2000 });

      // The same trap as for genres: fold this in JavaScript and the movie
      // becomes unreachable by the title it was created with.
      assert.match(await refusal(alice.createMovie({ title, year: 2000 })), /already exists/);
      assert.equal((await alice.updateMovie(title, 2000, { state: "seen" })).state, "seen");
      await alice.deleteMovie(title, 2000);
      assert.deepEqual((await alice.taste()).movies, []);
    });

    test("a movie needs a year, and an impossible one is refused", async () => {
      const { alice } = await fresh();

      assert.match(
        await refusal(alice.createMovie({ title: "Dune", year: undefined })),
        /needs a release year/,
      );
      assert.match(
        await refusal(alice.createMovie({ title: "Dune", year: "2021" })),
        /whole number, not a string/,
      );
      assert.match(
        await refusal(alice.createMovie({ title: "Dune", year: 2021.5 })),
        /whole number, not a fraction/,
      );
      for (const year of [1500, 9999]) {
        assert.match(
          await refusal(alice.createMovie({ title: "Dune", year })),
          /between 1878 and 2200/,
        );
      }
    });

    test("the database refuses a movie the application would never write", async () => {
      const { sql } = await fresh();

      // The domain refuses each of these first, and that refusal is the one a
      // user sees. These are here because the column constraints are the floor
      // under it: a future path that skipped the domain would still not be able
      // to put a yearless, untitled or oversized row in the table.
      const forged: [string, unknown[]][] = [
        ["a year outside any plausible film", [ALICE.id, "Forged", 1200, null]],
        ["a title that is only whitespace", [ALICE.id, "   ", 2024, null]],
        ["a title past the length limit", [ALICE.id, "D".repeat(201), 2024, null]],
        ["an IMDb id that is not one", [ALICE.id, "Forged", 2024, "tt42"]],
      ];

      for (const [what, params] of forged) {
        await assert.rejects(
          sql.query(
            `INSERT INTO tonight_movies (user_id, title, year, imdb_id) VALUES ($1, $2, $3, $4)`,
            params,
          ),
          (error: unknown) => {
            // 23514 — check violation. Not 23505: nothing here is a duplicate.
            assert.equal((error as { code?: string }).code, "23514", what);
            return true;
          },
          what,
        );
      }
    });

    test("changing the handle leaves the object it was, and its filings untouched", async () => {
      const { alice, sql } = await fresh();
      await mix(alice, "Space Tension");
      await alice.createMovie({ title: "Dune", year: 1984, mixes: ["Space Tension"] });

      const identity = async () =>
        (
          await sql.query<{ id: string }>(`SELECT id FROM tonight_movies WHERE user_id = $1`, [
            ALICE.id,
          ])
        )[0]!.id;

      // `xmin` is the transaction that last wrote the row, and the only signal
      // that says a row was left alone. Comparing ids would prove nothing: they
      // are what a retitle leaves alone by construction.
      const filings = async () =>
        await sql.query<{ movie_id: string; v: string }>(
          `SELECT movie_id, xmin::text AS v FROM tonight_mix_movies WHERE user_id = $1`,
          [ALICE.id],
        );

      const was = await identity();
      const before = await filings();
      assert.equal(before.length, 1, "the movie should be filed under exactly one mix");

      await alice.updateMovie("Dune", 1984, { year: 2021 });
      assert.equal(await identity(), was, "changing the year made a different movie");
      assert.deepEqual(await filings(), before, "changing the year rewrote a filing row");

      await alice.updateMovie("Dune", 2021, { title: "Dune: Part One" });
      assert.equal(await identity(), was, "retitling made a different movie");
      assert.deepEqual(await filings(), before, "retitling rewrote a filing row");

      await alice.updateMovie("Dune: Part One", 2021, { state: "seen" });
      assert.deepEqual(await filings(), before, "a state change rewrote a filing row");

      assert.deepEqual((await movieOf(alice, "Dune: Part One", 2021))?.mixes, ["Space Tension"]);

      // The other half, so none of the above can pass by the signal being blind.
      // Naming the same mix again is the sharpest control there is: the filing is
      // identical afterwards, so the movie id must match — and `xmin` must move
      // anyway, because passing `mixes` replaces the rows whatever they said.
      await alice.updateMovie("Dune: Part One", 2021, { mixes: ["Space Tension"] });
      const rewritten = await filings();
      assert.deepEqual(
        rewritten.map((row) => row.movie_id),
        before.map((row) => row.movie_id),
        "the same mix should still be the same filing",
      );
      assert.notEqual(
        rewritten[0]!.v,
        before[0]!.v,
        "the filing kept its row version through an explicit replacement",
      );
    });

    test("an IMDb id is syntax the store keeps, never a lookup it performs", async () => {
      const { alice, bob } = await fresh();

      assert.equal((await alice.createMovie({ title: "Arrival", year: 2016 })).imdbId, null);

      // Seven digits is the shape everyone remembers; IMDb has been issuing more
      // for years, and refusing those would be an opinion about a catalogue this
      // product does not have.
      const long = await alice.createMovie({ title: "Recent", year: 2024, imdbId: "tt9999999999" });
      assert.equal(long.imdbId, "tt9999999999");

      for (const bad of ["tt123", "0111161", "tt0111161x", 7, `tt${"1".repeat(19)}`]) {
        assert.match(
          await refusal(alice.createMovie({ title: "Wrong", year: 2000, imdbId: bad })),
          /IMDb/,
        );
      }

      await alice.createMovie({ title: "Shawshank", year: 1994, imdbId: "tt0111161" });
      assert.match(
        await refusal(
          alice.createMovie({ title: "The Shawshank Redemption", year: 1994, imdbId: "tt0111161" }),
        ),
        /"Shawshank" \(1994\) already has the IMDb id tt0111161/,
      );

      // The same on an update, and the same wording: it is the same collision.
      assert.match(
        await refusal(alice.updateMovie("Arrival", 2016, { imdbId: "tt0111161" })),
        /"Shawshank" \(1994\) already has the IMDb id tt0111161/,
      );

      // A movie is never reported as conflicting with itself.
      assert.equal(
        (await alice.updateMovie("Shawshank", 1994, { imdbId: "tt0111161" })).imdbId,
        "tt0111161",
      );

      // Nor is the other index confused for this one: moving a movie onto a
      // handle somebody else already occupies is the handle's refusal.
      assert.match(
        await refusal(alice.updateMovie("Arrival", 2016, { title: "Shawshank", year: 1994 })),
        /already exists/,
      );

      // One id points at one of *your* movies. Two people can each have the film.
      assert.equal(
        (await bob.createMovie({ title: "Shawshank", year: 1994, imdbId: "tt0111161" })).imdbId,
        "tt0111161",
      );
    });

    test("an IMDb id is cleared when the caller says null, and never by omission", async () => {
      const { alice } = await fresh();
      await alice.createMovie({ title: "Shawshank", year: 1994, imdbId: "tt0111161" });

      const kept = await alice.updateMovie("Shawshank", 1994, { state: "seen" });
      assert.equal(kept.imdbId, "tt0111161", "an update that did not mention the id dropped it");

      assert.equal((await alice.updateMovie("Shawshank", 1994, { imdbId: null })).imdbId, null);
    });

    test("a blank IMDb id is a mistake rather than a third way of clearing one", async () => {
      const { alice } = await fresh();
      await alice.createMovie({ title: "Shawshank", year: 1994, imdbId: "tt0111161" });

      // An argument built out of something empty is a bug in the caller, and
      // reading it as "remove the id" would throw a stored pointer away on the
      // strength of one.
      for (const blank of ["", "   ", "\t\n"]) {
        assert.match(
          await refusal(alice.updateMovie("Shawshank", 1994, { imdbId: blank })),
          /cannot be blank/,
          JSON.stringify(blank),
        );
      }

      // And the refusal wrote nothing: the id that was there is still there.
      assert.equal((await movieOf(alice, "Shawshank", 1994))?.imdbId, "tt0111161");

      assert.match(
        await refusal(alice.createMovie({ title: "Arrival", year: 2016, imdbId: "" })),
        /cannot be blank/,
      );
      assert.deepEqual((await alice.taste()).movies.length, 1, "the refused create left a movie");
    });

    test("one state holds five answers, and silence is a sixth it never invents", async () => {
      const { alice } = await fresh();

      const created = await alice.createMovie({ title: "Arrival", year: 2016 });
      assert.equal(created.state, null, "saving a movie put a statement in the user's mouth");

      // Every one of the five persists and reads back as itself. `seen` is in
      // there twice over: it is a real answer, and it is not the absence of one.
      for (const state of ["not_seen", "seen", "liked", "loved", "disliked"] as const) {
        assert.equal((await alice.updateMovie("Arrival", 2016, { state })).state, state);
        assert.equal((await movieOf(alice, "Arrival", 2016))?.state, state);
      }

      // Cleared from any of them, and clearing is not the same as `not_seen`.
      for (const from of ["not_seen", "seen", "disliked"] as const) {
        await alice.updateMovie("Arrival", 2016, { state: from });
        const cleared = await alice.updateMovie("Arrival", 2016, { state: null });
        assert.equal(cleared.state, null, `${from} could not be cleared`);
      }

      // Omitted is not a value either — an unrelated change leaves it standing.
      await alice.updateMovie("Arrival", 2016, { state: "loved" });
      const untouched = await alice.updateMovie("Arrival", 2016, { imdbId: "tt0000001" });
      assert.equal(untouched.state, "loved", "an unrelated update rewrote the state");

      for (const wrong of ["yes", "neutral", "watched", true, 1, {}]) {
        assert.match(
          await refusal(alice.updateMovie("Arrival", 2016, { state: wrong })),
          /must be one of not_seen, seen, liked, loved, disliked/,
          JSON.stringify(wrong),
        );
      }
      assert.equal((await movieOf(alice, "Arrival", 2016))?.state, "loved", "a refusal wrote");
    });

    test("nothing infers a state: not saving a movie, not filing one", async () => {
      const { alice, sql } = await fresh();
      await mix(alice, "Space Tension");

      const created = await alice.createMovie({ title: "Arrival", year: 2016 });
      assert.equal(created.state, null);

      await alice.updateMovie("Arrival", 2016, { mixes: ["Space Tension"] });
      const filed = await movieOf(alice, "Arrival", 2016);
      assert.equal(filed?.state, null, "filing a movie decided something about it");

      // And the columns themselves are null rather than false. A `DEFAULT false`
      // in the schema would satisfy every assertion above through the store while
      // making the model claim something nobody said.
      const [row] = await sql.query<{ state: string | null }>(
        `SELECT state FROM tonight_movies WHERE user_id = $1`,
        [ALICE.id],
      );
      assert.equal(row!.state, null);
    });

    test("a movie is filed under none, one or several mixes, and listed once", async () => {
      const { alice } = await fresh();
      await mix(alice, "Space Tension");
      await mix(alice, "Quiet Dread");

      assert.deepEqual((await alice.createMovie({ title: "Arrival", year: 2016 })).mixes, []);
      const both = await alice.createMovie({
        title: "Under the Skin",
        year: 2013,
        mixes: ["Quiet Dread", "Space Tension"],
      });
      assert.deepEqual(both.mixes, ["Quiet Dread", "Space Tension"]);

      const { mixes, movies } = await alice.taste();

      // Once, whatever it is filed under: the state has one home, so two copies
      // cannot come to disagree about whether it was watched.
      assert.equal(movies.filter((one) => one.title === "Under the Skin").length, 1);

      // And a movie in no mix is here too, which is the only thing keeping it
      // reachable at all.
      assert.ok(movies.some((one) => one.title === "Arrival" && one.mixes.length === 0));

      assert.deepEqual(
        mixes.map((one) => [one.name, one.movies]),
        [
          ["Quiet Dread", [{ title: "Under the Skin", year: 2013 }]],
          ["Space Tension", [{ title: "Under the Skin", year: 2013 }]],
        ],
      );
    });

    test("passing mixes replaces the filing exactly, and an empty list empties it", async () => {
      const { alice } = await fresh();
      for (const name of ["Space Tension", "Quiet Dread", "Popcorn Chaos"]) await mix(alice, name);
      await alice.createMovie({
        title: "Under the Skin",
        year: 2013,
        mixes: ["Space Tension", "Quiet Dread"],
      });

      const filed = await alice.updateMovie("Under the Skin", 2013, {
        mixes: ["Popcorn Chaos", "Quiet Dread"],
      });
      assert.deepEqual(filed.mixes, ["Popcorn Chaos", "Quiet Dread"], "the list was added to");

      const loose = await alice.updateMovie("Under the Skin", 2013, { mixes: [] });
      assert.deepEqual(loose.mixes, []);
      assert.deepEqual(
        (await alice.taste()).mixes.flatMap((one) => one.movies),
        [],
        "a mix still names a movie that was taken out of it",
      );
    });

    test("a movie can only be filed under mixes this user has", async () => {
      const { alice, bob } = await fresh();
      await mix(bob, "Theirs");
      await mix(alice, "Mine");

      assert.match(
        await refusal(alice.createMovie({ title: "Arrival", year: 2016, mixes: ["Theirs"] })),
        /"Theirs" is not one of them/,
      );
      assert.deepEqual((await alice.taste()).movies, [], "the refused create left a movie behind");
    });

    test("deleting a mix leaves its movies, and deleting a movie leaves its mixes", async () => {
      const { alice } = await fresh();
      await mix(alice, "Space Tension");
      await mix(alice, "Quiet Dread");
      await alice.createMovie({
        title: "Under the Skin",
        year: 2013,
        state: "loved",
        mixes: ["Space Tension", "Quiet Dread"],
      });

      await alice.deleteMix("Space Tension");
      const survivor = await movieOf(alice, "Under the Skin", 2013);
      assert.equal(survivor?.state, "loved", "the movie went with the mix");
      assert.deepEqual(survivor?.mixes, ["Quiet Dread"], "it kept a filing that no longer exists");

      const removed = await alice.deleteMovie("Under the Skin", 2013);
      assert.deepEqual(removed.mixes, ["Quiet Dread"], "the answer forgot where it had been filed");
      assert.deepEqual(
        (await alice.taste()).mixes.map((one) => one.name),
        ["Quiet Dread"],
        "deleting a movie took a mix with it",
      );
      assert.deepEqual((await alice.taste()).movies, []);

      assert.match(await refusal(alice.deleteMovie("Under the Skin", 2013)), /no movie/);
    });

    test("a movie title is trimmed and collapsed, and its casing stays the user's", async () => {
      const { alice } = await fresh();

      assert.equal(
        (await alice.createMovie({ title: "  Dune   Part Two  ", year: 2024 })).title,
        "Dune Part Two",
      );

      for (const spelling of [
        "Dune Part Two",
        " Dune Part Two",
        "Dune Part Two ",
        "dune   part   two",
      ]) {
        assert.match(
          await refusal(alice.createMovie({ title: spelling, year: 2024 })),
          /already exists/,
          spelling,
        );
      }

      await alice.createMovie({ title: "DUNE", year: 1984 });
      assert.equal((await movieOf(alice, "DUNE", 1984))?.title, "DUNE", "the store restyled it");

      assert.match(await refusal(alice.createMovie({ title: "   ", year: 2024 })), /needs a title/);
      assert.match(
        await refusal(alice.createMovie({ title: "D".repeat(201), year: 2024 })),
        /at most 200 characters/,
      );
    });

    test("a title is measured in the characters Postgres counts, not code units", async () => {
      const { alice, sql } = await fresh();

      // CLAPPER BOARD, which is one character and two UTF-16 code units. Counted
      // in code units, two hundred of them look like four hundred — so the
      // application would refuse a title the column's own CHECK accepts, and a
      // film with an emoji in its name would hit a limit half the stated one.
      const clapper = "\u{1F3AC}";
      const atTheLimit = clapper.repeat(200);
      assert.equal(atTheLimit.length, 400, "the two counts should disagree, or this proves nothing");

      const stored = await alice.createMovie({ title: atTheLimit, year: 2024 });
      assert.equal(stored.title, atTheLimit);
      assert.equal((await movieOf(alice, atTheLimit, 2024))?.title, atTheLimit);

      assert.match(
        await refusal(alice.createMovie({ title: clapper.repeat(201), year: 2024 })),
        /at most 200 characters/,
      );

      // And the database draws the line in the same place, which is the whole
      // reason the application has to count the way it does.
      const [measured] = await sql.query<{ n: number }>(`SELECT length($1::text) AS n`, [
        atTheLimit,
      ]);
      assert.equal(measured!.n, 200, "Postgres counts characters, and this test assumes it");
    });

    test("the handle addresses a movie; it never restyles the one that is stored", async () => {
      const { alice } = await fresh();
      await alice.createMovie({ title: "DUNE", year: 1984, mixes: [] });

      // Addressed in the wrong case on purpose. The handle is matched ignoring
      // case, so this reaches the row — and changing only the year must leave the
      // spelling the user chose exactly as they wrote it. Taking the new title
      // from the argument instead would let anybody who could find the movie
      // rewrite how it reads.
      const moved = await alice.updateMovie("dune", 1984, { year: 1985 });
      assert.equal(moved.title, "DUNE", "the addressing spelling was written back");
      assert.equal((await movieOf(alice, "DUNE", 1985))?.title, "DUNE");

      // The same for every other field that is not the title.
      await alice.updateMovie("dune", 1985, { state: "seen" });
      await alice.updateMovie("DuNe", 1985, { imdbId: "tt0087182" });
      assert.equal((await movieOf(alice, "DUNE", 1985))?.title, "DUNE");

      // And a caller who does mean to restyle it still can, in one call.
      const retitled = await alice.updateMovie("dune", 1985, { title: "Dune" });
      assert.equal(retitled.title, "Dune");
    });

    test("an update that mentions nothing about a movie is refused rather than ignored", async () => {

      const { alice } = await fresh();
      await alice.createMovie({ title: "Arrival", year: 2016 });

      assert.match(await refusal(alice.updateMovie("Arrival", 2016, {})), /nothing to update/);
      assert.match(await refusal(alice.updateMovie("Nowhere", 1999, { state: "seen" })), /no movie/);
    });

    test("the database refuses a filing that crosses users, from either side", async () => {
      const { alice, bob, sql } = await fresh();
      await mix(alice, "Mine");
      await mix(bob, "Theirs");
      await alice.createMovie({ title: "Arrival", year: 2016, mixes: ["Mine"] });
      await bob.createMovie({ title: "Arrival", year: 2016, mixes: ["Theirs"] });

      const idOf = async (table: string, owner: string) =>
        (
          await sql.query<{ id: string }>(`SELECT id FROM ${table} WHERE user_id = $1`, [owner])
        )[0]!.id;

      const mine = {
        mix: await idOf("tonight_mixes", ALICE.id),
        movie: await idOf("tonight_movies", ALICE.id),
      };
      const theirs = {
        mix: await idOf("tonight_mixes", BOB.id),
        movie: await idOf("tonight_movies", BOB.id),
      };

      // Deliberately not through the store, which resolves names within one user
      // and refuses this long before the database is asked. One forged row per
      // foreign key, because each key is a separate promise: a uuid being
      // unguessable is a fact about collisions, not an authorisation rule, and
      // only `user_id` inside the key makes the other tenant unreachable.
      for (const [what, mixId, movieId] of [
        ["another user's mix", theirs.mix, mine.movie],
        ["another user's movie", mine.mix, theirs.movie],
      ] as const) {
        await assert.rejects(
          sql.query(
            `INSERT INTO tonight_mix_movies (user_id, mix_id, movie_id) VALUES ($1, $2, $3)`,
            [ALICE.id, mixId, movieId],
          ),
          (error: unknown) => {
            // 23503 — foreign key violation. Alice's tenant has no such row to
            // point at, whichever half of the pair came from Bob.
            assert.equal((error as { code?: string }).code, "23503", what);
            return true;
          },
          what,
        );
      }
    });

    test("a mix renamed away between resolving and locking is refused, never swapped", async () => {
      // One embedded database is one session, so the substitution is performed
      // from inside the transaction rather than by a second connection. What that
      // exercises is the check itself: `holdMixes` compares the id it resolved
      // against the id it locked, because a name is not an identity. Another
      // transaction can rename a mix away and rename a second one into the name
      // it left, and matching on the name alone would file the movie under a mix
      // nobody asked for.
      const { alice, sql } = await fresh();
      await mix(alice, "One");
      await mix(alice, "Two");

      let swapped = false;
      const watched: SqlDriver = {
        ...sql,
        transaction: (work) =>
          sql.transaction((tx) =>
            work({
              exec: (script) => tx.exec(script),
              async query<Row>(statement: string, params?: readonly unknown[]): Promise<Row[]> {
                if (!swapped && /FROM tonight_mixes[\s\S]*FOR KEY SHARE/.test(statement)) {
                  swapped = true;
                  const rename = `UPDATE tonight_mixes SET name = $2 WHERE user_id = $1 AND name = $3`;
                  await tx.query(rename, [ALICE.id, "Gone", "One"]);
                  await tx.query(rename, [ALICE.id, "One", "Two"]);
                }
                return tx.query<Row>(statement, params);
              },
            }),
          ),
      };

      const store = sqlTasteStore(watched, ALICE);
      assert.match(
        await refusal(store.createMovie({ title: "Arrival", year: 2016, mixes: ["One"] })),
        /is not one of them/,
      );
      assert.ok(swapped, "the hold never ran, so nothing was proved");

      // And the movie inserted a moment before the refusal went with the
      // rollback, which is what makes inserting before locking safe.
      assert.deepEqual((await alice.taste()).movies, []);
    });

    test("a uniqueness rule nobody planned for is reported, not explained away", async () => {
      // Two unique indexes on this table are the user's business — the handle and
      // their IMDb ids — and a collision on either becomes a sentence. The
      // others guard the generated uuid, and a collision there is a fault in this
      // code or in `gen_random_uuid`. Turning that into "you already have that
      // film" would hide a real failure behind a plausible answer, and the user
      // would go looking for a duplicate that does not exist.
      const { alice, bob, sql } = await fresh();
      await bob.createMovie({ title: "Theirs", year: 2001 });
      const [theirs] = await sql.query<{ id: string }>(
        `SELECT id FROM tonight_movies WHERE user_id = $1`,
        [BOB.id],
      );

      // The insert is swapped for one that takes an id another user already
      // holds, which is the one 23505 the store has no business interpreting.
      const watched: SqlDriver = {
        ...sql,
        transaction: (work) =>
          sql.transaction((tx) =>
            work({
              exec: (script) => tx.exec(script),
              query<Row>(statement: string, params?: readonly unknown[]): Promise<Row[]> {
                if (!/INSERT INTO tonight_movies/.test(statement)) {
                  return tx.query<Row>(statement, params);
                }
                return tx.query<Row>(
                  `INSERT INTO tonight_movies (user_id, id, title, year)
                   VALUES ($1, $2, $3, $4) RETURNING id`,
                  [ALICE.id, theirs!.id, "Forced", 2001],
                );
              },
            }),
          ),
      };

      await assert.rejects(
        sqlTasteStore(watched, ALICE).createMovie({ title: "Mine", year: 2001 }),
        (error: unknown) => {
          assert.equal(
            error instanceof TasteError,
            false,
            "a uuid collision was dressed up as a conflict the user could act on",
          );
          assert.equal((error as { code?: string }).code, "23505");
          assert.equal((error as { constraint?: string }).constraint, "tonight_movies_id_key");
          return true;
        },
      );

      assert.deepEqual((await alice.taste()).movies, [], "the failed write left something behind");
    });

    test("a handle change takes both movie locks in one shared order", async () => {
      // The same argument as for genre locks: what one session can prove is the
      // order, not that the order prevents a deadlock. A cycle needs two sessions
      // holding rows in opposite sequences, and a shared total order removes it.
      const { alice, sql } = await fresh();
      await alice.createMovie({ title: "Alpha", year: 2000 });
      await alice.createMovie({ title: "Zulu", year: 1999 });

      /**
       * The pair a lock was taken on, composed as `movieKey` composes it.
       *
       * U+0000 written as an escape rather than typed: it cannot occur in a
       * folded title, which is why the store picked it, and a control
       * character in a source file survives no editor, diff or terminal
       * between here and a reviewer.
       */
      const key = (title: string, year: number) => `${title}\u0000${year}`;

      const locking = async (work: (store: TasteStore) => Promise<unknown>) => {
        const taken: string[] = [];
        const watched: SqlDriver = {
          ...sql,
          transaction: (body) =>
            sql.transaction((tx) =>
              body({
                query: (statement, params) => {
                  if (/FROM tonight_movies[\s\S]*FOR UPDATE/.test(statement)) {
                    const [, title, year] = params as [string, string, number];
                    taken.push(key(title, year));
                  }
                  return tx.query(statement, params);
                },
                exec: (script) => tx.exec(script),
              }),
            ),
        };
        await work(sqlTasteStore(watched, ALICE));
        return taken;
      };

      // A case-only retitle is one row, asked for once: both halves of the handle
      // fold to the same key, and locking it twice would be waiting for itself.
      assert.deepEqual(
        await locking((store) => store.updateMovie("Alpha", 2000, { title: "ALPHA" })),
        [key("alpha", 2000)],
      );

      const forward = await locking((store) => store.updateMovie("ALPHA", 2000, { title: "Mid" }));
      assert.deepEqual(forward, [key("alpha", 2000), key("mid", 2000)]);

      // Here the destination sorts first, so it is locked first — the caller's
      // "from, then to" never reaches the locks, which is the whole point.
      const backward = await locking((store) => store.updateMovie("Zulu", 1999, { title: "Mid" }));
      assert.deepEqual(backward, [key("mid", 1999), key("zulu", 1999)]);
    });

    test("the whole model comes back with each movie once and every state intact", async () => {
      const { alice } = await fresh();
      await mix(alice, "Space Tension");
      await mix(alice, "Quiet Dread");
      await alice.createMovie({
        title: "Dune",
        year: 1984,
        state: "disliked",
        mixes: ["Space Tension"],
      });
      await alice.createMovie({
        title: "Dune",
        year: 2021,
        state: "loved",
        imdbId: "tt1160419",
        mixes: ["Space Tension", "Quiet Dread"],
      });
      await alice.createMovie({ title: "Arrival", year: 2016 });

      const { mixes, movies } = await alice.taste();

      assert.deepEqual(movies, [
        { title: "Arrival", year: 2016, imdbId: null, state: null, mixes: [] },
        {
          title: "Dune",
          year: 1984,
          imdbId: null,
          state: "disliked",
          mixes: ["Space Tension"],
        },
        {
          title: "Dune",
          year: 2021,
          imdbId: "tt1160419",
          state: "loved",
          mixes: ["Quiet Dread", "Space Tension"],
        },
      ]);

      // A mix names the whole handle. A title alone could not tell one Dune from
      // the other, and the mix would be pointing at a film nobody put there.
      assert.deepEqual(mixes.find((one) => one.name === "Space Tension")?.movies, [
        { title: "Dune", year: 1984 },
        { title: "Dune", year: 2021 },
      ]);
      assert.deepEqual(mixes.find((one) => one.name === "Quiet Dread")?.movies, [
        { title: "Dune", year: 2021 },
      ]);
    });

    test("no mix ever names a genre that is not in the same answer", async () => {
      // The invariant every reference rule above exists to protect, asserted over
      // the whole model rather than over one operation: whatever has been done to
      // it, `taste()` never comes back internally inconsistent.
      const { alice } = await fresh();
      for (const name of ["Sci-Fi", "Thriller", "Comedy"]) await genre(alice, name);
      await alice.createMix({
        name: "Space Tension",
        genres: ["Sci-Fi", "Thriller"],
        instruction: "Tense.",
      });
      await alice.createMix({ name: "Weird Fun", genres: ["Sci-Fi", "Comedy"], instruction: "Odd." });

      await alice.updateGenre("Sci-Fi", { name: "Science fiction" });
      await alice.updateMix("Weird Fun", { name: "Weird Future Fun", genres: ["Comedy"] });
      await alice.deleteMix("Space Tension");
      await alice.deleteGenre("Thriller");

      const { genres, mixes } = await alice.taste();
      const known = new Set(genres.map((one) => one.name));
      for (const mix of mixes) {
        assert.ok(mix.genres.length > 0, `${mix.name} is built from nothing`);
        for (const name of mix.genres) {
          assert.ok(known.has(name), `${mix.name} names "${name}", which is not a genre`);
        }
      }
    });
  });
}
