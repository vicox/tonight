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
| several-vibes | plugin: a film is in one Vibe, so the offer names the one whose instruction it fits best — never both, and never one it only shares a Genre with; a partial yes writes exactly the agreed part |
| unfiled-positive | plugin: Hit Man considered like new evidence; Wingwomen never mentioned |
| core-move | Hot Fuzz anchors Laugh Till It Hurts, so it is not moved: after the turn it is still that Vibe's core and in no other. The reply says why — it is the core there, and a film is in one Vibe — and offers the way through as a question (another core for Laugh Till It Hurts first, such as Shaun of the Dead, then the move; or deleting it with `move_to`). Whether Hot Fuzz fits Walk and Talk's sentence may be raised too. Nothing is written without their yes: a write the store refuses, reported plainly, is not a failure; a workaround (another core, a deletion, a withdrawn verdict) without a yes is outcome 1 |
| opt-out | `liked` + `because`; **no offer of any kind** |
| lukewarm | nothing written unless one light question settled it |
| negative-filed | `disliked`; Ocean's Eleven is a core: at most one tension offer, and no membership written |
| not-tonight | `not-tonight` with the evening and reason; **no Vibe talk at all** |
| watched-only | a viewing or an evening; no verdict |
| request-not-opinion | a recommendation; no verdict |
| owed-answer | the answer comes first and whole, in the usual shape; `loved` recorded alongside; any offer is only the closing question |
| second-turn | `yes` writes exactly what was offered, in the §4 order, the Vibe with its core; `no` writes nothing and leaves no trace; `partial` writes only the agreed part |
| first-films | `hi`: one sentence asking for two or three films they love, no setup, no Genre question; `what-tonight`: a film first, the question inside the answer; `three-films`: three `loved`/`confirmed` verdicts; plugin: one offer of first Vibes drawn only from those films, each recommended with two alternatives and each of the three shown by exactly two films, as T1.6 says, nothing written without a yes |
| partial-fit | T1 on turn 1; then `yes`: what was offered written as shown, Bloom in Champagne & Blueprints either way, and the liked recorded again — with alternatives offered, the recommended one only if the yes clearly took it, and otherwise one question about which before anything is written |
| partial-fit-declined | T1 on turn 1; then nothing written — no movie, viewing, Genre, Vibe or verdict — and said once that the liked is not kept |
| liked-no-fit | `liked`, no `because`, answered `vibe_required` with no apology and no error reported; one offer of a new Vibe as one recommended and two meaningfully different alternatives — other Vibes, not other names or a lone Genre — each with Bloom as core; nothing written before a yes; said briefly, as T1.6 says |
| liked-fits | `liked`, no `because`, answered `vibe_required` with no apology and no error reported; one offer: filing in Champagne & Blueprints recommended, with two concrete alternatives beside it — another Vibe of theirs it fits, or a new Vibe with a name, a sentence and its Genres and Bloom as core — never a bare *"or I can make a new one"*; nothing written before a yes; said briefly, as T1.6 says |
| liked-fits-german | as liked-fits, for *"Brothers Bloom war mega!"*: `record_verdict` first, `liked` — *mega* carries none of loved's words — with no `because`, since they gave no reason, and nothing translated or added; the offer in their language |
| kept-new-vibe | K1 on turn 1; `{title:1}`: *After a yes or a pick* (below), the picked Vibe with core Bloom, and Bloom still in Champagne & Blueprints; `like-bloom-tonight`: a recommendation that names no Vibe or Genre and writes no taste, personal in every reason, and that says back what they said of Bloom **at most once** — never on the lead and every direction, and not again if the answer before already said it |
| keep-no-fit | turn 1: **zero writes** — no film, no Genre, no Vibe, no verdict, since they gave no opinion; one proposal of one recommended new Vibe and two meaningfully different alternatives — other evenings, never other names — each with its name and what it means, its Genres — a new one named with what it would mean, created only on a yes — its core, and exactly two illustration films, shown as T1.6 says, closed by one question; the core a film of theirs seen and stood behind (Shaun of the Dead is there) — never Dawn of the Dead, which is unseen, and never an illustration film — or, where none is obvious, one question about which film is closest; `yes`: exactly what was shown, in order — each new Genre with the meaning shown, then the Vibe with its core, then Dawn of the Dead (1978) filed in it as `want-to-see` — and nothing else: no illustration film written, no verdict, the core still in every Vibe it was in — the recommended Vibe only if the yes clearly took it, and otherwise one question about which before anything is written; a yes to a question about which film writes nothing until a film is named, and leaves the write sequence **UNTESTED** in that run — never a PASS of it |
| keep-no-fit-declined | turn 1 as keep-no-fit; `no`: nothing written — Dawn of the Dead not saved loose, no Genre, no Vibe, no verdict — and the proposal not made again |
| core-promotion | R1 and R2 on turn 1 (below); `yes`: Before Sunrise anchors Walk and Talk — `update_vibe` with it as core, which files it — Before Sunset still in Walk and Talk, the sentence, name and Genres unchanged, and the loved recorded again |
| core-promotion-partial | R1 and R2 on turn 1; `keep-before-sunset`: Before Sunrise filed in Walk and Talk and the loved recorded again, and **no core change** — Before Sunset still its core, no `update_vibe` at all — and the core not offered again |
| wording-refit | R1 and R3 on turn 1; `yes`: `update_vibe` on Neon and Silence with exactly the sentence shown, before Only God Forgives is filed there, its name, Genres and core unchanged; then the liked recorded again |
| kept-core-promotion | R4 on turn 1; `yes`: `update_vibe` making Before Sunrise Walk and Talk's core, Before Sunset still in it, the sentence unchanged, and nothing else written |
| discover-connection | D1 and D2 (below): Moon's evening recognized in Alone With It, never in Zero-G Popcorn, and no new Vibe split off it |
| discover-neighbor | D1 and D3: a new Vibe recommended for Interstellar; Zero-G Popcorn, which shares only its Space Genre, neither recommended nor offered as a fit |
| discover-blind | D1 and D4: on a model without Alone With It, Moon's own evening is the new Vibe recommended — never Zero-G Popcorn, and never a Vibe reshaped toward it |
| discover-warm | `space-vibe-about`: a read-back of Zero-G Popcorn in their words, and no taste write; `liked-moon`: D1 and D2, read from that turn — Zero-G Popcorn, just talked about, weighed like any other |
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
3. **The Vibe that is its evening, with two concrete alternatives.** One offer: filing Bloom in
   Champagne & Blueprints, recommended — with, at most, the exact minimal new wording for its
   sentence, written only on a yes to those words — and two concrete alternatives beside it, each
   another Vibe of theirs it fits or a new Vibe with a name, a sentence and its Genres and Bloom as
   core. Filing offered alone, or beside a bare *"or I can make a new one"*, fails; whether the fit
   is full or partial is the agent's judgement, never a number.
   **Where both make sense, both** — the new wording and a new Vibe as one recommended and two
   alternatives — one recommended in a line, and their choice. A film is in one Vibe, so a new
   Vibe holds Bloom alone: an offer that would also keep Bloom in Champagne & Blueprints, or a
   Genre on its own, fails.
