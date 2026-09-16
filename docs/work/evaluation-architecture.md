# Evaluation architecture: two layers

**Status: implemented in `score.mjs`. The Step 8 rerun under this architecture has not run yet.**

The deterministic scorer has been corrected four times in Phase 1 — R5's lead detection, R5's fit
span, the AC3a attribution list, the AC3a relevance rule, and twice more for AC4 — and every
correction was the same kind: a heuristic that read a real output wrongly. The corrections were
right individually. The pattern is the problem.

This proposes the split that stops it.

## The thing worth noticing first

`rubric.md` already assigns **all eight acceptance criteria** to the blind pass. Its *"The required
outcomes"* table lists AC1 to AC6b with their fixtures and pass conditions, and the file ends
"Hand-scored." The blind judge is not a new layer to be built — it is the original design, and it
already owns every row.

`score.mjs` arrived later, in R5, to rescore a retained candidate without re-running it. It
re-implemented a subset of those rows mechanically. Everything below is about **removing that
duplication in one direction**, keeping the mechanical half only where it is checking a fact rather
than reading a sentence.

So this is not a loss of coverage. AC1 to AC6b remain scored, by the layer that was always
responsible for them.

## Audit

583 lines, ~15 regexes. By concern:

| Section | Lines | Regexes |
| --- | ---: | ---: |
| Artifact parsing — `headerOf`, `answerOf`, `loadRuns`, `storedNames`, `statefulTitles` | 82 | 1 |
| AC1 lead — `COMMITMENT`, `FILM`, `hasLead`, `BULLET` | 49 | 3 |
| AC2 overconfidence — `OVERCONFIDENT_FIT` | 33 | 1 |
| AC3a evidence — `ATTRIBUTION`, `POSSESSION`, `USE`, `CONTRAST`, `usesPositiveEvidence` | 125 | 4 |
| AC2 subject binding — `COPULA`, `RELATIVE`, `CLAUSE_BREAK`, `INTENT_SUBJECT`, `governingSubject` | 77 | 5 |
| AC3a relevance — `materiallyRelevant` | 19 | 0 |
| AC4 offers — `DIRECTION_CUE`, `OFFER_SPAN`, `EVIDENCE_BEFORE`/`AFTER`, `TITLE_BEFORE_YEAR`, `filmsIn`, `offers` | 124 | 1 |
| `score()` + CLI | 74 | 0 |

### Section by section

**`headerOf` / `answerOf` / `loadRuns`** — splits the artifact, binds each run to the snapshot it
was served by digest. Reads structure the runner wrote. No language. → **KEEP**

**`storedNames` / `statefulTitles` / `STATEFUL`** — reads names and `state` values out of the
snapshot JSON. Data extraction. → **KEEP**

**`owesRecommendation`** — `get_taste === "failed" && prompt.startsWith("taste-explicit")`, both
header fields. Derived from recorded facts. → **KEEP**

**`materiallyRelevant`** — reads `prompt.startsWith("unrelated")` from fixture metadata. An
objective applicability fact, and it still gates whether the AC3a containment flag is worth
raising. → **KEEP**

**AC1 — `COMMITMENT` / `BULLET`** — "does the text contain a commitment idiom" and "how many
direction bullets are there" are literal facts. → **KEEP**

**AC1 — `FILM` / `hasLead`** — `FILM` guesses what a film title looks like, and its weakest arm is
*any capitalised word sequence*. `hasLead` then sentence-splits around the commitment and searches
±160 characters in both directions. This is grammatical attachment: deciding which noun a phrase
commits to. It is also where R5's first correction landed, and the reason a lead had to be
re-detected twice. → **MOVE TO BLIND** (AC1's "named as the lead" half; rubric criterion
*Decisiveness* already asks exactly this)

**AC2 — `OVERCONFIDENT_FIT`** — a fixed list of maximal-fit idioms (*"as pure a fit as exists"*,
*"perfect fit"*). Matching a known phrase is not parsing; this is the "prohibited literal claims"
case. → **KEEP, as a flag** (see *Flags* below)

