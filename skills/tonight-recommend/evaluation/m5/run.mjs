/**
 * The M5 semantic evaluation, one fresh agent per run.
 *
 *   node evaluation/m5/run.mjs --source recommend-only             every scenario that runs there
 *   node evaluation/m5/run.mjs --source plugin-skills --only m5-01-anchored__logan-lucky-sunday
 *   node evaluation/m5/run.mjs --source recommend-only --runs 3
 *   node evaluation/m5/run.mjs --source recommend-only --dry-run   what it would do, and nothing else
 *   node evaluation/m5/run.mjs --set m6 --source recommend-only    the M6 set (evaluation/m6/)
 *   node evaluation/m5/run.mjs --set m6 --source recommend-only --smoke --host login
 *                                    the lean default: smoke scenarios, one run each
 *   … --resume                       make only runs not yet recorded ok
 *   … --budget N                     the most model calls allowed (default 12, ../lean.mjs);
 *                                    a bigger plan is refused until --budget names its size
 *
 * A quota or sign-in failure stops the invocation at once (exit 3), so a limit costs one
 * call rather than a sweep.
 *
 * M3's runner, with three differences and a reason for each.
 *
 * **It is told which instructions the agent gets.** The plugin ships both
 * `SKILL.md` files, and ChatGPT may select recommend alone (the plan's R3-2).
 * `--source` names which of the two a run stands for, and the artifact records it:
 *
 *     plugin-skills    every SKILL.md the plugin package carries — every folder
 *                      under skills/, as `chatgpt-plugin/build.sh` packages them —
 *                      recommend first, each under a line naming it
 *     recommend-only   tonight-recommend/SKILL.md alone
 *
 * A third source, `projection` — the text a ChatGPT project was once given — was
 * retired with that text. Its recordings keep their own result directories.
 *
 * `plugin-skills` reads whatever skills exist rather than naming two, and that is
 * what makes the baseline runnable: at the commit before `tonight-vibes` exists,
 * the plugin carried `tonight-recommend` alone, and that untouched full skill is
 * what the baseline routing matrix is recorded against. The artifact names the
 * skills a run was given.
 *
 * A `claude -p` run puts the chosen text in the system prompt. That is how the CLI
 * stands in for a host here, and it is recorded rather than glossed: ChatGPT selects
 * skills by description, and nothing on this side reproduces that choice. The
 * canonical plugin is evaluated by hand, against the same rubric.
 *
 * **It can give follow-up turns.** A scenario with `then` — one request key, or a list
 * of them — resumes the recorded session (`claude -p --resume <session>`) with each in
 * turn. Whether the CLI resumed is checked from its own answer — the session id it
 * reports — and a run where it did not is marked failed rather than scored as though
 * it had. A failed turn stops the turns after it. Wherever a follow-up has `{title:N}`,
 * it sends the title the answer before it offered as choice N, as somebody choosing by
 * title would (docs/work/vibe-hypotheses; `../lean.mjs`, `titleNumbered`); a pick that is
 * not unambiguous fails that turn before any call. The artifact records what each turn
 * sent and which Tonight calls it made.
 *
 * **A legacy fixture is never reseeded here.** Vibes from before cores cannot be
 * written by a build that requires one, and they are never written by SQL; the
 * operator seeds them through a v12 build and migrates (README). A liked or loved
 * film in no vibe cannot be written by a build with the vibe rule either, so a
 * `pre-vibe-rule` fixture is seeded through a build from before it, with nothing
 * to migrate. Either runs only with `--legacy-seeded`, one run per seeding.
 *
 * Every other fixture is reseeded before every run — verdicts forgotten, then vibes,
 * films and genres torn down, then everything written again through the tools — and snapshotted before
 * and after, through the M3 seeder. What it does not do, ever: call a tool on the
 * agent's behalf, reason for it, or write its transcript.
 *
 * **It runs the M6 set too** (`--set m6`; `m5` when left out, and then nothing about
 * an M5 run changes). M6's refusals are dated, so each run fixes one local date `D`
 * when it starts: the seeder writes it wherever a fixture says `@today`, the agent is
 * told it in one host line (`Today's date is D.`, as ChatGPT tells a model the date),
 * the artifact records it, and the rubric scores against it. A run that ends on
 * another date than it started straddled midnight: it is void, and is rerun rather
 * than scored (`docs/work/m6/PLAN.md`, §5.2).
 *
 * **It can drive DeepSeek instead of `claude -p`** (`--backend deepseek`; `claude`
 * when left out, and then nothing about a Claude run changes). The agent is the
 * adapter in `../deepseek.mjs`: the same system prompt, Tonight's tools through the
 * same proxy, so the transcript, the boundaries and the snapshots are made the same
 * way. Its key comes from `DEEPSEEK_API_KEY` and is never recorded; its results go in
 * a directory of their own; every API request's usage goes in `usage/<run>.jsonl`.
 *
 * **It can record a baseline with today's harness** (`--against <commit>`): the three
 * instruction files of that commit stand in the working tree for one invocation and
 * are put back however it ends (`../revision.mjs`). Before a DeepSeek or `--against`
 * invocation records anything, the server has to be serving the tool catalog the
 * files on disk register (docs/work/vibe-hypotheses §12).
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, globSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEEPSEEK_MODEL, deepseekBackend, mcp, settingsLine } from "../deepseek.mjs";
import { agentHost } from "../host.mjs";
import {
  DEFAULT_BUDGET,
  checkBudget,
  failureOf,
  followUps,
  checkedTurns,
  pending,
  plannedCalls,
  recorded,
  runName,
  select,
  stopsTheRun,
} from "../lean.mjs";
import { catalogDigest, expectedCatalog, gitIn, swapInstructions, waitForCatalog } from "../revision.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const EVAL = join(here, "..");
const ROOT = join(here, "..", "..", "..", "..");
const SEEDER = join(EVAL, "m3", "seed.mjs");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const SETS = ["m5", "m6"];
const SET = option("set", "m5");
if (!SETS.includes(SET)) throw new Error(`--set is one of ${SETS.join(", ")}`);
const SET_DIR = join(EVAL, SET);
const FIXTURES = join(SET_DIR, "fixtures");

/** Today, on this machine's clock: the `D` a run is seeded, told and scored with. */
function localDate() {
  const now = new Date();
  const two = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}
