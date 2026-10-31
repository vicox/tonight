# The M5 request set

One row, one request, verbatim. A run is named by its fixture and the key of the request it was
given, and the request is passed to the agent exactly as the second column writes it — no framing,
nothing about the evaluation, and nothing that names a tool or a Vibe operation.

> **Nothing here names a tool, and nothing asks for a Vibe.** The whole question of M5 is whether
> an ordinary sentence about a film is routed into a verdict and then, where it should be, into a
> considered offer — a prompt that said "record this" or "add it to a Vibe" would answer that on
> the model's behalf.

## A film, and how it worked for them

| key | request |
| --- | --- |
| `loved-paterson` | *"I loved Paterson."* |
| `logan-lucky-sunday` | *"Logan Lucky was great for a lazy Sunday afternoon when I don't need to pay full attention."* |
| `groundhog-background` | *"Groundhog Day is perfect to have on in the background on a Sunday afternoon."* |
| `social-network-dialogue` | *"The Social Network was exactly my thing because of the dialogue."* |
| `nice-guys-several` | *"I loved The Nice Guys — the banter, and the whole plan falling apart."* |
| `hit-man-again` | *"Hit Man was even better the second time. Loved it."* |
| `knives-out-opt-out` | *"Knives Out was good, but I don't need another movie like this."* |
| `tenet-lukewarm` | *"Tenet was fine, I guess."* |
| `hated-oceans` | *"I hated Ocean's Eleven when I watched it again, actually."* |
| `not-tonight-irishman` | *"Not The Irishman tonight — too long."* |
| `watched-palm-springs` | *"I watched Palm Springs again last night."* |
| `like-oceans-tonight` | *"Something like Ocean's Eleven for tonight?"* |
| `knives-out-and-tonight` | *"Loved Knives Out — what should I watch tonight?"* |

## A film they liked, and what they loved in it

`docs/work/vibe-hypotheses`: a liked with a reason, on a film whose evening one of their Vibes is
and whose reason none of them says.

| key | request |
| --- | --- |
| `bloom-clever` | *"I liked The Brothers Bloom because clever characters do smart things."* |
| `like-bloom-tonight` | *"Something like The Brothers Bloom for tonight?"* |
| `liked-bloom` | *"I liked The Brothers Bloom."* |
| `bloom-war-mega` | *"Brothers Bloom war mega!"* |

`liked-bloom` is the same film with no reason (§19): on `m5-04-reading` no Vibe of theirs is its
evening, and on `m5-05-partial-fit` one is. `bloom-war-mega` is that bare liked again, in German
and as somebody would type it, on `m5-05-partial-fit` (skill compliance).

## A film to keep

`docs/work/skill-cleanup`: a film they ask to keep, unseen, that no Vibe of theirs holds.

| key | request |
| --- | --- |
| `keep-dawn` | *"Put the original Dawn of the Dead on my list."* |

## The second turn

Given after one of the requests above, in the same session.

| key | request |
| --- | --- |
| `yes` | *"Yes, do that."* |
| `no` | *"No, leave it."* |
| `partial` | *"Only the first part, not the rest."* |
| `three-films` | *"Paterson, Arrival and Palm Springs."* |
| `pick-title-one` | *"{title:1}"* |

`{title:N}` is not sent as written. The runner puts in its place the title the answer before it
offered as choice N — the title alone, as somebody choosing by title would say it — and fails the
turn before any call when that answer does not say which title that is (`evaluation/lean.mjs`,
`titleNumbered`). Most formatting does not decide it: titles are read by their number where the
answer numbers a list, and as the three line-leading bold titles, in order, where nothing is
numbered. A pick the runner cannot read leaves the turns after it UNTESTED (`rubric.md`).

## Somebody new

| key | request |
| --- | --- |
| `hi` | *"Hi — what is this?"* |
| `what-tonight` | *"What should I watch tonight?"* |

## Going through what is there

| key | request |
| --- | --- |
| `go-through` | *"Let's go through my vibes."* |
| `loved-machete` | *"Machete is still the best — I loved it."* |

## Recommending, and only recommending

| key | request |
| --- | --- |
| `from-my-taste` | *"Something from my taste for tonight?"* |
