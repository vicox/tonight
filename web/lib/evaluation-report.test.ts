import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

/**
 * Behavior reports, checked without a model call.
 *
 * A report is what a skill change's live runs leave in the repository once the
 * runner's ignored results have gone with their worktree (`docs/behavior-reports.md`).
 * These check that it copies the evidence faithfully — every turn verbatim, every
 * Tonight call with its arguments, the saved state in words — and that it never makes
 * a PASS or a FAIL up: what was never run or never sent is UNTESTED, and everything
 * else is left for a person to score. The report is `evaluation/report.mjs`; the
 * regression set is the M5 set's smoke selection on `plugin-skills`.
 */

type Scenario = { fixture: string; prompt: string; then?: string | string[]; family: string; sources: string[]; smoke?: string[] };
type Turn = { key: string; sent: string | null; notSent: string | null; calls: [number, number] | null; failure: string | null; answer: string };
type Parsed = { header: Record<string, string>; turns: Turn[] };
type Status = { status: string; untestedFrom: number | null; reason: string | null };
type Run = Parsed & { phase: string; file: string; key: string };
type Report = {
  TO_SCORE: string;
  scenarioKey: (scenario: Scenario) => string;
  regressionSet: (scenarios: Scenario[]) => string[];
  parseArtifact: (text: string) => Parsed;
  runStatus: (run: Parsed) => Status;
  statusLine: (status: Status) => string;
  loadRuns: (dir: string, phase: "before" | "after") => Run[];
  code: (text: string) => string;
  renderCall: (entry: object, number: number) => string;
  stateChanges: (before: object, after: object) => string[];
  startingState: (snapshot: object | null) => string[];
  report: (options: {
    title: string;
    after: Run[];
    before?: Run[];
    scenarios: Scenario[];
    targeted?: string[];
    fixtureTitle?: (set: string, id: string) => string | null;
  }) => string;
};
type Lean = { DEFAULT_BUDGET: number; plannedCalls: (work: { scenario: Scenario; index: number }[]) => number };

const EVALUATION = new URL("../../skills/tonight-recommend/evaluation/", import.meta.url);
const report = (await import(new URL("report.mjs", EVALUATION).href)) as Report;
const lean = (await import(new URL("lean.mjs", EVALUATION).href)) as Lean;
const runner = readFileSync(new URL("m5/run.mjs", EVALUATION), "utf8");
const scenarios = JSON.parse(readFileSync(new URL("m5/scenarios.json", EVALUATION), "utf8")) as Scenario[];

const ORDINAL = ["First", "Second", "Third"];

type Spoken = { key: string; sent: string | null; failure?: string; calls: [number, number]; answer: string };

/** An artifact exactly as `artifact()` in `m5/run.mjs` lays one out — pinned to it below. */
function artifact(header: Record<string, string>, turns: Spoken[]): string {
  const later = turns.slice(1);
  const asked = later
    .map((one, at) => `\n## ${ORDINAL[at + 1]} turn — \`${one.key}\`\n\n> ${one.sent ?? `(not sent: ${one.failure})`}\n`)
    .join("");
  const answered = later.map((one, at) => `\n## ${ORDINAL[at + 1]} answer\n\n${one.answer}\n`).join("");
  const bounds = turns
    .map((one, at) => {
      const [from, to] = one.calls;
      const made = to > from ? `calls ${from + 1}–${to}` : "no calls";
      return `- ${ORDINAL[at]} turn: ${made}${one.failure ? ` (failed: ${one.failure})` : ""}`;
    })
    .join("\n");
  const first = turns[0]!;
  return `---
${Object.entries(header).map(([key, value]) => `${key}: ${value}`).join("\n")}
---

## Prompt

> ${first.sent ?? `(not sent: ${first.failure})`}
${asked}
## Tonight MCP transcript

Read from the proxy log named above; this is a reading of it, not a substitute for it.

1. \`record_verdict\` → ok (200)

Which turn made which calls:

${bounds}

## Answer

${first.answer}
${answered}`;
}

