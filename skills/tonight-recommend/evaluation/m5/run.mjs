/**
 * The M5 semantic evaluation, one fresh agent per run.
 *
 *   node evaluation/m5/run.mjs --source projection                 every scenario that runs there
 *   node evaluation/m5/run.mjs --source plugin-skills --only m5-01-anchored__logan-lucky-sunday
 *   node evaluation/m5/run.mjs --source recommend-only --runs 3
 *   node evaluation/m5/run.mjs --source projection --dry-run       what it would do, and nothing else
 *   node evaluation/m5/run.mjs --set m6 --source projection        the M6 set (evaluation/m6/)
 *
 * M3's runner, with three differences and a reason for each.
 *
 * **It is told which instructions the agent gets.** The project projection and the
 * plugin are different hosts carrying different text (the plan's R3-2): a project
 * gets `tonight-recommend`'s projection and nothing else; the plugin ships both full
 * `SKILL.md` files; and the plugin may select recommend alone. `--source` names
 * which of the three a run stands for, and the artifact records it:
 *
 *     projection       the generated projection, exactly as the website hands it out
 *     plugin-skills    every full SKILL.md the plugin package carries — every folder
 *                      under skills/, as `chatgpt-plugin/build.sh` packages them —
 *                      recommend first, each under a line naming it
 *     recommend-only   tonight-recommend/SKILL.md alone
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
 * **It can give a second turn.** A scenario with `then` resumes the recorded session
 * (`claude -p --resume <session>`) with the second request. Whether the CLI resumed
 * is checked from its own answer — the session id it reports — and a run where it
 * did not is marked failed rather than scored as though it had.
 *
 * **A legacy fixture is never reseeded here.** Vibes from before cores cannot be
 * written by a build that requires one, and they are never written by SQL; the
 * operator seeds them through a v12 build and migrates (README). Such a fixture runs
 * only with `--legacy-seeded`, one run per seeding.
 *
 * Every other fixture is reseeded before every run — vibes, then films, then genres
 * torn down, then everything written again through the tools — and snapshotted before
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
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, globSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agentHost } from "../host.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const EVAL = join(here, "..");
const ROOT = join(here, "..", "..", "..", "..");
const WEB = join(ROOT, "web");
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

const SOURCES = ["projection", "plugin-skills", "recommend-only"];
const SOURCE = option("source", null);
const RUNS = Number(option("runs", "3"));
const MODEL = option("model", "claude-sonnet-5");
const ONLY = option("only", null);
const PORT = Number(option("port", "3997"));
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");
const LEGACY_SEEDED = args.includes("--legacy-seeded");
/** `--host bare` (the default) or `--host safe-mode`: see `../host.mjs`. */
const HOST = agentHost(option("host", "bare"));

if (!SOURCES.includes(SOURCE)) {
  throw new Error(`--source is required: one of ${SOURCES.join(", ")}`);
}

const CLI = execFileSync("claude", ["--version"], { encoding: "utf8" }).trim().split(" ")[0];

