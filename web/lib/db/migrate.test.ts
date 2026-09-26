import assert from "node:assert/strict";
import test, { after } from "node:test";

import { ConfigurationError } from "../oauth/config.ts";
import { orderGenre, orderVibe, orderMovie } from "../taste/model.ts";
import { RECONCILE_VIBE_GENRES, TASTE_SCHEMA } from "../taste/store/schema.ts";
import { sqlTasteStore } from "../taste/store/sql.ts";
import { VERDICTS_SCHEMA, } from "../verdicts/store/schema.ts";
import { sqlVerdictStore } from "../verdicts/store/sql.ts";
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
  const rows = await sql.query<{ vibe: string; genre: string; ok: boolean }>(
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

  await sql.exec(RECONCILE_VIBE_GENRES);

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
  await store.createVibe({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense." });

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
  assert.equal(before.length, 3, "one genre, one vibe and the reference between them");

  await migrate(sql, TASTE_SCHEMA);

  assert.deepEqual(await versions(), before, "v4 rewrote a row it should only stand beside");

  // And the movie tables arrive empty: nobody gains a film they never mentioned.
  const { genres, vibes, movies } = await store.taste();
  assert.deepEqual(movies, []);
  assert.deepEqual(genres.map((one) => one.name), ["Sci-Fi"]);
  assert.deepEqual(vibes[0]?.movies, [], "a vibe arrived already naming something");
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

  // Pinned at v5 rather than migrated all the way: everything this test is about
  // is the bridge, and v7 takes the bridge away. Migrating past it would be
  // asserting the arrangement outlives the release it was built for.
  await migrate(sql, upTo(5));

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
  await migrate(sql, upTo(5));

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
  await migrate(sql, upTo(5));

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
  await migrate(sql, upTo(5));

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
  await migrate(sql, upTo(5));
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
  // caller: the same genres, the same vibe, the same genres under it, in the
  // same order, spelled the way they were typed.
  const taste = await sqlTasteStore(sql, { id: ALICE }).taste();
  assert.deepEqual({
    genres: taste.genres.map(orderGenre),
    vibes: taste.vibes.map(orderVibe),
    movies: taste.movies.map(orderMovie),
  }, {
    genres: [
      { name: "Sci-Fi", instruction: "I like ideas over spectacle." },
      { name: "Thriller", instruction: "I like being kept on edge." },
    ],
    vibes: [
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
    ...taste.vibes.flatMap(Object.keys),
  ]);
  assert.deepEqual([...fields].sort(), [
    "createdAt",
    "genres",
    "instruction",
    "movies",
    "name",
    "updatedAt",
  ]);
});

/**
 * The build that is in production when v6 runs, as SQL.
 *
 * Not a paraphrase: these are the statements from `git show HEAD` — the movie
 * update naming four columns and no stamp, the filing replaced by deleting every
 * reference row and writing the new ones, and the vibe deleted by id. What the
 * tests below assert is that a build which has never heard of `updated_at` keeps
 * it correct anyway, because migrating and deploying are not one instant and a
 * rolling deploy runs both builds at once on purpose.
 */
const oldCode = {
  async createMovie(sql: SqlDriver, title: string, vibes: string[] = []): Promise<string> {
    // This fixture is run against two eras of the schema — before v6, and all
    // the way up — so it asks which one it is in rather than naming a column
    // that may not exist yet. `canonical_title` arrives in v8 and is required
    // from v9: a build that has never heard of it cannot write a movie once
    // that migration has run, which is a deployment ordering constraint and is
    // written down as one in the schema.
    //
    // What the user said about the film is deliberately not written here. These
    // contracts are about the timestamp trigger, and the column that carried an
    // answer has changed name once and meaning twice; naming one would make
    // this fixture fail for a reason it is not about.
    const [named] = await sql.query<{ yes: boolean }>(
      `SELECT count(*) > 0 AS yes FROM information_schema.columns
        WHERE table_name = 'tonight_movies' AND column_name = 'canonical_title'`,
    );
    const [movie] = await sql.query<{ id: string }>(
      named?.yes
        ? `INSERT INTO tonight_movies (user_id, title, canonical_title, year, imdb_id)
           VALUES ($1, $2, lower($2), 2016, NULL) RETURNING id`
        : `INSERT INTO tonight_movies (user_id, title, year, imdb_id)
           VALUES ($1, $2, 2016, NULL) RETURNING id`,
      [ALICE, title],
    );
    for (const vibe of vibes) {
      await sql.query(
        `INSERT INTO tonight_mix_movies (user_id, mix_id, movie_id)
         SELECT $1, m.id, $3 FROM tonight_mixes AS m WHERE m.user_id = $1 AND m.name = $2`,
        [ALICE, vibe, movie!.id],
      );
    }
    return movie!.id;
  },

  /** The old `updateMovie`: a whole-row write, no stamp anywhere in it. */
  async updateMovie(sql: SqlDriver, id: string, title = "Arrival"): Promise<void> {
    await sql.query(
      `UPDATE tonight_movies
          SET title = $3, year = $4, imdb_id = $5
        WHERE user_id = $1 AND id = $2`,
      [ALICE, id, title, 2016, null],
    );
  },

  /** The old filing replacement: delete the lot, write what is left. */
  async refile(sql: SqlDriver, id: string, vibes: string[]): Promise<void> {
    await sql.query(`DELETE FROM tonight_mix_movies WHERE user_id = $1 AND movie_id = $2`, [
      ALICE,
      id,
    ]);
    for (const vibe of vibes) {
      await sql.query(
        `INSERT INTO tonight_mix_movies (user_id, mix_id, movie_id)
         SELECT $1, m.id, $3 FROM tonight_mixes AS m WHERE m.user_id = $1 AND m.name = $2`,
        [ALICE, vibe, id],
      );
    }
  },

  /** The old `deleteVibe`: by id, and nothing said about the films in it. */
  async deleteVibe(sql: SqlDriver, name: string): Promise<void> {
    await sql.query(`DELETE FROM tonight_mixes WHERE user_id = $1 AND name = $2`, [ALICE, name]);
  },

  async createVibe(sql: SqlDriver, name: string, genre: string): Promise<void> {
    await sql.query(
      `INSERT INTO tonight_genres (user_id, name, instruction) VALUES ($1, $2, 'Mine.')
       ON CONFLICT DO NOTHING`,
      [ALICE, genre],
    );
    const [vibe] = await sql.query<{ id: string }>(
      `INSERT INTO tonight_mixes (user_id, name, instruction) VALUES ($1, $2, 'Tense.')
       RETURNING id`,
      [ALICE, name],
    );
    await sql.query(
      `INSERT INTO tonight_mix_genres (user_id, mix_id, genre_id, position)
       SELECT $1, $2, g.id, 0 FROM tonight_genres AS g WHERE g.user_id = $1 AND g.name = $3`,
      [ALICE, vibe!.id, genre],
    );
  },
};

/** One movie's stamps, to the microsecond, as text so they compare exactly. */
async function stamps(
  sql: SqlDriver,
  title: string,
): Promise<{ created: string | null; updated: string }> {
  const [row] = await sql.query<{ created: string | null; updated: string }>(
    `SELECT to_char(created_at, 'YYYY-MM-DD HH24:MI:SS.US') AS created,
            to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS.US') AS updated
       FROM tonight_movies WHERE user_id = $1 AND title = $2`,
    [ALICE, title],
  );
  return row!;
}

test("v6 leaves a pre-existing movie with no creation time and one baseline", async () => {
  const sql = await fresh();
  await migrate(sql, upTo(5));
  for (const title of ["Arrival", "Moon"]) await oldCode.createMovie(sql, title);

  await migrate(sql, TASTE_SCHEMA);

  const [tracking] = await sql.query<{ applied: string }>(
    `SELECT to_char(applied_at, 'YYYY-MM-DD HH24:MI:SS.US') AS applied
       FROM schema_migrations WHERE module = 'taste' AND version = 6`,
  );

  for (const title of ["Arrival", "Moon"]) {
    const one = await stamps(sql, title);
    // Not the migration's clock, and not a guess: nobody wrote this down, so
    // nothing stands in its place. A value here would be indistinguishable from
    // a real one and would be wrong.
    assert.equal(one.created, null, `${title} was given a creation time it never had`);
    // A baseline instead — shared by every legacy row and equal to the migration's
    // own tracking row, so it reads as a floor rather than as an event.
    assert.equal(one.updated, tracking!.applied, `${title} baseline`);
  }

  // And it survives as a movie: the store reads it back, creation unknown.
  const { movies } = await sqlTasteStore(sql, { id: ALICE }).taste();
  assert.deepEqual(
    movies.map((one) => [one.title, one.createdAt]),
    [
      ["Arrival", null],
      ["Moon", null],
    ],
  );
  for (const movie of movies) assert.match(movie.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("a movie written after v6 knows when it was written", async () => {
  const sql = await fresh();
  await migrate(sql, TASTE_SCHEMA);
  await oldCode.createMovie(sql, "Arrival");

  const one = await stamps(sql, "Arrival");
  assert.notEqual(one.created, null, "a movie written under v6 has no creation time");
  assert.equal(one.created, one.updated, "nothing has happened to it yet");
});

test("the old build still dates a movie it edits, without naming the column", async () => {
  // Written before the migration and edited after it, which is the arrangement
  // this whole trigger exists for — and it makes the assertion exact rather than
  // a race against the clock. The film's stamp starts at the migration's own
  // baseline, so "it moved" is a comparison across a migration rather than
  // between two statements that can land in the same millisecond.
  const sql = await fresh();
  await migrate(sql, upTo(5));
  const id = await oldCode.createMovie(sql, "Arrival");
  await migrate(sql, TASTE_SCHEMA);

  const was = await stamps(sql, "Arrival");
  assert.equal(was.created, null, "a legacy row was given a creation time");

  await oldCode.updateMovie(sql, id);

  const now = await stamps(sql, "Arrival");
  assert.ok(now.updated > was.updated, `old-build update: ${now.updated} is not after ${was.updated}`);
  // Still unknown. An update must not invent what an insert did not record.
  assert.equal(now.created, null, "the old build invented a creation time");
});

test("the old build still dates a movie whose filing it replaces", async () => {
  const sql = await fresh();
  await migrate(sql, upTo(5));
  await oldCode.createVibe(sql, "Space Tension", "Sci-Fi");
  const id = await oldCode.createMovie(sql, "Arrival", ["Space Tension"]);
  await migrate(sql, TASTE_SCHEMA);
  const was = await stamps(sql, "Arrival");

  // Taken out of every vibe, by a build that writes no timestamp and does not
  // touch the movie's own row on this path at all.
  await oldCode.refile(sql, id, []);

  const now = await stamps(sql, "Arrival");
  assert.ok(now.updated > was.updated, `old-build refile: ${now.updated} is not after ${was.updated}`);
});

test("the old build deleting a vibe still dates the films that were in it", async () => {
  const sql = await fresh();
  await migrate(sql, upTo(5));
  await oldCode.createVibe(sql, "Space Tension", "Sci-Fi");
  await oldCode.createMovie(sql, "Arrival", ["Space Tension"]);
  await oldCode.createMovie(sql, "Moon");
  await migrate(sql, TASTE_SCHEMA);

  const filedWas = await stamps(sql, "Arrival");
  const looseWas = await stamps(sql, "Moon");

  // The films are neither named nor written by this statement. Their reference
  // rows go with the vibe, and that is the only thing the database sees.
  await oldCode.deleteVibe(sql, "Space Tension");

  const filedNow = await stamps(sql, "Arrival");
  assert.ok(
    filedNow.updated > filedWas.updated,
    `old-build vibe deletion: ${filedNow.updated} is not after ${filedWas.updated}`,
  );
  assert.equal(filedNow.created, filedWas.created);
  // A film that was not in it did not change, and its stamp says so.
  assert.deepEqual(await stamps(sql, "Moon"), looseWas);
});

/**
 * How the film-identity migration is deployed, asserted rather than promised.
 *
 * This replaces a stronger guarantee, and the swap is deliberate. The taste
 * store used to be deployable *before* its own migration: every statement it
 * ran worked against the schema as it was, so a release could go out first and
 * the migration follow, with both builds writing at once and no window where
 * Tonight was down.
 *
 * Film identity cannot be shipped that way. Which two spellings are one film
 * stopped being Postgres' answer — it had to, because verdicts resolve the same
 * question in memory and the two folds disagree in both directions — so the
 * canonical name is now a column, and a build that has never heard of it cannot
 * write a movie once the column is required. Keeping the old guarantee would
 * have meant two releases and a period where the identity was unenforced.
 *
 * Tonight does not need zero downtime, and chose the window. What is asserted
 * here is that choice: the migration runs to completion with nobody writing,
 * and only then does the new build serve.
 */
test("the taste store requires its own migrations before it can serve", async () => {
  const sql = await fresh();
  await migrate(sql, upTo(7));

  // Before the migration, the current build does not half-work: it fails.
  // That is the property the window relies on — there is no state in which it
  // serves a user a wrong answer because a column is missing.
  const early = sqlTasteStore(sql, { id: ALICE });
  await assert.rejects(
    () => early.createMovie({ title: "Arrival", year: 2016, viewing: "seen" }),
    (error: unknown) => {
      assert.match(String((error as Error).message), /canonical_title/u);
      return true;
    },
    "the store wrote a movie against a schema that cannot hold one",
  );

  // The migration runs with nobody writing, and then the same build works.
  const remaining = TASTE_SCHEMA.migrations.filter((one) => one.version > 7).length;
  assert.equal(await migrate(sql, TASTE_SCHEMA), remaining);

  const store = sqlTasteStore(sql, { id: ALICE });
  await store.createMovie({ title: "Arrival", year: 2016, viewing: "seen" });
  assert.deepEqual(
    (await store.taste()).movies.map((movie) => [movie.title, movie.viewing]),
    [["Arrival", "seen"]],
  );
});

test("everything before film identity still deploys ahead of its migration", async () => {
  // The guarantee above is given up for one migration, not for the habit. The
  // v6 rollout's ordering is still real and still tested: the current vibe
  // deletion runs against the schema as it was before the stamps existed, which
  // is what stopped an old-build deletion from crossing an updateMovie while
  // both were live.
  const sql = await fresh();
  await migrate(sql, upTo(5));

  await oldCode.createVibe(sql, "Space Tension", "Sci-Fi");
  await oldCode.createMovie(sql, "Arrival", ["Space Tension"]);
  await oldCode.createMovie(sql, "Moon");

  // Read through SQL rather than the store, because the store is now a build
  // from after v9 and this is deliberately a database from before v6.
  await sql.query(
    `DELETE FROM tonight_mix_movies WHERE user_id = $1 AND mix_id IN
       (SELECT id FROM tonight_mixes WHERE user_id = $1 AND name = $2)`,
    [ALICE, "Space Tension"],
  );
  await sql.query(`DELETE FROM tonight_mixes WHERE user_id = $1 AND name = $2`, [ALICE, "Space Tension"]);

  const [{ count }] = await sql.query<{ count: string }>(
    `SELECT count(*) AS count FROM tonight_movies WHERE user_id = $1`,
    [ALICE],
  );
  assert.equal(Number(count), 2, "deleting a vibe took the films with it");

  // And the rest of the list still applies cleanly on top of that database.
  const remaining = TASTE_SCHEMA.migrations.filter((one) => one.version > 5).length;
  assert.equal(await migrate(sql, TASTE_SCHEMA), remaining);
});

/** Whether the database still has a thing of this kind by this name. */
async function present(sql: SqlDriver, kind: "column" | "trigger" | "function", name: string) {
  const asked = {
    column: `SELECT count(*) AS count FROM information_schema.columns
              WHERE table_name = 'tonight_movies' AND column_name = $1`,
    trigger: `SELECT count(*) AS count FROM information_schema.triggers
               WHERE event_object_table = 'tonight_movies' AND trigger_name = $1`,
    function: `SELECT count(*) AS count FROM pg_proc WHERE proname = $1`,
  }[kind];
  const [row] = await sql.query<{ count: string }>(asked, [name]);
  return Number(row!.count) > 0;
}

test("v7 takes the bridge away, and only the bridge", async () => {
  // The other half of v5. Everything it removes existed so that two builds could
  // write the same film at once, and there has been one build for a long time.
  const sql = await fresh();
  await migrate(sql, upTo(5));

  for (const [kind, name] of [
    ["column", "watched"],
    ["column", "liked"],
    ["trigger", "tonight_movies_state_sync"],
    ["function", "tonight_movies_state_sync"],
    ["function", "tonight_movie_state_of"],
    ["function", "tonight_movie_watched_of"],
    ["function", "tonight_movie_liked_of"],
  ] as const) {
    assert.equal(await present(sql, kind, name), true, `${kind} ${name} was not there to remove`);
  }

  await migrate(sql, upTo(7));

  for (const [kind, name] of [
    ["column", "watched"],
    ["column", "liked"],
    ["trigger", "tonight_movies_state_sync"],
    ["function", "tonight_movies_state_sync"],
    ["function", "tonight_movie_state_of"],
    ["function", "tonight_movie_watched_of"],
    ["function", "tonight_movie_liked_of"],
  ] as const) {
    assert.equal(await present(sql, kind, name), false, `${kind} ${name} survived v7`);
  }

  // And nothing else went with it. v6's triggers are on the same table and were
  // added after the ones being dropped, which is exactly how a contract migration
  // takes too much. `state` goes too, but in v12 and for its own reasons.
  assert.equal(await present(sql, "column", "state"), true, "v7 dropped state as well");
  assert.equal(await present(sql, "trigger", "tonight_movies_written_at"), true, "v6 lost a trigger");
  assert.equal(await present(sql, "function", "tonight_written_at"), true, "v6 lost its function");
  assert.equal(await present(sql, "function", "tonight_mix_movies_touch"), true, "v6 lost a touch");
});

test("what the user said survives the contract migration, on both axes", async () => {
  // The whole point of the two representations was that neither of them lost
  // anything. v7 dropped one; v10-v12 split the survivor into a viewing fact and
  // a verdict, and every row still has to arrive with both halves of what it
  // meant.
  const sql = await fresh();
  await migrate(sql, upTo(4));
  for (const [what, watched, liked] of BACKFILL) await oldCodeInsert(sql, what, watched, liked);
  await migrate(sql, upTo(5));

  const before = await sql.query<{ title: string; state: string | null }>(
    `SELECT title, state FROM tonight_movies WHERE user_id = $1 ORDER BY title`,
    [ALICE],
  );

  await migrate(sql, TASTE_SCHEMA);
  await migrate(sql, VERDICTS_SCHEMA);

  // Every state maps to the viewing it implied, and the three evaluative ones
  // each leave a verdict carrying what they said.
  const VIEWING_OF: Record<string, string> = {
    not_seen: "unseen",
    seen: "seen",
    liked: "seen",
    loved: "seen",
    disliked: "seen",
  };
  const { movies } = await sqlTasteStore(sql, { id: ALICE }).taste();
  assert.equal(movies.length, BACKFILL.length);
  assert.deepEqual(
    Object.fromEntries(movies.map((one) => [one.title, one.viewing])),
    Object.fromEntries(
      before.map((row) => [row.title, row.state === null ? null : VIEWING_OF[row.state]]),
    ),
  );

  const judged = await sql.query<{ title: string; judgement: string }>(
    `SELECT title, judgement FROM tonight_verdict_acts WHERE user_id = $1 ORDER BY title`,
    [ALICE],
  );
  assert.deepEqual(
    judged,
    before
      .filter((row) => row.state !== null && ["liked", "loved", "disliked"].includes(row.state))
      .map((row) => ({ title: row.title, judgement: row.state })),
    "an opinion was lost or invented on the way to the verdict store",
  );
});

test("a viewing is still written and read after the contract migration", async () => {
  // Two triggers have been dropped from this table over its life and a column
  // with it. Taking them away must leave ordinary writing exactly as it was.
  const sql = await fresh();
  await migrate(sql, TASTE_SCHEMA);

  const store = sqlTasteStore(sql, { id: ALICE });
  await store.createMovie({ title: "Arrival", year: 2016, viewing: "seen" });
  await store.updateMovie("Arrival", 2016, { viewing: "unseen" });
  await store.createMovie({ title: "Moon", year: 2009 });

  const { movies } = await store.taste();
  assert.deepEqual(
    movies.map((one) => [one.title, one.viewing]),
    [
      ["Arrival", "unseen"],
      ["Moon", null],
    ],
  );

  // Silence is still not a statement, and the check refuses anything that is
  // not one of the two — an opinion included, which is what the column used to
  // accept and must never accept again.
  for (const wrong of ["neutral", "liked", "loved", "disliked", "not_seen"]) {
    await assert.rejects(
      sql.query(
        `INSERT INTO tonight_movies (user_id, title, canonical_title, year, viewing)
                -- The canonical name is the film's identity from v9 on; a raw row
                -- that omitted it would be refused for that rather than for what
                -- this contract is about.
                VALUES ($1, 'x', 'x', 2000, $2)`,
        [ALICE, wrong],
      ),
      (error: unknown) => (error as { code?: string }).code === "23514",
      wrong,
    );
  }
});

test("a caller cannot set either stamp, in any build", async () => {
  const sql = await fresh();
  await migrate(sql, TASTE_SCHEMA);

  // Named outright, which no build does and the schema has no reason to allow.
  await sql.query(
    `INSERT INTO tonight_movies (user_id, title, canonical_title, year, viewing, created_at, updated_at)
     VALUES ($1, 'Arrival', 'arrival', 2016, 'seen', '1999-01-01Z', '1999-01-01Z')`,
    [ALICE],
  );
  const [fresh1] = await sql.query<{ old: boolean }>(
    `SELECT created_at < now() - interval '1 hour' AS old FROM tonight_movies
      WHERE user_id = $1 AND title = 'Arrival'`,
    [ALICE],
  );
  assert.equal(fresh1!.old, false, "an insert set its own creation time");

  const was = await stamps(sql, "Arrival");
  await sql.query(
    `UPDATE tonight_movies SET created_at = '1999-01-01Z', updated_at = '1999-01-01Z'
      WHERE user_id = $1 AND title = 'Arrival'`,
    [ALICE],
  );
  const now = await stamps(sql, "Arrival");
  // Asked of the values rather than of the clock: what was sent is what must not
  // be stored, and no elapsed time is needed to see that.
  assert.equal(now.created, was.created, "an update rewrote a creation time");
  assert.notEqual(now.updated, "1999-01-01 00:00:00.000000", "an update set its own change time");
});

/* ------------------------------ v10-v12: viewing, verdicts, and the column that went */

/**
 * The conversion, held to the one thing it must not do.
 *
 * A migrated act is the *base* beneath whatever the user has said since. Dating
 * it by when the conversion happened to run would make a years-old filing
 * supersede a verdict given last week, which is the failure this whole section
 * exists to prevent — so every case below is about where in a history the
 * migrated act lands.
 *
 * The rest is arithmetic: every legacy state maps to the viewing it implied,
 * and nothing about the film moves while that happens.
 */

/** A movie as the pre-v10 build wrote one, with a state and an optional date. */
async function legacyMovie(
  sql: SqlDriver,
  title: string,
  state: string | null,
  createdAt: string | null = null,
): Promise<void> {
  await sql.query(
    `INSERT INTO tonight_movies (user_id, title, canonical_title, year, state, created_at, updated_at)
     VALUES ($1, $2, lower($2), 2016, $3, $4, now())`,
    [ALICE, title, state, createdAt],
  );
  if (createdAt === null) return;
  // The stamp trigger overwrites what an insert names, so the date is set after
  // it — the same way v9's backfill works around the same trigger.
  await sql.exec("ALTER TABLE tonight_movies DISABLE TRIGGER tonight_movies_written_at;");
  await sql.query(`UPDATE tonight_movies SET created_at = $2 WHERE user_id = $1 AND title = $3`, [
    ALICE,
    createdAt,
    title,
  ]);
  await sql.exec("ALTER TABLE tonight_movies ENABLE TRIGGER tonight_movies_written_at;");
}

/**
 * Everything in the verdict store for one film, oldest first.
 *
 * Grouped the way the domain groups films rather than by `lower(title)`: two
 * spellings of one film are one history, and SQL cannot run that rule — which is
 * the whole reason the conversion is code.
 */
async function acts(sql: SqlDriver, title: string, year = 2016) {
  const { filmKey } = await import("../films/identity.ts");
  const wanted = filmKey({ title, year });
  const all = await sql.query<{
    title: string;
    year: number;
    said: string;
    judgement: string | null;
    told: string | null;
    said_at: Date;
    seq: string;
  }>(
    `SELECT title, year, said, judgement, told, said_at, seq FROM tonight_verdict_acts
      WHERE user_id = $1 ORDER BY said_at, seq`,
    [ALICE],
  );
  return all.filter((one) => filmKey(one) === wanted);
}

/** A verdict as the user's own build would have written one. */
async function realVerdict(sql: SqlDriver, title: string, judgement: string, at: string) {
  await sql.query(
    `INSERT INTO tonight_verdict_acts
       (user_id, said, title, year, said_at, told, about, judgement)
     VALUES ($1, 'verdict', $2, 2016, $3, 'volunteered', 'judgement', $4)`,
    [ALICE, title, at, judgement],
  );
}

/** Up to v9 on taste, and the verdict store ready — the state before v10. */
async function beforeTheSplit(): Promise<SqlDriver> {
  const sql = await fresh();
  await migrate(sql, upTo(9));
  await migrate(sql, VERDICTS_SCHEMA);
  return sql;
}

test("every legacy state becomes the viewing it implied, and nothing else moves", async () => {
  const sql = await beforeTheSplit();
  for (const [title, state] of [
    ["Nothing", null],
    ["Unseen", "not_seen"],
    ["Watched", "seen"],
    ["Liked", "liked"],
    ["Loved", "loved"],
    ["Disliked", "disliked"],
  ] as const) {
    await legacyMovie(sql, title, state);
  }

  // Everything about the films, before, as a whole row rather than a field list.
  const shape = `SELECT title, canonical_title, year, imdb_id, created_at, updated_at
                   FROM tonight_movies WHERE user_id = $1 ORDER BY title`;
  const before = await sql.query(shape, [ALICE]);

  await migrate(sql, TASTE_SCHEMA);

  assert.deepEqual(
    await sql.query<{ title: string; viewing: string | null }>(
      `SELECT title, viewing FROM tonight_movies WHERE user_id = $1 ORDER BY title`,
      [ALICE],
    ),
    [
      { title: "Disliked", viewing: "seen" },
      { title: "Liked", viewing: "seen" },
      { title: "Loved", viewing: "seen" },
      { title: "Nothing", viewing: null },
      { title: "Unseen", viewing: "unseen" },
      { title: "Watched", viewing: "seen" },
    ],
  );

  // Identity, metadata and both stamps are exactly as they were. `updated_at` in
  // particular: it is on the read, so moving it would tell every user that every
  // film they have was touched by a migration.
  assert.deepEqual(await sql.query(shape, [ALICE]), before, "the backfill moved something else");

  // And the three opinions are verdicts now, one each, and nothing else is.
  const written = await sql.query<{ title: string; judgement: string; told: string; about: string }>(
    `SELECT title, judgement, told, about FROM tonight_verdict_acts WHERE user_id = $1 ORDER BY title`,
    [ALICE],
  );
  assert.deepEqual(written, [
    { title: "Disliked", judgement: "disliked", told: "volunteered", about: "judgement" },
    { title: "Liked", judgement: "liked", told: "volunteered", about: "judgement" },
    { title: "Loved", judgement: "loved", told: "volunteered", about: "judgement" },
  ]);
});

test("a film's vibes and its IMDb id are untouched by the conversion", async () => {
  const sql = await beforeTheSplit();
  await sql.query(
    `INSERT INTO tonight_genres (user_id, name, instruction) VALUES ($1, 'Slow', 'takes its time')`,
    [ALICE],
  );
  await sql.query(
    `INSERT INTO tonight_mixes (user_id, name, instruction) VALUES ($1, 'Long Nights', 'room')`,
    [ALICE],
  );
  await sql.query(
    `INSERT INTO tonight_movies (user_id, title, canonical_title, year, imdb_id, state)
     VALUES ($1, 'Heat', 'heat', 1995, 'tt0113277', 'loved')`,
    [ALICE],
  );
  await sql.query(
    `INSERT INTO tonight_mix_movies (user_id, mix_id, movie_id)
     SELECT $1, x.id, f.id FROM tonight_mixes AS x, tonight_movies AS f
      WHERE x.user_id = $1 AND f.user_id = $1`,
    [ALICE],
  );

  await migrate(sql, TASTE_SCHEMA);

  const { movies } = await sqlTasteStore(sql, { id: ALICE }).taste();
  assert.deepEqual(
    movies.map((one) => [one.title, one.year, one.imdbId, one.viewing, one.vibes]),
    [["Heat", 1995, "tt0113277", "seen", ["Long Nights"]]],
  );
});

test("with no history, the migrated act is dated by the film's own creation", async () => {
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "Heat", "loved", "2020-05-05T10:00:00.000Z");
  await migrate(sql, TASTE_SCHEMA);

  const [act] = await acts(sql, "Heat");
  assert.equal(act?.said_at.toISOString(), "2020-05-05T10:00:00.000Z");
});

test("a film older than the created_at column is dated by the v6 baseline", async () => {
  // `created_at` is genuinely null for a row that predates v6 — nobody wrote the
  // moment down. The baseline is the earliest instant anyone can honestly say
  // the film already existed, and it is not `updated_at`, which moves whenever
  // anything about the film changes.
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "Heat", "loved", null);
  // Through the trigger the stamp cannot be cleared — it keeps `OLD.created_at`
  // on every update — so this is how a row that predates v6 is reproduced.
  await sql.exec("ALTER TABLE tonight_movies DISABLE TRIGGER tonight_movies_written_at;");
  await sql.query(`UPDATE tonight_movies SET created_at = NULL WHERE user_id = $1`, [ALICE]);
  await sql.exec("ALTER TABLE tonight_movies ENABLE TRIGGER tonight_movies_written_at;");

  const [baseline] = await sql.query<{ applied_at: Date }>(
    "SELECT applied_at FROM schema_migrations WHERE module = 'taste' AND version = 6",
  );
  await migrate(sql, TASTE_SCHEMA);

  const [act] = await acts(sql, "Heat");
  assert.equal(act?.said_at.getTime(), baseline!.applied_at.getTime());
});

test("a real verdict stands over the migrated one, however old the film is", async () => {
  // The case this dating exists for: a film filed years ago and an opinion given
  // last week. Whatever the conversion does, the recent word has to win.
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "Heat", "loved", "2020-05-05T10:00:00.000Z");
  await realVerdict(sql, "Heat", "disliked", "2026-01-01T20:00:00.000Z");

  await migrate(sql, TASTE_SCHEMA);

  const history = await acts(sql, "Heat");
  assert.deepEqual(history.map((one) => one.judgement), ["loved", "disliked"]);
  assert.equal(
    (await sqlVerdictStore(sql, { id: ALICE } as never).standing())[0]?.judgement,
    "disliked",
    "the migrated act displaced a verdict the user actually gave",
  );
});

test("a migrated act is dated under history that is older than the film's row", async () => {
  // The awkward case: the verdict predates the Movie's own creation stamp, which
  // happens when a film is saved after it was talked about. `baseAt` alone would
  // put the migrated act on top of it, so it is placed a millisecond earlier
  // instead.
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "Heat", "loved", "2026-06-01T10:00:00.000Z");
  await realVerdict(sql, "Heat", "disliked", "2020-01-01T20:00:00.000Z");

  await migrate(sql, TASTE_SCHEMA);

  const history = await acts(sql, "Heat");
  assert.deepEqual(history.map((one) => one.judgement), ["loved", "disliked"]);
  assert.equal(history[0]?.said_at.toISOString(), "2020-01-01T19:59:59.999Z");
});

test("an equal instant still leaves the real act standing", async () => {
  // Two acts in one millisecond are separated by `seq`, which Postgres allocates
  // — so a migrated act dated exactly at the real one would be ordered by
  // insertion and win. The millisecond step is what stops that.
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "Heat", "loved", "2026-01-01T20:00:00.000Z");
  await realVerdict(sql, "Heat", "disliked", "2026-01-01T20:00:00.000Z");

  await migrate(sql, TASTE_SCHEMA);

  assert.equal(
    (await sqlVerdictStore(sql, { id: ALICE } as never).standing())[0]?.judgement,
    "disliked",
    "an act written later won a tie it should have lost",
  );
});

