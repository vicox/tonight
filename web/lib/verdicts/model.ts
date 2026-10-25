import { filmKey } from "../films/identity.ts";

export { filmKey };

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
 * ## Why turning a film down is not here
 *
 * A verdict is an opinion about a film, and an opinion is something somebody can
 * only have after watching it. Turning a film down is neither. *"Don't recommend
 * it again"* says where the film stands on their list, so it is the Movie's
 * `viewing` — `dont-want-to-see` — and that is what keeps it from being
 * recommended. *"Not tonight"* is about an evening, not the film, and is left in
 * the conversation it was said in: nothing records it.
 *
 * Both used to be rejections here, with a reach and — for *"not tonight"* — an
 * evening to apply in. Verdicts schema v3 converted the ones that still stood
 * and removed the rest, so a refusal is now unsayable rather than discouraged,
 * and so is the evening scope it needed.
 *
 * ## What this slice deliberately cannot do
 *
 * Nothing here persists, asks, or answers. A verdict does not reach a Movie
 * state, does not touch a Vibe, and does not change what gets recommended —
 * confidence is not modelled at all, because §2 says it is derived and never
 * stored, and M2's non-goals say not yet. Situations and companions, which would
 * give a claim a scope narrower than the film, are later milestones. Those arrive
 * later and will be built on this shape rather than beside it.
 */

/** A film, named the way Tonight names one: `Dune` is two films, not one. */
export type Film = {
  title: string;
  year: number;
};

/**
 * The three ways of having an opinion about a film, and the only three.
 *
 * Whether somebody *watched* a film is deliberately absent and is not an
 * oversight. That is a fact and it lives on the Movie as `viewing`; neither
 * answer it can take is a judgement, so neither can be the assertion of a
 * Verdict — a film they watched and gave no opinion on is exactly the silence
 * this module exists to keep expressible.
 */
export const JUDGEMENTS = ["liked", "loved", "disliked"] as const;
export type Judgement = (typeof JUDGEMENTS)[number];

/**
 * Where a claim applies: everywhere, and nowhere narrower.
 *
 * §6: *"A Claim with no stated scope applies globally"*, and a Claim without the
 * facet *"silently becomes universal"*. So the facet is stated rather than
 * left out, and — like `claimant` — it has one legal value: a judgement is about
 * the film, and the film is the same film on every evening.
 *
 * It used to admit one evening as well, which existed only so that *"not
 * tonight"* could be said without lying about its reach. That went when
 * refusals did; scopes narrower than the film belong to later milestones.
 */
export type Scope = "everywhere";

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
 *
 * `about` names the one kind of assertion there is. It stays in the shape so a
 * stored act and an answer read the same as they always have, and so anything
 * still sending a refusal is told why rather than misread.
 */
export type Assertion = { about: "judgement"; judgement: Judgement; because: string | null };

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
 * The user taking a claim back.
 *
 * §6 of the milestone plan: *"withdrawal removes its influence rather than
 * replacing it with a neutral value"*. So this is not a verdict of some neutral
 * kind and there is no neutral kind to be — after a withdrawal nothing stands
 * about the film, and nothing they said before shows through.
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

/**
 * An act as persistence handed it back, carrying the order it was written in.
 *
 * `at` is when the user spoke and is the order that matters. It has millisecond
 * resolution, though, and two calls can land inside one — so the store records
 * which it accepted first, and this is that number coming back.
 *
 * It is **not** part of the claim. The user did not say it, no constructor here
 * produces one, and nothing that compares what was claimed looks at it. It
 * exists for exactly one question: of two things said in the same millisecond,
 * which was said second.
 */
export type Written<T> = T & { order: number };

/**
 * An act with the handle persistence gave it, so a caller can name that one act.
 *
 * Distinct from `Written` and deliberately so. The order answers *"which of
 * these was said second"* and is machinery — it belongs to the table, it moves
 * if the table is rebuilt, and nothing outside persistence should hold it. The
 * reference answers *"which act do you mean"* and is a product fact: it is what
 * somebody points at to take one thing back, so it has to survive everything
 * except being forgotten.
 *
 * Two acts can be identical in every stated respect — the same film, the same
 * judgement, the same instant — and still be two things the user said. Only the
 * reference tells them apart, which is why it cannot be derived from content.
 *
 * Like the order, it is **not** part of the claim: the user did not say it, no
 * constructor here produces one, and nothing that compares what was claimed
 * looks at it.
 */
export type Identified<T> = T & { ref: string };

