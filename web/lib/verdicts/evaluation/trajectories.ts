/**
 * The trajectories that prove M2, and what each one is for.
 *
 * A trajectory is a scripted sequence of calls against the **public tool
 * surface** — the same one a host agent reaches — together with a declaration of
 * what it is supposed to establish. The gates in `gates.ts` then read what
 * recommendation work would be handed and compare it against that declaration.
 *
 * ## Why trajectories rather than snapshots
 *
 * Almost every M2 claim is about a lifecycle: a verdict that was corrected, one
 * that was taken back, a refusal that applied on one evening, a question that
 * ran out of chances. A snapshot cannot tell a withdrawn verdict from one that
 * was never given — both are absent — and that is exactly the difference the
 * milestone rests on. So the gates compare *paths*, and several of them compare
 * two paths that must end in the same place.
 *
 * ## Why pairs
 *
 * The central risk of M2 is that Tonight's own behaviour becomes evidence about
 * the user: it recommends a film, they watch it, and the model quietly decides
 * they like that sort of thing. A single trajectory cannot catch that, because
 * there is nothing to compare the result against. A pair can: the same user, the
 * same taste, one of them with a whole evening behind them and the other with
 * nothing — and the answer must be the same.
 *
 * ## Why the pairs are compared at every step
 *
 * A trajectory that only checks its end state can be right at the end and wrong
 * in the middle — a system that concluded something from *chosen* and unlearned
 * it at *finished* would pass. So the influence trajectories below are written
 * as prefixes of one another, and the gate compares the evidence after **every**
 * step against the same baseline. Where the combined state is the only thing
 * checked, the intermediate states are unproven.
 */

/** A film as the tools take it. */
export type Film = { title: string; year: number };

export type Judgement = "liked" | "loved" | "disliked";
export type Reach = "not-tonight" | "not-ever";
export type Told = "volunteered" | "confirmed";

export type Step =
  /** Tonight offers a film — an episode with it as the lead. */
  | { act: "recommend"; film: Film }
  /** The user says what became of the evening. Never a verdict. */
  | { act: "outcome"; chose?: boolean; watched?: boolean; finished?: boolean }
  /** A film filed with a Phase 1 state, the way it was before M2 existed. */
  | { act: "state"; film: Film; state: "not_seen" | "seen" | "liked" | "loved" | "disliked" }
  /** The user says what they think. The only thing that creates taste evidence. */
  | {
      act: "verdict";
      film: Film;
      told: Told;
      judgement?: Judgement;
      because?: string;
      reach?: Reach;
      reason?: string;
      occasion?: string;
    }
  /** The user takes back what they said, in the scope they said it. */
  | { act: "withdraw"; film: Film; occasion?: string }
  /** Tonight notes that it has something to ask, as of some days ago. */
  | { act: "question"; film: Film; daysAgo: number }
  /** A chance to ask went by unanswered. Stated by a caller, never observed. */
  | { act: "opportunity"; film: Film };

export type Trajectory = {
  name: string;
  /** The invariant this trajectory exists to prove, in one line. */
  proves: string;
  steps: Step[];
};

const prisoners: Film = { title: "Prisoners", year: 2013 };
const zodiac: Film = { title: "Zodiac", year: 2007 };
const heat: Film = { title: "Heat", year: 1995 };

export const FILMS = { prisoners, zodiac, heat };

export const TUESDAY = "evening-tuesday";
export const WEDNESDAY = "evening-wednesday";

/**
 * The taste every trajectory starts from, before its own steps run.
 *
 * Genres, a mix and an unrelated film, given to every user in the evaluation.
 * They exist so that *"nothing else moved"* is a claim with something behind it:
 * a rejection that generalised into a category would have to land somewhere, and
 * without a category in the model there is nowhere for a gate to see it land.
 *
 * The wording avoids the vocabulary gate 7 searches the payload for, so that a
 * baseline can never be mistaken for a leak.
 */
export const BASELINE = {
  genres: [
    { name: "Slow Burn", instruction: "takes its time" },
    { name: "Heist", instruction: "a crew, a plan, a complication" },
  ],
  mixes: [
    { name: "Long Nights", genres: ["Slow Burn"], instruction: "when there is room to let it unfold" },
  ],
  movies: [{ ...heat, state: "loved" as const }],
};

/**
 * Trajectories that must end in the same evidence, and the ones that must not.
 *
 * Named in families where the family is the point. `self-*` is the
 * self-confirmation gate, `influence-*` the non-influence gate, and each has a
 * control whose whole job is to be the thing the others are read against.
 */