let TODAY = localDate();

const SOURCES = ["plugin-skills", "recommend-only"];
const SOURCE = option("source", null);
/** `--smoke`: only the scenarios marked smoke for this source, one run each by default. */
const SMOKE = args.includes("--smoke");
const RUNS = Number(option("runs", SMOKE ? "1" : "3"));
/** `--backend claude` (the default) or `--backend deepseek`: which agent the runs are given. */
const BACKENDS = ["claude", "deepseek"];
const BACKEND = option("backend", "claude");
if (!BACKENDS.includes(BACKEND)) throw new Error(`--backend is one of ${BACKENDS.join(", ")}`);
const DEEPSEEK = BACKEND === "deepseek";
const MODEL = option("model", DEEPSEEK ? DEEPSEEK_MODEL : "claude-sonnet-5");
/** `--against <commit>`: record that commit's instructions with this harness (`../revision.mjs`). */
const AGAINST = option("against", null);
const ONLY = option("only", null);
const PORT = Number(option("port", "3997"));
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");
/** `--resume`: make only the runs not already recorded ok; never re-record a good one. */
const RESUME = args.includes("--resume");
/** `--budget N`: the most model calls this invocation may make; see `../lean.mjs`. */
const BUDGET = Number(option("budget", String(DEFAULT_BUDGET)));
const LEGACY_SEEDED = args.includes("--legacy-seeded");
/** `--host bare` (the default) or `--host login`: see `../host.mjs`. */
const HOST = agentHost(option("host", "bare"));

if (FORCE && RESUME) throw new Error("--force re-records every run and --resume keeps the good ones: pass one");

if (!SOURCES.includes(SOURCE)) {
  throw new Error(`--source is required: one of ${SOURCES.join(", ")}`);
}

