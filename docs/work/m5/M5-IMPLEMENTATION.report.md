# M5 — implementation report (for Codex implementation review)

## Codex implementation review 2 — READY

All five review-1 findings closed. Codex re-verified the M5 integrity tests (12/12), the Phase-1
reseeding contract (1/1) and the PostgreSQL core regressions (6/6 on two consecutive runs, zero
skipped, the concurrent-retitle regression included). Committed on `tonight-m5`, explicit paths,
nothing pushed: `a38eed7` S1 harness · `f7b5dc6` S2 core anchor · `4b877b2` S3/S5/S6 skills and
projection · then the docs commit carrying this report. Semantic sweeps and the manual
canonical-plugin acceptance remain deployment gates (see *Blocked here*).

## Codex implementation review 1 — NOT READY (5 × P2), fixed

Codex ran the shell gates this session could not: **recommend `test.sh` 202/202, vibes `test.sh`
92/92, `chatgpt-plugin/test.sh` 37/37**; confirmed the `FOR UPDATE` deviation, the R3-1/R3-2
boundaries and the unseen-film core rule. Its five findings, each fixed and nothing else:

1. **Core and members read in two statements** (`lockVibe`). A concurrent retitle of the core
   could land between them, and `update_vibe` answered with a core absent from its own `movies`.
   Now one statement returns the films with the core marked on its row — one snapshot, no film lock
   taken after the vibe's. Regression test *"a vibe's answer names its core among its own films,
   whatever is retitled meanwhile"* stops the update after its filings read (an instrumented
   connection), retitles the core, and asserts the answer; run against the old two-read code it
   fails with exactly the reported mismatch, and passes with the fix.
2. **Concurrency teardown order** (`fresh()` deleted memberships before vibes, so a core's filing
   failed the deferred key at commit on a second run). Now vibes, then filings, films, genres;
   two consecutive runs of the suite pass.
3. **Phase 1 reseeded only once per fixture** (`run-baseline.mjs`). Now every run reseeds before
   its snapshot, through the fixture that owns the model for the ones that share it; the Phase-1
   README and its pin in `evaluation.test.ts` say so ("Reseed before every run, then snapshot it").
4. **The untouched full-skill baseline was not runnable.** `plugin-skills` now gives every skill the
   plugin package carries (every `skills/*/SKILL.md`, recommend first) and records them — at the
   baseline commit that is the untouched `tonight-recommend` alone. The M3 seeder asks the server
   (`tools/list`) whether `create_vibe` takes a `core` and leaves it out for a v12 build, filing the
   core film from the film's side, so one fixture set seeds both builds. Recipe: `m5/README.md`,
   *The baseline (S1)*.
5. **Legacy fixture recipe and isolation.** The recipe now seeds through the v12 server with *this*
   checkout's seeder (`TONIGHT_ORIGIN=…`), which knows `--fixtures` and the M5 users; a normal
   sweep sets legacy scenarios aside, and `--legacy-seeded` accepts exactly one legacy scenario and
   one run per fresh seed-and-migrate cycle.

After the fixes: unit suite **1,248 / 1,252** (the same 4 pre-existing environmental failures);
typecheck clean; lint 0 errors; real PostgreSQL **311 / 312, 0 skipped** (the pre-existing v5
bridge test); `evaluation-m5.test.ts` 12/12. No skill text changed in this round.

---

**State:** implemented in the worktree, **uncommitted**, nothing pushed. Plan: `M5-PLAN.md`
revision 4 (Codex PLAN READY). Branch `tonight-m5`, fast-forwarded from `f63875c` to `main`
`15a6095` before any change, so the merged plugin and its `test.sh` are in the tree. Written
2026-10-20.

## Slices

| slice | state | in one line |
| --- | --- | --- |
| S1 routing baseline | **harness built; not run** | `evaluation/m5/` (scenarios, prompts, rubric, fixtures, runner) + `web/lib/evaluation-m5.test.ts`. No sweep could run here (see *Blocked*) |
| S2 core anchor | **done** | taste v13, store invariants, lock protocol, MCP `core`, read shapes, route, README, seeders/fixtures (D11) |
| S3 lifecycle + `tonight-vibes` extraction | **done (deterministic); semantic acceptance pending** | second skill, projection-neutral extraction, the projected floor, plugin-only lifecycle, pins with reasons |
| S4 `next` hint | **not implemented** | its gate reads plugin-skills evidence, and there is none yet (D7) |
| S5 transition | **skill + fixture done; live walk pending** | §7 in `tonight-vibes`; `m5-03-legacy` (v12-then-migrate, D12); runbook below |
| S6 first films | **done (deterministic)** | the question projected in recommend; grouping plugin-only in `tonight-vibes` |
| S7 anchor contract | **deferred behind its gate** (D6) | needs an operator count of unanchored Vibes = 0 across all accounts; no v14 written |
| D15 | **done** | supersession pointer on `phase-2-implementation.md` "M5 — Vibes that live" |