**AC2 — `governingSubject` and friends** — strips copulas, detects relative clauses, splits on
clause boundaries, then decides whether the claim's subject is a Mix, a Genre, an intent phrase or
a film. This is a miniature parser, and it needed two consecutive corrections during R5 for exactly
that reason. The question it answers — *is this confidence about what they meant, or about whether
a film fits?* — is semantic. → **MOVE TO BLIND**, **REMOVE** the machinery

**AC3a — `ATTRIBUTION` / `POSSESSION` / `USE` / `CONTRAST` / `usesPositiveEvidence`** — 125 lines
deciding whether a mention of a stored name *supports* the recommendation, using four regex banks,
a ±130-character window, and a co-occurrence rule (possession counts only alongside use). It has
already been wrong in both directions on real output: it failed four runs that plainly cited the
Mix, and it passed nothing it should have failed only because the criterion was then narrowed.
*"Does this citation convince?"* is rubric criterion *Justified personalization*. → **MOVE TO
BLIND**. Keep containment — **does the answer name anything stored at all** — as a **flag only**.
It cannot be a failure: R3 accepts a paraphrase the user would recognise as their own, and a
paraphrase names nothing.

**AC4 — the whole offer apparatus** — cue regexes, a 170-character span, evidence guards on both
sides of a title, year-marked-versus-bare title classes. It exists to answer *which film is being
offered*, which is the single hardest judgement in the answer and the one the product itself is
doing. Two full revisions in two turns; the first produced five false positives on the retained
corpus. → **MOVE TO BLIND**.

  But AC4 has an objective core that needs none of it. The observed defect was a **contradiction
  between two artifacts**: the answer asserted non-viewing of `The Vanishing`, and the snapshot
  bound to that run records `"state": "seen"`. Detecting *"a novelty assertion and a title the
  snapshot marks watched, in the same sentence"* is literal co-occurrence — no offer detection, no
  clause structure. → **KEEP as a flag**

## 1. Responsibilities of the deterministic scorer

Check facts about artifacts. Never read a sentence for meaning.

1. **Artifact integrity** — every run has a header, a non-empty answer, a snapshot whose digest
   recomputes, and each required provenance field. This is the *only* thing that faults.
2. **Tool behaviour** — which tools were called, in what order, what failed, from the proxy log.
3. **Branch obligations** — which runs owe a recommendation, from `get_taste` and `prompt`.
4. **Structural counts** — how many commitment idioms occur, how many enumerated items, how many
   of those open on a condition. Counted and flagged; never read as whether the shape is right.
5. **Prohibited literal claims** — a fixed idiom list, matched verbatim.
6. **Snapshot contradictions** — the answer asserts something the bound snapshot denies.
7. **Containment** — whether the answer names any stored Genre, Mix or Movie, where the fixture
   holds one. This is a **flag, never a failure**: R3 allows "a paraphrase they would recognise as
   their own", which names nothing and satisfies AC3a.

Anything needing a window, a clause split, a subject, or a guess at what a title looks like is out
of scope by construction.

### Ownership

**The deterministic layer owns admissibility and flags. The blind judge owns every criterion
verdict.** No acceptance criterion has two owners. A deterministic failure is therefore always
artifact-level — *"this run records no answer"*, *"this run is not bound to its snapshot"* — and
never says that AC*n* failed.

**No property of an answer's content can produce a fault.** However bad an answer is — an
interview, a flat list, an overconfident claim, a contradiction of the snapshot — it is flagged and
left to the judge. The only thing the deterministic layer may refuse to score is a damaged
artifact.

### Flags

Everything observable about an answer produces **flags, not verdicts**: structural counts and a
zero-signal marker (AC1), prohibited idioms (AC2), an answer naming nothing stored (AC3a), and
snapshot contradictions (AC4). A flag is a high-recall literal match, reported with its location
and quoted text, and **adjudicated in the blind pass**. Every flag must be adjudicated; an
unadjudicated flag blocks completion.

