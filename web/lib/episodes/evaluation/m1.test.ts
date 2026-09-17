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
import { gate, LIMITS, OUTCOMES, type ReadEpisode, type Result } from "./gates.ts";
import { TRAJECTORIES } from "./trajectories.ts";

/**
 * M1's evaluation: does Tonight remember the evening, and only the evening?
 *
 * Every trajectory is driven through the **public MCP tools**, because that is
 * the surface a user's agent actually reaches. The store is used only to set up
 * the taste model the trajectories must leave alone.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

type Tool = {
  handler: (args: Record<string, unknown>) => Promise<{
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  }>;
};

describe("M1 — remembers the evening", () => {
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
        }) as unknown as { _registeredTools: Record<string, Tool> }
      )._registeredTools;

    // A taste model the trajectories must not disturb. Written through the taste
    // tools, so what gate 7 compares is what Tonight would actually answer.
    const setup = tools("google:ana");
    await setup.create_genre!.handler({ name: "Slow Burn", instruction: "takes its time" });
    await setup.create_movie!.handler({ title: "Zodiac", year: 2007, state: "loved" });

    results = [];
    for (const trajectory of TRAJECTORIES) {
      const acting = tools("google:ana");
      const call = async (name: string, args: Record<string, unknown> = {}) =>
        acting[name]!.handler(args);
      const read = async (): Promise<ReadEpisode[]> =>
        ((await call("get_episodes")).structuredContent as { episodes: ReadEpisode[] }).episodes;

      const before = (await call("get_taste")).structuredContent;
      let subjectId: string | undefined;
      const refusals: boolean[] = [];

      for (const step of trajectory.steps) {
        if (step.act === "record") {
          const written = await call("record_episode", {
            request: step.request,
            offered: step.offered,
          });
          subjectId ??= (written.structuredContent as { episode: { id: string } }).episode.id;
        } else if (step.act === "state") {
          await call("correct_episode", { episode: subjectId, ...step.statement });
        } else if (step.act === "refused") {
          const attempt = await call("correct_episode", { episode: subjectId, ...step.statement });
          refusals.push(attempt.isError === true);
        } else {
          await call("forget_episode", { episode: subjectId });
        }
      }

      const episodes = await read();
      results.push({
        trajectory,
        episodes,
        subject: episodes.find((episode) => episode.id === subjectId),
        refusals,
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
    assert.equal(TRAJECTORIES.length, 11);
    for (const trajectory of TRAJECTORIES) {
      assert.ok(trajectory.proves.length > 20, `${trajectory.name} does not say what it proves`);
      assert.ok(trajectory.steps.length > 0);
    }
    assert.equal(
      new Set(TRAJECTORIES.map((trajectory) => trajectory.name)).size,
      TRAJECTORIES.length,
    );
  });

  test("every state transition an episode fact can make is covered", () => {
    // Unknown to stated, stated to its opposite, stated back to unknown, and a
    // choice moved between offered films. A gate set that never exercises a
    // transition cannot fail on it.
    const scripts = TRAJECTORIES.flatMap((trajectory) => trajectory.steps);
    const statements = scripts.filter((step) => step.act === "state" || step.act === "refused");

    for (const outcome of OUTCOMES) {
      const touching = statements.filter((step) => "statement" in step && outcome in step.statement);
      assert.ok(touching.length > 0, `no trajectory ever states ${outcome}`);
      assert.ok(
        touching.some((step) => "statement" in step && step.statement[outcome] === null),
        `no trajectory ever retracts ${outcome}`,
      );
    }
    assert.ok(
      statements.some((step) => "statement" in step && step.statement.watched === false),
      "no trajectory ever states a plain no",
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

  test("no trajectory left a verdict or any taste state behind", () => {
    // Gate 7 compares the whole model; this says the same thing from the shape
    // of what was read, so a taste model that changed in a way JSON ordering hid
    // is still caught.
    for (const result of results) {
      const after = result.tasteAfter as { movies?: { title: string; state: string | null }[] };
      const zodiac = after.movies?.find((movie) => movie.title === "Zodiac");
      assert.equal(zodiac?.state, "loved", `${result.trajectory.name} moved a movie state`);
      assert.equal(after.movies?.length, 1, `${result.trajectory.name} added a movie`);
    }
  });

  test("one user's evenings are unreachable to another, in every operation", async () => {
    const ana = tools("google:ana");
    const ben = tools("google:ben");

    const written = await ana.record_episode!.handler({
      request: "something tense tonight",
      offered: [{ title: "Prisoners", year: 2013, lead: true }],
    });
    const id = (written.structuredContent as { episode: { id: string } }).episode.id;

    const listed = (
      (await ben.get_episodes!.handler({})).structuredContent as { episodes: ReadEpisode[] }
    ).episodes;
    assert.equal(
      listed.some((episode) => episode.id === id),
      false,
      "another user's evening was listed",
    );

    for (const [name, args] of [
      ["correct_episode", { episode: id, watched: true }],
      ["forget_episode", { episode: id }],
    ] as const) {
      assert.equal((await ben[name]!.handler(args)).isError, true, `${name} crossed users`);
    }

    // And it is not merely refused — the evening is untouched afterwards.
    const mine = (
      (await ana.get_episodes!.handler({})).structuredContent as { episodes: ReadEpisode[] }
    ).episodes.find((episode) => episode.id === id);
    assert.equal(mine?.watched.known, false, "a refused cross-user correction still landed");

    await ana.forget_episode!.handler({ episode: id });
  });

  test("the limits of this evaluation are written down rather than assumed", () => {
    assert.ok(LIMITS.length >= 2);
    assert.ok(
      LIMITS.some((limit) => limit.includes("nothing consumes episodes yet")),
      "the missing recommendation-level proof is not recorded",
    );
  });
});
