/**
 * The five things reflection can do, as scripted histories.
 *
 * M4 lets Tonight notice a pattern and offer it back. The milestone's hard gate
 * — `docs/work/phase-2-implementation.md` §7, and §8 of the architecture — is a
 * single question: *does reflection ever create or mutate a user-authoritative
 * Claim without the required user act?* §5 names the act: **an accepted
 * Proposal is the user act; an unaccepted one expires.**
 *
 * So the boundary is a lifecycle rather than a field. An Observation is
 * Tonight's reading of a history; a Proposal is that reading offered back; and
 * until somebody accepts one, neither may leave a mark on anything the user
 * owns. A Genre the user accepted is an ordinary Genre afterwards — the
 * acceptance is what authorised it, and remembering *that* belongs to the
 * Proposal, not to every Declaration for the rest of its life.
 *
 * ## Why these five and not a matrix
 *
 * The lifecycle has exactly one transition that may write, and four that may
 * not. A larger matrix would multiply the four against subjects and scopes and
 * prove the same thing repeatedly; what has to be separated is the *reasons* a
 * write might wrongly appear:
 *
 * - **noticing** it — an Observation that writes what it noticed;
 * - **saying** it — a Proposal that counts as having been agreed;
 * - **nobody answering** — silence read as consent, which is the failure the
 *   roadmap names when it says an unaccepted Proposal expires;
 * - **being refused** — a rejection that writes anyway, or writes later;
 * - **being accepted** — where the write is finally owed, and where a gate that
 *   only ever forbade writing would be satisfied by a product that can never
 *   propose anything at all.
 *
 * The fifth is why this file is not simply a prohibition. A positive control
 * that nothing can pass by doing nothing is what keeps the other four honest.
 *
 * ## What a step is, before M4 exists
 *
 * The user's steps are real: they go through the same public tools any history
 * here goes through. Reflection's steps — `observe`, `propose`, `ignore`,
 * `reject`, `accept` — name acts that have no implementation yet, and the
 * driver says so rather than pretending. Pre-M4 they perform nothing, the
 * invariant holds because nothing happened, and the mutation probes in
 * `m4.test.ts` are what prove the gates would catch a violation. When M4 lands,
 * the driver wires these steps to the real surface and the same gates bite.
 *
 * The `target` on a proposal is what it *would* create if accepted. It is a
 * description written here for the gate to check against, never a production
 * type: this file may not be the place a Proposal's shape is decided.
 */

/** A film as the tools take it. */
export type Film = { title: string; year: number };

/** What a Proposal would create if somebody accepted it. */
export type Target =
  | { kind: "genre"; name: string; instruction: string }
  | { kind: "mix"; name: string; instruction: string; genres: string[] }
  | { kind: "verdict"; film: Film; judgement: "liked" | "loved" | "disliked" };

export type Step =
  /* ----------------------------------------------- what the user does */
  /** The user writes a genre, in their own words. */
  | { act: "genre"; name: string; instruction: string }
  /** The user writes a mix over genres they already have. */
  | { act: "mix"; name: string; instruction: string; genres: string[] }
  /** The user saves a film, with whether they said they watched it. */
  | { act: "movie"; film: Film; viewing?: "seen" | "unseen"; mixes?: string[] }
  /** The user says what they thought. The only thing that creates taste evidence. */
  | { act: "verdict"; film: Film; judgement: "liked" | "loved" | "disliked" }

  /* ------------------------------------------ what reflection does */
  /**
   * Tonight notices something and writes it down as its own.
   *
   * An Observation is permitted to exist — §5 of the architecture: *reflection
   * may persist its own work*. It is not permitted to act.
   */
  | { act: "observe"; noticed: string; target: Target }
  /** Tonight offers the reading back. Still inert: offering is not agreeing. */
  | { act: "propose"; noticed: string; target: Target }
  /** The conversation moves on. Silence is not consent. */
  | { act: "ignore" }
  /** The user says no. It stays no — §6: a rejected proposal that returns is worse than never proposing. */
  | { act: "reject" }
  /** The user says yes. §5: *an accepted Proposal is the user act.* */
  | { act: "accept" };

export type Trajectory = {
  name: string;
  /** The invariant this trajectory exists to prove, in one line. */
  proves: string;
  steps: Step[];
};

const prisoners: Film = { title: "Prisoners", year: 2013 };
const zodiac: Film = { title: "Zodiac", year: 2007 };

/**
 * The history every trajectory starts from.
 *
 * Enough for a pattern to be visible — two films the user loved, and a genre
 * they wrote — so that an Observation about them is a plausible reading rather
 * than something out of nowhere. A gate proving that nothing moved needs a
 * model that could plausibly have moved.
 */
export const BASELINE: Step[] = [
  { act: "genre", name: "Slow Burn", instruction: "I like films that take their time." },
  { act: "movie", film: prisoners, viewing: "seen" },
  { act: "movie", film: zodiac, viewing: "seen" },
  { act: "verdict", film: prisoners, judgement: "loved" },
  { act: "verdict", film: zodiac, judgement: "loved" },
];

/** What Tonight reads out of that history, in all five trajectories. */
export const NOTICED = "both of the films they loved are restrained thrillers";

export const RESTRAINT: Target = {
  kind: "genre",
  name: "Restrained Thriller",
  instruction: "Tension carried by what is withheld rather than what is shown.",
};

export const TRAJECTORIES: Trajectory[] = [
  {
    name: "observed-only",
    proves: "noticing a pattern writes nothing the user owns and changes no recommendation",
    steps: [...BASELINE, { act: "observe", noticed: NOTICED, target: RESTRAINT }],
  },
  {
    name: "proposed",
    proves: "offering the reading back is not the user having agreed to it",
    steps: [...BASELINE, { act: "observe", noticed: NOTICED, target: RESTRAINT }, { act: "propose", noticed: NOTICED, target: RESTRAINT }],
  },
  {
    name: "proposed-and-ignored",
    proves: "silence is not consent — an unanswered proposal leaves the model as it found it",
    steps: [
      ...BASELINE,
      { act: "observe", noticed: NOTICED, target: RESTRAINT },
      { act: "propose", noticed: NOTICED, target: RESTRAINT },
      { act: "ignore" },
    ],
  },
  {
    name: "proposed-and-rejected",
    proves: "a refused reading writes nothing, then or afterwards",
    steps: [
      ...BASELINE,
      { act: "observe", noticed: NOTICED, target: RESTRAINT },
      { act: "propose", noticed: NOTICED, target: RESTRAINT },
      { act: "reject" },
    ],
  },
  {
    name: "proposed-and-accepted",
    proves: "the accepted change is allowed to become real — the one transition that may write",
    steps: [
      ...BASELINE,
      { act: "observe", noticed: NOTICED, target: RESTRAINT },
      { act: "propose", noticed: NOTICED, target: RESTRAINT },
      { act: "accept" },
    ],
  },
];

/** The four that must leave the user's model exactly as they found it. */
export const WITHOUT_ACCEPTANCE = TRAJECTORIES.filter(
  (one) => !one.steps.some((step) => step.act === "accept"),
);
