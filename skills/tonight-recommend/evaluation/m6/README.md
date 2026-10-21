# M6 — refusals, unseen films and moodless requests, evaluated

Whether a film they turned down stays turned down exactly as far as they said, whether a film they
have not seen stays a candidate and never becomes evidence or a core, and whether a request with
no mood is still answered — the plan is `docs/work/m6/PLAN.md`, §5.2.

| file | what it is |
| --- | --- |
| `scenarios.json` | the matrix: fixture, request, an optional second turn, the family, its gate, the sources it runs on |
| `prompts.md` | every request, verbatim |
| `rubric.md` | how a run is scored: the required outcomes per family, the twelve inadmissible outcomes, the gate |
| `fixtures/` | the five models the scenarios start from |

There is no runner of its own: M5's runs this set with `--set m6`, with the same three sources,
the same reseed of every run through the M3 seeder (**vibes, then films, then genres** torn down,
then written again through the public tools), the same snapshots and the same second-turn resume.

## One date per run

Evening refusals are named by the evening's date, so a run fixes one local date **`D`** when it
starts, and uses it three ways:

- the seeder writes `D` wherever a fixture says `@today` (`--today D`);
- the agent is told `D` in one host line appended to its instructions — `Today's date is D.` —
  the way ChatGPT tells a model the date;
- the artifact records `D` as `today`, and the rubric scores against it.

A run that ends on another date than it started straddled midnight. It is **void**: marked failed
with the two dates, and rerun rather than scored. Nothing here claims that an evening continues past
midnight, and nothing tests it.

## Running it

```bash
cd web && npm run dev                                          # the server the proxy fronts
node skills/tonight-recommend/evaluation/m5/run.mjs --set m6 --source projection --dry-run
node skills/tonight-recommend/evaluation/m5/run.mjs --set m6 --source projection
node skills/tonight-recommend/evaluation/m5/run.mjs --set m6 --source plugin-skills
node skills/tonight-recommend/evaluation/m5/run.mjs --set m6 --source recommend-only
```

It needs `web/.env.local` (the seeder mints its tokens from it) and refuses to run while either
`SKILL.md`, the generated projection or the MCP server differs from `HEAD`. Results go to
`m6/results/`, which is ignored.

**The host.** `--bare` is the default and authenticates only with `ANTHROPIC_API_KEY`. On a
machine with only the user's normal Claude login, add `--host login` to any runner (this one,
M3's, Phase 1's). That host is not `--bare`, and `evaluation/host.mjs` says exactly what it is:
no user or project settings, skills, CLAUDE.md or memory, but the CLI's own context still
reaches the agent. Its artifacts say so in a `host_isolation` line, and its results go in a
`-login` directory: a login recording is never mixed with, or compared as, a bare one.

## The baseline, and what comes after it

- **The baseline** is recorded at the commit that adds this harness and nothing else of M6, on the
  instructions as M5 left them (`a22a09f4`), on `projection` and `plugin-skills`. It is
  measurement, not a gate. M5's own post-change sweep can run on that same commit.
- **After M6's changes:** this set on every source its families list, at the rubric's gate; the M5
  set on all three sources as a regression, at zero of M5's ten outcomes; and Phase 1 and M3 on the
  projection, where the empty-model and failed-read fixtures are the moodless rule's regression
  cases.
- **By hand:** the canonical plugin, on the 1.3.0 upload, over these families and a sample of the
  M5 set, recorded with `source: chatgpt-plugin (manual)`.
