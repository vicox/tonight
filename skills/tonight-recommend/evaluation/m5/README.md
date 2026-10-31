# M5 — the Vibe lifecycle, evaluated

Whether an ordinary sentence about a film is recorded as what they said, and — where it should be,
and only on the plugin — turned into a considered offer that nothing is written without. The
scenario set is S1's; S3, S5 and S6 reuse it, and every deploy that carries instruction changes
reruns it (`docs/work/m5/M5-PLAN.md`, §10 and Revision 4).

| file | what it is |
| --- | --- |
| `scenarios.json` | the matrix: fixture, request, optional follow-up turns, the family, whether it counts toward the missed-consideration metric, and the sources it runs on |
| `prompts.md` | every request, verbatim |
| `rubric.md` | how a run is scored: the ten inadmissible outcomes, the per-run fields, the threshold |
| `fixtures/` | the seven models the scenarios start from |
| `run.mjs` | the runner |

## Two sources, because the plugin may load either skill

The canonical plugin ships both skills, and ChatGPT may load either or both. So every run says
which instructions it was given (`--source`), and a scenario lists the sources it is scored on:

| source | instructions | scored for |
| --- | --- | --- |
| `recommend-only` | `tonight-recommend/SKILL.md` alone — the plugin when only recommend is selected | the floor recommend states for itself: routing into `record_verdict` with faithful words, the ten inadmissible outcomes, the §5 *Never* column, the keep flow with a core, the first-film question, and the recommendation-only reading case. **A stop after a positive verdict is correct here and is never scored as a miss.** |
| `plugin-skills` | every `SKILL.md` the plugin package carries (every folder under `skills/`), recommend first, exactly the packaged bytes — both skills since S3, `tonight-recommend` alone before it | the lifecycle: consideration, offers, several Vibes, a new core, a new Vibe, the opt-out, yes / no / partial, a new user's first Vibes, going through existing Vibes — and the ten inadmissible outcomes |

Until the ChatGPT-project text was retired there was a third source, `projection`, and the floor
ran there. It now runs on `recommend-only`. Recordings made on `projection` stay in their own
result directories and are read as what they were.

The CLI cannot reproduce ChatGPT's choice of skill, so the chosen text goes into the system prompt
and the artifact says so. **The canonical plugin is also evaluated by hand** — on the user's
ChatGPT account, iOS the hard surface — over the same scenarios and rubric, recorded with
`source: chatgpt-plugin (manual)`. That pass is the coordinator's; it gates any deploy that changes
instructions.

## Running it

```bash
cd web && npm run dev                                          # the server the proxy fronts
node skills/tonight-recommend/evaluation/m5/run.mjs --source recommend-only --dry-run
node skills/tonight-recommend/evaluation/m5/run.mjs --source recommend-only
node skills/tonight-recommend/evaluation/m5/run.mjs --source plugin-skills
```

It needs `web/.env.local` (the seeder mints its tokens from it) and refuses to run while either
`SKILL.md` or the MCP server differs from `HEAD`. Three runs per scenario unless `--runs` says
otherwise. Results go to `results/`, which is ignored, in a directory named by the set, the
source, a digest of exactly the skills that source supplies, and the commit.

Every run reseeds its fixture first, through the M3 seeder and the public tools: what was said is
forgotten first — `delete_vibe` refuses to leave a liked or loved film in no vibe — then **vibes, then
films, then genres** are deleted — a film that anchors a vibe cannot be deleted until the vibe is
— and the fixture is written again, each vibe with its core before any other film. The state
before and after is snapshotted and named in the artifact by digest.

**Follow-up turns** — `then`, one request key or a list of them — resume the recorded session
with `claude -p --resume`. A run whose follow-up came back in a different session is marked
failed: it did not resume, and is not scored as though it had. A failed turn stops the turns
after it. Wherever a follow-up has `{title:N}`, it sends the title the answer before it offered as
choice N — by number where the answer numbers a list, as the three line-leading bold titles where
nothing is numbered — and fails before any call when it cannot tell which title that is. How the
list is formatted is scored as presentation, apart, and a pick the runner cannot read leaves the
turns after it UNTESTED (`rubric.md`). The artifact records what each turn sent and which Tonight
calls it made.

**A skill change's behavior report** (`docs/behavior-reports.md`) is made from these results. The
scenarios marked `smoke` on `plugin-skills` are its fixed regression set, so `--smoke` records it, one
run each, 11 model calls inside the default budget. `../report.mjs` then copies a change's runs —
turns, Tonight calls, state changes — into the Markdown file committed with the change.

**The Vibe-offer set** (`docs/work/vibe-hypotheses` §17) is the `m5-05-partial-fit` and
`m5-06-bloom-saved` scenarios, with the first-films offer. One pass:

```bash
node skills/tonight-recommend/evaluation/m5/run.mjs --source recommend-only \
  --only m5-05-partial-fit --runs 1 --budget 2
node skills/tonight-recommend/evaluation/m5/run.mjs --source plugin-skills \
  --only m5-05-partial-fit,m5-06-bloom-saved,m5-02-empty__hi__then-three-films --runs 1 --budget 9
```

