# Tonight — Phase 2 design

**Status: proposal. Nothing implemented.** Phase 1 is frozen at instruction version `0c0dce73`; everything below assumes its behaviour as given and changes none of it.

---

## 1. Vision

Tonight should become the thing that knows what you are in the mood for slightly before you can say it, and that is measurably better at it in year three than in year one.

The scarce resource was never films. It is the match between a particular person on a particular evening and one film. Streaming recommenders attack this with behavioural traces and optimise for engagement; what they learn about you is not shown to you, not correctable by you, and not yours. Tonight works from what you *told* it. That is slower to accumulate and far more valuable: it is legible, correctable, and it belongs to the person it describes.

Phase 1 made Tonight good at one evening. Phase 2 is about the years around it. Three commitments define what that means:

**It should get better in a way you can see.** Not "the algorithm improved" but "you told me in March that you'd had enough of bleak, and I've been steering off it since." Improvement the user cannot perceive is indistinguishable from drift.

**It should notice without asserting.** Over months, Tonight will observe far more than it is told. The gap between those two is where every long-lived agent goes wrong. Tonight's discipline — only what they expressed or confirmed becomes belief — has to survive contact with a lot of data.

**It should survive taste changing.** A model built in the first six months and then defended forever is worse than no model. People change; the agent that notices, asks, and lets go is the one still useful in 2030.

What Tonight should *not* become: a feed, a queue, a completion tracker, a social network, or a thing that talks to you every day.

---

## 2. Long-term memory

Not storage — the kinds of knowledge that exist, and what each is allowed to do. The organising question is **what kind of claim is this**, because the rules differ sharply by provenance.

### By provenance

| Kind | What it is | Who can set it | Authority |
| --- | --- | --- | --- |
| **Verdict** | What the user said about a film | Only the user | Absolute. The agent never holds an opinion about whether someone liked something |
| **Declaration** | **Any durable assertion the user authored** | Only the user | Absolute within its own scope; silent on everything it does not cover |
| **Observation** | Something Tonight noticed and was not told | The agent | None on its own. May inform a question; may never become a Verdict or a Declaration without a user act |
| **Episode** | What happened on a given evening, field by field | The runtime and the user, per field | Factual **only for what was actually established** — see *Episodes are facts, not inferences* below |

**Declaration is the general class, not a list.** Phase 1 happened to need three kinds — Genres, Mixes and exclusions — and it would be a mistake to read that as the definition. A Declaration is any durable statement the user authored about themselves, and the kinds already visible include:

- Genres, Mixes and exclusions (Phase 1)
- situations they name — *"Sunday nights are for something gentle"*
- statements about companions — *"my partner can't do subtitles"*
- standing reasons for rejection — *"nothing over two and a half hours, ever"*
- presentation preferences — *"don't tell me the plot, just tell me why"*
- declared change — *"I've gone off bleak"*

All of them are absolute within their scope and silent outside it, all of them are the user's own words, and none of them may be authored by the agent. Adding a kind of Declaration must never require a new provenance class; if it does, the model has been drawn too narrowly again.

The separation between authored and observed is the whole design. Phase 1 established that a Mix is declarative evidence from the moment it is written, and that only a Movie state carries the user's verdict. Phase 2 multiplies the sources of knowledge without softening that line.

### The kinds worth holding

**Verdicts and their texture.** Beyond liked/loved/disliked: *why*, when it was given, and whether it was volunteered or asked for. "I loved it" unprompted is stronger evidence than "yes" to "did you like it?"

**Episodes.** One evening: what was asked, in their words; what was offered; what was chosen; whether it was watched; whether it was finished. The episode is the atom of history, and most other knowledge is derived from episodes and must point back at them.

**Episodes are facts, not inferences.** An Episode is factual history *only for the facts actually established*, and each field carries its own provenance — directly observed by the runtime, stated by the user, or **unknown**. Unknown is a normal, permanent, first-class value; an Episode with three unknown fields is a complete record of a partly-known evening, not a gap to be filled.

Nothing in the chain implies the next link:

> A recommendation does not imply a choice. A choice does not imply it was watched. Watching does not imply finishing. Finishing does not imply liking.

