# `15d30c08` — the recertified version

**Verdict: PHASE 1 RECERTIFIED.** Both halves of §8.3 pass: every required behaviour of §8.3.1
appears in every run of the fixtures that owe it, and §8.3.2's comparison against the frozen
baseline shows no regression and no prohibited outcome.

This cycle exists because the canonical prompt changed twice after `0c0dce73` shipped. M1 gave
Tonight four Episode tools, and `744575a` added the rule that a tool call is not an answer — which
worked, and was stated so broadly that one run applied it inside the branch that must stop.
`a39b2dc` made its precedence explicit. Recorded against committed instructions: `SKILL.md`,
`project-instructions.ts` and `mcp/server.ts` were clean against `HEAD` when the sweep began, so the
version every run names exists in a commit and the run is reconstructible from it.

```
  runs/             60 runs, instruction version 15d30c08, model claude-sonnet-5
  runs/snapshots/   60 — what get_taste answered immediately before each run
  runs/logs/        60 — the proxy's record of every call each run made
  adjudication/     the flag rulings, the AC ledger and the §8.3.2 review
  blind-comparison/ the frozen pair judgements, the side key, the aggregate
```

Captured 2026-09-17, 18:17:50Z to 18:57:37Z, CLI 2.1.274, one fresh session per run.

## Mechanical integrity

60 runs, 60 snapshots, 60 logs; 60 distinct sessions; all eighteen provenance fields present in
every run; every snapshot digest recomputes to its header value; no empty or truncated answer;
`external_tools: disabled` throughout. The shared-model fixtures hold — `06` reads `05`'s model and
`07`/`08` read `03`'s — and each fixture shows one digest across all its runs. All ten failure runs
discover fifteen tools live and then meet a genuine `isError` refusal of `get_taste`, which is an
invocation failure on a live connector rather than a dead one.

The tool surface grew from eleven to fifteen because M1 added `record_episode`, `get_episodes`,
`correct_episode` and `forget_episode`. That is a capability the version under test has and the
baseline does not; it is not a regression, and the invariant it introduces is scored under AC1.

The deterministic layer reports **0 admissibility faults** and **35 flags**. A flag decides nothing;
all 35 are adjudicated below and none stands.

## The rows

| AC | Verdict | Fixtures | Evidence | Flags |
| --- | --- | --- | --- | --- |
| **AC1** | **PASS** | 01, 02, 03, 04, 05, 06, 08 | every run owing a recommendation names exactly one lead film and gives 2–3 directions. Integration invariant: 1 of 55 uses an Episode tool, additively, and **0** have a recommendation replaced or shortened by one | 29 dismissed |
| **AC2** | **PASS** | 02-new-mix | all ten name the Reading Room mix and let it shape the answer; none claims the user is known to like a film or that one is settled for them | 1 dismissed |
| **AC3a** | **PASS** | 02-new-mix, 03-state-rich (ordinary prompts) | each names stored Genres, Mixes or Movies and draws on them unasked | 0 |
| **AC3b** | **PASS** | 05-exclusion-explicit, 06-exclusion-plain | 05: all five honour no-gore/no-torture. 06: all five recommend brutal horror by name without hedging, one offering torture-driven horror explicitly, and none mentions the exclusion or the Mix | 0 |
| **AC4** | **PASS** | 03-state-rich, 04-contradictory (05 also flagged) | no Movie carrying a state is offered as new; the opportunity exists and was taken, with all twelve stateful films reached for | 5 dismissed |
| **AC5** | **PASS** | 01-empty, 03-state-rich | no fabricated anchor anywhere; the empty fixture never invents a taste, and every expansion anchors in a liked or loved film or in the user's own Mix | 0 |
| **AC6a** | **PASS** | 07-failure-explicit | all five stop, report the store's own error, offer to retry, and name no film at all — no general pick, no "in the meantime" recommendation | 0 |
| **AC6b** | **PASS** | 08-failure-ordinary | all five disclose in the first sentence, recommend in the AC1 shape, make no personal claim, and offer to retry | 4 AC1 flags dismissed |

**No row fails.**

## Flag adjudication

35 flags, 35 rulings, none outstanding — `adjudication/flags.csv` and `.json`, one row each with the
quoted context, the ruling and its reason.

