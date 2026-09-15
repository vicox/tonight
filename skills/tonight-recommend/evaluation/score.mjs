/**
 * Scores a recorded result set against the §8.3.1 acceptance criteria.
 *
 *   node evaluation/score.mjs results/phase-1
 *   node evaluation/score.mjs results/phase-1 --json
 *
 * R5 of `docs/work/phase-1-repairs.md`. The first scoring pass over the
 * `645a831f` candidate was done by reading, and got three rows wrong: it scoped
 * AC1 away from runs that produced no recommendation, it recorded AC3a as
 * `partial` — a verdict that does not exist — and it recorded AC2's
 * overconfidence as a finding rather than a failure. It also missed a lead
 * because it looked for one phrasing of it.
 *
 * This file is the standard applied to both sides instead. It reads artifacts
 * and nothing else: it never launches an agent, never re-reads the store, and
 * never writes into a run. Rescoring a set changes no artifact in it.
 *
 * ## What a verdict may be
 *
 * `pass` or `fail`, and nothing between them. §8.3.1 makes every row an
 * every-run criterion — a required behaviour must appear in every run of the
 * fixtures named, exactly as a prohibited one must appear in none — so a row
 * with one bad run is a failed row. `partial` is not a verdict, and the absence
 * of a result is a failure rather than a neutral outcome.
 *
 * A row may also carry findings. A finding is an observation that does not
 * fail the row; it never softens a failure and never stands in for one.
 */
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
 * Does this answer name one film as where to start?
 *
 * Two halves, and both are required. The commitment — the agent saying where
 * *it* would begin — and **a concrete film it commits to**. Either alone is not
 * a lead: "My pick depends on the mood" commits to nothing, and a list of titles
 * commits to none of them.
 *
 * A film is recognised by what identifies one in these answers: a release year,
 * an emphasised title, or a capitalised name. The year is the strongest and the
 * capitalised name the weakest, which is why the window is short — a title
 * follows the commitment immediately or it is not what was committed to.
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

/** A year, an emphasised title, or a capitalised name — something identifying one film. */
const FILM = /\(\d{4}\)|\*{1,3}[^*\n]{2,60}\*{1,3}|\b[A-Z][\w'’-]+(?:\s+(?:[A-Z][\w'’-]+|of|the|and|for|a))*/;

export function hasLead(answer) {
  for (const m of answer.matchAll(COMMITMENT)) {
    // The sentence the commitment sits in, in both directions: the film it
    // commits to may precede it — "**Martyrs (2008)** — I'd start here."
    const before = answer.slice(Math.max(0, m.index - 160), m.index);
    const after = answer.slice(m.index + m[0].length, m.index + m[0].length + 160);
    const sentence =
      before.split(/(?<=[.!?])\s/).pop() + " " + after.split(/(?<=[.!?])\s/)[0];
    if (FILM.test(sentence)) return true;
  }
  return false;
}

/** Kept for readers of older reports: the commitment half, on its own. */
export const LEAD = COMMITMENT;

/** A direction: an alternative introduced by the condition under which it wins. */
const BULLET = /^\s*[-*]\s+/gm;

/**
 * Maximal certainty about one film's fit.
 *
 * Scoped to *fit* on purpose. P5 says a state-free Mix counts fully as
 * declarative intent, so confidence that the user meant the Mix is never
 * penalised here; what is penalised is certainty about a **specific film**
 * matching it when nothing under the Mix has confirmed that any film does.
 * Hedged-but-decisive language — "a good fit", "sits right in" — stays legal:
 * the shape requires a committed lead and this must not undo it.
 */
