/**
 * A film evening Tonight was part of, offer by offer.
 *
 * One evening may run over several recommendation rounds, and may hold films the
 * user brought up themselves. Each film of the evening is an **Offer**: a row
 * that says whether Tonight recommended it (`offered`) and what the user said
 * happened with it. This is history, and history is not taste — which is why it
 * is a module of its own, and why nothing here reads or writes a genre, a vibe, a
 * Movie or a verdict, and nothing here concludes anything about what somebody
 * likes.
 *
 * ## Four facts per offer, each one known or not
 *
 *     chosen     they intend to watch it
 *     started    they actually began it — true without `chosen` is fine
 *     finished   they completed it — and so began it (F2)
 *     passed     an explicit "not tonight", with their reason if they gave one
 *
 * Every fact is `Established<boolean>`: unknown until the user states it, and
 * then exactly what they stated. Unknown is a permanent, ordinary, complete
 * answer, never a quiet no. The one entailment is F2 — saying they finished a
 * film says they began it — and nothing else is ever derived: not from another
 * fact, not from a verdict, not from a viewing, not from another evening.
 *
 * ## The rules, by the names the plan gives them
 *
 *     F1  independence — nothing set from anything but F2
 *     F2  finished ⇒ started, with explicit statements taking precedence
 *     F3  a pass excludes taking: passed with chosen or started is refused
 *     F4  a reason belongs to a pass
 *     F5  an offer they brought up lives only while one of its facts is known
 *     F6  an evening with no request lives only while it holds an offer
 *     F7  one statement per offer per array
 *
 * Identity inside an evening is the exact title and year, as M8's duplicate rule
 * was: no folding, no truncation, no digest. A film offered again in a later
 * round is the same offer, keeps its first place and what was said about it.
 */

/** How a field came to be known. There is no third way, and no default. */
export type Source =
  /** Tonight was there: it received the request, it made the offer. */
  | "observed"
  /** The user said so. The only way a fact about an offer is ever established. */
  | "stated";

/**
 * A fact, or the honest absence of one.
 *
 * A union rather than a nullable value because *"they told me they did not
 * finish it"* and *"nobody ever said"* are different answers, and `false` alone
 * cannot hold both.
 */
export type Established<T> = { known: true; value: T; source: Source } | { known: false };

/** The permanent, first-class absence. Not a placeholder for a later value. */
export const UNKNOWN: Established<never> = { known: false };

/** Something the user stated. Offer facts are only ever established this way. */
export function stated<T>(value: T): Established<T> {
  return { known: true, value, source: "stated" };
}

/** Something Tonight witnessed itself. Only the request and the offer list qualify. */
export function observed<T>(value: T): Established<T> {
  return { known: true, value, source: "observed" };
}

/** One of the four facts an offer carries. */
export type Said = Established<boolean>;

/** The four facts, in the order they are always listed. */
export const FACTS = ["chosen", "started", "finished", "passed"] as const;
export type Fact = (typeof FACTS)[number];

/**
 * One film of an evening.
 *
 * `offered` is whether Tonight recommended it in any round of this evening;
 * `false` is a film they brought up themselves. `lead` is whether Tonight led
 * with it in some round, and only an offered film can have led.
 */
export type Offer = {
  title: string;
  year: number;
  offered: boolean;
  lead: boolean;
  chosen: Said;
  started: Said;
  finished: Said;
  passed: Said;
  /** Their words for passing, present only while `passed` is true. */
  passReason?: string;
};

/**
 * One evening.
 *
 * `request` is what they asked for, in their words, or `null` for an evening
 * they told Tonight about without asking it anything (`record_episode` with
 * their own films). `offers` are in the order each film first appeared.
 */
export type Episode = {
  request: string | null;
  /** How the request came to be what it says. Meaningless while `request` is null. */
  requestSource: Source;
  offers: readonly Offer[];
  /** How the offered set came to be what it says. */
  offeredSource: Source;
};

/**
 * An episode that has been written down, and can be found again.
 *
 * `recordedAt` is when Tonight wrote the evening down — not when it happened,
 * and never presented as though it were.
 */
export type Recorded<T> = T & { id: string; recordedAt: string };

