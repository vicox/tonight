/**
 * The trajectories that prove M1 under M9's model, and what each one is for.
 *
 * A trajectory is a scripted sequence of calls against the **public tool
 * surface** — `record_episode` (a new evening, or another round of it),
 * `correct_episode`, `forget_episode`, `get_episodes` — together with a
 * declaration of what the user actually stated. The gates in `gates.ts` compare
 * what ended up remembered against what `declared()` replays from the script, so
 * a fact that appears without having been stated is caught by construction
 * rather than by somebody thinking to assert it.
 *
 * ## Why a replay and not the model
 *
 * `declared()` is written from the plan's rules — the merge, F2's one
 * entailment, F5 and F6 — and not by calling `lib/episodes/model.ts`. An oracle
 * that asked the code under test what the answer should be would agree with it
 * by construction.
 *
 * ## Why a few dozen steps and not sixty repetitions
 *
 * M1's subject is a deterministic tool surface: the same call against the same
 * state answers the same way every time, so the matrix covers the state
 * transitions rather than sampling a distribution. Every state an offer's fact
 * can be in, and every way it can move between them, appears below at least
 * once.
 */

/** A film as Tonight put it forward: an element of `offered`. */
export type OfferedFilm = { title: string; year: number; lead: boolean };

/** What they said about one film of the evening: an element of `offers`. */
export type OfferStatement = {
  title: string;
  year: number;
  chosen?: boolean | null;
  started?: boolean | null;
  finished?: boolean | null;
  passed?: boolean | null;
  passReason?: string | null;
};

/** What a `correct_episode` call says, in the shape it accepts — and the retired keys. */
export type Statement = {
  request?: string;
  offered?: OfferedFilm[];
  offers?: OfferStatement[];
  /** Retired top-level keys, only ever sent to prove they are refused. */
  chosen?: unknown;
  watched?: unknown;
  finished?: unknown;
};

/** What a `record_episode` call carries: a new evening, or a round of the subject. */
export type Recording = { request?: string; offered?: OfferedFilm[]; offers?: OfferStatement[] };

export type Step =
  | ({ act: "record" } & Recording)
  /** Another round of the subject evening: `record_episode` with `episode`. */
  | ({ act: "round" } & Omit<Recording, "request">)
  /** A round expected to be refused. The runner checks the evening did not move. */
  | ({ act: "refusedRound" } & Omit<Recording, "request">)
  | { act: "state"; statement: Statement }
  /** A correction expected to be refused. The runner checks the evening did not move. */
  | { act: "refused"; statement: Statement }
  | { act: "forget" };

export type Trajectory = {
  name: string;
  /** The invariant this trajectory exists to prove, in one line. */
  proves: string;
  steps: Step[];
};

export const FACTS = ["chosen", "started", "finished", "passed"] as const;
export type Fact = (typeof FACTS)[number];

const prisoners: OfferedFilm = { title: "Prisoners", year: 2013, lead: true };
const zodiac: OfferedFilm = { title: "Zodiac", year: 2007, lead: false };
const HEAT = { title: "Heat", year: 1995 };
const ARRIVAL = { title: "Arrival", year: 2016 };
const PRISONERS = { title: "Prisoners", year: 2013 };
const ZODIAC = { title: "Zodiac", year: 2007 };

const record: Step = { act: "record", request: "something tense tonight", offered: [prisoners, zodiac] };
const says = (...offers: OfferStatement[]): Step => ({ act: "state", statement: { offers } });
const refuses = (...offers: OfferStatement[]): Step => ({ act: "refused", statement: { offers } });

/** Fifty distinct films, ten per round — the evening's cap, exactly. */
const film = (n: number): OfferedFilm => ({ title: `Film ${String(n)}`, year: 2000 + (n % 20), lead: n % 10 === 1 });
const round = (from: number): OfferedFilm[] => Array.from({ length: 10 }, (_, at) => film(from + at));

