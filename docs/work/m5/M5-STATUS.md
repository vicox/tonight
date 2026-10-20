# M5 status

Coordination recovery only — where M5's workflow stands, not anything about product state.
Updated only when a workflow checkpoint advances.

```
milestone:    M5 — Vibe lifecycle (+ Vibes-guidance extraction into a second skill)
state:        IMPLEMENTED and Codex implementation READY (review 2). Committed, not pushed.
phase:        S1 harness, S2, S3, S5 (skill + fixture), S6 and D15 done; S4 not implemented (no
              evidence for its gate yet); S7 deferred behind its gate (D6). Next are the
              coordinator's deployment gates: baseline and semantic sweeps, manual canonical-plugin
              acceptance, S4 decision, S5 live walk, S7 operator count.
actor:        coordinator
worktree:     /Users/vicox/relay-work/worktrees/tonight-m5
branch:       tonight-m5   (fast-forwarded f63875c → 15a6095 = tonight main, before any change)
committed:    a38eed7 S1 harness · f7b5dc6 S2 core anchor · 4b877b2 S3/S5/S6 skills and
              projection · then the docs commit carrying this file. Nothing pushed.
context:      docs/work/m5/M5-CONTEXT.md
plan:         docs/work/m5/M5-PLAN.md   (revision 4, PLAN READY)
review-1..3:  docs/work/m5/M5-PLAN.review-{1,2,3}.md   (all cleared)
report:       docs/work/m5/M5-IMPLEMENTATION.report.md   (implementation reviews 1–2 at the top)
projection:   7,930 / 8,000, version a22a09f4 (was 7,973, ae863227; the extraction step alone
              left it byte-identical)
updated:      2026-10-20
```

## Next (coordinator)

- Record the S1 baseline at `a38eed7` (instructions untouched): `m5/run.mjs` on `projection`,
  `plugin-skills` (= the untouched recommend skill there) and `recommend-only` — `m5/README.md`,
  *The baseline (S1)*. Needs `web/.env.local`, the dev server and `claude -p`.
- At the S2+S3 commits: Phase 1, M3 and the M5 set on all three sources; the legacy fixture one
  scenario per v12 seed-and-migrate cycle.
- Manual canonical-plugin acceptance (bump the plugin manifest `version` before re-upload).
- S4 decision from the plugin-skills missed-consideration rate; S5 live walk; S7 count.
- Push/merge only when the coordinator decides.
