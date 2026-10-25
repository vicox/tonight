import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../episodes/store/sql.ts";
import type { EpisodeStore } from "../episodes/store.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { sqlTasteStore, TASTE_SCHEMA } from "../taste/store/sql.ts";
import type { TasteStore } from "../taste/store.ts";
import { sqlVerdictStore, VERDICTS_SCHEMA } from "../verdicts/store/sql.ts";
import type { VerdictStore } from "../verdicts/store.ts";
import { tonightMcpServer } from "./server.ts";

/**
 * The episode tools, held to the boundary they exist to keep.
 *
 * An evening is its offers — Tonight's, and films the user brought up — each
 * with four facts that are known or not. A tool layer is where such a record is
 * most easily undone: one convenient default, one fact read off another, and an
 * evening nobody described acquires a history. So these contracts are mostly
 * about what a call does *not* establish, and about the descriptions, because a
 * description is what a model reads before it decides what to send.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

/** The halves of a session no episode tool may reach. */
const refusing = <T>(what: string): T =>
  new Proxy({} as object, {
    get(_, name) {
      return () => {
        throw new Error(`an episode tool reached the ${what} store: ${String(name)}`);
      };
    },
  }) as T;

const refusingTaste = refusing<TasteStore>("taste");
const refusingVerdicts = refusing<VerdictStore>("verdict");

type Result = {
  isError?: boolean;
  content?: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
};

type Tool = {
  description?: string;
  inputSchema?: unknown;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  handler: (args: Record<string, unknown>) => Promise<Result>;
};

type Fact = { known: boolean; value?: boolean; source?: string };
type Offer = {
  title: string;
  year: number;
  offered: boolean;
  lead: boolean;
  chosen: Fact;
  started: Fact;
  finished: Fact;
  passed: Fact;
  passReason?: string;
};
type Evening = {
  id: string;
  recordedAt: string;
  request: string | null;
  requestSource?: string;
  offeredSource: string;
  offers: Offer[];
};

function toolsOf(episodes: EpisodeStore, user = "google:ana"): Record<string, Tool> {
  const server = tonightMcpServer({
    user: asUser(user),
    reference: "ref",
    store: refusingTaste,
    episodes,
    verdicts: refusingVerdicts,
  });
  return (server as unknown as { _registeredTools: Record<string, Tool> })._registeredTools;
}

const call = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) =>
  tools[name]!.handler(args);

/** The reason a call was refused. */
const reason = (result: Result) => result.content?.[0]?.text ?? "";

const PRISONERS = { title: "Prisoners", year: 2013 };
const ZODIAC = { title: "Zodiac", year: 2007 };
const HEAT = { title: "Heat", year: 1995 };

const offered = [
  { ...PRISONERS, lead: true },
  { ...ZODIAC, lead: false },
];

const UNKNOWN = { known: false };
const said = (value: boolean) => ({ known: true, value, source: "stated" });

/** An offer exactly as a fresh round of Tonight's leaves it: offered, nothing said. */
const fresh = (film: { title: string; year: number }, lead: boolean): Offer => ({
  ...film,
  offered: true,
  lead,
  chosen: UNKNOWN,
  started: UNKNOWN,
  finished: UNKNOWN,
  passed: UNKNOWN,
});