This is the inversion that makes the split work. Today the scorer is low-recall and high-confidence
— it renders a verdict and misses things, which is how the AC4 violation reached blind review
unflagged. A flag is high-recall and makes no claim: the novelty-contradiction flag fires on 21
sites across the 120 recorded answers, of which one is real. Twenty spurious flags reviewed once
per evaluation is a trivial load, and nothing escapes notice.

A flag never fails the gate on its own. An **unadjudicated** flag does.

## 2. Responsibilities of the blind judge

Everything about what the answer means, scored without knowing which side produced it — the
existing `rubric.md` procedure, unchanged: seed a fixture, capture, pair by fixture/prompt/run,
shuffle, score blind, re-join afterwards.

It owns:

- which film is recommended, and whether one is named as the lead;
- whether a mention is evidence or an offer;
- whether positive evidence is visible and convincing;
- whether confidence about fit is properly separated from confidence about intent;
- fit, discovery quality, personalization, and the two prohibition criteria;
- adjudicating every flag the scorer raised.

Hand-scored, with the rubric's existing caveat: a judge model may assist once hand-scoring cannot
keep up, never for **unsupported claims** or **false personalization** without spot checks.

## 3. Where each AC lands

| AC | Deterministic | Blind | Note |
| --- | --- | --- | --- |
| **1** | cue/item/conditional counts and a zero-signal flag | a concrete film named as the lead; which film; one lead vs several; whether directions are genuinely conditional; the verdict | All flags. *"Watch Paterson tonight."* carries no cue, no list and no year, and is a good answer |
| **2** | `OVERCONFIDENT_FIT` **flag** | is the certainty about the film's fit or the user's intent? | Removes `governingSubject` entirely |
| **3a** | provenance + fixture applicability; containment **flag** | attribution; paraphrase; exclusion-vs-support; the verdict | Removes 125 lines and four regex banks |
| **3b** | — | binds in 05; not mentioned in 06 | Already blind-only today |
| **4** | novelty-contradiction **flag** | is the stateful film being *offered*? | Keeps the observed defect catchable with ~25 lines instead of 124 |
| **5** | — | expansion anchored, marked as a stretch | Already blind-only today |
| **6a** | — | stopped; reported the failure in the tool's own words; offered to retry | Blind. A future flag could quote the tool's error text, but the verdict stays here |
| **6b** | — | disclosed in the first sentence; kept the shape; made no personal claim; offered to retry | Blind |

**Every row's verdict is the blind judge's.** Four rows also produce deterministic flags, and none
of those flags decides anything. No row loses coverage.

## 4. Migration plan

Ordered so the gate is never weaker than it is now, and nothing is deleted before its replacement
is shown to work.

1. **Write the adjudication sheet.** Extend `rubric.md` with a flags section: what each flag means,
   how to adjudicate it, and the rule that an unadjudicated flag blocks. Documentation only.
2. **Add the two flags** — `OVERCONFIDENT_FIT` (already written) and novelty-contradiction (new,
   ~25 lines, no offer detection). Report them; do not gate on them yet.
3. **Parallel-score the retained corpus.** Run old and new over `phase-1-repaired` and diff. The
   required result: the AC4 violation in `03-state-rich__plain__04` still surfaces as a flag, and
   every finding the old scorer reported on AC1, AC2 and AC3a still surfaces as a flag or a fault.
   Any divergence is investigated before deletion, not after.
4. **Delete**, in this order, each with its contracts: AC4 offer apparatus → AC3a evidence banks →
   AC2 subject binding → AC1 `FILM`/`hasLead` window. Each deletion is its own reviewable change.
5. **Move the deleted rows into the blind sheet** as explicit scoring lines, so a reviewer scores
   them rather than assuming the scorer did.
6. **Rerun Step 8** under the new architecture. A rerun is required regardless — the AC4 row is red
   on `a3357c1c`, and the product rule that fixes it shipped in `f5b757ed`, which has never been
   evaluated.

