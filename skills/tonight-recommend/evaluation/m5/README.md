# M5 — the Vibe lifecycle, evaluated

Whether an ordinary sentence about a film is recorded as what they said, and — where it should be,
and only on the plugin — turned into a considered offer that nothing is written without. The
scenario set is S1's; S3, S5 and S6 reuse it, and every deploy that carries instruction changes
reruns it (`docs/work/m5/M5-PLAN.md`, §10 and Revision 4).

| file | what it is |
| --- | --- |
| `scenarios.json` | the matrix: fixture, request, an optional second turn, the family, whether it counts toward the missed-consideration metric, and the sources it runs on |
| `prompts.md` | every request, verbatim |
| `rubric.md` | how a run is scored: the ten inadmissible outcomes, the per-run fields, the threshold |
| `fixtures/` | the four models the scenarios start from |
| `run.mjs` | the runner |

## Three sources, because there are two hosts

A ChatGPT project gets `tonight-recommend`'s projection and nothing else. The canonical plugin
ships both full skills, and ChatGPT may load either or both. So every run says which instructions
it was given (`--source`), and a scenario lists the sources it is scored on:

| source | instructions | scored for |
| --- | --- | --- |
| `projection` | the generated projection | the floor every host needs: routing into `record_verdict` with faithful words, the ten inadmissible outcomes, the §5 *Never* column, the keep flow with a core, the first-film question, and the recommendation-only reading case. **A stop after a positive verdict is correct here and is never scored as a miss.** |
| `plugin-skills` | every full `SKILL.md` the plugin package carries (every folder under `skills/`), recommend first, exactly the packaged bytes — both skills since S3, `tonight-recommend` alone before it | the lifecycle: consideration, offers, several Vibes, a new core, a new Vibe, the opt-out, yes / no / partial, a new user's first Vibes, going through existing Vibes — and the ten inadmissible outcomes |
| `recommend-only` | `tonight-recommend/SKILL.md` alone | the recommendation-only reading case: the plugin when only recommend is selected |

The CLI cannot reproduce ChatGPT's choice of skill, so the chosen text goes into the system prompt
and the artifact says so. **The canonical plugin is also evaluated by hand** — on the user's
ChatGPT account, iOS the hard surface — over the same scenarios and rubric, recorded with
`source: chatgpt-plugin (manual)`. That pass is the coordinator's; it gates any deploy that changes
instructions.

## Running it

```bash
cd web && npm run dev                                          # the server the proxy fronts
node skills/tonight-recommend/evaluation/m5/run.mjs --source projection --dry-run
node skills/tonight-recommend/evaluation/m5/run.mjs --source projection
node skills/tonight-recommend/evaluation/m5/run.mjs --source plugin-skills
node skills/tonight-recommend/evaluation/m5/run.mjs --source recommend-only
```

It needs `web/.env.local` (the seeder mints its tokens from it) and refuses to run while either
`SKILL.md`, the generated projection or the MCP server differs from `HEAD`. Three runs per
scenario unless `--runs` says otherwise. Results go to `results/`, which is ignored.

Every run reseeds its fixture first, through the M3 seeder and the public tools: **vibes, then
films, then genres** are deleted — a film that anchors a vibe cannot be deleted until the vibe is
— and the fixture is written again, each vibe with its core before any other film. The state
before and after is snapshotted and named in the artifact by digest.

**Second turns** resume the recorded session with `claude -p --resume`. A run whose second turn
came back in a different session is marked failed: it did not resume, and is not scored as though
it had.

A normal sweep **skips the legacy fixture** and says so; it runs one scenario at a time, below.

## The baseline (S1)

The baseline is recorded on the instructions as they were before any M5 change, at a commit that
holds this harness and nothing else of M5 — the server at taste v12, `tonight-recommend` the only
skill, the projection `ae863227`:

```bash
node skills/tonight-recommend/evaluation/m5/run.mjs --source projection
node skills/tonight-recommend/evaluation/m5/run.mjs --source plugin-skills    # = the untouched full recommend skill
node skills/tonight-recommend/evaluation/m5/run.mjs --source recommend-only
```

`plugin-skills` there is the plugin as it then shipped — the full, untouched `tonight-recommend`
alone — so the routing matrix and the second turns are recorded against it. The seeder asks the
server whether `create_vibe` takes a `core`: a v12 build is given each Vibe without one and files
the core film from the film's side, so the fixtures seed the same films into the same Vibes on
either build, anchored only on v13.

## The legacy fixture

`m5-03-legacy` holds Vibes from before cores. A build at taste v13 cannot write one (every new
Vibe needs a core), and none is ever written by SQL (D12). So it is seeded through a v12 build's
tools and then migrated, once **per run**:

1. Start a build at taste v12 — `tonight` main `15a6095`, its own checkout — against an empty
   database, on another port (`npm run dev -- --port 3001`), with the same `web/.env.local`.
2. From **this** checkout, seed through that server — this seeder, because it knows `--fixtures`
   and the M5 evaluation users:
   `TONIGHT_ORIGIN=http://localhost:3001 node skills/tonight-recommend/evaluation/m3/seed.mjs
   m5-03-legacy --fixtures skills/tonight-recommend/evaluation/m5/fixtures`
3. Stop it, and start this build against the same database on the usual port: it migrates to
   v13, and every Vibe reads `core: null`.
4. Run exactly one scenario, once:
   `node skills/tonight-recommend/evaluation/m5/run.mjs --source plugin-skills --legacy-seeded
   --runs 1 --only m5-03-legacy__go-through` (or `m5-03-legacy__loved-machete`). The runner
   refuses `--legacy-seeded` for anything but one legacy scenario and one run, and never reseeds
   it.
5. For the next run, empty the database and start again at step 1 — a going-through run may
   anchor, merge or delete, and the next one has to start from the pre-core shape.

## The input to S4

S4 adds a `next` hint to `record_verdict` only if the agent stops after recording a positive
verdict. Its input is the missed-consideration rate in `rubric.md`: `plugin-skills` runs of
scenarios with `"considers": true`. Intentional opt-outs — declining more of the kind, lukewarm,
negative, not-tonight, watched-only, a request — are `"considers": false` and never count as a
miss.
