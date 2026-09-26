/**
 * An evening Tonight was part of: what was asked, what was offered, and what the
 * user later said happened.
 *
 * M1 of `docs/work/phase-2-implementation.md`. This is history, and history is
 * not taste — which is why it is a module of its own rather than three more
 * fields on the taste model. `lib/taste/store/schema.ts` said so before there was
 * anything to say it about: history, when it arrives, is "evidence for
 * *proposing* changes to this model — never a second, invisible model that
 * quietly outvotes it". Nothing here reads or writes a genre, a vibe or a movie
 * state, and nothing here concludes anything about what somebody likes.
 *
 * ## Why a field can be unknown forever
 *
 * Tonight sees what it was asked and what it offered, because it was there for
 * both. It does not see an evening. Whether a film was put on, watched to the
 * end, or abandoned twenty minutes in is something only the user can say, and
 * most of the time nobody says it.
 *
 * So the outcome fields are `unknown` until somebody states otherwise, and
 * `unknown` is a permanent, ordinary, complete answer rather than a gap waiting
 * to be filled. An episode with three unknown outcomes is a correct record of a
 * partly-known evening.
 *
 * The temptation this exists to refuse is small and reasonable every single
 * time: Tonight recommended one film, the user did not object, so surely they
 * watched it — and if they watched it to the end, surely they liked it. Each
 * step is plausible, none is observed, and the result is a detailed viewing
 * history that reads as fact, is partly invented, and is indistinguishable
 * afterwards from what the user actually said. That is the failure the
 * architecture calls a history that is inaccurate *and* reads as surveillance,
 * and it is prevented here by making the honest answer expressible.
 *
 *     A recommendation does not imply a choice.
 *     A choice does not imply it was watched.
 *     Watching does not imply finishing.
 *
 * The chain stops there on purpose. Whether they *liked* it is a Verdict, it is
 * owned by the user, and it belongs to M2 — there is deliberately nowhere in
 * this file to put one.
 */

/** How a field came to be known. There is no third way, and no default. */
export type Source =
  /** Tonight was there: it received the request, it made the offer. */
  | "observed"
  /** The user said so. The only way an outcome is ever established. */
  | "stated";

/**
 * A fact, or the honest absence of one.
 *
 * Modelled as a union rather than a nullable value because the difference
 * between *"they told me they did not finish it"* and *"nobody ever said"* is the
 * whole point, and `finished: false` cannot hold both. One is something the user
 * said and may be acted on; the other is silence and may not.
 */
export type Established<T> = { known: true; value: T; source: Source } | { known: false };

/** The permanent, first-class absence. Not a placeholder for a later value. */
export const UNKNOWN: Established<never> = { known: false };

/** Something the user stated. Outcomes are only ever established this way. */
export function stated<T>(value: T): Established<T> {
  return { known: true, value, source: "stated" };
}

/** Something Tonight witnessed itself. Only the request and the offer qualify. */
export function observed<T>(value: T): Established<T> {
  return { known: true, value, source: "observed" };
}

/** A film Tonight put forward, as it referred to it at the time. */
export type Offer = {
  title: string;
  year: number;
  /** Whether this was the lead, in the Phase 1 sense, or one of the directions. */
  lead: boolean;
};

/**
 * One evening.
 *
 * `request` and `offered` are always present and always `observed`: an episode
 * without them is not an episode, because nothing happened that Tonight was part
 * of. Every outcome is `Established` and starts unknown.
 */
export type Episode = {
  /** What they asked for, in their words. Never a paraphrase, never a summary. */
  request: string;
  /**
   * How the request came to be what it says.
   *
   * `observed` is the ordinary case: Tonight received the request and wrote it
   * down. `stated` means the user later said it was wrong and gave the right
   * one. The difference is not decoration — a corrected request is something
   * they told Tonight, and calling it observed afterwards would claim Tonight
   * witnessed a sentence it never heard.
   *
   * A plain `Source` rather than an `Established`: a request is never unknown,
   * because an evening without one is not an evening.
   */
  requestSource: Source;
  /** The films put forward. May be empty: an answer that named none is a fact too. */
  offered: readonly Offer[];
  /** How the offer list came to be what it says. As `requestSource`. */
  offeredSource: Source;
  /** Which film they said they went with. */
  chosen: Established<Offer>;
  /** Whether they said they watched it. */
  watched: Established<boolean>;
  /** Whether they said they finished it. */
  finished: Established<boolean>;
};