/**
 * An act as they said it, with what persistence added taken back off.
 *
 * Both handles come off, and for different reasons. The order is machinery that
 * was never anybody's business outside the store. The reference is a real
 * product fact, but it is a fact about the record rather than about the claim —
 * so a caller comparing *what was said* must not see it either, and a surface
 * that has no way to act on a reference should not be handing them out.
 *
 * Used at the edges: where an act leaves Tonight, and where a contract asks
 * whether a claim survived a round trip unchanged.
 */
export function spoken(act: Act): Act {
  const { ref, order, ...said } = act as Act & Partial<Identified<Act>> & Partial<Written<Act>>;
  void ref;
  void order;
  return said as Act;
}

/** The write order an act carries, or none — a legacy row predating the column. */
function orderOf(act: Act): number | null {
  const order = (act as Partial<Written<Act>>).order;
  return typeof order === "number" ? order : null;
}

export const MAX_TITLE_LENGTH = 200;
export const MAX_REASON_LENGTH = 2_000;

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
  return {
    said: "verdict",
    claimant: "user",
    film: checkFilm(film),
    assertion: checkAssertion(assertion),
    told: checkTold(told),
    scope: checkScope(scope),
    at: checkTime(at),
  };
}

/**
 * Record the user taking back what they said about a film.
 *
 * Global, as the judgement it takes back is: withdrawing takes the judgement
 * back everywhere and leaves no current opinion about the film.
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
 * What currently stands about one film, in the shape recommendation work reads.
 *
 * A projection, not the claim: it carries what the user said and where it
 * applies, and leaves out everything that is Tonight's own bookkeeping — who
 * claimed it (always them), when, and the order it was written in. Superseded
 * and withdrawn claims are absent by construction, because this is built from
 * `current` rather than from the history.
 */
export type Standing = {
  title: string;
  year: number;
  /** What they said about it. */
  judgement: Judgement;
  /** Their words for why they judged it so, where they gave them. */
  because?: string;
  /** Whether they volunteered it or answered a question. Texture, never a score. */
  told: Told;
};

/**
 * What currently stands about one film: its judgement, or nothing.
 *
 * A list, of one or none, so a caller gathering every film's standing can
 * flatten them without asking which films had one.
 *
 * Built from `current`, so a superseded claim and a withdrawn one are simply
 * not here. There is no filtering step that could forget to run.
 */
export function standing(acts: readonly Act[]): Standing[] {
  const held = current(acts);
  return held === null ? [] : [projected(held)];
}

function projected(verdict: Verdict): Standing {
  return {
    title: verdict.film.title,
    year: verdict.film.year,
    judgement: verdict.assertion.judgement,
    ...(verdict.assertion.because === null ? {} : { because: verdict.assertion.because }),
    told: verdict.told,
  };
}

/**
 * The claim that stands about the film, or none.
 *
 * The latest act decides: a verdict stands until a later one corrects it or a
 * withdrawal takes it back, and nothing underneath a withdrawal shows through.
 *
 * `null` means nothing stands: either nobody spoke, or they took it back. Both
 * are silence, and silence is a complete answer rather than a gap.
 */
export function current(acts: readonly Act[]): Verdict | null {
  const line = ordered(acts);
  const latest = line[line.length - 1];
  return latest?.said === "verdict" ? latest : null;
}

/**
 * Which claims no longer stand, and what displaced each one.
 *
 * This is the temporal-status facet, derived rather than stored: §6 requires a
 * Claim to say whether it is *"current, or superseded by a later Claim — and by
 * which"*, and reading that off the order means it can never contradict the
 * order. Every verdict but the last was displaced by the act after it.
 */
export function supersession(acts: readonly Act[]): { verdict: Verdict; by: Act }[] {
  const line = ordered(acts);
  return line.flatMap((act, at) => {
    const next = line[at + 1];
    return act.said === "verdict" && next ? [{ verdict: act, by: next }] : [];
  });
}

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
  return checked.sort(byInstantThenOrder);
}

/**
 * Which of two acts came first.
 *
 * Three rules, in order, and the first that decides wins:
 *
 * 1. **The instant the user spoke.** Time is part of the claim, so this is the
 *    order that means something.
 * 2. **The order the store accepted them in**, where both carry one. Two calls
 *    can share a millisecond; the second one the store took is the second one
 *    they said, and a correction made inside that millisecond still takes.
 * 3. **Canonical content**, and only where neither carries an order — rows
 *    written before the store recorded one. Deterministic and stable, but it is
 *    a fallback rather than a meaning: nothing recorded which of two such acts
 *    came first, so this admits that rather than inventing an answer.
 *
 * An act that carries an order sorts after one that does not, at the same
 * instant, because the column was added later: anything holding one was written
 * after everything that is missing it.
 */
