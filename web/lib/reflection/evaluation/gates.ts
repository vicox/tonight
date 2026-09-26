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

/** A genre as the taste model holds it. */
export type Genre = { name: string; instruction: string };

/**
 * The objects the user owns, structured rather than stringified.
 *
 * An earlier version kept these as JSON and asked whether a name appeared
 * anywhere in it. That answered *"is something called this present"* and was
 * satisfied by a genre with the right name and the wrong instruction — which is
 * the substitution the acceptance gate exists to catch. Comparison is over the
 * objects now, and the strings are kept beside them only for the two gates that
 * want *"did anything at all change"*.
 */
export type Authority = {
  genres: Genre[];
  mixes: unknown[];
  verdicts: unknown[];
};

/** The same, flattened, for the gates that only ask whether anything moved. */
export const digest = (authority: Authority): Record<"genres" | "mixes" | "verdicts", string> => ({
  genres: JSON.stringify(authority.genres),
  mixes: JSON.stringify(authority.mixes),
  verdicts: JSON.stringify(authority.verdicts),
});

/** One trajectory, observed either side of the reflection steps. */
export type Observed = {
  trajectory: Trajectory;
  /** After the user's own history, before reflection did anything. */
  before: { taste: Taste; authority: Authority };
  /** After every reflection step in the trajectory. */
  after: { taste: Taste; authority: Authority };
  /** Whether the driver could actually perform the reflection steps. */
  performed: boolean;
  /**
   * The target of an acceptance that actually happened, or null.
   *
   * **Taken from what was proposed, never from what `accept_proposal` returned.**
   * A gate that checked the write against the value the write itself reported
   * would agree with any implementation that was consistent with itself — it
   * would pass a product that accepted one thing and reported another. This is
   * the trajectory's own record of what the user was shown.
   */
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
    const was = digest(seen.before.authority);
    const now = digest(seen.after.authority);
    for (const kind of ["genres", "mixes", "verdicts"] as const) {
      if (was[kind] !== now[kind]) {
        fail(`reflection changed the ${kind} with no user act: ${was[kind]} became ${now[kind]}`);
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
    if (target !== null && seen.after.authority.genres.some((one) => one.name === target.name)) {
      fail(`the refused ${target.kind} is in the model after the refusal`);
    }
    failures.push(...fail.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate D */

/**
 * Exactly what was accepted became real, and nothing else did.
 *
 * The positive control, and the only gate that owes something rather than
 * forbidding it. Four claims, because "the change happened" is not one
 * question:
 *
 * - the proposed genre is there, **name and instruction both** — a genre with
 *   the right name and a different instruction is a different sentence about
 *   the user, and it is what a substituted target looks like from outside;
 * - every genre that was there before is still exactly as it was;
 * - the delta is that one genre and nothing more — an acceptance that also
 *   wrote something nobody offered is an unauthorised write wearing an
 *   authorised one as cover;
 * - mixes and verdicts did not move at all, and neither did the taste model in
 *   any way the new genre does not account for.
 *
 * The target compared against is the trajectory's, not the one the acceptance
 * reported. See `Observed.accepted`.
 */
export function acceptance(world: World): Failure[] {
  const failures: Failure[] = [];
  for (const seen of Object.values(world.seen)) {
    const wanted = seen.accepted;
    if (wanted === null) continue;
    const fail = failer("acceptance-takes", seen.trajectory.name);

    const before = seen.before.authority.genres;
    const after = seen.after.authority.genres;

    // (1) The genre they were shown, as they were shown it.
    const written = after.find((one) => one.name === wanted.name);
    if (!written) {
      fail(`the accepted genre ${wanted.name} is not in the model afterwards`);
    } else if (written.instruction !== wanted.instruction) {
      fail(
        `the accepted genre was written with a different instruction: ` +
          `${JSON.stringify(written.instruction)} rather than ${JSON.stringify(wanted.instruction)}`,
      );
    }

    // (2) Nothing that was already theirs moved.
    for (const existing of before) {
      const still = after.find((one) => one.name === existing.name);
      if (!still) fail(`accepting removed the genre ${existing.name}`);
      else if (still.instruction !== existing.instruction) {
        fail(`accepting reworded the genre ${existing.name}`);
      }
    }

    // (3) The delta is that one genre and nothing else.
    const added = after.filter((one) => !before.some((was) => was.name === one.name));
    if (added.length !== 1 || added[0]?.name !== wanted.name) {
      fail(
        `accepting wrote ${String(added.length)} genre(s) — ` +
          `${JSON.stringify(added.map((one) => one.name))} rather than only ${wanted.name}`,
      );
    }

    // (4) And it reached nothing but the genres.
    const was = digest(seen.before.authority);
    const now = digest(seen.after.authority);
    for (const kind of ["mixes", "verdicts"] as const) {
      if (was[kind] !== now[kind]) fail(`accepting a genre changed the ${kind}`);
    }
    if (seen.before.taste === seen.after.taste) {
      fail("an accepted change left what a recommendation stands on untouched");
    }

    failures.push(...fail.failures);
  }
  return failures;
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
  "the reflection steps drive the real tools, so the four prohibitions hold because the tools were called and nothing moved; what the probes add is that the gates are known to catch a violation rather than only known to pass",
  "only a genre can be proposed, so the acceptance gate compares genres; a mix or verdict target would need its own comparison and its own probes, and adding one without them would widen the gate's claim without widening its proof",
  "whether a rejected proposal recurs months later is a property of a history longer than any trajectory here, and belongs with proposal rate and acceptance rate in the blind sweep rather than in a deterministic replay",
  "proposal expiry is undecided in the roadmap — an unaccepted proposal expires, with no stated limit — so nothing here asserts when the ignored trajectory's proposal stops existing, only that it never wrote anything while it did",
  "whether the Observation beneath a rejected Proposal survives the rejection is likewise undecided, and gate C is written over the refused target rather than over the Observation so that it does not assume an answer",
  "a model that proposes badly — too often, or things nobody would accept — passes every gate here; quality and rate are the blind half of M4's evaluation and are not deterministic questions",
] as const;
