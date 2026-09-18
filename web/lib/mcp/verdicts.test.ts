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
 * The verdict tools, held to the boundary they exist to keep.
 *
 * A tool layer is where an ownership model is most easily undone: one convenient
 * default and a film somebody watched becomes a film they liked. So these
 * contracts are mostly about what a call does *not* establish — and about the
 * descriptions, because a description is what a model reads before it decides
 * what to send.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

type Tool = {
  description?: string;
  inputSchema?: unknown;
  handler: (args: Record<string, unknown>) => Promise<{
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  }>;
};

const DAY = 86_400_000;

describe("the verdict tools", () => {
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

  const call = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) =>
    tools[name]!.handler(args);
  const said = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) => {
    const result = await call(tools, name, args);
    assert.equal(result.isError, undefined, `${name} refused: ${JSON.stringify(result.structuredContent)}`);
    return result.structuredContent as Record<string, never>;
  };

  let next = 0;
  const film = () => ({ title: `Subject ${String(++next)}`, year: 2013 });

  const standing = async (tools: Record<string, Tool>, f: object, occasion?: string) =>
    (await said(tools, "get_verdicts", { film: f, ...(occasion ? { occasion } : {}) })) as unknown as {
      current: { assertion?: { about: string; judgement?: string; because?: string | null } } | null;
      history: { said: string }[];
      superseded: unknown[];
    };

  /* ------------------------------------------------------- stating a verdict */

  test("1. a judgement they gave is recorded as theirs", async () => {
    const f = film();
    const out = (await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "judgement", judgement: "loved" },
    })) as unknown as { verdict: { claimant: string; film: object; scope: string } };
    assert.equal(out.verdict.claimant, "user");
    assert.deepEqual(out.verdict.film, f);
    const read = await standing(ana, f);
    assert.equal(read.current?.assertion?.judgement, "loved");
  });

  test("2. their own words for why survive the tool", async () => {
    const f = film();
    await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "judgement", judgement: "loved", because: "the tension never lets up" },
    });
    assert.equal((await standing(ana, f)).current?.assertion?.because, "the tension never lets up");
  });

  test("2b. no explanation stays explicitly absent", async () => {
    const f = film();
    await said(ana, "record_verdict", {
      film: f,
      told: "confirmed",
      said: { about: "judgement", judgement: "liked" },
    });
    assert.equal((await standing(ana, f)).current?.assertion?.because, null);
  });

  test("3. a rejection is recorded as a rejection", async () => {
    const f = film();
    await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "rejection", reach: "not-ever", reason: "three hours of misery" },
    });
    const read = await standing(ana, f);
    assert.equal(read.current?.assertion?.about, "rejection");
    assert.equal(read.current?.assertion?.judgement, undefined, "a rejection came back as a judgement");
  });

  test("4. not-tonight without an evening is refused", async () => {
    const f = film();
    const refused = await call(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "rejection", reach: "not-tonight", reason: "too long" },
    });
    assert.equal(refused.isError, true, "a not-tonight refusal was accepted as a global claim");
    assert.deepEqual((await standing(ana, f)).history, [], "a refused call was written anyway");
  });

  test("4b. not-tonight with an evening stands only there", async () => {
    const f = film();
    await said(ana, "record_verdict", {
      film: f,
      told: "confirmed",
      said: { about: "rejection", reach: "not-tonight", reason: "too long", occasion: "evening-1" },
    });
    assert.equal((await standing(ana, f)).current, null, "an evening's refusal became global");
    assert.equal((await standing(ana, f, "evening-1")).current?.assertion?.about, "rejection");
  });

  test("5. not-ever with an evening is refused; it is about the film", async () => {
    const f = film();
    const refused = await call(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "rejection", reach: "not-ever", occasion: "evening-1" },
    });
    assert.equal(refused.isError, true, "a not-ever refusal was scoped to one evening");
  });

  test("6. volunteered and confirmed are kept apart", async () => {
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    const read = await standing(ana, f);
    assert.equal((read.current as unknown as { told: string }).told, "volunteered");

    const g = film();
    await said(ana, "record_verdict", { film: g, told: "confirmed", said: { about: "judgement", judgement: "loved" } });
    assert.equal((((await standing(ana, g)).current) as unknown as { told: string }).told, "confirmed");
  });

  /* ---------------------------------------------- correcting and withdrawing */

  test("7. a correction appends; the old claim stays in the history", async () => {
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    await said(ana, "record_verdict", { film: f, told: "confirmed", said: { about: "judgement", judgement: "liked" } });
    const read = await standing(ana, f);
    assert.equal(read.current?.assertion?.judgement, "liked");
    assert.equal(read.history.length, 2, "the first claim was rewritten instead of superseded");
    assert.equal(read.superseded.length, 1, "nothing recorded what displaced the first claim");
  });

  test("8. a withdrawal leaves no claim, and is not a dislike", async () => {
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    await said(ana, "withdraw_verdict", { film: f });
    const read = await standing(ana, f);
    assert.equal(read.current, null, "a withdrawal left something standing");
    assert.equal(read.history.length, 2, "the withdrawal erased the history instead of following it");
    assert.equal(
      read.history.some((act) => (act as unknown as { assertion?: { judgement?: string } }).assertion?.judgement === "disliked"),
      false,
      "a withdrawal was written as a dislike",
    );
  });

  test("8b. withdrawing an evening restores what applied before it", async () => {
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    await said(ana, "record_verdict", {
      film: f,
      told: "confirmed",
      said: { about: "rejection", reach: "not-tonight", occasion: "evening-2" },
    });
    await said(ana, "withdraw_verdict", { film: f, occasion: "evening-2" });
    assert.equal((await standing(ana, f, "evening-2")).current?.assertion?.judgement, "loved");
    assert.equal((await standing(ana, f)).current?.assertion?.judgement, "loved");
  });

  test("7b. a correction made in the same millisecond still takes", async () => {
    // Two tool calls can land inside one millisecond, and the server stamps both
    // with it. What settles the tie is the order the store accepted them in —
    // so the second thing they said wins, which is what a correction means.
    //
    // Forced rather than raced: the two rows are pushed onto one instant after
    // the fact, so this asserts the rule every time rather than whenever the
    // clock happens to collide.
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    await said(ana, "record_verdict", { film: f, told: "confirmed", said: { about: "judgement", judgement: "liked" } });
    await driver.query("UPDATE tonight_verdict_acts SET said_at = $2 WHERE title = $1", [
      f.title,
      "2026-01-01T20:00:00.000Z",
    ]);
    const read = await standing(ana, f);
    assert.equal(read.current?.assertion?.judgement, "liked", "the later correction was lost");
    assert.equal(read.history.length, 2);
  });

  test("7c. a withdrawal made in the same millisecond still takes", async () => {
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    await said(ana, "withdraw_verdict", { film: f });
    await driver.query("UPDATE tonight_verdict_acts SET said_at = $2 WHERE title = $1", [
      f.title,
      "2026-01-01T20:00:00.000Z",
    ]);
    assert.equal((await standing(ana, f)).current, null, "a same-instant withdrawal did not take");
  });

  /* -------------------------------------------------------- open questions */

  test("9. open questions can be looked at", async () => {
    const f = film();
    await sqlQuestionStore(driver, asUser("google:ana")).open(askAbout(f, new Date().toISOString()));
    const out = (await said(ana, "get_open_questions")) as unknown as { questions: { film: object }[] };
    assert.equal(out.questions.some((q) => JSON.stringify(q.film) === JSON.stringify(f)), true);
  });

  test("10. looking at them costs nothing", async () => {
    const f = film();
    const store = sqlQuestionStore(driver, asUser("google:ana"));
    await store.open(askAbout(f, new Date().toISOString()));
    for (let read = 0; read < 5; read += 1) await said(ana, "get_open_questions");
    const mine = (await store.pending(new Date().toISOString())).find((q) => q.film.title === f.title);
    assert.equal(mine?.opportunities, 0, "reading the open questions aged one");
  });

  test("11. a stated chance ages only the film it names", async () => {
    const one = film();
    const two = film();
    const store = sqlQuestionStore(driver, asUser("google:ana"));
    const at = new Date().toISOString();
    await store.open(askAbout(one, at));
    await store.open(askAbout(two, at));
    await said(ana, "record_opportunity", { film: one });
    const pending = await store.pending(at);
    assert.equal(pending.find((q) => q.film.title === one.title)?.opportunities, 1);
    assert.equal(pending.find((q) => q.film.title === two.title)?.opportunities, 0, "another film was aged");
  });

  test("11b. a stated chance ages only the user who stated it", async () => {
    const f = film();
    const at = new Date().toISOString();
    await sqlQuestionStore(driver, asUser("google:ana")).open(askAbout(f, at));
    const out = (await said(ben, "record_opportunity", { film: f })) as unknown as { question: unknown };
    assert.equal(out.question, null, "a stranger's chance reached her question");
    const mine = (await sqlQuestionStore(driver, asUser("google:ana")).pending(at)).find(
      (q) => q.film.title === f.title,
    );
    assert.equal(mine?.opportunities, 0);
  });

  test("12. the third chance retires the question", async () => {
    const f = film();
    const store = sqlQuestionStore(driver, asUser("google:ana"));
    const at = new Date().toISOString();
    await store.open(askAbout(f, at));
    await said(ana, "record_opportunity", { film: f });
    await said(ana, "record_opportunity", { film: f });
    assert.equal((await store.pending(at)).some((q) => q.film.title === f.title), true, "it retired early");
    const out = (await said(ana, "record_opportunity", { film: f })) as unknown as { question: unknown };
    assert.equal(out.question, null);
    assert.equal((await store.pending(at)).some((q) => q.film.title === f.title), false);
  });

  test("13. a question older than thirty days is no longer open", async () => {
    const f = film();
    const long = new Date(Date.now() - 31 * DAY).toISOString();
    await sqlQuestionStore(driver, asUser("google:ana")).open(askAbout(f, long));
    const out = (await said(ana, "get_open_questions")) as unknown as { questions: { film: { title: string } }[] };
    assert.equal(out.questions.some((q) => q.film.title === f.title), false, "it outlived its thirty days");

    const fresh = film();
    await sqlQuestionStore(driver, asUser("google:ana")).open(askAbout(fresh, new Date(Date.now() - 29 * DAY).toISOString()));
    const still = (await said(ana, "get_open_questions")) as unknown as { questions: { film: { title: string } }[] };
    assert.equal(still.questions.some((q) => q.film.title === fresh.title), true, "it retired a day early");
  });

  test("14. recording what they said closes the question that was waiting", async () => {
    const f = film();
    const store = sqlQuestionStore(driver, asUser("google:ana"));
    const at = new Date().toISOString();
    await store.open(askAbout(f, at));
    await said(ana, "record_verdict", { film: f, told: "confirmed", said: { about: "judgement", judgement: "loved" } });
    assert.equal((await store.pending(at)).some((q) => q.film.title === f.title), false, "the question stayed open");
    assert.equal((await standing(ana, f)).current?.assertion?.judgement, "loved", "the verdict was lost while tidying");
  });

  test("15. a question that runs out produces no claim of any kind", async () => {
    const f = film();
    const store = sqlQuestionStore(driver, asUser("google:ana"));
    await store.open(askAbout(f, new Date().toISOString()));
    for (let each = 0; each < 3; each += 1) await said(ana, "record_opportunity", { film: f });
    const read = await standing(ana, f);
    assert.deepEqual(read.history, [], "retiring wrote a claim");
    assert.equal(read.current, null);
  });

  test("15b. a question that runs out of time produces no claim either", async () => {
    const f = film();
    await sqlQuestionStore(driver, asUser("google:ana")).open(askAbout(f, new Date(Date.now() - 40 * DAY).toISOString()));
    await said(ana, "get_open_questions");
    assert.deepEqual((await standing(ana, f)).history, [], "the clock wrote a claim");
  });

  /* ------------------------------------------------------------- identity */

  test("16. no tool takes a user", () => {
    for (const name of ["record_verdict", "withdraw_verdict", "get_verdicts", "get_open_questions", "record_opportunity"]) {
      const shape = JSON.stringify(ana[name]?.inputSchema ?? {});
      for (const forbidden of ["user_id", "userId", '"user"', "claimant"]) {
        assert.equal(shape.includes(forbidden), false, `${name} accepts ${forbidden}`);
      }
    }
  });

  test("17. one user's verdicts are invisible and untouchable to another", async () => {
    const f = film();
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    assert.deepEqual((await standing(ben, f)).history, [], "another user's claims were readable");

    await said(ben, "withdraw_verdict", { film: f });
    assert.equal((await standing(ana, f)).current?.assertion?.judgement, "loved", "a stranger withdrew her claim");
    assert.equal((await standing(ben, f)).current, null);
  });

  /* ---------------------------------------------- the boundaries that hold */

  test("18. an episode establishes no verdict, however it ends", async () => {
    const f = film();
    await said(ana, "record_episode", {
      request: "something tense tonight",
      offered: [{ title: f.title, year: f.year, lead: true }],
    });
    const episodes = (await said(ana, "get_episodes")) as unknown as { episodes: { id: string }[] };
    const id = episodes.episodes[episodes.episodes.length - 1]!.id;
    await said(ana, "correct_episode", { episode: id, chosen: { title: f.title, year: f.year } });
    await said(ana, "correct_episode", { episode: id, watched: true });
    await said(ana, "correct_episode", { episode: id, finished: true });

    assert.deepEqual((await standing(ana, f)).history, [], "finishing a film wrote a verdict");
    assert.equal((await standing(ana, f)).current, null);
  });

  test("19. recording a verdict changes nothing in the taste model", async () => {
    const f = film();
    const before = (await said(ana, "get_taste")) as unknown;
    await said(ana, "record_verdict", { film: f, told: "volunteered", said: { about: "judgement", judgement: "loved" } });
    await said(ana, "withdraw_verdict", { film: f });
    const after = (await said(ana, "get_taste")) as unknown;
    assert.equal(JSON.stringify(before), JSON.stringify(after), "a verdict moved the taste model");
  });

  test("20. nothing here reaches outwards or runs on its own", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("server.ts", import.meta.url), "utf8"),
    );
    const code = source.replace(/\/\*\*[\s\S]*?\*\//gu, "").replace(/^[ \t]*\/\/.*$/gmu, "");
    for (const outbound of ["setTimeout", "setInterval", "cron", "sendMessage", "notify(", "fetch("]) {
      assert.equal(code.includes(outbound), false, `the tool surface introduced ${outbound}`);
    }
    // And no tool volunteers to start anything.
    const names = Object.keys(ana);
    for (const absent of ["ask_about", "remind", "follow_up", "check_in", "schedule_question"]) {
      assert.equal(names.includes(absent), false, `${absent} appeared`);
    }
  });

  test("the surface is the five tools this slice approved, and no generic mutation", () => {
    const mine = Object.keys(ana).filter((name) => /verdict|question|opportunit/.test(name)).sort();
    assert.deepEqual(mine, [
      "get_open_questions",
      "get_verdicts",
      "record_opportunity",
      "record_verdict",
      "withdraw_verdict",
    ]);
    for (const generic of ["update_verdict", "set_verdict", "upsert_verdict", "delete_verdict", "patch_verdict"]) {
      assert.equal(generic in ana, false, `${generic} appeared`);
    }
  });

  test("the descriptions carry the rules a model has to read", () => {
    const text = ["record_verdict", "withdraw_verdict", "get_verdicts", "get_open_questions", "record_opportunity"]
      .map((name) => ana[name]?.description ?? "")
      .join("\n");

    // Only what they said, and the chain that must not be closed for them.
    assert.match(text, /watching a film is not liking it/u);
    assert.match(text, /finishing one is not liking it/u);
    assert.match(text, /Silence is not a verdict/u);
    // Scope.
    assert.match(text, /`not-tonight` is about one evening/u);
    assert.match(text, /`not-ever` is about the film and also applies\s+everywhere/u);
    // Withdrawal.
    assert.match(text, /not a neutral one, and certainly not a dislike/u);
    // Questions are not taste, and never a reason to appear.
    assert.match(text, /says nothing about whether they liked it/u);
    assert.match(text, /never a reason to start a conversation/u);
    assert.match(text, /Tonight does not get in\s+touch on its own/u);
    // Correction appends.
    assert.match(text, /supersedes the old one and the old one\s+stays in the history/u);

    // And no later milestone leaks into what a model is told today.
    for (const later of ["confidence", "proposal", "observation", "situation", "companion", "relevance"]) {
      assert.equal(new RegExp(`\\b${later}`, "iu").test(text), false, `${later} appears in a verdict tool description`);
    }
  });
});
