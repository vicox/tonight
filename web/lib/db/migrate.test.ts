import assert from "node:assert/strict";
import test, { after } from "node:test";

import { ConfigurationError } from "../oauth/config.ts";
import { RECONCILE_MIX_GENRES, TASTE_SCHEMA } from "../taste/store/schema.ts";
import { sqlTasteStore } from "../taste/store/sql.ts";
import type { SqlDriver } from "./driver.ts";
import { migrate, prepareSchema, type SchemaModule } from "./migrate.ts";
import { embeddedDriver } from "./pglite.ts";

/**
 * Who is allowed to change the schema, and when.
 *
 * The rule these tests hold is operational rather than cryptographic, and it is
 * still a security rule: **a request from the internet must never be what causes
 * DDL to run.** The first request after a deploy is an arbitrary one, several
 * instances would race to be it, and a migration that failed halfway would do so
 * inside somebody's page load with nobody watching. So production checks and
 * refuses, and an operator runs `npm run db:migrate` as a step they can see.
 *
 * Development keeps migrating, because a checkout has to work after `npm install`
 * and a developer's own machine is not the thing being protected.
 */

const SCHEMA: SchemaModule = {
  module: "migrate-test",
  migrations: [
    { version: 1, sql: "CREATE TABLE migrate_test_one (id integer PRIMARY KEY);" },
    { version: 2, sql: "ALTER TABLE migrate_test_one ADD COLUMN note text;" },
  ],
};

const opened: SqlDriver[] = [];

async function fresh(): Promise<SqlDriver> {
  const driver = await embeddedDriver();
  opened.push(driver);
  return driver;
}

after(async () => {
  for (const driver of opened) await driver.close();
});

/** Runs `work` as though this process were a production deployment. */
async function inProduction<T>(work: () => T | Promise<T>): Promise<T> {
  const mutable = process.env as Record<string, string | undefined>;
  const before = mutable.NODE_ENV;
  mutable.NODE_ENV = "production";
  try {
    return await work();
  } finally {
    mutable.NODE_ENV = before;
  }
}

/** The error a call refused with, or "prepared". */
async function outcome(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
    return "prepared";
  } catch (error) {
    if (error instanceof ConfigurationError) return error.message;
    throw error;
  }
}

