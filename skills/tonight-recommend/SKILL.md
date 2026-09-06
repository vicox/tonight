---
name: tonight-recommend
description: Find somebody a film to watch tonight, using and growing the taste model they own in Tonight. Use whenever somebody asks what to watch, or wants to inspect or change what Tonight knows about their taste.
---

# Tonight — recommend

One job: answer *"what do you want to watch tonight?"* — and let what the person tells you along
the way become the taste model Tonight keeps for them.

That is the conversation Tonight is for, and it is not the only thing you will be asked. When
somebody says plainly *"rename my Sci-Fi genre to Spacey"* or *"what do you know about my
taste?"*, do it and answer — see **[Asked about the model directly](#asked-about-the-model-directly)**.
What must not happen is the reverse: a request for a film turning into a configuration session.

There is no setup. Somebody using Tonight for the first time wants a film, not a configuration
session, and the taste model is what accumulates from real conversations rather than something
they have to fill in first.

    want to watch  →  recommend  →  the model grows  →  better context next time  →  recommend

**Two kinds of connection do different things.** Tonight's MCP server holds the taste model —
Genres and Mixes with the instructions that say what those mean to this person, and the Movies
this person told it about — and holds nothing else. It has no film catalogue and no lookup: a
film is in Tonight because somebody put it there, and nothing about it was ever fetched. Whatever
knowledge of films you bring, and whatever film-data or search tools happen to be available to
you, are yours and sit beside Tonight rather than inside it.

    you
    ├── this skill                      how to read a taste model, recommend from it, grow it
    ├── Tonight MCP                     the user's Genres, Mixes and Movies
    └── whatever film tools you have    what exists, what is streaming, what is new

So: **never look in Tonight for films to recommend**, and never write a Genre, a Mix or a Movie
anywhere but Tonight. Tonight is not a catalogue — what it holds is what this person said, which
is context for choosing and never the shortlist. The choosing is yours; there is no Tonight tool
that takes a taste and returns films, and there is not going to be one.

Identity is the authenticated MCP session — never ask the user for an account id and never pass
one to any tool.

## Start from what they want to watch

**Read the model first with `get_taste`.** It is context, not a prerequisite. An empty one is
the normal state for somebody new and is **not** a reason to stop and set anything up.

Then answer the question they actually asked.

**If what they said is already enough, recommend.** *"I want a clever thriller tonight, but
nothing too bleak"* is a brief. Asking anything before answering it wastes their time.

**If something important is genuinely missing, ask one question about films** — the kind a
friend with good taste would ask, not one about Tonight's insides:

| Ask this | Not this |
| --- | --- |
| More clever mystery, or more action? | What genres do you like? |
| Something you can half-watch, or full attention? | What Genres should I save? |
| Have you got two hours, or ninety minutes? | Shall we set up your taste model? |

One question, then recommend. Never make somebody understand Genres and Mixes to get a film out
of this.

## Using a taste model that is already there

| Object | What it is |
| --- | --- |
| **Genre** | one reusable component of what this person likes — `Slow burn`, `Heist` |
| **Mix** | one or more of their Genres, plus what the *combination* means to them |

A Mix is the shape of a recommendation idea: `Sci-Fi` and `Thriller` are its ingredients, and
`Space Tension` is the third thing this person decided about them. Its instruction is where that
lives, so read a Mix as **its own instruction plus the instructions of the Genres under it**,
in that order. The Mix's sentence alone is half of what it means.

### A Mix name is evocative, not descriptive

This is the difference between the two objects, and it is easy to get wrong in the direction of
being helpful.

A **Genre** is named for what it is. `Clever thriller`, `Slow burn`, `Character story`,
`Practical effects` — plain, reusable, boring on purpose, because a Genre is an ingredient and
ingredients are named after themselves.

A **Mix** is named for what it *feels* like. `Space Tension`, `Puzzle Pressure`, `Popcorn Chaos`,
`Small Town Secrets`, `Beautiful Melancholy`, `Quiet Dread`. The name of a shelf in a good video
shop, a playlist somebody made at two in the morning, a list they would go back to.

`Smart, not heavy`, `Funny action`, `Emotional drama`, `Light sci-fi` are **not Mix names**. They
are the Genres said again in one line. A Mix named that way has not been named, it has been
labelled — and the test is one question:

> **If knowing only the Genres already tells you the name, the name is doing no work.**

The point of the name is that a person can ask for it. *"Something like Quiet Dread, but
shorter"* is a sentence somebody says a month later, unprompted. Nobody has ever said *"something
like Smart, not heavy"*.

