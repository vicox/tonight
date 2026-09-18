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
import {
  askAbout,
  MAX_OPPORTUNITIES,
  MAX_PENDING_DAYS,
  retired,
  type Question,
  type QuestionStore,
} from "./questions.ts";
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

/**
 * A claim without the place persistence gave it.
 *
 * The store assigns a write order on the way in, so an act read back carries one
 * and an act built in a test does not. What these contracts are about is the
 * claim, so the order is set aside rather than asserted here — `store.test.ts`
 * is where it is held to account.
 */
const claim = (act: unknown): unknown => {
  if (act === null || typeof act !== "object") return act;
  const { order, ...rest } = act as Record<string, unknown>;
  void order;
  return rest;
};
const SINCE = "2026-01-01T20:00:00.000Z";
/** A day after `SINCE`: near enough that nothing retires by time unless a test says so. */
const NOW = "2026-01-02T20:00:00.000Z";
const daysAfter = (days: number, from = SINCE): string =>
  new Date(Date.parse(from) + days * 86_400_000).toISOString();

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
      for (const question of await store.pending(NOW)) await store.close(question.film);
    }
  });

  let next = 0;
  const film = (): Film => ({ title: `Subject ${String(++next)}`, year: 2013 });

  /* -------------------------------------------------- what it is, and is not */

  test("a question records the film and when it arose, and nothing else", () => {
    const f = film();
    const question = askAbout(f, SINCE);
    assert.deepEqual(Object.keys(question).sort(), ["film", "opportunities", "since"]);
    assert.deepEqual(question.film, f);
    assert.equal(question.since, SINCE);
    assert.equal(question.opportunities, 0, "a new question started part-way through its life");
  });

  test("a question has nowhere to hold an answer, a guess or a weight", () => {
    const question = askAbout(film(), SINCE);
    for (const meaning of [
      "answer", "judgement", "verdict", "liked", "disliked",
      "confidence", "weight", "relevance", "score", "status", "expired", "conclusion",
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
    assert.deepEqual(opened, { film: f, since: SINCE, opportunities: 0 });
    assert.deepEqual(await ana.pending(NOW), [opened]);
    assert.deepEqual(await ana.pending(NOW), [opened], "reading the question altered it");
  });

  test("asking twice about one film is one question, with the instant it first arose", async () => {
    const f = film();
    const first = await ana.open(askAbout(f, SINCE));
    const again = await ana.open(askAbout(f, "2026-06-01T20:00:00.000Z"));
    assert.equal(again.since, SINCE, "re-opening reset the clock and made an old question look new");
    assert.deepEqual(await ana.pending(NOW), [first]);
  });

  test("an unanswered question stays exactly as unanswered as it was", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    for (let read = 0; read < 3; read += 1) {
      const [still] = await ana.pending(NOW);
      assert.deepEqual(still, { film: f, since: SINCE, opportunities: 0 });
    }
    // And it has still produced no claim of any kind.
    assert.equal(current(await herVerdicts.history(f)), null);
  });

  test("closing removes the question and nothing else", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    await ana.close(f);
    assert.deepEqual(await ana.pending(NOW), []);
    assert.equal(current(await herVerdicts.history(f)), null, "closing a question made a claim");
  });

  test("closing a question that was never open is not an error", async () => {
    await ana.close(film());
    assert.deepEqual(await ana.pending(NOW), []);
  });

  test("a real verdict is recorded separately, and closing does not create it", async () => {
    // Resolution, as far as this slice goes: the claim goes through the verdict
    // store, the note is closed, and neither step does the other's work.
    const f = film();
    await ana.open(askAbout(f, SINCE));
    const said = stateVerdict(f, { about: "judgement", judgement: "loved", because: null }, "confirmed", "2026-02-01T20:00:00.000Z");
    await herVerdicts.say(said);
    await ana.close(f);

    assert.deepEqual(await ana.pending(NOW), []);
    assert.deepEqual(claim(current(await herVerdicts.history(f))), said);
    // Closing again must not disturb the claim that now exists.
    await ana.close(f);
    assert.deepEqual(claim(current(await herVerdicts.history(f))), said, "closing a question changed a verdict");
  });

  test("closing one film's question leaves another's alone", async () => {
    const one = film();
    const two = film();
    await ana.open(askAbout(one, SINCE));
    await ana.open(askAbout(two, "2026-02-01T20:00:00.000Z"));
    await ana.close(one);
    const left = await ana.pending(NOW);
    assert.equal(left.length, 1, "closing one film reached another");
    assert.deepEqual(left[0]?.film, two);
  });

  test("several films may be waiting at once", async () => {
    // The plan sets no one-at-a-time rule, so neither does this.
    const films = [film(), film(), film()];
    for (const [at, f] of films.entries()) {
      await ana.open(askAbout(f, `2026-0${String(at + 1)}-01T20:00:00.000Z`));
    }
    const waiting = await ana.pending(NOW);
    assert.equal(waiting.length, 3);
    assert.deepEqual(waiting.map((q) => q.film), films, "the order questions arose in was lost");
  });

  /* --------------------------------------------------- retiring a question */

  test("the first two chances that go by leave the question standing", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    assert.equal((await ana.opportunity(f, NOW))?.opportunities, 1);
    assert.equal((await ana.opportunity(f, NOW))?.opportunities, 2);
    assert.equal((await ana.pending(NOW)).length, 1, "a question retired before its third chance");
  });

  test("the third chance retires it", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    await ana.opportunity(f, NOW);
    await ana.opportunity(f, NOW);
    assert.equal(await ana.opportunity(f, NOW), null, "the third chance did not retire it");
    assert.deepEqual(await ana.pending(NOW), []);
    // And the row is gone, not merely filtered: this one was a deliberate write.
    const rows = await driver.query("SELECT 1 FROM tonight_verdict_questions WHERE title = $1", [f.title]);
    assert.equal(rows.length, 0);
  });

  test("twenty-nine days is still pending, thirty is not", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    assert.equal((await ana.pending(daysAfter(29))).length, 1, "it retired a day early");
    assert.equal((await ana.pending(daysAfter(30))).length, 0, "it outlived its thirty days");
    // A day short of the limit and a day past it, from the same stored question.
    assert.equal((await ana.pending(daysAfter(29.99))).length, 1);
    assert.equal((await ana.pending(daysAfter(31))).length, 0);
  });

  test("whichever limit comes first is the one that ends it", async () => {
    // Out of chances long before the thirty days.
    const chances = film();
    await ana.open(askAbout(chances, SINCE));
    for (let each = 0; each < 3; each += 1) await ana.opportunity(chances, daysAfter(1));
    assert.equal((await ana.pending(daysAfter(2))).length, 0, "chances ran out and it stayed");

    // Out of time long before the three chances.
    const time = film();
    await ana.open(askAbout(time, SINCE));
    await ana.opportunity(time, daysAfter(1));
    assert.equal((await ana.pending(daysAfter(31))).length, 0, "time ran out and it stayed");
  });

  test("a chance that arrives after the time limit retires rather than counts", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    assert.equal(await ana.opportunity(f, daysAfter(31)), null);
    assert.deepEqual(await ana.pending(daysAfter(31)), []);
  });

  test("reopening resets neither the age nor the chances that went by", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    await ana.opportunity(f, NOW);
    await ana.opportunity(f, NOW);
    // Asked about again, much later, as if it were new.
    const again = await ana.open(askAbout(f, daysAfter(20)));
    assert.equal(again.since, SINCE, "reopening reset the age");
    assert.equal(again.opportunities, 2, "reopening reset the chances");
    assert.equal(await ana.opportunity(f, NOW), null, "the third chance no longer ended it");
  });

  test("reading never costs a chance", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    for (let read = 0; read < 5; read += 1) await ana.pending(NOW);
    const [still] = await ana.pending(NOW);
    assert.equal(still?.opportunities, 0, "a read aged the question");
  });

  test("a chance about one film does not age another", async () => {
    const one = film();
    const two = film();
    await ana.open(askAbout(one, SINCE));
    await ana.open(askAbout(two, SINCE));
    await ana.opportunity(one, NOW);
    await ana.opportunity(one, NOW);
    const waiting = await ana.pending(NOW);
    assert.equal(waiting.find((q) => q.film.title === two.title)?.opportunities, 0, "another film was aged");
  });

  test("another user's activity cannot age this question, or even see it", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    for (let each = 0; each < 5; each += 1) {
      // Ben has no question about this film, so there is nothing of his to age —
      // and the answer must say so rather than hand back hers. Checking only her
      // state afterwards would miss a read that found her row and reported it.
      assert.equal(await ben.opportunity(f, NOW), null, "a stranger's chance reached her question");
    }
    const [still] = await ana.pending(NOW);
    assert.equal(still?.opportunities, 0, "a stranger's interaction aged her question");
  });

  test("a chance about a film nobody is waiting on is not an error", async () => {
    assert.equal(await ana.opportunity(film(), NOW), null);
  });

  test("retiring produces no verdict, no withdrawal, and no claim of any kind", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    for (let each = 0; each < 3; each += 1) await ana.opportunity(f, NOW);
    assert.deepEqual(await ana.pending(NOW), []);

    const history = await herVerdicts.history(f);
    assert.deepEqual(history, [], "retiring wrote something into the verdict history");
    assert.equal(current(history), null);
    assert.deepEqual(supersession(history), []);
  });

  test("retiring by time produces nothing either", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    assert.deepEqual(await ana.pending(daysAfter(40)), []);
    assert.deepEqual(await herVerdicts.history(f), [], "the clock wrote a claim");
  });

  test("a verdict before the third chance ends the question without anything retiring", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    await ana.opportunity(f, NOW);
    const said = stateVerdict(f, { about: "judgement", judgement: "loved", because: null }, "confirmed", NOW);
    await herVerdicts.say(said);
    await ana.close(f);
    assert.deepEqual(await ana.pending(NOW), []);
    assert.deepEqual(claim(current(await herVerdicts.history(f))), said);
  });

  test("the rule is a function of its arguments, with no clock inside it", () => {
    const question = askAbout({ title: "Prisoners", year: 2013 }, SINCE, 0);
    assert.equal(retired(question, daysAfter(29)), false);
    assert.equal(retired(question, daysAfter(30)), true);
    assert.equal(retired({ ...question, opportunities: 2 }, NOW), false);
    assert.equal(retired({ ...question, opportunities: 3 }, NOW), true);
    // The thresholds are named rather than scattered, so a change is one edit.
    assert.equal(MAX_OPPORTUNITIES, 3);
    assert.equal(MAX_PENDING_DAYS, 30);
  });

  /* ------------------------------------------------------------- isolation */

  test("one user's open questions are invisible to another", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    assert.deepEqual(await ben.pending(NOW), [], "another user's question was readable");
  });

  test("one user cannot close another's question", async () => {
    const f = film();
    const hers = await ana.open(askAbout(f, SINCE));
    await ben.close(f);
    assert.deepEqual(await ana.pending(NOW), [hers], "a stranger's close reached her question");
  });

  test("the same film waiting for two users stays two questions", async () => {
    const f = film();
    await ana.open(askAbout(f, SINCE));
    await ben.open(askAbout(f, "2026-03-01T20:00:00.000Z"));
    assert.equal((await ana.pending(NOW))[0]?.since, SINCE);
    assert.equal((await ben.pending(NOW))[0]?.since, "2026-03-01T20:00:00.000Z");
    await ana.close(f);
    assert.equal((await ben.pending(NOW)).length, 1, "her close reached his question");
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
    assert.equal((await ana.pending(NOW))[0]?.since, "2026-01-01T20:00:00.000Z");
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
    assert.deepEqual(Object.keys(ana).sort(), ["close", "opportunity", "open", "pending"].sort());
    for (const absent of ["answer", "resolve", "remind", "notify", "update"]) {
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
      ["id", "opportunities", "since", "title", "user_id", "year"],
      "the question table grew a column that could hold a meaning",
    );
  });
});