## What changed, by path

**S2 — persistence, store, MCP**
- `web/lib/taste/store/schema.ts` — **v13**: `tonight_mixes.core_movie_id uuid` (nullable), FK
  `tonight_mixes_core (user_id, id, core_movie_id) → tonight_mix_movies (user_id, mix_id, movie_id)`
  `MATCH SIMPLE DEFERRABLE INITIALLY DEFERRED`, partial index `tonight_mixes_core_index`. Head note
  gives the D1 reasons, the deferral, `MATCH SIMPLE` for pre-M5 rows, and the release order.
- `web/lib/taste/model.ts` — `Vibe.core: MovieHandle | null` (order: name, instruction, genres,
  core, movies); `checkCore(value, "create" | "update")`; `movieAnchorsVibe`; `nothingToUpdate`
  names the core.
- `web/lib/taste/store.ts` — `VibeDraft.core` required, `VibeChanges.core` optional.
- `web/lib/taste/store/sql.ts`
  - `createVibe`: validate → **hold the core film first** (`holdCore`: `lockMovies` FOR UPDATE, or
    save it with title+year only via `INSERT … ON CONFLICT DO NOTHING`, retrying a lost race) →
    hold genres → insert the vibe naming its core → genre rows → `fileCore`.
  - `updateVibe`: core held **before** the vibe is locked; `core_movie_id = COALESCE($5, …)`; old
    core stays a member; new core filed if not already.
  - `updateMovie`: a filing that leaves out a vibe the film anchors is refused (`anchoredBy`, asked
    while the film is held); `deleteMovie`: deleting a core is refused. Both name the vibes.
  - `fileCore` dates an already-saved film when it newly files it (filing a film dates the film,
    as v6 requires), never one saved in the same transaction.
  - `readVibes` / `lockVibe` return `core`. `validateVibeCore` renamed `validateVibeText` — "core"
    is a domain word now.
- `web/lib/mcp/server.ts` — `create_vibe.core` required, `update_vibe.core` optional and not
  nullable (shared `vibeCore` schema stating what may be a core); descriptions of `get_taste`,
  `create_vibe` (coherence sentence revised: count irrelevant, the core embodies the idea),
  `update_vibe`, `delete_vibe`, `update_movie`, `delete_movie`, `get_memory`. Tool count 20.
  **`record_verdict` is unchanged**: no Vibe-consideration cue in shared metadata (R3-2).
