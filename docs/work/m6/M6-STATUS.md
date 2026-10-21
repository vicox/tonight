# M6 status

Coordination recovery only — where M6's workflow stands, not anything about product state.

```
milestone:    M6 — refusals stay refused; an unseen film is never a core; a moodless request is answered
state:        RELEASE AUTHORISED by the user (2026-10-22). Codex READY for every reviewed change.
              Ships by merging tonight-m6 to main (Vercel deploys main to Production).
worktree:     /Users/vicox/relay-work/worktrees/tonight-m6
branch:       tonight-m6   (fast-forwarded 06e07a7 → 2cdc336 = origin/main, PR #4, before any change)
committed:    b9cb8a3 harness · aa2514f store · 86af75a instructions · dd1f4a1 docs ·
              40c6e8a review-1 fix · 820d02b READY · 6264ac9 thresholds · 78b5eb1 login host ·
              46dc4d3 + e6793f6 lean harness · c56f566 G3/U1 fix · then this release-docs commit
plan:         docs/work/m6/PLAN.md   (revision 2, Codex PLAN READY)
report:       docs/work/m6/M6-IMPLEMENTATION.report.md
acceptance:   docs/work/m6/M6-ACCEPTANCE.md   (release section at the top)
projection:   7,996 / 8,000, version 14ed60de (was 7,930, a22a09f4)
plugin:       1.3.0 (manifest diff vs 2cdc336: the version line only); ZIP built from the final commit
updated:      2026-10-22
```

## After release (user)

- Re-paste the project instructions (version `14ed60de`) into the ChatGPT project.
- Upload the 1.3.0 plugin ZIP and run the manual iOS pass.
- Clean up existing unseen cores (no migration; the store refuses new ones).
- Ops: remove this worktree, and the local `tonight-m6-baseline` branch, once M6 is merged and deployed.
