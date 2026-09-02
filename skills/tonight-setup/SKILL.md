---
name: tonight-setup
description: Set up an empty Tonight by turning what the user says about the films they like into their first Genres, using the Tonight MCP server. Use for a first-time setup, not for later changes.
---

# Tonight — setup

One job: turn an empty Tonight into a working one by asking what kind of films the user likes
and creating their first **Genres** from the answer. Nothing else.

Use this for a first-time request — "set up Tonight", "get me started with Tonight", "I just
connected Tonight". Do **not** use it for an ordinary later change: one new genre, a rename, a
reworded instruction, a deletion, or anything to do with Mixes. Those belong to
`tonight-manage`, and so does every question about *which* genres a user who already has some
should have next.

The three skills divide the work like this, and the boundaries are strict:

| Skill | Its job |
| --- | --- |
| **setup** *(this one)* | turn a first description of someone's taste into their first Genres |
| `tonight-manage` | Genres and Mixes afterwards — model, create, update, rename, delete |
| `tonight-recommend` | choose films for a Genre, a Mix, or a mood |

**This never recommends a film** and never creates a Mix. It writes Genres to Tonight's MCP
server and stops.

Tonight's MCP server holds the taste model and nothing else — it has no film catalogue and no
lookup. Nothing in this skill needs one: setting up is entirely about what the user says they
like.

Identity is the authenticated MCP session — never ask the user for an account id and never pass
one to any tool.

## What a Genre is

A Genre is one reusable component of what this person likes. It carries the fields
`create_genre` takes:

| Field | Meaning |
| --- | --- |
| `name` | the genre's name — its identity and its display text, e.g. `Sci-Fi` |
| `instruction` | what that genre means **to this user**, in natural language |

**A Genre is not a movie-database tag.** `Action` here is whatever this user says Action is, and
two users with a Genre of that name may mean opposite things by it — one wants stunts and set
pieces, the other wants a lone figure and a long silence. The name is a label; the instruction
is the genre.

Write the instruction in the first person, as the user's own preference: *"I like ..."*. It is
read later, by you, when choosing films — so write it precisely enough to choose on.

## Step zero: look before you write

**Call `get_taste` first.** Never assume Tonight is empty.

1. **It returns genres or mixes.** **Stop, and create nothing.** Say plainly that Tonight is
   already set up, name what is there, and point at `tonight-manage` for any change to it. Do
   not overwrite, reset, delete or quietly merge a second set in beside it.
2. **It returns two empty lists.** That is the normal starting state, not an error. Continue.
3. **The call fails** — the MCP server is unreachable, the session is not authenticated, or the
   call errors. **Report the error verbatim and stop.** Do not fall back to an empty model, do
   not create part of a set, and do not invent local state.

`get_taste` is the only source of truth for this decision.

## Ask one question

> What kind of movies do you like?

One question, in the user's language, and then listen. Do not follow it with a questionnaire,
do not offer a checklist of genres to tick, and do not ask about mood, decade, language,
streaming services or how much time they have. This is the moment where the product is supposed
to feel like one sentence and a result.

A typical answer:

> Action, sci-fi and comedy. I like thrillers too, but not really brutal ones.

## Read the answer

Two things are in an answer like that, and they are handled differently.

**A bare name** — `Action`, `sci-fi`, `comedy` — is a genre the user has said nothing more
about. Tonight has its own wording for the common ones and that wording is what the genre will
get; you do not write it.

**A name with nuance** — "thrillers, but not really brutal ones", "fun action rather than grim
military stuff", "sci-fi that actually has an idea in it" — is a genre whose instruction is
*theirs*. Write it from what they said, in the first person, and **carry the exclusion into the
instruction of the genre it belongs to**. "Nothing too brutal" is part of what Thriller means to
this person; it is not a separate genre and not a note on the side.

Some other rules for reading an answer:

- **Propose only what the description supports.** Do not round a taste up into every adjacent
  genre, and never add a preference the user did not express.
- **Vocabulary that is not a standard genre is still a Genre.** "Slow burn", "single location",
  "practical effects", "nothing after 1980" are all reusable components of a taste, and they
  are exactly the kind of thing that makes a Mix worth having later. The starter list below
  does not cover them, and it does not have to — write the instruction yourself.
- **A named film is not a Genre.** "I loved Arrival" describes what they like, not a component;
  read the taste out of it and say which genre you took from it.
- **Three to six genres is a good first model.** Fewer than two and there is nothing to combine;
  more than about six from one sentence means you are inventing.
- **Never create a Mix here.** Mixes come next, and they belong to `tonight-manage`.

## Starter definitions for bare Genre names

These are Tonight's starting wording for the genre names people most often give bare. When
somebody says only "Action", propose the Action definition below as its meaning — quote it to
them so they are agreeing to a meaning rather than to a word.

**They are starting points, not a list to choose from.** The user is not restricted to these
names, a Genre is not required to be on here, and nothing about a Genre has to resemble one of
them. Custom Genres are entirely ordinary — `Slow burn`, `Practical effects`, `Films my dad
would like` are all fine, and you write those instructions yourself.

**User nuance overrides the starter definition, always.** The moment somebody says anything more
specific than the name, the instruction is theirs and you write it from what they said. Do not
paste a starter definition over a stated preference, and do not append their nuance to it as an
afterthought — read the two together and write one instruction that says what they mean.