const git = gitIn(ROOT);
if (DEEPSEEK) {
  if (args.includes("--host")) throw new Error("--host chooses how `claude -p` runs; a DeepSeek run has no CLI host");
  if (!DRY && !process.env.DEEPSEEK_API_KEY) throw new Error("--backend deepseek needs DEEPSEEK_API_KEY in the environment");
  // A recording names the harness that made it, so that harness has to be what HEAD is.
  if (!DRY && git(["status", "--porcelain", "--untracked-files=no", "--", "skills/tonight-recommend/evaluation"]).trim()) {
    throw new Error("the evaluation harness has uncommitted changes — commit them, so `harness:` names the code that ran");
  }
  // There is no CLI host: the artifact names the loop that stands in for one, and its
  // results never share a directory with a Claude host's.
  Object.assign(HOST, {
    line: `DeepSeek API, the runner's own tool loop over the Tonight proxy (${settingsLine()})`,
    isolation:
      "the system prompt is the skills and nothing else; the only tools are Tonight's, through the proxy — no " +
      "web, no files, no memory; the runner holds the conversation between turns",
    suffix: `-deepseek-${MODEL}`,
  });
}

const CLI = DEEPSEEK ? "none (DeepSeek API)" : execFileSync("claude", ["--version"], { encoding: "utf8" }).trim().split(" ")[0];

// The swap comes before anything reads the instructions: what follows — the digest,
// the guard, every run — sees the target's files. The restore is already installed.
const SWAP = AGAINST === null ? null : swapInstructions({ target: AGAINST, git });

const skill = (name) => readFileSync(join(ROOT, "skills", name, "SKILL.md"), "utf8");

/** The skills the plugin package carries right now: recommend first, then the rest by name. */
function packaged() {
  const all = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, "skills", entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
  return ["tonight-recommend", ...all.filter((name) => name !== "tonight-recommend")];
}

/** The skills a run on this source is given, by name. */
function skillsGiven() {
  switch (SOURCE) {
    case "recommend-only":
      return ["tonight-recommend"];
    case "plugin-skills":
      return packaged();
  }
}

/** The instructions a run on this source is given, and nothing else. */
function instructions() {
  switch (SOURCE) {
    case "recommend-only":
      return skill("tonight-recommend");
    case "plugin-skills":
      return packaged()
        .map((name) => `<!-- skill: ${name} (skills/${name}/SKILL.md) -->\n${skill(name)}`)
        .join("\n");
  }
}

/**
 * What the agent is given as its system prompt: the source's instructions, and on the
 * M6 set the one host line that tells it the date — nothing else, and never anything
 * about the evaluation.
 */
function systemPrompt() {
  return SET === "m6" ? `${instructions()}\n\nToday's date is ${TODAY}.` : instructions();
}

/**
 * Eight hex characters of the SHA-256 of exactly the skills this source supplies,
 * as they are joined into the system prompt — never the M6 date line, which is the
 * host's and not the instructions'. Either skill changing changes it.
 */
function version() {
  return createHash("sha256").update(instructions(), "utf8").digest("hex").slice(0, 8);
}

/**
 * The same guard as Phase 1 and M3: a recording of edited instructions describes nothing.
 * It compares with HEAD, or with the commit `--against` named.
 */
function refuseIfPromptsMoved() {
  const against = SWAP?.against ?? "HEAD";
  for (const file of [
    "skills/tonight-recommend/SKILL.md",
    "skills/tonight-vibes/SKILL.md",
    "web/lib/mcp/server.ts",
  ]) {
    try {
      execFileSync("git", ["diff", "--quiet", against, "--", file], { cwd: ROOT });
    } catch {
      throw new Error(`${file} differs from ${against} — commit or revert before recording.`);
    }
  }
}

