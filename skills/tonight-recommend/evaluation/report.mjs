/**
 * A behavior report: the live runs one skill change was checked with, as one Markdown
 * file a person reads in five minutes and commits beside the change
 * (`docs/behavior-reports.md`).
 *
 *   node evaluation/report.mjs --title "Vibe offer copy" --out docs/work/vibe-offer-copy/BEHAVIOR.md \
 *     m5/results/<after-dir> [m5/results/<after-dir> …]
 *   … --before m5/results/<baseline-dir>     runs of the instructions before the change (repeatable)
 *   … --targeted <key>[,<key>]                scenarios the change is about, where they are also
 *                                             in the regression set
 *
 * It reads what `m5/run.mjs` already wrote — each run's artifact, its proxy log and its
 * two snapshots — and nothing else. The runner's results are ignored by git and go
 * with the worktree they were recorded in; this copies what a reader needs out of
 * them into a file that is committed: every turn verbatim, every Tonight call with
 * its arguments and the gist of its answer, and what the saved state became, in words.
 *
 * It calls no model and scores nothing. Whether a run passed is a person's reading
 * against the rubric, so every run it can read is written `TO SCORE`, and a person
 * replaces that with PASS or FAIL. What it does decide is mechanical: a run that never
 * got going, a turn that was never sent, and a regression scenario with no run at
 * all are **UNTESTED** — never a PASS, and never a FAIL of what they would have shown.
 *
 * The regression set is the M5 set's smoke selection on `plugin-skills`
 * (`m5/scenarios.json`), so `m5/run.mjs --source plugin-skills --smoke` is what
 * records it, one run each, inside the default budget.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { followUps, select } from "./lean.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** What a person replaces with PASS or FAIL. Nothing here ever writes either. */
export const TO_SCORE = "TO SCORE";

const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];

/** A scenario's key, as `m5/run.mjs` names it: fixture, prompt, then every follow-up. */
export const scenarioKey = (scenario) =>
  `${scenario.fixture}__${scenario.prompt}${followUps(scenario).map((then) => `__then-${then}`).join("")}`;

/** The fixed regression set: the M5 scenarios marked smoke on `plugin-skills`, by key. */
export const regressionSet = (scenarios) =>
  select(scenarios, { source: "plugin-skills", smoke: true }).map(scenarioKey);

/* ------------------------------------------------------------- reading a run */

/**
 * One run artifact, read back: its header, and its turns in order — what each sent,
 * or why it was not sent; which Tonight calls it made; and what came back, verbatim.
 *
 * It reads the shape `artifact()` in `m5/run.mjs` writes, and `evaluation-report.test.ts`
 * pins the runner to the headings read here. An answer may hold headings of its own,
 * so answers are split only at the runner's exact `## <Ordinal> answer` headings, in order.
 */
