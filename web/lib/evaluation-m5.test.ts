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
 * reuse it, and Revision 4 splits it by host. A ChatGPT project gets the
 * projection and is scored on the floor; the plugin gets both skills and is
 * scored on the lifecycle; recommend alone is the reading case.
 */

const M5 = new URL("../../skills/tonight-recommend/evaluation/m5/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, M5), "utf8");

type Scenario = {
  fixture: string;
  prompt: string;
  then?: string;
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

const SOURCES = ["projection", "plugin-skills", "recommend-only"];

test("every scenario resolves to a fixture and to requests that exist, and every request is used", () => {
  const used = new Set<string>();
  for (const one of scenarios) {
    assert.ok(fixtures.has(one.fixture), `${one.fixture} is named by a scenario and does not exist`);
    assert.ok(requests.has(one.prompt), `${one.prompt} is not in prompts.md`);
    used.add(one.prompt);
    if (one.then !== undefined) {
      assert.ok(requests.has(one.then), `${one.then} is not in prompts.md`);
      used.add(one.then);
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
  assert.match(rubric, /On `projection` runs a stop after a positive verdict is correct and is never\s+scored as a miss/);
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
  const then = new Set(scenarios.flatMap((one) => (one.then ? [one.then] : [])));
  for (const answer of ["yes", "no", "partial"]) assert.ok(then.has(answer), `no second turn of ${answer}`);
});

test("the recommendation-only reading case runs on the projection and on recommend alone (R3-1)", () => {
  const reading = scenarios.filter((one) => one.family === "recommendation-only-reading");
  assert.equal(reading.length, 1);
  assert.deepEqual([...reading[0]!.sources].sort(), ["projection", "recommend-only"]);

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
  assert.match(runner, /const SOURCES = \["projection", "plugin-skills", "recommend-only"\]/);
  // The plugin is every skill the package carries, recommend first — both since
  // S3, recommend alone at the baseline commit (Codex implementation review #4).
  assert.match(runner, /readdirSync\(join\(ROOT, "skills"\)/, "plugin-skills does not read the skills that exist");
  assert.match(runner, /return \["tonight-recommend", \.\.\.all\.filter\(\(name\) => name !== "tonight-recommend"\)\]/);
  assert.match(runner, /case "plugin-skills":\s*return packaged\(\)/);
  assert.match(runner, /case "recommend-only":\s*return skill\("tonight-recommend"\)/);
  assert.match(runner, /case "projection":\s*return projection\(\)/);
  assert.match(runner, /^source: \$\{SOURCE\}$/m, "an artifact does not say which instructions it ran on");
  assert.match(runner, /^skills: \$\{skillsGiven\(\)/m, "an artifact does not say which skills it was given");
  assert.match(runner, /^considers: /m);
  // Either skill changing invalidates a recording, not only the projection.
  assert.match(runner, /"skills\/tonight-vibes\/SKILL\.md"/);
  assert.match(readme, /## The baseline \(S1\)/, "the baseline has no recipe");
});

test("the runner reseeds every run, snapshots after every run, and never reseeds a legacy fixture", () => {
  assert.match(runner, /if \(spec\.seed !== "v12-then-migrate"\) seed\(scenario\.fixture\)/);
  assert.match(runner, /const afterDigest = seed\(scenario\.fixture, "--snapshot"/);
  assert.match(readme, /\*\*vibes, then\s+films, then genres\*\*/);
  // A second turn that did not resume is a failure, not a fresh conversation scored
  // as the second half of one.
  assert.match(runner, /did not resume/);
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