> *"I like Action."* → propose the starter Action definition.
>
> *"I like Action, but more stylish and fun — not superhero films."* → do **not** use the
> starter text. Write something like: "I like action films with style and momentum — inventive
> stunts and a sense of fun. Not superhero franchises."

| Genre | Starting definition |
| --- | --- |
| `Action` | Movies driven by physical stakes and momentum — chases, fights, set pieces, things going wrong at speed. I want to feel the scale of it. |
| `Adventure` | Journeys into somewhere unfamiliar, with a sense of discovery and a bit of danger. The place matters as much as the plot. |
| `Animation` | Animated films of any style, where the craft of the animation is part of why the film is worth watching rather than just how it was made. |
| `Comedy` | Films made to be funny, and that actually are. Wit and timing over shock; I would rather laugh with the film than at it. |
| `Crime` | Heists, hustles, investigations and the people who live in that world. I like the mechanics of it — the planning, the double-cross, the unravelling. |
| `Documentary` | Non-fiction films about something real, told well. A strong point of view is welcome; a lecture is not. |
| `Drama` | Character-led films about people under pressure, where the interest is in what they do about it rather than in what happens to them. |
| `Fantasy` | Invented worlds with rules of their own — magic, myth, other realms — where the world is imagined carefully enough to believe in. |
| `Horror` | Films built to unsettle. I want dread and atmosphere; gore is fine when it means something and tiresome when it is the whole idea. |
| `Musical` | Films where the songs carry the story rather than interrupting it, and the numbers are worth rewinding. |
| `Mystery` | A question worth answering, revealed at a pace that lets me try to get there first. I want the solution to be fair. |
| `Romance` | Films about two people and whether they end up together, where the answer actually seems in doubt and the pair are worth rooting for. |
| `Sci-Fi` | Science fiction that takes one idea seriously and follows it — futures, technology, first contact. The idea should matter to the story, not decorate it. |
| `Thriller` | Tension held for the length of a film. Suspense, pressure and a plot that keeps tightening; I do not need it to be violent to be tense. |
| `War` | Films set in or around a war, about what it does to the people in it rather than about the hardware. |
| `Western` | Frontier stories — landscape, lawlessness, and someone deciding what kind of person they are going to be. |

Common alternative spellings map onto these: `Science fiction`, `sci fi` and `scifi` are all
`Sci-Fi`; a plural like `Thrillers` or `Comedies` is the singular. `Rom-Com` is not on this list
because it is two genres combined, which is a Mix — see `tonight-manage`.

They are written in the first person because a Genre is the user's own preference, and that is
also what makes them easy to edit. Say so when you propose one: this is a starting point, and
they can reword it now or at any time.

## Review, then create

**Show the whole proposed set before creating any of it.** Name each genre and the instruction
it will have, and say which instructions are the starter definitions and which you wrote from
what they said. Then ask whether to create them, and let them change anything first.

> From that I would set up four genres:
>
> - **Action** — the starter definition: "Movies driven by physical stakes and momentum ..."
> - **Sci-Fi** — the starter definition: "Science fiction that takes one idea seriously ..."
> - **Comedy** — the starter definition: "Films made to be funny, and that actually are ..."
> - **Thriller** — from what you said: "I like tension and suspense, but not brutality — I want
>   pressure and dread rather than violence."
>
> Shall I create these?

**The taste model is the user's.** Nothing is written until they say yes. If they change a
name, reword an instruction or drop a genre, do that and show the set again rather than
arguing for your version.

**Every genre is created with an instruction — there is no shorter form.** `create_genre`
requires one and Tonight fills in nothing on your behalf, which is exactly why the starter
definition has to be something the user has seen and agreed to.

```text
# a bare name they said nothing more about — send the starter definition, verbatim
create_genre   name:        "Action"
               instruction: "Movies driven by physical stakes and momentum — chases, fights,
                             set pieces, things going wrong at speed. I want to feel the scale
                             of it."

# a genre they said something specific about — write the instruction from what they said
create_genre   name:        "Thriller"
               instruction: "I like tension and suspense, but not brutality — I want pressure
                             and dread rather than violence."
```

Create them one at a time, in the order you showed them. Each call answers with the resulting
genre; read it back so you are reporting what was stored rather than what you asked for.

## When something fails

Report what actually happened.

- **Never claim setup succeeded unless every agreed genre was created.** Say how many were
  created and name the one that failed, with the error.
- **A partial set is a partial set.** Do not pretend it completed, and do not delete the genres
  that did succeed to simulate a transaction — Tonight offers no rollback, and inventing one
  would throw away work the user can keep.
- Fixing the cause and creating the rest is ordinary `tonight-manage` work.
- Do not invent local fallback state, and do not continue into recommending.

## After setup

Report the genres that were created, with what each one means. Then say what the two next steps
are, and let the user pick:

- **Mixes** — combining these genres into personal ones of their own, like `[Sci-Fi] +
  [Thriller] → Space Tension`. That is `tonight-manage`.
- **A film for tonight** — choosing something from a genre they now have. That is
  `tonight-recommend`.

Stop there. Creating genres does not mean recommending from them.