test("a standing not-ever is not displaced by a migrated judgement", async () => {
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "Heat", "loved", "2020-05-05T10:00:00.000Z");
  await sql.query(
    `INSERT INTO tonight_verdict_acts (user_id, said, title, year, said_at, told, about, reach)
     VALUES ($1, 'verdict', 'Heat', 2016, '2026-01-01T20:00:00.000Z', 'confirmed', 'rejection', 'not-ever')`,
    [ALICE],
  );

  await migrate(sql, TASTE_SCHEMA);

  const [standing] = await sqlVerdictStore(sql, { id: ALICE } as never).standing();
  assert.equal(standing?.rejected, "not-ever");
  assert.equal(standing?.judgement, undefined, "the refusal became a judgement");
});

test("a withdrawal still silences the migrated act it now sits above", async () => {
  // The user took back what they said about this film. A migrated act arriving
  // underneath the withdrawal must stay withdrawn — a conversion cannot revive
  // an opinion somebody retracted.
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "Heat", "loved", "2020-05-05T10:00:00.000Z");
  await realVerdict(sql, "Heat", "disliked", "2026-01-01T20:00:00.000Z");
  await sql.query(
    `INSERT INTO tonight_verdict_acts (user_id, said, title, year, said_at)
     VALUES ($1, 'withdrawal', 'Heat', 2016, '2026-01-02T20:00:00.000Z')`,
    [ALICE],
  );

  await migrate(sql, TASTE_SCHEMA);

  assert.deepEqual(
    await sqlVerdictStore(sql, { id: ALICE } as never).standing(),
    [],
    "a migrated act survived a withdrawal that came after it",
  );
});

