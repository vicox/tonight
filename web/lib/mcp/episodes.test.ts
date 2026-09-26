import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../episodes/store/sql.ts";
import type { EpisodeStore } from "../episodes/store.ts";
import type { AuthenticatedUser } from "../identity.ts";
import type { TasteStore } from "../taste/store.ts";
import type { VerdictStore } from "../verdicts/store.ts";
import { tonightMcpServer } from "./server.ts";

/**
 * The episode tools, held to the boundary they exist to keep.
 *
 * A tool layer is where a factual model is most easily undone: one convenient
 * default, and an evening nobody described acquires a history. So these
 * contracts are mostly about what a call does *not* establish — and about the
 * descriptions, because a description is what a model reads before it decides
 * what to send.
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

type Tool = {
  description?: string;
  inputSchema?: unknown;
  handler: (args: Record<string, unknown>) => Promise<{ isError?: boolean; structuredContent?: Record<string, unknown> }>;
};

function toolsOf(episodes: EpisodeStore): Record<string, Tool> {
  const server = tonightMcpServer({
    user: asUser("google:ana"),
    reference: "ref",
    store: refusingTaste,
    episodes,
    verdicts: refusingVerdicts,
  });
  return (server as unknown as { _registeredTools: Record<string, Tool> })._registeredTools;
}

const call = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) =>
  tools[name]!.handler(args);

const offered = [
  { title: "Prisoners", year: 2013, lead: true },
  { title: "Zodiac", year: 2007, lead: false },
];

describe("episode tools", () => {
  let driver: SqlDriver;
  let ana: Record<string, Tool>;
  let ben: Record<string, Tool>;

  before(async () => {
    driver = await embeddedDriver();
    await migrate(driver, EPISODES_SCHEMA);
    ana = toolsOf(sqlEpisodeStore(driver, asUser("google:ana")));
    ben = toolsOf(sqlEpisodeStore(driver, asUser("google:ben")));
  });

  after(async () => {
    await driver.close();
  });

  const recorded = async (tools = ana) => {
    const result = await call(tools, "record_episode", {
      request: "something tense tonight",
      offered,
    });
    return (result.structuredContent as { episode: { id: string } }).episode;
  };

  const readBack = async (id: string, tools = ana) => {
    const result = await call(tools, "get_episodes");
    const all = (result.structuredContent as { episodes: { id: string }[] }).episodes;
    return all.find((episode) => episode.id === id) as unknown as Record<string, { known: boolean; value?: unknown }>;
  };

  test("recording an evening writes what was asked and offered", async () => {
    const episode = await recorded();
    const read = await readBack(episode.id);
    assert.equal(read.request as unknown as string, "something tense tonight");
    assert.deepEqual(read.offered as unknown as typeof offered, offered);
  });

  test("what nobody said stays not known", async () => {
    const read = await readBack((await recorded()).id);
    assert.equal(read.chosen?.known, false, "recording invented a choice");
    assert.equal(read.watched?.known, false, "recording invented a watching");
    assert.equal(read.finished?.known, false, "recording invented a finishing");
  });

  test("the record tool cannot be handed an outcome at all", () => {
    const shape = JSON.stringify(ana.record_episode?.inputSchema ?? {});
    for (const absent of ["chosen", "watched", "finished"]) {
      assert.equal(shape.includes(absent), false, `record_episode accepts ${absent}`);
    }
  });

  test("a stated false comes back as false, not as silence", async () => {
    const episode = await recorded();
    await call(ana, "correct_episode", { episode: episode.id, watched: false });
    const read = await readBack(episode.id);
    assert.equal(read.watched?.known, true, "a stated no was stored as silence");
    assert.equal(read.watched?.value, false);
  });

  test("a retraction takes a fact back to not known", async () => {
    const episode = await recorded();
    await call(ana, "correct_episode", { episode: episode.id, watched: true });
    await call(ana, "correct_episode", { episode: episode.id, watched: null });
    const read = await readBack(episode.id);
    assert.equal(read.watched?.known, false, "a retraction did not reach not known");
  });

  test("every fact can be retracted, not only the first one tried", async () => {
    // Each field is forwarded separately, so each needs its own proof: a
    // retraction dropped for one of them is invisible in a test of another.
    const episode = await recorded();
    await call(ana, "correct_episode", {
      episode: episode.id,
      chosen: { title: "Zodiac", year: 2007 },
      watched: true,
      finished: true,
    });

    for (const field of ["chosen", "watched", "finished"] as const) {
      await call(ana, "correct_episode", { episode: episode.id, [field]: null });
      const read = await readBack(episode.id);
      assert.equal(read[field]?.known, false, `${field} could not be taken back`);
    }
  });

  test("correcting one fact leaves the others as they were", async () => {
    const episode = await recorded();
    await call(ana, "correct_episode", { episode: episode.id, watched: true });
    await call(ana, "correct_episode", { episode: episode.id, finished: false });

    const read = await readBack(episode.id);
    assert.equal(read.watched?.value, true, "correcting finished moved watched");
    assert.equal(read.finished?.value, false);
    assert.equal(read.chosen?.known, false, "correcting finished invented a choice");
  });

  test("a chosen film has to be one the evening offered", async () => {
    const episode = await recorded();
    const refused = await call(ana, "correct_episode", {
      episode: episode.id,
      chosen: { title: "Heat", year: 1995 },
    });
    assert.equal(refused.isError, true, "an unoffered film was accepted");

    const accepted = await call(ana, "correct_episode", {
      episode: episode.id,
      chosen: { title: "Zodiac", year: 2007 },
    });
    assert.equal(accepted.isError, undefined);
    const read = await readBack(episode.id);
    assert.deepEqual(read.chosen?.value, offered[1]);
  });

  test("forgetting removes the evening from every read", async () => {
    const episode = await recorded();
    const gone = await call(ana, "forget_episode", { episode: episode.id });
    assert.equal(gone.isError, undefined);
    assert.equal(await readBack(episode.id), undefined, "a forgotten evening is still listed");
  });

  test("an evening that is not there is a refusal, not a crash", async () => {
    const absent = "00000000-0000-0000-0000-000000000000";
    for (const [name, args] of [
      ["correct_episode", { episode: absent, watched: true }],
      ["forget_episode", { episode: absent }],
    ] as const) {
      const result = await call(ana, name, args);
      assert.equal(result.isError, true, `${name} did not refuse a missing evening`);
    }
  });

  test("malformed input is a refusal carrying the reason", async () => {
    const result = await call(ana, "record_episode", { request: "   ", offered: [] });
    assert.equal(result.isError, true, "an empty request was accepted");
  });

  test("one user's evenings never appear in another's read", async () => {
    const hers = await recorded(ana);
    const listed = await call(ben, "get_episodes");
    const theirs = (listed.structuredContent as { episodes: { id: string }[] }).episodes;
    assert.equal(
      theirs.some((episode) => episode.id === hers.id),
      false,
      "another user's evening was listed",
    );

    for (const [name, args] of [
      ["correct_episode", { episode: hers.id, watched: true }],
      ["forget_episode", { episode: hers.id }],
    ] as const) {
      assert.equal((await call(ben, name, args)).isError, true, `${name} crossed users`);
    }
    assert.equal((await readBack(hers.id, ana))?.watched?.known, false);
  });

  test("no episode tool takes a user id", () => {
    for (const name of ["record_episode", "get_episodes", "correct_episode", "forget_episode"]) {
      const shape = JSON.stringify(ana[name]?.inputSchema ?? {});
      for (const forbidden of ["user_id", "userId", "user"]) {
        assert.equal(shape.includes(forbidden), false, `${name} accepts ${forbidden}`);
      }
    }
  });

  test("no episode tool touches the taste model", async () => {
    // The taste half of this session throws on any call at all, so reaching it
    // is a thrown error rather than a quiet write.
    const episode = await recorded();
    await call(ana, "correct_episode", { episode: episode.id, watched: true, finished: true });
    await call(ana, "get_episodes");
    await call(ana, "forget_episode", { episode: episode.id });
  });

  test("the tool surface offers no generic mutation", () => {
    const names = Object.keys(ana);
    for (const generic of ["update_episode", "patch_episode", "set_episode", "upsert_episode"]) {
      assert.equal(names.includes(generic), false, `${generic} appeared`);
    }
    assert.deepEqual(names.filter((name) => name.includes("episode")).sort(), [
      "correct_episode",
      "forget_episode",
      "get_episodes",
      "record_episode",
    ]);
  });

  test("recording an evening is not an answer, said where the evening is written", () => {
    // Phase-1 certification, three runs of sixty: `get_taste`, then
    // `record_episode` with four real films in `offered`, then a reply that read
    // in full *"Logged this evening's recommendation."* Every run that called
    // this tool in that sweep did it. The films existed only in the call, and
    // the user was handed nothing they could act on.
    //
    // The skill says a tool call is not an answer; the projection carries it as
    // one short clause, and this tool — the one that makes the substitution
    // available — said nothing at all. So the rule is stated here, at the point
    // where a model is deciding to write an evening down.
    const said = ana.record_episode!.description ?? "";

    assert.match(
      said,
      /Writing this down does not answer them, and it never finishes a request for a film/u,
      "record_episode does not say that recording is not answering",
    );
    assert.match(said, /Nothing here is shown to the user/u, "it does not say the call is invisible");
    assert.match(
      said,
      /Every film in `offered` must already be in the reply they can read/u,
      "it does not require the offered films to be in the visible reply",
    );
    assert.match(
      said,
      /A film that exists only in this call was never recommended/u,
      "it does not name the failure the certification found",
    );
    // And the repair a model might reach for instead, refused: the answer is
    // written first, and this is not the way to fix a reply that lacks one.
    assert.match(
      said,
      /write the recommendation first, then record it/u,
      "it does not say which comes first",
    );

    // The tool still does its job. This is an addition to what it says, never a
    // discouragement from using it — an evening is a fact and stays recordable.
    assert.match(said, /Write down an evening Tonight was part of/u, "the tool lost its own purpose");
    assert.equal(
      /do not record|avoid recording|refrain from/iu.test(said),
      false,
      "the description now discourages recording an evening",
    );
  });

  test("the descriptions define where an evening's own record came from", () => {
    // Two fields were added to every public Episode payload and nothing told a
    // model what they meant. A field a model can see and cannot interpret is
    // worse than an absent one: it will be interpreted anyway, and the two
    // readings available here — that `stated` is a preference, or that
    // `observed` is something Tonight worked out — are both wrong and both
    // plausible.
    //
    // What is asserted below is meaning, not phrasing. An earlier version of
    // this test also demanded that the words "taste", "verdict", "prefer" and
    // "infer" never appear, which forbids the clearest possible wording — *"this
    // is not taste evidence"* — while proving nothing about what the
    // description actually establishes. A correct explicit negation has to be
    // allowed, so the contract is stated positively instead.
    const said = ana.get_episodes!.description ?? "";

    // Both fields are named, where the payload shows them.
    assert.match(said, /`?requestSource`?/u, "get_episodes never names requestSource");
    assert.match(said, /`?offeredSource`?/u, "get_episodes never names offeredSource");

    // They are provenance of the record — where the field's content came from —
    // and not a property of the evening or of the film.
    assert.match(
      said,
      /(requestSource|offeredSource)[^.]*(came from|where .*came|provenance)/iu,
      "the description never says the two fields are about where the record came from",
    );

    // `observed`: Tonight was there. Received it, or put the films forward itself.
    assert.match(
      said,
      /`observed`[^.]*Tonight[^.]*(received|put|made|itself)/iu,
      "the description never says observed means Tonight was there itself",
    );

    // `stated`: the user put it right afterwards, so the field became theirs.
    assert.match(
      said,
      /`stated`[^.]*(user|they)[^.]*(later|afterwards)[^.]*(corrected|said|put it right)/iu,
      "the description never says stated means the user corrected it later",
    );

    // A corrected evening is a repaired record and says nothing about the film.
    assert.match(
      said,
      /(nothing about what they like|not a preference|never about the film|not (taste|verdict) evidence)/iu,
      "the description never rules out reading a corrected evening as a preference",
    );

    // And neither value is something the model arrived at.
    assert.match(
      said,
      /(not something you worked out|never (inferred|an inference)|not an inference|neither value is something you)/iu,
      "the description never rules out reading observed or stated as something inferred",
    );
  });

  test("an evening's two sources move one at a time, and each correction moves only its own", async () => {
    // The pair, at every stage, from two independent places: what the write
    // answered, and what a later public read says about that same evening.
    //
    // Asserting one field at a time is what made the earlier version of this
    // test weak: `offeredSource === "stated"` after an offers-only correction
    // passes just as happily if that correction quietly reset `requestSource` to
    // `observed`. So the assertion is always the pair.
    type Sourced = { id: string; requestSource: string; offeredSource: string };
    const domain = new Set<string>();

    const pairOf = (evening: Sourced): [string, string] => {
      domain.add(evening.requestSource);
      domain.add(evening.offeredSource);
      return [evening.requestSource, evening.offeredSource];
    };
    const written = async (name: string, args: Record<string, unknown>) =>
      (await call(ana, name, args)).structuredContent!.episode as Sourced;
    /** That one evening, as `get_episodes` hands it back — by its own id. */
    const readBack = async (id: string): Promise<Sourced> => {
      const listed = (await call(ana, "get_episodes")).structuredContent!.episodes as Sourced[];
      const one = listed.find((entry) => entry.id === id);
      assert.ok(one, `get_episodes no longer lists ${id}`);
      return one;
    };

    /* -- recorded: Tonight was there for both halves ------------------------- */

    const mine = await written("record_episode", { request: "something tense", offered });
    assert.deepEqual(pairOf(mine), ["observed", "observed"], "a recorded evening did not say Tonight was there");
    assert.deepEqual(pairOf(await readBack(mine.id)), ["observed", "observed"]);

    // A second evening nobody ever corrects. It is the control: a per-episode
    // swap, or a correction that reached across evenings, shows up here and
    // nowhere else.
    const other = await written("record_episode", { request: "something quiet", offered });
    assert.deepEqual(pairOf(other), ["observed", "observed"]);

    /* -- the request corrected, and only the request ------------------------- */

    const afterRequest = await written("correct_episode", {
      episode: mine.id,
      request: "what they actually asked for",
    });
    assert.deepEqual(
      pairOf(afterRequest),
      ["stated", "observed"],
      "correcting the request left it claiming Tonight heard it, or moved the offers with it",
    );
    assert.deepEqual(
      pairOf(await readBack(mine.id)),
      ["stated", "observed"],
      "the corrected request does not read back as theirs",
    );

    /* -- the offers corrected, and the request left where it was ------------- */

    // Only `offered`. Nothing else is sent — no `chosen: null` to keep it
    // company, because a second field in the call makes this a two-field
    // correction and the step would no longer prove what it is named for: that
    // an **offers-only** correction leaves the request where the user put it.
    // The evening has no choice to take back anyway; passing one said nothing
    // and hid the case.
    const afterOffers = await written("correct_episode", {
      episode: mine.id,
      offered: [offered[0]!],
    });
    // The whole point of this step: `offeredSource` becomes theirs **and**
    // `requestSource` stays theirs. A correction that reset the request to
    // `observed` would un-say something the user already put right.
    assert.deepEqual(
      pairOf(afterOffers),
      ["stated", "stated"],
      "correcting the offers reset the request they had already corrected",
    );
    assert.deepEqual(
      pairOf(await readBack(mine.id)),
      ["stated", "stated"],
      "the corrected pair does not read back whole",
    );

    /* -- the evening nobody touched ----------------------------------------- */

    assert.deepEqual(
      pairOf(await readBack(other.id)),
      ["observed", "observed"],
      "correcting one evening moved another evening's provenance",
    );

    // And there is no third value, anywhere in any of that. The domain proof is
    // kept — it is what rules out a fourth state — but it is a supplement to the
    // pairs above rather than a substitute for them.
    assert.deepEqual([...domain].sort(), ["observed", "stated"]);
  });

  test("the descriptions carry the boundary a model has to read", () => {
    // Read from the registry rather than the source, because that is the text a
    // model is actually handed — and because concatenation in the source breaks
    // a sentence into pieces that no regex over the file would find.
    const said = ["record_episode", "get_episodes", "correct_episode", "forget_episode"]
      .map((name) => ana[name]?.description ?? "")
      .join("\n");

    // The chain, stated where the model will see it rather than only in a doc.
    assert.match(said, /Offering a film is not the same as them choosing it/u);
    assert.match(said, /Choosing is not watching, watching is not finishing/u);
    assert.match(said, /finishing is not liking/u);
    // Unknown, said to be an answer rather than a gap.
    assert.match(said, /do not read it as no/u);
    assert.match(said, /Record only what you actually observed/u);
    // Forgetting, said to be forgetting.
    assert.match(said, /not hidden, not archived/u);

    // No future milestone leaks into what a model is told today.
    for (const later of ["confidence", "proposal", "observation", "situation", "companion"]) {
      assert.equal(
        new RegExp(`\\b${later}`, "iu").test(said),
        false,
        `${later} appears in an episode tool description`,
      );
    }
  });
});
