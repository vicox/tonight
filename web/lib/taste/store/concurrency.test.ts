import assert from "node:assert/strict";
import test, { after, before, describe, type TestContext } from "node:test";

import type { SqlDriver } from "../../db/driver.ts";
import { migrate, type SchemaModule } from "../../db/migrate.ts";
import { TasteError } from "../model.ts";
import { TASTE_SCHEMA } from "./schema.ts";
import { sqlTasteStore } from "./sql.ts";

/**
 * What only two connections can show.
 *
 * Everything else about timestamps and about deleting a vibe is asserted in
 * `store.test.ts`, which runs against the embedded Postgres and needs one
 * connection. These do not have that option, and each of them is here because a
 * sequential version of it would pass against code that is wrong:
 *
 *   - a stamp must not move backwards, which is about two transactions whose
 *     lifetimes overlap;
 *   - deleting a vibe must take its movie locks before its vibe lock, which is
 *     only visible while something else holds one of them;
 *   - and the three ways the filing can change *while* a deletion is taking
 *     those locks, each of which has to end in the right answer rather than in a
 *     deadlock or a half-held set;
 *   - a vibe's core, written against each of the three writes that can take its
 *     film away mid-flight: deleting the vibe, deleting the film, un-filing it.
 *
 * Every one of them asserts that the deletion is still blocked at the moment the
 * other connection acts. Without that the interleaving never happened and the
 * test has quietly become a sequential one.
 *
 * The embedded driver opens a fresh in-process database per call, so two of them
 * are two databases and none of this can be put to it. This file therefore runs
 * only when `TEST_DATABASE_URL` names a real server.
 */

const URL = process.env.TEST_DATABASE_URL;

/** Long enough for a blocked statement to have reached the lock it waits on. */
const SETTLE = 400;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Set to opt out of the phase-A test, which needs a database of its own.
 *
 * It exists so that skipping is something somebody chose, in an environment
 * where `CREATE DATABASE` is genuinely not available — a managed server, a
 * restricted role. Unset, the test runs, and a database it cannot create is a
 * failure rather than a quiet pass: a verification run that reports green
 * without having exercised the rollout's one hard prerequisite is worse than one
 * that reports red.
 */
const SKIP_BRIDGE = process.env.TEST_SKIP_BRIDGE_DATABASE;

/** Everything up to but not including the timestamp migration. */
const upTo = (version: number): SchemaModule => ({
  module: TASTE_SCHEMA.module,
  migrations: TASTE_SCHEMA.migrations.filter((one) => one.version <= version),
});

if (!URL) {
  test("concurrency is not exercised without TEST_DATABASE_URL", () => {
    assert.ok(true);
  });
}