const header = (fields: Record<string, string>) => ({
  fixture: "m5-06-bloom-saved",
  prompt: "bloom-clever",
  then: "pick-title-one, like-bloom-tonight",
  family: "kept-new-vibe",
  run: "01",
  side: "m5",
  source: "plugin-skills",
  skills: "tonight-recommend, tonight-vibes",
  host: "claude -p (Claude Code CLI, --bare), instructions as the system prompt",
  instructions: "d1e6c401",
  target: "adc2b20",
  model_resolved: "claude-sonnet-5",
  tonight_transcript: "logs/run.jsonl",
  state_before: "sha256:aaaa",
  state_before_file: "snapshots/run.json",
  state_after: "sha256:bbbb",
  state_after_file: "snapshots/run.after.json",
  state_changed: "yes",
  failed: "no",
  recorded: "2026-10-31T10:00:00.000Z",
  ...fields,
});

const ANSWER = "I'd make **Sharp Company**.\n\n## A heading of its own\n\n> and a quote of its own";

test("an artifact reads back turn by turn: what was sent, which calls it made, and the answer verbatim", () => {
  const parsed = report.parseArtifact(
    artifact(header({ failed: "no unambiguous title 1 to pick" }), [
      { key: "bloom-clever", sent: "I liked The Brothers Bloom because clever characters do smart things.", calls: [0, 2], answer: ANSWER },
      { key: "pick-title-one", sent: "Sharp Company", calls: [2, 3], answer: "Done." },
      { key: "like-bloom-tonight", sent: null, failure: "no unambiguous title 1 to pick", calls: [3, 3], answer: "" },
    ]),
  );
  assert.equal(parsed.header.fixture, "m5-06-bloom-saved");
  assert.equal(parsed.header.host, "claude -p (Claude Code CLI, --bare), instructions as the system prompt");
  assert.deepEqual(
    parsed.turns.map((turn) => [turn.key, turn.sent, turn.calls, turn.failure]),
    [
      ["bloom-clever", "I liked The Brothers Bloom because clever characters do smart things.", [0, 2], null],
      ["pick-title-one", "Sharp Company", [2, 3], null],
      ["like-bloom-tonight", null, null, "no unambiguous title 1 to pick"],
    ],
  );
  // An answer's own heading is no part of the artifact's structure.
  assert.equal(parsed.turns[0]!.answer, ANSWER);
  assert.equal(parsed.turns[1]!.answer, "Done.");
  assert.equal(parsed.turns[2]!.answer, "");
  assert.equal(parsed.turns[2]!.notSent, "no unambiguous title 1 to pick");
  assert.throws(() => report.parseArtifact("no header here"), /not a run artifact/);
});

test("nothing is a PASS or a FAIL until a person says so; what never ran or was never sent is UNTESTED", () => {
  const turn = (failure: string | null): Turn => ({ key: "k", sent: "s", notSent: null, calls: [0, 0], failure, answer: "" });
  const status = (failed: string | undefined, turns: Turn[]) =>
    report.statusLine(report.runStatus({ header: failed === undefined ? {} : { failed }, turns }));

  assert.equal(status("no", [turn(null), turn(null)]), report.TO_SCORE);
  assert.equal(
    status("no unambiguous title 1 to pick", [turn(null), turn(null), turn("no unambiguous title 1 to pick")]),
    "TO SCORE (turns 1–2); UNTESTED from turn 3 — no unambiguous title 1 to pick",
  );
  assert.equal(status("did not resume", [turn(null), turn("did not resume")]), "TO SCORE (turn 1); UNTESTED from turn 2 — did not resume");
  assert.equal(status("exit 1 — usage limit", [turn("exit 1 — usage limit")]), "UNTESTED — exit 1 — usage limit");
  // A failure that is no turn's — a run that straddled midnight — leaves nothing scorable.
  assert.equal(status("void: started on 2026-10-30, ended on 2026-10-31 — rerun", [turn(null)]), "UNTESTED — void: started on 2026-10-30, ended on 2026-10-31 — rerun");
  // A void run stays void, whatever its turns did.
  assert.equal(
    status("void: started on 2026-10-30, ended on 2026-10-31 — rerun", [turn(null), turn("did not resume")]),
    "UNTESTED — void: started on 2026-10-30, ended on 2026-10-31 — rerun",
  );
  assert.equal(status(undefined, [turn(null)]), "UNTESTED — the artifact records no outcome");
});