Steps 1–3 are additive and reversible. Nothing is removed until step 4, after the diff in step 3.

## 5. Expected simplification

| | Now | After |
| --- | ---: | ---: |
| Lines | 583 | ~275 |
| Regexes | ~15 | 6 |
| Windows / spans / clause splitters | 6 | 0 |
| Evaluation contracts | 46 | ~20 |

Surviving regexes: the header block, `COMMITMENT`, `BULLET`, `OVERCONFIDENT_FIT`, and a novelty
phrase list. Removed outright: `FILM`, `COPULA`, `RELATIVE`, `CLAUSE_BREAK`, `INTENT_SUBJECT`,
`ATTRIBUTION`, `POSSESSION`, `USE`, `CONTRAST`, `DIRECTION_CUE`, `EVIDENCE_BEFORE`,
`EVIDENCE_AFTER`, `TITLE_BEFORE_YEAR` — thirteen of fifteen.

Roughly half the evaluation contracts disappear with the code they pin. The contracts that encode
**product** rules — `test.sh` (150) and `instructions.test.ts` (30) — are untouched; they assert
what the skill says, which is unaffected by how runs are scored.

## 6. Risks

**A semantic row can regress without CI noticing.** Today `node --test` fails if AC1/AC2/AC3a break
on the retained corpus. After the move, nothing about an answer's quality fails there — only a
damaged artifact does. *Mitigation:* the flags still change count when behaviour changes, and the
contracts pin the flags the retained corpora produce, so a regression is visible as a flag that
appeared or vanished. The verdict itself was only ever available at evaluation time, since a rerun
is needed to produce new answers anyway.

**Blind scoring is slower and needs a person.** 120 answers plus flag adjudication. *Mitigation:*
it is already the documented method for all eight rows; this makes the real cost visible rather
than adding it.

**Judge-model wave-through.** If hand-scoring is replaced by a model, the two prohibition criteria
are the ones it will miss. *Mitigation:* the rubric already forbids that without spot checks, and
the flags give the spot-check list for free.

**Blind scoring is less reproducible than a regex.** Two reviewers may differ. *Mitigation:*
reproducibility is preserved where it is achievable — artifacts, digests, tool logs and flags are
all deterministic and re-derivable. Agreement on meaning was never available from the regexes
either; they were reproducible *and wrong*, which is worse than reproducible disagreement, because
it is invisible.

**Re-litigating settled rows.** AC1, AC2 and AC3a were recorded as passing on the strength of the
old mechanical rows; under blind scoring a verdict could change. *Mitigation:* step 3's parallel
score surfaces that before anything is deleted. A row that changes verdict was mis-scored, and
finding that out is the point.

**Losing the one thing the scorer caught well.** The AC4 flag must still surface
`03-state-rich__plain__04`. *Mitigation:* that is step 3's explicit pass condition.

## 7. Recommendation

**Adopt, and do it before the Step 8 rerun.**

The rerun is required anyway, and it is the moment the current heuristics would otherwise be baked
into a shipping decision. Running it under the new architecture costs one extra blind pass — which
the rubric already calls for — and removes thirteen regexes from the thing deciding whether Phase 1
ships.

The argument is not that the scorer is badly written. It is that four of its corrections came from
the same source: it was asked which film was being recommended, and there is no reliable way to
answer that with a regex, because *deciding which film to recommend and why* is the product's whole
job. An evaluator that re-implements the product's judgement will keep disagreeing with it, and
each disagreement costs a correction cycle that teaches nothing about the product.

Keep the scorer for what it is genuinely better at than a person: never missing a missing file,
never mis-reading a digest, never forgetting to check the eleventh tool, never getting bored on run
53. Give the sentences to the blind pass that already owns them.

Two caveats on scope. This changes **no product text** — `SKILL.md` and the generated instructions
stay at `f5b757ed`, 7,900 characters. And it does not excuse the AC4 defect: the canonical rule
that fixes it already shipped, and the next evaluation must show it holding.
