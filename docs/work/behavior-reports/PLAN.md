# Behavior reports: a committed record of a skill change's live runs — plan and record

Base `c101a37`. Evaluation tooling and docs only: no skill, server, tool or product change.

## 1. What was wrong

Skill changes ship on tests that prove a rule is in the text. When live runs are made, their
evidence is in the runner's ignored `results/`, in the worktree they were recorded in, and goes
with it. The last two plans say *"No live M5 runs"*. Yet the skill compliance worktree holds three
DeepSeek recordings at `adc2b20` that nothing in the repository mentions. Nobody can read what a
change did to behavior without that worktree, a results directory, and three files per run.

## 2. The change

- **`evaluation/report.mjs`** reads what `m5/run.mjs` already writes — each run's artifact, proxy
  log and two snapshots — and renders one Markdown report:
  - provenance: instructions, source, commit, model and host;
  - a results table;
  - per scenario, the fixture and its starting state in words;
  - per run, every turn verbatim, each turn's Tonight calls with their arguments and the gist of
    their answers, and what the saved state became in plain words — timestamps and references are
    never a change.

  It calls no model and scores nothing. A run that never got going, a turn never sent, and a
  regression scenario with no run are UNTESTED. Everything else is `TO SCORE`, for a person to
  replace with PASS or FAIL. `--before` places a baseline's runs beside the runs after the change.
- **The regression set** is six M5 scenarios marked `smoke` on `plugin-skills`. The runner's
  existing `--smoke` records them, one run each, 11 model calls inside the default budget of 12,
  with no runner change.
- **`docs/behavior-reports.md`**: when a report is due, what it holds, five steps, the cost.
  `m5/README.md` points at it.
- **`SAMPLE.md`**: the generator's output on the three `adc2b20` recordings, unscored. It shows a
  whole run, a run UNTESTED from turn 2 (its pick could not be resolved), and five regression
  scenarios UNTESTED — not run.

Not added, on purpose: a judge, a dashboard, a new runner or framework, verdict files, committed
raw logs, or any full-matrix run.

## 3. Tests

`web/lib/evaluation-report.test.ts`, 8 tests, no model and no network:

- artifacts parse, including an answer with headings of its own and a turn not sent;
- UNTESTED versus `TO SCORE`, for every way a run can fail;
- call lines: arguments, a refused answer, backticks fenced, bookkeeping dropped;
- state changes in words: added, changed, removed, now stands, remembered — and a re-read with new
  timestamps is *No change*;
- the starting state;
- the regression set: exactly the six keys, on `plugin-skills`, no operator-seeded fixture,
  within the budget;
- a report end to end from a temporary results tree, before and after — no PASS or FAIL invented,
  no local path written;
- the runner still writes every heading the report reads.

**Run by the implementer:**

- `node --test` over the six evaluation suites: 71/71.
- `npm test` in `web/`: 1381 of 1385. The four are `evaluation.test.ts` reading the gitignored
  `evaluation/results/` (ENOENT), as before.
- `npm run typecheck` clean; eslint clean on the new test (`report.mjs` is outside eslint's base
  path, as every evaluation `.mjs` is).
- `m5/run.mjs --source plugin-skills --smoke --dry-run`: 6 runs, 11 model calls, budget 12.

**No live model runs were made**: the sample is rendered from recordings that already existed.

## 4. Review
