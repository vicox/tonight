import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

/**
 * The M6 scenario set holds together before anybody spends a run on it.
 *
 * Integrity only, in the M3 and M5 way: every scenario resolves to a fixture and
 * a request that exist, every family has a required outcome and a gate, the
 * rubric carries the outcomes the plan fixed, the fixtures are shapes the product
 * can hold, and the runner fixes one date per run. Nothing here judges an answer
 * — that is the rubric's, read by a person — and nothing here runs an agent.
 *
 * The set is `docs/work/m6/PLAN.md`, §5.2. It also carries the in-repo half of
 * the plan's existing-data check (§2.2): no evaluation fixture, in any set,
 * anchors a Vibe on a film it saves as unseen.
 */

const EVALUATION = new URL("../../skills/tonight-recommend/evaluation/", import.meta.url);
const M6 = new URL("m6/", EVALUATION);
const read = (path: string) => readFileSync(new URL(path, M6), "utf8");

type Film = { title: string; year: number };
type Scenario = { fixture: string; prompt: string; then?: string; family: string; gate: string; sources: string[] };
type Act = {
  do: string;
  film: Film;
  told?: string;
  occasion?: string;
  said?: { about: string; judgement?: string; reach?: string; occasion?: string };
};
type Fixture = {
  id: string;
  user: string;
  seed?: string;
  writes: boolean;
  contradictions?: Film[];
  model: {
    genres: { name: string; instruction: string }[];
    vibes: { name: string; genres: string[]; instruction: string; core?: Film }[];
    movies: (Film & { vibes?: string[]; viewing?: string })[];
  };
  acts?: Act[];
};

const scenarios = JSON.parse(read("scenarios.json")) as Scenario[];
const prompts = read("prompts.md");
const rubric = read("rubric.md");
const readme = read("README.md");
const runner = readFileSync(new URL("m5/run.mjs", EVALUATION), "utf8");
const seeder = readFileSync(new URL("m3/seed.mjs", EVALUATION), "utf8");

const requests = new Map(
  [...prompts.matchAll(/^\| `([a-z-]+)` \| \*"(.+?)"\* \|/gm)].map((row) => [row[1]!, row[2]!]),
);
const fixturesIn = (dir: URL) =>
  new Map(
    readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => [name.replace(/\.json$/, ""), JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Fixture]),
  );
const fixtures = fixturesIn(new URL("fixtures/", M6));

const SOURCES = ["projection", "plugin-skills", "recommend-only"];
const same = (a: Film, b: Film) => a.title === b.title && a.year === b.year;

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

test("no request names a tool, and every refusal names its film with its year", () => {
  for (const [key, said] of requests) {
    assert.doesNotMatch(said, /record_verdict|create_vibe|update_vibe|update_movie|get_taste|\bverdict\b/i, key);
  }
  // The required write is only unambiguous if the film is: title and year, every time.
  for (const key of ["not-interested-nice-guys", "not-tonight-nice-guys", "nah-nice-guys"]) {
    assert.match(requests.get(key)!, /The Nice Guys \(2016\)/, `${key} does not name the film with its year`);
  }
  for (const key of ["heat-anchor", "heat-seen-now"]) assert.match(requests.get(key)!, /Heat \(1995\)/, key);
  assert.match(requests.get("collateral-anchor")!, /Collateral \(2004\)/);
  // The explicit families say their reach in so many words; the unclear one does not.
  assert.match(requests.get("not-interested-nice-guys")!, /not interested[\s\S]*stop suggesting it/i);
  assert.match(requests.get("not-tonight-nice-guys")!, /tonight/i);
  assert.doesNotMatch(requests.get("nah-nice-guys")!, /tonight|ever|again|interested|suggest/i);
  // And the moodless requests give no mood.
  for (const key of ["what-tonight", "recommend-me"]) {
    assert.doesNotMatch(requests.get(key)!, /mood|funny|scary|sad|light|tense|feel/i, `${key} gives a mood`);
  }
});

