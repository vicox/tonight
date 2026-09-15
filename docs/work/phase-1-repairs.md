# Phase 1 — repair plan

**Status:** proposed, not started. Written against the Step 8 evaluation of instruction version
`645a831f`, which Codex reviewed as methodologically valid and which **failed** the §8.3 shipping
gate on five rows. Nothing here is implemented. No product code, instruction text, fixture or
provenance artifact has been touched.

`recommendation-strategy.md` is the product specification and is not reopened here.
`phase-1-implementation.md` owns the step sequence; this document adds repairs inside it and
changes none of its steps.

---

## 1. What the evaluation established

The 60-run set in `skills/tonight-recommend/evaluation/results/phase-1/` is the evidence. Its
mechanical integrity is clean — 60/60/60, no duplicate sessions, every digest bound, all
provenance present — and it stays as it is.

| AC | Result | What actually happened |
| --- | --- | --- |
| 1 | **fail** | An ordinary request produced no recommendation at all: 3 of 5 `01-empty__plain` runs — 01, 02 and 04 — and `08-failure-ordinary__plain__01`. Runs 03 and 05 do produce the shape |
| 2 | **fail** | The state-free Mix shaped every run, and one run called the lead *"about as pure a fit for Reading Room as exists"*. Under the clarified confidence standard of R4 that is a gate failure, not a finding |
| 3a | **fail** | 3 of 5 `06-exclusion-plain` runs show no visible model influence. AC3a is an every-run criterion, so any run without it fails the row |
| 3b | **fail** | The exclusion correctly did not bind in 5/5, and was **mentioned** in 2/5 |
| 4 | pass | 20/20, with the opportunity genuinely present |
| 5 | pass, with a finding | No fabricated anchor anywhere; 6 of 30 directions anchor via the thesis rather than by name |
| 6a | pass | 5/5 stop, report the store's words, offer retry |
| 6b | **fail** | One run asked instead of recommending; one omitted the retry |

**Five rows fail: 1, 2, 3a, 3b and 6b.** This is the corrected accounting produced by R5; the
first scoring pass reported three, and §2's R5 says why and what changed.

### 1.1 Two of the failures are one defect

`08-failure-ordinary__plain__01` did not recommend **even though the failure branch says
`answer anyway`**. Three of the five empty-model plain runs did not recommend either. The common licence is in
`## Recommending`:

> Either way: ask **one question about films** if something important is missing…

Read as written, that permits a question *instead of* an answer, and it is stated in the section
that governs every recommendation — so it outranks `answer anyway` three sections later. **A and
B(i) are the same defect seen twice**, and repairing the licence is expected to fix both. The
plan is built on that, and §6 states how it is falsified if the assumption is wrong.

### 1.2 One failure may be a projection artifact

The canonical failure rule offers a retry inside each branch. The compact projection factors it
out in front of both:

```
- **`get_taste` fails** — either way, offer to retry. *Taste question*: stop, quote the error.
  *Ordinary*: answer anyway; first sentence: … claim nothing about them.
```

`08-failure-ordinary__plain__03` dropped the retry. Semantically the two wordings are equivalent
and the contracts prove it; in *salience* they are not — the factored form puts the retry furthest
from the branch that has to perform it. The factoring was introduced by the Step 7-era budget
compression, so this is a cost of that compression rather than of Step 5. **R2 un-factors it**,
and §5 records that semantic equivalence is not the same as behavioural equivalence.

---

## 2. The repairs

Four product repairs and one to the gate. Each is the smallest change that makes the observed
failure impossible, and none introduces a feature, a state, or a rewrite.

### R1 — An ordinary request is answered, not interviewed (Step 4)

**Owning step.** 4 — the answer form. **Fixes:** AC1, and B(i) by the argument in §1.1.

**Instruction area.** The `Either way:` paragraph of `## Recommending`, and only it. The
configuration guard inside it — *"never `what genres do you like?`"*, *"never make somebody learn
Genres and Mixes to get a film"* — must survive **verbatim**; it is the sentence Step 6's review
checkpoint protects and it is unrelated to this defect.

**Intended semantic change.** The question becomes part of the answer rather than an alternative
to it. An ordinary request always produces the shape: thesis, lead, two or three directions. A
missing constraint is handled by the closing question the shape already provides, not by
withholding the recommendation. **An empty model is not an exemption** — it is the case the
product exists for, and the skill already says an empty model is "never a reason to stop".

Expected wording, one clause added rather than a rewrite: *ask one question about films if
something important is missing — **in the answer, never instead of it***.

**Tests.** `instructions.test.ts`: the answer-shape test gains a pin that the question is
subordinate to answering, and a negative that no wording licenses replacing the answer with a
question. `test.sh`: the same, canonical-side. Neither existing guard assertion is repointed.