/** One film as Tonight offered it in a round — M8's `Offer`, renamed. */
export type OfferedFilm = { title: string; year: number; lead: boolean };

/**
 * What the user said about one film of the evening.
 *
 * A key left out keeps the stored value. `null` takes it back to unknown —
 * allowed in `correct_episode` only; `record_episode` is additive and refuses it.
 */
export type OfferStatement = {
  title: string;
  year: number;
  chosen?: boolean | null;
  started?: boolean | null;
  finished?: boolean | null;
  passed?: boolean | null;
  passReason?: string | null;
};

export const MAX_REQUEST_LENGTH = 2_000;
/** Films Tonight may put forward in one round, as before. */
export const MAX_OFFERED = 10;
/** Films one evening may hold, every round and their own films together. */
export const MAX_OFFERS_PER_EVENING = 50;
export const MAX_PASS_REASON_LENGTH = 2_000;

export class EpisodeError extends Error {
  override readonly name = "EpisodeError";
}

/** What a new evening is recorded from. */
export type Beginning = { request?: unknown; offered?: unknown; offers?: unknown };

/** What a later round of the same evening adds. */
export type Round = { offered?: unknown; offers?: unknown };

/** What a correction may change. Every key is optional; an absent key is untouched. */
export type Correction = { request?: unknown; offered?: unknown; offers?: unknown };

/**
 * The words `correct_episode` used to take, and why they are refused.
 *
 * Kept as one sentence so the MCP boundary and the model say the same thing.
 */
export const FACTS_ARE_PER_OFFER =
  "Facts are per offer now — offers: [{ title, year, chosen | started | finished | passed }]. " +
  "An evening no longer has one chosen film or one watched/finished.";

/**
 * Begin an evening.
 *
 * Tonight's offers for this round are observed; the user's statements, if any,
 * fill facts in. A request is required whenever Tonight offered something, and
 * an evening needs a request or at least one film — otherwise it records
 * nothing. Statements here are additive: there is nothing stored to retract.
 */
export function beginEpisode(input: Beginning): Episode {
  const request = input.request === undefined || input.request === null ? null : checkRequest(input.request);
  const offered = checkOffered(input.offered ?? [], { max: MAX_OFFERED, oneLead: true });
  const statements = checkStatements(input.offers ?? []);

  if (offered.length > 0 && request === null) {
    throw new EpisodeError(
      "An evening Tonight recommended films for records what they asked for — give the request, in their words.",
    );
  }

  let offers: Offer[] = offered.map((film) => offerFrom(film, true));
  offers = applyStatements(offers, statements, "additive");
  const episode: Episode = { request, requestSource: "observed", offers, offeredSource: "observed" };
  if (isEmpty(episode)) {
    throw new EpisodeError(
      "An evening records what they asked for, or a film of it — say one of the two.",
    );
  }
  return checkEpisode(episode);
}

/**
 * Add a later round to an evening: more films Tonight offered, and what was
 * said in the same breath.
 *
 * Additive only. A film already there becomes offered and gains the lead if it
 * leads this round; nothing stored is removed or overwritten — a statement may
 * fill an unknown fact or a missing reason, restating a stored value is a
 * no-op, and anything else is refused and routed to `correct_episode`.
 */
export function addRound(episode: Episode, round: Round): Episode {
  if ("request" in round) {
    throw new EpisodeError(
      "An evening keeps the request it was recorded with; a later round adds films, not a new request.",
    );
  }
  const offered = checkOffered(round.offered ?? [], { max: MAX_OFFERED, oneLead: true });
  const statements = checkStatements(round.offers ?? []);
  if (!offered.length && !statements.length) {
    throw new EpisodeError("A round adds films Tonight offered, or what they said about one.");
  }

  const offers = episode.offers.map((offer) => ({ ...offer }));
  for (const film of offered) {
    const at = offers.findIndex((offer) => same(offer, film));
    if (at === -1) {
      offers.push(offerFrom(film, true));
    } else {
      const was = offers[at]!;
      offers[at] = { ...was, offered: true, lead: was.lead || film.lead };
    }
  }
  return checkEpisode({ ...episode, offers: applyStatements(offers, statements, "additive") });
}

