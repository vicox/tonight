---
name: tonight-vibes
description: Write and grow the user's Vibes in Tonight — each anchored on a film they stand behind, proposed in the conversation and written only on their yes. Use when somebody tells you how a film worked for them, when a film they want kept needs a Vibe, when a new user names films they love, or when they want to go through, anchor or tidy their Vibes. Choosing a film to watch is not this skill's.
---

# Tonight — Vibes

A Vibe is the most explicit thing anybody tells Tonight about what they like: a kind of evening,
in their words, built from Genres they wrote and anchored on a film they stand behind. This skill
is how one gets written, and how one grows. **tonight-recommend** is where the conversation
starts — recommending, keeping a film, recording what they said about one — and it is where a
Vibe is read; this skill is where one is written.

Two things hold everywhere below.

- **Noticing is free; writing needs a yes.** Anything you see in what they said — a Vibe it fits,
  a better anchor, a new idea — is an offer, made in the conversation, and nothing is written
  until they agree. A no, or a change of subject, leaves nothing behind: no pending offer, no
  note that you asked, no record that they declined.
- **Their words, never yours.** What they said about a film is a verdict in their words; a
  Vibe's sentence is the one they agreed to. Nothing you concluded becomes either.

## What a Vibe is

A Vibe is a **name**, an **instruction**, one or more **Genres**, exactly one **core** film, and
any number of further films.

- **The core** is the film that currently best embodies the Vibe. It is always one of its films.
  It can be replaced — the film it replaces stays in the Vibe — and it is never cleared.
- **A further film** is one they agreed belongs to that kind of evening. Being in a Vibe carries
  no opinion; verdicts carry opinions, and they calibrate the Vibe exactly as they always have.
- **A Vibe from before cores existed** reads `core: null`. It is complete and usable as it is,
  and it is anchored only when somebody chooses its core — see *Going through their Vibes*.

### What may be a core

A film **they have seen and stand behind**: one with a standing `liked` or `loved`, or one they
name themselves as what the Vibe means. Never a film you offered only as an illustration, never
one they said they have not seen, and never one they disliked or do not want recommended.

Whether a film qualifies is a judgement about what they said, and what they said is a different
root from the Vibe, so nothing in Tonight checks it — with the one exception below. The tools take
any other film you name; choosing the right one is yours.

**A film whose saved viewing is not `seen` is refused as a core.** That is the one part of what
they said that the Vibe's own side holds, so the store checks it — and it checks that saved fact
alone:

- A film they have not seen may still sit in a Vibe — a candidate for that kind of evening — and
  never anchors it.
- **A core that is not saved yet is saved as `seen`** by the call that anchors on it.
- **A standing `liked` or `loved` does not override `want-to-see` or `dont-want-to-see`.** An
  opinion says they watched it, the saved viewing says otherwise, and only they can settle two
  things they said that disagree. Say how it is saved and ask once whether they have seen it. On
  a yes, record `seen` with `update_movie`, then anchor. On a no, or no answer, write nothing.
- **Never change a viewing to get past the refusal** — not on the strength of a verdict, and not
  because they asked for the anchor. A viewing is written only when they said it.

One film may anchor two Vibes. That is allowed, and it is worth noticing: two Vibes held in place
by the same film may be one evening described twice.

### One idea, said three ways

A Vibe is a name, a sentence and some Genres, and the three are one idea or the Vibe is
incoherent. So writing one means **reading the Genres' instructions** — not their names, which
are labels and say almost nothing. `Slapstick` under `Quiet Dread` looks defensible until you
read what Slapstick means to this person: *broad physical comedy, pratfalls, escalating
absurdity*, which is not slow, unsettling tension without gore. Two ideas, one object.

The Vibe's sentence must **add** what the Genres do not say and **contradict** nothing they do.
Both halves matter, and they pull in opposite directions: a sentence that only restates the
Genres has added nothing, and one that goes against them has made the Genres wrong.

**Coherent is not derived.** The Genres hold the idea in place; they never produce it. `Sci-Fi`
and `Thriller` do not yield `Space Tension` — the person did, and no reading of the two
instructions would have found it. The test is not *"do the Genres give me this?"* but *"can
these three be one thing a person meant?"*

**Which Genres, and how many.** Start from the Genres they already have: read each one's
instruction and reuse the ones that genuinely hold part of the idea. Create a Genre only for a
part none of theirs covers, and a new one is part of the offer — named, with what it would mean
— because a yes covers only the meaning they were shown. Two meaningful, distinct Genres is the
usual shape; a third when it holds a part of the idea the other two do not; one when one already
holds all of it. Never filler to hit a number: a Genre added to make up a count is one more
meaning the Vibe has to agree with.

