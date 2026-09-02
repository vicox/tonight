---
name: tonight-manage
description: Create, inspect, model, update, rename and delete Tonight Genres and Mixes using the Tonight MCP server. Use when the user wants to change what their movie taste model says, or to combine their genres into personal Mixes.
---

# Tonight — manage the taste model

One job: the taste model itself — inspecting it, modelling it, and creating, updating, renaming
and deleting the **Genres** and **Mixes** in it. A first-time setup from scratch belongs to
`tonight-setup`.

**This does not own "what should I watch?"** That request is `tonight-recommend`'s, and it should
go there. Naming a few films to *show what a Genre or Mix would mean* is a different thing and is
part of this job — an example makes a proposal judgeable in a second where a sentence does not.
The distinction is what the films are for: illustrating a definition here, answering "what should
I watch tonight" there.

| Skill | Its job |
| --- | --- |
| `tonight-setup` | turn a first description of someone's taste into their first Genres |
| **manage** *(this one)* | Genres and Mixes afterwards — model, create, update, rename, delete |
| `tonight-recommend` | choose films for a Genre, a Mix, or a mood |

**Two kinds of connection do different things.** Tonight's MCP server holds the taste model and
nothing else — it has no catalogue, no lookup and no knowledge of films. Any film-data or search
tool in your environment is separate from it and belongs to you. `get_taste`, `create_genre`,
`update_genre`, `delete_genre`, `create_mix`, `update_mix` and `delete_mix` are Tonight's;
anything that knows what a film is, is not. Never look for films
in Tonight, and never write a Genre or a Mix anywhere but Tonight.

Identity is the authenticated MCP session — never ask the user for an account id and never pass
one to any tool.

## The two objects

| Object | What it is |
| --- | --- |
| **Genre** | one reusable component of what this person likes |
| **Mix** | one or more of their Genres, plus what the *combination* means to them |

| Field | Meaning |
| --- | --- |
| `name` | the object's name — its identity and its display text |
| `instruction` | what it means **to this user**, in natural language |
| `genres` | *Mix only* — the exact names of the Genres it is built from, at least one |

**A Genre is not a movie-database tag.** `Action` here is whatever this user says Action is.
Two users with a Genre of that name may mean opposite things by it, and the instruction is where
the difference lives. Write instructions in the first person, as the user's own preference.

**A Mix is not an intersection.** `Sci-Fi` and `Thriller` are its ingredients; `Space Tension`
is a third thing the user decided about them, and that decision is the Mix's own instruction.
Nothing computes a Mix's meaning from its Genres, and a Mix whose instruction only restates
"films that are both" has not said anything.

**Mixes reference Genres only.** There is no chaining: a Mix cannot be built from another Mix,
and Tonight cannot store one that is. A Mix must name at least one Genre.

Genres and Mixes have **separate namespaces**. A Genre called `Noir` and a Mix called `Noir` are
different objects and both may exist; the tools take them by separate parameters, so nothing is
ambiguous. It is still usually a bad idea, and worth saying so if a user asks for it.

## Names are the identity

An object's name is **the only identifier**. There is no separate id: what the user reads is
what Mixes reference and what the update and delete tools address.

- **Write names as ordinary phrases.** They may contain spaces and should read naturally:
  `Slow burn`, not `SlowBurn`. Capitalise the first word and leave the rest lowercase unless the
  words are proper nouns or an acronym — `Sci-Fi`, `A24 mood`, `WWII` keep their capitals.
- **Names are unique per kind, ignoring case.** `Sci-Fi` and `sci-fi` are the same Genre, so a
  create that collides is rejected. The spelling you give is the spelling that is stored, and
  lookups match either way — asking for `"space tension"` finds `Space Tension`.
- **Leading and trailing spaces are trimmed and inner runs collapse** to single spaces, so
  `"  Slow   burn "` is stored as `Slow burn`.
- **A Mix's `genres` are exact Genre names**: `genres: ["Sci-Fi", "Thriller"]`. A name that is
  not one of this user's Genres is rejected, and the refusal lists the Genres they have.
- **Renaming is `update_genre` / `update_mix` with `new_name`.** Renaming a Genre rewrites every
  Mix built from it **in the same write**, so a rename can never leave a broken reference.
  Renaming onto a name that already exists is rejected.
