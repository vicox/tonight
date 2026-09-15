import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * The evaluation set, held to the coverage it claims.
 *
 * `skills/tonight-recommend/evaluation` is the behavioural acceptance gate for
 * Phase 1 of the recommendation strategy, and it is the only thing in this
 * repository that can decide whether a change to the instructions worked: every
 * other test here proves a rule is *present in the text*, never that a model
 * follows it.
 *
 * A gate with a hole in it is worse than no gate, because it reports a pass. So
 * the structure is checked rather than trusted: eight fixtures, every acceptance
 * criterion exercised by at least one of them, both halves of the exclusion pair
 * reading one model, both failure branches present, and every prompt a fixture
 * names actually defined.
 *
 * What this cannot check is the part that matters most — whether a recorded run
 * is any good. That is read by a person, against `rubric.md`.
 */

const EVALUATION = new URL("../../skills/tonight-recommend/evaluation/", import.meta.url);

const read = (path: string) => readFileSync(new URL(path, EVALUATION), "utf8");
const fixtures = readdirSync(new URL("fixtures/", EVALUATION))
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(read(`fixtures/${name}`)) as Fixture);

type Fixture = {
  id: string;
  title: string;
  user: string;
  condition: "ok" | "get_taste_fails";
  exists_for: string[];
  catches: string;
  construction_note?: string;
  sameModelAs?: string;
  observable?: {
    why_this_prompt?: string;
    binding_looks_like?: string[];
    not_binding_looks_like?: string[];
  };
  prompts: string[];
  model: { genres: unknown[]; mixes: unknown[]; movies: unknown[] } | null;
};

/**
 * Every outcome §8.3.1 of the implementation plan requires evidence for.
 *
 * Split where the criterion has two halves that can fail independently: an
 * exclusion can bind correctly and still leak into an unrelated request, and the
 * two failure branches are different behaviours with different evidence.
 */
const REQUIRED = ["AC1", "AC2", "AC3a", "AC3b", "AC4", "AC5", "AC6a", "AC6b"];

const scorer = await import("../../skills/tonight-recommend/evaluation/score.mjs");
const CANDIDATE = new URL("results/phase-1/", EVALUATION);
const accounting = () => readFileSync(new URL("ACCOUNTING.md", CANDIDATE), "utf8");
const run = (answer: string, header: Record<string, string> = {}) => ({
  file: "test.md",
  header: { fixture: "02-new-mix", prompt: "plain", get_taste: "ok", ...header },
  answer,
  stored: [] as { name: string; kind: string }[],
});

test("there are eight fixtures, and each says what it is for", () => {
  assert.equal(fixtures.length, 8, "the fixture set is not the eight the plan names");

  for (const fixture of fixtures) {
    assert.ok(fixture.title, `${fixture.id} has no title`);
    assert.ok(fixture.catches, `${fixture.id} does not say what it catches`);
    assert.ok(fixture.exists_for.length > 0, `${fixture.id} is for no acceptance criterion`);
    assert.match(fixture.user, /^google:eval-/, `${fixture.id} is not an evaluation user`);
    assert.ok(fixture.prompts.length > 0, `${fixture.id} is run with no prompt`);
  }
});

test("every acceptance criterion is exercised by at least one fixture", () => {
  // The hole this is here to catch: the plan's coverage matrix is prose, and a
  // criterion can quietly end up with no fixture against it. Then Step 8 passes
  // it by never having asked.
  for (const criterion of REQUIRED) {
    const against = fixtures.filter((fixture) => fixture.exists_for.includes(criterion));
    assert.ok(against.length > 0, `no fixture exercises ${criterion}`);
  }

  // And nothing claims a criterion that does not exist.
  for (const fixture of fixtures) {
    for (const criterion of fixture.exists_for) {
      assert.ok(REQUIRED.includes(criterion), `${fixture.id} names an unknown criterion ${criterion}`);
    }
  }
});

test("the exclusion pair is one model asked two questions", () => {
  // The most important test in the set, and the one easiest to break by editing
  // one half. Two models that have drifted apart prove nothing about exclusions:
  // the difference could be the model rather than the request.
  const explicit = fixtures.find((one) => one.id === "05-exclusion-explicit");
  const plain = fixtures.find((one) => one.id === "06-exclusion-plain");
  assert.ok(explicit && plain, "the exclusion pair is not both there");

  assert.equal(plain.sameModelAs, explicit.id, "the plain half defines a model of its own");
  assert.equal(plain.model, null, "the plain half carries a second copy of the model");
  assert.equal(plain.user, explicit.user, "the two halves are seeded for different users");

  // The exclusion has to actually be in the instruction, or neither half tests it.
  const mixes = explicit.model?.mixes as { instruction: string }[];
  assert.ok(
    mixes.some((mix) => /nothing (gory|with torture)/i.test(mix.instruction)),
    "no Mix in the pair carries an exclusion",
  );

  // One binds, the other must not, and they are asked different questions.
  assert.notDeepEqual(explicit.prompts, plain.prompts, "both halves ask the same thing");

  // And the difference has to be observable, which is the part that is easy to
  // lose. A request for a comedy proves nothing: a comedy recommendation carries
  // no gore whether the exclusion bound or not, so a silent global filter and
  // correct non-binding produce the same answer. The plain half must therefore
  // ask for what the exclusion rules out, and both halves must say what each
  // outcome looks like.
  for (const half of [explicit, plain]) {
    assert.ok(half.observable, `${half.id} does not say how the two outcomes are told apart`);
    assert.ok(
      half.observable.binding_looks_like?.length && half.observable.not_binding_looks_like?.length,
      `${half.id} describes only one of the two outcomes`,
    );
  }

  const prompts = readFileSync(new URL("prompts.md", EVALUATION), "utf8");
  const asked = prompts.match(/^\| `unrelated-plain` \| (.*?) \|/m)?.[1] ?? "";
  assert.match(
    asked,
    /gruesome|gory|brutal|nasty/i,
    "the unrelated request no longer collides with the exclusion, so the pair proves nothing",
  );
});