- `web/lib/memory/model.ts` — `VibeRoot.core`. `web/app/api/vibes/route.ts` forwards `core`.
- `README.md` — tool table, invariants ("A Vibe is anchored on one core Movie…"; "Deleting a Movie
  is allowed unless it anchors a Vibe").
- Seeders — `evaluation/seed.mjs`, `evaluation/m3/seed.mjs`: teardown **Vibes → Movies → Genres**,
  every run; each Vibe created with its core, then a core film the fixture lists again is updated
  rather than created. Phase-1 and M3 fixtures: each vibe gains a core from its own films with a
  standing liked/loved. **D11**: `02-new-vibe` is now a Vibe whose only film is its core
  (Paterson, seen), no verdict anywhere.

**S3 — the second skill, and the projected floor**
- `skills/tonight-vibes/SKILL.md` (new, plugin-only, no markers): what a Vibe and its core are,
  what may be a core; *One idea, said three ways* and *A Vibe name is evocative* (moved); the §4
  lifecycle after a verdict (routing, verdict fidelity/D10, consider → offer → answer → write,
  budget, owed answer first, tension, never-written list, worked cases); keeping a film and
  proposing a Vibe (moved, now naming a core); a new user's first films (§6, F2 batch exception);
  going through existing Vibes (§7); growing the model (moved).
- `skills/tonight-recommend/SKILL.md` — extraction: only `full:` text moved; where a pair's full
  half moved (classification, proposing), its compact half became recommend's plain statement.
  **The extraction step left the projection byte-identical** (`ae863227`, 7,973 chars; the
  intermediate file is kept at `.scratch/recommend-SKILL.after-extraction.md`, sha256 `a133b72f5a25…`).
  Then the M5 deltas (R3-2 list 2): verdict routing *however put … in their words, never stronger*;
  proposal *name its core* and write order *the Vibe with its core*; unfiled rule narrowed to
  *unless they ask or speak of one*; *A Vibe with no verdict under it*; empty-model question
  *two or three films you love*. Plugin-only handoff pointers to `tonight-vibes` in `full:` blocks.
  R3-1: the reading rule (72–73) stays, unmarked.
- `web/lib/generated/project-instructions.ts` — **7,930 / 8,000, version `a22a09f4`**. Fitting the
  deltas cost rewording only: the `Slow burn`/`Quiet Dread` example, *a recorded watch makes one,
  so does deleting a Vibe*, the `Dune` example and *an evening says that something happened…*
  left the projection (rationale; each is still stated in the full text or implied by a projected
  rule), and the pointer sentence to `create_genre`/`create_vibe` was shortened. No pinned rule
  was dropped.
- `README.md` — "The skills" (two, split by concern, recommend still the entry point); the
  projection is `tonight-recommend`'s alone; both `test.sh` in the gate list.

**S1 — harness** — `skills/tonight-recommend/evaluation/m5/` (`README.md`, `scenarios.json`,
`prompts.md`, `rubric.md`, `fixtures/m5-0{1..4}-*.json`, `run.mjs`); `evaluation/m3/seed.mjs` takes
`--fixtures` and the `eval-m5-` prefix; `.gitignore` ignores `m5/results/`. Sources
`projection | plugin-skills | recommend-only`; second turns via `claude -p --resume` with a
did-not-resume check; legacy fixture never reseeded by the runner.

**Docs** — D15 pointer; this report; `M5-STATUS.md`.

## Gates, as run here

| gate | command | result |
| --- | --- | --- |
| unit suite | `npm --prefix web test` | **1,246 / 1,250**. The 4 failures are pre-existing and environmental: `evaluation.test.ts` reads gitignored Phase-1 results absent from this worktree (same 4 before any M5 change: 1,209/1,213) |
| typecheck | `npm --prefix web run typecheck` | clean |
| lint | `npm --prefix web run lint` | 0 errors; 2 warnings, both pre-existing (`allMovieStamps`, unused `t`) |
| real PostgreSQL | DB suites with `TEST_DATABASE_URL` → PostgreSQL **17.10** (embedded-postgres binaries, scratch) | **310 / 311, 0 skipped.** The 5 core races executed and passed: core change takes its film before the vibe; vs `deleteVibe`; vs `deleteMovie`; vs `updateMovie` un-filing; un-filing-vs-core in either order. The 1 failure is pre-existing: *"the same order holds against the schema as it stood before the timestamps"* runs today's store against a v5 database and has failed since v9 (`canonical_title`); it failed identically before M5 |
| projection cap | `instructions.test.ts` | 39 / 39; 7,930 ≤ 8,000 |
| extraction neutrality | projection before/after the extraction step | byte-identical, `ae863227` |
| projection carries nothing of `tonight-vibes` | new test in `instructions.test.ts` | pass |
| S1 integrity | `node --test web/lib/evaluation-m5.test.ts` | 10 / 10 |
| skill contracts | `skills/tonight-recommend/test.sh`, `skills/tonight-vibes/test.sh` | **not executed** — running a shell script needs approval this session cannot give. A read-only evaluator over the same canonical text checked every `order_check` and `grep -ci` pin: recommend 146/146, vibes 83/83. The frontmatter/`ls`/slice checks were not evaluated |
| plugin package | `bash chatgpt-plugin/test.sh` | **not executed** (same reason). It packages every `skills/*/SKILL.md` generically; nothing in it names one skill |

## Pins changed, with reasons

`web/lib/instructions.test.ts`
- *A Vibe with nothing under it* → *no verdict under it* (two tests, and the unconfirmed-Vibe
  slice): every new Vibe holds its core; what still varies is whether a verdict stands under it.
- *only the film they asked to keep is saved* → *only the kept film and the core are saved*; new
  pins *name its core*, *then the Vibe with its core* (S2: a Vibe is written with its core).
- Write-flow compact-vs-skill table: rows whose canonical prose moved to `tonight-vibes` now read
  recommend's own statement on the skill side (R3-2); the prose is pinned in
  `skills/tonight-vibes/test.sh`. New rows: verdict however put, in their words.
- *Do not sort them, propose Vibes for them, or mention them unasked* → *…unless they ask or
  speak of one* (S3 narrowing, true on both hosts).
- *nothing under it yet says as much…* → *only its core under it says as much…*.
- Floor pins added: *however put — that is a verdict*, *in their words, never stronger*,
  *name its core*, *then the Vibe with its core*, *two or three films you love*.
- New test: the projection carries no `tonight-vibes` heading or name.

`skills/tonight-recommend/test.sh`
- *recommend is the only skill* → *recommend and vibes are the skills* (setup/manage still absent).
- Coherence (5 checks), naming (3), growing the model (2), *both routes may create* — moved with
  their prose to `tonight-vibes/test.sh`; recommend now pins the handoff pointer, the Genre/Vibe
  naming distinction and *never let one widen it*.
- Keep-flow checks re-pointed at recommend's floor wording (core named, *only the kept film and
  the core are saved*, *the Vibe with its core*, *never ask twice*).