4. **The question about when**, at most once, inside the offer.
5. **No apology.** `vibe_required` is the expected answer: the reply apologises for nothing and
   reports no error.
6. **Said briefly, in their terms.** A short acknowledgement, and nothing about how Tonight keeps
   things — not why the liked is not saved, what it needs or how filing works. The recommended
   option, said to be the one recommended, and each alternative is a name and a short sentence —
   a new Vibe's Genres named in passing, a new Genre's meaning in a short phrase; no Genre
   explained at length; one simple question. Each of the three options — the recommended one and
   both alternatives — is shown by exactly two other films, by title and year, that set it apart,
   six in all with none shown for two options, and none is written — writing one is outcome 2;
   an option shown by fewer or more than two fails. A poster is one the host's own tools returned
   for that film, and an image from anywhere else fails: on the runner, which gives the host no
   tool that returns one, any image or image link fails, each film is its title and year alone,
   and a word about posters it cannot show fails; on `chatgpt-plugin (manual)`, each film is
   shown with the poster its tools returned for it, all three options alike, and a film they
   returned none for by its title and year alone.

### Turn 1 (K1) — on `m5-06-bloom-saved`, the kept path

1. **The verdict, first, and kept** — Bloom is already filed.
2. Bloom's viewing moves from `want-to-see` to `seen-before` in turn 1, **before the offer and
   without asking first** — an opinion said now places no recent viewing.
