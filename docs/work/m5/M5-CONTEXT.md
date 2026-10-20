# M5 — binding context

**What this is.** The durable handoff from the product conversation that settled M5 to whoever
coordinates it afterwards. Nobody executing M5 has access to that conversation; this file is what
survives of it.

**Authority, in order.**

1. **This file** — historical and design context. Binding.
2. **`M5-PLAN.md`** — the execution strategy: slices, order, gates, open decisions.
3. **Slice plans** (`S<n>-<slug>.plan.md`) — each slice's local contract.
4. **Reports** (`S<n>-<slug>.report.md`, `M5-FINAL-REPORT.md`) — what actually happened.

A lower document may narrow a higher one and may never contradict it. If repo evidence shows a
rule below cannot hold, stop and raise it with the coordinator; do not work around it in a slice.

---

## Product memory

- **Five persistent product-memory roots, exactly:** Movies, Genres, Vibes, Episodes, Verdicts.
  There is no persistent Question, Observation, Proposal, Claim or pending workflow state, and none
  is added under another name. What the agent thinks during a conversation ends with it.
- **Memory ≠ Taste.** Memory is the raw factual and historical record, and it may contradict
  itself. Taste is the coherent subset and interpretation that is allowed to influence
  recommendations.
- **What each root is:**

  | Root | Is | Is not |
  | --- | --- | --- |
  | Episode | what happened on an evening | evidence about taste |
  | Verdict | what the user said about a film | an inferred claim |
  | Movie | a film in their library, with the factual viewing | an opinion |
  | Vibe | a reusable way films work for this user | a filter or a genre list |
  | Genre | a reusable component, meaning what they say it means | a catalogue tag |

- **`Movie.viewing` is factual:** `seen`, `unseen`, or `null` for never told. Everything
  evaluative belongs in a Verdict.
- **A Verdict is user evidence.** Keep what the user actually said. Never clean it up or rewrite
  it into inferred claims. Several historical verdicts may later support a derived current
  interpretation, but M5 creates **no sixth root** to hold one.

## Vibes

**Before M5.** A Vibe is a name, its own instruction, and one or more Genres. The Vibe's
instruction and its Genres' instructions form one coherent idea. The instruction adds what the
Genres do not say and contradicts nothing they do. **Coherence is not derivation:** the Genres
support the idea, they do not produce it. A Genre's name is not enough to judge fit; read its
instruction.

**M5 deliberately evolves Vibes into film-anchored taste units:**

- **Exactly one core movie**, plus additional movie membership.
- **Core** = the film that *currently* best embodies the Vibe. It is not the first film added, and
  not necessarily the user's favourite.
- **A movie may belong to several Vibes.** A positive film is not restricted to one.
- **No fixed number of persisted movies is required.** The creation UX shows about 3–4 example
  films, but that is not a storage requirement.
- **Candidate and reference films are not taste evidence.** Films proposed to explain a new Vibe
  are illustration. They must never be persisted as though the user liked or saw them.
- **The coherence rule above is preserved.** Genres still constrain and support the Vibe; they do
  not derive it.

## Evidence and the lifecycle

- **Positive movie evidence triggers Vibe consideration.** That includes liked or loved, and
  natural explanations of how, when or why a film works for the user. The evidence may strengthen
  one or several existing Vibes, suggest a different core, or reveal a new Vibe.
- **Negative and not-tonight evidence have different semantics.** They are never forced into
  positive Vibe membership.
- **Inferred Vibe graph changes require user confirmation before anything is written.**
- **Contextual statements can carry reusable Vibe meaning** — for example *"good for a lazy
  Saturday/Sunday afternoon while half paying attention"*. M5 adds no occasion, daypart or
  attention schema unless concrete implementation evidence proves a Vibe cannot express it.
- **Real test case — Logan Lucky.** It has a positive verdict whose reason says it works well as a
  midday or afternoon low-attention watch, and the Italian Job recommendation surfaced from that
  kind of evidence. Use it as a lifecycle and routing test case. It is **not** licence to invent a
  new stored claim.
