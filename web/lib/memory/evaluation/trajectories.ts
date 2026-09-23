/**
 * The histories that prove M3, and what each one is for.
 *
 * A trajectory is a scripted sequence of calls against the **public tool
 * surface** — the one a host agent reaches — together with a declaration of
 * what it is supposed to establish. The gates in `gates.ts` then read the
 * memory view those calls produced and hold it against an expectation worked
 * out from the script itself.
 *
 * ## Why the script has to be readable on its own
 *
 * M3's promise is that Tonight can say what it knows and be corrected. An
 * acceptance gate for that cannot compute what it expects by asking the thing
 * under test — a composer that dropped every evening would agree with itself
 * perfectly. So the steps below are written in the vocabulary of what somebody
 * *did*, and `gates.ts` replays them independently to work out what should have
 * come of it. Two descriptions of the same history, and the gate is the
 * comparison.
 *
 * ## Why forgetting is named rather than referenced
 *
 * A reference is assigned by persistence and nothing here can know one. So a
 * step says *which* act it means — the first one about a film, the taking-back,
 * all of them — and the driver resolves that against what the memory view
 * offers. That is also the honest test of the handle: if the view does not give
 * a usable reference, the trajectory cannot run at all.
 *
 * ## Why two of these are generated
 *
 * The precedence policy is a matrix — every Movie state against every reach a
 * refusal has, and every state against every judgement — and writing twenty-four
 * films out by hand invites the one omission that matters. The two generators
 * below enumerate it, so a state or a reach added to the product shows up here
 * as a missing case rather than as a case nobody thought to write.
 */

export type Film = { title: string; year: number };
export type MovieState = "not_seen" | "seen" | "liked" | "loved" | "disliked";
export type Told = "volunteered" | "confirmed";
export type Offer = { title: string; year: number; lead: boolean };

/** Which act a forgetting step means, since it cannot name a reference. */
export type Which = "first" | "last" | "withdrawal" | "all";

export type Step =
  /** A genre the user wrote. */
  | { act: "genre"; name: string; instruction: string }
  /** A mix over genres they already have. */
  | { act: "mix"; name: string; genres: string[]; instruction: string }
  /**
   * A film filed under a Phase-1 state, with whatever else they filed about it.
   *
   * `imdbId` and `mixes` are the two things a saved film carries beyond its
   * name and its state, and both are here so that a history can hold a film
   * that is not empty. A film's mixes are set from the film's side, which is
   * also how a mix comes to have films in it — so one scripted movie with a
   * mix name in it is what gives that mix a non-empty membership.
   */
  | { act: "movie"; film: Film; state: MovieState | null; imdbId?: string; mixes?: string[] }
  /** Something they said about a film. */
  | {
      act: "verdict";
      film: Film;
      told: Told;
      judgement?: "liked" | "loved" | "disliked";
      because?: string;
      reach?: "not-tonight" | "not-ever";
      reason?: string;
      occasion?: string;
    }
  /** Taking one back, in the scope it was made in. */
  | { act: "withdraw"; film: Film; occasion?: string }
  /** An evening Tonight was part of. */
  | { act: "evening"; request: string; offered: Offer[] }
  /** What became of the most recent evening. Never a verdict. */
  | { act: "outcome"; chosen?: Offer | null; watched?: boolean | null; finished?: boolean | null }
  /**
   * Putting the most recent evening right.
   *
   * `refused` declares that this correction is not a legal one and that the
   * evening must come through it untouched. The replay works out refusal for
   * itself from the same rule the product states — that a choice they made has
   * to stay inside the list of films Tonight offered — and a contract holds the
   * two answers against each other, so neither the flag nor the replay can drift
   * alone.
   */
  | {
      act: "amend";
      request?: string;
      offered?: Offer[];
      chosen?: Offer | null;
      watched?: boolean | null;
      finished?: boolean | null;
      refused?: true;
    }
  /** Removing one thing they said, or all of it, about a film. */
  | { act: "forget"; film: Film; which: Which }
  /** Tonight notes it has something to ask. Operational, never memory. */
  | { act: "question"; film: Film; daysAgo: number }
  /** A chance to ask went by. Operational, never memory. */
  | { act: "opportunity"; film: Film };

export type Trajectory = {
  name: string;
  /** The invariant this history exists to prove, in one line. */
  proves: string;
  steps: Step[];
};

const prisoners: Film = { title: "Prisoners", year: 2013 };
const zodiac: Film = { title: "Zodiac", year: 2007 };
const heat95: Film = { title: "Heat", year: 1995 };
const heat86: Film = { title: "Heat", year: 1986 };
const blackBag: Film = { title: "Black Bag", year: 2025 };

