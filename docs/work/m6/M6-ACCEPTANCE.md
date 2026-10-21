# M6 — pre-deploy acceptance

Where each pre-deploy gate stands, the thresholds the semantic sweeps are scored against, and what
the user has to do. Written 2026-10-21 after Codex implementation READY (`820d02b`). Nothing here
changes the reviewed implementation. Nothing has been pushed, merged or deployed.

## Gate status

| gate | state | evidence or blocker |
| --- | --- | --- |
| Deterministic (unit, real PostgreSQL, projection, contracts, plugin package) | **done** | `M6-IMPLEMENTATION.report.md`; Codex ran the three shell gates (207/207, 100/100, 37/37) |
| Production unseen-core count (PLAN §7) | **not run — no access** | No production credential reaches this session: `DATABASE_URL` is absent from its environment, there is no `vercel`, `neonctl` or `psql` CLI, `web/.env.local` did not exist, and the session sandbox refuses to read outside this worktree. Production's `DATABASE_URL` is an encrypted Vercel variable (`web/.env.example`) |
| Seeding preflight (not a sweep) | **done** | Every non-legacy fixture the sweeps reseed was seeded through the real MCP endpoint of a local dev server at `820d02b` (in-memory database, local-only signing secret), with `D = 2026-10-21`, and its seeded state checked: all five M6, three M5, six M3 and eight Phase 1 fixtures — below |
| Semantic sweeps — M6 baseline, M6 final, M5 regression, Phase 1 and M3 | **not run** | Every run shells out to `claude -p`, and running `claude` needs an approval this session cannot give. No agent run happened, so nothing is claimed about any family |
| Manual canonical-plugin pass (iOS) | **not run — the user's** | Needs the user's ChatGPT account. The ZIP left in `chatgpt-plugin/dist/` was built during review 1, before `40c6e8a`, and is stale: rebuild before uploading (below) |

## Seeding preflight, 2026-10-21

Seeded through the M3 seeder exactly as `m5/run.mjs` seeds (`--fixtures`, `--today D`) and through
the Phase 1 seeder, against `http://localhost:3000` at `820d02b`. Each M6, M5 and M3 fixture was
checked after seeding:

- its genre, Vibe and film counts;
- each Vibe's core;
- each film's viewing;
- each verdict standing with its occasion;
- no core saved as unseen.

| set | fixture | result |
| --- | --- | --- |
| m6 | m6-01-buddy-crime | ok — 3 genres, 2 vibes, 3 films, 3 standing verdicts |
| m6 | m6-02-refused-ever | ok — 4 standing verdicts, the `not-ever` included |
| m6 | m6-03-refused-tonight | ok — 6 standing verdicts; The Nice Guys `not-tonight` on `D`, The Other Guys on `2026-01-15`, Hot Fuzz on `evening-tuesday` |
| m6 | m6-04-unseen-member | ok — Heat `unseen` with no verdict; Collateral `unseen` with a standing `liked`; core Thief |
| m6 | m6-05-fifty-vibes | ok — 12 genres, 50 vibes, 50 films, 50 standing verdicts |
| m5 | m5-01-anchored, m5-02-empty, m5-04-reading | ok |
| m5 | m5-03-legacy | skipped: seeded only through a v12 build by the operator (`m5/README.md`) |
| m3 | m3-01, -02, -04, -05, -06, -07 | ok |
| phase 1 | 01 … 08 | ok |

## Thresholds, fixed before any post-change run

These are fixed here, before any run on the final instructions exists, as `m6/rubric.md` requires.
A run is scored only against these.

**Every run, every source:**
- Zero inadmissible outcomes, in every family of every set.
- A void run (it crossed midnight) is rerun and never scored.
- A harness failure is rerun at most twice. Harness failures are: the CLI exited, a second turn did
  not resume, or seeding failed. A slot that still fails is **not run**, never passed.

**The M6 set, per source the family lists, three runs each:**

| family | pass |
| --- | --- |
| G1 not-ever, G2 not-tonight, R1 standing not-ever, R2 dated today, U2 unseen core, U4 contradiction | **3 / 3**, required outcomes met (rubric) |
| G3 unclear reach, U1 unseen member, U3 seen now | **≥ 2 / 3**, required outcomes met |
| M1 moodless (two requests) | **≥ 5 / 6**, required outcomes met |