/** Whether a table exists, asked without creating anything. */
async function exists(driver: SqlDriver, table: string): Promise<boolean> {
  const [row] = await driver.query<{ present: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS present`,
    [table],
  );
  return row?.present ?? false;
}

test("development migrates, so a checkout works with nothing to run first", async () => {
  const driver = await fresh();

  await prepareSchema(driver, SCHEMA);

  assert.equal(await exists(driver, "migrate_test_one"), true);
});

test("production refuses an un-migrated database instead of migrating it", async () => {
  const driver = await fresh();

  const refusal = await inProduction(() => outcome(() => prepareSchema(driver, SCHEMA)));

  assert.match(refusal, /migrate-test schema is not up to date/);
  assert.match(refusal, /migration\(s\) 1, 2/, "and says which steps are missing");
  assert.match(refusal, /npm run db:migrate/, "and what to run");
});

test("production writes nothing at all when it refuses, not even the tracking table", async () => {
  const driver = await fresh();

  await inProduction(() => outcome(() => prepareSchema(driver, SCHEMA)));

  // The check is one read. Creating the tracking table would be the very DDL this
  // exists to avoid, and a refusal that left a table behind would be a refusal
  // that had already changed the database.
  assert.equal(await exists(driver, "schema_migrations"), false);
  assert.equal(await exists(driver, "migrate_test_one"), false);
});

test("production accepts a database that was migrated by the command", async () => {
  const driver = await fresh();

  // What a deploy does: the operator runs the migration, then the code serves.
  assert.equal(await migrate(driver, SCHEMA), 2);

  await inProduction(() => prepareSchema(driver, SCHEMA));

  assert.equal(await exists(driver, "migrate_test_one"), true);
});

test("production refuses when the database is behind, not merely absent", async () => {
  const driver = await fresh();

  // Migrated by an older deploy: version 1 applied, version 2 not.
  await migrate(driver, { module: SCHEMA.module, migrations: [SCHEMA.migrations[0]!] });

  const refusal = await inProduction(() => outcome(() => prepareSchema(driver, SCHEMA)));

  assert.match(refusal, /migration\(s\) 2/);
  assert.equal(refusal.includes("1, 2"), false, "it names what is missing, not what is applied");
});

test("a database migrated further than this code needs is accepted, so a rollback is not an outage", async () => {
  const driver = await fresh();

  await migrate(driver, {
    module: SCHEMA.module,
    migrations: [...SCHEMA.migrations, { version: 3, sql: "CREATE TABLE migrate_test_later (id integer);" }],
  });

  // The older code asks for 1 and 2, both of which are there. Refusing because it
  // does not recognise 3 would make every rollback a deployment failure.
  await inProduction(() => prepareSchema(driver, SCHEMA));
});

test("a uniqueness bug inside a migration fails instead of passing for a version race", async () => {
  const driver = await fresh();

  // Two instances starting together is the only benign uniqueness outcome, and it
  // is no longer an error at all: the version is claimed with ON CONFLICT DO
  // NOTHING, so the instance that loses simply gets no row back. Anything that
  // raises 23505 is therefore the migration's own SQL, and swallowing it would
  // leave a step recorded as applied that had not run.
  const broken: SchemaModule = {
    module: "migrate-test-broken",
    migrations: [
      {
        version: 1,
        sql: `
          CREATE TABLE migrate_test_broken (id integer PRIMARY KEY);
          INSERT INTO migrate_test_broken (id) VALUES (1);
          INSERT INTO migrate_test_broken (id) VALUES (1);
        `,
      },
    ],
  };

  await assert.rejects(() => migrate(driver, broken), /duplicate key|unique/i);

  // And it left nothing claiming to have happened: the DDL and the tracking row
  // were in one transaction, so both rolled back.
  assert.equal(await exists(driver, "migrate_test_broken"), false);
  const [recorded] = await driver.query<{ count: string }>(
    "SELECT count(*) AS count FROM schema_migrations WHERE module = $1",
    [broken.module],
  );
  assert.equal(Number(recorded?.count ?? 0), 0);
});

test("concurrent first starts apply each version exactly once", async () => {
  const driver = await fresh();

  const runs = await Promise.all(Array.from({ length: 4 }, () => migrate(driver, SCHEMA)));

  // Whichever run gets there first does the work; the rest find the versions
  // claimed and do nothing. Two applications of the same DDL would fail on
  // "relation already exists", so this passing at all is the guarantee.
  assert.equal(
    runs.reduce((total, applied) => total + applied, 0),
    SCHEMA.migrations.length,
  );
  assert.equal(await exists(driver, "migrate_test_one"), true);
});

/**
 * A driver whose first `CREATE TABLE ... schema_migrations` fails the way a lost
 * catalogue race fails.
 *
 * What this can prove locally is the recovery: that the bootstrap forgives a
 * failure exactly when the table it wanted is there afterwards, and re-throws
 * otherwise. What it cannot prove is the race itself — one embedded database is
 * one session, and a harness that pretended to be two would be testing itself.
 * That half is Postgres' documented behaviour for concurrent
 * `CREATE TABLE IF NOT EXISTS`, and this is the code that answers it.
 */
function failingBootstrap(driver: SqlDriver, options: { thenCreate: boolean }): SqlDriver {
  return {
    ...driver,
    query: (sql, params) => driver.query(sql, params),
    exec: async (sql) => {
      if (!sql.includes("schema_migrations")) return driver.exec(sql);

      // The winner's table either is or is not visible by the time the loser
      // looks, and that is the whole of what the recovery turns on. When it never
      // appears, every attempt fails and the error has to reach the caller.
      if (options.thenCreate) await driver.exec(sql);
      const error = new Error("duplicate key value violates unique constraint");
      (error as { code?: string }).code = "23505";
      throw error;
    },
  };
}

test("a lost race to create the tracking table is recovered from, not reported", async () => {
  const driver = await fresh();

  // The table exists by the time the failure is examined: another session won,
  // which is the only reading under which the error means nothing.
  const applied = await migrate(failingBootstrap(driver, { thenCreate: true }), SCHEMA);

  assert.equal(applied, 2);
  assert.equal(await exists(driver, "migrate_test_one"), true);
});

test("a bootstrap failure that leaves no tracking table is reported", async () => {
  const driver = await fresh();

  // Same error, and this time nothing created the table. Forgiving it would hide
  // a database that cannot be migrated at all behind a benign-looking race.
  await assert.rejects(
    () => migrate(failingBootstrap(driver, { thenCreate: false }), SCHEMA),
    /duplicate key/,
  );
  assert.equal(await exists(driver, "migrate_test_one"), false);
});

/**
 * The taste model's move from name-keyed to uuid-keyed identity, run against
 * data shaped the way production's is.
 *
 * These tests exist because the migration's whole promise is that nothing a user
 * has changes meaning. The only way to check that is to write rows the way v1
 * wrote them and then look at what the store says about them afterwards.
 *
 * `upTo` is what makes the phases testable: dev and CI migrate all the way, so
 * without it there would be no way to stand in the expanded schema and see what
 * an instance from before the deploy would have done there.
 */

const ALICE = "google:alice";

const upTo = (version: number): SchemaModule => ({
  module: TASTE_SCHEMA.module,
  migrations: TASTE_SCHEMA.migrations.filter((one) => one.version <= version),
});

/** Rows exactly as the v1 schema held them: names, and no ids anywhere. */
async function seedV1(sql: SqlDriver): Promise<void> {
  for (const [name, instruction] of [
    ["Sci-Fi", "I like ideas over spectacle."],
    ["Thriller", "I like being kept on edge."],
  ]) {
    await sql.query(
      `INSERT INTO tonight_genres (user_id, name, instruction) VALUES ($1, $2, $3)`,
      [ALICE, name, instruction],
    );
  }
  await sql.query(
    `INSERT INTO tonight_mixes (user_id, name, instruction) VALUES ($1, $2, $3)`,
    [ALICE, "Space Tension", "Contained, and nobody is safe."],
  );
  for (const [position, genre] of ["Sci-Fi", "Thriller"].entries()) {
    await sql.query(
      `INSERT INTO tonight_mix_genres (user_id, mix, genre, position) VALUES ($1, $2, $3, $4)`,
      [ALICE, "Space Tension", genre, position],
    );
  }
}

test("v2 gives every row an id and points every reference at one", async () => {
  const sql = await fresh();
  await migrate(sql, upTo(1));
  await seedV1(sql);

  await migrate(sql, upTo(2));

  // Every reference now carries the id of the row its name names — which is the
  // whole of the backfill, and the thing the contract migration will trust.
  const rows = await sql.query<{ mix: string; genre: string; ok: boolean }>(
    `SELECT r.mix, r.genre,
            (r.mix_id = m.id AND r.genre_id = g.id) AS ok
       FROM tonight_mix_genres AS r
       JOIN tonight_mixes  AS m ON m.user_id = r.user_id AND m.name = r.mix
       JOIN tonight_genres AS g ON g.user_id = r.user_id AND g.name = r.genre
      WHERE r.user_id = $1
      ORDER BY r.position`,
    [ALICE],
  );
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.ok), "a reference points at the wrong row");

  // And the names are untouched: expansion adds identity, it does not rewrite
  // anything the user typed.
  const names = await sql.query<{ name: string }>(
    `SELECT name FROM tonight_genres WHERE user_id = $1 ORDER BY name`,
    [ALICE],
  );
  assert.deepEqual(names.map((row) => row.name), ["Sci-Fi", "Thriller"]);
});

test("reconciliation repairs a reference an old instance wrote after the backfill", async () => {
  const sql = await fresh();
  await migrate(sql, upTo(1));
  await seedV1(sql);
  await migrate(sql, upTo(2));

  // What an instance deployed before v2 does: names only, no ids. It is legal
  // against the expanded schema on purpose — that is what keeps it serving.
  await sql.query(
    `INSERT INTO tonight_mixes (user_id, name, instruction) VALUES ($1, $2, $3)`,
    [ALICE, "Quiet Dread", "Slow, and nothing jumps out."],
  );
  await sql.query(
    `INSERT INTO tonight_mix_genres (user_id, mix, genre, position) VALUES ($1, $2, $3, 0)`,
    [ALICE, "Quiet Dread", "Thriller"],
  );

  const nulls = async () =>
    (
      await sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM tonight_mix_genres
          WHERE user_id = $1 AND (mix_id IS NULL OR genre_id IS NULL)`,
        [ALICE],
      )
    )[0]!.n;

  assert.equal(await nulls(), 1, "the old-style write should have left ids null");

  await sql.exec(RECONCILE_MIX_GENRES);

  assert.equal(await nulls(), 0, "reconciliation left a row unrepaired");
  const [repaired] = await sql.query<{ ok: boolean }>(
    `SELECT (r.mix_id = m.id AND r.genre_id = g.id) AS ok
       FROM tonight_mix_genres AS r
       JOIN tonight_mixes  AS m ON m.user_id = r.user_id AND m.name = r.mix
       JOIN tonight_genres AS g ON g.user_id = r.user_id AND g.name = r.genre
      WHERE r.user_id = $1 AND r.mix = $2`,
    [ALICE, "Quiet Dread"],
  );
  assert.equal(repaired?.ok, true, "the repaired row points at the wrong object");
});

