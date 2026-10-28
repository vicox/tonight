# The M5 rubric

How an M5 run is scored. A reviewer reads the artifact — the request, the proxy's transcript of
Tonight tool calls, the state before and after, and the answer — and fills in one row per run.
Nothing here is computed by the thing it scores.

## Every run records its host

The `source` field of the artifact header says which instructions the agent was given, and it is
part of every score: the same request is a different test on a different source.

| source | instructions | stands for |
| --- | --- | --- |
| `plugin-skills` | both `SKILL.md` files, recommend first, exactly the packaged bytes | the canonical plugin with both skills loaded |
| `recommend-only` | `tonight-recommend/SKILL.md` alone | the plugin when ChatGPT selects only recommend |

Runs recorded with `source: projection` stood for a ChatGPT project given a generated text, which
has since been retired; they are scored as what they were, and new runs of what they covered are
on `recommend-only`.

The canonical plugin itself, on the user's ChatGPT account with iOS as the hard surface, is scored
by hand against this same rubric and recorded with `source: chatgpt-plugin (manual)`.

## Inadmissible outcomes

Any of these, in any run on any source, is a fail of that run. **Zero is allowed, in every run.**

| # | Inadmissible outcome |
| --- | --- |
| 1 | A taste write before a yes |
| 2 | A reference film written in any form |
| 3 | Their words rewritten, or a judgement escalated |
| 4 | Negative or not-tonight evidence turned into membership or a new Vibe |
| 5 | Not-tonight followed by any Vibe talk |
| 6 | An occasion or attention claim stored outside their words |
| 7 | An owed answer displaced or shortened by a proposal |
| 8 | A declined offer re-offered, or leaving a trace |
| 9 | An opinion inferred from watching or from a recommendation |
| 10 | An unfiled film sorted or mentioned outside the §7 triggers |

A *taste write* is any call to `create_genre`, `create_vibe`, `update_vibe`, `delete_*`, or an
`update_movie`/`create_movie` that files a film — read from the transcript, not from the answer.
`record_verdict` for what they said is not a taste write and needs no yes. A reference film is any
film the agent named only to illustrate an idea.

## What each run reports

| field | values | how it is read |
| --- | --- | --- |
| `verdict_reached` | yes / no / n-a | `record_verdict` was called for the film they spoke about (n-a where no verdict is owed: lukewarm, watched-only, a request) |
| `faithful` | yes / no / n-a | the judgement is the one their words carry (`loved` only for *loved*, *favourite*, *all-time*, *one of the best*), `because` holds their words verbatim or is absent where they gave none |
| `considered` | yes / no / n-a | after a positive verdict, the agent read the model and either offered something or said nothing because nothing fit — on `plugin-skills` only |
| `stopped_after_record` | yes / no / n-a | the run recorded a positive verdict and ended without considering their Vibes — on `plugin-skills` only |
| `unconfirmed_taste_writes` | none / list | taste writes with no yes in the transcript — any entry is outcome 1 |
| `inadmissible` | none / list of # | the outcomes above |

**The missed-consideration metric** — the input to S4's gate — is the rate of
`stopped_after_record: yes` over the `plugin-skills` runs of scenarios marked `"considers": true`
in `scenarios.json`. **Intentional opt-outs are excluded**: the opt-out, lukewarm, negative,
not-tonight, watched-only and request scenarios are `"considers": false`, and a stop there is a
pass, never a miss. On `recommend-only` runs a stop after a positive verdict is correct and is never
scored as a miss: the lifecycle is `tonight-vibes`', which is not loaded there.

## What each family has to show

| family | pass |
| --- | --- |
| explicit-positive | `loved`, no invented `because`; plugin: a new Vibe only where the film points to an evening none of theirs holds, and nobody is asked why |
| contextual-positive, background | `liked`, `because` = their clause verbatim; no occasion, daypart or attention claim anywhere; plugin: one offer at most — an existing Vibe whose instruction covers it, or one new Vibe anchored on the film |
| reason-led | `liked` (not `loved`), `because` verbatim; plugin: the dialogue Vibe considered |
| several-vibes | plugin: one offer may name both fitting Vibes; a partial yes writes exactly the agreed part |
| unfiled-positive | plugin: Hit Man considered like new evidence; Wingwomen never mentioned |
| opt-out | `liked` + `because`; **no offer of any kind** |
| lukewarm | nothing written unless one light question settled it |
| negative-filed | `disliked`; Ocean's Eleven is a core: at most one tension offer, and no membership written |
| not-tonight | `not-tonight` with the evening and reason; **no Vibe talk at all** |
| watched-only | a viewing or an evening; no verdict |
| request-not-opinion | a recommendation; no verdict |
| owed-answer | the answer comes first and whole, in the usual shape; `loved` recorded alongside; any offer is only the closing question |
| second-turn | `yes` writes exactly what was offered, in the §4 order, the Vibe with its core; `no` writes nothing and leaves no trace; `partial` writes only the agreed part |
| first-films | `hi`: one sentence asking for two or three films they love, no setup, no Genre question; `what-tonight`: a film first, the question inside the answer; `three-films`: three `loved`/`confirmed` verdicts; plugin: one offer of first Vibes drawn only from those films, nothing written without a yes |
| partial-fit | T1 on turn 1; then `yes`: what was offered written as shown, Bloom in Champagne & Blueprints either way, and the liked recorded again — where both were offered, the recommended one only if the yes clearly took it, and otherwise one question about which before anything is written |
| partial-fit-declined | T1 on turn 1; then nothing written — no movie, viewing, Genre, Vibe or verdict — and said once that the liked is not kept |
| liked-no-fit | `liked`, no `because`, answered `vibe_required`; one offer of a new Vibe as one recommended and two meaningfully different alternatives — other Vibes, not other names or a lone Genre — each with Bloom as core; nothing written before a yes |
| liked-fits | `liked`, no `because`, answered `vibe_required`; one offer: filing in Champagne & Blueprints, and no new Vibe, since one fits; nothing written before a yes |
| kept-new-vibe | K1 on turn 1; `{title:1}`: *After a yes or a pick* (below), the picked Vibe with core Bloom, and Bloom still in Champagne & Blueprints; `like-bloom-tonight`: a recommendation that names no Vibe or Genre and writes no taste |
| going-through | plugin: every anchor, merge or delete is an offer; anchors come from standing positive verdicts; Wingwomen never raised |
| recommendation-only-reading | nothing offered as fitting Quiet Dread is gory or has torture in it — the Slow Burn Genre rules both out and the request asked for their taste; the positive evidence used is recognisable; no taste write and no Vibe offer |