const short = (sha) => git(["rev-parse", "--short", sha]).trim();
const VERSION = version();
const HARNESS = short("HEAD");
const TARGET = SWAP === null ? HARNESS : short(SWAP.against);
// A baseline recorded with today's harness is named by both, so --resume never mixes
// recordings two versions of the harness made; a DeepSeek recording never sits with
// a Claude one.
const OUT = join(
  SET_DIR,
  "results",
  `${SET}-${SOURCE}-${VERSION}-${TARGET}${SWAP === null ? "" : `-harness-${HARNESS}`}${HOST.suffix}`,
  "runs",
);
/** Whether this invocation proves which catalog the server serves, and records it. */
const CHECKS_CATALOG = DEEPSEEK || SWAP !== null;
/** The catalog the guarded `server.ts` registers — set before the first run, when it is checked. */
let EXPECTED_CATALOG = null;
const ORIGIN = process.env.TONIGHT_ORIGIN ?? "http://localhost:3000";

const scenarios = JSON.parse(readFileSync(join(SET_DIR, "scenarios.json"), "utf8"));
const fixture = (id) => JSON.parse(readFileSync(join(FIXTURES, `${id}.json`), "utf8"));

function prompts() {
  const table = readFileSync(join(SET_DIR, "prompts.md"), "utf8");
  const said = new Map();
  for (const row of table.matchAll(/^\| `([a-z-]+)` \| \*"(.+?)"\* \|/gm)) said.set(row[1], row[2]);
  return said;
}

const seed = (id, ...rest) =>
  execFileSync("node", [SEEDER, id, "--fixtures", FIXTURES, "--today", TODAY, ...rest], {
    encoding: "utf8",
  }).trim();

const pause = (ms) => new Promise((wake) => setTimeout(wake, ms));

async function listening(port, pid) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const answer = await fetch(`http://localhost:${port}/__evaluation`);
      const who = await answer.json();
      if (who.pid === pid) return;
      throw new Error(`port ${port} is held by pid ${who.pid}, not the proxy spawned for this run (${pid})`);
    } catch (error) {
      if (String(error.message).includes("is held by")) throw error;
      await pause(100);
    }
  }
  throw new Error(`the proxy never came up on ${port}`);
}

async function shutDown(proxy, port) {
  proxy.kill();
  await new Promise((done) => (proxy.exitCode === null ? proxy.once("exit", done) : done()));
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await fetch(`http://localhost:${port}/__evaluation`);
    } catch {
      return;
    }
    await pause(100);
  }
  throw new Error(`something is still listening on ${port} after the proxy was stopped`);
}

function answeredBy(session) {
  const [file] = globSync(join(homedir(), ".claude", "projects", "*", `${session}.jsonl`));
  if (!file) return "unknown";
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (entry.type === "assistant" && entry.message?.model) return entry.message.model;
  }
  return "unknown";
}

/** Which tools change something, as the server marks them; `evaluation-m5.test.ts` keeps it honest. */
const MUTATING = new Set([
  "correct_episode",
  "create_genre",
  "create_vibe",
  "create_movie",
  "delete_genre",
  "delete_vibe",
  "delete_movie",
  "forget_episode",
  "forget_verdict",
  "record_episode",
  "record_verdict",
  "update_genre",
  "update_vibe",
  "update_movie",
  "withdraw_verdict",
]);

function transcript(logFile) {
  // No proxy log: the agent failed before it reached Tonight (a sign-in or quota error).
  if (!existsSync(join(OUT, logFile))) {
    return { mutations: [], rendered: "None — no proxy log: the agent never reached Tonight.", discovered: "none" };
  }
  const lines = readFileSync(join(OUT, logFile), "utf8").trim().split("\n").filter(Boolean);
  const entries = lines.map((line) => JSON.parse(line));
  const calls = entries.filter((entry) => entry.tool);
  const rendered = calls.length
    ? calls.map((entry, at) => `${at + 1}. \`${entry.tool}\` → ${entry.failed ? "refused" : `ok (${entry.status})`}`).join("\n")
    : "None.";
  const discovered = entries.find((entry) => entry.discovered !== undefined)?.discovered;
  const called = calls.map((one) => one.tool);
  return { mutations: called.filter((one) => MUTATING.has(one)), rendered, discovered: discovered ?? "unknown" };
}

/**
 * How many Tonight tool calls the proxy has logged so far. Read between turns, it is
 * each turn's boundary in the transcript — which calls came before a pick, and which
 * after it.
 */