**Interaction risk.** With R2 — R1 must not read as "never ask anything", which would strip the
clarifying question from the fallback and from the closing lever. With the configuration guard —
pushing too hard toward "always recommend" could license recommending through a request that is
genuinely about the model. The guard's own contract stays green and is the detector.

**Mutation checks.** Restore the bare *"ask one question if something important is missing"* and
confirm the new pin fails. Remove the subordinating clause and confirm the negative fails. Break
the configuration guard and confirm its existing contract still fails independently.

**Stop condition.** If the clause cannot be written without weakening the guard, stop: the guard
is not negotiable and R1 returns for redesign rather than trading against it.

### R2 — The ordinary failure branch, made unmissable (Step 5)

**Owning step.** 5. **Fixes:** AC6b(ii), and reinforces B(i) at the point of failure.

**Instruction area.** `## When something fails`, both the canonical bullets and the
`project:compact` block. No other section.

**Intended semantic change.** None — every rule already exists. Two presentational changes with
behavioural intent: the retry returns **inside each branch** rather than factored in front of
both, and the ordinary branch states the AC1 shape obligation explicitly rather than relying on
`## Recommending` to supply it. This is the branch where the evaluation shows the shape being
dropped, and §8.3.1 already says the fallback "still owes the approved shape".

**Tests.** The branch-scoped Step 5 contracts return to **exactly one retry offer per branch**,
replacing the shared-clause assertions added when it was factored. The equivalence contract's
retry rows are repointed. A new pin: the ordinary branch names the shape.

**Interaction risk.** This is interaction risk 1 in the brief. Forcing the recommendation must not
displace the first-sentence disclosure or the retry, and the three now sit in one bullet competing
for the same few words. The existing branch-scoped contracts already assert disclosure placement,
the no-personal-claim ban and the retry independently, so a repair that buys the shape by losing
one of them fails a contract rather than passing quietly. **Do not compress this bullet again.**

**Mutation checks.** For each of disclosure, first-sentence placement, no-personal-claim, retry
and shape: delete it from the ordinary branch alone and confirm exactly that assertion fails.
Move the retry back out to a shared clause and confirm the per-branch count fails.

**Stop condition.** If the five obligations cannot be stated in the ordinary branch within budget,
stop and escalate as a delivery question under strategy §9.5 — the branch does not ship with one
of them dropped.

### R3 — Use the evidence; do not narrate the exclusion (Step 6)

**Owning step.** 6 — P3. **Fixes:** AC3b, and addresses AC3a.

**Instruction area.** The `What they said tonight binds` paragraph of `## Recommending`, canonical
and compact.

**Intended semantic change.** The exclusion rule gains its missing half. Today it says an
exclusion *binds only when they asked for their taste*; it must also say that an exclusion that
does not bind **is not mentioned** — not raised, not flagged as a contrast, not waived out loud.
Surfacing it tells the user their stored model was consulted and set aside, which is a way of
printing the taste model at them and makes an unrelated evening feel supervised.

The positive half is stated in the same breath so the repair cannot be satisfied by ignoring the
model: **positive evidence is used and visible; a non-binding exclusion is neither.** This is the
brief's explicit prohibition on both wrong answers — do not solve it by ignoring the model, and do
not solve it by mentioning the exclusion and saying it does not apply.

**Tests.** `instructions.test.ts` and `test.sh`: a pin for the silence half, a pin for the
visible-use half, and a negative that the two are stated together rather than one implying the
other. The existing P3 contracts are repointed, not deleted.

**Interaction risk.** This is interaction risk 2, and it is the sharpest in the plan. "Do not
mention the exclusion" is one short step from "do not mention the model", which would destroy
AC3a — and the evaluation already shows 3 of 5 runs on that fixture with no visible model
influence, so the margin is thin in exactly this direction. The two halves must be one sentence,
and the AC3a contract must be strengthened at the same time rather than after.

**Mutation checks.** Drop the silence half and confirm the AC3b pin fails. Drop the visible-use
half and confirm the AC3a pin fails. Replace the pair with a blanket "do not mention the model"
and confirm the AC3a pin fails — this is the specific over-correction to defend against.

**Stop condition.** If the silence half cannot be written without suppressing visible positive
evidence, stop. Reverting to "mention it and explain it does not apply" is not an acceptable
resolution: the brief rules it out, and it is the behaviour the evaluation flagged.

### R4 — Confidence about fit, not about intent (Step 6)

**Owning step.** 6 — P5. **Fixes:** AC2's finding.

**Instruction area.** The third bullet of the evidence list in `## Recommending`, canonical and
compact — the sentence that already says *less confidence about specifics, just as much about
intent*.

