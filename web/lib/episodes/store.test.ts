import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver, Transaction } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import type { AuthenticatedUser } from "../identity.ts";
import {
  beginEpisode,
  EpisodeError,
  stated,
  UNKNOWN,
  type Episode,
  type Offer,
  type OfferedFilm,
  type Recorded,
} from "./model.ts";
import type { EpisodeStore, Forgotten } from "./store.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "./store/sql.ts";

/**
 * Episode persistence, held to the things that make it worth having.
 *
 * A store that loses the difference between *"nobody said"* and *"they said no"*
 * turns every unanswered evening into a stated negative, and does it invisibly.
 * So much of what follows is about that difference surviving a round trip, per
 * offer; about every write going through the model whole, so a refusal leaves
 * nothing behind; and about the isolation that keeps one person's evenings out
 * of another's.
 */

const prisoners: OfferedFilm = { title: "Prisoners", year: 2013, lead: true };
const zodiac: OfferedFilm = { title: "Zodiac", year: 2007, lead: false };

const evening = (): Episode =>
  beginEpisode({ request: "something tense tonight", offered: [prisoners, zodiac] });

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

/** The evening a correction left, or a failure if it was deleted instead. */
function kept(result: Recorded<Episode> | Forgotten): Recorded<Episode> {
  assert.ok(!("forgotten" in result), "the evening was deleted where it should have been kept");
  return result;
}

const offerOf = (episode: Episode, title: string): Offer => {
  const found = episode.offers.find((offer) => offer.title === title);
  assert.ok(found, `${title} is not in the evening`);
  return found;
};

