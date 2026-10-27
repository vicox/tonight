/**
 * Which revision of the instructions a live run records, made checkable
 * (docs/work/vibe-hypotheses §12.2).
 *
 * Two things a recording has to be able to say, and how each is made true:
 *
 * - **The files are the named commit's.** `--against <commit>` puts the three
 *   instruction files of that commit in the working tree for the length of one
 *   invocation, and puts `HEAD`'s back however it ends — only from a clean tracked
 *   tree, with both commits frozen first and the restore installed before anything is
 *   touched.
 * - **The server is serving them.** A changed catalog proves nothing about which
 *   revision is being served, so the served tool catalog is compared with the one the
 *   files on disk register, computed in a fresh process that no earlier revision can
 *   have answered from.
 *
 * The digest is over each tool's name and description. A revision that differs only
 * elsewhere is not told apart by it; the guard covers the files themselves.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

/** The files that are a recording's instructions — the same three the runner's guard compares. */
export const INSTRUCTION_FILES = [
  "skills/tonight-recommend/SKILL.md",
  "skills/tonight-vibes/SKILL.md",
  "web/lib/mcp/server.ts",
];

/** A catalog's digest: its tools' names and descriptions, in name order. */
export function catalogDigest(tools) {
  const pairs = tools.map(({ name, description }) => [name, description ?? ""]).sort(([a], [b]) => (a < b ? -1 : 1));
  return createHash("sha256").update(JSON.stringify(pairs), "utf8").digest("hex").slice(0, 16);
}

/**
 * The digest of the catalog the `server.ts` on disk registers, read by a fresh `node`
 * process — so no module this process imported earlier can answer for it.
 */
export function expectedCatalog(serverFile) {
  const script =
    `const { tonightMcpServer } = await import(${JSON.stringify(pathToFileURL(serverFile).href)});` +
    `const tools = tonightMcpServer({ user: { id: "google:catalog" }, reference: "catalog" })._registeredTools;` +
    `process.stdout.write(JSON.stringify(Object.entries(tools).map(([name, tool]) => ({ name, description: tool.description ?? "" }))));`;
  const printed = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return catalogDigest(JSON.parse(printed));
}

/**
 * Waits until the server serves the expected catalog. A stale one is waited out, a
 * read that fails is tried again, and one that never matches stops everything with
 * both digests named.
 *
 * The deadline holds for every read: one that has not answered by then is abandoned,
 * and one that answers after it is not accepted, even if it matches — a catalog served
 * late is not evidence of what was being served in time.
 */
export async function waitForCatalog({ expected, read, timeoutMs = 120_000, intervalMs = 1000, clock = Date.now }) {
  const deadline = clock() + timeoutMs;
  const OVERDUE = Symbol("overdue");
  const left = () => Math.max(0, deadline - clock());
  let last = "nothing read";
  for (;;) {
    // The read races what is left of the deadline; the timer goes as soon as it loses.
    let timer;
    const overdue = new Promise((wake) => {
      timer = setTimeout(() => wake(OVERDUE), left());
    });
    try {
      const served = await Promise.race([read(), overdue]);
      if (served === OVERDUE) {
        last = "no answer before the deadline";
      } else if (clock() > deadline) {
        last = `${served}, after the deadline`;
      } else {
        last = served;
        if (served === expected) return served;
      }
    } catch (error) {
      last = `unreadable (${error.message})`;
    } finally {
      clearTimeout(timer);
    }
    if (clock() >= deadline) {
      throw new Error(
        `the server never served the expected tool catalog: expected ${expected}, last served ${last}`,
      );
    }
    await new Promise((wake) => setTimeout(wake, Math.min(intervalMs, left())));
  }
}

/**
 * Puts the instruction files of `target` in the working tree until this process ends.
 *
 * Refused unless the tracked tree is clean, so the harness is exactly `HEAD` and
 * nothing uncommitted can be lost. Both commits are frozen to full SHAs, and the
 * restore is installed — on exit, an uncaught error or a signal — before the swap.
 * `git restore` touches the working tree and never the index.
 */
export function swapInstructions({
  target,
  git,
  on = (event, handler) => process.on(event, handler),
  exit = (code) => process.exit(code),
}) {
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]).trim();
  if (dirty) {
    throw new Error(`--against needs a clean tracked tree, and these are changed: ${dirty.split("\n").join("; ")}`);
  }
  const head = git(["rev-parse", "HEAD"]).trim();
  const against = git(["rev-parse", "--verify", `${target}^{commit}`]).trim();

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    git(["restore", "--source", head, "--", ...INSTRUCTION_FILES]);
  };
  on("exit", restore);
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    on(signal, () => {
      restore();
      exit(code);
    });
  }

  git(["restore", "--source", against, "--", ...INSTRUCTION_FILES]);
  return { head, against, restore };
}

/** `git` in a directory, as the swap and the runner call it. */
export const gitIn = (cwd) => (args) => execFileSync("git", args, { cwd, encoding: "utf8" });
