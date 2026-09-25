import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../../db/driver.ts";
import { migrate } from "../../db/migrate.ts";
import { embeddedDriver } from "../../db/pglite.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../../episodes/store/sql.ts";
import { filmKey } from "../../films/identity.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import { tonightMcpServer } from "../../mcp/server.ts";
import { sqlTasteStore, TASTE_SCHEMA } from "../../taste/store/sql.ts";
import { askAbout } from "../../verdicts/questions.ts";
import { QUESTIONS_SCHEMA, sqlQuestionStore } from "../../verdicts/questions/sql.ts";
import { sqlVerdictStore, VERDICTS_SCHEMA } from "../../verdicts/store/sql.ts";
import {
  expected,
  gate,
  GATES,
  LIMITS,
  ROUND_TRIP,
  type Crossing,
  type Handled,
  type Memory,
  type Observed,
  type Root,
  type Stores,
  type Taste,
  type World,
} from "./gates.ts";
import {
  FILMS,
  OWNER_HISTORY,
  STRANGER_HISTORY,
  TRAJECTORIES,
  UNICODE_FILMS,
  type Step,
  type Trajectory,
} from "./trajectories.ts";

/**
 * M3's acceptance: can Tonight say what it knows, and can it be corrected?
 *
 * Every history is driven through the **public MCP tools**, because that is the
 * surface an agent reaches and what an agent is handed is the whole question of
 * this milestone. The one exception is opening a pending question: nothing in
 * the tool surface does that yet, so those two histories reach the store
 * directly. It is declared in `LIMITS` rather than hidden here.
 *
 * Each history runs as its own person. A verdict log is append-only and a taste
 * model is durable, so a fresh slate is a fresh user — and that also makes the
 * paired gates honest, since the two halves of a pair are two people who did
 * different things rather than one person at two moments.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

type Answer = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: unknown;
};

type Tool = { handler: (args: Record<string, unknown>) => Promise<Answer> };

const DAY = 86_400_000;

/** A reference and an episode id that are well-formed and belong to nobody. */
const NOBODY_REF = "00000000-0000-4000-8000-000000000000";
const NOBODY_EPISODE = "00000000-0000-4000-8000-000000000001";

type Probe = { mutation: string; intended: string; caught: string[] };