test("the plan's families are all in the matrix, each with its required outcome and gate", () => {
  const plan = {
    "G1-not-ever": "every-run",
    "G2-not-tonight": "every-run",
    "G3-unclear-reach": "threshold",
    "R1-standing-not-ever": "every-run",
    "R2-dated-today": "every-run",
    "U1-unseen-member": "threshold",
    "U2-unseen-core": "every-run",
    "U3-seen-now": "threshold",
    "U4-contradiction": "every-run",
    "M1-moodless": "threshold",
  } as const;
  for (const [family, gate] of Object.entries(plan)) {
    const found = scenarios.filter((one) => one.family === family);
    assert.ok(found.length > 0, `the matrix has no ${family}`);
    for (const one of found) assert.equal(one.gate, gate, `${family} has the wrong gate`);
    assert.ok(rubric.includes(`| **${family}** |`), `the rubric has no required outcome for ${family}`);
  }
  assert.deepEqual(
    [...new Set(scenarios.map((one) => one.family))].sort(),
    Object.keys(plan).sort(),
    "a family the plan does not name",
  );

  // The required outcomes demand the right write, not only the absence of a wrong one.
  assert.match(rubric, /\*\*G1-not-ever\*\*[^\n]*\*\*Exactly one\*\* `record_verdict`: The Nice Guys, 2016, rejection `not-ever`/);
  assert.match(rubric, /\*\*G2-not-tonight\*\*[^\n]*occasion \*\*= `D`\*\*/);
  assert.match(rubric, /\*\*G3-unclear-reach\*\*[^\n]*`not-tonight`, occasion = `D`/);
  assert.match(rubric, /\*\*U4-contradiction\*\*[^\n]*\*\*Turn 1:\*\* no viewing write, no core change/);

  // Who runs where: the lifecycle cases only where the vibes skill is loaded, the
  // reading cases on recommend alone too.
  const sources = (family: string) => [...new Set(scenarios.filter((one) => one.family === family).flatMap((one) => one.sources))].sort();
  for (const family of ["U2-unseen-core", "U3-seen-now", "U4-contradiction"]) {
    assert.deepEqual(sources(family), ["plugin-skills"], family);
  }
  for (const family of ["R1-standing-not-ever", "R2-dated-today", "U1-unseen-member"]) {
    assert.deepEqual(sources(family), [...SOURCES].sort(), family);
  }
  for (const family of ["G1-not-ever", "G2-not-tonight", "G3-unclear-reach", "M1-moodless"]) {
    assert.deepEqual(sources(family), ["plugin-skills", "projection"], family);
  }
  assert.equal(scenarios.find((one) => one.family === "U4-contradiction")?.then, "yes-seen-it");
});

test("the rubric carries the twelve inadmissible outcomes the plan fixed, at zero", () => {
  for (const [number, outcome] of [
    [1, "A refused film offered within its reach, as lead or direction"],
    [2, "A refusal written as disliked, as a viewing, or with a Movie for it"],
    [3, "A refusal written wider than it was said"],
    [4, "A new not-tonight occasion other than D"],
    [5, "An unsolicited widening question about a refusal"],
    [6, "Membership or raw viewing presented as taste"],
    [7, "A viewing written that they did not state in this conversation"],
    [8, "A raw-unseen film written as a core"],
    [9, "A moodless request answered with a question and no film"],
    [10, "A mood claimed that they did not state"],
    [11, "A Vibe dump"],
    [12, "More than one question, or a question ahead of the answer"],
  ] as const) {
    assert.ok(rubric.includes(`| ${number} | ${outcome} |`), `outcome ${number} is missing or reworded`);
  }
  assert.match(rubric, /\*\*Zero is allowed, in every run\.\*\*/);
  assert.match(rubric, /\*\*Zero inadmissible outcomes in every run, on every source\.\*\*/);
  assert.match(rubric, /\*\*Every run passes\*\* for G1, G2, R1, R2, U2 and U4/);
  assert.match(rubric, /fixes \*\*before\*\* the post-change run/);
  for (const source of SOURCES) assert.ok(rubric.includes(`\`${source}\``), `the rubric has no ${source}`);
  assert.match(rubric, /source: chatgpt-plugin \(manual\)/);
  assert.match(rubric, /\*\*A run marked void — it started and ended on different dates — is not scored; it is\s+rerun\.\*\*/);
});

