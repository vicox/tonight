/**
 * The trajectories that prove M1, and what each one is for.
 *
 * A trajectory is a scripted sequence of calls against the **public tool
 * surface** — `record_episode`, `correct_episode`, `forget_episode`,
 * `get_episodes` — together with a declaration of what the user actually
 * stated. The gates in `gates.ts` compare what ended up remembered against what
 * was declared, so a fact that appears without having been stated is caught by
 * construction rather than by somebody thinking to assert it.
 *
 * ## Why eleven and not sixty
 *
 * Phase 1 ran five repetitions of every fixture and prompt because its subject
 * was a model's prose, which varies: one run proves nothing about the next. M1's
 * subject is a deterministic tool surface. The same call with the same arguments
 * against the same state gives the same answer every time, so a second
 * repetition measures nothing a first did not, and the matrix only has to cover
 * the state transitions rather than sample a distribution.
 *
 * Every state an episode fact can be in, and every way it can move between them,
 * appears below at least once.
 */

/** A film as the tools take it. */
export type Offer = { title: string; year: number; lead: boolean };

/** What the user said, in the shape `correct_episode` accepts. */
export type Statement = {
  chosen?: { title: string; year: number } | null;
  watched?: boolean | null;
  finished?: boolean | null;
};

export type Step =
  | { act: "record"; request: string; offered: Offer[] }
  | { act: "state"; statement: Statement }
  /** Expected to be refused. The gates check the state did not move. */
  | { act: "refused"; statement: Statement }
  | { act: "forget" };

export type Trajectory = {
  name: string;
  /** The invariant this trajectory exists to prove, in one line. */
  proves: string;
  steps: Step[];
};

const prisoners: Offer = { title: "Prisoners", year: 2013, lead: true };
const zodiac: Offer = { title: "Zodiac", year: 2007, lead: false };
const offered = [prisoners, zodiac];

const record: Step = { act: "record", request: "something tense tonight", offered };

export const TRAJECTORIES: readonly Trajectory[] = [
  {
    name: "offered-only",
    proves: "recording an evening establishes no outcome — offering is not choosing",
    steps: [record],
  },
  {
    name: "chosen-only",
    proves: "a stated choice does not become a watching or a finishing",
    steps: [record, { act: "state", statement: { chosen: { title: "Zodiac", year: 2007 } } }],
  },
  {
    name: "watched-only",
    proves: "a stated watching does not become a finishing, and invents no choice",
    steps: [record, { act: "state", statement: { watched: true } }],
  },
  {
    name: "finished-only",
    proves: "a stated finishing invents nothing earlier in the chain, and no verdict",
    steps: [record, { act: "state", statement: { finished: true } }],
  },
  {
    name: "explicit-false",
    proves: "a stated no is remembered as a no, not as silence",
    steps: [record, { act: "state", statement: { watched: false, finished: false } }],
  },
  {
    name: "retract-each",
    proves: "every fact can be taken back, and taking one back reaches unknown rather than false",
    steps: [
      record,
      {
        act: "state",
        statement: { chosen: { title: "Prisoners", year: 2013 }, watched: true, finished: true },
      },
      { act: "state", statement: { chosen: null } },
      { act: "state", statement: { watched: null } },
      { act: "state", statement: { finished: null } },
    ],
  },
  {
    name: "correct-one",
    proves: "correcting one fact replaces it and leaves the others exactly as they were",
    steps: [
      record,
      {
        act: "state",
        statement: { chosen: { title: "Prisoners", year: 2013 }, watched: true, finished: true },
      },
      { act: "state", statement: { watched: false } },
    ],
  },
  {
    name: "correct-chosen",
    proves: "a choice can be moved to another offered film and carries nothing with it",
    steps: [
      record,
      { act: "state", statement: { chosen: { title: "Prisoners", year: 2013 }, watched: true } },
      { act: "state", statement: { chosen: { title: "Zodiac", year: 2007 } } },
    ],
  },
  {
    name: "chosen-must-be-offered",
    proves: "a choice cannot name a film the evening never offered, and a refusal changes nothing",
    steps: [
      record,
      { act: "state", statement: { chosen: { title: "Prisoners", year: 2013 } } },
      { act: "refused", statement: { chosen: { title: "Heat", year: 1995 } } },
    ],
  },
  {
    name: "forget",
    proves: "a forgotten evening leaves no trace on the public surface",
    steps: [
      record,
      { act: "state", statement: { chosen: { title: "Zodiac", year: 2007 }, watched: true } },
      { act: "forget" },
    ],
  },
  {
    name: "record-state-forget-record",
    proves: "forgetting one evening does not disturb another recorded after it",
    steps: [
      record,
      { act: "state", statement: { watched: true } },
      { act: "forget" },
      { act: "record", request: "something funny instead", offered: [zodiac] },
    ],
  },
];

/**
 * What the user has stated by the end of a trajectory, field by field.
 *
 * Replays the statements in order, so a retraction erases what a previous step
 * established. This is the *expectation* the gates hold the stored episode to —
 * derived from the script rather than from the store, which is what makes a gate
 * able to notice a fact the store holds and the script never mentioned.
 */
export function declared(steps: readonly Step[]): Statement {
  const said: Statement = {};
  for (const step of steps) {
    if (step.act !== "state") continue;
    if ("chosen" in step.statement) said.chosen = step.statement.chosen;
    if ("watched" in step.statement) said.watched = step.statement.watched;
    if ("finished" in step.statement) said.finished = step.statement.finished;
  }
  return said;
}