describe("M3 — explains itself, and can be corrected", () => {
  let driver: SqlDriver;
  let world: World;
  const probes: Probe[] = [];

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
    world = { seen, crossing: await cross(), handled: await roundTrip() };
  });

  after(async () => {
    await driver.close();
  });

  /* ------------------------------------------------------------- the driver */

  async function walk(trajectory: Trajectory): Promise<Observed> {
    const who = `google:${trajectory.name}`;
    const tools = toolsFor(who);
    const stores = {
      taste: sqlTasteStore(driver, asUser(who)),
      verdicts: sqlVerdictStore(driver, asUser(who)),
      episodes: sqlEpisodeStore(driver, asUser(who)),
      questions: sqlQuestionStore(driver, asUser(who)),
    };

    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await tools[name]!.handler(args);
      assert.equal(result.isError, undefined, `${trajectory.name}: ${name} refused — ${JSON.stringify(result)}`);
      return result.structuredContent as Record<string, unknown>;
    };
    const memory = async (): Promise<Memory> => (await call("get_memory")) as unknown as Memory;
    const snapshot = async (): Promise<Stores> => ({
      taste: await stores.taste.taste(),
      acts: await stores.verdicts.acts(),
      episodes: await stores.episodes.episodes(),
      questions: await stores.questions.pending(new Date().toISOString()),
    });

    let evening: string | undefined;
    let forgetting: Observed["forgetting"] = null;
    let atomicity: Observed["atomicity"] = null;

    for (const step of trajectory.steps) {
      switch (step.act) {
        case "genre":
          await call("create_genre", { name: step.name, instruction: step.instruction });
          break;
        case "mix":
          await call("create_mix", { name: step.name, genres: step.genres, instruction: step.instruction });
          break;
        case "movie":
          await call("create_movie", {
            ...step.film,
            state: step.state,
            ...(step.imdbId === undefined ? {} : { imdb_id: step.imdbId }),
            ...(step.mixes === undefined ? {} : { mixes: step.mixes }),
          });
          break;
        case "verdict":
          await call("record_verdict", {
            film: step.film,
            told: step.told,
            said:
              step.judgement === undefined
                ? {
                    about: "rejection",
                    reach: step.reach,
                    ...(step.reason === undefined ? {} : { reason: step.reason }),
                    ...(step.occasion === undefined ? {} : { occasion: step.occasion }),
                  }
                : {
                    about: "judgement",
                    judgement: step.judgement,
                    ...(step.because === undefined ? {} : { because: step.because }),
                  },
          });
          break;
        case "withdraw":
          await call("withdraw_verdict", {
            film: step.film,
            ...(step.occasion === undefined ? {} : { occasion: step.occasion }),
          });
          break;
        case "evening": {
          const written = await call("record_episode", { request: step.request, offered: step.offered });
          evening = (written as { episode: { id: string } }).episode.id;
          break;
        }
        case "outcome":
        case "amend": {
          const args: Record<string, unknown> = { episode: evening };
          if ("request" in step && step.request !== undefined) args.request = step.request;
          if ("offered" in step && step.offered !== undefined) args.offered = step.offered;
          if ("chosen" in step) args.chosen = step.chosen ?? null;
          if ("watched" in step && step.watched !== undefined) args.watched = step.watched;
          if ("finished" in step && step.finished !== undefined) args.finished = step.finished;

          if (step.act === "amend" && step.refused) {
            // The evening either side of a correction the product has to refuse,
            // so the gate can ask whether any of it took.
            const was = await memory();
            const answer = await tools.correct_episode!.handler(args);
            assert.equal(
              answer.isError,
              true,
              `${trajectory.name}: the illegal correction was accepted — ${JSON.stringify(answer)}`,
            );
            atomicity = { before: was, after: await memory() };
          } else {
            await call("correct_episode", args);
          }
          break;
        }
        case "forget": {
          // The reference comes from the memory view, which is the only place a
          // user could get one — so a view that did not offer usable handles
          // would stop this history from running at all.
          const was = await memory();
          const refs = refsFor(was, step.film, step.which);
          assert.ok(refs.length > 0, `${trajectory.name}: no reference for ${step.which}`);
          for (const ref of refs) await call("forget_verdict", { ref });
          forgetting = { before: was, removed: refs };
          break;
        }
        case "question":
          await stores.questions.open(
            askAbout(step.film, new Date(Date.now() - step.daysAgo * DAY).toISOString()),
          );
          break;
        case "opportunity":
          await call("record_opportunity", { film: step.film });
          break;
      }
    }

    const before = await snapshot();
    const first = await memory();
    await memory();
    const again = await memory();
    return {
      trajectory,
      memory: first,
      memoryAgain: again,
      taste: (await call("get_taste")) as unknown as Taste,
      before,
      after: await snapshot(),
      forgetting,
      atomicity,
    };
  }

  /** Which acts a forgetting step means, read out of the memory view. */
  function refsFor(memory: Memory, film: { title: string; year: number }, which: string): string[] {
    const mine = [...memory.held, ...memory.remembered]
      .filter((root) => root.of === "verdict")
      .map((root) => ({ root, act: root.act as { said: string; film: { title: string; year: number }; at: string } }))
      .filter((one) => filmKey(one.act.film) === filmKey(film))
      .sort((a, b) => a.act.at.localeCompare(b.act.at));

    const refOf = (one: (typeof mine)[number]) => String(one.root.handle.ref);
    if (which === "all") return mine.map(refOf);
    if (which === "withdrawal") return mine.filter((one) => one.act.said === "withdrawal").map(refOf);
    const verdicts = mine.filter((one) => one.act.said === "verdict");
    return which === "first" ? verdicts.slice(0, 1).map(refOf) : verdicts.slice(-1).map(refOf);
  }

  /* ---------------------------------------------------------- the crossing */

  /**
   * Two people with deliberately similar histories, and what one can do to the
   * other — including what it can *learn* by trying.
   *
   * The two controls are the point. A stranger who reaches for an act that is
   * somebody else's and one who reaches for an act nobody has must be told the
   * same thing, whole: same flag, same payload, same words. The one difference
   * allowed is the reference they themselves sent back to them, which tells them
   * nothing they did not already know, so it is blanked out of both answers
   * rather than excused.
   */
  async function cross(): Promise<Crossing> {
    const mine = toolsFor("google:memory-owner");
    const theirs = toolsFor("google:memory-stranger");
    const raw = (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) =>
      tools[name]!.handler(args);
    const ok = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) => {
      const result = await raw(tools, name, args);
      assert.equal(result.isError, undefined, `${name} refused — ${JSON.stringify(result)}`);
      return result.structuredContent as Record<string, unknown>;
    };

    /**
     * Both people's histories, from the scripts the gate reads.
     *
     * Driven here rather than written inline so that one description of what
     * each of them did serves both the doing and the expecting. The `default`
     * is the guard: a step kind added to a crossing script and not handled here
     * stops the suite rather than quietly doing nothing.
     */
    const live = async (tools: Record<string, Tool>, steps: readonly Step[]) => {
      let evening: string | undefined;
      for (const step of steps) {
        switch (step.act) {
          case "movie":
            await ok(tools, "create_movie", { ...step.film, state: step.state });
            break;
          case "verdict":
            await ok(tools, "record_verdict", {
              film: step.film,
              told: step.told,
              said: {
                about: "judgement",
                judgement: step.judgement,
                ...(step.because === undefined ? {} : { because: step.because }),
              },
            });
            break;
          case "evening": {
            const written = (await ok(tools, "record_episode", {
              request: step.request,
              offered: step.offered,
            })) as { episode: { id: string } };
            evening = written.episode.id;
            break;
          }
          default:
            throw new Error(`the crossing does not know how to perform ${step.act}`);
        }
      }
      return evening;
    };

    await live(theirs, STRANGER_HISTORY);
    const hersEveningId = await live(mine, OWNER_HISTORY);
    assert.ok(hersEveningId, "the owner's history recorded no evening to reach for");

    const before = (await ok(mine, "get_memory")) as unknown as Memory;
    const strangerBefore = (await ok(theirs, "get_memory")) as unknown as Memory;
    const ref = String(
      before.held.find((root) => root.of === "verdict")?.handle.ref ??
        before.remembered.find((root) => root.of === "verdict")?.handle.ref,
    );

    /** The whole answer, with the caller's own reference taken out of it. */
    const answerTo = (answer: Answer, sent: string): string =>
      JSON.stringify({
        isError: answer.isError ?? false,
        structuredContent: answer.structuredContent ?? null,
        content: answer.content ?? null,
      })
        .split(sent)
        .join("<what the caller sent>");

    const forgetting = {
      foreign: answerTo(await raw(theirs, "forget_verdict", { ref }), ref),
      unknown: answerTo(await raw(theirs, "forget_verdict", { ref: NOBODY_REF }), NOBODY_REF),
    };
    const correcting = {
      foreign: answerTo(
        await raw(theirs, "correct_episode", { episode: hersEveningId, request: "theirs instead" }),
        hersEveningId,
      ),
      unknown: answerTo(
        await raw(theirs, "correct_episode", { episode: NOBODY_EPISODE, request: "theirs instead" }),
        NOBODY_EPISODE,
      ),
    };

    const owner = (await ok(mine, "get_memory")) as unknown as Memory;
    const strangerAfter = (await ok(theirs, "get_memory")) as unknown as Memory;
    return {
      theirs: strangerAfter,
      owner,
      intact: JSON.stringify(before) === JSON.stringify(owner),
      strangerIntact: JSON.stringify(strangerBefore) === JSON.stringify(strangerAfter),
      forgetting,
      correcting,
    };
  }

  /* -------------------------------------------------------- the round trip */

  /**
   * Everything shown, changed by the handles it showed and nothing else.
   *
   * Every identifier used below is read out of `get_memory`. Nothing here asks a
   * store for an id, which is the whole proof: if the view did not hand over a
   * usable handle for an act, an evening and a film, this function could not
   * run at all. Each change has a neighbour of the same kind that nothing
   * touches, so *"the right one moved"* and *"only the right one moved"* are two
   * separate answers.
   */
  async function roundTrip(): Promise<Handled> {
    const tools = toolsFor("google:memory-round-trip");
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await tools[name]!.handler(args);
      assert.equal(result.isError, undefined, `${name} refused — ${JSON.stringify(result)}`);
      return result.structuredContent as Record<string, unknown>;
    };

    await call("create_movie", { ...FILMS.heat95, state: "liked" });
    await call("create_movie", { ...FILMS.zodiac, state: "liked" });
    await call("record_verdict", {
      film: FILMS.prisoners,
      told: "volunteered",
      said: { about: "judgement", judgement: "loved", because: "the one to forget" },
    });
    await call("record_verdict", {
      film: FILMS.blackBag,
      told: "confirmed",
      said: { about: "judgement", judgement: "disliked", because: "the one to leave alone" },
    });
    await call("record_episode", { request: "the night to put right", offered: [{ ...FILMS.heat95, lead: true }] });
    await call("record_episode", { request: "the night to leave alone", offered: [{ ...FILMS.zodiac, lead: true }] });

    const before = (await call("get_memory")) as unknown as Memory;
    const acts = [...before.held, ...before.remembered].filter((root) => root.of === "verdict");
    const verdictAbout = (film: { title: string; year: number }): Root => {
      const found = acts.find((root) => filmKey((root.act as { film: { title: string; year: number } }).film) === filmKey(film));
      assert.ok(found, `the view offered no act about ${film.title}`);
      return found;
    };
    const eveningCalled = (request: string): Root => {
      const found = before.remembered.find((root) => root.of === "evening" && root.request === request);
      assert.ok(found, `the view offered no evening called ${request}`);
      return found;
    };
    const filmCalled = (film: { title: string; year: number }): Root => {
      const found = before.held.find(
        (root) => root.of === "movie" && filmKey(root.film as { title: string; year: number }) === filmKey(film),
      );
      assert.ok(found, `the view offered no film called ${film.title}`);
      return found;
    };

    const used = {
      ref: String(verdictAbout(FILMS.prisoners).handle.ref),
      episode: String(eveningCalled("the night to put right").handle.id),
      film: {
        title: String(filmCalled(FILMS.heat95).handle.title),
        year: Number(filmCalled(FILMS.heat95).handle.year),
      },
    };
    const spared = {
      ref: String(verdictAbout(FILMS.blackBag).handle.ref),
      episode: String(eveningCalled("the night to leave alone").handle.id),
      film: { title: FILMS.zodiac.title, year: FILMS.zodiac.year },
    };

    // Only handles from the view, and no store in sight.
    await call("forget_verdict", { ref: used.ref });
    await call("correct_episode", { episode: used.episode, request: ROUND_TRIP.request });
    await call("update_movie", { title: used.film.title, year: used.film.year, state: ROUND_TRIP.state });

    return { before, after: (await call("get_memory")) as unknown as Memory, used, spared };
  }

  /* --------------------------------------------------------------- the tests */

  test("every history says what it proves, and none repeats another", () => {
    assert.equal(TRAJECTORIES.length, 27);
    for (const trajectory of TRAJECTORIES) {
      assert.ok(trajectory.proves.length > 20, `${trajectory.name} does not say what it proves`);
      assert.ok(trajectory.steps.length > 0);
    }
    assert.equal(new Set(TRAJECTORIES.map((one) => one.name)).size, TRAJECTORIES.length);
    assert.equal(new Set(GATES.map((one) => one.name)).size, GATES.length);
  });

  test("the histories between them exercise every root and every fate", () => {
    // A gate set that never drives a case cannot fail on it.
    const steps = TRAJECTORIES.flatMap((one) => one.steps);
    for (const act of ["genre", "mix", "movie", "verdict", "withdraw", "evening", "outcome", "amend", "forget", "question", "opportunity"]) {
      assert.ok(steps.some((step) => step.act === act), `no history ever performs ${act}`);
    }
    const verdicts = steps.filter((step) => step.act === "verdict");
    for (const reach of ["not-tonight", "not-ever"] as const) {
      assert.ok(verdicts.some((s) => s.act === "verdict" && s.reach === reach), `no history records ${reach}`);
    }
    for (const told of ["volunteered", "confirmed"] as const) {
      assert.ok(verdicts.some((s) => s.act === "verdict" && s.told === told), `no history records a ${told} claim`);
    }
    for (const which of ["first", "last", "withdrawal", "all"] as const) {
      assert.ok(steps.some((s) => s.act === "forget" && s.which === which), `no history forgets the ${which}`);
    }
    assert.ok(steps.some((s) => s.act === "amend" && s.refused === true), "no history is ever refused a correction");
  });

  test("the precedence matrix covers every state against every reach and every judgement", () => {
    // The matrix is generated, so what is checked here is that the generator
    // still enumerates what the policy is made of — a state or a reach added to
    // the product and not added to `STATES` shows up as a missing row.
    const filed = (name: string) =>
      TRAJECTORIES.find((one) => one.name === name)!.steps.filter((step) => step.act === "movie");
    const spoken = (name: string) =>
      TRAJECTORIES.find((one) => one.name === name)!.steps.filter((step) => step.act === "verdict");

    const states = ["liked", "loved", "disliked", "seen", "not_seen", null];
    for (const state of states) {
      assert.ok(
        filed("the-rejection-matrix").some((s) => s.act === "movie" && s.state === state),
        `the rejection matrix never files a film as ${String(state)}`,
      );
      assert.ok(
        filed("the-judgement-matrix").some((s) => s.act === "movie" && s.state === state),
        `the judgement matrix never files a film as ${String(state)}`,
      );
    }
    assert.equal(spoken("the-rejection-matrix").length, 12, "the rejection matrix is not every state against both reaches");
    assert.equal(spoken("the-judgement-matrix").length, 12, "the judgement matrix lost a row");

    // And the policy the replay states: four disagreements out of twelve
    // refusals, six out of twelve judgements.
    assert.equal(expected(TRAJECTORIES.find((one) => one.name === "the-rejection-matrix")!.steps).conflicts.length, 4);
    assert.equal(expected(TRAJECTORIES.find((one) => one.name === "the-judgement-matrix")!.steps).conflicts.length, 6);
  });

  test("the replay works out a refusal for itself rather than taking the script's word", () => {
    // Both halves have to agree: the script says which corrections the product
    // must refuse, and the replay decides for itself from the same rule. A
    // difference either way means one of the two descriptions has drifted.
    for (const trajectory of TRAJECTORIES) {
      const declared = trajectory.steps
        .map((step, at) => (step.act === "amend" && step.refused ? at : -1))
        .filter((at) => at !== -1);
      assert.deepEqual(
        expected(trajectory.steps).refusals,
        declared,
        `${trajectory.name}: the replay and the script disagree about which corrections are refused`,
      );
    }
  });

  test("M3 passes every gate", () => {
    const failures = gate(world);
    assert.deepEqual(
      failures,
      [],
      failures.map((one) => `${one.gate}/${one.trajectory}: ${one.detail}`).join("\n"),
    );
  });

  test("the limits of this evaluation are written down rather than assumed", () => {
    assert.equal(LIMITS.length, 5);
    assert.ok(LIMITS.some((limit) => limit.includes("blind sweep")), "the semantic half is not recorded");
    assert.ok(LIMITS.some((limit) => limit.includes("pending question")), "the one store-level seam is not recorded");
    assert.ok(
      LIMITS.some((limit) => limit.includes("source-level mutation")),
      "the fact that the gates are proved observationally is not recorded",
    );
  });

  test("nothing the gates expect is computed by the thing they test", () => {
    // The anti-circularity rule, enforced rather than promised. `gates.ts` holds
    // the replay, the signature builders, the expected taste model and the
    // placement logic, and the only production module it may reach is the
    // shared film identity — which is a settled rule with its own contracts in
    // Slice 3, and which gate L exists to prove every layer still consults. The
    // script is allowed to reach nothing at all.
    const read = (name: string) =>
      readFileSync(new URL(name, import.meta.url), "utf8")
        .split("\n")
        .filter((line) => /^import\b/u.test(line))
        .map((line) => /from "([^"]+)"/u.exec(line)?.[1] ?? "")
        .filter((from) => from.startsWith("."));

    assert.deepEqual(
      [...new Set(read("gates.ts"))].sort(),
      ["../../films/identity.ts", "./trajectories.ts"],
      "the gates reached for something the implementation decides",
    );
    assert.deepEqual(read("trajectories.ts"), [], "the script took a dependency");
  });

  /* ----------------------------------------------------------- the mutations */

  /**
   * The gates are only worth running if they can fail.
   *
   * Each probe corrupts the observed world the way the corresponding product
   * regression would corrupt it, names the gate meant to notice, and records
   * what actually died. Nothing product-side is touched — the world is a
   * structural copy — so these prove the gates rather than the system, which is
   * the honest claim to make about them and is written into `LIMITS`.
   *
   * Two rules hold for every probe below. It has to be a defect somebody could
   * plausibly ship — a swapped fate, a copied reason, a leaked existence — and
   * not merely an assertion forced false. And it has to kill through a gate's
   * own comparison rather than by making something throw.
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

  const drop = (memory: Memory, kind: string) => {
    memory.held = memory.held.filter((root) => root.of !== kind);
    memory.remembered = memory.remembered.filter((root) => root.of !== kind);
  };
  const verdictsIn = (memory: Memory) =>
    [...memory.held, ...memory.remembered].filter((root) => root.of === "verdict");
  const saidIs = (root: Root, what: string) => (root.act as { said: string }).said === what;

  /* -- what a whole class of root going missing looks like ------------------ */

  test("dropping evenings from the memory view is caught", () => {
    probe("the evenings are not composed", "fidelity", (copy) => {
      drop(copy.seen["many-evenings"]!.memory, "evening");
    });
  });

  test("keeping only the newest evenings is caught", () => {
    probe("older evenings are truncated", "fidelity", (copy) => {
      const seen = copy.seen["many-evenings"]!;
      const evenings = seen.memory.remembered.filter((root) => root.of === "evening");
      seen.memory.remembered = [
        ...seen.memory.remembered.filter((root) => root.of !== "evening"),
        ...evenings.slice(-2),
      ];
    });
  });

  test("dropping the history of what they stopped saying is caught", () => {
    probe("superseded and withdrawn acts are forgotten", "fidelity", (copy) => {
      drop(copy.seen["everything-they-stopped-saying"]!.memory, "verdict");
    });
  });

  /* -- a root that keeps its count and loses its content --------------------- */

  test("a mix that keeps its name and loses its meaning is caught", () => {
    probe("a root's content drifts under an unchanged count", "fidelity", (copy) => {
      const mix = copy.seen["one-of-everything"]!.memory.held.find((root) => root.of === "mix")!;
      mix.instruction = "whatever the recommender felt like";
    });
  });

  test("a mix that loses the films in it is caught", () => {
    probe("mix membership is dropped on the way out", "fidelity", (copy) => {
      const mix = copy.seen["one-of-everything"]!.memory.held.find((root) => root.of === "mix")!;
      mix.films = [];
    });
  });

  test("a film that loses its IMDb id is caught", () => {
    probe("a film's outbound pointer is dropped", "fidelity", (copy) => {
      const movie = copy.seen["one-of-everything"]!.memory.held.find(
        (root) => root.of === "movie" && root.imdbId !== null,
      )!;
      movie.imdbId = null;
    });
  });

  test("a film that loses the mixes it is in is caught", () => {
    probe("a film's mix membership is dropped", "fidelity", (copy) => {
      const movie = copy.seen["one-of-everything"]!.memory.held.find(
        (root) => root.of === "movie" && (root.mixes as string[]).length > 0,
      )!;
      movie.mixes = [];
    });
  });

  test("a verdict retitled to a spelling that means the same film is caught", () => {
    probe("a film's name is rewritten into an equal one", "fidelity", (copy) => {
      const act = copy.seen["one-of-everything"]!.memory.held.find((root) => root.of === "verdict")!;
      // The same film by the one identity rule, and not the words they typed.
      (act.act as { film: { title: string } }).film.title = "PRISONERS";
    });
  });

  test("a film refiled under a state nobody chose is caught", () => {
    probe("a saved film's state is rewritten", "fidelity", (copy) => {
      const movie = copy.seen["one-of-everything"]!.memory.held.find((root) => root.of === "movie")!;
      movie.state = "disliked";
    });
  });

  /* -- fates that swap while the counts hold -------------------------------- */

  test("promoting an evening into what Tonight holds is caught", () => {
    probe("an evening becomes something held", "placement", (copy) => {
      const seen = copy.seen["one-of-everything"]!;
      const evening = seen.memory.remembered.find((root) => root.of === "evening")!;
      seen.memory.remembered = seen.memory.remembered.filter((root) => root !== evening);
      evening.placement = "held";
      seen.memory.held.push(evening);
    });
  });

  test("treating a withdrawn verdict as current is caught", () => {
    probe("a silenced claim is held", "placement", (copy) => {
      const seen = copy.seen["everything-they-stopped-saying"]!;
      const act = seen.memory.remembered.find((root) => root.of === "verdict" && saidIs(root, "verdict"))!;
      seen.memory.remembered = seen.memory.remembered.filter((root) => root !== act);
      act.placement = "held";
      seen.memory.held.push(act);
    });
  });

  test("two acts exchanging what became of them is caught", () => {
    probe("a held and a remembered claim swap places", "placement", (copy) => {
      const seen = copy.seen["a-long-history"]!;
      const held = seen.memory.held.find((root) => root.of === "verdict")!;
      const past = seen.memory.remembered.find((root) => root.of === "verdict" && saidIs(root, "verdict"))!;
      seen.memory.held = [
        ...seen.memory.held.filter((root) => root !== held),
        { ...past, placement: "held", basis: { ...past.basis, became: "current" } },
      ];
      seen.memory.remembered = [
        ...seen.memory.remembered.filter((root) => root !== past),
        { ...held, placement: "remembered", basis: { ...held.basis, became: "superseded" } },
      ];
    });
  });

  test("relabelling what became of a claim is caught", () => {
    probe("a superseded claim is called withdrawn", "traceability", (copy) => {
      const seen = copy.seen["everything-they-stopped-saying"]!;
      const act = verdictsIn(seen.memory).find(
        (root) => (root.basis as { became?: string }).became === "superseded",
      )!;
      (act.basis as { became?: string }).became = "withdrawn";
    });
  });

  test("a corrected evening that still claims Tonight heard it is caught", () => {
    probe("provenance does not move with a correction", "traceability", (copy) => {
      const evening = copy.seen["the-night-was-wrong"]!.memory.remembered.find((root) => root.of === "evening")!;
      evening.requestSource = "observed";
    });
  });

  test("a stored instant replaced by a plausible one is caught", () => {
    probe("a saved root's change time is fabricated", "traceability", (copy) => {
      const genre = copy.seen["one-of-everything"]!.memory.held.find((root) => root.of === "genre")!;
      (genre.basis as Record<string, unknown>).changedAt = "2020-01-01T00:00:00.000Z";
    });
  });

  test("an evening whose recording time is invented is caught", () => {
    probe("an evening's recording time is fabricated", "traceability", (copy) => {
      const evening = copy.seen["one-of-everything"]!.memory.remembered.find((root) => root.of === "evening")!;
      (evening.basis as Record<string, unknown>).recordedAt = "2020-01-01T00:00:00.000Z";
    });
  });

  test("a score hidden inside what they asserted is caught", () => {
    probe("a claim is scored from the inside", "traceability", (copy) => {
      const act = copy.seen["one-of-everything"]!.memory.held.find((root) => root.of === "verdict")!;
      (act.act as { assertion: Record<string, unknown> }).assertion.score = 0.87;
    });
  });

  test("scoring a memory is caught", () => {
    probe("a root acquires a confidence", "traceability", (copy) => {
      const root = copy.seen["one-of-everything"]!.memory.held[0]!;
      (root.basis as Record<string, unknown>).confidence = 0.9;
    });
  });

  /* -- beliefs nobody gave it ------------------------------------------------ */

  test("turning repeated evenings into a preference is caught", () => {
    probe("history becomes taste", "no-unauthored-belief", (copy) => {
      const seen = copy.seen["nothing-was-concluded"]!;
      const film = seen.memory.held.find((root) => root.of === "movie")!;
      seen.memory.held.push({ ...structuredClone(film), name: "Tense Nights", of: "genre" });
    });
  });

  test("a verdict nobody said, wearing a real verdict's clothes, is caught", () => {
    probe("an invented claim with a valid shape is held", "no-unauthored-belief", (copy) => {
      const seen = copy.seen["one-of-everything"]!;
      const real = seen.memory.held.find((root) => root.of === "verdict")!;
      const invented = structuredClone(real);
      (invented.act as { film: unknown }).film = { title: "Zodiac", year: 2007 };
      invented.handle = { by: "ref", ref: "11111111-1111-4111-8111-111111111111" };
      seen.memory.held.push(invented);
    });
  });

  /* -- precedence, and the matrix it is made of ------------------------------ */

  test("removing the verdict's precedence over a saved state is caught", () => {
    probe("the disagreement is not explained", "precedence", (copy) => {
      copy.seen["a-verdict-against-a-state"]!.memory.operative = [];
    });
  });

  test("losing one row of the rejection matrix is caught", () => {
    probe("a refusal over a loved film stops being a disagreement", "precedence", (copy) => {
      const seen = copy.seen["the-rejection-matrix"]!;
      seen.memory.operative = seen.memory.operative.filter((one) => one.saved.state !== "loved");
    });
  });

  test("inventing a row of the judgement matrix is caught", () => {
    probe("a judgement that agrees with the state is called a disagreement", "precedence", (copy) => {
      const seen = copy.seen["the-judgement-matrix"]!;
      const real = seen.memory.operative[0]!;
      seen.memory.operative = [...seen.memory.operative, structuredClone(real)];
    });
  });

  test("making an evening's refusal global is caught", () => {
    probe("not-tonight is promoted to everywhere", "precedence", (copy) => {
      const conflict = copy.seen["not-on-a-tuesday"]!.memory.operative[0]!;
      conflict.where = "everywhere";
    });
  });

  test("reading a refusal as a dislike is caught", () => {
    probe("a rejection is translated", "precedence", (copy) => {
      const conflict = copy.seen["never-again"]!.memory.operative[0]!;
      conflict.governing.act = {
        ...conflict.governing.act,
        assertion: { about: "judgement", judgement: "disliked", because: null },
      };
    });
  });

  test("failing to restore the saved state after a taking-back is caught", () => {
    probe("the overlay outlives the claim", "precedence", (copy) => {
      const seen = copy.seen["the-state-comes-back"]!;
      const other = copy.seen["a-verdict-against-a-state"]!;
      seen.memory.operative = structuredClone(other.memory.operative);
    });
  });

  /* -- forgetting one thing, and only that thing ----------------------------- */

  test("failing to bring back the claim a taking-back silenced is caught", () => {
    probe("forgetting a taking-back changes nothing", "forgetting", (copy) => {
      const seen = copy.seen["forget-the-taking-back"]!;
      const act = seen.memory.held.find((root) => root.of === "verdict")!;
      seen.memory.held = seen.memory.held.filter((root) => root !== act);
      act.placement = "remembered";
      seen.memory.remembered.push(act);
    });
  });

  test("a surviving act coming back under a new reference is caught", () => {
    probe("forgetting regenerates the references of what is left", "forgetting", (copy) => {
      const seen = copy.seen["forget-the-first"]!;
      const survivor = verdictsIn(seen.memory)[0]!;
      survivor.handle = { by: "ref", ref: "22222222-2222-4222-8222-222222222222" };
    });
  });

  test("a surviving act coming back in different words is caught", () => {
    probe("forgetting rewrites what is left", "forgetting", (copy) => {
      const seen = copy.seen["forget-the-second"]!;
      const survivor = verdictsIn(seen.memory).find((root) => saidIs(root, "verdict"))!;
      (survivor.act as { told: string }).told = "confirmed";
    });
  });

  test("forgetting an act touching the film underneath it is caught", () => {
    probe("forgetting moves the saved film's stored instant", "forgetting", (copy) => {
      const movie = copy.seen["forget-the-first"]!.memory.held.find((root) => root.of === "movie")!;
      (movie.basis as Record<string, unknown>).changedAt = "2030-01-01T00:00:00.000Z";
    });
  });

  /* -- a correction that takes, and one that must not ------------------------ */

  test("an evening whose correction did not take is caught", () => {
    probe("the old request survives", "correcting", (copy) => {
      const evening = copy.seen["the-night-was-wrong"]!.memory.remembered.find((root) => root.of === "evening")!;
      evening.request = "something tense";
    });
  });

  test("a refused correction that took half of itself is caught", () => {
    probe("an illegal correction is applied in part", "correcting", (copy) => {
      const evening = copy.seen["the-correction-was-refused"]!.atomicity!.after.remembered.find(
        (root) => root.of === "evening",
      )!;
      evening.offered = [];
      evening.offeredSource = "stated";
    });
  });

  test("a kept choice still wearing the old offer's description is caught", () => {
    probe("a retained choice is not rebound to the corrected list", "correcting", (copy) => {
      const evening = copy.seen["the-offer-changed-under-the-choice"]!.memory.remembered.find(
        (root) => root.of === "evening",
      )!;
      (evening.chosen as { value: { lead: boolean } }).value.lead = true;
    });
  });

  /* -- what a recommendation is allowed to read ------------------------------ */

  test("letting an evening reach the taste model is caught", () => {
    probe("recommendation reads history", "recommendation-isolation", (copy) => {
      const seen = copy.seen["many-evenings"]!;
      (seen.taste as unknown as { episodes: unknown[] }).episodes = [];
    });
  });

  test("letting a superseded claim govern a recommendation is caught", () => {
    probe("a replaced claim is still evidence", "recommendation-isolation", (copy) => {
      const seen = copy.seen["a-long-history"]!;
      seen.taste.verdicts = [...(seen.taste.verdicts ?? []), { title: "Zodiac", year: 2007, judgement: "liked" }];
    });
  });

  test("copying a superseded claim's words onto the current one is caught", () => {
    probe("a replaced reason is carried forward", "recommendation-isolation", (copy) => {
      const seen = copy.seen["a-long-history"]!;
      const zodiac = (seen.taste.verdicts ?? []).find((one) => one.title === "Zodiac")!;
      zodiac.judgement = "liked";
      delete zodiac.because;
    });
  });

  test("an evening changing what a recommendation thinks of a film is caught", () => {
    probe("history moves a Movie state without leaving an episode behind", "recommendation-isolation", (copy) => {
      const movie = copy.seen["nothing-was-concluded"]!.taste.movies[0]!;
      movie.state = "loved";
    });
  });

  test("an evening's refusal reported as a standing one is caught", () => {
    // The killer Gate H was missing. A `not-tonight` governs in its own evening
    // and nowhere else; projected as `everywhere` it reads as a standing fact
    // about the person, which is the mood-into-preference failure the scope
    // exists to prevent. The gate derives the expected scope from the script's
    // own conflict, so it disagrees with this and says where.
    probe("an evening's refusal is widened to everywhere", "recommendation-isolation", (copy) => {
      const seen = copy.seen["not-on-a-tuesday"]!;
      const clash = seen.taste.disagreements![0]!;
      clash.applies = "everywhere";
    });
  });

  test("dropping the disagreements a recommendation is told about is caught", () => {
    // The gap itself: before this, production could stop answering with
    // disagreements and every gate would still pass.
    probe("the disagreement projection disappears", "recommendation-isolation", (copy) => {
      delete copy.seen["not-on-a-tuesday"]!.taste.disagreements;
    });
  });

  test("an empty disagreement list where the field should be absent is caught", () => {
    // Absent and empty are two different answers: one says nothing disagrees,
    // the other says so in a payload shape the contract does not use.
    probe("nothing disagrees, and the read says so anyway", "recommendation-isolation", (copy) => {
      copy.seen["one-of-everything"]!.taste.disagreements = [];
    });
  });

  /* -- reading is not writing ------------------------------------------------ */

  test("a memory read that consumes operational state is caught", () => {
    probe("reading spends a question", "read-purity", (copy) => {
      copy.seen["waiting-to-ask"]!.after.questions = [];
    });
  });

  test("a memory read that moves a timestamp and nothing else is caught", () => {
    probe("reading touches a row and leaves its content alone", "read-purity", (copy) => {
      const taste = copy.seen["one-of-everything"]!.after.taste as { genres: { updatedAt: string }[] };
      taste.genres[0]!.updatedAt = "2999-01-01T00:00:00.000Z";
    });
  });

  /* -- what Tonight is waiting to ask ---------------------------------------- */

  test("a pending question reaching the memory view is caught", () => {
    probe("what Tonight wants to ask becomes memory", "pending-state", (copy) => {
      const seen = copy.seen["waiting-to-ask"]!;
      const root = structuredClone(seen.memory.held[0]!);
      root.of = "question";
      seen.memory.remembered.push(root);
    });
  });

  test("a pending question changing what a recommendation reads is caught", () => {
    probe("operational state reaches the taste model", "pending-state", (copy) => {
      copy.seen["waiting-to-ask"]!.taste.genres.push({ name: "Waiting", instruction: "because a question is open" });
    });
  });

  /* -- one person's memory is not another's ---------------------------------- */

  test("another user's roots appearing is caught", () => {
    probe("a stranger sees somebody else's memory", "user-isolation", (copy) => {
      copy.crossing.theirs = structuredClone(copy.crossing.owner);
    });
  });

  test("a foreign reference answering differently is caught", () => {
    probe("forgetting becomes an existence oracle", "user-isolation", (copy) => {
      copy.crossing.forgetting.foreign = '{"isError":true,"structuredContent":null,"content":null}';
    });
  });

  test("a foreign evening answering in the same shape but different words is caught", () => {
    probe("correcting becomes an existence oracle", "user-isolation", (copy) => {
      copy.crossing.correcting.foreign = copy.crossing.correcting.unknown.replace(
        "No episode",
        "That evening is not yours",
      );
    });
  });

  test("another user's row that looks exactly like your own is caught", () => {
    probe("an identical-looking film is appended from somebody else", "user-isolation", (copy) => {
      const hers = copy.crossing.owner.held.find((root) => root.of === "movie")!;
      // Filed identically by both of them, so nothing about the row itself gives
      // it away. Only the count does.
      copy.crossing.theirs.held.push(structuredClone(hers));
    });
  });

  /* -- one film is one film -------------------------------------------------- */

  test("two spellings of one film becoming two governors is caught", () => {
    probe("one layer folds a title its own way", "film-identity", (copy) => {
      const seen = copy.seen["one-film-many-spellings"]!;
      const act = seen.memory.remembered.find((root) => root.of === "verdict")!;
      seen.memory.remembered = seen.memory.remembered.filter((root) => root !== act);
      act.placement = "held";
      seen.memory.held.push(act);
    });
  });

  test("a remake merged with its original is caught", () => {
    probe("the year stops being part of a film's name", "film-identity", (copy) => {
      const seen = copy.seen["a-remake-is-another-film"]!;
      seen.memory.held = seen.memory.held.filter(
        (root) => !(root.of === "movie" && (root.film as { year: number }).year === 1995),
      );
    });
  });

  test("a case pair one rule calls two films is caught", () => {
    probe("a collation's answer comes back for Ⱟ and ⱟ", "film-identity", (copy) => {
      const seen = copy.seen["unicode-is-not-a-collation"]!;
      // Matched by the one identity rule: the film was saved in upper case and
      // spoken about in lower, so a title comparison would find neither.
      seen.memory.operative = seen.memory.operative.filter(
        (one) => filmKey(one.film) !== filmKey(UNICODE_FILMS.upper),
      );
    });
  });

  /* -- everything shown can be reached --------------------------------------- */

  test("dropping a public reference is caught", () => {
    probe("an act cannot be pointed at", "correction-handles", (copy) => {
      const act = copy.seen["one-of-everything"]!.memory.held.find((root) => root.of === "verdict")!;
      act.handle = { by: "film", title: "Prisoners", year: 2013 };
    });
  });

  test("a handle that names the wrong root is caught", () => {
    probe("a correction would land on the neighbour", "correction-handles", (copy) => {
      const genres = copy.seen["one-of-everything"]!.memory.held.filter((root) => root.of === "genre");
      genres[0]!.handle = { by: "name", name: String(genres[1]!.name) };
    });
  });

  test("a correction by a discovered handle that does not take is caught", () => {
    probe("the handle the view gave reaches nothing", "correction-handles", (copy) => {
      const night = copy.handled.after.remembered.find(
        (root) => root.of === "evening" && root.handle.id === copy.handled.used.episode,
      )!;
      night.request = "the night to put right";
      night.requestSource = "observed";
    });
  });

  test("leaking the write order is caught", () => {
    probe("persistence machinery reaches the view", "correction-handles", (copy) => {
      const act = copy.seen["one-of-everything"]!.memory.held.find((root) => root.of === "verdict")!;
      (act as Record<string, unknown>).order = 7;
    });
  });

  /* -- the whole picture ------------------------------------------------------ */

  test("a thinner whole picture is caught", () => {
    probe("the long history loses its mixes", "whole-picture", (copy) => {
      drop(copy.seen["a-long-history"]!.memory, "mix");
    });
  });

  /* --------------------------------------------------------- what was killed */

  test("every gate has a mutation that actually killed it", () => {
    // Derived from the probes that ran rather than from a restated list: a gate
    // registered with nothing able to break it fails here, and so does a probe
    // that turned out to be equivalent.
    const killed = new Set(
      probes.filter((one) => one.caught.includes(one.intended)).map((one) => one.intended),
    );
    const registered = GATES.map((one) => one.name);
    assert.deepEqual(
      registered.filter((name) => !killed.has(name)),
      [],
      "these gates have no mutation that can make them fail",
    );
    assert.deepEqual(
      probes.filter((one) => one.caught.length === 0).map((one) => one.mutation),
      [],
      "these mutations killed nothing and are equivalent",
    );
    assert.equal(
      new Set(probes.map((one) => one.mutation)).size,
      probes.length,
      "two probes describe the same defect",
    );
  });
});