- **Names are short.** At most 60 characters, because a name is read as a chip — `[SCI-FI] +
  [THRILLER]`. Detail belongs in the instruction.

## Reading before writing

**Call `get_taste` first, always.** It returns the whole model — genres and mixes — and it is
your vocabulary. Reuse what is there rather than creating a near-duplicate: if `Slow burn`
exists, do not add `Slow-paced`.

There is no tool that fetches one Genre. `get_taste` returns them all and you pick. If the
user's wording does not match a stored name, match it yourself; if several plausibly fit, ask
rather than guessing.

Every Genre and Mix carries an instruction, and Tonight supplies none of them: a Genre created
without one is refused. `tonight-setup` carries starting definitions for the common genre names,
for the first-run case where somebody says only "Action"; here, where the user is asking for a
change, write the instruction from what they said.

## Modelling what the user asked for

The user describes something they want. Working out *how* to model it is your job. Never make
them choose between "genre" and "mix" — that follows from what they described.

Start from meaning: **is this a component, or a combination?**

- Something they like that stands on its own, and could turn up inside several different moods —
  **a Genre**. `Sci-Fi`, `Slow burn`, `Practical effects`, `Heist`.
- Something that only means anything as a combination of components they already have — **a
  Mix**. `Space Tension`, `Popcorn Chaos`, `My Sunday afternoon`.

Then ask **how many concepts the request contains.** One request does not imply one object.
"Tense sci-fi in one location", "funny action films", "slow, atmospheric horror" each name more
than one thing. Put every concept through the reuse question:

> Would this be worth having on its own, for films that have nothing to do with the rest of this
> request?

- **Yes, for more than one of them** — model each as its own Genre, and add a Mix on top when
  the combination carries meaning the parts do not.
- **No** — it is one component described in several words. Model it as a single Genre and let
  the instruction carry the detail.

**Several concepts mentioned is not a reason to split — several concepts reusable apart is.**
Prefer the simplest model that preserves reuse: as few objects as express the idea, and no
fewer.

### A Mix should be able to say something its Genres do not

Put every Mix through the meaning question:

> If I only knew this Mix's Genres and not its instruction, what would I get wrong?

A Mix whose answer is "nothing" is not a Mix; it is a search over two Genres, and it will
produce the same films they would. Either write the instruction that makes it specific — the
setting, the pace, the feeling, what it rules out — or say plainly that the combination does not
seem to need a name yet.

### Example: a component and a combination

> *I want something for tense sci-fi — contained, mysterious, not superhero stuff.*

`Sci-Fi` probably exists. `Thriller` may. The interesting part — contained, mysterious, not
superhero — is not a third Genre, because it is not something they would want on its own; it is
what this combination means to them:

```text
Sci-Fi          genre  (exists)
Thriller        genre  (exists)
Space Tension   mix    (genres: Sci-Fi, Thriller)
                       "Tense science fiction where suspense is the point. I prefer contained
                        settings, mystery and psychological pressure over superhero action."
```

### Example: several words, still one Genre

> *Add something for practical effects, real sets, no green screen.*

Three phrases, one component. Nobody wants those detected apart:

```text
Practical effects   genre  ("I like films made with real sets, models and stunts rather than
                            digital environments.")
```

## Suggesting Mixes

Once somebody has a few Genres, suggesting combinations is one of the most useful things you can
do — and it is **your** judgement, not a tool call. Read the Genres with `get_taste` and look
for pairs and triples that would mean something specific together.

**Names should be personal and memorable, not taxonomy.**

```text
[Action] + [Comedy]              → Popcorn Chaos
[Sci-Fi] + [Thriller]            → Space Tension
[Sci-Fi] + [Comedy]              → Weird Future Fun
[Sci-Fi] + [Slow burn]           → My Sci-Fi
```

Do not simply join the Genre names: `Sci-Fi Thriller` tells the user nothing they did not
already know, and a Mix is supposed to feel like theirs. Two or three words is right.

**Demonstrate a suggested Mix with films.** Name three films that make the Mix obvious at a
glance. A Mix described only in words is a taxonomy exercise; three films make it something a
person can say yes or no to in a second.

The films come from you, not from Tonight — Tonight holds no catalogue and no titles. Use your
own knowledge, and reach for a film-data or search tool if you have one and it would help.
Prefer a well-known film that lands to an obscure one that proves a point, and if you are unsure
of a detail, give the title and leave the detail out rather than filling it in.