function loggedCalls(logFile) {
  const file = join(OUT, logFile);
  if (!existsSync(file)) return 0;
  return readFileSync(file, "utf8").split("\n").filter((line) => line.trim() && JSON.parse(line).tool).length;
}

/** The DeepSeek agent for this invocation — one, so a follow-up turn finds its conversation. */
const AGENT = DEEPSEEK && !DRY ? deepseekBackend({ key: process.env.DEEPSEEK_API_KEY, model: MODEL }) : null;

/** One turn, fresh or resumed, on whichever backend this invocation runs. */
async function turn(said, config, resume) {
  return AGENT === null ? claudeTurn(said, config, resume) : AGENT.turn(said, config, resume, systemPrompt());
}

/**
 * The digest of the tool catalog the server serves, read with a run's own token —
 * straight from the server, never through the proxy, so it is no part of a transcript.
 */
async function servedCatalog(bearer) {
  const answer = await mcp(fetch, `${ORIGIN}/mcp`, { authorization: `Bearer ${bearer}` }, "tools/list");
  if (answer.error) throw new Error(answer.error.message ?? JSON.stringify(answer.error));
  return catalogDigest(answer.result.tools);
}

/** One `claude -p` turn, fresh or resumed. */
function claudeTurn(said, config, resume) {
  try {
    const printed = execFileSync(
      "claude",
      [
        "-p", said,
        ...(resume ? ["--resume", resume] : []),
        ...HOST.flags,
        "--model", MODEL,
        "--mcp-config", config,
        "--strict-mcp-config",
        "--system-prompt", systemPrompt(),
        "--allowedTools", "mcp__tonight",
        "--disallowedTools", "WebSearch WebFetch Bash Read Write Edit Glob Grep Task TodoWrite NotebookEdit",
        "--permission-mode", "bypassPermissions",
        "--output-format", "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024, cwd: HOST.cwd },
    );
    const parsed = JSON.parse(printed.slice(printed.indexOf("{")));
    // An error the CLI reports in a successful exit is still an error.
    const failure = parsed.is_error ? String(parsed.result || parsed.subtype).slice(0, 300) : parsed.subtype === "success" ? null : parsed.subtype;
    return {
      answer: parsed.is_error ? "" : (parsed.result ?? ""),
      session: parsed.session_id ?? "unknown",
      failure,
    };
  } catch (error) {
    return { answer: "", session: "unknown", failure: failureOf(error) };
  }
}

async function run(scenario, requests, index) {
  const spec = fixture(scenario.fixture);
  const name = runName(scenario, index);
  const snapshotFile = `snapshots/${name}.json`;
  const afterFile = `snapshots/${name}.after.json`;
  const logFile = `logs/${name}.jsonl`;

  // --resume only ever reaches a run that failed or is missing, so its old files go.
  const triple = [`${name}.md`, snapshotFile, logFile].map((part) => join(OUT, part));
  const already = triple.filter((part) => existsSync(part));
  if (already.length && !FORCE && !RESUME) {
    throw new Error(`${name} already has ${already.length} of its 3 files. Re-run with --resume, or --force to re-record it.`);
  }
  for (const part of [...already, join(OUT, afterFile)]) rmSync(part, { force: true });

  // One date for the whole run: seeded, told and scored with the same `D`.
  TODAY = localDate();
  const today = TODAY;

  // Fresh, every run — except a fixture its operator seeds, through an older build:
  // the pre-core one (`v12-then-migrate`) or the pre-vibe-rule one (`pre-vibe-rule`).
  if (spec.seed === undefined) seed(scenario.fixture);
  const digest = seed(scenario.fixture, "--snapshot", join(OUT, snapshotFile));
  const bearer = seed(scenario.fixture, "--token");

  const proxy = spawn("node", [join(EVAL, "proxy.mjs"), "--port", String(PORT), "--log", join(OUT, logFile)], {
    stdio: "ignore",
  });
  await listening(PORT, proxy.pid);

  const config = join(OUT, `.mcp-${name}.json`);
  writeFileSync(
    config,
    JSON.stringify({
      mcpServers: {
        tonight: { type: "http", url: `http://localhost:${PORT}/mcp`, headers: { Authorization: `Bearer ${bearer}` } },
      },
    }),
  );

  // The catalog this run's server serves, proven before its first turn — the evidence a
  // baseline and an after-run were given different instructions, and one pass the same.
  // Then every turn in order, each awaited before its boundary is read and before the
  // next starts (`../lean.mjs`); the config and the proxy go however that ends.
  let turns = [];
  let toolsDigest = null;
  try {
    ({ digest: toolsDigest, turns } = await checkedTurns(requests, {
      served: CHECKS_CATALOG ? () => servedCatalog(bearer) : undefined,
      expected: EXPECTED_CATALOG,
      turn: (sent, resume) => turn(sent, config, resume),
      boundary: () => loggedCalls(logFile),
    }));
  } finally {
    rmSync(config, { force: true });
    await shutDown(proxy, PORT);
  }
  const first = turns[0];

  // A run that crossed midnight was told one date and lived in two: void, not scored.
  const ended = localDate();
  const straddled = SET === "m6" && ended !== today ? `void: started on ${today}, ended on ${ended} — rerun` : null;

  const afterDigest = seed(scenario.fixture, "--snapshot", join(OUT, afterFile));

  // DeepSeek: every API request, with its turn and its UTC time, so a run can be
  // priced request by request — a failed turn's requests included. Never the key.
  let usageFile = null;
  if (DEEPSEEK) {
    usageFile = `usage/${name}.jsonl`;
    const lines = turns.flatMap((one, at) => (one.requests ?? []).map((request, n) => ({ turn: at + 1, request: n + 1, ...request })));
    writeFileSync(join(OUT, usageFile), lines.map((line) => `${JSON.stringify(line)}\n`).join(""));
  }
  const answeredWith = (field) => turns.map((one) => one[field]).filter(Boolean).at(-1) ?? "unknown";

  return {
    name, spec, snapshotFile, afterFile, logFile, digest, afterDigest, first, turns,
    resolved: DEEPSEEK ? answeredWith("model") : answeredBy(first.session), today, straddled,
    calls: turns.filter((one) => one.called).length,
    toolsDigest, usageFile, fingerprint: DEEPSEEK ? answeredWith("fingerprint") : null,
  };
}

/**
 * A DeepSeek run's usage in one line: turns and API requests apart, every attempt
 * counted, input split by the cache — and how many requests reported no usage, so a
 * price made from the totals says what it could not include.
 */
function usageLine(turns) {
  const requests = turns.flatMap((one) => one.requests ?? []);
  const sum = (field) => requests.reduce((total, request) => total + (request[field] ?? 0), 0);
  const failed = requests.filter((one) => one.outcome !== "answered").length;
  const unreported = requests.filter((one) => !one.usage_reported).length;
  return (
    `${turns.filter((one) => one.called).length} turns, ${requests.length} API requests (${failed} failed, ` +
    `${unreported} with no usage reported); input ${sum("prompt_cache_hit_tokens")} cache-hit + ` +
    `${sum("prompt_cache_miss_tokens")} cache-miss tokens; output ${sum("completion_tokens")} tokens ` +
    `(${sum("reasoning_tokens")} of them reasoning)`
  );
}

/** The header lines only a DeepSeek or `--against` invocation has; a Claude run's header is unchanged. */
function extraHeader(result) {
  const lines = [];
  if (CHECKS_CATALOG) {
    lines.push(`harness: ${HARNESS}`, `tools_digest: ${result.toolsDigest} (expected ${EXPECTED_CATALOG})`);
  }
  if (DEEPSEEK) {
    lines.push(
      `backend: deepseek`,
      `fingerprint: ${result.fingerprint}`,
      `usage: ${usageLine(result.turns)}`,
      `usage_file: ${result.usageFile}`,
    );
  }
  return lines.map((line) => `${line}\n`).join("");
}

/** The first failure among a run's turns, or null. */
const failedTurn = (result) => result.turns.find((one) => one.failure !== null)?.failure ?? null;

const ORDINAL = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];

