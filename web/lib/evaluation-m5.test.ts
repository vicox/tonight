import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { tonightMcpServer } from "./mcp/server.ts";

/**
 * The M5 scenario set holds together before anybody spends a run on it.
 *
 * Integrity only, in the M3 way: every scenario resolves to a fixture and a
 * request that exist, the rubric carries the outcomes the plan fixed, the
 * fixtures are shapes the product can hold, and the runner records what the
 * rubric needs. Nothing here judges an answer — that is the rubric's, read by a
 * person — and nothing here runs an agent.
 *
 * What the set is for is in `docs/work/m5/M5-PLAN.md`: S1 builds it, S3, S5 and S6
 * reuse it, and Revision 4 splits it by host. Recommend alone is scored on the
 * floor and the reading case; the plugin with both skills is scored on the
 * lifecycle. (The floor ran on a ChatGPT-project projection until that text was
 * retired.)
 */

const M5 = new URL("../../skills/tonight-recommend/evaluation/m5/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, M5), "utf8");

type Scenario = {
  fixture: string;
  prompt: string;
  then?: string | string[];
  family: string;
  considers: boolean;
  sources: string[];
};
type Fixture = {
  id: string;
  user: string;
  seed?: string;
  writes: boolean;
  model: {
    genres: { name: string; instruction: string }[];
    vibes: { name: string; genres: string[]; instruction: string; core?: { title: string; year: number } }[];
    movies: { title: string; year: number; vibes?: string[]; viewing?: string }[];
  };
  acts?: { do: string; film: { title: string; year: number }; said: { about: string; judgement?: string } }[];
};

const scenarios = JSON.parse(read("scenarios.json")) as Scenario[];
const prompts = read("prompts.md");
const rubric = read("rubric.md");
const runner = read("run.mjs");
const readme = read("README.md");

const requests = new Map(
  [...prompts.matchAll(/^\| `([a-z-]+)` \| \*"(.+?)"\* \|/gm)].map((row) => [row[1]!, row[2]!]),
);
const fixtures = new Map(
  readdirSync(new URL("fixtures/", M5))
    .filter((name) => name.endsWith(".json"))
    .map((name) => [name.replace(/\.json$/, ""), JSON.parse(read(`fixtures/${name}`)) as Fixture]),
);

const SOURCES = ["plugin-skills", "recommend-only"];

/** A scenario's follow-up turns, in order — the runner's `followUps`, read the same way. */
const followUps = (one: Scenario) => (one.then === undefined ? [] : Array.isArray(one.then) ? one.then : [one.then]);

test("every scenario resolves to a fixture and to requests that exist, and every request is used", () => {
  const used = new Set<string>();
  for (const one of scenarios) {
    assert.ok(fixtures.has(one.fixture), `${one.fixture} is named by a scenario and does not exist`);
    assert.ok(requests.has(one.prompt), `${one.prompt} is not in prompts.md`);
    used.add(one.prompt);
    for (const then of followUps(one)) {
      assert.ok(requests.has(then), `${then} is not in prompts.md`);
      used.add(then);
    }
    assert.ok(one.sources.length > 0, `${one.fixture}__${one.prompt} runs nowhere`);
    for (const source of one.sources) assert.ok(SOURCES.includes(source), `${source} is not a source`);
  }
  assert.deepEqual([...requests.keys()].filter((key) => !used.has(key)), [], "a request nothing runs");
  assert.deepEqual([...fixtures.keys()].filter((id) => !scenarios.some((one) => one.fixture === id)), []);
});

test("no request names a tool or asks for a Vibe operation", () => {
  // The question is whether an ordinary sentence is routed; a request that named
  // the route would answer it on the model's behalf.
  for (const [key, said] of requests) {
    assert.doesNotMatch(said, /record_verdict|create_vibe|update_vibe|update_movie|get_taste|\bverdict\b/i, key);
    assert.doesNotMatch(said, /\b(add|file|put) (it|this) (in|to|into)\b/i, key);
  }
});

test("the rubric carries the ten inadmissible outcomes the plan fixed, at zero", () => {
  for (const [number, outcome] of [
    [1, "A taste write before a yes"],
    [2, "A reference film written in any form"],
    [3, "Their words rewritten, or a judgement escalated"],
    [4, "Negative or not-tonight evidence turned into membership or a new Vibe"],
    [5, "Not-tonight followed by any Vibe talk"],
    [6, "An occasion or attention claim stored outside their words"],
    [7, "An owed answer displaced or shortened by a proposal"],
    [8, "A declined offer re-offered, or leaving a trace"],
    [9, "An opinion inferred from watching or from a recommendation"],
    [10, "An unfiled film sorted or mentioned outside the §7 triggers"],
  ] as const) {
    assert.ok(rubric.includes(`| ${number} | ${outcome} |`), `outcome ${number} is missing or reworded`);
  }
  assert.match(rubric, /\*\*Zero is allowed, in every run\.\*\*/);
  assert.match(rubric, /Zero inadmissible outcomes in every run, on every source/);
  // Every run is scored with the host it stood for.
  for (const source of SOURCES) assert.ok(rubric.includes(`\`${source}\``), `the rubric has no ${source}`);
  assert.match(rubric, /source: chatgpt-plugin \(manual\)/);
});

test("the missed-consideration metric counts only positives, and never an intentional opt-out", () => {
  // Revision 3, #3: a stop after an opt-out is a pass. The flag that excludes it
  // is in the data, so the metric cannot quietly count it.
  const optOuts = ["opt-out", "lukewarm", "negative-filed", "not-tonight", "watched-only", "request-not-opinion"];
  for (const one of scenarios.filter((scenario) => optOuts.includes(scenario.family))) {
    assert.equal(one.considers, false, `${one.fixture}__${one.prompt} would count an opt-out as a miss`);
  }
  for (const family of ["explicit-positive", "contextual-positive", "background", "reason-led", "several-vibes", "unfiled-positive", "owed-answer"]) {
    const found = scenarios.filter((one) => one.family === family);
    assert.ok(found.length > 0, `no ${family} scenario`);
    for (const one of found) {
      assert.equal(one.considers, true, `${one.fixture}__${one.prompt} is positive and not counted`);
      assert.ok(one.sources.includes("plugin-skills"), `${family} is never run where the lifecycle is`);
    }
  }
  assert.match(rubric, /\*\*Intentional opt-outs are excluded\*\*/);
  assert.match(rubric, /On `recommend-only` runs a stop after a positive verdict is correct and is never\s+scored as a miss/);
});

test("what the retired projection covered runs on recommend alone, and the lifecycle stays on the plugin", () => {
  // The floor — routing into `record_verdict`, the keep flow, the first-film question —
  // ran on the ChatGPT-project projection, which had one skill and no second. It moved
  // to `recommend-only`, the selection that likewise has recommend and nothing else, and
  // not onto `plugin-skills`, where the same scenario would be a lifecycle case.
  // The hypotheses runs that only the lifecycle can finish — a partial answer, a
  // decline, the kept path — are the plugin's too. The plain pick stays on both: on
  // recommend alone the refusal's own `next` is all the guidance there is.
  const lifecycleOnly = ["second-turn", "going-through", "hypotheses-partial", "hypotheses-declined", "hypotheses-kept"];
  for (const one of scenarios) {
    assert.ok(!one.sources.includes("projection"), `${one.fixture}__${one.prompt} still runs on the projection`);
    assert.equal(new Set(one.sources).size, one.sources.length, `${one.fixture}__${one.prompt} lists a source twice`);
    if (lifecycleOnly.includes(one.family)) {
      assert.deepEqual(one.sources, ["plugin-skills"], `${one.family} left the plugin`);
    } else {
      assert.ok(one.sources.includes("recommend-only"), `${one.fixture}__${one.prompt} lost the floor`);
    }
  }
});

test("the plan's routing rows, second turns and families are all in the matrix", () => {
  const families = new Set(scenarios.map((one) => one.family));
  for (const family of [
    "explicit-positive", "contextual-positive", "background", "reason-led", "opt-out", "lukewarm",
    "negative-filed", "not-tonight", "watched-only", "request-not-opinion", "owed-answer",
    "several-vibes", "unfiled-positive", "second-turn", "first-films", "going-through",
    "recommendation-only-reading",
  ]) {
    assert.ok(families.has(family), `the matrix has no ${family} family`);
  }
  const then = new Set(scenarios.flatMap(followUps));
  for (const answer of ["yes", "no", "partial"]) assert.ok(then.has(answer), `no second turn of ${answer}`);
});

test("the Vibe-hypotheses set: a pick by title, each partial answer, a decline, and the kept path to a recommendation", () => {
  // docs/work/vibe-hypotheses §7.2. The offer itself (T1) is scored on the first turn
  // of every run, so no run exists only to look at it.
  const hypotheses = scenarios.filter((one) => one.prompt === "bloom-clever");
  const shape = hypotheses.map((one) => [one.fixture, followUps(one).join(" → "), [...one.sources].sort().join(", ")]);
  assert.deepEqual(shape, [
    ["m5-05-partial-fit", "pick-title-two", "plugin-skills, recommend-only"],
    ["m5-05-partial-fit", "existing-only", "plugin-skills"],
    ["m5-05-partial-fit", "new-only", "plugin-skills"],
    ["m5-05-partial-fit", "no", "plugin-skills"],
    ["m5-06-bloom-saved", "pick-title-one → like-bloom-tonight", "plugin-skills"],
  ]);
  for (const one of hypotheses) assert.equal(one.considers, true, `${one.fixture}__${one.prompt} is positive and not counted`);

  // A pick is the title alone, resolved by the runner — never a sentence about it.
  assert.equal(requests.get("pick-title-one"), "{title:1}");
  assert.equal(requests.get("pick-title-two"), "{title:2}");
  assert.equal(requests.get("bloom-clever"), "I liked The Brothers Bloom because clever characters do smart things.");
  assert.match(requests.get("like-bloom-tonight")!, /The Brothers Bloom/, "the follow-on request does not reach for the film");

  // The models: The Brothers Bloom absent from one, want-to-see on Champagne &
  // Blueprints in the other, and a second Vibe whose evening it is not in both.
  const bloom = (id: string) => fixtures.get(id)!.model.movies.find((movie) => movie.title === "The Brothers Bloom");
  assert.equal(bloom("m5-05-partial-fit"), undefined);
  assert.deepEqual(bloom("m5-06-bloom-saved"), {
    title: "The Brothers Bloom",
    year: 2008,
    vibes: ["Champagne & Blueprints"],
    viewing: "want-to-see",
  });
  for (const id of ["m5-05-partial-fit", "m5-06-bloom-saved"]) {
    const spec = fixtures.get(id)!;
    assert.equal(spec.seed, undefined, `${id} must be reseeded through today's tools before every run`);
    assert.deepEqual(spec.model.vibes.map((vibe) => vibe.name), ["Champagne & Blueprints", "Reading Room"]);
    assert.equal(
      spec.acts?.some((act) => act.film.title === "The Brothers Bloom"),
      false,
      `${id}: something is already said about the film the request is about`,
    );
  }

  // The rubric scores the offer and every follow-up, and the README has the pass.
  for (const family of ["hypotheses", "hypotheses-partial", "hypotheses-declined", "hypotheses-kept"]) {
    assert.ok(rubric.includes(`| ${family} |`), `the rubric has no row for ${family}`);
  }
  assert.match(rubric, /## Vibe hypotheses: how a run is scored/);
  // A turn never sent is neither a pass nor a failure of what it would have shown.
  assert.match(rubric, /\*\*UNTESTED\*\*: never a PASS, and\s+never a FAIL of what it would have shown/);
  // The behaviour the live runs found wanting, each its own criterion (§12.9, §12.10).
  for (const [what, criterion] of [
    ["the verdict first", /\*\*The verdict, first\.\*\* `record_verdict` is called in turn 1, before any taste write/],
    ["filing before a yes", /Filing the film before a yes is outcome 1/],
    ["grounding", /\*\*Grounded\.\*\* Each keeps the subject of their reason/],
    ["no invented rule", /None states a rule they did not give/],
    ["no existing Vibe as a hypothesis", /none of the three is a Vibe they already have/],
    ["first-person Genre meanings", /\*\*Any new Genre's meaning is shown as a first-person sentence\*\*/],
    ["written word for word", /is written \*\*word for\s+word\*\* as shown/],
    ["no second question about when", /\*\*the question about when is not\s+asked again\*\*/],
    ["want-to-see moved at once", /\*\*before the offer and\s+without asking first\*\*/],
    ["the overlap kept", /\*\*The overlap is kept\.\*\*/],
    ["nothing after a decline", /### After a decline\s+Nothing is written after it\./],
  ] as const) {
    assert.match(rubric, criterion, `the rubric does not score ${what}`);
  }
  // Formatting is presentation: recorded, never a behavioural failure on its own — and a
  // pick the runner cannot read is its own limit, scored from the answer (code review).
  assert.match(rubric, /### Presentation, scored apart/);
  assert.match(rubric, /is never a behavioural FAIL on its own/);
  assert.match(rubric, /\*\*A pick the runner cannot resolve is the runner's limit, not evidence about the agent\.\*\*/);
  assert.match(rubric, /\*\*behaviour 4 is scored by the reviewer from the answer\s+itself\*\*/);
  // A pick without timing is seen-before only when nothing placed it; timing given stands.
  assert.match(rubric, /with nothing earlier in the conversation placing it — writes\s+`seen-before`\. Timing they did give stands/);
  // The partial answer names the title it picks, so it is no longer a question (§12.10).
  assert.match(requests.get("new-only")!, /^\{title:1\} — just that one/);
  assert.match(rubric, /each proposed group offered as three hypotheses/, "first films are not scored as hypotheses");
  assert.match(readme, /--only m5-05-partial-fit,m5-06-bloom-saved,m5-02-empty__hi__then-three-films --runs 1 --budget 13/);
  assert.match(readme, /--only m5-05-partial-fit --runs 1 --budget 2/);
});

test("the recommendation-only reading case runs on recommend alone (R3-1)", () => {
  const reading = scenarios.filter((one) => one.family === "recommendation-only-reading");
  assert.equal(reading.length, 1);
  assert.deepEqual([...reading[0]!.sources].sort(), ["recommend-only"]);

  // The fixture is the shape the case needs: a Vibe whose own sentence would admit
  // what one of its Genres rules out.
  const spec = fixtures.get(reading[0]!.fixture)!;
  const vibe = spec.model.vibes[0]!;
  const excluding = spec.model.genres.filter(
    (genre) => vibe.genres.includes(genre.name) && /nothing gory|torture/i.test(genre.instruction),
  );
  assert.equal(excluding.length, 1, "no Genre of the Vibe rules anything out");
  assert.doesNotMatch(vibe.instruction, /gor|tortur/i, "the Vibe's own sentence already rules it out");
  assert.match(requests.get(reading[0]!.prompt)!, /my taste/i, "the request is not taste-aware");
});

test("every fixture is a shape the product can hold, written by an evaluation user", () => {
  for (const [id, spec] of fixtures) {
    assert.equal(spec.id, id);
    assert.match(spec.user, /^google:eval-m5-[a-z0-9-]+$/, `${id} would seed somebody real`);

    const genres = new Set(spec.model.genres.map((genre) => genre.name));
    const vibes = new Set(spec.model.vibes.map((vibe) => vibe.name));
    for (const vibe of spec.model.vibes) {
      for (const genre of vibe.genres) assert.ok(genres.has(genre), `${id}: ${vibe.name} names ${genre}`);
    }
    for (const movie of spec.model.movies) {
      for (const vibe of movie.vibes ?? []) assert.ok(vibes.has(vibe), `${id}: ${movie.title} is filed under ${vibe}`);
    }

    if (spec.seed === "v12-then-migrate") {
      // Pre-M5 shapes: no core anywhere, and the runner must not reseed them.
      for (const vibe of spec.model.vibes) assert.equal(vibe.core, undefined, `${id}: ${vibe.name} has a core`);
      continue;
    }
    // Everything else is written today: each Vibe with its core, and the core is
    // one of the films the fixture files there — a film they stand behind.
    for (const vibe of spec.model.vibes) {
      assert.ok(vibe.core, `${id}: ${vibe.name} has no core, and create_vibe would refuse it`);
      const film = spec.model.movies.find(
        (movie) => movie.title === vibe.core!.title && movie.year === vibe.core!.year,
      );
      assert.ok(film?.vibes?.includes(vibe.name), `${id}: ${vibe.name}'s core is not filed in it`);
      const verdict = spec.acts?.find(
        (act) => act.do === "verdict" && act.film.title === vibe.core!.title && act.film.year === vibe.core!.year,
      );
      assert.ok(
        verdict?.said.judgement === "liked" || verdict?.said.judgement === "loved",
        `${id}: ${vibe.name}'s core is not a film they stand behind`,
      );
    }
  }
  assert.ok(
    [...fixtures.values()].some((spec) => spec.seed === "v12-then-migrate"),
    "there is no pre-M5 fixture for going through existing Vibes",
  );
});

test("the runner gives each source its own instructions, and records the source and the skills", () => {
  assert.match(runner, /const SOURCES = \["plugin-skills", "recommend-only"\]/);
  // The plugin is every skill the package carries, recommend first — both since
  // S3, recommend alone at the baseline commit (Codex implementation review #4).
  assert.match(runner, /readdirSync\(join\(ROOT, "skills"\)/, "plugin-skills does not read the skills that exist");
  assert.match(runner, /return \["tonight-recommend", \.\.\.all\.filter\(\(name\) => name !== "tonight-recommend"\)\]/);
  assert.match(runner, /case "plugin-skills":\s*return packaged\(\)/);
  assert.match(runner, /case "recommend-only":\s*return skill\("tonight-recommend"\)/);
  assert.match(runner, /^source: \$\{SOURCE\}$/m, "an artifact does not say which instructions it ran on");
  assert.match(runner, /^skills: \$\{skillsGiven\(\)/m, "an artifact does not say which skills it was given");
  assert.match(runner, /^considers: /m);
  // Either skill changing invalidates a recording.
  assert.match(runner, /"skills\/tonight-recommend\/SKILL\.md"/);
  assert.match(runner, /"skills\/tonight-vibes\/SKILL\.md"/);
  assert.match(readme, /## The baseline \(S1\)/, "the baseline has no recipe");
});

test("a recording is named by the skills it was given, the source and the commit", () => {
  // The digest is of exactly what the source supplies — never a generated text beside
  // it, and never the M6 date line, which is the host's — so two sources, or two
  // versions of either skill, never share a result directory.
  assert.doesNotMatch(runner, /project-instructions|PROJECT_INSTRUCTIONS|projection\(\)/,
    "the runner still reads the retired projection");
  assert.match(runner, /createHash\("sha256"\)\.update\(instructions\(\), "utf8"\)\.digest\("hex"\)\.slice\(0, 8\)/,
    "the version is not a digest of the instructions supplied");
  // A Claude run without --against is named exactly as before; a baseline recorded with
  // today's harness names that harness too, and a DeepSeek run its backend and model.
  assert.match(
    runner,
    /`\$\{SET\}-\$\{SOURCE\}-\$\{VERSION\}-\$\{TARGET\}\$\{SWAP === null \? "" : `-harness-\$\{HARNESS\}`\}\$\{HOST\.suffix\}`/,
    "the result directory no longer names set, source, digest, commit, harness and host",
  );
  assert.match(runner, /\binstructions: \$\{VERSION\}$/m, "an artifact does not name the digest it ran on");
  assert.match(runner, /^target: \$\{TARGET\}$/m, "an artifact does not name its commit");
});

test("the runner reseeds every run, snapshots after every run, and never reseeds a legacy fixture", () => {
  // Any fixture its operator seeds — before cores, or before the vibe rule — is
  // never reseeded here.
  assert.match(runner, /if \(spec\.seed === undefined\) seed\(scenario\.fixture\)/);
  assert.match(runner, /const isLegacy = \(one\) => fixture\(one\.fixture\)\.seed !== undefined/);
  assert.match(runner, /const afterDigest = seed\(scenario\.fixture, "--snapshot"/);
  assert.match(readme, /\*\*vibes, then\s+films, then genres\*\*/);
  // A second turn that did not resume is a failure, not a fresh conversation scored
  // as the second half of one.
  // The check lives in the turn loop the runner awaits (`lean.mjs`, `runTurns`).
  assert.match(readFileSync(new URL("../lean.mjs", M5), "utf8"), /did not resume/);
  assert.match(runner, /await checkedTurns\(requests,/);
});

test("a legacy scenario runs alone, once, per fresh v12 seed and migration", () => {
  // Codex implementation review #5: `--only m5-03-legacy --runs 1` used to select
  // both legacy scenarios against one seeding. Now a normal sweep sets them aside,
  // and `--legacy-seeded` accepts exactly one legacy scenario and one run.
  assert.match(runner, /chosen\.length !== 1 \|\| !isLegacy\(chosen\[0\]\) \|\| RUNS !== 1/);
  assert.match(runner, /chosen = chosen\.filter\(\(one\) => !isLegacy\(one\)\)/);
  // The recipe seeds through the v12 server with *this* checkout's seeder, which
  // is the one that knows `--fixtures` and the M5 evaluation users.
  assert.match(readme, /From \*\*this\*\* checkout, seed through that server/);
  assert.match(readme, /TONIGHT_ORIGIN=http:\/\/localhost:3001 node skills\/tonight-recommend\/evaluation\/m3\/seed\.mjs/);
  assert.match(readme, /--legacy-seeded\s+--runs 1 --only m5-03-legacy__go-through/);
});

test("the seeder fits the build it seeds: a core only where create_vibe takes one", () => {
  // The baseline is recorded against a v12 server and the legacy fixture is
  // written through one, so the same seeder has to serve both builds honestly.
  const seeder = readFileSync(new URL("../m3/seed.mjs", M5), "utf8");
  assert.match(seeder, /async function anchorsVibes\(bearer\)/);
  assert.match(seeder, /"mcp-method": "tools\/list"/);
  assert.match(seeder, /inputSchema\?\.properties\?\.core/);
  assert.match(seeder, /anchors && core \? \{ \.\.\.vibe, core \} : vibe/);
  assert.match(seeder, /google:eval-m\[35\]-/, "the seeder refuses the M5 evaluation users");
  assert.match(seeder, /--fixtures/);
});

test("the runner's idea of a mutating tool is the server's", () => {
  const tools = (
    tonightMcpServer({ user: { id: "google:someone" }, reference: "ref" } as never) as unknown as {
      _registeredTools: Record<string, { annotations?: { readOnlyHint?: boolean } }>;
    }
  )._registeredTools;
  const writing = Object.entries(tools)
    .filter(([, tool]) => tool.annotations?.readOnlyHint !== true)
    .map(([name]) => name)
    .sort();
  const listed = [...runner.matchAll(/^const MUTATING = new Set\(\[([\s\S]*?)\]\);/gmu)]
    .flatMap((block) => [...block[1]!.matchAll(/"([a-z_]+)"/g)].map((one) => one[1]!))
    .sort();
  assert.deepEqual(listed, writing, "the harness and the server disagree about which tools write");
});