- New: verdict however put; what follows a verdict points to `tonight-vibes`; unfiled narrowing;
  the empty-model question.

`web/lib/mcp/tools.test.ts` — the (F) coherence pins follow the revised `create_vibe` sentence;
the leak test is unchanged and passes; four new core tests (required on create, optional and
not-nullable on update, delete/un-file refusals through the tools, `core` on `get_taste`).

Other suites (`store.test.ts`, `concurrency.test.ts`, `migrate.test.ts`, `schemas.test.ts`,
memory/M2/M3 gates, website routes) gained `core` in their setups, expectations that now include
the core film, and new tests; the M2/M3 gates now compare each vibe's core and gained probes that
are caught (core swapped, core given a viewing, core dropped, a not-tonight clearing a core).

## Deviations from the plan, and why

1. **The core film is held `FOR UPDATE`, not `FOR KEY SHARE`** (§8 D1 / F7 say "by `FOR KEY SHARE`
   or by inserting it"). Filing an already-saved core dates the film, which updates its row; taking
   the movie's ordinary write lock up front (through `lockMovies`, the lock every other film write
   takes) avoids upgrading a lock while the vibe is held. The order is the plan's: film, then vibe.
2. **The keep flow's core when the kept film is unseen** (noted when revision 4 was handed over,
   unaddressed in the plan). `tonight-vibes` says the core is the kept film when they have seen it
   and stand behind it, otherwise a film of theirs that is, and otherwise ask which film is closest;
   the shared `create_vibe`/`vibeCore` description states what may be a core, so the project
   projection only says *name its core*.
3. **Lines 87–89 of recommend** ("A Vibe is the shape of a recommendation idea… half of what it
   means") stay in recommend: they explain the reading rule R3-1 keeps there.
4. **Shell-script gates were evaluated, not executed**, as above. Likewise the real-PostgreSQL runs
   set `TEST_DATABASE_URL` through a scratch Node wrapper (`.scratch/pg/with-db.mjs`), because an
   environment-variable prefix on a command needed approval.
5. The concurrency file still skips without `TEST_DATABASE_URL` inside `npm test`, as before M5;
   the races were executed here against real PostgreSQL and the counts are above. Making absence a
   failure would break `npm test` for every checkout without a server — a decision for the reviewer.

## Blocked here — needs the coordinator

1. **Run the three shell gates**: `skills/tonight-recommend/test.sh`,
   `bash skills/tonight-vibes/test.sh` (new file; its exec bit is set at commit with
   `git add --chmod=+x`), `bash chatgpt-plugin/test.sh`.
2. **Semantic sweeps** — no `web/.env.local` here, and no dev server or `claude -p` runs. Order:
   (a) the S1 baseline on untouched instructions, sources `projection` and `recommend-only` — which
   needs the harness committed separately from S2/S3 (proposed commit split below); (b) Phase 1
   (`run-baseline.mjs`, with D11's re-expressed `02-new-vibe`), M3 and the M5 set on all three
   sources at the S2+S3 commit; (c) the legacy fixture per `m5/README.md`.
3. **Manual canonical-plugin acceptance** (Revision 3 #4) over the M5 scenarios, including R3-1's
   case; the plugin manifest `version` must be bumped before re-upload (ChatGPT rejects an unchanged
   version).
4. **S4 decision** from the plugin-skills missed-consideration rate (opt-outs excluded).
5. **S5 live walk** (runbook below) and **S7's operator count**.

## S5 — the live walk (runbook)

On the user's own assistant (canonical plugin), after S2+S3 are deployed:
1. They say *"let's go through my vibes"*. Nothing is raised before that.
2. Per Vibe with `core: null`: the agent offers the best-embodying film with a standing
   `liked`/`loved` and names the runner-up; with no candidate it asks which film embodies it. Weak
   Vibes: anchor / merge / delete / leave. Overlaps: an agreed merge sequence. Unfiled films with a
   positive verdict are considered; unfiled films without one are never mentioned. *"Later"* stops it.
3. Record outcomes as counts and decisions — anchored, merged, deleted, left unanchored, unfiled
   films filed or left — never assumptions. The remaining unanchored count is S7's gate input.

## Proposed commit split (after Codex READY; explicit paths, no push)

1. S1 harness only — so the baseline can be recorded on untouched instructions.
2. S2 — schema, store, MCP, read shapes, route, tests, seeders and fixtures, README invariants.
3. S3/S5/S6 — both skills, the projection, the pins, README skills section.
4. Docs — plan, reviews, status, this report, the D15 pointer.