describe("episode tools", () => {
  let driver: SqlDriver;
  let ana: Record<string, Tool>;
  let ben: Record<string, Tool>;

  before(async () => {
    driver = await embeddedDriver();
    await migrate(driver, EPISODES_SCHEMA);
    ana = toolsOf(sqlEpisodeStore(driver, asUser("google:ana")));
    ben = toolsOf(sqlEpisodeStore(driver, asUser("google:ben")), "google:ben");
  });

  after(async () => {
    await driver.close();
  });

  /** A write the test expects to succeed, and its evening. */
  const written = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown>) => {
    const result = await call(tools, name, args);
    assert.notEqual(result.isError, true, `${name}: ${reason(result)}`);
    return result.structuredContent!.episode as Evening;
  };

  const recorded = (tools = ana) =>
    written(tools, "record_episode", { request: "something tense tonight", offered });

  const readBack = async (id: string, tools = ana): Promise<Evening | undefined> => {
    const result = await call(tools, "get_episodes");
    const all = (result.structuredContent as { episodes: Evening[] }).episodes;
    return all.find((episode) => episode.id === id);
  };

  const offerOf = (evening: Evening | undefined, film: { title: string; year: number }) =>
    evening?.offers.find((offer) => offer.title === film.title && offer.year === film.year);

  /** Refused, and the evening is exactly what it was. */
  const refusedUnchanged = async (id: string, name: string, args: Record<string, unknown>) => {
    const before = JSON.stringify(await readBack(id));
    const result = await call(ana, name, args);
    assert.equal(result.isError, true, `${name} ${JSON.stringify(args)} was accepted`);
    assert.equal(JSON.stringify(await readBack(id)), before, `${name} refused but changed the evening`);
    return reason(result);
  };

  /* ---------------------------------------------------------- recording */

  test("recording an evening today's way writes what was asked and offered, as offers", async () => {
    const episode = await recorded();
    assert.equal(episode.request, "something tense tonight");
    assert.equal(episode.requestSource, "observed");
    assert.equal(episode.offeredSource, "observed");
    assert.deepEqual(episode.offers, [fresh(PRISONERS, true), fresh(ZODIAC, false)]);

    const read = await readBack(episode.id);
    assert.deepEqual(read, episode, "the read differs from what the write answered");
    // The old shape is gone, not kept beside the new one.
    for (const retired of ["offered", "chosen", "watched", "finished"]) {
      assert.equal(retired in (read as object), false, `get_episodes still answers ${retired}`);
    }
  });

  test("what nobody said stays not known, on every offer", async () => {
    const read = await readBack((await recorded()).id);
    for (const offer of read!.offers) {
      for (const fact of ["chosen", "started", "finished", "passed"] as const) {
        assert.deepEqual(offer[fact], UNKNOWN, `recording invented ${fact} for ${offer.title}`);
      }
      assert.equal("passReason" in offer, false);
    }
  });

  test("record_episode takes episode, request, offered and offers, and nothing at the top level about outcomes", () => {
    const shape = (ana.record_episode!.inputSchema as { shape: Record<string, unknown> }).shape;
    assert.deepEqual(Object.keys(shape).sort(), ["episode", "offered", "offers", "request"]);
    const correct = (ana.correct_episode!.inputSchema as { shape: Record<string, unknown> }).shape;
    assert.deepEqual(Object.keys(correct).sort(), ["episode", "offered", "offers", "request"]);
  });

  test("an evening of their own: films they brought up, no request", async () => {
    const own = await written(ana, "record_episode", { offers: [{ ...HEAT, started: true }] });
    assert.equal(own.request, null);
    assert.equal("requestSource" in own, false, "an evening without a request claims a source for one");
    assert.deepEqual(own.offers, [
      { ...HEAT, offered: false, lead: false, chosen: UNKNOWN, started: said(true), finished: UNKNOWN, passed: UNKNOWN },
    ]);
    assert.deepEqual(await readBack(own.id), own);

    // Offers without a request is an evening Tonight recommended for, and needs one.
    const unasked = await call(ana, "record_episode", { offered });
    assert.equal(unasked.isError, true, "Tonight's offers were recorded with no request");
    // And an evening of nothing is not recorded at all.
    assert.equal((await call(ana, "record_episode", {})).isError, true);
    assert.equal((await call(ana, "record_episode", { offered: [], offers: [] })).isError, true);
    // A film brought up needs something said about it.
    assert.equal((await call(ana, "record_episode", { offers: [{ ...HEAT }] })).isError, true);
  });

  /* -------------------------------------------------------------- rounds */

  test("another round appends to the evening, keeping places and what was said", async () => {
    const episode = await recorded();
    await written(ana, "correct_episode", { episode: episode.id, offers: [{ ...ZODIAC, chosen: false }] });

    const round = await written(ana, "record_episode", {
      episode: episode.id,
      offered: [
        { ...ZODIAC, lead: true },
        { ...HEAT, lead: false },
      ],
    });
    assert.equal(round.id, episode.id);
    assert.equal(round.request, "something tense tonight", "a round moved the evening's request");
    assert.equal(round.offeredSource, "observed");
    assert.deepEqual(
      round.offers.map((offer) => [offer.title, offer.offered, offer.lead]),
      [
        ["Prisoners", true, true],
        ["Zodiac", true, true],
        ["Heat", true, false],
      ],
      "a re-offered film moved, lost a lead, or was added twice",
    );
    assert.deepEqual(offerOf(round, ZODIAC)!.chosen, said(false), "a re-offer forgot what was said about it");
    assert.deepEqual(await readBack(episode.id), round);
  });

  test("a round keeps the evening's request: request with episode is refused", async () => {
    const episode = await recorded();
    const message = await refusedUnchanged(episode.id, "record_episode", {
      episode: episode.id,
      request: "something else now",
      offered: [{ ...HEAT, lead: true }],
    });
    assert.match(message, /request/u);
  });

  test("record_episode only adds: what is stored is never changed or taken back by it", async () => {
    const episode = await recorded();
    await written(ana, "correct_episode", {
      episode: episode.id,
      offers: [
        { ...ZODIAC, started: true },
        { ...PRISONERS, passed: true, passReason: "too bleak tonight" },
      ],
    });
    const append = (offers: unknown[], more: Record<string, unknown> = {}) => ({
      episode: episode.id,
      offers,
      ...more,
    });

    for (const offers of [
      [{ ...ZODIAC, started: false }],
      [{ ...PRISONERS, passed: false }],
      [{ ...PRISONERS, passReason: "too long" }],
      [{ ...ZODIAC, started: null }],
      [{ ...PRISONERS, passReason: null }],
    ]) {
      const message = await refusedUnchanged(episode.id, "record_episode", append(offers));
      assert.match(message, /correct_episode/u, "a refused overwrite did not route to the correction");
    }

    // Refused whole: a round carrying new films and one forbidden change adds nothing.
    await refusedUnchanged(
      episode.id,
      "record_episode",
      append([{ ...ZODIAC, started: false }], { offered: [{ ...HEAT, lead: true }] }),
    );

    // Restating what is stored changes nothing; filling what is unknown is accepted.
    const before = await readBack(episode.id);
    const same = await written(
      ana,
      "record_episode",
      append([{ ...ZODIAC, started: true }, { ...PRISONERS, passReason: "  too bleak tonight " }]),
    );
    assert.deepEqual(same, before, "restating a stored value changed the evening");
    const filled = await written(ana, "record_episode", append([{ ...ZODIAC, finished: false }]));
    assert.deepEqual(offerOf(filled, ZODIAC)!.finished, said(false));
  });

  /* --------------------------------------------------------- correcting */

  test("a stated false comes back as false, not as silence", async () => {
    const episode = await recorded();
    await written(ana, "correct_episode", { episode: episode.id, offers: [{ ...ZODIAC, started: false }] });
    assert.deepEqual(offerOf(await readBack(episode.id), ZODIAC)!.started, said(false));
  });

  test("every fact can be taken back to not known, one at a time", async () => {
    const episode = await recorded();
    await written(ana, "correct_episode", {
      episode: episode.id,
      offers: [
        { ...ZODIAC, chosen: true, finished: true },
        { ...PRISONERS, passed: true, passReason: "not tonight" },
      ],
    });

    for (const [film, fact] of [
      [ZODIAC, "finished"],
      [ZODIAC, "started"],
      [ZODIAC, "chosen"],
      [PRISONERS, "passed"],
    ] as const) {
      await written(ana, "correct_episode", { episode: episode.id, offers: [{ ...film, [fact]: null }] });
      const offer = offerOf(await readBack(episode.id), film)!;
      assert.deepEqual(offer[fact], UNKNOWN, `${fact} could not be taken back`);
    }
    // The reason went with the pass.
    assert.equal("passReason" in offerOf(await readBack(episode.id), PRISONERS)!, false);
    // And Tonight's films are still the evening's, with nothing said about them.
    assert.deepEqual((await readBack(episode.id))!.offers, [fresh(PRISONERS, true), fresh(ZODIAC, false)]);
  });

  test("statements merge one film at a time: one film's facts leave another's alone", async () => {
    const episode = await recorded();
    await written(ana, "correct_episode", { episode: episode.id, offers: [{ ...ZODIAC, started: true }] });
    await written(ana, "correct_episode", { episode: episode.id, offers: [{ ...PRISONERS, chosen: true }] });
    await written(ana, "correct_episode", { episode: episode.id, offers: [{ ...ZODIAC, chosen: false }] });

    const read = await readBack(episode.id);
    assert.deepEqual(offerOf(read, ZODIAC), {
      ...fresh(ZODIAC, false),
      chosen: said(false),
      started: said(true),
    });
    assert.deepEqual(offerOf(read, PRISONERS), { ...fresh(PRISONERS, true), chosen: said(true) });
  });

  test("several films can be chosen and started on one evening, and started needs no choice", async () => {
    const episode = await recorded();
    const after = await written(ana, "correct_episode", {
      episode: episode.id,
      offers: [
        { ...PRISONERS, chosen: true, started: true },
        { ...ZODIAC, started: true },
      ],
    });
    assert.deepEqual(offerOf(after, PRISONERS)!.chosen, said(true));
    assert.deepEqual(offerOf(after, ZODIAC)!.chosen, UNKNOWN, "starting a film invented a choice");
    assert.deepEqual(offerOf(after, ZODIAC)!.started, said(true));
  });

  test("finishing records starting, and nothing else is ever implied", async () => {
    const episode = await recorded();
    const after = await written(ana, "correct_episode", { episode: episode.id, offers: [{ ...ZODIAC, finished: true }] });
    const zodiac = offerOf(after, ZODIAC)!;
    assert.deepEqual(zodiac.started, said(true), "finishing did not record the start");
    assert.deepEqual(zodiac.chosen, UNKNOWN, "finishing invented a choice");
    assert.deepEqual(zodiac.passed, UNKNOWN);

    // A stated "did not start" is not overridden by implication.
    const other = await recorded();
    await written(ana, "correct_episode", { episode: other.id, offers: [{ ...ZODIAC, started: false }] });
    await refusedUnchanged(other.id, "correct_episode", { episode: other.id, offers: [{ ...ZODIAC, finished: true }] });
  });

  test("a pass excludes taking, and a reason belongs to a pass", async () => {
    const episode = await recorded();
    await written(ana, "correct_episode", { episode: episode.id, offers: [{ ...ZODIAC, chosen: true }] });
    await refusedUnchanged(episode.id, "correct_episode", { episode: episode.id, offers: [{ ...ZODIAC, passed: true }] });
    await refusedUnchanged(episode.id, "correct_episode", {
      episode: episode.id,
      offers: [{ ...PRISONERS, passReason: "too long" }],
    });
    // Changing their mind is one call that takes the pass back with it.
    await written(ana, "correct_episode", { episode: episode.id, offers: [{ ...PRISONERS, passed: true }] });
    const changed = await written(ana, "correct_episode", {
      episode: episode.id,
      offers: [{ ...PRISONERS, passed: null, started: true }],
    });
    assert.deepEqual(offerOf(changed, PRISONERS)!.passed, UNKNOWN);
    assert.deepEqual(offerOf(changed, PRISONERS)!.started, said(true));
  });

  test("a film Tonight did not offer is added as theirs, and leaves when the last thing said about it is taken back", async () => {
    const episode = await recorded();
    const added = await written(ana, "correct_episode", { episode: episode.id, offers: [{ ...HEAT, started: true }] });
    assert.deepEqual(added.offers.at(-1), {
      ...HEAT,
      offered: false,
      lead: false,
      chosen: UNKNOWN,
      started: said(true),
      finished: UNKNOWN,
      passed: UNKNOWN,
    });

    const gone = await written(ana, "correct_episode", { episode: episode.id, offers: [{ ...HEAT, started: null }] });
    assert.equal(offerOf(gone, HEAT), undefined, "a film nothing is said about stayed in the evening");
    assert.deepEqual(gone.offers, [fresh(PRISONERS, true), fresh(ZODIAC, false)]);
  });

  test("correcting Tonight's offered set keeps a film they chose, as theirs", async () => {
    const episode = await recorded();
    await written(ana, "correct_episode", { episode: episode.id, offers: [{ ...ZODIAC, chosen: true }] });
    const after = await written(ana, "correct_episode", { episode: episode.id, offered: [{ ...PRISONERS, lead: true }] });
    assert.equal(after.offeredSource, "stated");
    assert.deepEqual(
      after.offers.map((offer) => [offer.title, offer.offered, offer.lead, offer.chosen.known]),
      [
        ["Prisoners", true, true, false],
        ["Zodiac", false, false, true],
      ],
    );
  });

  // The old top-level `chosen` / `watched` / `finished` are refused by the strict
  // input schema, which only the protocol applies — handlers called directly
  // here never see it. That contract is in `tools.test.ts`, through the endpoint.

  test("a statement with a key that is not a fact is refused — watched is started now", async () => {
    const episode = await recorded();
    const message = await refusedUnchanged(episode.id, "correct_episode", {
      episode: episode.id,
      offers: [{ ...ZODIAC, watched: true }],
    });
    assert.match(message, /started/u);
    await refusedUnchanged(episode.id, "record_episode", { episode: episode.id, offers: [{ ...ZODIAC, watched: true }] });
  });

  test("an evening of their own that loses its last film is forgotten, and says so", async () => {
    const own = await written(ana, "record_episode", { offers: [{ ...HEAT, chosen: true }] });
    const result = await call(ana, "correct_episode", { episode: own.id, offers: [{ ...HEAT, chosen: null }] });
    assert.notEqual(result.isError, true, reason(result));
    assert.deepEqual(result.structuredContent, { episode: null, forgotten: own.id });
    assert.equal(await readBack(own.id), undefined, "a forgotten evening is still listed");

    // An evening with a request survives losing every film.
    const asked = await written(ana, "record_episode", { request: "anything", offers: [{ ...HEAT, chosen: true }] });
    const kept = await written(ana, "correct_episode", { episode: asked.id, offers: [{ ...HEAT, chosen: null }] });
    assert.deepEqual(kept.offers, []);
    assert.equal(kept.request, "anything");
  });

  test("an evening's two sources move one at a time, and each correction moves only its own", async () => {
    const pairOf = (evening: Evening) => [evening.requestSource, evening.offeredSource];

    const mine = await written(ana, "record_episode", { request: "something tense", offered });
    assert.deepEqual(pairOf(mine), ["observed", "observed"]);
    const other = await written(ana, "record_episode", { request: "something quiet", offered });

    const afterRequest = await written(ana, "correct_episode", {
      episode: mine.id,
      request: "what they actually asked for",
    });
    assert.deepEqual(pairOf(afterRequest), ["stated", "observed"]);
    assert.deepEqual(pairOf((await readBack(mine.id))!), ["stated", "observed"]);

    // A round is observed again and moves neither.
    const round = await written(ana, "record_episode", { episode: mine.id, offered: [{ ...HEAT, lead: true }] });
    assert.deepEqual(pairOf(round), ["stated", "observed"]);

    // Statements about films move neither either: they are facts, not the record.
    const facts = await written(ana, "correct_episode", { episode: mine.id, offers: [{ ...HEAT, chosen: true }] });
    assert.deepEqual(pairOf(facts), ["stated", "observed"]);

    const afterOffers = await written(ana, "correct_episode", { episode: mine.id, offered: [offered[0]!] });
    assert.deepEqual(pairOf(afterOffers), ["stated", "stated"]);
    assert.deepEqual(pairOf((await readBack(mine.id))!), ["stated", "stated"]);

    assert.deepEqual(pairOf((await readBack(other.id))!), ["observed", "observed"]);
  });

  /* ---------------------------------------------------- refusals, users */

  test("an evening that is not there is a refusal, not a crash", async () => {
    const absent = "00000000-0000-0000-0000-000000000000";
    for (const [name, args] of [
      ["correct_episode", { episode: absent, offers: [{ ...ZODIAC, started: true }] }],
      ["record_episode", { episode: absent, offered: [{ ...ZODIAC, lead: true }] }],
      ["forget_episode", { episode: absent }],
    ] as const) {
      const result = await call(ana, name, args);
      assert.equal(result.isError, true, `${name} did not refuse a missing evening`);
    }
  });

  test("malformed input is a refusal carrying the reason", async () => {
    assert.equal((await call(ana, "record_episode", { request: "   ", offered: [] })).isError, true);
    const twice = await call(ana, "record_episode", {
      request: "x",
      offered: [
        { ...ZODIAC, lead: true },
        { ...ZODIAC, lead: false },
      ],
    });
    assert.equal(twice.isError, true, "the same film offered twice in a round was accepted");
  });

  test("forgetting removes the evening from every read", async () => {
    const episode = await recorded();
    const gone = await call(ana, "forget_episode", { episode: episode.id });
    assert.equal(gone.isError, undefined);
    assert.equal(await readBack(episode.id), undefined);
  });

  test("one user's evenings never appear in another's read, and cannot be changed by them", async () => {
    const hers = await recorded(ana);
    const before = JSON.stringify(await readBack(hers.id, ana));
    const listed = await call(ben, "get_episodes");
    const theirs = (listed.structuredContent as { episodes: { id: string }[] }).episodes;
    assert.equal(theirs.some((episode) => episode.id === hers.id), false, "another user's evening was listed");

    for (const [name, args] of [
      ["correct_episode", { episode: hers.id, offers: [{ ...ZODIAC, started: true }] }],
      ["record_episode", { episode: hers.id, offered: [{ ...HEAT, lead: true }] }],
      ["forget_episode", { episode: hers.id }],
    ] as const) {
      assert.equal((await call(ben, name, args)).isError, true, `${name} crossed users`);
    }
    assert.equal(JSON.stringify(await readBack(hers.id, ana)), before, "another user changed her evening");
  });

  test("no episode tool takes a user id", () => {
    for (const name of ["record_episode", "get_episodes", "correct_episode", "forget_episode"]) {
      const shape = JSON.stringify(ana[name]?.inputSchema ?? {});
      for (const forbidden of ["user_id", "userId", "\"user\""]) {
        assert.equal(shape.includes(forbidden), false, `${name} accepts ${forbidden}`);
      }
    }
  });

  test("no episode tool touches the taste model or the verdicts", async () => {
    // The taste and verdict halves of this session throw on any call at all, so
    // reaching either is a thrown error rather than a quiet write.
    const episode = await recorded();
    await written(ana, "record_episode", { episode: episode.id, offered: [{ ...HEAT, lead: true }] });
    await written(ana, "correct_episode", {
      episode: episode.id,
      offers: [{ ...ZODIAC, chosen: true, finished: true }, { ...PRISONERS, passed: true }],
    });
    await call(ana, "get_episodes");
    await call(ana, "forget_episode", { episode: episode.id });
  });

  /* ------------------------------------------------- surface and words */

  test("the tool surface offers no generic mutation", () => {
    const names = Object.keys(ana);
    for (const generic of ["update_episode", "patch_episode", "set_episode", "upsert_episode", "add_round"]) {
      assert.equal(names.includes(generic), false, `${generic} appeared`);
    }
    assert.deepEqual(names.filter((name) => name.includes("episode")).sort(), [
      "correct_episode",
      "forget_episode",
      "get_episodes",
      "record_episode",
    ]);
  });

  test("record_episode only adds, and correct_episode is the one that can remove", () => {
    assert.equal(ana.record_episode!.annotations?.destructiveHint, false);
    assert.equal(ana.correct_episode!.annotations?.destructiveHint, true);
    assert.equal(ana.correct_episode!.annotations?.idempotentHint, true);
    assert.equal(ana.forget_episode!.annotations?.destructiveHint, true);
  });

  test("recording an evening is not an answer, said where the evening is written", () => {
    const said = ana.record_episode!.description ?? "";
    assert.match(said, /Writing this down does not answer them, and it never finishes a request for a film/u);
    assert.match(said, /Nothing here is shown to the user/u);
    assert.match(said, /Every film in `offered` must already be in the reply they can read/u);
    assert.match(said, /A film that exists only in this call was never recommended/u);
    assert.match(said, /write the recommendation first, then record it/u);
    assert.match(said, /Write down a film evening/u, "the tool lost its own purpose");
    assert.equal(/do not record|avoid recording|refrain from/iu.test(said), false);
  });

  test("record_episode says how a round and an evening of their own are written", () => {
    const said = ana.record_episode!.description ?? "";
    assert.match(said, /\*\*Another round of the same evening\*\*/u);
    assert.match(said, /the id this conversation was given when the evening was recorded/u);
    assert.match(said, /Never look up a recent evening\s+to append to/u);
    assert.match(said, /`request` is refused together with `episode`/u);
    assert.match(said, /\*\*An evening they tell you about without asking you anything\*\*/u);
    assert.match(said, /It never attaches to\s+an existing one/u);
    assert.match(said, /\*\\?"I've seen Heat\\?"\* is a viewing, never an evening/u);
    assert.match(said, /\*\*This call only adds\.\*\*/u);
    assert.match(said, /is a correction and is refused — use\s+`correct_episode`/u);
  });

  test("correct_episode carries the attribution rule and the rules of the facts", () => {
    const said = ana.correct_episode!.description ?? "";
    // Attribution: only an evening they referred to, never inferred.
    assert.match(said, /\*\*Only an evening they unambiguously referred to\.\*\*/u);
    assert.match(said, /A title that matches one of its films is never the reference/u);
    assert.match(said, /the\s+evening being the latest or recent/u);
    assert.match(said, /If they did not say which evening, write to no\s+evening/u);
    assert.match(said, /do not ask a question in order to file it/u);
    assert.match(said, /\*\*A verdict is not a watch on\s+an evening:\*\*/u);
    assert.match(said, /nothing here is inferred from a verdict or from\s+a film being marked seen/u);
    // The facts: per film, merged, independent, with the one entailment.
    assert.match(said, /\*\*Facts are per film, and they merge\.\*\*/u);
    assert.match(said, /null takes\s+one back to not known/u);
    assert.match(said, /A film not in the evening is added as theirs/u);
    assert.match(said, /chosen is not started, started is not chosen, and\s+finishing is not liking/u);
    assert.match(said, /`finished: true` records\s+`started: true` as well/u);
    assert.match(said, /A passed film cannot also be\s+chosen or started/u);
    assert.match(said, /A film they brought up stays only while something they said about\s+it stands/u);
    assert.match(said, /answered as `forgotten`/u);
    assert.match(said, /`chosen`, `watched` and `finished` at the top level are no longer taken/u);
  });

  test("both write tools say what offered and offers mean, so the two are never confused", () => {
    for (const name of ["record_episode", "correct_episode"]) {
      const said = ana[name]!.description ?? "";
      assert.match(said, /`offered` lists the films Tonight recommended; `offers` \(input\) says what the user said/u, name);
      assert.match(said, /the answer's `offers` is the evening's list of films/u, name);
      assert.match(said, /`offered` true \(Tonight recommended it\) or false \(they brought it up\)/u, name);
    }
  });

  test("get_episodes says what an offer's facts mean, and where the record came from", () => {
    const said = ana.get_episodes!.description ?? "";
    assert.match(said, /`chosen` \(they intend to watch it\), `started` \(they began it\), `finished` \(they\s+completed it\) and `passed`/u);
    assert.match(said, /do not read it\s+as no/u);
    assert.match(said, /not from a verdict, not from a\s+viewing, not from another evening/u);
    assert.match(said, /`?requestSource`?/u);
    assert.match(said, /`?offeredSource`?/u);
    assert.match(said, /`observed`[^.]*Tonight[^.]*(received|put|itself)/iu);
    assert.match(said, /`stated`[^.]*(user|they)[^.]*(later|afterwards)[^.]*(corrected|said)/iu);
    assert.match(said, /nothing about what they like/iu);
    assert.match(said, /neither value is something you worked/iu);
  });

  test("the descriptions carry the boundary a model has to read", () => {
    const said = ["record_episode", "get_episodes", "correct_episode", "forget_episode"]
      .map((name) => ana[name]?.description ?? "")
      .join("\n");
    assert.match(said, /Offering a film is not the same as them choosing it/u);
    assert.match(said, /Record only what you\s+actually observed/u);
    assert.match(said, /not hidden, not archived/u);
    for (const later of ["confidence", "proposal", "observation", "situation", "companion"]) {
      assert.equal(new RegExp(`\\b${later}`, "iu").test(said), false, `${later} appears in an episode tool description`);
    }
  });
});

