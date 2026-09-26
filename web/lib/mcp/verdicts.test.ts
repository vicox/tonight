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

  const call = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) =>
    tools[name]!.handler(args);
  const said = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) => {
    const result = await call(tools, name, args);
    assert.equal(result.isError, undefined, `${name} refused: ${JSON.stringify(result.structuredContent)}`);
    return result.structuredContent as Record<string, never>;
  };

  let next = 0;
  const film = () => ({ title: `Subject ${String(++next)}`, year: 2013 });

  /** Every act about one film, oldest first, as `get_verdicts` gives them. */
  const history = async (tools: Record<string, Tool>, f: object) =>
    ((await said(tools, "get_verdicts", { film: f })) as unknown as { history: { said: string }[] })
      .history;

  const standing = async (tools: Record<string, Tool>, f: object, occasion?: string) =>
    (await said(tools, "get_verdicts", { film: f, ...(occasion ? { occasion } : {}) })) as unknown as {
      current: { assertion?: { about: string; judgement?: string; because?: string | null } } | null;
      history: { said: string }[];
      superseded: unknown[];
    };

  /* -------------------------------- what a partial read may not be used to settle */

  test("forgetting says where it ends, so it is not read as licence to tidy up", async () => {
    // Three semantic runs out of three forgot the act correctly and then also
    // destroyed the saved film — one with `delete_movie`, two by clearing the
    // state. The description promised the opposite ("whatever the saved film
    // says applies again") and said nothing about where the request stops.
    const said = ana.forget_verdict!.description ?? "";

    assert.match(said, /this call is the whole of the request/iu, "nothing says the request ends here");
    assert.match(
      said,
      /do not[^.]*(update|delete)[^.]*saved film/iu,
      "nothing forbids going on to change the saved film",
    );
    assert.match(
      said,
      /(genre|mix|evening)[^.]*unless they separately ask/iu,
      "the boundary names only the film, not the other roots",
    );
    // Why the film is left, stated as a consequence of the model rather than as
    // an arbitrary prohibition — and stated without promising that an opinion
    // reappears underneath, because there is no second evaluative root for one
    // to be left in.
    assert.match(
      said,
      /whether they watched it is a separate\s+thing they said/iu,
      "nothing says why the saved film survives",
    );
    assert.doesNotMatch(
      said,
      /applies once no verdict overlays it|whatever the saved film says applies again/iu,
      "the description still promises a Movie opinion coming back",
    );
  });

  test("a verdict history says what it cannot settle", async () => {
    // Runs read this alone and then described the user's whole position on a
    // film — "there is no standing opinion", "this is the only thing on record".
    // The read was honest; the conclusion drawn from it was not, because it is
    // one film's history and cannot see whether the film is even saved.
    const said = ana.get_verdicts!.description ?? "";

    assert.match(said, /reads what they said and nothing else/iu, "it does not say what it covers");

    // (A) The saved Movie, named on its own. This is the limitation the failing
    // run walked into, back when a film carried an opinion of its own and the
    // standing verdict said something else — and an alternation that accepted
    // any one root would still pass with exactly this clause deleted.
    assert.match(
      said,
      /cannot (see|tell)[^.]*saved film/iu,
      "the description does not say it cannot see the saved film",
    );

    // (B) And the other typed roots, so this is stated as a general limit on a
    // partial read rather than one exception about Movies.
    for (const root of ["genre", "mix", "evening"]) {
      assert.match(
        said,
        new RegExp(`cannot (see|tell)[^.]*\\b${root}`, "iu"),
        `the description does not say it cannot see a ${root}`,
      );
    }

    assert.match(
      said,
      /never conclude from this read what their whole position on a film is/iu,
      "it does not forbid claiming the whole position from a partial read",
    );
    assert.match(said, /`get_memory`/u, "it does not name the read that answers the whole question");

    // And it no longer promises to resolve one root against another. Nothing
    // carries two opinions, so a description offering to say "which governs"
    // would describe behaviour Tonight does not have.
    assert.doesNotMatch(said, /which governs|disagrees with/iu, "it still promises a resolution");
  });

  test("the memory view claims the whole of memory, with nothing kept elsewhere", async () => {
    // This read used to declare an exclusion, because there was a second place
    // Tonight kept notes of its own and a reader meeting their absence here
    // could not tell "there are none" from "this read does not carry them".
    // There is no second place now — so the read says it answers for all of it,
    // and the answer's `coverage` says the same thing to a reader who never saw
    // the description.
    const description = ana.get_memory!.description ?? "";

    assert.match(description, /answers for all of it|the whole of Memory/iu, "it does not claim to be complete");
    assert.doesNotMatch(description, /get_open_questions|deliberately not here/iu, "it points at a read that is gone");

    const view = (await said(ana, "get_memory")) as unknown as {
      coverage: { completeFor: string[]; excluded: Record<string, unknown> };
    };
    assert.deepEqual(view.coverage.completeFor, ["held", "remembered"]);
    assert.deepEqual(view.coverage.excluded, {}, "the answer still claims something is held back");
  });

  test("the memory view says its own thoughts are not written down", async () => {
    // The replacement for the exclusion. A model that has just noticed something
    // about somebody needs to know that noticing it is not the same as Tonight
    // knowing it — nothing it thinks survives the conversation.
    const said = ana.get_memory!.description ?? "";
    assert.match(said, /remembers nothing about a person beyond what is here/iu, "it does not say memory is the whole of it");
    assert.match(said, /written down nowhere|not be here next time/iu, "it does not say a thought does not persist");
  });

  /* ------------------------------------------ what a write hands back, exactly */

  test("a write answers with the act as they said it, its reference, and no machinery", async () => {
    // Persistence hangs two handles on an act and only one of them is theirs.
    // The write order is the table's sequence — it moves if the table is
    // rebuilt, and because it counts what everybody has written it is a fact
    // about other people. The reference is what somebody points at to take that
    // one act back. The writes were handing back both, which is how a model came
    // to see `"order": 222` in the answer to a withdrawal.
    const f = film();

    const stated = (await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "judgement", judgement: "loved", because: "the ending earns it" },
    })) as unknown as { verdict: Record<string, unknown> };

    assert.deepEqual(Object.keys(stated.verdict).sort(), [
      "assertion",
      "at",
      "claimant",
      "film",
      "ref",
      "said",
      "scope",
      "told",
    ]);
    assert.equal(typeof stated.verdict.ref, "string");
    assert.ok((stated.verdict.ref as string).length > 0, "a written verdict came back with no reference");

    const taken = (await said(ana, "withdraw_verdict", { film: f })) as unknown as {
      withdrawal: Record<string, unknown>;
    };

    assert.deepEqual(Object.keys(taken.withdrawal).sort(), [
      "at",
      "claimant",
      "film",
      "ref",
      "said",
      "scope",
    ]);
    assert.equal(typeof taken.withdrawal.ref, "string");
    assert.ok((taken.withdrawal.ref as string).length > 0, "a taking-back came back with no reference");
    assert.notEqual(taken.withdrawal.ref, stated.verdict.ref, "two acts share one reference");

    // And the machinery is nowhere in either payload, at any depth — a nested
    // copy would read exactly the same to a model.
    for (const [name, payload] of [["record_verdict", stated], ["withdraw_verdict", taken]] as const) {
      const whole = JSON.stringify(payload);
      assert.equal(/"order"\s*:/u.test(whole), false, `${name} leaks an order somewhere inside`);
      assert.equal(/"seq"\s*:/u.test(whole), false, `${name} leaks a seq somewhere inside`);
    }
  });

  test("the reference a write hands back is the one that forgets that exact act", async () => {
    // Why the reference is public and the order is not, in one trajectory. Two
    // acts identical in every stated respect — same film, same judgement, same
    // words, same user — and nothing but the reference tells them apart. If a
    // write handed back no reference, a caller could not name either of them;
    // if it handed back the order instead, naming one would mean counting.
    const f = film();
    const same = {
      film: f,
      told: "volunteered" as const,
      said: { about: "judgement", judgement: "liked", because: "the same words twice" },
    };

    const first = (await said(ana, "record_verdict", same)) as unknown as { verdict: { ref: string } };
    const second = (await said(ana, "record_verdict", same)) as unknown as { verdict: { ref: string } };
    assert.notEqual(first.verdict.ref, second.verdict.ref, "two identical statements got one reference");

    const before = await history(ana, f);
    assert.equal(before.length, 2, "both statements were not recorded");

    // Forget the first, by the reference its own write returned.
    const gone = await said(ana, "forget_verdict", { ref: first.verdict.ref });
    assert.deepEqual(gone, { forgotten: first.verdict.ref, writeScope: "verdict-act-only", otherRoots: "unchanged" });

    const after = await history(ana, f);
    assert.equal(after.length, 1, "forgetting by a write's own reference removed the wrong number of acts");

    // And it was the right one: the survivor is the second act, named by the
    // reference the second write returned.
    const left = (await said(ana, "get_memory")) as unknown as {
      held: { of: string; act: { film: { title: string } }; handle: { ref?: string } }[];
      remembered: { of: string; act: { film: { title: string } }; handle: { ref?: string } }[];
    };
    const mine = [...left.held, ...left.remembered].filter(
      (one) => one.of === "verdict" && one.act.film.title === f.title,
    );
    assert.deepEqual(
      mine.map((one) => one.handle.ref),
      [second.verdict.ref],
      "the act that survived is not the one the second write named",
    );
  });

  test("the reference a withdrawal hands back forgets the taking-back and leaves the claim", async () => {
    const f = film();
    const stated = (await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "judgement", judgement: "loved" },
    })) as unknown as { verdict: { ref: string } };

    const taken = (await said(ana, "withdraw_verdict", { film: f })) as unknown as {
      withdrawal: { ref: string };
    };
    assert.equal((await history(ana, f)).length, 2);

    // Forget the taking-back, by the reference the withdrawal itself returned.
    const gone = await said(ana, "forget_verdict", { ref: taken.withdrawal.ref });
    assert.deepEqual(gone, { forgotten: taken.withdrawal.ref, writeScope: "verdict-act-only", otherRoots: "unchanged" });

    const after = await history(ana, f);
    assert.deepEqual(
      after.map((act) => act.said),
      ["verdict"],
      "forgetting the taking-back did not leave the claim it silenced",
    );

    // And the claim it silenced stands again, which is the whole difference
    // between forgetting a withdrawal and withdrawing a verdict.
    const now = await standing(ana, f);
    assert.equal(now.current?.assertion?.judgement, "loved");

    // The verdict's own reference was never touched by any of it.
    const left = (await said(ana, "get_memory")) as unknown as {
      held: { of: string; act: { film: { title: string } }; handle: { ref?: string } }[];
    };
    const root = left.held.find((one) => one.of === "verdict" && one.act.film.title === f.title);
    assert.equal(root?.handle.ref, stated.verdict.ref);
  });

  test("the reference is still how an act is named where a caller can act on one", async () => {
    // Taking the order off must not take the reference with it anywhere a tool
    // needs one. `get_memory` is where a caller is given a reference, and
    // `forget_verdict` is what takes it — so the round trip has to still work.
    const f = film();
    await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "judgement", judgement: "liked" },
    });

    const memory = (await said(ana, "get_memory")) as unknown as {
      held: { of: string; act: { film: { title: string } }; handle: { by: string; ref?: string } }[];
    };
    const root = memory.held.find((one) => one.of === "verdict" && one.act.film.title === f.title);
    assert.ok(root, "the memory view stopped naming the act that was just written");
    assert.equal(root.handle.by, "ref");
    const ref = root.handle.ref;
    assert.equal(typeof ref, "string");
    assert.ok(ref && ref.length > 0);

    const gone = await said(ana, "forget_verdict", { ref });
    assert.deepEqual(gone, { forgotten: ref, writeScope: "verdict-act-only", otherRoots: "unchanged" });
  });

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

  /* ------------------------------------------------------------- identity */

  test("16. no tool takes a user", () => {
    for (const name of ["record_verdict", "withdraw_verdict", "get_verdicts"]) {
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

  test("the surface is the four verdict tools, and no generic mutation", () => {
    // M2 approved three. M3 adds `forget_verdict`, which is not a fourth way to
    // change what they said: it removes one act whole, on their say-so, and the
    // names below are still the ones that would let an edit in.
    const mine = Object.keys(ana).filter((name) => /verdict|question|opportunit/.test(name)).sort();
    assert.deepEqual(mine, ["forget_verdict", "get_verdicts", "record_verdict", "withdraw_verdict"]);
    for (const generic of ["update_verdict", "set_verdict", "upsert_verdict", "delete_verdict", "patch_verdict"]) {
      assert.equal(generic in ana, false, `${generic} appeared`);
    }
  });

  test("the descriptions carry the rules a model has to read", () => {
    const text = ["record_verdict", "withdraw_verdict", "get_verdicts"]
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
    // That Tonight never gets in touch on its own used to be stated in the
    // descriptions of the tools that carried its pending notes. Those tools are
    // gone, and with them the only thing that could have looked like a reason to
    // reach out. What remains is structural and proved as such: test 20 below
    // reads this file's source for a timer, a fetch or a tool that offers to
    // start something, and the M2 `noOutbound` gate does the same.
    // Correction appends.
    assert.match(text, /supersedes the old one and the old one\s+stays in the history/u);

    // And no later milestone leaks into what a model is told today.
    for (const later of ["confidence", "proposal", "observation", "situation", "companion", "relevance"]) {
      assert.equal(new RegExp(`\\b${later}`, "iu").test(text), false, `${later} appears in a verdict tool description`);
    }
  });

  /* ------------------------------------------------ what leaves the boundary */

  /**
   * Persistence does not leave with the answer.
   *
   * The store hangs two handles on every act: `order`, which is how the table
   * breaks a tie inside one millisecond, and `ref`, which is the name somebody
   * will point at to take an act back. Neither is part of what the user said.
   *
   * `order` in particular must not be out here at all. It comes from a sequence
   * shared by the whole table, so its value says something about how much
   * everybody else has written — a fact about other people, handed to a model
   * reading one person's verdicts.
   */
  test("no persistence handle reaches the get_verdicts payload", async () => {
    const f = film();
    await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "judgement", judgement: "loved", because: "the tension" },
    });
    await said(ana, "record_verdict", {
      film: f,
      told: "confirmed",
      said: { about: "judgement", judgement: "disliked" },
    });
    await said(ana, "withdraw_verdict", { film: f });

    const answer = await said(ana, "get_verdicts", { film: f });
    const payload = JSON.stringify(answer);
    for (const handle of ["order", "ref", "seq"]) {
      assert.equal(
        new RegExp(`"${handle}"\\s*:`).test(payload),
        false,
        `${handle} reached the model: ${payload.slice(0, 200)}`,
      );
    }

    // Every section, not only the list: current and superseded are acts too.
    const read = answer as unknown as { current: unknown; superseded: unknown[]; history: unknown[] };
    assert.equal(read.history.length, 3, "the history is no longer the whole of what was said");
    // Two: the first verdict displaced by the second, and the second by the
    // withdrawal that silenced it.
    assert.equal(read.superseded.length, 2);
    assert.equal(read.current, null, "the fixture no longer ends withdrawn");
  });

  test("a verdict history says what it answers for, in the answer and not only in the description", async () => {
    // Four semantic runs read this alone and then made a claim about the whole
    // position: "the only thing on record for it", "no lasting verdict on it
    // either way ... no standing opinion", "no like/dislike/loved recorded
    // either". Each was false — a saved film existed — and each was reached by a
    // reader who had met the description before the call and the answer after
    // it, and had only the answer in front of it when it wrote the sentence.
    //
    // So the limit travels with the answer. It is a constant, which is the whole
    // design: a coverage line that varied would report what this read cannot see.
    const f = film();
    await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "judgement", judgement: "disliked", because: "it never earned the ending" },
    });

    const answer = (await said(ana, "get_verdicts", { film: f })) as unknown as {
      coverage: unknown;
    };

    assert.deepEqual(
      answer.coverage,
      { completeFor: ["verdictHistory"], excluded: { otherMemoryRoots: { readWith: "get_memory" } } },
      "the coverage this read publishes is not the one agreed",
    );
  });

  test("the verdict coverage is the same sentence whatever the other roots hold", async () => {
    // The point of a constant. `get_memory`'s coverage is constant for the same
    // reason and against the same mistake: one computed from what the excluded
    // roots contain would answer "is there a saved film?" for anybody who
    // compared two calls, which is exactly the question this read must not be a
    // way to ask.
    const told = { told: "volunteered", said: { about: "judgement", judgement: "loved" } };
    const read = async (f: object) =>
      ((await said(ana, "get_verdicts", { film: f })) as unknown as { coverage: unknown }).coverage;

    // (A) A film with no saved Movie at all.
    const bare = film();
    await said(ana, "record_verdict", { film: bare, ...told });

    // (B) The same, with a saved Movie that agrees with the verdict.
    const agreeing = film();
    await said(ana, "record_verdict", { film: agreeing, ...told });
    await said(ana, "create_movie", { ...agreeing, viewing: "seen" });

    // (C) And the case the false claims were made about: a saved Movie beside a
    // standing verdict. Two roots about one film, which is the ordinary shape
    // and not a disagreement — the read still cannot see one of them.
    const clashing = film();
    await said(ana, "record_verdict", {
      film: clashing,
      told: "volunteered",
      said: { about: "judgement", judgement: "disliked" },
    });
    await said(ana, "create_movie", { ...clashing, viewing: "seen" });

    // (D) And a film nobody has said anything about at all.
    const silent = film();

    const seen = await Promise.all([read(bare), read(agreeing), read(clashing), read(silent)]);
    for (const one of seen) {
      assert.deepEqual(one, seen[0], "the coverage moved with what the other roots hold");
    }
  });

  test("the coverage is the only thing the verdict read gained", async () => {
    // A coverage line is a place a cross-root lookup could be smuggled in. This
    // pins the whole payload: the four sections that were always there, and one
    // constant. A fifth field — a count of saved films, a "conflicts" flag, a
    // hint — fails here rather than being discovered in a sweep.
    const f = film();
    await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "judgement", judgement: "liked" },
    });
    await said(ana, "create_movie", { ...f, viewing: "seen" });

    const answer = await said(ana, "get_verdicts", { film: f });
    assert.deepEqual(
      Object.keys(answer).sort(),
      ["coverage", "current", "film", "history", "superseded"],
      "the verdict read answers with a different set of fields than agreed",
    );

    // And the parts that were there still mean what they meant. The film above
    // is saved `seen`, and that fact belongs to the other root: nothing about
    // watching shows here, which is the limitation the coverage declares. The
    // assertion that replaced this one looked for a `disliked` no part of the
    // fixture could have produced, so it held nothing.
    const read = answer as unknown as {
      current: { assertion: { judgement: string } };
      history: unknown[];
      superseded: unknown[];
    };
    assert.equal(read.current.assertion.judgement, "liked");
    assert.equal(read.history.length, 1);
    assert.deepEqual(read.superseded, []);
    const payload = JSON.stringify(answer);
    assert.equal(payload.includes("viewing"), false, "the saved viewing field reached this read");
    assert.equal(payload.includes('"seen"'), false, "the saved viewing value reached this read");
  });

  test("asking for two things still gets two things", async () => {
    // The control on the whole D2 repair. Every sentence added at an action
    // point says the second write is not cleanup — and the failure mode of
    // saying that is a model that stops after the first call when the user
    // plainly asked for both. Six semantic runs test the behaviour; this tests
    // that the product still permits it, which is the part a description cannot
    // take away and a future edit could.
    const f = film();
    const stated = (await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "judgement", judgement: "disliked" },
    })) as unknown as { verdict: { ref: string } };
    await said(ana, "create_movie", { ...f, viewing: "seen" });

    // "Forget my verdict, and clear what you have saved about my watching it."
    await said(ana, "forget_verdict", { ref: stated.verdict.ref });
    await said(ana, "update_movie", { ...f, viewing: null });

    assert.deepEqual(await history(ana, f), [], "the verdict act survived");
    const taste = (await said(ana, "get_taste")) as unknown as {
      movies: { title: string; viewing: string | null }[];
    };
    const movie = taste.movies.find((one) => one.title === f.title);
    assert.ok(movie, "clearing the viewing removed the film, which is delete_movie's job");
    assert.equal(movie.viewing, null, "the explicitly requested clearing did not happen");
  });

  test("stripping the handles did not change what the answer means", async () => {
    // The ordering they exist for still works: two acts inside one millisecond
    // resolve by the order the store accepted them, and the answer says so.
    const f = film();
    await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "judgement", judgement: "loved" },
    });
    await said(ana, "record_verdict", {
      film: f,
      told: "volunteered",
      said: { about: "judgement", judgement: "disliked" },
    });
    const answer = (await said(ana, "get_verdicts", { film: f })) as unknown as {
      current: { assertion: { judgement: string } };
      history: { said: string }[];
    };
    assert.equal(answer.current.assertion.judgement, "disliked", "call order stopped deciding");
    assert.equal(answer.history.length, 2);
  });
});