test("every fixture is a shape the product can hold, written by an M6 evaluation user", () => {
  for (const [id, spec] of fixtures) {
    assert.equal(spec.id, id);
    assert.match(spec.user, /^google:eval-m6-[a-z0-9-]+$/, `${id} would seed somebody real`);
    assert.equal(spec.seed, undefined, `${id}: the M6 set has no legacy fixture`);

    const genres = new Set(spec.model.genres.map((genre) => genre.name));
    const vibes = new Set(spec.model.vibes.map((vibe) => vibe.name));
    for (const vibe of spec.model.vibes) {
      for (const genre of vibe.genres) assert.ok(genres.has(genre), `${id}: ${vibe.name} names ${genre}`);
    }
    for (const movie of spec.model.movies) {
      for (const vibe of movie.vibes ?? []) assert.ok(vibes.has(vibe), `${id}: ${movie.title} is filed under ${vibe}`);
    }

    // Each Vibe with its core: filed in it, saved as seen, and a film they stand behind.
    for (const vibe of spec.model.vibes) {
      assert.ok(vibe.core, `${id}: ${vibe.name} has no core, and create_vibe would refuse it`);
      const film = spec.model.movies.find((movie) => same(movie, vibe.core!));
      assert.ok(film?.vibes?.includes(vibe.name), `${id}: ${vibe.name}'s core is not filed in it`);
      assert.equal(film?.viewing, "seen", `${id}: ${vibe.name}'s core is not saved as seen`);
      const verdict = spec.acts?.find((act) => act.do === "verdict" && same(act.film, vibe.core!));
      assert.ok(
        verdict?.said?.judgement === "liked" || verdict?.said?.judgement === "loved",
        `${id}: ${vibe.name}'s core is not a film they stand behind`,
      );
    }

    // A raw-unseen film with a standing judgement is a contradiction, and only where
    // the fixture lists it as one — never a core.
    const unseenJudged = spec.model.movies.filter(
      (movie) =>
        movie.viewing === "unseen" &&
        spec.acts?.some((act) => act.do === "verdict" && same(act.film, movie) && act.said?.about === "judgement"),
    );
    assert.deepEqual(
      unseenJudged.map(({ title, year }) => ({ title, year })),
      spec.contradictions ?? [],
      `${id}: an unlisted contradiction, or a listed one that is not there`,
    );
    for (const film of spec.contradictions ?? []) {
      assert.ok(!spec.model.vibes.some((vibe) => same(vibe.core!, film)), `${id}: a contradiction is a core`);
    }

    // `@today` only ever stands for an occasion — in what is seeded, not in the notes.
    const text = JSON.stringify({ model: spec.model, acts: spec.acts });
    const todays = (text.match(/@today/g) ?? []).length;
    const asOccasion = (spec.acts ?? []).filter((act) => act.said?.occasion === "@today" || act.occasion === "@today").length;
    assert.equal(todays, asOccasion, `${id}: @today used as something other than an occasion`);
  }

  // The fixtures each family needs.
  const fifty = fixtures.get("m6-05-fifty-vibes")!;
  assert.equal(fifty.model.vibes.length, 50, "the moodless fixture does not have fifty Vibes");
  assert.equal(new Set(fifty.model.vibes.map((vibe) => vibe.name.toLowerCase())).size, 50, "a Vibe name repeats");
  assert.ok(fifty.model.genres.length >= 10, "fifty Vibes over too few Genres to be a large model");

  const ever = fixtures.get("m6-02-refused-ever")!;
  assert.ok(ever.acts?.some((act) => act.film.title === "The Nice Guys" && act.said?.reach === "not-ever"));
  const tonight = fixtures.get("m6-03-refused-tonight")!;
  const occasionOf = (title: string) => tonight.acts?.find((act) => act.film.title === title)?.said?.occasion;
  assert.equal(occasionOf("The Nice Guys"), "@today");
  assert.match(occasionOf("The Other Guys") ?? "", /^\d{4}-\d{2}-\d{2}$/, "no refusal on another date");
  assert.equal(occasionOf("Hot Fuzz"), "evening-tuesday", "no legacy, pre-convention occasion");

  const unseen = fixtures.get("m6-04-unseen-member")!;
  const heat = unseen.model.movies.find((movie) => movie.title === "Heat")!;
  assert.equal(heat.viewing, "unseen");
  assert.ok(!unseen.acts?.some((act) => act.film.title === "Heat"), "Heat carries a verdict");
  assert.deepEqual(unseen.contradictions, [{ title: "Collateral", year: 2004 }]);

  // The film G1–G3 refuse is not in their model at all.
  const buddy = fixtures.get("m6-01-buddy-crime")!;
  assert.ok(!buddy.model.movies.some((movie) => movie.title === "The Nice Guys"));
  assert.ok(!buddy.acts?.some((act) => act.film.title === "The Nice Guys"));
});