describe("two connections", { skip: URL ? false : "TEST_DATABASE_URL is not set" }, () => {
  const opened: SqlDriver[] = [];

  /**
   * A connection that gives up on a lock rather than waiting for ever.
   *
   * Every test here deliberately blocks something, so a mistake in one of them —
   * two of these waiting on each other with nobody left to release anything — is
   * not a deadlock Postgres can break. It is an ordinary wait that never ends,
   * and without this the run hangs instead of failing.
   */
  async function connection(url = URL!): Promise<SqlDriver> {
    const { postgresDriver } = await import("../../db/postgres.ts");
    const separator = url.includes("?") ? "&" : "?";
    const driver = await postgresDriver(`${url}${separator}options=-c%20lock_timeout%3D15000`);
    opened.push(driver);
    return driver;
  }

  before(async () => {
    await migrate(await connection(), TASTE_SCHEMA);
  });

  after(async () => {
    for (const driver of opened) await driver.close().catch(() => {});
  });

  /**
   * A model of its own per test, so two of them cannot see each other's rows.
   *
   * Vibes first. A vibe's core is held by a deferred key into its films, so
   * deleting the films of an anchored vibe on their own — each statement its own
   * transaction here — fails at commit; deleting the vibe takes its filings with
   * it. Then the films, then the genres, which nothing references by then.
   */
  async function fresh(driver: SqlDriver, mark: string) {
    const owner = { id: `google:concurrent-${mark}` };
    for (const table of [
      "tonight_mixes",
      "tonight_mix_movies",
      "tonight_mix_genres",
      "tonight_movies",
      "tonight_genres",
    ]) {
      await driver.query(`DELETE FROM ${table} WHERE user_id = $1`, [owner.id]);
    }
    return owner;
  }

  /**
   * Holds one movie by its handle until it is let go, and says when it has it.
   *
   * This is what makes the tests below deterministic: a deletion locks the films
   * in a vibe in one known order, so holding the first of them stops it exactly
   * between reading the filing and taking the vibe — which is the window every
   * question here is about.
   */
  function holdMovie(
    t: TestContext,
    driver: SqlDriver,
    owner: { id: string },
    title: string,
  ) {
    let release!: () => void;
    let holding!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const ready = new Promise<void>((resolve) => (holding = resolve));

    const work = driver.transaction(async (tx) => {
      await tx.query(
        `SELECT id FROM tonight_movies WHERE user_id = $1 AND lower(title) = $2 FOR UPDATE`,
        [owner.id, title],
      );
      holding();
      await held;
    });

    // Let go even when the test fails on its way to doing it itself. A failed
    // assertion here would otherwise leave a transaction open and a pool with
    // work outstanding, and the run would hang rather than report — which is a
    // much worse way to find out something is wrong.
    t.after(() => {
      release();
      return work.catch(() => {});
    });
    return { ready, release: () => release(), done: work };
  }

  /**
   * Holds one vibe by name until it is let go, and says when it has it.
   *
   * The twin of `holdMovie`, for the core races: a core write holds its film and
   * then waits here, which is the window in which something else reaches for
   * that film.
   */
  function holdVibe(t: TestContext, driver: SqlDriver, owner: { id: string }, name: string) {
    let release!: () => void;
    let holding!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const ready = new Promise<void>((resolve) => (holding = resolve));

    const work = driver.transaction(async (tx) => {
      await tx.query(
        `SELECT id FROM tonight_mixes WHERE user_id = $1 AND lower(name) = $2 FOR UPDATE`,
        [owner.id, name],
      );
      holding();
      await held;
    });

    t.after(() => {
      release();
      return work.catch(() => {});
    });
    return { ready, release: () => release(), done: work };
  }

  /**
   * The same connection, stopped just after the first statement that reads a
   * vibe's filings, until it is let go.
   *
   * What this makes deterministic is the window *between two reads* of one
   * answer. A vibe being updated holds the vibe and none of its films, so another
   * session may retitle a film while the update is still reading — and if the
   * update read its films and its core in two statements, the retitle could land
   * between them. Stopping after the first read and retitling there is the one
   * interleaving that shows whether the two halves of the answer came from one
   * snapshot.
   */
  function pausingAfterFilings(t: TestContext, driver: SqlDriver) {
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const arrived = new Promise<void>((resolve) => (reached = resolve));
    // Let go even when the test fails first, so no transaction is left waiting.
    t.after(() => release());
    let paused = false;
    const stopped: SqlDriver = {
      ...driver,
      transaction: (work) =>
        driver.transaction((tx) =>
          work({
            exec: (sql) => tx.exec(sql),
            async query<Row>(sql: string, params?: readonly unknown[]) {
              const rows = await tx.query<Row>(sql, params);
              if (!paused && /\btonight_mix_movies\b/.test(sql)) {
                paused = true;
                reached();
                await gate;
              }
              return rows;
            },
          }),
        ),
    };
    return { driver: stopped, arrived, release: () => release() };
  }

  /** Whether a row is free right now: `FOR UPDATE NOWAIT` answers without waiting. */
  async function free(driver: SqlDriver, sql: string, params: unknown[]): Promise<boolean> {
    try {
      await driver.transaction(async (tx) => {
        await tx.query(sql, params);
      });
      return true;
    } catch {
      return false;
    }
  }

  /** A promise's state, without waiting on it. */
  function watch<T>(work: Promise<T>) {
    const state = { settled: false, error: undefined as unknown };
    const done = work.then(
      (value) => {
        state.settled = true;
        return value;
      },
      (error: unknown) => {
        state.settled = true;
        state.error = error;
        return undefined as T;
      },
    );
    return { state, done };
  }

  test("a change committed second is dated second, however early its transaction began", async (t) => {
    // The bug this exists for is `now()`. It is the transaction's *start*, so a
    // long transaction that began at 12:00 and committed at 12:05 would stamp
    // 12:00 — over the top of a change that committed at 12:03 and stamped 12:03.
    // The row would then say it last changed before the change it followed, and
    // anything asking "has this moved since I looked" would be told no.
    const first = await connection();
    const second = await connection();
    const owner = await fresh(first, "clock");

    await sqlTasteStore(first, owner).createGenre({ name: "Sci-Fi", instruction: "Ideas." });

    let began!: () => void;
    const hasBegun = new Promise<void>((resolve) => (began = resolve));
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));

    // Begins first, and its opening statement is what fixes `now()` for it.
    const early = first.transaction(async (tx) => {
      await tx.query("SELECT now()");
      began();
      await held;
      await tx.query(
        `UPDATE tonight_genres SET instruction = 'Early.' WHERE user_id = $1 AND name = 'Sci-Fi'`,
        [owner.id],
      );
    });
    await hasBegun;

    // Begins second, commits first.
    await second.transaction(async (tx) => {
      await tx.query(
        `UPDATE tonight_genres SET instruction = 'Late.' WHERE user_id = $1 AND name = 'Sci-Fi'`,
        [owner.id],
      );
    });
    const between = (await sqlTasteStore(second, owner).taste()).genres[0]!.updatedAt;

    release();
    await early;
    const afterwards = (await sqlTasteStore(second, owner).taste()).genres[0]!.updatedAt;

    assert.ok(
      afterwards > between,
      `the last change is dated ${afterwards}, before the ${between} it overwrote`,
    );
  });

  test("deleting a vibe takes its movies before it takes the vibe", async (t) => {
    // The invariant every path in the store obeys — movie side before vibe side —
    // stated as something observable. If the deletion took the vibe first it would
    // hold the vibe while waiting for a movie, which is the other half of the cycle
    // an `updateMovie` filing a film into that same vibe would complete.
    const deleting = await connection();
    const holder = await connection();
    const watcher = await connection();
    const owner = await fresh(deleting, "order");

    const store = sqlTasteStore(deleting, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    // Anchored on Arrival, which saves it and files it: the vibe holds exactly the
    // one film this test needs.
    await store.createVibe({
      name: "Space Tension",
      genres: ["Sci-Fi"],
      instruction: "Tense.",
      core: { title: "Arrival", year: 2016 },
    });

    const hold = holdMovie(t, holder, owner, "arrival");
    await hold.ready;

    const deletion = watch(store.deleteVibe("Space Tension"));
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "it did not wait for the film; this proves nothing");

    // The vibe must still be free. NOWAIT rather than a timeout: the question is
    // whether the lock is held right now, and an error is the answer to it.
    await watcher.transaction(async (tx) => {
      await tx.query(
        `SELECT id FROM tonight_mixes
          WHERE user_id = $1 AND lower(name) = 'space tension'
          FOR UPDATE NOWAIT`,
        [owner.id],
      );
    });

    hold.release();
    await hold.done;
    await deletion.done;
    assert.equal(deletion.state.error, undefined);

    const taste = await sqlTasteStore(watcher, owner).taste();
    assert.deepEqual(taste.vibes, []);
    assert.deepEqual(taste.movies[0]!.vibes, []);
  });

  test(
    "the same order holds against the schema as it stood before the timestamps",
    {
      skip: SKIP_BRIDGE
        ? "TEST_SKIP_BRIDGE_DATABASE is set: phase A was not exercised"
        : false,
    },
    async (t) => {
    // Phase A of the rollout: the reordered deletion is deployed while the
    // database is still at v5, so that no old-build deletion is running by the
    // time the cascade starts writing movies. The lock order has to be the final
    // one *there*, which is the whole point of shipping it first.
    //
    // Its own database, because a schema is a database-wide thing and the rest of
    // this file needs the migrated one. Creating it is part of the test: this is
    // the run that is supposed to prove phase A, so being unable to set it up is
    // a failure and says so. Somewhere that genuinely cannot, the environment
    // variable above turns it into a skip — visible in the output, and chosen.
    const admin = await connection();
    const name = "tonight_bridge_test";
    // FORCE, because a previous run that failed part way can leave a session on
    // it, and "somebody is still connected" is not a reason to stop testing.
    await admin.exec(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.exec(`CREATE DATABASE ${name}`);

    const bridge = URL!.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
    const deleting = await connection(bridge);
    const holder = await connection(bridge);
    const watcher = await connection(bridge);
    await migrate(deleting, upTo(5));

    const owner = await fresh(deleting, "bridge");
    const store = sqlTasteStore(deleting, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createVibe({
      name: "Space Tension",
      genres: ["Sci-Fi"],
      instruction: "Tense.",
      core: { title: "Arrival", year: 2016 },
    });

    const hold = holdMovie(t, holder, owner, "arrival");
    await hold.ready;

    const deletion = watch(store.deleteVibe("Space Tension"));
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "it did not wait for the film on the old schema");

    await watcher.transaction(async (tx) => {
      await tx.query(
        `SELECT id FROM tonight_mixes
          WHERE user_id = $1 AND lower(name) = 'space tension'
          FOR UPDATE NOWAIT`,
        [owner.id],
      );
    });

    hold.release();
    await hold.done;
    await deletion.done;
    assert.equal(deletion.state.error, undefined, "the deletion failed on the pre-timestamp schema");

    // Said out loud, because the whole point of this test is knowing it ran.
    const [{ version }] = await deleting.query<{ version: number }>(
      `SELECT max(version) AS version FROM schema_migrations WHERE module = 'taste'`,
    );
    assert.equal(version, 5, "phase A was not exercised against the pre-timestamp schema");
  },
  );

  test("a film filed while the deletion is taking locks is picked up, not reached for", async (t) => {
    // The dangerous shape, and the one the retry exists for: the deletion reads
    // the filing, starts locking, and a film it never saw is added — one that
    // sorts *below* the film it is waiting on. Carrying on would mean taking that
    // lower lock from inside the vibe lock, which is the half of the cycle this
    // store never takes.
    //
    // What makes this a test of the retry rather than of the outcome is the probe
    // at the end. An implementation that noticed nothing would lock the film it
    // knew about, take the vibe, and only then have the cascade reach for the film
    // it did not — with the vibe held. Here the vibe has to be free at that moment,
    // because letting go of everything is what the retry is.
    const deleting = await connection();
    const holder = await connection();
    const filer = await connection();
    const latecomer = await connection();
    const watcher = await connection();
    const owner = await fresh(deleting, "arrives");

    const store = sqlTasteStore(deleting, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    // "arrival" sorts before "moon", so the film that arrives late is the one the
    // canonical order says to lock first — the lock a vibe-holding deletion would
    // have to reach backwards for. Moon is the core, which files it.
    await store.createVibe({
      name: "Space Tension",
      genres: ["Sci-Fi"],
      instruction: "Tense.",
      core: { title: "Moon", year: 2009 },
    });
    await store.createMovie({ title: "Arrival", year: 2016 });

    const before = await sqlTasteStore(filer, owner).taste();
    const arrivalWas = before.movies.find((one) => one.title === "Arrival")!.updatedAt;

    const hold = holdMovie(t, holder, owner, "moon");
    await hold.ready;

    const deletion = watch(store.deleteVibe("Space Tension"));
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not reach the film it waits on");

    // Arrives after the deletion read the filing, and takes no lock the deletion
    // holds — so it commits while the deletion is still waiting.
    await sqlTasteStore(filer, owner).updateMovie("Arrival", 2016, { vibes: ["Space Tension"] });

    // And now somebody holds *that* film, so the deletion's second attempt has to
    // wait for it in the open rather than from behind the vibe lock.
    const late = holdMovie(t, latecomer, owner, "arrival");
    await late.ready;

    hold.release();
    await hold.done;
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not wait for the late film");

    // The proof. If the deletion had carried on with the set it first read, it
    // would be holding the vibe right now and waiting for Arrival underneath it.
    await watcher.transaction(async (tx) => {
      await tx.query(
        `SELECT id FROM tonight_mixes
          WHERE user_id = $1 AND lower(name) = 'space tension'
          FOR UPDATE NOWAIT`,
        [owner.id],
      );
    });

    late.release();
    await late.done;
    await deletion.done;
    assert.equal(deletion.state.error, undefined, "the late filing broke the deletion");

    // Both films are out of it, and both were dated by the cascade — including the
    // one the first pass never saw.
    const afterwards = await sqlTasteStore(filer, owner).taste();
    assert.deepEqual(afterwards.vibes, []);
    for (const movie of afterwards.movies) assert.deepEqual(movie.vibes, []);
    const arrivalNow = afterwards.movies.find((one) => one.title === "Arrival")!.updatedAt;
    assert.ok(arrivalNow > arrivalWas, "the film that arrived late was not dated");
  });

  test("a handle that changes hands under the deletion is noticed, not locked blindly", async (t) => {
    // A handle is not an identity. Between reading the filing and reaching a key,
    // a retitle can move that film out of the handle and another film into it.
    //
    // The implementation this is written against locks by handle and then checks
    // that the row it got is the film it meant. The one it replaced did not, and
    // the difference is not visible in the final state — both end with the vibe
    // gone. It is visible in *where the deletion waits*: the faulty version locks
    // the replacement under the old handle, decides it has everything, takes the
    // vibe, and only then has the cascade reach for the film that actually moved.
    // With the vibe already held.
    //
    // So the real film is held under its new handle before the deletion is let
    // go, and the vibe is probed while the deletion waits for it. Free means the
    // deletion let go and looked again. Held means it carried on with the wrong
    // set — which is the bug.
    const deleting = await connection();
    const holder = await connection();
    const retitling = await connection();
    const newHandle = await connection();
    const watcher = await connection();
    const owner = await fresh(deleting, "handle");

    const store = sqlTasteStore(deleting, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    // Aaa is the core, so the film that changes handle is an ordinary member.
    await store.createVibe({
      name: "Space Tension",
      genres: ["Sci-Fi"],
      instruction: "Tense.",
      core: { title: "Aaa", year: 2000 },
    });
    await store.createMovie({ title: "Arrival", year: 2016, vibes: ["Space Tension"] });
    await store.createMovie({ title: "Www", year: 2016 });

    const before = await sqlTasteStore(watcher, owner).taste();
    const movedWas = before.movies.find((one) => one.title === "Arrival")!.updatedAt;

    // "aaa" sorts first, so the deletion stops there with the filing already read
    // and the interesting handle still untaken.
    const hold = holdMovie(t, holder, owner, "aaa");
    await hold.ready;

    const deletion = watch(store.deleteVibe("Space Tension"));
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not stop at the first film");

    // The film the deletion has already read moves out of its handle, and a
    // different film — one that was never in the vibe — moves into it.
    const other = sqlTasteStore(retitling, owner);
    await other.updateMovie("Arrival", 2016, { title: "Xxx" });
    await other.updateMovie("Www", 2016, { title: "Arrival" });

    // And the film that moved is held under its *new* handle. A deletion that
    // noticed the swap has to come back for it here; one that did not will be
    // holding the vibe by the time the cascade reaches for it.
    const moved = holdMovie(t, newHandle, owner, "xxx");
    await moved.ready;

    hold.release();
    await hold.done;
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not come back for the moved film");

    // The proof. Not a final-state check: this is the moment the two
    // implementations differ, and NOWAIT is how the difference is asked about.
    await watcher.transaction(async (tx) => {
      await tx.query(
        `SELECT id FROM tonight_mixes
          WHERE user_id = $1 AND lower(name) = 'space tension'
          FOR UPDATE NOWAIT`,
        [owner.id],
      );
    });

    moved.release();
    await moved.done;
    await deletion.done;
    assert.equal(deletion.state.error, undefined, "the retitle broke the deletion");

    // Kept, but as description rather than as proof.
    const afterwards = await sqlTasteStore(watcher, owner).taste();
    assert.deepEqual(afterwards.vibes, []);
    const filed = Object.fromEntries(afterwards.movies.map((one) => [one.title, one.vibes]));
    assert.deepEqual(filed, { Aaa: [], Arrival: [], Xxx: [] });

    // The film that moved was in the vibe and was dated by the cascade; the one
    // that took its old handle never was, and must not have been.
    const movedNow = afterwards.movies.find((one) => one.title === "Xxx")!.updatedAt;
    assert.ok(movedNow > movedWas, "the film that changed handle was not dated");
  });

  test("a vibe remade under the same name mid-deletion is not the one that gets deleted", async (t) => {
    // The identity race, run rather than described. The deletion resolves the
    // name to an id without a lock; if that vibe has gone and a new one has taken
    // the name by the time the vibe lock is taken, deleting *that* would remove a
    // vibe nobody asked about and date films that were never in it.
    const deleting = await connection();
    const holder = await connection();
    const other = await connection();
    const owner = await fresh(deleting, "reuse");

    const store = sqlTasteStore(deleting, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createVibe({
      name: "Space Tension",
      genres: ["Sci-Fi"],
      instruction: "First.",
      core: { title: "Arrival", year: 2016 },
    });

    const hold = holdMovie(t, holder, owner, "arrival");
    await hold.ready;

    const deletion = watch(store.deleteVibe("Space Tension"));
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not wait for the film");

    // The name changes hands while the deletion is still waiting for the film.
    // Done by renaming rather than by deleting and remaking, and not to be gentle:
    // a second deletion would need the very film lock this one is waiting for, so
    // the two would simply queue and nothing would be interleaved. Renaming takes
    // no film lock at all, and it produces exactly the state that matters — a
    // different vibe answering to the name the deletion resolved.
    const meanwhile = sqlTasteStore(other, owner);
    await meanwhile.updateVibe("Space Tension", { name: "Quiet Dread" });
    // Anchored on a different film: Arrival is held, and a core is held before
    // anything else, so anchoring the newcomer on it would simply queue.
    await meanwhile.createVibe({
      name: "Space Tension",
      genres: ["Sci-Fi"],
      instruction: "Second.",
      core: { title: "Moon", year: 2009 },
    });

    hold.release();
    await hold.done;
    await deletion.done;

    assert.ok(deletion.state.error instanceof TasteError, "a vibe nobody asked about was deleted");
    assert.match((deletion.state.error as TasteError).message, /no vibe "Space Tension"/);

    // Nothing was deleted: the vibe they meant is still there under its new name,
    // and the newcomer holding the old name is untouched.
    const after = await sqlTasteStore(other, owner).taste();
    assert.deepEqual(
      after.vibes.map((one) => [one.name, one.instruction]),
      [
        ["Quiet Dread", "First."],
        ["Space Tension", "Second."],
      ],
    );
    assert.deepEqual(after.movies[0]!.vibes, ["Quiet Dread"]);
  });

  // --- the core ------------------------------------------------------------
  //
  // A vibe's core is a column on the vibe with a deferred key into its films, so
  // every core write touches both sides. The rule is the one the rest of this
  // file is about: the film is held first, the vibe second. Each race below is
  // one of the three writes that can take a core's film away while a core write
  // is in flight — deleting the vibe, deleting the film, un-filing the film —
  // and each asserts the interleaving actually happened before it asserts the
  // outcome.

  const ARRIVAL = { title: "Arrival", year: 2016 };
  const MOON = { title: "Moon", year: 2009 };

  test("a core change takes its film before it takes the vibe", async (t) => {
    const writing = await connection();
    const holder = await connection();
    const watcher = await connection();
    const owner = await fresh(writing, "core-order");

    const store = sqlTasteStore(writing, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createVibe({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense.", core: ARRIVAL });
    await store.createMovie(MOON);

    const hold = holdMovie(t, holder, owner, "moon");
    await hold.ready;

    const change = watch(store.updateVibe("Space Tension", { core: MOON }));
    await pause(SETTLE);
    assert.equal(change.state.settled, false, "it did not wait for the film; this proves nothing");

    // The vibe must still be free: a core change that locked the vibe first and
    // then waited for the film would be holding it right now.
    assert.equal(
      await free(
        watcher,
        `SELECT id FROM tonight_mixes WHERE user_id = $1 AND lower(name) = 'space tension' FOR UPDATE NOWAIT`,
        [owner.id],
      ),
      true,
      "the core change held the vibe while it waited for the film",
    );

    hold.release();
    await hold.done;
    await change.done;
    assert.equal(change.state.error, undefined);

    const [vibe] = (await sqlTasteStore(watcher, owner).taste()).vibes;
    assert.deepEqual(vibe!.core, MOON);
    assert.deepEqual(vibe!.movies, [ARRIVAL, MOON], "the old core stays, the new one is filed");
  });

  test("a core filed while the vibe is being deleted is picked up, not reached for", async (t) => {
    // Core change against `deleteVibe`. The deletion reads the filing and starts
    // locking; a core change then files a film it never saw — one that sorts
    // *below* the film it is waiting on. The deletion has to let go and look
    // again rather than take that film from inside the vibe lock.
    const deleting = await connection();
    const holder = await connection();
    const anchoring = await connection();
    const latecomer = await connection();
    const watcher = await connection();
    const owner = await fresh(deleting, "core-vs-delete-vibe");

    const store = sqlTasteStore(deleting, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createVibe({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense.", core: MOON });
    await store.createMovie(ARRIVAL);

    const hold = holdMovie(t, holder, owner, "moon");
    await hold.ready;

    const deletion = watch(store.deleteVibe("Space Tension"));
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not reach the film it waits on");

    // Takes Arrival, then the vibe — which the deletion does not hold yet — and
    // files Arrival as the new core. It commits while the deletion still waits.
    await sqlTasteStore(anchoring, owner).updateVibe("Space Tension", { core: ARRIVAL });

    const late = holdMovie(t, latecomer, owner, "arrival");
    await late.ready;

    hold.release();
    await hold.done;
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not wait for the new core");

    assert.equal(
      await free(
        watcher,
        `SELECT id FROM tonight_mixes WHERE user_id = $1 AND lower(name) = 'space tension' FOR UPDATE NOWAIT`,
        [owner.id],
      ),
      true,
      "the deletion is holding the vibe while it waits for the core it never saw",
    );

    late.release();
    await late.done;
    await deletion.done;
    assert.equal(deletion.state.error, undefined, "the core change broke the deletion");

    const afterwards = await sqlTasteStore(watcher, owner).taste();
    assert.deepEqual(afterwards.vibes, []);
    // Both films stay saved: deleting a vibe never deletes its films, its core
    // included.
    assert.deepEqual(
      afterwards.movies.map((one) => [one.title, one.vibes]),
      [
        ["Arrival", []],
        ["Moon", []],
      ],
    );
  });

  test("a film being made a core cannot be deleted underneath it", async (t) => {
    // Core change against `deleteMovie`. The core change holds the film and
    // waits for the vibe; the deletion then reaches for the same film and must
    // wait, and when it gets it the film is a core and the deletion is refused
    // with a sentence — never a foreign-key error at commit.
    const anchoring = await connection();
    const holder = await connection();
    const deleting = await connection();
    const watcher = await connection();
    const owner = await fresh(anchoring, "core-vs-delete-movie");

    const store = sqlTasteStore(anchoring, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createVibe({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense.", core: ARRIVAL });
    await store.createMovie(MOON);

    const vibe = holdVibe(t, holder, owner, "space tension");
    await vibe.ready;

    const change = watch(store.updateVibe("Space Tension", { core: MOON }));
    await pause(SETTLE);
    assert.equal(change.state.settled, false, "the core change did not wait for the vibe");

    const deletion = watch(sqlTasteStore(deleting, owner).deleteMovie(MOON.title, MOON.year));
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not wait for the film being anchored");

    vibe.release();
    await vibe.done;
    await change.done;
    await deletion.done;

    assert.equal(change.state.error, undefined);
    assert.ok(deletion.state.error instanceof TasteError, "the deletion was not refused with a sentence");
    assert.match(
      (deletion.state.error as TasteError).message,
      /^cannot delete "Moon" \(2009\): it is the core of the vibe "Space Tension"/,
    );

    const afterwards = await sqlTasteStore(watcher, owner).taste();
    assert.deepEqual(afterwards.vibes[0]!.core, MOON);
    assert.deepEqual(afterwards.vibes[0]!.movies, [ARRIVAL, MOON]);
  });

  test("a film being made a core cannot be un-filed underneath it", async (t) => {
    // Core change against `updateMovie` un-filing. The same shape as the
    // deletion above: the un-filing waits for the film, then finds it a core and
    // is refused, and the film stays where its vibe needs it.
    const anchoring = await connection();
    const holder = await connection();
    const unfiling = await connection();
    const watcher = await connection();
    const owner = await fresh(anchoring, "core-vs-unfile");

    const store = sqlTasteStore(anchoring, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createVibe({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense.", core: ARRIVAL });
    await store.createMovie({ ...MOON, vibes: ["Space Tension"] });

    const vibe = holdVibe(t, holder, owner, "space tension");
    await vibe.ready;

    const change = watch(store.updateVibe("Space Tension", { core: MOON }));
    await pause(SETTLE);
    assert.equal(change.state.settled, false, "the core change did not wait for the vibe");

    const unfile = watch(sqlTasteStore(unfiling, owner).updateMovie(MOON.title, MOON.year, { vibes: [] }));
    await pause(SETTLE);
    assert.equal(unfile.state.settled, false, "the un-filing did not wait for the film being anchored");

    vibe.release();
    await vibe.done;
    await change.done;
    await unfile.done;

    assert.equal(change.state.error, undefined);
    assert.ok(unfile.state.error instanceof TasteError, "the un-filing was not refused with a sentence");
    assert.match(
      (unfile.state.error as TasteError).message,
      /^cannot take "Moon" \(2009\) out of the vibe "Space Tension": it is the core there/,
    );

    const afterwards = await sqlTasteStore(watcher, owner).taste();
    assert.deepEqual(afterwards.vibes[0]!.core, MOON);
    assert.deepEqual(
      afterwards.movies.map((one) => [one.title, one.vibes]),
      [
        ["Arrival", ["Space Tension"]],
        ["Moon", ["Space Tension"]],
      ],
    );
  });

  test("whichever of an un-filing and a core change wins, the core ends up in its vibe", async (t) => {
    // The same two writes queued on the film the other way round: the un-filing
    // first. Postgres hands a row lock to its waiters in turn, but nothing here
    // depends on which goes first — either the un-filing lands and the core
    // change files the film again, or the core change lands and the un-filing is
    // refused. What may not happen is a core outside its vibe, a deadlock, or a
    // key failing at commit.
    const anchoring = await connection();
    const holder = await connection();
    const unfiling = await connection();
    const watcher = await connection();
    const owner = await fresh(anchoring, "unfile-then-core");

    const store = sqlTasteStore(anchoring, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createVibe({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense.", core: ARRIVAL });
    await store.createMovie({ ...MOON, vibes: ["Space Tension"] });

    const hold = holdMovie(t, holder, owner, "moon");
    await hold.ready;

    const unfile = watch(sqlTasteStore(unfiling, owner).updateMovie(MOON.title, MOON.year, { vibes: [] }));
    await pause(SETTLE);
    const change = watch(store.updateVibe("Space Tension", { core: MOON }));
    await pause(SETTLE);
    assert.equal(unfile.state.settled, false, "the un-filing did not wait for the film");
    assert.equal(change.state.settled, false, "the core change did not wait for the film");

    hold.release();
    await hold.done;
    await unfile.done;
    await change.done;

    assert.equal(change.state.error, undefined, "the core change failed");
    if (unfile.state.error !== undefined) {
      assert.ok(unfile.state.error instanceof TasteError, "the un-filing failed with something other than a refusal");
      assert.match((unfile.state.error as TasteError).message, /it is the core there/);
    }

    const afterwards = await sqlTasteStore(watcher, owner).taste();
    assert.deepEqual(afterwards.vibes[0]!.core, MOON);
    assert.deepEqual(
      afterwards.movies.find((one) => one.title === "Moon")!.vibes,
      ["Space Tension"],
      "the core was left outside its vibe",
    );
  });

  test("a film being made a core cannot be marked want-to-see underneath it", async (t) => {
    // Core change against `updateMovie(viewing: want-to-see)`. The core change holds
    // the film and waits for the vibe; marking the film unseen reaches for the
    // same film and waits, and when it gets it the film is a core, so it is
    // refused with a sentence.
    const anchoring = await connection();
    const holder = await connection();
    const marking = await connection();
    const watcher = await connection();
    const owner = await fresh(anchoring, "core-vs-unseen");

    const store = sqlTasteStore(anchoring, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createVibe({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense.", core: ARRIVAL });
    await store.createMovie({ ...MOON, viewing: "seen" });

    const vibe = holdVibe(t, holder, owner, "space tension");
    await vibe.ready;

    const change = watch(store.updateVibe("Space Tension", { core: MOON }));
    await pause(SETTLE);
    assert.equal(change.state.settled, false, "the core change did not wait for the vibe");

    const unsee = watch(sqlTasteStore(marking, owner).updateMovie(MOON.title, MOON.year, { viewing: "want-to-see" }));
    await pause(SETTLE);
    assert.equal(unsee.state.settled, false, "marking it unseen did not wait for the film being anchored");

    vibe.release();
    await vibe.done;
    await change.done;
    await unsee.done;

    assert.equal(change.state.error, undefined);
    assert.ok(unsee.state.error instanceof TasteError, "marking a core unseen was not refused with a sentence");
    assert.match(
      (unsee.state.error as TasteError).message,
      /^cannot mark "Moon" \(2009\) anything but seen: it is the core of the vibe "Space Tension"/,
    );

    const afterwards = await sqlTasteStore(watcher, owner).taste();
    assert.deepEqual(afterwards.vibes[0]!.core, MOON);
    assert.equal(afterwards.movies.find((one) => one.title === "Moon")!.viewing, "seen");
  });

  test("whichever of marking a film want-to-see and anchoring on it wins, no core is unseen", async (t) => {
    // The same two writes queued on the film itself, so either may get it first.
    // Unseen first: the core change then finds an unseen film and is refused.
    // Core first: marking it unseen then finds a core and is refused. Exactly one
    // lands, with a sentence for the other, and never an unseen core.
    const anchoring = await connection();
    const holder = await connection();
    const marking = await connection();
    const watcher = await connection();
    const owner = await fresh(anchoring, "unseen-or-core");

    const store = sqlTasteStore(anchoring, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createVibe({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense.", core: ARRIVAL });
    await store.createMovie({ ...MOON, viewing: "seen", vibes: ["Space Tension"] });

    const hold = holdMovie(t, holder, owner, "moon");
    await hold.ready;

    const unsee = watch(sqlTasteStore(marking, owner).updateMovie(MOON.title, MOON.year, { viewing: "want-to-see" }));
    await pause(SETTLE);
    const change = watch(store.updateVibe("Space Tension", { core: MOON }));
    await pause(SETTLE);
    assert.equal(unsee.state.settled, false, "marking it unseen did not wait for the film");
    assert.equal(change.state.settled, false, "the core change did not wait for the film");

    hold.release();
    await hold.done;
    await unsee.done;
    await change.done;

    const failed = [unsee.state.error, change.state.error].filter((error) => error !== undefined);
    assert.equal(failed.length, 1, "exactly one of the two writes should have been refused");
    assert.ok(failed[0] instanceof TasteError, "the refusal was not a sentence");
    assert.match((failed[0] as TasteError).message, /unseen|a core is a film they have seen/);

    const afterwards = await sqlTasteStore(watcher, owner).taste();
    const moon = afterwards.movies.find((one) => one.title === "Moon")!;
    const core = afterwards.vibes[0]!.core;
    assert.ok(
      (JSON.stringify(core) === JSON.stringify(MOON) && moon.viewing === "seen") ||
        (JSON.stringify(core) === JSON.stringify(ARRIVAL) && moon.viewing === "want-to-see"),
      `an unseen core, or neither write landed: core ${JSON.stringify(core)}, viewing ${moon.viewing}`,
    );
  });

  test("a vibe's answer names its core among its own films, whatever is retitled meanwhile", async (t) => {
    // Codex's implementation review reproduced this: an update holding the vibe
    // read its films, a retitle of the core committed, then the update read its
    // core — and answered with a core whose handle was not among its own films.
    // The fix is one statement for both, not a film lock taken after the vibe's.
    const updating = await connection();
    const retitling = await connection();
    const owner = await fresh(updating, "core-snapshot");

    await sqlTasteStore(updating, owner).createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await sqlTasteStore(updating, owner).createVibe({
      name: "Space Tension",
      genres: ["Sci-Fi"],
      instruction: "Tense.",
      core: ARRIVAL,
    });

    const paused = pausingAfterFilings(t, updating);
    const update = watch(
      sqlTasteStore(paused.driver, owner).updateVibe("Space Tension", { instruction: "Tenser." }),
    );
    await paused.arrived;

    // The update holds the vibe and no film, so this does not wait for it.
    await sqlTasteStore(retitling, owner).updateMovie(ARRIVAL.title, ARRIVAL.year, {
      title: "Arrival (Director's Cut)",
    });

    paused.release();
    const answered = await update.done;
    assert.equal(update.state.error, undefined);
    assert.ok(answered, "the update gave no answer");
    assert.ok(answered.core, "the update lost its core");
    assert.ok(
      answered.movies.some(
        (film) => film.title === answered.core!.title && film.year === answered.core!.year,
      ),
      `the answer's core ${JSON.stringify(answered.core)} is not among its films ${JSON.stringify(answered.movies)}`,
    );

    // And the model itself is consistent afterwards, under the new title.
    const [vibe] = (await sqlTasteStore(retitling, owner).taste()).vibes;
    assert.deepEqual(vibe!.core, { title: "Arrival (Director's Cut)", year: 2016 });
    assert.deepEqual(vibe!.movies, [{ title: "Arrival (Director's Cut)", year: 2016 }]);
  });
});
