import assert from "node:assert/strict";
import test, { after, before, beforeEach, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import type { AuthenticatedUser } from "../identity.ts";
import {
  current,
  stateVerdict,
  supersession,
  VerdictError,
  type Act,
  type Film,
} from "./model.ts";
import { askAbout, type Question, type QuestionStore } from "./questions.ts";
import { QUESTIONS_SCHEMA, sqlQuestionStore } from "./questions/sql.ts";
import { sqlVerdictStore, VERDICTS_SCHEMA } from "./store/sql.ts";
import type { VerdictStore } from "./store.ts";

/**
 * The open-question record, held to the one thing it must never become.
 *
 * A pending question is the only thing M2 writes without being told to, and its
 * whole value depends on being worth nothing: it is a note that Tonight has
 * something to ask, not a soft opinion, not evidence, and not an answer that has
 * not arrived yet. So most of these contracts are about what it cannot do —
 * reach a verdict history, survive as an assumption, mean something by being
 * old, or leak between users and films.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;
const SINCE = "2026-01-01T20:00:00.000Z";

describe("an open verdict question", () => {
  let driver: SqlDriver;
  let ana: QuestionStore;
  let ben: QuestionStore;
  let herVerdicts: VerdictStore;

  before(async () => {
    driver = await embeddedDriver();
    await migrate(driver, QUESTIONS_SCHEMA);
    await migrate(driver, VERDICTS_SCHEMA);
    ana = sqlQuestionStore(driver, asUser("google:ana"));
    ben = sqlQuestionStore(driver, asUser("google:ben"));
    herVerdicts = sqlVerdictStore(driver, asUser("google:ana"));
  });

  after(async () => {
    await driver.close();
  });

  // Each test starts from an empty slate, through the public surface — so the
  // clearing is itself exercised, and one test cannot pass on another's rows.
  beforeEach(async () => {
    for (const store of [ana, ben]) {
      for (const question of await store.pending()) await store.close(question.film);
    }
  });

  let next = 0;
  const film = (): Film => ({ title: `Subject ${String(++next)}`, year: 2013 });

  /* -------------------------------------------------- what it is, and is not */

  test("a question records the film and when it arose, and nothing else", () => {
    const f = film();
    const question = askAbout(f, SINCE);
    assert.deepEqual(Object.keys(question).sort(), ["film", "since"]);
    assert.deepEqual(question.film, f);
    assert.equal(question.since, SINCE);
  });

  test("a question has nowhere to hold an answer, a guess or a weight", () => {
    const question = askAbout(film(), SINCE);
    for (const meaning of [
      "answer", "judgement", "verdict", "liked", "disliked",
      "confidence", "weight", "relevance", "score", "asked", "attempts", "status",
    ]) {
      assert.equal(meaning in question, false, `${meaning} appeared on an open question`);
    }
  });

  test("a question is not an act, and the verdict history refuses it", async () => {
    // The structural half of the separation: it has no `said`, so the model's
    // act check rejects it rather than reading it as a claim of some kind.
    const question = askAbout(film(), SINCE);
    assert.throws(() => current([question as unknown as Act]), VerdictError);
    assert.throws(() => supersession([question as unknown as Act]), VerdictError);
    await assert.rejects(() => herVerdicts.say(question as unknown as Act), VerdictError);
  });

  test("an open question never appears in a verdict history", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    assert.deepEqual(await herVerdicts.history(f), [], "a question reached the verdict history");
    assert.equal(current(await herVerdicts.history(f)), null);
  });

  /* ------------------------------------------------------------- lifecycle */

  test("opening a question makes it pending, and reading it changes nothing", async () => {
    const f = film();
    const opened = await ana.open(askAbout(f, SINCE));
    assert.deepEqual(opened, { film: f, since: SINCE });
    assert.deepEqual(await ana.pending(), [opened]);
    assert.deepEqual(await ana.pending(), [opened], "reading the question altered it");
  });

  test("asking twice about one film is one question, with the instant it first arose", async () => {
    const f = film();
    const first = await ana.open(askAbout(f, SINCE));
    const again = await ana.open(askAbout(f, "2026-06-01T20:00:00.000Z"));
    assert.equal(again.since, SINCE, "re-opening reset the clock and made an old question look new");
    assert.deepEqual(await ana.pending(), [first]);
  });

  test("an unanswered question stays exactly as unanswered as it was", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    for (let read = 0; read < 3; read += 1) {
      const [still] = await ana.pending();
      assert.deepEqual(still, { film: f, since: SINCE });
    }
    // And it has still produced no claim of any kind.
    assert.equal(current(await herVerdicts.history(f)), null);
  });

  test("closing removes the question and nothing else", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    await ana.close(f);
    assert.deepEqual(await ana.pending(), []);
    assert.equal(current(await herVerdicts.history(f)), null, "closing a question made a claim");
  });

  test("closing a question that was never open is not an error", async () => {
    await ana.close(film());
    assert.deepEqual(await ana.pending(), []);
  });

  test("a real verdict is recorded separately, and closing does not create it", async () => {
    // Resolution, as far as this slice goes: the claim goes through the verdict
    // store, the note is closed, and neither step does the other's work.
    const f = film();
    await ana.open(askAbout(f, SINCE));
    const said = stateVerdict(f, { about: "judgement", judgement: "loved", because: null }, "confirmed", "2026-02-01T20:00:00.000Z");
    await herVerdicts.say(said);
    await ana.close(f);

    assert.deepEqual(await ana.pending(), []);
    assert.deepEqual(current(await herVerdicts.history(f)), said);
    // Closing again must not disturb the claim that now exists.
    await ana.close(f);
    assert.deepEqual(current(await herVerdicts.history(f)), said, "closing a question changed a verdict");
  });

  test("closing one film's question leaves another's alone", async () => {
    const one = film();
    const two = film();
    await ana.open(askAbout(one, SINCE));
    await ana.open(askAbout(two, "2026-02-01T20:00:00.000Z"));
    await ana.close(one);
    const left = await ana.pending();
    assert.equal(left.length, 1, "closing one film reached another");
    assert.deepEqual(left[0]?.film, two);
  });

  test("several films may be waiting at once", async () => {
    // The plan sets no one-at-a-time rule, so neither does this.
    const films = [film(), film(), film()];
    for (const [at, f] of films.entries()) {
      await ana.open(askAbout(f, `2026-0${String(at + 1)}-01T20:00:00.000Z`));
    }
    const waiting = await ana.pending();
    assert.equal(waiting.length, 3);
    assert.deepEqual(waiting.map((q) => q.film), films, "the order questions arose in was lost");
  });

  /* ------------------------------------------------------------- isolation */

  test("one user's open questions are invisible to another", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    assert.deepEqual(await ben.pending(), [], "another user's question was readable");
  });

  test("one user cannot close another's question", async () => {
    const f = film();
    const hers = await ana.open(askAbout(f, SINCE));
    await ben.close(f);
    assert.deepEqual(await ana.pending(), [hers], "a stranger's close reached her question");
  });

  test("the same film waiting for two users stays two questions", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    await ben.open(askAbout(f, "2026-03-01T20:00:00.000Z"));
    assert.equal((await ana.pending())[0]?.since, SINCE);
    assert.equal((await ben.pending())[0]?.since, "2026-03-01T20:00:00.000Z");
    await ana.close(f);
    assert.equal((await ben.pending()).length, 1, "her close reached his question");
  });

  /* ------------------------------------------------------- the boundaries */

  test("a malformed question is refused rather than written", async () => {
    for (const notAFilm of [null, { title: "", year: 2013 }, { title: "x", year: 2013.5 }, "Prisoners"]) {
      assert.throws(() => askAbout(notAFilm, SINCE), VerdictError);
    }
    for (const notATime of [null, "whenever", "2026-01-01", 20260101]) {
      assert.throws(() => askAbout(film(), notATime), VerdictError);
    }
    await assert.rejects(
      () => ana.open({ film: { title: "", year: 2013 }, since: SINCE } as Question),
      VerdictError,
    );
    await assert.rejects(() => ana.close({ title: "", year: 2013 } as Film), VerdictError);
  });

  test("an instant is canonicalised here as it is everywhere else", async () => {
    const f = film();
    const opened = await ana.open(askAbout(f, "2026-01-01T21:00:00+01:00"));
    assert.equal(opened.since, "2026-01-01T20:00:00.000Z");
    assert.equal((await ana.pending())[0]?.since, "2026-01-01T20:00:00.000Z");
  });

  test("nothing here reaches taste, episodes, or the outside world", async () => {
    const files = ["questions.ts", "questions/sql.ts", "questions/schema.ts"];
    for (const file of files) {
      const source = await import("node:fs").then((fs) =>
        fs.readFileSync(new URL(file, import.meta.url), "utf8"),
      );
      const code = source.replace(/\/\*\*[\s\S]*?\*\//gu, "").replace(/^[ \t]*\/\/.*$/gmu, "");
      for (const elsewhere of ["../episodes/", "../taste/", "tonight_episodes", "tonight_movies", "tonight_genres"]) {
        assert.equal(code.includes(elsewhere), false, `${file} reached ${elsewhere}`);
      }
      // No outbound anything. Asking happens inside a conversation the user
      // started, and deciding to appear is a later milestone's capability.
      for (const outbound of ["fetch(", "setTimeout", "setInterval", "cron", "notify", "sendMessage", "schedule"]) {
        assert.equal(code.includes(outbound), false, `${file} introduced ${outbound}`);
      }
    }
  });

  test("the store offers nothing beyond opening, reading and closing", () => {
    assert.deepEqual(Object.keys(ana).sort(), ["close", "open", "pending"]);
    for (const absent of ["answer", "resolve", "expire", "remind", "ask", "notify", "update"]) {
      assert.equal(absent in ana, false, `${absent} appeared on the question store`);
    }
  });

  test("the table holds no answer, and no place to put one", async () => {
    const columns = await driver.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tonight_verdict_questions'`,
    );
    assert.deepEqual(
      columns.map((c) => c.column_name).sort(),
      ["id", "since", "title", "user_id", "year"],
      "the question table grew a column that could hold a meaning",
    );
  });
});
