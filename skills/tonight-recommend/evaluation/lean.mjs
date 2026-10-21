/**
 * The lean path through the semantic runner (`m5/run.mjs`, which runs the M5 and M6
 * sets): a hard budget on model calls, a smoke selection, resuming only what failed or
 * is missing, and stopping at the first quota or sign-in failure.
 *
 * The user's decision, 2026-10-22: hundreds of runs per milestone is not affordable.
 * Deterministic gates are free and always run; a semantic check is a handful of
 * targeted scenarios, one run each, under a cap that refuses rather than overspends.
 * The full matrices stay, opt-in: a plan bigger than the budget runs only when
 * `--budget` names its size, which is the explicit approval.
 *
 * Pure, so `web/lib/evaluation-lean.test.ts` checks all of it without a model call.
 */

/** The default cap, in model calls, for any invocation that does not name its own. */
export const DEFAULT_BUDGET = 12;

/** One `claude -p` per turn: a scenario with a second turn makes two calls a run. */
export const callsPerRun = (scenario) => (scenario.then ? 2 : 1);

/** The model calls a list of planned runs would make. */
export const plannedCalls = (work) => work.reduce((sum, item) => sum + callsPerRun(item.scenario), 0);

/** Refuses a plan that would spend more than its budget, and says how to approve it. */
export function checkBudget(planned, budget) {
  if (!Number.isInteger(budget) || budget < 0) {
    throw new Error(`--budget is a whole number of model calls, not ${budget}`);
  }
  if (planned > budget) {
    throw new Error(
      `refusing: this plan makes ${planned} model calls and the budget is ${budget}. ` +
        `Narrow it (--smoke, --only, --resume), or approve it explicitly with --budget ${planned}.`,
    );
  }
}

/** A scenario's run name — the stem every one of its files shares. */
export const runName = (scenario, index) =>
  `${scenario.fixture}__${scenario.prompt}${scenario.then ? `__then-${scenario.then}` : ""}__${String(index).padStart(2, "0")}`;

/**
 * Which scenarios run: the source's own, then `--only`'s comma-separated list (each a
 * full key, a fixture__prompt, a fixture or a family), then `--smoke`'s — those whose
 * `smoke` array names this source.
 */
export function select(scenarios, { source, only = null, smoke = false }) {
  const wanted = only === null ? null : only.split(",").map((one) => one.trim()).filter(Boolean);
  const key = (one) => `${one.fixture}__${one.prompt}${one.then ? `__then-${one.then}` : ""}`;
  return scenarios.filter(
    (one) =>
      one.sources.includes(source) &&
      (!smoke || (one.smoke ?? []).includes(source)) &&
      (wanted === null ||
        wanted.some((w) => w === key(one) || w === `${one.fixture}__${one.prompt}` || w === one.fixture || w === one.family)),
  );
}

/** A run as its artifact records it: `ok`, `failed`, or `missing` when there is none. */
export function recorded(text) {
  if (text === null || text === undefined) return "missing";
  const failed = /^failed: (.*)$/m.exec(text)?.[1];
  return failed === undefined || failed === "no" ? "ok" : "failed";
}

/** The runs to make: every index, or under `resume` only those not recorded `ok`. */
export function pending(scenarios, runs, { resume, stateOf }) {
  const work = [];
  for (const scenario of scenarios) {
    for (let index = 1; index <= runs; index += 1) {
      if (resume && stateOf(runName(scenario, index)) === "ok") continue;
      work.push({ scenario, index });
    }
  }
  return work;
}

/**
 * What a failed `claude -p` said. The CLI prints its own errors as the JSON result on
 * stdout — "Not logged in", a usage limit — and nothing on stderr, so stdout is read
 * first, and stderr only when there is no JSON.
 */
export function failureOf(error) {
  const status = String(error?.status ?? "?");
  const stdout = String(error?.stdout ?? "");
  const at = stdout.indexOf("{");
  if (at >= 0) {
    try {
      const result = JSON.parse(stdout.slice(at))?.result;
      if (result) return `exit ${status} — ${String(result).slice(0, 300)}`;
    } catch {
      // not JSON after all; fall through to stderr
    }
  }
  const stderr = String(error?.stderr ?? "").trim().slice(0, 600);
  return `exit ${status}${stderr ? ` — ${stderr}` : " — no stderr"}`;
}

/** Failures every later call would repeat — out of quota, or not signed in. */
const STOPPING = [
  /not logged in/i,
  /please run \/login/i,
  /usage limit/i,
  /hit your (usage )?limit/i,
  /limit (reached|exceeded)/i,
  /\blimit\b.*\breset/i,
  /rate[_ ]limit/i,
  /\b429\b/,
  /quota/i,
  /credit balance/i,
  /authentication[_ ]error/i,
  /invalid api key/i,
  /oauth token/i,
];

/** Whether a failure means the run should stop here rather than fail every call after it. */
export const stopsTheRun = (failure) => typeof failure === "string" && STOPPING.some((pattern) => pattern.test(failure));
