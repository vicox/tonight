/**
 * What the user said about a film, where it applies, and how they came to say it.
 *
 * M2 of `docs/work/phase-2-implementation.md`, first slice. A Verdict is a Claim
 * in the sense of §6 of the architecture, and the architecture is blunt about who
 * may make one: *"Only the user. Absolute. The agent never holds an opinion about
 * whether someone liked something."* Everything in this file exists to make that
 * sentence true in code rather than in a comment.
 *
 * ## Why this is not a field on the Episode
 *
 * M1 records what happened; this records what they thought of it. Keeping them
 * apart is the whole of *history is not taste*. `lib/episodes/model.ts` ends its
 * implication chain deliberately —
 *
 *     A recommendation does not imply a choice.
 *     A choice does not imply it was watched.
 *     Watching does not imply finishing.
 *
 * — and then says that whether they *liked* it is a Verdict, owned by the user,
 * belonging here. So the chain's last link is the boundary between the two
 * modules, and it is enforced structurally: nothing in this file imports an
 * Episode, takes one as an argument, or could be handed one. There is no function
 * here that turns something that happened into something the user thinks.
 *
 * ## Why the texture is part of the claim
 *
 * §2 of the architecture: *"'I loved it' unprompted is stronger evidence than
 * 'yes' to 'did you like it?'"* Both are the user's own words and both are
 * absolute as claims; they are not equally informative, and the difference is
 * only recoverable if it is recorded at the moment it is known. So how the user
 * came to say it is a field, not a footnote — and so is *why*, where they said
 * why, because a reason given once and dropped cannot be recovered later.
 *
 * ## Why a rejection is not a dislike, and why one of them is local
 *
 * *"Not tonight"* and *"not ever"* look alike in a log and mean opposite things.
 * A film declined on a Tuesday because it ran three hours is not a film the user
 * dislikes, and the architecture names collapsing the two as *"one of the fastest
 * ways to build a wrong model"*. They are therefore different assertions here —
 * and they carry different scopes, which is the stronger half of the separation.
 * *"Not tonight"* is about an evening and is recorded as applying only there;
 * a claim that applied everywhere would be exactly the wrong model the
 * architecture is warning about, arrived at by a default nobody chose.
 *
 * ## What this slice deliberately cannot do
 *
 * Nothing here persists, asks, or answers. A verdict does not reach a Movie
 * state, does not touch a Mix, and does not change what gets recommended —
 * confidence is not modelled at all, because §2 says it is derived and never
 * stored, and M2's non-goals say not yet. Situations and companions, which would
 * give scopes richer than one occasion, are later milestones. Those arrive
 * later and will be built on this shape rather than beside it.
 */

/** A film, named the way Tonight names one: `Dune` is two films, not one. */
export type Film = {
  title: string;
  year: number;
};

/**
 * The three Phase 1 Movie states that carry an opinion.
 *
 * `seen` and `not_seen` are deliberately absent and are not oversights. Phase 1
 * settled what each state means: *"`not_seen` and `null` are absence of
 * experience, not evidence against; `seen` says only that they watched it"*.
 * Neither is a judgement, so neither can be the assertion of a Verdict — a film
 * they watched and said nothing about is exactly the silence this module exists
 * to keep expressible.
 */
export const JUDGEMENTS = ["liked", "loved", "disliked"] as const;
export type Judgement = (typeof JUDGEMENTS)[number];

/** How far a refusal reaches. The distinction is the point of recording it. */
export const REACHES = ["not-tonight", "not-ever"] as const;
export type Reach = (typeof REACHES)[number];

/**
 * Where a claim applies.
 *
 * §6: *"A Claim with no stated scope applies globally; one with a scope applies
 * **only** there"*, and a Claim without the facet *"silently becomes
 * universal"*. So the facet is never absent here; it is one of two things.
 *
 * An **occasion** is one evening, named by an opaque identifier the caller
 * supplies. This module does not know what an evening is — that is M1's Episode,
 * and importing it would put a verdict inside history. It knows only that two
 * claims naming the same occasion are about the same one. Situations, companions
 * and every richer scope belong to later milestones; one occasion is the least
 * that makes *"not tonight"* expressible without lying about its reach.
 */
export type Scope = "everywhere" | { occasion: string };