function byInstantThenOrder(a: Act, b: Act): number {
  const difference = Date.parse(a.at) - Date.parse(b.at);
  if (difference !== 0) return difference;

  const left = orderOf(a);
  const right = orderOf(b);
  if (left !== null && right !== null) return left - right;
  if (left !== null) return 1;
  if (right !== null) return -1;

  const one = JSON.stringify(canonical(a));
  const other = JSON.stringify(canonical(b));
  return one < other ? -1 : one > other ? 1 : 0;
}

/** An act with its keys in a fixed order, so equal content compares equal. */
function canonical(act: Act): unknown {
  return act.said === "verdict"
    ? [act.said, act.claimant, act.film.title, act.film.year, act.at, act.scope, act.told, act.assertion]
    : [act.said, act.claimant, act.film.title, act.film.year, act.at, act.scope];
}

const key = filmKey;

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
    return handled(stateVerdict(act.film, act.assertion, act.told, act.at, act.scope), act);
  }
  if (act.said === "withdrawal") {
    for (const owned of ["assertion", "told"]) {
      if (owned in act) throw new VerdictError(`A withdrawal asserts nothing, so it has no ${owned}.`);
    }
    return handled(withdrawVerdict(act.film, act.at, act.scope), act);
  }
  throw new VerdictError("Each act says whether it is a verdict or a withdrawal.");
}

/**
 * Puts the write order back on a rebuilt act, if it came with one.
 *
 * The constructors do not take one and never will: the order is the store's to
 * allocate, and a claim that could carry its own would be a claim whose place in
 * the history its author chose. So it is reattached here rather than passed
 * through, and anything that is not a whole positive number is refused rather
 * than dropped — a malformed order means the row did not come from the store.
 */
function written(act: Act, order: unknown): Act {
  if (order === undefined || order === null) return act;
  if (typeof order !== "number" || !Number.isInteger(order) || order <= 0) {
    throw new VerdictError("A write order is a whole number, and the store assigns it.");
  }
  return { ...act, order } as unknown as Act;
}

/**
 * Puts both of persistence's handles back on a rebuilt act.
 *
 * Rebuilding is how this model refuses to trust what it was handed: every act
 * is constructed again from its stated parts, so anything that is not a stated
 * part is dropped. That is right for claims and wrong for the handles, which
 * would then survive a read and vanish the moment anything resolved a history —
 * and a reference that disappears when you ask which verdict stands is no use
 * for taking that verdict back.
 *
 * So they are reattached here, deliberately and in one place, rather than
 * being let through the constructors.
 */
function handled(act: Act, from: Record<string, unknown>): Act {
  const ordered = written(act, from.order);
  if (from.ref === undefined || from.ref === null) return ordered;
  if (typeof from.ref !== "string" || from.ref.trim() === "") {
    throw new VerdictError("A reference to an act is text, and the store assigns it.");
  }
  return { ...ordered, ref: from.ref } as unknown as Act;
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
 * What is being said, checked as a judgement — the only thing a verdict says.
 *
 * Turning a film down is refused with the reason and where it goes instead,
 * rather than as an unknown shape: it is the mistake a caller who learned the
 * old surface is most likely to make, and *"not ever"* written down as
 * `disliked` would be the wrong model — a dislike says they watched it.
 */
function checkAssertion(value: unknown): Assertion {
  const assertion = value as Record<string, unknown> | null;
  if (typeof assertion !== "object" || assertion === null) {
    throw new VerdictError("Say what they said: a judgement.");
  }
  if (assertion.about === "rejection" || "rejection" in assertion) {
    throw new VerdictError(NOT_A_VERDICT);
  }
  if (assertion.about !== "judgement") {
    throw new VerdictError("An assertion is a judgement.");
  }
  if (!isJudgement(assertion.judgement)) {
    throw new VerdictError(`A judgement is one of ${JUDGEMENTS.join(", ")}.`);
  }
  return {
    about: "judgement",
    judgement: assertion.judgement,
    because: checkWords(assertion.because, "An explanation"),
  };
}

/**
 * Where a refusal goes instead of here, said once for every surface that meets one.
 */
export const NOT_A_VERDICT =
  "Turning a film down is not a verdict. Not wanting it suggested again is where the film " +
  "stands on their list — viewing dont-want-to-see — and \"not tonight\" is not recorded.";

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
 * Where a claim applies, checked as the one scope there is.
 *
 * An evening is refused rather than ignored: a claim that arrived naming one
 * was meant to apply only there, and quietly making it global would widen what
 * somebody said.
 */
function checkScope(value: unknown): Scope {
  if (value === "everywhere" || value === undefined) return "everywhere";
  throw new VerdictError("A verdict is about the film, so it applies everywhere and nowhere narrower.");
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
