# Phase 2 — milestone plan

**Status: planning only. Nothing implemented.** The source of truth is `phase-2-architecture.md`,
adopted in `13b4e3f`. Phase 1 stays frozen at instruction version `0c0dce73`.

This document says what each milestone is and when it is done. It does not design storage, APIs,
tool surfaces or code, and a milestone that cannot be described without them has been scoped wrong.

## The two ordering rules

Everything below obeys the architecture's roadmap constraints, and they are not negotiable inside a
milestone:

> **Correction and deletion ship with every memory type, in the milestone that introduces it.**
> A milestone that creates a kind of memory and defers its correction to a later one is
> mis-scoped, however small the memory seems.
>
> **Relevance decay and drift safety precede autonomous unprompted behaviour.**
> M7 before M8, always.

## The ownership boundary, restated

Each milestone below repeats two fields — *written automatically* and *requires a user act* —
because that is the line the whole architecture turns on. The general rule, from §2 and §5:

| Class | Author | May be written without a user act |
| --- | --- | --- |
| Verdict | User | **No** |
| Declaration | User | **No** |
| Observation | Agent | Yes — non-authoritative, behaviourally inactive |
| Proposal | Agent | Yes — inert until acted on |
| Episode field | Runtime or user | Only what was observed or stated; otherwise `unknown` |
| Operational state | Runtime | Yes |

---

## M1 — Remembers the evening

**1. User-visible capability.** *"What was that film you suggested last week?"* — and *"no, I never
watched that."* Tonight remembers the conversations it had, and the user can correct or erase any
of them.

**2. Conceptual scope.** The Episode as an entity: one evening, with fields for what was asked in
their words, what was offered, and what the user says happened. Episodes are linked to the
Conversations that produced them.

**3. New knowledge that may exist.** Episodes. Nothing else — no taste is derived from them in this
milestone, which is what makes it safe to ship first.

**4. Written automatically.** What Tonight directly observed in its own runtime: the request, the
offer, the time, the conversation it belonged to. Operational state.

**5. Requires a user act.** Every field describing what the user did — chosen, watched, finished.
Absent a statement, each stays `unknown` permanently.

**6. Correction and deletion.** Any Episode field can be corrected in one sentence; any Episode can
be deleted entirely. Deletion is behavioural: a deleted Episode stops informing anything, not
merely stops being displayed.

**7. Evaluation gate.** Episode factuality (every field observed, stated, or `unknown`; nothing
inferred along the recommendation→choice→watched→finished→liked chain) · write permission · deletion
verified behaviourally · Phase 1's eight ACs still pass, since recommendation behaviour must not
move.

**8. Non-goals.** No inference from Episodes. No taste change. No confidence. No situations, no
companions. No unprompted anything.

**9. Completion condition.** A scripted history of many evenings produces an Episode record that
matches what actually happened, with `unknown` wherever nothing was established; every correction
and deletion takes effect in behaviour; and recommendations are unchanged from Phase 1.

**10. Dependencies.** None. This is the foundation.

---

## M2 — Remembers the verdict

**1. User-visible capability.** When the user comes back, Tonight already knows what it suggested
last time and can ask — lightly, and not always — whether it landed. It remembers the answer, and
recommendations start to improve with the reason visible.

The value arrives the next time the user opens a conversation, not in the gap between. Someone who
returns a week later gets *"did you ever get to Prisoners?"* as the opening beat of a conversation
they started, and volunteering a verdict unasked works just as well.

**2. Conceptual scope.** Verdicts as first-class Claims with their texture: what was said, when, and
whether it was volunteered or asked for. The distinction between *not tonight* and *not ever* for
rejections.

**Verdict capture lives entirely inside an active, user-initiated interaction.** Tonight may ask
when the user is already engaged; it may never initiate contact in order to collect one. There is no
follow-up message, no reminder, no scheduled check-in. An open question about a film is a thing
Tonight carries until the user next appears, not a reason to appear itself.