None of this is checked anywhere. Tonight stores whatever is structurally valid; whether the
parts mean one thing is a judgement, and it is yours. **How many films it holds has no part in
it** — a Vibe written last night with only its core is as coherent as one with ten. **The core
does:** it has to embody that one idea. A film that fits the name but not the Genres, or one
Genre but not the sentence, is not a core.

### A Vibe name is evocative, not descriptive

This is the difference between the two objects, and it is easy to get wrong in the direction of
being helpful.

A **Genre** is named for what it is. `Clever thriller`, `Slow burn`, `Character story`,
`Practical effects` — plain, reusable, boring on purpose, because a Genre is an ingredient and
ingredients are named after themselves.

A **Vibe** is named for what it *feels* like. `Space Tension`, `Puzzle Pressure`, `Popcorn Chaos`,
`Small Town Secrets`, `Beautiful Melancholy`, `Quiet Dread`. The name of a shelf in a good video
shop, a playlist somebody made at two in the morning, a list they would go back to.

`Smart, not heavy`, `Funny action`, `Emotional drama`, `Light sci-fi` are **not Vibe names**. They
are the Genres said again in one line. A Vibe named that way has not been named, it has been
labelled.

`create_vibe` carries the test for that in its own description, which is where it is read at the
moment a name is being chosen.

The words for the name can be yours, and a name they do not like is one they will tell you to
change. What a good name must not do is widen the idea — `Quiet Dread`, over an evening they
described as "slow, creepy, nothing gory", is a name for that evening and not evidence that they
like horror. Name the thing they said. Never name a bigger thing.

## When they tell you how a film worked for them

*"I loved Paterson."* *"Logan Lucky was great for a lazy Sunday afternoon when I don't need to
pay full attention."* *"That was exactly my thing because of the dialogue."* However it is
phrased, a statement about how a film worked for them is **a verdict first**, and only then a
question about their Vibes.

    statement
       │
     route ── not about how a film worked ──▶ the ordinary flows (recommend, keep, read, watched)
       │
     the film — title and year; ask only if it is ambiguous
       │
     record_verdict — their words, as volunteered or confirmed      ◀ needs no yes: they said it
       │
     which way it points
       ├── liked / loved ───────────────────────────────▶ consider their Vibes
       ├── liked, but they want no more of the kind ────▶ stop
       └── disliked / taking back a positive ───────────▶ tension, at most once
     consider — get_taste: Vibes with their cores and films, Genre instructions, verdicts
       │ nothing fits ──▶ stop, and say nothing more about it
     offer — in one breath, in the conversation; nothing written
       │
     their answer
       ├── yes ──────────────▶ write everything agreed, then one short sentence saying what
       ├── part of it ───────▶ write exactly the part agreed, with their changes
       ├── no / new subject ─▶ nothing written, nothing remembered, not offered again today
       └── an idea of theirs ▶ consider again, with their meaning

### The verdict

- **Their words go in `because`, unedited**, and only where they gave a reason.
- **`loved` only when their words carry it** — *loved*, *favourite*, *all-time*, *one of the
  best*. A clearly positive statement otherwise is `liked`. Never a stronger judgement than the
  one they gave.
- **Lukewarm or ambiguous words write nothing** — *"it was fine, I guess"* — unless one light
  question settles them, and then the answer is `confirmed`.
- **Watching is not an opinion.** *"I watched it last night"* is a viewing or an evening, never a
  verdict. Neither is taking your recommendation.
- A sentence about **when** or **how** a film worked — a lazy Sunday, half-watching, with friends
  — is part of their reason and stays in `because`. It is never an occasion, a daypart or an
  attention level stored anywhere else, and never a claim like *"you like low-attention films"*.

### What to consider, and what to offer

After a positive verdict, read the model and decide what, if anything, is worth offering:

- **A further film in a Vibe whose instruction it fits** — one Vibe, or several. A partial yes
  writes exactly the part that was agreed.
- **A new core for a Vibe**, only when this film embodies the instruction better than the current
  one, and named against it: *"Palm Springs anchors Time Well Wasted. Groundhog Day is closer to
  what it means — make it the anchor? Palm Springs stays in it."*
- **An anchor for a Vibe with no core yet**, when this film embodies it.
- **A new Vibe**, at most one, anchored on this film — and only when their words carry a *how*,
  *when* or *why* that no existing Vibe covers. A bare *"loved it"* considers existing Vibes only.

When nothing fits, stop and say nothing more about it. Most verdicts end there, and that is fine.

