/**
 * What Tonight noticed, and what it is offering to do about it.
 *
 * M4's two agent-owned kinds, and the boundary between them and everything the
 * user owns. §5 of `docs/work/phase-2-architecture.md`: *reflection may persist
 * its own work — operational and runtime state, agent Observations, and inert
 * Proposals* … *reflection may never create or mutate a user-authoritative
 * Claim — a Verdict or a Declaration — without a user act.*
 *
 * So nothing here is authoritative. An Observation is Tonight reading its own
 * history; a Proposal is that reading offered back and waiting. Neither is
 * evidence, neither ages into evidence, and neither reaches `get_taste`. The
 * only thing that changes any of that is somebody accepting one, and §5 of the
 * implementation plan says which act that is: *an accepted Proposal is the user
 * act.*
 *
 * ## Why a target is data rather than a description
 *
 * A Proposal carries the change it is offering, in full. The alternative — the
 * agent reconstructing at acceptance time what it must have meant when it
 * proposed — would make the user's yes authorise something nobody showed them,
 * which is the whole failure M4 exists to prevent. What they accepted is what
 * gets written, because it is the same object.
 *
 * ## One target kind, on purpose
 *
 * A genre is what the first slice needs and what Gate 1 drives: *"you seem to
 * like restrained thrillers"* offered as a Genre the user may or may not want.
 * It is also the harder of the two kinds to protect — a Verdict refuses an
 * agent claimant in its type, and a Declaration has no such defence — so it is
 * the right one to build the lifecycle around first.
 *
 * Mixes and verdicts as targets are deliberately not here. Adding one is a new
 * variant and a new branch in `applyTo`, which is the shape this type exists to
 * keep: explicit alternatives, each with its own write, rather than an
 * open-ended action and payload that could name any operation at all.
 */

export class ReflectionError extends Error {
  override readonly name = "ReflectionError";
}

/** What a Proposal is offering to create. */
export type Target = {
  readonly kind: "genre";
  readonly name: string;
  readonly instruction: string;
};

export const TARGET_KINDS = ["genre"] as const;

/**
 * Something Tonight noticed and was not told.
 *
 * `noticed` is the agent's own sentence about its own reading. It is never the
 * user's words, it is never shown as theirs, and it carries no subject, scope,
 * confidence or evidence: none of those is needed to offer a reading back, and
 * each would be a facet of a Claim this is deliberately not.
 */
export type Observation = {
  readonly noticed: string;
  /** When Tonight noticed it. Its own, never a caller's. */
  readonly at: string;
};

/** Where a Proposal has got to. There is no fourth state in this slice. */
export const PROPOSAL_STATES = ["pending", "accepted", "rejected"] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];

/**
 * A change Tonight wants and has not made.
 *
 * §6 of the architecture: *first-class, visible, expiring, and requiring a user
 * act to become real.* Expiry is the one word of that not implemented here —
 * the roadmap sets no limit and inventing one would decide something nobody
 * decided — so a pending Proposal simply stays pending.
 */
export type Proposal = {
  /** The Observation it came from, where it came from one. */
  readonly from: string | null;
  /** Why Tonight is offering this, in the agent's own words. */
  readonly noticed: string;
  /** Exactly what acceptance would write. */
  readonly target: Target;
  readonly state: ProposalState;
  readonly at: string;
  /** When it was accepted or rejected; null while it is still pending. */
  readonly decidedAt: string | null;
};

/** One of these as persistence hands it back, by the reference it is known by. */
export type Identified<T> = T & { readonly ref: string };

export const MAX_NOTICED_LENGTH = 2_000;

/** A sentence Tonight wrote about its own reading, checked as text and nothing more. */
export function checkNoticed(value: unknown): string {
  if (typeof value !== "string") throw new ReflectionError("What Tonight noticed is text.");
  const noticed = value.trim();
  if (noticed === "") throw new ReflectionError("What Tonight noticed cannot be empty.");
  if (noticed.length > MAX_NOTICED_LENGTH) {
    throw new ReflectionError(`What Tonight noticed is at most ${String(MAX_NOTICED_LENGTH)} characters.`);
  }
  return noticed;
}

/**
 * A target, checked here and written by the store that owns the table it lands in.
 *
 * The name and instruction are checked again by the taste model when the write
 * actually happens. That is not duplication worth removing: this check is what
 * stops an unwritable Proposal from being offered to somebody in the first
 * place, and the later one is what stops anything reaching the table.
 */
export function checkTarget(value: unknown): Target {
  if (typeof value !== "object" || value === null) {
    throw new ReflectionError("A proposal needs a target: what accepting it would create.");
  }
  const draft = value as { kind?: unknown; name?: unknown; instruction?: unknown };
  if (draft.kind !== "genre") {
    throw new ReflectionError("The only change a proposal can offer yet is a genre.");
  }
  const name = typeof draft.name === "string" ? draft.name.trim() : "";
  const instruction = typeof draft.instruction === "string" ? draft.instruction.trim() : "";
  if (name === "") throw new ReflectionError("A proposed genre needs a name.");
  if (instruction === "") {
    throw new ReflectionError("A proposed genre needs an instruction: what it would mean to them.");
  }
  return { kind: "genre", name, instruction };
}

/** Refusing a transition that is not available from where the proposal is. */
export function notPending(state: ProposalState): ReflectionError {
  return new ReflectionError(
    state === "accepted"
      ? "That proposal was already accepted, and accepting it twice would write twice."
      : "That proposal was already rejected, and a rejection stands.",
  );
}

/** A reference that names no proposal of this user's. */
export function noSuchProposal(): ReflectionError {
  return new ReflectionError("No proposal of yours has that reference.");
}
