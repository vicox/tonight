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
import { REFLECTION_SCHEMA, sqlReflectionStore } from "../store/sql.ts";
import { sqlVerdictStore, VERDICTS_SCHEMA } from "../../verdicts/store/sql.ts";
import { gate, GATES, LIMITS, type Observed, type World } from "./gates.ts";
import { RESTRAINT, TRAJECTORIES, type Step, type Target, type Trajectory } from "./trajectories.ts";

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
        reflection: sqlReflectionStore(driver, asUser(who)),
      }) as unknown as { _registeredTools: Record<string, Tool> }
    )._registeredTools;

  before(async () => {
    driver = await embeddedDriver();
    for (const schema of [TASTE_SCHEMA, EPISODES_SCHEMA, VERDICTS_SCHEMA, QUESTIONS_SCHEMA, REFLECTION_SCHEMA]) {
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
   * The user's half runs first and is then photographed: `before` is the model
   * they established, with nothing of Tonight's in it. Then reflection runs —
   * through the same public tools an agent has — and `after` is what that left
   * behind. Every gate compares the two.
   *
   * Both halves go through the tool surface. A trajectory that reached the
   * store directly could write something no agent could actually write, and
   * would prove the boundary held against an attack nobody can mount.
   */
  async function walk(trajectory: Trajectory): Promise<Observed> {
    const tools = toolsFor(`google:m4-${trajectory.name}`);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await tools[name]!.handler(args);
      assert.equal(result.isError, undefined, `${name} refused — ${JSON.stringify(result)}`);
      return result.structuredContent as Record<string, unknown>;
    };

    const mine = trajectory.steps.filter((step) => !REFLECTS.has(step.act));
    const tonights = trajectory.steps.filter((step) => REFLECTS.has(step.act));
    for (const step of mine) await perform(step, call);

    const before = await observe(call);
    let observation: string | null = null;
    let proposal: string | null = null;
    let accepted: Target | null = null;

    for (const step of tonights) {
      switch (step.act) {
        case "observe": {
          const written = (await call("record_observation", { noticed: step.noticed })) as unknown as {
            observation: { ref: string };
          };
          observation = written.observation.ref;
          break;
        }
        case "propose": {
          const offered = (await call("propose_change", {
            ...(observation === null ? {} : { from: observation }),
            noticed: step.noticed,
            target: step.target,
          })) as unknown as { proposal: { ref: string } };
          proposal = offered.proposal.ref;
          break;
        }
        case "ignore":
          // The conversation moves on. Nothing is called, which is the point:
          // leaving a proposal pending is an act of omission and has to be
          // driven as one.
          break;
        case "reject":
          assert.ok(proposal, "nothing to reject");
          await call("reject_proposal", { ref: proposal });
          break;
        case "accept": {
          assert.ok(proposal, "nothing to accept");
          const said = (await call("accept_proposal", { ref: proposal })) as unknown as {
            accepted: { target: Target };
          };
          accepted = said.accepted.target;
          break;
        }
      }
    }

    const after = await observe(call);
    return { trajectory, before, after, performed: tonights.length > 0, accepted };
  }

  /** The acts that belong to Tonight rather than to the user. */
  const REFLECTS = new Set<Step["act"]>(["observe", "propose", "ignore", "reject", "accept"]);

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
      // Reflection's acts are driven in `walk`, which needs the references
      // each one returns; they are filtered out before this runs.
      case "observe":
      case "propose":
      case "ignore":
      case "reject":
      case "accept":
        throw new Error(`${step.act} is driven by walk, not by perform`);
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

  test("every trajectory actually performed its reflection steps", () => {
    // The gate is worth nothing if the prohibitions hold because nothing ran.
    // All five drive the real tools; four of them end with no acceptance, and
    // the fifth records what was accepted so the positive control has something
    // to be true about.
    for (const seen of Object.values(world.seen)) {
      assert.equal(seen.performed, true, `${seen.trajectory.name} performed no reflection`);
    }
    const accepted = Object.values(world.seen).filter((seen) => seen.accepted !== null);
    assert.equal(accepted.length, 1, "exactly one trajectory should have accepted something");
    assert.deepEqual(accepted[0]!.accepted, RESTRAINT);
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

  const AS_GENRE =
    '{"name":"Restrained Thriller","instruction":"Tension carried by what is withheld rather than what is shown."}';

  test("a noticed pattern writing itself in as a genre is caught", () => {
    probe("observing creates a Declaration", "authority", (copy) => {
      const seen = copy.seen["observed-only"]!;
      seen.after.authority.genres = `[${AS_GENRE}]`;
    });
  });

  test("a proposal counting as agreement is caught", () => {
    probe("proposing creates a Declaration", "authority", (copy) => {
      const seen = copy.seen["proposed"]!;
      seen.after.authority.genres = `[${AS_GENRE}]`;
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
      seen.after.authority.genres = `[${AS_GENRE}]`;
    });
  });

  test("an acceptance that did not take is caught", () => {
    // The positive control, and the one probe that removes rather than adds:
    // the acceptance stands in the record and the genre it authorised is not
    // there. A gate that only ever forbade writing would be silent about this.
    probe("the accepted change never happened", "acceptance-takes", (copy) => {
      const seen = copy.seen["proposed-and-accepted"]!;
      seen.after.authority.genres = seen.before.authority.genres;
      seen.after.taste = seen.before.taste;
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
