# Behavior reports

Tests prove an instruction is **in the text**; only a model run shows whether a model **follows**
it. A behavior report is the record of those runs for one change: one Markdown file, committed beside
the change, that a person reads in five minutes.

The runner's results are ignored by git and go with the worktree they were recorded in. The report
is what stays: every turn verbatim, every Tonight call with its arguments whole and the gist of its
answer, what the saved state became in plain words — Genres, Vibes, films, what was said and every
evening — the fixture each run started from, and the model, source, instructions and commit it ran
on.

## When

A change to what the agent reads: a `skills/*/SKILL.md`, or a tool description, argument description
or `next` in `web/lib/mcp/server.ts`. Not a change the agent never reads.

## What it holds

| part | what | runs |
| --- | --- | --- |
| **targeted** | the scenario the change is about, on the source it affects | 3 each |
| **before** | for a bug fix, when it helps: the same scenario on the instructions before the change | 1–3 |
| **regression** | the fixed set below, on `plugin-skills` | 1 each |
| **deterministic tests** | what `npm test`, `test.sh` and the typecheck counted — no model involved | — |

The regression set is the M5 scenarios marked `smoke` (`skills/tonight-recommend/evaluation/m5/scenarios.json`),
11 model calls, inside the runner's default budget:

| scenario | what it guards |
| --- | --- |
| `m5-02-empty__what-tonight` | a new user asking for a film gets one |
| `m5-02-empty__hi__then-three-films` | a new user's first films become first Vibes, nothing written without a yes |
| `m5-04-reading__liked-bloom` | a liked film no Vibe fits: a new-Vibe offer, nothing written |
| `m5-05-partial-fit__bloom-clever__then-yes` | a liked with a reason: an existing Vibe first; the yes writes what was agreed |
| `m5-05-partial-fit__bloom-clever__then-no` | the same, declined: nothing written |
| `m5-06-bloom-saved__bloom-clever__then-pick-title-one__then-like-bloom-tonight` | a kept film's new Vibe picked by title, then a recommendation |

Each run is **PASS** or **FAIL**, read by a person against `m5/rubric.md`, or **UNTESTED**: the
runner never got there — not run, a quota or sign-in failure, a turn never sent. UNTESTED is never a
PASS and never a FAIL. The report decides only that last part, mechanically; it writes `TO SCORE`
everywhere else and never a verdict.

## Steps

The runner needs the dev server and `web/.env.local` (`m5/README.md`, *Running it*). Add
`--backend deepseek` for DeepSeek, as recent recordings did. `E` is
`skills/tonight-recommend/evaluation`.

1. **Deterministic tests**, as for any change.
2. **Record**, with the change committed — the runner refuses edited instructions:

   ```bash
   node $E/m5/run.mjs --source plugin-skills --only <scenario> --runs 3 --budget <calls>   # targeted
   node $E/m5/run.mjs --source plugin-skills --smoke                                     # regression
   node $E/m5/run.mjs --source plugin-skills --only <scenario> --runs 3 --budget <calls> \
     --against <base>                                                                    # before, for a bug fix
   ```

   Use `--source recommend-only` as well where the change is to `tonight-recommend` alone. If the
   targeted scenario is in the regression set, run the regression set with `--resume`: its run 01 is
   already recorded.
3. **Render**:

   ```bash
   node $E/report.mjs --title "<change>" --out docs/work/<change>/BEHAVIOR.md \
     [--targeted <scenario>] [--before $E/m5/results/<baseline-dir>] $E/m5/results/<dir> …
   ```

   Each `<dir>` is a directory the runner wrote. `--targeted` names a scenario the change is about
   that is also in the regression set; any other scenario is targeted already, and so is one with a
   `--before` run.
4. **Score**: replace every `TO SCORE` with PASS or FAIL — a FAIL with the rubric line it breaks —
   and write *Verdict* and *Deterministic tests*. Leave UNTESTED as it is, and leave the evidence
   alone.
5. **Commit** the report with the change. The reviewer reads it with the diff.

`docs/work/behavior-reports/SAMPLE.md` is the generator's output on three real recordings, unscored.

## Cost

A report is roughly 15 to 30 model calls: three targeted runs of one to three turns each, the
regression set's 11, and a before pass where there is one. The runner refuses
any plan over its budget until `--budget` names the size, and that is the approval. A full matrix
is never part of a report.