Tonight may write only what it directly observed happening in its own runtime — what was asked, what it offered — or what the user told it. It may never write that a film was watched because it recommended one, or that a film was liked because it was finished. Each of those steps is exactly the kind of small, plausible, unverified inference that turns a history into a surveillance record that is also wrong: it reads as observation, it is actually guesswork, and once written it is indistinguishable from something the user said. The unknown value is what makes declining to guess expressible.

**Rejections, with their reason where known.** The critical distinction is *not tonight* versus *not ever*. A film declined on a Tuesday because it was long is not a film the user dislikes, and collapsing the two is one of the fastest ways to build a wrong model.

**Explanations that landed.** Which reasons the user accepted. If "slow and sad, but it earns it" worked and "critically acclaimed" did not, that is knowledge about how to talk to this person — a different axis from what to show them, and arguably the more durable one.

**Situations.** Recurring contexts: a weeknight alone, a Sunday with a partner, the flight next month, the evening after a hard week. People do not have one taste; they have a taste per occasion, and the occasion is often more predictive than the person.

**Companions.** Who was present. A film watched with someone else is weak evidence about the user and strong evidence about the pair. Without this, six months of watching with a partner quietly rewrites the user's model into someone else's.

**Threads.** Unfinished discoveries: a director half-explored, a film started and abandoned, a "maybe when I've got three hours." These are the most natural thing for a companion to remember and the thing a recommender never does.

**Drift.** Taste changes, and memory must be able to say *this was true in 2024* without either discarding it or still believing it. Time is not metadata here; it is part of the claim.

**Negative space.** What they have never engaged with despite exposure. Real evidence, and very weak — it must be labelled weak permanently, because it is the kind that quietly hardens into a wall.

**Confidence — two different questions, never one number.** Conflating them is what lets a model quietly rot or quietly fossilise, because the single number can only move one way at a time.

| | Asks | Moves how |
| --- | --- | --- |
| **Historical authority** | *Was this actually said, and is it still the user's position?* | Set when the claim was made. It does not decay. It changes only when the user corrects or supersedes it |
| **Present relevance** | *How much should this weigh on tonight's answer?* | Decays with age, with contradiction, with a preference that stops being expressed |

A verdict given in 2024 is *certainly* what they said in 2024, forever, unless they take it back. Its usefulness for predicting what they want in 2027 is a separate, falling quantity. Tonight must be able to say "you loved this, three years ago" without either forgetting it or treating it as current.

Both are **derived, never stored**. A number written down beside a claim cannot be audited, cannot be explained, and will eventually be wrong in a way nobody can see.

---

## 3. Learning

### What changes after every interaction

**The episode record — for what was established.** What Tonight was asked and what it offered are directly observed and always recorded. What was chosen, watched or finished is recorded when the user says so, and left unknown otherwise. Recording an observed event is not an inference; recording an unobserved one is, however likely it seemed.

**Present relevance of existing claims.** Time passed. Something was corroborated or contradicted. Relevance is recomputed; historical authority and the claims themselves are untouched.

**Nothing about taste.** No verdict, no Genre, no Mix, no exclusion changes because of an interaction alone. This is Phase 1's ownership rule — *persist durable taste they express or confirm; never persist what you conclude alone* — carried into a world with far more to conclude from.

### What never changes automatically

Verdicts on films. The wording of a Genre or a Mix. Exclusions. These are the user's sentences; the agent may propose a change to them and may never make one.

### How relevance moves

**Up:** independent re-expression of the same preference; explicit confirmation; a hedge that proved right *and was acknowledged as right by the user*.

**Down:** age; contradiction; a confident prediction that missed; a preference that stops being expressed.

Historical authority does not move at all on this axis. It changes only when the user corrects or supersedes what they said.

### What evidence may count

Relevance is derived from **independent root evidence** — the actual things the user said and the actual events observed. Derived claims sit on top of those roots and add nothing of their own. Four rules follow, and together they are what stops inference from being laundered into belief:

- **Confidence comes only from roots.** A claim's support is the set of independent root events beneath it, never the number of claims that mention it.
- **A root counts once.** One evening reached through five derived claims is one evening. Restating a fact is not corroborating it.
- **Cycles add nothing.** Evidence that loops back on itself contributes zero, not more.
- **No self-amplification.** A derived claim may never strengthen a claim it descends from. A conclusion cannot become evidence for its own premise.