/**
 * Put an evening right.
 *
 * - `request` replaces the request, which becomes `stated`.
 * - `offered` replaces the set of films Tonight offered, with leads as given,
 *   and the set becomes `stated`. A film leaving the set stays as theirs while
 *   something they said about it stands (F5).
 * - `offers` merges statements one film at a time; `null` takes a fact back.
 *
 * The result may be an evening with no request and no film (F6). That is not
 * refused here: the store deletes such an evening rather than writing it.
 */
export function correctEpisode(episode: Episode, correction: Correction): Episode {
  for (const retired of ["chosen", "watched", "finished"]) {
    if (retired in correction) throw new EpisodeError(FACTS_ARE_PER_OFFER);
  }
  const keys = ["request", "offered", "offers"] as const;
  if (!keys.some((key) => key in correction && correction[key] !== undefined)) {
    throw new EpisodeError("Say what to correct: the request, the films offered, or what they said about one.");
  }

  let request = episode.request;
  let requestSource = episode.requestSource;
  if (correction.request !== undefined) {
    if (correction.request === null) {
      throw new EpisodeError("A request can be corrected, not removed.");
    }
    request = checkRequest(correction.request);
    requestSource = "stated";
  }

  let offers = episode.offers.map((offer) => ({ ...offer }));
  let offeredSource = episode.offeredSource;
  if (correction.offered !== undefined) {
    const offered = checkOffered(correction.offered, { max: MAX_OFFERS_PER_EVENING, oneLead: false });
    offers = offers.map((offer) => {
      const film = offered.find((one) => same(offer, one));
      return film ? { ...offer, offered: true, lead: film.lead } : { ...offer, offered: false, lead: false };
    });
    for (const film of offered) {
      if (!offers.some((offer) => same(offer, film))) offers.push(offerFrom(film, true));
    }
    offeredSource = "stated";
  }

  if (correction.offers !== undefined) {
    offers = applyStatements(offers, checkStatements(correction.offers), "correct");
  }

  // F5, after the whole call has merged.
  offers = offers.filter((offer) => offer.offered || FACTS.some((fact) => offer[fact].known));

  return checkEpisode({ request, requestSource, offers, offeredSource });
}

/** An evening with no request and no film: nothing left to record (F6). */
export function isEmpty(episode: Episode): boolean {
  return episode.request === null && episode.offers.length === 0;
}

/**
 * The invariants every stored evening holds, checked whole.
 *
 * Every write path ends here, so a new evening, a round and a correction are
 * held to one definition — identity included, since no index enforces it.
 */
export function checkEpisode(episode: Episode): Episode {
  if (episode.offers.length > MAX_OFFERS_PER_EVENING) {
    throw new EpisodeError(`An evening holds at most ${String(MAX_OFFERS_PER_EVENING)} films.`);
  }
  const seen = new Set<string>();
  for (const offer of episode.offers) {
    const key = identity(offer);
    if (seen.has(key)) {
      throw new EpisodeError(`${describe(offer)} is in that evening twice.`);
    }
    seen.add(key);
    if (offer.lead && !offer.offered) {
      throw new EpisodeError(`Only a film Tonight offered can have led: ${describe(offer)}.`);
    }
    if (isTrue(offer.finished) && !isTrue(offer.started)) {
      throw new EpisodeError(`They finished ${describe(offer)}, so they started it.`);
    }
    if (isTrue(offer.passed) && (isTrue(offer.chosen) || isTrue(offer.started))) {
      throw new EpisodeError(
        `They passed on ${describe(offer)} that evening, so it cannot also be chosen or started — ` +
          "if they changed their mind, take the pass back (passed: null) in the same call.",
      );
    }
    if (offer.passReason !== undefined && !isTrue(offer.passed)) {
      throw new EpisodeError(`A reason belongs to a pass: ${describe(offer)} is not passed.`);
    }
    if (!offer.offered && !FACTS.some((fact) => offer[fact].known)) {
      throw new EpisodeError(
        `${describe(offer)} was not offered by Tonight, so it is in the evening only for what they said about it — say something.`,
      );
    }
  }
  return episode;
}

/* ------------------------------------------------------------- statements */