test("no evaluation fixture in any set anchors a Vibe on a film it saves as unseen", () => {
  // The in-repo half of the existing-data check (PLAN §2.2): the store now refuses
  // such a core, so a fixture that held one could not be seeded — and would be
  // teaching the wrong thing if it could.
  const sets = ["fixtures/", "m3/fixtures/", "m5/fixtures/", "m6/fixtures/"];
  let cores = 0;
  for (const dir of sets) {
    for (const [id, spec] of fixturesIn(new URL(dir, EVALUATION))) {
      for (const vibe of spec.model?.vibes ?? []) {
        if (!vibe.core) continue;
        cores += 1;
        const film = spec.model.movies.find((movie) => same(movie, vibe.core!));
        assert.notEqual(film?.viewing, "unseen", `${dir}${id}: ${vibe.name} is anchored on a film saved as unseen`);
      }
    }
  }
  assert.ok(cores > 50, "the check found almost no cores, so it checked nothing");
});

test("the runner runs the M6 set with one date per run, told, seeded and voided at midnight", () => {
  assert.match(runner, /const SETS = \["m5", "m6"\]/);
  assert.match(runner, /const SET = option\("set", "m5"\)/, "the M5 set is no longer the default");
  assert.match(runner, /const FIXTURES = join\(SET_DIR, "fixtures"\)/);
  assert.match(runner, /readFileSync\(join\(SET_DIR, "scenarios\.json"\)/);
  assert.match(runner, /readFileSync\(join\(SET_DIR, "prompts\.md"\)/);
  // One date for the run: fixed when it starts, given to the seeder, told to the agent.
  assert.match(runner, /TODAY = localDate\(\);\s*const today = TODAY;/);
  assert.match(runner, /"--today", TODAY/);
  assert.match(runner, /SET === "m6" \? `\$\{instructions\(\)\}\\n\\nToday's date is \$\{TODAY\}\.` : instructions\(\)/);
  assert.match(runner, /"--system-prompt", systemPrompt\(\)/);
  // And a run that crossed midnight is void, never scored.
  assert.match(runner, /const ended = localDate\(\);/);
  assert.match(runner, /void: started on \$\{today\}, ended on \$\{ended\} — rerun/);
  assert.match(runner, /^today: \$\{result\.today\}/m, "an artifact does not record its date");
  assert.match(runner, /^side: \$\{SET\}$/m);
  assert.match(readme, /--set m6 --source projection/);
});

test("the seeder writes @today as the date it is given, only for an occasion, and never guesses", () => {
  assert.match(seeder, /\^google:eval-m6-\[a-z0-9-\]\+\$/, "the seeder refuses the M6 evaluation users");
  assert.match(seeder, /if \(occasion !== "@today"\) return occasion;/);
  assert.match(seeder, /names @today, and no --today YYYY-MM-DD was given/);
  assert.match(seeder, /occasion: dated\(act\.said\.occasion, spec\.id\)/);
  assert.match(seeder, /occasion: dated\(act\.occasion, spec\.id\)/);
});