**Asking has a budget.** At most one offer per statement, and at most one new Vibe in it. An idea
they declined is not offered again in this conversation. Never nag: an offer is a sentence they
can ignore, not a question they have to answer.

**When a film answer is owed** — *"Loved Knives Out — what should I watch tonight?"* — the answer
comes first and whole, in tonight-recommend's shape, and the verdict is recorded alongside it.
The offer may be the answer's one closing question; it never displaces the lead or the
directions, and if it does not fit there it waits for the next turn.

**Negative evidence never becomes membership.** After `disliked` or taking back a positive
verdict:

- **the film is a core** → offer once to anchor that Vibe on a film they stand behind, or to keep
  it as it is;
- **the film is a further film** → you may offer once to take it out, or say nothing;
- **the film is in no Vibe** → stop.

**A turn-down is not how a film worked for them**, and it never leads to any Vibe talk at all.
*"Stop suggesting it"* is `dont-want-to-see` on the film — a viewing, never evidence about their
taste — and *"not tonight"* is about an evening, not the film, and is written nowhere.

### Writing what they agreed

A yes is the whole of the permission, and covers exactly what they were shown. Each step is one
tool call; if one fails, stop, say what was and was not written, and never claim a write that did
not happen.

1. `create_genre` for any new Genre in the agreed idea, with the instruction they were shown.
2. Then whichever applies:
   - **a new Vibe** — `create_vibe` with its name, instruction, Genres and **core**. That files
     the core, and saves it first if it is not saved yet.
   - **a new core, or a first one** — `update_vibe` with the core. The film it replaces stays in
     the Vibe.
3. Further films — `update_movie` with the Vibes it is in now plus the agreed ones, or
   `create_movie` for a film that is not saved yet.
4. One short sentence saying what was written.

**Never written:** a film you named only as an illustration; a paraphrase of their reason; a
stronger judgement than theirs; an occasion, daypart or attention field anywhere; a Vibe, a
membership or a core without their yes; any record that an offer was made or turned down.

### How it sounds

| They say | Written | Then |
| --- | --- | --- |
| *"I loved Paterson."* | `loved`, no `because` | existing Vibes only — no reason was given |
| *"Logan Lucky was great for a lazy Sunday afternoon when I don't need to pay full attention."* | `liked`, `because` = that clause, verbatim | a Vibe whose instruction covers it, or one new-Vibe offer anchored on Logan Lucky |
| *"It was exactly my thing because of the dialogue."* | `liked`, `because` verbatim | strengthen a Vibe about dialogue; maybe one new one |
| *"Good, but I don't need another movie like this."* | `liked`, `because` verbatim | **stop** — they declined more of the kind |
| *"It was fine, I guess."* | nothing, unless one light question settles it | nothing |
| *"I hated it."* | `disliked` | tension once, if the film is in a Vibe |
| *"Stop suggesting it."* | `dont-want-to-see` on the film — never `disliked`, which says they watched it | nothing about Vibes |
| *"Don't recommend it again."* | `dont-want-to-see` on the film — a viewing, not a verdict | nothing about Vibes |
| *"Not tonight — too long."* | nothing — it is about an evening, not the film | nothing about Vibes |
| *"I watched it last night."* | a viewing or an evening | nothing — watching is not an opinion |

## Keeping a film: which Vibe, and proposing one

A film they ask you to keep goes into a Vibe — not *"may I save this?"* but *"what kind of night
is this?"* Classify the film; do not fit it to what is there. Read the Genres and Vibes first.

- **One genuinely fits** → save it there, say so in one sentence, ask nothing further.
- **One nearly fits** → not a bucket. **Never stretch a Vibe to avoid making one**; a different
  evening is a different Vibe.
- **None fits** → **do not save the film yet.** Reuse the Genres that genuinely fit, create
  one for anything no Genre covers — as *Which Genres, and how many* says — then propose a Vibe
  over them. Never ask which Vibe they want; that judgement is yours.

What a Vibe's name has to earn, what a Genre and a Vibe each require, and whose voice an
instruction is written in arrive with `create_genre` and `create_vibe`.

**Proposing a new Vibe:** say what you noticed, name it, say what it means, name its core, name
its Genres with what any new one would mean, and make the idea concrete — three to five other
films that would belong in it, and two or three names it could have instead. Then ask. **Those
films are illustration only**: never written, never in the Vibe, never given a viewing or a
verdict. **The core is not one of them**: it is the film they asked to keep when they have seen
it and stand behind it, and otherwise a film of theirs that is — and if none is obvious, ask
which film is closest to what they mean. Only the film they asked to keep, and the core, are
being saved. **A yes is the whole of the permission**: any Genre it needs, then the Vibe with its
core, then the film, then one short sentence — never ask a second time. **A no settles it**,
never saving the film loose. Propose while saving, not while recommending; a Vibe that genuinely
fits needs none of this.

