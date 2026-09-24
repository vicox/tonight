# The M3 semantic evaluation

**What it is for.** M3 promised that Tonight can answer *"what do you think you know about me?"*
completely and honestly, and can be corrected where the answer is wrong. The deterministic gates in
`web/lib/memory/evaluation/` prove the **payload** is faithful: everything is there, in the right
part, with its provenance and a handle. Nothing there can prove that a model handed a faithful
payload then told the user the truth about it. That is what this measures.

It is **not** the Phase-1 sweep and does not replace it. Phase 1 asks whether Tonight recommends
like a curator; this asks whether it explains itself like an honest one. Both run on the same
instruction version, and a change to `SKILL.md`, the generated instructions or the tool
descriptions reopens both.

```
  fixtures/          seven histories, as seed definitions
  prompts.md         the request set — and nothing in it names a tool
  scenarios.json     which fixture meets which request, and for which family
  rubric.md          the thirteen inadmissible outcomes and the ten family guarantees
  seed.mjs           materialises a history through the public tools
  run.mjs            one fresh `claude -p` per run, through the proxy
  results/m3-<version>/
```

The proxy is Phase 1's — `../proxy.mjs`. There is one of those and there should be one of those.

---

## The three things this does differently, and why

**It reseeds before every run.** A Phase-1 fixture is a taste model and the rule there is *seed
once*, because reseeding between runs makes earlier recordings describe rows that no longer exist.
An M3 fixture is a **history**, and three of the seventeen scenarios ask the agent to change it —
withdraw, forget, correct an evening. A run beginning in the wreckage of the previous one is not a
run of the scenario. The snapshot is taken immediately after seeding and bound to the run by
digest, so the same provenance guarantee holds, reached the other way round.

**It snapshots both reads.** `get_taste` is what a recommendation stands on; `get_memory` is the
broader view. The whole of family A is which one the model chooses, so the artifact records what
each of them held at the moment the run started.

**It reads the state again afterwards, where the scenario writes.** Whether a withdrawal was a
withdrawal is a question about rows. For `m3-06` and `m3-07` the artifact carries a second snapshot
taken after the agent has finished, and the rubric judges the difference rather than the answer's
description of itself.

## The one seam

Nothing on the tool surface opens a pending Verdict question — `record_opportunity` spends a chance
against one that already exists. So `m3-03-pending` opens its question through the store, and
`seed.mjs` says so where it does it. It is the same seam the deterministic gates declare in their
own limits, and it is the only place in this directory that reaches past the public tools.

## Running it

```
node evaluation/m3/run.mjs --dry-run              seventeen scenarios, three runs each
node evaluation/m3/run.mjs
node evaluation/m3/run.mjs --only H --runs 1      one family
node evaluation/m3/run.mjs --only m3-01-long-history__why-think
```

It refuses to start if `SKILL.md`, the generated instructions or the tool descriptions differ from
`HEAD`, for the reason the Phase-1 orchestrator does: a behavioural recording made against edited
instructions describes a version that exists nowhere.

The host is `claude -p` with `--bare` and `--strict-mcp-config`, Tonight as the only MCP server, the
generated instructions passed verbatim with `--system-prompt`, and `external_tools: disabled`
throughout — the same configuration the Phase-1 baseline was recorded with, so the two sets describe
the same agent.
