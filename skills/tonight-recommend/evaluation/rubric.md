# The rubric

Seven criteria, scored per output, and one rule for reading them.

> **A required behaviour must appear in every run of the fixtures named for it. A prohibited
> behaviour must appear in no run of any fixture.** A required behaviour missing from one run in
> five is missing at a rate users will meet.

The criteria are the seven of `recommendation-strategy.md` §10.7. The required outcomes are the
eight rows of `phase-1-implementation.md` §8.3.1. This file is the scoring sheet for both.

## The seven criteria

| Criterion | Asks | Fails when |
| --- | --- | --- |
| **Fit** | Does the lead plausibly suit what was asked? | The lead answers a different question than the one asked |
| **Constraint compliance** | Was everything they said honoured, including what they ruled out? | A stated constraint — length, mood, an exclusion in scope — is broken |
| **Decisiveness** | Is there exactly one lead, named as such? | No lead; several leads; a list with no recommendation in it |
| **Justified personalization** | Does each personal claim cite something checkable in the model? | A claim about the user that nothing in the model supports |
| **Discovery quality** | Is there an expansion, is it anchored, and is it marked as a stretch? | No expansion; an expansion with no anchor; a stretch presented as a safe pick |
| **Unsupported claims** | Any availability, release or cultural claim without evidence | Any such claim, at all — see the three states below |
| **False personalization** | Any taste attributed to the user they never expressed | Any such attribution, at all |

**False personalization is scored separately from unsupported claims** because it is the failure a
user is least able to catch. An invented release date can be checked in seconds; an invented
preference sounds like being understood.

## The required outcomes

Scored per fixture. Every row must pass for Phase 1 to ship (§8.3.1).

**This pass owns every AC1–AC6 verdict.** `score.mjs` does not decide any of them. It produces two
things, and neither is a verdict:

- **Admissibility faults** — a run that is malformed, missing its answer, unbound from its
  snapshot, or missing the provenance that places it. A fault means *this run cannot be scored*; it
  never means a criterion failed, and **nothing about what an answer says can raise one**. A set
  with faults is not ready to be scored here.
- **Flags** — high-recall literal matches, quoted with their context, for the rows below to
  adjudicate. A flag is a place to look, not a finding. It fires on false positives by design, and
  an unadjudicated flag blocks completion.

Read the flags alongside the rows they name. **AC1** counts commitment idioms, enumerated items
and conditional openers, and marks an answer carrying none of them — which a plain *"Watch Paterson
tonight."* also does, so the flag is a prompt to look, never a finding. **AC2** flags maximal-fit
phrasing wherever it sits, without deciding whether the certainty is about a film or about what the
user meant. **AC3a** flags an answer naming nothing stored, which a recognisable paraphrase may
legitimately do. **AC4** flags novelty language sitting near a Movie the run's own snapshot marks
`seen`, `liked`, `loved` or `disliked`, without deciding whether that film was the one being
offered. In every case the question the flag cannot answer is the one you answer here.

| AC | Required evidence | Fixtures | Passes when |
| --- | --- | --- | --- |
| **1** | One film leads, is **named** as the lead, followed by two or three alternative directions, each introduced by the condition under which it wins | 01, 02, 03, 04, 08 | every such run |
| **2** | The state-free Mix visibly shapes the answer; language about **fit** is more tentative than language about **intent** | 02 | every run |
| **3a** | Taste evidence informs an **ordinary** request, unasked | 02, 03, 06 | every run |
| **3b** | The exclusion **binds** in 05, and **does not bind and is not mentioned** in 06 | 05, 06 | every run of both |
| **4** | No film carrying a state is offered as new | 03, 04 | no run offers one |
| **5** | Every expansion names something the user positively likes as its anchor | 01, 03 | every expansion in every run |
| **6a** | Stops, reports the failure in the tool's own words, offers to retry | 07 | every run |
| **6b** | Discloses in its **first sentence**, recommends in the shape of AC1, makes **no** personal claim, offers to retry | 08 | every run |

### Scoring unsupported claims, and the state the run was in

Tonight's proxy sees Tonight. Everything the host runs itself — web search, a film database,
anything about what is on this week — passes nowhere near it. So this criterion is scored against
the run's `external_tools` state, and one of the three states means it cannot be scored at all.

| `external_tools` | How the criterion is scored |
| --- | --- |
| `observable` | A currency claim passes only if the external evidence file shows the result that supports it. `None.` means nothing was called, so every such claim fails |
| `disabled` | Any currency claim fails: there was nothing to support it. The cleanest condition for this criterion |
| `not-observable` | **Not scored.** The run carries no result for this criterion, and §8.3 stop condition 7 applies until some other run supplies one |

**A missing evidence file is never read as "no tool was used".** That is the distinction the
format exists to keep: `None.` is a fact about the run, and it may only be written where something
was watching.

### Two traps in scoring

**AC4 and AC5 can pass without being tested.** A prohibition is only verified if the fixture gave
the model a chance to break it. Fixtures 03 and 04 carry a `construction_note` naming the films
that make AC4 real; if a run's prompt never reached for any of them, the row is **not yet passed**
— it is untested, and §8.3 stop condition 4 applies.

**AC5's hardest case is the empty model.** Fixture 01 has nothing to anchor to, which is exactly
why an unanchored expansion is most tempting there. An expansion in 01 that names no positive
anchor fails, whatever else the answer does well.

## Scoring procedure

0. `score.mjs` is run over both sets. Any admissibility fault is resolved before scoring starts —
   a run nobody can score cannot be compared. Its flags are carried into step 4.
1. Outputs from both instruction sets are paired per fixture and prompt.
2. Every marker of which side an output came from is stripped, including the version line if the
   agent ever echoes it.
3. The pairs are shuffled.
4. Each output is scored against the seven criteria and against the required outcomes it is named
   for, without knowing which side it is.
5. **Every flag is adjudicated** against the row it names, and recorded as upheld or dismissed.
   An unadjudicated flag blocks completion.
6. Scores are only then re-joined to their sides.

Hand-scored. A judge model may be used once hand-scoring cannot keep up, and never for
**unsupported claims** or **false personalization** without spot checks — those are the two a
judge model is most likely to wave through.
