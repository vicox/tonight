import assert from "node:assert/strict";
import test, { after, before, describe, type TestContext } from "node:test";

import type { SqlDriver } from "../../db/driver.ts";
import { migrate, type SchemaModule } from "../../db/migrate.ts";
import { beginEpisode, EpisodeError } from "../model.ts";
import { EPISODES_SCHEMA } from "./schema.ts";
import { sqlEpisodeStore } from "./sql.ts";

/**
 * What only two connections can show about an evening.
 *
 * Identity inside an evening — one row per film — is enforced by the model on the
 * single write path, with no index on the title behind it. What makes that safe
 * is the evening's row lock: every write takes it before reading the evening, so
 * two writes to one evening are serialised and the second one sees the first.
 * A sequential test would pass against code that read before it locked, so each
 * case here holds the evening from a third connection, asserts the writers are
 * still blocked after `SETTLE`, and only then lets go.
 *
 * And the v3 conversion, once, against a real server rather than the embedded
 * one: same SQL, but the server the release will run it on.
 *
 * Runs only when `TEST_DATABASE_URL` names a real server.
 */

const URL = process.env.TEST_DATABASE_URL;

/** Long enough for a blocked statement to have reached the lock it waits on. */
const SETTLE = 400;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

if (!URL) {
  test("episode concurrency is not exercised without TEST_DATABASE_URL", () => {
    assert.ok(true);
  });
}