This is a scope boundary, not a preference. Unprompted outreach is an M8 capability and depends on
M7's staleness safeguards; letting it in through M2 because the question seems harmless would ship
the autonomy before anything that keeps it honest — the third risk in §9 of the architecture,
arriving exactly as that risk describes, one reasonable-looking step at a time.

**3. New knowledge that may exist.** Verdicts. Rejections with their reason where stated. A pending
question — that a film is awaiting a verdict — as inert operational state.

**4. Written automatically.** No knowledge about the user. The only automatic write is the inert
record that a film is still unanswered, which exists so the question can be asked at the right
moment and carries no claim about taste.

**5. Requires a user act.** Every verdict, without exception. A film being finished is not a verdict;
a film Tonight recommended being watched is not a verdict; a question going unanswered across
several sessions is not a verdict either, and an unanswered question expires quietly rather than
hardening into an assumption.

**6. Correction and deletion.** A verdict can be changed or withdrawn in one sentence, and
withdrawal removes its influence rather than replacing it with a neutral value.

**7. Evaluation gate.** Write permission · the **self-confirmation gate** in its paired form: a
trajectory where Tonight recommends, the user watches, and the event is referenced repeatedly with
no verdict given must move nothing; the same trajectory with a volunteered verdict must move
something · verdict withdrawal verified behaviourally: after a withdrawal, the recommendations that
verdict had shaped return to what they were without it · **no outbound initiation**: across a
scripted history with long gaps between sessions, Tonight produces no message outside a
user-initiated interaction, and unanswered questions expire without becoming verdicts.

**8. Non-goals.** No inference of verdicts from behaviour. No confidence model yet. No proposals. No
Mix changes. **No proactive follow-up of any kind** — no reminder, no scheduled check-in, no message
sent to collect an answer. That capability is M8's and requires M7 first.

**9. Completion condition.** Recommendations demonstrably improve across a scripted history
containing verdicts, and demonstrably do not move across the matched history containing none — with
every verdict in that history captured inside a session the user began, and no message originating
from Tonight.

**10. Dependencies.** M1 — a verdict is about a film, usually met in an Episode, and without the
Episode there is nothing to ask about.

---

## M3 — Explains itself and can be corrected

**1. User-visible capability.** *"What do you think you know about me?"* has a complete, honest
answer, and everything in it can be changed from where it is shown.

**2. Conceptual scope.** The whole-person derived view: Phase 1's taste model plus M1's episodes and
M2's verdicts, presented as one picture with provenance attached. The per-kind corrections from M1
and M2 become one coherent experience rather than two separate gestures.

**3. New knowledge that may exist.** None. This milestone adds no memory; it makes existing memory
legible.

**4. Written automatically.** Nothing new.

**5. Requires a user act.** Every change made through the view, as before.

**6. Correction and deletion.** This *is* the correction milestone in its general form — but it is
not the first, because M1 and M2 each shipped their own.

**7. Evaluation gate.** Memory fidelity: after a scripted history, does the presented picture match
what the user actually said? · every displayed belief traces to a root · no belief appears that
nobody authored · corrections applied through the view take effect behaviourally.

**8. Non-goals.** No new inference. No proposals — the user still authors every change here. No UI
design decisions belong in this plan.

**9. Completion condition.** A person who has used Tonight across a long scripted history can read
the whole picture, recognise it as their own, and correct anything wrong in it without leaving it.

**10. Dependencies.** M1 and M2 — there is nothing to explain until there is something remembered.

---

## M4 — Proposes instead of assuming

**1. User-visible capability.** Tonight occasionally says *"I've noticed something — is this right?"*
and the model grows without the user maintaining it.

**2. Conceptual scope.** Observations as agent-authored, non-authoritative Claims; Proposals as
inert offers to turn one into a Declaration or Verdict. Reflection as a runtime responsibility,
within the §5 boundary.

