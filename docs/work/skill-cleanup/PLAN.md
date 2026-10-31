# Skill cleanup: consent before a Genre, the order of calls, and a keep scenario — plan and record

Base `a949e8d` (plugin 1.10.14). A small cleanup the user approved after a read-only analysis by
Claude and Codex agreed: no broad consolidation, no change to the product model, the tool schemas
or their behaviour, and the deliberate duplication between the two skills kept.

## 1. What was wrong

- **A Genre written before the yes.** The keep flow, in both skills, said *"Reuse the Genres that
  fit, create one for anything uncovered … then propose a Vibe over them."* Read in order, that is
  `create_genre` before the proposal, which contradicts *noticing is free; writing needs a yes*, the
  proposal's own *"a yes is the whole permission: any Genre it needs, then the Vibe…"*, and
  tonight-vibes' *a new one is part of the offer*.
- **Every write after the reply.** tonight-recommend's shape rule ended *"what you write down comes
  after"*, which reads as every call after the visible answer, against *Call `record_verdict` in
  the turn they say it, before anything else*. tonight-vibes' owed answer *"comes first"* had the
  same reading.
- **Copies and an orphan in tonight-recommend.** `update_vibe`'s and `delete_genre`'s refusals
  restated in the sentence that says they are the tools'; *"Names match case-insensitively"*, which
  the name fields state; and a fragment with no referent (*"The taste model and nothing else, in
  full: no way to ask how often…"*).
- **The worked proposal is a fixture.** tonight-vibes' one example (section 24 of
  `docs/work/vibe-hypotheses/PLAN.md`) names *Everybody Has a Plan* on a Heist Genre, and
  `m5-01-anchored` holds a Vibe of exactly that name and phrase. Section 15 removed examples because an
  agent that has read the test cases is not being tested. A run in that plan's section 13 (on `a095d37`, the
  same example text) produced the example's own new Genre, *Double-cross*, nearly word for word —
  historical evidence, not observed on this commit.
- **No scenario for the keep flow's proposal**, which is where the first defect would show.

## 2. The change

- **Both skills, *None fits*:** the new Genre is part of what is proposed, and **Nothing is
  created before their yes.** The write order on a yes is unchanged.
- **tonight-recommend, the shape rule:** the whole answer is about what the reply holds, never the
  order of the calls — `record_verdict` is still the turn's first call, and an evening is recorded
  after the reply that recommends its films. **tonight-vibes, owed answer:** *first* is the
  reply's order, the answer before any offer, never before `record_verdict`.
- **tonight-recommend:** the two copied mechanics and the orphan are removed; the pointer *"The
  mechanics are in the tool descriptions, which arrive with the tools."* stays.
- **`m5-01-anchored`:** the Vibe is *Smooth Operators*, *"A crew, a plan, and everybody playing
  their own angle."* Same Genre, core and films.
- **M5, a seventh fixture and two scenarios:** `m5-07-keep-no-fit`, *"Put the original Dawn of the
  Dead on my list."*, then `yes` (`keep-no-fit`) or `no` (`keep-no-fit-declined`), on both
  sources — the keep flow is recommend's floor too. No Vibe or Genre of theirs holds the film;
  *Shaun of the Dead*, loved and seen, sits in another Vibe as a core there to choose. The rubric
  rows score zero writes on turn 1, a new Genre's meaning shown, the core never the unseen film or
  an illustration (or one question about which), and on `yes` exactly what was shown, in order.
- `plugin.json` is 1.10.15.

**Kept as they were:** the worked example, and every rule pinned as intentionally stated in both
skills (R3-1); `VIBE_REQUIRED_NEXT` and every tool description; verdict-first, the retry, consent
and the two seen values; each failure branch's own wording (`contracts.mjs`).

**Not done, on purpose: `m5-01-anchored`'s `seen`.** The analysis proposed moving it to today's
vocabulary. It is a `pre-vibe-rule` fixture: the runner seeds it only with `--legacy-seeded`,
through `f3912b0`, whose viewings are `seen`, `want-to-see` and `dont-want-to-see`, and taste v15
relabels them on migration — the README's *"which is why the fixture still says `seen`"*. Changing
it would make the fixture unseedable on the path that exists for it.

## 3. Tests

- `tonight-recommend/test.sh`: the order-of-calls sentence pinned, and *"what you write down comes
  after"* asserted gone; *None fits* pinned with the new Genre in the proposal and **Nothing is
  created before their yes**, and *"create one for anything"* asserted gone; the new fixture's
  films added to the example-film guard.
- `tonight-vibes/test.sh`: the same for its *None fits*, and the pointer check moved to the new
  words; *first is about the reply* pinned; the new fixture's names added to the scenario guard.
- `recommend-skill.test.ts`: the keep-flow regexes moved to the new words, with the consent
  sentence; the copied mechanics and name matching added to *what moved to the tools*, and the
  remaining pointer pinned.