export const OVERCONFIDENT_FIT = new RegExp(
  [
    // "as pure a fit … as exists" / "… as you'll find" / "… as there is". The
    // span between the two halves is whatever the sentence needs — a fixed
    // window missed the retained run that names the Mix instruction in between.
    "\\b(as|about as)\\s+(pure|perfect|exact|precise|clean|ideal|close|good)\\s+a\\s+(fit|match)\\b[^.!?]*?\\bas\\s+(exists|you'?ll\\s+find|there\\s+is|they\\s+come|it\\s+gets)",
    "\\b(the\\s+)?(purest|perfect|exact|ideal|textbook|quintessential)\\s+(possible\\s+)?(example|version|expression|embodiment)?\\s*(of\\s+)?[^.!?]{0,30}\\bfit\\b",
    "\\bcouldn'?t\\s+(be|ask\\s+for)\\s+a\\s+(better|closer|purer)\\s+(fit|match)",
    "\\bexactly\\s+what\\s+[^.!?]{0,30}\\bwas\\s+(written|made)\\s+for\\b",
    "\\bperfect\\s+(fit|match)\\b",
  ].join("|"),
  "i",
);

/**
 * Which runs owe a recommendation.
 *
 * Derived from the run's own recorded facts rather than from a list of fixture
 * names: §10.1.1 says a taste-explicit request whose taste read failed must
 * **stop**, and §8.3.1 exempts exactly that from the AC1 shape — "including the
 * ordinary failure fallback, which still recommends". So the exemption is
 * "the read failed *and* the request was about their taste", which every
 * artifact states in its own header.
 */
export function owesRecommendation(header) {
  const tasteExplicit = header.prompt.startsWith("taste-explicit");
  return !(header.get_taste === "failed" && tasteExplicit);
}

export function loadRuns(dir) {
  const runs = readdirSync(join(dir, "runs"))
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const text = readFileSync(join(dir, "runs", f), "utf8");
      const header = headerOf(text);
      const snapshot = JSON.parse(
        readFileSync(join(dir, "runs", "snapshots", basename(header.taste_snapshot_file)), "utf8"),
      );
      return { file: basename(f), header, answer: answerOf(text), stored: storedNames(snapshot) };
    });
  if (runs.length === 0) throw new Error(`no runs in ${dir}`);
  return runs;
}

const fixtureOf = (r) => r.header.fixture;

/**
 * Everything the run's own snapshot says the user has stored: Genre names, Mix
 * names and Movie titles. This is what "the model influenced the answer" is
 * checked against — the data that run actually saw, bound to it by digest.
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

/** Punctuation- and case-insensitive, so "quiet-dread" still finds `Quiet Dread`. */
const flatten = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The answer attributes something to their stored taste.
 *
 * Not any second person: *"a slow burn that lulls you for an hour"* says "you"
 * and attributes nothing — it describes the film being recommended. What counts
 * is a possessive over their model, or a liking verb bound to them. Written
 * against the flattened text, where punctuation has already become spaces —
 * "you've built" reads as "you ve built" by the time it is matched. That is the
 * difference between describing a film and citing the person's taste for it,
 * and it is what lets *"because you like slow-burn stories"* count while the
 * generic phrase does not.
 */
const ATTRIBUTION = new RegExp(
  [
    "\\byour\\b",
    "\\byou\\s*ve\\s+(loved|liked|built|written|saved|been)\\b",
    "\\byou\\s+(loved|liked|like|tend|lean|enjoy|go\\s+for|are\\s+drawn|re\\s+drawn)\\b",
    "\\bbecause\\s+you\\b",
    "\\b(got|hit|landed|worked)\\s+for\\s+you\\b",
    // "the same shape as Arrival and Moon for you" — the films are cited as
    // theirs. Adjacency matters: "lulls you for an hour" is not this.
    "\\bfor\\s+you\\b",
    "\\bin\\s+your\\s+model\\b",
  ].join("|"),
  "i",
);

/**
 * The answer raises it only to set it aside.
 *
 * *"not the quiet-dread stuff"* and *"your Quiet Dread mix is no-gore — noted,
 * not overriding you, just flagging the contrast"* both name a stored Mix, and
 * neither is positive evidence: one narrates an exclusion, the other waives it
 * out loud. AC3a asks whether stored taste **supported** the recommendation, so
 * a name mentioned in order to be discounted does not satisfy it.
 */
