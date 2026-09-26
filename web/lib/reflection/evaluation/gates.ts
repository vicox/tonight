import { TRAJECTORIES, type Target, type Trajectory } from "./trajectories.ts";

/**
 * M4's hard gate, as checks over what was observed.
 *
 * The milestone's own words: *reflection never creates or mutates a Verdict or
 * Declaration without the required user act; operational state, Observations
 * and inert Proposals are permitted.* Everything below is that sentence split
 * into the places it can be broken.
 *
 * ## Two halves, because storage alone would miss it
 *
 * The roadmap is explicit that removal is proved *"by recommending again after
 * each act rather than by inspecting what is stored"*. So every trajectory is
 * observed twice — the user's model before reflection ran, and after — and each
 * pair is compared in two ways:
 *
 * - **authority**: the objects the user owns. A genre, a mix or a verdict that
 *   appeared, vanished or changed is a violation whatever the answer reads like.
 * - **inertness**: what a recommendation stands on. `get_taste` is exactly the
 *   recommendation-active projection, so comparing it before and after is the
 *   "recommend again" proof reduced to the thing recommending reads. An
 *   Observation that changed no row but tilted this would be the weakly-active
 *   inert state the roadmap names, and only this half would catch it.
 *
 * ## The positive control
 *
 * Four gates forbid. A product that can never propose anything would pass all
 * four, so `acceptance` is written the other way round: where an acceptance
 * happened, the accepted target must be there. It is stated as an implication
 * so that it holds — vacuously and honestly — until M4 can perform one.
 */

/** What a recommendation stands on: `get_taste`'s answer, canonicalised. */
export type Taste = string;

/** The objects the user owns, canonicalised, as `get_memory` reports them. */
export type Authority = { genres: string; mixes: string; verdicts: string };

/** One trajectory, observed either side of the reflection steps. */
export type Observed = {
  trajectory: Trajectory;
  /** After the user's own history, before reflection did anything. */
  before: { taste: Taste; authority: Authority };
  /** After every reflection step in the trajectory. */
  after: { taste: Taste; authority: Authority };
  /** Whether the driver could actually perform the reflection steps. */
  performed: boolean;
  /** The target of an acceptance that actually happened, or null. */
  accepted: Target | null;
};

export type World = { seen: Record<string, Observed> };

export type Failure = { gate: string; trajectory: string; detail: string };
export type Gate = { name: string; check: (world: World) => Failure[] };

const failer = (gate: string, trajectory: string) => {
  const failures: Failure[] = [];
  const fail = (detail: string) => failures.push({ gate, trajectory, detail });
  fail.failures = failures;
  return fail;
};

/** Every trajectory that performed no acceptance. */
const unaccepted = (world: World) =>
  Object.values(world.seen).filter((seen) => seen.accepted === null);

/* ------------------------------------------------------------------ gate A */

/**
 * Nothing the user owns moved, where nobody accepted anything.
 *
 * The three kinds are compared separately so a failure says which root was
 * written. A single combined digest would say only that something changed.
 */