test("a not-tonight leaves the migrated judgement standing everywhere else", async () => {
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "Heat", "loved", "2020-05-05T10:00:00.000Z");
  await sql.query(
    `INSERT INTO tonight_verdict_acts
       (user_id, said, title, year, occasion, said_at, told, about, reach)
     VALUES ($1, 'verdict', 'Heat', 2016, 'tue', '2026-01-01T20:00:00.000Z', 'confirmed', 'rejection', 'not-tonight')`,
    [ALICE],
  );

  await migrate(sql, TASTE_SCHEMA);

  const standing = await sqlVerdictStore(sql, { id: ALICE } as never).standing();
  const global = standing.find((one) => one.occasion === undefined);
  const evening = standing.find((one) => one.occasion === "tue");
  assert.equal(global?.judgement, "loved", "an evening's refusal took the base with it");
  assert.equal(evening?.rejected, "not-tonight");
});

test("two spellings of one film share a history; two years do not", async () => {
  // Matched the way the domain matches, not by raw spelling and not by
  // `lower()`. The conversion has to find the history a differently-spelled act
  // belongs to, and must not merge two films that only share a title.
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "  BLACK   bag ", "loved", "2020-05-05T10:00:00.000Z");
  await realVerdict(sql, "black bag", "disliked", "2019-01-01T20:00:00.000Z");

  await sql.query(
    `INSERT INTO tonight_movies (user_id, title, canonical_title, year, state)
     VALUES ($1, 'Heat', 'heat', 1995, 'loved')`,
    [ALICE],
  );
  await sql.query(
    `INSERT INTO tonight_verdict_acts (user_id, said, title, year, said_at, told, about, judgement)
     VALUES ($1, 'verdict', 'Heat', 1986, '2019-01-01T20:00:00.000Z', 'volunteered', 'judgement', 'disliked')`,
    [ALICE],
  );

  await migrate(sql, TASTE_SCHEMA);

  // One history: the migrated act was placed under the act it shares a film with.
  const bag = await acts(sql, "BLACK bag");
  assert.equal(bag.length, 2, "two spellings were read as two films");
  assert.equal(bag[0]?.said_at.toISOString(), "2019-01-01T19:59:59.999Z");

  // Two films: Heat 1995 and Heat 1986 share a title and nothing else, so the
  // 1995 migration is dated by its own film rather than by the 1986 history.
  const heat = await sql.query<{ year: number; said_at: Date }>(
    `SELECT year, said_at FROM tonight_verdict_acts
      WHERE user_id = $1 AND title = 'Heat' ORDER BY year`,
    [ALICE],
  );
  assert.deepEqual(heat.map((one) => one.year), [1986, 1995]);
  assert.notEqual(heat[1]?.said_at.toISOString(), "2019-01-01T19:59:59.999Z");
});