type Mode = "additive" | "correct";

/**
 * Merge statements into the offers, one film at a time.
 *
 * `additive` is `record_episode`'s: fill what is unknown, restate what is known,
 * and refuse anything that would change or remove a stored value. `correct` is
 * `correct_episode`'s: set, change, or take back with `null`.
 */
function applyStatements(offers: Offer[], statements: readonly OfferStatement[], mode: Mode): Offer[] {
  const result = offers.map((offer) => ({ ...offer }));
  for (const statement of statements) {
    const at = result.findIndex((offer) => same(offer, statement));
    const isNew = at === -1;
    if (isNew) {
      const states = FACTS.some((fact) => statement[fact] !== undefined && statement[fact] !== null);
      if (!states) {
        throw new EpisodeError(
          `${describe(statement)} is not in that evening; to add it, say what they said about it.`,
        );
      }
    }
    const was: Offer = isNew ? offerFrom(statement, false) : result[at]!;
    const next = merge(was, statement, mode);
    if (isNew) result.push(next);
    else result[at] = next;
  }
  return result;
}

function merge(was: Offer, statement: OfferStatement, mode: Mode): Offer {
  const next: Offer = { ...was };

  for (const fact of FACTS) {
    const value = statement[fact];
    if (value === undefined) continue;
    if (mode === "additive") {
      if (value === null) {
        throw new EpisodeError(
          `Taking something back is a correction — use correct_episode for ${describe(statement)}.`,
        );
      }
      if (was[fact].known && was[fact].value !== value) {
        throw new EpisodeError(
          `${describe(statement)} already has ${fact}: ${String(was[fact].value)}. Changing it is a correction — use correct_episode.`,
        );
      }
    }
    next[fact] = value === null ? UNKNOWN : stated(value);
  }

  // F2, exactly. Explicit statements take precedence over the entailment.
  if (isTrue(next.finished)) {
    if (statement.started === false || statement.started === null) {
      throw new EpisodeError(
        `They finished ${describe(statement)} — that says they started it. Take the finish back too, or say started.`,
      );
    }
    if (next.started.known && next.started.value === false) {
      throw new EpisodeError(
        `${describe(statement)} is recorded as not started. If they finished it after all, say started: true in the same call.`,
      );
    }
    if (!next.started.known) next.started = stated(true);
  }

  // F4: the reason follows the pass.
  if (statement.passReason !== undefined) {
    if (statement.passReason === null) {
      if (mode === "additive") {
        throw new EpisodeError(
          `Taking a reason back is a correction — use correct_episode for ${describe(statement)}.`,
        );
      }
      delete next.passReason;
    } else {
      const reason = checkReason(statement.passReason);
      if (mode === "additive" && was.passReason !== undefined && was.passReason !== reason) {
        throw new EpisodeError(
          `${describe(statement)} already has a reason for the pass. Changing it is a correction — use correct_episode.`,
        );
      }
      next.passReason = reason;
    }
  }
  if (!isTrue(next.passed) && statement.passReason === undefined) delete next.passReason;

  return next;
}

/* ------------------------------------------------------------ validation */

function checkRequest(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new EpisodeError("An evening records what they asked for, in their words.");
  }
  const request = value.trim();
  if (request.length > MAX_REQUEST_LENGTH) {
    throw new EpisodeError(`A request is at most ${String(MAX_REQUEST_LENGTH)} characters.`);
  }
  return request;
}

function checkReason(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new EpisodeError("A reason is their words, or left out.");
  }
  const reason = value.trim();
  if ([...reason].length > MAX_PASS_REASON_LENGTH) {
    throw new EpisodeError(`A reason is at most ${String(MAX_PASS_REASON_LENGTH)} characters.`);
  }
  return reason;
}

function checkOffered(value: unknown, limits: { max: number; oneLead: boolean }): OfferedFilm[] {
  if (!Array.isArray(value)) {
    throw new EpisodeError("The films offered are a list, empty if none were.");
  }
  if (value.length > limits.max) {
    throw new EpisodeError(`At most ${String(limits.max)} films were offered.`);
  }
  const offered = value.map(checkOfferedFilm);
  if (limits.oneLead && offered.filter((film) => film.lead).length > 1) {
    throw new EpisodeError("An answer has one lead, not several.");
  }
  noDuplicates(offered, "offered");
  return offered;
}