Without these, a single weak observation becomes strong simply by being referenced often — and it happens silently, because every individual step looks like ordinary reasoning. This is the mechanism by which a long-lived agent ends up confidently believing something nobody ever told it.

**And never up from Tonight's own influence.** The user watching a film Tonight recommended is not evidence they like that kind of film — it is evidence Tonight recommended it. This is the most dangerous loop available to a long-lived recommender, and it is invisible from the inside: the model appears to be learning while it is only hearing its own echo. Only an unprompted verdict counts as independent.

### When to ask

- An observation has grown useful but is still an inference.
- A proposed change would rewrite the user's own words.
- Two claims contradict, and which one wins changes future behaviour.
- A long absence means the model may be stale in ways only they can resolve.

And a constraint that matters as much as the triggers: **asking has a budget.** An agent that asks whenever it is uncertain becomes a form to fill in, and people abandon forms. A question must earn its place by changing what Tonight will do, and it must be phrased as the meaning they would agree to — never as a request for data.

---

## 4. Mix lifecycle

A Mix is a sentence someone wrote about a kind of evening. Everything below follows from that: operations that change the sentence need their agreement; operations that change Tonight's *reading* of it do not.

**Creation.** From the user's sentence, or from an offer Tonight makes that the user accepts in their own words. A Mix Tonight named for them is a Mix they will not recognise in a year.

**Growth.** Films accumulate; states accumulate. Phase 1 fixed the epistemics: intent was certain from the first moment, and what grows is confidence about *specifics*. A Mix with ten loved films under it does not mean more than it did; it means Tonight knows more about which films answer it.

**Drift.** The films under a Mix stop matching its sentence — either because taste moved or because the Mix was always two things. Detected, surfaced, never silently corrected. The sentence is the user's; if it no longer describes what it holds, that is a conversation, not a repair.

**Splitting.** A Mix that has become two evenings. Tonight proposes with evidence, in their language: *"the last eight things under Quiet Dread split cleanly — half are procedurals, half are much stranger. Two Mixes, or is that one thing to you?"* The user decides, and names both.

**Merging.** Two Mixes that turn out to be the same evening asked for twice. Same treatment.

**Dormancy.** Unused for a long time. Not dead, not archived — just quiet. Dormancy affects how much weight a Mix carries in tonight's answer; it does not remove it.

**Archiving.** A user act. "I'm done with this one."

**Reviving.** A dormant Mix that becomes relevant again. Tonight may surface it — *"this is Long Way Out territory, which you haven't asked for since last winter"* — and may not resurrect it silently.

**Forgetting.** Deliberate, user-initiated, and complete: gone from behaviour, not merely hidden. A memory that can be deleted from view but still influences recommendations is worse than one that cannot be deleted at all, because it is a lie about control.

**Relevance across years.** A Mix's present relevance must be able to fall on its own. A Mix built in 2024 with ten loved films and untouched since is not the same evidence in 2027, and a system that cannot express that will confidently recommend a person's former self. What it *meant* in 2024 does not fall; only its claim on tonight does.

### Lineage

Every operation above — an edit, a split, a merge, a rewording — is a change to a sentence the user wrote, and the old sentence was true when it was written. So none of them edits in place.

- **An accepted change creates a new version**, a superseding Declaration. The prior version stays historically intact and readable.
- **Only the current version governs present behaviour.** Superseded versions are history, not competing opinions.
- **Episodes keep the version that was in force when they happened.** An evening answered under *Quiet Dread* as it read in 2024 was answered under that sentence, and re-reading it through the 2027 wording would make the record describe something that never occurred.
- **Splits and merges preserve provenance without duplicating evidence.** When a Mix becomes two, the evidence beneath it is *attributed* to the successors, not copied into both — the same root event counted twice would manufacture confidence out of a filing decision. When two Mixes become one, shared roots collapse to one.

The rule underneath all four: history is append-only, meaning is versioned, and reorganising the present never changes what the past said or how much it was worth.

---

## 5. Agent runtime

