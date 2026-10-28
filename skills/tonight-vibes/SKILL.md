---
name: tonight-vibes
description: Write and grow the user's Vibes in Tonight — each anchored on a film they stand behind, proposed in the conversation and written only on their yes. Use when somebody tells you how a film worked for them, when a liked or loved is answered vibe_required, when a film they want kept needs a Vibe, when a new user names films they love, or when they want to go through, anchor or tidy their Vibes. Choosing a film to watch is not this skill's.
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

**How well a film fits is a judgement, never a number.** The core fits its Vibe wholly. A further
film fits it well enough to belong there on its own. A film that only partly fits sits in a Vibe
only beside another it fits well or anchors; a film that does not meaningfully fit is not added.

### What may be a core

A film **they have seen and stand behind**: one with a standing `liked` or `loved`, or one they
name themselves as what the Vibe means. Never a film you offered only as an illustration, never
one they said they have not seen, and never one they disliked or do not want recommended.

Whether a film qualifies is a judgement about what they said, and what they said is a different
root from the Vibe, so nothing in Tonight checks it — with the one exception below. The tools take
any other film you name; choosing the right one is yours.

**A film whose saved viewing is neither `seen-now` nor `seen-before` is refused as a core.** That
is the one part of what they said that the Vibe's own side holds, so the store checks it — and it
checks that saved fact alone:

- A film they have not seen may still sit in a Vibe — a candidate for that kind of evening — and
  never anchors it.
- **A core that is not saved yet is saved as its `core.viewing`** by the call that anchors on it —
  `seen-now` or `seen-before`, read from what they said by the viewing rule in
  **tonight-recommend**, with a question about when folded into the one you are putting about the
  Vibe. Left out, it is `seen-before`. A saved film keeps its own viewing whatever
  `core.viewing` says.
- **A standing `liked` or `loved` does not override `want-to-see` or `dont-want-to-see`.** An
  opinion says they watched it, the saved viewing says otherwise, and only they can settle two
  things they said that disagree. Say how it is saved and ask once whether they have seen it and,
  if so, recently or a while ago — one question. On a yes, record `seen-now` or `seen-before` with
  `update_movie`, as their answer says, then anchor. On a no, or no answer, write nothing.
- **A liked or loved they tell you now is them telling you they watched it.** A film saved as
  `want-to-see` moves to `seen-now` or `seen-before` in the same turn — `update_movie`, by the
  viewing rule in **tonight-recommend**, `seen-before` when nothing they said places it recently —
  and you say what you stored. **Write it before you offer or ask anything, and never ask about
  when first**: their answer, if they give one, corrects it. That is their word, captured when
  they said it, not a verdict standing in for it. A `dont-want-to-see` film is still the one
  question above.
- **Never change a viewing to get past the refusal** — not on the strength of a verdict, and not
  because they asked for the anchor. A viewing is written only when they said it.

One film may anchor two Vibes. That is allowed, and it is worth noticing: two Vibes held in place
by the same film may be one evening described twice.

### One idea, said three ways

A Vibe is a name, a sentence and some Genres, and the three are one idea or the Vibe is
incoherent. So writing one means **reading the Genres' instructions** — not their names, which
are labels and say almost nothing. A Genre whose name looks at home under a Vibe can still mean,
to this person, the opposite of the evening the Vibe describes, and only its instruction shows
it. Two ideas, one object.

The Vibe's sentence must **add** what the Genres do not say and **contradict** nothing they do.
Both halves matter, and they pull in opposite directions: a sentence that only restates the
Genres has added nothing, and one that goes against them has made the Genres wrong.

**Coherent is not derived.** The Genres hold the idea in place; they never produce it. Two
Genres do not yield the Vibe built on them — the person did, and no reading of the two
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

A **Genre** is named for what it is — plain, reusable, boring on purpose, because a Genre is an
ingredient and ingredients are named after themselves.

A **Vibe** is named for what it *feels* like. The name of a shelf in a good video shop, a
playlist somebody made at two in the morning, a list they would go back to.

A name that lists the Genres, or puts a quality in front of one, is **not a Vibe name**: it is
the Genres said again in one line. A Vibe named that way has not been named, it has been
labelled.

`create_vibe` carries the test for that in its own description, which is where it is read at the
moment a name is being chosen.

The words for the name can be yours, and a name they do not like is one they will tell you to
change. What a good name must not do is widen the idea — a name for an evening they described is
a name for that evening, never evidence that they like the wider genre the name calls to mind.
Name the thing they said. Never name a bigger thing.

