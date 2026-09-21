import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { beginEpisode, EpisodeError, correctEpisode, type Episode, type Offer } from "./model.ts";
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
    const said = correctEpisode(evening(), { watched: false, finished: false });
    const read = await ana.episode((await ana.record(said)).id);
    assert.equal(read.watched.known, true, "a stated no came back as silence");
    assert.equal(read.watched.known && read.watched.value, false);
    assert.equal(read.finished.known && read.finished.value, false);
  });

  test("unknown and a stated no are still different after persistence", async () => {
    const silent = await ana.episode((await ana.record(evening())).id);
    const said = await ana.episode(
      (await ana.record(correctEpisode(evening(), { watched: false }))).id,
    );

    assert.notDeepEqual(silent.watched, said.watched, "persistence collapsed the two");
    assert.equal(silent.watched.known, false);
    assert.equal(said.watched.known, true);
  });

  test("a stated yes and a stated no are both stated", async () => {
    const yes = await ana.episode((await ana.record(correctEpisode(evening(), { watched: true }))).id);
    const no = await ana.episode((await ana.record(correctEpisode(evening(), { watched: false }))).id);
    assert.equal(yes.watched.known && yes.watched.source, "stated");
    assert.equal(no.watched.known && no.watched.source, "stated");
  });

  test("the chosen film comes back as one of the offered films", async () => {
    const chose = correctEpisode(evening(), { chosen: offers[1] });
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
    const chose = correctEpisode(evening(), { chosen: offers[0] });
    const read = await ana.episode((await ana.record(chose)).id);
    assert.equal(read.chosen.known, true);
    assert.equal(read.watched.known, false, "storing a choice invented a watching");
    assert.equal(read.finished.known, false, "storing a choice invented a finishing");
  });

  /* --------------------------------------------- correcting what Tonight wrote */

  /**
   * The two facts Tonight recorded for itself, and what happens when it got
   * them wrong.
   *
   * Deleting the evening is not the repair: it takes the outcomes with it, and
   * those are the user's. So these two are correctable in place, and the
   * provenance moves with them — a request somebody had to fix is a request
   * they stated, whatever Tonight thought it heard.
   */
  test("a recorded evening says Tonight observed both of its own facts", async () => {
    const read = await ana.episode((await ana.record(evening())).id);
    assert.equal(read.requestSource, "observed");
    assert.equal(read.offeredSource, "observed");
  });

  test("correcting the request replaces it and moves its provenance", async () => {
    const written = await ana.record(evening());
    const fixed = await ana.correct(written.id, { request: "something quiet, not something tense" });

    assert.equal(fixed.request, "something quiet, not something tense");
    assert.equal(fixed.requestSource, "stated", "a corrected request still claims to be observed");
    assert.equal(fixed.offeredSource, "observed", "correcting one field moved the other's provenance");
    const read = await ana.episode(written.id);
    assert.equal(read.request, "something quiet, not something tense");
    assert.equal(read.requestSource, "stated");
  });

  test("a request cannot be corrected into nothing", async () => {
    const written = await ana.record(evening());
    for (const empty of ["", "   ", null, undefined]) {
      await assert.rejects(
        () => ana.correct(written.id, { request: empty as unknown as string }),
        EpisodeError,
        `a request of ${JSON.stringify(empty)} was accepted`,
      );
    }
    assert.equal((await ana.episode(written.id)).request, evening().request);
  });

  test("correcting the offers replaces the list and moves its provenance", async () => {
    const written = await ana.record(evening());
    const replacement: Offer[] = [
      { title: "Memories of Murder", year: 2003, lead: true },
      { title: "Cure", year: 1997, lead: false },
    ];
    const fixed = await ana.correct(written.id, { offered: replacement });

    assert.deepEqual([...fixed.offered], replacement);
    assert.equal(fixed.offeredSource, "stated");
    assert.equal(fixed.requestSource, "observed");
    // And the rows really moved, order included.
    assert.deepEqual([...(await ana.episode(written.id)).offered], replacement);
  });

  /**
   * An empty list is a correction like any other.
   *
   * Passing `offered` means *"this list is wrong, here is the right one"*, and
   * sometimes the right one is nothing: Tonight recorded films it never put
   * forward. That is a fact about the evening, not a request to delete it, and
   * the outcomes stay exactly where they are.
   */
  test("an offer list can be corrected to none, when nothing was chosen", async () => {
    const written = await ana.record(correctEpisode(evening(), { watched: true }));
    const fixed = await ana.correct(written.id, { offered: [] });

    assert.deepEqual([...fixed.offered], []);
    assert.equal(fixed.offeredSource, "stated");
    assert.equal(fixed.chosen.known, false);
    assert.equal(fixed.watched.known && fixed.watched.value, true, "an outcome went with the offers");
    const read = await ana.episode(written.id);
    assert.deepEqual([...read.offered], [], "the offers came back after a reread");
    assert.equal(read.offeredSource, "stated");
    assert.equal(read.watched.known && read.watched.value, true);
  });

  test("emptying the offers is refused while a chosen film still stands", async () => {
    const written = await ana.record(correctEpisode(evening(), { chosen: offers[0], watched: true }));
    const before = await ana.episode(written.id);

    await assert.rejects(() => ana.correct(written.id, { offered: [] }), EpisodeError);
    assert.deepEqual(await ana.episode(written.id), before, "a refusal left part of itself behind");
  });

  test("emptying the offers succeeds when the same correction takes the choice back", async () => {
    // Both halves in one breath: the evening that results is consistent, so the
    // transition is allowed even though neither half would be on its own.
    const written = await ana.record(correctEpisode(evening(), { chosen: offers[0], watched: true }));
    const fixed = await ana.correct(written.id, { offered: [], chosen: null });

    assert.deepEqual([...fixed.offered], []);
    assert.equal(fixed.chosen.known, false);
    assert.equal(fixed.watched.known && fixed.watched.value, true);
    assert.deepEqual(await ana.episode(written.id), fixed, "the reread disagreed with what was returned");
  });

  /**
   * What is being kept when a choice survives a corrected list.
   *
   * The fact is *"they chose film A"*. How A was described — where it sat, and
   * whether it led — belongs to the list, and a corrected list may describe it
   * differently. If the choice kept the old description, the evening returned
   * here and the same evening read back would disagree about the same film.
   */
  test("a retained choice is rebound to the corrected offer, and the reread agrees", async () => {
    const lead = offers[0]!;
    const other = offers[1]!;
    assert.equal(lead.lead, true, "the fixture no longer starts with a leading choice");
    const written = await ana.record(correctEpisode(evening(), { chosen: lead, watched: true }));
    assert.equal((await ana.episode(written.id)).chosen.known && true, true);

    // The same two films, with the lead moved to the other one.
    const swapped: Offer[] = [
      { title: lead.title, year: lead.year, lead: false },
      { title: other.title, year: other.year, lead: true },
    ];
    const fixed = await ana.correct(written.id, { offered: swapped });

    assert.equal(fixed.chosen.known, true);
    assert.deepEqual(
      fixed.chosen.known ? fixed.chosen.value : null,
      { title: lead.title, year: lead.year, lead: false },
      "the choice kept how the old list described the film",
    );
    const read = await ana.episode(written.id);
    assert.deepEqual(read, fixed, "what was returned and what was stored describe different evenings");
  });

  test("the offers and the choice can be replaced together", async () => {
    const written = await ana.record(correctEpisode(evening(), { chosen: offers[0], watched: true }));
    const replacement: Offer[] = [{ title: "Cure", year: 1997, lead: true }];
    const fixed = await ana.correct(written.id, {
      offered: replacement,
      chosen: replacement[0],
    });

    assert.deepEqual([...fixed.offered], replacement);
    assert.deepEqual(fixed.chosen.known ? fixed.chosen.value : null, replacement[0]);
    assert.equal(fixed.offeredSource, "stated");
    assert.deepEqual(await ana.episode(written.id), fixed);
  });

  test("a correction that fails anywhere changes nothing anywhere", async () => {
    // Request and offers in one call, with the offers invalid against the
    // choice. The request must not survive the refusal.
    const written = await ana.record(correctEpisode(evening(), { chosen: offers[0], watched: true }));
    const before = await ana.episode(written.id);

    await assert.rejects(
      () =>
        ana.correct(written.id, {
          request: "a request that must not land",
          offered: [{ title: "Cure", year: 1997, lead: true }],
        }),
      EpisodeError,
    );

    const after = await ana.episode(written.id);
    assert.deepEqual(after, before, "part of a refused correction was written");
    assert.equal(after.request, evening().request);
    assert.equal(after.requestSource, "observed");
    assert.equal(after.offeredSource, "observed");
  });

  /**
   * The collision, and why it is refused rather than reconciled.
   *
   * What they chose is theirs; the offer list is Tonight's. Dropping their
   * statement to make Tonight's list fit would repair the wrong one of the two.
   */
  test("an offer correction that would drop the chosen film is refused, whole", async () => {
    const written = await ana.record(correctEpisode(evening(), { chosen: offers[0], watched: true }));
    const before = await ana.episode(written.id);

    await assert.rejects(
      () => ana.correct(written.id, { offered: [{ title: "Cure", year: 1997, lead: true }] }),
      (error: Error) => {
        assert.ok(error instanceof EpisodeError);
        assert.ok(
          error.message.includes(offers[0]!.title),
          `the refusal does not name the film in the way: ${error.message}`,
        );
        return true;
      },
    );

    // Nothing moved: not the offers, not the choice, not the provenance, and
    // not the outcome that was recorded alongside them.
    const after = await ana.episode(written.id);
    assert.deepEqual(after, before, "a refused correction left part of itself behind");
  });

  test("an offer correction that keeps the chosen film succeeds and keeps the choice", async () => {
    const written = await ana.record(correctEpisode(evening(), { chosen: offers[0], watched: true }));
    const kept = offers[0]!;
    const fixed = await ana.correct(written.id, {
      offered: [kept, { title: "Cure", year: 1997, lead: false }],
    });

    assert.equal(fixed.chosen.known, true);
    assert.deepEqual(fixed.chosen.known ? fixed.chosen.value : null, kept);
    assert.equal(fixed.watched.known && fixed.watched.value, true, "an outcome was lost with the offers");
    assert.equal(fixed.offeredSource, "stated");
    const read = await ana.episode(written.id);
    assert.equal(read.chosen.known && read.chosen.value.title, kept.title);
    assert.equal(read.offered.length, 2);
  });

  test("one user cannot correct another's request or offers", async () => {
    const written = await ana.record(evening());
    for (const correction of [{ request: "hers, not his" }, { offered: [{ title: "Cure", year: 1997, lead: true }] }]) {
      await assert.rejects(() => ben.correct(written.id, correction), EpisodeError);
    }
    const read = await ana.episode(written.id);
    assert.equal(read.request, evening().request);
    assert.equal(read.requestSource, "observed");
    assert.equal(read.offeredSource, "observed");
  });

  test("no taste field appears on anything read back", async () => {
    const read = await ana.episode((await ana.record(evening())).id);
    assert.deepEqual(Object.keys(read).sort(), [
      "chosen",
      "finished",
      "id",
      "offered",
      "offeredSource",
      "recordedAt",
      "request",
      "requestSource",
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
    const written = await ana.record(correctEpisode(evening(), { watched: true }));
    await ana.correct(written.id, { watched: null });
    const read = await ana.episode(written.id);
    assert.equal(read.watched.known, false, "a retraction left a stated no behind");
  });

  test("a retracted value does not reappear on a later read", async () => {
    const written = await ana.record(correctEpisode(evening(), { watched: true, finished: true }));
    await ana.correct(written.id, { finished: null });

    for (const read of [await ana.episode(written.id), ...(await ana.episodes()).filter((e) => e.id === written.id)]) {
      assert.equal(read.finished.known, false, "the superseded value came back");
      assert.equal(read.watched.known && read.watched.value, true, "an untouched field moved");
    }
  });

  test("correcting one outcome leaves the others exactly as they were", async () => {
    const written = await ana.record(
      correctEpisode(evening(), { chosen: offers[0], watched: true, finished: false }),
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
    const written = await ana.record(correctEpisode(evening(), { chosen: offers[0] }));
    await assert.rejects(
      () => ana.correct(written.id, { chosen: { title: "Heat", year: 1995, lead: false } }),
      EpisodeError,
    );
    const read = await ana.episode(written.id);
    assert.deepEqual(read.chosen.known && read.chosen.value, offers[0], "a refused correction landed");
  });

  test("chosen can be retracted to unknown, leaving one offer marked by nobody", async () => {
    const written = await ana.record(correctEpisode(evening(), { chosen: offers[0] }));
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


/**
 * What the v2 migration does to evenings that were already there.
 *
 * The suite above starts from a database migrated all the way, which is the
 * one shape that cannot answer this: every row in it was written by code that
 * already knew about the two source columns. So this builds the old world
 * instead — schema at v1, a legacy evening inserted through it — and then
 * upgrades, which is what will happen to the rows that exist in production.
 *
 * The expected answer is written out here rather than read from the migration:
 * `observed` is correct for these rows because correcting a request or an offer
 * list did not exist when they were written, so none of them was corrected.
 * Calling them `stated` would claim the user fixed something they never saw.
 */
describe("an evening recorded before provenance was stored", () => {
  let driver: SqlDriver;
  let store: EpisodeStore;

  const LEGACY = {
    id: "3f1d6b1e-9a0c-4a1e-8f7a-2b5c9d0e4a11",
    request: "something tense, recorded long ago",
    offers: [
      { title: "Prisoners", year: 2013, lead: true, chosen: true },
      { title: "Zodiac", year: 2007, lead: false, chosen: false },
    ],
  };

  before(async () => {
    driver = await embeddedDriver();

    // The schema as it shipped, with nothing after it.
    const v1 = EPISODES_SCHEMA.migrations.find((migration) => migration.version === 1);
    assert.ok(v1, "the episodes schema no longer has a version 1 to upgrade from");
    await migrate(driver, { module: EPISODES_SCHEMA.module, migrations: [v1] });

    // A legitimate evening, written the way v1 could write one: the two source
    // columns are not named because they do not exist yet.
    await driver.query(
      `INSERT INTO tonight_episodes (user_id, id, request, watched, finished)
            VALUES ($1, $2, $3, $4, $5)`,
      ["google:legacy", LEGACY.id, LEGACY.request, true, null],
    );
    for (const [position, offer] of LEGACY.offers.entries()) {
      await driver.query(
        `INSERT INTO tonight_episode_offers
                (user_id, episode, position, title, year, lead, chosen)
              VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ["google:legacy", LEGACY.id, position, offer.title, offer.year, offer.lead, offer.chosen],
      );
    }

    // And now the upgrade. Version 1 is already recorded, so this applies v2
    // and nothing else.
    await migrate(driver, EPISODES_SCHEMA);
    store = sqlEpisodeStore(driver, asUser("google:legacy"));
  });

  after(async () => {
    await driver.close();
  });

  test("the migrated evening says Tonight observed both of its own facts", async () => {
    const read = await store.episode(LEGACY.id);
    assert.equal(read.requestSource, "observed");
    assert.equal(read.offeredSource, "observed");
  });

  test("nothing the legacy evening held was changed by the upgrade", async () => {
    const read = await store.episode(LEGACY.id);
    assert.equal(read.request, LEGACY.request);
    assert.deepEqual(
      [...read.offered],
      LEGACY.offers.map((offer) => ({ title: offer.title, year: offer.year, lead: offer.lead })),
    );
    assert.equal(read.chosen.known, true);
    assert.deepEqual(read.chosen.known ? read.chosen.value : null, {
      title: "Prisoners",
      year: 2013,
      lead: true,
    });
    assert.equal(read.watched.known && read.watched.value, true);
    assert.equal(read.finished.known, false, "an unstated outcome acquired a value");
  });

  test("the migrated evening is a valid Episode under the current model", async () => {
    // Not merely readable: usable. It goes through the correction path the
    // current model offers, and comes out the other side saying the right thing
    // about where each fact came from.
    const read = await store.episode(LEGACY.id);
    assert.deepEqual(Object.keys(read).sort(), [
      "chosen",
      "finished",
      "id",
      "offered",
      "offeredSource",
      "recordedAt",
      "request",
      "requestSource",
      "watched",
    ]);
    const fixed = await store.correct(LEGACY.id, { request: "what they actually asked for" });
    assert.equal(fixed.requestSource, "stated");
    assert.equal(fixed.offeredSource, "observed", "correcting one field moved the other's provenance");
    assert.equal(fixed.chosen.known, true, "a legacy choice was lost on first correction");
  });
});