**Memory.** Recall what bears on the question rather than everything known; carry provenance with every recalled claim so the answer can cite it; age confidence as time passes.

**Planning.** Some requests are one turn. Others are small projects: *"something for the flight next month — six hours, no wifi, and I'll be exhausted."* The runtime needs plans with state the user can see, rather than an agent that either answers immediately or forgets.

**Tool use.** The deterministic tool surface stays the boundary of what Tonight can know about itself. This is a Phase 1 inheritance worth restating: a fixture that cannot be expressed through the public tools is not a fixture, and a belief that cannot be traced to a tool call is not a belief.

**Reflection.** Periodically reconsidering what it believes: contradictions, decayed relevance, dormant structure, drifted Mixes.

Reflection **may** persist its own work — operational and runtime state, agent Observations, and inert Proposals. Thinking that cannot record what it thought has to redo it, and an agent that recomputes its view of a decade every time is not a long-lived agent.

Reflection **may never** create or mutate a user-authoritative Claim — a Verdict or a Declaration — without a user act.

That is the boundary, and it is the single most important separation in the runtime: **thinking may persist its own work; belief ownership stays governed.** The distinction is not between writing and not writing, but between what the agent owns and what the user owns. Everything reflection produces is the agent's, marked as the agent's, and inert until a person acts on it.

**Notifications.** The right to speak unprompted, tightly budgeted. Justified only by something with a deadline, or a discovery the user would have wanted and could not have found.

**Background work.** Long-running discovery; watching for a film to become reachable; preparing for a known occasion. Visible, pausable, cancellable.

**Long-running tasks.** With explicit state, so that "what are you doing for me right now" has an answer.

**State transitions.** Idle; engaged; working; waiting on the user; waiting on the world. Each needs a defined behaviour on resume.

**Interruption and resumption.** A conversation abandoned halfway must resume with context intact — and, critically, must not have persisted half-formed conclusions in the meantime. An interrupted interaction should leave the model exactly as it found it.

---

## 6. Knowledge model

### Entities

**From Phase 1, unchanged:** Movie, Genre, Mix, Movie state, exclusion.

**Claim** — the unifying abstraction. Verdicts, Declarations and Observations are all Claims distinguished by provenance, and the provenance determines the rules. Every Claim identifies seven things:

| Facet | Why it is needed |
| --- | --- |
| **Claimant** | Who asserts it — the user, or the agent. Without this, provenance is a guess |
| **Subject** | What it is about — a film, a Mix, a situation, a person |
| **Assertion** | What is actually being said |
| **Provenance** | How it came to be: stated, confirmed, observed, derived |
| **Context / scope** | Where it applies. A Claim with no stated scope applies globally; one with a scope applies *only* there |
| **Time** | When it was asserted |
| **Temporal status** | Current, or superseded by a later Claim — and by which |

Scope and temporal status are what make the model survive years. A Claim without scope silently becomes universal; a Claim without supersession makes correction impossible to express.

**Companion knowledge is reported, never owned.** *"My partner hates subtitles"* is a Claim by the **user**, about a **companion**, scoped to evenings with that person. It is a user-reported contextual Claim and it is **not the companion's Verdict** — that person never said it to Tonight, and may not even agree with it. Tonight must never silently promote one person's report into another person's authoritative taste. The claimant facet is what keeps them apart, and keeping them apart is what prevents a household from slowly becoming one blurred profile.

**Evidence** — what supports a Claim. Points at Episodes, at user statements, or at other Claims. Confidence is derived from Evidence, never stored beside it.

**Episode** — one evening: request, situation, companions, what was offered, what was chosen, whether it was finished. The atom of history.

**Conversation / Session** — the container of turns. Several conversations may serve one Episode; one conversation may span several.

**Situation** — a recurring context type, with its own weight on taste.

**Person** — a companion, with shallow taste of their own and a measured overlap with the user.

**Thread** — an unfinished discovery with a natural next step.

**Proposal** — a change to memory that the agent wants and has not made. First-class, visible, expiring, and requiring a user act to become real.

**Plan / Goal** — a multi-step intention with state, owned by the runtime.

### How they relate