## When they tell you how a film worked for them

A bare liked or loved, a reason, or when and how it worked for them — however it is phrased, a
statement about how a film worked for them is **a verdict first**, and only then a
question about their Vibes. **A liked or loved is kept only for a film in at least one of their
Vibes** — the Vibe is what says why it worked — so for a film in none, the Vibe comes before the
verdict is saved.

    statement
       │
     route ── not about how a film worked ──▶ the ordinary flows (recommend, keep, read, watched)
       │
     the film — title and year; ask only if it is ambiguous
       │
     record_verdict — their words, as volunteered or confirmed      ◀ needs no yes: they said it
       │
     which way it points
       ├── liked / loved, kept ─────────────────────────▶ consider their Vibes
       ├── liked / loved, answered vibe_required ───────▶ find its Vibe, then record it again
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
- **Lukewarm or ambiguous words write nothing** unless one light question settles them, and then
  the answer is `confirmed`.
- **Watching is not an opinion.** Saying they watched it is a viewing, never a verdict.
  Neither is taking your recommendation. Whether it touches an evening is the recommend skill's
  rule, whole:
  - it **updates** a recorded evening — `started` on that film — only when they unambiguously
    referred to that evening: a reply in the conversation that recorded it, or their naming it.
    A title that matches, or the evening being recent, is never the reference;
  - an evening of their own watching that names no evening you recorded **creates a new**
    evening with no request, and never attaches to an existing one;
  - anything else — a statement that might be about a recorded evening but does not say so
    included — writes to **no** evening, and no question is asked in order to file it.
- A sentence about **when** or **how** a film worked — the time they watched it, how closely, who
  with — is part of their reason and stays in `because`. It is never an occasion, a daypart or an
  attention level stored anywhere else, and never a claim about the kind of viewer they are.

### When a liked or loved needs a Vibe

`record_verdict` keeps a liked or loved only for a film filed in at least one of their Vibes. For
a film in none — not saved at all, or saved and filed nowhere — **nothing is written**, and the
answer is `reason: "vibe_required"`, with `retry` (the same call, with their words and how they
said it) and `next`. **Until the film is filed, the verdict is not saved, so never say it is.**
Then, in this conversation, one offer:

1. **An existing Vibe first.** Read `get_taste` — each Vibe's instruction and its Genres'
   instructions, not the names. If one fits, propose filing the film there.
2. **A minimal change, only when needed, and only on their yes.** If the film belongs to that
   same evening and the Vibe's sentence just does not yet say what makes it fit, show them the
   exact new wording — the smallest change that covers it, and one its core still fits wholly —
   and write it with `update_vibe` only on their yes to those words. If fitting it would make the Vibe a different evening, it is not
   that Vibe: go on to 3. A minimal change is never a way to stretch a Vibe.
3. **Otherwise one recommended new Vibe and two meaningfully different alternatives**, in one
   breath: three different reasons the film may have worked for them, not three names for one
   idea. Each is a name, a sentence and its Genres — any new Genre's meaning shown — with this
   film as its core. Their pick says why they liked it; an idea of their own is
   considered again with their meaning.

**When both make sense.** If the film only partly fits a Vibe, and both a minimal change to it and
a new Vibe would make sense, offer both in the one offer: the exact new wording, as 2 says, and a new
Vibe as 3 offers one — anchored on the film, which then also goes in the Vibe it partly fits. Say
in one line which you would choose and why, and let them choose. A film that fits well is only
proposed for filing, as 1 says, with nothing more offered.

On their yes, write exactly what they agreed, as *Writing what they agreed* says, then call
`record_verdict` again with `retry.arguments`, then say in one short sentence what was saved. A
film not saved yet is filed by `create_vibe` with it as core and its `core.viewing`, or by
`create_movie` with `viewing` `seen-now` or `seen-before` and its Vibes — liking it says they
watched it, not when, so when they did not say, that question goes into the one you put about the
Vibe; a saved one by `update_movie` with its Vibes. **A yes that does not say when is them not
saying**: if nothing they said in this conversation placed it either, the film is written
`seen-before` with it — timing they did give stands, and a seen viewing already stored is kept —
and when is never asked again. On a no, or a change of subject, the liked or loved stays unsaved: say so once, and write
nothing in its place — no `disliked`, no viewing they did not state, and no record that you asked.
A film not saved yet stays unsaved; a saved one keeps the viewing their liked already moved.

