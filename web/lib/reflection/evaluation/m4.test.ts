import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../../db/driver.ts";
import { migrate } from "../../db/migrate.ts";
import { embeddedDriver } from "../../db/pglite.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../../episodes/store/sql.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import { tonightMcpServer } from "../../mcp/server.ts";
import { sqlTasteStore, TASTE_SCHEMA } from "../../taste/store/sql.ts";
import { QUESTIONS_SCHEMA, sqlQuestionStore } from "../../verdicts/questions/sql.ts";
import { sqlVerdictStore, VERDICTS_SCHEMA } from "../../verdicts/store/sql.ts";
import { gate, GATES, LIMITS, type Observed, type World } from "./gates.ts";
import { TRAJECTORIES, type Step, type Trajectory } from "./trajectories.ts";

/**
 * M4's reflection-safety gate: thinking may persist its own work, belief
 * ownership stays governed.
 *
 * Gate first, implementation after. Reflection does not exist yet, so the four
 * prohibitions below hold because nothing happened — which is honest and, on
 * its own, worth nothing. What gives this file force today is the probe set:
 * each gate is shown to fail against a world mutated the way a broken M4 would
 * leave it, so that when the reflection steps are wired to a real surface the
 * gates are known to bite rather than hoped to.
 *
 * The user's half of every history is real and goes through the public tools,
 * because a fixture that cannot be expressed through them is not a fixture of
 * this product.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

type Tool = { handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>> };

describe("M4 — reflection proposes, the user decides", () => {
  let driver: SqlDriver;
  let world: World;
  const probes: { mutation: string; intended: string; caught: string[] }[] = [];

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
    const seen: Record<string, Observed> = {};
    for (const trajectory of TRAJECTORIES) seen[trajectory.name] = await walk(trajectory);
    world = { seen };
  });

  after(async () => {
    await driver.close();
  });

  /* ------------------------------------------------------------- the driver */

  /**
   * One history, observed either side of the reflection steps.
   *
   * The user's steps are performed. The reflection steps are not: there is
   * nothing to perform them against, and inventing a stand-in would make this
   * file test its own stub. `performed: false` records that, so a reader can
   * never mistake a vacuous pass for a demonstrated one.
   */
  async function walk(trajectory: Trajectory): Promise<Observed> {
    const tools = toolsFor(`google:m4-${trajectory.name}`);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await tools[name]!.handler(args);
      assert.equal(result.isError, undefined, `${name} refused — ${JSON.stringify(result)}`);
      return result.structuredContent as Record<string, unknown>;
    };

    for (const step of trajectory.steps) await perform(step, call);
    const before = await observe(call);
    // Where the reflection steps would run. Nothing does.
    const performed = false;
    const after = await observe(call);
    return { trajectory, before, after, performed, accepted: null };
  }

  /** The user's own acts, through the tools any history here goes through. */
  async function perform(
    step: Step,
    call: (name: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>,
  ): Promise<void> {
    switch (step.act) {
      case "genre":
        await call("create_genre", { name: step.name, instruction: step.instruction });
        return;
      case "mix":
        await call("create_mix", { name: step.name, instruction: step.instruction, genres: step.genres });
        return;
      case "movie":
        await call("create_movie", {
          ...step.film,
          ...(step.viewing === undefined ? {} : { viewing: step.viewing }),
          ...(step.mixes === undefined ? {} : { mixes: step.mixes }),
        });
        return;
      case "verdict":
        await call("record_verdict", {
          film: step.film,
          told: "volunteered",
          said: { about: "judgement", judgement: step.judgement },
        });
        return;
      // Reflection's acts. No surface yet; see the file comment and LIMITS.
      case "observe":
      case "propose":
      case "ignore":
      case "reject":
      case "accept":
        return;
    }
  }

  /** What the user owns, and what a recommendation stands on. */
  async function observe(
    call: (name: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>,
  ): Promise<Observed["before"]> {
    const taste = (await call("get_taste")) as unknown as {
      genres: unknown[];
      mixes: unknown[];
      verdicts?: unknown[];
    };
    return {
      taste: JSON.stringify(taste),
      authority: {
        genres: JSON.stringify(taste.genres),
        mixes: JSON.stringify(taste.mixes),
        verdicts: JSON.stringify(taste.verdicts ?? []),
      },
    };
  }

  /* --------------------------------------------------------------- the tests */

  test("every trajectory says what it proves, and the five are distinct", () => {
    assert.equal(TRAJECTORIES.length, 5);
    for (const trajectory of TRAJECTORIES) {
      assert.ok(trajectory.proves.length > 20, `${trajectory.name} does not say what it proves`);
      assert.ok(trajectory.steps.length > 0);
    }
    assert.equal(new Set(TRAJECTORIES.map((one) => one.name)).size, 5);
    assert.equal(new Set(GATES.map((one) => one.name)).size, GATES.length);
  });

  test("the lifecycle is covered: four that must not write, one that may", () => {
    const writes = TRAJECTORIES.filter((one) => one.steps.some((step) => step.act === "accept"));
    assert.equal(writes.length, 1, "the positive control is not exactly one trajectory");
    assert.equal(TRAJECTORIES.length - writes.length, 4, "the prohibitions are no longer four");
    // Each prohibition is a different reason a write might wrongly appear.
    for (const act of ["observe", "propose", "ignore", "reject"] as const) {
      assert.ok(
        TRAJECTORIES.some((one) => one.steps.some((step) => step.act === act)),
        `no trajectory ever performs ${act}`,
      );
    }
  });

  test("M4 passes every gate", () => {
    assert.deepEqual(gate(world), []);
  });

  test("the gate says plainly that reflection has not been performed", () => {
    // The honest half. Every trajectory holds because nothing ran, and that has
    // to be legible rather than hidden behind a green result.
    for (const seen of Object.values(world.seen)) {
      assert.equal(seen.performed, false, `${seen.trajectory.name} claims reflection ran`);
      assert.equal(seen.accepted, null);
    }
    assert.match(LIMITS[0]!, /reflection has no implementation yet/u);
  });

  /* ------------------------------------------------------------- the probes */

  /**
   * A gate is worth having only if it can fail.
   *
   * Each probe mutates the observed world the way a broken M4 would leave it
   * and asserts the intended gate catches it — the observational convention the
   * M3 gates use and state in their own limits.
   */
  const probe = (mutation: string, intended: string, change: (world: World) => void) => {
    const copy = structuredClone(world) as World;
    change(copy);
    const caught = [...new Set(gate(copy).map((one) => one.gate))];
    probes.push({ mutation, intended, caught });
    assert.ok(
      caught.includes(intended),
      `${mutation}: ${intended} survived — killed ${caught.join(", ") || "nothing"}`,
    );
  };

  const RESTRAINT = '{"name":"Restrained Thriller","instruction":"Tension carried by what is withheld rather than what is shown."}';

  test("a noticed pattern writing itself in as a genre is caught", () => {
    probe("observing creates a Declaration", "authority", (copy) => {
      const seen = copy.seen["observed-only"]!;
      seen.after.authority.genres = `[${RESTRAINT}]`;
    });
  });

  test("a proposal counting as agreement is caught", () => {
    probe("proposing creates a Declaration", "authority", (copy) => {
      const seen = copy.seen["proposed"]!;
      seen.after.authority.genres = `[${RESTRAINT}]`;
    });
  });

  test("silence read as consent is caught", () => {
    probe("an unanswered proposal writes", "authority", (copy) => {
      const seen = copy.seen["proposed-and-ignored"]!;
      seen.after.authority.mixes = '[{"name":"Restrained Thriller"}]';
    });
  });

  test("reflection writing a verdict nobody gave is caught", () => {
    // The sharpest form: an Observation about a film promoted straight into the
    // one root that is absolute. A Verdict's claimant is a type literal, so this
    // cannot be written by construction — but the gate must catch it arriving by
    // any route at all, including one nobody has thought of.
    probe("reflection creates a Verdict", "authority", (copy) => {
      const seen = copy.seen["proposed-and-ignored"]!;
      seen.after.authority.verdicts = '[{"title":"Prisoners","year":2013,"judgement":"loved"}]';
    });
  });

  test("a reading that moved a recommendation without moving a row is caught", () => {
    // The failure a storage comparison cannot see, and the reason the roadmap
    // asks for removal to be proved by recommending again: every row identical,
    // and what a recommendation stands on is not.
    probe("an inert observation tilts the recommendation", "recommendation-inertness", (copy) => {
      const seen = copy.seen["observed-only"]!;
      seen.after.taste = `${seen.after.taste} `;
    });
  });

  test("a refusal that writes anyway is caught", () => {
    probe("the refused reading becomes real", "rejection-stands", (copy) => {
      const seen = copy.seen["proposed-and-rejected"]!;
      seen.after.authority.genres = `[${RESTRAINT}]`;
    });
  });

  test("an acceptance that did not take is caught", () => {
    // The positive control, proved the only way an implication can be: give it
    // an acceptance to be true about, and withhold the write.
    probe("the accepted change never happened", "acceptance-takes", (copy) => {
      const seen = copy.seen["proposed-and-accepted"]!;
      seen.accepted = {
        kind: "genre",
        name: "Restrained Thriller",
        instruction: "Tension carried by what is withheld rather than what is shown.",
      };
    });
  });

  test("a trajectory that silently stopped running is caught", () => {
    probe("a case is never observed", "lifecycle-coverage", (copy) => {
      delete copy.seen["proposed-and-rejected"];
    });
  });

  test("every gate has a mutation that actually killed it", () => {
    // Derived from the probes that ran rather than from a restated list: a gate
    // nobody probed is a gate nobody has shown can fail.
    const killed = new Set(probes.flatMap((one) => one.caught));
    for (const { name } of GATES) {
      assert.ok(killed.has(name), `no probe ever killed ${name}`);
    }
  });

  test("the limits of this gate are written down rather than assumed", () => {
    assert.ok(LIMITS.length >= 4);
    for (const limit of LIMITS) assert.ok(limit.length > 60, `a limit says too little: ${limit}`);
    // The two the roadmap leaves open, named so they are not mistaken for gaps
    // nobody noticed.
    assert.ok(LIMITS.some((one) => /expiry/u.test(one)), "proposal expiry is not named as undecided");
    assert.ok(
      LIMITS.some((one) => /Observation beneath a rejected Proposal/u.test(one)),
      "the rejected-observation question is not named as undecided",
    );
  });
});
