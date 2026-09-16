/**
 * The deterministic half of the evaluation gate.
 *
 *   node evaluation/score.mjs results/phase-1
 *   node evaluation/score.mjs results/phase-1 --json
 *
 * This file checks **facts about artifacts**. It does not decide whether an
 * acceptance criterion passed — `rubric.md` gives every AC1–AC6 verdict to the
 * blind pass, and this layer exists to make that pass safe and cheap, not to
 * anticipate it.
 *
 * The split is the one `docs/work/evaluation-architecture.md` argues for. An
 * earlier version of this file tried to decide which film was being
 * recommended, whether a mention supported the answer or dismissed it, and
 * whether a confidence claim was about a film or about what the user meant.
 * Those questions needed clause splitting, subject binding, span windows and
 * title guessing, and each was corrected after reading a real output wrongly.
 * They are the product's own judgements, and an evaluator that re-derives them
 * will keep disagreeing with it.
 *
 * So there are exactly two kinds of output here.
 *
 * **Admissibility faults** are artifact-level and fail directly: a run that is
 * malformed, unbound from its snapshot, or missing the provenance that places
 * it. A fault says "this run cannot be scored", never "this criterion failed",
 * and **no property of an answer's content can raise one** — an interview, a
 * flat list and a snapshot contradiction are all valid artifacts.
 *
 * **Flags** are high-recall literal matches, reported with quoted context and
 * adjudicated by the blind judge. A flag never fails a criterion. False
 * positives are expected and cheap; a silent false pass is neither.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

/** The header block of a run artifact, as written by the runner. */
export function headerOf(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!block) throw new Error("a run artifact has no header");
  return Object.fromEntries(
    [...block[1].matchAll(/^([a-z_]+): (.*)$/gm)].map(([, k, v]) => [k, v.trim()]),
  );
}

export function answerOf(text) {
  const at = text.indexOf("## Answer");
  if (at < 0) throw new Error("a run artifact has no answer");
  return text.slice(at + "## Answer".length).trim();
}

/**
 * Which runs owe a recommendation.
 *
 * Derived from the run's own recorded facts rather than from a list of fixture
 * names: §10.1.1 says a taste-explicit request whose taste read failed must
 * **stop**, and §8.3.1 exempts exactly that from the answer shape — "including
 * the ordinary failure fallback, which still recommends". So the exemption is
 * "the read failed *and* the request was about their taste", which every
 * artifact states in its own header.
 */
export function owesRecommendation(header) {
  const tasteExplicit = header.prompt.startsWith("taste-explicit");
  return !(header.get_taste === "failed" && tasteExplicit);
}

/**
 * Does this request have stored taste it could draw on?
 *
 * An applicability fact, taken from the prompt's declared relationship to the
 * model and nothing else. A prompt the fixture set declares **unrelated** —
 * `unrelated-plain`, documented in `prompts.md` as asking for "exactly what the
 * stored exclusion rules out … in a context that exclusion has nothing to do
 * with" — points away from everything stored. Judging *how much* stored taste
 * bears on any other request is the product's work, not this file's.
 */
export function materiallyRelevant(run) {
  return !run.header.prompt.startsWith("unrelated");
}

export function loadRuns(dir) {
  const runs = readdirSync(join(dir, "runs"))
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const text = readFileSync(join(dir, "runs", f), "utf8");
      const header = headerOf(text);
      const body = readFileSync(
        join(dir, "runs", "snapshots", basename(header.taste_snapshot_file)),
        "utf8",
      );
      const snapshot = JSON.parse(body);
      return {
        file: basename(f),
        header,
        answer: answerOf(text),
        snapshotBody: body,
        stored: storedNames(snapshot),
        stateful: statefulTitles(snapshot),
      };
    });
  if (runs.length === 0) throw new Error(`no runs in ${dir}`);
  return runs;
}

/**
 * Everything the run's own snapshot says the user has stored: Genre names, Mix
 * names and Movie titles — the data that run actually saw, bound to it by
 * digest.
 */