test("a Tonight call is its arguments as sent and the gist of its answer, on one line whatever it holds", () => {
  const next = "Nothing was written. If `movie.viewing` is want-to-see, move it.\n".repeat(10);
  const refused = report.renderCall(
    {
      tool: "record_verdict",
      arguments: { film: { title: "The Brothers Bloom", year: 2008 }, said: { about: "judgement", judgement: "liked" } },
      status: 200,
      result: { isError: true, content: [{ type: "text", text: "{…}" }], structuredContent: { saved: false, reason: "vibe_required", next } },
    },
    1,
  );
  assert.ok(refused.startsWith('1. `record_verdict` `{"film":{"title":"The Brothers Bloom","year":2008},"said":{"about":"judgement","judgement":"liked"}}` → '));
  assert.match(refused, /refused — saved: false · reason: "vibe_required" · next: "Nothing was written\./);
  assert.match(refused, new RegExp(`\\(${next.length} chars\\)`));
  assert.ok(refused.includes("→ `` refused"), "an answer holding backticks is fenced with two");
  assert.ok(!refused.includes("\n"));

  const read = report.renderCall({ tool: "get_taste", arguments: {}, status: 200, result: { structuredContent: { genres: [1, 2], vibes: [{}, {}, {}, {}] } } }, 2);
  assert.equal(read, "2. `get_taste` `{}` → `genres: [1,2] · vibes: 4 items`");

  // Bookkeeping is dropped from an answer, never what it said.
  const kept = report.renderCall(
    { tool: "record_verdict", arguments: {}, status: 200, result: { structuredContent: { verdict: { film: { title: "Paterson", year: 2016 }, at: "2026-10-31T10:00:00Z", ref: "x" } } } },
    3,
  );
  assert.equal(kept, '3. `record_verdict` `{}` → `verdict: {"film":{"title":"Paterson","year":2016}}`');

  assert.equal(report.renderCall({ tool: "get_taste", arguments: {}, status: 500 }, 4), "4. `get_taste` `{}` → `HTTP 500`");
  assert.equal(report.code("a`b"), "`` a`b ``");
});

const at = (stamp: string) => ({ createdAt: stamp, updatedAt: stamp });
const snapshot = (stamp: string, taste: object, memory: object) => ({ taste, memory: { held: [], remembered: [], ...memory, coverage: {} }, stamp });
const verdict = (title: string, year: number, judgement: string, because: string | null, stamp: string, placement = "held") => ({
  placement,
  of: "verdict",
  act: { said: "verdict", claimant: "user", film: { title, year }, assertion: { about: "judgement", judgement, because }, told: "volunteered", at: stamp, ref: `${title}-${stamp}` },
  basis: { kind: "said", at: stamp },
  handle: { by: "ref", ref: `${title}-${stamp}` },
});

const BEFORE = snapshot(
  "t0",
  {
    genres: [{ name: "Heist", instruction: "I like a plan.", ...at("t0") }],
    vibes: [{ name: "Champagne & Blueprints", instruction: "Glamorous capers.", genres: ["Heist"], core: { title: "Ocean's Eleven", year: 2001 }, movies: [{ title: "Ocean's Eleven", year: 2001 }], ...at("t0") }],
    movies: [
      { title: "Ocean's Eleven", year: 2001, imdbId: null, viewing: "seen-before", vibes: ["Champagne & Blueprints"], ...at("t0") },
      { title: "The Brothers Bloom", year: 2008, imdbId: null, viewing: "want-to-see", vibes: ["Champagne & Blueprints"], ...at("t0") },
    ],
  },
  { held: [{ placement: "held", of: "genre", name: "Heist" }, verdict("Ocean's Eleven", 2001, "loved", null, "t0")] },
);

test("what a run changed is said in plain words, and bookkeeping is never a change", () => {
  const after = snapshot(
    "t1",
    {
      genres: [
        { name: "Heist", instruction: "I like a plan.", ...at("t1") },
        { name: "Clever Minds", instruction: "Intelligence drives it.", ...at("t1") },
      ],
      vibes: [
        { name: "Champagne & Blueprints", instruction: "Glamorous capers.", genres: ["Heist"], core: { title: "Ocean's Eleven", year: 2001 }, movies: [{ title: "Ocean's Eleven", year: 2001 }, { title: "The Brothers Bloom", year: 2008 }], ...at("t1") },
        { name: "Sharp Company", instruction: "A step ahead.", genres: ["Clever Minds"], core: { title: "The Brothers Bloom", year: 2008 }, movies: [{ title: "The Brothers Bloom", year: 2008 }], ...at("t1") },
      ],
      movies: [
        { title: "Ocean's Eleven", year: 2001, imdbId: null, viewing: "seen-before", vibes: ["Champagne & Blueprints"], ...at("t1") },
        { title: "The Brothers Bloom", year: 2008, imdbId: null, viewing: "seen-before", vibes: ["Champagne & Blueprints", "Sharp Company"], ...at("t1") },
      ],
    },
    { held: [{ placement: "held", of: "genre", name: "Heist" }, verdict("Ocean's Eleven", 2001, "loved", null, "t1"), verdict("The Brothers Bloom", 2008, "liked", "clever characters do smart things", "t1")] },
  );
  assert.deepEqual(report.stateChanges(BEFORE, after), [
    'Genre added: **Clever Minds** — instruction "Intelligence drives it."',
    "Vibe changed: **Champagne & Blueprints** — films + The Brothers Bloom (2008)",
    'Vibe added: **Sharp Company** — instruction "A step ahead." — Genres Clever Minds — core The Brothers Bloom (2008) — films The Brothers Bloom (2008)',
    "Film changed: The Brothers Bloom (2008) — viewing want-to-see → seen-before; Vibes + Sharp Company",
    'Now stands: The Brothers Bloom (2008) — liked, because "clever characters do smart things" (volunteered)',
  ]);

  // The same state read again later: every timestamp and reference differs, nothing changed.
  const reread = JSON.parse(JSON.stringify(BEFORE).replaceAll('"t0"', '"t9"').replaceAll("-t0", "-t9"));
  assert.deepEqual(report.stateChanges(BEFORE, reread), ["No change."]);

  // Taken away: the Vibe and its film go, and the loved no longer stands but is remembered.
  const emptied = snapshot(
    "t2",
    { genres: [{ name: "Heist", instruction: "I like a plan.", ...at("t2") }], vibes: [], movies: [] },
    { held: [{ placement: "held", of: "genre", name: "Heist" }], remembered: [verdict("Ocean's Eleven", 2001, "loved", null, "t0", "remembered")] },
  );
  assert.deepEqual(report.stateChanges(BEFORE, emptied), [
    'Vibe removed: **Champagne & Blueprints** — instruction "Glamorous capers." — Genres Heist — core Ocean\'s Eleven (2001) — films Ocean\'s Eleven (2001)',
    "Film removed: Ocean's Eleven (2001) — viewing seen-before — Vibes Champagne & Blueprints",
    "Film removed: The Brothers Bloom (2008) — viewing want-to-see — Vibes Champagne & Blueprints",
    "No longer stands: Ocean's Eleven (2001) — loved (volunteered)",
    "Remembered: Ocean's Eleven (2001) — loved (volunteered)",
  ]);
});

test("where a run started is said in words: every Vibe with its core, the Genres, films and what stands", () => {
  assert.deepEqual(report.startingState(BEFORE), [
    'Vibe **Champagne & Blueprints** — instruction "Glamorous capers." — Genres Heist — core Ocean\'s Eleven (2001) — films Ocean\'s Eleven (2001)',
    'Genres: **Heist** "I like a plan."',
    "Films: Ocean's Eleven (2001) seen-before · The Brothers Bloom (2008) want-to-see",
    "Standing: Ocean's Eleven (2001) — loved (volunteered)",
    "Remembered: nothing",
  ]);
  assert.deepEqual(report.startingState(null), ["No snapshot on disk."]);
});

test("the regression set is fixed: six plugin-skills scenarios, none needing an operator's seed, one run each inside the default budget", () => {
  const set = report.regressionSet(scenarios);
  assert.deepEqual(set, [
    "m5-02-empty__what-tonight",
    "m5-02-empty__hi__then-three-films",
    "m5-05-partial-fit__bloom-clever__then-yes",
    "m5-05-partial-fit__bloom-clever__then-no",
    "m5-06-bloom-saved__bloom-clever__then-pick-title-one__then-like-bloom-tonight",
    "m5-04-reading__liked-bloom",
  ]);
  const chosen = scenarios.filter((one) => set.includes(report.scenarioKey(one)));
  for (const one of chosen) {
    assert.ok(one.sources.includes("plugin-skills"), `${report.scenarioKey(one)} does not run on plugin-skills`);
    const fixture = JSON.parse(readFileSync(new URL(`m5/fixtures/${one.fixture}.json`, EVALUATION), "utf8")) as { seed?: string };
    assert.equal(fixture.seed, undefined, `${one.fixture} is seeded by an operator and is skipped by a normal run`);
  }
  // `run.mjs --source plugin-skills --smoke` records it, one run each, without --budget.
  assert.ok(lean.plannedCalls(chosen.map((scenario) => ({ scenario, index: 1 }))) <= lean.DEFAULT_BUDGET);
  // Nothing in the M5 set is smoke anywhere else, so --smoke means the regression set.
  assert.deepEqual(scenarios.flatMap((one) => one.smoke ?? []).filter((source) => source !== "plugin-skills"), []);
});

test("a report copies a change's runs out of the runner's results, before and after, and invents no score", () => {
  const root = mkdtempSync(join(tmpdir(), "tonight-report-"));
  try {
    const write = (dir: string, name: string, text: string) => {
      mkdirSync(join(dir, "runs", "logs"), { recursive: true });
      mkdirSync(join(dir, "runs", "snapshots"), { recursive: true });
      writeFileSync(join(dir, "runs", name), text);
    };
    const record = (dir: string, stem: string, fields: Record<string, string>, turns: Spoken[], calls: object[]) => {
      write(dir, `${stem}.md`, artifact(header({ ...fields, tonight_transcript: `logs/${stem}.jsonl`, state_before_file: `snapshots/${stem}.json`, state_after_file: `snapshots/${stem}.after.json` }), turns));
      writeFileSync(join(dir, "runs", "logs", `${stem}.jsonl`), [{ method: "tools/list", discovered: 21 }, ...calls].map((one) => `${JSON.stringify(one)}\n`).join(""));
      writeFileSync(join(dir, "runs", "snapshots", `${stem}.json`), JSON.stringify(BEFORE));
      writeFileSync(join(dir, "runs", "snapshots", `${stem}.after.json`), JSON.stringify(BEFORE));
    };
    const liked = { fixture: "m5-05-partial-fit", prompt: "liked-bloom", then: "none", family: "liked-fits" };
    const call = { method: "tools/call", tool: "record_verdict", arguments: { film: { title: "The Brothers Bloom", year: 2008 } }, status: 200, result: { structuredContent: { saved: false, reason: "vibe_required" } } };
    const answer = "That's your **Champagne & Blueprints** evening.\n\nWhich feels right?";

    const after = join(root, "m5-plugin-skills-0000aaaa-1111111");
    record(after, "m5-05-partial-fit__liked-bloom__01", { ...liked, instructions: "0000aaaa", target: "1111111" }, [{ key: "liked-bloom", sent: "I liked The Brothers Bloom.", calls: [0, 1], answer }], [call]);
    record(after, "m5-02-empty__what-tonight__01", { fixture: "m5-02-empty", prompt: "what-tonight", then: "none", family: "first-films", instructions: "0000aaaa", target: "1111111", failed: "exit 1 — usage limit" }, [{ key: "what-tonight", sent: "What should I watch tonight?", failure: "exit 1 — usage limit", calls: [0, 0], answer: "" }], []);
    const before = join(root, "m5-plugin-skills-2222bbbb-0000000-harness-1111111");
    record(before, "m5-05-partial-fit__liked-bloom__01", { ...liked, instructions: "2222bbbb", target: "0000000", harness: "1111111" }, [{ key: "liked-bloom", sent: "I liked The Brothers Bloom.", calls: [0, 1], answer: "Before." }], [call]);
    assert.ok(existsSync(join(after, "runs", "logs", "m5-05-partial-fit__liked-bloom__01.jsonl")));

    const text = report.report({
      title: "Sample change",
      after: report.loadRuns(after, "after"),
      before: report.loadRuns(join(before, "runs"), "before"),
      scenarios,
      fixtureTitle: (set, id) => (set === "m5" && id === "m5-05-partial-fit" ? "A Vibe a liked film fits" : null),
    });

    assert.match(text, /^# Behavior report — Sample change\n/);
    assert.match(text, /\| After \| plugin-skills `0000aaaa` \(tonight-recommend, tonight-vibes\) at `1111111` \|/);
    assert.match(text, /\| Before \| plugin-skills `2222bbbb` \(tonight-recommend, tonight-vibes\) at `0000000`, harness `1111111` \|/);
    assert.match(text, /\| Live runs \| 2 after, 1 before; 3 turns sent to the model; recorded 2026-10-31 \|/);
    // The results: before beside after, a run that never got going UNTESTED, the rest of the set not run.
    assert.ok(text.includes("| before | plugin-skills | `m5-05-partial-fit__liked-bloom` | liked-fits | 1 | TO SCORE |"));
    assert.ok(text.includes("| targeted | plugin-skills | `m5-05-partial-fit__liked-bloom` | liked-fits | 1 | TO SCORE |"));
    assert.ok(text.includes("| regression | plugin-skills | `m5-02-empty__what-tonight` | first-films | 1 | UNTESTED |"));
    for (const key of report.regressionSet(scenarios).slice(1)) {
      assert.ok(text.includes(`| regression | plugin-skills | \`${key}\` |`) && text.includes(`\`${key}\` | ${scenarios.find((one) => report.scenarioKey(one) === key)!.family} | 0 | UNTESTED — not run |`), key);
    }
    assert.ok(text.indexOf("### Before the change — `m5-05-partial-fit__liked-bloom`") < text.indexOf("### Targeted — `m5-05-partial-fit__liked-bloom`"));
    // The evidence: verbatim words, the call as made, the state in words, where it came from.
    assert.ok(text.includes("**User**\n\n> I liked The Brothers Bloom.\n"));
    assert.ok(text.includes("**Assistant**\n\n> That's your **Champagne & Blueprints** evening.\n>\n> Which feels right?\n"));
    assert.ok(text.includes('1. `record_verdict` `{"film":{"title":"The Brothers Bloom","year":2008}}` → `saved: false · reason: "vibe_required"`'));
    assert.ok(text.includes("**Saved state** (sha256:aaaa → sha256:bbbb)\n\n- No change.\n"));
    assert.ok(text.includes("Fixture `m5-05-partial-fit` — *A Vibe a liked film fits*."));
    assert.ok(text.includes("Starting state: as under *Before the change — `m5-05-partial-fit__liked-bloom` on plugin-skills*."));
    assert.ok(text.includes("`m5-plugin-skills-0000aaaa-1111111/runs/m5-05-partial-fit__liked-bloom__01.md`"));
    assert.ok(text.includes("#### Run 01 — UNTESTED — exit 1 — usage limit"));
    // A person scores it: no run heading or result cell says PASS or FAIL.
    const scored = text.split("\n").filter((line) => line.startsWith("#### Run") || line.startsWith("| "));
    assert.deepEqual(scored.filter((line) => /\b(PASS|FAIL)\b/.test(line)), []);
    assert.ok(!text.includes(root), "no local path is written into a committed report");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the runner still writes every heading the report reads", () => {
  for (const part of [
    "## Prompt\n\n> ${result.first.sent ?? `(not sent: ${result.first.failure})`}",
    "`\\n## ${ORDINAL[at + 1]} turn — \\`${one.key}\\`\\n\\n> ${one.sent ?? `(not sent: ${one.failure})`}\\n`",
    "## Tonight MCP transcript",
    "Which turn made which calls:",
    "const made = to > from ? `calls ${from + 1}–${to}` : \"no calls\";",
    "`- ${ORDINAL[at]} turn: ${made}${one.failure ? ` (failed: ${one.failure})` : \"\"}`",
    "## Answer\n\n${result.first.answer}\n${answered}",
    "`\\n## ${ORDINAL[at + 1]} answer\\n\\n${one.answer}\\n`",
    "failed: ${failure ?? \"no\"}",
  ]) {
    assert.ok(runner.includes(part), `m5/run.mjs no longer writes: ${part}`);
  }
});
