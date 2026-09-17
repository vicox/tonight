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

  test("the store offers no way to change or forget an episode yet", () => {
    // Slice 3 owns correction and deletion. If these appear before it, the
    // milestone's own ordering rule has been broken.
    for (const absent of ["update", "correct", "delete", "forget", "upsert"]) {
      assert.equal(absent in ana, false, `${absent} arrived before Slice 3`);
    }
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
