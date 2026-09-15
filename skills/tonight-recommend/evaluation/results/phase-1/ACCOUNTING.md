# `645a831f` — failed candidate

**Verdict: does not ship.** Five of the eight rows of §8.3.1 fail. Recorded under R5 of
`docs/work/phase-1-repairs.md`, by rescoring the runs in `runs/` — no recapture, no re-seeding,
no artifact altered.

This is the authoritative accounting for instruction version `645a831f`. It is **not** a baseline
and must never be compared against as one: the frozen `f098fd5b` set in `../baseline/` remains the
single approved comparison point.

```
  runs/             60 runs, instruction version 645a831f, model claude-sonnet-5
  runs/snapshots/   60 — what get_taste answered immediately before each run
  runs/logs/        60 — the proxy's record of every call each run made
```

Mechanically clean: 60/60/60, 60 distinct sessions, every snapshot digest recomputes to its
header value, all provenance fields present, `external_tools: disabled` throughout.

## The rows

| AC | Verdict | Why |
| --- | --- | --- |
| **1** | **fail** | Four runs owed the answer shape and produced none: `01-empty__plain` 01, 02 and 04, and `08-failure-ordinary__plain__01`. Runs 03 and 05 of the empty fixture do produce it |
| **2** | **fail** | Maximal certainty about a specific film's fit under a Mix with nothing under it: `02-new-mix__plain__05` and `__taste-explicit__05` (*"as pure a fit … as exists"*) and `__taste-explicit__01` (*"as pure a fit … as you'll find"*) |
| **3a** | **fail** | **All five** `06-exclusion-plain__unrelated-plain` runs. Three name nothing stored (01, 04, 05); two name the `Quiet Dread` Mix only to set it aside (02, 03) — narrating an exclusion is not evidence that stored taste supported the recommendation |
| **3b** | **fail** | The exclusion correctly did not bind in 5 of 5, and was **mentioned** in 2 of 5 — `06-exclusion-plain__unrelated-plain` 02 and 03 |
| **4** | pass | 20 of 20 across `03-state-rich` and `04-contradictory`. Stateful films appear as reasons, never offered as new, with the opportunity genuinely present |
| **5** | pass, with a finding | No fabricated anchor anywhere, and the empty fixture never invents a taste. 6 of 30 state-rich directions anchor through the thesis rather than by name |
| **6a** | pass | 5 of 5 stop, report the store's own words, and offer to retry |
| **6b** | **fail** | `08-failure-ordinary__plain__01` asked instead of recommending; `__03` recommended without offering a retry |

**Failed rows: 1, 2, 3a, 3b, 6b.**

None of §8.3.2's prohibited outcomes appeared: no false personalization, no unsupported
availability or release claim, no exclusion applied as a global filter, no film carrying a state
presented as new.

## What R5 corrected, and what it did not

Rows **1, 2 and 3a** moved. Every other row is as the reviewed evaluation left it.

| Row | First pass | Corrected | Cause |
| --- | --- | --- | --- |
| 1 | fail, "4 of 5 empty-model runs" | fail, **3 of 5** — 01, 02, 04 | The lead was detected by the phrase `I'd start with` alone, so `__05`'s *"my lead tonight: The Nice Guys (2016)"* was read as no recommendation |
| 2 | pass, with a finding | **fail** | Under R4's confidence standard, unhedged maximal certainty about a specific film's fit under a state-free Mix fails the row |
| 3a | `partial` | **fail** | Not a verdict. §8.3.1 is every-run, so a run without observable model influence fails the row |

## Per-run corrections after the scorer repair

A second review found the row verdicts right and three per-run classifications wrong. The rows did
not move — AC1, AC2 and AC3a all still fail — but what they fail *on* did.

| Row | Was | Now | Why |
| --- | --- | --- | --- |
| 1 | 5 runs, including `06-exclusion-plain__unrelated-plain__03` | **4 runs** | A lead was recognised by the commitment alone. Requiring a concrete film both removed `"My pick depends on the mood"`-style false passes and fixed a false failure: run 03 names its film *before* the commitment — *"**Martyrs (2008)** — I'd start here"* |
| 2 | 2 runs | **3 runs** | The span between *"as pure a fit"* and *"as you'll find"* was capped at 40 characters, so the form that names the Mix instruction in between was missed |
| 3a | 3 runs | **5 runs** | A stored name counted wherever it appeared. Runs 02 and 03 name `Quiet Dread` only to contrast with it, which is not positive evidence |

Genre names are matched on the same footing as Mix and film names, with attribution required of
all three: *"because you like slow-burn stories"* counts, *"a slow burn that lulls you for an
hour"* does not — including when it is capitalised, since the capital is the writer's, not the
user's.

`score.mjs` is the standard, so the same rules will be applied to the repaired rerun. The
comparative half of §8.3 was not run: §8.3 is a conjunction and the AC half is a hard stop, so
comparative scores could not change this verdict and would have to be discarded under §8.2 after
any repair.
