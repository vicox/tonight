# M6 status

Coordination recovery only — where M6's workflow stands, not anything about product state.

```
milestone:    M6 — refusals stay refused; an unseen film is never a core; a moodless request is answered
state:        IMPLEMENTED and committed, awaiting Codex implementation review. Not pushed.
worktree:     /Users/vicox/relay-work/worktrees/tonight-m6
branch:       tonight-m6   (fast-forwarded 06e07a7 → 2cdc336 = origin/main, PR #4, before any change)
committed:    b9cb8a3 harness · aa2514f store · 86af75a instructions · then the docs commit
plan:         docs/work/m6/PLAN.md   (revision 2, Codex PLAN READY)
report:       docs/work/m6/M6-IMPLEMENTATION.report.md
projection:   7,993 / 8,000, version fd2c3519 (was 7,930, a22a09f4)
plugin:       1.3.0 (manifest diff vs 2cdc336: the version line only)
updated:      2026-10-21
```

## Next (coordinator)

- Shell gates and the 1.3.0 package build/test (not executable in the implementing session).
- The production read-only unseen-core count before deploy.
- Semantic: the M6 baseline at `b9cb8a3`; fix the thresholds; then at `86af75a` the M6 set, the M5
  set on all three sources, and Phase 1 + M3 on the projection; then the manual plugin pass.
- Push/merge/deploy only when approved.