| AC | Flags | Ruling |
| --- | ---: | --- |
| AC1 | 29 | all dismissed. Counting variants: a commitment phrased outside the idiom list, or a condition stated where the counter does not read it. Every run still names one lead and gives 2–3 directions |
| AC2 | 1 | dismissed. `02-new-mix__plain__03` measures *Paterson* against the Mix's own written criterion. Under the clarified AC2 that is permitted, however warmly put; what is refused is a claim on the user's verdict, and none is made |
| AC4 | 5 | all dismissed. In every case the novelty claim belongs to the offered film — *Sicario*, *The Man Who Fell to Earth*, *Memories of Murder* — none of which its run's snapshot holds. The flagged title sits beside it as evidence, with its state stated correctly |

**The weakest run of the sixty is recorded rather than smoothed over.** `01-empty__constrained__02`
names its lead by position instead of by the idiom, and places each direction's condition after the
title rather than opening on it. Every direction is still conditioned and exactly one film is
committed to — the close names it against the alternatives — so AC1 holds, dismissed on the same
ground the `0c0dce73` record dismissed its own position variants. It is one run in sixty, and the
certified set was 5 of 5 the other way in that cell.

## Paired blind comparison

60 pairs against the frozen `f098fd5b` baseline, one per fixture/prompt/run cell, no cell unpaired.
Side order randomised per pair under a fixed seed; the baseline sits on side A in 30 of 60. All
version strings were replaced before scoring, and the key in `blind-comparison/side-key.csv` was not
read until every judgement in `blind-comparison/judgements.csv` was written. When it was opened, the
lead-and-directions side proved to be the candidate in all 55 pairs where one existed.

| Dimension | Candidate | Baseline | Tie |
| --- | ---: | ---: | ---: |
| Fit | **55** | 0 | 5 |
| Constraint compliance | **0** | 0 | 60 |
| Decisiveness | **55** | 0 | 5 |
| Discovery quality | **25** | 0 | 35 |
| Justified personalization | **35** | 0 | 25 |
| False personalization | **0** | 0 | 60 |
| Unsupported claims | **0** | 0 | 60 |

The five ties on fit and decisiveness are the `07-failure-explicit` pairs, where both sides correctly
decline and there is no recommendation to compare. Constraint compliance ties across all sixty. The
baseline answers with a bare clarifying question in 25 pairs and with a five-or-six-film list
carrying no lead in 30.

Justified personalization reads 35 here against 55 in the `0c0dce73` record. That is a stricter
scoring convention in this cycle, not a behavioural change: the candidate was given the dimension
only where the baseline personalizes nothing at all, or where it asserts a hedged confidence about
the user (*"I'd rate this a fairly confident match — three consistent positive data points"*), and
the remaining list pairs were scored a tie because both sides cite the model correctly.

**No dimension regresses.** §8.3.2 blocks on a loss against fit or constraint compliance, or on any
prohibited outcome; none occurred.

## Equivalence against the version it replaces

§8.3.2 compares against the Step 1 baseline, and that comparison is the gate above. Because this
cycle changed a shipped instruction set rather than an unshipped candidate, a second paired blind
comparison was run against `0c0dce73` — the version Phase 1 was certified on — to answer whether the
certified behaviour moved. Same method, 60 pairs, separate seed, key held back.

| Dimension | Candidate | `0c0dce73` | Tie |
| --- | ---: | ---: | ---: |
| Fit / constraint / discovery / justified pers. | 0 | 0 | 60 |
| Decisiveness | 0 | 1 | 59 |
| False personalization / unsupported claims | 0 | 0 | 60 |

Both sides carry the same shape in all 60 pairs — one lead, two or three directions, one close — and
all five `07` pairs stop on both sides. Thirteen pairs differ only in direction count, 2 against 3,
both within AC1. The single scored difference is `01-empty__constrained__02`, described above. The
certified behaviour is unchanged.

## Prohibited outcomes

None, across all 120 answers. Recorded with the method used for each in
`adjudication/prohibited-outcomes.md`. One editorial slip was found and is not a prohibited
outcome: `06-exclusion-plain__unrelated-plain__02` dates *Terrifier 2* to 2017 rather than 2022.

## What this cycle settles

| Version | Outcome |
| --- | --- |
| `0c0dce73` | passed every row; certified Phase 1 |
| `7cd5b2e3` | M1 disclosure alignment — **failed AC1**: `01-empty__constrained__04` put its recommendation into `record_episode` and replied with one sentence |
| `b343335b` | integration rule — replacement count 0, but **failed AC6a**: `07-failure-explicit__taste-explicit__02` reported the failed read and then recommended three films "in the meantime" |
| **`15d30c08`** | **passes every row; replacement count 0 and 5 of 5 stops correct** |

The two failures were the same mistake seen from opposite sides: a rule about where an answer must
appear, and a rule about when one is owed at all. `744575a` fixed the first and caused the second;
`a39b2dc` made the precedence between them explicit without weakening either.
