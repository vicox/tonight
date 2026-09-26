import { filmKey } from "../../films/identity.ts";
import { OWNER_HISTORY, STRANGER_HISTORY, UNICODE_FILMS } from "./trajectories.ts";
import type { Film, Offer, Step, Trajectory, Viewing } from "./trajectories.ts";

/**
 * The M3 gates: can Tonight say what it knows, and can it be corrected?
 *
 * ## What these are for, and what they are not
 *
 * Slices 1 to 5 are the implementation and each carries its own contracts.
 * These are acceptance gates for the milestone as a whole, and they ask the
 * question the milestone exists to answer: somebody with a real history asks
 * *"what do you know about me?"*, and the answer has to be complete, has to
 * tell what governs from what is merely remembered, has to say where each piece
 * came from, and has to be correctable — without Tonight quietly acquiring a
 * belief nobody gave it.
 *
 * ## Why nothing here asks the composer what to expect
 *
 * Because it would agree with itself. A composer that dropped every evening
 * would pass a gate that computed its expectation by composing. So `expected`
 * below replays the trajectory's own script — a second, deliberately naive
 * statement of the M3 contract — and the gates compare that against what the
 * public surface actually returned. Two descriptions of one history.
 *
 * The one thing imported from the implementation is `filmKey`, and that is
 * deliberate: which two spellings are one film is a settled product rule with
 * its own contracts in Slice 3, and gate L's job is to prove every layer still
 * uses *that* rule rather than to invent a third one here.
 *
 * ## Why the comparison is a signature and not a count
 *
 * A count passes while two roots swap places, while a mix keeps its name and
 * loses its meaning, while a verdict keeps its film and changes its words. So
 * every gate below compares **complete semantic signatures** as multisets:
 * everything about a root that the script can predict, in one canonical string.
 *
 * What a signature leaves out is only what persistence assigns and no script
 * can know — the instants, the references, the episode ids. Those are not
 * dropped from the evaluation; they are proved by the properties that *are*
 * predictable, and each of those has a gate: a verdict's provenance instant must
 * be the one its own claim carries (C), a reference must name the root it is
 * shown on and must survive a forgetting of something else unchanged (F, M), an
 * id must be the one a correction actually reaches (M).
 *
 * ## Why all of these are deterministic
 *
 * Every question below is a question about a payload: is this root here, is it
 * in this part, does it carry this reference, did that store move. None of them
 * is a question about meaning. Whether the *prose* a model produces from a
 * faithful payload is itself honest is genuinely semantic, needs a sweep, and is
 * Slice 7's subject — see `LIMITS`.
 */

/* --------------------------------------------------------------- the shapes */

export type Basis = { kind: string } & Record<string, unknown>;
export type Handle = { by: string } & Record<string, unknown>;

export type Root = {
  placement: string;
  of: string;
  basis: Basis;
  handle: Handle;
} & Record<string, unknown>;

export type Memory = { held: Root[]; remembered: Root[] };

/** The taste model, as `get_taste` hands it to recommendation work. */
export type Taste = {
  /** Never present any more. Read so that its return is a failure, not a silence. */
  disagreements?: Record<string, unknown>[];
  genres: Record<string, unknown>[];
  mixes: Record<string, unknown>[];
  movies: Record<string, unknown>[];
  verdicts?: Record<string, unknown>[];
};

/** A row as its own store holds it: the two instants persistence keeps. */
export type Stamped = {
  name?: string;
  title?: string;
  year?: number;
  createdAt: string | null;
  updatedAt: string;
};

/**
 * Everything one store held.
 *
 * Two uses, and they are different. Compared whole, it proves a read moved none
 * of it. Read field by field, it is the **authority** a displayed provenance is
 * held against: the memory view says when a row was written, and only the row
 * itself can say whether that is true.
 */
export type Stores = {
  taste: { genres: Stamped[]; mixes: Stamped[]; movies: Stamped[] };
  acts: unknown;
  episodes: { id: string; recordedAt: string }[];
};

export type Observed = {
  trajectory: Trajectory;
  /** What `get_memory` returned at the end. */
  memory: Memory;
  /** The same call again, to prove it is an answer rather than an event. */
  memoryAgain: Memory;
  /** What `get_taste` returned at the end — recommendation-active evidence. */
  taste: Taste;
  /** Every store before and after the memory view was read several times. */
  before: Stores;
  after: Stores;
  /** The view just before a forgetting, and the references that were forgotten. */
  forgetting: { before: Memory; removed: string[] } | null;
  /** The view either side of a correction the product was obliged to refuse. */
  atomicity: { before: Memory; after: Memory } | null;
};

export type Crossing = {
  /** What the stranger's own memory view held. */
  theirs: Memory;
  /** The owner's view, after the stranger had tried everything. */
  owner: Memory;
  /** Whether the owner's view came through the crossing unchanged. */
  intact: boolean;
  /** And whether the stranger's own did. */
  strangerIntact: boolean;
  /**
   * The complete answers to forgetting somebody else's act and forgetting
   * nothing at all, with the caller's own reference blanked out of both.
   */
  forgetting: { foreign: string; unknown: string };
  /** The same, for correcting somebody else's evening and an evening nobody has. */
  correcting: { foreign: string; unknown: string };
};

/**
 * A round trip through the public view: what it showed, what was changed using
 * only the handles it showed, and what it showed afterwards.
 */
export type Handled = {
  before: Memory;
  after: Memory;
  /** The three handles taken out of `before` and used. */
  used: { ref: string; episode: string; film: { title: string; year: number } };
  /** Their neighbours, which nothing touched and which must not have moved. */
  spared: { ref: string; episode: string; film: { title: string; year: number } };
  /**
   * The act about the film that *is* changed — the cross-root neighbour.
   *
   * `spared` proves one act, one evening and one film survive their own kind
   * being changed. This proves the other direction, which only exists because
   * the roots were split: what somebody said about a film is not touched by
   * refiling that same film, even though both are about it.
   */
  across: { ref: string };
};

export type World = { seen: Record<string, Observed>; crossing: Crossing; handled: Handled };

export type Failure = { gate: string; trajectory: string; detail: string };
export type Gate = (world: World) => Failure[];

/* ------------------------------------------------- the independent replay */

/** What a verdict act became, in the words this file uses. */
export type Fate = "current" | "superseded" | "withdrawn";

/** What somebody asserted, flattened to the fields a script can predict. */
export type Assertion =
  | { about: "judgement"; judgement: string; because: string | null }
  | { about: "rejection"; reach: string; reason: string | null };

export type ExpectedAct = {
  film: Film;
  /** `"everywhere"`, or the name of the evening it was said in. */
  scope: string;
  said: "verdict" | "withdrawal";
  /** `null` for a taking-back, which asserts nothing. */
  assertion: Assertion | null;
  /** `null` for a taking-back, which was neither volunteered nor confirmed. */
  told: string | null;
  /** `null` for a taking-back, which is the fate something else had. */
  fate: Fate | null;
  placement: "held" | "remembered";
};

/** A fact the user stated, or the honest absence of one. */
export type Established =
  | { known: false }
  | { known: true; value: unknown; source: "stated" };

export type ExpectedEvening = {
  request: string;
  requestSource: "observed" | "stated";
  offered: Offer[];
  offeredSource: "observed" | "stated";
  chosen: Established;
  watched: Established;
  finished: Established;
};


export type ExpectedMix = {
  name: string;
  genres: string[];
  instruction: string;
  /** The films in it, which are put there from each film's own side. */
  films: { title: string; year: number }[];
};

export type ExpectedMovie = {
  film: Film;
  viewing: Viewing | null;
  imdbId: string | null;
  mixes: string[];
};

export type Expected = {
  genres: { name: string; instruction: string }[];
  mixes: ExpectedMix[];
  movies: ExpectedMovie[];
  acts: ExpectedAct[];
  evenings: ExpectedEvening[];
  /** The steps this replay works out the product is obliged to refuse whole. */
  refusals: number[];
};

const UNKNOWN: Established = { known: false };
const stated = (value: unknown): Established => ({ known: true, value, source: "stated" });

/**
 * The rule a conflict cites, written out here rather than imported.
 *
 * It is a constant in `lib/memory/model.ts` and importing it would be harmless,
 * but the whole discipline of this file is that an expectation is stated twice
 * and compared. A one-line rule is exactly the kind of thing that should be.
 */

/**
 * What a history should have come to, worked out from the script alone.
 *
 * Deliberately naive and deliberately separate. It restates the M3 contract in
 * the plainest way it can be stated:
 *
 * - the last thing said in a film's scope is what stands; a taking-back leaves
 *   the scope empty; a claim a later claim replaced is superseded and one a
 *   taking-back silenced is withdrawn;
 * - an evening is a fact, never a preference, and a correction to one either
 *   applies whole or is refused whole — a choice they stated has to stay inside
 *   the list of films Tonight offered, and is rebound to the entry in it;
 * - a saved film and a verdict are two roots about one film, and neither is
 *   read from the other: the film says whether it was watched, the verdict says
 *   what they thought, and nothing ranks them.
 *
 * None of it is computed by asking the implementation. That is the point.
 */
