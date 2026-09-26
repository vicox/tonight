import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../episodes/store/sql.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { TASTE_SCHEMA, sqlTasteStore } from "../taste/store/sql.ts";
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
 * claim they corrected or took back, something Tonight worked out for itself —
 * all of them are real, none of them is a verdict, and a recommendation that
 * used any of them would be personalising on something nobody stated.
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
      }) as unknown as { _registeredTools: Record<string, Tool> }
    )._registeredTools;

  before(async () => {
    driver = await embeddedDriver();
    for (const schema of [TASTE_SCHEMA, EPISODES_SCHEMA, VERDICTS_SCHEMA]) {
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
    movies?: { title: string; viewing: string | null }[];
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

  /**
   * The same idea as `evidence`, reaching further, and as a value rather than a
   * string so that `assert.deepEqual` can name the field that moved.
   *
   * Two people who did the same things a millisecond apart differ in every
   * instant persistence assigned and in every reference it minted. Neither is
   * something either of them said, so comparing two histories means comparing
   * what is left once the machinery is blanked — which is exactly what the
   * pairs below are for.
   */
  const MACHINERY = ["createdAt", "updatedAt", "changedAt", "savedAt", "recordedAt", "saidAt", "at", "ref", "id"];
  const stamplessly = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value, (key, held: unknown) => (MACHINERY.includes(key) ? null : held)));

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

  test("a verdict and the film it is about are both visible, and distinct", async () => {
    const f = film();
    await said(ana, "create_movie", { title: f.title, year: f.year, viewing: "seen" });
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "disliked" } });

    const model = await taste();
    assert.equal(
      model.movies?.find((m) => m.title === f.title)?.viewing,
      "seen",
      "recording a verdict rewrote the film",
    );
    assert.equal((await about(f))[0]?.judgement, "disliked", "the verdict did not reach the answer");
  });

  test("taking the verdict back leaves the film exactly as it was", async () => {
    const f = film();
    await said(ana, "create_movie", { title: f.title, year: f.year, viewing: "seen" });
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "disliked" } });
    await said(ana, "withdraw_verdict", { film: f });

    assert.deepEqual(await about(f), [], "a withdrawn verdict still reached recommendation work");
    assert.equal(
      (await taste()).movies?.find((m) => m.title === f.title)?.viewing,
      "seen",
      "withdrawing a verdict changed the film",
    );
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
    await said(ana, "create_movie", { title: f.title, year: f.year, viewing: "seen" });
    await said(ana, "record_verdict", {
      film: f,
      told: "confirmed",
      said: { about: "rejection", reach: "not-tonight", occasion: "evening-1" },
    });
    const [one] = await about(f);
    assert.equal(one?.occasion, "evening-1", "the refusal lost the evening it belongs to");
    assert.equal(one?.judgement, undefined, "an evening's refusal became a judgement");
    // And the film still stands where it stood everywhere else.
    assert.equal((await taste()).movies?.find((m) => m.title === f.title)?.viewing, "seen");
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
    await said(ana, "create_movie", { title: other.title, year: other.year, viewing: "seen" });
    await said(ana, "record_verdict", {
      film: refused,
      told: "volunteered",
      said: { about: "rejection", reach: "not-ever", reason: "too bleak" },
    });
    assert.deepEqual(await about(other), [], "a refusal of one film reached another");
    assert.equal((await taste()).movies?.find((m) => m.title === other.title)?.viewing, "seen");
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
      await said(tools, "create_movie", { title: f.title, year: f.year, viewing: "seen" });
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

  test("asking about a film is a conversation, and there is nothing to write it with", async () => {
    // Tonight used to keep the questions it was carrying, and this test proved
    // that carrying one changed nothing about what recommendation work was
    // handed. It keeps none now: asking is something it does in the
    // conversation, and the conversation is where it stays. So the claim is
    // stronger and shaped differently — there is no call that would record an
    // asking, and a person Tonight asked about a film looks from here exactly
    // like a person it never asked, because from here they are the same person.
    const f = film();
    const asked = toolsFor("google:asked-about-it");
    const quiet = toolsFor("google:quiet-too");
    for (const tools of [asked, quiet]) {
      await said(tools, "create_movie", { title: f.title, year: f.year, viewing: "seen" });
    }
    // Everything Tonight can do around an asking: offer the film, and hear that
    // they watched it. Neither is an answer, and the asking itself has no call.
    const written = await said(asked, "record_episode", {
      request: "anything good",
      offered: [{ title: f.title, year: f.year, lead: true }],
    });
    await said(asked, "correct_episode", {
      episode: (written.episode as { id: string }).id,
      watched: true,
    });

    for (const absent of ["ask_about", "record_question", "open_question", "get_open_questions", "record_opportunity"]) {
      assert.equal(absent in asked, false, `${absent} exists, so an asking can be written down`);
    }
    assert.equal(
      evidence(await taste(asked)),
      evidence(await taste(quiet)),
      "having been asked about a film reached recommendation work",
    );
  });

  /* ------------------------------------------------- offering, and being told no */

  test("a suggestion Tonight makes and nobody takes up leaves the model untouched", async () => {
    // Tonight may notice that two films somebody loved are alike and say so.
    // Saying so is a sentence, and a sentence writes nothing — there is no call
    // that records having offered, so the person it was put to is
    // indistinguishable afterwards from the person it was never put to. That is
    // the whole of the guarantee: not that an unaccepted offer is inert, but
    // that there is no unaccepted offer anywhere to be inert.
    const offered = toolsFor("google:was-offered-something");
    const never = toolsFor("google:was-offered-nothing");
    const f = film();
    const other = film();
    for (const tools of [offered, never]) {
      await said(tools, "create_movie", { title: f.title, year: f.year, viewing: "seen" });
      await said(tools, "create_movie", { title: other.title, year: other.year, viewing: "seen" });
      await said(tools, "record_verdict", {
        film: f,
        told: "volunteered",
        said: { about: "judgement", judgement: "loved" },
      });
      await said(tools, "record_verdict", {
        film: other,
        told: "volunteered",
        said: { about: "judgement", judgement: "loved" },
      });
    }

    // Everything the conversation would have done: Tonight reads what it has,
    // sees the pattern, and puts it to them. Then they say no — which is to say,
    // they say nothing, and nothing happens.
    await said(offered, "get_taste");
    await said(offered, "get_memory");

    assert.deepEqual(
      stamplessly(await said(offered, "get_memory")),
      stamplessly(await said(never, "get_memory")),
      "being offered something changed what Tonight remembers",
    );
    assert.equal(
      evidence(await taste(offered)),
      evidence(await taste(never)),
      "being offered something changed what a recommendation reads",
    );
  });

  test("a suggestion they accept is written as an ordinary genre, with nothing to say it was one", async () => {
    // The other half, and the reason the first one is safe. A yes does not
    // promote anything or resolve anything: it is `create_genre`, the same call
    // somebody asking outright would have caused. So the Genre carries no trace
    // of having been Tonight's idea — no author, no accepted-at, no provenance
    // field of any kind — because a Genre the user agreed to is a Genre the user
    // has, and a field saying otherwise would be exactly the agent-authored
    // memory this product does not keep.
    const asked = toolsFor("google:asked-outright");
    const agreed = toolsFor("google:agreed-to-it");

    await said(asked, "create_genre", { name: "Quiet Dread", instruction: "something is wrong and nobody says it" });
    // Tonight suggested this one, and they said yes. Same call, same arguments.
    await said(agreed, "create_genre", { name: "Quiet Dread", instruction: "something is wrong and nobody says it" });

    const one = ((await said(asked, "get_taste")) as { genres: Record<string, unknown>[] }).genres[0]!;
    const two = ((await said(agreed, "get_taste")) as { genres: Record<string, unknown>[] }).genres[0]!;
    assert.deepEqual(
      stamplessly(one),
      stamplessly(two),
      "a genre somebody agreed to differs from one they asked for",
    );
    for (const provenance of ["author", "proposed", "acceptedAt", "suggestedBy", "source", "origin", "told"]) {
      assert.equal(provenance in two, false, `a genre carries ${provenance}, which would record whose idea it was`);
    }
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
    assert.match(text, /`verdicts` is what they have said about particular films/u);
    assert.match(text, /Only what currently stands is here/u);
    assert.match(text, /`not-tonight` is about\s+that evening/u);
    assert.match(text, /that film, not its genre, its director or anything resembling it/u);
    // A taking-back reaches as far as the verdict reached and no further. Said
    // both ways round, because each half is a mistake a reader actually makes:
    // that withdrawing a judgement leaves a weaker opinion somewhere, and that
    // withdrawing one evening's refusal clears the film. And it does not unsay
    // anything — "they have said nothing" is false about somebody who spoke and
    // then withdrew.
    assert.match(text, /\*\*A taking-back reaches exactly as far as the verdict it takes back\*\*/u);
    assert.match(text, /withdrawing a judgement leaves no current judgement about that film/u);
    assert.match(
      text,
      /withdrawing an evening's `not-tonight` removes only that evening's refusal/u,
      "a scoped withdrawal is described as clearing the film",
    );
    assert.match(text, /leaves whatever they said about the film in general standing where it was/u);
    assert.match(text, /They did say it, and `get_memory` still remembers that they did/u);
    assert.doesNotMatch(text, /state in movies/u, "the payload still promises a Movie opinion");
    assert.doesNotMatch(
      text,
      /they have said nothing about that film/u,
      "a withdrawal is described as never having spoken",
    );
    assert.match(text, /not that you recommended it, not that they watched or\s+finished it/u);
    // Still excluded, and now said in a way that does not imply there is a
    // place such a question waits: there is not.
    assert.match(text, /not anything you asked them and heard no answer to/u);
    assert.match(text, /which is nowhere in\s+Tonight to begin with/u);
    assert.match(text, /neither is a number/u);

    // M4: what is here is theirs; the pattern across it is the agent's. Six of
    // six behavioural runs stated a read of four verdicts as the user's own
    // taste — "you clearly love quiet, patient films" — and this read is where
    // those four verdicts are in hand.
    assert.match(text, /\*\*What you find here is theirs; what you make of it is yours\.\*\*/u);
    assert.match(text, /the line-up\s+is your reading and has to sound like one/u);
    assert.match(text, /never \*"you love quiet films"\* or \*"your taste is X"\*/u);
    assert.match(text, /One verdict is one film and never a register, a style or a kind/u);
    // And no reason where none was given.
    assert.match(
      text,
      /where\s+`because` is absent they gave no reason/u,
      "the read does not say that an absent reason is not one to be supplied",
    );

    // And the offer rule, here rather than only in the skill: the sentence that
    // breaks it is written at the end of an answer, and this is the read the
    // model has in hand when it writes that sentence.
    //
    // It used to say the offer had to be recorded before it was made. Nothing
    // records one now, so the rule says what actually holds — the yes writes,
    // immediately, and an offer nobody takes up leaves nothing behind.
    assert.match(text, /their yes is what writes it — and it\s+writes it there and then/u);
    assert.match(text, /answered with\s+`create_genre` and nothing else/u);
    assert.match(text, /offer only what you would write on the spot/u);
    assert.doesNotMatch(text, /propose_change|a proposal that already exists/u, "it still names a tool that is gone");
    // Noticing aloud stays free — this must not read as "always ask".
    assert.match(text, /Saying what you noticed and asking nothing is free/u);
  });
});