export const TRAJECTORIES: readonly Trajectory[] = [
  {
    name: "self-recommended-and-watched",
    proves: "Tonight recommending a film and the user watching it creates no taste evidence",
    steps: [
      { act: "state", film: prisoners, state: "seen" },
      { act: "recommend", film: prisoners },
      { act: "outcome", chose: true, watched: true, finished: true },
    ],
  },
  {
    name: "self-nothing-happened",
    proves: "the same taste with no evening behind it — the control the pair is read against",
    steps: [{ act: "state", film: prisoners, state: "seen" }],
  },
  {
    name: "self-and-they-said-so",
    proves: "only the user saying something introduces evidence the other two do not have",
    steps: [
      { act: "state", film: prisoners, state: "seen" },
      { act: "recommend", film: prisoners },
      { act: "outcome", chose: true, watched: true, finished: true },
      { act: "verdict", film: prisoners, told: "volunteered", judgement: "loved" },
    ],
  },

  {
    name: "withdrawal-reveals-the-state",
    proves: "a withdrawn verdict stops counting and the state underneath it counts again",
    steps: [
      { act: "state", film: prisoners, state: "liked" },
      { act: "verdict", film: prisoners, told: "volunteered", judgement: "disliked" },
      { act: "withdraw", film: prisoners },
    ],
  },
  {
    name: "withdrawal-control",
    proves: "the same film filed the same way, with nothing ever said about it",
    steps: [{ act: "state", film: prisoners, state: "liked" }],
  },

  {
    name: "correction-supersedes",
    proves: "a corrected verdict replaces the one it corrected, which stops counting entirely",
    steps: [
      { act: "verdict", film: prisoners, told: "volunteered", judgement: "loved", because: "the tension never lets up" },
      { act: "verdict", film: prisoners, told: "confirmed", judgement: "disliked" },
    ],
  },

  {
    name: "not-tonight-one-evening",
    proves: "an evening's refusal applies there and nowhere else, leaving the base untouched",
    steps: [
      { act: "verdict", film: prisoners, told: "volunteered", judgement: "loved" },
      { act: "verdict", film: prisoners, told: "confirmed", reach: "not-tonight", reason: "too long", occasion: TUESDAY },
    ],
  },
  {
    name: "not-ever-one-film",
    proves: "a permanent refusal holds for that film in every occasion and generalises to no category",
    steps: [
      { act: "state", film: zodiac, state: "loved" },
      { act: "verdict", film: prisoners, told: "volunteered", reach: "not-ever", reason: "three hours of misery" },
    ],
  },

  {
    name: "reason-in-their-words",
    proves: "the words they gave reach the right film, and a film they gave none for stays reasonless",
    steps: [
      { act: "verdict", film: prisoners, told: "volunteered", judgement: "loved", because: "the tension never lets up" },
      { act: "verdict", film: zodiac, told: "confirmed", judgement: "liked" },
    ],
  },

  /* --- what Tonight did, at every stage of doing it ----------------------- */

  {
    name: "influence-baseline",
    proves: "the taste every influence trajectory must still look like — nothing happened at all",
    steps: [{ act: "state", film: prisoners, state: "seen" }],
  },
  {
    name: "influence-recommended-once",
    proves: "offering a film changes nothing, before anything becomes of the offer",
    steps: [
      { act: "state", film: prisoners, state: "seen" },
      { act: "recommend", film: prisoners },
    ],
  },
  {
    name: "influence-recommended-again",
    proves: "offering the same film over and over is still not evidence about the user",
    steps: [
      { act: "state", film: prisoners, state: "seen" },
      { act: "recommend", film: prisoners },
      { act: "recommend", film: prisoners },
      { act: "recommend", film: prisoners },
    ],
  },
  {
    name: "influence-chosen",
    proves: "taking the recommendation is not liking the film",
    steps: [
      { act: "state", film: prisoners, state: "seen" },
      { act: "recommend", film: prisoners },
      { act: "outcome", chose: true },
    ],
  },
  {
    name: "influence-watched",
    proves: "watching it is not liking it either",
    steps: [
      { act: "state", film: prisoners, state: "seen" },
      { act: "recommend", film: prisoners },
      { act: "outcome", chose: true },
      { act: "outcome", watched: true },
    ],
  },
  {
    name: "influence-finished",
    proves: "sitting through all of it is still not something they said",
    steps: [
      { act: "state", film: prisoners, state: "seen" },
      { act: "recommend", film: prisoners },
      { act: "outcome", chose: true },
      { act: "outcome", watched: true },
      { act: "outcome", finished: true },
    ],
  },
  {
    name: "waiting-a-long-time",
    proves: "a question waiting through chances and weeks adds nothing and sends nothing",
    steps: [
      { act: "state", film: prisoners, state: "seen" },
      { act: "recommend", film: prisoners },
      { act: "question", film: prisoners, daysAgo: 20 },
      { act: "opportunity", film: prisoners },
      { act: "opportunity", film: prisoners },
    ],
  },

  /* --- the two ways a question runs out, at their boundaries --------------- */

  {
    name: "question-out-of-chances",
    proves: "a third unanswered chance retires the question well inside the day limit",
    steps: [
      { act: "question", film: prisoners, daysAgo: 1 },
      { act: "opportunity", film: prisoners },
      { act: "opportunity", film: prisoners },
      { act: "opportunity", film: prisoners },
    ],
  },
  {
    name: "question-out-of-time",
    proves: "the day limit retires a question that has had no chances at all",
    steps: [{ act: "question", film: prisoners, daysAgo: 30 }],
  },
  {
    name: "question-out-of-time-after-one-chance",
    proves: "the day limit does not wait for the chances to run out — one used is still out of time",
    steps: [
      { act: "question", film: prisoners, daysAgo: 30 },
      { act: "opportunity", film: prisoners },
    ],
  },
  {
    name: "question-out-of-time-after-two-chances",
    proves: "the same, one chance short of the other limit — whichever comes first ends it",
    steps: [
      { act: "question", film: prisoners, daysAgo: 30 },
      { act: "opportunity", film: prisoners },
      { act: "opportunity", film: prisoners },
    ],
  },
  {
    name: "question-still-waiting",
    proves: "a question one day and one chance inside both limits is still carried",
    steps: [
      { act: "question", film: prisoners, daysAgo: 29 },
      { act: "opportunity", film: prisoners },
      { act: "opportunity", film: prisoners },
    ],
  },
];

/** The films a trajectory touched, so a gate can look at the right ones. */
export function filmsIn(trajectory: Trajectory): Film[] {
  const seen = new Map<string, Film>();
  for (const step of trajectory.steps) {
    if ("film" in step) seen.set(`${step.film.title} ${String(step.film.year)}`, step.film);
  }
  return [...seen.values()];
}
