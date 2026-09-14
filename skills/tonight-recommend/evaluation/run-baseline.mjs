/**
 * Runs the baseline, one fresh agent per run.
 *
 *   node evaluation/run-baseline.mjs                    the whole matrix
 *   node evaluation/run-baseline.mjs --only 03-state-rich --runs 1
 *   node evaluation/run-baseline.mjs --side phase-1     after Steps 4 to 6
 *
 * The runbook's procedure, automated, and nothing more. Every requirement it
 * states is met by this script or the run does not happen: a fresh session per
 * run, the approved instructions verbatim, the fixture materialised, a snapshot
 * bound by digest, the proxy recording what the agent did to Tonight, and the
 * artifact written in the required format.
 *
 * ## What this must never do, and how it avoids it
 *
 * The evaluation agent is the subject. This script prepares the room and then
 * leaves it: it seeds, mints, snapshots, starts the proxy and launches a process.
 * It does **not** call `get_taste` on the agent's behalf, reason for it, write a
 * transcript for it, or fabricate a failure.
 *
 * - **The transcript is the proxy's**, written as the calls happen. The `get_taste`
 *   field of the artifact is derived from that log, not from anything the agent
 *   said about itself.
 * - **The AC6 failure is the proxy's**, configured before the agent starts. The
 *   agent discovers the tools, decides to call `get_taste`, and meets a refusal in
 *   MCP's own shape.
 * - **The snapshot is provenance, not a substitute call.** It records what the
 *   data was at that moment so the artifact can prove what the agent saw, and it
 *   goes straight to the server rather than through the proxy — which matters for
 *   the failure fixtures, where the agent's read fails and the data still exists.
 *
 * ## Fresh sessions
 *
 * One `claude -p` process per run, `--bare` so no memory, CLAUDE.md, hook or
 * plugin leaks in, and `--strict-mcp-config` so the only tools are Tonight's. The
 * process ends with the run. Nothing is shared between runs but the fixture.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, globSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..", "..");
const WEB = join(ROOT, "web");
const ORIGIN = process.env.TONIGHT_ORIGIN ?? "http://localhost:3000";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const RUNS = Number(option("runs", "5"));
const SIDE = option("side", "baseline");
// The exact model, never a moving alias: `sonnet` resolves to whatever is
// current, and a baseline that cannot say what produced it cannot be compared
// with anything later.
const MODEL = option("model", "claude-sonnet-5");
const ONLY = option("only", null);
const PORT = Number(option("port", "3999"));
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");

const OUT = join(here, "results", SIDE, "runs");

/** Which CLI produced the runs, asked of the CLI rather than assumed. */
const CLI = execFileSync("claude", ["--version"], { encoding: "utf8" }).trim().split(" ")[0];

/**
 * The instructions, exactly as somebody pastes them.
 *
 * Read out of the generated module and un-escaped, which is the reverse of what
 * `scripts/sync-instructions.mjs` does when it writes it. Nothing is summarised:
 * a run against a paraphrase is a run against different instructions.
 */
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
 * The rule that makes a baseline worth anything: it is recorded against
 * instructions nobody has touched. Checked here rather than trusted, because a
 * contaminated baseline is invisible afterwards.
 */
function refuseIfPromptsMoved() {
  const watched = [
    "skills/tonight-recommend/SKILL.md",
    "web/lib/generated/project-instructions.ts",
    "web/lib/mcp/server.ts",
  ];
  for (const file of watched) {
    try {
      execFileSync("git", ["diff", "--quiet", "HEAD", "--", file], { cwd: ROOT });
    } catch {
      throw new Error(
        `${file} differs from HEAD. A baseline recorded against edited instructions is not a ` +
          `baseline — commit or revert before recording.`,
      );
    }
  }
}

const fixtures = readdirSync(join(here, "fixtures"))
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8")));

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

/**
 * Waits until **our** proxy is the one answering on the port.
 *
 * Not "something is listening": a proxy left over from the previous run answers
 * just as readily, and an agent handed to it would have its calls appended to the
 * previous run's log. The health endpoint names the process, so this waits for
 * the pid it spawned and refuses anything else.
 */
async function listening(port, pid) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const answer = await fetch(`http://localhost:${port}/__evaluation`);
      const who = await answer.json();
      if (who.pid === pid) return;
      throw new Error(
        `port ${port} is held by pid ${who.pid}, not the proxy spawned for this run (${pid})`,
      );
    } catch (error) {
      if (String(error.message).includes("is held by")) throw error;
      await pause(100);
    }
  }
  throw new Error(`the proxy never came up on ${port}`);
}

/** Waits for the proxy to be gone — the process ended and the port is free. */
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