This is the one place a bare *"loved it"* may lead to new Vibes: the alternatives are how you
learn the why they did not give. And when they said they want no more of the kind, offer nothing:
say once that a liked is kept only with a Vibe, and leave it there.

### What to consider, and what to offer

After a positive verdict that was kept — the film is already in a Vibe — read the model and
decide what, if anything, is worth offering:

- **A further film in a Vibe whose instruction it fits** — one Vibe, or several. A partial yes
  writes exactly the part that was agreed.
- **A new core for a Vibe**, only when this film embodies the instruction better than the current
  one, and named against it: the film that anchors it now, why this one is closer to what it
  means, and that the current one stays in it.
- **An anchor for a Vibe with no core yet**, when this film embodies it.
- **A new Vibe**, at most one, anchored on this film — and only when their words carry a *how*,
  *when* or *why* that no existing Vibe covers. Offer it as step 3 of *When a liked or loved needs
  a Vibe* does: one recommended new Vibe and two meaningfully different alternatives, three
  different reasons the film may have worked for them, not three names for one idea. Where a
  minimal change to the Vibe it is in would say that too — one its core still fits wholly — offer
  both, as *When both make sense* says; the film stays in that Vibe either way. A bare
  *"loved it"* considers existing Vibes only.

When nothing fits, stop and say nothing more about it. Most verdicts end there, and that is fine.

**Asking has a budget.** At most one offer per statement, and at most one new Vibe in it — a
`vibe_required` offer, or a new Vibe for a kept one, is still one offer: its recommended Vibe and
two alternatives, of which they pick one — and so is one that offers both, as *When both make
sense* says. An idea they declined is not offered again in this conversation. Never nag: an offer is
a sentence they can ignore, not a question they have to answer.

**When a film answer is owed** — a verdict and a request for a film in one breath — the answer
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
taste — and *"not tonight"* is about an evening, not the film: never a viewing or a verdict, at
most a pass on that evening.

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
   `create_movie` for a film that is not saved yet. That includes the new core when it also
   belongs to a Vibe they have: its `update_movie` lists the new Vibe and that one — the list
   replaces what was there, so a Vibe left out of it is a Vibe the film leaves.
4. Every liked or loved that was answered `vibe_required` — `record_verdict` again with its
   `retry.arguments`, now that its film is filed.
5. One short sentence saying what was written.

**Never written:** a film you named only as an illustration; a paraphrase of their reason; a
stronger judgement than theirs; an occasion, daypart or attention field anywhere; a Vibe, a
membership or a core without their yes; any record that a Vibe offer was made or turned down.

### What each kind of statement writes

| What they said | Written | Then |
| --- | --- | --- |
| They loved it, and gave no reason | `loved`, no `because` — kept if the film is in a Vibe | kept: existing Vibes only — no reason was given. In no Vibe: not saved yet — its Vibe (an existing one, or one recommendation and two alternatives), then `record_verdict` again |
| They liked it, and said when or how it worked for them | `liked`, `because` = their words, verbatim — kept if it is in a Vibe | a Vibe whose instruction covers it, or one new-Vibe offer anchored on that film — in no Vibe, that offer comes first and the verdict after it |
| They liked it for one part of the film | `liked`, `because` verbatim — kept if it is in a Vibe | strengthen a Vibe about that part; maybe one new one — in no Vibe, its Vibe first |
| They liked it, and want no more of the kind | `liked`, `because` verbatim — kept if it is in a Vibe | **stop** — they declined more of the kind; in no Vibe, say once it is not kept without one, and offer nothing |
| Lukewarm or ambiguous words | nothing, unless one light question settles it | nothing |
| They disliked it | `disliked` | tension once, if the film is in a Vibe |
| They ask not to be offered it again | `dont-want-to-see` on the film — a viewing, not a verdict, and never `disliked`, which says they watched it | nothing about Vibes |
| They turn it down for one evening, with a reason | at most a pass on that evening, their reason with it — it is about an evening, not the film | nothing about Vibes |
| They say they watched it recently | a viewing, `seen-now`; `started` on a recorded evening only when they referred to it, a new evening of their own when they named none you recorded, and no evening when it is unclear | nothing — watching is not an opinion |

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

