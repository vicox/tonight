import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../episodes/store/sql.ts";
import type { EpisodeStore } from "../episodes/store.ts";
import type { AuthenticatedUser } from "../identity.ts";
import type { TasteStore } from "../taste/store.ts";
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

/** The taste half of a session, which no episode tool may reach. */
const refusingTaste = new Proxy({} as TasteStore, {
  get(_, name) {
    return () => {
      throw new Error(`an episode tool reached the taste store: ${String(name)}`);
    };
  },
});

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