export function storedNames(snapshot) {
  const named = (list, key, kind) =>
    (list ?? [])
      .map((x) => x[key])
      .filter((n) => typeof n === "string" && n.trim().length > 2)
      .map((n) => ({ name: n, kind }));
  return [
    ...named(snapshot.mixes, "name", "mix"),
    ...named(snapshot.movies, "title", "movie"),
    ...named(snapshot.genres, "name", "genre"),
  ];
}

/**
 * The states that mean the user has already formed a relationship with a film.
 *
 * `not_seen` and `null` are deliberately absent: they are the absence of an
 * experience, so the film is still on the table and may lead.
 */
const STATEFUL = new Set(["seen", "liked", "loved", "disliked"]);

export function statefulTitles(snapshot) {
  return (snapshot.movies ?? [])
    .filter((m) => STATEFUL.has(m.state))
    .map((m) => ({ title: m.title, state: m.state }));
}

/* ------------------------------------------------------------------ signals */

/**
 * The agent saying where *it* would begin. A fixed idiom list — whether one of
 * these phrases occurs is a fact. Which film it commits to, or whether it
 * commits to a film at all, is the blind judge's.
 */
export const COMMITMENT = new RegExp(
  [
    "\\bI'?d\\s+(start|begin|go)\\s+(with|here|for)",
    "\\bI'?d\\s+lead\\s+with",
    "\\bmy\\s+(lead|pick|call)\\b",
    "\\bthe\\s+lead\\s+(is|tonight)\\b",
    "\\blead\\s+tonight\\b",
    "\\bI'?d\\s+point\\s+you\\s+(at|to)\\b",
    "\\bstart\\s+with\\b",
  ].join("|"),
  "gi",
);

/** A list item: a bullet or a numbered line. */
const ENUMERATED = /^[ \t]*(?:[-*]|\d+\.)[ \t]+(.*)$/gm;

/** A release year — the one unambiguous mark that a film is being named. */
const DATED = /\((\d{4})\)/g;

/** A list item opening on the condition under which it wins. */
const CONDITIONAL = /^\**\s*(?:if|when)\b/i;

/**
 * The literal counts an answer's structure can be read from, with no judgement
 * about what any of it refers to.
 */
export function signals(answer) {
  const items = [...answer.matchAll(ENUMERATED)].map((m) => m[1].trim());
  return {
    cues: [...answer.matchAll(COMMITMENT)].length,
    items: items.length,
    dated: [...answer.matchAll(DATED)].length,
    conditionals: items.filter((text) => CONDITIONAL.test(text)).length,
  };
}

/* -------------------------------------------------------------------- flags */

/**
 * Maximal certainty about a fit.
 *
 * Flagged wherever it occurs. Whether the certainty is about a *film's* fit —
 * which P5 limits while nothing has confirmed it — or about the Mix or the
 * user's stated intent, which it never limits, is a judgement about what the
 * sentence is about, and it belongs to the blind pass.
 */
export const OVERCONFIDENT_FIT = new RegExp(
  [
    "\\b(as|about as)\\s+(pure|perfect|exact|precise|clean|ideal|close|good)\\s+a\\s+(fit|match)\\b[^.!?]*?\\bas\\s+(exists|you'?ll\\s+find|there\\s+is|they\\s+come|it\\s+gets)",
    "\\b(the\\s+)?(purest|perfect|exact|ideal|textbook|quintessential)\\s+(possible\\s+)?(example|version|expression|embodiment)?\\s*(of\\s+)?[^.!?]{0,30}\\bfit\\b",
    "\\bcouldn'?t\\s+(be|ask\\s+for)\\s+a\\s+(better|closer|purer)\\s+(fit|match)",
    "\\bexactly\\s+what\\s+[^.!?]{0,30}\\bwas\\s+(written|made)\\s+for\\b",
    "\\bperfect\\s+(fit|match)\\b",
  ].join("|"),
  "gi",
);