export function parseArtifact(text) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error("not a run artifact: no header");
  const header = {};
  for (const line of match[1].split("\n")) {
    const at = line.indexOf(": ");
    if (at > 0) header[line.slice(0, at)] = line.slice(at + 2);
  }
  const body = match[2];
  const transcriptAt = body.indexOf("\n## Tonight MCP transcript\n");
  const answerAt = body.indexOf("\n## Answer\n\n", Math.max(transcriptAt, 0));
  if (transcriptAt < 0 || answerAt < 0) throw new Error("not a run artifact: no transcript or answer section");
  const asked = body.slice(0, transcriptAt);
  const transcript = body.slice(transcriptAt, answerAt);

  const sent = [/^## Prompt\n\n> (.*)$/m.exec(asked)?.[1] ?? ""];
  const keys = [header.prompt];
  for (const turn of asked.matchAll(/^## \w+ turn — `([^`]+)`\n\n> (.*)$/gm)) {
    keys.push(turn[1]);
    sent.push(turn[2]);
  }

  const bounds = [...transcript.matchAll(/^- \w+ turn: (?:calls (\d+)–(\d+)|no calls)(?: \(failed: (.*)\))?$/gm)].map((line) => ({
    calls: line[1] === undefined ? null : [Number(line[1]) - 1, Number(line[2])],
    failure: line[3] ?? null,
  }));

  // Answers: the first after `## Answer`, each later one after its own heading.
  const answers = [];
  let rest = body.slice(answerAt + "\n## Answer\n\n".length);
  for (let at = 1; at < Math.max(bounds.length, sent.length); at += 1) {
    const heading = `\n\n## ${ORDINALS[at]} answer\n\n`;
    const next = rest.indexOf(heading);
    if (next < 0) break;
    answers.push(rest.slice(0, next));
    rest = rest.slice(next + heading.length);
  }
  answers.push(rest);

  const turns = sent.map((said, at) => {
    const notSent = /^\(not sent: (.*)\)$/.exec(said);
    return {
      key: keys[at],
      sent: notSent ? null : said,
      notSent: notSent ? notSent[1] : null,
      calls: bounds[at]?.calls ?? null,
      failure: bounds[at]?.failure ?? (notSent ? notSent[1] : null),
      answer: (answers[at] ?? "").trimEnd(),
    };
  });
  return { header, turns };
}

/**
 * What can be scored in a run. Only `failed: no` is a whole run to score. A run whose
 * failure is a later turn's is scored up to that turn and UNTESTED from it; one that
 * failed on its first turn, or for a reason no turn holds — a straddled midnight,
 * which voids the run whatever its turns did, the wrong tool catalog, an artifact
 * without the field — is UNTESTED as a whole.
 */
export function runStatus(run) {
  if (run.header.failed === "no") return { status: TO_SCORE, untestedFrom: null, reason: null };
  const at = run.turns.findIndex((turn) => turn.failure !== null);
  if (at > 0 && run.turns[at].failure === run.header.failed) return { status: TO_SCORE, untestedFrom: at + 1, reason: run.header.failed };
  return { status: "UNTESTED", untestedFrom: 1, reason: run.header.failed ?? "the artifact records no outcome" };
}

/** A status as the report writes it. */
export function statusLine({ status, untestedFrom, reason }) {
  if (status === "UNTESTED") return `UNTESTED — ${reason}`;
  if (untestedFrom === null) return status;
  return `${status} (turn${untestedFrom > 2 ? `s 1–${untestedFrom - 1}` : " 1"}); UNTESTED from turn ${untestedFrom} — ${reason}`;
}

/** A run's follow-up keys, as its header lists them. */
const thens = (header) => (!header.then || header.then === "none" ? [] : header.then.split(", "));

/** A results directory's runs, each with its proxy log and its two snapshots where they exist. */
export function loadRuns(dir, phase) {
  const runs = existsSync(join(dir, "runs")) ? join(dir, "runs") : dir;
  const label = basename(runs) === "runs" ? basename(dirname(runs)) : basename(runs);
  const json = (file) => (file && existsSync(join(runs, file)) ? JSON.parse(readFileSync(join(runs, file), "utf8")) : null);
  return readdirSync(runs)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const run = parseArtifact(readFileSync(join(runs, name), "utf8"));
      const { header } = run;
      const log = header.tonight_transcript && existsSync(join(runs, header.tonight_transcript))
        ? readFileSync(join(runs, header.tonight_transcript), "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line))
        : null;
      return {
        ...run,
        phase,
        file: `${label}/runs/${name}`,
        key: scenarioKey({ fixture: header.fixture, prompt: header.prompt, then: thens(header) }),
        calls: log === null ? null : log.filter((entry) => entry.tool),
        before: json(header.state_before_file),
        after: json(header.state_after_file),
      };
    });
}

/* ------------------------------------------------------------ Tonight calls */