**3. New knowledge that may exist.** Observations. Proposals. Both agent-owned, both behaviourally
inactive until accepted.

**4. Written automatically.** Observations and Proposals — permitted by their provenance class, and
recorded as non-authoritative. Operational reflection state.

**5. Requires a user act.** Every promotion of an Observation into a Verdict or a Declaration. An
accepted Proposal is the user act; an unaccepted one expires.

**6. Correction and deletion.** A Proposal can be rejected and stays rejected — a rejected proposal
that returns next month is a worse failure than never proposing. Observations can be deleted, and
the user can see them without having to accept them.

**7. Evaluation gate.** **Reflection safety** (hard gate): reflection never creates or mutates a
Verdict or Declaration without the required user act; operational state, Observations and inert
Proposals are permitted · proposal rate per month · proposal acceptance rate · non-fabrication under
accumulation.

**Behavioural removal**, proven by recommending again after each act rather than by inspecting what
is stored:

- deleting an Observation, or rejecting a Proposal, removes its influence — subsequent answers match
  those of a history where it never existed;
- a rejected Proposal never recurs, and never reappears in any form that treats it as accepted;
- an Observation that is merely unaccepted changes no answer at all, which is the inert state being
  genuinely inert rather than weakly active.

**8. Non-goals.** No unprompted delivery of proposals — they wait to be seen. No confidence model
driving them yet. No Mix restructuring.

**9. Completion condition.** Across a long scripted history, proposals are ones a user would accept,
arrive within budget, never recur once rejected, and nothing authoritative was ever written without
a user act.

**10. Dependencies.** M3 — the architecture's load-bearing constraint. An agent that grows its own
model before the user can see the whole of it contaminates the history before the problem is
visible.

---

## M5 — Mixes that live

**1. User-visible capability.** The structure still describes the user after two years. Tonight
notices when a Mix has drifted or become two things, and proposes the change in their language.

**2. Conceptual scope.** The full Mix lifecycle from §4: drift detection, split and merge proposals,
dormancy, archiving, revival — and lineage, which is what makes all of them safe.

**3. New knowledge that may exist.** Mix versions and their supersession relationships. Drift
observations. Dormancy as a derived state.

**4. Written automatically.** Drift observations. Dormancy. Proposals to split, merge or reword.

**5. Requires a user act.** Every change to a Mix's sentence. Splits, merges, archiving, revival —
and the naming of anything that results, which must be in their words.

**6. Correction and deletion.** A version change can be undone, returning the prior version to
current. Archiving is reversible; forgetting is complete and behavioural.

**7. Evaluation gate.** Lineage integrity: prior versions readable, Episodes still resolving to the
version in force when they happened · split and merge preserve provenance **without duplicating
root evidence** · drift detection over a scripted taste change, without over-correcting from a
single episode · proposal quality.

**Behavioural removal:**

- forgetting a Mix removes it from current behaviour entirely; archiving removes its claim on
  tonight's answer while leaving it readable;
- a superseded version influences nothing — only the current version governs, and the old wording is
  history and not a competing opinion;
- lifecycle reversal leaves nothing stale behind: undoing a split, restoring an archived Mix, or
  reverting to a prior version produces the behaviour of that state and not a blend of both.

The last is the one most likely to fail quietly. A reversal that restores the structure while
leaving the superseded version still weighing on answers is invisible in the record and wrong in
every recommendation after it.

**8. Non-goals.** No automatic restructuring. No archiving by inactivity alone — dormancy is a
weight, not a decision.

**9. Completion condition.** A scripted multi-year history containing a genuine split, a merge and a
dormancy produces the right proposals at the right time, and the historical record still reads
correctly through every superseded version.

**10. Dependencies.** M4 — splits and merges are proposals, and the proposal machinery must exist and
be trusted first.

---

## M6 — Knows the occasion