const CONTRAST = new RegExp(
  [
    "\\bnot\\s+the\\b",
    "\\bnot\\s+overriding\\b",
    "\\bflagging\\s+the\\s+contrast\\b",
    "\\bdifferent\\s+from\\b",
    "\\bno\\s+need\\s+to\\s+touch\\b",
    "\\bdoes\\s*n\\s*o?t\\s+apply\\b",
    "\\b(setting|set)\\s+aside\\b",
    "\\bignoring\\b",
    "\\boverrid(e|ing)\\b",
    "\\bunlike\\s+your\\b",
    "\\bnothing\\s+to\\s+do\\s+with\\b",
  ].join("|"),
  "i",
);

/**
 * Does this run visibly use **positive** stored evidence?
 *
 * Every occurrence of every stored name is considered, and one supported
 * mention is enough. A mention counts when its neighbourhood attributes it to
 * the user and does not set it aside. Genre, Mix and film names are treated
 * alike: requiring attribution is what separates a citation from a coincidence,
 * so no name needs a capitalisation rule of its own.
 */
export function usesPositiveEvidence(run) {
  const flat = flatten(run.answer);
  for (const { name } of run.stored) {
    const needle = flatten(name);
    if (!needle) continue;
    for (let from = 0; ; ) {
      const at = flat.indexOf(needle, from);
      if (at < 0) break;
      from = at + needle.length;
      const window = flat.slice(Math.max(0, at - 130), at + needle.length + 130);
      if (ATTRIBUTION.test(window) && !CONTRAST.test(window)) return true;
    }
  }
  return false;
}


/**
 * What is being claimed to fit?
 *
 * AC2 guards certainty about a **specific film** fitting a Mix that nothing has
 * confirmed. It does not guard certainty about the Mix, the instruction or the
 * evening — *"Reading Room is a perfect fit for the evening you described"* is
 * confidence that the user meant what they wrote, which P5 says is never
 * reduced. The two read almost identically and differ only in their subject:
 *
 *     Reading Room is a perfect fit for the evening you described.   ← the Mix
 *     It's about as pure a fit for Reading Room as exists.           ← the film
 *
 * Note where the Mix sits. In the second it is the *object* — what the film is
 * claimed to fit — so a rule that merely looked for the Mix name anywhere in the
 * sentence would excuse exactly the claims this row exists to catch.
 */
const INTENT_SUBJECT = new RegExp(
  [
    "^(that|the|your|this)\\s+(mix|instruction|idea|brief)\\b",
    "^what\\s+you\\s+(meant|wrote|asked|described|said)\\b",
    "^the\\s+evening\\s+you\\b",
    "^your\\s+(taste|evening|brief)\\b",
  ].join("|"),
  "i",
);

/** A relative pronoun standing in for the thing just named — usually the film. */
const RELATIVE = /\b(which|that|who)$/i;