test("v4 stands beside what is there rather than rewriting any of it", async () => {
  const sql = await fresh();
  await migrate(sql, upTo(3));

  // Written through the store, because v3 is the shape the store already
  // speaks — and what has to survive is a user's model, not a row layout.
  const store = sqlTasteStore(sql, { id: ALICE });
  await store.createGenre({ name: "Sci-Fi", instruction: "I like ideas over spectacle." });
  await store.createMix({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense." });

  // `xmin` is the transaction that last wrote each row. An additive migration
  // has to leave all three untouched; a backfill, a rewritten default or a
  // table rebuild would move them, and comparing values would not notice.
  const versions = async () =>
    await sql.query<{ kind: string; v: string }>(
      `SELECT 'genre' AS kind, xmin::text AS v FROM tonight_genres WHERE user_id = $1
        UNION ALL
       SELECT 'mix', xmin::text FROM tonight_mixes WHERE user_id = $1
        UNION ALL
       SELECT 'reference', xmin::text FROM tonight_mix_genres WHERE user_id = $1`,
      [ALICE],
    );

  const before = await versions();
  assert.equal(before.length, 3, "one genre, one mix and the reference between them");

  await migrate(sql, TASTE_SCHEMA);

  assert.deepEqual(await versions(), before, "v4 rewrote a row it should only stand beside");

  // And the movie tables arrive empty: nobody gains a film they never mentioned.
  const { genres, mixes, movies } = await store.taste();
  assert.deepEqual(movies, []);
  assert.deepEqual(genres.map((one) => one.name), ["Sci-Fi"]);
  assert.deepEqual(mixes[0]?.movies, [], "a mix arrived already naming something");
});

/**
 * The `watched`/`liked` → `state` change, as an expand migration.
 *
 * v5 adds a column and a bridge and drops nothing, so the build already in
 * production keeps working while the new one rolls out. These tests are what say
 * that out loud: the backfill is right, both shapes still work afterwards, and a
 * write from either build leaves the other side of the row correct.
 */

/** How the build already in production writes a movie: two booleans, no state. */
async function oldCodeInsert(
  sql: SqlDriver,
  title: string,
  watched: boolean | null,
  liked: boolean | null,
): Promise<void> {
  await sql.query(
    `INSERT INTO tonight_movies (user_id, title, year, imdb_id, watched, liked)
     VALUES ($1, $2, 2000, NULL, $3, $4)`,
    [ALICE, title, watched, liked],
  );
}

/** And how it updates one: the same whole-row shape, still never naming state. */
async function oldCodeUpdate(
  sql: SqlDriver,
  title: string,
  watched: boolean | null,
  liked: boolean | null,
): Promise<void> {
  await sql.query(
    `UPDATE tonight_movies SET title = $2, year = 2000, imdb_id = NULL, watched = $3, liked = $4
      WHERE user_id = $1 AND title = $2`,
    [ALICE, title, watched, liked],
  );
}

/** What the new build writes: the state, and nothing about the booleans. */
async function newCodeUpdate(sql: SqlDriver, title: string, state: string | null): Promise<void> {
  await sql.query(
    `UPDATE tonight_movies SET title = $2, year = 2000, imdb_id = NULL, state = $3
      WHERE user_id = $1 AND title = $2`,
    [ALICE, title, state],
  );
}

async function row(sql: SqlDriver, title: string) {
  const [found] = await sql.query<{ watched: boolean | null; liked: boolean | null; state: string | null }>(
    `SELECT watched, liked, state FROM tonight_movies WHERE user_id = $1 AND title = $2`,
    [ALICE, title],
  );
  return found;
}

/** Every combination the old shape could hold, and what v5 makes of each. */
const BACKFILL: [string, boolean | null, boolean | null, string | null][] = [
  ["nothing said", null, null, null],
  ["liked, never told whether seen", null, true, "liked"],
  ["disliked, never told whether seen", null, false, "disliked"],
  ["not seen", false, null, "not_seen"],
  ["not seen, yet liked", false, true, "not_seen"],
  ["not seen, yet disliked", false, false, "not_seen"],
  ["seen, said nothing about it", true, null, "seen"],
  ["seen and liked", true, true, "liked"],
  ["seen and disliked", true, false, "disliked"],
];

test("v5 backfills every watched/liked pair into the state that keeps most of it", async () => {
  const sql = await fresh();
  await migrate(sql, upTo(4));
  for (const [what, watched, liked] of BACKFILL) await oldCodeInsert(sql, what, watched, liked);

  await migrate(sql, TASTE_SCHEMA);

  const rows = await sql.query<{ title: string; state: string | null }>(
    `SELECT title, state FROM tonight_movies WHERE user_id = $1`,
    [ALICE],
  );
  assert.deepEqual(
    Object.fromEntries(rows.map((one) => [one.title, one.state])),
    Object.fromEntries(BACKFILL.map(([what, , , state]) => [what, state])),
  );

  // A sixth state cannot be written, by either build or by hand.
  await assert.rejects(
    sql.query(
      `INSERT INTO tonight_movies (user_id, title, year, state) VALUES ($1, 'x', 2000, 'neutral')`,
      [ALICE],
    ),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "23514");
      return true;
    },
  );
});

