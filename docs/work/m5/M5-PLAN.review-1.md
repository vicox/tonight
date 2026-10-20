# M5-PLAN — Codex review 1 (findings on file)

**What this is.** The place `M5-STATUS.md` reserved for Codex's first review of `M5-PLAN.md`. The
verbatim Codex output never reached this worktree. The coordinator has now relayed the review as a
list of **named NOT READY findings**; they are preserved here, each reconstructed against the plan
section it touches, so the focused re-review has a concrete target list.

**Status of this record.** The finding *labels* are the coordinator's (2026-10-20). The *concern*
and *anchor* under each are **reconstructed** from the plan text, not quoted from Codex. If the
verbatim Codex review is recovered, overwrite the concern text here with it; the labels, anchors
and the revision-2 resolutions should still line up.

**How they are resolved.** None is implemented. Each is answered in `M5-PLAN.md` → *Revision 2
(2026-10-20)*, which supersedes the specific passages it names. The plan stays PLAN ONLY until
Codex approves revision 2.

---

## Findings (NOT READY until the re-review clears them)

### F1 — reset order
- **Anchor:** §1.5; §9 S1 and S2 (evaluation seeders/fixtures); D11; D12; §10 (migrations).
- **Concern (reconstructed):** once `create_vibe` requires a core (S2), the evaluation harness can
  no longer reset-and-reseed a zero-movie Vibe, and the pre-M5 "legacy" shapes S5 needs can only be
  produced by seeding at an older shape and then migrating. The plan reseeds but never pins the
  reset → seed → (migrate) order, which risks a seeding seam the plan elsewhere forbids.
- **Resolution (rev 2, F1):** pin the order — reset, then create each Vibe **with its core** before
  members; `02-new-vibe` re-expressed per D11; legacy shapes seeded at a v12 build then migrated
  (D12), never by direct SQL. Exact legacy mechanism stays delegated to the S5 plan; the ordering
  invariant is stated.