/** A driver whose statements fail where `fails` says so, inside the real transaction. */
function failingOn(driver: SqlDriver, fails: (text: string) => boolean): SqlDriver {
  const wrap = (tx: Transaction): Transaction => ({
    query: (text, params) => (fails(text) ? Promise.reject(new Error("injected")) : tx.query(text, params)),
    exec: (text) => (fails(text) ? Promise.reject(new Error("injected")) : tx.exec(text)),
  });
  return { ...driver, transaction: (work) => driver.transaction((tx) => work(wrap(tx))) };
}

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

  const count = async (table: string) =>
    Number((await driver.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0]?.n);

  /* ------------------------------------------------------------ round trips */

  test("every field survives a round trip, in the order the films first appeared", async () => {
    const said = beginEpisode({
      request: "something tense tonight",
      offered: [prisoners, zodiac],
      offers: [
        { title: "Prisoners", year: 2013, chosen: true, finished: true },
        { title: "Zodiac", year: 2007, passed: true, passReason: "too long tonight" },
        { title: "Heat", year: 1995, started: false },
      ],
    });
    const written = await ana.record(said);
    const read = await ana.episode(written.id);

    assert.deepEqual(read, written, "what was returned and what was stored describe different evenings");
    assert.deepEqual(
      read.offers.map((offer) => offer.title),
      ["Prisoners", "Zodiac", "Heat"],
    );
    assert.deepEqual(offerOf(read, "Prisoners"), {
      title: "Prisoners",
      year: 2013,
      offered: true,
      lead: true,
      chosen: stated(true),
      started: stated(true),
      finished: stated(true),
      passed: UNKNOWN,
    });
    assert.deepEqual(offerOf(read, "Zodiac"), {
      title: "Zodiac",
      year: 2007,
      offered: true,
      lead: false,
      chosen: UNKNOWN,
      started: UNKNOWN,
      finished: UNKNOWN,
      passed: stated(true),
      passReason: "too long tonight",
    });
    assert.deepEqual(offerOf(read, "Heat"), {
      title: "Heat",
      year: 1995,
      offered: false,
      lead: false,
      chosen: UNKNOWN,
      started: stated(false),
      finished: UNKNOWN,
      passed: UNKNOWN,
    });
  });

  test("unknown and a stated no are still different after persistence", async () => {
    const written = await ana.record(
      beginEpisode({ request: "x", offered: [prisoners, zodiac], offers: [{ title: "Zodiac", year: 2007, started: false }] }),
    );
    const read = await ana.episode(written.id);
    assert.deepEqual(offerOf(read, "Prisoners").started, UNKNOWN, "an unanswered offer came back answered");
    assert.deepEqual(offerOf(read, "Zodiac").started, stated(false), "a stated no came back as silence");
  });

  test("a recorded evening says Tonight observed both of its own facts", async () => {
    const read = await ana.episode((await ana.record(evening())).id);
    assert.equal(read.requestSource, "observed");
    assert.equal(read.offeredSource, "observed");
  });

  test("an evening with no offers is a fact too, and an evening of their own has no request", async () => {
    const none = await ana.episode((await ana.record(beginEpisode({ request: "anything", offered: [] }))).id);
    assert.deepEqual(none.offers, []);

    const own = await ana.episode(
      (await ana.record(beginEpisode({ offers: [{ title: "Heat", year: 1995, started: true }] }))).id,
    );
    assert.equal(own.request, null);
    assert.equal(offerOf(own, "Heat").offered, false);
  });

  test("a long title is kept exactly, and the evening stays correctable", async () => {
    const title = "A".repeat(8_192);
    const written = await ana.record(beginEpisode({ request: "x", offered: [{ title, year: 2000, lead: true }] }));
    const read = await ana.episode(written.id);
    assert.equal(read.offers[0]?.title, title);
    const fixed = kept(await ana.correct(written.id, { offers: [{ title, year: 2000, chosen: true }] }));
    assert.deepEqual(fixed.offers[0]?.chosen, stated(true));
  });

  test("nothing about taste appears on anything read back", async () => {
    const read = await ana.episode((await ana.record(evening())).id);
    assert.deepEqual(Object.keys(read).sort(), [
      "id",
      "offeredSource",
      "offers",
      "recordedAt",
      "request",
      "requestSource",
    ]);
    for (const offer of read.offers) {
      assert.deepEqual(Object.keys(offer).sort(), [
        "chosen",
        "finished",
        "lead",
        "offered",
        "passed",
        "started",
        "title",
        "year",
      ]);
    }
  });

  test("identity is stable and the recording moment is recorded", async () => {
    const written = await ana.record(evening());
    assert.match(written.id, /^[0-9a-f-]{36}$/u);
    assert.match(written.recordedAt, /^\d{4}-\d{2}-\d{2}T/u);
    assert.equal((await ana.episode(written.id)).recordedAt, written.recordedAt);
  });

  /* ----------------------------------------------------------------- rounds */

  test("a round appends to the evening it names, and a re-offer keeps its place and facts", async () => {
    const written = await ana.record(
      beginEpisode({ request: "x", offered: [prisoners, zodiac], offers: [{ title: "Zodiac", year: 2007, chosen: true }] }),
    );
    const later = await ana.addRound(written.id, {
      offered: [
        { title: "Heat", year: 1995, lead: false },
        { title: "Zodiac", year: 2007, lead: true },
      ],
    });
    assert.deepEqual(later.offers.map((offer) => offer.title), ["Prisoners", "Zodiac", "Heat"]);
    assert.equal(offerOf(later, "Zodiac").lead, true);
    assert.deepEqual(offerOf(later, "Zodiac").chosen, stated(true));
    assert.equal(later.request, "x");
    assert.equal(later.recordedAt, written.recordedAt);
    assert.deepEqual(await ana.episode(written.id), later, "the reread disagreed with what was returned");
  });

  /* --------------------------------------------------------- record_episode only adds */

  describe("a round only adds", () => {
    /** An evening with Prisoners started and Zodiac passed on, with a reason. */
    const stored = async () =>
      ana.record(
        beginEpisode({
          request: "x",
          offered: [prisoners, zodiac],
          offers: [
            { title: "Prisoners", year: 2013, started: true },
            { title: "Zodiac", year: 2007, passed: true, passReason: "too long" },
          ],
        }),
      );

    test("a change or a retraction is refused, and the evening is untouched", async () => {
      const written = await stored();
      const untouched = await ana.episode(written.id);
      for (const offers of [
        [{ title: "Prisoners", year: 2013, started: false }],
        [{ title: "Zodiac", year: 2007, passed: false }],
        [{ title: "Zodiac", year: 2007, passReason: "boring" }],
        [{ title: "Prisoners", year: 2013, started: null }],
      ]) {
        await assert.rejects(() => ana.addRound(written.id, { offers }), EpisodeError, JSON.stringify(offers));
        assert.deepEqual(await ana.episode(written.id), untouched, `${JSON.stringify(offers)} left something behind`);
      }
    });

    test("restating a stored value, or the same reason trimmed, changes nothing", async () => {
      const written = await stored();
      const untouched = await ana.episode(written.id);
      const same = await ana.addRound(written.id, {
        offers: [
          { title: "Prisoners", year: 2013, started: true },
          { title: "Zodiac", year: 2007, passReason: "  too long  " },
        ],
      });
      assert.deepEqual(same, untouched);
      assert.deepEqual(await ana.episode(written.id), untouched);
    });

    test("filling what is unknown is accepted", async () => {
      const written = await stored();
      const more = await ana.addRound(written.id, { offers: [{ title: "Prisoners", year: 2013, finished: true }] });
      assert.deepEqual(offerOf(more, "Prisoners").finished, stated(true));
      assert.deepEqual(offerOf(await ana.episode(written.id), "Prisoners").finished, stated(true));
    });

    test("an append carrying new offers and a forbidden change is refused whole", async () => {
      const written = await stored();
      const untouched = await ana.episode(written.id);
      await assert.rejects(
        () =>
          ana.addRound(written.id, {
            offered: [{ title: "Heat", year: 1995, lead: true }],
            offers: [{ title: "Prisoners", year: 2013, started: false }],
          }),
        EpisodeError,
      );
      assert.deepEqual(await ana.episode(written.id), untouched, "the new offers landed without their round");
    });
  });

  test("a new evening naming a film twice is refused, with nothing written", async () => {
    const before = await count("tonight_episodes");
    const episode = evening();
    const twice: Episode = { ...episode, offers: [...episode.offers, { ...episode.offers[0]! }] };
    await assert.rejects(() => ana.record(twice), EpisodeError);
    assert.throws(() => beginEpisode({ request: "x", offered: [zodiac, zodiac] }), EpisodeError);
    assert.throws(
      () =>
        beginEpisode({
          offers: [
            { title: "Heat", year: 1995, started: true },
            { title: "Heat", year: 1995, chosen: true },
          ],
        }),
      EpisodeError,
    );
    assert.equal(await count("tonight_episodes"), before);
  });

  test("creating an evening with neither a request nor a film is refused, with nothing written", async () => {
    const before = await count("tonight_episodes");
    await assert.rejects(
      () => ana.record({ request: null, requestSource: "observed", offers: [], offeredSource: "observed" }),
      EpisodeError,
    );
    assert.equal(await count("tonight_episodes"), before);
  });

  /* ------------------------------------------------------------ corrections */

  test("correcting the request replaces it and moves its provenance alone", async () => {
    const written = await ana.record(evening());
    const fixed = kept(await ana.correct(written.id, { request: "something quiet, not something tense" }));
    assert.equal(fixed.requestSource, "stated");
    assert.equal(fixed.offeredSource, "observed");
    const read = await ana.episode(written.id);
    assert.equal(read.request, "something quiet, not something tense");
    assert.equal(read.requestSource, "stated");
  });

  test("statements merge one film at a time, and null takes a fact back", async () => {
    const written = await ana.record(evening());
    await ana.correct(written.id, { offers: [{ title: "Prisoners", year: 2013, chosen: true }] });
    await ana.correct(written.id, { offers: [{ title: "Zodiac", year: 2007, started: true }] });
    const both = await ana.episode(written.id);
    assert.deepEqual(offerOf(both, "Prisoners").chosen, stated(true), "a statement about Zodiac erased Prisoners");
    assert.deepEqual(offerOf(both, "Zodiac").started, stated(true));

    await ana.correct(written.id, { offers: [{ title: "Prisoners", year: 2013, chosen: null }] });
    assert.deepEqual(offerOf(await ana.episode(written.id), "Prisoners").chosen, UNKNOWN);
  });

  test("correcting the offered set keeps a chosen film as theirs, and drops one nobody spoke of", async () => {
    const written = await ana.record(
      beginEpisode({ request: "x", offered: [prisoners, zodiac], offers: [{ title: "Prisoners", year: 2013, chosen: true }] }),
    );
    const fixed = kept(await ana.correct(written.id, { offered: [{ title: "Cure", year: 1997, lead: true }] }));
    assert.deepEqual(fixed.offers.map((offer) => [offer.title, offer.offered, offer.lead]), [
      ["Prisoners", false, false],
      ["Cure", true, true],
    ]);
    assert.equal(fixed.offeredSource, "stated");
    assert.deepEqual(await ana.episode(written.id), fixed);
  });

  test("a correction refused anywhere changes nothing anywhere", async () => {
    const written = await ana.record(evening());
    const untouched = await ana.episode(written.id);
    await assert.rejects(
      () =>
        ana.correct(written.id, {
          request: "a request that must not land",
          offers: [{ title: "Zodiac", year: 2007, passed: true, chosen: true }],
        }),
      EpisodeError,
    );
    assert.deepEqual(await ana.episode(written.id), untouched);
  });

  test("correcting nothing, or with the old evening-level fields, is refused", async () => {
    const written = await ana.record(evening());
    await assert.rejects(() => ana.correct(written.id, {}), EpisodeError);
    await assert.rejects(() => ana.correct(written.id, { watched: true } as never), EpisodeError);
  });

  test("correcting, appending to or forgetting an episode that is not there says so", async () => {
    const absent = "00000000-0000-0000-0000-000000000000";
    await assert.rejects(() => ana.correct(absent, { request: "x" }), EpisodeError);
    await assert.rejects(() => ana.addRound(absent, { offered: [prisoners] }), EpisodeError);
    await assert.rejects(() => ana.forget(absent), EpisodeError);
  });

  /* --------------------------------------------- F6: an evening of their own */

  test("taking back the last fact of an evening of their own deletes it, and says so", async () => {
    const written = await ana.record(beginEpisode({ offers: [{ title: "Heat", year: 1995, started: true }] }));
    const done = await ana.correct(written.id, { offers: [{ title: "Heat", year: 1995, started: null }] });
    assert.deepEqual(done, { forgotten: written.id });

    await assert.rejects(() => ana.episode(written.id), EpisodeError);
    assert.equal((await ana.episodes()).some((episode) => episode.id === written.id), false);
    const left = await driver.query<{ n: string }>(
      `SELECT count(*) AS n FROM tonight_episode_offers WHERE episode = $1`,
      [written.id],
    );
    assert.equal(Number(left[0]?.n), 0, "the offers outlived the evening");
  });

  test("an evening of their own with a fact still standing is kept", async () => {
    const written = await ana.record(
      beginEpisode({ offers: [{ title: "Heat", year: 1995, started: true, chosen: true }] }),
    );
    const fixed = kept(await ana.correct(written.id, { offers: [{ title: "Heat", year: 1995, chosen: null }] }));
    assert.deepEqual(offerOf(fixed, "Heat").started, stated(true));
  });

  test("an evening with a request and no films is kept", async () => {
    const written = await ana.record(evening());
    const fixed = kept(await ana.correct(written.id, { offered: [] }));
    assert.deepEqual(fixed.offers, []);
    assert.equal((await ana.episode(written.id)).request, "something tense tonight");
  });

  /* ------------------------------------------------------- failure injection */

  test("a failed offer write leaves the evening exactly as it was", async () => {
    const written = await ana.record(evening());
    const untouched = await ana.episode(written.id);
    const failing = sqlEpisodeStore(failingOn(driver, (text) => text.includes("INSERT INTO tonight_episode_offers")), asUser("google:ana"));

    await assert.rejects(
      () => failing.correct(written.id, { offers: [{ title: "Zodiac", year: 2007, chosen: true }] }),
      /injected/u,
    );
    await assert.rejects(() => failing.addRound(written.id, { offered: [{ title: "Heat", year: 1995, lead: true }] }), /injected/u);
    assert.deepEqual(await ana.episode(written.id), untouched, "a failed write left part of itself behind");

    const before = await count("tonight_episodes");
    await assert.rejects(() => failing.record(evening()), /injected/u);
    assert.equal(await count("tonight_episodes"), before, "a failed record left an evening with no offers");
  });

  test("a failed deletion under F6 leaves the evening whole", async () => {
    const written = await ana.record(beginEpisode({ offers: [{ title: "Heat", year: 1995, started: true }] }));
    const untouched = await ana.episode(written.id);
    const failing = sqlEpisodeStore(failingOn(driver, (text) => text.includes("DELETE FROM tonight_episodes")), asUser("google:ana"));

    await assert.rejects(
      () => failing.correct(written.id, { offers: [{ title: "Heat", year: 1995, started: null }] }),
      /injected/u,
    );
    assert.deepEqual(await ana.episode(written.id), untouched);
  });

  /* --------------------------------------------------------------- the CHECKs */

  describe("the schema refuses what the model refuses", () => {
    let id: string;
    before(async () => {
      id = (await ana.record(evening())).id;
    });

    const insert = (row: Record<string, unknown>) => {
      const columns = { title: "Raw", year: 2000, offered: true, lead: false, ...row };
      const names = Object.keys(columns);
      return driver.query(
        `INSERT INTO tonight_episode_offers (user_id, episode, position, ${names.join(", ")})
         VALUES ($1, $2, 99, ${names.map((_, at) => `$${String(at + 3)}`).join(", ")})`,
        ["google:ana", id, ...Object.values(columns)],
      );
    };
    const violates = (code: string) => (error: unknown) => (error as { code?: string } | null)?.code === code;

    test("only an offered film can lead", async () => {
      await assert.rejects(insert({ offered: false, lead: true, chosen: true }), violates("23514"));
    });

    test("finished means started", async () => {
      await assert.rejects(insert({ finished: true }), violates("23514"));
      await assert.rejects(insert({ finished: true, started: false }), violates("23514"));
    });

    test("a pass excludes choosing and starting", async () => {
      await assert.rejects(insert({ passed: true, chosen: true }), violates("23514"));
      await assert.rejects(insert({ passed: true, started: true }), violates("23514"));
    });

    test("a reason belongs to a pass, and is not blank", async () => {
      await assert.rejects(insert({ pass_reason: "why" }), violates("23514"));
      await assert.rejects(insert({ passed: false, pass_reason: "why" }), violates("23514"));
      await assert.rejects(insert({ passed: true, pass_reason: "  " }), violates("23514"));
    });

    test("a film they brought up needs something they said", async () => {
      await assert.rejects(insert({ offered: false }), violates("23514"));
    });

    test("whether Tonight offered it is never unknown", async () => {
      await assert.rejects(insert({ offered: null }), violates("23502"));
    });
  });

  /* --------------------------------------------------------------- isolation */

  test("one user cannot read, append to, correct or forget another's evening", async () => {
    const hers = await ana.record(evening());
    const untouched = await ana.episode(hers.id);
    await assert.rejects(() => ben.episode(hers.id), EpisodeError);
    await assert.rejects(() => ben.addRound(hers.id, { offered: [{ title: "Heat", year: 1995, lead: true }] }), EpisodeError);
    await assert.rejects(() => ben.correct(hers.id, { request: "his, not hers" }), EpisodeError);
    await assert.rejects(
      () => ben.correct(hers.id, { offers: [{ title: "Zodiac", year: 2007, chosen: true }] }),
      EpisodeError,
    );
    await assert.rejects(() => ben.forget(hers.id), EpisodeError);
    assert.deepEqual(await ana.episode(hers.id), untouched, "another user's write landed");
  });

  test("listing returns only that user's episodes", async () => {
    const fresh = sqlEpisodeStore(driver, asUser("google:cleo"));
    assert.deepEqual(await fresh.episodes(), [], "a new user inherited somebody's evenings");

    const one = await fresh.record(beginEpisode({ request: "something funny", offered: [] }));
    const listed = await fresh.episodes();
    assert.equal(listed.length, 1);
    assert.deepEqual(listed[0], one);
    assert.equal((await ben.episodes()).some((episode) => episode.id === one.id), false);
  });

  test("two users may hold the same film in their evenings without either seeing the other's", async () => {
    const hers = await ana.record(evening());
    const his = await ben.record(evening());
    assert.notEqual(hers.id, his.id);
    await ben.correct(his.id, { offers: [{ title: "Zodiac", year: 2007, chosen: true }] });
    assert.deepEqual(offerOf(await ana.episode(hers.id), "Zodiac").chosen, UNKNOWN, "his statement reached her evening");
  });

  /* ------------------------------------------------------------- forgetting */

  test("a forgotten episode is gone from the direct read and the listing, offers and all", async () => {
    const written = await ana.record(evening());
    const forgotten = await ana.forget(written.id);
    assert.deepEqual(forgotten, written, "forgetting did not report what it removed");

    await assert.rejects(() => ana.episode(written.id), EpisodeError);
    assert.equal((await ana.episodes()).some((episode) => episode.id === written.id), false);
    const left = await driver.query<{ n: string }>(
      `SELECT count(*) AS n FROM tonight_episode_offers WHERE episode = $1`,
      [written.id],
    );
    assert.equal(Number(left[0]?.n), 0, "the offers outlived the episode");
  });

  test("forgetting one user's episode leaves the other's standing", async () => {
    const hers = await ana.record(evening());
    const his = await ben.record(evening());
    await ana.forget(hers.id);
    assert.equal((await ben.episode(his.id)).id, his.id);
  });

  test("the store offers no generic mutation", () => {
    for (const absent of ["update", "upsert", "merge", "patch", "setState"]) {
      assert.equal(absent in ana, false, `a generic ${absent} appeared`);
    }
  });

  test("nothing in episode persistence reaches the taste model", async () => {
    const fs = await import("node:fs");
    for (const file of ["store.ts", "store/sql.ts", "store/schema.ts"]) {
      const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
      // Comments of every kind are stripped: a prose reference to the taste
      // store is exactly what these files should contain, and an import of it
      // is exactly what they should not.
      const code = source
        .replace(/\/\*\*[\s\S]*?\*\//gu, "")
        .replace(/\/\/[^\n]*/gu, "")
        .replace(/--[^\n]*/gu, "");
      assert.equal(code.includes("taste"), false, `${file} reaches the taste model`);
      assert.equal(code.includes("tonight_genres"), false, `${file} names a taste table`);
      assert.equal(code.includes("tonight_movies"), false, `${file} names a taste table`);
      assert.equal(code.includes("tonight_verdict"), false, `${file} names a verdict table`);
    }
  });
});

