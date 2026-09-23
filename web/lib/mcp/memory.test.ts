import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../episodes/store/sql.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { sqlTasteStore, TASTE_SCHEMA } from "../taste/store/sql.ts";
import { QUESTIONS_SCHEMA, sqlQuestionStore } from "../verdicts/questions/sql.ts";
import { sqlVerdictStore, VERDICTS_SCHEMA } from "../verdicts/store/sql.ts";
import { tonightMcpServer } from "./server.ts";

/**
 * The memory surface, as an agent actually meets it.
 *
 * The arranging is settled and has contracts of its own in
 * `lib/memory/model.test.ts`. What is in question here is the boundary: that
 * `get_memory` hands over what the composer produced rather than a second
 * opinion assembled on the way out, that the handles it gives are the ones the
 * correction tools take, and that reading somebody's memory writes nothing.
 *
 * So these contracts go through the tools and only the tools. Where a fact has
 * to be established independently of the composer it is written out here.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

type Tool = {
  description?: string;
  handler: (args: Record<string, unknown>) => Promise<{
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  }>;
};

type Basis = { kind: string; [field: string]: unknown };
type Root = {
  placement: string;
  of: string;
  basis: Basis;
  handle: Record<string, unknown>;
  [field: string]: unknown;
};
type Memory = {
  held: Root[];
  operative: {
    film: { title: string; year: number };
    where: unknown;
    saved: { state: string; handle: Record<string, unknown> };
    governing: { act: Record<string, unknown>; handle: Record<string, unknown> };
    because: string;
  }[];
  remembered: Root[];
};

describe("the memory tools", () => {
  let driver: SqlDriver;

  before(async () => {
    driver = await embeddedDriver();
    for (const schema of [TASTE_SCHEMA, EPISODES_SCHEMA, VERDICTS_SCHEMA, QUESTIONS_SCHEMA]) {
      await migrate(driver, schema);
    }
  });

  after(async () => {
    await driver.close();
  });

  let next = 0;
  const someone = (name = `person-${String(++next)}`): Record<string, Tool> => {
    const who = asUser(`google:${name}`);
    return (
      tonightMcpServer({
        user: who,
        reference: "ref",
        store: sqlTasteStore(driver, who),
        episodes: sqlEpisodeStore(driver, who),
        verdicts: sqlVerdictStore(driver, who),
        questions: sqlQuestionStore(driver, who),
      }) as unknown as { _registeredTools: Record<string, Tool> }
    )._registeredTools;
  };

  const said = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) => {
    const result = await tools[name]!.handler(args);
    assert.equal(result.isError, undefined, `${name} refused: ${JSON.stringify(result)}`);
    return result.structuredContent as Record<string, unknown>;
  };
  const refused = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown>) => {
    const result = await tools[name]!.handler(args);
    assert.equal(result.isError, true, `${name} was accepted`);
    return JSON.stringify(result);
  };
  const memory = async (tools: Record<string, Tool>) =>
    (await said(tools, "get_memory")) as unknown as Memory;
  const of = (roots: readonly Root[], kind: string) => roots.filter((root) => root.of === kind);

  const BLACK_BAG = { title: "Black Bag", year: 2025 };
  const HEAT = { title: "Heat", year: 1995 };

  const judged = (film: { title: string; year: number }, judgement: string) => ({
    film,
    told: "volunteered",
    said: { about: "judgement", judgement },
  });

  /* ----------------------------------------------------------- composition */

  test("one of everything arrives once, in the right part", async () => {
    // The expected picture is written out here, not read back from the tool.
    const her = someone();
    await said(her, "create_genre", { name: "Slow Burn", instruction: "takes its time" });
    await said(her, "create_mix", { name: "Long Nights", genres: ["Slow Burn"], instruction: "room" });
    await said(her, "create_movie", { ...HEAT, state: "loved" });
    await said(her, "record_verdict", judged(BLACK_BAG, "loved"));
    await said(her, "record_episode", { request: "something tense", offered: [{ ...HEAT, lead: true }] });

    const { held, operative, remembered } = await memory(her);
    assert.deepEqual(
      held.map((root) => root.of).sort(),
      ["genre", "mix", "movie", "verdict"],
      "the held roots are not one of each",
    );
    assert.deepEqual(remembered.map((root) => root.of), ["evening"]);
    assert.deepEqual(operative, [], "a conflict appeared where nothing disagrees");
    for (const root of held) assert.equal(root.placement, "held");
    for (const root of remembered) assert.equal(root.placement, "remembered");
  });

  test("the answer is the composer's, not a second one assembled here", async () => {
    // The tool is a gatherer. Read the same roots through the stores, compose
    // them directly, and the two must be the same object — which is only true
    // if nothing is decided on the way out.
    const her = someone("delegation");
    const who = asUser("google:delegation");
    await said(her, "create_movie", { ...BLACK_BAG, state: "liked" });
    await said(her, "record_verdict", judged(BLACK_BAG, "disliked"));
    await said(her, "record_episode", { request: "tense", offered: [{ ...HEAT, lead: true }] });
    await said(her, "record_verdict", judged(HEAT, "loved"));
    await said(her, "withdraw_verdict", { film: HEAT });

    const { compose } = await import("../memory/model.ts");
    const direct = compose({
      taste: await sqlTasteStore(driver, who).taste(),
      acts: await sqlVerdictStore(driver, who).acts(),
      episodes: await sqlEpisodeStore(driver, who).episodes(),
    });
    assert.deepEqual(await memory(her), JSON.parse(JSON.stringify(direct)) as Memory);
  });

  /* -------------------------------------------------------------- conflict */

  test("a disagreeing film keeps both roots held and says which governs", async () => {
    const her = someone();
    await said(her, "create_movie", { ...BLACK_BAG, state: "liked" });
    await said(her, "record_verdict", judged(BLACK_BAG, "disliked"));

    const { held, operative } = await memory(her);
    assert.equal(operative.length, 1);
    assert.deepEqual(operative[0]?.saved.handle, { by: "film", title: "Black Bag", year: 2025 });
    assert.equal(operative[0]?.saved.state, "liked", "the saved state was rewritten");
    assert.deepEqual(operative[0]?.where, "everywhere");
    assert.equal(of(held, "movie").length, 1, "the overridden film left held");
    assert.equal(of(held, "verdict").length, 1);
  });

  test("a permanent refusal stays a refusal, and a nightly one stays in its night", async () => {
    const forGood = someone();
    await said(forGood, "create_movie", { ...BLACK_BAG, state: "loved" });
    await said(forGood, "record_verdict", {
      film: BLACK_BAG,
      told: "confirmed",
      said: { about: "rejection", reach: "not-ever" },
    });
    const ever = await memory(forGood);
    assert.equal(ever.operative.length, 1);
    assert.deepEqual(ever.operative[0]?.where, "everywhere");
    assert.equal(JSON.stringify(ever.operative[0]).includes("disliked"), false, "a refusal became a dislike");

    const tonight = someone();
    await said(tonight, "create_movie", { ...BLACK_BAG, state: "loved" });
    await said(tonight, "record_verdict", {
      film: BLACK_BAG,
      told: "confirmed",
      said: { about: "rejection", reach: "not-tonight", occasion: "tue" },
    });
    const scoped = await memory(tonight);
    assert.equal(scoped.operative.length, 1);
    assert.deepEqual(scoped.operative[0]?.where, { occasion: "tue" }, "an evening's refusal went global");
    assert.equal(JSON.stringify(scoped.operative[0]).includes("disliked"), false);
  });

  test("a superseded verdict is remembered and the later one is held", async () => {
    const her = someone();
    await said(her, "record_verdict", judged(BLACK_BAG, "loved"));
    await said(her, "record_verdict", judged(BLACK_BAG, "disliked"));

    const { held, remembered } = await memory(her);
    assert.equal(of(held, "verdict").length, 1);
    assert.equal(of(remembered, "verdict").length, 1);
    assert.equal(
      (of(held, "verdict")[0]?.act as { assertion: { judgement: string } }).assertion.judgement,
      "disliked",
    );
    assert.equal(of(remembered, "verdict")[0]?.basis.became, "superseded");
  });

  test("an evening is remembered however it went, and never held", async () => {
    const her = someone();
    const written = (await said(her, "record_episode", {
      request: "something tense",
      offered: [{ ...HEAT, lead: true }],
    })) as { episode: { id: string } };
    await said(her, "correct_episode", {
      episode: written.episode.id,
      chosen: HEAT,
      watched: true,
      finished: true,
    });

    const { held, remembered } = await memory(her);
    assert.equal(held.length, 0, "a finished evening produced something held");
    assert.deepEqual(remembered.map((root) => root.of), ["evening"]);
  });

  /* ------------------------------------------------------------ provenance */

  test("each kind of root says only what its own store knows", async () => {
    const her = someone();
    await said(her, "create_genre", { name: "Slow Burn", instruction: "takes its time" });
    await said(her, "record_verdict", judged(BLACK_BAG, "loved"));
    await said(her, "record_episode", { request: "tense", offered: [{ ...HEAT, lead: true }] });

    const { held, remembered } = await memory(her);
    const genre = of(held, "genre")[0]!;
    assert.deepEqual(Object.keys(genre.basis).sort(), ["changedAt", "kind", "savedAt"]);
    assert.equal(genre.basis.kind, "saved");

    const verdict = of(held, "verdict")[0]!;
    assert.equal(verdict.basis.kind, "said");
    assert.equal(verdict.basis.claimant, "user");
    assert.equal(verdict.basis.told, "volunteered");
    assert.equal(verdict.basis.became, "current");
    assert.equal(typeof verdict.basis.saidAt, "string");
    assert.deepEqual(verdict.handle, { by: "ref", ref: (verdict.handle as { ref: string }).ref });

    const evening = of(remembered, "evening")[0]!;
    assert.equal(evening.basis.kind, "evening");
    assert.equal(typeof evening.basis.recordedAt, "string");
    assert.equal(evening.requestSource, "observed");
    assert.equal(evening.offeredSource, "observed");

    // No generic time, and no persistence machinery anywhere in the payload.
    const payload = JSON.stringify({ held, remembered });
    for (const absent of ["when", "order", "seq", "user_id", "confidence", "score"]) {
      assert.equal(new RegExp(`"${absent}"\\s*:`).test(payload), false, `${absent} reached the model`);
    }
  });

  test("every held and remembered root carries a handle a tool actually takes", async () => {
    const her = someone();
    await said(her, "create_genre", { name: "Slow Burn", instruction: "takes its time" });
    await said(her, "create_mix", { name: "Long Nights", genres: ["Slow Burn"], instruction: "room" });
    await said(her, "create_movie", { ...HEAT, state: "loved" });
    await said(her, "record_verdict", judged(BLACK_BAG, "loved"));
    await said(her, "record_episode", { request: "tense", offered: [{ ...HEAT, lead: true }] });

    const { held, remembered } = await memory(her);
    const expected: Record<string, string> = {
      genre: "name",
      mix: "name",
      movie: "film",
      verdict: "ref",
      evening: "id",
    };
    for (const root of [...held, ...remembered]) {
      assert.equal(root.handle.by, expected[root.of], `${root.of} is named by something else`);
    }
  });

  /* ---------------------------------------------------------- read purity */

  test("reading memory writes nothing and moves nothing", async () => {
    const her = someone();
    await said(her, "create_movie", { ...BLACK_BAG, state: "liked" });
    await said(her, "record_verdict", judged(BLACK_BAG, "disliked"));
    await said(her, "record_episode", { request: "tense", offered: [{ ...HEAT, lead: true }] });

    const before = {
      taste: await said(her, "get_taste"),
      verdicts: await said(her, "get_verdicts", { film: BLACK_BAG }),
      episodes: await said(her, "get_episodes"),
      questions: await said(her, "get_open_questions"),
    };
    for (let round = 0; round < 3; round += 1) await memory(her);

    assert.deepEqual(await said(her, "get_taste"), before.taste, "reading memory moved the taste model");
    assert.deepEqual(await said(her, "get_verdicts", { film: BLACK_BAG }), before.verdicts);
    assert.deepEqual(await said(her, "get_episodes"), before.episodes);
    assert.deepEqual(await said(her, "get_open_questions"), before.questions);
    assert.deepEqual(await memory(her), await memory(her), "two readings disagreed");
  });

  test("nothing Tonight is waiting to ask reaches the memory view", async () => {
    const her = someone();
    await said(her, "record_verdict", judged(BLACK_BAG, "loved"));
    const payload = JSON.stringify(await memory(her)).toLowerCase();
    for (const absent of ["question", "opportunit", "pending", "observation", "proposal", "relevance"]) {
      assert.equal(payload.includes(`"${absent}`), false, `${absent} appeared in the memory view`);
    }
  });

  /* ------------------------------------------------------------ forgetting */

  test("forgetting the standing verdict removes it and the conflict with it", async () => {
    const her = someone();
    await said(her, "create_movie", { ...BLACK_BAG, state: "liked" });
    await said(her, "record_verdict", judged(BLACK_BAG, "disliked"));

    const before = await memory(her);
    assert.equal(before.operative.length, 1);
    const ref = (of(before.held, "verdict")[0]!.handle as { ref: string }).ref;

    await said(her, "forget_verdict", { ref });
    const after = await memory(her);
    assert.deepEqual(after.operative, [], "the conflict outlived the verdict");
    assert.equal(of(after.held, "verdict").length, 0);
    assert.equal(of(after.remembered, "verdict").length, 0, "a forgotten act lingered");
    assert.equal(JSON.stringify(after).includes(ref), false, "the forgotten act is still named");
    // The film is untouched and is the whole of what is left.
    assert.equal((of(after.held, "movie")[0] as unknown as { state: string }).state, "liked");
  });

  /**
   * The worked example, driven entirely through the tools.
   *
   * V1 loved · V2 liked · V3 the taking-back. Forgetting the taking-back has to
   * let V2 stand again — which is the case that makes forgetting different from
   * withdrawing, and the one a reference is needed for at all.
   */
  test("forgetting the taking-back lets the verdict it silenced stand again", async () => {
    const her = someone();
    await said(her, "record_verdict", judged(BLACK_BAG, "loved"));
    await said(her, "record_verdict", judged(BLACK_BAG, "liked"));
    await said(her, "withdraw_verdict", { film: BLACK_BAG });

    const silent = await memory(her);
    assert.equal(of(silent.held, "verdict").length, 0, "something stood after a withdrawal");
    assert.equal(of(silent.remembered, "verdict").length, 3);

    const taking = of(silent.remembered, "verdict").find(
      (root) => (root.act as { said: string }).said === "withdrawal",
    )!;
    await said(her, "forget_verdict", { ref: (taking.handle as { ref: string }).ref });

    const after = await memory(her);
    assert.equal(of(after.held, "verdict").length, 1, "the silenced verdict did not come back");
    assert.equal(
      (of(after.held, "verdict")[0]?.act as { assertion: { judgement: string } }).assertion.judgement,
      "liked",
      "the wrong verdict came back",
    );
    // And the one it replaced is still history, not belief.
    assert.equal(of(after.remembered, "verdict").length, 1);
    assert.equal(of(after.remembered, "verdict")[0]?.basis.became, "superseded");
  });

  test("forgetting everything leaves the saved film to speak for itself", async () => {
    const her = someone();
    await said(her, "create_movie", { ...BLACK_BAG, state: "liked" });
    await said(her, "record_verdict", judged(BLACK_BAG, "disliked"));
    await said(her, "record_verdict", judged(BLACK_BAG, "loved"));

    for (const root of [...(await memory(her)).held, ...(await memory(her)).remembered]) {
      if (root.of === "verdict") await said(her, "forget_verdict", { ref: (root.handle as { ref: string }).ref });
    }
    const after = await memory(her);
    assert.equal(of(after.held, "verdict").length, 0);
    assert.equal(of(after.remembered, "verdict").length, 0);
    assert.deepEqual(after.operative, []);
    assert.equal((of(after.held, "movie")[0] as unknown as { state: string }).state, "liked");
    // And the taste model says the same: nothing stands about that film.
    assert.equal(((await said(her, "get_taste")) as { verdicts?: unknown[] }).verdicts, undefined);
  });

  test("a reference that names nothing is accepted and changes nothing", async () => {
    const her = someone();
    await said(her, "record_verdict", judged(BLACK_BAG, "loved"));
    const before = await memory(her);

    const answer = await said(her, "forget_verdict", { ref: "00000000-0000-4000-8000-000000000000" });
    assert.deepEqual(answer, { forgotten: "00000000-0000-4000-8000-000000000000" });
    assert.deepEqual(await memory(her), before, "an unknown reference changed something");
  });

  test("a reference belonging to somebody else answers the same way and does nothing", async () => {
    const hers = someone("owner-of-the-act");
    const his = someone("stranger-with-a-ref");
    await said(hers, "record_verdict", judged(BLACK_BAG, "loved"));
    const ref = (of((await memory(hers)).held, "verdict")[0]!.handle as { ref: string }).ref;

    const known = await said(his, "forget_verdict", { ref });
    const unknown = await said(his, "forget_verdict", { ref: "00000000-0000-4000-8000-000000000001" });
    // The same shape of answer for both, so this cannot be asked whether an act
    // exists for somebody else.
    assert.deepEqual(Object.keys(known).sort(), Object.keys(unknown).sort());
    assert.deepEqual(known, { forgotten: ref });

    assert.equal(of((await memory(hers)).held, "verdict").length, 1, "a stranger forgot her verdict");
  });

  /* ------------------------------------------------- correcting an evening */

  test("an evening's request and offers are correctable, and become theirs", async () => {
    const her = someone();
    const first = { title: "First", year: 2001, lead: true };
    const second = { title: "Second", year: 2002, lead: true };
    const written = (await said(her, "record_episode", {
      request: "something tense",
      offered: [first],
    })) as { episode: { id: string } };
    await said(her, "correct_episode", { episode: written.episode.id, chosen: first });

    await said(her, "correct_episode", {
      episode: written.episode.id,
      request: "something quiet, actually",
      offered: [second],
      chosen: second,
    });

    const evening = of((await memory(her)).remembered, "evening")[0]!;
    assert.equal(evening.request, "something quiet, actually");
    assert.equal(evening.requestSource, "stated", "a corrected request still claims Tonight heard it");
    assert.equal(evening.offeredSource, "stated");
    assert.deepEqual(evening.offered, [second]);
    assert.deepEqual((evening.chosen as { value: unknown }).value, second);
    // Nothing of the old evening survives as a current fact.
    assert.equal(JSON.stringify(evening).includes("First"), false, "an old fact survived the correction");
    assert.equal(JSON.stringify(evening).includes("something tense"), false);
  });

  test("an offer list can be emptied when nothing is left chosen, and not otherwise", async () => {
    const her = someone();
    const film = { title: "Only", year: 2003, lead: true };
    const written = (await said(her, "record_episode", { request: "tense", offered: [film] })) as {
      episode: { id: string };
    };
    await said(her, "correct_episode", { episode: written.episode.id, chosen: film, watched: true });

    // Offers alone cannot drop the film they said they watched.
    const complaint = await refused(her, "correct_episode", { episode: written.episode.id, offered: [] });
    assert.match(complaint, /Only/u, "the refusal does not name the film in the way");
    const untouched = of((await memory(her)).remembered, "evening")[0]!;
    assert.deepEqual(untouched.offered, [film], "a refused correction still landed");
    assert.equal(untouched.offeredSource, "observed");

    // Both together is a consistent evening, so it is allowed.
    await said(her, "correct_episode", { episode: written.episode.id, offered: [], chosen: null });
    const after = of((await memory(her)).remembered, "evening")[0]!;
    assert.deepEqual(after.offered, []);
    assert.equal(after.offeredSource, "stated");
    assert.equal((after.chosen as { known: boolean }).known, false);
    assert.equal((after.watched as { value: boolean }).value, true, "an outcome went with the offers");
  });

  test("one user's evening is not correctable by another", async () => {
    const hers = someone("evening-owner");
    const his = someone("evening-stranger");
    const written = (await said(hers, "record_episode", {
      request: "hers alone",
      offered: [{ ...HEAT, lead: true }],
    })) as { episode: { id: string } };

    await refused(his, "correct_episode", { episode: written.episode.id, request: "his instead" });
    const evening = of((await memory(hers)).remembered, "evening")[0]!;
    assert.equal(evening.request, "hers alone");
    assert.equal(evening.requestSource, "observed");
  });

  /* --------------------------------------------------------- the boundary */

  test("one person's memory holds nothing of another's", async () => {
    const hers = someone("memory-mine");
    const his = someone("memory-theirs");
    await said(hers, "create_movie", { ...BLACK_BAG, state: "liked" });
    await said(hers, "record_verdict", judged(BLACK_BAG, "disliked"));
    await said(hers, "record_episode", { request: "hers alone", offered: [{ ...HEAT, lead: true }] });

    assert.deepEqual(await memory(his), { held: [], operative: [], remembered: [] });
    assert.equal(JSON.stringify(await memory(his)).includes("hers alone"), false);
  });

  test("no tool here takes a user, and none is offered one", () => {
    const her = someone();
    for (const name of ["get_memory", "forget_verdict", "correct_episode"]) {
      const schema = JSON.stringify((her[name] as unknown as { inputSchema?: unknown }).inputSchema ?? {});
      for (const field of ["user", "owner", "account", "subject"]) {
        assert.equal(schema.includes(`"${field}"`), false, `${name} takes a ${field}`);
      }
    }
  });

  /* ------------------------------------------------------- the two surfaces */

  test("the descriptions say which surface is for recommending and which is not", () => {
    const her = someone();
    const memoryText = her.get_memory!.description ?? "";
    const tasteText = her.get_taste!.description ?? "";
    const forget = her.forget_verdict!.description ?? "";
    const withdraw = her.withdraw_verdict!.description ?? "";

    // The one thing the memory view must not be mistaken for.
    assert.match(memoryText, /not for recommending|get_taste is what a recommendation reads/iu);
    assert.match(memoryText, /remembered is not evidence/iu);
    assert.ok(memoryText.includes("held") && memoryText.includes("operative") && memoryText.includes("remembered"));
    assert.ok(tasteText.length > 0);

    // Forgetting and withdrawing are told apart where a model will read it.
    assert.match(forget, /not `?withdraw_verdict`?/iu);
    assert.match(withdraw, /no longer stand by|taking back/iu);

    // And no M4 vocabulary has crept in.
    for (const later of ["inferred", "observation", "proposal", "confidence", "reflection"]) {
      assert.equal(
        new RegExp(`\\b${later}`, "iu").test(memoryText + forget),
        false,
        `${later} appeared in a description`,
      );
    }
  });

  test("the memory view says where an evening's own record came from", () => {
    // `get_memory` shows the two source fields itself, so it has to define them
    // itself. A model that reaches this surface without `get_episodes` would
    // otherwise meet `requestSource: "stated"` with nothing to read it by — and
    // the obvious wrong reading, that the user stated a preference, is exactly
    // the one this whole surface exists to prevent.
    const memoryText = someone().get_memory!.description ?? "";

    // Meaning, not phrasing: a reworded but equally explicit definition has to
    // pass, so none of these pins a whole sentence.
    assert.match(memoryText, /`?requestSource`?/u, "the memory view never names requestSource");
    assert.match(memoryText, /`?offeredSource`?/u, "the memory view never names offeredSource");
    assert.match(
      memoryText,
      /`observed`[^.]*Tonight[^.]*(received|put|made|itself)/iu,
      "the memory view does not say that observed means Tonight was there itself",
    );
    assert.match(
      memoryText,
      /`stated`[^.]*(user|they)[^.]*(later|afterwards)[^.]*(corrected|said|put it right)/iu,
      "the memory view does not say that stated means the user corrected it later",
    );
    // And it still says the thing that stops a corrected evening being read as
    // evidence, which is why the sentence above needs no guard of its own.
    assert.match(
      memoryText,
      /(An evening is not a preference|not a preference|never a preference)/iu,
      "the memory view no longer rules out reading an evening as a preference",
    );
  });
});
