# M5 — Vibe lifecycle: plan

> **RESUMED (2026-10-20).** The canonical ChatGPT plugin is merged (tonight `main` `15a6095`,
> PR #1); M4.5 closure is tracked separately in `docs/work/m4.5/`. This plan is at **revision 4**
> for a focused Codex review. Findings are filed in
> [`M5-PLAN.review-1.md`](M5-PLAN.review-1.md), [`M5-PLAN.review-2.md`](M5-PLAN.review-2.md) and
> [`M5-PLAN.review-3.md`](M5-PLAN.review-3.md), resolved in *Revisions 2–4* below. Revision 1's
> body is preserved unchanged beneath them. **Revision 3 adds the user-decided extraction of Vibes
> guidance into a second skill (`tonight-vibes`); Revision 4 settles what of it the project
> projection carries. Nothing is implemented until Codex approves the current revision.**

**Status:** draft **revision 4** for focused Codex review. Nothing is implemented and nothing is
committed.
**Written:** 2026-10-04, against `f63875c` on branch `tonight-m5`
(`/Users/vicox/relay-work/worktrees/tonight-m5`). **Revisions 2–4:** 2026-10-20, same worktree.
**Binding context:** [`M5-CONTEXT.md`](M5-CONTEXT.md). This plan narrows it and never contradicts it.
**Recovery checkpoint:** [`M5-STATUS.md`](M5-STATUS.md).

---

## Revision 4 (2026-10-20) — Codex review-3 resolutions

**Why.** Codex returned **NOT READY on revision 3**. All five review-2 points are closed; two
remain, filed in [`M5-PLAN.review-3.md`](M5-PLAN.review-3.md). Both are resolved here. This section
supersedes the passages it names, including parts of Revision 3. It adds no feature. PLAN ONLY.

### R3-1 — a recommendation-only conversation keeps the Vibe reading rule

**Decision: a minimal consumer rule stays in `tonight-recommend`. No routing.**

- `SKILL.md` 72–73 — *"Read a Vibe as **its own instruction plus the instructions of its Genres**,
  in that order — the three are one idea."* — **stays** in `tonight-recommend/SKILL.md`, unmarked.
  It therefore ships in the projection and in every plugin conversation where ChatGPT selects only
  `tonight-recommend`. It is how recommending *reads* a Vibe, not how one is authored. It is already
  pinned (`skills/tonight-recommend/test.sh` 187–191), and the pin stays as it is.
- **Why not routing.** Routing would make every recommendation depend on ChatGPT also selecting
  `tonight-vibes`, which nothing verifies. It is also impossible on the project host, which has no
  second skill. The rule is one sentence and is already projected, so keeping it costs nothing.
- `tonight-vibes` does not restate it. Its coherence section (*"One idea, said three ways"*) is the
  authoring side of the same idea and must not contradict it.
- Supersedes Revision 3 *What moves vs stays*, row 1, for lines 72–73. Lines 75–76 also stay,
  under R3-2 rule 1 below.

**Acceptance case: recommendation-only, Vibe read through its Genres.** It joins the S1 scenario
set and is scored in S3 and at every instruction-changing deploy.

- **Fixture.** A Vibe whose name and sentence alone admit a film that one of its Genres'
  instructions excludes (the `Quiet Dread` shape: the Genre says *"nothing gory"*).
- **Prompt.** A taste-aware request (*"something from my taste tonight"*). It contains no opinion,
  no keep and no Vibe talk.
- **Pass.** Nothing offered as fitting the Vibe contradicts its Genres' instructions. The positive
  evidence used is recognisable. No taste write and no Vibe offer.
- **Instruction sources.** (a) the projection; (b) `tonight-recommend/SKILL.md` **alone**, which is
  the plugin selection where only recommend is loaded; (c) the canonical plugin, by hand
  (Revision 3 #4, whose fixed scenario set gains this case).
- **Failing.** A fail on any source blocks S3 acceptance.

### R3-2 — the project projection vs the plugin

**Two hosts, one tool surface.**

| Host | Instruction text | Size rule |
| --- | --- | --- |
| ChatGPT project, and its CLI proxy (`claude -p --bare`, projection as system prompt) | `projectInstructionsFrom(skills/tonight-recommend/SKILL.md)` — **that file only**. `sync-instructions.mjs` keeps its single `SOURCE`, and `tonight-vibes/SKILL.md` never reaches the projection | ≤ 8,000 (`instructions.test.ts` `CAP`) |
| Canonical plugin | Both full `SKILL.md` files, byte-for-byte as `chatgpt-plugin/build.sh` packages them. ChatGPT selects by name and description | No project cap |
| Both | The same MCP tool descriptions and responses | Unchanged |

This is M4.5's binding premise: *"M5's Vibe lifecycle cannot fit in that. That cap belongs to
project instructions, not to plugin skills"* (`M4.5-CONTEXT.md`).

**What the ≤ 8,000 projection carries. This list is exhaustive.**

1. **Everything it carries today; the extraction moves none of it.** The extraction moves **only
   `full:` text** (rationale and worked examples) into `tonight-vibes`. Every sentence that reaches
   the projection today stays in `tonight-recommend`. That covers:
   - the Vibe reading rule and the Genre/Vibe naming distinction (72–76);
   - the Recommending compact;
   - the persisted principle;
   - verdict routing;
   - the keep flow: classification, proposing a Vibe while saving, illustration only, and *"a yes
     is the whole permission"* (467–486);
   - the unfiled rule (488–489);
   - memory and failures.

   Where a pair's `full:` half moves, its `project:compact` half becomes recommend's unmarked
   statement of the rule. The transform emits the same text either way.
   **Gate:** the extraction step leaves `PROJECT_INSTRUCTIONS` byte-identical
   (`PROJECT_INSTRUCTIONS_VERSION` unchanged). If it does not, projected text moved, and the step is
   wrong.
   Supersedes Revision 3 *What moves vs stays*, rows 1, 4 and 5, for their projected lines
   (72–76, 467–475, 480–486). Those lines stay, and only the `full:` lines of those rows move.
2. **M5's own projected deltas.** All of them are in `tonight-recommend`, and each is
   budget-neutral by rewriting (the ≈30-character headroom, Revision 2 correction 1):
   - **S2:** the write order — a new Vibe is created **with** its core.
   - **S3:** the floor every host needs:
     - a statement about how a film worked for them is a verdict, recorded in their words and
       never escalated (D10);
     - the unfiled rule is narrowed only as far as stays true on both hosts;
     - *"nothing under it"* becomes *"no verdict under it"*.
   - **S6:** the one film question becomes *"two or three films you love"*.

   Nothing else M5 writes is projected.

**Plugin-only: in `tonight-vibes`, never projected.**

- The §4 lifecycle after a verdict, G → D → O → A → W and T. That covers consideration, several
  Vibes, a core change, anchoring a pre-M5 Vibe, a new Vibe from evidence, the asking budget and
  the opt-out stop.
- The §7 transition walk and checklist (S5). Supersedes S5 *Surfaces* ("compact wording only if
  the budget allows; otherwise the triggers alone are projected").
- The §6 onboarding grouping and the F2 batch exception (the S6 mechanics).
- The moved rationale and worked examples.
- `tonight-recommend`'s handoff pointer to `tonight-vibes`. It sits in a `full:` block, because the
  project host has no second skill to point to.

**On the project host, therefore:**

- **M5 delivers** core-anchored writes, faithful verdict routing, the keep flow with a core, and
  the new onboarding question.
- **M5 does not deliver** post-verdict Vibe consideration, the transition walk or onboarding
  grouping. Recording a positive verdict and stopping is correct there, and the seeds a new user
  names stay verdicts.

**Shared tool metadata is host-neutral.**

- Tool descriptions state mechanics, preconditions and the write floor. None asks for Vibe
  consideration, because that cue would reach the project host without the lifecycle that governs
  it. Supersedes §3's *"after `liked`/`loved`, Vibes are worth considering"* on `record_verdict`:
  that cue now belongs to `tonight-vibes`.
- S4's `next` hint reaches both hosts too. If its gate opens, S4 must also show the project-host
  floor families unchanged with the hint present: zero inadmissible outcomes, and §5's *Never*
  column held, including the opt-out row. Otherwise the hint does not ship.

**Supersedes S3 *Tests → Deterministic* and S3 *Surfaces*.** S3 *Tests* said *"each rule is present
in both the Skill and the projection"*; S3 *Surfaces* said *"each change carries a full rationale
and a compact projection"*. Now:

- A **projected** rule (lists 1–2) is asserted in `tonight-recommend/SKILL.md` and in the projection
  (`skills/tonight-recommend/test.sh`, `instructions.test.ts`), and the projection fits the cap.
- A **plugin-only** rule is asserted in `tonight-vibes/SKILL.md`, by a new
  `skills/tonight-vibes/test.sh`. It carries no compact wording. Nothing in `tonight-vibes` is
  projected, so the file has no `full:` or `project:compact` markers.
- In §3's layer column, *"projected"* now means lists 1–2. Every lifecycle, transition and
  onboarding-grouping row is plugin-only.
- §0 *"held to the 8,000-character projection cap"* applies to projected text only.
- Revision 3 *Where it lands*, budget bullet (*"`sync:instructions` decides what, if any, of
  `tonight-vibes` it projects … The slice plan settles the projection source"*): nothing of
  `tonight-vibes` is projected, and the source is unchanged.

**Gates by instruction source.**

| Gate | Runs against | Scores |
| --- | --- | --- |
| Projection, deterministic | The generated projection and `tonight-recommend/SKILL.md` | `CAP` ≤ 8,000, with `PROJECT_INSTRUCTIONS_LENGTH` reported; every projected pin; the extraction's byte-identical check |
| Projection, semantic (host `CLI projection`; ChatGPT project spot-checks per §14) | The projection | Phase 1 AC1–AC6; M3 families; M5 floor families: the §5 routing rows reach `record_verdict` with faithful words, the ten inadmissible outcomes are zero, §5's *Never* column holds, the keep flow writes a core, the onboarding question, R3-1's case. **Not scored here:** consideration and offers, the missed-consideration metric, transition, onboarding grouping, cross-skill handoff |
| Plugin, deterministic | The two full `SKILL.md` | `chatgpt-plugin/test.sh` (exactly the two skills, byte-identical to source); `skills/tonight-recommend/test.sh` (*"recommend and vibes are the skills; setup/manage stay removed"*); `skills/tonight-vibes/test.sh` |
| Plugin, semantic, automated (host `CLI plugin-skills`) | The two full `SKILL.md`, exactly the packaged bytes. The S1 plan pins how the CLI presents the pair, and each run records it | The M5 lifecycle families: consideration, several Vibes, core change, new Vibe, opt-out, and yes/no/partial. The missed-consideration metric, opt-outs excluded, is **the S4 gate input**. Also transition (S5), onboarding grouping (S6), the ten inadmissible outcomes at zero, and R3-1's case with `tonight-recommend/SKILL.md` **alone** |
| Plugin, semantic, manual (Revision 3 #4) | The canonical plugin, on the user's ChatGPT account, iOS the hard surface | The fixed scenario set, now including R3-1's case |

Further consequences:

- **S1** records its baseline on both sources, today's projection and today's full `SKILL.md`
  (Revision 2 correction 4), so S3's before/after compares like with like.
- **S4's gate** (§9) reads the plugin-skill rate. On the project host, a stop after a positive
  verdict is correct, never a miss.
- **Deploy points** (§10) run every row of the table.

**Still binding.** No new table, tool, root, runtime or service layer (§13). Exactly one new skill.
No implementation until Codex is READY. No push.

---

## Revision 3 (2026-10-20) — Vibes extraction into a second skill, and Codex review-2 resolutions

**Why.** User decision (2026-10-20): M5 both **implements the Vibe lifecycle** AND **extracts only
the Vibes-related guidance** from the monolithic `tonight-recommend/SKILL.md` into a dedicated
`tonight-vibes/SKILL.md`. Verdict, memory and onboarding guidance are **not** extracted now; a
separate **post-M5 audit** handles any remaining misplaced concerns. This supersedes M4.5's older
proposed taste/model split for M5 ownership (documented below). Codex returned **NOT READY on
revision 2** with five points (filed in [`M5-PLAN.review-2.md`](M5-PLAN.review-2.md)), resolved
below. This section supersedes the passages it names. PLAN ONLY; nothing is implemented until Codex
is READY.

### Skill inventory: current vs target (Codex review-2 #1)

- **Current:** one skill, `tonight-recommend`. The merged plugin ships only this.
- **M5 target:** **two** skills —
  - `tonight-recommend` — recommending; verdict routing; Movie/viewing mechanics; memory/episodes;
    the onboarding entry ("there is no setup", the one-film question); failure handling.
  - `tonight-vibes` (new; folder `skills/tonight-vibes/`, frontmatter `name: tonight-vibes` —
    the user's shorthand was "vibes/SKILL.md"; the extraction slice confirms the exact name) — the
    Vibe concept, coherence and naming; the propose → confirm → write lifecycle (§4); core
    anchoring; the transition checklist (§7); the lifecycle's onboarding grouping.
- **No third skill in M5.** This supersedes §1.4 ("there is one Skill"), §11 ("No second skill")
  and §13's single-skill assumption **only** to add exactly one skill, `tonight-vibes`.
- **The `tonight-setup`/`tonight-manage` merge (`7b99e3f`) is not reopened.** The split is by
  **concern** (Vibe authoring), never by **intent**; "there is no setup" still holds; recommend
  stays the entry point. The extraction must not recreate a setup-first product (M4.5 CONTEXT,
  *"One skill is not one intent"*).

**Historical target, documented and superseded for M5 ownership.** M4.5 envisioned decomposing the
monolith into several narrowly owned skills (the `M5-STATUS.md` revisit note names a `tonight-taste`
body for the lifecycle, with routing via skill descriptions). M5 narrows this to one concrete
extraction now (`tonight-vibes`) and **defers any broader taste/model decomposition to the post-M5
audit**. The historical intent is preserved in `M5-CONTEXT.md` and the M4.5 docs; it is not deleted,
only not executed wholesale in M5.

### What moves vs stays

Inspected: `skills/tonight-recommend/SKILL.md` at 39,497 bytes (identical in the worktree and on
`main`). Line ranges are from inspection; the extraction slice confirms exact spans and keeps every
`full`/`project:compact` pair intact.

**Moves to `tonight-vibes/SKILL.md`:**

| Content | Lines |
| --- | --- |
| "Read a Vibe as its own instruction plus its Genres"; "A Genre is named for what it is; a Vibe for what it feels like" | 72–76 |
| "One idea, said three ways": coherence, "Coherent is not derived", "Movies have no part in it" | 91–111 |
| "A Vibe name is evocative, not descriptive" | 113–137 |
| "Which Vibe a kept film goes in" (classification) | 432–441, 467–475 |
| "Proposing a new Vibe" + the illustration-only rule | 446–452, 480–486 |
| Vibe/Genre authoring paragraph ("The idea you just used **is** a Vibe…"; "One conversation should not produce eight Genres"; "What a Vibe may be built from") | 540–554 |
| The "Everybody Has a Plan" worked proposal example | 508–523 |
| **New M5 content authored here:** core anchoring; the propose→confirm→write lifecycle (§4); the transition checklist (§7); the lifecycle's onboarding grouping (the mechanics only) | — |

**Stays in `tonight-recommend/SKILL.md`:**

| Content | Lines |
| --- | --- |
| Identity, guardrails, "there is no setup", "never write a Genre/Vibe/Movie anywhere but Tonight", account id, the architecture framing | 25–70 |
| The whole `## Recommending` flow (reads Vibes as evidence; does not author them) | 139–342 |
| Verdict routing — `record_verdict` / `withdraw_verdict` (**not extracted**, user) | 417–431, 460–465 |
| Movie/viewing mechanics — `create_movie`/`update_movie`/`delete_movie`, "a recommendation is not a saved Movie" | 492–532 |
| "A film in no Vibe is legitimate / Other movies" (recommend-side unfiled rule; M5 narrows "never propose" to the §7 triggers the vibes skill owns) | 454–456, 488–489 |
| Model management — `## Asked about the model directly`, `## What Tonight remembers` (memory; **not extracted**, user) | 556–616 |
| The onboarding **entry** (the one-film question) — **not extracted**, user; the lifecycle it calls lives in `tonight-vibes` | 31, 149, 229, 313–314 |
| `## When something fails` | 618–650 |

**Split, drawn by the extraction slice:** `## What may be persisted` (344–413) — the general
principle ("noticing is free, writing needs a yes") and the verdict/episode rows **stay**; the
Vibe/Genre-authoring specifics are **owned by `tonight-vibes`**. The principle is referenced, never
duplicated as a divergent rule. The shared vocabulary at 78–89 (what a Movie and a Verdict are)
stays with recommend; the Vibe sentences there move.

### Cross-skill routing (no new mechanism)

ChatGPT selects skills by name + description (M4.5's native architecture; no always-on router).
`tonight-vibes` carries a description that gets it selected when the conversation turns to
authoring or evolving Vibes or runs the lifecycle; `tonight-recommend` keeps the entry point and
routes a film-opinion statement into `record_verdict` (staying), after which the Vibe-consideration
lifecycle is `tonight-vibes`'s. The exact descriptions and the handoff wording are the extraction
slice's to specify and to **prove in evaluation** (the M5 rubric gains cross-skill routing cases).

### Where it lands, budget, packaging

- **Slice.** The extraction is folded into **S3** (which already owns the lifecycle/routing Skill
  text): S3 becomes "Vibe lifecycle, routing **and** the `tonight-vibes` extraction." Added S3
  surfaces: create `skills/tonight-vibes/SKILL.md`; move the spans above out of
  `tonight-recommend/SKILL.md`; update `skills/tonight-recommend/test.sh` ("recommend is the only
  skill" → "recommend and vibes are the skills; setup/manage stay removed"); the plugin package
  (`chatgpt-plugin/build.sh`/`test.sh` already package every `skills/*/SKILL.md`, so the new skill
  is carried automatically — the package test must stay green); eval host set gains the second
  skill.
- **Budget (extends Revision 2, correction 1).** The plugin carries **both** skills' full
  `SKILL.md` (not 8,000-capped). The ChatGPT **project** projection stays single and 8,000-capped;
  `sync:instructions` decides what, if any, of `tonight-vibes` it projects (likely the compact
  routing only). The full Vibe lifecycle is **plugin-only** — which is the reason the plugin exists.
  The slice plan settles the projection source; `PROJECT_INSTRUCTIONS_LENGTH` is still reported.

### Codex review-2 resolutions

- **#1 target vs current one-skill distinction** — resolved by *Skill inventory: current vs target*
  above; the budget/ownership/gates now reference the two-skill target, not the current one skill.
- **#2 (F1) explicit teardown + repeat reseed** — amends Revision 2 F1 and §1.5/§9. The evaluation
  reset tears down in dependency order **Vibes → Movies → Genres** (delete Vibes first to release
  the core FK, the memberships and the Genre `RESTRICT`; then Movies, now non-core; then the
  unreferenced Genres), then reseeds; this runs **fresh on every run**, not once. Then seed each
  Vibe with its core before members (D11); legacy shapes via v12-seed-then-migrate (D12).
- **#3 (F3) exclude intentional opt-outs from the metric** — amends Revision 2 F3 and §9 S1/S3, S4
  gate. The missed-consideration / stop-after-record metric (the S4 gate input) counts **only the
  positive families that should consider Vibes**; intentional opt-outs (§5 "declined more of the
  kind", not-tonight, negative) are **excluded** — a stop there is a pass, never a miss. The S4
  hint still fires on `liked`/`loved`; the opt-out stays Skill-owned.
- **#4 (F5) manual canonical-plugin acceptance** — amends Revision 2 F5 and §10/§14. Add a
  **required manual semantic acceptance pass on the canonical plugin** (the real ChatGPT plugin, on
  the user's account, iOS the hard surface) over a small fixed scenario set — routing, lifecycle,
  opt-out, onboarding and cross-skill handoff — recorded as evidence. It **complements** the
  automated CLI rubric, does not replace it, and is a gate for any instruction-changing deploy. The
  coordinator runs it (this session has no web access).
- **#5 (F7) real PostgreSQL concurrency tests** — amends Revision 2 F7 and §9 S2/§10. The three
  core-write races (vs `deleteVibe`, `deleteMovie`, `updateMovie` un-filing) run against a **real
  PostgreSQL** instance and **must execute and pass** — never skipped, mocked, or conditionally
  skipped when no database is present. S2 acceptance records their execution.

**Still binding.** No new table, tool, root, runtime or service layer (§13). Exactly one new skill
(`tonight-vibes`); no verdict/memory/onboarding extraction now. No implementation until Codex is
READY. No push.

---

## Revision 2 (2026-10-20) — canonical plugin compatibility and Codex review-1 resolutions

**Why.** M4.5's ChatGPT-plugin packaging is done and merged (tonight `main` `15a6095`, PR #1). That
fixes the host facts revision 1 could only assume, and the coordinator has relayed Codex's review-1
findings. This section is the delta: it **supersedes the specific passages it names** and records
how each review-1 finding is resolved. It adds no feature and changes no scope; nothing here is
implemented, and the plan stays PLAN ONLY until Codex approves this revision.

**The canonical plugin, as merged (binding facts for M5).**

- One package, `repos/tonight/chatgpt-plugin/`, name `tonight`, app reference `.app.json` → the
  registered Tonight MCP app; it ships **one skill, `tonight-recommend`**, as the full
  `skills/tonight-recommend/SKILL.md` (≈39.5 KB), byte-for-byte.
- There is **no second skill and no always-on kernel/router.** Routing is ChatGPT's own selection
  over the skill's name/description plus the MCP tool metadata (M4.5's binding architecture
  principle).
- The ChatGPT **project** path is unchanged: it still receives the generated projection under the
  hard 8,000-character cap (`web/lib/instructions.test.ts`).

**Corrections to revision 1** (the M4.5-era revisit notes in `M5-STATUS.md` assumed *several*
narrowly owned skills; the canonical plugin shipped *one*).

1. **Instruction budget — supersedes §1.4 and §14 budget rows (review-1: F4).** M5 text lives on
   three surfaces, budgeted separately:
   - **ChatGPT project projection** — hard 8,000 cap, still binding; every rule projected here stays
     budget-neutral by rewriting, never by dropping a true pin.
   - **The plugin skill (`SKILL.md`)** — the canonical plugin ships the whole file; it is **not**
     bounded by the 8,000 project cap (M4.5 facts 2–3: documented per-skill limits are far larger).
     Full-rationale M5 wording that will not fit the project projection may live in the `SKILL.md`
     body the plugin ships, provided both stay in sync via `npm run sync:instructions`.
   - **MCP tool descriptions** — unchanged budget treatment.
   The "≈30 characters of headroom" arithmetic applies only to the project projection. Every slice
   still reports `PROJECT_INSTRUCTIONS_LENGTH` for the project path.
2. **Ownership — supersedes the §3 reading that "metadata is the routing" across skills.** With a
   single skill, routing is owned by the one skill's **description** (selection), the **`SKILL.md`
   body** (lifecycle and routing rules) and the **MCP tool descriptions** — not by several skill
   descriptions. The §3 table rows stand; "skill descriptions" is read as "the single
   `tonight-recommend` description."
3. **Gates and evaluation — supersedes §10 / §14 host handling.** Any `SKILL.md` change must keep
   the merged plugin's package test green (`chatgpt-plugin/test.sh` proves the packaged `SKILL.md`
   is byte-identical to source), so the plugin build/test join the deterministic gates for any
   instruction-changing slice. The eval host dimension now records three surfaces: Claude CLI
   projection, ChatGPT project projection, ChatGPT **plugin** (the full `SKILL.md`).
4. **Baseline reconciliation — amends §9 S1 "version `ae863227`".** S1 must confirm its
   untouched-instruction baseline against the `SKILL.md` the canonical plugin actually ships
   (≈39.5 KB) and record the exact version/sha it runs on. (This ties to the open M4.5
   reconciliation question about which skill body is canonical; S1 changes no skill, only records
   the version.)

**Codex review-1 resolutions.** Findings are filed, reconstructed, in
[`M5-PLAN.review-1.md`](M5-PLAN.review-1.md); each is resolved in-plan below, pending Codex's
focused re-review. No fix is implemented.

- **F1 reset order** — amends §1.5, §9 (S1/S2 seeders), D11, D12, §10. Pin the evaluation reset →
  seed order now that `create_vibe` requires a core: reset, then create each Vibe **with its core**
  before adding members; `02-new-vibe` re-expressed per D11; legacy pre-M5 shapes seeded at a v12
  build then migrated (D12), never by direct SQL. The exact legacy mechanism stays delegated to the
  S5 plan; the ordering invariant is now stated.
- **F2 onboarding batch exception** — amends §4 ("asking has a budget") and §6. State the exception
  and bound it: **during onboarding only**, one offer may propose several initial Vibes, each
  grouped **solely from the 2–3 seed films the user named**, under one confirmation, nothing written
  without a yes. Outside onboarding, §4's one-new-Vibe-per-offer budget is unchanged.
- **F3 routing / next-hint opt-out** — amends §4 polarity, §5 (the "I don't need another of these"
  row) and S4. The positive-but-declining-more case writes `liked` yet must **not** enter Vibe
  consideration. The S4 `next: "consider-vibes"` hint is a constant from the call's own arguments
  and cannot see the opt-out, so it stays a **non-binding safety net owned by the Skill**: the
  opt-out rule overrides it, and the hint never authorises an offer or write (inadmissible outcomes
  1 and 8). S4 stays conditional (D7).
- **F4 instruction budget** — resolved by correction 1 above.
- **F5 eval rubric** — amends §9 S1/S3 and §1.5. Pin the rubric in **S1** (`scenarios.json` +
  `rubric.md`), carrying the ten inadmissible outcomes verbatim, with an explicit scoring method, a
  coordinator-approved pass threshold, and a **host column** (CLI projection / ChatGPT project /
  ChatGPT plugin). The ten outcomes are unchanged.
- **F6 anchor gate** — amends S7, D6, §8 (v14), §14. S7's `SET NOT NULL` proceeds only on an
  operator-confirmed count of unanchored Vibes = 0 across **all** accounts; the v14 `run` step
  refuses and names the count, changing nothing, when any remain; otherwise M5 exits with
  store-level enforcement (S2) and S7 **explicitly deferred** behind its gate (D6), recorded in the
  final report.
- **F7 PostgreSQL concurrency** — amends §8 (D1) and §1.1. Pin the core-write lock protocol: hold
  the core Movie (`FOR KEY SHARE`, or insert it) **before** locking the Vibe, confirm ids after
  locking, keep `inLockOrder`; the deferred composite FK (`MATCH SIMPLE INITIALLY DEFERRED`) defers
  the violation to commit, and the store pre-checks only so the refusal can name the Vibes. The
  three named races — core change vs `deleteVibe`, vs `deleteMovie`, vs `updateMovie` un-filing —
  are the `concurrency.test.ts` cases. The SQL sketch stays delegated to the S2 plan.
- **F8 superseded old section** — amends §1.7 and D15. Confirm the one-line "superseded by
  `docs/work/m5/`" pointer on `docs/work/phase-2-implementation.md` "M5 — Vibes that live"
  (committed with the planning docs or the final report); §13 already excludes drift, versions,
  dormancy and split/merge, and no slice re-imports them. The pointer edit is deferred until commits
  are authorised.

**Correction (self-found, revision 1).** §1.4's table cites `web/lib/mcp/tools.test.ts` 654–659 as
pins on Skill wording; those are **leak tests** (they assert *"three to five other films"*,
*"illustration only"* and *"Other movies"* stay **out of** the tool descriptions). Only
`tools.test.ts` 528 pins a tool description (`create_vibe`). Slice plans use the corrected
characterisation.

**Still binding.** No new table, tool, root, runtime or service layer (§13). No implementation
until Codex approves this revision. No push.

---

## 0. Summary

**What M5 delivers.**

- A Vibe becomes **film-anchored**: one core Movie plus further members.
- **Positive film evidence** — however the user phrases it — is recorded as a Verdict in their own
  words. It then enters a **propose → confirm → write** lifecycle that can do any of these:
  - add the film to one or several existing Vibes;
  - make it a Vibe's new core;
  - anchor a pre-M5 Vibe;
  - reveal a new Vibe.
- **Onboarding** and the **transition of existing Vibes** use the same lifecycle. Neither is a
  parallel architecture.

**How it is built.**

- **Persistence:** one nullable column on the Vibe row and a deferred foreign key (taste v13),
  then a gated `NOT NULL` contract (taste v14).
- **Store:** six deterministic invariants.
- **MCP:** one new argument on `create_vibe` and one on `update_vibe`, plus additive read fields.
- **Instructions:** Skill and tool-description changes, held to the 8,000-character projection cap.
- **Not added:** no table, no tool, no root, no runtime and no service layer.

**Slice order.**

| # | Slice | One line |
| --- | --- | --- |
| S1 | Routing baseline | Measure how the current agent handles natural film-opinion statements, before any instruction changes |
| S2 | Core anchor | Schema v13, store invariants, MCP arguments and read shapes; Skill write-order kept consistent |
| S3 | Lifecycle and routing | Skill and tool descriptions: route evidence into the Verdict, then consider Vibes, propose, confirm, write |
| S4 | `next` hint | Conditional: a deterministic response hint, only if S1 or S3 show the agent stopping early |
| S5 | Transition | Anchor existing Vibes and inspect weak, overlapping and unfiled cases, all confirmed by the user |
| S6 | Onboarding | 2–3 loved films feed the same lifecycle |
| S7 | Anchor contract | Gated v14: every Vibe has a core, enforced by the database |
| — | Final report | `M5-FINAL-REPORT.md` |

---

## 1. What the repository says today

This is the evidence the plan stands on. The paths are relative to the worktree.

### 1.1 Persistence

- **The five roots are a test, not only a rule.** `web/lib/db/schemas.test.ts`, *"product memory
  is five roots"*, derives the table inventory from the migrations. Any new table fails it unless
  it is infrastructure. M5 adds no table, so that test stays unchanged.
- **The taste schema is at v12** (`web/lib/taste/store/schema.ts`).
  - The physical names `tonight_mixes`, `tonight_mix_genres`, `tonight_mix_movies` and `mix_id` are
    deliberate.
  - The membership triggers `tonight_mix_genres_touch` and `tonight_mix_movies_touch` name those
    tables inside plpgsql bodies.
  - `web/lib/taste/store/sql.ts` is the only file that says both *mix* and *vibe*.
  - M5 renames nothing. A new column on `tonight_mixes` is named for what it holds:
    `core_movie_id`.
- **A Vibe today** is:
  - a `tonight_mixes` row (name and instruction);
  - one or more `tonight_mix_genres` rows (the model and store enforce at least one);
  - a set of `tonight_mix_movies` rows, which may be empty and cascades on both sides.

  **There is no core concept anywhere.** Membership is written only from the Movie's side, through
  `update_movie(vibes)`, which replaces the whole list.
- **Unfiled Movies are a settled decision.** `docs/work/user-owned-movies.md` §11 and decision G
  say *"Zero-Mix Movies: Allowed. Settled. MUST."* A watched film, a disliked film, and every film
  left behind by a deleted Vibe all have to live somewhere.
- **Timestamps.** `tonight_written_at` (v6) dates every row. A membership change dates the
  **Movie** and deliberately not the Vibe (the v6 note, *"Filing a movie under a vibe does not date
  the vibe"*).
- **Lock discipline** (`sql.ts`, pinned by `web/lib/taste/store/concurrency.test.ts`):
  - the movie side is always locked before the vibe side;
  - `deleteVibe` holds every filed movie before it holds the vibe, and retries if the set moves;
  - multi-row locks are taken one statement per row, in `inLockOrder`;
  - ids are confirmed after locking.
- **Deletion is asymmetric** (README, *"The invariants"*). A Genre *defines* a Vibe, so deleting a
  needed Genre is `RESTRICT`. A Movie is *held* by a Vibe, so deleting one cascades.
- **Migrations** (`web/lib/db/migrate.ts`):
  - they are append-only;
  - `prepareSchema` migrates in development and `requireSchema` refuses in production;
  - `run` steps exist for domain-computed changes (v9, v11);
  - v9 is the precedent for *"Nothing, loudly"*: refuse, name what blocks, change nothing.

### 1.2 Verdicts

- **Verdicts are a separate root** (`web/lib/verdicts/`).
  - A film is named by title and year as text, with no foreign key to a Movie.
  - A verdict about a film the user never saved is legal and **writes no Movie**.
- **Judgements are global.** `not-tonight` requires an occasion; `not-ever` is global. `because`
  and `reason` hold the user's own words or null; `told` is `volunteered` or `confirmed`. There is
  no situational scope, which is deliberately left to later milestones.
- **The website writes verdicts without an agent.** `web/app/api/verdicts/route.ts` records a
  volunteered judgement with no `because`. No lifecycle can run there.
- **`web/lib/seen.ts`:** a standing judgement implies the film was seen, and nothing writes
  `viewing` from a verdict.

### 1.3 The MCP surface

- **20 deterministic tools** in `web/lib/mcp/server.ts`, addressed by name, with no ids anywhere.
- **`create_vibe`** takes a name, Genres and an instruction. Its description currently says *"The
  films filed in a vibe are no part of it: one written just now with nothing under it is as
  coherent as one with ten."* M5 has to revise that sentence.
- **Precedent for deterministic guidance inside a response:**
  - `get_memory.coverage` and `get_verdicts.coverage`;
  - `forget_verdict`'s `writeScope` and `otherRoots`.

  Each is a constant, explained in its tool's description, and never computed from another root.
  An S4 `next` hint would follow this pattern exactly.
- **`SERVER_VERSION` is `0.1.0`.** It says it is *"bumped when the tool surface changes in a way a
  client would notice"*, yet it did not move during M1–M4.

### 1.4 The Skill and its projection

- **There is one Skill, and it is pinned.** `skills/tonight-recommend/test.sh` checks *"recommend
  is the only skill"* and that `tonight-setup` and `tonight-manage` stay removed. A ChatGPT
  project also receives only one projection. So the context's *"workflow Skill"* layer is **a
  section of `SKILL.md`**, not a second skill.
- **The projection is at its cap.**
  - `npm run sync:instructions` generates `web/lib/generated/project-instructions.ts`.
  - `web/lib/instructions.test.ts` enforces `CAP = 8000`; the old guard is retired.
  - **The current projection is about 7,970 characters**, estimated from the 8,428-character
    generated module minus its wrapper and escapes. Slice plans must use
    `PROJECT_INSTRUCTIONS_LENGTH` for the exact figure.
  - That leaves roughly 30 characters. Every M5 Skill change must therefore be budget-neutral or
    smaller, achieved by rewriting, **never** by dropping a rule that is still true (the
    `instructions.test.ts` note on `CAP`).
- **Pinned rules M5 deliberately changes:**

  | Current wording | Pinned by | Under M5 |
  | --- | --- | --- |
  | A verdict needs *"no Vibe and no Movie … needed or invented to hold one"* | `test.sh` 785–790; `instructions.test.ts` 1245–1249, 1666 | Still true for *recording*. New: a positive verdict is then *considered* for Vibes, and written only on a yes |
  | *"A film in no Vibe is legitimate … Do not sort them, propose Vibes for them, or mention them unasked"* | `test.sh` 864–866; `instructions.test.ts` 711, 1296–1298, 1673–1674; `tools.test.ts` 659 | Still legitimate. *"Never propose"* narrows to the triggers in §7 |
  | Movies have no part in coherence: *"nothing under it is as coherent as one with ten"* | `test.sh` ~215; `tools.test.ts` 528 | Membership count is still irrelevant, but the **core must embody the idea** |
  | *"A Vibe with nothing under it: intent certain, their verdict unconfirmed"* | `test.sh` 272–318; `instructions.test.ts` 288, 335, 1359–1362 | Every new Vibe has a core. The rule becomes *"no verdict under it"* |
  | Write order *"any Genre it needs, then the Vibe, then the film"* | `instructions.test.ts` write-flow contract (~1219) | The Vibe is created **with** its core |
  | *"There is no setup"*; never *"what genres do you like?"* | `test.sh` 133–159; `instructions.test.ts` 1617 | Kept. Onboarding *is* the one film question |
  | *"three to five other films … illustration only"* | `instructions.test.ts` 695–698, 1276–1281; `tools.test.ts` 654–656 | Kept (3–4 is inside the range). The proposal also names a core |

- **Changing instructions reopens the semantic sweeps.** `evaluation/README.md` and
  `evaluation/m3/README.md` say a change to `SKILL.md`, the generated instructions or the tool
  descriptions reopens both the Phase 1 sweep and the M3 sweep.

### 1.5 Evaluation

- **The Phase 1 sweep** lives in `skills/tonight-recommend/evaluation/`.
  - It runs `claude -p --bare`, with the projection as the system prompt and Tonight as the only
    MCP server. Fixtures are seeded once through the public tools.
  - Fixture **`02-new-vibe` is a zero-movie Vibe** (AC1, AC2, AC3a). It cannot be seeded once
    `create_vibe` requires a core.
- **The M3 runner** (`evaluation/m3/run.mjs`) reseeds per run and takes before and after snapshots
  for scenarios that write. It is single-turn; it contains no `resume`.
- **Deterministic gates** live in `web/lib/verdicts/evaluation/`, `web/lib/memory/evaluation/` and
  `web/lib/evaluation*.test.ts`.
- **Evaluation results are gitignored by directory.** `.gitignore` lists only `evaluation/results/`
  and `evaluation/m3/results/`.

### 1.6 The website

- **It reads and deletes; it never creates or renames.** It reads the taste model and the standing
  verdicts, deletes Genres and Vibes, and sets viewing and judgements
  (`web/components/taste-view.tsx` and `manage.tsx`, head notes).
- **`POST /api/vibes` has no caller in the UI.** Only `web/lib/web/routes.test.ts` exercises it.
- **"Other movies"** is `inNoVibe` in `web/lib/web/vibes.ts`.

### 1.7 Earlier plans this one replaces or borders

- **`docs/work/phase-2-implementation.md` "M5 — Vibes that live"** planned drift observations
  "written automatically", Vibe versions, dormancy and split or merge proposals. Its stored parts
  already conflict with the five-roots rule adopted in `d1e1f09`. **This M5 supersedes that
  definition.** Drift, versions, dormancy and split or merge tooling are not part of it.
- **"M6 — Knows the occasion"** is about situations and companions. M5 adds no occasion structure:
  contextual meaning lives in a Vibe instruction the user confirmed and in a verdict's `because`.
  Nothing in M5 rules M6 out.

---

## 2. The product model after M5 (normative)

- **Vibe** = name + instruction + one or more Genres + **exactly one core Movie** + zero or more
  further member Movies. Every Vibe written after S2 has a core. A pre-M5 Vibe may lack one until
  the transition (S5); after the S7 contract none can.
- **Core** = the film that currently best embodies the Vibe.
  - It is always a member.
  - It can be replaced, and the previous core then stays a member.
  - It is never cleared.
  - One film may anchor more than one Vibe. That is structurally allowed, and is worth noticing as
    a possible overlap.
- **Member** = a Movie the user agreed belongs to that kind of evening: either a request to keep a
  film in a Vibe that fits, or a confirmed proposal. **Membership carries no opinion.** Verdicts
  calibrate it, exactly as they do today.
- **What may be a core** is a Skill rule; the store cannot check it without reading another root.
  - **Allowed:** a film they have seen and stand behind — one with a standing `liked` or `loved`,
    or one they name as the embodiment.
  - **Never:** a reference film, a film they said they have not seen, or one with a standing
    `disliked` or `not-ever`.
- **Reference (candidate) films** are illustration inside a proposal.
  - They are never written: no Movie, no membership, no viewing, no verdict.
  - If the user then says something about one of them — *"oh, I loved that one"* — that is a new
    statement and follows the ordinary path from step R in §4.
- **Coherence.** Name, instruction and Genre instructions are one idea (unchanged), and **the core
  must embody that idea**. How many films a Vibe holds still has no bearing on whether it is
  coherent.
- **Unfiled Movie** = a legitimate library fact.
  - With no standing positive verdict, it is memory, not taste.
  - With one, it is *uninterpreted evidence*. It becomes eligible for consideration only when new
    evidence about it arrives, or in a transition the user asked for (§7).
  - It is never sorted silently.
- **Reads.** `get_taste` keeps its scope: Genres, Vibes (now with `core`), all Movies and the
  standing verdicts. `get_memory` keeps its own. M5 does not split or narrow either read.

---

## 3. Instruction ownership for M5

Each rule has one home. Placement follows `docs/instruction-ownership.md`.

| Rule | Layer | Where |
| --- | --- | --- |
| A statement about how a film worked for them is a verdict: record it in their words, then consider their Vibes | Universal Skill (projected) | `SKILL.md` § films they tell you about |
| Positive evidence → consider → propose → yes → write; negative and not-tonight never become positive membership; one offer at most; a declined idea leaves nothing | Workflow section of the Skill (compact wording projected; rationale full-only) | `SKILL.md` |
| What a proposal contains (name and alternatives, instruction, Genres, core, 3–4 illustration films), and that illustration is never written | Skill | `SKILL.md` (existing *"Proposing a new Vibe"*, extended) |
| Onboarding: the one film question is *"two or three films you love"* | Skill | `SKILL.md` § there is no setup |
| Transition triggers and the per-Vibe checklist | Skill (full); compact only if the budget allows | `SKILL.md` |
| Keep their words in `because`; judgement strength never escalated; after `liked`/`loved`, Vibes are worth considering | Tool description | `record_verdict` |
| `core` is the film that best embodies the Vibe — one they have seen and stand behind, never an illustration | Tool description | `create_vibe`, `update_vibe` |
| `core: null` means a pre-M5 Vibe not yet anchored | Tool description | `get_taste`, `get_memory` |
| A core cannot be un-filed or deleted; change the core first or delete the Vibe | Tool description (statement of a precondition) | `update_movie`, `delete_movie` |
| Core is a member; at most one; required on create; replacing keeps the old one as a member; un-file or delete is refused, naming the Vibes; lock order | Store and DB | `schema.ts` v13, `sql.ts`, `model.ts` |
| Every Vibe has a core | DB (S7) | `schema.ts` v14 |
| Why, the worked cases, the Logan Lucky case | Full Skill and docs | `SKILL.md` full blocks; this folder |

**What stays out of the store.** Whether a core has a positive verdict, whether a film fits a Vibe,
and whether two Vibes overlap are semantic judgements, and some would mean reading another root.
The store accepts what it cannot check, as `docs/instruction-ownership.md` requires.

---

## 4. The workflow state machine

Nothing in this machine is persisted except the two write states, **V** and **W**. Every other
state lives in the conversation and ends with it.

```
 statement
    │
 [R] route ── not a film opinion ──▶ the existing flows (recommend, keep, read, watched, correct)
    │ a film opinion
 [I] identify the film — title + year; ask only if ambiguous
    │
 [V] record_verdict — their words, told, scope            ◀ the only write that needs no yes
    │                                                       (it is their statement)
 [P] polarity
    ├── positive (liked/loved) ─────────────────────────▶ [G]
    ├── positive, but declining more of the kind ───────▶ stop
    ├── disliked / not-ever / withdrawal of a positive ─▶ [T]
    └── not-tonight ────────────────────────────────────▶ stop (an evening, not the film)
 [G] get_taste — Vibes with core and members, Genre instructions, standing verdicts
    │
 [D] decide 0..n candidates:
       member of an existing Vibe V (one or several)
       new core for V (better embodiment than V's core)
       anchor a pre-M5 Vibe V (core: null)
       a new Vibe (at most one per statement, and only when their words carry a how/when/why)
    │ none ──▶ stop; nothing more is said
 [O] offer — in one breath, in the conversation; nothing written
    │
 [A] their answer
       yes ────────────────▶ [W] write everything agreed ──▶ one short sentence saying what
       partial or edited ──▶ [W] write the agreed subset, with their edits
       no, or a change of subject ──▶ nothing written, nothing remembered, no re-offer this conversation
       their own idea ─────▶ back to [D] with their meaning
 [T] tension, offered at most once:
       film is a core ─────────▶ offer a new anchor (a member they stand behind), or keep it
       film is a non-core member ▶ may offer removal, or say nothing
       film is in no Vibe ─────▶ stop
```

**Write order in W.** Each step is a deterministic tool call. If one fails: stop, say what was and
was not written, and never claim anything was stored when it was not.

1. `create_genre` for any new Genre in the agreed proposal, with the instruction they were shown.
2. Then whichever applies:
   - **New Vibe:** `create_vibe(name, instruction, genres, core)`. This creates the core Movie if it
     is not saved yet (D3).
   - **Core change or pre-M5 anchor:** `update_vibe(name, core)`. The previous core stays a member.
3. Further memberships:
   - **Saved films:** `update_movie(title, year, vibes: current ∪ agreed)`.
   - **Unsaved films:** `create_movie(…, vibes)`.
4. One short sentence naming what was written.

**Rules that hold in every state.**

- **When a film answer is owed** (the evidence came with a request for one):
  - The answer comes first and whole.
  - V happens alongside it.
  - The offer may be the answer's *one closing question*, and never displaces the lead or the
    directions. If it does not fit there, it waits for the next turn.
- **Asking has a budget:**
  - at most one offer per statement;
  - at most one new-Vibe idea in an offer;
  - a declined idea is not offered again in the same conversation;
  - a bare *"liked it"* with no how, when or why considers **existing** Vibes only, except in
    onboarding (§6) or when they ask.
- **Several Vibes.** One offer may name several Vibes the film fits. A partial yes writes exactly
  the part that was agreed.
- **Core change.** Offered only when the new film embodies the instruction better than the current
  core, and named against it: *"Palm Springs anchors Time Well Wasted. X is closer to what it
  means — make X the anchor? Palm Springs stays in it."*
- **What is never written.**
  - reference films;
  - a paraphrase of their reason;
  - a stronger judgement than the one they gave;
  - an occasion, daypart or attention field anywhere;
  - a Vibe, membership or core change without a yes;
  - any record that an offer was made or declined.

---

## 5. Routing map

Routing is the main reliability problem. These rows become S1's scenarios and the S3 Skill's
worked cases. Each one judges the column *"Never"* as strictly as *"Route"*.

| They say | Route | Verdict written | Vibe step | Never |
| --- | --- | --- | --- | --- |
| *"I loved Paterson."* | V | `loved`, volunteered | G/D: existing Vibes only (no how/when/why given) | invent a `because` |
| *"Logan Lucky was great for a lazy Sunday afternoon when I don't need to pay full attention."* | V | `liked`, `because` = their clause, verbatim | G/D: an existing Vibe whose instruction covers it, or **one** new-Vibe offer anchored on Logan Lucky | an attention or daypart field; *"you like low-attention films"*; `loved` |
| *"[Film] is perfect to have on in the background on a Sunday afternoon."* | V | `liked` + verbatim `because` | as above | treat it as tonight's request; give the judgement an occasion scope |
| *"[Film] was exactly my thing because of the dialogue."* | V | `liked` (`loved` only per D10) + verbatim `because` | strengthen a Vibe whose instruction is about dialogue; maybe a new one | widen it to *"you love talky films"* |
| *"[Film] was good, but I don't need another movie like this."* | V | `liked` + verbatim `because` | **stop**: they declined more of the kind | `disliked`; `not-ever`; any offer |
| *"[Film] was fine, I guess."* | — | nothing, unless one light question settles it (then `confirmed`) | none | record `liked` |
| *"I hated [film]."* | V | `disliked` | T if the film is filed; no positive step | file it anywhere |
| *"Not tonight — too long."* | V | `not-tonight` + occasion + reason | none | any Vibe talk |
| *"Never again."* | V | `not-ever` | T if the film is filed | — |
| *"I watched [film] last night."* | viewing and/or episode | none | none | infer an opinion |
| *"Something like Logan Lucky."* | recommend | none | none | record a verdict |
| *"Loved Knives Out — what should I watch tonight?"* | answer + V | `loved` | offer only as the closing question, or later | delay or shorten the answer |
| *"Save Heat."* | keep flow (Phase 1) | none | classification as today (D4) | — |

**Judgement strength (D10).**

- `loved` only when their words carry it: *loved*, *favourite*, *all-time*, *one of the best*.
- Otherwise a clearly positive statement is `liked`.
- Lukewarm or ambiguous words write nothing unless one light question settles them.
- Their words always go in `because`, unedited.

---

## 6. Onboarding is the same lifecycle

There is still no setup. A first-time user with an empty model gets nothing that looks like a
configuration session.

- **They ask for a film.** Answer with a film, as today: this is Phase 1 AC behaviour with an empty
  model (fixture `01-empty`). The answer's *one film question* becomes *"What are two or three
  films you love?"*
- **They arrive without asking for a film** (*"hi"*, *"what is this?"*, *"set me up"*). Ask that
  question directly, in one sentence.
- **They answer.** Each named film goes through I → V as `loved`, `confirmed`, with `because` only
  where they gave reasons. Then G → D, but with two differences:
  - D may group seeds: two seeds that express one idea become one Vibe, with a core and a member.
  - A new-Vibe idea may come from the films themselves, because they were asked for exactly this.
- **The offer** covers all the initial Vibes, each as a primary name plus 2–3 alternatives, an
  instruction, Genres, a core and 3–4 illustration films.
  - The Genres are new for a new user. Each one's instruction is shown in the offer, because a yes
    only covers the meaning they were shown.
  - A seed that fits no coherent group gets its own Vibe, or stays a verdict only if they decline.
- **Their answer → W**, exactly as in §4.

No onboarding state is persisted. A user who leaves halfway has their verdicts, which are their
statements, and nothing else.

---

## 7. Transition of existing Vibes

The live model holds 14 Vibes. Some have no films, and some films are unfiled. The repo fixtures do
not mirror that, and **nothing in this section is asserted about live data**. Every case is read
from the user's own `get_taste` and `get_memory` at the time.

**Three phases.**

1. **Expand — S2, taste v13.** `core_movie_id` arrives, nullable. Pre-M5 Vibes read as
   `core: null`, and stay fully usable and editable. New Vibes cannot be created without a core.
2. **Transition — S5.** User-confirmed, through the existing tools. No SQL backfill, ever: a core
   is a semantic choice.
3. **Contract — S7, taste v14.** `SET NOT NULL`. It refuses, naming the count, while any Vibe in
   the database is unanchored.

**When the agent raises it.** Only when:

- the user asks (*"let's go through my vibes"*); or
- a pre-M5 Vibe is already the subject of the conversation — new evidence fits it, or they are
  editing it.

Never unprompted.

**The per-Vibe checklist** (the agent's judgement; each item is an offer):

1. **Anchor.**
   - Candidates are members with a standing `liked` or `loved`. Offer the one that best embodies
     the instruction, and name the runner-up.
   - With no candidate, ask which film embodies it. A named film becomes the core
     (`update_vibe(core)` creates and files it), and whatever they say about it is its own verdict.
2. **Weak** — no films, or none they spoke for. Say so plainly and offer: anchor with a film they
   name, merge, delete, or leave it unanchored for now (allowed until S7).
3. **Overlap** — two Vibes whose instructions, Genres and cores describe one evening. A merge is a
   confirmed *sequence* of existing operations:
   1. agree which Vibe survives;
   2. `update_movie` moves the members;
   3. the surviving instruction is reworded only in their words;
   4. `delete_vibe` removes the other.

   There is no merge tool (non-goal), and the sequence is not atomic: on failure, report the state
   exactly.
4. **Unfiled films.**
   - **With a standing positive verdict:** consider each like new positive evidence (§4 from G).
   - **Without one:** untouched and unmentioned.

**Examples to inspect, not facts to assert.** Each is checked against live reads during S5.

- **Plausible core relationships:** Everybody's Lying / The Menu, Grindhouse Mayhem / Machete, Time
  Well Wasted / Palm Springs.
- **Weakly evidenced:** Polite Suspicion, The Plan Goes Sideways.
- **Possible overlap:** Bad Date, Worse Alibi and Holiday Alibis.
- **Unfiled:** Hit Man, Logan Lucky, No Sudden Move, Wingwomen.
- **Logan Lucky's standing reason may justify one new-Vibe offer anchored on it.**
  - The Italian Job-style films appear only as illustration.
  - The reason stays in the verdict, unchanged.
  - Anything durable is the Vibe instruction they confirm, in their words.

---

## 8. Schema and API changes

| Change | Slice | Kind | Compatibility |
| --- | --- | --- | --- |
| taste **v13**: `ALTER TABLE tonight_mixes ADD COLUMN core_movie_id uuid` (nullable) plus FK `(user_id, id, core_movie_id) → tonight_mix_movies (user_id, mix_id, movie_id)`, `DEFERRABLE INITIALLY DEFERRED`, `MATCH SIMPLE` so NULL is unchecked | S2 | additive | Migrate, then deploy. A pre-S2 build ignores the column; its `delete_movie` or un-filing of a film a newer build made a core fails loudly at commit (§10) |
| taste **v14**: `run` step that counts `core_movie_id IS NULL`, throws naming the count, otherwise sets `NOT NULL` | S7 | contract | Only once no pre-S2 build can serve; migrate, then deploy |
| `Vibe.core: MovieHandle \| null` in `get_taste`; `VibeRoot.core` in `get_memory` | S2 | additive read field (key always present; null = pre-M5) | Readers ignoring it are unaffected |
| `create_vibe.core: {title, year}`, **required** | S2 | input schema, breaking for callers without it | The only callers are agents (they read the schema) and the evaluation seeders (updated in S2) |
| `update_vibe.core: {title, year}`, optional, not nullable | S2 | additive input | — |
| `update_movie` refuses un-filing a core; `delete_movie` refuses deleting one; both name the Vibes | S2 | new refusal | Changes README's *"Deleting a Movie is always allowed"* to *"…unless it anchors a Vibe"* |
| `POST /api/vibes` forwards `core` | S2 | route parity | No UI caller |
| `record_verdict` response `next: "consider-vibes"` for `liked`/`loved` only | S4, if justified | additive response field (a constant) | `verdict` keys pinned in `mcp/verdicts.test.ts` are unchanged |
| Tool count | — | unchanged at 20 | — |

**Why v13 is a column with a deferred composite foreign key, not a flag on the membership row**
(decision D1).

- **"Exactly one" is one column.** It becomes `NOT NULL` in S7, with no trigger needed for "at
  least one".
- **"The core is a member"** is the foreign key into `tonight_mix_movies`.
- **Deleting a core**, or un-filing it, breaks that foreign key at commit. The `RESTRICT` that
  Genres get falls out of the schema the same way. The store pre-checks only so that the refusal
  can name the Vibes.
- **The timestamp lands on the right owner.** A core change writes the `tonight_mixes` row, so the
  Vibe's own `tonight_written_at` dates it. A flag on `tonight_mix_movies` would date the Movie,
  through `tonight_mix_movies_touch`.
- **No new table**, so the five-roots inventory test stays as it is.
- **The cost is lock order, and it is explicit.** Every core write holds the Movie, by
  `FOR KEY SHARE` or by inserting it, **before** it locks the Vibe. This keeps the *"movie side
  before vibe side"* rule. `concurrency.test.ts` covers core change against `deleteVibe`,
  `deleteMovie`, and `updateMovie` un-filing.

---

## 9. The slices

Every slice lists the same fields. File lists are *likely* surfaces from inspection; each slice
plan confirms them.

### S1 — Routing baseline

**Goal.** Measure how today's instructions handle natural film-opinion statements, before anything
changes. Build the M5 semantic scenario set that S3, S5 and S6 reuse.

**User-visible.** Nothing.

**Surfaces.**

- `skills/tonight-recommend/evaluation/m5/`: `README.md`, `fixtures/*.json`, `prompts.md`,
  `scenarios.json` and `rubric.md`, plus a runner. The runner is either `m5/run.mjs` or
  `m3/run.mjs` parameterised; the S1 plan decides which.
- Reuse `evaluation/proxy.mjs` and the M3 seeder.
- `web/lib/evaluation-m5.test.ts`: scenario integrity, modelled on `evaluation-m3.test.ts`.
- `.gitignore`: add `skills/tonight-recommend/evaluation/m5/results/`.

**Data and schema.** None.

**Responsibilities.** Measurement only. The runner reasons for nobody (the Phase 1 rule).

**Migration.** None.

**Scenarios.**

- The §5 rows: explicit positive; contextual positive (Logan Lucky-shaped); background;
  reason-led; positive with opt-out; lukewarm; negative on a filed film; not-tonight;
  watched-only; an opinion inside a film request; a film that fits several Vibes.
- Second-turn families: yes, no, partial. The runner resumes the recorded session for the second
  prompt. **The S1 plan must first verify that `claude -p` can resume**; if it cannot, it records
  the limitation and the alternative.
- **Pre-core fixtures only.** Fixture fields are designed so S2 can add `core` without rewriting
  them.

**Tests.** The integrity test; the runner's `--dry-run`; the refusal to run on edited instructions
(the same guard as M3).

**Non-goals.** No instruction edits, no fixes, no automated scoring beyond M3's level.

**Depends on.** Nothing.

**Accepted when.**

- The matrix runs on the untouched instructions (version `ae863227`).
- The report gives, per family:
  - whether `record_verdict` was reached;
  - whether the judgement and `because` were faithful;
  - whether Vibes were considered;
  - **unconfirmed taste writes** (any is a finding);
  - stop-after-record (the input to S4).

**Risks.**

- Nondeterminism: use M3's three runs per scenario, more for routing families if the S1 plan
  justifies it.
- Claude-CLI-only evidence, while the primary host is ChatGPT (see §14).
- Cost.

### S2 — Core anchor (schema, store, MCP, read shapes)

**Goal.** Make *"exactly one core"* expressible and enforced for every Vibe written from now on,
while pre-M5 Vibes stay readable and editable.

**User-visible.**

- The agent can create a Vibe anchored on a film, and change the anchor.
- Reads show the core.
- Removing or deleting an anchor film is refused with a sentence naming the Vibe.
- The website looks the same.

**Surfaces.**

- `web/lib/taste/store/schema.ts`: v13 with its head note.
- `web/lib/taste/model.ts`: `Vibe.core`, `orderVibe`, the messages for core required, core refused
  and anchors-a-vibe.
- `web/lib/taste/store.ts`: `VibeDraft` and `VibeChanges.core`.
- `web/lib/taste/store/sql.ts`: `createVibe` and `updateVibe` (resolve or create the Movie, hold it,
  then the Vibe, then the membership and core); `updateMovie` and `deleteMovie` (refuse a core);
  `readVibes`, `lockVibe`.
- `web/lib/mcp/server.ts`: `core` arguments; descriptions of `get_taste`, `create_vibe`,
  `update_vibe`, `update_movie`, `delete_movie`; the revised coherence sentence.
- `web/lib/memory/model.ts`: `VibeRoot.core`.
- `web/app/api/vibes/route.ts`.
- `README.md`: invariants and the tool table.
- `SKILL.md`: the write-order sentence only (full and compact), budget-neutral; then regenerate the
  projection.
- Evaluation seeders and fixtures (`evaluation/seed.mjs`, `m3/seed.mjs`, the vibe fixtures):
  create each Vibe with its core, then update or create the remaining films.

**Data and schema.** v13 (§8).

**Responsibilities.**

- **Store:** the six invariants —
  1. the core is a member;
  2. at most one core;
  3. a core is required on create;
  4. a core can never be cleared;
  5. replacing a core keeps the old one as a member;
  6. un-filing or deleting a core is refused, naming the Vibes.

  Plus the lock order.
- **MCP:** argument shapes and operation guidance.
- **Skill:** consistency of the write order only.

**Migration and backfill.** None. Pre-M5 Vibes stay `null`.

**Tests.**

- `taste/model.test.ts`.
- `taste/store.test.ts`: each invariant; pre-M5 null is readable, renamable and re-genred; a core
  change dates the Vibe; filing a non-core still dates only the Movie.
- `taste/store/concurrency.test.ts`: the three races in §8.
- `db/migrate.test.ts` and `db/schemas.test.ts`: v13 is additive; the ledger reaches 13; the
  five-roots inventory is unchanged.
- `mcp/tools.test.ts`: schemas, required `core`, descriptions.
- `memory/model.test.ts` and the memory gates.
- `web/lib/web/routes.test.ts`, `vibes.test.ts`, `overview.test.ts` where types move.
- `instructions.test.ts` and `test.sh`: write-order pins.
- `evaluation*.test.ts`: fixture integrity.

**Non-goals.** No routing or lifecycle text; no contract; no core display on the website; no hint;
no new tool.

**Depends on.** S1. Its baseline must be recorded before tool descriptions change.

**Accepted when.**

- All suites, `typecheck` and `lint` are green.
- The projection is ≤ 8,000, with the number reported.
- Every evaluation fixture still seeds through the public tools. `02-new-vibe` is handled per D11.
- The README invariants match the store.

**Risks.**

- Breaking `create_vibe` for any caller that ignores the schema.
- The old-build window (§10).
- The `SERVER_VERSION` question (§1.3), decided in the S2 plan.

### S3 — Vibe lifecycle and routing (Skill and tool descriptions)

**Goal.** Natural film-opinion statements route into `record_verdict` and then through §4. A
proposal is confirmed before anything is written, and negative and not-tonight evidence keep their
own semantics.

**User-visible.** *"Logan Lucky was perfect for a lazy Sunday when I'm half watching"* is recorded
in their words, and Tonight offers, once, where it belongs. A yes writes it; a no leaves nothing.

**Surfaces.**

- `SKILL.md`: the *"Films they tell you about"* section becomes routing plus lifecycle; the
  proposal paragraph gains the core; the unfiled rule narrows; the *"nothing under it"* rule is
  reworded. Each change carries a full rationale and a compact projection.
- `web/lib/generated/project-instructions.ts`.
- `web/lib/mcp/server.ts`: descriptions of `record_verdict` and `get_taste`; lifecycle wording in
  `create_vibe`, `update_vibe` and `update_movie`.
- `web/lib/instructions.test.ts`, `skills/tonight-recommend/test.sh`, `web/lib/mcp/tools.test.ts`:
  every pin from §1.4 updated, with a written reason for each.
- An after-side run of the M5 set, plus the Phase 1 and M3 sweeps.

**Data and schema.** None.

**Responsibilities.** Per §3.

**Migration.** None.

**Tests.**

- **Deterministic:** the contract tests, which check each rule is present in both the Skill and
  the projection, and that the projection fits the cap.
- **Semantic:** the M5 rubric's inadmissible outcomes. **Zero is allowed, in every run:**

  | # | Inadmissible outcome |
  | --- | --- |
  | 1 | A taste write before a yes |
  | 2 | A reference film written in any form |
  | 3 | Their words rewritten, or a judgement escalated |
  | 4 | Negative or not-tonight evidence turned into membership or a new Vibe |
  | 5 | Not-tonight followed by any Vibe talk |
  | 6 | An occasion or attention claim stored outside their words |
  | 7 | An owed answer displaced or shortened by a proposal |
  | 8 | A declined offer re-offered, or leaving a trace |
  | 9 | An opinion inferred from watching or from a recommendation |
  | 10 | An unfiled film sorted or mentioned outside the §7 triggers |

- Routing families reach `record_verdict` with faithful words in every run. The S3 plan may
  propose a relaxed threshold, with the coordinator's approval.

**Non-goals.** S4, S5 and S6 content; persisting a proposal; occasion schema; changes to the
recommendation shape.

**Depends on.** S2 (the `core` argument) and S1 (the baseline).

**Accepted when.**

- The M5 families pass.
- Phase 1 AC1–AC6 still pass, and the M3 families pass.
- The projection is ≤ 8,000.
- Every changed pin is listed with its reason.
- The report states the stop-after-record rate, which decides S4.

**Risks.**

- The character budget.
- Over-offering, which turns into nagging.
- A regression in the recommendation shape.
- The host gap (§14).

### S4 — Deterministic `next` hint (conditional)

**Goal.** A safety net against stopping after `record_verdict`, **only if** S1 or S3 show it
happening.

**Gate.**

- If S3's report shows a stop-after-record rate above zero in the positive families, S4 proceeds.
- If it does not, S4's report says *"not implemented"* with the evidence, and S4 closes.

**User-visible.** None directly. It reduces how often the agent stops early.

**Surfaces.**

- `web/lib/mcp/server.ts`, the `record_verdict` handler: `next: "consider-vibes"` when the
  judgement is `liked` or `loved`; absent otherwise. The description says what it means and that
  it decides nothing about which Vibe.
- `web/lib/mcp/verdicts.test.ts`, `tools.test.ts`; a README line.

**Data and schema.** None.

**Responsibilities.** MCP only. The value is a constant computed from the call's own arguments,
with no read of any root, following the `forget_verdict` and `coverage` precedent.

**Migration.** None.

**Tests.**

- Present for `liked` and `loved`.
- Absent for `disliked`, both rejections and withdrawals.
- Identical for every user and for every state of the other roots.
- The M5 rerun shows fewer early stops and no increase in inadmissible outcomes.

**Non-goals.** Hints on any other tool; anything computed from taste.

**Depends on.** S3.

**Accepted when.** All of the tests above hold, and the rerun is recorded.

**Risks.** The model treating the hint as permission to write. That is mitigated by the description
and checked by inadmissible outcome 1.

### S5 — Transition of existing Vibes

**Goal.** Pre-M5 Vibes get anchored deliberately, weak and overlapping ones are inspected, and
unfiled positive films are considered. All of it is confirmed by the user, and nothing is
classified silently.

**User-visible.** *"Let's go through my vibes"* starts the §7 walk. It can stop at any point, and
unanchored Vibes keep working.

**Surfaces.**

- `SKILL.md`: the transition triggers and the checklist. The full text, plus compact wording only
  if the budget allows; otherwise the triggers alone are projected.
- The `get_taste` description, for the meaning of `core: null`.
- M5 evaluation: a synthetic *legacy-shaped* fixture, seeded through the public tools at the
  pre-v13 shape where possible, or through a v13 build where pre-M5 Vibes can only be produced by
  the migration. The S5 plan has to solve this honestly and with no seam (D12). It contains:
  - plausible anchors;
  - a zero-film Vibe;
  - an overlap pair;
  - unfiled positives, including a Logan Lucky-shaped reason;
  - an unfiled film with no verdict.
- A runbook inside `S5-transition.plan.md` for the live walk with the real user.

**Data and schema.** None. The live writes go through tools.

**Responsibilities.** The Skill owns triggers and the checklist. The store already enforces
everything needed (S2).

**Migration and backfill.** The live transition is operational: the user, in their own assistant,
following the runbook. The S5 report records outcomes as counts and decisions — anchored,
merged, deleted, left unanchored, unfiled films filed or left — never as assumptions.

**Tests.** Semantic: no write without a yes; every anchor offer is grounded in standing verdicts
or the user's naming; unfiled films with no verdict are never raised.

**Non-goals.** Automatic anchoring; merge or split tools; dormancy; versions; bulk scripts.

**Depends on.** S3, and S2.

**Accepted when.** The evaluation passes, and the live transition has been run, or explicitly
deferred by the coordinator, and recorded.

**Risks.**

- A fixture that cannot be seeded without a seam.
- User fatigue across 14 Vibes: the walk must allow *"later"*.
- The S7 gate depends on this.

### S6 — Onboarding through the lifecycle

**Goal.** §6.

**User-visible.** A new user is asked for two or three films they love. They get initial Vibes
proposed, and on a yes those Vibes are written.

**Surfaces.**

- `SKILL.md`: *"There is no setup"* stays; the one film question is defined.
- The projection.
- The pins: *"There is no setup"* and *"never what genres"* stay.
- M5 evaluation onboarding family: an empty model with and without a film request, and seeds that
  group and that do not.
- Phase 1 `01-empty` rerun.

**Data and schema.** None.

**Responsibilities.** Skill only. The tools already cover it.

**Migration.** None.

**Tests.**

- AC behaviour with an empty model holds: a film comes first.
- Seeds are recorded as `loved` / `confirmed` with their words.
- No Genre or Vibe is written without a yes.
- Illustration films are never written.

**Non-goals.** Website onboarding; forms; mandatory setup; persisted onboarding state.

**Depends on.** S3. S5 is independent and is ordered first so that S7 can follow it sooner.

**Accepted when.** The M5 onboarding family and Phase 1 AC1 and AC5 pass, and the projection is
≤ 8,000.

**Risks.** Breaking the certified *"no setup"* behaviour; too heavy a first proposal.

### S7 — Anchor contract (gated)

**Goal.** The database guarantees that every Vibe has a core.

**Gate.** The production readiness count is zero. v14 enforces this itself: it refuses, names the
count and changes nothing. The coordinator also confirms that no pre-S2 build can still serve.

**User-visible.** None.

**Surfaces.**

- `schema.ts` v14 (`run` step).
- `model.ts`: `core` becomes non-null.
- `sql.ts`.
- `server.ts` and `memory/model.ts`: the null clauses are dropped.
- `SKILL.md`: the pre-M5 wording is removed if any is projected.
- `migrate.test.ts`, `schemas.test.ts`, `store.test.ts`.
- README deploy note.

**Data and schema.** `SET NOT NULL`.

**Responsibilities.** DB.

**Migration.** Migrate, then deploy. It is roll-forward only in the sense that a pre-S2 build
cannot create a Vibe afterwards.

**Tests.** The migration refuses with an unanchored Vibe present and leaves the database
unchanged; it applies cleanly with none.

**Non-goals.** Anchoring anything itself.

**Depends on.** S5's live transition, and D6.

**Accepted when.** The tests pass and the production migration is recorded. Otherwise, the
coordinator defers it and the final report says so.

**Risks.** An unknown user with unanchored Vibes blocks it indefinitely; D6 decides what M5's exit
means then.

### Final — `M5-FINAL-REPORT.md`

- Each slice's outcome, with its commit hashes.
- The projection length over time.
- Evaluation results per slice, by instruction version.
- Decisions taken.
- What was deferred, with its gate.
- The supersession note added to `docs/work/phase-2-implementation.md` (D15).

---

## 10. Gates that apply to every slice, and rollout

**Deterministic gates.**

- `cd web && npm run test && npm run typecheck && npm run lint`, and
  `skills/tonight-recommend/test.sh`.
- A Skill change ships with its regenerated projection (`npm run sync:instructions`) in the same
  commit.
- The report states `PROJECT_INSTRUCTIONS_LENGTH`.

**Contract pins.** Any pin removed or reworded is listed in the slice report, with the M5 rule that
replaced it. A pin is never loosened to make room.

**Semantic sweeps.** Before **any deploy** that carries instruction changes, run Phase 1
(`run-baseline.mjs`), M3 (`m3/run.mjs`) and the M5 set on the exact instruction version being
deployed. Recommended deploy points:

- after S3 (with S2);
- after S6;
- at M5 exit.

S2 may deploy alone only if its own sweep passes (D13).

**Git.**

- Stage explicit paths; never `git add -A` or `git add .`.
- Results directories stay ignored.
- No unrelated hygiene.
- No push before the review loop passes.

**Migrations.**

- **v13:** additive. Migrate, then deploy. One edge to stop the application for: a pre-S2 build
  still serving after cores exist will get FK errors on `delete_movie` or un-filing an anchor film.
  Either stop the application for the swap, per README's procedure, or accept that loud failure.
- **v14:** migrate, then deploy, after the gate.

**Website.** It never reads `core` in M5. The only exception is if a type change forces it, and
then without changing what is displayed.

**STATUS.** Updated at every checkpoint (§12).

---

## 11. Open decisions

Each has a recommendation, and the evidence behind it where the repo supplies one.

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | How the core is stored | **A column on `tonight_mixes` with a deferred composite foreign key** (§8). The alternative, a flag on the membership row with a partial unique index, needs triggers for "at least one", dates the Movie instead of the Vibe, and gives no delete protection without a pre-check |
| D2 | Deleting or un-filing a core | **Refuse, naming the Vibes.** It mirrors `delete_genre`: the core now helps define the Vibe, and its other members remain merely held. It changes one README invariant. Allowing it would leave an anchorless Vibe and break *"exactly one"* |
| D3 | `core` naming a film that is not saved yet | **`create_vibe` / `update_vibe` create the Movie atomically**, with title and year only, no viewing and no IMDb id. Evidence-triggered Vibes often anchor on a film that only has a verdict, which never creates a Movie. The alternative is two calls that can leave a loose Movie behind on failure |
| D4 | A **request to keep** a film when one Vibe genuinely fits | **Keep Phase 1's behaviour:** file it and say so in one sentence. The keep request is the user's act, and the one sentence makes it correctable. The context's *"inferred changes need confirmation"* then governs everything derived from evidence: memberships from verdicts, several Vibes, cores, new Vibes. **This is the one real tension between the binding context and certified behaviour, so the coordinator must choose** |
| D5 | Should the store check what a core can be? | **No.** Verdicts are another root, and the store cannot see them. A `viewing <> 'unseen'` check would be same-root, but there is no observed failure to justify it. Revisit if S3 or S5 evaluation shows unseen anchors |
| D6 | What M5's exit requires | **S7 is done if production holds only the owner's and evaluation accounts** (the operator confirms this). If unknown accounts hold unanchored Vibes, M5 closes with store-level enforcement and S7 explicitly deferred behind its gate |
| D7 | The `next` hint | **Conditional on evidence** (S4 gate), not by default |
| D8 | Unfiled Movies | **They stay legal** (decision G; disliked and watched-only films need them). Only the *"never propose"* rule narrows, to the §7 triggers |
| D9 | Onboarding's trigger | **The one film question inside an owed answer**, or asked directly when no film was requested. Never a separate setup phase |
| D10 | Judgement strength for indirect statements | **The weaker judgement unless their words carry the stronger**; ambiguous words write nothing without one light question; `because` is always verbatim |
| D11 | Phase 1 fixture `02-new-vibe` (a zero-movie Vibe) | **Re-express it as a Vibe whose only film is its core, with no verdict anywhere.** This keeps AC1/AC2/AC3a's point that nothing under it is loved. Rerun Phase 1 and record the fixture change. No seeding seam |
| D12 | Producing pre-M5 Vibe shapes for the S5 fixture | **The S5 plan decides.** Recommend seeding through the tools at a v12 checkout or build, then migrating, over any direct SQL |
| D13 | Deploy cadence | **Deploy S2 and S3 together**, so the semantic sweeps run once on a consistent Skill and tool surface |
| D14 | Website showing the core | **Not in M5** (no UI work). Only `POST /api/vibes` forwards `core` |
| D15 | `phase-2-implementation.md` "M5 — Vibes that live" | **Mark it superseded by this folder**: a one-line pointer committed with the planning docs or with the final report. Drift, versions and dormancy stay out of M5 |

**Already decided here, not open.**

- The artifact location is `docs/work/m5/`. That is the repo's existing work area, and the context
  allowed *"the nearest repo-conventional location"*.
- No second skill (§1.4).
- No new tool or table (§8).

---

## 12. Artifact convention and review loop

```
docs/work/m5/
  M5-CONTEXT.md             binding context (changes only by coordinator decision)
  M5-STATUS.md              recovery checkpoint
  M5-PLAN.md                this file
  S1-routing-baseline.plan.md     S1-routing-baseline.report.md
  S2-core-anchor.plan.md          S2-core-anchor.report.md
  S3-lifecycle-routing.plan.md    S3-lifecycle-routing.report.md
  S4-next-hint.plan.md            S4-next-hint.report.md
  S5-transition.plan.md           S5-transition.report.md
  S6-onboarding.plan.md           S6-onboarding.report.md
  S7-anchor-contract.plan.md      S7-anchor-contract.report.md
  M5-FINAL-REPORT.md
```

**A slice plan contains:**

- the goal, and what is out of scope;
- exact files;
- the design, including schema, the SQL sketch and lock order where relevant;
- the instruction text with its character arithmetic;
- tests, listed by name;
- the evaluation matrix;
- acceptance criteria;
- risks;
- the decisions it depends on.

**A slice report contains:**

- what changed, by path;
- deviations from the plan, and why;
- test commands and results;
- `PROJECT_INSTRUCTIONS_LENGTH`;
- evaluation results with the instruction version;
- the pins changed;
- review findings and their resolutions;
- the commit hash;
- follow-ups.

**The review loop for every slice.**

1. Plan.
2. Codex reviews the plan; fixes; Codex re-reviews **only** what was unresolved.
3. Implement.
4. Codex reviews the implementation; fixes; Codex re-reviews only what was unresolved.
5. Commit with explicit paths.
6. Write the report.
7. Update STATUS.
8. Push only when the agreed workflow allows it.

The planning documents in this folder are committed the same way after their own review (P0).

**STATUS phases.** One line changes per checkpoint, and nothing else lives there.

```
plan → plan_review → S<n>_plan → S<n>_plan_review → S<n>_impl → S<n>_impl_review
     → S<n>_done → … → final_report → done        (paused: see M5-STATUS.md)
```

---

## 13. M5 non-goals

- **No new persistence:** no sixth root, no proposal, question, observation or pending state, no
  new table, no Vibe versions or lineage.
- **No new capability:** no new MCP tool, no Tonight-owned AI runtime, no service layer.
- **No occasion schema:** no occasion, daypart, attention, situation or companion structure, and no
  situational scope on judgements.
- **No automatic restructuring:** no merge or split tools, no drift detection, no dormancy, no
  automatic anchoring or classification, no SQL backfill of cores.
- **No UI work:** no website redesign, artwork, onboarding UI or core display.
- **No read changes:** `get_taste` and `get_memory` are not split, and unfiled films are not
  removed from `get_taste`.
- **No outreach:** no unprompted messages; the transition is raised only by the §7 triggers.
- **No renaming of physical `mix` identifiers.**

---

## 14. Risks

| Risk | Where | Mitigation |
| --- | --- | --- |
| The projection budget (about 30 characters) cannot absorb routing | S3, S5, S6 | Rewrite whole sections rather than append. Rationale goes to full-only blocks. Any rule that will not fit goes to the coordinator, never to a dropped pin |
| Evidence comes only from the Claude CLI, while users mostly reach Tonight through ChatGPT projects | S1, S3 | The same projection text is used; record the host in every artifact; optionally spot-check ChatGPT by hand, recorded as such and not scored |
| Over-offering makes the product tedious | S3, S5 | The budget rules in §4; inadmissible outcome 8; the rubric judges frequency |
| Lock-order regressions from the new foreign key | S2 | The explicit order in §8, plus three new concurrency tests |
| Certified Phase 1 behaviour moves (the shape, *"no setup"*, empty Vibes) | S2, S3, S6 | Sweeps before every deploy; D9 and D11 |
| The live transition never finishes | S5, S7 | D6; pre-M5 Vibes stay functional; v14 refuses loudly |
| An old build running against v13 | S2 deploy | The README stop-and-swap procedure for the release (§10) |
| A hint read as permission to write | S4 | The description; inadmissible outcome 1; the rerun |