test("the conversion is one transaction: running twice adds nothing", async () => {
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "Heat", "loved", "2020-05-05T10:00:00.000Z");

  assert.ok((await migrate(sql, TASTE_SCHEMA)) > 0);
  const once = await acts(sql, "Heat");
  assert.equal(once.length, 1);

  // The claim row is the guard, and it is the same guard as every other step.
  assert.equal(await migrate(sql, TASTE_SCHEMA), 0, "a second run applied something");
  assert.deepEqual(await acts(sql, "Heat"), once, "a second run wrote a second act");
});

test("a failing conversion leaves nothing behind, and a retry writes exactly one act", async () => {
  // The transaction is what makes a partial conversion impossible. Broken here
  // by taking away the table the step writes into while leaving the claim that
  // says it exists — a real failure in the middle of the work rather than a
  // refusal before it starts, which is the case worth proving.
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "Heat", "loved", "2020-05-05T10:00:00.000Z");
  await legacyMovie(sql, "Solaris", "disliked", "2020-05-05T10:00:00.000Z");
  await sql.exec("DROP TABLE tonight_verdict_acts; DROP SEQUENCE tonight_verdict_acts_seq;");

  await assert.rejects(() => migrate(sql, TASTE_SCHEMA));

  // The version was not recorded, so it can be retried — and `viewing` was not
  // left half-populated either, because v10 committed on its own before this.
  const [claimed] = await sql.query(
    "SELECT version FROM schema_migrations WHERE module = 'taste' AND version = 11",
  );
  assert.equal(claimed, undefined, "a failed conversion recorded itself as applied");
  assert.equal(await present(sql, "column", "state"), true, "the contract step ran anyway");

  // Put the store back, and the retry converts each film exactly once.
  await sql.query("DELETE FROM schema_migrations WHERE module = 'verdicts'");
  await migrate(sql, VERDICTS_SCHEMA);
  await migrate(sql, TASTE_SCHEMA);
  assert.equal((await acts(sql, "Heat")).length, 1, "Heat was converted more or less than once");
  assert.equal((await acts(sql, "Solaris")).length, 1);
});