export function expected(steps: readonly Step[]): Expected {
  const genres = new Map<string, { name: string; instruction: string }>();
  const mixes = new Map<string, ExpectedMix>();
  const movies = new Map<string, ExpectedMovie>();
  const evenings: ExpectedEvening[] = [];
  const refusals: number[] = [];

  // Acts are kept in the order they were performed, with their fate filled in
  // afterwards; a fate is a fact about what came later.
  type Pending = ExpectedAct & { alive: boolean };
  const acts: Pending[] = [];

  steps.forEach((step, at) => {
    switch (step.act) {
      case "genre":
        genres.set(step.name, { name: step.name, instruction: step.instruction });
        break;
      case "mix":
        mixes.set(step.name, {
          name: step.name,
          genres: step.genres,
          instruction: step.instruction,
          // Filled in below: a mix's films arrive from the films' side, so they
          // are not known until every film in the history has been filed.
          films: [],
        });
        break;
      case "movie":
        movies.set(filmKey(step.film), {
          film: step.film,
          viewing: step.viewing,
          imdbId: step.imdbId ?? null,
          mixes: step.mixes ?? [],
        });
        break;
      case "verdict":
        acts.push({
          film: step.film,
          scope: step.occasion ?? "everywhere",
          said: "verdict",
          assertion:
            step.judgement === undefined
              ? { about: "rejection", reach: step.reach!, reason: step.reason ?? null }
              : { about: "judgement", judgement: step.judgement, because: step.because ?? null },
          told: step.told,
          fate: "current",
          placement: "held",
          alive: true,
        });
        break;
      case "withdraw":
        acts.push({
          film: step.film,
          scope: step.occasion ?? "everywhere",
          said: "withdrawal",
          assertion: null,
          told: null,
          fate: null,
          placement: "remembered",
          alive: true,
        });
        break;
      case "forget": {
        const mine = acts.filter((act) => act.alive && filmKey(act.film) === filmKey(step.film));
        const going =
          step.which === "all"
            ? mine
            : step.which === "withdrawal"
              ? mine.filter((act) => act.said === "withdrawal")
              : step.which === "first"
                ? mine.filter((act) => act.said === "verdict").slice(0, 1)
                : mine.filter((act) => act.said === "verdict").slice(-1);
        for (const act of going) act.alive = false;
        break;
      }
      case "evening":
        evenings.push({
          request: step.request,
          requestSource: "observed",
          offered: [...step.offered],
          offeredSource: "observed",
          chosen: UNKNOWN,
          watched: UNKNOWN,
          finished: UNKNOWN,
        });
        break;
      case "outcome":
      case "amend": {
        const night = evenings.at(-1);
        if (!night) break;
        const put = correction(night, step);
        if (put === "refused") refusals.push(at);
        else evenings[evenings.length - 1] = put;
        break;
      }
      default:
        // question and opportunity are Tonight's own bookkeeping. They are not
        // memory about anybody, so they produce nothing here — which is the
        // expectation gate J is built on.
        break;
    }
  });

  // A mix holds the films that named it. Membership is written from the film's
  // side — `update_movie` takes the mixes, `create_mix` does not take the films
  // — so it can only be worked out once every film in the history is filed.
  for (const mix of mixes.values()) {
    mix.films = [...movies.values()]
      .filter((movie) => movie.mixes.includes(mix.name))
      .map((movie) => ({ title: asFiled(movie.film.title), year: movie.film.year }));
  }

  // Fates, per film and per scope, over what survived.
  const living = acts.filter((act) => act.alive);
  const standing = new Map<string, Pending | null>();
  for (const act of living) {
    const lane = `${filmKey(act.film)} ${act.scope}`;
    const held = standing.get(lane) ?? null;
    if (act.said === "withdrawal") {
      if (held) held.fate = "withdrawn";
      standing.set(lane, null);
    } else {
      if (held) held.fate = "superseded";
      standing.set(lane, act);
    }
  }
  const stands = new Set([...standing.values()].filter((act): act is Pending => act !== null));
  for (const act of living) {
    if (act.said !== "verdict") continue;
    const current = stands.has(act);
    if (!current && act.fate === "current") act.fate = "superseded";
    act.placement = current ? "held" : "remembered";
  }

  return {
    genres: [...genres.values()],
    mixes: [...mixes.values()],
    movies: [...movies.values()],
    acts: living.map(({ alive, ...act }) => {
      void alive;
      return act;
    }),
    evenings,
    refusals,
  };
}

/**
 * One correction to an evening, or the refusal of it — restated, not imported.
 *
 * The two rules that make this more than a field assignment are Slice 2's and
 * they are both here: a choice carried across a corrected offer list is rebound
 * to the entry in the new list, so the evening read back says what the list
 * says; and a choice that is no longer in the list at all refuses the whole
 * correction, because dropping what they said in order to fit what Tonight
 * wrote down repairs the wrong one of the two.
 */
function correction(
  night: ExpectedEvening,
  step: Extract<Step, { act: "outcome" } | { act: "amend" }>,
): ExpectedEvening | "refused" {
  const asked = step as {
    request?: string;
    offered?: Offer[];
    chosen?: Offer | null;
    watched?: boolean | null;
    finished?: boolean | null;
  };
  const offered = "offered" in asked && asked.offered !== undefined ? [...asked.offered] : night.offered;

  let chosen: Established;
  if ("chosen" in asked) {
    const want = asked.chosen ?? null;
    if (want === null) chosen = UNKNOWN;
    else {
      const among = offered.find((one) => one.title === want.title && one.year === want.year);
      if (!among) return "refused";
      chosen = stated(among);
    }
  } else if (!night.chosen.known) {
    chosen = UNKNOWN;
  } else {
    const had = night.chosen.value as Offer;
    const still = offered.find((one) => one.title === had.title && one.year === had.year);
    if (!still) return "refused";
    chosen = stated(still);
  }

  const flag = (was: Established, key: "watched" | "finished"): Established =>
    key in asked ? (asked[key] === null || asked[key] === undefined ? UNKNOWN : stated(asked[key])) : was;

  return {
    request: "request" in asked && asked.request !== undefined ? asked.request : night.request,
    requestSource: "request" in asked && asked.request !== undefined ? "stated" : night.requestSource,
    offered,
    offeredSource: "offered" in asked && asked.offered !== undefined ? "stated" : night.offeredSource,
    chosen,
    watched: flag(night.watched, "watched"),
    finished: flag(night.finished, "finished"),
  };
}

/* ----------------------------------------------------------------- helpers */

function failer(gate: string, where: string) {
  const failures: Failure[] = [];
  const record = (detail: string) => {
    failures.push({ gate, trajectory: where, detail });
  };
  record.failures = failures;
  return record;
}

const need = (world: World, name: string): Observed => {
  const seen = world.seen[name];
  if (!seen) throw new Error(`the gates need trajectory ${name} and it was not run`);
  return seen;
};

const of = (roots: readonly Root[], kind: string) => roots.filter((root) => root.of === kind);

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, sorted(v)] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** One value as one string, with object key order removed and array order kept. */
const canon = (value: unknown): string => JSON.stringify(sorted(value));

const asSet = (values: readonly unknown[]): string => JSON.stringify([...values].map(canon).sort());

/**
 * A list compared as a set, for the two memberships whose order nobody promises.
 *
 * A mix's films and a film's mixes are both read back through a join, and
 * neither the product nor the script says which comes first. Everything else in
 * a signature keeps its order — an evening's offers above all, where position is
 * part of what was offered.
 */
const membership = (list: unknown): string[] =>
  (Array.isArray(list) ? list : []).map(canon).sort();

