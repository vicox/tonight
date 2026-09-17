# `0c0dce73` — the candidate that ships

**Verdict: PHASE 1 COMPLETE.** Both halves of §8.3 pass: every required behaviour of §8.3.1 appears
in every run of the fixtures that owe it, and §8.3.2's comparison against the frozen baseline shows
no regression and no prohibited outcome.

Recorded against committed instructions. `SKILL.md`, `project-instructions.ts` and `mcp/server.ts`
were clean against `HEAD` when the sweep began, so the version every run names exists in a commit
and the run is reconstructible from it.

```
  runs/             60 runs, instruction version 0c0dce73, model claude-sonnet-5
  runs/snapshots/   60 — what get_taste answered immediately before each run
  runs/logs/        60 — the proxy's record of every call each run made
  adjudication/     the flag rulings, the AC ledger and the §8.3.2 review
  blind-comparison/ the frozen pair judgements, the side key, the aggregate
```

Captured 2026-09-17, 11:09:17Z to 11:50:26Z, CLI 2.1.273, one fresh session per run.

## Mechanical integrity

60 runs, 60 snapshots, 60 logs; 60 distinct sessions; all eighteen provenance fields present in
every run; every snapshot digest recomputes to its header value; no empty or truncated answer;
`external_tools: disabled` throughout. The shared-model fixtures hold — `06` reads `05`'s model and
`07`/`08` read `03`'s — and all ten failure runs show eleven tools discovered plus a genuine
`isError` refusal of `get_taste`, which is an invocation failure on a live connector rather than a
dead one.

The deterministic layer reports **0 admissibility faults** and **29 flags**. A flag decides nothing;
all 29 are adjudicated below and none stands.

## The rows

| AC | Verdict | Fixtures | Evidence | Flags |
| --- | --- | --- | --- | --- |
| **AC1** | **PASS** | 01, 02, 03, 04, 05, 06, 08 | every such run names exactly one lead film and gives 2–3 directions; leads recorded per run in adjudication/flags.json | 18 dismissed (counting variants: cue phrased outside the idiom list, or a condition stated in a position the counter does not read) |
| **AC2** | **PASS** | 02-new-mix | no run claims the user is known to like a film or that one is confirmed for them while no Movie carries a state; the Mix is used as intent throughout | 1 dismissed — 02-new-mix__plain__05 compares Paterson to the Mix's own written criterion, which the clarified AC2 permits |
| **AC3a** | **PASS** | 02-new-mix, 03-state-rich (ordinary prompts) | each names stored Genres, Mixes or Movies and draws on them unasked; the deterministic containment flag fired on none | 0 |
| **AC3b** | **PASS** | 05-exclusion-explicit, 06-exclusion-plain | 05: all five honour no-gore/no-torture and name the Quiet Dread mix. 06: all five recommend brutal horror by name without hedging, and none mentions the exclusion, the Mix, or any saved preference | 0 |
| **AC4** | **PASS** | 03-state-rich, 04-contradictory (05 also flagged) | no Movie carrying seen/liked/loved/disliked is offered as new; where a stateful title sits near novelty language the claim belongs to the offered film, recorded per flag | 10 dismissed |
| **AC5** | **PASS** | 01-empty, 03-state-rich | no fabricated anchor anywhere; the empty fixture states it has nothing saved rather than inventing a taste, and state-rich expansions anchor by name in loved/liked films | 0 |
| **AC6a** | **PASS** | 07-failure-explicit | all five stop without recommending, quote the store's own error verbatim, and offer to retry | 0 |
| **AC6b** | **PASS** | 08-failure-ordinary | all five disclose in the first sentence, recommend in the AC1 shape, make no personal claim, and offer to retry | 4 AC1 flags dismissed |

**No row fails.**

## Flag adjudication

29 flags, 29 rulings, none outstanding — `adjudication/flags.csv` and `.json`, one row each with the
quoted context, the ruling and its reason.

| AC | Flags | Ruling |
| --- | ---: | --- |
| AC1 | 18 | all dismissed. Counting variants: a commitment phrased outside the idiom list, or a condition stated where the counter does not read it. Every run still names one lead and gives 2–3 directions |
| AC2 | 1 | dismissed. `02-new-mix__plain__05` compares *Paterson* to the Mix's own written criterion. Under the clarified AC2 that is permitted, however warmly put; what is refused is a claim on the user's verdict, and none is made |
| AC4 | 10 | all dismissed. In every case the novelty claim belongs to the offered film — *No Country for Old Men*, *Ex Machina*, *Insomnia*, *The Wicker Man* — none of which carries a state. The flagged title sits beside it as evidence, with its state stated correctly |

## Paired blind comparison

60 pairs against the frozen `f098fd5b` baseline, one per fixture/prompt/run cell, no cell unpaired.
Side order randomised per pair under a fixed seed; the baseline sits on side A in 30 of 60. All four
version strings were replaced before scoring, and the key in `blind-comparison/side-key.csv` was not
read until every judgement in `blind-comparison/judgements.csv` was written.

| Dimension | Candidate | Baseline | Tie |
| --- | ---: | ---: | ---: |
| Fit | **55** | 0 | 5 |
| Constraint compliance | **0** | 0 | 60 |
| Decisiveness | **55** | 0 | 5 |
| Discovery quality | **25** | 0 | 35 |
| Justified personalization | **55** | 0 | 5 |
| False personalization | **0** | 0 | 60 |
| Unsupported claims | **0** | 0 | 60 |

The five ties on fit, decisiveness and personalization are the `07-failure-explicit` pairs, where
both sides correctly decline and there is no recommendation to compare. Constraint compliance ties
across all sixty: both sides honour the runtime limit and the exclusion where it binds.

**No dimension regresses.** §8.3.2 blocks on a loss against fit or constraint compliance, or on any
prohibited outcome; none occurred.

## Prohibited outcomes

None, across all 120 answers. Recorded with the method used for each in
`adjudication/prohibited-outcomes.md`.

## What this candidate settles

`0c0dce73` is the first candidate to pass both halves of §8.3.

| Candidate | Outcome |
| --- | --- |
| `645a831f` | failed AC1, AC2, AC3b, AC6b |
| `a3357c1c` | failed AC4 — a `seen` film offered as a direction and called unseen |
| `f5b757ed` | failed AC2 |
| `b7471669` | failed AC2 |
| **`0c0dce73`** | **passes every row, and wins or ties every comparative dimension** |

The three AC2 failures were the same sentence shape in the same fixture, and two attempts to suppress
the wording did not stop it. What ended it was changing what the rule measures: a Mix with nothing
under it establishes intent, so a film may be matched against its written criteria as plainly as it
deserves, and what may not be claimed is the user's own verdict, which only a Movie state carries.