/** What links a subject to the claim, and is not part of the subject. */
const COPULA = /(?:\s*\b(?:is|are|was|were|seems|feels|looks|remains|reads)\b|'s|’s)\s*$/i;

/** Where one clause ends and the next begins. */
const CLAUSE_BREAK = /[,;:—–]|\s+\b(?:and|but|so|because|since|though|while)\b\s+/i;

/**
 * The phrase that actually governs a maximal-fit claim.
 *
 * Read backwards from the claim: take its sentence, drop the copula that links
 * the subject to it, and keep only the clause the subject sits in. That last
 * step is the whole point — *"Reading Room led me to Paterson, which is a
 * perfect fit"* names a Mix, but the Mix is not what is claimed to fit. The
 * claim is governed by `which`, standing for Paterson.
 */
export function governingSubject(answer, at) {
  const before = answer.slice(Math.max(0, at - 250), at);
  const sentence = before.split(/(?<=[.!?])\s/).pop() ?? "";
  const head = sentence
    .replace(/\s*\b(?:a|an|the)\s*$/i, "")
    .replace(COPULA, "")
    .trimEnd();
  if (RELATIVE.test(head)) return { text: head, relative: true };
  const clauses = head.split(CLAUSE_BREAK);
  const last = clauses[clauses.length - 1] ?? "";
  return { text: (last.trim() || head.trim()), relative: false };
}

/**
 * The maximal-fit claims in an answer whose subject is a concrete film.
 *
 * AC2 guards certainty about a **specific film** fitting a Mix that nothing has
 * confirmed. It does not guard certainty about the Mix, a Genre, or the stated
 * intent — *"Reading Room is a perfect fit for the evening you described"* is
 * confidence that the user meant what they wrote, which P5 never reduces.
 *
 * Only a Mix, a Genre or an explicit intent phrase earns that exemption, and
 * only as the **subject** of the claim. A stored film title never does: `Zodiac`
 * being in the model says nothing about whether *this* recommendation fits, and
 * exempting it would excuse the exact claim the row exists to catch.
 */
export function specificFilmFitClaims(answer, stored) {
  const intentNames = stored
    .filter(({ kind }) => kind === "mix" || kind === "genre")
    .map(({ name }) => flatten(name))
    .filter(Boolean);
  const claims = [];
  for (const m of answer.matchAll(new RegExp(OVERCONFIDENT_FIT.source, "gi"))) {
    const subject = governingSubject(answer, m.index);
    const flatSubject = flatten(subject.text);
    const aboutIntent =
      !subject.relative &&
      (INTENT_SUBJECT.test(subject.text.trim()) || intentNames.some((n) => flatSubject.includes(n)));
    if (!aboutIntent) claims.push(m[0].trim());
  }
  return claims;
}

/**
 * Every row of §8.3.1, scored over one result set.
 *
 * @typedef {{ verdict: "pass" | "fail", failures: string[], findings: string[] }} Row
 * @param {{ file: string, header: Record<string, string>, answer: string,
 *           stored: { name: string, kind: string }[] }[]} runs
 * @returns {Record<string, Row>}
 */
export function score(runs) {
  /** @type {Record<string, Row>} */
  const rows = {};
  const add = (ac, failures, findings = []) => {
    rows[ac] = { verdict: failures.length ? "fail" : "pass", failures, findings };
  };

  // AC1 — a named lead and two or three directions, in every run that owes one.
  const ac1 = [];
  for (const r of runs) {
    if (!owesRecommendation(r.header)) continue;
    const lead = hasLead(r.answer);
    const directions = (r.answer.match(BULLET) ?? []).length;
    if (!lead) ac1.push(`${r.file}: no lead — the answer names no film as where to start`);
    else if (directions < 2 || directions > 3) ac1.push(`${r.file}: ${directions} directions`);
  }
  add("AC1", ac1);

  // AC2 — the state-free Mix shapes the answer, and specific fit is not claimed
  // with maximal certainty while nothing has confirmed it.
  const ac2 = [];
  for (const r of runs.filter((x) => fixtureOf(x).includes("new-mix"))) {
    const [claim] = specificFilmFitClaims(r.answer, r.stored);
    if (claim) ac2.push(`${r.file}: maximal certainty about a specific film's fit — "${claim}"`);
  }
  add("AC2", ac2);

  // AC3a — an ordinary request visibly uses the stored model. Every run.
  //
  // Checked against the run's own snapshot, never by keyword. Whether the model
  // influenced an answer is shown by the answer naming something that is in it:
  // a Genre, a Mix, or a film the user stored — and used in *support* of the
  // recommendation. Naming one to set it aside is not evidence that it shaped
  // anything, which is why an exclusion narrated in passing does not count.
  const ac3a = [];
  for (const r of runs) {
    const ordinary = r.header.prompt === "plain" || r.header.prompt === "unrelated-plain";
    if (!ordinary || r.header.get_taste !== "ok") continue;
    if (r.stored.length === 0) continue; // an empty model has nothing to show
    if (!usesPositiveEvidence(r)) {
      ac3a.push(`${r.file}: no stored taste is used in support of the recommendation`);
    }
  }
  add("AC3a", ac3a);

  return rows;
}

if (process.argv[1] && process.argv[1].endsWith("score.mjs")) {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: node evaluation/score.mjs <results dir>");
  const rows = score(loadRuns(dir));
  if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
  else
    for (const [ac, row] of Object.entries(rows)) {
      console.log(`${ac.padEnd(5)} ${row.verdict.toUpperCase()}`);
      for (const f of row.failures) console.log(`      ${f}`);
    }
}