export const TRAJECTORIES: readonly Trajectory[] = [
  {
    name: "offered-only",
    proves: "recording an evening establishes no fact about any film — offering is not choosing",
    steps: [record],
  },
  {
    name: "chosen-moves",
    proves: "chosen goes unknown → true → a stated no → unknown, and implies nothing else",
    steps: [
      record,
      says({ ...ZODIAC, chosen: true }),
      says({ ...ZODIAC, chosen: false }),
      says({ ...ZODIAC, chosen: null }),
    ],
  },
  {
    name: "started-moves",
    proves: "started goes unknown → true → a stated no → unknown, and invents no choice",
    steps: [
      record,
      says({ ...PRISONERS, started: true }),
      says({ ...PRISONERS, started: false }),
      says({ ...PRISONERS, started: null }),
    ],
  },
  {
    name: "finished-moves",
    proves: "finished goes true → no → unknown; its entailed start stays as a stated fact (F2)",
    steps: [
      record,
      says({ ...PRISONERS, finished: true }),
      says({ ...PRISONERS, finished: false }),
      says({ ...PRISONERS, finished: null }),
      says({ ...PRISONERS, started: null }),
    ],
  },
  {
    name: "passed-moves",
    proves: "a pass carries their reason, a stated no clears it, and null takes the pass back",
    steps: [
      record,
      says({ ...ZODIAC, passed: true, passReason: "too long for tonight" }),
      says({ ...ZODIAC, passed: false }),
      says({ ...ZODIAC, passed: null }),
    ],
  },
  {
    name: "several-taken",
    proves: "one evening can hold several films chosen, started and finished",
    steps: [
      record,
      says({ ...PRISONERS, chosen: true }, { ...ZODIAC, chosen: true }),
      says({ ...PRISONERS, started: true }, { ...ZODIAC, finished: true }),
    ],
  },
  {
    name: "started-without-chosen",
    proves: "a film can be started without having been chosen, and no choice is invented",
    steps: [record, says({ ...ZODIAC, started: true })],
  },
  {
    name: "finished-precedence",
    proves: "explicit statements beat the entailment: a stated no to starting stops finished alone",
    steps: [
      record,
      says({ ...PRISONERS, started: false }),
      refuses({ ...PRISONERS, finished: true }),
      refuses({ ...PRISONERS, finished: true, started: null }),
      says({ ...PRISONERS, started: true, finished: true }),
    ],
  },
  {
    name: "pass-excludes-taking",
    proves: "a passed film cannot also be chosen or started until the pass is taken back",
    steps: [
      record,
      says({ ...ZODIAC, passed: true, passReason: "not in the mood" }),
      refuses({ ...ZODIAC, chosen: true }),
      refuses({ ...ZODIAC, started: true }),
      says({ ...ZODIAC, passed: null, started: true }),
    ],
  },
  {
    name: "their-film",
    proves: "a film they brought up joins as theirs, and leaves once nothing they said about it stands",
    steps: [record, says({ ...HEAT, started: true }), says({ ...HEAT, started: null })],
  },
  {
    name: "offered-again",
    proves: "a film offered again keeps its place and its facts, and gains the lead it led with",
    steps: [
      record,
      says({ ...ZODIAC, chosen: true }, { ...ARRIVAL, chosen: true }),
      { act: "round", offered: [{ ...HEAT, lead: true }, { ...ZODIAC, lead: false }, { ...ARRIVAL, lead: false }] },
    ],
  },
  {
    name: "round-is-additive",
    proves: "a round fills only what is unknown; changing or retracting is refused whole",
    steps: [
      record,
      says({ ...ZODIAC, started: true, passed: false }),
      { act: "refusedRound", offered: [{ ...HEAT, lead: true }], offers: [{ ...ZODIAC, started: false }] },
      { act: "refusedRound", offers: [{ ...ZODIAC, started: null }] },
      { act: "round", offers: [{ ...ZODIAC, started: true, finished: true }] },
    ],
  },
  {
    name: "evening-cap",
    proves: "an evening holds fifty films across its rounds, and the fifty-first is refused",
    steps: [
      { act: "record", request: "a long night of options", offered: round(1) },
      { act: "round", offered: round(11) },
      { act: "round", offered: round(21) },
      { act: "round", offered: round(31) },
      { act: "round", offered: round(41) },
      { act: "refusedRound", offered: [film(51)] },
      refuses({ title: "One More", year: 2024, chosen: true }),
    ],
  },
  {
    name: "retired-fields-refused",
    proves: "the old evening-level chosen, watched and finished are refused, never stripped",
    steps: [
      record,
      { act: "refused", statement: { chosen: PRISONERS } },
      { act: "refused", statement: { watched: true } },
      { act: "refused", statement: { finished: true, offers: [{ ...PRISONERS, chosen: true }] } },
    ],
  },
  {
    name: "corrected-record",
    proves: "a corrected request and offer list become theirs, and a choice outlives its offer",
    steps: [
      record,
      says({ ...ZODIAC, chosen: true }),
      { act: "state", statement: { request: "something tense, but short", offered: [prisoners] } },
    ],
  },
  {
    name: "their-own-evening",
    proves: "an evening they started holds only their film, and is deleted when that film goes (F6)",
    steps: [
      { act: "record", offers: [{ ...HEAT, started: true }] },
      says({ ...HEAT, started: null }),
    ],
  },
  {
    name: "forget",
    proves: "a forgotten evening leaves no trace on the public surface",
    steps: [record, says({ ...ZODIAC, chosen: true, started: true }), { act: "forget" }],
  },
  {
    name: "record-state-forget-record",
    proves: "forgetting one evening does not disturb another recorded after it",
    steps: [
      record,
      says({ ...ZODIAC, started: true }),
      { act: "forget" },
      { act: "record", request: "something funny instead", offered: [zodiac] },
    ],
  },
];