A **Mix** is composed of **Genres**, holds **Movies**, and scopes its **exclusions** — Phase 1 established that an exclusion belongs to the evening that named it and never becomes a global filter, and nothing in Phase 2 may erode that.

A **Claim** rests on **Evidence**; Evidence points at **Episodes**; Episodes reference **Movies**, **Situations** and **People**. **Confidence** is a function over that graph rather than a number someone wrote down.

A **Proposal** targets a Claim or a Mix and is inert until a user acts on it. **Plans** own **Threads** and produce **Episodes**.

The invariant worth stating plainly: *a path exists from every belief Tonight acts on back to something the user said.* Observations are permitted to exist and are not permitted to act.

### How global and contextual taste combine

Section 2 claims that people do not have one taste but a taste per occasion. The knowledge model has to make that true rather than decorative, and it does so with inheritance rather than replacement:

- **Global taste is the inherited base.** A Claim with no scope applies everywhere.
- **Scoped Claims refine it locally.** *"Something gentle on Sundays"* narrows the base for Sunday evenings and says nothing about Tuesday.
- **A contextual Claim never overwrites a global one.** It is a lens, not an edit. Leaving the context restores the base untouched.
- **A joint Episode creates no durable individual preference without attribution.** An evening watched with someone else is evidence about *that evening and that pair*. Turning it into a fact about the user requires them to say so.
- **Companion evidence stays scoped to the companion.** It informs evenings with that person and never leaks into who the user is alone.

Without the last two, the commonest situation in the product — watching regularly with a partner — rewrites the user's model into an average of two people over a year, and it does so invisibly, one reasonable-looking episode at a time.

---

## 7. User experience

**Asking stays cheap.** One sentence in, one film out. Everything in Phase 2 is in service of that sentence being answered better — never of making the user maintain a profile.

**Memory shows itself only where it earns the space.** The reason travels with the recommendation, and the reason is checkable. Tonight does not open with a summary of what it knows about you.

**Correction is a complete interaction.** "No, I didn't like that" needs no follow-up, no form, no confirmation dialog. If correcting is more expensive than the error, people stop correcting and the model rots.

**Transparency on demand, never volunteered.** "Why did you pick that?" and "what do you think you know about me?" both have good answers, and neither arrives unasked.

**Unprompted speech is rare and welcome.** The test is whether the user would thank Tonight for it. Anything that fails that test is a notification, and notifications are how companions become apps people mute.

**Absence is graceful.** Someone returning after six months meets a film, not a backlog. Tonight may say its picture is probably stale and ask one question — once.

**It should never feel like surveillance.** *"You loved Zodiac, so —"* is a friend. *"You watch crime films on Thursdays"* is a tracker, even when true. The difference is not accuracy; it is whether the user said it. Tonight's asymmetry — it knows a lot and inferred almost none of it — is the product, and the experience should make that obvious without explaining it.

**Change is welcomed, not resisted.** "I've gone off this" should be received as useful news, not as a contradiction to be reconciled.

---

## 8. Evaluation

Phase 1 evaluated one answer against one model. Phase 2 must evaluate **trajectories**: what a model looks like after fifty interactions, and whether it still describes the person.

The methodological shift is that a fixture stops being a snapshot and becomes a **scripted history** — months of interactions with known ground truth about what the user actually said and meant. The Phase 1 architecture carries over unchanged in shape: the deterministic layer owns artifact validity and provenance, the blind judge owns every quality verdict, flags decide nothing, and an unadjudicated flag blocks.

### New capabilities that deserve a gate