/** Everything but a set of keys, one level down. */
const without = (value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

/**
 * What two multisets of signatures disagree about, in words.
 *
 * Both directions, because the failures that matter run both ways: something
 * missing is an omission and something extra is an invention, and a gate that
 * reported only one of them would pass a swap.
 */
function differ(want: readonly string[], got: readonly string[]): string | null {
  const left = [...want].sort();
  const right = [...got].sort();
  if (canon(left) === canon(right)) return null;
  const pool = [...right];
  const missing: string[] = [];
  for (const one of left) {
    const at = pool.indexOf(one);
    if (at === -1) missing.push(one);
    else pool.splice(at, 1);
  }
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing ${JSON.stringify(missing)}`);
  if (pool.length > 0) parts.push(`unexpected ${JSON.stringify(pool)}`);
  return parts.join("; ");
}

/**
 * Two people's memory, comparable.
 *
 * Used **only** where the two sides were produced by two different people doing
 * two different things: every instant in here is the moment a row was written
 * or a sentence was spoken, two people doing the same things do them
 * milliseconds apart, and persistence gives each of them its own references and
 * ids. What a paired gate asks is whether the *content* differs, so those come
 * out — and order comes out too, because nothing promises which root is listed
 * first.
 *
 * It is deliberately **not** used for read purity, where the two sides are one
 * person at two moments and a moved timestamp is exactly the defect being
 * looked for.
 */
const alike = (value: unknown): string =>
  asSet(
    (Array.isArray(value) ? value : [value]).map((one) =>
      JSON.parse(
        JSON.stringify(one, (key, held: unknown) =>
          ["createdAt", "updatedAt", "savedAt", "changedAt", "saidAt", "at", "recordedAt", "ref", "id"].includes(key)
            ? null
            : held,
        ),
      ) as unknown,
    ),
  );

const scopeName = (scope: unknown): string =>
  scope === "everywhere" ? "everywhere" : String((scope as { occasion?: unknown })?.occasion);

type SpokenAct = {
  said: "verdict" | "withdrawal";
  claimant: string;
  film: Film;
  scope: unknown;
  at: string;
  told?: string;
  assertion?:
    | { about: "judgement"; judgement: string; because: string | null }
    | { about: "rejection"; rejection: { reach: string; reason: string | null } };
};

const actOf = (root: Root): SpokenAct => root.act as SpokenAct;

/** An act's assertion, flattened the same way the replay flattens the script's. */
function assertionOf(act: SpokenAct): Assertion | null {
  if (act.said !== "verdict" || !act.assertion) return null;
  return act.assertion.about === "judgement"
    ? { about: "judgement", judgement: act.assertion.judgement, because: act.assertion.because }
    : {
        about: "rejection",
        reach: act.assertion.rejection.reach,
        reason: act.assertion.rejection.reason,
      };
}

/* ------------------------------------------------------- semantic signatures */

/**
 * Everything about a root that the script can predict, as one string.
 *
 * The two builders below have to stay each other's mirror: `wantedRoots` writes
 * one from the replay and `observedRoot` writes one from what came back, and
 * every field that appears in one appears in the other. What is left out is
 * only what persistence assigns — an instant, a reference, an episode id — and
 * each of those is proved separately by a property a script *can* predict.
 */
function observedRoot(root: Root): string {
  const shared = { of: root.of, placement: root.placement, from: root.basis.kind };
  switch (root.of) {
    case "genre":
      return canon({ ...shared, name: root.name, instruction: root.instruction });
    case "mix":
      return canon({
        ...shared,
        name: root.name,
        instruction: root.instruction,
        genres: root.genres,
        films: membership(root.films),
      });
    case "movie":
      return canon({
        ...shared,
        film: filmKey(root.film as Film),
        // The canonical key says which film it is; the spelling says what was
        // filed. Both, because one layer quietly retitling a film would keep
        // the key and change what the user sees.
        title: (root.film as Film).title,
        year: (root.film as Film).year,
        viewing: root.viewing ?? null,
        imdbId: root.imdbId ?? null,
        mixes: membership(root.mixes),
      });
    case "verdict": {
      const act = actOf(root);
      return canon({
        ...shared,
        film: filmKey(act.film),
        // As above: the key proves which film they spoke about, the spelling
        // proves the words were not rewritten into a canonically equal other
        // spelling on the way out.
        title: act.film.title,
        year: act.film.year,
        said: act.said,
        scope: scopeName(act.scope),
        assertion: assertionOf(act),
        told: act.told ?? null,
        fate: (root.basis as { became?: string }).became ?? null,
        claimant: act.claimant,
      });
    }
    case "evening":
      return canon({
        ...shared,
        request: root.request,
        requestSource: root.requestSource,
        offered: root.offered,
        offeredSource: root.offeredSource,
        chosen: root.chosen,
        watched: root.watched,
        finished: root.finished,
      });
    default:
      return canon({ of: root.of, unrecognised: true });
  }
}

const wantedGenre = (one: { name: string; instruction: string }) =>
  canon({ of: "genre", placement: "held", from: "saved", name: one.name, instruction: one.instruction });

const wantedMix = (one: ExpectedMix) =>
  canon({
    of: "mix",
    placement: "held",
    from: "saved",
    name: one.name,
    instruction: one.instruction,
    genres: one.genres,
    films: membership(one.films),
  });

const wantedMovie = (one: ExpectedMovie) =>
  canon({
    of: "movie",
    placement: "held",
    from: "saved",
    film: filmKey(one.film),
    title: asFiled(one.film.title),
    year: one.film.year,
    viewing: one.viewing,
    imdbId: one.imdbId,
    mixes: membership(one.mixes),
  });

const wantedAct = (act: ExpectedAct) =>
  canon({
    of: "verdict",
    placement: act.placement,
    from: "said",
    film: filmKey(act.film),
    title: asSpoken(act.film.title),
    year: act.film.year,
    said: act.said,
    scope: act.scope,
    assertion: act.assertion,
    told: act.told,
    fate: act.fate,
    claimant: "user",
  });

const wantedEvening = (night: ExpectedEvening) =>
  canon({
    of: "evening",
    placement: "remembered",
    from: "evening",
    request: night.request,
    requestSource: night.requestSource,
    offered: night.offered,
    offeredSource: night.offeredSource,
    chosen: night.chosen,
    watched: night.watched,
    finished: night.finished,
  });

/** Every root the script says should be there, as signatures. */
function wantedRoots(want: Expected): string[] {
  return [
    ...want.genres.map(wantedGenre),
    ...want.mixes.map(wantedMix),
    ...want.movies.map(wantedMovie),
    ...want.acts.map(wantedAct),
    ...want.evenings.map(wantedEvening),
  ];
}

/** The same, split by where the contract puts each one. */
function wantedByPlacement(want: Expected): { held: string[]; remembered: string[] } {
  return {
    held: [
      ...want.genres.map(wantedGenre),
      ...want.mixes.map(wantedMix),
      ...want.movies.map(wantedMovie),
      ...want.acts.filter((act) => act.placement === "held").map(wantedAct),
    ],
    remembered: [
      ...want.acts.filter((act) => act.placement === "remembered").map(wantedAct),
      ...want.evenings.map(wantedEvening),
    ],
  };
}

/* ------------------------------------------- what a recommendation may read */

/**
 * The taste model the script says a recommendation should be handed.
 *
 * Built from the scripted taste roots and the independently determined standing
 * verdicts, and deliberately not from the projection under test. The instants
 * are dropped from both sides for the one reason instants are ever dropped
 * here: persistence assigns them and no script can know one.
 */
/**
 * How a title is written down, as opposed to which film it names.
 *
 * Two rules, and the product genuinely has two. A film they **filed** has its
 * whitespace tidied whole, so `"Dune   Part Two"` is stored as `"Dune Part
 * Two"`. A film they **named in a verdict** is only trimmed at the ends,
 * because a verdict records what they said about a film rather than filing the
 * film, and the run of spaces in the middle is how they typed it.
 *
 * Restated here rather than imported, like everything else in the replay.
 * Neither of them is the identity rule: `filmKey` decides which spellings are
 * one film, and these two decide what a spelling is.
 */
const asFiled = (title: string): string => title.split(/\s+/u).filter(Boolean).join(" ");
const asSpoken = (title: string): string => title.trim();

function wantedTaste(want: Expected): Record<string, string> {
  const standingOf = (act: ExpectedAct): string => {
    const said =
      act.assertion?.about === "judgement"
        ? {
            judgement: act.assertion.judgement,
            ...(act.assertion.because === null ? {} : { because: act.assertion.because }),
          }
        : {
            rejected: act.assertion!.reach,
            ...(act.assertion!.reason === null ? {} : { reason: act.assertion!.reason }),
          };
    return canon({
      title: asSpoken(act.film.title),
      year: act.film.year,
      ...said,
      ...(act.scope === "everywhere" ? {} : { occasion: act.scope }),
      told: act.told,
    });
  };

  return {
    genres: asSet(want.genres.map((one) => ({ name: one.name, instruction: one.instruction }))),
    mixes: asSet(
      want.mixes.map((one) => ({
        name: one.name,
        instruction: one.instruction,
        genres: one.genres,
        movies: membership(one.films),
      })),
    ),
    movies: asSet(
      want.movies.map((one) => ({
        title: asFiled(one.film.title),
        year: one.film.year,
        viewing: one.viewing,
        imdbId: one.imdbId,
        mixes: membership(one.mixes),
      })),
    ),
    verdicts: JSON.stringify(
      want.acts
        .filter((act) => act.fate === "current" && act.said === "verdict")
        .map(standingOf)
        .sort(),
    ),
    // Nothing carries two opinions, so a recommendation is never told that two
    // roots disagree. The expectation is that the field is not there at all — a
    // projection reappearing is a payload explaining one root to another, which
    // is the machinery this split removed.
    disagreements: ABSENT,
  };
}

/** What a read says when a field is not there at all, told apart from an empty one. */
const ABSENT = "<field absent>";

const CLOCKS = ["createdAt", "updatedAt"] as const;

/** The same view of what actually came back. */
function observedTaste(taste: Taste): Record<string, string> {
  return {
    genres: asSet(taste.genres.map((one) => without(one, CLOCKS))),
    mixes: asSet(
      taste.mixes.map((one) => ({ ...without(one, CLOCKS), movies: membership(one.movies) })),
    ),
    movies: asSet(
      taste.movies.map((one) => ({ ...without(one, CLOCKS), mixes: membership(one.mixes) })),
    ),
    verdicts: JSON.stringify((taste.verdicts ?? []).map((one) => canon(one)).sort()),
    // Read rather than assumed, so a projection reappearing is a difference
    // against the expectation rather than something nobody looked at.
    disagreements:
      taste.disagreements === undefined ? ABSENT : asSet(taste.disagreements.map((one) => one)),
  };
}

/**
 * The metadata Tonight is not allowed to have, at any depth.
 *
 * All six are the same failure wearing different words: a number, or a moment,
 * that nobody said and that a reader would take for evidence. Checked
 * recursively rather than on the top of a root, because the natural place for a
 * score to appear is inside the thing being scored — `assertion.score` beside a
 * judgement reads as part of the judgement.
 *
 * `because`, `reason`, `told` and every occasion value are deliberately not
 * here. They are what the user said, and forbidding them would forbid the
 * product.
 */
const INVENTED = ["when", "confidence", "score", "relevance", "certainty", "inferred", "weight"];

/** Walks the public memory structures only, and says where it found one. */
function invented(value: unknown, path: string, found: (where: string) => void): void {
  if (Array.isArray(value)) {
    value.forEach((one, at) => {
      invented(one, `${path}[${String(at)}]`, found);
    });
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, held] of Object.entries(value as Record<string, unknown>)) {
    if (INVENTED.includes(key)) found(`${path}.${key}`);
    invented(held, `${path}.${key}`, found);
  }
}

/* ------------------------------------------------------------------ gate A */

/**
 * Fidelity: every root the user made is there, once, whole, and nothing else is.
 *
 * A bijection over complete semantic signatures rather than a count, because
 * the failures that matter keep the count: a mix that holds its name and loses
 * its meaning, a verdict that holds its film and changes its words, an evening
 * that holds its request and loses its offers, one root swapped for another of
 * the same kind. Counted per kind as well, because a whole class going missing
 * is the one failure a signature diff states least clearly.
 */
export function fidelity(world: World): Failure[] {
  const failures: Failure[] = [];

  for (const seen of Object.values(world.seen)) {
    const fail = failer("fidelity", seen.trajectory.name);
    const want = expected(seen.trajectory.steps);
    const all = [...seen.memory.held, ...seen.memory.remembered];

    const counted: [string, number, number][] = [
      ["genre", of(all, "genre").length, want.genres.length],
      ["mix", of(all, "mix").length, want.mixes.length],
      ["movie", of(all, "movie").length, want.movies.length],
      ["verdict", of(all, "verdict").length, want.acts.length],
      ["evening", of(all, "evening").length, want.evenings.length],
    ];
    for (const [kind, got, wanted] of counted) {
      if (got !== wanted) fail(`${String(wanted)} ${kind} root(s) were made and ${String(got)} came back`);
    }

    const gap = differ(wantedRoots(want), all.map(observedRoot));
    if (gap) fail(`what came back is not what was made — ${gap}`);

    // Nothing is in two places.
    const held = seen.memory.held.map((root) => canon(root.handle));
    const twice = seen.memory.remembered.map((root) => canon(root.handle)).filter((one) => held.includes(one));
    if (twice.length > 0) fail(`a root is both held and remembered: ${twice.join(", ")}`);

    // And no evening was dropped for being old.
    if (want.evenings.length > 2 && of(all, "evening").length < want.evenings.length) {
      fail("evenings were truncated");
    }
    failures.push(...fail.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate B */

/**
 * Placement: each root is where the contract puts it, and nowhere else.
 *
 * Compared as two signature multisets rather than two counts, so two acts
 * cannot exchange fates while the totals hold. The rules themselves are short
 * and none of them is negotiable. A saved thing is held. A standing claim is
 * held. Everything else somebody said is remembered. An evening is remembered
 * whatever became of it — that last one carries M1's whole argument, because an
 * evening promoted to held would make watching into liking by presentation.
 */
export function placement(world: World): Failure[] {
  const failures: Failure[] = [];

  for (const seen of Object.values(world.seen)) {
    const fail = failer("placement", seen.trajectory.name);
    const want = wantedByPlacement(expected(seen.trajectory.steps));

    const heldGap = differ(want.held, seen.memory.held.map(observedRoot));
    if (heldGap) fail(`what Tonight holds is not what it should hold — ${heldGap}`);
    const rememberedGap = differ(want.remembered, seen.memory.remembered.map(observedRoot));
    if (rememberedGap) fail(`what Tonight remembers is not what it should remember — ${rememberedGap}`);

    for (const root of seen.memory.held) {
      if (root.placement !== "held") fail(`a held root says it is ${String(root.placement)}`);
      if (root.of === "evening") fail("an evening reached held");
      if (root.of === "verdict" && actOf(root).said === "withdrawal") {
        fail("a taking-back was held as a current preference");
      }
    }
    for (const root of seen.memory.remembered) {
      if (root.placement !== "remembered") fail(`a remembered root says it is ${String(root.placement)}`);
      if (["genre", "mix", "movie"].includes(root.of)) fail(`a saved ${root.of} was demoted to remembered`);
    }

    failures.push(...fail.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate C */

/**
 * Traceability: every root carries the provenance its own store actually has.
 *
 * Three kinds, three shapes, and no fourth. The point is not that a time is
 * present but that the *right* time is: a saved row knows when it was written,
 * a verdict knows when somebody spoke, an evening knows when it was noted down.
 * A single `when` across all three would turn two storage facts into a claim
 * about a conversation.
 *
 * The instants themselves are assigned by persistence and no script can predict
 * one, so what is held against the replay is everything else — claimant, scope,
 * how it came to be said, what became of it, and, for an evening, the complete
 * known/value/source structure of every outcome. The instants are proved by
 * consistency instead: a verdict's provenance time is the instant its own claim
 * carries, and nothing else.
 */
export function traceability(world: World): Failure[] {
  const failures: Failure[] = [];

  for (const seen of Object.values(world.seen)) {
    const fail = failer("traceability", seen.trajectory.name);
    const want = expected(seen.trajectory.steps);
    const all = [...seen.memory.held, ...seen.memory.remembered];

    for (const root of all) {
      const basis = root.basis;
      if (["genre", "mix", "movie"].includes(root.of)) {
        if (basis.kind !== "saved") fail(`a ${root.of} says it was ${String(basis.kind)}`);
        if (!("savedAt" in basis) || !("changedAt" in basis)) fail(`a ${root.of} lost its stored times`);
        if (typeof basis.changedAt !== "string") fail(`a ${root.of} has no change time`);
      }
      if (root.of === "verdict") {
        const act = actOf(root);
        if (basis.kind !== "said") fail(`an act says it was ${String(basis.kind)}`);
        if (basis.claimant !== "user") fail(`an act was claimed by ${String(basis.claimant)}`);
        if (act.claimant !== "user") fail(`an act itself was claimed by ${String(act.claimant)}`);
        if (typeof basis.saidAt !== "string") fail("an act has no speaking time");
        if (basis.saidAt !== act.at) fail("an act's provenance time is not the instant its claim carries");
        if (canon(basis.scope) !== canon(act.scope)) {
          fail(`an act's provenance places it at ${canon(basis.scope)} and the act says ${canon(act.scope)}`);
        }
        if (act.said === "verdict" && !["volunteered", "confirmed"].includes(String(basis.told))) {
          fail(`a verdict came to be said by ${String(basis.told)}`);
        }
        if (act.said === "verdict" && basis.told !== act.told) {
          fail("an act's provenance disagrees with the act about how it came to be said");
        }
        if (act.said === "withdrawal" && "told" in basis) fail("a taking-back claims it was volunteered or confirmed");
        if (act.said === "withdrawal" && "became" in basis) fail("a taking-back was given a fate of its own");
      }
      if (root.of === "evening") {
        if (basis.kind !== "evening") fail(`an evening says it was ${String(basis.kind)}`);
        if (typeof basis.recordedAt !== "string") fail("an evening has no recording time");
        for (const source of ["requestSource", "offeredSource"]) {
          if (!["observed", "stated"].includes(String(root[source]))) {
            fail(`an evening's ${source} is ${String(root[source])}`);
          }
        }
      }
    }

    // Nothing invented, anywhere in what the user is shown — including inside an
    // assertion, which is where a score would naturally be put.
    for (const [part, value] of [
      ["held", seen.memory.held],
      ["remembered", seen.memory.remembered],
    ] as const) {
      invented(value, part, (where) => {
        fail(`${where} is something nobody wrote`);
      });
    }

    // And the instants are the rows' own, not well-shaped strings. The stores
    // are the authority here: only the row can say when it was written, so a
    // fabricated `changedAt` of exactly the right shape dies on the value.
    const stored = seen.after.taste;
    for (const root of all) {
      const basis = root.basis;
      if (["genre", "mix", "movie"].includes(root.of)) {
        const row =
          root.of === "movie"
            ? stored.movies.find(
                (one) => filmKey({ title: String(one.title), year: Number(one.year) }) === filmKey(root.film as Film),
              )
            : (root.of === "genre" ? stored.genres : stored.mixes).find((one) => one.name === root.name);
        if (!row) {
          fail(`a ${root.of} in the view is not in the taste model at all`);
          continue;
        }
        // `savedAt` is `string | null` by contract: a film saved before Tonight
        // recorded creation times has no known moment, and the null survives as
        // null rather than becoming a plausible instant.
        if (!(typeof basis.savedAt === "string" || basis.savedAt === null)) {
          fail(`a ${root.of} says it was saved at ${JSON.stringify(basis.savedAt)}`);
        }
        if (basis.savedAt !== row.createdAt) {
          fail(`a ${root.of} says it was saved at ${JSON.stringify(basis.savedAt)} and the row says ${JSON.stringify(row.createdAt)}`);
        }
        if (basis.changedAt !== row.updatedAt) {
          fail(`a ${root.of} says it changed at ${JSON.stringify(basis.changedAt)} and the row says ${JSON.stringify(row.updatedAt)}`);
        }
      }
      if (root.of === "evening") {
        const written = seen.after.episodes.find((one) => one.id === root.handle.id);
        if (!written) {
          fail("an evening in the view is not in the episode record at all");
          continue;
        }
        if (basis.recordedAt !== written.recordedAt) {
          fail(`an evening says it was written down at ${JSON.stringify(basis.recordedAt)} and the record says ${JSON.stringify(written.recordedAt)}`);
        }
      }
    }

    // What each act's provenance says became of it, against the replay. Placement
    // is left out here on purpose: this asks whether the *label* is right, so a
    // superseded act relabelled withdrawn fails even if it is in the right part.
    const fateOf = (act: ExpectedAct) =>
      canon({ film: filmKey(act.film), scope: act.scope, said: act.said, assertion: act.assertion, told: act.told, fate: act.fate });
    const fateGot = (root: Root) => {
      const act = actOf(root);
      return canon({
        film: filmKey(act.film),
        scope: scopeName(act.scope),
        said: act.said,
        assertion: assertionOf(act),
        told: act.told ?? null,
        fate: (root.basis as { became?: string }).became ?? null,
      });
    };
    const fates = differ(want.acts.map(fateOf), of(all, "verdict").map(fateGot));
    if (fates) fail(`what became of what they said is not what the history says — ${fates}`);

    // An evening's outcomes, each with its complete known/value/source structure.
    const sourced = (night: ExpectedEvening) =>
      canon({
        request: night.request,
        requestSource: night.requestSource,
        offeredSource: night.offeredSource,
        chosen: night.chosen,
        watched: night.watched,
        finished: night.finished,
      });
    const sourcedGot = (root: Root) =>
      canon({
        request: root.request,
        requestSource: root.requestSource,
        offeredSource: root.offeredSource,
        chosen: root.chosen,
        watched: root.watched,
        finished: root.finished,
      });
    const sources = differ(want.evenings.map(sourced), of(all, "evening").map(sourcedGot));
    if (sources) fail(`an evening does not say where its facts came from — ${sources}`);

    failures.push(...fail.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate D */

/**
 * No unauthored belief: nothing appears that nobody wrote.
 *
 * Two proofs, and the verdicts are inside both. The pair is the first:
 * `nothing-was-concluded` gives Tonight three liked films and three finished
 * evenings in the same key — a history that all but asks to be summarised — and
 * its control gives the same three films and no evenings. Held and operative
 * must be identical, because the only difference between the two people is what
 * Tonight did, and what Tonight did is never evidence about them.
 *
 * The second is authorship of every held root, verdicts included: a held root
 * has to match, whole, something the script actually did. An invented verdict
 * with a plausible film, a valid-looking provenance and a real-looking
 * reference does not, and the count it preserves does not save it.
 *
 * A conflict is not checked here and that is deliberate. It is derived — an
 * explanation of two roots that are themselves authored — and treating it as an
 * unauthored belief would forbid Tonight from explaining itself at all.
 */
export function unauthored(world: World): Failure[] {
  const failures: Failure[] = [];
  const fail = failer("no-unauthored-belief", "nothing-was-concluded");
  const tempted = need(world, "nothing-was-concluded");
  const plain = need(world, "nothing-was-concluded-control");

  if (alike(tempted.memory.held) !== alike(plain.memory.held)) {
    fail("three evenings changed what Tonight holds about the person");
  }
  if (alike(tempted.memory.remembered) === alike(plain.memory.remembered)) {
    fail("three evenings left nothing remembered that the control did not have");
  }
  failures.push(...fail.failures);

  for (const seen of Object.values(world.seen)) {
    const here = failer("no-unauthored-belief", seen.trajectory.name);
    const want = wantedByPlacement(expected(seen.trajectory.steps));
    const authored = [...want.held];

    for (const root of seen.memory.held) {
      const got = observedRoot(root);
      const at = authored.indexOf(got);
      if (at === -1) here(`Tonight holds something nobody wrote: ${got}`);
      else authored.splice(at, 1);
    }

    // And no shape from a later milestone has appeared.
    const payload = JSON.stringify(seen.memory).toLowerCase();
    for (const later of ["observation", "proposal", "confidence", "relevance", "prediction", "inferred", "pattern"]) {
      if (payload.includes(`"${later}`)) here(`${later} appeared in what Tonight knows`);
    }
    failures.push(...here.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate E */

/**
 * Independence: two roots about one film, and neither reaching the other.
 *
 * This gate used to be about precedence, because a Movie carried an opinion and
 * a Verdict carried an opinion and the view had to say which governed. Only
 * Verdicts carry opinions now, so there is nothing to rank — and what has to be
 * proved instead is that the split actually holds: saying, withdrawing and
 * forgetting a verdict leave the saved film exactly as it was, and a refusal
 * never arrives as a rating.
 *
 * The comparison is against the replay's own expectation rather than against
 * the production resolver, for the reason every gate here is: a gate that asked
 * the implementation what to expect would reproduce its bug and agree with it.
 */
export function precedence(world: World): Failure[] {
  const failures: Failure[] = [];

  for (const name of [
    "a-verdict-beside-a-saved-film",
    "withdrawal-leaves-the-film-alone",
    "never-again",
    "not-on-a-tuesday",
  ]) {
    const seen = need(world, name);
    const fail = failer("precedence", name);
    const want = expected(seen.trajectory.steps);

    // The film is what the script filed, whatever was said about it afterwards.
    for (const one of want.movies) {
      const held = of(seen.memory.held, "movie").find(
        (root) => filmKey(root.film as Film) === filmKey(one.film),
      );
      if (!held) {
        fail(`${one.film.title} left what Tonight holds when a verdict was recorded`);
        continue;
      }
      if (held.viewing !== one.viewing) {
        fail(
          `a verdict moved ${one.film.title} from ${String(one.viewing)} to ${String(held.viewing)}`,
        );
      }
    }

    // And nothing anywhere resolves one root against the other. A field naming a
    // governor, a saved side or a precedence rule is the machinery this removed.
    const whole = JSON.stringify(seen.memory);
    for (const word of ["operative", "governedBy", "governing", "outranks", "disagree"]) {
      if (whole.includes(word)) fail(`the memory view carries "${word}" again`);
    }

    failures.push(...fail.failures);
  }

  // A refusal is not a rating, wherever it appears.
  for (const name of ["never-again", "not-on-a-tuesday"]) {
    const seen = need(world, name);
    const fail = failer("precedence", name);
    if (JSON.stringify(seen.memory).includes("disliked")) {
      fail("a refusal came back as a dislike");
    }
    failures.push(...fail.failures);
  }

  return failures;
}

/* ------------------------------------------------------------------ gate F */

/**
 * Forgetting: one act goes, nothing else moves, and everything else is worked
 * out again.
 *
 * Four histories, identical but for which act was removed, and the contract's
 * own worked example. Two questions, and both of them matter. What survived has
 * to be *exactly* what should have survived — the same acts, under the same
 * references, word for word, with no act quietly rewritten and no taking-back
 * invented in place of the one that went. And what stands afterwards has to be
 * worked out again from what is left, which is why removing a taking-back has
 * to let the claim it silenced stand once more. That is the whole difference
 * between forgetting and withdrawing.
 *
 * The before-and-after comparison is the one place a gate uses an observation as
 * its own reference, and it is not circular: the claim being tested is that
 * these acts did not change, so the earlier reading is the subject rather than
 * the oracle. What should stand afterwards still comes from the replay.
 */
export function forgetting(world: World): Failure[] {
  const failures: Failure[] = [];

  for (const name of ["forget-the-first", "forget-the-second", "forget-the-taking-back", "forget-all-of-it"]) {
    const seen = need(world, name);
    const fail = failer("forgetting", name);
    const want = expected(seen.trajectory.steps);
    const all = [...seen.memory.held, ...seen.memory.remembered];

    if (!seen.forgetting) {
      fail("the history did not record what the view looked like before the forgetting");
      failures.push(...fail.failures);
      continue;
    }
    const { before, removed } = seen.forgetting;
    const was = of([...before.held, ...before.remembered], "verdict");
    const now = of(all, "verdict");

    // Exactly the right acts survived, under exactly the references they had.
    const survivors = was.filter((root) => !removed.includes(String(root.handle.ref)));
    const refGap = differ(
      survivors.map((root) => String(root.handle.ref)),
      now.map((root) => String(root.handle.ref)),
    );
    if (refGap) fail(`the acts that survived are not the ones that should have — ${refGap}`);

    // And each of them says what it said, word for word, instant included.
    const spoken = new Map(now.map((root) => [String(root.handle.ref), canon(root.act)] as const));
    for (const root of survivors) {
      const still = spoken.get(String(root.handle.ref));
      if (still === undefined) continue;
      if (still !== canon(root.act)) {
        fail(`a surviving act was rewritten: ${canon(root.act)} became ${still}`);
      }
    }

    // Nothing was written in its place: forgetting is not withdrawing.
    const takings = (roots: readonly Root[]) =>
      roots.filter((root) => actOf(root).said === "withdrawal").length;
    const wasTakings = takings(was) - removed.filter((ref) =>
      was.some((root) => String(root.handle.ref) === ref && actOf(root).said === "withdrawal"),
    ).length;
    if (takings(now) !== wasTakings) {
      fail(`${String(wasTakings)} taking(s)-back should be left and ${String(takings(now))} are`);
    }

    // What stands afterwards is worked out again, from the replay.
    const gap = differ(want.acts.map(wantedAct), now.map(observedRoot));
    if (gap) fail(`what is left does not read as it should — ${gap}`);

    // The saved film came through **whole**, and whole means whole: identity,
    // state, IMDb id, mix membership, both stored instants and the handle a
    // correction reaches it by. Compared as complete roots rather than as
    // signatures, because a signature leaves out exactly the timestamps and the
    // handle a regression here would move. The only thing forgetting an act may
    // change is what is left of what they said.
    const savedGap = differ(of(before.held, "movie").map(canon), of(seen.memory.held, "movie").map(canon));
    if (savedGap) fail(`the saved film moved when an act was forgotten — ${savedGap}`);

    if (name === "forget-all-of-it") {
      if (now.length !== 0) fail("forgetting everything they said left something they said");
      if ((seen.taste.verdicts ?? []).length !== 0) {
        fail("a recommendation still reads a verdict after all of them were forgotten");
      }
      if (of(seen.memory.held, "movie")[0]?.viewing !== "seen") {
        fail("forgetting everything they said changed the film they saved");
      }
    }
    failures.push(...fail.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate G */

/**
 * An evening put right is right, whole, and says which facts became theirs —
 * and one that cannot be put right that way is not half put right.
 *
 * Three things are proved here. A correction that replaces the request, the
 * offers and the choice lands whole. A choice **kept** across a corrected offer
 * list is rebound to the entry in the *new* list, so the evening read back says
 * what the list says rather than carrying the description the choice was made
 * against — that is Slice 2's rule and the one an implementation is most likely
 * to get right by accident and wrong on purpose. And a correction that would
 * leave somebody recorded as having chosen a film nobody offered is refused
 * entire; an implementation that wrote the new offer list and then noticed
 * would leave an evening that never happened, with the count unchanged.
 */
export function correcting(world: World): Failure[] {
  const failures: Failure[] = [];

  for (const name of ["the-night-was-wrong", "nothing-was-offered", "the-offer-changed-under-the-choice"]) {
    const seen = need(world, name);
    const fail = failer("correcting", name);
    const want = expected(seen.trajectory.steps);
    const nights = of(seen.memory.remembered, "evening");

    const gap = differ(want.evenings.map(wantedEvening), nights.map(observedRoot));
    if (gap) fail(`the corrected evening is not the one the history describes — ${gap}`);

    // Nothing of the old evening survives as a current fact.
    const first = seen.trajectory.steps.find((step) => step.act === "evening");
    const night = want.evenings[0];
    if (first?.act === "evening" && night && first.request !== night.request) {
      if (JSON.stringify(nights).includes(first.request)) fail("the old request is still in the evening");
    }
    failures.push(...fail.failures);
  }

  const refused = need(world, "the-correction-was-refused");
  const fail = failer("correcting", "the-correction-was-refused");
  const want = expected(refused.trajectory.steps);
  if (want.refusals.length === 0) {
    fail("the replay does not expect the illegal correction to be refused at all");
  }
  if (!refused.atomicity) {
    fail("the history did not record the evening either side of the refusal");
  } else {
    const shape = (memory: Memory) => of(memory.remembered, "evening").map(observedRoot);
    const moved = differ(shape(refused.atomicity.before), shape(refused.atomicity.after));
    if (moved) fail(`a refused correction changed the evening anyway — ${moved}`);
    const drifted = differ(want.evenings.map(wantedEvening), shape(refused.atomicity.after));
    if (drifted) fail(`the evening after a refused correction is not the untouched one — ${drifted}`);
  }
  failures.push(...fail.failures);
  return failures;
}

/* ------------------------------------------------------------------ gate H */

/**
 * Recommendation isolation: remembering a thing is not permission to use it.
 *
 * The narrowest and most important claim of the milestone. Memory is broader
 * than taste on purpose, and the breadth must not leak: an evening, a replaced
 * verdict, a taken-back one and the taking-back itself are all in the memory
 * view and none of them may be in what a recommendation reads.
 *
 * Proved by building the taste model the script says a recommendation should be
 * handed — from the scripted genres, mixes and films, and from the
 * independently determined standing verdicts — and comparing it whole. A key
 * search cannot do this: an evening that changed a saved film leaves no
 * episode-shaped key behind, and a superseded reason copied onto a current
 * verdict looks exactly like a reason.
 */
export function isolation(world: World): Failure[] {
  const failures: Failure[] = [];

  for (const seen of Object.values(world.seen)) {
    const fail = failer("recommendation-isolation", seen.trajectory.name);
    const want = expected(seen.trajectory.steps);

    const wanted = wantedTaste(want);
    const got = observedTaste(seen.taste);
    for (const part of ["genres", "mixes", "movies", "verdicts", "disagreements"] as const) {
      if (wanted[part] !== got[part]) {
        fail(`the ${part} a recommendation reads are not the ones the history has: ${got[part]} rather than ${wanted[part]}`);
      }
    }

    // Supplementary, and cheap: nothing about an evening is in the taste model.
    // Named by the keys an episode actually has — `evening` would collide with
    // an occasion called `evening-tuesday`, which is a legitimate scope and not
    // a leak.
    const payload = JSON.stringify(seen.taste).toLowerCase();
    for (const key of ["episodes", "offered", "recordedat", "requestsource", "offeredsource", "watched", "finished"]) {
      if (payload.includes(`"${key}"`)) fail(`"${key}" reached the taste model`);
    }
    for (const night of want.evenings) {
      if (payload.includes(night.request.toLowerCase())) fail("an evening's request reached the taste model");
    }
    // And no explanation leaked into it. `because` is absent from this list on
    // purpose: it is a verdict's own word for why, and it belongs in the taste
    // model. What must not be there is the explaining apparatus around it.
    for (const key of ["operative", "governing", "placement", "basis", "handle"]) {
      if (payload.includes(`"${key}"`)) fail(`"${key}" reached the taste model`);
    }
    if (payload.includes("outranks a disagreeing state")) {
      fail("a conflict explanation reached the taste model");
    }
    failures.push(...fail.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate I */

/**
 * Reading what Tonight knows is a question, never an event.
 *
 * One person, two moments, and an exact comparison — timestamps included. This
 * is the one place where nothing is normalised away: a read that touched an
 * `updated_at` has written, and a comparison that stripped the column to make
 * two people comparable would be exactly blind to it.
 */
export function purity(world: World): Failure[] {
  const failures: Failure[] = [];

  for (const seen of Object.values(world.seen)) {
    const fail = failer("read-purity", seen.trajectory.name);
    for (const held of ["taste", "acts", "episodes"] as const) {
      if (canon(seen.before[held]) !== canon(seen.after[held])) {
        fail(`reading what Tonight knows changed the ${held}`);
      }
    }
    if (canon(seen.memory) !== canon(seen.memoryAgain)) fail("two readings disagreed");
    failures.push(...fail.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate K */

/**
 * One person's memory holds nothing of another's, and cannot be reached by them.
 *
 * The part that needs care is the refusal. A tool that answers *"there is no
 * such act"* for a reference nobody owns and *"that is not yours"* for one
 * somebody else owns has told the caller that somebody else owns it, and it has
 * done so without ever handing over a single word of content. So the two answers
 * are compared **whole** — error flag, payload and text — with only the caller's
 * own reference blanked out of each, because a neutral answer that echoes what
 * was asked reveals nothing the asker did not already have.
 */
export function ownership(world: World): Failure[] {
  const fail = failer("user-isolation", "crossing");
  const { crossing } = world;

  // The two were given deliberately similar histories, so an empty view proves
  // nothing and neither does a search for words that are hers alone: the film
  // they both filed is filed identically, and a copy of her row appended to his
  // view would read exactly like his own. So each view is held against the
  // complete set of roots that person's own script made, **multiplicity
  // included** — one Black Bag is his, two is a leak.
  const both = (memory: Memory) => [...memory.held, ...memory.remembered].map(observedRoot);
  const strangerGap = differ(wantedRoots(expected(STRANGER_HISTORY)), both(crossing.theirs));
  if (strangerGap) fail(`a stranger's memory holds more or less than their own — ${strangerGap}`);
  const ownerGap = differ(wantedRoots(expected(OWNER_HISTORY)), both(crossing.owner));
  if (ownerGap) fail(`the owner's memory is not what the owner made — ${ownerGap}`);

  // Supplementary, and still worth keeping: nothing of hers by name either.
  const strangers = JSON.stringify(crossing.theirs);
  for (const hers of ["hers alone", "disliked", "an evening that is hers"]) {
    if (strangers.includes(hers)) fail(`a stranger's memory view holds "${hers}", which is not theirs`);
  }
  if (crossing.theirs.remembered.some((root) => root.of === "evening")) {
    fail("a stranger's memory view holds somebody else's evening");
  }
  if (crossing.theirs.held.some((root) => root.of === "verdict")) {
    fail("a stranger's memory view holds somebody else's claim");
  }
  if (!crossing.intact) fail("a stranger's attempts changed what the owner had");
  if (!crossing.strangerIntact) fail("a stranger's attempts changed the stranger's own view");
  if (crossing.forgetting.foreign !== crossing.forgetting.unknown) {
    fail(
      "forgetting somebody else's act answered differently from forgetting nothing at all: " +
        `${crossing.forgetting.foreign} against ${crossing.forgetting.unknown}`,
    );
  }
  if (crossing.correcting.foreign !== crossing.correcting.unknown) {
    fail(
      "correcting somebody else's evening answered differently from correcting one nobody has: " +
        `${crossing.correcting.foreign} against ${crossing.correcting.unknown}`,
    );
  }
  if (crossing.owner.held.length === 0) fail("the owner lost everything to the crossing");
  return fail.failures;
}

/* ------------------------------------------------------------------ gate L */

/**
 * One film is one film, in every layer at once.
 *
 * The rule itself is settled and lives in `lib/films/identity.ts`, with its own
 * contracts in Slice 3 — including the two Unicode counterexamples, which were
 * live defects in opposite directions for as long as two folds existed. What
 * this asks is only whether the taste model, the verdict history and the memory
 * view all still consult that one rule. A regression here looks like one layer
 * quietly folding a title its own way again, and it shows up as one film
 * appearing twice, a remake swallowed by its original, or a verdict attached to
 * a film nobody spoke about.
 */
export function identity(world: World): Failure[] {
  const failures: Failure[] = [];

  const one = need(world, "one-film-many-spellings");
  const spellings = failer("film-identity", "one-film-many-spellings");
  const acts = of([...one.memory.held, ...one.memory.remembered], "verdict");
  if (acts.length !== 2) spellings(`two things were said and ${String(acts.length)} came back`);
  if (of(one.memory.held, "verdict").length !== 1) {
    spellings("two spellings of one film produced two standing claims");
  }
  if (of(one.memory.held, "movie").length !== 1) {
    spellings("two spellings of one film produced two saved films");
  }
  if (new Set(acts.map((root) => filmKey(actOf(root).film))).size !== 1) {
    spellings("the two spellings were treated as two films");
  }
  failures.push(...spellings.failures);

  const remake = need(world, "a-remake-is-another-film");
  const apart = failer("film-identity", "a-remake-is-another-film");
  const spoken = of(remake.memory.held, "verdict");
  if (spoken.length !== 1) {
    apart(`a remake and its original produced ${String(spoken.length)} standing claims, not one`);
  }
  if ((actOf(spoken[0]!).film as Film).year !== 1986) {
    apart(`what they said was placed on ${String((actOf(spoken[0]!).film as Film).year)}, not the film they spoke about`);
  }
  if (of(remake.memory.held, "movie").length !== 2) apart("a remake and its original were merged into one film");
  failures.push(...apart.failures);

  // The two places a collation and a language disagree about case.
  const unicode = need(world, "unicode-is-not-a-collation");
  const hard = failer("film-identity", "unicode-is-not-a-collation");
  const films = of(unicode.memory.held, "movie");
  if (films.length !== 3) hard(`three films were saved and ${String(films.length)} came back`);

  // İ and i: the undotted film was never spoken about and must be untouched.
  const plain = films.find((root) => filmKey(root.film as Film) === filmKey(UNICODE_FILMS.plain));
  if (!plain) hard("the undotted film is not held at all");
  else if (plain.viewing !== "seen") {
    hard(`the undotted film reads ${String(plain.viewing)}; a verdict about the dotted one reached it`);
  }

  // Ⱟ and ⱟ: one film, spoken about in the other case. The act and the film have
  // to be recognised as one film's across the two layers, which is what the
  // collation could not do — so the history is one act, and the saved film that
  // shares its identity is still there.
  const spokenAbout = of(unicode.memory.held, "verdict").map((root) => filmKey(actOf(root).film as Film));
  const aboutUpper = spokenAbout.filter((key) => key === filmKey(UNICODE_FILMS.upper));
  if (aboutUpper.length !== 1) {
    hard(`the Ⱟ/ⱟ pair produced ${String(aboutUpper.length)} standing claims, not one`);
  }
  const glagolitic = films.find(
    (root) => filmKey(root.film as Film) === filmKey(UNICODE_FILMS.upper),
  );
  if (!glagolitic) hard("a case pair one rule calls one film was left as two");

  failures.push(...hard.failures);

  return failures;
}

/* ------------------------------------------------------------------ gate M */

/** What the public round trip changes, so the gate and the driver agree on it. */
export const ROUND_TRIP = {
  request: "put right from the view",
  viewing: "unseen",
} as const;

/**
 * Everything shown can be reached to change it, by a handle a tool takes.
 *
 * Two halves. The first is that every handle **names its own root**: a genre's
 * handle carries that genre's name, a film's carries that film, an act's
 * reference is unique to it. A handle that is well-shaped and points somewhere
 * else is worse than no handle, because it invites a correction that lands on
 * the wrong thing.
 *
 * The second is the round trip, and it is the only proof that matters: a
 * reference, an episode id and a film handle are taken **out of the view and
 * nowhere else**, used against the public tools, and the view is read again.
 * The thing named changes and its neighbour does not. Nothing in that path
 * reaches a store to find an identifier, which is the whole point — if the view
 * did not hand over a usable handle, the round trip could not run.
 *
 * And nothing else is out here. An identifier in a payload is an invitation to
 * use it, so the write order and the table's sequence — machinery, and in the
 * sequence's case a fact about how much everybody else has written — must not be.
 */
export function handles(world: World): Failure[] {
  const failures: Failure[] = [];
  const expects: Record<string, string> = {
    genre: "name",
    mix: "name",
    movie: "film",
    verdict: "ref",
    evening: "id",
  };

  for (const seen of Object.values(world.seen)) {
    const fail = failer("correction-handles", seen.trajectory.name);
    const refs: string[] = [];
    const ids: string[] = [];

    for (const root of [...seen.memory.held, ...seen.memory.remembered]) {
      const by = expects[root.of];
      if (by === undefined) {
        fail(`a root of an unknown kind appeared: ${root.of}`);
        continue;
      }
      if (root.handle.by !== by) {
        fail(`a ${root.of} is named by ${String(root.handle.by)}, not by its ${by}`);
        continue;
      }
      // The handle names *this* root, not merely a root.
      switch (root.of) {
        case "genre":
        case "mix":
          if (root.handle.name !== root.name) {
            fail(`a ${root.of} called ${String(root.name)} is corrected by the name ${String(root.handle.name)}`);
          }
          break;
        case "movie":
          if (canon(root.handle) !== canon({ by: "film", ...(root.film as Film) })) {
            fail(`a film saved as ${canon(root.film)} is corrected by ${canon(root.handle)}`);
          }
          break;
        case "verdict":
          if (typeof root.handle.ref !== "string" || root.handle.ref.length === 0) {
            fail("an act has no reference to forget it by");
          } else refs.push(root.handle.ref);
          break;
        case "evening":
          if (typeof root.handle.id !== "string" || root.handle.id.length === 0) {
            fail("an evening has no id to correct it by");
          } else ids.push(root.handle.id);
          break;
      }
    }
    if (new Set(refs).size !== refs.length) fail("two acts share one reference and cannot be told apart");
    if (new Set(ids).size !== ids.length) fail("two evenings share one id");

    // No machinery.
    const payload = JSON.stringify(seen.memory);
    for (const internal of ["order", "seq", "user_id", "id\":\"tonight"]) {
      if (new RegExp(`"${internal}"\\s*:`).test(payload)) fail(`${internal} leaked into the memory view`);
    }
    failures.push(...fail.failures);
  }

  /* ------------------------------------------------------- the round trip */

  const fail = failer("correction-handles", "the-round-trip");
  const { before, after, used, spared } = world.handled;
  const verdictBy = (memory: Memory, ref: string) =>
    of([...memory.held, ...memory.remembered], "verdict").find((root) => root.handle.ref === ref);
  const eveningBy = (memory: Memory, id: string) =>
    of(memory.remembered, "evening").find((root) => root.handle.id === id);
  const movieBy = (memory: Memory, film: { title: string; year: number }) =>
    of(memory.held, "movie").find((root) => filmKey(root.film as Film) === filmKey(film));

  if (!verdictBy(before, used.ref)) fail("the reference used for the round trip was not in the view");
  if (!eveningBy(before, used.episode)) fail("the episode id used for the round trip was not in the view");
  if (!movieBy(before, used.film)) fail("the film handle used for the round trip was not in the view");

  // The act named is gone, its neighbour is untouched.
  if (verdictBy(after, used.ref)) fail("forgetting by the reference the view gave did not remove that act");
  const otherAct = verdictBy(after, spared.ref);
  if (!otherAct) fail("forgetting one act removed another");
  else if (canon(otherAct.act) !== canon(verdictBy(before, spared.ref)!.act)) {
    fail("forgetting one act rewrote another");
  }

  // The evening named is corrected, its neighbour is untouched.
  const night = eveningBy(after, used.episode);
  if (!night) fail("correcting an evening by its id removed it");
  else {
    if (night.request !== ROUND_TRIP.request) {
      fail(`correcting by the id the view gave left the request as ${String(night.request)}`);
    }
    if (night.requestSource !== "stated") fail("a corrected request is still recorded as observed");
  }
  const otherNight = eveningBy(after, spared.episode);
  if (!otherNight) fail("correcting one evening removed another");
  else if (observedRoot(otherNight) !== observedRoot(eveningBy(before, spared.episode)!)) {
    fail("correcting one evening changed another");
  }

  // The film named is refiled, its neighbour is untouched.
  const film = movieBy(after, used.film);
  if (!film) fail("updating a film by the handle the view gave removed it");
  else if (film.viewing !== ROUND_TRIP.viewing) {
    fail(`updating by the handle the view gave left the film as ${String(film.viewing)}`);
  }
  const otherFilm = movieBy(after, spared.film);
  if (!otherFilm) fail("updating one film removed another");
  else if (observedRoot(otherFilm) !== observedRoot(movieBy(before, spared.film)!)) {
    fail("updating one film changed another");
  }

  // And across the two roots: the opinion about the film that was refiled is
  // still exactly what it was. A film and what was said about it are two roots
  // now, so changing the first must not reach the second.
  const opinion = verdictBy(after, world.handled.across.ref);
  if (!opinion) fail("refiling a film removed what they said about it");
  else if (canon(opinion.act) !== canon(verdictBy(before, world.handled.across.ref)!.act)) {
    fail("refiling a film rewrote what they said about it");
  }
  failures.push(...fail.failures);

  return failures;
}

/* ------------------------------------------------------------------ gate N */

/**
 * The whole picture, for somebody with a real history.
 *
 * M3's completion criterion, stated mechanically. Everything the other gates
 * check in isolation has to hold at once for one person: the full set of roots
 * with their full content, current told apart from historical, a conflict
 * explained, provenance on every piece, a handle on every piece, nothing
 * invented, and a taste model that is still narrower than the memory view.
 *
 * Deliberately an integrated scenario and not a stored snapshot. A snapshot
 * would fail on the day somebody adds a field and say nothing about whether the
 * picture is still true.
 */
export function wholePicture(world: World): Failure[] {
  const fail = failer("whole-picture", "a-long-history");
  const seen = need(world, "a-long-history");
  const want = expected(seen.trajectory.steps);
  const all = [...seen.memory.held, ...seen.memory.remembered];

  // Everything is there, and everything is what it was.
  const gap = differ(wantedRoots(want), all.map(observedRoot));
  if (gap) fail(`the whole picture is not the history that was lived — ${gap}`);

  // Current is told apart from historical, and both are non-empty — otherwise
  // the distinction is untested rather than proved.
  if (of(seen.memory.held, "verdict").length === 0) fail("nothing stands in a history that has standing claims");
  if (of(seen.memory.remembered, "verdict").length === 0) fail("nothing is historical in a history that has history");
  if (of(seen.memory.held, "movie").length === 0) fail("no film is held in a history that saves films");

  // Every piece can be traced and every piece can be reached.
  for (const root of all) {
    if (typeof root.basis.kind !== "string") fail(`a ${root.of} says nothing about where it came from`);
    if (typeof root.handle.by !== "string") fail(`a ${root.of} cannot be corrected`);
  }

  // And what a recommendation reads is strictly less than what is remembered.
  const taste =
    (seen.taste.verdicts ?? []).length +
    seen.taste.movies.length +
    seen.taste.genres.length +
    seen.taste.mixes.length;
  if (taste >= all.length) {
    fail(`the taste model carries ${String(taste)} things and memory ${String(all.length)}; memory is not the broader view`);
  }
  return fail.failures;
}

/* ------------------------------------------------------------------- the set */

export const GATES: readonly { name: string; check: Gate }[] = [
  { name: "fidelity", check: fidelity },
  { name: "placement", check: placement },
  { name: "traceability", check: traceability },
  { name: "no-unauthored-belief", check: unauthored },
  { name: "precedence", check: precedence },
  { name: "forgetting", check: forgetting },
  { name: "correcting", check: correcting },
  { name: "recommendation-isolation", check: isolation },
  { name: "read-purity", check: purity },
  { name: "user-isolation", check: ownership },
  { name: "film-identity", check: identity },
  { name: "correction-handles", check: handles },
  { name: "whole-picture", check: wholePicture },
];

/** Runs every gate. Empty means M3 passes. */
export function gate(world: World): Failure[] {
  return GATES.flatMap(({ check }) => check(world));
}

/**
 * What M3's gates deliberately do not cover.
 *
 * Written down rather than left to be found, and each line says where the proof
 * would have to come from instead.
 */
export const LIMITS = [
  "whether the prose a model writes from a faithful memory view is itself honest — whether it says 'you seem to like' about something nobody said — is semantic and needs a blind sweep; that is Slice 7's subject and these gates deliberately stop at the payload",
  "the gates prove what a correction did to stored memory, not whether a model chose the right correction from what the user said — routing is instruction behaviour and is evaluated with the instructions",
  "the gates are proved by mutating the observations they read, not by mutating production source: a source-level mutation harness would have to patch and restore real files, and the observational probes already establish that every gate can fail for the defect it names; source mutation was used while writing these gates and is exploratory rather than part of this artifact",
  "the instants persistence assigns — when a row was written, when somebody spoke, when an evening was noted — are compared for consistency and for not moving, never for value, because no script can predict one",
] as const;

export type { Step, Trajectory };
