import assert from "node:assert/strict";
import test, { after, before, describe, type TestContext } from "node:test";

import type { SqlDriver } from "../../db/driver.ts";
import { migrate } from "../../db/migrate.ts";
import { TasteError } from "../model.ts";
import { TASTE_SCHEMA } from "./schema.ts";
import { sqlTasteStore } from "./sql.ts";

/**
 * How deleting a mix behaves while somebody else is writing.
 *
 * Everything else about deleting one is asserted in `store.test.ts`, which runs
 * against the embedded Postgres and needs one connection. None of this can be:
 * the whole subject is *where the deletion waits*, which is only visible while
 * something else is holding what it wants.
 *
 * The deletion takes every film in the mix before it takes the mix, and if the
 * set of films turns out to have changed it lets go of everything and looks
 * again. Neither of those shows up in the final state — the mix ends up deleted
 * either way — so each test here holds a lock, checks the deletion is still
 * blocked, and then asks the mix whether it is free. That question is the proof;
 * the state assertions after it are description.
 *
 * Every test asserts the deletion is still waiting at the moment the other
 * connection acts. Without that the interleaving never happened and the test has
 * quietly become a sequential one.
 *
 * The embedded driver opens a fresh in-process database per call, so two of them
 * are two databases and none of this can be put to it. This file therefore runs
 * only when `TEST_DATABASE_URL` names a real server.
 */

const URL = process.env.TEST_DATABASE_URL;