/**
 * Language asserting the user has not seen something.
 *
 * Paired with the snapshot, this is the one AC4 question that needs no parser:
 * the two artifacts contradict each other, or they do not. Whether the film was
 * actually being *offered* as novelty — as opposed to named while the offer sat
 * elsewhere in the sentence — is what the blind judge adjudicates.
 */
export const NOVELTY = new RegExp(
  [
    "\\bunseen\\b",
    "\\bnew\\s+to\\s+you\\b",
    "\\ba\\s+new\\s+one\\b",
    "\\byou\\s+haven'?t\\s+(?:told\\s+me\\s+you'?ve\\s+)?(?:seen|watched|logged|caught)\\b",
    "\\byou\\s+have\\s+not\\s+(?:seen|watched)\\b",
    "\\bnot\\s+(?:yet\\s+)?(?:seen|watched)\\b",
    "\\bhaven'?t\\s+(?:seen|watched)\\b",
    "\\bfresh\\s+ground\\b",
  ].join("|"),
  "gi",
);

/** How much of the answer to quote around a flag, so it can be adjudicated. */
const CONTEXT = 110;

const quoteAround = (text, at, len) =>
  text
    .slice(Math.max(0, at - CONTEXT), at + len + CONTEXT)
    .replace(/\s+/g, " ")
    .trim();

