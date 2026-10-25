import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../../db/driver.ts";
import { migrate } from "../../db/migrate.ts";
import { embeddedDriver } from "../../db/pglite.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import { tonightMcpServer } from "../../mcp/server.ts";
import { TASTE_SCHEMA } from "../../taste/store/sql.ts";
import { sqlTasteStore } from "../../taste/store/sql.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../store/sql.ts";
import { gate, LIMITS, type ReadEpisode, type Refusal, type Result } from "./gates.ts";
import { FACTS, TRAJECTORIES, type OfferStatement, type Step } from "./trajectories.ts";

/**
 * M1's evaluation, under M9's evening: does Tonight remember the evening, offer
 * by offer, and only what was said?
 *
 * Every trajectory is driven through the **public MCP tools**, because that is
 * the surface a user's agent actually reaches — and each call's arguments are
 * first held to the tool's own input schema, as the protocol would hold them, so
 * a key the schema refuses is refused here too rather than silently dropped. The
 * store is used only to set up the taste model the trajectories must leave
 * alone.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

/** A store that refuses everything but what is named, so reaching it is a failure. */
const refusingExcept = <T>(what: string, allowed: Record<string, unknown>): T =>
  new Proxy({} as object, {
    get(_, name) {
      if (typeof name === "string" && name in allowed) return allowed[name];
      return () => {
        throw new Error(`M1 reached the ${what} store: ${String(name)}`);
      };
    },
  }) as T;

type Answer = {
  isError?: boolean;
  content?: { text?: string }[];
  structuredContent?: Record<string, unknown>;
};

type Tool = {
  inputSchema?: { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: unknown } };
  handler: (args: Record<string, unknown>) => Promise<Answer>;
};

/** A call as the protocol makes it: arguments held to the schema, then handled. */
async function invoke(tool: Tool, args: Record<string, unknown>): Promise<Answer> {
  const parsed = tool.inputSchema?.safeParse(args);
  if (parsed && !parsed.success) {
    return { isError: true, content: [{ text: JSON.stringify(parsed.error) }] };
  }
  return tool.handler((parsed?.data ?? args) as Record<string, unknown>);
}