/**
 * An episode that has been written down, and can be found again.
 *
 * Identity exists so a later statement can reach the evening it is about. It is
 * the store's, generated there, and stable: correcting what happened does not
 * make it a different evening. `recordedAt` is when Tonight wrote the episode,
 * which is not when the evening happened and is never presented as though it
 * were — only the user could say that, and nobody asked.
 */
export type Recorded<T> = T & { id: string; recordedAt: string };

export const MAX_REQUEST_LENGTH = 2_000;
export const MAX_OFFERED = 10;

export class EpisodeError extends Error {
  override readonly name = "EpisodeError";
}

/**
 * What the user said about how the evening went.
 *
 * Every field is optional and independent, and that independence is the rule
 * rather than a convenience: there is no argument shape here that lets one
 * outcome be derived from another, so no caller can express "watched, therefore
 * finished" even by accident. A field left out stays as it was.
 */
export type OutcomeStatement = {
  chosen?: Offer | null;
  watched?: boolean | null;
  finished?: boolean | null;
};

/**
 * Everything about an evening that the user may put right.
 *
 * The outcomes, and the two facts Tonight recorded for itself. Those two are
 * here because M3 promises that what is shown can be corrected where it is
 * shown, and an evening whose request was written down wrongly cannot be
 * repaired by deleting the evening — that loses the outcomes with it.
 *
 * An absent key is untouched, as it is for the outcomes. There is no `null` for
 * `request` or `offered`: neither can be taken back to unknown, because an
 * evening is not an evening without them.
 */
export type Correction = OutcomeStatement & {
  request?: string;
  offered?: readonly Offer[];
};

/**
 * Begin an episode from what Tonight observed.
 *
 * The outcomes start unknown and there is no parameter to start them anywhere
 * else. Recording that an evening happened says nothing about how it went.
 */
export function beginEpisode(request: unknown, offered: unknown): Episode {
  return {
    request: checkRequest(request),
    // Both observed, always: recording an evening is Tonight writing down what
    // it asked and what it offered. There is no parameter to say otherwise,
    // because at this moment there is nothing else it could honestly be.
    requestSource: "observed",
    offered: checkOffered(offered),
    offeredSource: "observed",
    chosen: UNKNOWN,
    watched: UNKNOWN,
    finished: UNKNOWN,
  };
}

/**
 * Apply what the user said, and nothing else.
 *
 * `null` retracts a field to unknown — the user taking back something they said
 * leaves silence, not a false value. An absent field is untouched.
 *
 * A chosen film must be one Tonight actually offered. Anything else is a
 * different evening, and quietly accepting it would let an episode claim Tonight
 * was part of something it had no part in.
 */
export function correctEpisode(episode: Episode, correction: Correction): Episode {
  const keys = ["request", "offered", "chosen", "watched", "finished"] as const;
  if (!keys.some((key) => key in correction)) {
    throw new EpisodeError("Say what to correct: the request, the films offered, or what happened.");
  }

  // One transition, described whole before any of it is judged. Each field is
  // either what the correction says or what it already was, and the invariants
  // are then checked against *that* evening — not against a half-applied one.
  //
  // The order used to be the other way round, and it made a legitimate
  // correction impossible: replacing the offers and the choice together was
  // refused, because the new list was held against the choice the user was in
  // the middle of replacing.
  const offered = "offered" in correction ? checkOffered(correction.offered) : episode.offered;
  const chosen =
    "chosen" in correction ? choiceAmong(offered, correction.chosen) : retained(episode.chosen, offered);

  return {
    request: "request" in correction ? checkRequest(correction.request) : episode.request,
    requestSource: "request" in correction ? "stated" : episode.requestSource,
    offered,
    offeredSource: "offered" in correction ? "stated" : episode.offeredSource,
    chosen,
    watched: "watched" in correction ? establishFlag(correction.watched, "watched") : episode.watched,
    finished:
      "finished" in correction ? establishFlag(correction.finished, "finished") : episode.finished,
  };
}