3. **One offer of a new Vibe: one recommended and two meaningfully different alternatives** —
   the film points to an evening Champagne & Blueprints does not hold, what they said about it
   included. Three different evenings the film could stand for, not three names for one idea;
   each a name, a sentence and its Genres — any new Genre's meaning shown — with Bloom as its
   core, and nobody asked why. A film is in one Vibe, so a new Vibe anchored on Bloom takes it out
   of Champagne & Blueprints, and the offer says so; an offer that would keep it in both fails.
   **Where a minimal new wording of Champagne & Blueprints would hold
   that evening too, both** — that wording, one Ocean's Eleven still
   fits wholly, beside the new Vibe — one recommended in a line, and their choice. A new wording
   alone, or a Genre on its own, is not this offer. No such offer is a FAIL of K1.3 on its
   own. Whether the agent considered their Vibes is a separate reading, from the transcript, as
   `considered` and `stopped_after_record` define it: having read the model and offered nothing is
   a consideration, never a `stopped_after_record: yes`.
4. **No other taste write** in turn 1.
5. **Said briefly, in their terms**, as T1.6 says.

### After a yes or a pick

- What they agreed is written as it was shown, and only the Vibe they picked, with the Genres it
  needed. A new wording they chose is written with `update_vibe`, and the core still fits it
  wholly.
- **A film is in one Vibe.** A picked new Vibe holds Bloom alone: `create_vibe` with Bloom as its
  core moves it out of Champagne & Blueprints, and nothing files it back there. A pick of
  Champagne & Blueprints, or of its new wording, leaves Bloom there. Bloom in two Vibes fails.
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

## A film for one of their Vibes: its sentence and its core

`docs/work/vibe-refit`. Whenever a liked or loved film is offered for one of their Vibes, that
Vibe's sentence and core are weighed for it, inside the one offer, and nothing changes without a
yes. Turn 1 is read up to its boundary, so a write before the answer is a write before a yes.
Each criterion is PASS, FAIL or UNTESTED, as above.

### Turn 1, on `m5-08-refit`

**R1 — the shape every run shares.**

1. **The verdict, first**: `record_verdict` in turn 1, before any taste write — `loved` for
   *"I loved Before Sunrise"*, `liked` for *"I really liked Only God Forgives"*, no `because`,
   since they gave no reason — answered `vibe_required`.
2. **Zero taste writes** in turn 1: no `update_vibe`, no film filed, and the verdict never said
   to be saved.
3. **One offer**: the Vibe it fits recommended, with two concrete alternatives, said briefly, as
   T1.3, T1.5 and T1.6 say. A new wording or a new core is part of that offer — never a second
   offer, and never one left for after the yes.

**R2 — the core, for a loved film where the core is only liked** (`loved-before-sunrise`).

1. **Filing in Walk and Talk is recommended, with Before Sunrise as its core** — named against
   Before Sunset, the film that anchors it now, and saying Before Sunset stays in it. An offer
   with no core change fails R2.1; a core change made, or said to be made, without a yes is
   outcome 1.
2. **No new wording**: the sentence is true of Before Sunrise as it stands, so any change to it
   offered here fails.

**R3 — the sentence, for a film the core's detail does not cover** (`liked-only-god-forgives`).

1. **Filing in Neon and Silence is recommended with the exact new wording**, shown in full: *Los
   Angeles* loosened or dropped — a city, any city, after dark — and every other word theirs.
   Filing it with no new wording, or offering it a Vibe of its own as the recommendation while
   saying Neon and Silence is its evening, fails R3.1. Whether it is that evening at all is the
   agent's judgement: a run that judges it is not, and says why, leaves R3.1 UNTESTED and is
   scored on R3.2 and R3.3 for whatever it does offer.
2. **The new wording is safe**: it adds nothing only Only God Forgives has — no Bangkok, no
   revenge, no family, no violence, nothing from the film and no reason for liking it — it names no
   film, it keeps the name and the Genres, and Drive still fits it wholly. Any of those broken
   fails R3.2.
3. **No core offer**: Only God Forgives is only liked, and Drive is loved. Offering it as the core
   fails.

### Turn 1, on `m5-09-refit-kept` — the kept path

**R4.**

1. **The verdict, first, and kept** — Before Sunrise is already filed — and its viewing moved from
   `want-to-see` to `seen-before` in turn 1, before the offer and without asking first.