- `evaluation-m5.test.ts`: the keep scenario's shape, its fixture and its rubric rows.

The two negative guards in the bash suites read the file with newlines joined, because the old
phrases wrapped across lines and a line-wise `grep -c` would have passed on the base too.

**Run by the implementer:**

- `npm test` in `web/`: 1383 of 1387. The four are `evaluation.test.ts` reading the gitignored
  `evaluation/results/`, absent in this worktree (`ENOENT`), as in the vibe-offer-copy record.
- `npm run typecheck` clean; `eslint` clean on the two changed test files.
- **The bash suites need an approval this session cannot give.** In their place, read-only:
  - every `grep -c` pattern over the skill in both suites was counted on the base and the new
    skill, with none changed (45 recommend, 21 vibes); the three new joined-line guards count 1
    on the base and 0 on the new text;
  - every quoted marker present on the base is present on the new text;
  - each new or edited order check passes on the new text, and each new one fails on the base.

## 4. Behavior runs: not recorded — blocked

Nothing below has run. A PASS is not claimed for any of it.

**Blockers:**

1. The runner refuses to record while either `SKILL.md`, the MCP server or the harness differs
   from `HEAD` (`m5/run.mjs`, lines 168-170 and 242-254), and nothing may be committed without the user's approval.
2. This worktree has no `web/.env.local`, which the seeder mints its tokens from.
3. The targeted scenario for the order of calls, `m5-01-anchored__knives-out-and-tonight`, is
   `pre-vibe-rule`: each run needs a fresh seeding through a separate `f3912b0` checkout on port
   3001 (`m5/README.md`, *Fixtures from before the vibe rule*), and a ticket session does not create
   checkouts.

**What to record once unblocked**, from the committed change, with `E=skills/tonight-recommend/evaluation`:

| part | command | model calls |
| --- | --- | --- |
| targeted, keep | `node $E/m5/run.mjs --source plugin-skills --only m5-07-keep-no-fit --runs 3 --budget 12` | 12 |
| targeted, keep | `node $E/m5/run.mjs --source recommend-only --only m5-07-keep-no-fit --runs 3 --budget 12` | 12 |
| targeted, order of calls | `m5-01-anchored__knives-out-and-tonight`, `--legacy-seeded --runs 1`, three seedings per source | 6 |
| regression | `node $E/m5/run.mjs --source plugin-skills --smoke` | 11 |

41 calls, above the report's usual 15 to 30 because both new scenarios have two turns and both
sources are affected. Then `report.mjs` into `docs/work/skill-cleanup/BEHAVIOR.md`, scored against
`m5/rubric.md`.

**The legacy runs need each recording kept.** Every `--legacy-seeded --runs 1` run writes the same
`__01` files into the same result directory: a second run is refused, `--resume` skips a recorded
one, and `--force` overwrites it (`m5/run.mjs`, line 439). After each run, move its whole result
directory aside — the run's `.md`, `logs/` and `snapshots/` together — under a name of its own,
say with `-seeding-2`, before emptying the database and seeding again. Then pass every one of those
directories to `report.mjs`, which keeps runs from several directories side by side. Each shows
as its own run 01.

**The keep write path has to be seen.** The rubric lets turn 1 ask which film should anchor the
Vibe, and then `yes` names none, so that run writes nothing and the write sequence — new Genre,
then the Vibe with its core, then Dawn of the Dead — is **UNTESTED** in it, never a PASS. Each
source needs at least one of its three `keep-no-fit` runs in which turn 1 named a core and `yes`
wrote. Where no run on a source did, the report says the write sequence is unverified there. A
follow-up naming a core would test it, and is not part of this change.

## 5. Review

Codex, reviewing at `codex/8ff3c87b-7d2b-4655-bc02-64cb21a3ef89`.

**Codex code review 1 — NOT READY (working tree on `a949e8d`).** The skill changes themselves
correct; keeping `m5-01`'s `seen` correct, with the legacy path and v15 migration verified. Two P2
findings, both about the evaluation plan:

1. Repeated legacy runs collide on `__01`. Fixed: section 4 says to keep each result directory
   and pass all of them to the report.
2. The positive keep scenario can end without testing writes, when turn 1 asks which film anchors
   it. Fixed: the rubric row makes that run's write sequence UNTESTED, pinned in
   `evaluation-m5.test.ts`, and section 4 requires one run per source in which the yes writes, or
   says the sequence is unverified there.

Codex ran recommend 263/263, vibes 162/162, plugin 37/37, the 60 focused TypeScript tests and
`git diff --check`, all clean.

**Codex code review 2 — READY**, with no findings: each legacy recording is kept, and a write
sequence that was never exercised is UNTESTED, with coverage required per source. The focused
tests are 60/60 and `git diff --check` is clean. Live behavior is unverified, as section 4 says.
