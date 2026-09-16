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
/**
 * A synthetic run carrying the provenance a recorded one carries, so that
 * `admissibility` is exercised against a valid artifact and only deliberate
 * damage makes it fault.
 */
const run = (answer: string, header: Record<string, string> = {}) => ({
  file: "test.md",
  header: {
    fixture: "02-new-mix",
    prompt: "plain",
    run: "01",
    side: "test",
    instructions: "test0000",
    host: "claude -p (Claude Code CLI, --bare)",
    model_requested: "claude-sonnet-5",
    model_resolved: "claude-sonnet-5",
    cli_version: "2.1.273",
    session: "00000000-0000-0000-0000-000000000000",
    tonight_tools: "11 discovered",
    tonight_transcript: "logs/test.jsonl",
    external_tools: "disabled",
    external_evidence: "n/a",
    // the digest of the empty snapshotBody below, so a valid run stays valid
    taste_snapshot: "sha256:e3b0c44298fc1c14",
    taste_snapshot_file: "snapshots/test.json",
    get_taste: "ok",
    recorded: "2026-09-16T00:00:00.000Z",
    ...header,
  } as Record<string, string>,
  answer,
  snapshotBody: "",
  stored: [] as { name: string; kind: string }[],
  stateful: [] as { title: string; state: string }[],
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

/**
 * The deterministic layer, held to what it is allowed to decide.
 *
 * `docs/work/evaluation-architecture.md` gives this file two jobs and no third:
 * say whether a run can be scored at all, and surface literal candidates for
 * the blind pass. Every AC1–AC6 verdict belongs to that pass. The contracts
 * below check the division as much as the detection — a flag that could fail a
 * criterion would put two evaluators in charge of one verdict.
 */
const stateRich = { fixture: "03-state-rich", get_taste: "ok" };
const watched = (title: string, state: string) => [{ title, state }];
const flagsOf = (r: ReturnType<typeof run>, ac?: string) =>
  scorer.flags([r]).filter((f: { ac: string }) => !ac || f.ac === ac);

test("the deterministic layer returns faults and flags, and no criterion verdict", () => {
  const result = scorer.score([run("I'd start with **Prisoners** (2013).", stateRich)]);
  assert.deepEqual(Object.keys(result).sort(), ["faults", "flags"]);
  // The shape that used to exist. Its absence is the architecture.
  for (const ac of ["AC1", "AC2", "AC3a", "AC4", "AC5", "AC6a", "AC6b"]) {
    assert.equal(ac in result, false, `${ac} is still decided deterministically`);
  }
  for (const flag of result.flags) {
    assert.equal("verdict" in flag, false, "a flag carries a verdict");
    assert.equal("pass" in flag, false, "a flag carries a verdict");
  }
});

test("no semantic parser survives in the scorer", () => {
  const source = readFileSync(new URL("score.mjs", EVALUATION), "utf8");
  for (const gone of [
    "governingSubject",
    "specificFilmFitClaims",
    "usesPositiveEvidence",
    "statefulOffers",
    "recommendationUnits",
    "offeredFilm",
    "CLAUSE_BREAK",
    "ATTRIBUTION",
    "POSSESSION",
    "CONTRAST",
    "EVIDENCE_BEFORE",
    "DIRECTION_CUE",
    "hasLead",
  ]) {
    assert.equal(source.includes(gone), false, `${gone} is still in the deterministic scorer`);
  }
});

/* -- AC1: admissibility and structural flags ------------------------------- */

test("AC1 zero-signal is a flag, never a fault", () => {
  // An interview answer is a bad recommendation, not a broken artifact, so it
  // is surfaced and left to the blind judge.
  const interview = run(
    "What kind of mood are you in tonight — something light, or more gripping?",
    stateRich,
  );
  const [flag] = flagsOf(interview, "AC1").filter(
    (f: { kind: string }) => f.kind === "no-recommendation-signal",
  );
  assert.ok(flag, "an answer with no recommendation signal is not surfaced at all");
  assert.match(flag.quote, /What kind of mood/, "the flag does not quote the answer");
  assert.deepEqual(scorer.admissibility([interview]), [], "a bad answer became a fault");
});

test("a valid recommendation carrying none of the three signals is not failed", () => {
  // "Watch Paterson tonight." — no commitment idiom, no list, no year, and a
  // perfectly good answer. It may be flagged; it must never fault.
  const plain = run("Watch Paterson tonight.", stateRich);
  assert.deepEqual(scorer.admissibility([plain]), [], "a valid recommendation was failed");
});

test("AC1 emits cue, item and conditional flags without failing anything", () => {
  const flat = run(
    "Here are some picks.\n\n1. **A** (2001)\n2. **B** (2002)\n3. **C** (2003)\n4. **D** (2004)\n",
    stateRich,
  );
  const kinds = flagsOf(flat, "AC1").map((f: { kind: string }) => f.kind);
  assert.ok(kinds.includes("commitment-cue-count"), "no cue flag for an answer with no lead");
  assert.ok(kinds.includes("item-count"), "no item flag for four items");
  assert.ok(kinds.includes("unconditional-items"), "no flag for items that state no condition");
  assert.deepEqual(scorer.admissibility([flat]), [], "structural flags became a fault");
});

test("AC1 flags nothing when the shape is the approved one", () => {
  const shaped = run(
    "I'd start with **Prisoners** (2013).\n\n" +
      "- **If you want it colder** — *Enemy* (2013).\n" +
      "- **When you'd rather laugh** — *In Bruges* (2008).\n",
    stateRich,
  );
  assert.deepEqual(flagsOf(shaped, "AC1"), []);
});

test("AC1 asks nothing of a run that owes no recommendation", () => {
  const stopped = run("I couldn't reach your taste model. Want me to try again?", {
    fixture: "07-failure-explicit",
    prompt: "taste-explicit",
    get_taste: "failed",
  });
  assert.deepEqual(flagsOf(stopped, "AC1"), []);
  assert.deepEqual(scorer.admissibility([stopped]), []);
});

/* -- AC2: a literal phrase flag, with no subject parser -------------------- */

test("AC2 flags a maximal-fit phrase and quotes where it sits", () => {
  const r = run(
    "Reading Room is about as pure a fit as exists for a night like this.",
    { fixture: "02-new-mix", get_taste: "ok" },
  );
  const [flag] = flagsOf(r, "AC2");
  assert.equal(flag.kind, "maximal-fit-claim");
  // An absent phrase fails this too — "" matches nothing.
  assert.match(flag.phrase ?? "", /as pure a fit as exists/);
  assert.match(flag.quote, /Reading Room/, "the quote does not carry its own context");
});

test("AC2 flags the claim without deciding what it is about", () => {
  // Identical phrasing, one about the Mix and one about a film. The old scorer
  // tried to tell them apart by parsing the subject; both are now flagged and
  // the blind judge separates them.
  const shaped = (claim: string) =>
    run(
      `${claim}\n\nI'd start with **Paterson** (2016).\n\n` +
        "- **If you want more ache** — *Manchester by the Sea* (2016).\n" +
        "- **When you'd rather go stranger** — *A Ghost Story* (2017).\n",
      { fixture: "02-new-mix", get_taste: "ok" },
    );
  const aboutMix = shaped("Reading Room is a perfect fit for the evening you described.");
  const aboutFilm = shaped("*Paterson* is a perfect fit for Reading Room.");
  assert.equal(flagsOf(aboutMix, "AC2").length, 1);
  assert.equal(flagsOf(aboutFilm, "AC2").length, 1);
  assert.deepEqual(scorer.admissibility([aboutMix]), [], "a maximal-fit phrase became a fault");
});

/* -- AC3a: provenance and applicability, containment as a flag only -------- */

test("AC3a flags an ordinary answer that names nothing stored", () => {
  const r = {
    ...run("I'd start with **Prisoners** (2013).\n\n- **If X** — *A* (2001).\n- **If Y** — *B* (2002).\n", stateRich),
    stored: [{ name: "Quiet Dread", kind: "mix" }],
  };
  const [flag] = flagsOf(r, "AC3a");
  assert.equal(flag.kind, "no-stored-name");
});

test("AC3a containment is a flag, never a failure — a paraphrase names nothing", () => {
  // R3: "a paraphrase they would recognise as their own is enough". An answer
  // that paraphrases satisfies AC3a and still scores zero on containment, so
  // this must never become a fault.
  const paraphrase = {
    ...run(
      "You lean toward dread that arrives without music, in daylight, and takes its time. " +
        "I'd start with **Prisoners** (2013).\n\n- **If X** — *A* (2001).\n- **If Y** — *B* (2002).\n",
      stateRich,
    ),
    stored: [{ name: "Quiet Dread", kind: "mix" }],
  };
  assert.equal(flagsOf(paraphrase, "AC3a").length, 1, "the paraphrase was not flagged");
  assert.deepEqual(scorer.admissibility([paraphrase]), [], "a paraphrase was failed mechanically");
});

test("AC3a says nothing when the request points away from the model", () => {
  const unrelated = {
    ...run("Here is some brutal horror.\n\n- *Martyrs* (2008)\n- *Inside* (2007)\n", {
      fixture: "06-exclusion-plain",
      prompt: "unrelated-plain",
      get_taste: "ok",
    }),
    stored: [{ name: "Quiet Dread", kind: "mix" }],
  };
  assert.deepEqual(flagsOf(unrelated, "AC3a"), []);
  assert.equal(scorer.materiallyRelevant(unrelated), false);
});

test("AC3a says nothing when the taste read never succeeded", () => {
  const failed = {
    ...run("I couldn't load your taste. I'd start with **Prisoners** (2013).", {
      fixture: "08-failure-ordinary",
      prompt: "plain",
      get_taste: "failed",
    }),
    stored: [{ name: "Quiet Dread", kind: "mix" }],
  };
  assert.deepEqual(flagsOf(failed, "AC3a"), []);
});

/* -- AC4: a contradiction flag, with no offer parser ----------------------- */

test("AC4 flags novelty language against a stored state, with title and state", () => {
  const r = {
    ...run(
      "- **If you want the dread without the bleakness:** *The Vanishing* (1988) is already " +
        "on your list and unseen by you.",
      stateRich,
    ),
    stateful: watched("The Vanishing", "seen"),
  };
  const [flag] = flagsOf(r, "AC4");
  assert.equal(flag.kind, "novelty-against-state");
  assert.equal(flag.title, "The Vanishing");
  assert.equal(flag.state, "seen");
  assert.match(flag.quote, /already on your list and unseen by you/);
});

test("AC4 flags every judged state, not only seen", () => {
  for (const state of ["seen", "liked", "loved", "disliked"]) {
    const r = {
      ...run("I'd start with **Zodiac** (2007) — a new one for you.", stateRich),
      stateful: watched("Zodiac", state),
    };
    assert.equal(flagsOf(r, "AC4").length, 1, `a ${state} film was not flagged`);
  }
});

test("AC4 may flag an evidence mention, and never fails it", () => {
  // The ambiguity the offer parser existed to resolve. High recall is the point:
  // the flag fires, the blind judge decides it was evidence, nothing fails.
  const r = {
    ...run(
      "I'd start with **Mystic River** (2003) — the same register as *Memories of Murder*, " +
        "and you haven't told me you've seen it.",
      stateRich,
    ),
    stateful: watched("Memories of Murder", "loved"),
  };
  assert.equal(flagsOf(r, "AC4").length, 1, "the ambiguous case is not surfaced at all");
  assert.deepEqual(scorer.admissibility([r]), [], "an ambiguous mention became a fault");
});

test("AC4 leaves not_seen and unstored films alone", () => {
  const notSeen = {
    ...run("I'd start with **Past Lives** (2023) — you haven't seen it.", stateRich),
    stateful: [], // statefulTitles never lists not_seen or null
  };
  assert.deepEqual(flagsOf(notSeen, "AC4"), []);

  const unstored = {
    ...run("I'd start with **No Country for Old Men** (2007) — new to you.", stateRich),
    stateful: watched("Zodiac", "loved"),
  };
  assert.deepEqual(flagsOf(unstored, "AC4"), []);
});

test("AC4 matches a stored title whole, never inside a longer one", () => {
  const r = {
    ...run("I'd start with **Moonlight** (2016) — new to you.", { fixture: "04-contradictory", get_taste: "ok" }),
    stateful: watched("Moon", "liked"),
  };
  assert.deepEqual(flagsOf(r, "AC4"), [], "Moon was found inside Moonlight");
});

test("statefulTitles reads states from the snapshot and omits the stateless", () => {
  const titles = scorer.statefulTitles({
    movies: [
      { title: "The Vanishing", state: "seen" },
      { title: "Past Lives", state: null },
      { title: "Anticipated", state: "not_seen" },
      { title: "Zodiac", state: "loved" },
    ],
  });
  assert.deepEqual(
    titles.map((t: { title: string }) => t.title),
    ["The Vanishing", "Zodiac"],
  );
});

/* -- the retained corpora -------------------------------------------------- */

test("the retained candidates still surface their known findings", () => {
  const of = (dir: string) =>
    scorer.score(scorer.loadRuns(fileURLToPath(new URL(dir, EVALUATION))));

  // a3357c1c — the defect the paired blind comparison found. It is a flag now,
  // adjudicated blind, and it must still be impossible to miss.
  const repaired = of("results/phase-1-repaired/");
  assert.deepEqual(repaired.faults, [], "the repaired candidate is no longer admissible");
  const vanishing = repaired.flags.filter(
    (f: { ac: string; title?: string }) => f.ac === "AC4" && f.title === "The Vanishing",
  );
  assert.equal(vanishing.length, 1, "The Vanishing contradiction no longer surfaces");
  assert.equal(vanishing[0].run, "03-state-rich__plain__04.md");
  assert.equal(vanishing[0].state, "seen");

  // 645a831f — the four runs that produced no recommendation, and the three
  // maximal-fit claims. Both were criterion failures under the old scorer; both
  // are flags now, on the same runs.
  const failed = of("results/phase-1/");
  assert.deepEqual(failed.faults, [], "a well-formed candidate reports admissibility faults");
  const silent = failed.flags
    .filter((f: { kind: string }) => f.kind === "no-recommendation-signal")
    .map((f: { run: string }) => f.run);
  assert.deepEqual(silent.sort(), [
    "01-empty__plain__01.md",
    "01-empty__plain__02.md",
    "01-empty__plain__04.md",
    "08-failure-ordinary__plain__01.md",
  ]);
  assert.equal(
    failed.flags.filter((f: { ac: string }) => f.ac === "AC2").length,
    3,
    "the three maximal-fit claims no longer surface",
  );

  // f098fd5b — the frozen baseline is a valid recording of bad answers. Every
  // one of its runs is admissible; what is wrong with them is the judge's.
  const baseline = of("results/baseline/");
  assert.deepEqual(baseline.faults, [], "the frozen baseline is reported as unscorable");
  assert.ok(
    baseline.flags.filter((f: { kind: string }) => f.kind === "no-recommendation-signal").length >
      0,
    "the baseline's interview answers no longer surface",
  );
});

test("no answer content can produce a fault, however bad the answer is", () => {
  // The ownership boundary, stated as a property. Nothing about what an answer
  // says may make a run unscorable — only the artifact around it can.
  const answers = [
    "What mood are you in?",
    "Watch Paterson tonight.",
    "1. A (2001)\n2. B (2002)\n3. C (2003)\n4. D (2004)\n",
    "*Paterson* is a perfect fit for Reading Room, and you haven't seen Zodiac (2007).",
    "",
  ];
  for (const answer of answers) {
    const faults = scorer.admissibility([{ ...run(answer, stateRich), stateful: [] }]);
    // The empty answer is the one artifact fault here: nothing was recorded.
    const expected = answer.trim() ? [] : ["test.md: no answer recorded"];
    assert.deepEqual(faults, expected, `answer content produced a fault: ${answer.slice(0, 40)}`);
  }
});

test("a synthetic run carries the whole required provenance schema", () => {
  // The helper stands in for a recorded run wherever admissibility is checked,
  // so it has to satisfy the same schema a recorded run does. Dropping any one
  // field must be visible — a run that cannot be placed cannot be scored.
  const valid = run("I'd start with **Prisoners** (2013).", stateRich);
  assert.deepEqual(scorer.admissibility([valid]), [], "a complete synthetic run faults");

  // Every field the helper carries, not a sample of them: a field nobody drops
  // is a field nobody notices going missing from the scorer's list.
  for (const field of Object.keys(valid.header)) {
    const damaged = { ...valid, header: { ...valid.header } };
    delete damaged.header[field];
    const faults = scorer.admissibility([damaged]);
    assert.ok(
      faults.some((f: string) => f.includes(`provenance incomplete — no ${field}`)),
      `a run missing ${field} is still admissible`,
    );
  }
});

test("faults are raised by damaged artifacts, not by their answers", () => {
  const good = run("I'd start with **Prisoners** (2013).", stateRich);
  assert.deepEqual(scorer.admissibility([good]), []);

  const noProvenance = { ...good, header: { ...good.header, session: "" } };
  assert.match(scorer.admissibility([noProvenance])[0], /provenance incomplete — no session/);

  const unbound = { ...good, snapshotBody: "{}" };
  assert.match(scorer.admissibility([unbound])[0], /snapshot digest does not match/);

  const unknownOutcome = { ...good, header: { ...good.header, get_taste: "maybe" } };
  assert.match(scorer.admissibility([unknownOutcome])[0], /not an outcome/);
});
