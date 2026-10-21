# M6 status

Coordination recovery only — where M6's workflow stands, not anything about product state.

```
milestone:    M6 — refusals stay refused; an unseen film is never a core; a moodless request is answered
state:        IMPLEMENTED and Codex implementation READY (review 2; review 1's one blocker —
              D4's non-empty precondition — fixed in 40c6e8a). Committed, not pushed.
worktree:     /Users/vicox/relay-work/worktrees/tonight-m6
branch:       tonight-m6   (fast-forwarded 06e07a7 → 2cdc336 = origin/main, PR #4, before any change)
committed:    b9cb8a3 harness · aa2514f store · 86af75a instructions · dd1f4a1 docs ·
              40c6e8a review-1 fix · then the READY record
plan:         docs/work/m6/PLAN.md   (revision 2, Codex PLAN READY)
report:       docs/work/m6/M6-IMPLEMENTATION.report.md
projection:   7,999 / 8,000, version 410eb470 (was 7,930, a22a09f4)
plugin:       1.3.0 (manifest diff vs 2cdc336: the version line only)
updated:      2026-10-21
```

## Pre-deploy acceptance (docs/work/m6/M6-ACCEPTANCE.md)

- Production unseen-core count: not run, no credential reaches the implementing session.
- Seeding preflight: every non-legacy M6/M5/M3/Phase 1 fixture seeds cleanly at 820d02b.
- Semantic sweeps: not run (`claude -p` needs an approval the session cannot give); thresholds
  fixed in advance.
- Manual iOS plugin pass: the user's; rebuild the ZIP at 820d02b first (dist/ copy is stale).

## Next (coordinator)

- Shell gates and the 1.3.0 package build/test (not executable in the implementing session).
- The production read-only unseen-core count before deploy.
- Semantic: the M6 baseline at `b9cb8a3`; fix the thresholds; then at `86af75a` the M6 set, the M5
  set on all three sources, and Phase 1 + M3 on the projection; then the manual plugin pass.
- Push/merge/deploy only when approved.