test("the conversion will not run before the store it writes to exists", async () => {
  // The one step that reaches across a module boundary. `migrate` satisfies the
  // need by bringing the verdict schema up first, so a caller migrating taste
  // alone still ends up with both — which is what the development store opener
  // and five suites do.
  const sql = await fresh();
  await migrate(sql, TASTE_SCHEMA);

  const [verdicts] = await sql.query<{ present: boolean }>(
    "SELECT to_regclass('tonight_verdict_acts') IS NOT NULL AS present",
  );
  assert.equal(verdicts?.present, true, "the taste migration did not bring up what it needs");
  assert.equal(await present(sql, "column", "state"), false, "the contract step did not run");
  assert.equal(await present(sql, "column", "viewing"), true);
});

test("a fresh database ends in the final schema, whatever order the modules run in", async () => {
  for (const order of [
    [TASTE_SCHEMA, VERDICTS_SCHEMA],
    [VERDICTS_SCHEMA, TASTE_SCHEMA],
  ]) {
    const sql = await fresh();
    for (const schema of order) await migrate(sql, schema);

    assert.equal(await present(sql, "column", "state"), false);
    assert.equal(await present(sql, "column", "viewing"), true);

    // And no legacy opinion was invented out of an empty table.
    const [count] = await sql.query<{ n: string }>("SELECT count(*) AS n FROM tonight_verdict_acts");
    assert.equal(Number(count?.n), 0, "a fresh install manufactured a verdict");
  }
});

