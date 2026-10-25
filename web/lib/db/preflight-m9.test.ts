import assert from "node:assert/strict";
import test, { after } from "node:test";

import { stated, UNKNOWN, type Offer } from "../episodes/model.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../episodes/store/sql.ts";
import type { AuthenticatedUser } from "../identity.ts";
import type { SqlDriver } from "./driver.ts";
import { migrate, type SchemaModule } from "./migrate.ts";
import { embeddedDriver } from "./pglite.ts";
import { preflightM9 } from "./preflight-m9.ts";

/**
 * Episodes v3: every evening M8 could hold, carried over offer by offer — and
 * the three it refuses to guess about.
 *
 * Each test builds the M8 world (episodes at v2), writes rows the way the M8
 * build wrote them, and then upgrades. The expected answers are written out here
 * rather than read from the migration, so a migration that agreed with itself
 * and not with the plan would fail.
 */

const ALICE = "google:alice";
const BOB = "google:bob";

const opened: SqlDriver[] = [];
after(async () => {
  for (const driver of opened) await driver.close();
});

/** The episodes schema as M8 left it. */
const M8: SchemaModule = {
  module: EPISODES_SCHEMA.module,
  migrations: EPISODES_SCHEMA.migrations.filter((one) => one.version <= 2),
};

async function m8World(): Promise<SqlDriver> {
  const driver = await embeddedDriver();
  opened.push(driver);
  await migrate(driver, M8);
  return driver;
}

type LegacyOffer = { title: string; year: number; lead?: boolean; chosen?: boolean };