test("both get_taste failure branches are present, and neither is an empty model", () => {
  const failing = fixtures.filter((one) => one.condition === "get_taste_fails");
  assert.equal(failing.length, 2, "the two failure branches are not both there");

  const [explicit, ordinary] = failing.sort((a, b) => a.id.localeCompare(b.id));
  assert.ok(explicit.exists_for.includes("AC6a"), "no fixture covers the branch that stops");
  assert.ok(ordinary.exists_for.includes("AC6b"), "no fixture covers the disclosed fallback");

  // The fallback still recommends, so it still owes the answer shape.
  assert.ok(ordinary.exists_for.includes("AC1"), "the fallback is excused from the answer shape");

  // What fails has to be the read, not the model: a failure against an empty
  // model would be indistinguishable from an empty model.
  for (const fixture of failing) {
    const source = fixtures.find((one) => one.id === fixture.sameModelAs);
    assert.ok(source, `${fixture.id} names no model to fail against`);
    assert.ok(
      (source.model?.movies.length ?? 0) > 0,
      `${fixture.id} fails against a model with nothing in it`,
    );
  }
});

test("a prohibition is only counted once a fixture could have broken it", () => {
  // AC4 and AC5 are prohibitions, and a prohibition passes trivially against a
  // fixture that never offered the chance to break it. The fixtures that carry
  // them say, in writing, what makes the opportunity real.
  for (const fixture of fixtures.filter((one) => one.exists_for.includes("AC4"))) {
    assert.ok(
      fixture.construction_note,
      `${fixture.id} claims AC4 without saying how the model could break it`,
    );
    const states = (fixture.model?.movies as { state: string | null }[]).map((movie) => movie.state);
    assert.ok(
      states.some((state) => state !== null),
      `${fixture.id} claims AC4 with no film carrying a state`,
    );
  }

  // AC5's hardest case is the empty model, where there is nothing to anchor to.
  const empty = fixtures.find((one) => one.id === "01-empty");
  assert.ok(empty, "the empty-model fixture is gone");
  assert.ok(empty.exists_for.includes("AC5"), "the empty model is not used to test the anchor");
  assert.deepEqual(empty.model, { genres: [], mixes: [], movies: [] }, "the empty model is not empty");
});

test("every prompt a fixture names is defined, and every defined prompt is used", () => {
  const prompts = read("prompts.md");
  const defined = [...prompts.matchAll(/^\| `([a-z-]+)` \|/gm)].map((match) => match[1]);
  assert.ok(defined.length >= 5, "the prompt table could not be read");

  const used = new Set(fixtures.flatMap((fixture) => fixture.prompts));
  for (const prompt of used) {
    assert.ok(defined.includes(prompt), `no prompt is defined for ${prompt}`);
  }
  for (const prompt of defined) {
    assert.ok(used.has(prompt), `${prompt} is defined and never used`);
  }
});

test("the rubric carries the seven criteria and the eight required outcomes", () => {
  const rubric = read("rubric.md");

  for (const criterion of [
    "Fit",
    "Constraint compliance",
    "Decisiveness",
    "Justified personalization",
    "Discovery quality",
    "Unsupported claims",
    "False personalization",
  ]) {
    assert.ok(rubric.includes(`**${criterion}**`), `the rubric does not score ${criterion}`);
  }

  // Scored apart, because one of the two is the failure a user cannot catch.
  assert.match(
    rubric,
    /False personalization is scored separately from unsupported claims/,
    "the two are no longer told apart",
  );

  // The standard that makes a required outcome mean anything.
  assert.match(rubric, /must appear in every run/, "the rubric has no standard for a required outcome");
  assert.match(rubric, /must appear in no run/, "the rubric has no standard for a prohibition");

  for (const criterion of REQUIRED) {
    const shown = criterion.replace(/^AC/, "").replace(/([0-9])([ab])/, "$1$2");
    assert.ok(
      new RegExp(`\\*\\*${shown}\\*\\*`).test(rubric),
      `the rubric has no required outcome for ${criterion}`,
    );
  }
});

