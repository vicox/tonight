# Phase 1 — closed

## Objective

Make Tonight recommend like a curator rather than rank like a search engine: commit to one film,
say why it suits *this* person, and be honest about how much is actually known about them.

## What changed in the product

Everything is instruction text in `skills/tonight-recommend/SKILL.md`, projected into the ChatGPT
project instructions.

- **One canonical specification, host-specific projections** (§9.5). `SKILL.md` is the single
  source; `project:compact` blocks give a shorter wording of the same rule where a host's budget
  demands it. Host limits bind the projection, never the specification.
- **The answer shape.** One idea for the evening, one lead named as such, two or three directions
  each opened by the condition under which it wins, ordered by distance from the lead.
- **Answer, don't interview.** A question may accompany the answer, never replace it — an empty
  model included.
- **Failure is branch-local.** A taste question whose read fails stops and reports the store's own
  words; an ordinary request recommends anyway, discloses in its first sentence, and claims nothing
  personal. Both offer to retry.
- **Mixes are declarative evidence.** A Mix counts from the moment it is written. Movie states
  calibrate that evidence; they never decide whether it counts.
- **Exclusions are scoped.** A stored exclusion binds the request that asked for their taste, and
  where it does not bind it is not mentioned either.
- **Unseen by default.** `seen`, `liked`, `loved` and `disliked` rule a Movie out of being offered
  as new, and out of being called new; being in the model is not evidence of not having seen it.
- **Confidence sits where the doubt is.** A Mix with nothing under it establishes intent. A film may
  be matched against its written criteria as plainly as it deserves; what may not be claimed is the
  user's own verdict, which only a Movie state carries.

## How it was evaluated

An instruction's effect is invisible to every other test in this repository: `test.sh` and
`instructions.test.ts` prove a rule is *present in the text*, never that a model follows it. So the
gate is behavioural.

Eight fixtures, seeded through the public tool surface, each run through a proxy that records every
call made to Tonight. One fresh `claude -p` session per run, 60 runs per candidate, each bound by
digest to the snapshot `get_taste` returned immediately before it. The two failure fixtures inject
a refusal of `get_taste` alone, so the connector stays live and the failure is an invocation
failure. `external_tools: disabled` throughout, which makes any availability claim unsupported by
construction.

### Two layers

The evaluator was split part-way through Phase 1, after four corrections in a row came from the same
place: it was trying to decide which film an answer recommended, whether a mention supported or
dismissed the recommendation, and whether a confidence claim was about a film or about intent.
Those are the product's own judgements, and an evaluator that re-derives them keeps disagreeing
with it.

- **The deterministic layer** (`score.mjs`) owns artifact validity, admissibility, fixture
  applicability and flags. A fault means *this run cannot be scored*; no property of an answer's
  content can raise one. A flag is a high-recall literal match, quoted for adjudication, deciding
  nothing.
- **The blind judge** (`rubric.md`) owns every AC1–AC6 verdict and the seven comparative criteria.
  Every flag must be adjudicated; an unadjudicated flag blocks completion.

## Acceptance criteria

A required behaviour must appear in **every** run of the fixtures named for it; a prohibited one in
**no** run of any fixture.

| AC | What it requires |
| --- | --- |
| 1 | One film leads, named as such, with two or three conditional directions |
| 2 | The state-free Mix shapes the answer without claiming the user's verdict on a film |
| 3a | Taste evidence informs an ordinary request, unasked |
| 3b | The exclusion binds the taste-explicit request, and neither binds nor is mentioned in the unrelated one |
| 4 | No film carrying a state is offered as new |
| 5 | Every expansion names something positively liked as its anchor |
| 6a | The taste-explicit failure stops, reports verbatim, offers to retry |
| 6b | The ordinary failure discloses first, keeps the shape, claims nothing personal, offers to retry |

Shipping also requires the paired comparison against the frozen baseline to show no loss on fit or
constraint compliance, and no prohibited outcome anywhere.

## Result

**Instruction version `0c0dce73`, 7,894 characters.**