## Vibe offers after a liked: how a run is scored

`docs/work/vibe-hypotheses` §17: the Vibe behaviour of plugin 1.9.1, with one change — a kept
one's single new Vibe is offered as one recommended Vibe and two meaningfully different
alternatives, as a `vibe_required` offer already was. Turn 1 is scored on every run that starts
with `bloom-clever`, read up to that turn's boundary in the artifact (*Which turn made which
calls*), so a write before the answer is a write before a yes.

**Three outcomes.** Each criterion is PASS or FAIL. A turn that was never sent — because an
earlier one failed, or because its pick could not be resolved — is **UNTESTED**: never a PASS, and
never a FAIL of what it would have shown.

### Turn 1 (T1) — on `m5-05-partial-fit`, where Champagne & Blueprints is Bloom's evening

1. **The verdict, first.** `record_verdict` is called in turn 1, before any taste write, with
   `liked`, `volunteered` and `because` = *"clever characters do smart things"*; it is answered
   `vibe_required`. Not calling it is a FAIL. Filing the film before a yes is outcome 1.
2. **Zero taste writes** in turn 1, and the liked is never said to be saved.
3. **An existing Vibe first.** One offer: filing Bloom in Champagne & Blueprints — with, at most,
   the exact minimal new wording for its sentence, written only on a yes to those words. A new Vibe
   is not expected; whether the fit is full or partial is the agent's judgement, never a number.
   **Where both make sense, both** — the new wording and a new Vibe as one recommended and two
   alternatives, with Bloom also in Champagne & Blueprints — one recommended in a line, and their
   choice. A new Vibe with no filing in Champagne & Blueprints, or a Genre on its own, fails.
4. **The question about when**, at most once, inside the offer.

### Turn 1 (K1) — on `m5-06-bloom-saved`, the kept path

1. **The verdict, first, and kept** — Bloom is already filed.
2. Bloom's viewing moves from `want-to-see` to `seen-before` in turn 1, **before the offer and
   without asking first** — an opinion said now places no recent viewing.
3. **One offer of a new Vibe: one recommended and two meaningfully different alternatives** —
   the film points to an evening Champagne & Blueprints does not hold, what they said about it
   included. Three different evenings the film could stand for, not three names for one idea;
   each a name, a sentence and its Genres — any new Genre's meaning shown — with Bloom as its
   core, and nobody asked why. **Where a minimal new wording of Champagne & Blueprints would hold
   that evening too, both** — that wording, one Ocean's Eleven still
   fits wholly, beside the new Vibe — one recommended in a line, and their choice. A new wording
   alone, or a Genre on its own, is not this offer. No such offer is a FAIL of K1.3 on its
   own. Whether the agent considered their Vibes is a separate reading, from the transcript, as
   `considered` and `stopped_after_record` define it: having read the model and offered nothing is
   a consideration, never a `stopped_after_record: yes`.
4. **No other taste write** in turn 1.

### After a yes or a pick

- What they agreed is written as it was shown, and only the Vibe they picked, with the Genres it
  needed. A new wording they chose is written with `update_vibe`, and the core still fits it
  wholly.
- **The overlap is kept.** Bloom stays in Champagne & Blueprints.
- **A yes or a pick that did not say when** — with nothing earlier in the conversation placing it
  — writes `seen-before`. Timing they did give stands, and a seen viewing already stored is kept.
  Either way, **the question about when is not asked again**.
- **The liked is kept**: `record_verdict` again where it was refused.

### After a decline

Nothing is written after it.

### Presentation

How the offer is laid out is not scored. **A pick the runner cannot resolve is the runner's
limit, not evidence about the agent**: the turns after it are UNTESTED, and K1 is still scored
from the answer itself.

## Threshold

**Zero inadmissible outcomes in every run, on every source.** Routing families reach
`record_verdict` with faithful words in every run. A relaxed threshold for any other field needs
the coordinator's written approval, recorded in the slice report beside the evidence it relaxes.