| Capability | The question | Where it is judged |
| --- | --- | --- |
| **Write permission** | Is every write permitted by its provenance class — user-authoritative Claims tracing to an appropriate user act, agent-authored Observations and Proposals written freely but recorded as non-authoritative? | **Deterministic.** The highest-value new mechanical check available — and, unlike anything in Phase 1, fully objective |
| **Episode factuality** | Is every Episode field either observed, stated, or unknown — and is nothing inferred along the recommendation→choice→watched→finished→liked chain? | **Deterministic** |
| **Evidence accounting** | Does any root event count more than once? Does any derived claim strengthen an ancestor? | **Deterministic** |
| **Scope containment** | Does contextual or companion evidence stay inside its scope rather than becoming global taste? | **Deterministic** on scope; blind on effect |
| **Memory fidelity** | After a scripted history, does what Tonight believes match what the user said? | Deterministic on presence/absence; blind on nuance |
| **Non-fabrication under accumulation** | Phase 1's false-personalization bar, after months of data rather than one snapshot | Blind, with deterministic flags |
| **Confidence calibration** | When Tonight is sure, is it right more often than when it hedges? | Deterministic, given a scripted history with known answers |
| **Proposal quality** | Are proposals the ones a user would accept, and how many arrive per month? | Blind for quality; deterministic for rate |
| **Interruption budget** | Unprompted messages per month, and their acceptance | Deterministic |
| **Drift handling** | Given a scripted taste change, is it noticed — and not over-corrected from a single episode? | Blind, over a trajectory |
| **Forgetting** | After a deletion, is the thing gone from *behaviour*? | Deterministic: recommend again and check |
| **Resumption** | Is an interrupted long task resumed correctly, having created no unauthorised user-authoritative or behaviour-changing memory while suspended? Operational state needed to resume, and non-authoritative inert Observations and Proposals, are permitted | Deterministic |
| **Companion separation** | Does watching with someone else contaminate the user's model? | Deterministic on scoping; blind on effect |
| **Reflection safety** | Does reflection ever create or mutate a user-authoritative Claim — a Verdict or a Declaration — without the required user act? Operational state, Observations and inert Proposals are permitted | **Deterministic, and it should be a hard gate** |
| **Longitudinal quality** | Does the lead get better across a simulated year? | Blind, paired against an earlier point in the same history |

The last row deserves note: Phase 2's natural comparison is not only against a frozen baseline but against **Tonight's own earlier self on the same history**. An agent that does not beat its month-one self by month twelve has not learned anything, however good each individual answer looks.

### The self-confirmation gate

One capability needs a trajectory of its own, because it cannot be seen in any single interaction. A scripted history must contain the loop in its purest form — Tonight recommends a film, the user watches it, and the event is referenced repeatedly downstream — with **no verdict ever given**.

The gate is that at the end of that history:

- no durable taste Claim has been created or strengthened,
- no confidence has multiplied through the repeated references,
- and Tonight's answers have not drifted toward the thing it recommended.

Then the same history is run again with one difference: the user volunteers a verdict. Now the model *must* move. The pair is what proves the mechanism works — the first half shows the loop is closed, the second shows the agent has not simply been made deaf.

This is the one failure mode that looks exactly like success from the inside. Every intermediate step is defensible, the model appears to be learning steadily, and what it has actually learned is its own output. It cannot be caught by inspection, only by a trajectory built to expose it.

---

## 9. Risks

**Inference laundering through confidence.** The subtle form of compounding fabrication, and the one that needs a named defence: a weak Observation is referenced by a derived claim, which is referenced by another, and the repetition alone makes it look well-supported. Nothing false was ever asserted; the support was manufactured by bookkeeping. *Prevention:* the evidence rules in section 3 — support comes only from independent roots, a root counts once, cycles add nothing, and no derived claim may strengthen an ancestor. Observations still never promote to Verdicts or Declarations without a user act, and the claim graph keeps every belief traceable to a root that can be found and cut.

**The self-confirmation loop.** Tonight recommends, the user watches, Tonight reads that as preference, and recommends more of it. *Prevention:* a film Tonight recommended is not evidence of taste. Only an unprompted verdict is independent. This must be enforced structurally, because it is undetectable by inspection — the model looks like it is learning.

**Fossilization.** Early data dominates forever. *Prevention:* present relevance decays while historical authority does not; recency is weighted; drift is detected rather than resisted.

**History that is inaccurate and reads as surveillance.** An Episode record that guesses — this was probably watched, it was probably finished, they probably liked it — produces a detailed log of someone's viewing life that is partly fabricated, and which they cannot tell apart from what they actually said. Both halves are harmful: the fabrication corrupts the model, and the detail itself feels like being watched. *Prevention:* Episode fields carry their own provenance, unknown is a permanent legitimate value, and nothing may be inferred along the recommendation→choice→watched→finished→liked chain. Tonight's history is thinner than a tracker's on purpose.