/** Which numbered Tonight calls each turn made, so a write can be placed before or after a pick. */
function boundaries(turns) {
  return turns
    .map((one, at) => {
      const [from, to] = one.calls;
      const made = to > from ? `calls ${from + 1}–${to}` : "no calls";
      return `- ${ORDINAL[at]} turn: ${made}${one.failure ? ` (failed: ${one.failure})` : ""}`;
    })
    .join("\n");
}

function artifact(scenario, index, result, stamp) {
  const { rendered, discovered, mutations } = transcript(result.logFile);
  const failure = result.straddled ?? failedTurn(result);
  const later = result.turns.slice(1);
  // What each follow-up sent — a picked title as it was sent — and what came back.
  const asked = later
    .map((one, at) => `\n## ${ORDINAL[at + 1]} turn — \`${one.key}\`\n\n> ${one.sent ?? `(not sent: ${one.failure})`}\n`)
    .join("");
  const answered = later.map((one, at) => `\n## ${ORDINAL[at + 1]} answer\n\n${one.answer}\n`).join("");
  return `---
fixture: ${scenario.fixture}
prompt: ${scenario.prompt}
then: ${followUps(scenario).join(", ") || "none"}
family: ${scenario.family}
considers: ${scenario.considers ? "yes" : "no"}
gate: ${scenario.gate ?? "m5 threshold"}
selection: ${SMOKE ? "smoke" : "full"}${RESUME ? ", resumed (only failed or missing runs made)" : ""}
budget: ${BUDGET} model calls; this invocation planned ${PLANNED}
run: ${String(index).padStart(2, "0")}
side: ${SET}
today: ${result.today}${SET === "m6" ? " (told to the agent as a host line; @today seeded as this)" : " (not told)"}
source: ${SOURCE}
skills: ${skillsGiven().join(", ")}
host: ${HOST.line}, instructions as the system prompt
${HOST.isolation ? `host_isolation: ${HOST.isolation}\n` : ""}instructions: ${VERSION}
target: ${TARGET}
${extraHeader(result)}model_requested: ${MODEL}
model_resolved: ${result.resolved}
cli_version: ${CLI}
session: ${result.first.session}
tonight_tools: ${discovered} discovered
tonight_transcript: ${result.logFile}
external_tools: disabled
state_before: ${result.digest}
state_before_file: ${result.snapshotFile}
state_after: ${result.afterDigest}
state_after_file: ${result.afterFile}
writes_expected: ${result.spec.writes ? "possible" : "no"}
writes_observed: ${mutations.length ? mutations.join(", ") : "none"}
state_changed: ${result.digest === result.afterDigest ? "no" : "yes"}
failed: ${failure ?? "no"}
recorded: ${stamp}
---

## Prompt

> ${result.first.sent ?? `(not sent: ${result.first.failure})`}
${asked}
## Tonight MCP transcript

Read from the proxy log named above; this is a reading of it, not a substitute for it.

${rendered}

Which turn made which calls:

${boundaries(result.turns)}

## Answer

${result.first.answer}
${answered}`;
}