/** An evening written exactly as the M8 build wrote one. */
async function legacy(
  sql: SqlDriver,
  evening: {
    user?: string;
    request?: string;
    requestSource?: "observed" | "stated";
    watched?: boolean | null;
    finished?: boolean | null;
    offers: LegacyOffer[];
  },
): Promise<string> {
  const [row] = await sql.query<{ id: string }>(
    `INSERT INTO tonight_episodes (user_id, request, request_source, offered_source, watched, finished)
          VALUES ($1, $2, $3, 'observed', $4, $5)
       RETURNING id`,
    [
      evening.user ?? ALICE,
      evening.request ?? "something tense",
      evening.requestSource ?? "observed",
      evening.watched ?? null,
      evening.finished ?? null,
    ],
  );
  for (const [position, offer] of evening.offers.entries()) {
    await sql.query(
      `INSERT INTO tonight_episode_offers (user_id, episode, position, title, year, lead, chosen)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [evening.user ?? ALICE, row!.id, position, offer.title, offer.year, offer.lead ?? false, offer.chosen ?? false],
    );
  }
  return row!.id;
}

const versions = async (sql: SqlDriver) =>
  (
    await sql.query<{ version: number }>(
      "SELECT version FROM schema_migrations WHERE module = 'episodes' ORDER BY version",
    )
  ).map((row) => row.version);

/** Every row of both tables, and the ledger: what "nothing changed" is checked against. */
const everything = async (sql: SqlDriver) => [
  await sql.query("SELECT * FROM tonight_episodes ORDER BY id"),
  await sql.query("SELECT * FROM tonight_episode_offers ORDER BY episode, position"),
  await sql.query("SELECT module, version FROM schema_migrations ORDER BY module, version"),
];

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

const facts = (offer: Offer | undefined) =>
  offer && { chosen: offer.chosen, started: offer.started, finished: offer.finished, passed: offer.passed };

/* ---------------------------------------------------------- conversions */

test("every M8 evening shape converts as the plan says, and nothing else moves", async () => {
  const sql = await m8World();
  const ids = {
    offeredOnly: await legacy(sql, { offers: [{ title: "Prisoners", year: 2013, lead: true }, { title: "Zodiac", year: 2007 }] }),
    chosenOnly: await legacy(sql, {
      offers: [{ title: "Prisoners", year: 2013, lead: true }, { title: "Zodiac", year: 2007, chosen: true }],
    }),
    watchedYes: await legacy(sql, { watched: true, offers: [{ title: "Heat", year: 1995, lead: true, chosen: true }] }),
    watchedNo: await legacy(sql, { watched: false, offers: [{ title: "Heat", year: 1995, lead: true, chosen: true }] }),
    finishedOnly: await legacy(sql, { finished: true, offers: [{ title: "Heat", year: 1995, lead: true, chosen: true }] }),
    halfway: await legacy(sql, {
      watched: true,
      finished: false,
      offers: [{ title: "Heat", year: 1995, lead: true, chosen: true }, { title: "Cure", year: 1997 }],
    }),
    caseVariants: await legacy(sql, {
      requestSource: "stated",
      offers: [
        { title: "Dune", year: 2021, lead: true },
        { title: "DUNE", year: 2021 },
      ],
    }),
  };
  const before = await sql.query<{ id: string; request: string; request_source: string; offered_source: string; recorded_at: Date }>(
    "SELECT id, request, request_source, offered_source, recorded_at FROM tonight_episodes ORDER BY id",
  );
  const beforeOffers = await sql.query("SELECT episode, position, title, year, lead FROM tonight_episode_offers ORDER BY episode, position");

  await migrate(sql, EPISODES_SCHEMA);
  assert.deepEqual(await versions(sql), [1, 2, 3]);

  // Requests, sources, recording moments, ids, order and leads: untouched.
  assert.deepEqual(
    await sql.query("SELECT id, request, request_source, offered_source, recorded_at FROM tonight_episodes ORDER BY id"),
    before,
  );
  assert.deepEqual(
    await sql.query("SELECT episode, position, title, year, lead FROM tonight_episode_offers ORDER BY episode, position"),
    beforeOffers,
  );
  assert.deepEqual(
    await sql.query("SELECT DISTINCT offered FROM tonight_episode_offers"),
    [{ offered: true }],
    "an offer Tonight made became one they brought up",
  );

  const store = sqlEpisodeStore(sql, asUser(ALICE));
  const read = async (id: string) => (await store.episode(id)).offers;
  const none = { chosen: UNKNOWN, started: UNKNOWN, finished: UNKNOWN, passed: UNKNOWN };

  // Offered only: nothing known about anything.
  for (const offer of await read(ids.offeredOnly)) assert.deepEqual(facts(offer), none);

  // Chosen only: the choice and nothing else — and "not chosen" stays unknown, never a stated no.
  const [p, z] = await read(ids.chosenOnly);
  assert.deepEqual(facts(p), none, "M8's 'not chosen' (false = not said) became a stated no");
  assert.deepEqual(facts(z), { ...none, chosen: stated(true) });

  // The evening's outcomes land on the chosen film (D1).
  assert.deepEqual(facts((await read(ids.watchedYes))[0]), { ...none, chosen: stated(true), started: stated(true) });
  assert.deepEqual(facts((await read(ids.watchedNo))[0]), { ...none, chosen: stated(true), started: stated(false) });
  assert.deepEqual(
    facts((await read(ids.finishedOnly))[0]),
    { ...none, chosen: stated(true), started: stated(true), finished: stated(true) },
    "finished with watched unknown did not record the start (F2)",
  );
  const [heat, cure] = await read(ids.halfway);
  assert.deepEqual(facts(heat), { ...none, chosen: stated(true), started: stated(true), finished: stated(false) });
  assert.deepEqual(facts(cure), none, "an outcome reached a film nobody chose");

  // Two spellings stay two films, as they were.
  assert.deepEqual(
    (await read(ids.caseVariants)).map((offer) => offer.title),
    ["Dune", "DUNE"],
  );
  assert.equal((await store.episode(ids.caseVariants)).requestSource, "stated");

  // And the evening-level columns are gone.
  const columns = await sql.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'tonight_episodes' ORDER BY column_name",
  );
  assert.deepEqual(
    columns.map((one) => one.column_name),
    ["id", "offered_source", "recorded_at", "request", "request_source", "user_id"],
  );
});

test("a long legacy title migrates intact, and the evening stays correctable", async () => {
  const sql = await m8World();
  const title = "B".repeat(8_192);
  const id = await legacy(sql, { watched: true, offers: [{ title, year: 2000, lead: true, chosen: true }] });

  await migrate(sql, EPISODES_SCHEMA);

  const store = sqlEpisodeStore(sql, asUser(ALICE));
  const read = await store.episode(id);
  assert.equal(read.offers[0]?.title, title, "the title was truncated or folded");
  const fixed = await store.correct(id, { offers: [{ title, year: 2000, finished: true }] });
  assert.ok(!("forgotten" in fixed));
  assert.deepEqual(fixed.offers[0]?.finished, stated(true));
});

/* -------------------------------------------------------------- blockers */

test("outcomes with no chosen film are not guessed onto one: v3 refuses, says whose, and changes nothing", async () => {
  const sql = await m8World();
  const id = await legacy(sql, { watched: true, offers: [{ title: "Heat", year: 1995, lead: true }, { title: "Cure", year: 1997 }] });
  await legacy(sql, { user: BOB, offers: [{ title: "Heat", year: 1995, lead: true }] });
  const untouched = await everything(sql);

  const report = await preflightM9(sql);
  assert.ok(!report.applied);
  assert.deepEqual(report.found.unattributable, [{ userId: ALICE, episode: id }]);
  assert.equal(report.blocking.length, 1);

  await assert.rejects(
    () => migrate(sql, EPISODES_SCHEMA),
    (error: Error) => error.message.includes(report.blocking[0]!) && error.message.includes(`${ALICE} ${id}`),
  );
  assert.deepEqual(await versions(sql), [1, 2], "a refused v3 was recorded");
  assert.deepEqual(await everything(sql), untouched, "a refused v3 changed something");
});

test("an evening finished but not watched is not resolved by guessing: v3 refuses", async () => {
  const sql = await m8World();
  const id = await legacy(sql, {
    watched: false,
    finished: true,
    offers: [{ title: "Heat", year: 1995, lead: true, chosen: true }],
  });
  const untouched = await everything(sql);

  const report = await preflightM9(sql);
  assert.ok(!report.applied);
  assert.deepEqual(report.found.contradiction, [{ userId: ALICE, episode: id }]);

  await assert.rejects(() => migrate(sql, EPISODES_SCHEMA), (error: Error) => error.message.includes(`${ALICE} ${id}`));
  assert.deepEqual(await versions(sql), [1, 2]);
  assert.deepEqual(await everything(sql), untouched);
});

test("one evening offering the same film twice is refused, since identity is the title and year", async () => {
  const sql = await m8World();
  // The M8 model refused this; the M8 schema never did, so it is written raw.
  const id = await legacy(sql, {
    offers: [
      { title: "Heat", year: 1995, lead: true },
      { title: "Heat", year: 1995 },
    ],
  });
  const untouched = await everything(sql);

  const report = await preflightM9(sql);
  assert.ok(!report.applied);
  assert.deepEqual(report.found.duplicate, [{ userId: ALICE, episode: id, title: "Heat", year: 1995 }]);

  await assert.rejects(
    () => migrate(sql, EPISODES_SCHEMA),
    (error: Error) => error.message.includes(`${ALICE} ${id} "Heat" (1995)`),
  );
  assert.deepEqual(await versions(sql), [1, 2]);
  assert.deepEqual(await everything(sql), untouched);
});

/* ------------------------------------------------------------- pre-flight */

test("the pre-flight reports what v3 then does, by the same rules, and writes nothing", async () => {
  const sql = await m8World();
  await legacy(sql, { watched: true, offers: [{ title: "Heat", year: 1995, lead: true, chosen: true }] });
  await legacy(sql, { finished: false, offers: [{ title: "Cure", year: 1997, lead: true, chosen: true }] });
  await legacy(sql, { offers: [{ title: "Zodiac", year: 2007, lead: true }] });
  const untouched = await everything(sql);

  const statements: string[] = [];
  const recording: SqlDriver = {
    ...sql,
    transaction: (work) =>
      sql.transaction((tx) =>
        work({
          query: (text, params) => (statements.push(text), tx.query(text, params)),
          exec: (text) => (statements.push(text), tx.exec(text)),
        }),
      ),
  };
  const report = await preflightM9(recording);
  assert.match(statements[0] ?? "", /READ ONLY/u, "the pre-flight is not in a read-only transaction");
  assert.match(statements[0] ?? "", /REPEATABLE READ/u);
  assert.deepEqual(await everything(sql), untouched, "the pre-flight wrote something");

  assert.ok(!report.applied);
  assert.deepEqual(report.blocking, []);
  assert.equal(report.found.attributable, 2);

  // And the migration does exactly that: two evenings' outcomes moved.
  await migrate(sql, EPISODES_SCHEMA);
  const moved = await sql.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM tonight_episode_offers WHERE started IS NOT NULL OR finished IS NOT NULL",
  );
  assert.deepEqual(moved, [{ n: 2 }]);
  assert.deepEqual(await preflightM9(sql), { applied: true });
});

test("once v3 is recorded, the pre-flight answers applied without reading the dropped columns", async () => {
  const sql = await m8World();
  await migrate(sql, EPISODES_SCHEMA);
  const statements: string[] = [];
  const recording: SqlDriver = {
    ...sql,
    transaction: (work) =>
      sql.transaction((tx) =>
        work({
          query: (text, params) => (statements.push(text), tx.query(text, params)),
          exec: (text) => (statements.push(text), tx.exec(text)),
        }),
      ),
  };
  assert.deepEqual(await preflightM9(recording), { applied: true });
  assert.equal(
    statements.some((text) => /watched/u.test(text)),
    false,
    "the pre-flight read a column v3 dropped",
  );
});

/* ---------------------------------------------------- the build before M9 */

/**
 * The previous build against v3 fails loudly rather than misreading anything.
 *
 * The statements below are the M8 episode store's own, copied verbatim from
 * `818c667:web/lib/episodes/store/sql.ts`.
 */
test("the M8 build's own statements fail against v3, rather than misreading it", async () => {
  const sql = await m8World();
  const id = await legacy(sql, { watched: true, offers: [{ title: "Heat", year: 1995, lead: true, chosen: true }] });
  await migrate(sql, EPISODES_SCHEMA);

  const fails = (code: string) => (error: unknown) => (error as { code?: string } | null)?.code === code;

  // Reading an evening.
  await assert.rejects(
    sql.query(
      `SELECT id, request, request_source, offered_source, watched, finished, recorded_at
             FROM tonight_episodes
            WHERE user_id = $1 AND id = $2`,
      [ALICE, id],
    ),
    fails("42703"),
  );
  // Writing an evening.
  await assert.rejects(
    sql.query(
      `INSERT INTO tonight_episodes (user_id, request, request_source, offered_source, watched, finished)
                VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, recorded_at`,
      [ALICE, "something", "observed", "observed", null, null],
    ),
    fails("42703"),
  );
  // Writing an offer: `offered` is required and has no default.
  await assert.rejects(
    sql.query(
      `INSERT INTO tonight_episode_offers
                    (user_id, episode, position, title, year, lead, chosen)
                  VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ALICE, id, 5, "Cure", 1997, false, false],
    ),
    fails("23502"),
  );
});