test("what a run saw is recorded per run, and shared models still match", () => {
  // One record of a run's input, and it belongs to that run. A second, per-fixture
  // recording used to sit beside these and disagree with them after a reseed —
  // two records both claiming to be authoritative is worse than one that is.
  const runs = new URL("results/baseline/runs/", EVALUATION);
  assert.equal(
    existsSync(new URL("results/baseline/get-taste/", EVALUATION)),
    false,
    "the second, per-fixture input record is back, and the two can disagree",
  );

  const recorded = readdirSync(runs).filter((name) => name.endsWith(".md"));
  const seenBy = new Map<string, string[]>();

  for (const name of recorded) {
    const run = readFileSync(new URL(name, runs), "utf8");
    const header = run.slice(0, run.indexOf("---", 4));
    const fixture = header.match(/^fixture: (.+)$/m)?.[1] ?? "";
    const file = header.match(/^taste_snapshot_file: (.+)$/m)?.[1] ?? "";
    const snapshot = readFileSync(new URL(file, runs), "utf8");

    assert.ok(JSON.parse(snapshot).genres, `${name}'s snapshot is not a taste model`);
    seenBy.set(fixture, [...(seenBy.get(fixture) ?? []), snapshot]);
  }

  // Every run of one fixture saw one model, and fixtures that declare they share
  // a model saw the same one — which is the whole of what the exclusion pair
  // proves, checked against what the runs actually got.
  for (const [fixture, snapshots] of seenBy) {
    assert.equal(new Set(snapshots).size, 1, `the runs of ${fixture} did not all see one model`);
  }

  for (const fixture of fixtures.filter((one) => one.sameModelAs)) {
    const mine = seenBy.get(fixture.id);
    const theirs = seenBy.get(fixture.sameModelAs as string);
    if (!mine || !theirs) continue;
    assert.equal(
      mine[0],
      theirs[0],
      `${fixture.id} did not see the same model as ${fixture.sameModelAs}`,
    );
  }
});

test("the baseline names the instructions it was recorded under, and agrees with itself", () => {
  /**
   * A baseline that cannot say which instructions produced it cannot be compared
   * with anything. The version is the digest the sync script appends.
   *
   * Against *its own* version rather than against whatever the instructions say
   * today: the baseline is frozen and the live digest moves with every change to
   * the skill. The first version of this test compared the two, which held only
   * until the instructions were first edited — and then reported a frozen record
   * as wrong for having stayed frozen. What has to be true is that the runbook,
   * the results and every recorded run name one and the same version.
   */
  const runbook = read("README.md");
  const results = read("results/baseline/README.md");

  const runs = new URL("results/baseline/runs/", EVALUATION);
  const recorded = readdirSync(runs).filter((name) => name.endsWith(".md"));
  const named = new Set(
    recorded.map(
      (name) => readFileSync(new URL(name, runs), "utf8").match(/^instructions: (.+)$/m)?.[1] ?? "",
    ),
  );

  assert.equal(named.size, 1, `the runs were recorded under ${named.size} different instruction versions`);
  const [version] = [...named];
  assert.match(version, /^[a-f0-9]{8}$/, "a run does not name an instruction digest");

  assert.ok(
    runbook.includes(version),
    `the runbook does not name ${version}, the version the runs were recorded under`,
  );
  assert.ok(
    results.includes(version),
    `the recorded baseline does not name ${version}, the version it was produced under`,
  );
});

test("the failure fixtures fail a call, not a connector", () => {
  // A connector that cannot authenticate tests a host with no Tonight at all,
  // which is a different scenario and is not what AC6 is about. The runbook has
  // to keep the two apart, and the mechanism has to leave the connection real.
  const runbook = read("README.md");

  assert.match(runbook, /Connector failure/, "the runbook does not name the wrong scenario");
  assert.match(runbook, /invocation failure/, "the runbook does not name the right one");
  assert.match(
    runbook.replace(/\s+/g, " "),
    /all eleven tools are discovered and usable/,
    "the runbook does not require a working connection before the failure",
  );
  assert.match(runbook, /get_server_info/, "nothing checks that the connection was live");

  // The mechanism is evaluation-only and forwards everything else untouched.
  const proxy = read("proxy.mjs");
  assert.match(proxy, /--fail/, "the proxy cannot fail a single tool");
  assert.match(proxy, /isError/, "a failed tool is not reported in MCP's own shape");
  assert.ok(
    runbook.includes("What is simulated, stated plainly"),
    "the runbook does not say which part of the failure is simulated",
  );
});

test("a run records enough to be scored, not only its answer", () => {
  // Four of the seven criteria need to know what the model did rather than what
  // it said: whether get_taste was called, what it saw, whether a claim about the
  // world had a tool behind it, and whether AC6 reported the real failure.
  const runbook = read("README.md");
  const header = runbook.slice(runbook.indexOf("## The run artifact"));
  const flat = header.replace(/\s+/g, " ");

  for (const field of [
    "fixture:",
    "prompt:",
    "run:",
    "side:",
    "instructions:",
    "host:",
    "model_requested:",
    "model_resolved:",
    "cli_version:",
    "session:",
    "tonight_tools:",
    "tonight_transcript:",
    "external_tools:",
    "external_evidence:",
    "taste_snapshot:",
    "taste_snapshot_file:",
    "get_taste:",
    "recorded:",
  ]) {
    assert.ok(header.includes(field), `a run is not required to record ${field}`);
  }

  // The exact words, the two transcripts, and the answer — each its own section.
  for (const section of [
    "## Prompt",
    "## Tonight MCP transcript",
    "## External tool evidence",
    "## Answer",
  ]) {
    assert.ok(header.includes(section), `a run has no ${section} section`);
  }

  // Absence has to be stated, or it cannot be told from an omission.
  assert.match(flat, /not_called/, "a run that never called get_taste cannot say so");
  assert.match(flat, /never an absent section|an absent section/, "an empty section may be left out");

  // The Tonight transcript is machine-written, because the agent's account of its
  // own tool use is part of what is being evaluated.
  assert.match(
    runbook.replace(/\s+/g, " "),
    /Use the proxy for every run, not only the failure ones/,
    "the transcript is only required where a tool is made to fail",
  );
});