Its baseline is recorded at the commit that added the set, where the instructions and the server
are those of `5231b1d`, and never at a later commit.

## DeepSeek as the agent, and a baseline with today's harness

`docs/work/vibe-hypotheses` §12.

- **`--backend deepseek`** drives the adapter in `../deepseek.mjs` instead of `claude -p`:
  - the same system prompt, and Tonight's tools only, through the same proxy, so the transcript,
    the turn boundaries and the snapshots are made the same way;
  - `--model` defaults to `deepseek-v4-pro`, and `--host` is refused;
  - the key comes from `DEEPSEEK_API_KEY` and is never recorded;
  - results go to `…-deepseek-<model>`, never beside a Claude recording;
  - the artifact adds `backend`, `fingerprint`, `usage` (turns and API requests named apart, input
    split by the cache, output) and `usage_file`;
  - `usage/<run>.jsonl` holds every API request with its UTC time, so a run is priced request by
    request, outside the harness.

  It refuses to record while the harness under `skills/tonight-recommend/evaluation/` has
  uncommitted changes, so `harness:` names the code that ran.
- **`--against <commit>`** records that commit's instructions with today's harness. From a clean
  tracked tree only, it:
  1. freezes both SHAs;
  2. installs a restore that runs on exit, error or signal;
  3. puts the three instruction files of `<commit>` in the working tree;
  4. guards against `<commit>`;
  5. puts `HEAD`'s files back however the invocation ends.

  Results go to `…-<commit>-harness-<HEAD>…`.
- **Either one first waits for the server to serve the tool catalog** the `server.ts` on disk
  registers. That catalog is computed in a fresh process, and the wait gives up after 120 seconds,
  before anything is seeded. Every artifact records the `tools_digest` it was served.

A pass of the three Vibe-offer scenarios, baseline and after:

```bash
node skills/tonight-recommend/evaluation/m5/run.mjs --source recommend-only --backend deepseek \
  --only m5-05-partial-fit --runs 1 --budget 2 --against fdb99b9
node skills/tonight-recommend/evaluation/m5/run.mjs --source plugin-skills --backend deepseek \
  --only m5-05-partial-fit,m5-06-bloom-saved --runs 1 --budget 7 --against fdb99b9
# then the same two without --against
```

A normal sweep **skips the legacy fixture** and says so — and the fixture from before the vibe
rule too; each runs one scenario at a time, below.

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
alone — so the routing matrix and the second turns are recorded against it. Those commands are
that commit's: its runner still had the `projection` source, which this one does not. The seeder asks the
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
   the current schema, every Vibe reads `core: null`, and every `seen` becomes `seen-now`
   (taste v15) — which is why the fixture still says `seen`.
4. Run exactly one scenario, once:
   `node skills/tonight-recommend/evaluation/m5/run.mjs --source plugin-skills --legacy-seeded
   --runs 1 --only m5-03-legacy__go-through` (or `m5-03-legacy__loved-machete`). The runner
   refuses `--legacy-seeded` for anything but one legacy scenario and one run, and never reseeds
   it.
5. For the next run, empty the database and start again at step 1 — a going-through run may
   anchor, merge or delete, and the next one has to start from the pre-core shape.

## Fixtures from before the vibe rule

`m5-01-anchored` holds Hit Man, a film they love that is in no Vibe. Since the vibe rule,
`record_verdict` keeps a liked or loved only for a film in a Vibe, so today's tools cannot write
that state: it exists only as data written before the rule.
The fixture says `"seed": "pre-vibe-rule"`, and is seeded the way the legacy fixture is, with no
migration but taste v15's relabelling:

1. Start a build from before the rule — `tonight` main `f3912b0`, its own checkout — against an
   empty database, on another port, with the same `web/.env.local`.
2. From **this** checkout, seed through that server:
   `TONIGHT_ORIGIN=http://localhost:3001 node skills/tonight-recommend/evaluation/m3/seed.mjs
   m5-01-anchored --fixtures skills/tonight-recommend/evaluation/m5/fixtures`
3. Stop it, and start this build against the same database on the usual port. It migrates taste
   v15 only — every `seen` becomes `seen-now`, so the fixture still says `seen` — and Hit Man
   stays loved and in no Vibe.
4. Run exactly one scenario, once: `--legacy-seeded --runs 1 --only m5-01-anchored__<prompt>`.
5. For the next run, empty the database and start again at step 1.

## The input to S4

S4 adds a `next` hint to `record_verdict` only if the agent stops after recording a positive
verdict. Its input is the missed-consideration rate in `rubric.md`: `plugin-skills` runs of
scenarios with `"considers": true`. Intentional opt-outs — declining more of the kind, lukewarm,
negative, not-tonight, watched-only, a request — are `"considers": false` and never count as a
miss.
