import { declared, FACTS, type Declared, type Statement, type Step, type Trajectory } from "./trajectories.ts";

/**
 * The M1 gates, under M9's evening. All deterministic, and that is not a shortcut.
 *
 * M1's subject is a tool surface: whether a fact is unknown, whether a corrected
 * value replaced the old one, whether the taste model moved. None of that is a
 * question about meaning, so none of it needs a reader — and inventing one would
 * make a fact into an opinion.
 *
 * What M1 does *not* evaluate here is whether an agent uses the tools faithfully
 * — whether it records the request in the user's words, or attributes a
 * statement only to the evening it was about. That is behaviour under a model,
 * and needs a sweep to observe. See `LIMITS` at the foot of this file.
 */

type Established<T> = { known: true; value: T; source: string } | { known: false };

/** One offer, in the shape `get_episodes` returns. */
export type ReadOffer = {
  title: string;
  year: number;
  offered: boolean;
  lead: boolean;
  chosen: Established<boolean>;
  started: Established<boolean>;
  finished: Established<boolean>;
  passed: Established<boolean>;
  passReason?: string;
};

/** One episode, in the shape `get_episodes` returns. */
export type ReadEpisode = {
  id: string;
  recordedAt: string;
  request: string | null;
  requestSource?: string;
  offers: ReadOffer[];
  offeredSource: string;
};

export type Failure = { gate: string; trajectory: string; detail: string };

/** One step expected to be refused, as the runner saw it. */
export type Refusal = {
  /** The tool answered with an error. */
  refused: boolean;
  /** The evening read byte-for-byte the same just before and just after. */
  unchanged: boolean;
};

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
  /** Every step expected to be refused, in order. */
  refusals: Refusal[];
  /** Steps expected to succeed that the tools refused, with what they said. */
  unexpected: string[];
  tasteBefore: unknown;
  tasteAfter: unknown;
};

/* ------------------------------------------------------------------ gate 0 */