/**
 * An evening inside a whole session: real taste and verdict stores beside it.
 *
 * What these prove is the other direction — that nothing outside the episode
 * tools ever writes an evening, so a verdict, a viewing, a vibe's core or a
 * deleted film is never read as something that happened on a night — and that
 * an evening forgotten through a correction is gone from every read.
 */
describe("an evening beside the rest of the model", () => {
  let driver: SqlDriver;

  before(async () => {
    driver = await embeddedDriver();
    for (const schema of [TASTE_SCHEMA, EPISODES_SCHEMA, VERDICTS_SCHEMA]) {
      await migrate(driver, schema);
    }
  });

  after(async () => {
    await driver.close();
  });

  let next = 0;
  const someone = (episodes?: EpisodeStore): Record<string, Tool> => {
    const who = asUser(`google:whole-${String(++next)}`);
    return (
      tonightMcpServer({
        user: who,
        reference: "ref",
        store: sqlTasteStore(driver, who),
        episodes: episodes ?? sqlEpisodeStore(driver, who),
        verdicts: sqlVerdictStore(driver, who),
      }) as unknown as { _registeredTools: Record<string, Tool> }
    )._registeredTools;
  };

  const ok = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) => {
    const result = await tools[name]!.handler(args);
    assert.notEqual(result.isError, true, `${name}: ${reason(result)}`);
    return result.structuredContent!;
  };

  const ARRIVAL = { title: "Arrival", year: 2016 };
  const MOON = { title: "Moon", year: 2009 };

  /** Two evenings that offered Arrival: one with facts said, one with none. */
  const evenings = async (tools: Record<string, Tool>) => {
    const told = (await ok(tools, "record_episode", {
      request: "something clever",
      offered: [
        { ...ARRIVAL, lead: true },
        { ...MOON, lead: false },
      ],
    })).episode as Evening;
    await ok(tools, "correct_episode", {
      episode: told.id,
      offers: [{ ...ARRIVAL, chosen: true, started: true, finished: false }, { ...MOON, chosen: false }],
    });
    await ok(tools, "record_episode", { request: "something else", offered: [{ ...ARRIVAL, lead: true }] });
  };

  const snapshot = async (tools: Record<string, Tool>) =>
    JSON.stringify((await ok(tools, "get_episodes")).episodes);

  /** Files Arrival in a vibe, since a liked or loved is kept only for a filed film. */
  const fileArrival = async (tools: Record<string, Tool>) => {
    await ok(tools, "create_genre", { name: "Clever sci-fi", instruction: "I like science fiction that makes me think." });
    await ok(tools, "create_vibe", {
      name: "Quiet Contact",
      genres: ["Clever sci-fi"],
      instruction: "Patient first-contact stories where the talking is the action.",
      core: ARRIVAL,
    });
  };

  test("an evening forgotten by a correction is gone from get_episodes and get_memory", async () => {
    const tools = someone();
    const own = (await ok(tools, "record_episode", { offers: [{ ...ARRIVAL, started: true }] })).episode as Evening;

    const memoryBefore = (await ok(tools, "get_memory")) as { remembered: { of: string; handle: { id?: string }; [k: string]: unknown }[] };
    const root = memoryBefore.remembered.find((one) => one.of === "evening" && one.handle.id === own.id);
    assert.ok(root, "the evening is not in memory to begin with");
    assert.equal(root.request, null);
    assert.equal("requestSource" in root, false, "memory claims a source for a request that is not there");
    assert.deepEqual(root.offers, own.offers);

    const answer = await ok(tools, "correct_episode", { episode: own.id, offers: [{ ...ARRIVAL, started: null }] });
    assert.deepEqual(answer, { episode: null, forgotten: own.id });

    const listed = (await ok(tools, "get_episodes")).episodes as Evening[];
    assert.equal(listed.some((one) => one.id === own.id), false, "get_episodes still lists it");
    const memory = (await ok(tools, "get_memory")) as { remembered: { of: string; handle: { id?: string } }[] };
    assert.equal(
      memory.remembered.some((one) => one.of === "evening" && one.handle.id === own.id),
      false,
      "get_memory still remembers it",
    );
  });

  for (const [name, setup, act] of [
    [
      "record_verdict",
      async (tools: Record<string, Tool>) => fileArrival(tools),
      async (tools: Record<string, Tool>) =>
        ok(tools, "record_verdict", {
          film: ARRIVAL,
          told: "volunteered",
          said: { about: "judgement", judgement: "loved" },
        }),
    ],
    [
      "withdraw_verdict",
      async (tools: Record<string, Tool>) => {
        await fileArrival(tools);
        return ok(tools, "record_verdict", { film: ARRIVAL, told: "volunteered", said: { about: "judgement", judgement: "liked" } });
      },
      async (tools: Record<string, Tool>) => ok(tools, "withdraw_verdict", { film: ARRIVAL }),
    ],
    [
      "forget_verdict",
      async (tools: Record<string, Tool>) =>
        ok(tools, "record_verdict", { film: ARRIVAL, told: "volunteered", said: { about: "judgement", judgement: "disliked" } }),
      async (tools: Record<string, Tool>, made: Record<string, unknown> | undefined) =>
        ok(tools, "forget_verdict", { ref: (made as { verdict: { ref: string } }).verdict.ref }),
    ],
    ["create_movie", async () => {}, async (tools: Record<string, Tool>) => ok(tools, "create_movie", { ...ARRIVAL, viewing: "seen" })],
    [
      "update_movie (seen)",
      async (tools: Record<string, Tool>) => ok(tools, "create_movie", { ...ARRIVAL, viewing: "want-to-see" }),
      async (tools: Record<string, Tool>) => ok(tools, "update_movie", { ...ARRIVAL, viewing: "seen" }),
    ],
    [
      "create_vibe (core)",
      async (tools: Record<string, Tool>) =>
        ok(tools, "create_genre", { name: "Clever sci-fi", instruction: "I like science fiction that makes me think." }),
      async (tools: Record<string, Tool>) =>
        ok(tools, "create_vibe", {
          name: "Quiet Contact",
          genres: ["Clever sci-fi"],
          instruction: "Patient first-contact stories where the talking is the action.",
          core: ARRIVAL,
        }),
    ],
    [
      "delete_movie",
      async (tools: Record<string, Tool>) => ok(tools, "create_movie", { ...ARRIVAL, viewing: "seen" }),
      async (tools: Record<string, Tool>) => ok(tools, "delete_movie", ARRIVAL),
    ],
  ] as const) {
    test(`${name} about a film an evening offered leaves every evening exactly as it was`, async () => {
      const tools = someone();
      await evenings(tools);
      const made = await setup(tools);
      const before = await snapshot(tools);
      await act(tools, made as Record<string, unknown> | undefined);
      assert.equal(await snapshot(tools), before, `${name} wrote an evening`);
    });
  }

  test("get_taste never reads an evening", async () => {
    const tools = someone(refusing<EpisodeStore>("episode"));
    const result = await tools.get_taste!.handler({});
    assert.notEqual(result.isError, true, reason(result));
    assert.ok(result.structuredContent, "get_taste did not answer");
  });
});
