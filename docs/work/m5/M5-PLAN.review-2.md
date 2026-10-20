# M5-PLAN — Codex review 2 (findings on file)

**What this is.** Codex's review of `M5-PLAN.md` **revision 2** returned **NOT READY**. The
coordinator relayed five points (2026-10-20). They are preserved here and resolved in `M5-PLAN.md`
→ *Revision 3*. As with review 1, the point *text* is the coordinator's relay, not verbatim Codex;
overwrite with the verbatim review if it is recovered. Nothing is implemented; the plan stays PLAN
ONLY until Codex is READY on revision 3.

**Cleared (2026-10-20).** Codex's review of revision 3 confirmed R2-1…R2-5 closed. Its two new
points are filed in [`M5-PLAN.review-3.md`](M5-PLAN.review-3.md).

---

## Findings (NOT READY until the re-review clears them)

### R2-1 — target vs current one-skill distinction
- **Anchor:** Revision 2 ("the canonical plugin is one skill"); §1.4; §3.
- **Concern (relayed):** the plan conflates the **current** one-skill package with the **target**
  skill structure. It must distinguish them, especially now that M5 adds a second skill.
- **Resolution (rev 3):** *Skill inventory: current vs target* — current = `tonight-recommend`
  only; M5 target = `tonight-recommend` + `tonight-vibes`; the broader M4.5 taste/model split is
  documented and deferred to the post-M5 audit. Budget/ownership/gates reference the two-skill
  target.

### R2-2 (F1) — explicit Vibes→Movies→Genres teardown plus repeat reseed
- **Anchor:** Revision 2 F1; §1.5; §9 S1/S2 seeders; D11/D12.
- **Concern (relayed):** the reset step must tear the graph down **explicitly** in dependency order
  Vibes → Movies → Genres, and reseed **fresh on every run**, not once.
- **Resolution (rev 3, #2):** pin teardown Vibes → Movies → Genres (Vibes first releases the core
  FK, memberships and the Genre `RESTRICT`; then non-core Movies; then unreferenced Genres), then
  reseed, repeated per run; seed each Vibe with its core before members (D11); legacy shapes via
  v12-seed-then-migrate (D12).

### R2-3 (F3) — exclude intentional opt-outs from the missed-consideration metric
- **Anchor:** Revision 2 F3; §5 ("I don't need another of these"); §9 S1/S3; S4 gate.
- **Concern (relayed):** the metric that flags missed Vibe consideration / stop-after-record must
  **exclude intentional opt-outs**, so a correct opt-out stop is never scored as a miss.
- **Resolution (rev 3, #3):** the metric counts only the positive families that should consider
  Vibes; intentional opt-outs (declined-more-of-the-kind, not-tonight, negative) are excluded — a
  stop there is a pass. The S4 hint still fires on `liked`/`loved`; the opt-out stays Skill-owned.

### R2-4 (F5) — require manual canonical-plugin semantic acceptance scenarios
- **Anchor:** Revision 2 F5; §10; §14.
- **Concern (relayed):** automated CLI evaluation is not enough; require **manual semantic
  acceptance scenarios run on the canonical plugin** (the real ChatGPT plugin).
- **Resolution (rev 3, #4):** add a required manual acceptance pass on the canonical plugin (real
  ChatGPT account, iOS the hard surface) over a fixed scenario set — routing, lifecycle, opt-out,
  onboarding, cross-skill handoff — recorded as evidence; complements the CLI rubric; a gate for
  instruction-changing deploys; coordinator-run (no web access here).

### R2-5 (F7) — real PostgreSQL concurrency tests executed, not skipped
- **Anchor:** Revision 2 F7; §8 D1; §9 S2; §10.
- **Concern (relayed):** the concurrency tests must run against **real PostgreSQL** and actually
  execute — not skipped, mocked, or conditionally skipped when no database is present.
- **Resolution (rev 3, #5):** the three core-write races (vs `deleteVibe`, `deleteMovie`,
  `updateMovie` un-filing) run against real PostgreSQL and must execute and pass; S2 acceptance
  records their execution.

---

## Also in revision 3 (user decision, not a Codex point)
- **Vibes extraction into a second skill.** M5 extracts only the Vibes-related guidance from
  `tonight-recommend/SKILL.md` into `tonight-vibes/SKILL.md`; verdict/memory/onboarding are not
  extracted now (post-M5 audit). Revision 3 gives the precise move/stay map (by line range), the
  cross-skill routing approach, the S3 scope addition, and the packaging/budget implications.

## Scope of the focused re-review
R2-1…R2-5 and the Vibes-extraction addition, all in `M5-PLAN.md` → *Revision 3*. Revisions 1–2's
cleared substance is not reopened.