/** Every step the script expects to succeed did, and every refusal was one. */
export function steps(result: Result): Failure[] {
  const fail = failer("steps", result);
  for (const complaint of result.unexpected) fail(`a step expected to succeed was refused: ${complaint}`);
  const expected = result.trajectory.steps.filter(
    (step) => step.act === "refused" || step.act === "refusedRound",
  ).length;
  if (result.refusals.length !== expected) {
    fail(`${String(expected)} refusals were scripted and ${String(result.refusals.length)} observed`);
  }
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 1 */

/**
 * Factuality: a remembered fact is either established by a statement, or not
 * known. There is no third shape, and no established fact without the user as
 * its source. A request is shown with its provenance, and only a request is.
 */
export function factuality(result: Result): Failure[] {
  const fail = failer("factuality", result);
  const subject = result.subject;
  if (!subject) return [];
  for (const offer of subject.offers) {
    for (const fact of FACTS) {
      const held = offer[fact];
      if (!held.known) continue;
      if (held.source !== "stated") {
        fail(`${offer.title}: ${fact} has source ${held.source}, which the user never gave`);
      }
      if (typeof held.value !== "boolean") fail(`${offer.title}: ${fact} is known and carries no yes or no`);
    }
    if (offer.passReason !== undefined && !(offer.passed.known && offer.passed.value)) {
      fail(`${offer.title}: a reason is held without a pass`);
    }
  }
  if (subject.request === null && subject.requestSource !== undefined) {
    fail("an evening with no request shows where its request came from");
  }
  if (subject.request !== null && subject.requestSource === undefined) {
    fail("an evening's request is shown without where it came from");
  }
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 2 */

/**
 * The implication chain: nothing is remembered that the user did not state.
 *
 * Compares what each offer holds against the replay, so this catches every link
 * at once — offering becoming chosen, chosen becoming started, a pass becoming
 * anything — and any inference nobody has thought of yet. The one entailment the
 * plan allows (finished ⇒ started) is in the replay, so it is the only one that
 * passes.
 */
export function chain(result: Result): Failure[] {
  const fail = failer("chain", result);
  const subject = result.subject;
  if (!subject) return [];
  const said = declared(result.trajectory.steps);

  for (const offer of subject.offers) {
    const expected = said.offers.find((one) => one.title === offer.title && one.year === offer.year);
    if (!expected) {
      fail(`${offer.title} (${String(offer.year)}) is in the evening and nothing put it there`);
      continue;
    }
    for (const fact of FACTS) {
      if (offer[fact].known && expected[fact] === null) {
        fail(`${offer.title}: ${fact} is remembered as ${JSON.stringify(valueOf(offer[fact]))} and was never stated`);
      }
    }
  }
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 3 */

/**
 * Write permission: what was asked and what was offered trace to the latest
 * accepted statement of each — Tonight's observation, or the user's correction —
 * and the films they brought up trace to what they said.
 */
export function permission(result: Result): Failure[] {
  const fail = failer("permission", result);
  const subject = result.subject;
  if (!subject) return [];
  const said = declared(result.trajectory.steps);

  if (subject.request !== said.request) {
    fail(`the request is ${JSON.stringify(subject.request)}; it was given as ${JSON.stringify(said.request)}`);
  }
  if (said.request !== null && subject.requestSource !== said.requestSource) {
    fail(`the request claims to be ${String(subject.requestSource)}, and is ${said.requestSource}`);
  }
  if (subject.offeredSource !== said.offeredSource) {
    fail(`the offer list claims to be ${subject.offeredSource}, and is ${said.offeredSource}`);
  }

  const shape = (offers: readonly { title: string; year: number; offered: boolean; lead: boolean }[]) =>
    offers.map(({ title, year, offered, lead }) => ({ title, year, offered, lead }));
  if (JSON.stringify(shape(subject.offers)) !== JSON.stringify(shape(said.offers))) {
    fail(
      `the evening's films are ${JSON.stringify(shape(subject.offers))}; ` +
        `the script put forward ${JSON.stringify(shape(said.offers))}`,
    );
  }
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 4 */

/**
 * Correction: each fact is the latest thing said about it, a retraction reaches
 * unknown rather than false, and every refusal both refused and left the evening
 * exactly as it was.
 */
export function correction(result: Result): Failure[] {
  const fail = failer("correction", result);
  const subject = result.subject;
  const said = declared(result.trajectory.steps);

  if (subject) {
    for (const expected of said.offers) {
      const offer = subject.offers.find((one) => one.title === expected.title && one.year === expected.year);
      if (!offer) {
        fail(`${expected.title} (${String(expected.year)}) was said about and is not in the evening`);
        continue;
      }
      for (const fact of FACTS) {
        const latest = expected[fact];
        const held = offer[fact];
        if (latest === null) {
          if (held.known) fail(`${offer.title}: ${fact} survived a retraction as ${String(valueOf(held))}`);
        } else if (!held.known) {
          fail(`${offer.title}: ${fact} was stated last as ${String(latest)} and is not remembered`);
        } else if (held.value !== latest) {
          fail(`${offer.title}: ${fact} is ${String(held.value)}; the last statement was ${String(latest)}`);
        }
      }
      if (offer.passReason !== expected.passReason) {
        fail(`${offer.title}: the reason is ${JSON.stringify(offer.passReason)}; they said ${JSON.stringify(expected.passReason)}`);
      }
    }
  }

  result.refusals.forEach((refusal, at) => {
    if (!refusal.refused) fail(`a step expected to be refused was accepted (refusal ${String(at)})`);
    if (!refusal.unchanged) fail(`a refused step still moved the evening (refusal ${String(at)})`);
  });
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 5 */

/**
 * Forgetting: an evening that was forgotten, or deleted when nothing they said
 * was left in it (F6), is absent from the public surface, offers and all.
 */
export function forgetting(result: Result): Failure[] {
  const fail = failer("forgetting", result);
  const said: Declared = declared(result.trajectory.steps);
  if (said.exists) {
    if (!result.subject) fail("an evening the script keeps is gone");
    return fail.failures;
  }
  if (result.subject) fail("a forgotten or emptied evening is still readable");
  const first = result.trajectory.steps.find((step) => step.act === "record");
  if (first?.act === "record" && first.request !== undefined) {
    if (result.episodes.some((episode) => episode.request === first.request)) {
      fail("a forgotten evening is still listed");
    }
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

export const GATES = [steps, factuality, chain, permission, correction, forgetting, untouchedTaste];

/** Runs every gate over every result. Empty means M1 passes. */
export function gate(results: readonly Result[]): Failure[] {
  return results.flatMap((result) => GATES.flatMap((check) => check(result)));
}

function valueOf(fact: Established<boolean>): boolean | undefined {
  return fact.known ? fact.value : undefined;
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