A suggestion should carry: the proposed name, the Genres it combines, the proposed instruction,
one line on why it is worth having, and the films.

**Suggest a few, not a catalogue.** Three or four good ones beat every pairing that is
arithmetically possible. And never create one until the user agrees.

## Managing the model

```text
# read everything
get_taste

# create a genre — the instruction is required
create_genre   name:        "Slow burn"
               instruction: "I like films that take their time and let tension build."

# reword a genre
update_genre   name:        "Horror"
               instruction: "I want dread and atmosphere. Gore is fine when it means something."

# rename a genre — every mix built from it is rewritten in the same write
update_genre   name:     "Sci-Fi"
               new_name: "Science fiction"

# delete a genre — refused while a mix is built from it
delete_genre   name: "Slow burn"

# create a mix
create_mix     name:        "Space Tension"
               genres:      ["Sci-Fi", "Thriller"]
               instruction: "Tense science fiction where suspense is the point. Contained
                             settings and mystery over superhero action."

# change which genres a mix is built from — this REPLACES the list
update_mix     name:   "Space Tension"
               genres: ["Sci-Fi", "Thriller", "Slow burn"]

# rename or delete a mix
update_mix     name: "Space Tension"  new_name: "Cold Vacuum"
delete_mix     name: "Cold Vacuum"
```

Every tool answers with the resulting object, or with the reason it refused. After a successful
change, report what was actually stored rather than what you asked for.

## Creating, updating, deleting

**Create.** A Genre needs a name and an instruction. A Mix needs a name, an instruction and at
least one existing Genre — create any missing
Genre first, because a Mix naming a Genre that does not exist is rejected.

**Update.** Pass only the fields that change. For a Mix, `genres` **replaces** the stored list
rather than adding to it, and it may never be empty. Leaving a field out changes nothing about
it, so rewording an instruction never quietly restructures a Mix.

**Rename** with `new_name`. Renaming a Genre rewrites every Mix built from it in the same write
— there is no window in which a Mix points at a name that is gone, and no cleanup step. Renaming
onto an existing name is rejected; offer a different wording, or ask whether the existing object
should be updated instead.

**Delete.** A **Genre cannot be deleted while a Mix is built from it**: `delete_genre` refuses
and names the Mixes involved. Nothing is cleaned up automatically — either update those Mixes to
drop the Genre, or delete them first. **Tell the user which choice they are making rather than
picking for them.** A Mix can always be deleted, and deleting one leaves its Genres alone.

## The user owns the model

This is the rule the whole product rests on, and it applies to every tool here.

**Propose, then write.** Say what you would create or change and what it would mean, and call
the tool once the user has agreed. For a single obvious change they asked for in so many words —
"rename Sci-Fi to Science fiction", "drop the Western genre" — just do it and report the result.
For anything you inferred, anything you are adding, and anything that rewords what they wrote,
ask first.

**Never edit an instruction because of how somebody reacted to a film.** If they loved or hated
something, that is evidence, and evidence is a reason to *suggest* a change — "you have turned
down three of these for being too grim; shall I add that to your Thriller instruction?" — never
a reason to make one. Tonight has no hidden profile, and the reason it does not is that the
visible model would stop being the truth about them if it did.

**Tonight stores nothing but the model.** No watch history, no record of what was recommended,
no film data, and no memory of previous conversations. A change you make here is the only thing
that persists, which is exactly why it has to be agreed.

## What a change reaches

Changes take effect the next time something reads the model — the next recommendation, the next
page load. Nothing is recomputed and nothing is backfilled, because there is nothing stored to
recompute: Tonight keeps the Genres and Mixes, and nothing else at all.

So a reworded Genre changes what you will choose from it next time, and does not revisit
anything. Say so plainly if a user expects otherwise.

## How much to say

When one obvious change is all it takes, make it and report the result: no explanation, no
options. When the model needs more than one object, describe it in two or three lines and then
propose it:

> I would add `Slow burn` as a genre and build a mix called `Quiet Dread` on it and `Horror` —
> that keeps the pacing preference reusable on its own.

Ask only for information genuinely missing. Never make the user choose between a Genre and a
Mix, and never ask them to approve a rename they just requested.
