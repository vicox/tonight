# M6 — implementation report (for Codex implementation review)

## Codex implementation review 1 — NOT READY (one blocker), fixed

Codex ran the gates this session could not:
- `skills/tonight-recommend/test.sh` **207 / 207**;
- `skills/tonight-vibes/test.sh` **100 / 100**;
- `chatgpt-plugin/test.sh` **37 / 37**, with the 1.3.0 ZIP built;
- the M6 runner `--dry-run` on all three sources;
- the targeted tests at 218 / 218, and typecheck.

**The blocker.** The projected D4 said only *"taste read, no mood"*. A read that succeeds on an
empty model meets that condition, so the empty model got a mood-question licence competing with
its first-films question. The full skill already said *"read and not empty"*.

**Fixed:**
- D4 now reads *"taste read, not empty, no mood: a surprise lead, never called their mood; the
  question may ask it"*.
- The test asserts the whole precondition on both surfaces: the projected clause before its colon
  carries both *read* and *not empty*, and the skill keeps *"With their model read and not empty"*.
- To stay within the cap, D1's *"stop suggesting it" included* became *"stop suggesting it" too*.
- The projection is **7,999 / 8,000, version `410eb470`**. The empty-model clause, the failure
  branches and the shape are still byte-identical with `a22a09f4`.
- After the fix: unit 1,265 / 1,269 (the same 4 environmental), `instructions.test.ts` 42 / 42, and
  the evaluator 176 / 176 on recommend. No canonical text changed, only the compact block.

---