/** Text as one inline code span, whatever backticks it holds. */
export function code(raw) {
  const text = raw.replace(/\s*\n\s*/g, " ");
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = "`".repeat(longest + 1);
  return longest ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

const clip = (text, most) => (text.length > most ? `${text.slice(0, most)}… (${text.length} chars)` : text);
const scalar = (value) => value === null || ["string", "number", "boolean"].includes(typeof value);
const textOf = (result) => (Array.isArray(result?.content) ? result.content.map((one) => one.text ?? "").join(" ") : String(result ?? ""));

/** One value of an answer, short: a long string cut, a list counted, an object as JSON without its bookkeeping. */
function gist(value) {
  if (Array.isArray(value)) return value.length <= 3 && value.every(scalar) ? JSON.stringify(value) : `${value.length} items`;
  if (typeof value === "string") return value.length > 160 ? `${JSON.stringify(value.slice(0, 120))}… (${value.length} chars)` : JSON.stringify(value);
  if (value && typeof value === "object") return clip(JSON.stringify(stripped(value)), 300);
  return String(value);
}

/** What a call's answer said, in one line: each field of its structured answer, or its text. */
function outcome(entry) {
  if (entry.unreachable) return `unreachable: ${entry.unreachable}`;
  if (entry.failed) return `refused by the evaluation proxy (simulated): ${clip(textOf(entry.result), 300)}`;
  if (entry.status !== undefined && entry.status !== 200) return `HTTP ${entry.status}`;
  const data = entry.result?.structuredContent;
  const said =
    data && typeof data === "object"
      ? Object.entries(data).map(([key, value]) => `${key}: ${gist(value)}`).join(" · ") || "empty"
      : clip(textOf(entry.result) || "empty", 300);
  return entry.result?.isError ? `refused — ${said}` : said;
}

/** One Tonight call: the tool, its arguments as sent, and the gist of what came back. */
export function renderCall(entry, number) {
  return `${number}. \`${entry.tool}\` ${code(clip(JSON.stringify(entry.arguments ?? {}), 600))} → ${code(outcome(entry))}`;
}

/* ------------------------------------------------------------- saved state */

/** Bookkeeping that differs between two reads of the same thing. */
const NOISE = new Set(["createdAt", "updatedAt", "at", "ref", "savedAt", "changedAt"]);

/** A value with its bookkeeping taken off, at every depth; `sorted` puts each object's keys in order. */
function stripped(value, sorted = false) {
  if (Array.isArray(value)) return value.map((one) => stripped(one, sorted));
  if (!value || typeof value !== "object") return value;
  const keys = Object.keys(value).filter((key) => !NOISE.has(key));
  return Object.fromEntries((sorted ? keys.sort() : keys).map((key) => [key, stripped(value[key], sorted)]));
}

/** A value without its bookkeeping, as one string two equal values share. */
const canonical = (value) => JSON.stringify(stripped(value, true));

const film = (one) => `${one.title} (${one.year})`;

/** A field's value in words: films by title and year, lists joined, nothing as "none". */
function words(value, quoted = false) {
  if (value === null || value === undefined) return "none";
  if (Array.isArray(value)) return value.length ? value.map((one) => words(one)).join(", ") : "none";
  if (typeof value === "object" && "title" in value && "year" in value) return film(value);
  if (typeof value === "object") return canonical(value);
  return quoted ? `"${value}"` : String(value);
}

/**
 * What somebody said about a film: a verdict, a refusal or a taking-back as memory
 * holds it, or a standing verdict as the taste read gives it.
 */
function said(root) {
  const act = root.act ?? root;
  const subject = act.film ?? (act.title ? act : null);
  const about = subject ? `${film(subject)} — ` : "";
  const assertion =
    act.assertion ?? (act.judgement ? { about: "judgement", judgement: act.judgement, ...(act.because ? { because: act.because } : {}) } : null);
  if (!assertion) return `${about}${act.said ?? "said"}`;
  const parts = Object.entries(assertion)
    .filter(([key, value]) => key !== "about" && !NOISE.has(key) && value !== null && value !== undefined)
    .map(([key, value]) => (key === "judgement" ? value : `${key} ${words(value, typeof value === "string" && /\s/.test(value))}`));
  return `${about}${assertion.about === "judgement" ? "" : `${assertion.about}: `}${parts.join(", ")}${act.told ? ` (${act.told})` : ""}`;
}

/** The three kinds the taste read holds, each keyed, with the fields worth saying back. */
const KINDS = [
  { noun: "Genre", list: "genres", key: (one) => one.name, fields: ["instruction"] },
  { noun: "Vibe", list: "vibes", key: (one) => one.name, fields: ["instruction", "genres", "core", "movies"] },
  { noun: "Film", list: "movies", key: film, fields: ["viewing", "vibes", "imdbId"] },
];
const LABEL = { instruction: "instruction", genres: "Genres", core: "core", movies: "films", viewing: "viewing", vibes: "Vibes", imdbId: "IMDb" };

/** One thing the taste read holds, in a line. */
function described(kind, one) {
  const name = kind.noun === "Film" ? film(one) : `**${one.name}**`;
  const fields = kind.fields
    .filter((field) => one[field] !== undefined && !(field === "imdbId" && one[field] === null))
    .map((field) => `${LABEL[field]} ${words(one[field], field === "instruction")}`);
  return `${name}${fields.length ? ` — ${fields.join(" — ")}` : ""}`;
}

/** How one field changed, in words: a list by what came and went, anything else as before → after. */
function changed(field, from, to) {
  if (Array.isArray(from) && Array.isArray(to)) {
    const before = new Set(from.map((one) => words(one)));
    const after = new Set(to.map((one) => words(one)));
    const added = [...after].filter((one) => !before.has(one)).map((one) => `+ ${one}`);
    const gone = [...before].filter((one) => !after.has(one)).map((one) => `− ${one}`);
    return `${LABEL[field]} ${[...added, ...gone].join(", ") || "reordered"}`;
  }
  const quoted = field === "instruction";
  return `${LABEL[field]} ${words(from, quoted)} → ${words(to, quoted)}`;
}

/** Memory's roots other than the taste read's three kinds: what was said, and evenings. */
const spoken = (snapshot, placement) =>
  (snapshot?.memory?.[placement] ?? []).filter((root) => !["genre", "vibe", "movie"].includes(root.of));
const spokenLine = (root) => (root.of === "verdict" ? said(root) : `${root.of}: ${clip(canonical(root), 300)}`);

/** Each of `after` not in `before`, counted, so two identical entries are two. */
function missing(from, to) {
  const left = new Map();
  for (const one of from) left.set(canonical(one), (left.get(canonical(one)) ?? 0) + 1);
  return to.filter((one) => {
    const count = left.get(canonical(one)) ?? 0;
    if (count === 0) return true;
    left.set(canonical(one), count - 1);
    return false;
  });
}

/**
 * What a run changed in the saved state, in plain words, read from its two snapshots:
 * Genres, Vibes and films by name, each field that changed said as it changed, and
 * what was said and remembered as it came and went. Timestamps and references are
 * bookkeeping and never a change.
 */
export function stateChanges(before, after) {
  const lines = [];
  for (const kind of KINDS) {
    const from = new Map((before?.taste?.[kind.list] ?? []).map((one) => [kind.key(one), one]));
    const to = new Map((after?.taste?.[kind.list] ?? []).map((one) => [kind.key(one), one]));
    for (const [key, one] of to) {
      if (!from.has(key)) {
        lines.push(`${kind.noun} added: ${described(kind, one)}`);
        continue;
      }
      const old = from.get(key);
      const differ = kind.fields.filter((field) => canonical(old[field]) !== canonical(one[field]));
      if (differ.length) {
        lines.push(`${kind.noun} changed: ${kind.noun === "Film" ? key : `**${key}**`} — ${differ.map((field) => changed(field, old[field], one[field])).join("; ")}`);
      }
    }
    for (const [key, one] of from) if (!to.has(key)) lines.push(`${kind.noun} removed: ${described(kind, one)}`);
  }
  const memory = before?.memory !== undefined || after?.memory !== undefined;
  if (memory) {
    for (const root of missing(spoken(before, "held"), spoken(after, "held"))) lines.push(`Now stands: ${spokenLine(root)}`);
    for (const root of missing(spoken(after, "held"), spoken(before, "held"))) lines.push(`No longer stands: ${spokenLine(root)}`);
    for (const root of missing(spoken(before, "remembered"), spoken(after, "remembered"))) lines.push(`Remembered: ${spokenLine(root)}`);
    for (const root of missing(spoken(after, "remembered"), spoken(before, "remembered"))) lines.push(`No longer remembered: ${spokenLine(root)}`);
  } else {
    // A snapshot from a runner that took no memory read: the taste read's verdicts, as they came and went.
    for (const one of missing(before?.taste?.verdicts ?? [], after?.taste?.verdicts ?? [])) lines.push(`Verdict added: ${said(one)}`);
    for (const one of missing(after?.taste?.verdicts ?? [], before?.taste?.verdicts ?? [])) lines.push(`Verdict removed: ${said(one)}`);
  }
  return lines.length ? lines : ["No change."];
}

/** The most of any one kind a starting state lists before it points at the fixture. */
const SHOWN = 12;

/** Where a run started, in plain words: every Vibe, Genre, film, what stands and what is remembered. */
export function startingState(snapshot) {
  if (!snapshot) return ["No snapshot on disk."];
  const capped = (items, noun) =>
    items.length > SHOWN ? [...items.slice(0, SHOWN), `… and ${items.length - SHOWN} more ${noun} — see the fixture`] : items;
  const lines = [];
  const vibes = KINDS[1];
  lines.push(...capped((snapshot.taste?.vibes ?? []).map((one) => `Vibe ${described(vibes, one)}`), "Vibes"));
  const genres = snapshot.taste?.genres ?? [];
  lines.push(`Genres: ${genres.length ? capped(genres.map((one) => `**${one.name}** "${one.instruction}"`), "Genres").join("; ") : "none"}`);
  const films = snapshot.taste?.movies ?? [];
  lines.push(`Films: ${films.length ? capped(films.map((one) => `${film(one)} ${one.viewing}`), "films").join(" · ") : "none"}`);
  const standing = snapshot.memory ? spoken(snapshot, "held").map(spokenLine) : (snapshot.taste?.verdicts ?? []).map(said);
  lines.push(`Standing: ${standing.length ? capped(standing, "entries").join(" · ") : "nothing said"}`);
  if (snapshot.memory) {
    const remembered = spoken(snapshot, "remembered").map(spokenLine);
    lines.push(`Remembered: ${remembered.length ? capped(remembered, "entries").join(" · ") : "nothing"}`);
  }
  return lines;
}

/* ------------------------------------------------------------- the report */

const quote = (text) => (text ? text.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n") : "> (empty)");
const distinct = (values) => [...new Set(values.filter(Boolean))];

/** One run, as a conversation: each turn's words, its Tonight calls, the answer; then the state. */
function renderRun(run) {
  const { header } = run;
  const status = runStatus(run);
  const out = [
    `#### Run ${header.run} — ${statusLine(status)}`,
    "",
    `${code(run.file)} · ${header.model_resolved} · instructions \`${header.instructions}\` at \`${header.target}\` · recorded ${header.recorded}`,
  ];
  run.turns.forEach((turn, at) => {
    const which = at === 0 ? "**User**" : `**User**, turn ${at + 1} (\`${turn.key}\`)`;
    if (turn.sent === null) {
      out.push("", `${which} — not sent: ${turn.notSent}. UNTESTED from here.`);
      return;
    }
    out.push("", which, "", quote(turn.sent));
    if (run.calls !== null && turn.calls !== null) {
      const [from, to] = turn.calls;
      out.push("", `**Tonight** — ${to - from} call${to - from === 1 ? "" : "s"}`, "");
      out.push(...run.calls.slice(from, to).map((entry, n) => renderCall(entry, from + n + 1)));
    } else if (run.calls !== null && turn.calls === null) {
      out.push("", "**Tonight** — no calls");
    }
    if (turn.failure) out.push("", `This turn failed: ${turn.failure}. UNTESTED from here.`);
    out.push("", "**Assistant**", "", quote(turn.answer));
  });
  if (run.calls === null) out.push("", `**Tonight** — the proxy log \`${header.tonight_transcript}\` is not on disk.`);
  const planned = [header.prompt, ...thens(header)];
  const never = planned.slice(run.turns.length);
  if (never.length) out.push("", `Never sent: ${never.map((key) => `\`${key}\``).join(", ")} — UNTESTED.`);
  const digests = `${header.state_before} → ${header.state_after}`;
  if (run.before && run.after) {
    out.push("", `**Saved state** (${digests})`, "", ...stateChanges(run.before, run.after).map((line) => `- ${line}`));
  } else {
    out.push("", `**Saved state** (${digests}): the snapshots are not on disk; \`state_changed: ${header.state_changed}\`.`);
  }
  return out.join("\n");
}