### F2 — onboarding batch exception
- **Anchor:** §4 ("Asking has a budget": at most one new-Vibe idea per offer) vs §6 ("The offer
  covers all the initial Vibes").
- **Concern (reconstructed):** §6 onboarding proposes several Vibes in a single offer, which
  contradicts §4's one-new-Vibe-per-offer budget. The exception is implied but never stated or
  bounded.
- **Resolution (rev 2, F2):** state the exception explicitly and bound it — during onboarding only,
  one offer may propose several initial Vibes, each grouped **solely from the 2–3 seed films the
  user named**, under one confirmation, nothing written without a yes. Outside onboarding §4 is
  unchanged.

### F3 — routing / next-hint opt-out
- **Anchor:** §4 polarity ("positive, but declining more of the kind → stop"); §5 row *"good, but I
  don't need another movie like this"*; S4 (`next: "consider-vibes"` on every `liked`/`loved`).
- **Concern (reconstructed):** the opt-out case writes `liked` yet must not enter Vibe
  consideration, but the S4 deterministic hint fires on all `liked`/`loved` (it is a constant from
  the call's own arguments and cannot see the opt-out), so the hint can contradict the opt-out and
  invite nagging.
- **Resolution (rev 2, F3):** the hint is a **non-binding safety net owned by the Skill**; the
  opt-out rule overrides it; the hint never authorises an offer or write (inadmissible outcomes 1
  and 8). S4 stays conditional (D7).

### F4 — instruction budget
- **Anchor:** §1.4; §14; the M4.5-era revisit note in `M5-STATUS.md`.
- **Concern (reconstructed):** the budget assumes a single ≈7,970/8,000 project projection and
  (post-M4.5) *several* narrowly owned skills. The canonical plugin shipped **one** skill that
  carries the full `SKILL.md`, alongside the still-capped project projection — so the budget must
  be modelled per surface, and the "≈30 characters of headroom" no longer describes the plugin
  path.
- **Resolution (rev 2, correction 1):** three-surface budget — project projection (hard 8,000 cap,
  binding), plugin `SKILL.md` (full file, not 8,000-capped), MCP tool descriptions; kept in sync by
  `sync:instructions`; `PROJECT_INSTRUCTIONS_LENGTH` still reported for the project path.

### F5 — eval rubric
- **Anchor:** §9 S1 "Accepted when" and S3 rubric (the ten inadmissible outcomes); §1.5.
- **Concern (reconstructed):** the rubric is defined in S3, but S1 builds the scenario set S3
  reuses and must score the baseline; the pass bar ("zero inadmissible in every run"; "the S3 plan
  may propose a relaxed threshold") is under-specified and does not record which host produced the
  evidence.
- **Resolution (rev 2, F5):** pin the rubric in **S1** (`scenarios.json` + `rubric.md`), carrying
  the ten outcomes verbatim, with an explicit scoring method, a coordinator-approved threshold, and
  a **host column** (CLI projection / ChatGPT project / ChatGPT plugin). The ten outcomes are
  unchanged.

### F6 — anchor gate
- **Anchor:** S7; D6; §8 (taste v14); §14.
- **Concern (reconstructed):** S7's `SET NOT NULL` gate hinges on "production holds only the owner's
  and evaluation accounts," but the plan does not say how that is confirmed or what M5 exit means if
  unknown accounts hold unanchored Vibes; the live transition (S5) may never finish, blocking S7
  indefinitely.
- **Resolution (rev 2, F6):** S7 proceeds only on an operator-confirmed count of unanchored Vibes =
  0 across all accounts; the v14 `run` step refuses and names the count, changing nothing, when any
  remain; otherwise M5 exits with store-level enforcement (S2) and S7 explicitly deferred behind
  its gate (D6), recorded in the final report.

### F7 — PostgreSQL concurrency
- **Anchor:** §8 D1 (deferred composite FK); §1.1 (lock discipline); S2 `concurrency.test.ts`.
- **Concern (reconstructed):** the deferred `MATCH SIMPLE INITIALLY DEFERRED` composite FK plus the
  "movie side before vibe side" lock rule introduce races — a core write against a concurrent
  `deleteMovie` / `updateMovie` un-filing / `deleteVibe` could deadlock or defer the violation to
  commit in a way the existing retry logic does not cover.
- **Resolution (rev 2, F7):** pin the core-write lock protocol (hold the core Movie via
  `FOR KEY SHARE`, or insert it, **before** locking the Vibe; confirm ids after locking; keep
  `inLockOrder`); state the deferred-constraint-at-commit semantics; the three named races are the
  `concurrency.test.ts` cases. SQL sketch delegated to the S2 plan.

### F8 — superseded old section
- **Anchor:** §1.7; D15.
- **Concern (reconstructed):** `docs/work/phase-2-implementation.md` "M5 — Vibes that live" (drift
  written automatically, Vibe versions, dormancy, split/merge) conflicts with the five-roots rule
  and is superseded by this folder, but the supersession is only a planned one-line pointer and the
  old section still reads as live; its concepts must not leak into M5 slices.
- **Resolution (rev 2, F8):** confirm the one-line "superseded by `docs/work/m5/`" pointer (D15),
  committed with the planning docs or the final report; §13 already excludes drift, versions,
  dormancy and split/merge, and no slice re-imports them. Pointer edit deferred until commits are
  authorised.

---

## Also carried into revision 2 (not in the eight labels)

- **Canonical-plugin compatibility** is the overarching driver: the merged plugin (main `15a6095`)
  is one skill shipping the full `SKILL.md`, no always-on kernel; routing is ChatGPT's selection
  over the skill description and MCP tool metadata. Revision 2 re-reads §1.4, §3, §9 S1 baseline,
  §10 and §14 against that fact.
- **Self-found citation error (rev 1):** §1.4 cites `tools.test.ts` 654–659 as pins on Skill
  wording; those are leak tests. Only `tools.test.ts` 528 pins a tool description. Corrected in
  revision 2.

## Scope of the focused re-review
Only F1–F8, the canonical-plugin compatibility corrections (budget, ownership, gates/eval,
baseline) and the citation correction — all collected in `M5-PLAN.md` → *Revision 2*. Revision 1's
approved substance is not reopened.