describe("episodes, two connections", { skip: URL ? false : "TEST_DATABASE_URL is not set" }, () => {
  const opened: SqlDriver[] = [];

  /** A connection that gives up on a lock rather than waiting for ever. */
  async function connection(): Promise<SqlDriver> {
    const { postgresDriver } = await import("../../db/postgres.ts");
    const separator = URL!.includes("?") ? "&" : "?";
    const driver = await postgresDriver(`${URL!}${separator}options=-c%20lock_timeout%3D15000`);
    opened.push(driver);
    return driver;
  }

  before(async () => {
    await migrate(await connection(), EPISODES_SCHEMA);
  });

  after(async () => {
    for (const driver of opened) await driver.close().catch(() => {});
  });

  async function fresh(driver: SqlDriver, mark: string) {
    const owner = { id: `google:episodes-concurrent-${mark}` };
    await driver.query(`DELETE FROM tonight_episodes WHERE user_id = $1`, [owner.id]);
    return owner;
  }

  /** Holds one evening's row until it is let go, and says when it has it. */
  function holdEvening(t: TestContext, driver: SqlDriver, owner: { id: string }, id: string) {
    let release!: () => void;
    let holding!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const ready = new Promise<void>((resolve) => (holding = resolve));
    const work = driver.transaction(async (tx) => {
      await tx.query(`SELECT id FROM tonight_episodes WHERE user_id = $1 AND id = $2 FOR UPDATE`, [
        owner.id,
        id,
      ]);
      holding();
      await held;
    });
    t.after(() => {
      release();
      return work.catch(() => {});
    });
    return { ready, release: () => release(), done: work };
  }

  /** Whether a promise has settled yet, without waiting for it. */
  async function settled(promise: Promise<unknown>): Promise<boolean> {
    let done = false;
    void promise.then(
      () => (done = true),
      () => (done = true),
    );
    await pause(0);
    return done;
  }

  test("two rounds adding the same film to one evening leave one row for it", async (t) => {
    const [a, b, holder] = [await connection(), await connection(), await connection()];
    const owner = await fresh(a, "same-film");
    const first = sqlEpisodeStore(a, owner);
    const second = sqlEpisodeStore(b, owner);

    const evening = await first.record(
      beginEpisode({ request: "something tense", offered: [{ title: "Heat", year: 1995, lead: true }] }),
    );

    const hold = holdEvening(t, holder, owner, evening.id);
    await hold.ready;

    const one = first.addRound(evening.id, { offered: [{ title: "Ronin", year: 1998, lead: true }] });
    await pause(SETTLE / 2);
    const two = second.addRound(evening.id, { offered: [{ title: "Ronin", year: 1998, lead: false }] });
    await pause(SETTLE);
    assert.equal(await settled(one), false, "the first round did not wait for the evening's lock");
    assert.equal(await settled(two), false, "the second round did not wait for the evening's lock");

    hold.release();
    await hold.done;
    await Promise.all([one, two]);

    const rows = await a.query<{ title: string; lead: boolean }>(
      `SELECT title, lead FROM tonight_episode_offers WHERE user_id = $1 AND episode = $2 ORDER BY position`,
      [owner.id, evening.id],
    );
    assert.deepEqual(
      rows.map((row) => row.title),
      ["Heat", "Ronin"],
      "the second round did not see the first, so the film was added twice",
    );
    assert.equal(rows[1]?.lead, true, "the lead given by the first round was lost");
  });

  test("a correction that empties an evening, then a round queued behind it, finds it gone", async (t) => {
    const [a, b, holder] = [await connection(), await connection(), await connection()];
    const owner = await fresh(a, "f6-race");
    const deleting = sqlEpisodeStore(a, owner);
    const adding = sqlEpisodeStore(b, owner);

    const evening = await deleting.record(
      beginEpisode({ offers: [{ title: "Heat", year: 1995, started: true }] }),
    );

    const hold = holdEvening(t, holder, owner, evening.id);
    await hold.ready;

    const correction = deleting.correct(evening.id, {
      offers: [{ title: "Heat", year: 1995, started: null }],
    });
    await pause(SETTLE / 2);
    const round = adding.addRound(evening.id, {
      offers: [{ title: "Ronin", year: 1998, chosen: true }],
    });
    await pause(SETTLE);
    assert.equal(await settled(correction), false, "the correction did not wait for the evening's lock");
    assert.equal(await settled(round), false, "the round did not wait for the evening's lock");

    hold.release();
    await hold.done;

    assert.deepEqual(await correction, { forgotten: evening.id });
    await assert.rejects(round, (error: unknown) => error instanceof EpisodeError && /No episode/.test(error.message));

    const left = await a.query(`SELECT id FROM tonight_episodes WHERE user_id = $1`, [owner.id]);
    assert.equal(left.length, 0, "the round brought a deleted evening back");
    const offers = await a.query(`SELECT id FROM tonight_episode_offers WHERE user_id = $1`, [owner.id]);
    assert.equal(offers.length, 0);
  });

  test("v3 converts an M8 evening on a real server exactly as on the embedded one", async () => {
    const driver = await connection();
    // A database of its own: this test migrates episodes from v2, and the shared
    // one is already at v3.
    const scratch = `episodes_v3_${String(process.pid)}`;
    await driver.exec(`DROP DATABASE IF EXISTS ${scratch}`);
    await driver.exec(`CREATE DATABASE ${scratch}`);
    const { postgresDriver } = await import("../../db/postgres.ts");
    const base = new globalThis.URL(URL!);
    base.pathname = `/${scratch}`;
    const own = await postgresDriver(base.toString());
    opened.push(own);

    try {
      const v2: SchemaModule = {
        module: EPISODES_SCHEMA.module,
        migrations: EPISODES_SCHEMA.migrations.filter((step) => step.version <= 2),
      };
      await migrate(own, v2);

      const [row] = await own.query<{ id: string }>(
        `INSERT INTO tonight_episodes (user_id, request, watched, finished)
         VALUES ('google:v3', 'something tense', true, true) RETURNING id`,
      );
      await own.query(
        `INSERT INTO tonight_episode_offers (user_id, episode, position, title, year, lead, chosen)
         VALUES ('google:v3', $1, 0, 'Heat', 1995, true, false),
                ('google:v3', $1, 1, 'Ronin', 1998, false, true)`,
        [row!.id],
      );

      await migrate(own, EPISODES_SCHEMA);

      const store = sqlEpisodeStore(own, { id: "google:v3" });
      const [evening] = await store.episodes();
      assert.equal(evening?.request, "something tense");
      assert.deepEqual(
        evening?.offers.map((offer) => ({
          title: offer.title,
          offered: offer.offered,
          lead: offer.lead,
          chosen: offer.chosen,
          started: offer.started,
          finished: offer.finished,
          passed: offer.passed,
        })),
        [
          {
            title: "Heat",
            offered: true,
            lead: true,
            chosen: { known: false },
            started: { known: false },
            finished: { known: false },
            passed: { known: false },
          },
          {
            title: "Ronin",
            offered: true,
            lead: false,
            chosen: { known: true, value: true, source: "stated" },
            started: { known: true, value: true, source: "stated" },
            finished: { known: true, value: true, source: "stated" },
            passed: { known: false },
          },
        ],
      );
    } finally {
      await own.close().catch(() => {});
      await driver.exec(`DROP DATABASE IF EXISTS ${scratch}`).catch(() => {});
    }
  });
});