/**
 * A scenario's runs, under the fixture they started from. A starting state already
 * written for an earlier scenario is pointed at rather than written again; `shown`
 * maps each one written to the heading it is under. States are compared as words,
 * since every snapshot's digest differs by its timestamps.
 */
function renderGroup(group, fixtureTitle, shown) {
  const [first] = group.runs;
  const { header } = first;
  const title = fixtureTitle(header.side, header.fixture);
  const heading = `${{ Before: "Before the change", Targeted: "Targeted", Regression: "Regression" }[group.part]} — \`${group.key}\` on ${group.source}`;
  const start = startingState(first.before);
  const out = [
    `### ${heading}`,
    "",
    `Family \`${header.family}\`. Fixture \`${header.fixture}\`${title ? ` — *${title}*` : " (not in this checkout)"}.`,
  ];
  if (shown.has(start.join("\n"))) {
    out.push(`Starting state: as under *${shown.get(start.join("\n"))}*.`);
  } else {
    shown.set(start.join("\n"), heading);
    out.push("Starting state:", "", ...start.map((line) => `- ${line}`));
  }
  const others = group.runs.filter((run) => startingState(run.before).join("\n") !== start.join("\n"));
  if (others.length) out.push("", `Started from another state: ${others.map((run) => `run ${run.header.run} (${run.header.state_before})`).join(", ")}.`);
  for (const run of group.runs) out.push("", renderRun(run));
  return out.join("\n");
}