export const FILMS = { prisoners, zodiac, heat95, heat86, blackBag };
export const TUESDAY = "evening-tuesday";

const offer = (film: Film, lead = false): Offer => ({ ...film, lead });

/* ------------------------------------------------------- the two matrices */

/**
 * Every Movie state, including the two that are not experience and the one that
 * is silence. A state added to the product and not added here leaves a row of
 * the precedence policy unproven.
 */
const STATES: readonly (MovieState | null)[] = [
  "liked",
  "loved",
  "disliked",
  "seen",
  "not_seen",
  null,
];

/** The three states that say how somebody felt, as opposed to what they did. */
const RATED = ["liked", "loved", "disliked"] as const;

const named = (state: MovieState | null): string => state ?? "never-told";

/** Every state against both reaches a refusal has. */
function rejectionMatrix(): Step[] {
  const steps: Step[] = [];
  for (const state of STATES) {
    for (const reach of ["not-ever", "not-tonight"] as const) {
      const film: Film = { title: `Refused ${named(state)} ${reach}`, year: 2001 };
      steps.push({ act: "movie", film, state });
      steps.push({
        act: "verdict",
        film,
        told: "confirmed",
        reach,
        reason: `turned down ${reach}`,
        // Each evening belongs to exactly one film here, so a refusal that
        // escaped its own occasion would land somewhere it can be seen.
        ...(reach === "not-tonight" ? { occasion: `evening-${named(state)}` } : {}),
      });
    }
  }
  return steps;
}

/** Every rated state against every judgement, and the unrated states against one. */
function judgementMatrix(): Step[] {
  const steps: Step[] = [];
  for (const state of STATES) {
    const rated = RATED.includes(state as (typeof RATED)[number]);
    for (const judgement of RATED) {
      // An unrated state cannot agree or disagree with any judgement, so one
      // case proves the row; a rated state needs all three, because the case
      // that matters is the judgement that repeats the state.
      if (!rated && judgement !== "disliked") continue;
      const film: Film = { title: `Judged ${named(state)} ${judgement}`, year: 2002 };
      steps.push({ act: "movie", film, state });
      steps.push({
        act: "verdict",
        film,
        told: "volunteered",
        judgement,
        because: `they said ${judgement}`,
      });
    }
  }
  return steps;
}

/* ------------------------------------------- the two Unicode counterexamples */

/**
 * `İ` lowercases to `i` plus a combining dot in JavaScript and folds to plain
 * `i` in Postgres; `Ⱟ` and `ⱟ` are a case pair JavaScript knows and some
 * collations do not. They are two films and one film respectively, and Slice 3
 * settled that in `lib/films/identity.ts`. What is proved here is only that
 * every layer still consults that one rule.
 */
const ISTANBUL_DOTTED: Film = { title: "İstanbul File", year: 2020 };
const ISTANBUL_PLAIN: Film = { title: "istanbul File", year: 2020 };
const GLAGOLITIC_UPPER: Film = { title: "Ⱟ Dossier", year: 2020 };
const GLAGOLITIC_LOWER: Film = { title: "ⱟ dossier", year: 2020 };

