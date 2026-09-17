import { declared, type Statement, type Step, type Trajectory } from "./trajectories.ts";

/**
 * The M1 gates. All seven are deterministic, and that is not a shortcut.
 *
 * `phase-2-architecture.md` gives criterion verdicts to the blind judge because
 * Phase 1's subject was a model's prose, where "is this a good lead" cannot be
 * settled by a rule. M1's subject is a tool surface: whether an outcome is
 * unknown, whether a corrected value replaced the old one, whether the taste
 * model moved. None of that is a question about meaning, so none of it needs a
 * reader — and inventing one would make a fact into an opinion.
 *
 * What M1 does *not* evaluate here is whether an agent uses the tools faithfully
 * — whether it records the request in the user's words rather than a paraphrase,
 * or resists asking a leading question. That is behaviour under a model, it
 * needs a sweep to observe, and it belongs to the milestone where episodes start
 * influencing what is recommended. See `limits` at the foot of this file.
 */

/** One episode, in the shape `get_episodes` returns. */
export type ReadEpisode = {
  id: string;
  request: string;
  offered: { title: string; year: number; lead: boolean }[];
  chosen: Established<{ title: string; year: number; lead: boolean }>;
  watched: Established<boolean>;
  finished: Established<boolean>;
};

type Established<T> = { known: true; value: T; source: string } | { known: false };

export type Outcome = "chosen" | "watched" | "finished";
export const OUTCOMES: readonly Outcome[] = ["chosen", "watched", "finished"];

export type Failure = { gate: string; trajectory: string; detail: string };

/**
 * What a trajectory left behind, as the gates need to see it.
 *
 * `taste` is the whole taste model read through `get_taste` before and after, so
 * gate 7 can compare rather than trust.
 */
export type Result = {
  trajectory: Trajectory;
  /** Episodes visible to the acting user at the end, through `get_episodes`. */
  episodes: ReadEpisode[];
  /** The episode the trajectory acted on, if it still exists. */
  subject?: ReadEpisode;
  /** Whether each `refused` step was in fact refused. */
  refusals: boolean[];
  tasteBefore: unknown;
  tasteAfter: unknown;
};

/* ------------------------------------------------------------------ gate 1 */

/**
 * Factuality: a remembered fact is either established by a statement, or not
 * known. There is no third shape, and no established fact without a source.
 */
