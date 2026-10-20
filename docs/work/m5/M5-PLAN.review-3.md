# M5-PLAN — Codex review 3 (findings on file)

**What this is.** Codex's review of `M5-PLAN.md` **revision 3** returned **NOT READY**. All five
review-2 points (R2-1…R2-5) are confirmed closed. Two points remain, relayed by the coordinator on
2026-10-20. They are preserved here and resolved in `M5-PLAN.md` → *Revision 4*. As with reviews 1
and 2, the point *text* is the coordinator's relay, not verbatim Codex; overwrite it with the
verbatim review if it is recovered. Nothing is implemented; the plan stays PLAN ONLY until Codex is
READY on revision 4.

---

## Findings (NOT READY until the re-review clears them)

### R3-1 — a recommendation-only flow loses the Vibe reading rule
- **Anchor:** Revision 3 *What moves vs stays*, row 1 (lines 72–76 move to `tonight-vibes`);
  *Cross-skill routing*.
- **Concern (relayed):** moving *"Read a Vibe as its own instruction plus its Genres"* out of
  `tonight-recommend` leaves a conversation that only recommends — where ChatGPT may select only
  `tonight-recommend`, and where the project projection has no second skill at all — without the
  rule for reading the Vibes it recommends from. Keep it by a minimal consumer rule in recommend, or
  by explicit routing, and prove it with a recommendation-only acceptance case.
- **Resolution (rev 4, R3-1):** a minimal consumer rule — the sentence at 72–73 stays in
  `tonight-recommend`, unmarked (already pinned by `test.sh` 187–191), so it ships in the projection
  and in every plugin conversation; no routing. A recommendation-only acceptance case joins the S1
  set and runs on the projection, on `tonight-recommend/SKILL.md` alone, and on the canonical plugin.

### R3-2 — project projection vs plugin gates
- **Anchor:** Revision 3 *Where it lands, budget, packaging* ("the full Vibe lifecycle is
  plugin-only"; "`sync:instructions` decides what, if any, of `tonight-vibes` it projects"); §9 S3
  *Tests* ("each rule is present in both the Skill and the projection") and *Surfaces* ("each change
  carries … a compact projection"); §3.
- **Concern (relayed):** Revision 3 calls the lifecycle plugin-only while S3 still requires every
  rule in the projection. Define precisely what remains in the ≤ 8,000 project projection, which
  behaviour is plugin-only, and which evaluation gates run against the two full plugin skills; and
  supersede the contradictory S3 wording.
- **Resolution (rev 4, R3-2):** the projection stays `tonight-recommend`'s alone (source
  unchanged). It keeps everything it carries today: the extraction moves only `full:` text and is
  gated on a byte-identical projection. It gains only three named M5 deltas (S2 write order, the S3
  floor, the S6 question). The lifecycle, the transition, onboarding grouping and the handoff
  pointer are plugin-only. Shared tool metadata is host-neutral. A gate table assigns each gate to
  the projection or to the two full skills. S3's "every rule in the projection" wording and the
  related §0, §3, S5 and Revision 3 budget wording are superseded.

---

## Scope of the focused re-review
R3-1 and R3-2 only, both in `M5-PLAN.md` → *Revision 4*. Revisions 1–3's cleared substance is not
reopened.