export const TRAJECTORIES: readonly Trajectory[] = [
  /* ------------------------------------------------ fidelity and placement */

  {
    name: "one-of-everything",
    proves: "every kind of root Tonight can hold arrives once, in the part it belongs to",
    steps: [
      { act: "genre", name: "Slow Burn", instruction: "takes its time" },
      { act: "genre", name: "Heist", instruction: "a crew and a plan" },
      { act: "mix", name: "Long Nights", genres: ["Slow Burn"], instruction: "room to unfold" },
      // One film with everything a film can carry, and one with none of it, so
      // that empty membership and empty identifiers are proved to be empty
      // rather than assumed.
      { act: "movie", film: heat95, state: "loved", imdbId: "tt0113277", mixes: ["Long Nights"] },
      { act: "movie", film: zodiac, state: "seen" },
      { act: "verdict", film: prisoners, told: "volunteered", judgement: "loved", because: "the tension never lets up" },
      { act: "evening", request: "something tense", offered: [offer(heat95, true), offer(zodiac)] },
      { act: "outcome", chosen: offer(heat95, true), watched: true },
    ],
  },
  {
    name: "everything-they-stopped-saying",
    proves: "a replaced verdict, a taken-back one and the taking-back itself are all still there, and none of them stands",
    steps: [
      { act: "verdict", film: prisoners, told: "volunteered", judgement: "loved" },
      { act: "verdict", film: prisoners, told: "confirmed", judgement: "disliked" },
      { act: "withdraw", film: prisoners },
    ],
  },
  {
    name: "many-evenings",
    proves: "every evening is remembered, however many there are and however they went",
    steps: [
      { act: "evening", request: "first night", offered: [offer(heat95, true)] },
      { act: "outcome", chosen: offer(heat95, true), watched: true, finished: true },
      { act: "evening", request: "second night", offered: [offer(zodiac, true)] },
      { act: "outcome", watched: false },
      { act: "evening", request: "third night", offered: [] },
      { act: "evening", request: "fourth night", offered: [offer(prisoners, true), offer(blackBag)] },
      { act: "outcome", chosen: offer(prisoners, true) },
    ],
  },

  /* -------------------------------------------------- precedence and scope */

  {
    name: "a-verdict-against-a-state",
    proves: "a film filed one way and spoken of another leaves both roots held and says which governs",
    steps: [
      { act: "movie", film: blackBag, state: "liked" },
      { act: "verdict", film: blackBag, told: "volunteered", judgement: "disliked" },
    ],
  },
  {
    name: "the-state-comes-back",
    proves: "taking the verdict back removes the overlay and the saved state applies again",
    steps: [
      { act: "movie", film: blackBag, state: "liked" },
      { act: "verdict", film: blackBag, told: "volunteered", judgement: "disliked" },
      { act: "withdraw", film: blackBag },
    ],
  },
  {
    name: "never-again",
    proves: "a permanent refusal over a loved film is a global conflict and stays a refusal",
    steps: [
      { act: "movie", film: blackBag, state: "loved" },
      { act: "verdict", film: blackBag, told: "confirmed", reach: "not-ever", reason: "three hours of misery" },
    ],
  },
  {
    name: "not-on-a-tuesday",
    proves: "an evening's refusal governs that evening and makes no global claim",
    steps: [
      { act: "movie", film: blackBag, state: "loved" },
      { act: "verdict", film: blackBag, told: "confirmed", reach: "not-tonight", reason: "too long", occasion: TUESDAY },
    ],
  },
  {
    name: "two-negatives-agree",
    proves: "a refusal beside a disliked film is not a disagreement and invents no conflict",
    steps: [
      { act: "movie", film: blackBag, state: "disliked" },
      { act: "verdict", film: blackBag, told: "confirmed", reach: "not-ever" },
    ],
  },
  {
    name: "watching-is-not-an-opinion",
    proves: "a `seen` film is not contradicted by a verdict, because it never said how it went",
    steps: [
      { act: "movie", film: blackBag, state: "seen" },
      { act: "verdict", film: blackBag, told: "volunteered", judgement: "disliked" },
    ],
  },

  /* ------------------------------------------------------------ forgetting */

  {
    name: "forget-the-first",
    proves: "removing the earliest thing they said leaves the rest, and silence still stands",
    steps: [
      { act: "movie", film: prisoners, state: "liked" },
      { act: "verdict", film: prisoners, told: "volunteered", judgement: "loved" },
      { act: "verdict", film: prisoners, told: "confirmed", judgement: "liked" },
      { act: "withdraw", film: prisoners },
      { act: "forget", film: prisoners, which: "first" },
    ],
  },
  {
    name: "forget-the-second",
    proves: "removing the later verdict leaves the rest, and silence still stands",
    steps: [
      { act: "movie", film: prisoners, state: "liked" },
      { act: "verdict", film: prisoners, told: "volunteered", judgement: "loved" },
      { act: "verdict", film: prisoners, told: "confirmed", judgement: "liked" },
      { act: "withdraw", film: prisoners },
      { act: "forget", film: prisoners, which: "last" },
    ],
  },
  {
    name: "forget-the-taking-back",
    proves: "removing the taking-back lets the verdict it silenced stand again",
    steps: [
      { act: "movie", film: prisoners, state: "liked" },
      { act: "verdict", film: prisoners, told: "volunteered", judgement: "loved" },
      { act: "verdict", film: prisoners, told: "confirmed", judgement: "liked" },
      { act: "withdraw", film: prisoners },
      { act: "forget", film: prisoners, which: "withdrawal" },
    ],
  },
  {
    name: "forget-all-of-it",
    proves: "removing everything they said leaves the film as though they never spoke, and the saved state governs alone",
    steps: [
      { act: "movie", film: prisoners, state: "liked" },
      { act: "verdict", film: prisoners, told: "volunteered", judgement: "loved" },
      { act: "verdict", film: prisoners, told: "confirmed", judgement: "liked" },
      { act: "withdraw", film: prisoners },
      { act: "forget", film: prisoners, which: "all" },
    ],
  },

  /* ------------------------------------------------------ correcting a night */

  {
    name: "the-night-was-wrong",
    proves: "a misrecorded evening can be put right whole, and what was corrected becomes theirs",
    steps: [
      { act: "evening", request: "something tense", offered: [offer(heat95, true)] },
      { act: "outcome", chosen: offer(heat95, true), watched: true },
      { act: "amend", request: "something quiet, actually", offered: [offer(zodiac, true)], chosen: offer(zodiac, true) },
    ],
  },
  {
    name: "nothing-was-offered",
    proves: "an evening can be corrected to having named no film, once nothing is left chosen",
    steps: [
      { act: "evening", request: "something tense", offered: [offer(heat95, true)] },
      { act: "outcome", chosen: offer(heat95, true), watched: true },
      { act: "amend", offered: [], chosen: null },
    ],
  },

  /* ------------------------------------------------------------- restraint */

  {
    name: "nothing-was-concluded",
    proves: "a history that invites a pattern produces no root nobody wrote",
    steps: [
      { act: "movie", film: heat95, state: "liked" },
      { act: "movie", film: zodiac, state: "liked" },
      { act: "movie", film: prisoners, state: "liked" },
      { act: "evening", request: "something tense", offered: [offer(heat95, true)] },
      { act: "outcome", chosen: offer(heat95, true), watched: true, finished: true },
      { act: "evening", request: "something tense again", offered: [offer(zodiac, true)] },
      { act: "outcome", chosen: offer(zodiac, true), watched: true, finished: true },
      { act: "evening", request: "more of the same", offered: [offer(prisoners, true)] },
      { act: "outcome", chosen: offer(prisoners, true), watched: true, finished: true },
    ],
  },
  {
    name: "nothing-was-concluded-control",
    proves: "the same taste with none of those evenings — what the history above must still look like",
    steps: [
      { act: "movie", film: heat95, state: "liked" },
      { act: "movie", film: zodiac, state: "liked" },
      { act: "movie", film: prisoners, state: "liked" },
    ],
  },
  {
    name: "waiting-to-ask",
    proves: "a question Tonight is carrying, and the chances that went by, are no part of what it knows about them",
    steps: [
      { act: "movie", film: heat95, state: "liked" },
      { act: "verdict", film: zodiac, told: "volunteered", judgement: "loved" },
      { act: "question", film: prisoners, daysAgo: 10 },
      { act: "opportunity", film: prisoners },
      { act: "opportunity", film: prisoners },
    ],
  },
  {
    name: "waiting-to-ask-control",
    proves: "the same person with nothing waiting — the control the pair is read against",
    steps: [
      { act: "movie", film: heat95, state: "liked" },
      { act: "verdict", film: zodiac, told: "volunteered", judgement: "loved" },
    ],
  },

  /* -------------------------------------------------------------- identity */

  {
    name: "one-film-many-spellings",
    proves: "case and spacing are how a title was typed, not which film it is — one history, one governor",
    steps: [
      { act: "movie", film: blackBag, state: "liked" },
      { act: "verdict", film: blackBag, told: "volunteered", judgement: "loved" },
      { act: "verdict", film: { title: " black   bag ", year: 2025 }, told: "confirmed", judgement: "disliked" },
    ],
  },
  {
    name: "a-remake-is-another-film",
    proves: "the same title in another year is another film, and a verdict about one says nothing about the other",
    steps: [
      { act: "movie", film: heat86, state: "loved" },
      { act: "movie", film: heat95, state: "liked" },
      { act: "verdict", film: heat86, told: "volunteered", judgement: "disliked" },
    ],
  },

  /* ------------------------------------------------------ the whole picture */

  {
    name: "a-long-history",
    proves: "somebody with a real history gets the whole supported picture, with what governs told apart from what is merely remembered",
    steps: [
      { act: "genre", name: "Slow Burn", instruction: "takes its time" },
      { act: "genre", name: "Bleak Procedural", instruction: "hard work, at a cost" },
      { act: "mix", name: "Quiet Dread", genres: ["Slow Burn", "Bleak Procedural"], instruction: "dread that arrives on foot" },
      { act: "movie", film: heat95, state: "loved" },
      { act: "movie", film: zodiac, state: "liked" },
      { act: "movie", film: blackBag, state: "liked" },
      { act: "movie", film: prisoners, state: "seen" },

      // Something they still say, something they replaced, something they took back.
      { act: "verdict", film: blackBag, told: "volunteered", judgement: "disliked", because: "not what I hoped" },
      { act: "verdict", film: zodiac, told: "volunteered", judgement: "liked" },
      { act: "verdict", film: zodiac, told: "confirmed", judgement: "loved", because: "it grew on me" },
      { act: "verdict", film: prisoners, told: "volunteered", judgement: "loved" },
      { act: "withdraw", film: prisoners },
      { act: "verdict", film: heat95, told: "confirmed", reach: "not-tonight", reason: "too long tonight", occasion: TUESDAY },

      // Evenings, one of them misrecorded and put right.
      { act: "evening", request: "something quiet", offered: [offer(zodiac, true), offer(heat95)] },
      { act: "outcome", chosen: offer(zodiac, true), watched: true, finished: true },
      { act: "evening", request: "somethign tense", offered: [offer(prisoners, true)] },
      { act: "amend", request: "something tense" },
    ],
  },

  /* ------------------------------------------- the precedence matrix, in full */

  {
    name: "the-rejection-matrix",
    proves: "every Movie state against both reaches: a refusal contradicts a liking and nothing else, and it never leaves the scope it was said in",
    steps: rejectionMatrix(),
  },
  {
    name: "the-judgement-matrix",
    proves: "every Movie state against every judgement: a judgement contradicts a state only by differing from it, and never an unrated one",
    steps: judgementMatrix(),
  },

  /* ---------------------------------------------- a correction that must not take */

  {
    name: "the-correction-was-refused",
    proves: "a correction that would leave them having chosen a film nobody offered is refused whole, and the evening is not half-changed",
    steps: [
      { act: "evening", request: "something tense", offered: [offer(heat95, true)] },
      { act: "outcome", chosen: offer(heat95, true) },
      { act: "amend", offered: [], refused: true },
    ],
  },

  {
    name: "the-offer-changed-under-the-choice",
    proves: "a choice they kept across a corrected offer list is the entry in the new list, not the one it was made against",
    steps: [
      // They chose Heat when it led. The list is then corrected — same two
      // films, the other one leading — and nothing is said about the choice.
      { act: "evening", request: "something tense", offered: [offer(heat95, true), offer(zodiac)] },
      { act: "outcome", chosen: offer(heat95, true), watched: true },
      { act: "amend", offered: [offer(heat95), offer(zodiac, true)] },
    ],
  },

  /* ------------------------------------------ identity, at the two hard places */

  {
    name: "unicode-is-not-a-collation",
    proves: "İ and i are two films and Ⱟ and ⱟ are one, in every layer at once, because one rule decides and no database does",
    steps: [
      { act: "movie", film: ISTANBUL_DOTTED, state: "liked" },
      { act: "movie", film: ISTANBUL_PLAIN, state: "loved" },
      { act: "movie", film: GLAGOLITIC_UPPER, state: "liked" },
      // Spoken about in the other case each time: the dotted film must take its
      // verdict alone, and the Glagolitic pair must share one history.
      { act: "verdict", film: ISTANBUL_DOTTED, told: "volunteered", judgement: "disliked", because: "not the one I meant" },
      { act: "verdict", film: GLAGOLITIC_LOWER, told: "volunteered", judgement: "disliked", because: "same film, other case" },
    ],
  },
];