Final Step 8 run in `skills/tonight-recommend/evaluation/results/phase-1-0c0dce73/`: 60 runs, 60
snapshots, 60 logs, 60 distinct sessions, all provenance present, every digest recomputing. The
deterministic layer reported 0 faults and 29 flags; all 29 were adjudicated and none stands.

**All eight AC rows pass.**

Paired blind comparison against the frozen `f098fd5b` baseline, 60 pairs, side order randomised and
version strings hidden until the judgements were frozen:

| Dimension | Candidate | Baseline | Tie |
| --- | ---: | ---: | ---: |
| Fit | 55 | 0 | 5 |
| Constraint compliance | 0 | 0 | 60 |
| Decisiveness | 55 | 0 | 5 |
| Discovery quality | 25 | 0 | 35 |
| Justified personalization | 55 | 0 | 5 |
| False personalization | 0 | 0 | 60 |
| Unsupported claims | 0 | 0 | 60 |

The five ties are the failure pairs where both sides correctly decline. No prohibited outcome
appeared in either side's 60 answers.

Four candidates preceded it: `645a831f` failed AC1, AC2, AC3b and AC6b; `a3357c1c` failed AC4;
`f5b757ed` and `b7471669` each failed AC2. Their result sets are kept.

**Independently approved. Phase 1 is complete.**

## Commits

Phase 1 runs from `b4fe97e` to `238a62f`.

| | |
| --- | --- |
| `b4fe97e` | Step 1: a reproducible recommendation baseline |
| `a9a79dd` | Step 2: tool-local instruction contracts |
| `4dac210` | Step 3: complete instruction relocation |
| `91cac37` | Step 4: redesign the recommendation answer structure |
| `eabfbe3` | Step 5: split `get_taste` failure by what was asked |
| `c23b344` | Step 6: make Mixes declarative recommendation evidence |
| `a7b7705` | Step 7: record the measured projection architecture |
| `b9933c2` | Repair R5: correct the evaluation gate accounting |
| `d092165` | Repair R1: answer instead of interviewing |
| `61b897d` | Repair R2: make the `get_taste` fallback branch-local |
| `4352e3b` | Repair R3: keep positive evidence visible without exposing exclusions |
| `4b9dc46` | Repair R4: calibrate confidence for state-free Mix recommendations |
| `f07c4c1` | Split evaluation into a deterministic layer and a blind judge |
| `824cfed` | Repair AC4: prevent stateful films from being offered as new |
| `c29ea0c` | Align the exclusion fixture with corrected AC3a applicability |
| `10495e8` | Repair AC2: make state-free film uncertainty explicit |
| `5ba35c6` | Clarification AC2: measure the claim, not the phrasing |
| `238a62f` | Final evaluation record |

Status commits between steps are omitted.

## Starting Phase 2

### Frozen

- **The baseline**, `results/baseline/` at `f098fd5b`. It is the only approved comparison point,
  and a change to it voids every comparison made against it.
- **The four retained result sets.** They are the record of what failed and why.
- **`0c0dce73` as the shipped version**, and the result set that carries it.
- **The acceptance criteria and the gate**, §8.3.1 and §8.3.2 as written.

### May evolve

- Product behaviour outside the recommendation instructions.
- The fixture set may **grow**: a new fixture covering a case none of the eight reaches is additive
  and costs nothing already recorded.
- The deterministic layer may gain flags, so long as they stay literal, stay high-recall, and decide
  nothing.
- The rubric's prose, where it explains rather than defines.

### Not without opening a new evaluation cycle

- **Any change to `SKILL.md`, the generated project instructions, or the MCP tool descriptions.**
  These are what the gate measured. The sweep's own guard enforces it: it refuses to record while
  they differ from `HEAD`.
- **Any change to an existing fixture's model, prompt, or matrix.** Every recorded run describes the
  data it was given; changing that data makes the record describe something that no longer exists.
- **Any change to what an AC requires**, or to the pass rule of every-run and no-run.
- **Moving a verdict back into the deterministic layer.** Faults are artifact-level by construction;
  a criterion with two owners is the defect the split removed.

A new cycle means a fresh 60-run sweep against the committed version under test, its own
adjudication record, and its own paired comparison against the frozen baseline. Not a partial rerun,
and not a rescoring of an existing set.
