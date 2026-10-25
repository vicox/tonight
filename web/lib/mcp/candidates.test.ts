import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../episodes/store/sql.ts";
import type { EpisodeStore } from "../episodes/store.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { TASTE_SCHEMA, sqlTasteStore } from "../taste/store/sql.ts";
import type { TasteStore } from "../taste/store.ts";
import { stateVerdict } from "../verdicts/model.ts";
import { VERDICTS_SCHEMA, sqlVerdictStore } from "../verdicts/store/sql.ts";
import type { VerdictStore } from "../verdicts/store.ts";
import { tonightMcpServer } from "./server.ts";

/**
 * `check_candidates` against real stores, written through the real tools.
 *
 * The helper's own suite holds the reading of each answer. What this holds is
 * the seam: that the two reads are the ones `get_taste` makes — so only what
 * currently stands reaches the answer — that nothing is written, that one
 * user's films never reach another's check, and that a refused check reads
 * nothing at all.
 *
 * The fixtures follow Vibe Evolution: a liked or loved verdict is written only
 * for a film in a vibe, so every such film is filed first. The one exception is
 * seeded straight through the verdict store and says so — data from before that
 * rule, which the check has to read the same way.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

type Result = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: { type: string; text: string }[];
};
type Tool = { handler: (args: Record<string, unknown>) => Promise<Result> };

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type Entry = any;

const toolsOf = (server: unknown) =>
  (server as { _registeredTools: Record<string, Tool> })._registeredTools;

const MACHINERY = ["createdAt", "updatedAt", "savedAt", "recordedAt", "saidAt", "at", "ref", "id"];
const stampless = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (key, held: unknown) => (MACHINERY.includes(key) ? null : held)));

describe("check_candidates over real stores", () => {
  let driver: SqlDriver;
  let ana: Record<string, Tool>;
  let ben: Record<string, Tool>;

  const toolsFor = (who: string) =>
    toolsOf(
      tonightMcpServer({
        user: asUser(who),
        reference: "ref",
        store: sqlTasteStore(driver, asUser(who)),
        episodes: sqlEpisodeStore(driver, asUser(who)),
        verdicts: sqlVerdictStore(driver, asUser(who)),
      }),
    );

  before(async () => {
    driver = await embeddedDriver();
    for (const schema of [TASTE_SCHEMA, EPISODES_SCHEMA, VERDICTS_SCHEMA]) {
      await migrate(driver, schema);
    }
    ana = toolsFor("google:ana");
    ben = toolsFor("google:ben");

    // Ana's model, through the tools, as an agent would have written it.
    await ok(ana, "create_genre", { name: "Crime", instruction: "Clever, never cruel." });
    await ok(ana, "create_vibe", {
      name: "Night Shift",
      genres: ["Crime"],
      instruction: "Long nights, one job.",
      core: { title: "Heat", year: 1995 },
    });
    await ok(ana, "record_verdict", {
      film: { title: "Heat", year: 1995 },
      told: "volunteered",
      said: { about: "judgement", judgement: "loved", because: "the diner scene" },
    });
    await ok(ana, "create_movie", { title: "Arrival", year: 2016, viewing: "want-to-see", vibes: ["Night Shift"] });
    await ok(ana, "create_movie", { title: "Cats", year: 2019, viewing: "dont-want-to-see" });
    // A dislike needs no vibe and no saved film.
    await ok(ana, "record_verdict", {
      film: { title: "Solaris", year: 1972 },
      told: "confirmed",
      said: { about: "judgement", judgement: "disliked" },
    });
  });

  after(async () => {
    await driver.close();
  });

  async function ok(tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) {
    const result = await tools[name]!.handler(args);
    assert.notEqual(result.isError, true, `${name} refused: ${result.content?.[0]?.text}`);
    return result.structuredContent as Record<string, unknown>;
  }

  const check = async (tools: Record<string, Tool>, candidates: Record<string, unknown>[]): Promise<Entry[]> =>
    (await ok(tools, "check_candidates", { candidates })).candidates as Entry[];

  test("each film comes back as Tonight holds it, in the order asked", async () => {
    const [heat, arrival, cats, solaris, moon] = await check(ana, [
      { title: "Heat", year: 1995 },
      { title: "arrival", year: 2016 },
      { title: "Cats", year: 2019 },
      { title: "Solaris", year: 1972 },
      { title: "Moon", year: 2009 },
    ]);

    assert.deepEqual(heat, {
      asked: { title: "Heat", year: 1995 },
      status: "saved",
      movie: { title: "Heat", year: 1995, imdbId: null, viewing: "seen-before", vibes: ["Night Shift"] },
      verdict: { judgement: "loved", because: "the diner scene", told: "volunteered" },
      seen: true,
      neverRecommend: false,
      otherYears: [],
      imdbHeldBy: null,
    });
    assert.deepEqual([arrival.status, arrival.movie.title, arrival.movie.viewing, arrival.seen], [
      "saved",
      "Arrival",
      "want-to-see",
      false,
    ]);
    assert.deepEqual([cats.status, cats.seen, cats.neverRecommend], ["saved", null, true]);
    assert.deepEqual([solaris.status, solaris.movie, solaris.verdict, solaris.seen], [
      "said-only",
      null,
      { judgement: "disliked", told: "confirmed" },
      true,
    ]);
    assert.deepEqual([moon.status, moon.movie, moon.verdict, moon.seen], ["nothing", null, null, null]);
  });

  test("only what stands reaches the check", async () => {
    // Taken back, a dislike leaves nothing: the film was never saved, and a
    // withdrawn verdict is not a weaker one.
    const prisoners = { title: "Prisoners", year: 2013 };
    await ok(ana, "record_verdict", { film: prisoners, told: "volunteered", said: { about: "judgement", judgement: "disliked" } });
    await ok(ana, "withdraw_verdict", { film: prisoners });
    const [gone] = await check(ana, [prisoners]);
    assert.deepEqual([gone.status, gone.verdict, gone.seen], ["nothing", null, null]);

    // Replaced, the correction is what stands.
    const collateral = { title: "Collateral", year: 2004 };
    await ok(ana, "create_movie", { ...collateral, viewing: "seen-before", vibes: ["Night Shift"] });
    await ok(ana, "record_verdict", { film: collateral, told: "volunteered", said: { about: "judgement", judgement: "liked" } });
    await ok(ana, "record_verdict", { film: collateral, told: "volunteered", said: { about: "judgement", judgement: "disliked" } });
    const [changed] = await check(ana, [collateral]);
    assert.deepEqual([changed.status, changed.verdict.judgement], ["saved", "disliked"]);
  });

  test("a loved film from before Vibe Evolution, in no vibe and not saved, is read like any other", async () => {
    // Legacy data: seeded through the verdict store itself, because the MCP
    // tools no longer write a loved for a film in no vibe.
    const paterson = { title: "Paterson", year: 2016 };
    await sqlVerdictStore(driver, asUser("google:ana")).say(
      stateVerdict(paterson, { about: "judgement", judgement: "loved" }, "volunteered", new Date().toISOString()),
    );
    const [legacy] = await check(ana, [paterson]);
    assert.deepEqual([legacy.status, legacy.verdict.judgement, legacy.seen], ["said-only", "loved", true]);
  });

  test("checking writes nothing", async () => {
    const before = stampless(await ok(ana, "get_memory"));
    await check(ana, [{ title: "Heat", year: 1995 }, { title: "Moon", year: 2009 }]);
    assert.deepEqual(stampless(await ok(ana, "get_memory")), before, "a check changed what Tonight holds");
    assert.deepEqual((await ok(ana, "get_episodes")).episodes, [], "a check recorded an evening");
  });

  test("one user's films never reach another's check", async () => {
    const [heat, solaris] = await check(ben, [{ title: "Heat", year: 1995 }, { title: "Solaris", year: 1972 }]);
    assert.deepEqual([heat.status, heat.seen, solaris.status], ["nothing", null, "nothing"]);
  });

  test("a refused check says why, and writes nothing", async () => {
    const before = stampless(await ok(ana, "get_memory"));

    const twice = await ana.check_candidates!.handler({
      candidates: [{ title: "Heat", year: 1995 }, { title: "heat ", year: 1995 }],
    });
    assert.equal(twice.isError, true);
    assert.match(twice.content?.[0]?.text ?? "", /Heat \(1995\) is in this check twice/u);

    const cleared = await ana.check_candidates!.handler({ candidates: [{ title: "Heat", year: 1995, imdb_id: null }] });
    assert.equal(cleared.isError, true);
    assert.match(cleared.content?.[0]?.text ?? "", /an IMDb id here is text, or left out/u);

    assert.deepEqual(stampless(await ok(ana, "get_memory")), before);
  });
});

test("a refused check reads neither store", async () => {
  // Counted rather than inferred from nothing having changed: an unchanged
  // memory proves no write, never no read.
  let reads = 0;
  const store = { taste: async () => (reads++, { genres: [], vibes: [], movies: [] }) } as unknown as TasteStore;
  const verdicts = { standing: async () => (reads++, []) } as unknown as VerdictStore;
  const tools = toolsOf(
    tonightMcpServer({ user: asUser("google:nobody"), reference: "ref", store, verdicts, episodes: {} as EpisodeStore }),
  );
  const call = (candidates: unknown) => tools.check_candidates!.handler({ candidates });

  for (const [what, candidates] of [
    ["one film twice", [{ title: "Heat", year: 1995 }, { title: "HEAT", year: 1995 }]],
    ["a null id", [{ title: "Heat", year: 1995, imdb_id: null }]],
    ["a blank title", [{ title: "   ", year: 1995 }]],
    ["an empty list", []],
    ["eleven films", Array.from({ length: 11 }, (_, n) => ({ title: `Film ${String(n)}`, year: 2000 }))],
  ] as const) {
    assert.equal((await call(candidates)).isError, true, `${what} was not refused`);
    assert.equal(reads, 0, `${what} was refused only after reading`);
  }

  // And the counter does count: a valid check reads both, once each.
  assert.notEqual((await call([{ title: "Heat", year: 1995 }])).isError, true);
  assert.equal(reads, 2);
});