Proposed, that sounds like: *"That belongs in a Vibe of its own: **Everybody Has a Plan** — few
people, one room, each running their own game, and Reservoir Dogs is the one that says it best.
It would be built on your Heist and one new Genre, Double-cross: plots where nobody at the table
is telling the truth. The Sting and Before the Devil Knows You're Dead would sit in there too. Or
Nobody Plays Straight, or Small Room, Big Lies — which sounds more like you? Shall I make it?"*

Said in one breath, not laid out as a form. The films are there to show what the idea covers, the
way you would describe a shelf by pointing at what is on it — a name alone is a label, and
somebody agreeing to a label has agreed to less than they think. The alternative names are there
because a name is easier to judge against another name than on its own, and the idea is theirs to
name.

Those films are the one place where naming films is not the start of anything. Mentioning a film
has never written one down, and none of the writing rules reach them: the user has said nothing
about them, so there is nothing to record, nothing to classify and no Vibe to put them in. If they
then say something about one — *"oh, I loved that one"* — that is a new statement about a film,
and it goes through *When they tell you how a film worked for them* like any other.

## A new user's first films

There is still no setup. Somebody new is asked, in one sentence — inside an answer if they asked
for a film, on its own if they did not — what two or three films they love. When they answer:

- **Each film they name is a verdict**: `loved`, `confirmed`, with `because` only where they gave
  a reason. A user who stops here keeps their verdicts and nothing else, and that is complete.
- **Then consider them together.** Two films that express one idea can become one Vibe, one of
  them its core and the other a further film. A film that fits no group can be a Vibe of its own.
  Here the idea may come from the films themselves, because they were asked for exactly this.
- **This is the one offer that may hold several Vibes**: every Vibe it proposes is drawn only from
  the films they just named, each with a primary name and two or three alternatives, an
  instruction, its Genres, its core, and three or four illustration films. The Genres are new, so
  each one's instruction is shown, because a yes covers only the meaning they were shown.
- **One yes covers the offer**; a partial yes writes exactly the agreed part; a no leaves their
  verdicts and nothing else. Writing follows *Writing what they agreed*.

Nothing about this is remembered as a stage they are in. A user who leaves halfway has said what
they said, and that is all.

## Going through their Vibes

Vibes written before cores existed have none, some hold no films at all, and some films sit in
no Vibe. None of it is broken, and none of it is raised unprompted. Go through it only when:

- they ask — *"let's go through my vibes"*; or
- a Vibe with no core is already the subject — new evidence fits it, or they are changing it.

Then, Vibe by Vibe, each item an offer and nothing written without a yes:

1. **Anchor.** Its candidates are its films with a standing `liked` or `loved`. Offer the one that
   best embodies the instruction, and name the runner-up. With no candidate, ask which film
   embodies it: a film they name becomes the core — `update_vibe` saves and files it — and
   whatever they say about that film is its own verdict. A Vibe whose core reads anything
   but `seen` is anchored again in the same way, as one with no core.
2. **Weak** — no films, or none they spoke for. Say so plainly, and offer: anchor it on a film they
   name, merge it, delete it, or leave it as it is for now.
3. **Overlap** — two Vibes whose instructions, Genres and cores describe one evening. A merge is an
   agreed sequence of ordinary writes: agree which Vibe stays; move the films with `update_movie`;
   change the surviving sentence only to words they give you; delete the other with
   `delete_vibe`. There is no merge tool, and the sequence is not atomic — if a step fails, say
   exactly where it stopped.
4. **Films in no Vibe.** One with a standing positive verdict is considered like new positive
   evidence. One without is left alone and not mentioned.

They can stop at any point — *"later"* is an answer — and a Vibe with no core keeps working.

## Growing the model

The idea you just used **is** a Vibe, and the pieces it is made of **are** Genres. Writing them
down is how Tonight gets better at this without anybody configuring it. Wanting something tonight
is not saying it, and on its own leaves nothing behind.

Two Genres meaning the same thing are one taste split in two; two Vibes meaning different things
are two ideas, and merging them loses one. If `Slow burn` is there, do not add `Slow-paced`. A
Genre worth creating is reusable — something that could turn up in a different mood on a
different night: `Clever thriller`, `Light suspense`, `Practical effects`.

One conversation should not produce eight Genres.

What a Vibe may be built from, and whose voice an instruction is written in, are `create_vibe`'s and
`create_genre`'s to state. Names are how everything refers to everything else, so write them as
ordinary phrases — `Slow burn`, not `SlowBurn`.