export function authority(world: World): Failure[] {
  const failures: Failure[] = [];
  for (const seen of unaccepted(world)) {
    const fail = failer("authority", seen.trajectory.name);
    for (const kind of ["genres", "mixes", "verdicts"] as const) {
      if (seen.before.authority[kind] !== seen.after.authority[kind]) {
        fail(
          `reflection changed the ${kind} with no user act: ` +
            `${seen.before.authority[kind]} became ${seen.after.authority[kind]}`,
        );
      }
    }
    failures.push(...fail.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate B */

/**
 * No unaccepted reading reached what a recommendation stands on.
 *
 * The roadmap's inert state, checked as the roadmap asks for it: an Observation
 * that is merely unaccepted *"changes no answer at all"*. A reading that left
 * every row alone and still moved this is the failure this gate exists for, and
 * the one a storage comparison cannot see.
 */
export function inertness(world: World): Failure[] {
  const failures: Failure[] = [];
  for (const seen of unaccepted(world)) {
    const fail = failer("recommendation-inertness", seen.trajectory.name);
    if (seen.before.taste !== seen.after.taste) {
      fail("an unaccepted reading changed what a recommendation stands on");
    }
    failures.push(...fail.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate C */

/**
 * A refusal stays a refusal.
 *
 * §6: *a rejected proposal that returns next month is a worse failure than
 * never proposing.* What is checkable at this size is the narrower half — the
 * refused target never became real — and it is stated over the target rather
 * than over the model as a whole so that it keeps meaning something once other
 * writes are allowed to happen alongside.
 *
 * Whether the Observation beneath a rejected Proposal survives is left open on
 * purpose: this gate does not need it, and the roadmap does not say.
 */
export function rejection(world: World): Failure[] {
  const failures: Failure[] = [];
  for (const seen of Object.values(world.seen)) {
    if (!seen.trajectory.steps.some((step) => step.act === "reject")) continue;
    const fail = failer("rejection-stands", seen.trajectory.name);
    const refused = seen.trajectory.steps.find(
      (step) => step.act === "propose" || step.act === "observe",
    );
    const target = refused && "target" in refused ? refused.target : null;
    if (target !== null && names(target, seen.after)) {
      fail(`the refused ${target.kind} is in the model after the refusal`);
    }
    failures.push(...fail.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate D */

/**
 * What was accepted became real.
 *
 * The positive control, and an implication rather than an assertion: it says
 * nothing until an acceptance has actually been performed. Pre-M4 no driver can
 * perform one, so this passes for the honest reason — not because a product
 * that cannot propose is correct, but because the case has not arisen yet.
 */
export function acceptance(world: World): Failure[] {
  const failures: Failure[] = [];
  for (const seen of Object.values(world.seen)) {
    if (seen.accepted === null) continue;
    const fail = failer("acceptance-takes", seen.trajectory.name);
    if (!names(seen.accepted, seen.after)) {
      fail(`the accepted ${seen.accepted.kind} is not in the model afterwards`);
    }
    if (seen.before.taste === seen.after.taste) {
      fail("an accepted change left what a recommendation stands on untouched");
    }
    failures.push(...fail.failures);
  }
  return failures;
}

/** Whether a target's own name appears in what was observed afterwards. */
function names(target: Target, after: Observed["after"]): boolean {
  const where = `${after.authority.genres}${after.authority.mixes}${after.authority.verdicts}`;
  return where.includes(target.kind === "verdict" ? target.film.title : target.name);
}

/* ------------------------------------------------------------------ gate E */

/**
 * Every trajectory ran, and the set still covers the whole lifecycle.
 *
 * A gate set that silently stopped driving a case would report a pass on it.
 * Named here rather than left to the driver, because "the case did not run" and
 * "the case ran and held" are different answers and must not read the same.
 */
export function coverage(world: World): Failure[] {
  const fail = failer("lifecycle-coverage", "all");
  for (const trajectory of TRAJECTORIES) {
    if (!(trajectory.name in world.seen)) fail(`${trajectory.name} was never observed`);
  }
  for (const act of ["observe", "propose", "ignore", "reject", "accept"] as const) {
    const somewhere = TRAJECTORIES.some((one) => one.steps.some((step) => step.act === act));
    if (!somewhere) fail(`no trajectory ever performs ${act}`);
  }
  return fail.failures;
}

export const GATES: Gate[] = [
  { name: "authority", check: authority },
  { name: "recommendation-inertness", check: inertness },
  { name: "rejection-stands", check: rejection },
  { name: "acceptance-takes", check: acceptance },
  { name: "lifecycle-coverage", check: coverage },
];

/** Runs every gate. Empty means M4's reflection-safety gate passes. */
export function gate(world: World): Failure[] {
  return GATES.flatMap(({ check }) => check(world));
}

/**
 * What this gate deliberately does not cover.
 *
 * Written down rather than discovered later, and each line says where the proof
 * would have to come from instead.
 */
export const LIMITS = [
  "reflection has no implementation yet, so the reflection steps perform nothing and the four prohibitions hold because nothing happened; the mutation probes in m4.test.ts are what prove the gates would catch a violation, and they are the whole of this gate's current force",
  "whether a rejected proposal recurs months later is a property of a history longer than any trajectory here, and belongs with proposal rate and acceptance rate in the blind sweep rather than in a deterministic replay",
  "proposal expiry is undecided in the roadmap — an unaccepted proposal expires, with no stated limit — so nothing here asserts when the ignored trajectory's proposal stops existing, only that it never wrote anything while it did",
  "whether the Observation beneath a rejected Proposal survives the rejection is likewise undecided, and gate C is written over the refused target rather than over the Observation so that it does not assume an answer",
  "a model that proposes badly — too often, or things nobody would accept — passes every gate here; quality and rate are the blind half of M4's evaluation and are not deterministic questions",
] as const;
