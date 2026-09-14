# The recommendation evaluation

**Status:** complete. The fixtures, the prompts, the rubric, the proxy and the orchestrator are in
place, and **the baseline is recorded** — 60 runs under instruction version `f098fd5b`, one fresh
agent each, in `results/baseline/`. `results/phase-1/` is empty until Steps 4 to 6 have landed.

Written in English to match the rest of the repository.

This is Step 1 of `docs/work/phase-1-implementation.md`. It exists because every change in Phase 1
is a change to instructions, and the effect of an instruction is invisible to every test in this
repository: `instructions.test.ts` and `test.sh` prove a rule is **present in the text**, never
that a model **follows** it. The paired blind evaluation is the behavioural acceptance gate, and
this directory is what it is run from.

```
  fixtures/           eight taste models and conditions, as seed definitions
  prompts.md          the request set
  rubric.md           the seven criteria and the eight required outcomes
  seed.mjs            materialises a fixture, mints a token, takes a snapshot
  proxy.mjs           records what the host actually did, and can fail one tool
  results/baseline/   what the CURRENT instructions do
  results/phase-1/    what the CHANGED instructions do — after Steps 4 to 6
```

---

## The one rule that makes the baseline worth anything

> **The baseline is captured against instructions that have not been touched.**

A baseline recorded after a prompt edit is not a baseline. If any of
`skills/tonight-recommend/SKILL.md`, `web/lib/generated/project-instructions.ts` or the tool
descriptions in `web/lib/mcp/server.ts` differs from the commit the baseline claims, the recording
is void and Step 8 has nothing to compare against.

Every recorded run carries a provenance header naming the instruction version it was produced
under. At the time of writing that is **`f098fd5b`**.

---

## Running a fixture

### 1. Materialise the taste model — once

```
node evaluation/seed.mjs 03-state-rich                 # seeds, then prints a bearer token
```

Seeding goes through `create_genre`, `create_mix` and `create_movie` over HTTP. A fixture that
cannot be expressed through the public tool surface is not a fixture of this product. Re-running is
idempotent: the fixture's user is emptied and rewritten, and no other user is read or written —
the script refuses any user that is not `google:eval-…`.

> **Seed once per fixture, then leave it alone.** Seeding writes new rows with new timestamps. A
> fixture reseeded between two runs is two different taste models wearing one name, and every
> recording that straddles the reseed is describing data that no longer exists.

**Two fixtures share one model on purpose.** `06-exclusion-plain` declares
`sameModelAs: 05-exclusion-explicit`, and `07`/`08` declare `sameModelAs: 03-state-rich`. Seed the
shared model **once** and run every half against that one seeding. That shared model is the whole
of what the exclusion pair proves: one model, two requests, two behaviours.

### 2. Refresh a token without touching the data

```
node evaluation/seed.mjs 03-state-rich --token         # mints only — seeds NOTHING
```

A token expires mid-session. Re-running the bare seed to get a new one would quietly reseed the
fixture and invalidate every recording that came before. **Use `--token`.** The bare form is for
first materialisation and for nothing else.

### 3. Take the snapshot that the run will be bound to

Immediately before each run:

```
node evaluation/seed.mjs 03-state-rich \
  --snapshot results/baseline/runs/snapshots/03-state-rich__plain__01.json
# prints: sha256:<digest>
```

This reads; it does not write. The file is the exact answer `get_taste` gives at that moment, and
its digest goes into the run's header. That pair — file plus digest — is what makes *"this is the
data the model saw"* checkable instead of asserted.

**It is the only record of a run's input.** There is no second, per-fixture recording to consult:
one existed and was removed, because a fixture reseeded before a sweep produces different rows and
the two sets then disagreed about what the agent was given. A run's snapshot belongs to that run.

### 4. Start the proxy, and point the host at it

```
node evaluation/proxy.mjs --log results/baseline/runs/logs/03-state-rich__plain__01.jsonl
```

The host connects to `http://localhost:3999/mcp` instead of the server directly. Everything is
forwarded untouched; every JSON-RPC call is written to the log as one line of JSON.

**Use the proxy for every run, not only the failure ones.** The log is machine-written evidence of
what the host did *to Tonight*: whether `get_taste` was actually called, what it returned, what
else was called. An agent's own account of its tool use is part of what is being evaluated and
cannot also be the evidence for it.

> **The proxy sees Tonight and nothing else.** It is a proxy in front of one MCP endpoint. A
> host-native web search, a film database, anything the host runs itself — none of it passes
> through here and none of it appears in this log. Evidence for those is captured separately, and
> the next step is how.

Then, in the host:

- endpoint `http://localhost:3999/mcp`, token from step 2;
- project instructions `PROJECT_INSTRUCTIONS`, pasted **verbatim** — no summary, no additions,
  and nothing about the evaluation;
- record which other tools the host has. It changes what the *unsupported claims* criterion can
  catch, so it goes in the header.

### 5. Capture the host's own tool evidence, separately