test("the Tonight proxy is never claimed to see what it cannot", () => {
  // The finding this exists for: a proxy in front of one MCP endpoint cannot
  // observe a host-native web search, and a runbook that says otherwise turns a
  // log about Tonight into a claim about everything.
  const runbook = read("README.md").replace(/\s+/g, " ");
  const proxy = read("proxy.mjs").replace(/\s+/g, " ");

  for (const [what, text] of [
    ["the runbook", runbook],
    ["the proxy itself", proxy],
  ] as [string, string][]) {
    assert.match(
      text,
      /sees Tonight and nothing else/,
      `${what} does not say that the proxy's reach stops at Tonight`,
    );
  }

  // And it does not claim the log answers the external question.
  assert.equal(
    /log is the only machine-written evidence of what happened/.test(runbook),
    false,
    "the runbook still presents the Tonight log as the whole record of a run",
  );
  assert.match(
    runbook,
    /Evidence for those is captured separately/,
    "the runbook does not say where external evidence comes from instead",
  );
});

test("external tool evidence is its own thing, with three states and no silent None", () => {
  const runbook = read("README.md").replace(/\s+/g, " ");
  const rubric = read("rubric.md").replace(/\s+/g, " ");

  // Three states, because two would collapse the distinction the finding is about.
  for (const state of ["observable", "disabled", "not-observable"]) {
    assert.match(runbook, new RegExp(`\`${state}\``), `the runbook has no ${state} state`);
    assert.match(rubric, new RegExp(`\`${state}\``), `the rubric does not score the ${state} state`);
  }

  // The rule that keeps an absence of evidence from reading as evidence of absence.
  assert.match(
    runbook,
    /`None` and "not observable" are different answers and must never be written the same way/,
    "the runbook does not forbid writing unobservable as None",
  );
  assert.match(
    runbook,
    /may be `None` \*\*only\*\* when `external_tools` is `observable`/,
    "the runbook does not say when None is legitimate",
  );
  assert.match(
    rubric,
    /A missing evidence file is never read as "no tool was used"/,
    "the rubric does not forbid reading a missing file as an absence of calls",
  );

  // A host that will not show its traces has two sanctioned ways out, and
  // guessing is not one of them.
  assert.match(runbook, /disabled/, "the runbook offers no way to run without external tools");
  assert.match(
    runbook,
    /use a host that does expose them/i,
    "the runbook does not offer the other sanctioned path",
  );
  assert.match(
    rubric,
    /\*\*Not scored\.\*\*/,
    "an unobservable run is still allowed to pass the unsupported-claims criterion",
  );
});

test("a run is bound to the taste data it actually saw", () => {
  // The lifecycle bug this closes: a token expires, the seed is re-run to get a
  // new one, the fixture is quietly rewritten with new timestamps, and every
  // recording from before the refresh now describes data that is gone.
  const seed = read("seed.mjs");
  const runbook = read("README.md");

  // Matched on the branch rather than on the word: a flag named `--tokenish`
  // would contain `--token` and satisfy a looser check while doing nothing.
  assert.match(seed, /flag\("token"\)/, "there is no way to refresh a token without reseeding");
  assert.match(seed, /--token\b/, "the token path is not documented where it is read");
  assert.match(seed, /seeding NOTHING|seeds NOTHING/, "the token path does not say that it writes nothing");
  assert.match(seed, /flag\("snapshot"\)/, "a run cannot be bound to what it saw");
  assert.match(seed, /--snapshot\b/, "the snapshot path is not documented where it is read");
  assert.match(seed, /createHash/, "a snapshot carries no digest, so it cannot be checked");

  assert.match(runbook, /Use `--token`/, "the runbook does not tell anybody to refresh safely");
  assert.match(
    runbook.replace(/\s+/g, " "),
    /Seed once per fixture, then leave it alone/,
    "the runbook does not warn against reseeding between runs",
  );
  assert.match(
    runbook.replace(/\s+/g, " "),
    /Immediately before each run/,
    "the snapshot is not taken close enough to the run to prove anything",
  );
});

/**
 * The format, enforced against whatever runs exist.
 *
 * Empty today and that is not a failure — Step 1 is incomplete until the runs are
 * captured, and a permanently red test would say nothing anybody could act on.
 * What this does is make the first recorded run meet the contract rather than
 * discovering at scoring time that half of them cannot be scored.
 */
