/**
 * Which host a semantic run's agent runs in — one definition for every runner here
 * (`run-baseline.mjs`, `m3/run.mjs`, `m5/run.mjs`), chosen with `--host`.
 *
 * **`bare`** is the default, and the only host any recording before 2026-10-21 used:
 * `claude -p --bare`, which loads nothing from the machine — no CLAUDE.md, no memory,
 * no hooks, no plugins — and authenticates only with `ANTHROPIC_API_KEY`.
 *
 * **`login`** exists because a machine may have no API key, only the user's normal
 * Claude login, which `--bare` never reads (M6; the user's decision, 2026-10-21). It is
 * `claude -p` without `--bare`, narrowed as far as the CLI allows while the Tonight
 * server still loads:
 *
 * - `--setting-sources local`, run in a fresh, empty directory: no user or project
 *   settings, so none of the user's hooks, enabled plugins, permissions or env — and
 *   the empty directory has no local settings of its own;
 * - `--disable-slash-commands`: no skills and no custom commands;
 * - the fresh directory: no project CLAUDE.md or AGENTS.md above it, and no auto-memory
 *   for it (memory is kept per working directory).
 *
 * `--safe-mode` would be narrower and cannot be used: it also drops the `--mcp-config`
 * server, so the agent never reaches Tonight (probed 2026-10-21: `mcp_servers: []`).
 *
 * It is still **not** `--bare`. Probed 2026-10-21, an agent started this way received
 * no CLAUDE.md, AGENTS.md or memory, but did receive the CLI's own context: the
 * account's user-context reminder (its email), an environment reminder (platform and
 * date), and the CLI's built-in plugins and agents. Admin-managed settings apply too.
 * So a login artifact says so in its header, and its results go in a directory of
 * their own: a bare recording and a login recording are never mixed, and never
 * compared as though they were the same host.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const HOSTS = ["bare", "login"];

/** What a run on this host passes to `claude`, where it runs it, and what it records. */
export function agentHost(name) {
  if (!HOSTS.includes(name)) throw new Error(`--host is one of ${HOSTS.join(", ")}`);
  if (name === "bare") {
    return { name, flags: ["--bare"], cwd: undefined, line: "claude -p (Claude Code CLI, --bare)", isolation: null, suffix: "" };
  }
  return {
    name,
    flags: ["--setting-sources", "local", "--disable-slash-commands"],
    // One directory for the whole invocation, so a second turn resumes where the
    // first was recorded: sessions are kept per working directory.
    cwd: mkdtempSync(join(tmpdir(), "tonight-eval-")),
    line: "claude -p (Claude Code CLI, the user's normal login — NOT --bare)",
    isolation:
      "--setting-sources local and --disable-slash-commands, from an empty temp directory: no user or " +
      "project settings, hooks, user plugins, skills, commands, CLAUDE.md, AGENTS.md or memory; MCP only " +
      "from --mcp-config (strict). The CLI's own context still reaches the agent — the account's " +
      "user-context reminder, an environment reminder with the date, built-in plugins and agents — and " +
      "admin-managed settings apply. Not equivalent to a --bare recording.",
    suffix: "-login",
  };
}