Two of the seven criteria — **unsupported claims** and, through it, anything about currency —
turn on whether a claim about the world had a tool behind it. The Tonight proxy cannot answer
that, so the host has to, and how it does is the host's business rather than this repository's.

Decide which of three states the run is in, **before** it starts, and record it:

| `external_tools` | What it means | What the run can be scored for |
| --- | --- | --- |
| `observable` | the host has external tools **and** exposes their calls and results | everything. The traces are saved beside the run |
| `disabled` | external tools were switched off for this run, or the host has none | everything. Any claim about availability, a release, an award or what is "on now" is unsupported **by construction**, which makes this the cleanest condition for that criterion |
| `not-observable` | the host has external tools and will not show what they did | **not** *unsupported claims*. That criterion is untestable in this run and must be recorded as such |

> **`None` and "not observable" are different answers and must never be written the same way.**
>
> *No external tool was used* is a fact about the run, and it may only be claimed under
> `observable`, where something was watching. *External tool activity was not observable* is a
> fact about the host. Writing the second as the first turns an absence of evidence into evidence
> of absence, and the run then appears to have passed a criterion nobody checked.

**If the host will not expose its traces,** take one of the two sanctioned paths rather than
guessing: run with external tools **disabled** and mark currency claims as unsupported by
construction, or **use a host that does expose them**. A run recorded as `not-observable` is still
worth keeping — it scores six of the seven criteria — but it cannot be counted towards
*unsupported claims*, and §8.3 of the implementation plan requires every criterion to have a
result from somewhere.

Where traces are available, save them verbatim next to the run as
`external/<fixture>__<prompt>__<nn>.md` — whatever the host exports: a copy of its tool-call
panel, a JSON export, a screenshot transcribed. Exactness matters more than format; the reviewer
needs to be able to point at the result that supported a claim.

### 6. For fixtures 07 and 08: fail the call, not the connector

```
node evaluation/proxy.mjs --fail get_taste --log <file>
```

> **A connector failure and a `get_taste` failure are different scenarios, and only one of them
> is AC6.**
>
> | | What the host experiences | Tests |
> | --- | --- | --- |
> | **Connector failure** | no Tonight tools at all: authentication fails, or discovery does | a host with no Tonight. **Not AC6** |
> | **`get_taste` invocation failure** | Tonight is connected, all eleven tools are discovered and usable, and *this call* fails | AC6 |
>
> Starting from a connector that cannot authenticate would test the first and record it as the
> second.

With `--fail get_taste`, `initialize`, `tools/list` and every other tool are forwarded to the real
server and work normally; only `get_taste` is refused, in MCP's own shape for a failed tool —
`isError` with the reason as text, which is what the server's `attempt()` returns for a refusal and
what a model is guaranteed to be shown.

**Check the connection is real before the run**, and record it: call `get_server_info` through the
proxy and confirm it answers `authenticated: true`. The log will show both calls, one working and
one failing, which is the evidence that this was an invocation failure rather than a dead
connector.

**What is simulated, stated plainly:** the connection, the discovery, the other ten tools and the
transport are all real. The refusal *message* is written by the proxy rather than provoked from
the store, because provoking a genuine store outage would mean changing production code, which is
out of bounds. What AC6 judges is the agent's behaviour on a failed `get_taste`, and that is
produced faithfully.

### 7. Run each prompt, several times, in a fresh session

> **One run, one fresh session.** Runs in a single session are a trajectory, not samples: the
> second answer is conditioned on the first, and nothing about the recording says so.

Five runs per prompt is the working number. These systems are nondeterministic, and repetition is
how a failure that appears in one run of five is found rather than dismissed.

---

## The run artifact

One file per run, `results/<side>/runs/<fixture>__<prompt>__<nn>.md`, with its companions named
after it: the snapshot from step 3, the Tonight transcript from step 4, and — where there is one —
the external evidence from step 5.

A run that records only the final answer cannot be scored. Four of the seven rubric criteria need
to know what the model actually did: whether `get_taste` was called at all, what it saw, whether a
claim about the world had a tool behind it, and — for AC6 — whether the agent reported the real
failure or a generic one. **Those two questions have two different sources**, and the artifact
keeps them apart.

```markdown
---
fixture: 03-state-rich
prompt: plain
run: 01
side: baseline
instructions: f098fd5b
host: claude -p (Claude Code CLI, --bare)
model_requested: claude-sonnet-5
model_resolved: claude-sonnet-5
cli_version: 2.1.268
session: ef0e6437-83a8-495b-a9ba-4cc048563801
tonight_tools: 11 discovered
tonight_transcript: logs/03-state-rich__plain__01.jsonl
external_tools: observable
external_evidence: external/03-state-rich__plain__01.md
taste_snapshot: sha256:36477a380af9fee9
taste_snapshot_file: snapshots/03-state-rich__plain__01.json
get_taste: ok
recorded: 2026-09-12T14:22:00Z
---

## Prompt

> What should I watch tonight?

## Tonight MCP transcript

Read from the proxy log named above; this is a reading of it, not a substitute for it.

1. `get_taste` → ok, 4 genres, 3 mixes, 12 movies

## External tool evidence

Anything the host ran itself. The proxy cannot see any of it.

1. `web.search` "Lake Mungo streaming Germany" → 3 results, saved in the evidence file
2. supported the claim: *"it is on MUBI until the end of the month"*

## Answer

<the agent's answer, verbatim — nothing removed, nothing tidied>
```