test("a legacy instant is normalised to the resolution a verdict keeps", async () => {
  // The convention, stated as a contract. `created_at` is a `timestamptz` and
  // carries microseconds; a verdict's `at` is the domain's instant and has
  // always been milliseconds. The conversion normalises rather than inventing a
  // finer representation for a precision the destination does not otherwise
  // keep — and the test uses a source with real sub-millisecond digits so that
  // the normalisation is proved rather than assumed.
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "Heat", "loved", "2020-05-05T10:00:00.123456Z");

  // The source really does hold the microseconds, so what follows is about the
  // conversion rather than about what Postgres stored.
  const [stored] = await sql.query<{ at: string }>(
    `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS at
       FROM tonight_movies WHERE user_id = $1`,
    [ALICE],
  );
  assert.equal(stored?.at, "2020-05-05T10:00:00.123456");

  await migrate(sql, TASTE_SCHEMA);

  const [written] = await sql.query<{ at: string }>(
    `SELECT to_char(said_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS at
       FROM tonight_verdict_acts WHERE user_id = $1`,
    [ALICE],
  );
  assert.equal(written?.at, "2020-05-05T10:00:00.123000", "the microseconds were not normalised away");
});

test("normalising never closes the gap that keeps a migrated act underneath history", async () => {
  // The half that could have gone wrong. `Date` truncates toward zero, so a
  // normalised instant is never *later* than what it came from — and the rule
  // then subtracts a further millisecond. Both sides carry microseconds here,
  // and the migrated act still has to sort strictly before the real one by its
  // true value rather than only by its normalised one.
  const sql = await beforeTheSplit();
  await legacyMovie(sql, "Heat", "loved", "2020-05-05T10:00:00.999900Z");
  await sql.query(
    `INSERT INTO tonight_verdict_acts
       (user_id, said, title, year, said_at, told, about, judgement)
     VALUES ($1, 'verdict', 'Heat', 2016, '2020-05-05T10:00:00.000200Z', 'volunteered', 'judgement', 'disliked')`,
    [ALICE],
  );

  await migrate(sql, TASTE_SCHEMA);

  const history = await sql.query<{ judgement: string; at: string }>(
    `SELECT judgement, to_char(said_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS at
       FROM tonight_verdict_acts WHERE user_id = $1 ORDER BY said_at, seq`,
    [ALICE],
  );
  assert.deepEqual(
    history.map((one) => one.judgement),
    ["loved", "disliked"],
    "the migrated act did not sort underneath the real one",
  );
  assert.equal(history[0]?.at, "2020-05-05T09:59:59.999000");

  // And the store agrees, which is the answer that actually matters.
  assert.equal(
    (await sqlVerdictStore(sql, { id: ALICE } as never).standing())[0]?.judgement,
    "disliked",
  );
});

