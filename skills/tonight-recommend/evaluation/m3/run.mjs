/**
 * The M3 semantic evaluation, one fresh agent per run.
 *
 *   node evaluation/m3/run.mjs                    every scenario, three runs each
 *   node evaluation/m3/run.mjs --only m3-02-episodes-only__learned-pattern --runs 1
 *   node evaluation/m3/run.mjs --dry-run          what it would do, and nothing else
 *
 * Phase 1's orchestrator, with three differences and a reason for each.
 *
 * **It reseeds before every run.** An M3 fixture is a history and three of the
 * seventeen scenarios ask the agent to change it. A run that began in the state
 * the previous run left is not a run of the scenario. The snapshot is taken
 * immediately after seeding and bound to the run by digest, so the provenance
 * guarantee is the same one Phase 1 makes.
 *
 * **It snapshots both reads.** `get_taste` is what a recommendation stands on and
 * `get_memory` is the broader view; the whole of family A is which of them the
 * model chooses, so the artifact has to be able to show what each of them held.
 *
 * **It records the state afterwards, for the scenarios that write.** Whether a
 * withdrawal was a withdrawal is not a question about prose. The three writing
 * scenarios have their memory and their verdict history read again after the
 * agent has finished, straight to the server, and the difference is in the
 * artifact.
 *
 * What it does not do, ever, is the same list: it does not call a tool on the
 * agent's behalf, reason for it, or write its transcript. The transcript is the
 * proxy's, written as the calls happen.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, globSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const EVAL = join(here, "..");
const ROOT = join(here, "..", "..", "..", "..");
const WEB = join(ROOT, "web");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const RUNS = Number(option("runs", "3"));
const MODEL = option("model", "claude-sonnet-5");
const ONLY = option("only", null);
const PORT = Number(option("port", "3998"));
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");

const CLI = execFileSync("claude", ["--version"], { encoding: "utf8" }).trim().split(" ")[0];

function instructions() {
  const source = readFileSync(join(WEB, "lib", "generated", "project-instructions.ts"), "utf8");
  const open = source.indexOf("PROJECT_INSTRUCTIONS = `") + "PROJECT_INSTRUCTIONS = `".length;
  const body = source.slice(open, source.indexOf("`;", open));
  return body.replace(/\\`/g, "`").replace(/\\\$\{/g, "${").replace(/\\\\/g, "\\");
}

function version() {
  const source = readFileSync(join(WEB, "lib", "generated", "project-instructions.ts"), "utf8");
  return source.match(/PROJECT_INSTRUCTIONS_VERSION = "([a-f0-9]+)"/)[1];
}

/**
 * The same guard the Phase-1 sweep has, and for the same reason.
 *
 * A behavioural recording made against edited instructions describes a version
 * that exists nowhere, and nothing in the artifact would say so.
 */
