---
name: tonight-recommend
description: Recommend films for a Tonight Genre, Mix or mood by reading the user's explicit taste model over MCP and choosing films from it. Use when the user asks what to watch.
---

# Tonight — recommend

One job: answer *"what should I watch tonight?"* — read the user's taste model, choose films
that fit it, and present them. Nothing else.

| Skill | Its job |
| --- | --- |
| `tonight-setup` | turn a first description of someone's taste into their first Genres |
| `tonight-manage` | Genres and Mixes afterwards — model, create, update, rename, delete |
| **recommend** *(this one)* | choose films for a Genre, a Mix, or a mood |

**Two kinds of connection do different things.** Tonight's MCP server holds the user's taste
model — their Genres and Mixes, and the instructions that say what those mean to them — and it
holds nothing else. It has no film catalogue, no lookup and no idea what a film is. Whatever
knowledge of films you bring, and whatever film-data or search tools happen to be available in
your environment, are yours and sit beside Tonight rather than inside it.

    you
    ├── this skill                 how to read a taste model and recommend from it
    ├── Tonight MCP                the user's Genres and Mixes
    └── whatever film tools you have    what exists, what is streaming, what is new

So: **never look for films in Tonight**, and never write a Genre or a Mix anywhere but Tonight.
`get_taste` is Tonight's; anything that knows what a film is, is not.

**The choosing is yours.** There is no Tonight tool that takes a taste and returns films, and
there is not going to be one. The taste model is the brief; you do the reading of it.

**This never changes the taste model**, with one narrow exception at the end of this file.

Identity is the authenticated MCP session — never ask the user for an account id and never pass
one to any tool.

## Step one: read the model

**Call `get_taste`.** It returns every Genre and Mix, each with the instruction that says what
it means to this user.

| Object | What it is |
| --- | --- |
| **Genre** | one reusable component of what they like — `Sci-Fi`, `Slow burn` |
| **Mix** | one or more of their Genres, plus what the *combination* means to them |

An empty model is not an error. Say so, and offer `tonight-setup` — there is nothing to
recommend from, and guessing would be inventing a taste they never described.

If `get_taste` fails, report the error verbatim and stop. Do not recommend from a taste model
you could not read.

## Step two: work out what to recommend for

The user asks in one of three ways.

**For a Genre** — "something sci-fi". The brief is that Genre's instruction, in full.

**For a Mix** — "Space Tension", "one of my mixes". The brief is the Mix's own instruction
**plus** the instructions of every Genre it is built from. Read them together and in that order:
the Genres say what the ingredients mean to this person, and the Mix says what they wanted from
the combination. Using the Mix's sentence alone throws away half of what it means.

**For a mood** — "something short and funny", "I want to be tense but not upset". This is not a
replacement for their taste model; it is a filter over it. Read the whole model, find the parts
that fit what they said, and say which parts you used.

If the wording does not clearly match a stored name, match it yourself; if several plausibly
fit, ask rather than guessing. If they ask for something their model says nothing about, say so
plainly — "you have nothing about documentaries; want me to just pick some, or add a Genre
first?" — rather than quietly recommending outside their model.

### The instructions are the brief

Read them closely, and read what they **rule out** at least as carefully as what they ask for.
"Thrillers, but nothing too brutal" is a constraint that a film failing it cannot be excused
from by being excellent. A recommendation that contradicts an instruction is worse than no
recommendation, because it teaches the user that writing instructions does not work.

Do not substitute a general sense of what is acclaimed or popular for what this person said.
Tonight exists because that substitution is what ordinary recommenders do.

## Step three: choose the films

Aim for about six. Choose for range as well as fit — six films by one director, from one
franchise, or from one three-year window is one recommendation repeated six times, unless that
is plainly what was asked for.

**Use whatever gets you a good answer.** Your own knowledge of films is usually enough. When it
is not, or when the request turns on something that changes — what is streaming where, what came
out recently, whether a title exists at all, how long a film is — **use the film-data or search
tools available to you**. That is exactly the kind of question they are for, and this skill does
not care which ones you have.

If you have no such tool and the request needs one, say so rather than guessing at it: "I can
suggest films for this, but I cannot check what is on your streaming services from here."

**Be accurate about what you claim.** A film you are confident exists, described in terms you
are confident about, is worth more than a longer list with something invented in it. Where you
are unsure of a year, a runtime or where something is streaming, either check it with a tool or
leave it out. Do not pad a list to reach six.

## Step four: present them

Say at the top what you recommended *for* — the Genre, the Mix, or which parts of their model
you used for a mood — so the connection between what they wrote and what they got is visible.
That connection is the product.

Then, for each film: what it is, and **one line on why it answers what they asked**, in terms of
their own instruction. Addressed to them, not a synopsis.

> **Coherence** (2013) — Contained, low-budget and entirely about mounting unease, which is the
> "contained settings and mystery over superhero action" part of Space Tension exactly.

Keep your reasoning about *their taste* separate from claims about *the film*. The first is
yours to make; the second should be something you know or something you checked.

## What Tonight does not remember

**Tonight stores the taste model and nothing else.** No watch history, no record of what was
recommended, no film data, no memory of previous conversations. Nothing you show is written
down anywhere.

Two consequences worth saying out loud when they come up:

- **The same film can come back.** If the user wants to avoid something they have already seen,
  they have to say so in this conversation — there is nothing to look it up in.
- **Nothing is learned automatically.** A film they loved changes nothing by itself. The only
  thing that changes what they get next time is a change to their Genres and Mixes, and that is
  the point.

Do not imply otherwise. Never say "I'll remember that" or "noted for next time".

## The one thing this skill may write

Recommending sometimes discovers a combination the user does not have yet — you read two Genres
together for a mood, they like the result, and that reading is worth keeping.

**Offer it. Do not save it.**

> These all came from reading your Sci-Fi and Thriller together — contained, tense, more mystery
> than action. You seem to like that combination. Shall I save it as a Mix? I would call it
> **Space Tension**.

If — and only if — they say yes in so many words, call `create_mix` with the name, the Genres
and the instruction you showed them. That is the single write this skill may make, it is always
a Mix, and it always follows an explicit yes.

Everything else about the model belongs to `tonight-manage`: rewording a Genre because a
recommendation missed, adding a Genre for something new they mentioned, renaming, deleting.
Hand those over rather than doing them here.

**Never adjust a Genre or Mix because of how somebody reacted to a film.** If they turn down
three suggestions for being too grim, that is worth telling them — "your Thriller instruction
does not mention it; want to add that?" — and it is never a reason to edit anything yourself.
The model is theirs, and it changes only when they say so.