**Safety arriving after memory and autonomy.** The ordering failure: memory that cannot be corrected, or autonomous behaviour resting on a model that has no way to notice it has gone stale. Each milestone is individually defensible and the sequence is not. *Prevention:* the two roadmap ordering rules in section 10 — no memory type ships without correction and forgetting in the same milestone, and no autonomous behaviour ships before relevance decay and drift detection.

**Over-correction.** One bad night rewrites a Mix. *Prevention:* single episodes never move declarations; declarations move only by user act.

**The surveillance feeling.** *Prevention:* Tonight only acts on what it was told, and the model stays legible and correctable. The architectural rule and the emotional outcome are the same rule.

**Notification creep.** Each unprompted message is locally justifiable; the aggregate is intolerable. *Prevention:* a hard budget, evaluated.

**Uncorrectable memory.** Deletion that hides rather than removes. *Prevention:* forgetting is verified behaviourally in evaluation, not structurally in storage.

**Companion contamination.** *Prevention:* episodes record who was present; claims are scoped to a person.

**Silent background action.** *Prevention:* long-running work is visible and cancellable, and the reflection/commit separation means background thinking cannot write.

**Evaluation debt.** Long-lived behaviour is expensive to evaluate, and the temptation will be to ship milestones on inspection. Phase 1's own history is the argument against it: the AC2 failure survived two repairs and was only ever visible because a full sweep was run each time. *Prevention:* every milestone carries its own gate, and scripted histories make that affordable.

---

## 10. Roadmap

Sequenced by user-visible capability, under two ordering rules:

> **No memory type ships without the ability to correct and forget it.** Not "correction arrives in M3" — each kind of memory is correctable in the milestone that introduces it.
>
> **No autonomous behaviour ships before the safeguards that keep a model honest over time.**

The first rule is a correction to an earlier draft of this roadmap, which deferred all correction to M3 and would have left two milestones' worth of uncorrectable history behind it. The second is the same mistake in the other direction: autonomy resting on a model with no decay and no drift detection acts confidently on a picture that has quietly stopped being true.

**M1 — Remembers the evening.** Episodes recorded: what was asked, what was offered, and what the user says happened, with unknown for the rest. **Ships with per-episode correction and deletion.** *Value:* "what was that film you suggested last week?" — and "no, I never watched that."

**M2 — Remembers the verdict.** Lightweight after-the-fact capture of whether it was watched and what they thought. **Ships with verdict correction and withdrawal.** *Value:* recommendations begin to improve, the reason is visible, and a wrong verdict takes one sentence to fix.

**M3 — Explains itself, whole.** Tonight can show everything it believes and why, and the per-kind corrections from M1 and M2 become one coherent experience. *Value:* trust — the user can see the picture, not just fix pieces of it.

**M4 — Proposes instead of assuming.** Observations surface as proposals to accept or reject. *Value:* the model grows without the user maintaining it.

**M5 — Mixes that live.** Drift detection, split and merge proposals, dormancy, lineage. *Value:* the structure still describes them after two years.

**M6 — Knows the occasion.** Situations and companions, with scope enforced. *Value:* the right film for *this* evening, not just this person.

**M7 — Stays honest as it ages.** Relevance decay, stale-model detection, drift handling, revival of dormant structure. *Value:* still right three years in — and the point at which Tonight can tell when it is not.

**M8 — Works when not asked.** Background discovery, preparation for known occasions, tightly budgeted unprompted speech. *Value:* Tonight brings you something.

Two constraints carry the ordering. **M3 before M4:** an agent that grows its own model before the user can see the whole of it produces exactly the compounding fabrication risk above, and by the time it is visible the history is contaminated. **M7 before M8:** the two were the other way round in an earlier draft, which would have shipped autonomous, unprompted behaviour on top of a model with no decay and no drift detection — an agent acting on its own initiative from a picture that had silently gone stale, which is the worst version of every risk in section 9 at once.

If M8 is wanted earlier for product reasons, the safe form is to restrict it to **user-requested plans only** — *"find me something for the flight next month"* — with no unprompted speech and no self-initiated discovery until M7 has shipped. That keeps the visible value of long-running work while withholding the part that requires a trustworthy long-term model.