/* ------------------------------------------------------------------ the run */

refuseIfPromptsMoved();
const said = prompts();
const key = (one) => `${one.fixture}__${one.prompt}${followUps(one).map((then) => `__then-${then}`).join("")}`;
/** Seeded by its operator through an older build — any `seed` a fixture names. */
const isLegacy = (one) => fixture(one.fixture).seed !== undefined;
let chosen = select(scenarios, { source: SOURCE, only: ONLY, smoke: SMOKE });
if (chosen.length === 0) throw new Error(`nothing on ${SOURCE} matches ${ONLY ?? ""}${SMOKE ? " among the smoke scenarios" : ""}`);

// A legacy fixture is one scenario, one run, per fresh v12 seed and migration: a
// going-through run may anchor, merge or delete, and the next run has to start
// from the pre-core shape again — which only the operator's cycle can restore.
if (LEGACY_SEEDED) {
  if (chosen.length !== 1 || !isLegacy(chosen[0]) || RUNS !== 1) {
    throw new Error(
      "--legacy-seeded runs exactly one legacy scenario, once: name it with " +
        "--only <fixture>__<prompt> and pass --runs 1. Each run needs its own fresh seed through " +
        "the older build (README, 'The legacy fixture' and 'Fixtures from before the vibe rule').",
    );
  }
} else {
  const legacy = chosen.filter(isLegacy);
  if (legacy.length) {
    console.error(
      `Skipping ${legacy.map(key).join(", ")}: a legacy fixture runs one scenario at a time, after ` +
        "its own seed through the older build, with --legacy-seeded (README, 'The legacy fixture' " +
        "and 'Fixtures from before the vibe rule').",
    );
  }
  chosen = chosen.filter((one) => !isLegacy(one));
  if (chosen.length === 0) throw new Error(`nothing left to run on ${SOURCE} once legacy scenarios are set aside`);
}