/**
 * The two people of the crossing, as scripts rather than as inline calls.
 *
 * Written here so the gate can work out what each of them should hold and
 * compare it exactly, multiplicity included. The films are deliberately the
 * same: a stranger who sees one Black Bag filed as liked is seeing their own,
 * and a stranger who sees two is seeing somebody else's — which no amount of
 * searching the payload for words that are hers alone would ever notice.
 */
export const OWNER_HISTORY: readonly Step[] = [
  { act: "movie", film: blackBag, state: "liked" },
  { act: "verdict", film: blackBag, told: "volunteered", judgement: "disliked", because: "hers alone" },
  { act: "evening", request: "an evening that is hers", offered: [offer(heat95, true)] },
];

export const STRANGER_HISTORY: readonly Step[] = [{ act: "movie", film: blackBag, state: "liked" }];

export const UNICODE_FILMS = {
  dotted: ISTANBUL_DOTTED,
  plain: ISTANBUL_PLAIN,
  upper: GLAGOLITIC_UPPER,
  lower: GLAGOLITIC_LOWER,
};

/** The films a trajectory mentions, so a gate can ask about the right ones. */
export function filmsIn(trajectory: Trajectory): Film[] {
  const seen = new Map<string, Film>();
  for (const step of trajectory.steps) {
    if ("film" in step) seen.set(`${step.film.title} ${String(step.film.year)}`, step.film);
    if (step.act === "evening") {
      for (const one of step.offered) seen.set(`${one.title} ${String(one.year)}`, { title: one.title, year: one.year });
    }
  }
  return [...seen.values()];
}