Every header field is required. Six of them are easy to get wrong:

- **`get_taste`** is `ok`, `failed` or **`not_called`**. *Not called* has to be stated rather than
  left out, or the reviewer cannot tell it apart from a field somebody forgot.
- **`model_requested`** is what was asked for on the command line; **`model_resolved`** is what
  actually answered, and it must be an exact name. An alias — `sonnet`, `opus` — moves, and a
  baseline that can only say "sonnet" cannot be compared with a later run of "sonnet". The
  resolved name is read from the session transcript's assistant message, not from `modelUsage`,
  which also lists the auxiliary models a session touches.
- **`session`** is the CLI's session id, which is what makes the two fields above checkable
  against a record nobody here wrote.
- **`tonight_tools`** is what the host discovered from Tonight, from the proxy log.
- **`external_tools`** is `observable`, `disabled` or `not-observable`, per step 5, and it decides
  what the run may be scored for.
- **`external_evidence`** names the evidence file. It may be `None` **only** when `external_tools`
  is `observable` — that is the one state in which "nothing was called" is something somebody
  actually watched. Under `disabled` it is `n/a`; under `not-observable` it is
  `not-observable`, never `None`.

The three sections are all required, and each says what it means when it is empty:

| Section | Empty is written as | Never |
| --- | --- | --- |
| `## Tonight MCP transcript` | `None.` — the host called no Tonight tool | an absent section |
| `## External tool evidence` | `None.` under `observable`; `n/a — external tools disabled`; or `NOT OBSERVABLE — this run cannot be scored for unsupported claims` | `None.` when nothing was watching |
| `## Answer` | — | an absent section |

`side` is what Step 8 strips before scoring, along with the rest of the header.

---

## Scoring

`rubric.md` is the scoring sheet, and `docs/work/phase-1-implementation.md` §8.3 is the gate:
Phase 1 ships only if **every required AC1–AC6 outcome passes** *and* the paired comparison meets
the comparative threshold. A failed acceptance criterion is a hard stop; it is not offset by an
improvement somewhere else.

Scoring is blind: pair each baseline run with its Phase 1 counterpart, strip the provenance
headers, shuffle, score, and only then re-join the scores to their sides.

**Any prompt correction made after an evaluation invalidates that evaluation.** The whole of
Step 8 is run again, both halves of the gate included. Instruction text has no local effects: a
sentence that repairs the exclusion pair can change decisiveness in the empty-model fixture, and
nothing about the edit will say so.

---

## Running the whole thing

```
node evaluation/run-baseline.mjs                       the whole matrix, five runs each
node evaluation/run-baseline.mjs --only 03-state-rich --runs 1
node evaluation/run-baseline.mjs --side phase-1        after Steps 4 to 6
node evaluation/run-baseline.mjs --dry-run             what it would do, and nothing else
```

`run-baseline.mjs` is the procedure above, automated, and nothing more. It prepares the room and
leaves it: seeds each fixture once, mints a token without reseeding, takes the snapshot straight
from the server, starts the proxy with the right failure configuration, launches **one fresh
`claude -p` per run**, and writes the artifact from what the proxy saw.

It refuses to start if `SKILL.md`, the generated instructions or the tool descriptions differ from
`HEAD`, because a baseline recorded against edited instructions is not a baseline.

What it does not do, ever: call `get_taste` for the agent, reason on its behalf, write a
transcript for it, or fabricate a failure. The agent discovers the tools itself, decides to call
them, and meets the configured refusal in MCP's own shape. The `get_taste` field of every artifact
is derived from the proxy's log rather than from anything the agent said about itself.

The snapshot is the one exception that needs saying out loud: the orchestrator does read
`get_taste`, **straight to the server and never through the proxy**, purely to record what the
data was at that moment. That is provenance, not a call made on the agent's behalf — which is why
a failure fixture still has a full snapshot beside a run whose agent could not read anything.

### The host it was recorded with

`claude -p` with `--bare`, `--strict-mcp-config` and Tonight as the only MCP server: no memory, no
`CLAUDE.md`, no hooks, no plugins, and eleven tools — confirmed in every one of the sixty runs by
the discovery line in the proxy log. The instructions are passed with `--system-prompt`, read out
of the generated module and un-escaped, so the agent's whole standing context is the text somebody
would paste into a project.

`external_tools` is therefore `disabled` for the whole baseline: the agent was launched with
Tonight's tools and no others. That is a sanctioned state and the cleanest condition for the
*unsupported claims* criterion — any claim about availability, a release or what is on this week
is unsupported by construction. The Phase 1 side must be recorded the same way, or the pair is not
a pair.
