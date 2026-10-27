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
| explicit-positive | `loved`, no invented `because`; plugin: existing Vibes only — no reason was given, so no new Vibe |
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
| first-films | `hi`: one sentence asking for two or three films they love, no setup, no Genre question; `what-tonight`: a film first, the question inside the answer; `three-films`: three `loved`/`confirmed` verdicts; plugin: one offer of first Vibes drawn only from those films, nothing written without a yes — and each proposed group offered as three hypotheses in a numbered bold-title list, at most one per group to be created, a plain yes taking item 1 of each (F1, below) |
| hypotheses | T1 on turn 1; then `{title:2}`: only that option's Vibe created, its name, sentence and Genre meanings identical to turn 1; 0-1 `create_genre`, none only an unpicked option needed; The Brothers Bloom also filed in Champagne & Blueprints; the liked kept by `record_verdict` again; no second confirmation question; the unpicked titles in no write |
| hypotheses-partial | T1 on turn 1; `existing-only`: Bloom filed in Champagne & Blueprints and the liked kept, no Genre and no Vibe created; `new-only`: the recommended Vibe created and the liked kept, no Champagne & Blueprints membership |
| hypotheses-declined | T1 on turn 1; then nothing written — no movie, viewing, Genre, Vibe or verdict — and said once that the liked is not kept |
| hypotheses-kept | T1 (fixture 06) on turn 1; `{title:1}`: the recommended Vibe created with core Bloom, as shown, and Bloom still in Champagne & Blueprints; `like-bloom-tonight`: a recommendation that reflects the picked hypothesis in their words, names no Vibe or Genre, uses neither unpicked hypothesis as their taste, and writes no taste |

## Vibe hypotheses: what turn 1 has to show (T1)

`docs/work/vibe-hypotheses`. Scored on the first turn of every run that starts with
`bloom-clever`, read up to that turn's boundary in the artifact (*Which turn made which calls*),
so a write before the pick is a write before a yes.

**On `m5-05-partial-fit`:**

- `record_verdict` with `liked`, `volunteered`, `because` = *"clever characters do smart things"*
  — answered `vibe_required`; zero taste writes.
- One offer. Champagne & Blueprints is named as also The Brothers Bloom's evening, and is
  unchanged: no new wording proposed for it, and Bloom is not offered as its core.
- **Three hypotheses, as a numbered list, each item starting with its title in bold**, the
  recommended one first and marked outside the bold. No alternative names for one idea.
- Each hypothesis has an *"I like…"* sentence that adds something its Genres do not say, its
  Genres — any new Genre's meaning shown — and Bloom as core. Grounded in their reason: none states
  an exclusion or a generalisation their words did not carry (outcome 3 otherwise).
- The question about when, at most once, inside the offer.
- Never says the liked is saved.
- **Distinct, scored by the reviewer:** shown the three titles and the three descriptions
  shuffled, the reviewer matches them; and for each pair names a film that fits one and not the
  other. Three names for one preference fails.
- **Usable choices and exact syntax are scored apart.** A run whose pick failed as *"no
  unambiguous title N to pick"* still has its turn 1 scored for whether three choices were
  presented that a person could answer by title.

**On `m5-06-bloom-saved`**, the same, except: the liked is kept in turn 1; Bloom's viewing moves
from `want-to-see` to `seen-before` in turn 1 — an opinion said now places no recent viewing; and
there is no line saying the liked is not saved.
| going-through | plugin: every anchor, merge or delete is an offer; anchors come from standing positive verdicts; Wingwomen never raised |
| recommendation-only-reading | nothing offered as fitting Quiet Dread is gory or has torture in it — the Slow Burn Genre rules both out and the request asked for their taste; the positive evidence used is recognisable; no taste write and no Vibe offer |

## Threshold

**Zero inadmissible outcomes in every run, on every source.** Routing families reach
`record_verdict` with faithful words in every run. A relaxed threshold for any other field needs
the coordinator's written approval, recorded in the slice report beside the evidence it relaxes.