/** What the runs were recorded with, one line per phase. */
function provenance(runs) {
  const by = distinct(runs.map((run) => `${run.header.source} \`${run.header.instructions}\` (${run.header.skills}) at \`${run.header.target}\`${run.header.harness && run.header.harness !== run.header.target ? `, harness \`${run.header.harness}\`` : ""}`));
  return by.join(" · ") || "none";
}

/**
 * The report. `after` and `before` are loaded runs; `scenarios` is the M5 set, for its
 * regression selection; `targeted` the keys a person named; `fixtureTitle(set, id)`
 * reads a fixture's one-line title, or null.
 */
export function report({ title, after, before = [], scenarios, targeted: named = [], fixtureTitle = () => null }) {
  const regression = regressionSet(scenarios);
  // A scenario recorded before the change is compared, and a comparison is targeted.
  const targeted = distinct([...named, ...before.map((run) => run.key)]);
  const partOf = (run) =>
    run.phase === "before" ? "Before" : targeted.includes(run.key) || !(run.header.source === "plugin-skills" && regression.includes(run.key)) ? "Targeted" : "Regression";
  const groups = [];
  for (const run of [...before, ...after]) {
    const part = partOf(run);
    let group = groups.find((one) => one.part === part && one.key === run.key && one.source === run.header.source);
    if (!group) groups.push((group = { part, key: run.key, source: run.header.source, runs: [] }));
    group.runs.push(run);
  }
  // Targeted scenarios first, each one's runs before the change just ahead of its runs after;
  // then the regression set, in its own order.
  const rank = (group) => (group.part === "Regression" ? 1 : 0);
  groups.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) ? regression.indexOf(a.key) - regression.indexOf(b.key) : a.key.localeCompare(b.key)) ||
      a.source.localeCompare(b.source) ||
      (a.part === "Before" ? -1 : b.part === "Before" ? 1 : 0),
  );

  const all = [...after, ...before];
  const sentTurns = (runs) => runs.reduce((sum, run) => sum + run.turns.filter((turn) => turn.sent !== null).length, 0);
  const recorded = distinct(all.map((run) => run.header.recorded?.slice(0, 10))).sort();
  const hosts = distinct(all.map((run) => `${run.header.model_resolved} — ${run.header.host}`));

  const summary = (group) => {
    const statuses = group.runs.map(runStatus);
    const untested = statuses.filter((one) => one.status === "UNTESTED").length;
    const partly = statuses.filter((one) => one.status === TO_SCORE && one.untestedFrom !== null).length;
    const result =
      untested === statuses.length
        ? "UNTESTED"
        : `${TO_SCORE}${untested ? `; ${untested} UNTESTED` : ""}${partly ? `; ${partly} UNTESTED from a later turn` : ""}`;
    return `| ${group.part.toLowerCase()} | ${group.source} | \`${group.key}\` | ${group.runs[0].header.family} | ${group.runs.length} | ${result} |`;
  };
  // The rest of the regression set: run as a targeted scenario, or not run at all.
  const ran = (key) => after.some((run) => run.key === key && run.header.source === "plugin-skills");
  const family = (key) => scenarios.find((one) => scenarioKey(one) === key)?.family ?? "?";
  const covered = regression
    .filter((key) => targeted.includes(key) && ran(key))
    .map((key) => `| regression | plugin-skills | \`${key}\` | ${family(key)} | — | see targeted |`);
  const notRun = regression
    .filter((key) => !ran(key))
    .map((key) => `| regression | plugin-skills | \`${key}\` | ${family(key)} | 0 | UNTESTED — not run |`);
  const shown = new Map();

  return `# Behavior report — ${title}

Generated by \`skills/tonight-recommend/evaluation/report.mjs\` from the runner's own records
(\`docs/behavior-reports.md\`). Everything under *Live runs* is copied from them, verbatim; a person
writes *Verdict* and *Deterministic tests* and replaces every \`${TO_SCORE}\` with PASS or FAIL.

| | |
| --- | --- |
| After | ${provenance(after)} |
| Before | ${provenance(before)} |
| Model | ${hosts.join("<br>") || "none"} |
| Live runs | ${after.length} after${before.length ? `, ${before.length} before` : ""}; ${sentTurns(all)} turns sent to the model; recorded ${recorded.join(", ") || "never"} |
| Records | ${distinct(all.map((run) => `\`${run.file.split("/runs/")[0]}\``)).join(", ") || "none"} — local runner output, not committed |