export function factuality(result: Result): Failure[] {
  const fail = failer("factuality", result);
  if (!result.subject) return [];
  for (const outcome of OUTCOMES) {
    const held = result.subject[outcome];
    if (!held.known) continue;
    if (held.source !== "stated") {
      fail(`${outcome} is established with source ${held.source}, which the user never gave`);
    }
    if (held.value === undefined) fail(`${outcome} says it is known and carries no value`);
  }
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 2 */

/**
 * The implication chain: nothing is remembered that the user did not state.
 *
 * Compares what the episode holds against what the trajectory declared, so this
 * catches every link at once — offering becoming chosen, chosen becoming
 * watched, watched becoming finished — and any inference nobody has thought of
 * yet. A per-link assertion would only catch the links somebody listed.
 */
export function chain(result: Result): Failure[] {
  const fail = failer("chain", result);
  if (!result.subject) return [];
  const said = declared(result.trajectory.steps);

  for (const outcome of OUTCOMES) {
    const held = result.subject[outcome];
    const stated = said[outcome];
    if (held.known && (stated === undefined || stated === null)) {
      fail(`${outcome} is remembered as ${JSON.stringify(held.value)} and was never stated`);
    }
    if (!held.known && stated !== undefined && stated !== null) {
      fail(`${outcome} was stated and is not remembered`);
    }
  }
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 3 */

/**
 * Write permission: every remembered fact traces to something M1 may know.
 *
 * Two provenances are legitimate, and the architecture is explicit that
 * requiring a user act for all of them would be wrong: what was asked and what
 * was offered are runtime facts Tonight observed, and the outcomes are the
 * user's statements. What may never appear is taste — gate 7 holds that from the
 * other side.
 */
export function permission(result: Result): Failure[] {
  const fail = failer("permission", result);
  if (!result.subject) return [];

  const recorded = result.trajectory.steps.find((step) => step.act === "record");
  if (!recorded || recorded.act !== "record") return fail.failures;

  if (result.subject.request !== recorded.request.trim()) {
    fail(`the request was not kept as it was given: ${JSON.stringify(result.subject.request)}`);
  }
  if (result.subject.offered.length !== recorded.offered.length) {
    fail(`${result.subject.offered.length} films remembered, ${recorded.offered.length} offered`);
  }
  for (const [at, offer] of result.subject.offered.entries()) {
    const given = recorded.offered[at];
    if (!given || offer.title !== given.title || offer.year !== given.year || offer.lead !== given.lead) {
      fail(`offer ${String(at)} is not the one that was put forward`);
    }
  }
  // Every established outcome must have a statement behind it. The source check
  // in gate 1 says the store believes so; this says the trajectory agrees.
  const said = declared(result.trajectory.steps);
  for (const outcome of OUTCOMES) {
    if (result.subject[outcome].known && said[outcome] === undefined) {
      fail(`${outcome} is established with no statement anywhere in the trajectory`);
    }
  }
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 4 */

/**
 * Correction: the current answer is the latest statement, and the superseded one
 * is nowhere.
 */
export function correction(result: Result): Failure[] {
  const fail = failer("correction", result);
  if (!result.subject) return [];
  const said = declared(result.trajectory.steps);

  for (const outcome of OUTCOMES) {
    const held = result.subject[outcome];
    const latest = said[outcome];
    if (latest === undefined || latest === null) {
      if (held.known) fail(`${outcome} survived a retraction as ${JSON.stringify(held.value)}`);
      continue;
    }
    if (!held.known) {
      fail(`${outcome} was stated last as ${JSON.stringify(latest)} and is not remembered`);
      continue;
    }
    const current = outcome === "chosen" ? { title: (held.value as { title: string }).title, year: (held.value as { year: number }).year } : held.value;
    if (JSON.stringify(current) !== JSON.stringify(latest)) {
      fail(`${outcome} is ${JSON.stringify(current)}; the last statement was ${JSON.stringify(latest)}`);
    }
  }

  // A refused correction must not have landed. The trajectory says which steps
  // were expected to be refused; if one succeeded, that is the failure.
  result.refusals.forEach((refused, at) => {
    if (!refused) fail(`a correction expected to be refused was accepted (refusal ${String(at)})`);
  });
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 5 */

/** Forgetting: the evening is absent from the public surface, offers and all. */
export function forgetting(result: Result): Failure[] {
  const fail = failer("forgetting", result);
  const forgets = result.trajectory.steps.some((step) => step.act === "forget");
  if (!forgets) return fail.failures;

  if (result.subject) fail("a forgotten evening is still readable");
  const forgotten = result.trajectory.steps.find((step) => step.act === "record");
  if (forgotten?.act === "record") {
    const lingering = result.episodes.find((episode) => episode.request === forgotten.request);
    if (lingering) fail("a forgotten evening is still listed");
  }
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 7 */

/**
 * No taste contamination: the whole taste model is byte-for-byte what it was.
 *
 * Read through `get_taste` before and after, because the claim is about what
 * Tonight would answer and not about which rows exist.
 */
export function untouchedTaste(result: Result): Failure[] {
  const fail = failer("taste", result);
  if (JSON.stringify(result.tasteBefore) !== JSON.stringify(result.tasteAfter)) {
    fail("the taste model moved while episodes were being written");
  }
  return fail.failures;
}

export const GATES = [factuality, chain, permission, correction, forgetting, untouchedTaste];

/** Runs every gate over every result. Empty means M1 passes. */
export function gate(results: readonly Result[]): Failure[] {
  return results.flatMap((result) => GATES.flatMap((check) => check(result)));
}

function failer(gate: string, result: Result) {
  const failures: Failure[] = [];
  const record = (detail: string) => {
    failures.push({ gate, trajectory: result.trajectory.name, detail });
  };
  record.failures = failures;
  return record;
}

/**
 * What M1's gates deliberately do not cover.
 *
 * Stated here rather than left to be discovered: gate 5 proves an evening is
 * gone from the public episode surface, which is the whole of M1's behaviour
 * because nothing else reads episodes yet. Forgetting at the recommendation
 * level cannot be proved until a milestone lets episodes influence what is
 * recommended, and inventing a consumer to test against would prove something
 * about the test rather than about Tonight.
 */
export const LIMITS = [
  "the behavioural boundary is the public episode surface; nothing consumes episodes yet",
  "whether an agent uses the tools faithfully needs a sweep and belongs to a later milestone",
] as const;

export type { Statement, Step };