test("v5 drops nothing, so the build already in production still works", async () => {
  const sql = await fresh();
  await migrate(sql, upTo(4));
  await migrate(sql, TASTE_SCHEMA);

  // Both columns are still there and still writable by a build that has never
  // heard of `state`. This is the whole point of the migration being an expand:
  // deploying the new code is not a prerequisite for running it.
  await oldCodeInsert(sql, "written by the old build", true, false);
  const written = await row(sql, "written by the old build");
  assert.equal(written?.watched, true);
  assert.equal(written?.liked, false);

  // And the old build can read what the new one wrote.
  await sql.query(
    `INSERT INTO tonight_movies (user_id, title, year, state) VALUES ($1, 'new', 2000, 'loved')`,
    [ALICE],
  );
  const read = await sql.query<{ watched: boolean | null; liked: boolean | null }>(
    `SELECT watched, liked FROM tonight_movies WHERE user_id = $1 AND title = 'new'`,
    [ALICE],
  );
  assert.deepEqual(read[0], { watched: true, liked: true }, "the old build would see nothing");
});

test("an old-build write after the backfill leaves the state correct, not stale", async () => {
  // The failure this migration is shaped to avoid. A backfill is a snapshot: the
  // moment the build still in production writes again, a `state` that is only
  // backfilled is wrong, and the new build would read the wrong answer for as
  // long as the rollout takes.
  const sql = await fresh();
  await migrate(sql, upTo(4));
  await oldCodeInsert(sql, "Arrival", true, true);
  await migrate(sql, TASTE_SCHEMA);

  assert.equal((await row(sql, "Arrival"))?.state, "liked", "the backfill itself is wrong");

  // Now the old build writes again — it knows nothing about `state`.
  await oldCodeUpdate(sql, "Arrival", true, false);
  assert.deepEqual(await row(sql, "Arrival"), { watched: true, liked: false, state: "disliked" });

  await oldCodeUpdate(sql, "Arrival", false, null);
  assert.deepEqual(await row(sql, "Arrival"), { watched: false, liked: null, state: "not_seen" });

  await oldCodeUpdate(sql, "Arrival", null, null);
  assert.deepEqual(await row(sql, "Arrival"), { watched: null, liked: null, state: null });

  // A row the old build inserts after the migration is filled in too.
  await oldCodeInsert(sql, "Moon", true, null);
  assert.equal((await row(sql, "Moon"))?.state, "seen");
});

