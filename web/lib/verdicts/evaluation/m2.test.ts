import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../../db/driver.ts";
import { migrate } from "../../db/migrate.ts";
import { embeddedDriver } from "../../db/pglite.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../../episodes/store/sql.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import { tonightMcpServer } from "../../mcp/server.ts";
import { TASTE_SCHEMA, sqlTasteStore } from "../../taste/store/sql.ts";
import { askAbout } from "../questions.ts";
import { QUESTIONS_SCHEMA, sqlQuestionStore } from "../questions/sql.ts";
import { VERDICTS_SCHEMA, sqlVerdictStore } from "../store/sql.ts";
import {
  GATES,
  filmKey,
  gate,
  LIMITS,
  type Asked,
  type Crossing,
  type Observed,
  type Question,
  type Surface,
  type Taste,
  type World,
} from "./gates.ts";
import { sqlReflectionStore } from "../../reflection/store/sql.ts";
import {
  BASELINE,
  FILMS,
  TRAJECTORIES,
  TUESDAY,
  WEDNESDAY,
  filmsIn,
  type Trajectory,
} from "./trajectories.ts";

/**
 * M2's evaluation: only what they said counts, and it counts as they said it.
 *
 * Every trajectory is driven through the **public MCP tools**, because that is
 * the surface a host agent reaches, and what an agent is handed is the whole
 * question of this milestone.
 *
 * One exception, and it is declared in `LIMITS` rather than hidden here: nothing
 * in the tool surface opens a question yet, so the question trajectories reach
 * `questions.open` directly. Backdating is the reason it has to be that way —
 * every tool takes its instant from the server, which is what stops a caller
 * forging one, and an expiry gate needs a question that is genuinely old.
 *
 * Each trajectory runs as its own user, starting from `BASELINE`: the same
 * genres, mix and unrelated film for everybody. A verdict history is
 * append-only, so there is no forgetting between runs the way M1 had; a fresh
 * slate is a fresh person. That also makes the paired gates honest — the two
 * halves of a pair are two people who did different things, not one person at
 * two moments.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

type Tool = {
  handler: (args: Record<string, unknown>) => Promise<{
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  }>;
};

const DAY = 86_400_000;

/** The modules M2 added, as gate 8 reads them. */
const M2_SOURCES = [
  "../model.ts",
  "../store.ts",
  "../store/sql.ts",
  "../store/schema.ts",
  "../questions.ts",
  "../questions/sql.ts",
  "../questions/schema.ts",
  "../../mcp/server.ts",
] as const;

/** Every mutation run in this file, and what it actually killed. */
type Probe = { mutation: string; intended: string; caught: string[] };