**1. User-visible capability.** The right film for *this* evening, not just this person. Tonight
distinguishes a Sunday alone from a Friday with a partner.

**2. Conceptual scope.** Situations and companions, with the §6 scoping rules made real: global taste
as inherited base, contextual Claims refining it locally, companion evidence staying with the
companion.

**3. New knowledge that may exist.** Situations. Persons as companions. Scoped contextual Claims.
User-reported Claims *about* companions.

**4. Written automatically.** Which situation and which companions an Episode occurred in, when
observed or stated. Observations about context.

**5. Requires a user act.** Every durable contextual Declaration. Every attribution of a joint
evening's outcome to the user individually. A companion's own taste — which Tonight never holds,
only the user's report of it.

**6. Correction and deletion.** A situation can be redefined or removed. A companion can be removed,
and removing one removes the evidence scoped to them from behaviour.

**7. Evaluation gate.** **Scope containment**: contextual and companion evidence never becomes global
taste · companion separation: a long history of joint evenings does not shift the user's individual
model · a user's report about a companion never becomes that companion's Verdict.

**Behavioural removal:**

- removing a contextual Claim removes its influence *in that context*, and leaves every other
  context untouched;
- removing a companion removes the knowledge scoped to them from behaviour — and answers for the
  user alone are unchanged by the removal, because that knowledge was never contributing to them;
- joint-Episode context does not survive removal as unscoped personal preference. After a companion
  is removed, a year of evenings with them leaves no residue in who Tonight thinks the user is.

The second and third together are the real test: if removing a companion changes the user's solo
recommendations, then companion evidence had been leaking into global taste all along, and the
removal has only made an existing failure visible.

**8. Non-goals.** No accounts or identity for companions — the architecture's derived view stands, and
a companion is a scope, not a user. No inference of who was present.

**9. Completion condition.** A scripted history of a year of joint viewing leaves the user's
individual model unmoved, while evenings in that company are visibly better served.

**10. Dependencies.** M1 for Episodes to carry context, M3 so contextual beliefs are visible and
correctable like any other.

---

## M7 — Survives change

**1. User-visible capability.** Still right three years in — and able to tell when it is not.
*"You loved this kind of thing, though that was a while ago — still true?"*

**2. Conceptual scope.** The two-axis confidence model in operation: historical authority fixed,
present relevance decaying. Drift detection over long spans. Stale-model recognition. Revival of
dormant structure.

**3. New knowledge that may exist.** Derived relevance. Staleness observations. Drift observations.

**4. Written automatically.** All of the above — derived and agent-owned. Nothing authoritative.

**5. Requires a user act.** Every resolution of a detected drift. Tonight may say a belief looks
stale; only the user can retire it.

**6. Correction and deletion.** The user can reject a staleness judgement and restore a belief's
weight, and can retire a belief outright.

**7. Evaluation gate.** **Evidence accounting** (no root counted twice, no derived claim
strengthening an ancestor) · confidence calibration: when Tonight is sure, is it right more often
than when it hedges? · drift handling without over-correction · longitudinal quality against
Tonight's own earlier self on the same history.

**Behavioural removal — and the two-axis model proven, not asserted:**

- a retired Claim stops influencing current recommendations completely; a rejected staleness
  judgement restores the weight it had;
- **historical authority survives what relevance loses.** After a belief is retired, *"you loved this
  in 2024"* is still answerable and still true, while tonight's answer is the one it would have been
  had that belief never existed. Relevance falling to zero and the record disappearing are different
  outcomes, and this gate is where the difference becomes testable;
- retired context does not leak back. A belief retired in one context does not resurface in another
  through a derived path.

**8. Non-goals.** No automatic retirement of beliefs. No unprompted speech — that is M8, and this
milestone exists to make it safe.

**9. Completion condition.** On a scripted history containing a real taste change, Tonight notices
within a reasonable span, does not over-correct from one episode, and its stated confidence tracks
its actual accuracy.