/**
 * A film turned down, and how far the refusal goes.
 *
 * `not-tonight` is about an evening and says nothing about the film, so it is
 * only ever scoped to that evening. `not-ever` is about the film and holds
 * beyond tonight, so it is only ever global. Neither can be written the other
 * way round, which is what keeps them from being confused after the fact.
 *
 * The reason is kept where the user gave one and is `null` where they did not,
 * because *"too long on a Tuesday"* and *"no reason given"* are different things
 * to know later.
 */
export type Rejection = {
  reach: Reach;
  reason: string | null;
};

/**
 * What is actually being said about the film.
 *
 * A judgement may carry the user's own explanation of it. *"I loved it because
 * the tension never lets up"* is two facts — the verdict and the reason for it —
 * and the second is the one that tells Tonight how to talk to this person.
 * Dropping it keeps only the half that is easiest to guess.
 *
 * `because` is the user's words and nothing else. There is no shape here for an
 * explanation Tonight worked out for itself: an agent-authored reason would be
 * an Observation, §2 says an Observation *"may never become a Verdict without a
 * user act"*, and the way to keep that true is to leave it nowhere to be put.
 */
export type Assertion =
  | { about: "judgement"; judgement: Judgement; because: string | null }
  | { about: "rejection"; rejection: Rejection };

/**
 * How the user came to say it.
 *
 * There are two ways and there is no third. In particular there is no value here
 * for *observed* or *derived*, which §6 lists as provenances a Claim may have in
 * general: a Verdict may not have them, so they are unrepresentable rather than
 * discouraged.
 */
export const TOLD = ["volunteered", "confirmed"] as const;
export type Told =
  /** Said without being asked. The stronger evidence, per §2. */
  | "volunteered"
  /** Given in answer to a question Tonight put. Still theirs, still absolute. */
  | "confirmed";

/**
 * One thing the user said about one film.
 *
 * The seven facets §6 requires, and they are all here rather than mostly here:
 * claimant, subject, assertion, provenance, scope, time, and temporal status.
 * The first six are fields; the seventh is derived by `current` and
 * `supersession` below, because a status stored beside an ordered history is a
 * second source of truth that can disagree with the order.
 */
export type Verdict = {
  said: "verdict";
  /**
   * Always the user, and there is no other value.
   *
   * §6 makes the claimant a facet so that *"Tonight must never silently promote
   * one person's report into another person's authoritative taste"*. For a
   * Verdict the facet has one legal value, so the field is a literal — an agent
   * claimant is a type error rather than a runtime check somebody can forget.
   */
  claimant: "user";
  film: Film;
  assertion: Assertion;
  told: Told;
  scope: Scope;
  /** When they said it, as an instant. Part of the claim, not metadata on it. */
  at: string;
};

/**
 * The user taking a claim back, in the scope they made it.
 *
 * §6 of the milestone plan: *"withdrawal removes its influence rather than
 * replacing it with a neutral value"*. So this is not a verdict of some neutral
 * kind and there is no neutral kind to be — after a withdrawal the scope simply
 * holds nothing again, and what showed through before it still shows through.
 *
 * It is recorded rather than erased because the record is what lets Tonight
 * explain itself later: *"you told me you loved it, and then you took that
 * back"* is answerable, and *"there was never anything here"* is not.
 */
export type Withdrawal = {
  said: "withdrawal";
  claimant: "user";
  film: Film;
  scope: Scope;
  at: string;
};

/** Everything the user has said about one film. Order is derived, not given. */
export type Act = Verdict | Withdrawal;

export const MAX_TITLE_LENGTH = 200;
export const MAX_REASON_LENGTH = 2_000;
export const MAX_OCCASION_LENGTH = 200;

export class VerdictError extends Error {
  override readonly name = "VerdictError";
}

/**
 * Record what the user said about a film.
 *
 * Every argument describes something a person said. There is no parameter for an
 * episode, an offer, a recommendation or anything else Tonight did, so a verdict
 * cannot be constructed out of Tonight's own behaviour even by a caller trying
 * to: the only way to reach this function is to have been told something.
 */
export function stateVerdict(
  film: unknown,
  assertion: unknown,
  told: unknown,
  at: unknown,
  scope: unknown = "everywhere",
): Verdict {
  const said = checkAssertion(assertion);
  return {
    said: "verdict",
    claimant: "user",
    film: checkFilm(film),
    assertion: said,
    told: checkTold(told),
    scope: checkScopeFor(said, scope),
    at: checkTime(at),
  };
}