test("one user's legacy opinion cannot be dated by another user's history", async () => {
  // Grouping is by user *and* film, and the dates are arranged so that dropping
  // the user is visible.
  //
  // Ben's verdict is **older** than Ana's film, and that ordering is the whole
  // test. With the user in the key, Ana has no history and her act is dated by
  // her own film: 2020. Without it, Ben's 2019 act becomes the oldest known act
  // about "Heat", the strictly-before rule applies, and Ana's act backdates to
  // 2018 — a visible change, and the assertion below fails.
  //
  // The arrangement matters because the obvious one does not work. With Ben's
  // history *newer* than Ana's film, `min(2020, 2026 − 1ms)` is 2020 either way,
  // so a broken key would produce the correct answer and the test would pass
  // over the bug.
  const sql = await beforeTheSplit();
  const BEN = "google:ben";

  await legacyMovie(sql, "Heat", "loved", "2020-05-05T10:00:00.000Z");
  await legacyMovie(sql, "Solaris", "disliked", "2020-05-05T10:00:00.000Z");
  await sql.query(
    `INSERT INTO tonight_movies (user_id, title, canonical_title, year, state)
     VALUES ($1, 'Heat', 'heat', 2016, 'disliked')`,
    [BEN],
  );
  // Ben said something about the same film, years before Ana ever saved hers.
  await sql.query(
    `INSERT INTO tonight_verdict_acts
       (user_id, said, title, year, said_at, told, about, judgement)
     VALUES ($1, 'verdict', 'Heat', 2016, '2019-01-01T20:00:00.000Z', 'volunteered', 'judgement', 'liked')`,
    [BEN],
  );

  await migrate(sql, TASTE_SCHEMA);

  // Ana's act is dated by her own film, untouched by Ben having spoken.
  const ana = await sql.query<{ title: string; judgement: string; said_at: Date }>(
    `SELECT title, judgement, said_at FROM tonight_verdict_acts WHERE user_id = $1 ORDER BY title`,
    [ALICE],
  );
  assert.deepEqual(
    ana.map((one) => `${one.title}: ${one.judgement} @ ${one.said_at.toISOString()}`),
    [
      "Heat: loved @ 2020-05-05T10:00:00.000Z",
      "Solaris: disliked @ 2020-05-05T10:00:00.000Z",
    ],
    "Ana's acts were dated from somebody else's history",
  );

  // Solaris is the control: nobody else has ever mentioned it, so it is dated
  // the same way with or without the user in the key. Heat differing from it is
  // exactly what a dropped user_id would look like.
  assert.equal(
    ana[0]?.said_at.getTime(),
    ana[1]?.said_at.getTime(),
    "the film somebody else had spoken about was dated differently from the one nobody had",
  );

  // Ben keeps both of his, in the right order, and neither is Ana's.
  const ben = await sql.query<{ judgement: string }>(
    `SELECT judgement FROM tonight_verdict_acts WHERE user_id = $1 ORDER BY said_at, seq`,
    [BEN],
  );
  assert.deepEqual(ben.map((one) => one.judgement), ["disliked", "liked"]);

  // And what stands is each person's own.
  assert.equal(
    (await sqlVerdictStore(sql, { id: ALICE } as never).standing())[0]?.judgement,
    "loved",
  );
  assert.equal(
    (await sqlVerdictStore(sql, { id: BEN } as never).standing())[0]?.judgement,
    "liked",
  );
});