/* --------------------------------------------------------------- the replay */

/** One film of the evening as the script says it should now be. */
export type DeclaredOffer = {
  title: string;
  year: number;
  offered: boolean;
  lead: boolean;
  chosen: boolean | null;
  started: boolean | null;
  finished: boolean | null;
  passed: boolean | null;
  passReason?: string;
};

/** The subject evening as the script says it should now be. */
export type Declared = {
  /** False once forgotten, or deleted by F6. */
  exists: boolean;
  request: string | null;
  requestSource: "observed" | "stated";
  offeredSource: "observed" | "stated";
  offers: DeclaredOffer[];
};

const same = (one: { title: string; year: number }, other: { title: string; year: number }) =>
  one.title === other.title && one.year === other.year;

const blank = (film: { title: string; year: number }, offered: boolean, lead: boolean): DeclaredOffer => ({
  title: film.title,
  year: film.year,
  offered,
  lead,
  chosen: null,
  started: null,
  finished: null,
  passed: null,
});

/**
 * Applies what was said about films, as the plan defines it: a fact left out
 * stays, `null` takes it back, `finished: true` over an unknown start records the
 * start (F2), the reason follows the pass (F4), and a film not in the evening
 * joins as theirs.
 */
function hear(offers: DeclaredOffer[], said: readonly OfferStatement[] = []): DeclaredOffer[] {
  const next = offers.map((offer) => ({ ...offer }));
  for (const statement of said) {
    let offer = next.find((one) => same(one, statement));
    if (!offer) {
      offer = blank(statement, false, false);
      next.push(offer);
    }
    for (const fact of FACTS) {
      const value = statement[fact];
      if (value !== undefined) offer[fact] = value;
    }
    if (offer.finished === true && offer.started === null) offer.started = true;
    if (statement.passReason !== undefined) {
      if (statement.passReason === null) delete offer.passReason;
      else offer.passReason = statement.passReason;
    }
    if (offer.passed !== true && statement.passReason === undefined) delete offer.passReason;
  }
  return next;
}

/** F5: a film they brought up stays only while something they said about it stands. */
const standing = (offers: DeclaredOffer[]) =>
  offers.filter((offer) => offer.offered || FACTS.some((fact) => offer[fact] !== null));

/**
 * What the subject evening — the first one the script records — should be at
 * the end, replayed from the steps expected to succeed. Refused steps change
 * nothing, which is exactly what the runner checks around each of them.
 */
export function declared(steps: readonly Step[]): Declared {
  const evening: Declared = {
    exists: false,
    request: null,
    requestSource: "observed",
    offeredSource: "observed",
    offers: [],
  };
  let recorded = false;

  for (const step of steps) {
    if (step.act === "record") {
      if (recorded) continue; // a later evening, not the subject
      recorded = true;
      evening.exists = true;
      evening.request = step.request ?? null;
      evening.offers = hear(
        (step.offered ?? []).map((one) => blank(one, true, one.lead)),
        step.offers,
      );
    } else if (step.act === "round") {
      const offers = evening.offers.map((offer) => ({ ...offer }));
      for (const one of step.offered ?? []) {
        const there = offers.find((offer) => same(offer, one));
        if (there) {
          there.offered = true;
          there.lead = there.lead || one.lead;
        } else {
          offers.push(blank(one, true, one.lead));
        }
      }
      evening.offers = hear(offers, step.offers);
    } else if (step.act === "state") {
      const { request, offered, offers } = step.statement;
      if (request !== undefined) {
        evening.request = request;
        evening.requestSource = "stated";
      }
      if (offered !== undefined) {
        evening.offers = evening.offers.map((offer) => {
          const listed = offered.find((one) => same(offer, one));
          return listed ? { ...offer, offered: true, lead: listed.lead } : { ...offer, offered: false, lead: false };
        });
        for (const one of offered) {
          if (!evening.offers.some((offer) => same(offer, one))) evening.offers.push(blank(one, true, one.lead));
        }
        evening.offeredSource = "stated";
      }
      evening.offers = standing(hear(evening.offers, offers));
      // F6: an evening with no request lives only while it holds a film.
      if (evening.request === null && evening.offers.length === 0) evening.exists = false;
    } else if (step.act === "forget") {
      evening.exists = false;
    }
  }
  return evening;
}