**10. Dependencies.** M2 for verdicts to decay, M5 for structure to go dormant, M4 for staleness to
surface as a proposal rather than an action.

---

## M8 — Works when not asked

**1. User-visible capability.** Tonight brings you something. Preparation for a known occasion,
background discovery, and rare unprompted speech the user is glad to receive.

**2. Conceptual scope.** Plans and Goals with visible state; long-running work; the notification
budget; background discovery. The full runtime from §5.

**3. New knowledge that may exist.** Plans, Goals, Threads, and their operational state.

**4. Written automatically.** Plan and task state. Discovery observations. Nothing authoritative,
and nothing that changes behaviour while suspended.

**5. Requires a user act.** Starting any plan. Every durable conclusion drawn from background work.
Permission to speak unprompted at all.

**6. Correction and deletion.** Every plan is visible, pausable and cancellable; cancelling removes
its state. Unprompted speech can be turned off entirely and per kind.

**7. Evaluation gate.** **Resumption**: an interrupted long task resumes correctly, having created no
unauthorised user-authoritative or behaviour-changing memory while suspended · interruption budget:
unprompted messages per month and their acceptance · reflection safety still holds under background
operation.

**Behavioural removal:**

- cancelling a plan stops it — no further work, no further messages, and its state stops influencing
  anything;
- a notification opt-out is respected across the whole of a long history, per kind and in total;
- revoking permission for unprompted behaviour prevents all of it from that moment, including work
  already scheduled before the revocation;
- **cancelled operational state does not silently resume.** A plan cancelled and then approached
  again weeks later does not pick up where it left off unless the user restarts it.

The last is the failure that only a long trajectory catches: cancellation that suppresses the
symptom while leaving the plan alive looks identical to cancellation for weeks, until the task wakes
up and acts on a permission that was withdrawn.

**8. Non-goals.** No daily engagement. No re-engagement prompting. No notification whose purpose is
to bring the user back.

**9. Completion condition.** Across a long scripted history, unprompted messages stay within budget,
are accepted at a high rate, and a suspended plan resumed weeks later has changed nothing about what
Tonight believes.

**10. Dependencies.** **M7, strictly.** Autonomy on a model that cannot notice it has gone stale is
the worst version of every risk in §9 at once. If M8 is wanted earlier for product reasons, the only
safe form is the architecture's stated fallback: **user-requested plans only**, no unprompted speech
and no self-initiated discovery, until M7 has shipped.

---

## First implementation target

**M1 — Remembers the evening.**

It is the expected answer, and the architecture gives three independent reasons rather than one:

**Nothing else can be built without it.** Episodes are the atom of history in §6, and the evidence
model derives everything from roots that point at them. Verdicts (M2) attach to films met in
episodes; contexts (M6) are properties of episodes; drift (M7) is measured across them. M1 is the
only milestone with no dependency, and every other milestone has a path back to it.

**It is the safest place to learn the ownership boundary.** M1 introduces exactly one kind of memory
and derives no taste from it. If the provenance discipline — observed, stated, or `unknown`, with
nothing inferred along the chain — is going to be got wrong, it is far better to discover that in a
milestone where no belief about the user depends on it. Every later milestone assumes this
discipline already works.

**It delivers value without touching Phase 1's behaviour.** The recommendation quality that passed
the Phase 1 gate is untouched: M1 adds recall of what was said, not a change to what is said. That
makes its evaluation cheap and its risk low — Phase 1's eight ACs must simply still pass, and the
new gates are the objective, deterministic kind.

One thing to settle before starting, because it is a product decision rather than an architectural
one: **how the user tells Tonight what happened.** M1 depends entirely on user statements for
choice, watched and finished, and if that is awkward, every field stays `unknown` and M2 has little
to attach to. The architecture requires only that nothing be inferred; how the asking feels is open,
and it should be decided deliberately rather than discovered late.