describe("M2 — only what they said", () => {
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
        reflection: sqlReflectionStore(driver, asUser(who)),
      }) as unknown as { _registeredTools: Record<string, Tool> }
    )._registeredTools;

  before(async () => {
    driver = await embeddedDriver();
    for (const schema of [TASTE_SCHEMA, EPISODES_SCHEMA, VERDICTS_SCHEMA, QUESTIONS_SCHEMA]) {
      await migrate(driver, schema);
    }

    const seen: Record<string, Observed> = {};
    for (const trajectory of TRAJECTORIES) {
      seen[trajectory.name] = await walk(trajectory);
    }

    world = { seen, crossing: await cross(), surface: surface() };
  });

  after(async () => {
    await driver.close();
  });

  /* ------------------------------------------------------------- the driver */

  async function walk(trajectory: Trajectory): Promise<Observed> {
    const who = `google:${trajectory.name}`;
    const tools = toolsFor(who);
    const questions = sqlQuestionStore(driver, asUser(who));

    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await tools[name]!.handler(args);
      assert.equal(
        result.isError,
        undefined,
        `${trajectory.name}: ${name} refused — ${JSON.stringify(result)}`,
      );
      return result.structuredContent as Record<string, unknown>;
    };
    const taste = async (): Promise<Taste> => (await call("get_taste")) as unknown as Taste;
    const open = async (): Promise<Question[]> =>
      ((await call("get_open_questions")) as unknown as { questions: Question[] }).questions;

    // The taste everybody starts from. Genres and a mix are here so that a
    // rejection generalising into a category has somewhere to land where a gate
    // can see it; without them "nothing else moved" would be a claim about an
    // empty room.
    for (const genre of BASELINE.genres) await call("create_genre", { ...genre });
    for (const mix of BASELINE.mixes) await call("create_mix", { ...mix });
    for (const movie of BASELINE.movies) await call("create_movie", { ...movie });
    // The baseline opinion, as an opinion is written now. It used to be a field
    // on the film above; when it stopped being one, the tool dropped it in
    // silence and every user's baseline lost the thing the neighbouring-film
    // gates exist to protect.
    for (const one of BASELINE.said) {
      await call("record_verdict", {
        film: one.film,
        told: one.told,
        said: { about: "judgement", judgement: one.judgement },
      });
    }

    // Leading `viewing` steps are what the trajectory starts from rather than
    // part of it, so the baseline is read once they have been applied.
    for (const step of trajectory.steps) {
      if (step.act === "viewing") await call("create_movie", { ...step.film, viewing: step.viewing });
    }
    const before = await taste();
    const checkpoints: Taste[] = [before];

    let episode: string | undefined;
    let lead: { title: string; year: number } | undefined;

    for (const step of trajectory.steps) {
      if (step.act === "viewing") continue;
      if (step.act === "recommend") {
        lead = step.film;
        const written = await call("record_episode", {
          request: `something like ${step.film.title}`,
          offered: [{ ...step.film, lead: true }],
        });
        episode = (written as { episode: { id: string } }).episode.id;
      } else if (step.act === "outcome") {
        await call("correct_episode", {
          episode,
          ...(step.chose === undefined ? {} : { chosen: step.chose ? lead : null }),
          ...(step.watched === undefined ? {} : { watched: step.watched }),
          ...(step.finished === undefined ? {} : { finished: step.finished }),
        });
      } else if (step.act === "verdict") {
        const said =
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
              };
        await call("record_verdict", { film: step.film, told: step.told, said });
      } else if (step.act === "withdraw") {
        await call("withdraw_verdict", {
          film: step.film,
          ...(step.occasion === undefined ? {} : { occasion: step.occasion }),
        });
      } else if (step.act === "question") {
        // The one store-level step. See the note at the head of this file.
        await questions.open(
          askAbout(step.film, new Date(Date.now() - step.daysAgo * DAY).toISOString()),
        );
      } else {
        await call("record_opportunity", { film: step.film });
      }
      // After every step, not only at the end: a trajectory is invariant only if
      // it was invariant at each point along it.
      checkpoints.push(await taste());
    }

    const asked: Record<string, Asked> = {};
    const askedAt: Record<string, Asked> = {};
    for (const film of filmsIn(trajectory)) {
      asked[filmKey(film)] = (await call("get_verdicts", { film })) as unknown as Asked;
      for (const occasion of [TUESDAY, WEDNESDAY]) {
        askedAt[`${filmKey(film)} @ ${occasion}`] = (await call("get_verdicts", {
          film,
          occasion,
        })) as unknown as Asked;
      }
    }

    return {
      trajectory,
      before,
      after: await taste(),
      checkpoints,
      pending: await open(),
      pendingAgain: await open(),
      asked,
      askedAt,
    };
  }

  /* ---------------------------------------------------------- the crossing */

  /** What a second user can see of, or do to, the first user's claims. */
  async function cross(): Promise<Crossing> {
    const mine = toolsFor("google:owner");
    const theirs = toolsFor("google:stranger");
    const call = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) =>
      (await tools[name]!.handler(args)).structuredContent as Record<string, unknown>;

    await call(mine, "record_verdict", {
      film: FILMS.prisoners,
      told: "volunteered",
      said: { about: "judgement", judgement: "loved", because: "the tension never lets up" },
    });
    await sqlQuestionStore(driver, asUser("google:owner")).open(
      askAbout(FILMS.heat, new Date().toISOString()),
    );
    const before = ((await call(mine, "get_taste")) as unknown as Taste).verdicts ?? [];

    const strangersTaste = (await call(theirs, "get_taste")) as unknown as Taste;
    const strangersQuestions = (await call(theirs, "get_open_questions")) as unknown as {
      questions: Question[];
    };
    const asked = (await call(theirs, "get_verdicts", {
      film: FILMS.prisoners,
    })) as unknown as Asked;

    // The stranger says their own thing about the same film, and takes back a
    // claim they never made. Neither may reach the owner.
    await call(theirs, "record_verdict", {
      film: FILMS.prisoners,
      told: "volunteered",
      said: { about: "judgement", judgement: "disliked" },
    });
    await call(theirs, "withdraw_verdict", { film: FILMS.prisoners });
    await call(theirs, "record_opportunity", { film: FILMS.heat });

    const stillMine = ((await call(mine, "get_taste")) as unknown as Taste).verdicts ?? [];
    return {
      leakedVerdicts: strangersTaste.verdicts ?? [],
      leakedQuestions: strangersQuestions.questions,
      asked,
      intact: JSON.stringify(before) === JSON.stringify(stillMine),
      stillMine,
    };
  }

  function surface(): Surface {
    const sources: Record<string, string> = {};
    for (const file of M2_SOURCES) {
      sources[file] = readFileSync(new URL(file, import.meta.url), "utf8");
    }
    return { tools: Object.keys(toolsFor("google:surface")), sources };
  }

  /* --------------------------------------------------------------- the tests */

  test("every trajectory names the invariant it proves", () => {
    assert.equal(TRAJECTORIES.length, 21);
    for (const trajectory of TRAJECTORIES) {
      assert.ok(trajectory.proves.length > 20, `${trajectory.name} does not say what it proves`);
      assert.ok(trajectory.steps.length > 0);
      // Setup is setup: the baseline is read once the leading viewings are in,
      // so one arriving later would be silently reordered.
      const firstAct = trajectory.steps.findIndex((step) => step.act !== "viewing");
      assert.ok(
        firstAct === -1 || !trajectory.steps.slice(firstAct).some((step) => step.act === "viewing"),
        `${trajectory.name} files a viewing after the trajectory has begun`,
      );
    }
    assert.equal(new Set(TRAJECTORIES.map((one) => one.name)).size, TRAJECTORIES.length);
  });

  test("every act a verdict can undergo is exercised somewhere", () => {
    // A gate set that never drives a transition cannot fail on it.
    const steps = TRAJECTORIES.flatMap((trajectory) => trajectory.steps);
    const verdicts = steps.filter((step) => step.act === "verdict");

    for (const judgement of ["liked", "loved", "disliked"] as const) {
      assert.ok(
        verdicts.some((step) => step.act === "verdict" && step.judgement === judgement),
        `no trajectory ever records ${judgement}`,
      );
    }
    for (const reach of ["not-tonight", "not-ever"] as const) {
      assert.ok(
        verdicts.some((step) => step.act === "verdict" && step.reach === reach),
        `no trajectory ever records ${reach}`,
      );
    }
    for (const told of ["volunteered", "confirmed"] as const) {
      assert.ok(
        verdicts.some((step) => step.act === "verdict" && step.told === told),
        `no trajectory ever records a ${told} verdict`,
      );
    }
    assert.ok(steps.some((step) => step.act === "withdraw"), "nothing is ever taken back");
    assert.ok(steps.some((step) => step.act === "opportunity"), "no chance ever goes by");
    assert.ok(
      verdicts.some((step) => step.act === "verdict" && (step.because ?? step.reason) !== undefined),
      "no reason is ever given, so fidelity is never tested",
    );
    assert.ok(
      verdicts.some((step) => step.act === "verdict" && (step.because ?? step.reason) === undefined),
      "no verdict is ever given without a reason, so absence is never tested",
    );
  });

  test("both expiry limits are exercised at their boundary and crossed with each other", () => {
    // The plausible wrong rule is "time only counts once the chances are used
    // up". Ruling it out needs the day limit reached at several chance counts,
    // and the chance limit reached well inside the days.
    const ages = (name: string) => {
      const steps = TRAJECTORIES.find((one) => one.name === name)?.steps ?? [];
      const question = steps.find((step) => step.act === "question");
      return {
        days: question?.act === "question" ? question.daysAgo : undefined,
        chances: steps.filter((step) => step.act === "opportunity").length,
      };
    };
    assert.deepEqual(ages("question-still-waiting"), { days: 29, chances: 2 });
    assert.deepEqual(ages("question-out-of-time"), { days: 30, chances: 0 });
    assert.deepEqual(ages("question-out-of-time-after-one-chance"), { days: 30, chances: 1 });
    assert.deepEqual(ages("question-out-of-time-after-two-chances"), { days: 30, chances: 2 });
    assert.deepEqual(ages("question-out-of-chances"), { days: 1, chances: 3 });
  });

  test("the influence trajectories are prefixes of one another", () => {
    // What makes "compare at every step" meaningful: each path is the one before
    // it plus one more thing, so a gate failure names the step that moved.
    const stepsOf = (name: string) =>
      (TRAJECTORIES.find((one) => one.name === name)?.steps ?? []).filter(
        (step) => step.act !== "viewing",
      );
    const chain = [
      "influence-baseline",
      "influence-recommended-once",
      "influence-chosen",
      "influence-watched",
      "influence-finished",
    ];
    for (const [at, name] of chain.entries()) {
      if (at === 0) continue;
      const shorter = stepsOf(chain[at - 1]!);
      const longer = stepsOf(name);
      assert.ok(longer.length > shorter.length, `${name} adds nothing to ${chain[at - 1]!}`);
      assert.deepEqual(longer.slice(0, shorter.length), shorter, `${name} is not a prefix extension`);
    }
    assert.equal(
      stepsOf("influence-recommended-again").filter((step) => step.act === "recommend").length,
      3,
    );
  });

  test("M2 passes every gate", () => {
    const failures = gate(world);
    assert.deepEqual(
      failures,
      [],
      failures.map((one) => `${one.gate}/${one.trajectory}: ${one.detail}`).join("\n"),
    );
  });

  test("the limits of this evaluation are written down rather than assumed", () => {
    assert.equal(LIMITS.length, 4);
    for (const mark of ["blind sweep", "opens a question", "no Observation"]) {
      assert.ok(
        LIMITS.some((limit) => limit.includes(mark)),
        `the limit about "${mark}" is not recorded`,
      );
    }
  });

  /* ----------------------------------------------------------- the mutations */

  /**
   * The gates are only worth running if they can fail.
   *
   * Each probe corrupts one observation the way the corresponding defect would
   * corrupt it, names the gate that is supposed to notice, and records what
   * actually died. Nothing product-side is touched — the world is rebuilt from a
   * structural copy — so these prove the gates, not the system.
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

  const prisoners = filmKey(FILMS.prisoners);

  test("a recommended-and-watched evening creating taste evidence is caught", () => {
    probe("an evening becomes a verdict", "self-confirmation", (copy) => {
      copy.seen["self-recommended-and-watched"]!.after.verdicts = [
        { title: "Prisoners", year: 2013, judgement: "loved", told: "volunteered" },
      ];
    });
  });

  test("the positive control fails when verdicts stop reaching the answer", () => {
    // Without this, "an evening changed nothing" would also be true of a system
    // that had stopped listening to the user entirely.
    probe("verdicts stop reaching the answer", "self-confirmation", (copy) => {
      copy.seen["self-and-they-said-so"]!.after.verdicts = [];
    });
  });

  test("a withdrawn verdict that keeps standing is caught", () => {
    probe("a withdrawal does not take", "withdrawal", (copy) => {
      copy.seen["withdrawal-leaves-silence"]!.after.verdicts = [
        { title: "Prisoners", year: 2013, judgement: "disliked", told: "volunteered" },
      ];
    });
  });

  test("a superseded verdict that keeps standing is caught", () => {
    probe("a correction does not displace", "correction", (copy) => {
      copy.seen["correction-supersedes"]!.after.verdicts = [
        { title: "Prisoners", year: 2013, judgement: "loved", told: "volunteered" },
        { title: "Prisoners", year: 2013, judgement: "disliked", told: "confirmed" },
      ];
    });
  });

  test("a not-tonight that leaks past its evening is caught", () => {
    probe("an evening's refusal goes global", "scope", (copy) => {
      copy.seen["not-tonight-one-evening"]!.after.verdicts = [
        { title: "Prisoners", year: 2013, rejected: "not-tonight", reason: "too long", told: "confirmed" },
      ];
    });
  });

  test("a not-ever that goes quiet inside an occasion is caught", () => {
    probe("a permanent refusal stops applying on a Tuesday", "scope", (copy) => {
      copy.seen["not-ever-one-film"]!.askedAt[`${prisoners} @ ${TUESDAY}`] = {
        current: null,
        superseded: [],
        history: [],
      };
    });
  });

  test("a not-ever leaking into a genre while the film verdict stays correct is caught", () => {
    // The category-level failure: the claim about the film is exactly right, and
    // the refusal has still become a theory about a kind of film.
    probe("a refusal becomes a genre exclusion", "scope", (copy) => {
      const seen = copy.seen["not-ever-one-film"]!;
      seen.after.genres = seen.after.genres.map((genre) =>
        genre.name === "Slow Burn"
          ? { ...genre, instruction: `${genre.instruction} — but nothing three hours long` }
          : genre,
      );
    });
  });

  test("a not-ever leaking into a mix is caught", () => {
    probe("a refusal becomes a mix exclusion", "scope", (copy) => {
      const seen = copy.seen["not-ever-one-film"]!;
      seen.after.mixes = [
        ...seen.after.mixes,
        { name: "Not For Them", genres: ["Slow Burn"], instruction: "avoid the long ones" },
      ];
    });
  });

  test("a not-tonight leaking into a genre and a mix is caught", () => {
    // The same category failure as the permanent refusal's, and the likelier of
    // the two: "too long for tonight" sounds enough like a preference that a
    // system might file it as one. The film's own standing stays exactly right.
    probe("an evening's refusal becomes a category exclusion", "scope", (copy) => {
      const seen = copy.seen["not-tonight-one-evening"]!;
      seen.after.genres = seen.after.genres.map((genre) =>
        genre.name === "Slow Burn"
          ? { ...genre, instruction: `${genre.instruction} — not on a weeknight` }
          : genre,
      );
      seen.after.mixes = [
        ...seen.after.mixes,
        { name: "Short Evenings", genres: ["Heist"], instruction: "nothing that runs long" },
      ];
    });
  });

  test("a not-tonight moving an unrelated film's viewing is caught", () => {
    // The plausible bug in this model: a refusal that reaches across and rewrites
    // what is known about watching a neighbouring film. It used to be written as
    // a `state` of `disliked`, which is a field `Movie` no longer has — so the
    // mutation added a property nothing reads and killed nothing.
    probe("an evening's refusal rewrites a neighbouring film", "scope", (copy) => {
      const seen = copy.seen["not-tonight-one-evening"]!;
      seen.after.movies = seen.after.movies.map((movie) =>
        movie.title === "Heat" ? { ...movie, viewing: "unseen" } : movie,
      );
    });
  });

  test("a not-tonight moving an unrelated film's opinion is caught", () => {
    // The other half, and the one the baseline exists for. An evening's refusal
    // that reached the standing opinion about another film would be a mood
    // turned into a fact about the person — and the opinion is a verdict now, so
    // that is where a leak would have to land.
    probe("an evening's refusal rewrites a neighbouring opinion", "scope", (copy) => {
      const seen = copy.seen["not-tonight-one-evening"]!;
      seen.after.verdicts = (seen.after.verdicts ?? []).map((held) =>
        held.title === "Heat" ? { ...held, judgement: "disliked" } : held,
      );
    });
  });

  test("a not-tonight erasing an unrelated opinion is caught", () => {
    // And the failure that looks like tidying rather than like writing: the
    // neighbouring verdict simply gone. A gate that only compared what is
    // present would miss it.
    probe("an evening's refusal drops a neighbouring opinion", "scope", (copy) => {
      const seen = copy.seen["not-tonight-one-evening"]!;
      seen.after.verdicts = (seen.after.verdicts ?? []).filter((held) => held.title !== "Heat");
    });
  });

  test("a reason dropped from the payload is caught", () => {
    probe("their words are dropped", "reason-fidelity", (copy) => {
      for (const held of copy.seen["reason-in-their-words"]!.after.verdicts ?? []) {
        delete held.because;
      }
    });
  });

  test("a reason strengthened into words they did not use is caught", () => {
    probe("their words are rewritten", "reason-fidelity", (copy) => {
      const held = (copy.seen["reason-in-their-words"]!.after.verdicts ?? [])[0];
      if (held) held.because = "one of their all-time favourites";
    });
  });

  test("an authentic reason copied onto a reasonless verdict is caught", () => {
    // The words are genuinely theirs and genuinely in this trajectory — just
    // about a different film. Membership would pass; identity must not.
    probe("a real reason lands on the wrong film", "reason-fidelity", (copy) => {
      const standing = copy.seen["reason-in-their-words"]!.after.verdicts ?? [];
      const authentic = standing.find((held) => held.title === "Prisoners")?.because;
      const reasonless = standing.find((held) => held.title === "Zodiac");
      assert.ok(
        authentic !== undefined && reasonless !== undefined,
        "the trajectory no longer has both a reasoned and a reasonless claim",
      );
      reasonless.because = authentic;
    });
  });

  test("an authentic reason moved between scopes in the history is caught", () => {
    // One film holding a global judgement and an evening's refusal at once. The
    // words are theirs and they are in this film's history — on the wrong act.
    // Nothing standing changes, so only the history comparison can see it.
    probe("their words slide from the refusal onto the judgement", "reason-fidelity", (copy) => {
      const history = copy.seen["not-tonight-one-evening"]!.asked[prisoners]!.history as {
        said: string;
        assertion: { about: string; judgement?: string; because?: string | null; rejection?: { reason: string | null } };
      }[];
      const judgement = history.find((act) => act.assertion.about === "judgement");
      const rejection = history.find((act) => act.assertion.about === "rejection");
      assert.ok(judgement && rejection, "the trajectory no longer holds both shapes for one film");
      judgement.assertion.because = rejection.assertion.rejection!.reason;
      rejection.assertion.rejection!.reason = null;
    });
  });

  test("provenance rewritten from confirmed to volunteered is caught", () => {
    probe("provenance is rewritten", "provenance-texture", (copy) => {
      for (const held of copy.seen["reason-in-their-words"]!.after.verdicts ?? []) {
        held.told = "volunteered";
      }
    });
  });

  test("a verdict given a numeric weight is caught", () => {
    probe("a verdict is scored", "provenance-texture", (copy) => {
      const held = (copy.seen["reason-in-their-words"]!.after.verdicts ?? [])[0];
      if (held) (held as unknown as { confidence: number }).confidence = 0.8;
    });
  });

  test("a repeated recommendation creating evidence is caught", () => {
    // Mutated in the middle, not at the end: the final answer stays correct and
    // the gate must still fail, which is the whole point of the checkpoints.
    probe("offering it twice starts to mean something", "non-influence", (copy) => {
      copy.seen["influence-recommended-again"]!.checkpoints[2]!.verdicts = [
        { title: "Prisoners", year: 2013, judgement: "liked", told: "volunteered" },
      ];
    });
  });

  test("a chosen prefix creating evidence is caught", () => {
    probe("taking the recommendation becomes liking it", "non-influence", (copy) => {
      copy.seen["influence-chosen"]!.checkpoints.at(-1)!.verdicts = [
        { title: "Prisoners", year: 2013, judgement: "liked", told: "volunteered" },
      ];
    });
  });

  test("a watched prefix creating evidence is caught", () => {
    probe("watching becomes liking", "non-influence", (copy) => {
      copy.seen["influence-watched"]!.checkpoints.at(-1)!.verdicts = [
        { title: "Prisoners", year: 2013, judgement: "liked", told: "volunteered" },
      ];
    });
  });

  test("a finished prefix creating evidence is caught", () => {
    probe("finishing becomes liking", "non-influence", (copy) => {
      copy.seen["influence-finished"]!.checkpoints.at(-1)!.verdicts = [
        { title: "Prisoners", year: 2013, judgement: "loved", told: "volunteered" },
      ];
    });
  });

  test("a pending question contributing to taste is caught", () => {
    probe("a waiting question becomes an answer", "non-influence", (copy) => {
      copy.seen["waiting-a-long-time"]!.checkpoints.at(-1)!.verdicts = [
        { title: "Prisoners", year: 2013, judgement: "liked", told: "volunteered" },
      ];
    });
  });

  test("an episode reaching the taste payload is caught", () => {
    probe("the evenings are handed over too", "non-influence", (copy) => {
      (copy.seen["waiting-a-long-time"]!.after as unknown as { episodes: unknown[] }).episodes = [];
    });
  });

  test("an expired question that concludes a rejection is caught", () => {
    probe("silence hardens into a refusal", "expiry", (copy) => {
      copy.seen["question-out-of-chances"]!.after.verdicts = [
        { title: "Prisoners", year: 2013, rejected: "not-ever", told: "volunteered" },
      ];
    });
  });

  test("a question that never retires is caught", () => {
    probe("the day limit never fires", "expiry", (copy) => {
      copy.seen["question-out-of-time"]!.pending = [
        { film: FILMS.prisoners, since: new Date().toISOString(), opportunities: 0 },
      ];
    });
  });

  test("the day limit failing once a chance has been used is caught", () => {
    // The broken rule this exists for: "time expiry applies only when no chances
    // have been used". The 30-day question with a chance against it survives.
    probe("time stops counting once a chance is used", "expiry", (copy) => {
      copy.seen["question-out-of-time-after-one-chance"]!.pending = [
        {
          film: FILMS.prisoners,
          since: new Date(Date.now() - 30 * DAY).toISOString(),
          opportunities: 1,
        },
      ];
    });
  });

  test("an outbound action appearing in the surface is caught", () => {
    probe("Tonight gets in touch on its own", "no-outbound", (copy) => {
      copy.surface.tools = [...copy.surface.tools, "remind_about_film"];
      copy.surface.sources["../questions.ts"] = "setInterval(ask, 86400000);";
    });
  });

  test("a reading that spends the question is caught", () => {
    probe("looking costs the question something", "no-outbound", (copy) => {
      copy.seen["waiting-a-long-time"]!.pendingAgain = [];
    });
  });

  test("one user's verdict reaching another is caught", () => {
    probe("a claim crosses users", "isolation", (copy) => {
      copy.crossing.leakedVerdicts = [
        { title: "Prisoners", year: 2013, judgement: "loved", told: "volunteered" },
      ];
    });
  });

  test("a stranger's withdrawal silencing the owner is caught", () => {
    probe("a stranger silences the owner", "isolation", (copy) => {
      copy.crossing.intact = false;
      copy.crossing.stillMine = [];
    });
  });

  /* --------------------------------------------------------- what was killed */

  test("every gate has a mutation that actually killed it", () => {
    // Derived from the probes that ran, not from a list of gate names restated
    // here: a gate registered in `GATES` with nothing able to break it fails
    // this contract, and so does a probe that turned out to be equivalent.
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
    assert.ok(probes.length >= registered.length, "fewer mutations than gates");
  });
});