## Verdict

${TO_SCORE} — two or three sentences: whether the change does what it is for, whether anything
regressed, and what is UNTESTED.

## Results

Live model runs, each read by a person against \`skills/tonight-recommend/evaluation/m5/rubric.md\`.
**UNTESTED** is the runner never getting there — not run, or a turn never sent — and is never a PASS
or a FAIL.

| part | source | scenario | family | runs | result |
| --- | --- | --- | --- | --- | --- |
${[...groups.map(summary), ...covered, ...notRun].join("\n")}

## Deterministic tests (no model)

${TO_SCORE} — the commands run and what they counted. They prove the text and the code, never what
a model does.

## Live runs
${groups.map((group) => `\n${renderGroup(group, fixtureTitle, shown)}\n`).join("")}`;
}

/* -------------------------------------------------------------------- CLI */

function cli(argv) {
  const value = (name) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : null;
  };
  const taken = new Set();
  const befores = [];
  argv.forEach((arg, at) => {
    if (["--title", "--out", "--targeted", "--before"].includes(arg)) {
      taken.add(at).add(at + 1);
      if (arg === "--before") befores.push(argv[at + 1]);
    }
  });
  const afters = argv.filter((arg, at) => !taken.has(at) && !arg.startsWith("--"));
  const title = value("title");
  if (!title || afters.length === 0) {
    throw new Error("usage: node evaluation/report.mjs --title <change> [--out <file>] [--targeted <key,…>] [--before <dir>]… <dir>…");
  }
  const scenarios = JSON.parse(readFileSync(join(here, "m5", "scenarios.json"), "utf8"));
  const fixtureTitle = (set, id) => {
    const file = join(here, set ?? "m5", "fixtures", `${id}.json`);
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).title ?? null : null;
  };
  const text = report({
    title,
    after: afters.flatMap((dir) => loadRuns(dir, "after")),
    before: befores.flatMap((dir) => loadRuns(dir, "before")),
    scenarios,
    targeted: (value("targeted") ?? "").split(",").map((one) => one.trim()).filter(Boolean),
    fixtureTitle,
  });
  const out = value("out");
  if (out) {
    writeFileSync(out, text);
    console.error(`Wrote ${out}. Replace every ${TO_SCORE} before committing it.`);
  } else {
    process.stdout.write(text);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli(process.argv.slice(2));
