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

## A core they want elsewhere

Single vibe: on `m5-07-keep-no-fit`, Hot Fuzz is the core of Laugh Till It Hurts and they love it.
A film is in one Vibe, and a core cannot leave the Vibe it anchors.

| key | request |
| --- | --- |
| `hot-fuzz-talky` | *"Hot Fuzz is really about Nick and Danny talking, for me — it belongs with Walk and Talk, not Laugh Till It Hurts."* |

## A film for one of their Vibes: its sentence and its core

`docs/work/vibe-refit`: on `m5-08-refit`, Before Sunrise belongs on Walk and Talk, whose core,
Before Sunset, they only liked; Only God Forgives belongs on Neon and Silence, whose sentence names
a city only its core, Drive, is set in. On `m5-09-refit-kept`, Before Sunrise is already kept in
Walk and Talk as a film they wanted to see.

| key | request |
| --- | --- |
| `loved-before-sunrise` | *"I loved Before Sunrise."* |
| `liked-only-god-forgives` | *"I really liked Only God Forgives."* |

## The evening first, their Vibes second

`docs/work/discover-vibe-first`: on `m5-10-discover`, Alone With It is Moon's evening in words
that say nothing of space, and Zero-G Popcorn shares only its Space Genre with Moon and
Interstellar; `m5-11-discover-blind` is the same model without Alone With It. `space-vibe-about`
makes Zero-G Popcorn the Vibe the conversation has just been about, before `liked-moon`.

| key | request |
| --- | --- |
| `liked-moon` | *"I really liked Moon, the Sam Rockwell one."* |
| `loved-interstellar` | *"I loved Interstellar."* |
| `space-vibe-about` | *"What's my space vibe about again?"* |

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
| `keep-before-sunset` | *"Yes, but leave Before Sunset as the main one."* |

`other-two-films` (*"What films would go in the other two?"*), the asking after an offer whose
alternatives named no films, is retired: every option in the offer now shows its two films up
front (`docs/work/vibe-all-covers`). Its recordings are read as what they were.

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