// Every request resolves before anything is spent.
for (const one of chosen) {
  for (const request of [one.prompt, ...followUps(one)]) {
    if (!said.get(request)) throw new Error(`prompts.md has no request called ${request}`);
  }
}

// The runs to make: all of them, or under --resume only those not recorded ok.
const stateOf = (name) => {
  const file = join(OUT, `${name}.md`);
  return recorded(existsSync(file) ? readFileSync(file, "utf8") : null);
};
const work = pending(chosen, RUNS, { resume: RESUME, stateOf });
const PLANNED = plannedCalls(work);
console.error(
  `${SET.toUpperCase()} semantic evaluation on ${SOURCE} — instructions ${VERSION} at ${TARGET}, model ${MODEL}, CLI ${CLI}, ` +
    `${DEEPSEEK ? "backend deepseek" : `host ${HOST.name}`}${SWAP === null ? "" : `, harness ${HARNESS}`}\n` +
    `${chosen.length} scenarios × ${RUNS} runs${SMOKE ? " (smoke)" : ""}${RESUME ? `, ${work.length} not yet recorded ok` : ""} = ` +
    `${work.length} runs, ${PLANNED} model calls, budget ${BUDGET} → ${OUT}`,
);
if (DRY) {
  for (const { scenario, index } of work) console.error(`  ${runName(scenario, index)}  (${scenario.family})`);
}
// Refused before a single call, a dry run included: over budget is never "nearly fine".
checkBudget(PLANNED, BUDGET);
if (DRY) process.exit(0);

// Before anything is seeded: the server has to be serving the catalog the guarded
// files register — not merely a different one (`../revision.mjs`).
if (CHECKS_CATALOG && work.length) {
  EXPECTED_CATALOG = expectedCatalog(join(ROOT, "web", "lib", "mcp", "server.ts"));
  const bearer = seed(work[0].scenario.fixture, "--token");
  console.error(`Waiting for ${ORIGIN} to serve tool catalog ${EXPECTED_CATALOG}…`);
  await waitForCatalog({ expected: EXPECTED_CATALOG, read: () => servedCatalog(bearer) });
}

mkdirSync(join(OUT, "snapshots"), { recursive: true });
mkdirSync(join(OUT, "logs"), { recursive: true });
if (DEEPSEEK) mkdirSync(join(OUT, "usage"), { recursive: true });

let done = 0;
let calls = 0;
for (const { scenario, index } of work) {
  const requests = [scenario.prompt, ...followUps(scenario)].map((key) => ({ key, text: said.get(key) }));
  const result = await run(scenario, requests, index);
  calls += result.calls;
  writeFileSync(join(OUT, `${result.name}.md`), artifact(scenario, index, result, new Date().toISOString()));
  done += 1;
  const failure = result.straddled ?? failedTurn(result);
  console.error(`[${String(done).padStart(3, " ")}/${String(work.length).padStart(3, " ")}] ${result.name}${failure ? `  FAILED: ${failure}` : ""}`);
  // Out of quota or signed out, on any turn: every further call would fail the same way.
  if (result.turns.some((one) => stopsTheRun(one.failure))) {
    console.error(
      `\nSTOPPED after ${done} of ${work.length} runs and ${calls} model calls: ${failure}\n` +
        "Quota or sign-in: nothing further was attempted. Re-run with --resume once it is fixed.",
    );
    process.exit(3);
  }
}
console.error(`\n${done} runs, ${calls} model calls, written to ${OUT}`);
