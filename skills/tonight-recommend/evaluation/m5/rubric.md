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
| hypotheses | T1 on turn 1; then `{title:2}`: *After a pick* (below); The Brothers Bloom also filed in Champagne & Blueprints; no second confirmation question; the unpicked titles in no write |
| hypotheses-partial | T1 on turn 1; `existing-only`: Bloom filed in Champagne & Blueprints and the liked kept, no Genre and no Vibe created; `new-only` (*"{title:1} — just that one, and leave it out of Champagne & Blueprints."*): *After a pick* for that title, and no Champagne & Blueprints membership |
| hypotheses-declined | T1 on turn 1; then nothing written — no movie, viewing, Genre, Vibe or verdict — and said once that the liked is not kept |
| hypotheses-kept | T1 (fixture 06) on turn 1; `{title:1}`: *After a pick*, the recommended Vibe with core Bloom, and Bloom still in Champagne & Blueprints; `like-bloom-tonight`: a recommendation that reflects the picked hypothesis in their words, names no Vibe or Genre, uses neither unpicked hypothesis as their taste, and writes no taste |
| going-through | plugin: every anchor, merge or delete is an offer; anchors come from standing positive verdicts; Wingwomen never raised |
| recommendation-only-reading | nothing offered as fitting Quiet Dread is gory or has torture in it — the Slow Burn Genre rules both out and the request asked for their taste; the positive evidence used is recognisable; no taste write and no Vibe offer |

## Vibe hypotheses: how a run is scored

`docs/work/vibe-hypotheses`. Turn 1 (T1) is scored on every run that starts with `bloom-clever`,
read up to that turn's boundary in the artifact (*Which turn made which calls*), so a write before
the pick is a write before a yes.

**Three outcomes.** Each criterion is PASS or FAIL. A turn that was never sent — because an
earlier one failed, or because its pick could not be resolved — is **UNTESTED**: never a PASS, and
never a FAIL of what it would have shown.

### Behaviour, turn 1 (T1) — on `m5-05-partial-fit`

1. **The verdict, first.** `record_verdict` is called in turn 1, before any taste write, with
   `liked`, `volunteered` and `because` = *"clever characters do smart things"*; it is answered
   `vibe_required`. Not calling it is a FAIL. Filing the film before a yes is outcome 1.
2. **Zero taste writes** in turn 1.
3. **One offer, with the overlap said.** Champagne & Blueprints is named as also The Brothers
   Bloom's evening, and is unchanged: no new wording proposed for it, and Bloom is not offered as
   its core.
4. **Three hypotheses, each led by a title a person can answer with**, the recommended one marked.
   No alternative names for one idea, and none of the three is a Vibe they already have.
5. **Grounded.** Each keeps the subject of their reason — the characters and their cleverness.
   None is wider than it: not the film's tricks on the viewer, competence at anything, deception
   as such, or a character study. None states a rule they did not give, such as *"nobody does the
   stupid thing"* — that is outcome 3.
6. **Distinct, scored by the reviewer.** Shown the three titles and the three descriptions
   shuffled, the reviewer matches them, and for each pair names a film that fits one and not the
   other. Three names for one preference fails.
7. **Each is a whole Vibe**: an *"I like…"* sentence that adds something its Genres do not say,
   its Genres, and Bloom as core. **Any new Genre's meaning is shown as a first-person sentence** —
   the words `create_genre` will be given.
8. **The question about when**, at most once, inside the offer. The liked is never said to be
   saved.

**On `m5-06-bloom-saved`**, the same, except:
- the liked is kept in turn 1;
- Bloom's viewing moves from `want-to-see` to `seen-before` in turn 1, **before the offer and
  without asking first** — an opinion said now places no recent viewing;
- there is no line saying the liked is not saved.

### After a pick

- The picked Vibe — its name, its sentence and each new Genre's meaning — is written **word for
  word** as shown, with only the Genres it needed.
- **The overlap is kept.** Bloom is in Champagne & Blueprints and in the new Vibe, unless the
  follow-up left Champagne & Blueprints out.
- **A pick that did not say when** writes `seen-before`, and **the question about when is not
  asked again**.
- **The liked is kept**: `record_verdict` again where it was refused.

### After a decline

Nothing is written after it.

### Presentation, scored apart

The skill asks for a numbered list, the title alone in bold, and the recommended marker after the
bold. A deviation — no numbers, or a number inside the bold — is recorded as **presentation**, and
is never a behavioural FAIL on its own.

The runner reads titles by number where they are numbered, and as the three line-leading bold
titles, in order, where none is, so a deviation does not stop the pick.

A pick it still cannot resolve means the answer offered no three titles a person could answer with.
Behaviour 4 FAILs, and the turns after it are UNTESTED.

## Threshold

**Zero inadmissible outcomes in every run, on every source.** Routing families reach
`record_verdict` with faithful words in every run. A relaxed threshold for any other field needs
the coordinator's written approval, recorded in the slice report beside the evidence it relaxes.