/**
 * A choice they already stated, carried across a corrected offer list.
 *
 * What is being kept is *"they chose film A"*. The Offer it points at is how
 * that film was described in the list — its place, and whether it led — and a
 * corrected list may describe it differently. So the choice is rebound to the
 * entry in the new list rather than kept as the old one: otherwise the evening
 * returned here would say `lead: true` and the same evening read back from the
 * store would say `lead: false`, and both would claim to be what happened.
 *
 * If the film is not in the new list at all, the correction is refused whole.
 * What they chose is theirs and the offer list is Tonight's; dropping their
 * statement to make Tonight's list fit repairs the wrong one of the two. A
 * correction that genuinely means to change both says so, and takes the other
 * path above.
 */
function retained(chosen: Established<Offer>, offered: readonly Offer[]): Established<Offer> {
  if (!chosen.known) return UNKNOWN;
  const { title, year } = chosen.value;
  const still = offered.find((offer) => offer.title === title && offer.year === year);
  if (!still) {
    throw new EpisodeError(
      `They said they chose ${title} (${String(year)}), which is not in that list of films. ` +
        `Correct what they chose in the same breath, or leave that film in.`,
    );
  }
  return stated(still);
}

/**
 * The film they said they went with, checked against the list it must be in.
 *
 * Takes the offer list rather than the episode, because the list to check
 * against is the *corrected* one — the evening the correction is producing, not
 * the one it started from.
 */
function choiceAmong(
  offered: readonly Offer[],
  chosen: Offer | null | undefined,
): Established<Offer> {
  if (chosen === null || chosen === undefined) return UNKNOWN;
  const among = offered.find(
    (offer) => offer.title === chosen.title && offer.year === chosen.year,
  );
  if (!among) {
    throw new EpisodeError(
      `Tonight did not offer ${chosen.title} (${String(chosen.year)}) that evening.`,
    );
  }
  return stated(among);
}

function establishFlag(value: boolean | null | undefined, what: string): Established<boolean> {
  if (value === null || value === undefined) return UNKNOWN;
  if (typeof value !== "boolean") {
    throw new EpisodeError(`Whether they ${what} it is yes or no, or left unsaid.`);
  }
  return stated(value);
}

function checkRequest(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new EpisodeError("An episode records what they asked for, in their words.");
  }
  const request = value.trim();
  if (request.length > MAX_REQUEST_LENGTH) {
    throw new EpisodeError(`A request is at most ${String(MAX_REQUEST_LENGTH)} characters.`);
  }
  return request;
}

function checkOffered(value: unknown): readonly Offer[] {
  if (!Array.isArray(value)) {
    throw new EpisodeError("The films offered are a list, empty if none were.");
  }
  if (value.length > MAX_OFFERED) {
    throw new EpisodeError(`At most ${String(MAX_OFFERED)} films were offered.`);
  }
  const offered = value.map(checkOffer);
  const leads = offered.filter((offer) => offer.lead);
  if (leads.length > 1) {
    throw new EpisodeError("An answer has one lead, not several.");
  }
  // The same film twice is not an answer anybody gives, and allowing it would
  // make "which one did they choose" a question with two right answers — the
  // choice is recorded against the film, so two identical offers are two rows
  // nothing could tell apart afterwards.
  const seen = new Set(offered.map((offer) => `${offer.title}\u0000${String(offer.year)}`));
  if (seen.size !== offered.length) {
    throw new EpisodeError("The same film was offered twice.");
  }
  return offered;
}

function checkOffer(value: unknown): Offer {
  const offer = value as Partial<Offer> | null;
  if (typeof offer !== "object" || offer === null) {
    throw new EpisodeError("Each film offered has a title, a year and whether it led.");
  }
  if (typeof offer.title !== "string" || offer.title.trim() === "") {
    throw new EpisodeError("A film offered has a title.");
  }
  if (typeof offer.year !== "number" || !Number.isInteger(offer.year)) {
    throw new EpisodeError("A film offered has a year.");
  }
  if (typeof offer.lead !== "boolean") {
    throw new EpisodeError("Say whether the film led or was a direction.");
  }
  return { title: offer.title.trim(), year: offer.year, lead: offer.lead };
}
