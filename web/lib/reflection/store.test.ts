import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { sqlTasteStore, TASTE_SCHEMA } from "../taste/store/sql.ts";
import { ReflectionError, type Target } from "./model.ts";
import type { ReflectionStore } from "./store.ts";
import { REFLECTION_SCHEMA, sqlReflectionStore } from "./store/sql.ts";

/**
 * What Tonight thinks, and the one place it is allowed to become what the user
 * has.
 *
 * The evaluation gate in `evaluation/m4.test.ts` proves the boundary through
 * the tool surface, end to end. This file proves the store underneath it: that
 * a decision is a decision, that a race cannot write twice, and that an
 * acceptance either lands whole or leaves nothing behind.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;
const RESTRAINT: Target = {
  kind: "genre",
  name: "Restrained Thriller",
  instruction: "Tension carried by what is withheld rather than what is shown.",
};

describe("the reflection store", () => {
  let driver: SqlDriver;
  let next = 0;

  const mine = (): { reflection: ReflectionStore; genres: () => Promise<string[]> } => {
    const who = asUser(`google:m4-store-${String(++next)}`);
    const taste = sqlTasteStore(driver, who);
    return {
      reflection: sqlReflectionStore(driver, who),
      genres: async () => (await taste.taste()).genres.map((one) => one.name),
    };
  };

  before(async () => {
    driver = await embeddedDriver();
    await migrate(driver, TASTE_SCHEMA);
    await migrate(driver, REFLECTION_SCHEMA);
  });

  after(async () => {
    await driver.close();
  });

  /* ------------------------------------------------------ what it remembers */

  test("an observation is kept as Tonight's own, and is nothing else", async () => {
    const { reflection, genres } = mine();
    const written = await reflection.observe("both films they loved withhold more than they show");

    assert.match(written.ref, /^[0-9a-f-]{36}$/u);
    assert.equal(written.noticed, "both films they loved withhold more than they show");
    assert.deepEqual(await reflection.observations(), [written]);
    // It did not become anything of theirs.
    assert.deepEqual(await genres(), []);
    assert.deepEqual(await reflection.proposals(), []);
  });

  test("a proposal carries the change it is offering, and is pending", async () => {
    const { reflection, genres } = mine();
    const noticed = await reflection.observe("they keep choosing quiet films");
    const offered = await reflection.propose(noticed.ref, "worth making a genre?", RESTRAINT);

    assert.equal(offered.state, "pending");
    assert.equal(offered.decidedAt, null);
    assert.equal(offered.from, noticed.ref);
    assert.deepEqual(offered.target, RESTRAINT);
    // Offering wrote nothing of theirs.
    assert.deepEqual(await genres(), []);
  });

  test("a proposal may stand on nothing, and may not stand on somebody else's observation", async () => {
    const { reflection } = mine();
    const loose = await reflection.propose(null, "an offer made in the moment", RESTRAINT);
    assert.equal(loose.from, null);

    const stranger = mine();
    const theirs = await stranger.reflection.observe("something about them");
    await assert.rejects(
      () => reflection.propose(theirs.ref, "borrowing their note", RESTRAINT),
      (error: Error) => error instanceof ReflectionError && /No observation of yours/u.test(error.message),
    );
  });

  /* ------------------------------------------------------------ the decision */

  test("acceptance writes exactly the target, in the same breath", async () => {
    const { reflection, genres } = mine();
    const offered = await reflection.propose(null, "worth making a genre?", RESTRAINT);
    assert.deepEqual(await genres(), []);

    const accepted = await reflection.accept(offered.ref);
    assert.equal(accepted.state, "accepted");
    assert.ok(accepted.decidedAt);
    assert.deepEqual(await genres(), [RESTRAINT.name]);
    // And the row says so afterwards, not only the return value.
    const [stored] = await reflection.proposals();
    assert.equal(stored!.state, "accepted");
  });

  test("rejection writes nothing and stays refused", async () => {
    const { reflection, genres } = mine();
    const offered = await reflection.propose(null, "worth making a genre?", RESTRAINT);

    const rejected = await reflection.reject(offered.ref);
    assert.equal(rejected.state, "rejected");
    assert.ok(rejected.decidedAt);
    assert.deepEqual(await genres(), []);

    // §6: a rejected proposal stays rejected. It cannot be accepted later, and
    // the refusal says which decision already stands.
    await assert.rejects(
      () => reflection.accept(offered.ref),
      (error: Error) => error instanceof ReflectionError && /already rejected/u.test(error.message),
    );
    assert.deepEqual(await genres(), []);
  });

  test("a decision is made once", async () => {
    const { reflection, genres } = mine();
    const offered = await reflection.propose(null, "worth making a genre?", RESTRAINT);
    await reflection.accept(offered.ref);

    // Accepting twice would write twice. The second is refused rather than
    // being quietly idempotent: the user said yes once, and a second write
    // under one yes is a write nobody authorised.
    await assert.rejects(
      () => reflection.accept(offered.ref),
      (error: Error) => error instanceof ReflectionError && /already accepted/u.test(error.message),
    );
    await assert.rejects(() => reflection.reject(offered.ref), ReflectionError);
    assert.deepEqual(await genres(), [RESTRAINT.name]);
  });

  test("two acceptances racing write the genre once", async () => {
    const { reflection, genres } = mine();
    const offered = await reflection.propose(null, "worth making a genre?", RESTRAINT);

    const both = await Promise.allSettled([reflection.accept(offered.ref), reflection.accept(offered.ref)]);
    assert.equal(both.filter((one) => one.status === "fulfilled").length, 1, "both acceptances took");
    assert.deepEqual(await genres(), [RESTRAINT.name]);
  });

  /* ------------------------------------------------------------- refusals */

  test("an acceptance that cannot be written leaves the proposal pending", async () => {
    // The atomicity that matters: the user's yes is recorded only if what they
    // agreed to actually happened. Here the genre name is already theirs, so
    // the write fails and the whole acceptance rolls back — rather than leaving
    // a proposal marked accepted against a genre that was never created by it.
    const who = asUser(`google:m4-clash-${String(++next)}`);
    const taste = sqlTasteStore(driver, who);
    const reflection = sqlReflectionStore(driver, who);
    await taste.createGenre({ name: RESTRAINT.name, instruction: "their own wording" });

    const offered = await reflection.propose(null, "worth making a genre?", RESTRAINT);
    await assert.rejects(() => reflection.accept(offered.ref));

    const [stored] = await reflection.proposals();
    assert.equal(stored!.state, "pending", "the proposal was decided against a write that failed");
    assert.equal(stored!.decidedAt, null);
    // And their own genre is untouched.
    const [genre] = (await taste.taste()).genres;
    assert.equal(genre!.instruction, "their own wording");
  });

  test("a reference that names nothing is refused, and says nothing about whose it is", async () => {
    const { reflection } = mine();
    const stranger = mine();
    const theirs = await stranger.reflection.propose(null, "theirs", RESTRAINT);

    const missing = "00000000-0000-4000-8000-000000000000";
    const forOther = await reflection.accept(theirs.ref).catch((error: Error) => error.message);
    const forMissing = await reflection.accept(missing).catch((error: Error) => error.message);
    assert.equal(forOther, forMissing, "a foreign reference answers differently from an absent one");

    // And the stranger's proposal is untouched by the attempt.
    const [theirsNow] = await stranger.reflection.proposals();
    assert.equal(theirsNow!.state, "pending");
  });

  test("what is offered has to be writable and has to be a genre", async () => {
    const { reflection } = mine();
    await assert.rejects(() => reflection.propose(null, "", RESTRAINT), ReflectionError);
    await assert.rejects(
      () => reflection.propose(null, "something", { kind: "mix", name: "x", instruction: "y" }),
      (error: Error) => error instanceof ReflectionError && /only change a proposal can offer/u.test(error.message),
    );
    await assert.rejects(
      () => reflection.propose(null, "something", { kind: "genre", name: "  ", instruction: "y" }),
      ReflectionError,
    );
    assert.deepEqual(await reflection.proposals(), []);
  });
});