test("a new-build write leaves the columns the old build reads correct", async () => {
  const sql = await fresh();
  await migrate(sql, upTo(4));
  await oldCodeInsert(sql, "Dune", null, null);
  await migrate(sql, TASTE_SCHEMA);

  for (const [state, watched, liked] of [
    ["not_seen", false, null],
    ["seen", true, null],
    ["liked", true, true],
    ["loved", true, true],
    ["disliked", true, false],
    [null, null, null],
  ] as const) {
    await newCodeUpdate(sql, "Dune", state);
    assert.deepEqual(await row(sql, "Dune"), { watched, liked, state }, String(state));
  }
});

test("a write that changes neither side leaves both alone", async () => {
  // The bridge decides by what moved, so a write that moves nothing — a retitle,
  // an IMDb id — must not re-derive anything and quietly flatten `loved`.
  const sql = await fresh();
  await migrate(sql, upTo(4));
  await oldCodeInsert(sql, "Past Lives", true, true);
  await migrate(sql, TASTE_SCHEMA);
  await newCodeUpdate(sql, "Past Lives", "loved");

  await sql.query(
    `UPDATE tonight_movies SET imdb_id = 'tt13238346' WHERE user_id = $1 AND title = 'Past Lives'`,
    [ALICE],
  );
  assert.equal((await row(sql, "Past Lives"))?.state, "loved", "an unrelated write re-derived");

  // And the one thing the old shape cannot hold: it reads `loved` as liked, so an
  // old-build write that confirms what it was shown settles on `liked`.
  await oldCodeUpdate(sql, "Past Lives", true, true);
  assert.equal((await row(sql, "Past Lives"))?.state, "loved", "an identical write changed it");

  await oldCodeUpdate(sql, "Past Lives", true, false);
  assert.equal((await row(sql, "Past Lives"))?.state, "disliked");
});