- **Onboarding reuses the same lifecycle.** Ask a first-time user for 2–3 films they love. Use the
  same primitives to propose initial Vibes, grouping seed films when they are semantically
  coherent. A proposed Vibe can carry:
  - a primary name and 2–3 alternative names
  - an instruction
  - Genres
  - a proposed core
  - about 3–4 supporting or reference films

  Confirmation comes before any graph write.

## Architecture

- **The host agent infers; MCP and the store persist and enforce deterministic invariants.**
  M5 introduces no Tonight-owned AI runtime unless there is concrete evidence that the host-agent
  architecture fails.
- **The reliability problem is mainly routing.** The agent must recognise natural statements of
  movie opinion or taste and enter the Verdict and Taste workflow. Once it is routed, the Skill
  spells out the lifecycle.
- **Instruction ownership: put each instruction at the narrowest layer responsible.**
  (`docs/instruction-ownership.md`)

  | Layer | Owns |
  | --- | --- |
  | Universal Skill/model instructions | routing, general semantics |
  | Workflow Skill | multi-step behaviour |
  | MCP tool descriptions | operation-specific guidance |
  | Store / DB | deterministic invariants |
  | Full docs | reasoning and context |

- **The `next: consider-vibes` hint is optional.** It is a possible deterministic hint on the MCP
  response after relevant Verdict writes, and only a safety net against the agent stopping early.
  It must not perform semantic inference. Audit whether it is needed and compatible before
  implementing it.
- **Routing examples include indirect language:**
  - *"perfect to have on in the background Sunday afternoon"*
  - *"exactly my thing because of the dialogue"*
  - *"good, but I don't need another movie like this"*

  Preserve the nuance. These do not all become the same positive claim.

## Live data and migration

- **The current system allows zero-movie Vibes and unfiled Movies.** M5 deliberately challenges
  both, and any migration must be explicit and safe.
- **Known unfiled examples:** Hit Man, Logan Lucky, No Sudden Move, Wingwomen. Do not classify them
  silently.
- **Existing Vibes to inspect.** These are examples to inspect, not migration facts to assert
  without data:
  - Plausible core relationships: Everybody's Lying / The Menu, Grindhouse Mayhem / Machete, Time
    Well Wasted / Palm Springs.
  - Weakly evidenced: Polite Suspicion, The Plan Goes Sideways.
  - May overlap: Bad Date, Worse Alibi and Holiday Alibis.
- **The user has 14 Vibes in live taste data.** Repo fixtures do not mirror live state; do not
  assume they do.

## Principles and process

- **The service layer** was audited before and was not justified. Do not reopen that without new
  evidence.
- **Introduce a new abstraction, field or mechanism only when** the current product cannot express
  the required behaviour, a concrete failure has been observed, or an imminent feature
  demonstrably needs it.
- **Process:**
  - Work in incremental, coherent slices, each with a focused Codex review.
  - A re-review inspects only unresolved findings and their fixes, not a fresh full review.
  - Stage explicit paths only. Never `git add -A` or `git add .`.
  - No unrelated hygiene.
  - No push until the approved workflow says so.
- **Physical SQL identifiers deliberately keep their historical `mix` names** (`tonight_mixes`,
  `tonight_mix_genres`, `tonight_mix_movies`, `mix_id`), because of migration and trigger history.
  Never rename them mechanically.
- **Every slice must audit** the generated instruction cap, schema compatibility, and migrations.
- **Internal graph mechanics and external UX are distinct.** Vibes can be structurally precise
  without the UI turning into an admin graph.
- **Orientation:** a Vibe is orientation, a Movie is the payoff. Movies are what the user came
  for; Vibes are how Tonight knows what they mean.
- **No artwork or UI redesign in M5.** The earlier tarot-card artwork exploration is separate and
  unvalidated.