Said in one breath, not laid out as a form, and closed by one question: whether to make it. The films are there to show what the idea covers, the
way you would describe a shelf by pointing at what is on it — a name alone is a label, and
somebody agreeing to a label has agreed to less than they think. The alternative names are there
because a name is easier to judge against another name than on its own, and the idea is theirs to
name. That proposal, with its other names, is for a film they ask you to keep. Where a new Vibe is
offered for a film they liked or loved — step 3 of *When a liked or loved needs a Vibe*, a kept
one's new Vibe, or first films — its two alternatives are other Vibes, other reasons the film may
have worked for them, never other names for the same one.

Those films are the one place where naming films is not the start of anything. Mentioning a film
has never written one down, and none of the writing rules reach them: the user has said nothing
about them, so there is nothing to record, nothing to classify and no Vibe to put them in. If they
then say something about one, that is a new statement about a film,
and it goes through *When they tell you how a film worked for them* like any other.

## A new user's first films

There is still no setup. Somebody new is asked, in one sentence — inside an answer if they asked
for a film, on its own if they did not — what two or three films they love. When they answer:

- **Each film they name is a verdict**: `loved`, `confirmed`, with `because` only where they gave
  a reason. A loved is kept only for a film in a Vibe, so for somebody new every one is answered
  `vibe_required` and nothing is saved yet — the offer below is how they are kept. A user who
  stops here keeps nothing positive, and that is complete.
- **Then consider them together.** Two films that express one idea can become one Vibe, one of
  them its core and the other a further film. A film that fits no group can be a Vibe of its own.
  Here the idea may come from the films themselves, because they were asked for exactly this.
- **This is the one offer that may hold several Vibes**: every Vibe it proposes is drawn only from
  the films they just named, each with two meaningfully different alternatives beside it — other
  reasons those films may have worked, not other names for one — an instruction, its Genres, its
  core, and three or four illustration films. The Genres are new, so each one's instruction is
  shown, because a yes covers only the meaning they were shown.
- **One yes covers the offer**; a partial yes writes exactly the agreed part; a no saves nothing
  positive. Writing follows *Writing what they agreed*, and each loved is recorded again once its
  film is filed.

Nothing about this is remembered as a stage they are in. A user who leaves halfway has said what
they said, and that is all.

## Going through their Vibes

Vibes written before cores existed have none, some hold no films at all, and some films sit in
no Vibe. None of it is broken, and none of it is raised unprompted. Go through it only when:

- they ask to go through them; or
- a Vibe with no core is already the subject — new evidence fits it, or they are changing it.

Then, Vibe by Vibe, each item an offer and nothing written without a yes:

1. **Anchor.** Its candidates are its films with a standing `liked` or `loved`. Offer the one that
   best embodies the instruction, and name the runner-up. With no candidate, ask which film
   embodies it: a film they name becomes the core — `update_vibe` saves and files it — and
   whatever they say about that film is its own verdict. A Vibe whose core reads anything
   but `seen-now` or `seen-before` is anchored again in the same way, as one with no core.
2. **Weak** — no films, or none they spoke for. Say so plainly, and offer: anchor it on a film they
   name, merge it, delete it, or leave it as it is for now.
3. **Overlap** — two Vibes whose instructions, Genres and cores describe one evening. A merge is an
   agreed sequence of ordinary writes: agree which Vibe stays; move the films with `update_movie`;
   change the surviving sentence only to words they give you; delete the other with
   `delete_vibe` — films first, because it refuses to leave a liked or loved film in no Vibe.
   There is no merge tool, and the sequence is not atomic — if a step fails, say exactly where it
   stopped.
4. **Films in no Vibe.** One with a standing positive verdict is considered like new positive
   evidence. One without is left alone and not mentioned.

They can stop at any point — *"later"* is an answer — and a Vibe with no core keeps working.

## Growing the model

The idea you just used **is** a Vibe, and the pieces it is made of **are** Genres. Writing them
down is how Tonight gets better at this without anybody configuring it. Wanting something tonight
is not saying it, and on its own leaves nothing behind.

Two Genres meaning the same thing are one taste split in two; two Vibes meaning different things
are two ideas, and merging them loses one. Never add a Genre whose meaning one of theirs already
has, under a different name. A Genre worth creating is reusable — something that could turn up
in a different mood on a different night.

One conversation should not produce eight Genres.

What a Vibe may be built from, and whose voice an instruction is written in, are `create_vibe`'s and
`create_genre`'s to state. Names are how everything refers to everything else, so write them as
ordinary phrases — words with spaces between them, never run together.