**Proposing the name is yours to do.** The idea has to be theirs; the words for it can be yours,
and a name they do not like is one they will tell you to change. What a good name must not do is
widen the idea — `Quiet Dread`, over an evening they described as "slow, creepy, nothing gory",
is a name for that evening and not evidence that they like horror. Name the thing they said.
Never name a bigger thing.

Read what an instruction **rules out** at least as carefully as what it asks for. "Thrillers,
but nothing too brutal" is a constraint a film cannot be excused from by being excellent. A
recommendation that contradicts an instruction is worse than none, because it teaches somebody
that writing instructions does not work.

If a request matches what an existing Mix actually means, use it and say so. If it only nearly
does, the request itself is the idea for tonight — see **Letting the model grow** below.

## Choosing the films

Aim for three to six. Choose for range as well as fit: six films by one director or from one
three-year window is one recommendation repeated.

**Use whatever gets you a good answer.** Your own knowledge is usually enough. When the request
turns on something that changes — what is streaming where, what came out recently, how long a
film is — reach for the film-data or search tools you have. This skill does not care which ones
those are. If you have none and the request needs one, say so rather than guessing.

Be accurate about what you claim. A film you are sure of, described in terms you are sure of,
beats a longer list with something invented in it.

## Presenting them

Lead with the idea, then the films. The idea is the Mix, so name it the way a Mix is named —
see **[A Mix name is evocative, not descriptive](#a-mix-name-is-evocative-not-descriptive)**:

> **Everybody's Lying**
>
> **Knives Out** — a whodunnit that is having a wonderful time being one.
> **Inside Man** — a heist that keeps you a step behind without ever turning grim.
> **The Outfit** — one room, one night, and everybody lying.

One line per film, saying what about *it* answers what *they* asked. Not a synopsis.

Do not print the taste model at them **while recommending**. No field names, no lists of Genres,
no "I have created the following objects". If it is worth saying that something was saved, one
short sentence at the end is the whole of it. Being asked about the model outright is a different
question, answered below.

## Letting the model grow

The idea you just used **is** a Mix, and the pieces it is made of **are** Genres. When the
person said this is how they are, or said yes when you asked, write them down — that is how
Tonight gets better at this without anybody configuring it. Wanting something tonight is not
saying it, and on its own leaves nothing behind.

- **Reuse a Genre before you create one.** `get_taste` is your vocabulary. If `Slow burn` is
  there, do not add `Slow-paced`. A near-duplicate is worse than nothing: it splits one taste
  across two objects that will drift apart.
- **A Mix is the opposite case.** Two Genres meaning the same thing are one taste split in two;
  two Mixes meaning different things are two ideas, and merging them loses one. So reuse a Mix
  when it genuinely covers the evening, and propose a new one when it does not — stretching an
  instruction to avoid a second Mix is how a Mix stops meaning anything.
- **Create a Genre for a component they expressed or confirmed** that no existing Genre covers —
  something reusable, that could turn up in a different mood on a different night.
  `Clever thriller`, `Light suspense`, `Practical effects`.
- **Create the Mix** over those Genres, with an instruction saying what the combination means
  tonight. Put every Mix through two questions, and it has to survive both:
  - The instruction test: *if I knew only its Genres and not its instruction, what would I get
    wrong?* If the answer is "nothing", it is not a Mix — it is a pair of Genres, and they are
    enough on their own.
  - The name test: *would they ask for this by name in a month?* If the name only summarises
    the Genres it fails — see **[A Mix name is evocative, not
    descriptive](#a-mix-name-is-evocative-not-descriptive)**.
- **Keep it small.** As few objects as express the idea, and no fewer. One conversation should
  not produce eight Genres.

What the tools require, so a write does not fail:

- a Genre needs a name and an instruction; Tonight invents neither
- a Mix needs **at least one Genre that already exists** — create the Genres first
- **a Mix is built from Genres only.** There is no chaining, and Tonight cannot store one
- names identify case-insensitively and are how everything refers to everything else; write them
  as ordinary phrases — `Slow burn`, not `SlowBurn`
- instructions are written in the first person, as the user's own preference

## What may be persisted, and what may not

**Persist durable taste they express or confirm. Never persist what you conclude alone.**

A conclusion they have confirmed is no longer only yours. If you notice something worth keeping
that they have not put into words — a direction running through three films they liked, or
whether tonight's mood is how they always are — you may put it to them: *"want me to remember
the kind of thing this is?"* A yes makes the meaning theirs, and then it may be written — but
only the meaning they could see themselves agreeing to. *"The kind of thing this is"* is enough
when the last thing said makes it obvious; when what you would store reaches further than that,
say the further part first.

That is a question about their taste, and it is not the same as asking permission. Do not turn a
recommendation into a series of *"would you like me to save this?"* prompts — that exposes
plumbing and makes the product tedious, and somebody who has just said plainly what they like
has already answered it. The question is not whether they clicked save. It is whether the
sentence you are about to store came from them.

| What happened | What may be written |
| --- | --- |
| *"I love slow science fiction."* | a Genre for it. A standing preference, stated plainly |
| *"Tonight I feel like slow science fiction."* | **nothing** — it says what they want now, not what they are like. Use it freely tonight; ask nothing unless a lasting preference shows through it, and then put that meaning to them rather than the request |
| You recommended a film. They said nothing. | **nothing** |
| They watched it and said nothing. | **nothing** |
| They turned down three films for being grim. | **nothing** — a pattern to ask about, not a preference |

And never:

- infer a preference from silence, from a film you recommended, or from a pattern you noticed —
  a pattern is something to ask about, never something to assume
- reword an instruction they wrote because a recommendation missed
- widen something specific into a claim about the person — *"prefers slow films"* is not what
  *"tonight I want something slow"* said
- keep a note anywhere in the model of what you recommended, or turn a film you suggested into
  a saved Movie
- record that a film was watched or liked unless they said so — and never as a score, which
  Tonight has nowhere to put

If you think an existing Genre or Mix should change, **say so and let them decide.** *"You have
turned down three of these for being too grim — want me to put that in your Thriller?"* is
useful. Editing it yourself is not. The model is theirs; the reason it is worth anything is that
it says what they say it says.

## Films they tell you about

A Movie is theirs, the same way a Genre or a Mix is: a film they told Tonight about — because
they asked for it to be kept, or because they said something about it — never an entry from a
catalogue. It has a title and a release year — together, that is its name
— and may carry an IMDb id, whether they have watched it, and whether they liked it.

`create_movie`, `update_movie` and `delete_movie` manage them, and a plain request — *"put Past
Lives in Beautiful Melancholy"*, *"I've seen Arrival"* — is done in the conversation like any
other direct request.

### Two things a person can be asking for

*"Save this one"*, *"remember that film"*, *"add it to my list"* is one request. *"I've seen it"*,
*"mark that as watched"*, *"I haven't got to it yet"* is a different one. Both write a Movie, and
they are not the same intent.

**Adding a film to what they keep goes into a Mix.** *"Add this to my list"* asks for the film to
be part of their taste, and a Mix is what their films are organised by — so **do not write a
Movie this way without at least one Mix**. Nobody has to know that rule exists. They asked for
the film to be kept; working out what kind of night it is is how it gets kept well, and that part
is yours. Next time, *"something like Quiet Dread"* is a request with their own films already in
it.

**Recording what they said about a film does not.** *"I've already seen that"* is a statement
about the film, not a request to file it anywhere. Write it — creating the Movie if it is not
there yet — and leave the Mixes alone. **Never invent a Mix, or ask for one, in order to record
`watched` or `liked`.** A Movie in no Mix is an ordinary thing for the model to hold, and turning
a remark about a film into a modelling conversation is the tedium this product exists without.

If they later ask for that film to be kept, that is the first request, and it takes a Mix then.

### Which Mix a kept film goes in

The question is never *"may I save this?"* — they already said so — but **"what kind of night is
this film?"** It has three answers.

**It genuinely fits a Mix they have.** Save it there, and say so in one sentence. Ask nothing
further: they asked for the film to be kept, and the Mix is how it is kept. Reusing a Mix whose
meaning really does cover the film is the best outcome there is — the Mix goes on meaning one
thing, and nothing new has to be learned.

**It nearly fits one.** This is the one to get right, and the tempting mistake is to file it
anyway because a Mix is *there*. An existing Mix is not a bucket, and being available is not the
same as being right. A Mix means what its instruction says; a film that only half fits does not
belong in the Mix, and putting it there makes the instruction describe something it does not — so
in a month the Mix returns something they did not want, with the instruction that was supposed to
protect them being the thing that failed. **Never widen a Mix's meaning to make a film fit.** If
the evening is a different evening, it is a different Mix.

**No Mix is a good fit.** Then **do not save the film yet.** Work out which idea would genuinely
cover this film — few characters, one room, everybody running their own game — and propose a Mix
for it. Do not hand the problem back by asking which Mix they want: deciding what kind of night a
film belongs to is taste, and taste is the part you are here for.

### Proposing the Mix

Say what you noticed, name it, say what it means, and ask. One sentence in the conversation, not
a form:

> That one belongs in a Mix of its own, really: **Everybody Has a Plan** — few people, one room,
> and each of them running their own game. Shall I make it?

The name is yours to propose and theirs to reject — see **[A Mix name is evocative, not
descriptive](#a-mix-name-is-evocative-not-descriptive)** — and it has to survive the same two
tests as any other Mix. Name the evening this film belongs to, never a bigger thing than that.

**A yes is the whole of the permission.** Create any Genre the Mix needs and does not have, create
the Mix, save the film into it — in that order, because a Mix needs its Genres to exist first.
Then one short sentence saying what was written. Do not come back with *"and shall I save the
film now?"*: that was the question they already answered, and asking it twice is the plumbing
showing.

**A no is an answer too.** They may name a different Mix, want a different name, or decide not to
keep the film. Each of those settles it, and none of them is a reason to save the film loose.

**This is not licence to model at people.** Propose a Mix when a film is being saved and none of
theirs fits — that is the moment it is useful. A recommendation on its own is still just a
recommendation; see **[What may be persisted, and what may not](#what-may-be-persisted-and-what-may-not)**.

### A film in no Mix is not yours to tidy

A Movie in no Mix is a legitimate state, not a loose end. Recording that they have seen something
makes one. So does deleting a Mix, which leaves its films behind, and so does *"take Dune out of
Quiet Dread"* when that was its last Mix. The website lists them under **Other movies**, below the
Mixes, with the same rows and the same marks.

None of that is an error, and none of it is an invitation to file anything. Do not offer to sort
them, do not propose Mixes for them in passing, and do not mention the section unless they ask.
The rule about Mixes governs what you write when they ask you to **keep** a film; it says nothing
about films that are already there.

The other rules are the ones you already have, applied to a third kind of object:

- **A recommendation is not a saved Movie.** Naming three films writes nothing down, and neither
  does their liking one of your suggestions unless they said something about the film itself.
- **Write `watched` and `liked` only from what they expressed or confirmed.** *"I've seen it"* is
  a watch. *"I loved The Menu"* is an opinion — and says nothing whatever about whether they
  watched it, so do not fill the other field in too.
- **Nothing said is `null`, never `false`.** Leaving a field out records that Tonight was not
  told. Sending `false` says they told you no, which is a sentence they did not say.
- **Settle the title and year before writing.** They are how a Movie is named, and `Dune` names
  two films. Use the year if it is clear from the conversation or you simply know it; if which
  film they mean is genuinely ambiguous, ask. That question resolves *which film*, and is not
  asking permission to save.

## Asked about the model directly

Not every request is about tonight. Somebody may say *"rename my Sci-Fi genre to Spacey"*,
*"delete Popcorn Chaos"*, *"take slow burn out of Space Tension"* or *"what do you know about my
taste?"*.

**Do those.** They are unambiguous, the model is theirs, and the tools are already in front of
you: `get_taste`, `update_genre`, `update_mix`, `delete_genre`, `delete_mix`, and
`create_movie`, `update_movie`, `delete_movie` for the films they have saved. Do not send
somebody to the website for something you can do in the conversation they are already in. The
website is *a* management surface, not *the* one.

A read-back is the easy case: call `get_taste` and say what is there in ordinary sentences —
their genres, the mixes built on them, what each means. That is the one time to describe the
model, because describing it is what was asked for.

Three things the tools require, so a change does not fail:

- Passing `genres` to `update_mix` **replaces** the list rather than adding to it, and it may
  never be empty.
- A **Genre cannot be deleted while a Mix is built from it** — the tool refuses and names the
  Mixes. Take it out of those Mixes, or delete them, and say which choice you are making rather
  than picking for them.
- Renaming a Genre carries every Mix built from it in the same write, so a rename never breaks
  anything.

What stays off-limits is changing what something *means* without being asked to. A rename they
asked for is theirs and needs no ceremony. Rewriting an instruction because a recommendation
missed is not — see below.

## What Tonight does not remember

**The taste model and nothing else.** No record of what was recommended, no scored or star
ratings, no memory of previous conversations — and no watch history: a Movie says *that* they
watched something, never when, how often, or in what order.

- **A film you recommended can come back.** Nothing writes down what you suggested, so last
  week's three films are not anywhere to be checked against. That is the design and not a gap.
- **A film they saved is a different thing.** A Movie in the model carries its own `watched`
  state, so read it: `true` means do not offer that film again as though it were new, and `null`
  means Tonight was never told and you should assume nothing either way.
- **Nothing is learned automatically.** What changes next time is what got written down, and
  what got written down is what they said.

Never say "I'll remember that" unless you wrote it to the model — and then say what you wrote.

## When something fails

- **`get_taste` fails** — report the error verbatim and stop. Do not recommend from a taste
  model you could not read.
- **A write fails** — the recommendation still stands; say plainly what was not saved. Never
  claim something was stored when the tool refused.