/** One run: a fresh agent, the real tools, and whatever it does with them. */
async function run(fixture, prompt, said, index) {
  const name = `${fixture.id}__${prompt}__${String(index).padStart(2, "0")}`;
  const snapshotFile = `snapshots/${name}.json`;
  const logFile = `logs/${name}.jsonl`;

  // A run is an artifact, a snapshot and a log, and they only mean anything
  // together. Half a triple left from an earlier attempt is the dangerous case:
  // the proxy appends, so a retry would write a new answer over an old one while
  // the log still carried the earlier run's calls. Refuse, or recreate all three.
  const triple = [`${name}.md`, snapshotFile, logFile].map((part) => join(OUT, part));
  const already = triple.filter((part) => existsSync(part));
  if (already.length && !FORCE) {
    throw new Error(
      `${name} already has ${already.length} of its 3 files. Re-run with --force to recreate the ` +
        `whole triple, or move the existing run aside — a partial overwrite mixes two runs.`,
    );
  }
  for (const part of already) rmSync(part, { force: true });

  // Provenance, straight to the server: for a failure fixture the agent's read
  // fails and the data still exists, and the artifact has to be able to say so.
  const digest = seed(fixture.id, "--snapshot", join(OUT, snapshotFile));
  const bearer = seed(fixture.id, "--token");

  const failing = fixture.condition === "get_taste_fails" ? ["--fail", "get_taste"] : [];
  const proxy = spawn(
    "node",
    [join(here, "proxy.mjs"), "--port", String(PORT), "--log", join(OUT, logFile), ...failing],
    { stdio: "ignore" },
  );
  await listening(PORT, proxy.pid);

  const config = join(OUT, `.mcp-${name}.json`);
  writeFileSync(
    config,
    JSON.stringify({
      mcpServers: {
        tonight: {
          type: "http",
          url: `http://localhost:${PORT}/mcp`,
          headers: { Authorization: `Bearer ${bearer}` },
        },
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
    failure = String(error.message).slice(0, 400);
  } finally {
    rmSync(config, { force: true });
    await shutDown(proxy, PORT);
  }

  return { name, snapshotFile, logFile, digest, answer, failure, resolved, session };
}

/**
 * Which model wrote the answer, from the session the CLI recorded.
 *
 * Not from `modelUsage`, which lists every model the session touched — a run
 * answered by Sonnet also shows a small auxiliary model there, and taking the
 * first key names the wrong one. The assistant message in the transcript is what
 * actually produced the text.
 */
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

/** What the proxy saw, read back as the artifact's transcript. */
function transcript(logFile) {
  const lines = readFileSync(join(OUT, logFile), "utf8").trim().split("\n").filter(Boolean);
  const calls = lines.map((line) => JSON.parse(line)).filter((entry) => entry.tool);
  const taste = calls.filter((entry) => entry.tool === "get_taste");

  const state = taste.length === 0 ? "not_called" : taste.some((one) => one.failed) ? "failed" : "ok";
  const rendered = calls.length
    ? calls
        .map((entry, at) => `${at + 1}. \`${entry.tool}\` → ${entry.failed ? "refused" : `ok (${entry.status})`}`)
        .join("\n")
    : "None.";

  const discovered = lines
    .map((line) => JSON.parse(line))
    .find((entry) => entry.discovered !== undefined)?.discovered;

  return { state, rendered, discovered: discovered ?? "unknown" };
}

function artifact(fixture, prompt, said, index, result, stamp) {
  const { state, rendered, discovered } = transcript(result.logFile);
  return `---
fixture: ${fixture.id}
prompt: ${prompt}
run: ${String(index).padStart(2, "0")}
side: ${SIDE}
instructions: ${version()}
host: claude -p (Claude Code CLI, --bare)
model_requested: ${MODEL}
model_resolved: ${result.resolved}
cli_version: ${CLI}
session: ${result.session}
tonight_tools: ${discovered} discovered
tonight_transcript: ${result.logFile}
external_tools: disabled
external_evidence: n/a
taste_snapshot: ${result.digest}
taste_snapshot_file: ${result.snapshotFile}
get_taste: ${state}
recorded: ${stamp}
---

## Prompt

> ${said}

## Tonight MCP transcript

Read from the proxy log named above; this is a reading of it, not a substitute for it.

${rendered}

## External tool evidence

n/a — external tools disabled. The agent was launched with Tonight's tools and no others, so any
claim about availability, a release or what is on this week is unsupported by construction.

## Answer

${result.failure ? `RUN FAILED: ${result.failure}\n\n${result.answer}` : result.answer}
`;
}

// --- go ---------------------------------------------------------------------

refuseIfPromptsMoved();
mkdirSync(join(OUT, "snapshots"), { recursive: true });
mkdirSync(join(OUT, "logs"), { recursive: true });

const said = prompts();
const wanted = fixtures.filter((one) => !ONLY || one.id === ONLY);
const matrix = wanted.flatMap((fixture) =>
  fixture.prompts.flatMap((prompt) =>
    Array.from({ length: RUNS }, (_, at) => ({ fixture, prompt, index: at + 1 })),
  ),
);

console.error(
  `${matrix.length} runs — instructions ${version()}, model ${MODEL}, CLI ${CLI}, side ${SIDE}` +
    `${DRY ? " (dry run: nothing will be launched)" : ""}`,
);
if (DRY) {
  for (const one of matrix) console.error(`  ${one.fixture.id} ${one.prompt} ${one.index}`);
  process.exit(0);
}

// Seeded once per fixture that owns a model; the ones that share read it.
for (const fixture of new Set(wanted.map((one) => (one.model ? one.id : one.sameModelAs)))) {
  if (!fixture) continue;
  seed(fixture);
  console.error(`  seeded ${fixture}`);
}

let done = 0;
for (const { fixture, prompt, index } of matrix) {
  const stamp = new Date().toISOString();
  const result = await run(fixture, prompt, said.get(prompt), index);
  writeFileSync(join(OUT, `${result.name}.md`), artifact(fixture, prompt, said.get(prompt), index, result, stamp));
  done += 1;
  console.error(`  [${done}/${matrix.length}] ${result.name}${result.failure ? " — FAILED" : ""}`);
}

console.error(`\nWrote ${done} runs to ${OUT}.`);