test("v1 data survives the whole migration with its meaning intact", async () => {
  const sql = await fresh();
  await migrate(sql, upTo(1));
  await seedV1(sql);

  await migrate(sql, TASTE_SCHEMA);

  // Read back through the store, because "unchanged" means unchanged to a
  // caller: the same genres, the same mix, the same genres under it, in the
  // same order, spelled the way they were typed.
  const taste = await sqlTasteStore(sql, { id: ALICE }).taste();
  assert.deepEqual(taste, {
    genres: [
      { name: "Sci-Fi", instruction: "I like ideas over spectacle." },
      { name: "Thriller", instruction: "I like being kept on edge." },
    ],
    mixes: [
      {
        name: "Space Tension",
        instruction: "Contained, and nobody is safe.",
        genres: ["Sci-Fi", "Thriller"],
        movies: [],
      },
    ],
    movies: [],
  });

  // And no uuid reached the caller on the way. The comparison above would already
  // reject an extra key, but the fields are named here because this is the
  // property most easily lost by accident and least likely to be noticed.
  const fields = new Set([
    ...taste.genres.flatMap(Object.keys),
    ...taste.mixes.flatMap(Object.keys),
  ]);
  assert.deepEqual([...fields].sort(), ["genres", "instruction", "movies", "name"]);
});