function projection() {
  const source = readFileSync(join(WEB, "lib", "generated", "project-instructions.ts"), "utf8");
  const open = source.indexOf("PROJECT_INSTRUCTIONS = `") + "PROJECT_INSTRUCTIONS = `".length;
  const body = source.slice(open, source.indexOf("`;", open));
  return body.replace(/\\`/g, "`").replace(/\\\$\{/g, "${").replace(/\\\\/g, "\\");
}

const skill = (name) => readFileSync(join(ROOT, "skills", name, "SKILL.md"), "utf8");

/** The skills the plugin package carries right now: recommend first, then the rest by name. */
function packaged() {
  const all = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, "skills", entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
  return ["tonight-recommend", ...all.filter((name) => name !== "tonight-recommend")];
}

/** The skills a run on this source is given, by name; empty for the projection. */
function skillsGiven() {
  switch (SOURCE) {
    case "projection":
      return [];
    case "recommend-only":
      return ["tonight-recommend"];
    case "plugin-skills":
      return packaged();
  }
}

/** The instructions a run on this source is given, and nothing else. */
function instructions() {
  switch (SOURCE) {
    case "projection":
      return projection();
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

function version() {
  const source = readFileSync(join(WEB, "lib", "generated", "project-instructions.ts"), "utf8");
  return source.match(/PROJECT_INSTRUCTIONS_VERSION = "([a-f0-9]+)"/)[1];
}

/** The same guard as Phase 1 and M3: a recording of edited instructions describes nothing. */
function refuseIfPromptsMoved() {
  for (const file of [
    "skills/tonight-recommend/SKILL.md",
    "skills/tonight-vibes/SKILL.md",
    "web/lib/generated/project-instructions.ts",
    "web/lib/mcp/server.ts",
  ]) {
    try {
      execFileSync("git", ["diff", "--quiet", "HEAD", "--", file], { cwd: ROOT });
    } catch {
      throw new Error(`${file} differs from HEAD — commit or revert before recording.`);
    }
  }
}

const VERSION = version();
const TARGET = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const OUT = join(SET_DIR, "results", `${SET}-${SOURCE}-${VERSION}-${TARGET}${HOST.suffix}`, "runs");

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

/** One `claude -p` turn, fresh or resumed. */
function turn(said, config, resume) {
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
    return {
      answer: parsed.result ?? "",
      session: parsed.session_id ?? "unknown",
      failure: parsed.subtype === "success" ? null : parsed.subtype,
    };
  } catch (error) {
    const said = String(error.stderr ?? "").trim().slice(0, 600);
    return { answer: "", session: "unknown", failure: `exit ${String(error.status ?? "?")}${said ? ` — ${said}` : " — no stderr"}` };
  }
}

async function run(scenario, said, then, index) {
  const spec = fixture(scenario.fixture);
  const name = `${scenario.fixture}__${scenario.prompt}${scenario.then ? `__then-${scenario.then}` : ""}__${String(index).padStart(2, "0")}`;
  const snapshotFile = `snapshots/${name}.json`;
  const afterFile = `snapshots/${name}.after.json`;
  const logFile = `logs/${name}.jsonl`;

  const triple = [`${name}.md`, snapshotFile, logFile].map((part) => join(OUT, part));
  const already = triple.filter((part) => existsSync(part));
  if (already.length && !FORCE) {
    throw new Error(`${name} already has ${already.length} of its 3 files. Re-run with --force.`);
  }
  for (const part of [...already, join(OUT, afterFile)]) rmSync(part, { force: true });

  // One date for the whole run: seeded, told and scored with the same `D`.
  TODAY = localDate();
  const today = TODAY;

  // Fresh, every run — except a legacy fixture, which only its operator can seed.
  if (spec.seed !== "v12-then-migrate") seed(scenario.fixture);
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

  let first;
  let second = null;
  try {
    first = turn(said, config, null);
    if (then !== null && first.failure === null) {
      second = turn(then, config, first.session);
      // A resume that started a different session did not resume.
      if (second.failure === null && second.session !== first.session) {
        second.failure = `did not resume: asked for ${first.session}, answered in ${second.session}`;
      }
    }
  } finally {
    rmSync(config, { force: true });
    await shutDown(proxy, PORT);
  }

  // A run that crossed midnight was told one date and lived in two: void, not scored.
  const ended = localDate();
  const straddled = SET === "m6" && ended !== today ? `void: started on ${today}, ended on ${ended} — rerun` : null;

  const afterDigest = seed(scenario.fixture, "--snapshot", join(OUT, afterFile));
  return {
    name, spec, snapshotFile, afterFile, logFile, digest, afterDigest, first, second,
    resolved: answeredBy(first.session), today, straddled,
  };
}

function artifact(scenario, said, then, index, result, stamp) {
  const { rendered, discovered, mutations } = transcript(result.logFile);
  const failure = result.straddled ?? result.first.failure ?? result.second?.failure ?? null;
  return `---
fixture: ${scenario.fixture}
prompt: ${scenario.prompt}
then: ${scenario.then ?? "none"}
family: ${scenario.family}
considers: ${scenario.considers ? "yes" : "no"}
gate: ${scenario.gate ?? "m5 threshold"}
run: ${String(index).padStart(2, "0")}
side: ${SET}
today: ${result.today}${SET === "m6" ? " (told to the agent as a host line; @today seeded as this)" : " (not told)"}
source: ${SOURCE}
skills: ${skillsGiven().join(", ") || "none — the projection"}
host: ${HOST.line}, instructions as the system prompt
${HOST.isolation ? `host_isolation: ${HOST.isolation}\n` : ""}instructions: ${VERSION}
target: ${TARGET}
model_requested: ${MODEL}
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

> ${said}
${then === null ? "" : `\n## Second turn\n\n> ${then}\n`}
## Tonight MCP transcript

Read from the proxy log named above; this is a reading of it, not a substitute for it.

${rendered}

## Answer

${result.first.answer}
${result.second === null ? "" : `\n## Second answer\n\n${result.second.answer}\n`}`;
}

/* ------------------------------------------------------------------ the run */

refuseIfPromptsMoved();
const said = prompts();
const key = (one) => `${one.fixture}__${one.prompt}${one.then ? `__then-${one.then}` : ""}`;
const isLegacy = (one) => fixture(one.fixture).seed === "v12-then-migrate";
let chosen = scenarios.filter(
  (one) =>
    one.sources.includes(SOURCE) &&
    (ONLY === null ||
      key(one) === ONLY ||
      `${one.fixture}__${one.prompt}` === ONLY ||
      one.fixture === ONLY ||
      one.family === ONLY),
);
if (chosen.length === 0) throw new Error(`nothing on ${SOURCE} matches ${ONLY}`);

// A legacy fixture is one scenario, one run, per fresh v12 seed and migration: a
// going-through run may anchor, merge or delete, and the next run has to start
// from the pre-core shape again — which only the operator's cycle can restore.
if (LEGACY_SEEDED) {
  if (chosen.length !== 1 || !isLegacy(chosen[0]) || RUNS !== 1) {
    throw new Error(
      "--legacy-seeded runs exactly one legacy scenario, once: name it with " +
        "--only <fixture>__<prompt> and pass --runs 1. Each run needs its own fresh v12 seed and " +
        "migration (README, 'The legacy fixture').",
    );
  }
} else {
  const legacy = chosen.filter(isLegacy);
  if (legacy.length) {
    console.error(
      `Skipping ${legacy.map(key).join(", ")}: a legacy fixture runs one scenario at a time, after ` +
        "its own v12 seed and migration, with --legacy-seeded (README, 'The legacy fixture').",
    );
  }
  chosen = chosen.filter((one) => !isLegacy(one));
  if (chosen.length === 0) throw new Error(`nothing left to run on ${SOURCE} once legacy scenarios are set aside`);
}

const planned = chosen.length * RUNS;
console.error(
  `${SET.toUpperCase()} semantic evaluation on ${SOURCE} — instructions ${VERSION} at ${TARGET}, model ${MODEL}, CLI ${CLI}, host ${HOST.name}\n` +
    `${chosen.length} scenarios × ${RUNS} runs = ${planned} runs → ${OUT}`,
);
if (DRY) {
  for (const one of chosen) {
    console.error(`  ${one.fixture}__${one.prompt}${one.then ? ` then ${one.then}` : ""}  (${one.family})`);
  }
  process.exit(0);
}

mkdirSync(join(OUT, "snapshots"), { recursive: true });
mkdirSync(join(OUT, "logs"), { recursive: true });

let done = 0;
for (const scenario of chosen) {
  const request = said.get(scenario.prompt);
  if (!request) throw new Error(`prompts.md has no request called ${scenario.prompt}`);
  const then = scenario.then ? said.get(scenario.then) : null;
  if (scenario.then && !then) throw new Error(`prompts.md has no request called ${scenario.then}`);
  for (let index = 1; index <= RUNS; index += 1) {
    const result = await run(scenario, request, then, index);
    writeFileSync(join(OUT, `${result.name}.md`), artifact(scenario, request, then, index, result, new Date().toISOString()));
    done += 1;
    const failure = result.straddled ?? result.first.failure ?? result.second?.failure;
    console.error(`[${String(done).padStart(3, " ")}/${String(planned).padStart(3, " ")}] ${result.name}${failure ? `  FAILED: ${failure}` : ""}`);
  }
}
console.error(`\n${done} runs written to ${OUT}`);