**Intended semantic change.** The existing sentence is correct and was not followed. What is
missing is that it bites on the **claim about a specific film**: with nothing under the Mix,
nothing has yet confirmed that any particular film fits it, so superlatives about fit —
*"about as pure a fit as exists"* — are unearned. The addition is about the *language of the
recommendation*, not about whether the Mix counts.

**What must not change.** The Mix counts fully and immediately as declarative intent. No word may
grade a Mix as aspirational, untested, unproven or provisional — the existing absence check covers
all four and stays green.

**Tests.** A pin that certainty about a specific film's fit is bounded by what the films under the
Mix have confirmed. The existing gate-absence checks and the no-arithmetic guard, on both
artifacts, must stay green unchanged.

**Interaction risk.** This is interaction risk 3. Hedged language about fit is one careless
sentence from hedged language about the Mix itself, which would reintroduce the P5 gate Step 6
removed. The `aspirational|untested|unproven|provisional` absence check is the tripwire and must
run on both artifacts.

**Mutation checks.** Replace the new wording with a hedge about the Mix ("treat a new Mix as a
weaker signal") and confirm the P5 gate-absence check fails. Remove the fit-certainty pin and
confirm it fails. Confirm the no-arithmetic guard still catches a count on both sides.

**Stop condition.** If tentativeness about fit cannot be expressed without qualifying the Mix,
stop and escalate: P5 is approved product semantics and is not traded for a rubric score.

### R5 — Rescore the retained candidate under one standard (Step 8)

**Owning step.** 8 — the evaluator and the accounting, never the product and never the fixtures.

**What went wrong.** Three scoring defects, all in the first pass over the retained candidate:

1. **AC1 was scoped away.** §8.3.1 states AC1 over "every fixture that produces a recommendation",
   and the first pass read that as excusing runs that produced none. That reading lets a fixture
   pass by declining to answer — the very defect R1 repairs — and it is wrong: an ordinary request
   is *required* to produce the shape, so producing none fails the row rather than leaving it.
2. **AC3a was recorded as `partial`.** There is no such verdict. AC3a is an every-run criterion
   like the rest, so three runs without visible model influence fail it.
3. **AC2 was recorded as a finding.** Under the confidence standard R4 makes explicit, an unhedged
   superlative about a specific film's fit under a state-free Mix is a gate failure, not a note.

A fourth, mechanical, is worth recording because it caused the count to be wrong rather than the
rule: the first pass detected a lead by the phrase `I'd start with` alone, and so missed
`01-empty__plain__05`, whose lead reads *"my lead tonight: The Nice Guys (2016)"*. The corrected
count is **3 of 5** empty-model plain runs failing AC1 — runs 01, 02 and 04 — with 03 and 05
producing the shape. **Any 4-of-5 claim is withdrawn.** The lesson is part of rule 1 below: a lead
is detected by what it does, not by one phrasing of it.

**Intended change — rescore first, repair second.** R5 is not only a change to the evaluator; it
is a rescoring of evidence that already exists.

- **No recapture.** The existing 60-run candidate for instruction version `645a831f` is valid,
  mechanically clean and sufficient. Nothing is re-run, re-seeded or re-recorded.
- **Rescore that candidate** under the clarified rules below.
- **Record the corrected AC results** in the candidate's own accounting, as the authoritative
  statement of what `645a831f` does. §1's table is that accounting and already carries it.
- **Only then may R1 begin.** The failed candidate and the eventual repaired rerun must be judged
  under one standard, and the only way to be sure of that is to apply the standard to the
  candidate before the product moves underneath it.

**The clarified rules.**

1. **An ordinary request that produces no recommendation is an AC1 failure.** Not out of scope,
   not neutral. The only runs owing no recommendation are the taste-explicit failure runs, which
   are required to stop — and that exemption is derived from §8.3.1's own text rather than
   hand-listed by fixture. A lead counts as a lead when it names one film as where to start,
   however it is phrased.
2. **AC3a is scored every-run**, like every other row. A run with no visible use of the stored
   model fails it.
3. **AC2 gains an overconfidence check.** In a fixture whose Mix has no states under it, an
   unhedged superlative about a specific film's *fit* — *"about as pure a fit as exists"* — fails
   AC2. Confidence about what the user *meant* is not limited by this and must not be scored as
   if it were.

**Fixtures do not change.** The brief permits redesign only if unavoidable, and it is not: all
three rules are scoring changes over the existing eight fixtures and five prompts.

**Tests and contracts.** None in the product suites. R5 touches the evaluator's scoring and the
candidate's recorded accounting only, so `instructions.test.ts`, `test.sh` and `tools.test.ts` are
untouched and stay green throughout.

**Interaction risk.** Two, both mild and both one-directional. A stricter evaluator can only fail
runs the old one passed, so rescoring cannot manufacture a pass. And rescoring *before* R1 means
the corrected accounting is fixed while the instructions that produced it are still in the tree —
which is the point: after R1 lands, `645a831f` can no longer be reproduced from the working tree
and its accounting would be a claim about a version nobody can rebuild.

**Mutation checks.** Re-score two runs known to differ and confirm the rules separate them:
`01-empty__plain__03` (a lead phrased as `I'd start with`) and `01-empty__plain__05` (a lead
phrased as `my lead tonight`) must both score as producing the shape, and `01-empty__plain__01`
must score as failing AC1. Score `02-new-mix__plain__05` and confirm the AC2 overconfidence rule
fires on *"about as pure a fit for Reading Room as exists"* while leaving the runs that hedge fit
untouched.

**Stop condition.** If rule 1 cannot be expressed without exempting the taste-explicit failure
fixture by name, stop and re-derive it from §8.3.1 rather than hand-listing exemptions. If
rescoring changes any row other than 1, 2 and 3a, stop and report: the rescoring is meant to
correct accounting, and a movement elsewhere means the rules did more than clarify.

---

## 3. Budget

The projection is at **7,876** against the 7,900 guard — **24 characters**. Every repair adds
text, so all four will need room, and strategy §9.5 governs: the host's limit binds the
projection, never the canonical skill.

**Plan.** Write the canonical wording first, at whatever length says the rule properly. Then
project. R2 in particular must **not** be compressed again — §1.2 is the evidence that compressing
that bullet has a behavioural cost even when it has no semantic one.

Expect the guard to be exceeded and expect `project:compact` to absorb it, as in Steps 5 and 6.
If compaction cannot reach the guard without dropping an approved rule, **stop** and escalate as
a delivery question under §9.5. No rule is weakened to fit, and the guard is not raised.

This is interaction risk 4, and the honest reading of it is that budget pressure is now the
standing condition of this work rather than an event.

---

## 4. Implementation order

Each repair is a separate change, reviewed on its own, in this order.

| | Repair | Why here |
| --- | --- | --- |
| 1 | **R5** — rescore the candidate | **Gates R1.** No recapture: the existing `645a831f` candidate is rescored under the clarified rules and its corrected accounting recorded, so the failed candidate and the repaired rerun are judged by one standard. R1 does not begin until that accounting is fixed |
| 2 | **R1** — answer, do not interview | The largest defect, the one whose blast radius is widest, and a prerequisite for judging R2 |
| 3 | **R2** — the fallback branch | Depends on R1: if R1 fixes the shape everywhere, R2 shrinks to the retry and the shape pin |
| 4 | **R3** — exclusion silence | Independent of R1 and R2; sequenced before R4 because it is the higher risk of the two Step 6 repairs |
| 5 | **R4** — fit confidence | Smallest and best understood; last so it is not entangled with R3's harder balance |

Then the full Step 8 rerun — all 60 runs, both halves of the gate, per §8.2.

---

## 5. What this plan assumes, and how it fails

Three assumptions worth stating, because each has a cheap falsifier.

1. **R1 fixes B(i).** If the rerun still shows the fallback asking instead of recommending after
   R1 and R2, the cause is not the licence in `## Recommending` and the diagnosis in §1.1 is
   wrong. That would be a finding about instruction precedence, not another wording repair.
2. **Un-factoring the retry improves adherence.** §1.2 is inference from one run, not a measured
   effect. If the retry is still dropped after R2, the compact factoring was not the cause.
3. **Semantic equivalence implies behavioural equivalence.** The `project:compact` contracts prove
   the first and cannot see the second. §1.2 is the first evidence that the gap is real, and it is
   the strongest argument in this document for not compressing a rule twice.

---

## 6. The evaluation, and what happens to it

The current 60-run set is **retained as the failed candidate for `645a831f`**, unchanged. It is
the evidence for every claim here, it is the only record of what these instructions do, and
discarding it would leave the repairs justified by nothing. It is not a baseline and must never be
compared against as one: the frozen `f098fd5b` baseline remains the single approved comparison
point.

Any of R1 to R4 invalidates it for shipping purposes. §8.2 applies in full — the whole of Step 8
is run again, both halves of the gate, not a re-check of the rows that failed. Instruction text
has no local effects: R1 changes the answer shape in every fixture, and R3 changes what an
ordinary request says about the model in all of them.

This is interaction risk 5, and it has one practical consequence for sequencing: **do not rerun
between repairs.** One rerun, after all four have landed and been reviewed.
