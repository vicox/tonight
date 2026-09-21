import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import type { AuthenticatedUser } from "../identity.ts";
import {
  current,
  stateVerdict,
  supersession,
  VerdictError,
  withdrawVerdict,
  type Act,
  type Film,
} from "./model.ts";
import type { VerdictStore } from "./store.ts";
import { sqlVerdictStore, VERDICTS_SCHEMA } from "./store/sql.ts";

/**
 * The verdict store, held to one question: does a claim mean the same thing
 * after a round trip as it did before?
 *
 * Persistence is where a model gets flattened. A scope becomes a boolean, an
 * absent explanation becomes an empty string, a withdrawal becomes a row with a
 * neutral value in it, and each of those is a small convenience that changes
 * what Tonight believes about somebody. So most of these contracts write
 * something, read it back, and ask the *model* what it means — because the model
 * is what the rest of the product will ask.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

const prisoners: Film = { title: "Prisoners", year: 2013 };
const zodiac: Film = { title: "Zodiac", year: 2007 };
const TUESDAY = { occasion: "evening-1" };
const WEDNESDAY = { occasion: "evening-2" };

const judged = (judgement: "liked" | "loved" | "disliked", at: string, because: string | null = null) =>
  stateVerdict(prisoners, { about: "judgement", judgement, because }, "volunteered", at);

const notTonight = (at: string, scope = TUESDAY, reason: string | null = null) =>
  stateVerdict(prisoners, { about: "rejection", rejection: { reach: "not-tonight", reason } }, "confirmed", at, scope);

const notEver = (at: string, reason: string | null = null) =>
  stateVerdict(prisoners, { about: "rejection", rejection: { reach: "not-ever", reason } }, "volunteered", at);

describe("the verdict store", () => {
  let driver: SqlDriver;
  let ana: VerdictStore;
  let ben: VerdictStore;

  before(async () => {
    driver = await embeddedDriver();
    await migrate(driver, VERDICTS_SCHEMA);
    ana = sqlVerdictStore(driver, asUser("google:ana"));
    ben = sqlVerdictStore(driver, asUser("google:ben"));
  });

  after(async () => {
    await driver.close();
  });

  /** A fresh film per test, so histories cannot leak into one another. */
  let next = 0;
  const film = (): Film => ({ title: `Subject ${String(++next)}`, year: 2013 });
  const about = (f: Film, act: Act): Act => ({ ...act, film: f }) as Act;

  /* ------------------------------------------------------------- round trip */

  test("a judgement survives the round trip as the same claim", async () => {
    const f = film();
    const given = await ana.say(about(f, judged("loved", "2026-01-01T20:00:00.000Z", "the tension never lets up")));
    const [back] = await ana.history(f);
    assert.deepEqual(back, given);
    assert.equal(back?.said, "verdict");
    assert.deepEqual((back as { assertion: unknown }).assertion, {
      about: "judgement",
      judgement: "loved",
      because: "the tension never lets up",
    });
  });

  test("a rejection survives as a rejection, not as a judgement", async () => {
    const f = film();
    await ana.say(about(f, notEver("2026-01-01T20:00:00.000Z", "three hours of misery")));
    const [back] = await ana.history(f);
    const assertion = (back as { assertion: { about: string; rejection?: unknown } }).assertion;
    assert.equal(assertion.about, "rejection");
    assert.deepEqual(assertion.rejection, { reach: "not-ever", reason: "three hours of misery" });
    assert.equal("judgement" in assertion, false, "a rejection came back carrying a judgement");
  });

  /* ---------------------------------------------------------------- scope */

  test("a global verdict comes back global", async () => {
    const f = film();
    await ana.say(about(f, judged("liked", "2026-01-01T20:00:00.000Z")));
    const [back] = await ana.history(f);
    assert.equal((back as { scope: unknown }).scope, "everywhere");
  });

  test("a not-tonight refusal comes back with the exact evening", async () => {
    const f = film();
    await ana.say(about(f, notTonight("2026-01-01T20:00:00.000Z", TUESDAY, "too long")));
    const [back] = await ana.history(f);
    assert.deepEqual((back as { scope: unknown }).scope, TUESDAY, "a local refusal came back global");
    // And it still behaves as local: invisible globally, standing in its evening.
    const history = await ana.history(f);
    assert.equal(current(history), null);
    assert.deepEqual(current(history, TUESDAY), back);
  });

  test("one evening cannot contaminate another", async () => {
    const f = film();
    const tuesday = await ana.say(about(f, notTonight("2026-01-01T20:00:00.000Z", TUESDAY, "too long")));
    const wednesday = await ana.say(about(f, notTonight("2026-02-01T20:00:00.000Z", WEDNESDAY, "not tonight either")));
    const history = await ana.history(f);
    assert.deepEqual(current(history, TUESDAY), tuesday);
    assert.deepEqual(current(history, WEDNESDAY), wednesday);
    assert.equal(current(history, "everywhere"), null);
    assert.deepEqual(supersession(history), [], "one evening superseded another across the round trip");
  });

  test("the global base stays available outside the occasion", async () => {
    const f = film();
    const judgement = await ana.say(about(f, judged("loved", "2026-01-01T20:00:00.000Z")));
    await ana.say(about(f, notTonight("2026-02-01T20:00:00.000Z")));
    const history = await ana.history(f);
    assert.deepEqual(current(history, "everywhere"), judgement);
    assert.deepEqual(current(history, WEDNESDAY), judgement, "an unrelated evening lost the base");
  });

  /* ----------------------------------------------------------- withdrawal */

  test("a global withdrawal leaves silence, not a neutral verdict", async () => {
    const f = film();
    await ana.say(about(f, judged("loved", "2026-01-01T20:00:00.000Z")));
    const taken = await ana.say(about(f, withdrawVerdict(f, "2026-03-01T20:00:00.000Z")));
    assert.equal(taken.said, "withdrawal");
    const history = await ana.history(f);
    assert.equal(current(history), null);
    assert.equal(history.length, 2, "the withdrawal replaced the verdict instead of following it");
  });

  test("a local withdrawal reaches only its own evening", async () => {
    const f = film();
    const judgement = await ana.say(about(f, judged("loved", "2026-01-01T20:00:00.000Z")));
    await ana.say(about(f, notTonight("2026-02-01T20:00:00.000Z")));
    await ana.say(about(f, withdrawVerdict(f, "2026-03-01T20:00:00.000Z", TUESDAY)));
    const history = await ana.history(f);
    assert.deepEqual(current(history, TUESDAY), judgement, "the evening did not fall back to the base");
    assert.deepEqual(current(history, "everywhere"), judgement, "a local withdrawal reached the global claim");
  });

  test("a withdrawal does not resurrect an earlier verdict", async () => {
    const f = film();
    await ana.say(about(f, judged("loved", "2026-01-01T20:00:00.000Z")));
    await ana.say(about(f, judged("liked", "2026-02-01T20:00:00.000Z")));
    await ana.say(about(f, withdrawVerdict(f, "2026-03-01T20:00:00.000Z")));
    assert.equal(current(await ana.history(f)), null);
  });

  /* ------------------------------------------ explanation and provenance */

  test("their explanation survives byte for byte", async () => {
    const f = film();
    const words = "I loved it because the tension never lets up — even the quiet scenes.";
    await ana.say(about(f, judged("loved", "2026-01-01T20:00:00.000Z", words)));
    const [back] = await ana.history(f);
    assert.equal((back as { assertion: { because: string } }).assertion.because, words);
  });

  test("an absent explanation stays absent rather than becoming empty text", async () => {
    const f = film();
    await ana.say(about(f, judged("liked", "2026-01-01T20:00:00.000Z", null)));
    const [back] = await ana.history(f);
    const assertion = (back as { assertion: { because: string | null } }).assertion;
    assert.equal(assertion.because, null, "a missing explanation came back as something");
    assert.notEqual(assertion.because, "");
  });

  test("a rejection's reason stays the rejection's, and absent stays absent", async () => {
    const f = film();
    await ana.say(about(f, notEver("2026-01-01T20:00:00.000Z")));
    const [back] = await ana.history(f);
    const assertion = (back as { assertion: { rejection: { reason: string | null }; because?: unknown } }).assertion;
    assert.equal(assertion.rejection.reason, null);
    assert.equal("because" in assertion, false, "a judgement's facet appeared on a rejection");
  });

  test("volunteered and confirmed do not collapse into each other", async () => {
    const f = film();
    await ana.say(about(f, judged("loved", "2026-01-01T20:00:00.000Z")));
    await ana.say(
      about(f, stateVerdict(f, { about: "judgement", judgement: "liked" }, "confirmed", "2026-02-01T20:00:00.000Z")),
    );
    const history = await ana.history(f);
    assert.deepEqual(history.map((act) => (act.said === "verdict" ? act.told : null)), [
      "volunteered",
      "confirmed",
    ]);
  });

  /* --------------------------------------------------------------- time */

  test("a canonical instant survives the round trip", async () => {
    const f = film();
    // Written with an offset; the model canonicalises, and the database must
    // hand back the same instant rather than a local rendering of it.
    await ana.say(about(f, judged("loved", "2026-01-01T21:00:00+01:00")));
    const [back] = await ana.history(f);
    assert.equal(back?.at, "2026-01-01T20:00:00.000Z");
  });

  test("standing does not depend on the order rows come back in", async () => {
    const f = film();
    await ana.say(about(f, judged("loved", "2026-03-01T20:00:00.000Z")));
    await ana.say(about(f, judged("disliked", "2026-01-01T20:00:00.000Z")));
    const history = await ana.history(f);
    const shuffled = [...history].reverse();
    assert.deepEqual(current(history), current(shuffled));
    assert.deepEqual(supersession(history), supersession(shuffled));
    // And it is the later claim that stands, whatever order it was written in.
    assert.equal((current(history) as { assertion: { judgement: string } }).assertion.judgement, "loved");
  });

  test("two claims at the same instant resolve the same way after a round trip", async () => {
    const f = film();
    await ana.say(about(f, judged("loved", "2026-01-01T20:00:00.000Z")));
    await ana.say(about(f, judged("disliked", "2026-01-01T20:00:00.000Z")));
    const history = await ana.history(f);
    assert.deepEqual(current(history), current([...history].reverse()));
  });

  /* ---------------------------------------------------------- isolation */

  test("one user cannot read another's verdicts", async () => {
    const f = film();
    await ana.say(about(f, judged("loved", "2026-01-01T20:00:00.000Z")));
    assert.deepEqual(await ben.history(f), [], "another user's history was readable");
  });

  test("one user cannot withdraw another's verdict", async () => {
    const f = film();
    const hers = await ana.say(about(f, judged("loved", "2026-01-01T20:00:00.000Z")));
    // Ben can say what he likes; it lands in his own history and leaves hers be.
    await ben.say(about(f, withdrawVerdict(f, "2026-03-01T20:00:00.000Z")));
    assert.deepEqual(current(await ana.history(f)), hers, "a stranger's withdrawal reached her claim");
    assert.equal(current(await ben.history(f)), null);
  });

  test("identical histories about the same film stay apart", async () => {
    const f = film();
    const mine = judged("loved", "2026-01-01T20:00:00.000Z", "the same words");
    await ana.say(about(f, mine));
    await ben.say(about(f, mine));
    const hers = await ana.history(f);
    const his = await ben.history(f);
    assert.equal(hers.length, 1);
    assert.equal(his.length, 1);
    await ana.say(about(f, withdrawVerdict(f, "2026-03-01T20:00:00.000Z")));
    assert.equal(current(await ana.history(f)), null);
    assert.deepEqual(current(await ben.history(f)), his[0], "her withdrawal reached his claim");
  });

  /* ------------------------------------------------- order within an instant */

  test("two claims in the same instant resolve to the one said second", async () => {
    // The defect this exists for: `said_at` has millisecond resolution, two calls
    // can land inside one, and a correction must still take.
    const f = film();
    const at = "2026-01-01T20:00:00.000Z";
    await ana.say(about(f, judged("loved", at)));
    await ana.say(about(f, judged("liked", at)));
    const history = await ana.history(f);
    assert.equal(
      (current(history) as unknown as { assertion: { judgement: string } }).assertion.judgement,
      "liked",
      "the later correction was lost to a content tie-break",
    );
    assert.equal(supersession(history).length, 1);
  });

  test("a withdrawal in the same instant withdraws the verdict before it", async () => {
    const f = film();
    const at = "2026-01-01T20:00:00.000Z";
    await ana.say(about(f, judged("loved", at)));
    await ana.say(about(f, withdrawVerdict(f, at)));
    assert.equal(current(await ana.history(f)), null, "a same-instant withdrawal did not take");
  });

  test("a verdict in the same instant after a withdrawal becomes current", async () => {
    const f = film();
    const at = "2026-01-01T20:00:00.000Z";
    await ana.say(about(f, withdrawVerdict(f, at)));
    await ana.say(about(f, judged("loved", at)));
    assert.equal(
      (current(await ana.history(f)) as unknown as { assertion: { judgement: string } }).assertion.judgement,
      "loved",
      "the verdict after a same-instant withdrawal did not stand",
    );
  });

  test("the order survives the round trip, and rises with each act", async () => {
    const f = film();
    const at = "2026-01-01T20:00:00.000Z";
    await ana.say(about(f, judged("loved", at)));
    await ana.say(about(f, judged("liked", at)));
    const orders = (await ana.history(f)).map((act) => (act as unknown as { order: number }).order);
    assert.equal(orders.length, 2);
    assert.ok(orders.every((o) => Number.isInteger(o) && o > 0), "an act came back without an order");
    assert.ok(orders[0]! < orders[1]!, "the order did not follow the order of writing");
  });

  test("a caller cannot choose its place in the order", async () => {
    const f = film();
    const at = "2026-01-01T20:00:00.000Z";
    const first = await ana.say(about(f, judged("loved", at)));
    // Sent with an order far ahead of anything the sequence will hand out. If it
    // were honoured, this would jump the queue rather than join it.
    await ana.say({ ...about(f, judged("liked", at)), order: 10_000_000 } as unknown as Act);
    const history = await ana.history(f);
    const orders = history.map((act) => (act as unknown as { order: number }).order);
    assert.ok(orders.every((o) => o < 10_000_000), "a caller's order was written down");
    assert.ok(
      (first as unknown as { order: number }).order < Math.max(...orders),
      "the forged act did not take the next place in line",
    );
  });

  test("two writes accepted at once never share a place in the order", async () => {
    const f = film();
    const at = "2026-01-01T20:00:00.000Z";
    const many = 12;
    await Promise.all(
      Array.from({ length: many }, (_, each) =>
        ana.say(about(f, judged(each % 2 === 0 ? "loved" : "liked", at))),
      ),
    );
    const orders = (await ana.history(f)).map((act) => (act as unknown as { order: number }).order);
    assert.equal(orders.length, many);
    assert.equal(new Set(orders).size, many, "two concurrent writes shared an order");
    // And whatever order they landed in, the answer is stable across reads.
    const once = current(await ana.history(f));
    const again = current(await ana.history(f));
    assert.deepEqual(once, again, "standing was not stable across reads");
  });

  test("the table refuses two acts sharing a place in the order", async () => {
    // The sequence never hands the same number out twice, so this cannot happen
    // by writing through the store. It is asserted anyway because the order is
    // what breaks a tie: something that reached the table another way — a
    // migration, a repair script — must not be able to leave two acts
    // indistinguishable again.
    const f = film();
    await ana.say(about(f, judged("loved", "2026-01-01T20:00:00.000Z")));
    const [row] = await driver.query<{ seq: number }>(
      "SELECT seq FROM tonight_verdict_acts WHERE title = $1",
      [f.title],
    );
    await assert.rejects(
      () =>
        driver.query(
          `INSERT INTO tonight_verdict_acts
                  (user_id, said, title, year, said_at, told, about, judgement, seq)
                VALUES ('google:ana', 'verdict', $1, 2013, now(), 'volunteered', 'judgement', 'liked', $2)`,
          [f.title, row?.seq],
        ),
      "the table accepted a duplicate place in the order",
    );
  });

  test("a row written before the order existed still resolves deterministically", async () => {
    // Legacy rows carry no order — nothing recorded which of two same-instant
    // acts came first — so the content fallback decides, and it decides the same
    // way every time rather than inventing a precedence.
    const f = film();
    const at = "2026-01-01T20:00:00.000Z";
    await ana.say(about(f, judged("loved", at)));
    await ana.say(about(f, judged("liked", at)));
    await driver.query("UPDATE tonight_verdict_acts SET seq = NULL WHERE title = $1", [f.title]);
    const one = current(await ana.history(f));
    const other = current(await ana.history(f));
    assert.deepEqual(one, other, "legacy rows resolved differently between reads");
    assert.ok(one !== null);
  });

  test("an act that carries an order sorts after one that does not", async () => {
    // The column was added later, so anything holding an order was written after
    // everything missing it.
    const f = film();
    const at = "2026-01-01T20:00:00.000Z";
    await ana.say(about(f, judged("loved", at)));
    await driver.query("UPDATE tonight_verdict_acts SET seq = NULL WHERE title = $1", [f.title]);
    await ana.say(about(f, judged("disliked", at)));
    assert.equal(
      (current(await ana.history(f)) as unknown as { assertion: { judgement: string } }).assertion.judgement,
      "disliked",
      "a newer act lost to a legacy one at the same instant",
    );
  });

  /* ------------------------------------------------- the boundary, again */

  test("a malformed act is refused rather than written", async () => {
    const f = film();
    const sound = judged("loved", "2026-01-01T20:00:00.000Z");
    for (const broken of [
      { ...sound, told: "observed" },
      { ...sound, claimant: "agent" },
      { ...sound, assertion: { about: "judgement", judgement: "adored", because: null } },
      { ...sound, at: "whenever" },
      { ...sound, scope: { occasion: "" } },
    ]) {
      await assert.rejects(() => ana.say(about(f, broken as unknown as Act)), VerdictError);
    }
    assert.deepEqual(await ana.history(f), [], "a refused act was written anyway");
  });

  test("an act that is neither a verdict nor a withdrawal is refused", async () => {
    // Not "anything that is not a withdrawal is a verdict". An unknown
    // discriminator is an object this model has no shape for, and the only
    // honest answer is to refuse it — treating it as the nearest valid kind
    // writes down a claim whose own label said it was something else.
    const f = film();
    const sound = judged("loved", "2026-01-01T20:00:00.000Z");
    for (const said of ["opinion", "verdict-ish", "", "VERDICT", null, undefined, 1, {}]) {
      await assert.rejects(
        () => ana.say(about(f, { ...sound, said } as unknown as Act)),
        VerdictError,
        `said: ${JSON.stringify(said)} was accepted`,
      );
    }
    assert.deepEqual(await ana.history(f), [], "an unknown act was written anyway");
  });

  test("a withdrawal carrying a verdict's facets is refused, not trimmed", async () => {
    // Silently dropping the extra fields would turn a malformed object into a
    // valid, different claim — the normalisation this boundary exists to refuse.
    const f = film();
    const taking = withdrawVerdict(f, "2026-03-01T20:00:00.000Z");
    for (const extra of [
      { told: "volunteered" },
      { told: "confirmed" },
      { assertion: { about: "judgement", judgement: "loved", because: null } },
      { assertion: { about: "rejection", rejection: { reach: "not-ever", reason: null } } },
      { judgement: "loved" },
      { because: "it earns its length" },
      { reach: "not-ever" },
      { reason: "too long" },
    ]) {
      await assert.rejects(
        () => ana.say({ ...taking, ...extra } as unknown as Act),
        VerdictError,
        `a withdrawal carrying ${Object.keys(extra).join(", ")} was accepted`,
      );
    }
    assert.deepEqual(await ana.history(f), [], "a refused withdrawal was written anyway");
  });

  test("a refused act leaves no row behind, in the table itself", async () => {
    const f = film();
    const sound = judged("loved", "2026-01-01T20:00:00.000Z");
    await assert.rejects(() => ana.say(about(f, { ...sound, said: "opinion" } as unknown as Act)), VerdictError);
    await assert.rejects(
      () => ana.say({ ...withdrawVerdict(f, "2026-03-01T20:00:00.000Z"), told: "volunteered" } as unknown as Act),
      VerdictError,
    );
    // Read past the store, because the store is what is on trial.
    const rows = await driver.query<{ n: string }>(
      "SELECT count(*) AS n FROM tonight_verdict_acts WHERE title = $1",
      [f.title],
    );
    assert.equal(Number(rows[0]?.n), 0, "a rejected act reached the table");
  });

  test("a valid withdrawal still round-trips untouched", async () => {
    // The positive control for the two refusals above: the shape they guard is
    // still the shape that works.
    const f = film();
    await ana.say(about(f, judged("loved", "2026-01-01T20:00:00.000Z")));
    const taken = await ana.say(withdrawVerdict(f, "2026-03-01T20:00:00.000Z", TUESDAY));
    const history = await ana.history(f);
    const back = history.find((act) => act.said === "withdrawal");
    assert.deepEqual(back, taken);
    // The claim itself, exactly — plus the order the store accepted it in, which
    // it assigns and the user never said.
    const { order, ...claim } = back as unknown as Record<string, unknown>;
    assert.deepEqual(claim, {
      said: "withdrawal",
      claimant: "user",
      film: f,
      scope: TUESDAY,
      at: "2026-03-01T20:00:00.000Z",
    });
    assert.equal(typeof order, "number", "persistence did not record the write order");
  });

  test("a malformed film is refused rather than matching nothing", async () => {
    for (const notAFilm of [{ title: "", year: 2013 }, { title: "x", year: 2013.5 }]) {
      await assert.rejects(() => ana.history(notAFilm as Film), VerdictError);
    }
  });

  /* --------------------------------------- what the table refuses by itself */

  test("the schema refuses what the model refuses, for writers that skip it", async () => {
    // A migration, a repair script or a restore never passes through a
    // constructor. The invariant that an evening's refusal cannot become a fact
    // about the film is one nobody should be able to write by hand either.
    const insert = (columns: string, values: string) =>
      driver.query(
        `INSERT INTO tonight_verdict_acts (user_id, title, year, said_at, ${columns})
              VALUES ('google:ana', 'Direct', 2013, now(), ${values})`,
      );

    for (const [what, columns, values] of [
      ["a global not-tonight", "said, told, about, reach", "'verdict', 'volunteered', 'rejection', 'not-tonight'"],
      ["a scoped not-ever", "said, told, about, reach, occasion", "'verdict', 'volunteered', 'rejection', 'not-ever', 'evening-1'"],
      ["a scoped judgement", "said, told, about, judgement, occasion", "'verdict', 'volunteered', 'judgement', 'loved', 'evening-1'"],
      ["an observed provenance", "said, told, about, judgement", "'verdict', 'observed', 'judgement', 'loved'"],
      ["an invented judgement", "said, told, about, judgement", "'verdict', 'volunteered', 'judgement', 'adored'"],
      ["an empty explanation", "said, told, about, judgement, because", "'verdict', 'volunteered', 'judgement', 'loved', '   '"],
      ["a withdrawal that judges", "said, about, judgement", "'withdrawal', 'judgement', 'loved'"],
      ["a verdict asserting nothing", "said, told", "'verdict', 'volunteered'"],
      ["an act that is neither", "said, told, about, judgement", "'opinion', 'volunteered', 'judgement', 'loved'"],
      ["an assertion about neither", "said, told, about, judgement", "'verdict', 'volunteered', 'feeling', 'loved'"],
      ["a judgement carrying a reach", "said, told, about, judgement, reach", "'verdict', 'volunteered', 'judgement', 'loved', 'not-ever'"],
      ["a rejection carrying a judgement", "said, told, about, reach, judgement", "'verdict', 'volunteered', 'rejection', 'not-ever', 'loved'"],
    ] as [string, string, string][]) {
      await assert.rejects(() => insert(columns, values), `the table accepted ${what}`);
    }
  });

  test("nothing here answers a question about taste", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("store/sql.ts", import.meta.url), "utf8"),
    );
    const code = source.replace(/\/\*\*[\s\S]*?\*\//gu, "").replace(/^[ \t]*\/\/.*$/gmu, "");
    for (const forbidden of ["count(", "group by", "tonight_movies", "tonight_genres", "tonight_mixes", "tonight_episodes"]) {
      assert.equal(code.toLowerCase().includes(forbidden), false, `${forbidden} appears in the verdict store`);
    }
    // And standing is not resolved in SQL: that rule lives in the model.
    for (const owned of ["superseded", "current", "latest"]) {
      assert.equal(new RegExp(`\\b${owned}\\b`, "iu").test(code), false, `${owned} is decided in SQL`);
    }
  });

  test("the store offers no way to change what was said", () => {
    assert.deepEqual(Object.keys(ana).sort(), ["acts", "history", "say", "standing"]);
    for (const generic of ["update", "upsert", "set", "delete", "forget", "correct"]) {
      assert.equal(generic in ana, false, `${generic} appeared on the verdict store`);
    }
  });

  /* ------------------------------------------------------- the complete set */

  /**
   * `acts` exists for one reason, and this is it.
   *
   * `standing` answers with what currently holds, so a film the user took every
   * word back about is absent from it — correctly, because nothing stands there.
   * `history` could still tell that film's story, but only to a caller who
   * already knows its name, and the only place that name was going to come from
   * was `standing`. Between them the film becomes unreachable, and an account of
   * what somebody has told Tonight that silently omits the things they retracted
   * is not an honest account.
   */
  test("a film withdrawn to silence is gone from standing and still in acts", async () => {
    const f = film();
    await ana.say(about(f, judged("liked", "2026-05-01T20:00:00.000Z")));
    await ana.say(withdrawVerdict(f, "2026-05-02T20:00:00.000Z"));

    const standing = await ana.standing();
    assert.equal(
      standing.some((held) => held.title === f.title),
      false,
      "a withdrawn film still stands",
    );
    assert.equal(current(await ana.history(f)), null);

    const mine = (await ana.acts()).filter((act) => act.film.title === f.title);
    assert.equal(mine.length, 2, "the withdrawn film is unreachable from acts");
    assert.deepEqual(mine.map((act) => act.said).sort(), ["verdict", "withdrawal"]);
  });

  /**
   * Completeness, checked against something `acts` did not supply.
   *
   * The films are named here and the store is this contract's own. Both matter,
   * and the first one is the point: asking `acts` which films exist and then
   * checking `acts` against those films is a question that answers itself — a
   * read that lost a film entirely would lose it from the list derived from that
   * read too, nobody would call `history` for it, and the contract would pass by
   * agreeing with itself. So the two films are written down, and the expected
   * roots come from `history`, which reads through its own statement.
   *
   * The history is deliberately more than what stands. `Union A` ends withdrawn,
   * so it has no standing claim at all — a read that quietly answered with the
   * current picture would come back two acts short.
   */
  test("acts is the union of every film's history", async () => {
    const mine = sqlVerdictStore(driver, asUser("google:union"));
    const a: Film = { title: "Union A", year: 2011 };
    const b: Film = { title: "Union B", year: 2012 };

    await mine.say(about(a, judged("loved", "2026-05-03T20:00:00.000Z", "the tension")));
    await mine.say(about(a, judged("disliked", "2026-05-04T20:00:00.000Z")));
    await mine.say(withdrawVerdict(a, "2026-05-05T20:00:00.000Z"));
    await mine.say(about(b, notTonight("2026-05-06T20:00:00.000Z")));
    await mine.say(about(b, judged("liked", "2026-05-07T20:00:00.000Z")));

    const expected = [...(await mine.history(a)), ...(await mine.history(b))];
    // Guards the oracle itself: if both reads broke the same way, two empty sets
    // would agree and this contract would say nothing.
    assert.equal(expected.length, 5, "the expected roots did not come back from history");
    // And the fixture genuinely exceeds what stands: A is withdrawn to silence,
    // so a read that answered with the current picture would be short by three.
    const standing = await mine.standing();
    assert.equal(standing.some((held) => held.title === a.title), false, "Union A still stands");
    assert.ok(standing.length < expected.length, "the fixture no longer exceeds standing");

    // As a set: the read order is a convenience, and a contract that depended on
    // it would be pinning the database's convenience rather than the answer.
    const asSet = (acts: Act[]) => acts.map((act) => JSON.stringify(act)).sort();
    assert.deepEqual(asSet(await mine.acts()), asSet(expected));
  });

  test("acts resolves nothing — superseded, withdrawn and scoped all survive", async () => {
    const f = film();
    await ana.say(about(f, judged("loved", "2026-05-07T20:00:00.000Z", "the tension")));
    await ana.say(about(f, judged("disliked", "2026-05-08T20:00:00.000Z")));
    await ana.say(about(f, notTonight("2026-05-09T20:00:00.000Z", WEDNESDAY, "too long")));
    await ana.say(withdrawVerdict(f, "2026-05-10T20:00:00.000Z", WEDNESDAY));

    const mine = (await ana.acts()).filter((act) => act.film.title === f.title);
    assert.equal(mine.length, 4, "an act was collapsed away");

    // The superseded claim is still there, with the words it was given.
    const displaced = mine.find(
      (act) => act.said === "verdict" && JSON.stringify(act).includes("the tension"),
    );
    assert.ok(displaced, "the superseded verdict was resolved away");
    // Nothing here is a Standing: no projection, no status, no ranking.
    for (const act of mine) {
      assert.ok(act.said === "verdict" || act.said === "withdrawal");
      assert.equal("judgement" in act, false, "acts returned a projection rather than an act");
      assert.equal("rejected" in act, false, "acts returned a projection rather than an act");
    }
    // And the model still reduces them to one standing claim.
    assert.equal((await ana.standing()).filter((held) => held.title === f.title).length, 1);
  });

  test("acts never reaches another user, and says nothing about theirs", async () => {
    const f = film();
    await ana.say(about(f, judged("loved", "2026-05-11T20:00:00.000Z")));
    await ben.say(about(f, judged("disliked", "2026-05-12T20:00:00.000Z")));

    const hers = (await ben.acts()).filter((act) => act.film.title === f.title);
    assert.equal(hers.length, 1, "acts crossed users");
    assert.equal(
      JSON.stringify(hers).includes("loved"),
      false,
      "another user's claim was visible through acts",
    );
    // And the owner is unaffected by the other's write.
    const mine = (await ana.acts()).filter((act) => act.film.title === f.title);
    assert.equal(mine.length, 1);
    assert.equal(JSON.stringify(mine).includes("disliked"), false);
  });

  test("the user predicate is a statement, not a convention", async () => {
    // A mutation removing `WHERE user_id` from the complete read would leave the
    // contract above to catch it at runtime. This catches it in the source, the
    // way the store's other SQL contracts do: the one statement that reads every
    // act must name its owner.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("store/sql.ts", import.meta.url), "utf8"),
    );
    const reads = [...source.matchAll(/FROM tonight_verdict_acts([\s\S]*?)`/gu)];
    assert.ok(reads.length >= 2, "the verdict store no longer has the reads this pins");
    for (const [, clause] of reads) {
      assert.match(clause, /WHERE user_id = \$1/u, "a read of the act table is not bound to its owner");
    }
  });

  test("two reads of the complete set agree", async () => {
    const f = film();
    await ana.say(about(f, judged("loved", "2026-05-13T20:00:00.000Z")));
    await ana.say(withdrawVerdict(f, "2026-05-14T20:00:00.000Z"));
    const once = await ana.acts();
    const again = await ana.acts();
    assert.deepEqual(once, again, "the complete set was not stable across reads");
  });

  test("a film with nothing said about it has an empty history, not a gap", async () => {
    assert.deepEqual(await ana.history(zodiac), []);
    assert.equal(current(await ana.history(zodiac)), null);
  });

  test("histories of different films do not run together", async () => {
    const one = film();
    const two = film();
    await ana.say(about(one, judged("loved", "2026-01-01T20:00:00.000Z")));
    await ana.say(about(two, judged("disliked", "2026-02-01T20:00:00.000Z")));
    assert.equal((await ana.history(one)).length, 1);
    assert.equal((await ana.history(two)).length, 1);
    assert.equal((current(await ana.history(one)) as { assertion: { judgement: string } }).assertion.judgement, "loved");
  });
});
