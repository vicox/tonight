# Baseline results

What the **current, unmodified** instructions do — instruction version `f098fd5b`.

```
  runs/             one file per model run, in the format in ../../README.md    60 runs
  runs/snapshots/   what get_taste answered immediately before each run         60 files
  runs/logs/        the proxy's record of every call each run made              60 files
```

> **`runs/snapshots/` is the only record of what a run saw.** There used to be a second set beside
> it — one recording per fixture, taken when the fixtures were first materialised — and it was
> described as the input every agent received. It was not: a fixture seeded again before a sweep
> gets new rows and new timestamps, so the two sets disagreed while both claimed to be the input.
> The per-run snapshot is the one taken immediately before its own run and bound to it by digest,
> so it is the one that can be proved. The other set is gone rather than demoted, because two
> records that both look authoritative is the problem.

Recorded with `claude -p` (Claude Code CLI, `--bare`), model `sonnet`, one fresh process per run,
`external_tools: disabled`. Twelve fixture-prompt pairs, five runs each.

Every run names its own snapshot by digest and its own proxy log by path, so what the model saw is
provable per run rather than inferred from the fixture.
