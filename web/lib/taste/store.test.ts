import assert from "node:assert/strict";
import test, { after, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import { TasteError, type Genre, type Mix } from "./model.ts";
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
      await sql.exec(`TRUNCATE tonight_mix_genres, tonight_mixes, tonight_genres;`);
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

    // --- new users --------------------------------------------------------

    test("a new user starts with nothing, and is not seeded with examples", async () => {
      const { alice } = await fresh();

      assert.deepEqual(await alice.taste(), { genres: [], mixes: [] });
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

      assert.deepEqual(await alice.taste(), { genres: [], mixes: [] });
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
          { name: "Space Tension", instruction: "Tense.", genres: ["Sci-Fi", "Thriller"] },
        ],
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
      assert.deepEqual(await alice.taste(), { genres: [], mixes: [] });
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

      // One statement did this, through the foreign key. There is no moment in
      // which a mix points at a name that is gone.
      const { genres, mixes } = await alice.taste();
      assert.deepEqual(genres.map((one) => one.name), ["Science fiction", "Thriller"]);
      assert.deepEqual(
        mixes.map((one) => one.genres),
        [["Science fiction"], ["Science fiction", "Thriller"]],
      );
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

      assert.deepEqual(await alice.taste(), { genres: [], mixes: [] });
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
      // is hold the mechanism — three statements under one snapshot — which is the
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
        3,
        "genres, mixes and the references between them, all inside it",
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