/**
 * Record the user taking back what they said about a film, where they said it.
 *
 * The scope is required to match the claim being withdrawn, and defaults to
 * global for the same reason a claim does. Withdrawing *"not tonight"* takes
 * back that evening's refusal and touches nothing else; withdrawing a global
 * judgement takes back the judgement everywhere.
 */
export function withdrawVerdict(film: unknown, at: unknown, scope: unknown = "everywhere"): Withdrawal {
  return {
    said: "withdrawal",
    claimant: "user",
    film: checkFilm(film),
    scope: checkScope(scope),
    at: checkTime(at),
  };
}

/**
 * The claim that stands where you are asking, or none.
 *
 * §6 describes how the layers combine, and this is that description executed:
 * *"Global taste is the inherited base… Scoped Claims refine it locally… A
 * contextual Claim never overwrites a global one. It is a lens, not an edit.
 * Leaving the context restores the base untouched."*
 *
 * So asking globally sees only global claims — an evening's refusal is invisible
 * from outside that evening, which is the whole reason it is scoped. Asking
 * about an occasion sees that occasion's claims first and the global base
 * underneath, and a withdrawal inside the occasion restores the base rather than
 * hiding it.
 *
 * `null` means nothing stands there: either nobody spoke, or they took it back.
 * Both are silence, and silence is a complete answer rather than a gap.
 */
export function current(acts: readonly Act[], asked: Scope = "everywhere"): Verdict | null {
  const line = ordered(acts);
  const where = checkScope(asked);
  const global = standing(line, "everywhere");
  if (where === "everywhere") return global;
  return standing(line, where) ?? global;
}

/**
 * Which claims no longer stand, and what displaced each one.
 *
 * This is the temporal-status facet, derived rather than stored: §6 requires a
 * Claim to say whether it is *"current, or superseded by a later Claim — and by
 * which"*, and reading that off the order means it can never contradict the
 * order.
 *
 * Supersession happens **within a scope**. A refusal on Tuesday does not
 * supersede a global judgement — it does not reach it — so the two are resolved
 * separately and each layer names its own displacements.
 */
export function supersession(acts: readonly Act[]): { verdict: Verdict; by: Act }[] {
  const line = ordered(acts);
  return scopes(line).flatMap((scope) => {
    const layer = line.filter((act) => sameScope(act.scope, scope));
    return layer.flatMap((act, at) => {
      const next = layer[at + 1];
      return act.said === "verdict" && next ? [{ verdict: act, by: next }] : [];
    });
  });
}

/** The latest act in exactly one scope, if it left a verdict standing. */
function standing(line: readonly Act[], scope: Scope): Verdict | null {
  const layer = line.filter((act) => sameScope(act.scope, scope));
  const latest = layer[layer.length - 1];
  return latest?.said === "verdict" ? latest : null;
}

/** Every scope named in a history, in the order it first appears. */
function scopes(line: readonly Act[]): Scope[] {
  const seen: Scope[] = [];
  for (const act of line) {
    if (!seen.some((scope) => sameScope(scope, act.scope))) seen.push(act.scope);
  }
  return seen;
}

const sameScope = (a: Scope, b: Scope): boolean =>
  a === "everywhere" || b === "everywhere" ? a === b : a.occasion === b.occasion;

/**
 * One film's acts, oldest first, fully checked.
 *
 * ## Why every act is revalidated here
 *
 * These functions are a boundary, not an internal step: an act can reach them
 * from anywhere — a store row, a request body, a test fixture — and a type
 * annotation is not a check. So each act is rebuilt through the same
 * constructors a caller would have used, and anything that fails is refused
 * rather than carried. An object that skipped `stateVerdict` gets no shorter
 * route to being believed than one that did not.
 *
 * ## Why the order comes from the instant
 *
 * Time is part of the claim, so which verdict stands is a fact about when the
 * user spoke and not about how a list was assembled. Instants are compared as
 * instants: *"2026-01-01T20:00:00Z"* and *"2026-01-01T21:00:00+01:00"* are the
 * same moment, and comparing the strings would order them apart.
 *
 * Two acts at the very same instant are broken apart by their canonical content,
 * which is arbitrary but **stable** — the same history gives the same answer
 * whoever hands it over and in whatever order. A sequence number would be less
 * arbitrary and is not available: it belongs to a store, this slice has none,
 * and inventing one here would put a persistence concern in the model to settle
 * a case that only arises when two different claims share a timestamp.
 */