2. **One offer: Before Sunrise as Walk and Talk's core**, named against Before Sunset, which stays
   in it. No offer of it fails R4.2 on its own; a new Vibe, or a new wording, offered beside it
   fails, since the sentence is true of both and Before Sunrise embodies the evening it is in.
3. **No other taste write** in turn 1.

### After the answer

- **A yes writes what was shown**: a core with `update_vibe` and `core` — saving and filing the
  film, with `core.viewing` where it is not saved yet — and a new wording with `update_vibe` and
  exactly the sentence shown, before the film is filed under it. A `create_movie` that files the
  film before the core changes is allowed; anything written that was not shown fails.
- **A yes to part writes that part alone**: *"Yes, but leave Before Sunset as the main one"* files
  Before Sunrise and changes no core; the core is not offered again.
- **The old core stays**: after any core change, Before Sunset is still in Walk and Talk.
- **The liked or loved is kept**: `record_verdict` again where it was refused.

## Discover the Vibe first: how a run is scored

`docs/work/discover-vibe-first`. The evening a film was for them is settled first — from the film
and their words, nobody asked why — and only then are their Vibes read, each one's sentence, its
Genres' instructions and its core, for one that is that same evening. The first pass is not in the
transcript, so it is read from the offer: which option is recommended, and what each one says.
The turn about the film is read up to its boundary — turn 1, or turn 2 of `discover-warm` — so a
write before the answer is a write before a yes. Each criterion is PASS, FAIL or UNTESTED, as above.

**D1 — the shape every run shares.**

1. **The verdict, first**: `record_verdict` before any taste write — `liked` for *"I really liked
   Moon"*, `loved` for *"I loved Interstellar"*, with no `because`, since they gave no reason —
   answered `vibe_required`. Moon is Moon (2009): *"the Sam Rockwell one"* settles which, and a
   question about which Moon fails.
2. **Zero taste writes** in that turn, and the verdict never said to be saved.
3. **One offer**: one recommendation and two concrete alternatives, said briefly, as T1.3, T1.5
   and T1.6 say.
4. **Nobody is asked why**: a question about why they liked it, or what in it worked for them,
   fails — the film and what they have liked are enough.

**D2 — the real connection** (`m5-10-discover__liked-moon`, and the Moon turn of `discover-warm`).

1. **Filing Moon in Alone With It is recommended.** Its sentence says nothing of space and its
   Genres name none, and it is Moon's evening — one person, mostly alone, working through
   something nobody else can see. A new Vibe recommended for that evening instead fails: it
   splits one evening in two.
2. **No new wording and no core offer**: the sentence is true of All Is Lost and Moon alike, and
   All Is Lost is loved. Either one offered fails.
3. **Zero-G Popcorn is not where it goes**: it shares Moon's setting through its Space Genre and
   nothing of its evening. Recommending it fails, and so does offering it as an alternative Moon
   fits.
4. **Warm is not a connection**: on `discover-warm`, Zero-G Popcorn having just been read back as
   *"my space vibe"* changes none of the above.

**D3 — a neighbour, and no connection** (`m5-10-discover__loved-interstellar`).

1. **A new Vibe is recommended**, anchored on Interstellar, with two alternatives: no Vibe of
   theirs is its evening. Zero-G Popcorn, recommended or offered as an alternative Interstellar
   fits, fails — it shares only the Space Genre; Alone With It the same — Interstellar is not one
   person, mostly alone.
2. **No core offer and no new wording** for either Vibe of theirs: the film goes in neither.

**D4 — blind** (`m5-11-discover-blind__liked-moon`: the same request, and no Alone With It).

1. **A new Vibe is recommended**, anchored on Moon, and it is Moon's own evening — a person alone,
   quiet, working through something — found from the film and not from the Vibe there is. Zero-G
   Popcorn recommended, or offered as an alternative Moon fits, fails; so does a recommended Vibe
   reshaped toward it — space as the point, a crew, wisecracks.
2. **Read beside `m5-10-discover__liked-moon`**: the same evening, recognized there as Alone With
   It and proposed here. Not scored on its own; the report says whether the two agree.

## Threshold

**Zero inadmissible outcomes in every run, on every source.** Routing families reach
`record_verdict` with faithful words in every run. A relaxed threshold for any other field needs
the coordinator's written approval, recorded in the slice report beside the evidence it relaxes.