test("every recorded run carries its provenance and its evidence", () => {
  const runs = new URL("results/baseline/runs/", EVALUATION);
  const recorded = readdirSync(runs).filter((name) => name.endsWith(".md"));

  for (const name of recorded) {
    const run = readFileSync(new URL(name, runs), "utf8");
    const header = run.slice(0, run.indexOf("---", 4));
    const bound = (field: string) => header.match(new RegExp(`^${field}: (.+)$`, "m"))?.[1]?.trim();

    for (const field of [
      "fixture",
      "prompt",
      "run",
      "side",
      "instructions",
      "host",
      "model_requested",
      "model_resolved",
      "cli_version",
      "session",
      "tonight_tools",
      "tonight_transcript",
      "external_tools",
      "external_evidence",
      "taste_snapshot",
      "taste_snapshot_file",
      "get_taste",
      "recorded",
    ]) {
      assert.match(header, new RegExp(`^${field}:`, "m"), `${name} does not record ${field}`);
    }

    assert.match(header, /^get_taste: (ok|failed|not_called)$/m, `${name} is unclear about get_taste`);

    // A moving alias cannot identify what produced a run, so the resolved model
    // has to be an exact name rather than one.
    assert.match(
      header,
      /^model_resolved: claude-[a-z0-9-]+$/m,
      `${name} does not name the exact model that answered`,
    );
    assert.doesNotMatch(
      header,
      /^model_resolved: (sonnet|opus|haiku|fable|unknown)$/m,
      `${name} records an alias, or nothing, as the model that answered`,
    );
    assert.match(
      header,
      /^external_tools: (observable|disabled|not-observable)$/m,
      `${name} does not say what could be seen of the host's own tools`,
    );

    // The distinction the whole format exists for: "nothing was called" is a fact
    // about the run and may only be claimed where something was watching.
    if (bound("external_tools") !== "observable") {
      assert.notEqual(
        bound("external_evidence"),
        "None",
        `${name} records None for external tools that were not observable`,
      );
    }

    for (const section of [
      /^## Prompt$/m,
      /^## Tonight MCP transcript$/m,
      /^## External tool evidence$/m,
      /^## Answer$/m,
    ]) {
      assert.match(run, section, `${name} is missing a required section: ${section}`);
    }

    // The companions have to be there, not merely named.
    const named = [
      ["taste_snapshot_file", bound("taste_snapshot_file")],
      ["tonight_transcript", bound("tonight_transcript")],
      ...(bound("external_tools") === "observable" && bound("external_evidence") !== "None"
        ? [["external_evidence", bound("external_evidence")] as [string, string]]
        : []),
    ] as [string, string | undefined][];

    for (const [field, where] of named) {
      assert.ok(where, `${name} names no ${field}`);
      assert.ok(
        readFileSync(new URL(where as string, runs), "utf8").length > 0,
        `${name} names a ${field} that is not there`,
      );
    }

    // And the snapshot is the one the header claims, so a swapped file is caught.
    const snapshot = readFileSync(new URL(bound("taste_snapshot_file") as string, runs), "utf8");
    const digest = createHash("sha256").update(snapshot, "utf8").digest("hex").slice(0, 16);
    assert.equal(bound("taste_snapshot"), `sha256:${digest}`, `${name}'s snapshot is not the one it names`);
  }
});

