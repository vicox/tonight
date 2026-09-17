import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { beginEpisode, EpisodeError, stateOutcome, type Episode, type Offer } from "./model.ts";
import type { EpisodeStore } from "./store.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "./store/sql.ts";

/**
 * Episode persistence, held to the one thing that makes it worth having.
 *
 * A store that loses the difference between *"nobody said"* and *"they said no"*
 * turns every unanswered evening into a stated negative, and does it invisibly.
 * So most of what follows is about that difference surviving a round trip, and
 * about the isolation that keeps one person's evenings out of another's.
 */

const offers: Offer[] = [
  { title: "Prisoners", year: 2013, lead: true },
  { title: "Zodiac", year: 2007, lead: false },
];

const evening = (): Episode => beginEpisode("something tense tonight", offers);

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

describe("episode store", () => {
  let driver: SqlDriver;
  let ana: EpisodeStore;
  let ben: EpisodeStore;

  before(async () => {
    driver = await embeddedDriver();
    await migrate(driver, EPISODES_SCHEMA);
    ana = sqlEpisodeStore(driver, asUser("google:ana"));
    ben = sqlEpisodeStore(driver, asUser("google:ben"));
  });

  after(async () => {
    await driver.close();
  });

  test("an episode survives a round trip exactly as it was", async () => {
    const written = await ana.record(evening());
    const read = await ana.episode(written.id);

    assert.equal(read.request, "something tense tonight");
    assert.deepEqual(read.offered, offers, "the offer, or its order, did not survive");
    assert.deepEqual(
      { id: read.id, chosen: read.chosen, watched: read.watched, finished: read.finished },
      { id: written.id, chosen: written.chosen, watched: written.watched, finished: written.finished },
    );
  });

  test("unknown survives the round trip as unknown", async () => {
    const written = await ana.record(evening());
    const read = await ana.episode(written.id);
    assert.equal(read.watched.known, false, "an unanswered evening came back answered");
    assert.equal(read.finished.known, false);
    assert.equal(read.chosen.known, false);
  });

  test("a stated no survives the round trip as a stated no", async () => {
    const said = stateOutcome(evening(), { watched: false, finished: false });
    const read = await ana.episode((await ana.record(said)).id);
    assert.equal(read.watched.known, true, "a stated no came back as silence");
    assert.equal(read.watched.known && read.watched.value, false);
    assert.equal(read.finished.known && read.finished.value, false);
  });

  test("unknown and a stated no are still different after persistence", async () => {
    const silent = await ana.episode((await ana.record(evening())).id);
    const said = await ana.episode(
      (await ana.record(stateOutcome(evening(), { watched: false }))).id,
    );

    assert.notDeepEqual(silent.watched, said.watched, "persistence collapsed the two");
    assert.equal(silent.watched.known, false);
    assert.equal(said.watched.known, true);
  });

  test("a stated yes and a stated no are both stated", async () => {
    const yes = await ana.episode((await ana.record(stateOutcome(evening(), { watched: true }))).id);
    const no = await ana.episode((await ana.record(stateOutcome(evening(), { watched: false }))).id);
    assert.equal(yes.watched.known && yes.watched.source, "stated");
    assert.equal(no.watched.known && no.watched.source, "stated");
  });

  test("the chosen film comes back as one of the offered films", async () => {
    const chose = stateOutcome(evening(), { chosen: offers[1] });
    const read = await ana.episode((await ana.record(chose)).id);

    assert.equal(read.chosen.known, true);
    assert.deepEqual(read.chosen.known && read.chosen.value, offers[1]);
    assert.ok(
      read.offered.some((offer) => offer.title === "Zodiac"),
      "the chosen film is not among the offered films it was read from",
    );
  });

  test("persistence records no outcome the episode did not carry", async () => {
    // The chain, after a round trip: a recorded recommendation stays a
    // recommendation, and a recorded choice stays a choice.
    const chose = stateOutcome(evening(), { chosen: offers[0] });
    const read = await ana.episode((await ana.record(chose)).id);
    assert.equal(read.chosen.known, true);
    assert.equal(read.watched.known, false, "storing a choice invented a watching");
    assert.equal(read.finished.known, false, "storing a choice invented a finishing");
  });

  test("no taste field appears on anything read back", async () => {
    const read = await ana.episode((await ana.record(evening())).id);
    assert.deepEqual(Object.keys(read).sort(), [
      "chosen",
      "finished",
      "id",
      "offered",
      "recordedAt",
      "request",
      "watched",
    ]);
    for (const offer of read.offered) {
      assert.deepEqual(Object.keys(offer).sort(), ["lead", "title", "year"]);
    }
  });

  test("one user cannot read another's episode", async () => {
    const hers = await ana.record(evening());
    await assert.rejects(() => ben.episode(hers.id), EpisodeError);
  });

  test("listing returns only that user's episodes", async () => {
    const fresh = sqlEpisodeStore(driver, asUser("google:cleo"));
    assert.deepEqual(await fresh.episodes(), [], "a new user inherited somebody's evenings");

    const one = await fresh.record(beginEpisode("something funny", []));
    const listed = await fresh.episodes();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, one.id);

    const theirs = await ben.episodes();
    assert.equal(
      theirs.some((episode) => episode.id === one.id),
      false,
      "another user's episode appeared in this list",
    );
  });

  test("two users may hold episodes without their ids colliding", async () => {
    // Identity is (user_id, id), as it is in the taste model. Each user's rows
    // are addressed within their own space and neither can name the other's.
    const hers = await ana.record(evening());
    const his = await ben.record(evening());
    assert.notEqual(hers.id, his.id);

    await assert.rejects(() => ana.episode(his.id), EpisodeError);
    await assert.rejects(() => ben.episode(hers.id), EpisodeError);
    assert.equal((await ana.episode(hers.id)).id, hers.id);
    assert.equal((await ben.episode(his.id)).id, his.id);
  });

  test("an episode with no offers is a fact too", async () => {
    const read = await ana.episode((await ana.record(beginEpisode("anything", []))).id);
    assert.deepEqual(read.offered, []);
    assert.equal(read.chosen.known, false);
  });

  test("identity is stable and the recording moment is recorded", async () => {
    const written = await ana.record(evening());
    assert.match(written.id, /^[0-9a-f-]{36}$/u);
    assert.match(written.recordedAt, /^\d{4}-\d{2}-\d{2}T/u);
    assert.equal((await ana.episode(written.id)).recordedAt, written.recordedAt);
  });

  test("the store corrects and forgets, and offers no generic mutation", () => {
    // Slice 3 adds exactly two. A broad update or upsert could express
    // corrections this milestone has no meaning for, and would put the
    // offered-film rule somewhere a caller could route around.
    assert.equal(typeof ana.correct, "function");
    assert.equal(typeof ana.forget, "function");
    for (const absent of ["update", "upsert", "merge", "patch", "setState"]) {
      assert.equal(absent in ana, false, `a generic ${absent} appeared`);
    }
  });

  test("correcting watched changes what a later read says", async () => {
    const written = await ana.record(evening());
    await ana.correct(written.id, { watched: true });
    const read = await ana.episode(written.id);
    assert.equal(read.watched.known && read.watched.value, true);

    await ana.correct(written.id, { watched: false });
    const again = await ana.episode(written.id);
    assert.equal(again.watched.known && again.watched.value, false);
  });

  test("retracting returns a field to unknown, not to false", async () => {
    const written = await ana.record(stateOutcome(evening(), { watched: true }));
    await ana.correct(written.id, { watched: null });
    const read = await ana.episode(written.id);
    assert.equal(read.watched.known, false, "a retraction left a stated no behind");
  });

  test("a retracted value does not reappear on a later read", async () => {
    const written = await ana.record(stateOutcome(evening(), { watched: true, finished: true }));
    await ana.correct(written.id, { finished: null });

    for (const read of [await ana.episode(written.id), ...(await ana.episodes()).filter((e) => e.id === written.id)]) {
      assert.equal(read.finished.known, false, "the superseded value came back");
      assert.equal(read.watched.known && read.watched.value, true, "an untouched field moved");
    }
  });

  test("correcting one outcome leaves the others exactly as they were", async () => {
    const written = await ana.record(
      stateOutcome(evening(), { chosen: offers[0], watched: true, finished: false }),
    );

    await ana.correct(written.id, { finished: true });
    const afterFinished = await ana.episode(written.id);
    assert.equal(afterFinished.watched.known && afterFinished.watched.value, true);
    assert.deepEqual(afterFinished.chosen.known && afterFinished.chosen.value, offers[0]);

    await ana.correct(written.id, { chosen: offers[1] });
    const afterChosen = await ana.episode(written.id);
    assert.deepEqual(afterChosen.chosen.known && afterChosen.chosen.value, offers[1]);
    assert.equal(afterChosen.watched.known && afterChosen.watched.value, true, "chosen moved watched");
    assert.equal(
      afterChosen.finished.known && afterChosen.finished.value,
      true,
      "chosen moved finished",
    );
  });

  test("a corrected chosen still has to be a film that was offered", async () => {
    const written = await ana.record(stateOutcome(evening(), { chosen: offers[0] }));
    await assert.rejects(
      () => ana.correct(written.id, { chosen: { title: "Heat", year: 1995, lead: false } }),
      EpisodeError,
    );
    const read = await ana.episode(written.id);
    assert.deepEqual(read.chosen.known && read.chosen.value, offers[0], "a refused correction landed");
  });

  test("chosen can be retracted to unknown, leaving one offer marked by nobody", async () => {
    const written = await ana.record(stateOutcome(evening(), { chosen: offers[0] }));
    await ana.correct(written.id, { chosen: null });
    const read = await ana.episode(written.id);
    assert.equal(read.chosen.known, false);
    assert.deepEqual(read.offered, offers, "retracting a choice removed the offer");
  });

  test("correcting nothing is refused rather than quietly doing nothing", async () => {
    const written = await ana.record(evening());
    await assert.rejects(() => ana.correct(written.id, {}), EpisodeError);
  });

  test("correcting or forgetting an episode that is not there says so", async () => {
    const absent = "00000000-0000-0000-0000-000000000000";
    await assert.rejects(() => ana.correct(absent, { watched: true }), EpisodeError);
    await assert.rejects(() => ana.forget(absent), EpisodeError);
  });

  test("a forgotten episode is gone from the direct read and from the listing", async () => {
    const written = await ana.record(evening());
    assert.equal((await ana.episode(written.id)).id, written.id);

    const forgotten = await ana.forget(written.id);
    assert.equal(forgotten.id, written.id, "forgetting did not report what it removed");

    await assert.rejects(() => ana.episode(written.id), EpisodeError);
    assert.equal(
      (await ana.episodes()).some((episode) => episode.id === written.id),
      false,
      "a forgotten episode is still listed",
    );
  });

  test("forgetting takes the offers with it", async () => {
    const written = await ana.record(evening());
    await ana.forget(written.id);
    const left = await driver.query<{ n: string }>(
      `SELECT count(*) AS n FROM tonight_episode_offers WHERE episode = $1`,
      [written.id],
    );
    assert.equal(Number(left[0]?.n), 0, "the offers outlived the episode");
  });

  test("one user cannot correct or forget another's episode", async () => {
    const hers = await ana.record(evening());
    await assert.rejects(() => ben.correct(hers.id, { watched: true }), EpisodeError);
    await assert.rejects(() => ben.forget(hers.id), EpisodeError);

    const still = await ana.episode(hers.id);
    assert.equal(still.watched.known, false, "another user's correction landed");
    assert.equal(still.id, hers.id, "another user's deletion landed");
  });

  test("forgetting one user's episode leaves the other's standing", async () => {
    const hers = await ana.record(evening());
    const his = await ben.record(evening());
    await ana.forget(hers.id);
    assert.equal((await ben.episode(his.id)).id, his.id, "the other user's evening went too");
  });

  test("nothing in episode persistence reaches the taste model", async () => {
    const fs = await import("node:fs");
    for (const file of ["store.ts", "store/sql.ts", "store/schema.ts"]) {
      const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
      // Block comments, line comments and SQL comments alike: a prose reference
      // to the taste store is exactly what these files should contain, and an
      // import of it is exactly what they should not.
      const code = source
        .replace(/\/\*\*[\s\S]*?\*\//gu, "")
        .replace(/\/\/[^\n]*/gu, "")
        .replace(/--[^\n]*/gu, "");
      assert.equal(code.includes("taste"), false, `${file} reaches the taste model`);
      assert.equal(code.includes("tonight_genres"), false, `${file} names a taste table`);
      assert.equal(code.includes("tonight_movies"), false, `${file} names a taste table`);
    }
  });
});