describe("M1 — remembers the evening, offer by offer", () => {
  let driver: SqlDriver;
  let results: Result[];
  let tools: (who: string) => Record<string, Tool>;

  before(async () => {
    driver = await embeddedDriver();
    await migrate(driver, EPISODES_SCHEMA);
    await migrate(driver, TASTE_SCHEMA);

    tools = (who: string) =>
      (
        tonightMcpServer({
          user: asUser(who),
          reference: "ref",
          store: sqlTasteStore(driver, asUser(who)),
          episodes: sqlEpisodeStore(driver, asUser(who)),
          // The verdict store refuses every call an episode tool could make, so
          // "nothing here concludes anything about taste" is proved rather than
          // assumed. `standing` answers with nothing — the truth for a user who
          // has said nothing — because reading the taste model asks it, and gate
          // 7 reads the taste model before and after every trajectory.
          verdicts: refusingExcept("verdict", { standing: async () => [] }),
        }) as unknown as { _registeredTools: Record<string, Tool> }
      )._registeredTools;

    // A taste model the trajectories must not disturb. Written through the taste
    // tools, so what gate 7 compares is what Tonight would actually answer.
    const setup = tools("google:ana");
    await setup.create_genre!.handler({ name: "Slow Burn", instruction: "takes its time" });
    await setup.create_movie!.handler({ title: "Zodiac", year: 2007, viewing: "seen" });

    results = [];
    for (const trajectory of TRAJECTORIES) {
      const acting = tools("google:ana");
      const call = (name: string, args: Record<string, unknown> = {}) => invoke(acting[name]!, args);
      const read = async (): Promise<ReadEpisode[]> =>
        ((await call("get_episodes")).structuredContent as { episodes: ReadEpisode[] }).episodes;
      const snapshot = async (id: string | undefined) =>
        JSON.stringify((await read()).find((episode) => episode.id === id) ?? "absent");

      const before = (await call("get_taste")).structuredContent;
      let subjectId: string | undefined;
      const refusals: Refusal[] = [];
      const unexpected: string[] = [];
      const expectAccepted = (step: Step, answer: Answer) => {
        if (answer.isError === true) {
          unexpected.push(`${step.act}: ${answer.content?.[0]?.text ?? "no message"}`);
        }
      };
      const expectRefused = async (attempt: () => Promise<Answer>) => {
        const was = await snapshot(subjectId);
        const answer = await attempt();
        refusals.push({ refused: answer.isError === true, unchanged: was === (await snapshot(subjectId)) });
      };

      for (const step of trajectory.steps) {
        if (step.act === "record") {
          const { act: _act, ...args } = step;
          void _act;
          const written = await call("record_episode", args);
          expectAccepted(step, written);
          subjectId ??= (written.structuredContent as { episode?: { id: string } } | undefined)?.episode?.id;
        } else if (step.act === "round") {
          const { act: _act, ...args } = step;
          void _act;
          expectAccepted(step, await call("record_episode", { episode: subjectId, ...args }));
        } else if (step.act === "refusedRound") {
          const { act: _act, ...args } = step;
          void _act;
          await expectRefused(() => call("record_episode", { episode: subjectId, ...args }));
        } else if (step.act === "state") {
          expectAccepted(step, await call("correct_episode", { episode: subjectId, ...step.statement }));
        } else if (step.act === "refused") {
          await expectRefused(() => call("correct_episode", { episode: subjectId, ...step.statement }));
        } else {
          expectAccepted(step, await call("forget_episode", { episode: subjectId }));
        }
      }

      const episodes = await read();
      results.push({
        trajectory,
        episodes,
        subject: episodes.find((episode) => episode.id === subjectId),
        refusals,
        unexpected,
        tasteBefore: before,
        tasteAfter: (await call("get_taste")).structuredContent,
      });

      // Each trajectory starts from its own slate, so one cannot mask another.
      for (const episode of await read()) {
        await call("forget_episode", { episode: episode.id });
      }
    }
  });

  after(async () => {
    await driver.close();
  });

  test("every trajectory names the invariant it proves", () => {
    assert.equal(TRAJECTORIES.length, 18);
    for (const trajectory of TRAJECTORIES) {
      assert.ok(trajectory.proves.length > 20, `${trajectory.name} does not say what it proves`);
      assert.ok(trajectory.steps.length > 0);
    }
    assert.equal(
      new Set(TRAJECTORIES.map((trajectory) => trajectory.name)).size,
      TRAJECTORIES.length,
    );
  });

  test("every transition an offer's fact can make is covered", () => {
    // Unknown to yes, to a stated no, and back to unknown, for each of the four
    // facts; a reason given; a film of their own; a round; a refusal of each
    // kind; and an evening of their own. A gate set that never exercises a
    // transition cannot fail on it.
    const scripts = TRAJECTORIES.flatMap((trajectory) => trajectory.steps);
    const statements: OfferStatement[] = scripts.flatMap((step) => {
      if (step.act === "state" || step.act === "refused") return step.statement.offers ?? [];
      if (step.act === "record" || step.act === "round" || step.act === "refusedRound") return step.offers ?? [];
      return [];
    });

    for (const fact of FACTS) {
      for (const value of [true, false, null]) {
        assert.ok(
          statements.some((statement) => statement[fact] === value),
          `no trajectory ever states ${fact}: ${String(value)}`,
        );
      }
    }
    assert.ok(statements.some((statement) => typeof statement.passReason === "string"), "no reason is ever given");
    assert.ok(scripts.some((step) => step.act === "round"), "no trajectory adds a round");
    assert.ok(scripts.some((step) => step.act === "refusedRound"), "no round is ever refused");
    assert.ok(
      scripts.some((step) => step.act === "refused" && "watched" in step.statement),
      "the retired evening-level fields are never tried",
    );
    assert.ok(
      scripts.some((step) => step.act === "record" && step.request === undefined),
      "no evening of their own is ever recorded",
    );
  });

  test("M1 passes every gate", () => {
    const failures = gate(results);
    assert.deepEqual(
      failures,
      [],
      failures.map((failure) => `${failure.gate}/${failure.trajectory}: ${failure.detail}`).join("\n"),
    );
  });

  test("the gates are not vacuous: the subject is there wherever the script keeps it", () => {
    const kept = results.filter((result) =>
      !["forget", "record-state-forget-record", "their-own-evening"].includes(result.trajectory.name),
    );
    for (const result of kept) {
      assert.ok(result.subject, `${result.trajectory.name} left no evening to check`);
    }
    const capped = results.find((result) => result.trajectory.name === "evening-cap");
    assert.equal(capped?.subject?.offers.length, 50, "the cap trajectory did not reach fifty films");
    const again = results.find((result) => result.trajectory.name === "offered-again");
    assert.deepEqual(
      again?.subject?.offers.map((offer) => [offer.title, offer.offered, offer.lead]),
      [
        ["Prisoners", true, true],
        ["Zodiac", true, false],
        ["Arrival", true, false],
        ["Heat", true, true],
      ],
      "a film offered again moved, or lost what was said about it",
    );
  });

  test("the gates fail on what they exist to catch", () => {
    // Negative controls: the same results, tampered with the way a wrong store
    // would tamper — an invented choice, a lost retraction, a refusal that
    // landed — and each must be caught.
    const base = results.find((result) => result.trajectory.name === "started-without-chosen")!;
    const invented = structuredClone(base);
    const zodiac = invented.subject!.offers.find((offer) => offer.title === "Zodiac")!;
    zodiac.chosen = { known: true, value: true, source: "stated" };
    assert.ok(gate([invented]).some((failure) => failure.gate === "chain"), "an invented choice passed");

    const lost = structuredClone(results.find((result) => result.trajectory.name === "chosen-moves")!);
    lost.subject!.offers.find((offer) => offer.title === "Zodiac")!.chosen = {
      known: true,
      value: false,
      source: "stated",
    };
    assert.ok(gate([lost]).some((failure) => failure.gate === "correction"), "a lost retraction passed");

    const landed = structuredClone(results.find((result) => result.trajectory.name === "pass-excludes-taking")!);
    landed.refusals[0] = { refused: true, unchanged: false };
    assert.ok(gate([landed]).some((failure) => failure.gate === "correction"), "a refusal that moved passed");

    const observed = structuredClone(base);
    observed.subject!.offers[0]!.started = { known: true, value: true, source: "observed" };
    assert.ok(gate([observed]).some((failure) => failure.gate === "factuality"), "an observed fact passed");
  });

  test("no trajectory left a verdict or touched the taste model", () => {
    // Gate 7 compares the whole model; this says the same thing from the shape
    // of what was read, so a taste model that changed in a way JSON ordering hid
    // is still caught.
    for (const result of results) {
      const after = result.tasteAfter as { movies?: { title: string; viewing: string | null }[] };
      const zodiac = after.movies?.find((movie) => movie.title === "Zodiac");
      assert.equal(zodiac?.viewing, "seen", `${result.trajectory.name} moved a movie's viewing`);
      assert.equal(after.movies?.length, 1, `${result.trajectory.name} added a movie`);
    }
  });

  test("one user's evenings are unreachable to another, in every operation", async () => {
    const ana = tools("google:ana");
    const ben = tools("google:ben");

    const written = await invoke(ana.record_episode!, {
      request: "something tense tonight",
      offered: [{ title: "Prisoners", year: 2013, lead: true }],
    });
    const id = (written.structuredContent as { episode: { id: string } }).episode.id;

    const listed = (
      (await invoke(ben.get_episodes!, {})).structuredContent as { episodes: ReadEpisode[] }
    ).episodes;
    assert.equal(
      listed.some((episode) => episode.id === id),
      false,
      "another user's evening was listed",
    );

    for (const [name, args] of [
      ["correct_episode", { episode: id, offers: [{ title: "Prisoners", year: 2013, started: true }] }],
      ["record_episode", { episode: id, offered: [{ title: "Heat", year: 1995, lead: true }] }],
      ["forget_episode", { episode: id }],
    ] as const) {
      assert.equal((await invoke(ben[name]!, args)).isError, true, `${name} crossed users`);
    }

    // And it is not merely refused — the evening is untouched afterwards.
    const mine = (
      (await invoke(ana.get_episodes!, {})).structuredContent as { episodes: ReadEpisode[] }
    ).episodes.find((episode) => episode.id === id);
    assert.equal(mine?.offers.length, 1, "a refused cross-user round still landed");
    assert.equal(mine?.offers[0]?.started.known, false, "a refused cross-user correction still landed");

    await invoke(ana.forget_episode!, { episode: id });
  });

  test("the limits of this evaluation are written down rather than assumed", () => {
    assert.ok(LIMITS.length >= 2);
    assert.ok(
      LIMITS.some((limit) => limit.includes("nothing consumes episodes yet")),
      "the missing recommendation-level proof is not recorded",
    );
  });
});