test("a rerun cannot quietly mix itself into an earlier one", () => {
  // The three files of a run only mean anything together, and the proxy appends.
  // A retry that overwrote the answer and the snapshot while leaving the log
  // would read as one run and be two.
  const runner = read("run-baseline.mjs");

  assert.match(runner, /--force/, "there is no way to recreate a run deliberately");
  // The guard itself, not its message: a message inside a branch that can never
  // run still matches, and the branch is the thing that refuses.
  assert.match(runner, /if \(already\.length && !FORCE\)/, "an existing run is not refused");
  assert.match(runner, /already has \$\{already\.length\} of its 3 files/, "the refusal says nothing useful");
  assert.match(runner, /for \(const part of already\) rmSync/, "a forced rerun does not recreate the whole triple");

  // The proxy that answers has to be the one this run spawned. Something left
  // over from the previous run answers just as readily, and the calls would land
  // in the previous run's log.
  assert.match(runner, /listening\(PORT, proxy\.pid\)/, "the runner does not check whose proxy it found");
  assert.match(runner, /who\.pid === pid/, "any listener is accepted as this run's proxy");
  assert.match(read("proxy.mjs"), /__evaluation/, "the proxy cannot say which process it is");

  // And it is gone before the next run starts.
  assert.match(runner, /async function shutDown/, "the runner does not wait for the proxy to stop");
  assert.match(runner, /proxy\.once\("exit"/, "the runner does not await the proxy's exit");
  assert.match(runner, /still listening on \$\{port\}/, "the runner does not check the port was released");
});

test("the model is pinned to an exact name, never an alias", () => {
  const runner = read("run-baseline.mjs");

  assert.match(runner, /option\("model", "claude-sonnet-5"\)/, "the default model is an alias again");
  assert.match(runner, /function answeredBy/, "the resolved model is not read from the session");
  assert.equal(
    /Object\.keys\(parsed\.modelUsage/.test(runner),
    false,
    "the resolved model is taken from modelUsage, which also lists auxiliary models",
  );
  assert.match(runner, /execFileSync\("claude", \["--version"\]/, "the CLI version is assumed rather than asked");
});

test("a lead is recognised by what it does, not by one phrasing of it", () => {
  /**
   * R5. The first scoring pass looked for `I'd start with` and nothing else, so
   * it read `01-empty__plain__05` — whose lead is "my lead tonight: The Nice
   * Guys (2016)" — as producing no recommendation, and reported four failures
   * where there were three. A detector that recognises one wording measures the
   * wording, not the behaviour.
   */
  for (const phrasing of [
    "I'd start with Zodiac",
    "I'd start with *Prisoners* (2013)",
    "I'd start here: *Prisoners* (2013)",
    "my lead tonight: **The Nice Guys** (2016)",
    "My pick is *Paterson* (2016)",
    "I'd begin with *Zodiac* (2007)",
    "I'd lead with *Stalker* (1979)",
    "The lead is *Moon* (2009)",
  ]) {
    assert.ok(scorer.hasLead(phrasing), `a lead phrased "${phrasing}" is not recognised`);
  }

  // And a list is not a lead. These are the answers AC1 exists to fail.
  for (const listing of [
    "Here are a few options for tonight.",
    "Some things you might like:",
    "A few directions, depending on your mood:",
    "What are you in the mood for tonight?",
    // Commitment without a film is not a lead: it commits to nothing.
    "My pick depends on the mood",
    "I'd start with whatever you feel like",
  ]) {
    assert.ok(!scorer.hasLead(listing), `"${listing}" was read as a lead`);
  }
});

test("an ordinary request that recommends nothing fails AC1", () => {
  // The scoping error the first pass made: §8.3.1 requires the shape of an
  // ordinary request, so producing none fails the row rather than leaving it
  // unscored. An empty model is not an exemption.
  const asked = run("Nothing saved yet. Are you in the mood for something tense, or lighter?", {
    fixture: "01-empty",
  });
  const answered = run(
    "**The idea:** a tight thriller.\n\nI'd start with *Prisoners* (2013).\n\n- If you want colder: *Zodiac* (2007)\n- If you want lighter: *Knives Out* (2019)",
    { fixture: "01-empty" },
  );
  const askedRow = scorer.score([asked]).AC1;
  assert.equal(askedRow.verdict, "fail");
  assert.match(askedRow.failures[0], /no lead/, "the failure is not attributed to the missing lead");
  assert.equal(scorer.score([answered]).AC1.verdict, "pass");

  // A list with the right number of directions and no lead must still fail, and
  // must fail *for the lead*. Without this case the direction count masks the
  // lead check: a question has no directions either, so removing the lead rule
  // entirely still produces a failure — for the wrong reason.
  const listed = run(
    "Here are three for tonight:\n\n- *Prisoners* (2013)\n- *Zodiac* (2007)\n- *Knives Out* (2019)",
    { fixture: "01-empty" },
  );
  const listedRow = scorer.score([listed]).AC1;
  assert.equal(listedRow.verdict, "fail");
  assert.match(listedRow.failures[0], /no lead/, "a list with 3 directions passed AC1");

  // The one exemption is derived from the run's own facts — a taste-explicit
  // request whose read failed must stop — never from a list of fixture names.
  const stopped = run("The store didn't answer, so I can't read your taste. Retry?", {
    fixture: "07-failure-explicit",
    prompt: "taste-explicit",
    get_taste: "failed",
  });
  assert.equal(scorer.score([stopped]).AC1.verdict, "pass");
  assert.ok(!scorer.owesRecommendation(stopped.header));
  // ...and the ordinary failure branch is NOT exempt: it still recommends.
  assert.ok(
    scorer.owesRecommendation({ fixture: "08-failure-ordinary", prompt: "plain", get_taste: "failed" }),
  );
});

test("certainty about a specific film's fit is bounded; certainty about intent is not", () => {
  /**
   * R4's standard, scored. A state-free Mix counts fully as declarative intent —
   * nothing here reduces that, and nothing grades the Mix. What fails is an
   * unhedged superlative about one film *fitting* it while no film under it has
   * confirmed that any does.
   */
  const over = run("I'd start with *Paterson* (2016) — about as pure a fit for Reading Room as exists.");
  assert.equal(scorer.score([over]).AC2.verdict, "fail");

  // Hedged but still decisive stays legal: the shape needs a committed lead.
  for (const hedged of [
    "I'd start with *Paterson* (2016) — it sits right in what Reading Room is asking for.",
    "I'd start with *Paterson* (2016). It looks like a good fit, though nothing under Reading Room has told me yet.",
    "I'd start with *Paterson* (2016) — closest I know to what you wrote, on intent at least.",
  ]) {
    assert.equal(scorer.score([run(hedged)]).AC2.verdict, "pass", `hedged wording failed: ${hedged}`);
  }

  // Confidence about what they meant is never penalised.
  const intent = run("You clearly meant patient, character-first films — that much is unambiguous.");
  assert.equal(scorer.score([intent]).AC2.verdict, "pass");
});

test("a verdict is pass or fail — there is no partial", () => {
  // AC3a was recorded as `partial` by the first pass. §8.3.1 makes every row an
  // every-run criterion, so one bad run fails the row.
  const stored = [{ name: "Quiet Dread", kind: "mix" }];
  const uses = { ...run("Your Quiet Dread mix fits: I'd start with *Insomnia* (2002)."), stored };
  const ignores = { ...run("I'd start with *Martyrs* (2008)."), stored };
  const rows = scorer.score([uses, ignores]);
  assert.equal(rows.AC3a.verdict, "fail", "one run without model influence must fail the row");
  for (const row of Object.values(rows) as { verdict: string }[]) {
    assert.ok(["pass", "fail"].includes(row.verdict), `"${row.verdict}" is not a verdict`);
  }
  // The record may *say* the first pass used `partial` — that is the correction
  // it exists to document. What it may not do is score a row that way.
  const table = accounting().split("## The rows")[1].split("**Failed rows")[0];
  assert.doesNotMatch(table, /\bpartial\b/i, "a row is still scored as partial");
});

test("the retained candidate scores as five failed rows, and only three were rescored", () => {
  // The authoritative accounting for `645a831f`. R5's stop condition: if the
  // clarified rules move any row other than AC1, AC2 and AC3a, something more
  // than a clarification happened.
  const text = accounting();
  const rowsTable = text.split("## The rows")[1].split("**Failed rows")[0];
  const failed = REQUIRED.filter((ac) => {
    const label = ac.replace("AC", "");
    return new RegExp(`\\|\\s*\\*\\*${label}\\*\\*\\s*\\|\\s*\\*\\*fail\\*\\*`).test(rowsTable);
  });
  assert.deepEqual(failed, ["AC1", "AC2", "AC3a", "AC3b", "AC6b"]);
  assert.equal(failed.length, 5, "the candidate must resolve to exactly five failed rows");
  assert.match(text, /\*\*Failed rows: 1, 2, 3a, 3b, 6b\.\*\*/);
  assert.match(text, /Rows \*\*1, 2 and 3a\*\* moved\. Every other row is as the reviewed evaluation left it\./);

  // It is the candidate's record, not a second baseline.
  assert.match(text, /not\*\* a baseline/);
  assert.match(text, /645a831f/);

  // And the scorer agrees with the record on the rows it owns.
  const rows = scorer.score(scorer.loadRuns(fileURLToPath(CANDIDATE)));
  for (const ac of ["AC1", "AC2", "AC3a"]) {
    assert.equal(rows[ac].verdict, "fail", `${ac} should fail on the retained candidate`);
  }
  assert.deepEqual(
    rows.AC1.failures.map((f: string) => f.split(":")[0]).sort(),
    ["01-empty__plain__01.md", "01-empty__plain__02.md", "01-empty__plain__04.md",
     "08-failure-ordinary__plain__01.md"],
  );
  // All five: three name nothing stored, and two name `Quiet Dread` only to
  // contrast with it, which is not evidence that stored taste supported them.
  assert.deepEqual(
    rows.AC3a.failures.map((f: string) => f.split(":")[0]).sort(),
    [1, 2, 3, 4, 5].map((n) => `06-exclusion-plain__unrelated-plain__0${n}.md`),
  );
  assert.deepEqual(
    rows.AC2.failures.map((f: string) => f.split(":")[0]).sort(),
    ["02-new-mix__plain__05.md", "02-new-mix__taste-explicit__01.md",
     "02-new-mix__taste-explicit__05.md"],
  );
});

test("AC3a counts stored taste used in support, not merely named", () => {
  /**
   * R5's second repair. `06-exclusion-plain` runs 02 and 03 both name the
   * `Quiet Dread` Mix — one as "not the quiet-dread stuff", the other to say it
   * is "noted, not overriding you, just flagging the contrast". Naming a Mix in
   * order to set it aside is not evidence that stored taste shaped the answer,
   * and counting it as such was how those runs passed a row they fail.
   */
  const stored = [
    { name: "Quiet Dread", kind: "mix" },
    { name: "Slow Burn", kind: "genre" },
    { name: "Zodiac", kind: "movie" },
  ];
  const evidence = (answer: string) => scorer.usesPositiveEvidence({ answer, stored });

  // Named only to be discounted.
  for (const narration of [
    "Got it — proper nasty tonight, not the quiet-dread stuff.",
    "your Quiet Dread mix is no-gore — noted, not overriding you, just flagging the contrast",
    "tonight is different from what is in there, though your Quiet Dread mix says no gore",
  ]) {
    assert.ok(!evidence(narration), `exclusion narration counted as evidence: ${narration}`);
  }

  // Named in support.
  for (const support of [
    "Your Quiet Dread mix is exactly the register, so I'd start with *Insomnia* (2002).",
    "you loved Zodiac, so I'd start with *Memories of Murder* (2003)",
    "the same shape as *Zodiac* for you",
  ]) {
    assert.ok(evidence(support), `positive use not counted: ${support}`);
  }
});

test("a Genre counts when attributed to them, never as ordinary film vocabulary", () => {
  /**
   * `Slow Burn` is a Genre this user wrote and also a phrase every critic uses.
   * Capitalisation cannot separate them — the capital in "a Slow Burn that
   * lulls you" is the writer's, not a citation — so attribution does instead.
   */
  const stored = [{ name: "Slow Burn", kind: "genre" }];
  const evidence = (answer: string) => scorer.usesPositiveEvidence({ answer, stored });

  for (const generic of [
    "Audition (1999): a Slow Burn that lulls you for an hour",
    "a slow burn that lulls you for an hour",
    "this is a slow burn with a savage final act",
  ]) {
    assert.ok(!evidence(generic), `generic prose counted as a Genre citation: ${generic}`);
  }

  for (const attributed of [
    "because you like slow-burn stories, try *Cure* (1997)",
    "you tend to like slow burn thrillers",
    "your taste for slow-burn films points here",
    "your Slow Burn genre",
  ]) {
    assert.ok(evidence(attributed), `an attributed Genre reference was missed: ${attributed}`);
  }
});

test("AC2 catches every maximal form of a specific-fit claim", () => {
  // The phrase layer only: whether a sentence makes a maximal claim at all.
  // What it is a claim *about* is scoped separately, in the test below.
  //
  // The span between the two halves is whatever the sentence needs. A fixed
  // 40-character window missed the retained run that names the Mix instruction
  // in between, which is how `__taste-explicit__01` went unrecorded.
  for (const maximal of [
    "about as pure a fit for Reading Room as exists",
    "about as pure a fit for wanting to know a person, not a plot, as you'll find",
    "as close a match for what you wrote as there is",
    "couldn't ask for a closer fit",
    "a perfect fit",
  ]) {
    assert.match(maximal, scorer.OVERCONFIDENT_FIT, `maximal fit claim missed: ${maximal}`);
  }
  for (const allowed of [
    "it sits right in what Reading Room is asking for",
    "looks like a good fit, though nothing under it has told me yet",
    "closest I know, on intent at least",
    "You clearly meant patient, character-first films — that much is unambiguous",
  ]) {
    assert.doesNotMatch(allowed, scorer.OVERCONFIDENT_FIT, `hedged wording failed AC2: ${allowed}`);
  }
});

test("AC2 guards certainty about a film, never about the Mix or the intent", () => {
  /**
   * P5 says a state-free Mix counts fully as declarative intent, so confidence
   * that the user meant what they wrote is never reduced — only confidence that
   * a *particular film* matches it, while nothing under the Mix has confirmed
   * that anything does.
   *
   * The two forms read almost identically and differ in their subject:
   *
   *     Reading Room is a perfect fit for the evening you described.   the Mix
   *     It's about as pure a fit for Reading Room as exists.           the film
   *
   * Note where the Mix sits in the second — it is the *object*, what the film is
   * claimed to fit. A rule that looked for the Mix name anywhere in the sentence
   * would excuse all three of the retained failures.
   */
  const stored = [
    { name: "Reading Room", kind: "mix" },
    { name: "Slow Burn", kind: "genre" },
    // Stored, and still never an intent subject: `Zodiac` being in the model
    // says nothing about whether *this* recommendation fits.
    { name: "Zodiac", kind: "movie" },
  ];
  const fires = (a: string) => scorer.specificFilmFitClaims(a, stored).length > 0;

  // A maximal claim about a specific film.
  for (const film of [
    "The Conversation is about as pure a fit as you'll find.",
    "This film is a perfect match for you.",
    "It's about as pure a fit for Reading Room as exists.",
    "It's about as pure a fit for wanting to know a person, not a plot, as you'll find.",
    "I'd start with *Paterson* (2016). It is a perfect fit.",
    // A stored Movie as the subject: exempting it would excuse the claim.
    "Zodiac is a perfect fit.",
    // The Mix is named, but `which` governs the claim and stands for the film.
    // Allowing these was the defect: a Mix mentioned earlier in the sentence is
    // not the thing being claimed to fit.
    "Reading Room led me to Paterson, which is a perfect fit.",
    "Your Mix points to Paterson, which is a perfect fit.",
    // Same structure without the comma, so the clause split has nothing to cut
    // on and the relative pronoun is the only thing identifying the subject.
    "Paterson sits in Reading Room which is a perfect fit.",
    // A new clause with its own subject and no relative pronoun: the Mix governs
    // the first clause, the film governs the claim.
    "Reading Room is strong, and Paterson is a perfect fit.",
  ]) {
    assert.ok(fires(film), `a specific-film fit claim was allowed: ${film}`);
  }

  // The same certainty, about the Mix, the instruction or the evening.
  for (const intent of [
    "Reading Room is a perfect fit for the evening you described.",
    "That Mix is a perfect fit for tonight.",
    "Your instruction is about as exact a match as exists for what you want.",
    "What you wrote is a perfect fit for this kind of evening.",
    "The Reading Room idea is a perfect match for the evening you described.",
  ]) {
    assert.ok(!fires(intent), `confidence about intent was scored as overconfidence: ${intent}`);
  }

  // And the three retained failures are still caught, by subject rather than by
  // the phrase alone.
  const rows = scorer.score(scorer.loadRuns(fileURLToPath(CANDIDATE)));
  assert.deepEqual(
    rows.AC2.failures.map((f: string) => f.split(":")[0]).sort(),
    ["02-new-mix__plain__05.md", "02-new-mix__taste-explicit__01.md",
     "02-new-mix__taste-explicit__05.md"],
  );
});