/** Long enough for a blocked statement to have reached the lock it waits on. */
const SETTLE = 400;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  async function connection(): Promise<SqlDriver> {
    const { postgresDriver } = await import("../../db/postgres.ts");
    const separator = URL!.includes("?") ? "&" : "?";
    const driver = await postgresDriver(`${URL!}${separator}options=-c%20lock_timeout%3D15000`);
    opened.push(driver);
    return driver;
  }

  before(async () => {
    await migrate(await connection(), TASTE_SCHEMA);
  });

  after(async () => {
    for (const driver of opened) await driver.close().catch(() => {});
  });

  /** A model of its own per test, so two of them cannot see each other's rows. */
  async function fresh(driver: SqlDriver, mark: string) {
    const owner = { id: `google:concurrent-${mark}` };
    for (const table of [
      "tonight_mix_movies",
      "tonight_mix_genres",
      "tonight_movies",
      "tonight_mixes",
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
   * in a mix in one known order, so holding the first of them stops it exactly
   * between reading the filing and taking the mix — which is the window every
   * question here is about.
   */
  function holdMovie(t: TestContext, driver: SqlDriver, owner: { id: string }, title: string) {
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

  /** Asserts the mix is not held by anybody, right now. */
  async function mixIsFree(driver: SqlDriver, owner: { id: string }, name: string) {
    // NOWAIT rather than a timeout: the question is whether the lock is held at
    // this moment, and an error is the answer to it.
    await driver.transaction(async (tx) => {
      await tx.query(
        `SELECT id FROM tonight_mixes
          WHERE user_id = $1 AND lower(name) = $2
          FOR UPDATE NOWAIT`,
        [owner.id, name],
      );
    });
  }

  test("this suite ran against the schema the bridge release is deployed onto", async () => {
    // Phase A of the rollout is a build that must run against the schema as it
    // stands in production *before* the timestamp migration. Saying which schema
    // these tests proved the lock order against is the difference between that
    // being true and being assumed.
    const [row] = await (await connection()).query<{ version: number }>(
      `SELECT max(version) AS version FROM schema_migrations WHERE module = 'taste'`,
    );
    assert.equal(row!.version, 5, "the bridge was not exercised against the pre-timestamp schema");
  });

  test("deleting a mix takes its movies before it takes the mix", async (t) => {
    // The invariant every path in the store obeys — movie side before mix side —
    // stated as something observable. A deletion that took the mix first would
    // hold it while waiting for a movie, which is the other half of the cycle an
    // `updateMovie` filing a film into that same mix would complete.
    const deleting = await connection();
    const holder = await connection();
    const watcher = await connection();
    const owner = await fresh(deleting, "order");

    const store = sqlTasteStore(deleting, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createMix({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense." });
    await store.createMovie({ title: "Arrival", year: 2016, mixes: ["Space Tension"] });

    const hold = holdMovie(t, holder, owner, "arrival");
    await hold.ready;

    const deletion = watch(store.deleteMix("Space Tension"));
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "it did not wait for the film; this proves nothing");

    await mixIsFree(watcher, owner, "space tension");

    hold.release();
    await hold.done;
    await deletion.done;
    assert.equal(deletion.state.error, undefined);

    const taste = await sqlTasteStore(watcher, owner).taste();
    assert.deepEqual(taste.mixes, []);
    assert.deepEqual(taste.movies[0]!.mixes, []);
  });

  test("a film filed while the deletion is taking locks is picked up, not reached for", async (t) => {
    // The deletion reads the filing, starts locking, and a film it never saw is
    // added — one that sorts *below* the film it is waiting on. Carrying on would
    // mean taking that lower lock from inside the mix lock, which is the half of
    // the cycle this store never takes.
    //
    // The proof is the probe at the end. An implementation that noticed nothing
    // would lock the film it knew about, take the mix, and only then have the
    // cascade reach for the film it did not — with the mix held.
    const deleting = await connection();
    const holder = await connection();
    const filer = await connection();
    const latecomer = await connection();
    const watcher = await connection();
    const owner = await fresh(deleting, "arrives");

    const store = sqlTasteStore(deleting, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createMix({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense." });
    // "arrival" sorts before "moon", so the film that arrives late is the one the
    // canonical order says to lock first — the lock a mix-holding deletion would
    // have to reach backwards for.
    await store.createMovie({ title: "Moon", year: 2009, mixes: ["Space Tension"] });
    await store.createMovie({ title: "Arrival", year: 2016 });

    const hold = holdMovie(t, holder, owner, "moon");
    await hold.ready;

    const deletion = watch(store.deleteMix("Space Tension"));
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not reach the film it waits on");

    // Arrives after the deletion read the filing, and takes no lock the deletion
    // holds — so it commits while the deletion is still waiting.
    await sqlTasteStore(filer, owner).updateMovie("Arrival", 2016, { mixes: ["Space Tension"] });

    // And now somebody holds *that* film, so the deletion's second attempt has to
    // wait for it in the open rather than from behind the mix lock.
    const late = holdMovie(t, latecomer, owner, "arrival");
    await late.ready;

    hold.release();
    await hold.done;
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not wait for the late film");

    await mixIsFree(watcher, owner, "space tension");

    late.release();
    await late.done;
    await deletion.done;
    assert.equal(deletion.state.error, undefined, "the late filing broke the deletion");

    const afterwards = await sqlTasteStore(filer, owner).taste();
    assert.deepEqual(afterwards.mixes, []);
    for (const movie of afterwards.movies) assert.deepEqual(movie.mixes, []);
  });

  test("a handle that changes hands under the deletion is noticed, not locked blindly", async (t) => {
    // A handle is not an identity. Between reading the filing and reaching a key,
    // a retitle can move that film out of the handle and another film into it.
    //
    // The difference between locking by handle and locking by handle *and then
    // checking the id* is not visible in the final state — both end with the mix
    // gone. It is visible in where the deletion waits: the unchecked version
    // locks the replacement under the old handle, decides it has everything,
    // takes the mix, and only then has the cascade reach for the film that
    // actually moved. With the mix already held.
    const deleting = await connection();
    const holder = await connection();
    const retitling = await connection();
    const newHandle = await connection();
    const watcher = await connection();
    const owner = await fresh(deleting, "handle");

    const store = sqlTasteStore(deleting, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createMix({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Tense." });
    await store.createMovie({ title: "Aaa", year: 2000, mixes: ["Space Tension"] });
    await store.createMovie({ title: "Arrival", year: 2016, mixes: ["Space Tension"] });
    await store.createMovie({ title: "Www", year: 2016 });

    // "aaa" sorts first, so the deletion stops there with the filing already read
    // and the interesting handle still untaken.
    const hold = holdMovie(t, holder, owner, "aaa");
    await hold.ready;

    const deletion = watch(store.deleteMix("Space Tension"));
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not stop at the first film");

    // The film the deletion has already read moves out of its handle, and a
    // different film — one that was never in the mix — moves into it.
    const other = sqlTasteStore(retitling, owner);
    await other.updateMovie("Arrival", 2016, { title: "Xxx" });
    await other.updateMovie("Www", 2016, { title: "Arrival" });

    // And the film that moved is held under its *new* handle. A deletion that
    // noticed the swap has to come back for it here; one that did not will be
    // holding the mix by the time the cascade reaches for it.
    const moved = holdMovie(t, newHandle, owner, "xxx");
    await moved.ready;

    hold.release();
    await hold.done;
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not come back for the moved film");

    await mixIsFree(watcher, owner, "space tension");

    moved.release();
    await moved.done;
    await deletion.done;
    assert.equal(deletion.state.error, undefined, "the retitle broke the deletion");

    const afterwards = await sqlTasteStore(watcher, owner).taste();
    assert.deepEqual(afterwards.mixes, []);
    const filed = Object.fromEntries(afterwards.movies.map((one) => [one.title, one.mixes]));
    assert.deepEqual(filed, { Aaa: [], Arrival: [], Xxx: [] });
  });

  test("a mix remade under the same name mid-deletion is not the one that gets deleted", async (t) => {
    // The identity race. The deletion resolves the name to an id without a lock;
    // if a different mix answers to that name by the time the mix lock is taken,
    // deleting *that* would remove a mix nobody asked about.
    const deleting = await connection();
    const holder = await connection();
    const other = await connection();
    const owner = await fresh(deleting, "reuse");

    const store = sqlTasteStore(deleting, owner);
    await store.createGenre({ name: "Sci-Fi", instruction: "Ideas." });
    await store.createMix({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "First." });
    await store.createMovie({ title: "Arrival", year: 2016, mixes: ["Space Tension"] });

    const hold = holdMovie(t, holder, owner, "arrival");
    await hold.ready;

    const deletion = watch(store.deleteMix("Space Tension"));
    await pause(SETTLE);
    assert.equal(deletion.state.settled, false, "the deletion did not wait for the film");

    // The name changes hands while the deletion is still waiting for the film.
    // Done by renaming rather than by deleting and remaking, and not to be gentle:
    // a second deletion would need the very film lock this one is waiting for, so
    // the two would simply queue and nothing would be interleaved. Renaming takes
    // no film lock at all, and it produces exactly the state that matters — a
    // different mix answering to the name the deletion resolved.
    const meanwhile = sqlTasteStore(other, owner);
    await meanwhile.updateMix("Space Tension", { name: "Quiet Dread" });
    await meanwhile.createMix({ name: "Space Tension", genres: ["Sci-Fi"], instruction: "Second." });

    hold.release();
    await hold.done;
    await deletion.done;

    assert.ok(deletion.state.error instanceof TasteError, "a mix nobody asked about was deleted");
    assert.match((deletion.state.error as TasteError).message, /no mix "Space Tension"/);

    // Nothing was deleted: the mix they meant is still there under its new name,
    // and the newcomer holding the old name is untouched.
    const afterwards = await sqlTasteStore(other, owner).taste();
    assert.deepEqual(
      afterwards.mixes.map((one) => [one.name, one.instruction]),
      [
        ["Quiet Dread", "First."],
        ["Space Tension", "Second."],
      ],
    );
    assert.deepEqual(afterwards.movies[0]!.mixes, ["Quiet Dread"]);
  });
});
