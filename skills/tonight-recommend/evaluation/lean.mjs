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

/**
 * A scenario's follow-up turns, in order, each a request key: none, one (`then: "yes"`),
 * or a list (`then: ["pick-title-one", "like-bloom-tonight"]`) when a pick has to be
 * followed by a request in the same conversation.
 */
export const followUps = (scenario) =>
  scenario.then === undefined ? [] : Array.isArray(scenario.then) ? [...scenario.then] : [scenario.then];

/** One `claude -p` per turn: the first, and one for every follow-up. */
export const callsPerRun = (scenario) => 1 + followUps(scenario).length;

/** The follow-ups as a run's name carries them: `__then-yes`, or `__then-a__then-b`. */
const thenKey = (scenario) => followUps(scenario).map((one) => `__then-${one}`).join("");

/**
 * A follow-up that picks a title from the answer before it: `{title:N}`, the whole
 * request. The user chooses from the title alone (docs/work/vibe-hypotheses), so the
 * evaluation answers the way they would — with the title, as the agent wrote it.
 */
const TITLE_PICK = /^\{title:([1-9])\}$/;

/**
 * The title numbered `n` in an answer, or null.
 *
 * A title is a numbered list item whose line starts with the number and then a bold
 * span, and the title is that span alone — a recommended marker sits after the bold,
 * never inside it. Exactly one item numbered `n`, or nothing: two lists in one answer,
 * or a number with no bold span, is not a choice anybody could answer by title.
 */
export function titleNumbered(answer, n) {
  const item = new RegExp(`^[ \\t]*${n}[.)][ \\t]+\\*\\*([^*\\n]+)\\*\\*`, "gm");
  const found = [...String(answer ?? "").matchAll(item)].map((match) => match[1].trim()).filter(Boolean);
  return found.length === 1 ? found[0] : null;
}

/**
 * What a follow-up sends: the request as written, or — for `{title:N}` — the title the
 * answer before it numbered N. An ambiguous pick is a failure of that turn, decided
 * before any model call is made.
 */
export function resolveTurn(request, previousAnswer) {
  const pick = TITLE_PICK.exec(request);
  if (pick === null) return { sent: request, failure: null };
  const title = titleNumbered(previousAnswer, Number(pick[1]));
  return title === null
    ? { sent: null, failure: `no unambiguous title ${pick[1]} to pick` }
    : { sent: title, failure: null };
}

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
  `${scenario.fixture}__${scenario.prompt}${thenKey(scenario)}__${String(index).padStart(2, "0")}`;

/**
 * Which scenarios run: the source's own, then `--only`'s comma-separated list (each a
 * full key, a fixture__prompt, a fixture or a family), then `--smoke`'s — those whose
 * `smoke` array names this source.
 */
export function select(scenarios, { source, only = null, smoke = false }) {
  const wanted = only === null ? null : only.split(",").map((one) => one.trim()).filter(Boolean);
  const key = (one) => `${one.fixture}__${one.prompt}${thenKey(one)}`;
  return scenarios.filter(
    (one) =>
      one.sources.includes(source) &&
      (!smoke || (one.smoke ?? []).includes(source)) &&
      (wanted === null ||
        wanted.some((w) => w === key(one) || w === `${one.fixture}__${one.prompt}` || w === one.fixture || w === one.family)),
  );
}

/**
 * A run as its artifact records it: `ok`, `failed`, or `missing` when there is none.
 *
 * Only an explicit `failed: no` is a good run. An artifact without the field — empty,
 * truncated, or written by something else — is not evidence of anything, so it counts
 * as failed and `--resume` makes it again.
 */
export function recorded(text) {
  if (text === null || text === undefined) return "missing";
  return /^failed: no$/m.test(text) ? "ok" : "failed";
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