**The M5 regression, all three sources, on the final instructions:** M5's own threshold, unchanged
(`m5/rubric.md`):
- zero of its ten inadmissible outcomes in every run;
- routing families reach `record_verdict` with faithful words in every run.

The missed-consideration rate is reported, not gated: S4 is M5's decision.

**Phase 1 and M3, on the projection:** their own rubrics' thresholds, unchanged. In addition, the
moodless rule's regression cases must hold in **every run**:
- `01-empty` answers with a film and asks for films they love, never a mood question instead;
- `07-failure-explicit` and `08-failure-ordinary` keep AC6a / AC6b, with no surprise claimed from
  a model that was not read.

**The M6 baseline** (`b9cb8a3`, projection and plugin-skills) is measurement and has no threshold.

## What the user has to do

1. **The production count**, read-only, with production's `DATABASE_URL`. Use either the Neon
   console's SQL editor, or this command from a shell that has the variable:

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY;
     SELECT count(*) AS unseen_cores, count(DISTINCT x.user_id) AS accounts
       FROM tonight_mixes x
       JOIN tonight_movies m ON m.user_id = x.user_id AND m.id = x.core_movie_id
      WHERE m.viewing = 'unseen';
     ROLLBACK;"
   ```

   - **0** — nothing to do.
   - **More than 0** — the deploy is still safe. Record the number, and re-anchor those Vibes only
     in conversation, never by SQL.
   - **Not** `vercel env pull`: it writes the production secret to a file.
2. **The sweeps**, on a machine where `claude -p` runs. This worktree already has a local-only
   `web/.env.local` (a generated signing secret and an in-memory database; never production), or
   bring your own.
   - **Start the server:** `cd web && npm run dev`.
   - **Baseline:** `git checkout b9cb8a3`, then:
     - `node skills/tonight-recommend/evaluation/m5/run.mjs --set m6 --source projection` (24 runs);
     - `node skills/tonight-recommend/evaluation/m5/run.mjs --set m6 --source plugin-skills` (33).
     - M5's own post-change sweep can run on this commit too.
   - **Final:** `git checkout 820d02b`, then:
     - the M6 set with `--set m6` on `projection` (24), `plugin-skills` (33) and `recommend-only` (9);
     - the M5 set, the same command without `--set`, on all three sources (51 + 63 + 3, legacy set
       aside);
     - Phase 1 and M3 on the projection, each by its own README (`evaluation/README.md`,
       `evaluation/m3/README.md`).
   - The runner refuses to record while the skills, projection or server differ from `HEAD`, and it
     checks out nothing itself.
   - Score each run against `m6/rubric.md` (or M5's, Phase 1's, M3's) and the thresholds above.
3. **The plugin, by hand in ChatGPT**, on the user's account:
   1. At `820d02b`, run `bash chatgpt-plugin/build.sh`. That writes a fresh
      `chatgpt-plugin/dist/tonight.zip` at version **1.3.0**, carrying both skills and PR #4's
      description copy. The ZIP there now predates `40c6e8a`: do not upload it.
   2. Upload the ZIP in ChatGPT as a plugin. The package name is `tonight`. ChatGPT rejects an
      unchanged version, and 1.3.0 is one no earlier upload carries. Whether ChatGPT treats it as
      an update or a new plugin is the user's choice in its UI, and is undocumented
      (`docs/work/chatgpt-plugin-plan.md`). If ChatGPT refuses the upload because of the name, do
      not delete an existing plugin to make room: report it. The Tonight connector
      (`asdk_app_6a989ba64af0819199e46bf257f8ad5a`) stays installed: the plugin requires it and
      does not bundle it.
   3. On iOS:
      - ask ChatGPT to call `get_server_info`;
      - check that the listing shows *"Movies That Get You."*;
      - run the M6 families and a sample of the M5 set by hand;
      - record each as `source: chatgpt-plugin (manual)` against the same rubric.
4. **Then, and only then, decide on push, merge and deploy.** The order is in PLAN §7: the data
   check, the web deploy, re-pasting the projection, the plugin upload.
