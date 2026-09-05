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
Genres and Mixes, and the instructions that say what those mean to this person — and holds
nothing else. It has no film catalogue, no lookup and no idea what a film is. Whatever knowledge
of films you bring, and whatever film-data or search tools happen to be available to you, are
yours and sit beside Tonight rather than inside it.

    you
    ├── this skill                      how to read a taste model, recommend from it, grow it
    ├── Tonight MCP                     the user's Genres and Mixes
    └── whatever film tools you have    what exists, what is streaming, what is new

So: **never look for films in Tonight**, and never write a Genre or a Mix anywhere but Tonight.
The choosing is yours; there is no Tonight tool that takes a taste and returns films, and there
is not going to be one.

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

Read what an instruction **rules out** at least as carefully as what it asks for. "Thrillers,
but nothing too brutal" is a constraint a film cannot be excused from by being excellent. A
recommendation that contradicts an instruction is worse than none, because it teaches somebody
that writing instructions does not work.

If a request matches an existing Mix, use it and say so. If it does not, the request itself is
the idea for tonight — see **Letting the model grow** below.

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

Lead with the idea, then the films. The idea is the Mix — give it a name a person would enjoy
having, not a taxonomy label:

> **Smart, tense, but still fun**
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

The idea you just used **is** a Mix, and the pieces it is made of **are** Genres. When they came
from something the person actually told you, write them down — that is how Tonight gets better
at this without anybody configuring it.

- **Reuse before you create.** `get_taste` is your vocabulary. If `Slow burn` is there, do not
  add `Slow-paced`. A near-duplicate is worse than nothing: it splits one taste across two
  objects that will drift apart.
- **Create a Genre for a component they expressed** that no existing Genre covers — something
  reusable, that could turn up in a different mood on a different night. `Clever thriller`,
  `Light suspense`, `Practical effects`.
- **Create the Mix** over those Genres, with an instruction saying what the combination means
  tonight. Put every Mix through one question: *if I knew only its Genres and not its
  instruction, what would I get wrong?* If the answer is "nothing", it is not a Mix — it is a
  pair of Genres, and they are enough on their own.
- **Keep it small.** As few objects as express the idea, and no fewer. One conversation should
  not produce eight Genres.

What the tools require, so a write does not fail:

- a Genre needs a name and an instruction; Tonight invents neither
- a Mix needs a name, an instruction, and **at least one Genre that already exists** — create
  the Genres first
- **a Mix is built from Genres only.** There is no chaining, and Tonight cannot store one
- names identify case-insensitively and are how everything refers to everything else; write them
  as ordinary phrases — `Slow burn`, not `SlowBurn`
- instructions are written in the first person, as the user's own preference

## What may be persisted, and what may not

**Persist what they said. Never persist what you concluded.**

That is the whole rule, and it is not the same as asking permission. Do not turn a
recommendation into a series of *"would you like me to save this?"* prompts — that exposes
plumbing and makes the product tedious. The question is not whether they clicked save. It is
whether the sentence you are about to store came from them.

| What happened | What may be written |
| --- | --- |
| *"I love slow science fiction."* | a Genre for it. A standing preference, stated plainly |
| *"Tonight I feel like slow science fiction."* | the Genre and the Mix that serve tonight's idea — but nothing claiming this is how they always are |
| You recommended a film. They said nothing. | **nothing** |
| They watched it and said nothing. | **nothing** |
| They turned down three films for being grim. | **nothing** — but say so, and ask whether to add it |

And never:

- infer a preference from silence, from a film you recommended, or from a pattern you noticed
- reword an instruction they wrote because a recommendation missed
- widen something specific into a claim about the person — *"prefers slow films"* is not what
  *"tonight I want something slow"* said
- keep a note of what was recommended, watched or rated anywhere in the model

If you think an existing Genre or Mix should change, **say so and let them decide.** *"You have
turned down three of these for being too grim — want me to put that in your Thriller?"* is
useful. Editing it yourself is not. The model is theirs; the reason it is worth anything is that
it says what they say it says.

## Asked about the model directly

Not every request is about tonight. Somebody may say *"rename my Sci-Fi genre to Spacey"*,
*"delete Popcorn Chaos"*, *"take slow burn out of Space Tension"* or *"what do you know about my
taste?"*.

**Do those.** They are unambiguous, the model is theirs, and the tools are already in front of
you: `get_taste`, `update_genre`, `update_mix`, `delete_genre`, `delete_mix`. Do not send
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

**The taste model and nothing else.** No watch history, no record of what was recommended, no
ratings, no film data, no memory of previous conversations.

- **The same film can come back.** If they want to avoid what they have already seen, they have
  to say so in this conversation — there is nothing to look it up in.
- **Nothing is learned automatically.** What changes next time is what got written down, and
  what got written down is what they said.

Never say "I'll remember that" unless you wrote it to the model — and then say what you wrote.

## When something fails

- **`get_taste` fails** — report the error verbatim and stop. Do not recommend from a taste
  model you could not read.
- **A write fails** — the recommendation still stands; say plainly what was not saved. Never
  claim something was stored when the tool refused.