function ordered(acts: readonly Act[]): Act[] {
  if (!Array.isArray(acts)) {
    throw new VerdictError("A film's verdicts are a list.");
  }
  const checked = acts.map(checkAct);
  const named = new Set(checked.map((act) => key(act.film)));
  if (named.size > 1) {
    throw new VerdictError("These are verdicts about different films.");
  }
  return checked.sort(byInstantThenContent);
}

function byInstantThenContent(a: Act, b: Act): number {
  const difference = Date.parse(a.at) - Date.parse(b.at);
  if (difference !== 0) return difference;
  const left = JSON.stringify(canonical(a));
  const right = JSON.stringify(canonical(b));
  return left < right ? -1 : left > right ? 1 : 0;
}

/** An act with its keys in a fixed order, so equal content compares equal. */
function canonical(act: Act): unknown {
  return act.said === "verdict"
    ? [act.said, act.claimant, act.film.title, act.film.year, act.at, scopeKey(act.scope), act.told, act.assertion]
    : [act.said, act.claimant, act.film.title, act.film.year, act.at, scopeKey(act.scope)];
}

const scopeKey = (scope: Scope): string =>
  scope === "everywhere" ? "everywhere" : `occasion:${scope.occasion}`;

const key = (film: Film): string => `${film.title} ${String(film.year)}`;

/**
 * An act from anywhere, checked as thoroughly as one built here.
 *
 * Rebuilt through the constructors rather than inspected field by field, so
 * there is one definition of what a valid claim is and no second one to drift
 * from it. A withdrawal carrying a verdict's facets is refused rather than
 * trimmed: it means the caller built something this model has no shape for, and
 * silently dropping the extra fields would hide that.
 */
function checkAct(value: unknown): Act {
  const act = value as Record<string, unknown> | null;
  if (typeof act !== "object" || act === null) {
    throw new VerdictError("Each act is a verdict or a withdrawal.");
  }
  if (act.claimant !== "user") {
    throw new VerdictError("Only the user states a verdict.");
  }
  if (act.said === "verdict") {
    return stateVerdict(act.film, act.assertion, act.told, act.at, act.scope);
  }
  if (act.said === "withdrawal") {
    for (const owned of ["assertion", "told"]) {
      if (owned in act) throw new VerdictError(`A withdrawal asserts nothing, so it has no ${owned}.`);
    }
    return withdrawVerdict(act.film, act.at, act.scope);
  }
  throw new VerdictError("Each act says whether it is a verdict or a withdrawal.");
}

function checkFilm(value: unknown): Film {
  const film = value as Partial<Film> | null;
  if (typeof film !== "object" || film === null) {
    throw new VerdictError("A verdict is about a film, named by title and year.");
  }
  if (typeof film.title !== "string" || film.title.trim() === "") {
    throw new VerdictError("A film has a title.");
  }
  const title = film.title.trim();
  if (title.length > MAX_TITLE_LENGTH) {
    throw new VerdictError(`A title is at most ${String(MAX_TITLE_LENGTH)} characters.`);
  }
  if (typeof film.year !== "number" || !Number.isInteger(film.year)) {
    throw new VerdictError("A film has a year — it is half of how a film is named.");
  }
  return { title, year: film.year };
}

/**
 * What is being said, checked as one thing or the other.
 *
 * A judgement and a rejection are different assertions rather than two shapes of
 * one, so there is no argument here that carries both and nothing to resolve if
 * a caller sends both. That is deliberate: *"not ever"* and *"disliked"* are the
 * pair most easily merged, and merging them starts with a type that can hold
 * them at once.
 */
function checkAssertion(value: unknown): Assertion {
  const assertion = value as Record<string, unknown> | null;
  if (typeof assertion !== "object" || assertion === null) {
    throw new VerdictError("Say what they said: a judgement or a rejection.");
  }
  if (assertion.about === "judgement") {
    if (!isJudgement(assertion.judgement)) {
      throw new VerdictError(`A judgement is one of ${JUDGEMENTS.join(", ")}.`);
    }
    if ("rejection" in assertion) {
      throw new VerdictError("A judgement is not also a rejection.");
    }
    return {
      about: "judgement",
      judgement: assertion.judgement,
      because: checkWords(assertion.because, "An explanation"),
    };
  }
  if (assertion.about === "rejection") {
    if ("judgement" in assertion) {
      throw new VerdictError("A rejection is not also a judgement.");
    }
    if ("because" in assertion) {
      throw new VerdictError("A rejection gives its reason inside the rejection.");
    }
    return { about: "rejection", rejection: checkRejection(assertion.rejection) };
  }
  throw new VerdictError("An assertion is about a judgement or about a rejection.");
}