function checkOfferedFilm(value: unknown): OfferedFilm {
  const film = value as Partial<OfferedFilm> | null;
  if (typeof film !== "object" || film === null) {
    throw new EpisodeError("Each film offered has a title, a year and whether it led.");
  }
  const { title, year } = checkFilm(film);
  if (typeof film.lead !== "boolean") {
    throw new EpisodeError("Say whether the film led or was a direction.");
  }
  return { title, year, lead: film.lead };
}

function checkStatements(value: unknown): OfferStatement[] {
  if (!Array.isArray(value)) {
    throw new EpisodeError("What they said is a list, one entry per film.");
  }
  if (value.length > MAX_OFFERS_PER_EVENING) {
    throw new EpisodeError(`At most ${String(MAX_OFFERS_PER_EVENING)} films in one call.`);
  }
  const statements = value.map(checkStatement);
  noDuplicates(statements, "offers");
  return statements;
}

function checkStatement(value: unknown): OfferStatement {
  const raw = value as Record<string, unknown> | null;
  if (typeof raw !== "object" || raw === null) {
    throw new EpisodeError("Each statement names a film by title and year.");
  }
  const allowed = new Set(["title", "year", ...FACTS, "passReason"]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new EpisodeError(
        `Not a fact about an offer: ${key}. The facts are chosen, started, finished and passed (with passReason).`,
      );
    }
  }
  const statement: OfferStatement = checkFilm(raw);
  for (const fact of FACTS) {
    const said = raw[fact];
    if (said === undefined) continue;
    if (said !== null && typeof said !== "boolean") {
      throw new EpisodeError(`Whether they ${fact} it is yes or no, or null to take it back.`);
    }
    statement[fact] = said;
  }
  if (raw.passReason !== undefined) {
    statement.passReason = raw.passReason === null ? null : checkReason(raw.passReason);
  }
  return statement;
}

function checkFilm(value: { title?: unknown; year?: unknown }): { title: string; year: number } {
  if (typeof value.title !== "string" || value.title.trim() === "") {
    throw new EpisodeError("A film has a title.");
  }
  if (typeof value.year !== "number" || !Number.isInteger(value.year)) {
    throw new EpisodeError("A film has a year.");
  }
  return { title: value.title.trim(), year: value.year };
}

/** F7: the same film twice in one array is refused. */
function noDuplicates(films: readonly { title: string; year: number }[], where: string): void {
  const seen = new Set<string>();
  for (const film of films) {
    const key = identity(film);
    if (seen.has(key)) {
      throw new EpisodeError(`${describe(film)} is named twice in ${where}; say each film once.`);
    }
    seen.add(key);
  }
}

/* ---------------------------------------------------------------- helpers */

function offerFrom(film: { title: string; year: number; lead?: boolean }, offered: boolean): Offer {
  return {
    title: film.title,
    year: film.year,
    offered,
    lead: offered ? (film.lead ?? false) : false,
    chosen: UNKNOWN,
    started: UNKNOWN,
    finished: UNKNOWN,
    passed: UNKNOWN,
  };
}

/** Identity inside one evening: the exact title and the year. */
function identity(film: { title: string; year: number }): string {
  return `${film.title}\u0000${String(film.year)}`;
}

function same(one: { title: string; year: number }, other: { title: string; year: number }): boolean {
  return one.title === other.title && one.year === other.year;
}

function isTrue(fact: Said): boolean {
  return fact.known && fact.value;
}

function describe(film: { title: string; year: number }): string {
  return `${film.title} (${String(film.year)})`;
}

/**
 * An evening as it is shown: `requestSource` only where there is a request.
 *
 * The one projection every surface uses — `get_episodes`, the write answers and
 * `get_memory` — so the shape cannot differ between them.
 */
export function shown<T extends Episode>(episode: T): Omit<T, "requestSource"> & { requestSource?: Source } {
  if (episode.request !== null) return episode;
  const { requestSource: _unused, ...rest } = episode;
  void _unused;
  return rest;
}