/**
 * What the later migrations do to evenings that were already there.
 *
 * The suite above starts from a database migrated all the way, which is the one
 * shape that cannot answer this: every row in it was written by code that
 * already knew the current schema. So this builds the old world instead —
 * schema at v1, a legacy evening inserted through it — and then upgrades, which
 * is what will happen to the rows that exist in production.
 */
describe("an evening recorded before provenance or per-offer facts were stored", () => {
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

    const v1 = EPISODES_SCHEMA.migrations.find((migration) => migration.version === 1);
    assert.ok(v1, "the episodes schema no longer has a version 1 to upgrade from");
    await migrate(driver, { module: EPISODES_SCHEMA.module, migrations: [v1] });

    // A legitimate evening, written the way v1 could write one.
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

    // And now the upgrade: v2 and v3, in order.
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

  test("the legacy evening's facts land on the film it chose, and nowhere else", async () => {
    const read = await store.episode(LEGACY.id);
    assert.equal(read.request, LEGACY.request);
    assert.deepEqual(
      read.offers.map((offer) => [offer.title, offer.year, offer.offered, offer.lead]),
      [
        ["Prisoners", 2013, true, true],
        ["Zodiac", 2007, true, false],
      ],
    );
    const chosen = offerOf(read, "Prisoners");
    assert.deepEqual(chosen.chosen, stated(true));
    assert.deepEqual(chosen.started, stated(true), "watched did not become the chosen film's start");
    assert.deepEqual(chosen.finished, UNKNOWN, "an unstated outcome acquired a value");
    const other = offerOf(read, "Zodiac");
    assert.deepEqual(
      [other.chosen, other.started, other.finished, other.passed],
      [UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN],
      "an offer that was not chosen gained a fact — or 'not chosen' became a stated no",
    );
  });

  test("the migrated evening is a valid Episode under the current model", async () => {
    const fixed = kept(await store.correct(LEGACY.id, { request: "what they actually asked for" }));
    assert.equal(fixed.requestSource, "stated");
    assert.equal(fixed.offeredSource, "observed", "correcting one field moved the other's provenance");
    assert.deepEqual(offerOf(fixed, "Prisoners").chosen, stated(true), "a legacy choice was lost on first correction");
  });
});
