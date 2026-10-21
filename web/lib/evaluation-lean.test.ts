import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The lean semantic path, checked without a single model call.
 *
 * The user's decision, 2026-10-22: a semantic check is a handful of targeted
 * scenarios, one run each, under a hard cap on model calls; a run resumes only what
 * failed or is missing; a quota or sign-in failure stops at once. The rules live in
 * `evaluation/lean.mjs`, pure, and are tested here; `m5/run.mjs` is pinned to use them.
 */

type Scenario = { fixture: string; prompt: string; then?: string; family: string; sources: string[]; smoke?: string[] };
type Lean = {
  DEFAULT_BUDGET: number;
  callsPerRun: (scenario: Scenario) => number;
  plannedCalls: (work: { scenario: Scenario; index: number }[]) => number;
  checkBudget: (planned: number, budget: number) => void;
  runName: (scenario: Scenario, index: number) => string;
  select: (scenarios: Scenario[], options: { source: string; only?: string | null; smoke?: boolean }) => Scenario[];
  recorded: (text: string | null) => "ok" | "failed" | "missing";
  pending: (
    scenarios: Scenario[],
    runs: number,
    options: { resume: boolean; stateOf: (name: string) => string },
  ) => { scenario: Scenario; index: number }[];
  failureOf: (error: unknown) => string;
  stopsTheRun: (failure: unknown) => boolean;
};

const EVALUATION = new URL("../../skills/tonight-recommend/evaluation/", import.meta.url);
const lean = (await import(new URL("lean.mjs", EVALUATION).href)) as Lean;
const runner = readFileSync(new URL("m5/run.mjs", EVALUATION), "utf8");

const one: Scenario = { fixture: "f1", prompt: "p1", family: "A", sources: ["projection"], smoke: ["projection"] };
const two: Scenario = { fixture: "f2", prompt: "p2", then: "yes", family: "B", sources: ["projection", "plugin-skills"], smoke: ["plugin-skills"] };
const three: Scenario = { fixture: "f2", prompt: "p3", family: "B", sources: ["projection", "plugin-skills"] };

test("a plan's model calls count every turn, and a plan over budget is refused before it runs", () => {
  assert.equal(lean.DEFAULT_BUDGET, 12);
  assert.equal(lean.callsPerRun(one), 1);
  assert.equal(lean.callsPerRun(two), 2, "a second turn is a second call");
  assert.equal(lean.plannedCalls([{ scenario: one, index: 1 }, { scenario: two, index: 1 }, { scenario: two, index: 2 }]), 5);

  assert.doesNotThrow(() => lean.checkBudget(12, 12), "exactly the budget is allowed");
  assert.doesNotThrow(() => lean.checkBudget(0, 12));
  assert.throws(() => lean.checkBudget(13, 12), /refusing: this plan makes 13 model calls and the budget is 12.*--budget 13/);
  assert.throws(() => lean.checkBudget(1, Number("x")), /--budget is a whole number/);
  assert.throws(() => lean.checkBudget(1, -1), /--budget is a whole number/);
});

test("smoke selects only what is marked smoke for this source, and --only takes a list", () => {
  const all = [one, two, three];
  assert.deepEqual(lean.select(all, { source: "projection", smoke: true }), [one]);
  assert.deepEqual(lean.select(all, { source: "plugin-skills", smoke: true }), [two]);
  assert.deepEqual(lean.select(all, { source: "projection" }), [one, two, three], "without --smoke, the source's full list");
  assert.deepEqual(lean.select(all, { source: "projection", only: "f1__p1, B" }), [one, two, three]);
  assert.deepEqual(lean.select(all, { source: "projection", only: "f2__p3" }), [three]);
  assert.deepEqual(lean.select(all, { source: "projection", only: "f2__p2__then-yes" }), [two], "the full key with its second turn");
  assert.deepEqual(lean.select(all, { source: "plugin-skills", only: "f1" }), [], "a scenario never leaves its sources");
});

test("resume makes only the runs not recorded ok, and never re-records a good one", () => {
  const states: Record<string, string> = { f1__p1__01: "ok", f1__p1__02: "failed" };
  const stateOf = (name: string) => states[name] ?? "missing";
  const names = (work: { scenario: Scenario; index: number }[]) => work.map((w) => lean.runName(w.scenario, w.index));

  assert.deepEqual(names(lean.pending([one], 3, { resume: true, stateOf })), ["f1__p1__02", "f1__p1__03"]);
  assert.deepEqual(names(lean.pending([one], 3, { resume: false, stateOf })), ["f1__p1__01", "f1__p1__02", "f1__p1__03"]);
  assert.deepEqual(names(lean.pending([two], 1, { resume: true, stateOf })), ["f2__p2__then-yes__01"]);

  // What the runner writes, read back: `failed: no` is a good run; anything else is not.
  assert.equal(lean.recorded("---\nfailed: no\n---"), "ok");
  assert.equal(lean.recorded("---\nfailed: exit 1 — Not logged in\n---"), "failed");
  assert.equal(lean.recorded("---\nfailed: void: started on 2026-10-21, ended on 2026-10-22 — rerun\n---"), "failed");
  assert.equal(lean.recorded(null), "missing");
});