/** A stored title, found whole — `Moon` is never found inside `Moonlight`. */
const wholeTitle = (title) =>
  new RegExp(`\\b${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

/**
 * Every literal flag in one result set.
 *
 * High recall by design. A flag carries its run, what matched, and enough of
 * the surrounding sentence to decide it without opening the artifact.
 *
 * @typedef {{ ac: string, kind: string, run: string, quote: string,
 *             phrase?: string, title?: string, state?: string }} Flag
 * @param {{ file: string, header: Record<string, string>, answer: string,
 *           stored: { name: string, kind: string }[],
 *           stateful: { title: string, state: string }[] }[]} runs
 * @returns {Flag[]}
 */
export function flags(runs) {
  const out = [];
  const raise = (ac, kind, run, quote, extra = {}) =>
    out.push({ ac, kind, run: run.file, quote, ...extra });

  for (const run of runs) {
    const s = signals(run.answer);

    // AC1 — structure, counted. None of these is a verdict: an answer may carry
    // its directions in prose, or restate its lead, and still be right.
    if (owesRecommendation(run.header)) {
      if (s.cues !== 1) raise("AC1", "commitment-cue-count", run, `${s.cues} commitment cues`);
      if (s.items < 2 || s.items > 3) {
        raise("AC1", "item-count", run, `${s.items} enumerated items`);
      }
      if (s.conditionals < s.items) {
        raise("AC1", "unconditional-items", run,
          `${s.conditionals} of ${s.items} items open on a condition`);
      }
    }

    // AC2 — the phrase, quoted where it sits.
    for (const m of run.answer.matchAll(OVERCONFIDENT_FIT)) {
      raise("AC2", "maximal-fit-claim", run, quoteAround(run.answer, m.index, m[0].length), {
        phrase: m[0].trim(),
      });
    }

    // AC3a — the answer names nothing that is in the model. Not a failure: R3
    // allows "a paraphrase they would recognise as their own", which names
    // nothing. It is worth a look, and only that.
    const ordinary = run.header.prompt === "plain" || run.header.prompt === "unrelated-plain";
    if (
      ordinary &&
      run.header.get_taste === "ok" &&
      run.stored.length > 0 &&
      materiallyRelevant(run)
    ) {
      const named = run.stored.some(({ name }) => wholeTitle(name).test(run.answer));
      if (!named) raise("AC3a", "no-stored-name", run, "no stored Genre, Mix or Movie is named");
    }

    // AC1 — nothing this layer can recognise as a recommendation. Deliberately a
    // flag: "Watch Paterson tonight." is a valid answer carrying no commitment
    // idiom, no list and no year, and only a reader can tell it apart from an
    // answer that recommends nothing at all.
    if (owesRecommendation(run.header) && s.cues === 0 && s.items === 0 && s.dated === 0) {
      raise("AC1", "no-recommendation-signal", run,
        run.answer.replace(/\s+/g, " ").trim().slice(0, 220));
    }

    // AC4 — the answer and its own snapshot disagree about whether a film has
    // been watched.
    for (const m of run.answer.matchAll(NOVELTY)) {
      const window = run.answer.slice(
        Math.max(0, m.index - CONTEXT),
        m.index + m[0].length + CONTEXT,
      );
      for (const { title, state } of run.stateful) {
        if (!wholeTitle(title).test(window)) continue;
        raise("AC4", "novelty-against-state", run, quoteAround(run.answer, m.index, m[0].length), {
          title,
          state,
          phrase: m[0].trim(),
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------ admissibility */

/**
 * Everything a run must record to be scorable at all. The methodology's own
 * list — `README.md` requires each of these of every recorded run, and a run
 * missing one cannot be placed, compared, or reproduced.
 */
const REQUIRED_PROVENANCE = [
  "fixture",
  "prompt",
  "run",
  "side",
  "instructions",
  "host",
  "model_requested",
  "model_resolved",
  "cli_version",
  "session",
  "tonight_tools",
  "tonight_transcript",
  "external_tools",
  "external_evidence",
  "taste_snapshot",
  "taste_snapshot_file",
  "get_taste",
  "recorded",
];

/**
 * Whether each run is a valid artifact — nothing about whether its answer is
 * any good.
 *
 * A fault means *this run cannot be scored by anyone*: it is malformed, it is
 * not bound to the data it saw, or it does not say enough about itself to be
 * placed. Every judgement about the answer's content, including whether it
 * recommends anything, belongs to the blind pass and appears here only as a
 * flag.
 */
export function admissibility(runs) {
  const faults = [];
  for (const run of runs) {
    for (const field of REQUIRED_PROVENANCE) {
      if (!run.header[field]) faults.push(`${run.file}: provenance incomplete — no ${field}`);
    }
    if (!run.answer || !run.answer.trim()) faults.push(`${run.file}: no answer recorded`);
    // `not_called` is a real outcome, not a gap: the baseline instructions did
    // not call the tool, and 35 of its runs record exactly that.
    if (run.header.get_taste && !["ok", "failed", "not_called"].includes(run.header.get_taste)) {
      faults.push(`${run.file}: get_taste records "${run.header.get_taste}", which is not an outcome`);
    }
    // Checked whenever the artifact claims a digest, which every recorded run
    // does. `seed.mjs` writes it as the first 16 hex of sha256 over the body.
    if (run.header.taste_snapshot) {
      const digest = createHash("sha256")
        .update(run.snapshotBody ?? "", "utf8")
        .digest("hex")
        .slice(0, 16);
      if (run.header.taste_snapshot !== `sha256:${digest}`) {
        faults.push(`${run.file}: snapshot digest does not match the bound file`);
      }
    }
  }
  return faults;
}

/**
 * The deterministic output for one result set.
 *
 * @returns {{ faults: string[], flags: Flag[] }}
 */
export function score(runs) {
  return { faults: admissibility(runs), flags: flags(runs) };
}

if (process.argv[1] && process.argv[1].endsWith("score.mjs")) {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: node evaluation/score.mjs <results dir>");
  const result = score(loadRuns(dir));
  if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`admissibility: ${result.faults.length} fault(s)`);
    for (const fault of result.faults) console.log(`      ${fault}`);
    const byAc = {};
    for (const flag of result.flags) (byAc[flag.ac] ??= []).push(flag);
    console.log(`flags: ${result.flags.length} — for blind adjudication, not verdicts`);
    for (const [ac, list] of Object.entries(byAc).sort()) {
      const kinds = {};
      for (const flag of list) kinds[flag.kind] = (kinds[flag.kind] ?? 0) + 1;
      const summary = Object.entries(kinds)
        .map(([kind, n]) => `${kind} ${n}`)
        .join(", ");
      console.log(`      ${ac}: ${list.length} (${summary})`);
    }
  }
}