function checkRejection(value: unknown): Rejection {
  const rejection = value as Partial<Rejection> | null;
  if (typeof rejection !== "object" || rejection === null) {
    throw new VerdictError("A rejection says how far it reaches.");
  }
  if (!isReach(rejection.reach)) {
    throw new VerdictError(`A rejection reaches ${REACHES.join(" or ")}, and says which.`);
  }
  return { reach: rejection.reach, reason: checkWords(rejection.reason, "A reason") };
}

/**
 * The user's own words, or the honest absence of them.
 *
 * Absent and `null` are the same thing — nobody said why — and both are
 * legitimate. What is refused is an empty string, which reads in a record as an
 * explanation that was given and said nothing, and anything that is not a string
 * at all, which is how an object carrying a generated explanation would arrive.
 */
function checkWords(value: unknown, what: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new VerdictError(`${what} is what they said, in their words.`);
  }
  const words = value.trim();
  if (words === "") {
    throw new VerdictError(`${what} is what they said, or it is not there at all.`);
  }
  if (words.length > MAX_REASON_LENGTH) {
    throw new VerdictError(`${what} is at most ${String(MAX_REASON_LENGTH)} characters.`);
  }
  return words;
}

function checkTold(value: unknown): Told {
  if (value === "volunteered" || value === "confirmed") return value;
  throw new VerdictError("Say whether they volunteered it or answered a question.");
}

/**
 * Where a claim applies, checked as one of the two shapes there are.
 *
 * An occasion identifier is opaque here and only has to be usable as one: a
 * non-empty string that two claims can share. What it refers to is M1's evening,
 * and this module deliberately cannot look.
 */
function checkScope(value: unknown): Scope {
  if (value === "everywhere" || value === undefined) return "everywhere";
  const scope = value as { occasion?: unknown } | null;
  if (typeof scope !== "object" || scope === null || !("occasion" in scope)) {
    throw new VerdictError("A scope is everywhere, or one occasion.");
  }
  if (typeof scope.occasion !== "string" || scope.occasion.trim() === "") {
    throw new VerdictError("An occasion is named.");
  }
  const occasion = scope.occasion.trim();
  if (occasion.length > MAX_OCCASION_LENGTH) {
    throw new VerdictError(`An occasion name is at most ${String(MAX_OCCASION_LENGTH)} characters.`);
  }
  return { occasion };
}

/**
 * The scope an assertion is allowed to have.
 *
 * *"Not tonight"* is about an evening, so it is refused without one — a global
 * *"not tonight"* is the wrong model the architecture warns about, and the way
 * to keep it out is to make it unsayable rather than merely discouraged.
 * *"Not ever"* is about the film and reaches past any evening, so it is refused
 * with one. A judgement is about the film too; scoping opinions to occasions
 * needs situations, which is a later milestone, so it is global here.
 */
function checkScopeFor(assertion: Assertion, value: unknown): Scope {
  const scope = checkScope(value);
  const local = scope !== "everywhere";
  const tonight = assertion.about === "rejection" && assertion.rejection.reach === "not-tonight";
  if (tonight && !local) {
    throw new VerdictError("A not-tonight refusal is about one evening, and says which.");
  }
  if (!tonight && local) {
    const what = assertion.about === "judgement" ? "A judgement" : "A not-ever refusal";
    throw new VerdictError(`${what} is about the film, so it applies everywhere.`);
  }
  return scope;
}

/**
 * The time the claim was made, as a canonical instant.
 *
 * Required to carry a date, a time and an offset, because *"2026-01-01"* and
 * *"2026-01-01T20:00"* are not instants and would be read as one by anything
 * lenient enough to accept them. Stored normalised to UTC so that two spellings
 * of the same moment are one value afterwards, and so ordering never depends on
 * which spelling arrived.
 */
const INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/u;

function checkTime(value: unknown): string {
  if (typeof value !== "string" || !INSTANT.test(value)) {
    throw new VerdictError("A verdict carries when it was given, as a date, a time and an offset.");
  }
  const instant = Date.parse(value);
  if (Number.isNaN(instant)) {
    throw new VerdictError("A verdict carries when it was given, as a real instant.");
  }
  return new Date(instant).toISOString();
}

const isJudgement = (value: unknown): value is Judgement =>
  JUDGEMENTS.includes(value as Judgement);

const isReach = (value: unknown): value is Reach => REACHES.includes(value as Reach);