function refuseIfPromptsMoved() {
  for (const file of [
    "skills/tonight-recommend/SKILL.md",
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

/**
 * Which commit produced the surface under test.
 *
 * Read from the repository rather than typed in, because the identity of a
 * behavioural recording is the whole model-visible surface and not the
 * instruction hash alone. `d0f9529` and `5169ad1` both project instruction
 * `3eaac1bf`, and they differ in three tool descriptions and in what a verdict
 * write hands back — so a result set named by the hash alone would claim to
 * describe two different surfaces, and the older one would be overwritten by
 * the newer or refuse to run at all.
 */
function target() {
  return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
}

const TARGET = target();
const OUT = join(here, "results", `m3-${VERSION}-${TARGET}`, "runs");

const scenarios = JSON.parse(readFileSync(join(here, "scenarios.json"), "utf8"));
const fixture = (id) => JSON.parse(readFileSync(join(here, "fixtures", `${id}.json`), "utf8"));

/** The request set, as `prompts.md` writes it. */
function prompts() {
  const table = readFileSync(join(here, "prompts.md"), "utf8");
  const said = new Map();
  for (const row of table.matchAll(/^\| `([a-z-]+)` \| \*"(.+?)"\* \|/gm)) said.set(row[1], row[2]);
  return said;
}

const seed = (id, ...rest) =>
  execFileSync("node", [join(here, "seed.mjs"), id, ...rest], { encoding: "utf8" }).trim();

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

function transcript(logFile) {
  const lines = readFileSync(join(OUT, logFile), "utf8").trim().split("\n").filter(Boolean);
  const calls = lines.map((line) => JSON.parse(line)).filter((entry) => entry.tool);
  const rendered = calls.length
    ? calls.map((entry, at) => `${at + 1}. \`${entry.tool}\` → ${entry.failed ? "refused" : `ok (${entry.status})`}`).join("\n")
    : "None.";
  const discovered = lines.map((line) => JSON.parse(line)).find((entry) => entry.discovered !== undefined)?.discovered;
  return { calls: calls.map((one) => one.tool), rendered, discovered: discovered ?? "unknown" };
}

/** One run: a fresh history, a fresh agent, and whatever it did with the tools. */
async function run(scenario, said, index) {
  const spec = fixture(scenario.fixture);
  const name = `${scenario.fixture}__${scenario.prompt}__${String(index).padStart(2, "0")}`;
  const snapshotFile = `snapshots/${name}.json`;
  const afterFile = `snapshots/${name}.after.json`;
  const logFile = `logs/${name}.jsonl`;

  const triple = [`${name}.md`, snapshotFile, logFile].map((part) => join(OUT, part));
  const already = triple.filter((part) => existsSync(part));
  if (already.length && !FORCE) {
    throw new Error(`${name} already has ${already.length} of its 3 files. Re-run with --force.`);
  }
  for (const part of [...already, join(OUT, afterFile)]) rmSync(part, { force: true });

  // The history, fresh, and the proof of what it was.
  seed(scenario.fixture);
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

  let answer = "";
  let failure = null;
  let resolved = "unknown";
  let session = "unknown";
  try {
    const printed = execFileSync(
      "claude",
      [
        "-p", said,
        "--bare",
        "--model", MODEL,
        "--mcp-config", config,
        "--strict-mcp-config",
        "--system-prompt", instructions(),
        "--allowedTools", "mcp__tonight",
        "--disallowedTools", "WebSearch WebFetch Bash Read Write Edit Glob Grep Task TodoWrite NotebookEdit",
        "--permission-mode", "bypassPermissions",
        "--output-format", "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 },
    );
    const parsed = JSON.parse(printed.slice(printed.indexOf("{")));
    answer = parsed.result ?? "";
    session = parsed.session_id ?? "unknown";
    resolved = answeredBy(session);
    if (parsed.subtype !== "success") failure = parsed.subtype;
  } catch (error) {
    // The message alone is the whole command line and tells you nothing. What
    // the CLI wrote to stderr is the reason.
    const said = String(error.stderr ?? "").trim().slice(0, 600);
    failure = `exit ${String(error.status ?? "?")}${said ? ` — ${said}` : " — no stderr"}`;
  } finally {
    rmSync(config, { force: true });
    await shutDown(proxy, PORT);
  }

  // What the history looks like now. Only for the scenarios that ask the agent
  // to change it, because for the others it is the snapshot again by definition
  // — and a read purity claim is the deterministic suite's, not this one's.
  let afterDigest = null;
  if (spec.writes) afterDigest = seed(scenario.fixture, "--snapshot", join(OUT, afterFile));

  return { name, spec, snapshotFile, afterFile, logFile, digest, afterDigest, answer, failure, resolved, session };
}

function artifact(scenario, said, index, result, stamp) {
  const { rendered, discovered } = transcript(result.logFile);
  const after = result.afterDigest
    ? `state_after: ${result.afterDigest}\nstate_after_file: ${result.afterFile}\n`
    : "";
  return `---
fixture: ${scenario.fixture}
prompt: ${scenario.prompt}
family: ${scenario.family}
run: ${String(index).padStart(2, "0")}
side: m3
instructions: ${VERSION}
target: ${TARGET}
host: claude -p (Claude Code CLI, --bare)
model_requested: ${MODEL}
model_resolved: ${result.resolved}
cli_version: ${CLI}
session: ${result.session}
tonight_tools: ${discovered} discovered
tonight_transcript: ${result.logFile}
external_tools: disabled
external_evidence: n/a
state_before: ${result.digest}
state_before_file: ${result.snapshotFile}
${after}writes: ${result.spec.writes ? "yes" : "no"}
recorded: ${stamp}
---

## Prompt

> ${said}

## Tonight MCP transcript

Read from the proxy log named above; this is a reading of it, not a substitute for it.

${rendered}

## External tool evidence

n/a — external tools disabled

## Answer

${result.failure ? `FAILED: ${result.failure}\n\n` : ""}${result.answer}
`;
}

/* ------------------------------------------------------------------ the run */

refuseIfPromptsMoved();
const said = prompts();
const chosen = scenarios.filter(
  (one) => ONLY === null || `${one.fixture}__${one.prompt}` === ONLY || one.fixture === ONLY || one.family === ONLY,
);
if (chosen.length === 0) throw new Error(`nothing matches ${ONLY}`);

const planned = chosen.length * RUNS;
console.error(
  `M3 semantic evaluation — instructions ${VERSION} at ${TARGET}, model ${MODEL}, CLI ${CLI}\n` +
    `${chosen.length} scenarios × ${RUNS} runs = ${planned} runs → ${OUT}`,
);
if (DRY) {
  for (const one of chosen) console.error(`  ${one.fixture}__${one.prompt}  (family ${one.family})`);
  process.exit(0);
}

mkdirSync(join(OUT, "snapshots"), { recursive: true });
mkdirSync(join(OUT, "logs"), { recursive: true });

let done = 0;
for (const scenario of chosen) {
  const request = said.get(scenario.prompt);
  if (!request) throw new Error(`prompts.md has no request called ${scenario.prompt}`);
  for (let index = 1; index <= RUNS; index += 1) {
    const result = await run(scenario, request, index);
    writeFileSync(join(OUT, `${result.name}.md`), artifact(scenario, request, index, result, new Date().toISOString()));
    done += 1;
    console.error(
      `[${String(done).padStart(3, " ")}/${String(planned).padStart(3, " ")}] ${result.name}` +
        `${result.failure ? `  FAILED: ${result.failure}` : ""}`,
    );
  }
}
console.error(`\n${done} runs written to ${OUT}`);
