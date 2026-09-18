import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../episodes/store/sql.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { TASTE_SCHEMA, sqlTasteStore } from "../taste/store/sql.ts";
import { askAbout } from "../verdicts/questions.ts";
import { QUESTIONS_SCHEMA, sqlQuestionStore } from "../verdicts/questions/sql.ts";
import { VERDICTS_SCHEMA, sqlVerdictStore } from "../verdicts/store/sql.ts";
import { tonightMcpServer } from "./server.ts";

/**
 * What recommendation work is handed, once verdicts exist.
 *
 * Tonight does not recommend — the host model does, from what `get_taste`
 * answers. So this is where M2 can change what somebody is offered, and every
 * contract here is about one question: does the payload say exactly what the
 * user said, and nothing else?
 *
 * The things that must never reach it are the interesting half. An episode, a
 * question waiting on an answer, a chance that went by, a claim they corrected
 * or took back — all of them are real, none of them is a verdict, and a
 * recommendation that used any of them would be personalising on something
 * nobody stated.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

type Tool = {
  description?: string;
  handler: (args: Record<string, unknown>) => Promise<{
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  }>;
};

type Standing = {
  title: string;
  year: number;
  judgement?: string;
  because?: string;
  rejected?: string;
  reason?: string;
  occasion?: string;
  told?: string;
};

describe("what recommendation work is handed", () => {
  let driver: SqlDriver;
  let ana: Record<string, Tool>;
  let ben: Record<string, Tool>;

  const toolsFor = (who: string): Record<string, Tool> =>
    (
      tonightMcpServer({
        user: asUser(who),
        reference: "ref",
        store: sqlTasteStore(driver, asUser(who)),
        episodes: sqlEpisodeStore(driver, asUser(who)),
        verdicts: sqlVerdictStore(driver, asUser(who)),
        questions: sqlQuestionStore(driver, asUser(who)),
      }) as unknown as { _registeredTools: Record<string, Tool> }
    )._registeredTools;

  before(async () => {
    driver = await embeddedDriver();
    for (const schema of [TASTE_SCHEMA, EPISODES_SCHEMA, VERDICTS_SCHEMA, QUESTIONS_SCHEMA]) {
      await migrate(driver, schema);
    }
    ana = toolsFor("google:ana");
    ben = toolsFor("google:ben");
  });

  after(async () => {
    await driver.close();
  });

  const said = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) => {
    const result = await tools[name]!.handler(args);
    assert.equal(result.isError, undefined, `${name} refused: ${JSON.stringify(result.structuredContent)}`);
    return result.structuredContent as Record<string, unknown>;
  };

  let next = 0;
  const film = () => ({ title: `Subject ${String(++next)}`, year: 2013 });

  const taste = async (tools = ana) => (await said(tools, "get_taste")) as {
    movies?: { title: string; state: string | null }[];
    verdicts?: Standing[];
  };
  const about = async (f: { title: string }, tools = ana): Promise<Standing[]> =>
    ((await taste(tools)).verdicts ?? []).filter((v) => v.title === f.title);

  /**
   * The taste model without Tonight's own timestamps.
   *
   * `createdAt` and `updatedAt` are when Tonight wrote a row, not anything the
   * user said, and two otherwise identical users will differ by a millisecond.
   * Comparing them would be comparing clocks; what these contracts are about is
   * whether anything the user did *not* say changed what recommendation work
   * sees.
   */
  const evidence = (model: unknown): string =>
    JSON.stringify(model, (key, value) => (key === "createdAt" || key === "updatedAt" ? null : value));

  /* ------------------------------------------------ a verdict reaches the answer */

  for (const judgement of ["loved", "liked", "disliked"] as const) {
    test(`${judgement} reaches recommendation work as what they said`, async () => {
      const f = film();
      await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement } });
      assert.deepEqual(await about(f), [{ title: f.title, year: f.year, judgement, told: "volunteered" }]);
    });
  }

  test("their own words for why come with it, unchanged", async () => {
    const f = film();
    const words = "the tension never lets up";
    await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "judgement", judgement: "loved", because: words },
    });
    assert.equal((await about(f))[0]?.because, words);
  });

  test("where they said nothing, there is no reason to offer", async () => {
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "confirmed", said: { about: "judgement", judgement: "liked" } });
    const [one] = await about(f);
    assert.equal("because" in (one ?? {}), false, "an explanation appeared that nobody gave");
  });

  test("a rejection's reason is its own, and stays that way", async () => {
    const f = film();
    await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "rejection", reach: "not-ever", reason: "three hours of misery" },
    });
    const [one] = await about(f);
    assert.equal(one?.rejected, "not-ever");
    assert.equal(one?.reason, "three hours of misery");
    assert.equal("because" in (one ?? {}), false, "a rejection carried a judgement's facet");
    assert.equal("judgement" in (one ?? {}), false);
  });

  test("volunteered and confirmed arrive as they happened, and as words", async () => {
    const one = film();
    const two = film();
    await said(ana, "record_verdict", { film: one, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    await said(ana, "record_verdict", { film: two, told: "confirmed", said: { about: "judgement", judgement: "loved" } });
    assert.equal((await about(one))[0]?.told, "volunteered");
    assert.equal((await about(two))[0]?.told, "confirmed");
    // Texture, not arithmetic. Nothing here is a number.
    for (const entry of (await taste()).verdicts ?? []) {
      for (const score of ["confidence", "weight", "relevance", "score", "strength"]) {
        assert.equal(score in entry, false, `${score} appeared beside a verdict`);
      }
    }
  });

  /* -------------------------------------------------------------- against a state */

  test("a verdict and the state it disagrees with are both visible, and distinct", async () => {
    const f = film();
    await said(ana, "create_movie", { title: f.title, year: f.year, state: "liked" });
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "disliked" } });

    const model = await taste();
    assert.equal(model.movies?.find((m) => m.title === f.title)?.state, "liked", "the state was rewritten");
    assert.equal((await about(f))[0]?.judgement, "disliked", "the verdict did not reach the answer");
  });

  test("taking the verdict back leaves the state exactly as it was", async () => {
    const f = film();
    await said(ana, "create_movie", { title: f.title, year: f.year, state: "liked" });
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "disliked" } });
    await said(ana, "withdraw_verdict", { film: f });

    assert.deepEqual(await about(f), [], "a withdrawn verdict still reached recommendation work");
    assert.equal((await taste()).movies?.find((m) => m.title === f.title)?.state, "liked", "the state did not return");
  });

  test("a correction replaces what it corrected, and leaves no trace of it", async () => {
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    await said(ana, "record_verdict", { film: f, told: "confirmed", said: { about: "judgement", judgement: "disliked" } });
    const standing = await about(f);
    assert.equal(standing.length, 1, "both the correction and what it replaced were handed over");
    assert.equal(standing[0]?.judgement, "disliked");
  });

  /* ------------------------------------------------------------------ how far */

  test("an evening's refusal carries the evening it belongs to", async () => {
    const f = film();
    await said(ana, "record_verdict", {
      film: f,
      told: "confirmed",
      said: { about: "rejection", reach: "not-tonight", reason: "too long", occasion: "evening-1" },
    });
    assert.deepEqual(await about(f), [
      { title: f.title, year: f.year, rejected: "not-tonight", reason: "too long", occasion: "evening-1", told: "confirmed" },
    ]);
  });

  test("an evening's refusal never arrives as a claim about the film", async () => {
    const f = film();
    await said(ana, "create_movie", { title: f.title, year: f.year, state: "loved" });
    await said(ana, "record_verdict", {
      film: f,
      told: "confirmed",
      said: { about: "rejection", reach: "not-tonight", occasion: "evening-1" },
    });
    const [one] = await about(f);
    assert.equal(one?.occasion, "evening-1", "the refusal lost the evening it belongs to");
    assert.equal(one?.judgement, undefined, "an evening's refusal became a judgement");
    // And the film still stands where it stood everywhere else.
    assert.equal((await taste()).movies?.find((m) => m.title === f.title)?.state, "loved");
  });

  test("a global claim and an evening's refusal arrive as two things, not one", async () => {
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    await said(ana, "record_verdict", {
      film: f,
      told: "confirmed",
      said: { about: "rejection", reach: "not-tonight", occasion: "evening-2" },
    });
    const standing = await about(f);
    assert.equal(standing.length, 2);
    assert.equal(standing.filter((v) => v.occasion === undefined)[0]?.judgement, "loved", "the global claim was lost");
    assert.equal(standing.filter((v) => v.occasion === "evening-2")[0]?.rejected, "not-tonight");
  });

  test("withdrawing an evening's refusal leaves the global claim untouched", async () => {
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    await said(ana, "record_verdict", {
      film: f,
      told: "confirmed",
      said: { about: "rejection", reach: "not-tonight", occasion: "evening-3" },
    });
    await said(ana, "withdraw_verdict", { film: f, occasion: "evening-3" });
    assert.deepEqual(await about(f), [
      { title: f.title, year: f.year, judgement: "loved", told: "volunteered" },
    ]);
  });

  test("a film refused for good says nothing about any other film", async () => {
    const refused = film();
    const other = film();
    await said(ana, "create_movie", { title: other.title, year: other.year, state: "loved" });
    await said(ana, "record_verdict", {
      film: refused,
      told: "volunteered",
      said: { about: "rejection", reach: "not-ever", reason: "too bleak" },
    });
    assert.deepEqual(await about(other), [], "a refusal of one film reached another");
    assert.equal((await taste()).movies?.find((m) => m.title === other.title)?.state, "loved");
    // Nothing categorical is derived anywhere: no genre, no mix, no rule.
    const model = await taste();
    assert.equal(
      JSON.stringify(model.verdicts).includes("genre") || JSON.stringify(model.verdicts).includes("similar"),
      false,
      "a rejection was generalised beyond the film",
    );
  });

  /* ----------------------------------------- what never becomes taste evidence */

  test("a user with nothing said reads exactly as they did before verdicts existed", async () => {
    const model = await taste(toolsFor("google:quiet"));
    assert.deepEqual(Object.keys(model).sort(), ["genres", "mixes", "movies"]);
    assert.equal("verdicts" in model, false, "an empty list was handed over where there is nothing to say");
  });

  test("an episode, however it ended, adds nothing", async () => {
    // The same taste model twice, one of them with a whole evening behind it.
    const f = film();
    const withHistory = toolsFor("google:with-history");
    const without = toolsFor("google:without-history");
    for (const tools of [withHistory, without]) {
      await said(tools, "create_movie", { title: f.title, year: f.year, state: "seen" });
    }

    const written = await said(withHistory, "record_episode", {
      request: "something tense tonight",
      offered: [{ title: f.title, year: f.year, lead: true }],
    });
    const id = (written.episode as { id: string }).id;
    await said(withHistory, "correct_episode", { episode: id, chosen: { title: f.title, year: f.year } });
    await said(withHistory, "correct_episode", { episode: id, watched: true });
    await said(withHistory, "correct_episode", { episode: id, finished: true });

    const one = await taste(withHistory);
    const other = await taste(without);
    assert.equal(evidence(one), evidence(other), "an episode changed what recommendation work sees");
    assert.equal("verdicts" in one, false, "watching and finishing became a verdict");
  });

  test("a question waiting on an answer adds nothing, however long it waits", async () => {
    const f = film();
    const waiting = toolsFor("google:waiting");
    const quiet = toolsFor("google:quiet-too");
    for (const tools of [waiting, quiet]) {
      await said(tools, "create_movie", { title: f.title, year: f.year, state: "seen" });
    }
    const questions = sqlQuestionStore(driver, asUser("google:waiting"));
    await questions.open(askAbout(f, new Date(Date.now() - 20 * 86_400_000).toISOString()));
    await said(waiting, "record_opportunity", { film: f });
    await said(waiting, "record_opportunity", { film: f });

    assert.equal(
      evidence(await taste(waiting)),
      evidence(await taste(quiet)),
      "a pending question or a chance that went by reached recommendation work",
    );
  });

  test("recommending a film, however often, creates nothing", async () => {
    const f = film();
    const tools = toolsFor("google:recommended-at");
    for (let again = 0; again < 4; again += 1) {
      await said(tools, "record_episode", {
        request: "what should I watch",
        offered: [{ title: f.title, year: f.year, lead: true }],
      });
    }
    const model = await taste(tools);
    assert.equal("verdicts" in model, false, "Tonight's own suggestions became evidence");
    assert.deepEqual(model.movies, [], "recommending a film wrote it into the taste model");
  });

  /* ------------------------------------------------------------------ isolation */

  test("one user's verdicts never reach another's answer", async () => {
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    assert.deepEqual(await about(f, ben), [], "another user's verdict was handed over");
  });

  /* -------------------------------------------------------------- the payload */

  test("the payload carries what they said and none of Tonight's bookkeeping", async () => {
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    const [one] = await about(f);
    for (const internal of ["said", "claimant", "at", "order", "scope", "assertion", "id"]) {
      assert.equal(internal in (one ?? {}), false, `${internal} leaked into recommendation work`);
    }
  });

  test("the description says what the payload is and what it is not", () => {
    const text = ana.get_taste?.description ?? "";
    assert.match(text, /`verdicts` is what they have since said about particular films/u);
    assert.match(text, /Only what currently stands is here/u);
    assert.match(text, /`not-tonight` is about\s+that evening/u);
    assert.match(text, /that film, not its genre, its director or anything resembling it/u);
    assert.match(text, /the\s+film's state in movies is what is left of what they said/u);
    assert.match(text, /not that you recommended it, not that they watched or\s+finished it/u);
    assert.match(text, /not a question of yours waiting\s+on an answer/u);
    assert.match(text, /neither is a number/u);
  });
});