test("a quota or sign-in failure stops the run, read from what the CLI printed on stdout", () => {
  // The CLI reports its own errors as the JSON result on stdout, with nothing on stderr.
  const signedOut = { status: 1, stdout: '{"type":"result","is_error":true,"result":"Not logged in · Please run /login"}', stderr: "" };
  assert.equal(lean.failureOf(signedOut), "exit 1 — Not logged in · Please run /login");
  assert.ok(lean.stopsTheRun(lean.failureOf(signedOut)));

  for (const said of [
    "You've hit your usage limit · resets 11:40pm",
    "Claude usage limit reached. Your limit will reset at 23:40",
    "API Error: 429 rate_limit_error",
    "Credit balance is too low",
    "authentication_error: invalid x-api-key",
    "OAuth token has expired",
  ]) {
    assert.ok(lean.stopsTheRun(`exit 1 — ${said}`), said);
  }
  // Ordinary failures are one run's problem, not every run's.
  for (const said of ["exit 1 — no stderr", "did not resume: asked for a, answered in b", "error_max_turns", null, undefined]) {
    assert.equal(lean.stopsTheRun(said), false, String(said));
  }
  // No JSON on stdout: stderr is the evidence, and its absence is said.
  assert.equal(lean.failureOf({ status: 2, stdout: "", stderr: "boom" }), "exit 2 — boom");
  assert.equal(lean.failureOf({ status: 1, stdout: "not json {", stderr: "" }), "exit 1 — no stderr");
});

test("the runner uses the lean rules: budget before any call, smoke, resume, and a hard stop", () => {
  assert.match(runner, /from "\.\.\/lean\.mjs"/);
  assert.match(runner, /const SMOKE = args\.includes\("--smoke"\);/);
  assert.match(runner, /const RUNS = Number\(option\("runs", SMOKE \? "1" : "3"\)\);/, "smoke is not one run by default");
  assert.match(runner, /const BUDGET = Number\(option\("budget", String\(DEFAULT_BUDGET\)\)\);/, "there is no default cap");
  assert.match(runner, /if \(FORCE && RESUME\) throw/);
  assert.match(runner, /let chosen = select\(scenarios, \{ source: SOURCE, only: ONLY, smoke: SMOKE \}\);/);
  assert.match(runner, /const work = pending\(chosen, RUNS, \{ resume: RESUME, stateOf \}\);/);
  // The budget is checked after the plan is printed and before the dry run exits, so a
  // refused plan is refused in a dry run too — and before any seeding or any call.
  const check = runner.indexOf("checkBudget(PLANNED, BUDGET);");
  assert.ok(check > runner.indexOf("const PLANNED = plannedCalls(work);"), "the budget is checked before the plan exists");
  assert.ok(check < runner.indexOf("if (DRY) process.exit(0);"), "a dry run skips the budget");
  // The run loop is the last loop over the work; the dry run's listing is the first.
  assert.ok(check < runner.lastIndexOf("for (const { scenario, index } of work)"), "the budget is checked after calls start");
  assert.match(runner, /if \(stopsTheRun\(result\.first\.failure\) \|\| stopsTheRun\(result\.second\?\.failure\)\) \{[\s\S]*?process\.exit\(3\);/);
  assert.match(runner, /return \{ answer: "", session: "unknown", failure: failureOf\(error\) \};/);
  assert.match(runner, /parsed\.is_error \?/, "an error inside a successful exit is not caught");
  assert.match(runner, /^selection: \$\{SMOKE \? "smoke" : "full"\}/m, "an artifact does not say how it was selected");
  assert.match(runner, /^budget: \$\{BUDGET\} model calls; this invocation planned \$\{PLANNED\}$/m);
  assert.match(runner, /no proxy log: the agent never reached Tonight/, "a failure before Tonight crashes the runner");
});

test("the M6 smoke set is the planned nine calls, inside the default cap", () => {
  const scenarios = JSON.parse(readFileSync(new URL("m6/scenarios.json", EVALUATION), "utf8")) as Scenario[];
  const calls = (source: string) =>
    lean.plannedCalls(lean.select(scenarios, { source, smoke: true }).map((scenario) => ({ scenario, index: 1 })));
  assert.deepEqual(
    lean.select(scenarios, { source: "projection", smoke: true }).map((s) => s.family),
    ["G1-not-ever", "G2-not-tonight", "G3-unclear-reach", "R2-dated-today", "U1-unseen-member", "M1-moodless"],
  );
  assert.deepEqual(
    lean.select(scenarios, { source: "plugin-skills", smoke: true }).map((s) => s.family),
    ["G1-not-ever", "U4-contradiction"],
  );
  assert.equal(lean.select(scenarios, { source: "recommend-only", smoke: true }).length, 0);
  assert.equal(calls("projection") + calls("plugin-skills"), 9);
  assert.ok(calls("projection") + calls("plugin-skills") <= lean.DEFAULT_BUDGET);
  for (const s of scenarios) for (const source of s.smoke ?? []) assert.ok(s.sources.includes(source), `${s.family}: smoke on a source it does not run on`);
});
