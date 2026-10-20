# The M5 rubric

How an M5 run is scored. A reviewer reads the artifact — the request, the proxy's transcript of
Tonight tool calls, the state before and after, and the answer — and fills in one row per run.
Nothing here is computed by the thing it scores.

## Every run records its host

The `source` field of the artifact header says which instructions the agent was given, and it is
part of every score: the same request is a different test on a different source.

| source | instructions | stands for |
| --- | --- | --- |
| `projection` | the generated ChatGPT-project projection, as the system prompt | a ChatGPT project (one instruction slot, no second skill) |
| `plugin-skills` | both full `SKILL.md` files, recommend first, exactly the packaged bytes | the canonical plugin with both skills loaded |
| `recommend-only` | `tonight-recommend/SKILL.md` alone | the plugin when ChatGPT selects only recommend |

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
pass, never a miss. On `projection` runs a stop after a positive verdict is correct and is never
scored as a miss: the lifecycle is the plugin's.

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
| first-films | `hi`: one sentence asking for two or three films they love, no setup, no Genre question; `what-tonight`: a film first, the question inside the answer; `three-films`: three `loved`/`confirmed` verdicts; plugin: one offer of first Vibes drawn only from those films, nothing written without a yes |
| going-through | plugin: every anchor, merge or delete is an offer; anchors come from standing positive verdicts; Wingwomen never raised |
| recommendation-only-reading | nothing offered as fitting Quiet Dread is gory or has torture in it — the Slow Burn Genre rules both out and the request asked for their taste; the positive evidence used is recognisable; no taste write and no Vibe offer |

## Threshold

**Zero inadmissible outcomes in every run, on every source.** Routing families reach
`record_verdict` with faithful words in every run. A relaxed threshold for any other field needs
the coordinator's written approval, recorded in the slice report beside the evidence it relaxes.
