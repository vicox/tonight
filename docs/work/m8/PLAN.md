# M8 — Verdict Simplification: plan

Status: **implemented; Codex code review READY.** Release — pre-flight, migration, deploy — awaits
the user's instruction.

## Requirements (user-approved)

- **R1** A Verdict is a liked / loved / disliked judgement and nothing else. Remove `not-ever` and
  `not-tonight` from the model, MCP, UI, recommendation, docs and plugin skills.
- **R2** Convert existing `not-ever` to `Movie.viewing = dont-want-to-see`, then remove rejection
  acts. `not-tonight` acts are deleted (no History feature). Never invent a Movie for an absent one.
  (The user already deleted the orphan verdicts *The Dry* and *The Nice Guys* via MCP.)
- **R3** Deleting a Movie deletes **all** its verdict acts — current, superseded, withdrawn —
  atomically.
- Recommendation exclusion only through `viewing = dont-want-to-see`; refusal phrases route there.

## Status of the existing, unapproved changes

All uncommitted. Implementation stopped on user instruction.

- **Core draft (mine, unreviewed):** `verdicts/model.ts`, `verdicts/store.ts`, `verdicts/store/sql.ts`,
  `verdicts/store/schema.ts` (v3), `db/migrate.ts` (bounded needs), `taste/store.ts`,
  `taste/store/sql.ts` (deleteMovie), `taste/store/schema.ts` (doc only), `mcp/server.ts`,
  `memory/model.ts`, `seen.ts`, `app/api/verdicts/route.ts`, `web/judgements.ts`,
  `web/movie-summary.ts`. All source typechecks.
- **Partial test edits (mine):** `db/migrate.test.ts` — verdicts-v2 slice, two v11 tests rewritten to
  read raw rows, `versions()` helper. The new v3 tests are **not** written yet.
- **Partial, unreviewed edits left by stopped sub-agents:** `verdicts/model.test.ts`,
  `verdicts/store.test.ts`, `verdicts/evaluation/gates.ts`, `verdicts/evaluation/trajectories.ts`.
  Skills, README, legal pages and the plugin manifest are untouched.
- **Last full run** (core draft only): 51 failing, plus 2 files failing at import. Not re-run since.
  Baseline `main`: 1271 tests, 4 pre-existing failures (`lib/evaluation.test.ts` reads the gitignored
  `skills/tonight-recommend/evaluation/results/`, absent in worktrees).
- **Proposal:** keep the core draft and conform it to the approved plan; finish the partial test
  edits myself, without sub-agents. Alternatively revert to `HEAD` and restart clean.

## Interfaces

- **verdicts/model.** `Assertion = { about: "judgement"; judgement; because }` — `about` stays so stored
  and returned shapes, and `record_verdict`'s `said`, are unchanged. `Scope = "everywhere"`: the facet
  stays as a one-value literal, like `claimant`, so an act's shape is unchanged; any other scope is
  refused. Removed: `REACHES` / `Reach` / `Rejection`, `MAX_OCCASION_LENGTH`, `checkScopeFor`.
  `current(acts)` and `supersession(acts)` are single-layer. `Standing = { title, year, judgement,
  because?, told }`. New export `NOT_A_VERDICT`: the refusal text, routing to dont-want-to-see / not
  recorded. A rejection-shaped assertion is refused with it.
- **VerdictStore.** Interface unchanged. `say()` no longer writes `occasion` / `reach` / `reason`;
  `assemble()` refuses `about <> 'judgement'` and a non-null `occasion` — loudly, never widened.