**State:** implemented and committed on `tonight-m6`, fast-forwarded to `origin/main` `2cdc336`
(PR #4) before any change. Explicit paths, nothing pushed. Written 2026-10-21.

| commit | what |
| --- | --- |
| `b9cb8a3` | **Harness** — the M6 set, `--set`, `--today` / `@today`, `evaluation-m6.test.ts`, `.gitignore`. Instructions and server untouched: the M6 baseline is recorded here |
| `aa2514f` | **Store** — the unseen-core guard, its precondition sentences in `vibeCore` and `update_movie`, and the tests |
| `86af75a` | **Instructions** — both skills, the projection, the verdict, occasion and `get_taste` descriptions, the pins, plugin `1.3.0`, README |
| docs | this report, `M6-STATUS.md`, the plan (`PLAN.md`, revision 2, Codex PLAN READY) |

## Step 0

`git merge --ff-only origin/main` → `2cdc336`, with the untracked plan preserved. Projection
re-verified at 7,930 / `a22a09f4`. `chatgpt-plugin/test.sh` could not be executed (see *Gates*).

## What changed, by path

**The store** (`aa2514f`, PLAN §2.2)
- `web/lib/taste/model.ts`:
  - `coreUnseen(title, year)`, whose sentence makes the viewing change conditional on their word;
  - a third verb `"unsee"` for `movieAnchorsVibe`;
  - the `Vibe.core` comment says the store now checks one fact this root holds.
- `web/lib/taste/store/sql.ts`:
  - **`holdCore`** refuses a held film whose raw `viewing` is `unseen`, before the Vibe is
    locked. This covers both `create_vibe` and `update_vibe(core)`.
  - **`updateMovie`** refuses a change to `unseen` on a film that anchors a Vibe, asked through
    `anchoredBy` while the film is held. A film already `unseen` and a clear to `null` are not
    refused.
  - **No SQL text changed** and no lock was added: both checks read rows the existing
    `FOR UPDATE` already holds.
- `web/lib/mcp/server.ts`: `vibeCore` gains *"Refused when the saved film's viewing is `unseen` — a
  liked or loved does not override it, and a viewing is changed only on their word, never to get
  past this. A film with no viewing (null) is accepted."*; `update_movie` gains *"nor marked unseen
  while it is a core"*.
- No schema change, no new tool (20), and `SERVER_VERSION` is unchanged.

**The instructions** (`86af75a`, PLAN §2.1, §2.2, §2.3)
- `web/lib/mcp/server.ts`:
  - `verdictOccasion`: a new `not-tonight` is today's date `YYYY-MM-DD`; read or withdraw passes
    the occasion **as recorded**.
  - `record_verdict`: record the reach their words give, never ask to widen it, and an unclear
    turn-down is `not-tonight`. Its `reach` argument maps *not interested / stop suggesting it /
    don't recommend it again* → `not-ever`, and says a refusal is never `disliked`.
  - `get_taste`: a `not-tonight` dated today binds tonight, and any other occasion is another
    evening's.
  - **Nothing validates the occasion format.**
- `skills/tonight-recommend/SKILL.md`, full text:
  - routing worked rows;
  - *within its reach a refused film is not offered again*, and the refusal is not raised;
  - *being in a Vibe is no opinion*, and a film new to them there is a candidate;
  - the moodless paragraph (*say it is a surprise*, never their mood, no Vibe dump; the empty model
    and a failed read are their own cases);
  - the history sentence narrowed by the refusal's reach.
- **Projected, D1–D4:**
  - D1: *"stop suggesting it" too* (was *included* until review 1), after the pinned *that is a verdict: `record_verdict`, in
    their words, never stronger*.
  - D2: *can come back unless a refusal reaches today*.
  - D3: *…a fact about watching, and being in a Vibe none*.
  - D4: *taste read, not empty, no mood: a surprise lead, never called their mood; the question may ask it* (*not empty* restored in review 1),
    inside the *never instead* sentence and ahead of the empty-model clause.
- `skills/tonight-vibes/SKILL.md`, plugin-only:
  - *What may be a core* gains the guard, the `null` nuance, the no-override and no-bypass rules,
    and the contradiction case (ask once; on a yes, `seen` and then anchor; on a no, nothing);
  - *How it sounds* gains a *stop suggesting it* row, and the `not-tonight` row gets today's date;
  - *Going through*, item 1: a core that reads `unseen` is re-anchored like a missing one.
- `web/lib/generated/project-instructions.ts`: **7,999 / 8,000, version `410eb470`** (7,993 /
  `fd2c3519` before review 1).
- `chatgpt-plugin/.codex-plugin/plugin.json`: `1.2.0` → `1.3.0` **and nothing else**.
  `git diff 2cdc336 -- chatgpt-plugin/.codex-plugin/plugin.json` shows the version line only, so
  PR #4's `shortDescription` and `longDescription` are byte-for-byte.
- `README.md`: the invariant *"A core is never a film whose saved viewing says unseen"*.

**The harness** (`b9cb8a3`, PLAN §5.2)
- `evaluation/m6/`: `README.md`, `scenarios.json` (11 scenarios, 10 families, each with its gate),
  `prompts.md` (every refusal names the film with its year), `rubric.md` (required outcomes per
  family, the twelve inadmissible outcomes, the gate, void runs), and five fixtures:
  - `m6-01`: The Nice Guys is the obvious lead and absent;
  - `m6-02`: a standing `not-ever`;
  - `m6-03`: `@today`, `2026-01-15` and legacy `evening-tuesday`;
  - `m6-04`: Heat raw `unseen`, plus the Collateral contradiction;
  - `m6-05`: 50 Vibes over 12 Genres, generated from one table, every core seen and loved or
    liked.
- `evaluation/m5/run.mjs`: `--set m5|m6`, default `m5`. The runner fixes `D` once at the start of
  each run and passes it to the seeder (`--today`). It appends `Today's date is D.` on `m6` only,
  voids a run whose date changed by its end, and records `today` and `side` in the artifact. All
  of M5's pinned lines are byte-identical.
- `evaluation/m3/seed.mjs`: accepts `eval-m6-` users, alongside the M3/M5 pattern, left unedited.
  It resolves `@today` from `--today` in occasions only, and refuses rather than guesses when the
  date is missing.

## Gates, as run here

| gate | command | result |
| --- | --- | --- |
| unit suite | `npm --prefix web test` | **1,265 / 1,269**. The 4 failures are the known environmental ones (`evaluation.test.ts` reads gitignored Phase 1 results absent here). It was 1,248 / 1,252 at `2cdc336` before any change, with the same 4 |
| typecheck | `npm run typecheck` | clean |
| lint | `npm run lint` | 0 errors; the same 2 pre-existing warnings M5 recorded |
| real PostgreSQL 17.10 | the four DB suites with `TEST_DATABASE_URL` (scratch embedded server, through a scratch wrapper) | **319 / 320, 0 skipped**. The two new races executed and passed: *a film being made a core cannot be marked unseen underneath it*, and *whichever of marking a film unseen and anchoring on it wins, no core is unseen*. The new store tests pass on both drivers. The 1 failure is the pre-existing v5 bridge test: today's `lockMovies` selects `viewing` against a v5 schema. M6 changes no SQL text (diff in the review thread) |
| projection | `instructions.test.ts` | **42 / 42**; 7,999 ≤ 8,000 after review 1. R1's test is unchanged and passes. Byte-identity with `a22a09f4` is pinned for the empty-model clause, both failure branches and the shape |
| tools | `tools.test.ts` | 31 / 31 before the two new tests, and green after, in the full suite. The leak and cross-tool tests are unchanged |
| integrity | `evaluation-m6.test.ts`, `evaluation-m5.test.ts` | 8 / 8 and 12 / 12. The M5 file is unchanged |
| skill contracts | `skills/*/test.sh` | **not executed**: a shell script needs approval this session cannot give. A read-only evaluator over the same canonical text (`order_check`, `grep -c` on `$SKILL`/`$CANONICAL`, `in_slice`/`slice_of`, exactly as the scripts define them) gives **recommend 176 / 176** evaluated and **vibes 94 / 94** evaluated, new M6 checks included. It does not evaluate 31 and 6 checks respectively: frontmatter, `ls`, `sed` and variable-driven slices over text M6 did not touch. A negative control (a pinned phrase removed from a copy) failed as it should |
| plugin package | `bash chatgpt-plugin/test.sh`, `build.sh` | **not executed** (same reason). `build.sh` copies the manifest and every `skills/*/SKILL.md` generically, and names no skill |
| runner `--dry-run` | `m5/run.mjs --set m6 … --dry-run` | **not executed**: the runner shells out to `claude --version`, and `claude` needs approval here |

## Deviations from the plan, and why

1. **The host-date check (§5.2) was not run.** It needs `claude -p`. The runner therefore always
   tells the agent `D` on `--set m6`, and voids any run whose local date changed between start and
   end. That is the plan's void rule applied to both branches: if the CLI also supplies a date, it
   equals `D` except across midnight, and those runs are void.
2. **Shell gates were evaluated, not executed.** Real PostgreSQL went through a scratch Node wrapper
   that sets `TEST_DATABASE_URL`, because an environment prefix needs approval. Both are as M5.
3. **`updateMovie`'s unseen check runs after the filing check**, so that a call that both un-files a
   core and marks it unseen keeps M5's pinned un-filing refusal
   (`tools.test.ts`, *"Refused whole: the viewing sent with the un-filing does not land either"*).
4. **The website test fixture `withFilm` changed.** Its marked film was the Vibe's core, and the
   tests mark it `unseen`, which the guard now refuses. The Vibe is now anchored on `Moon`, and
   Arrival is an ordinary member, so the marks test what they always tested. A new test covers
   marking the core unseen through `PATCH /api/movies`.
5. **Two races instead of one** (§5.1): the deterministic order and the either-order case, in the
   existing pattern.
6. **The projection budget.** The four deltas cost 221 characters, and the cap left 70.
   - Fitted by tightening D3/D4, then by three rewordings, each a full/compact pair whose full half
     keeps the original words, so the canonical text and `test.sh` see no change:
     - the intro drops *"Requests about the model are yours too"*, which *Asked about the model
       directly — do those* states;
     - *"No catalogue, no lookup"*, which the next bullet states;
     - *"and for putting any of it right"*, which `get_memory`'s *"the handle you correct"* owns,
       together with *"changing what something means unasked is off-limits"* → *"a new meaning is
       theirs to ask for"*.
   - No pin was changed or removed to fit.

## Blocked here — the coordinator

1. **Run the shell gates:** `bash skills/tonight-recommend/test.sh`,
   `bash skills/tonight-vibes/test.sh`, `bash chatgpt-plugin/test.sh`, and
   `bash chatgpt-plugin/build.sh` for the 1.3.0 package.
2. **Before deploy, the production data check (PLAN §7)**, read-only:

   ```sql
   SELECT count(*) AS unseen_cores, count(DISTINCT x.user_id) AS accounts
     FROM tonight_mixes x
     JOIN tonight_movies m ON m.user_id = x.user_id AND m.id = x.core_movie_id
    WHERE m.viewing = 'unseen';
   ```

   0 means nothing to do. More than 0 is safe to deploy: record the count, and re-anchor only in
   conversation.
3. **The semantic sweeps.** They need `web/.env.local`, the dev server and `claude -p`.
   - **Baseline at `b9cb8a3`:** `m5/run.mjs --set m6` on `projection` and `plugin-skills`. M5's own
     post-change sweep can run on this same commit (instructions `a22a09f4`).
   - **Fix the threshold** for G3/U1/U3/M1 before the post-change run.
   - **At `86af75a`:**
     - the M6 set on every source its families list;
     - **the M5 set on all three sources** as the final-instruction regression, at zero of M5's
       ten outcomes;
     - Phase 1 and M3 on the projection, with `01-empty` and `07`/`08` scored as the moodless
       rule's regression cases.
4. **The manual canonical-plugin pass** on the 1.3.0 upload (iOS): the M6 families, a sample of M5,
   and the listing showing PR #4's copy.

Until 3 and 4 have run, M6 is **"deterministic done, semantic pending"**, never "accepted". M5's
own gates (S1 baseline at `a38eed7`, its acceptance, S4, the S5 walk, the S7 count) stay open, and
M6 closes none of them.