- **TasteStore.deleteMovie.** Signature unchanged; behaviour adds R3.
- **MCP.** `record_verdict.said = { about: literal "judgement" (custom error NOT_A_VERDICT), judgement,
  because? }`. `occasion` removed from `record_verdict`, `withdraw_verdict`, `get_verdicts`.
  **Obsolete arguments are refused, never stripped** *(review 1, blocking #1)*: the input objects of
  those three tools, and `record_verdict.said`, are strict — an unknown key such as `occasion`,
  `reach` or `reason` fails validation with a message saying evenings and refusals are no longer
  recorded (and where a refusal goes instead). An ordinary Zod object would silently drop `occasion`,
  turning an old client's evening-only `withdraw_verdict` into a global withdrawal. Proven by
  protocol-level tests (below), not by schema inspection alone.
  Descriptions: the viewing routes *"don't recommend it again"*, *"stop suggesting it"*, *"not
  interested"*, *"never again"* → `dont-want-to-see` via `create_movie` / `update_movie`; *"not
  tonight"*, *"not in the mood"* → nothing written; a turn-down is never `disliked`. `get_taste` loses
  its rejection/occasion paragraphs and keeps "dont-want-to-see is never recommended". `delete_movie`
  says every verdict about the film goes with it, and that "only don't recommend it" is
  dont-want-to-see instead.
- **Web.** `/api/verdicts` drops its occasion filter and rejection message; comments in
  `judgements.ts` / `movie-summary.ts`; privacy and terms text.

## Migration — verdicts v3 (`needs` taste v14), one transaction

Steps 1–4 are one **read-only classifier**, `classifyRefusals(tx)` → `{ convert, unsaved, cores,
ambiguous }`, shared by the migration and the pre-flight command (see Release) so both apply exactly
the same identity, ordering and ambiguity rules *(review 1, blocking #2)*. The migration refuses if
`unsaved`, `cores` or `ambiguous` is non-empty, and otherwise performs steps 5–7.

1. Read global acts (`occasion IS NULL`), grouped per user by `filmKey`, ordered by `said_at` then
   `seq` (NULL before non-NULL at an equal instant) — the model's own rule. If the latest instant holds
   more than one act and none has a `seq`, refuse: `seq` predates every verdict write path, so none is
   expected.
2. **Current not-ever** = the latest global act is a verdict with `reach = 'not-ever'`. A superseded or
   withdrawn not-ever moves nothing.
3. Match the Movie by `(user_id, canonical_title = canonicalTitle(title), year)`.
4. **Orphans and cores.** If any current not-ever has no Movie, or its Movie is a vibe's core (the store
   forbids a core that is not `seen`), throw naming each `user_id`, `title (year)` (and the vibes) —
   `user_id` so identical titles across accounts are actionable; operator-facing only. Nothing is
   changed and the version is not recorded. The operator resolves each with the previous build — save
   it as dont-want-to-see, forget the verdict, or give the vibe another core — and reruns. No invented
   Movie, no silent drop.
5. `UPDATE viewing = 'dont-want-to-see'`, whatever it was (`seen` included), with the `written_at`
   trigger disabled so stamps do not move (precedent: taste v10, v14).
6. `DELETE` acts `WHERE about = 'rejection' OR occasion IS NOT NULL` — every not-ever including history,
   every not-tonight, every evening-scoped withdrawal.
7. `ADD CHECK (about IS NULL OR about = 'judgement')` and `CHECK (occasion IS NULL)`. The `occasion`,
   `reach` and `reason` columns stay, always NULL — no `DROP`, which avoids recreating the composite
   constraints and lets the previous build still read. A later contract migration may drop them.

Semantic consequences, flagged for approval:

- **(a)** A judgement followed by a current not-ever: the earlier judgement becomes current again, and
  the film becomes dont-want-to-see. A refusal was never an opinion; this is the literal
  convert-then-delete.
- **(b)** A `seen` film with a current not-ever becomes dont-want-to-see; the seen fact is lost.
- **(c)** A global withdrawal that followed a deleted not-ever stays; the current answer is unchanged.
  So `judgement → not-ever → withdrawal` leaves **no** current judgement and does not change the
  viewing, whereas `judgement → not-ever` (current) restores the judgement and sets dont-want-to-see.

## Migration ordering

- **Loop risk.** Taste v11 already `needs` verdicts v2, and `satisfyNeeds` migrates the **whole**
  needed module — so verdicts v3 needing taste v14 would recurse forever.
- **Fix.** `migrate(driver, schema, through?)`: `satisfyNeeds` migrates a needed module only through
  the version it names. There is no version-level cycle (taste v11 → verdicts v2; verdicts v3 →
  taste v14).
- **`npm run db:migrate`** (ALL_SCHEMAS order: oauth, web, taste, episodes, verdicts, retired).
  Production (taste 14, verdicts 2): taste is a no-op, then verdicts v3 runs. Fresh: taste 1–14 (v11
  pulls verdicts 1–2), then verdicts v3. Verdicts-first also converges. Development store openers: the
  taste store brings verdicts to v2, the verdict store brings v3.
- **Alternative considered:** the conversion as taste v15 (needs verdicts v2, no engine change).
  Rejected because the verdict table's constraints would then live in the taste module.

## Cascade deletion (R3)

- In the taste store's `deleteMovie`, in the same transaction, after the Movie row is locked, the core
  check passes and its `DELETE` succeeds: `SELECT id, title, year FROM tonight_verdict_acts WHERE
  user_id = $1 AND year = $2`, keep acts whose `filmKey` equals the stored movie's, then `DELETE …
  WHERE user_id = $1 AND id = ANY($2::uuid[])`.
- A refused deletion (not found, or a core) deletes nothing.
- No foreign key is possible: a verdict names its film as text, and verdicts may exist without a Movie.
- A `record_verdict` committing between the read and the commit survives — it linearises as said after
  the deletion, which is allowed.
- `forget_verdict` / `withdraw_verdict` still never touch Movies.
- Known pre-existing limitation, out of scope: retitling a Movie does not rename its verdicts.

## Tests (focused)

- **migrate.test** — slice verdicts to v2 where taste is held back; v11 rejection tests read raw rows;
  fresh-database-any-order asserts verdicts `[1, 2, 3]`; bounded-need test (taste alone → verdicts
  `[1, 2]`); the existing idempotence and concurrent-start tests kept alongside. v3: conversion
  including an alternate spelling, another user's isolation and unchanged stamps; `judgement →
  not-ever` (current) restores the judgement and sets dont-want-to-see; `not-ever → judgement` and
  `judgement → not-ever → withdrawal` change no viewing, the latter leaving no current judgement;
  not-tonight and evening withdrawals removed with the global answer unchanged; orphan refusal (no
  change, unrecorded, message names user and film); core refusal; post-v3 CHECKs reject rejection and
  occasion rows; NULL-seq tie refusal.
- **Pre-flight / classifier** — on one fixture the pre-flight report and the migration's decision agree,
  including an older refusal under `"Black   Bag"` followed by a judgement under `"Black Bag"` (one
  film, no current refusal); the pre-flight writes nothing (row counts and `schema_migrations`
  unchanged) and runs in a read-only transaction.
- **schemas.test** — production-like upgrade from the M7 state (taste 14, verdicts 2, with not-ever,
  not-tonight and judgement rows) through ALL_SCHEMAS in CLI order; existing expectation → verdicts
  `[1, 2, 3]`.
- **taste/store.test** — `deleteMovie` removes current, superseded and withdrawal acts including an
  alternate spelling; keeps another year, film and user; a refused (core) deletion keeps the acts;
  **failure injection** after the Movie `DELETE` (a wrapped driver fails the verdict `DELETE`) rolls
  back whole — Movie, filings and verdicts all still there; **late insertion** — an act written after
  the verdict read survives, everything read is gone.
- **verdicts model/store tests** — drop rejection/occasion cases; add `NOT_A_VERDICT` and scope
  refusals.
- **MCP tests** (through the protocol, not by calling handlers) — rejection refused with the routing
  text; `withdraw_verdict` / `get_verdicts` / `record_verdict` called with `occasion` (and `said` with
  `reach` / `reason`) are refused as errors **and the history is unchanged** — in particular a standing
  global judgement survives an old client's evening-scoped withdrawal; no `occasion` in the advertised
  schemas; `delete_movie` forgets the history (`get_verdicts` empty) and leaves other films;
  description pins for the routing.
- **memory/model, web movie-summary/routes, taste/model.test** — adjusted.
- **In-repo M2/M3 evaluation harnesses** (`web/lib/verdicts|memory/evaluation`) — remove the
  not-tonight/not-ever trajectories and gates and the occasion plumbing; keep the "no generalisation"
  proof through a `disliked` verdict.
- **Skills contract tests** (`skills/*/test.sh`, `recommend-skill.test.ts`, `disclosures.test.ts`) —
  updated to the new text.
- **Historical skill evaluation suites** (`skills/tonight-recommend/evaluation/**`, M3/M5/M6 fixtures and
  rubrics) — untouched as recorded evidence and not shipped (the plugin bundles `SKILL.md` only).
  m6-02 / m6-03 can no longer be seeded: noted, not fixed.

## Docs and skills

- `tonight-recommend` and `tonight-vibes` SKILL.md: remove the reach/occasion rules; phrase routing as in
  MCP; the vibes tension flow loses its not-ever/not-tonight branches; dont-want-to-see leads to nothing
  about Vibes (consistent with the M7 row); tension only from `disliked` or taking back a positive.
- README (verdict text, tool table, invariants, release note), privacy and terms pages,
  `plugin.json` 1.4.0 → 1.5.0.

## Release and rollback

- **Pre-flight** *(review 1, blocking #2)*: a small operator command, `npm run db:preflight-m8`
  (`lib/db/preflight-m8.ts` for the read, tested directly, and `lib/db/preflight-m8-cli.ts` for the
  command, with the same `DATABASE_URL` / `--embedded` handling as `migrate-cli.ts`), runs
  the shared `classifyRefusals` inside `BEGIN TRANSACTION READ ONLY` against production and prints,
  per row, `user_id`, `title (year)` and why (no saved film / a vibe's core / ambiguous order), plus how
  many films would become dont-want-to-see. It writes nothing. Not raw SQL: `lower(btrim())` is not
  `filmKey` (whitespace collapse, JS case conversion, NFC), and would split one film's history and
  report a refusal that is not current. The migration still refuses on its own regardless.
- **Order:** run the pre-flight and resolve anything it lists with the current build → stop the app →
  back the database up → `npm run db:migrate` → deploy the new build. Roll-forward only.
- New build against an unmigrated database: the **verdict store's** preparation refuses (verdicts v3
  missing). Every MCP request and every signed-in page and API request opens the verdict store, so all
  of them refuse; sign-in, OAuth and the public pages do not open it and keep working. The taste
  store's own check is taste v14 alone, which is why its `deleteMovie` is only reached through
  requests that have already opened the verdict store. No data is touched. Previous build against a
  migrated database: reads work (columns kept); writing a refusal or an occasion fails on the CHECK.
- **Rollback:** the previous build runs against the migrated schema except for refusal writes; the
  deleted rejection acts are recoverable only from the backup. A full rollback is restore the backup +
  the previous build.
- No commit, merge or deploy until code review is READY and the user says so.

## Review log

- **Codex plan review 1 — NOT READY.** Blocking: (1) obsolete `occasion` must be refused at the MCP
  boundary, not stripped; (2) pre-flight must share the migration's identity and resolution rules.
  Both addressed above (strict tool inputs with protocol tests; shared read-only classifier and
  `db:preflight-m8`). Non-blocking notes adopted: `user_id` in diagnostics; clarified withdrawal test
  wording; failure-injection and late-insertion tests for the cascade; narrowed the schema-guard claim;
  existing idempotence/concurrency tests kept. Bounded needs and keeping v3 in the verdicts module were
  judged sound; taste v15 not needed.
- **Codex plan review 2 — READY.** No blocking issues.
- **User approval** of this plan and decisions 1–10. The earlier core draft is retained and aligned
  to this plan.
- **Codex code review — NOT READY**, one blocking finding: the recommend skill listed the lukewarm
  *"it was fine"* as a verdict to record, against the rule that lukewarm words write nothing
  unless settled. Fixed (*"I liked it"*). Non-blocking: the late-insertion cascade test runs in one
  transaction; a two-connection variant would need a real Postgres.
- **Codex code re-review — READY.**

## Decisions for user approval

1. Refuse the migration on an orphan or a core, rather than drop the refusal.
2. Overwrite `seen` with dont-want-to-see.
3. The earlier judgement re-emerges when a current not-ever is removed.
4. Keep the columns and add CHECKs, rather than drop them.
5. Bounded-needs engine change, rather than taste v15.
6. Stamps unchanged by the conversion.
7. Keep the `scope: "everywhere"` and `about: "judgement"` shapes.
8. Plugin 1.5.0; historical evaluation suites untouched.
9. Strict verdict-tool inputs: an old client sending `occasion` gets an error rather than a wider write.
10. A new read-only operator command, `npm run db:preflight-m8`, run before the release.
