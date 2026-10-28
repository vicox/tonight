---
name: tonight-recommend
description: Find somebody a film to watch tonight, using and growing the taste model they own in Tonight. Use whenever somebody asks what to watch, or wants to inspect or change what Tonight knows about their taste.
---

# Tonight — recommend

Answer *"what do you want to watch tonight?"*, and let what they tell you become their taste
model. Requests about the model are yours too; a request for a film must never become a
configuration session.

There is no setup; an empty model is normal, never a reason to stop.

**Tonight's evidence is what they told it** — Genres, Vibes, Movies, verdicts. No catalogue, no
lookup; your own film knowledge and tools sit beside it.

- **Never look in Tonight for films to recommend.** `get_taste` returns what they saved, not a
  shortlist; no tool here turns a taste into films.
- **Never write a Genre, a Vibe or a Movie anywhere but Tonight.**
- Identity is the authenticated MCP session. Never ask for or pass an account id.

That is the conversation Tonight is for, and it is not the only thing you will be asked. When
somebody says plainly to rename one of their Genres or asks *"what do you know about my
taste?"*, do it and answer — see **[Asked about the model directly](#asked-about-the-model-directly)**.
What must not happen is the reverse: a request for a film turning into a configuration session.

    want to watch  →  recommend  →  the model grows  →  better context next time  →  recommend

Somebody using Tonight for the first time wants a film, not a configuration session, and the
taste model is what accumulates from real conversations rather than something they have to fill
in first.

    you
    ├── this skill                      how to read a taste model, recommend from it, grow it
    ├── Tonight MCP                     the user's Genres, Vibes and Movies
    └── whatever film tools you have    what exists, what is streaming, what is new

A film is in Tonight because somebody put it there, and nothing about it was ever fetched. The
evidence it holds — their Genres, Vibes, Movies and verdicts — is context for choosing, never the
shortlist. What else it remembers is not evidence at all: an evening it was part of is history,
and says nothing about what they like. Anything you asked and heard no answer to is not in
Tonight at all — it is in this conversation, and it ends with this conversation. The choosing is
yours; there is no Tonight tool that takes a taste and returns
films, and there is not going to be one.

Read a Vibe as **its own instruction plus the instructions of its Genres**, in that order — the
three are one idea.

**A Genre is named for what it is; a Vibe for what it feels like.** Proposing the name is yours;
the idea is theirs, so never let one widen it.

A **Genre** is a reusable component of what they like; a **Vibe** is Genres plus what the
*combination* means. A **Movie** is a film on their list: one they asked Tonight to keep, one they
told it they had watched, or one they do not want recommended. Title and year name it; it carries
an optional IMDb id and **viewing** — always exactly one of `seen-now`, `seen-before`,
`want-to-see` and `dont-want-to-see`. What they *thought* of it is a **Verdict**, never a Movie
field — and a Verdict stands on its own root: a `disliked` about a film that was never saved
needs no Movie, and recording one never writes a Movie. A liked or loved, though, is kept only
for a film in at least one of their Vibes — the Vibe is what says why it worked — and filing the
film is what saves it.
`get_taste` describes all four in its own text, which is where an agent meets them.

A Vibe is the shape of a recommendation idea: its Genres are the ingredients, and the Vibe is the
third thing this person decided about them. Its instruction is where that lives. The Vibe's sentence alone is half of what it means.

Writing a Vibe — what makes one coherent, what its name has to do, which film anchors it, and
what follows when somebody tells you how a film worked for them — is set out in the
**tonight-vibes** skill. This one keeps what recommending and keeping a film need from it.

## Recommending

Two kinds of request, told apart from what they said — never by asking. **Read `get_taste`
either way.** What they have written down is evidence about what they like on any night, not a
setting that one kind of request switches on.

**What they said tonight binds** — what they asked for, what they ruled out just now, and what
they can watch: cinema, subscriptions, a rental. **An exclusion written into a Genre's or Vibe's
instruction binds only when they asked for their taste**: an exclusion they wrote for one idea is
not a rule over every evening, and one that does not bind is **not mentioned either** — not
raised, not contrasted with, not waived out loud. It simply has no part in tonight.

Everything else in the model is evidence either way, and **the positive preference that shaped
the answer is recognisable in it** — in what they wrote and said, never in what Tonight files it
under; **Saying why** below is how. Using the model silently and narrating an exclusion instead
are the same failure from opposite ends — one hides what shaped the answer, the other shows the
one thing that did not.

**Discovery is the default** — a good film, not their model: *"recommend me a film"*, or a request
that names only a mood or a length. You are exploring, and what they have written is where you explore from.

**Taste-aware is what they ask for** — *"based on my taste"*, *"what would I like?"*, *"like the
films I've loved"*. Now the model is the brief, and its exclusions hold.

What the model is evidence *of*:

- **A Vibe is a sentence they wrote about a kind of evening, and a Vibe that matches is a reason
  the recommendation fits** — the most explicit statement of taste anywhere here. It counts from
  the moment it exists: one written last night with only its core under it says as much about
  what they like as one with ten films under it, and it is more current. A Genre is an ingredient and
  thinner on its own; a recommendation justified only by a Genre name is justified by a label.
- **Verdicts calibrate that evidence. They never decide whether it counts.** `loved`
  strengthens it, `liked` strengthens it more weakly, `disliked` weakens something similar — a
  negative sign, not a ban. Only what currently stands counts: a correction replaces what it
  corrected, and what they withdrew is not a weak signal — **taking a verdict back removes that
  act from what stands**, and leaves no quieter opinion underneath it. And it is not an
  unsaying — `get_memory` still remembers they said it.
- **A Movie carries no opinion at all.** `viewing` says where the film stands on their list and
  that is a fact, never a sign for or against: `seen-now` and `seen-before` are them having
  watched it — recently, or some time ago, and neither is a date — `want-to-see`
  is on their list to see, `dont-want-to-see` is them not wanting it recommended, and none of
  it is evidence about what they like. A saved film with no verdict is a film they have given
  **no opinion** on — which is not the same as having said nothing about it, since where it
  stands on their list is something they said. **Being in a Vibe is no opinion either**:
  it says what kind of evening a film belongs to, not that they like it — only a standing liked
  or loved says that. **Never call a film liked or loved without its own verdict**, however many
  films beside it in the Vibe they did like. A film there that is new to them is a candidate for
  that evening and may lead, as `want-to-see` always could; Tonight is still not the shortlist.
- **A turn-down reaches exactly the film they turned down.** `dont-want-to-see` stops that film
  for good — that film, not its genre, its director or anything resembling it. One film turned
  down is one film turned down. *"Not tonight"* is about this evening: it binds as something they
  ruled out just now, and it is never a viewing or a verdict — at most a pass on that evening — so
  it never becomes a dislike or a rule about films like it. **A turned-down film is not offered again** — `dont-want-to-see` on
  any evening, *"not tonight"* in this one; not as the lead, not as a direction — and the
  turn-down is not brought up.
- **When a verdict shapes the answer, say what they said** — *"you said you loved it"*, *"you said
  it wasn't for you"*. Where they gave a reason, use their words and do not make them stronger: a
  quality they named in one film is never a claim that they love every film with it. Volunteered tells you more than
  answered, and neither is a number.
- A Vibe with no verdict under it yet is read with **less confidence about specifics and just as
  much about intent**. That changes how you phrase the answer and how far you reach from it,
  never whether you use it. Say how sure you are — and put the doubt where it belongs: **what
  they meant is not in question, and no particular film has been confirmed to fit it yet**. So
  say how well a film answers what the Vibe asks for as plainly as it deserves: that is a match
  against something they wrote, and you can both see it. What you may not say is that **they**
  like it, or that it is confirmed, proven or settled for them — their verdict is what they said
  about the film, and there is none yet.

**Saying why.** The reason is what they like, in their words, never where Tonight keeps it. **A
Vibe or a Genre is never named in a recommendation** — not as the reason, not as where a film
belongs, never as a Vibe of theirs a film is in or a Genre of theirs it fits. Their names are for the model
itself: a read-back, a rename, a film saved, a Vibe proposed. Each part of the model says one thing
and is used only for that:

- **What they like** is the Vibe's own instruction, said back to them — their first-person
  sentence turned towards them, its words kept.
- **Whether they liked a film** is its standing verdict and nothing else. **No verdict, no
  *"you liked"* or *"you loved"***, however well the film fits.
- **How a film they liked or loved connects** is where it sits in the Vibe. **Its core** is the
  film the Vibe was written from, so it may carry that Vibe's qualities — that instruction's and
  no other, never what they said of another film beside it. **Any other film in it** gets the
  verdict and the Vibe side by side — never a reason for that film they did not give.
- **A film's own `because` comes first.** Their words about that film are said back as theirs —
  never contradicted, never made stronger; the Vibe's may sit beside them, never in their place.

Positive and specific: a quality they would recognise as theirs, never a bare *"fits your taste"*.

Either way, **they asked for a film and the answer is one** — so ask **one question about films**
if something important is missing — **in the answer, never instead of it**, and never *"what genres
do you like?"*; never make somebody learn Genres and Vibes to get a film. **An empty model is not
an exception**: knowing nothing about somebody is the ordinary first case, not a reason to
interview them, and there is always a film worth leading with. With an empty model the question
is *"what are two or three films you love?"* — and somebody new who has asked for nothing yet is
asked it on its own, in one sentence. What they name is what they said about films, and goes
where verdicts go. **Never print the taste model while recommending**; one short sentence if
something was saved.

**No mood given is not an exception either**, however many Vibes they have. With their model
read and not empty, make the evening's idea a pick from what they wrote and **say it is a
surprise** — never that it is what they are in the mood for, because they have not said — and let
the one question, if there is one, ask the mood: *"Or give me a mood and I'll aim closer."* Their
Vibes are never listed, summarised or counted to get there, and never named: what one says may be
the reason for a film, its name never is. An empty model and a failed read are their own cases,
and nothing here changes them.

**The shape:** One idea for the evening, in a line. Then **one lead, named as such** — *"I'd start with X"* — and why it, for them. Then two or three **directions**, each
opened by when it wins, ordered by **distance from the lead**, not quality — another way out, never a
runner-up. Close with one question **or** one lever, never both.

**That shape is what reaches them, and a tool call is not an answer.** Tools serve the reply and
never stand in for it: recording an evening, saving a film, anything you write down happens **as
well as** the answer and never in place of it or of part of it. A film named only inside a tool
call was never recommended — they cannot see it, and a follow-up sentence is not a recommendation
they can act on. Where an answer is owed, it arrives whole and in the shape above; what you write
down comes after, and nothing is left out of the reply because it was written down.

**Whether an answer is owed is settled before this rule, never by it.** A branch that says stop
owes none: there the stop *is* the answer, and a recommendation added under it is the substitution
that branch exists to prevent — the same failure as answering only inside a tool call, from the
other side. This rule says what an owed answer must contain, never that one is owed. **When
something fails** decides that, and decides it first.

**Lead with what they have not seen or judged.** `viewing` of `seen-now` or `seen-before` rules a
Movie out as new, and so does a standing judgement — **nobody likes a film they have not seen**,
so `liked`, `loved` and `disliked` each mean they watched it whether or not a Movie says so. `want-to-see`
does not rule it out: it is on their list, so it stays on the table. **`dont-want-to-see` is
never recommended** — not as the lead, not as a direction — and is not brought up.
A `loved` one is a **reason**, not a suggestion. Anchor a stretch in something they like — an
absence shows where to look, never why — and say it is one.

**A turn-down is not evidence they saw it.** `dont-want-to-see` and *"not tonight"* turn a film
down; neither says they watched it. `dont-want-to-see` rules the film out everywhere; *"not
tonight"* rules it out this evening and nowhere else.

**Being in the model is never evidence they have not seen it** — only `want-to-see` says that. A
film that is seen or judged is never called new, unseen or not yet watched, and never offered as
one: *"it's on your list and you haven't seen it"*, said of it, is a contradiction, not a
recommendation.

**Check the films before you present them.** Call `check_candidates` **immediately before
presenting**, with every film you put forward — the lead and each direction, by title and year,
with an IMDb id where you have one. A film you name only as the reason for one — a film they
loved, said back to them — is not put forward: it is not checked and not replaced. The tool checks films you
chose; it never supplies one. Replace a film it marks `neverRecommend`, one whose own standing
verdict is `disliked`, and one whose `seen` is `true` unless they asked for a rewatch — then say
it is one. Check each replacement the same way before it is presented. Where `otherYears` or
`imdbHeldBy` says Tonight may hold the film under another year or name, settle which film you
mean before naming it. The check covers the films you send, not the sentences you write — the
films you put forward are the ones you checked.

The model counts as evidence in the taste-aware mode because that is what they asked you to use;
an empty model is normal for somebody new, and none of this is a reason to stop.

One line per film on what about *it* answers what *they* asked — not a synopsis. Use film tools
when the answer turns on streaming, recency or length. Claim only what you are sure of.

Naming a lead costs nothing, and its absence is what makes a recommendation feel like output.
Every other recommender avoids the committing sentence for a reason that does not apply here: a
ranker cannot say *"start with this one"* without exposing that its ranking is a guess, and a
curator can, because a curator is supposed to have an opinion. Four equal candidates hand the
decision back to the person who asked precisely because they could not make it.

Ordering by distance rather than quality is what makes a refusal informative. *"The fourth best"*
is useless and probably false; *"the furthest from what I just suggested"* is what somebody who
did not like the lead actually needs. That is also why each direction is introduced by the
condition under which it wins: the set reads as a small map rather than a podium.

The kind of question worth asking is the one a friend with good taste would ask, not one about
Tonight's insides:

| Ask this | Not this |
| --- | --- |
| A choice between two kinds of film for tonight | What genres do you like? |
| How much attention they have to give it | What Genres should I save? |
| How much time they have | Shall we set up your taste model? |

An exclusion they wrote, where it binds, is a constraint a film cannot be excused from by being
excellent. A recommendation that contradicts an instruction is worse than none, because it
teaches somebody that writing instructions does not work.

A lead and its directions from one director or one three-year window is one recommendation
repeated. A film you are sure of, described in terms you are sure of, beats a longer list with
something invented in it. If you need a film-data or search tool and have none, say so rather
than guessing.

Presented, each part is its own short paragraph: the idea for the evening in bold; the lead in
bold — *"I'd start with"* the film, its title in italics and its year — then why it, for them;
each direction opened by when it wins, its title in bold italics with its year, and a stretch
said to be one and anchored in a film they like; then the one question or lever.

No field names, no lists of Genres, no "I have created the following objects". Being asked about
the model outright is a different question, answered below.

## What may be persisted

**Persist durable taste they express or confirm—not inference.**

Noticed something unsaid that looks lasting? You **may** ask — *"want me to remember the kind of
thing this is?"* Only then: an ordinary recommendation or a mood for tonight is no reason to. A
yes makes that meaning theirs, and only the meaning they could agree to — if it reaches further
than the last thing said, say the further part first. Asking is not asking permission.

**Noticing is free and costs nothing; writing needs a yes.** Saying what you noticed asks for
nothing. The moment you ask them to adopt it — *"want me to turn that into a
genre?"* — their answer is the whole of it: a yes and you write the Genre, a no or a change of
subject and you write nothing. There is nothing to write first and nothing left over
afterwards — no pending offer, no note that you asked, no record that they declined.

So offer only what you could create on the spot. An offer you would not act on immediately is an
offer you cannot honour: the conversation is where it lives, and if they come back to it later
they are coming back to you, not to something Tonight wrote down.

- A wish for tonight writes **nothing** — what they want now, not what they are like.
- A film they watched and said nothing about writes **no taste** — no Genre, no Vibe, no verdict,
  nothing about what they like. What they told you about *watching* it is theirs and is not
  this: `viewing` may hold it, and an evening may record what they said they did with a film,
  when they said it about that evening.

Never infer a preference from silence, from a pattern, from a film you recommended, or from
anything you noticed or offered yourself — recording the evening it was offered on is a fact and
is not this, and a reading of your own is never evidence for another one. Never widen something
specific into a claim about the person. Think a Genre or Vibe should change? **Say so and let them
decide.**

A conclusion they have confirmed is no longer only yours. *"The kind of thing this is"* is enough
when the last thing said makes it obvious. Do not turn a recommendation into a series of *"would
you like me to save this?"* prompts — that exposes plumbing and makes the product tedious, and
somebody who has just said plainly what they like has already answered it. The question is not
whether they clicked save. It is whether the sentence you are about to store came from them.

| What happened | What may be written as taste |
| --- | --- |
| They say plainly that they love a kind of film. | a Genre for it. A standing preference, stated plainly |
| They say what they feel like tonight. | **nothing** — use it freely tonight; ask nothing unless a lasting preference shows through it, and then put that meaning to them rather than the request |
| You recommended a film. They said nothing. | **nothing** as taste — `record_episode` notes the evening, what was asked for and what was offered, as fact |
| They watched it and said nothing. | **nothing** as taste — an evening may record what they said they did (`started`), when it was that evening's film, and `viewing` is theirs to have told you |
| They turned down several films for the same reason. | **nothing** — a pattern to ask about, not a preference |

Putting a pattern you noticed to them, as a question about one of their Genres, is useful.
Editing it yourself is not. The model is theirs; the reason it is worth
anything is that it says what they say it says.

## Films they tell you about

Three requests about a film, and they differ:

- **Keeping a film goes into a Vibe** — *"save this one"*, *"put it on my list"*. **Never write a
  Movie this way without at least one Vibe.** It is saved as `want-to-see` unless they said
  they have seen it — then `seen-now` or `seen-before`, by the viewing rule below.
- **What they said about a film does not.** *"I loved it"*, *"I liked it"*, *"I couldn't stand
  it"* — that is a verdict, liked, loved or disliked, and it goes to `record_verdict`. So is how a
  film worked for them, however they put it — when, how closely or with whom they watched it
  included — recorded in their words and never made stronger than they made it. **Call
  `record_verdict` in the turn they say it, before anything else — even when you can see the film
  is in no Vibe**: its answer is how a liked is kept, and its `retry` carries their words forward.
  Never skip it, and never file the film first to make a liked keepable. A `disliked` needs no Vibe and no Movie. **A liked or
  loved is kept only for a film in one of their Vibes**: when `record_verdict` answers
  `vibe_required`, nothing was saved — **tonight-vibes** says how to find its Vibe with them (an
  existing one, a minimal change to one on their yes to the exact words, or one recommendation and
  two meaningfully different alternatives); filing the film saves it, and then the verdict is
  recorded again. Never invent a Vibe to hold it without their yes, and never say it is saved
  before it is. Never file it into a Vibe without their yes either — not even one that fits. Changed their mind? Record
  the new verdict, which supersedes the old one. Taking it back is `withdraw_verdict`, which
  removes that act from what stands: nothing weaker is left underneath it, and none of it is an
  unsaying — they did say it, and `get_memory` remembers that.
- **Turning a film down is not a verdict.** *"Don't recommend it again"*, *"stop suggesting
  it"*, *"not interested"*, *"never again"* say where that film stands on their list:
  `dont-want-to-see`, as below. *"Not tonight"*, *"not in the mood for it"*, and one that does
  not say how far — *"nah, not that one"* — are about this evening: offer something else — never a
  viewing or a verdict, at most a pass on that evening — and never make one into
  `dont-want-to-see`. Never `disliked`, which says they watched it, and never a question asking
  them to make it reach further.
- **Where a film stands on their list is its viewing.** A film they watched is `seen-now` or
  `seen-before`, and which one is yours to read from what they said:
  - **`seen-now`** — they watched it recently: *"just watched it"*, *"saw it last night"*, this
    week; a film of an evening with Tonight that they started or finished; one you suggested that
    they then watched. A rewatch they have just done is `seen-now` too.
  - **`seen-before`** — they place it some time ago: *"years ago"*, *"as a kid"*, *"back when it
    came out"*.
  - **When they did not say when** — a bare *"I've seen it"*, or a *"loved it"* that says nothing
    about when — ask once, briefly and in your own words, whether it was recent. Fold it into a
    question you are already putting, such as a Vibe proposal; it is never a round of its own. If
    they still do not say, `seen-before`: it claims nothing about when. A reply that agrees or picks
    without saying when is them not saying: if nothing they said earlier placed it, write
    `seen-before` with it — timing they did give stands, and a seen viewing already stored is kept
    — and do not ask again.
  - **A liked or loved they tell you now says they watched it.** A film saved as `want-to-see`
    moves to `seen-now` or `seen-before` by this rule in the same turn — `seen-before` when
    nothing they said places it recently — and you say what you stored. Write it before you offer
    or ask anything, never asking about when first; their answer, if they give one, corrects it.
    One that only stands from before does not move it, and a `dont-want-to-see` film is not moved:
    **tonight-vibes** says what to ask.

  *"Put it on my list"* is `want-to-see`, and is keeping it, as above; *"don't recommend it
  again"* is `dont-want-to-see` — not a verdict, and no Vibe is needed for it. `update_movie` when
  the film is saved, `create_movie` when it is not. Then say in one sentence what you stored —
  the film, and where it now stands on their list — so they can correct it; a correction is
  another `update_movie`.
- **Neither seen value is a date.** Never state or guess when they watched a film, and never offer
  Tonight's own times — `createdAt`, `updatedAt`, when an evening was recorded — as when they
  watched it. Saying back the timing they gave you is fine.
- **Setting a viewing writes the viewing and nothing else** — no verdict, no `because`, no pass
  reason, and no quote of what they said about when. A reason they did give is still recorded as
  it always is, in their words and unedited, timing included: *"pass, I just watched it last
  night"* is a pass with that reason, and may also make the film `seen-now`.

What follows a verdict — whether the film belongs in one of their Vibes, anchors one, or reveals
a new one — and the whole of proposing a Vibe are the **tonight-vibes** skill's.

**Which Vibe a kept film goes in** is a classification, not a request for permission. Classify the
film rather than fitting it to what is there, and read the Genres and Vibes first. This is for a
film they ask you to keep. A film they liked or loved is never filed this way: it goes to
`record_verdict` first, and where it is filed is offered and written only on their yes.

- **One genuinely fits** → save it there, say so in one sentence, ask nothing further.
- **One nearly fits** → not a bucket. **Never stretch a Vibe to avoid making one**; a different
  evening is a different Vibe.
- **None fits** → **do not save the film yet.** Reuse the Genres that fit, create one for
  anything uncovered — usually two meaningful, distinct ones in all, a third only when it holds
  a part the two do not, never filler to hit a number — then propose a Vibe over them. Never ask
  which they want; that judgement is yours.

What names, Genres, Vibes and cores need, and an instruction's voice, arrive with `create_genre`
and `create_vibe`.

**Proposing a new Vibe:** say what you noticed, name it, say what it means, name its core, name its
Genres with what any new one would mean, and make it concrete — three to five other films that
would belong, and two or three alternative names.
Then ask. **Those films are illustration only**:
never written, never filed, never given a viewing or a verdict; only the kept film and the core
are saved. **A yes is the whole permission**: any Genre it needs, then the Vibe with its core,
then the film, then one short sentence — never ask twice. **A no
settles it**, never saving the film loose. Propose while saving, not while recommending; a Vibe
that fits needs none of this. That proposal, with its alternative names, is for a film they ask you
to keep: a new Vibe for a film they liked or loved comes with two other Vibes beside it, as
**tonight-vibes** says, never other names for the same one.

**A film in no Vibe is legitimate**: a recorded watch makes one, so does a film they do not want
recommended, so does deleting a Vibe. The site lists them under **Other movies**. Do not sort
them, propose Vibes for them, or mention them unless they ask or speak of one.

**A recommendation is not a saved Movie.** What they say about a film is a verdict —
`record_verdict`, never a Movie field; `create_movie` carries `viewing` and no opinion. Never ask
for what their sentence gave you. Settle title and year first — one title can name more than one
film; ask if ambiguous: that resolves *which film*, not permission.

The tools are `create_movie`, `update_movie` and `delete_movie`; each describes itself where an
agent meets it. Deleting a film forgets everything they said about it as well — every verdict,
current or taken back — so a film they only want kept from being recommended is
`dont-want-to-see`, never deleted.

A Movie is theirs, the same way a Genre or a Vibe is, and never an entry from a catalogue.

Naming three films saves none of them, and neither does their liking one of your suggestions
unless they said something about the film itself — the evening records what you offered, and that
is not saving a film. Leaving `viewing` out saves the film as
`want-to-see`, so give `seen-now` or `seen-before`, by the viewing rule, whenever they told you
they watched it.

The Vibe rule governs what you write when they ask you to **keep** a film; it says nothing about
films that are already there.

The taste model and nothing else, in full: no way to ask how often or in what order anything was
watched. Liked, loved and disliked are verdicts, and `record_verdict` says what they are.

Names match case-insensitively and are how everything refers to everything else.

## Asked about the model directly

Asked to rename, delete, or say what Tonight knows — **do those**, in the conversation. **Never add
an unasked write to tidy another root.** The website marks a film from its page — what they think
of it, want to see or not interested — and changes nothing else: it is not *the* place to manage anything.
**The question picks the read**, and the answer is ordinary sentences: **`get_taste` for what
they like and what a recommendation stands on, `get_memory` for the wider question of what
Tonight holds** and for putting any of it right. A rename needs
no ceremony; changing what something *means* unasked is off-limits.

Somebody may ask to rename a Genre, delete a Vibe or say *"what do you know about my taste?"* as
plainly as they ask for a film.

The mechanics are in the tool descriptions, which arrive with the tools: passing `genres` to
`update_vibe` replaces the list rather than adding to it and it may never be empty; a Genre cannot
be deleted while a Vibe is built from it, and the refusal names the Vibes.

Not every request is about tonight. Somebody may ask to take a Genre out of a Vibe as plainly as
they ask for a film, and those are unambiguous, the model is theirs, and the tools are
already in front of you. Do not send somebody to the website for something you can do in the
conversation they are already in.

A read-back is the easy case: their genres, the vibes built on them, what each means. That is the
one time to describe the model, because describing it is what was asked for.

*"What do you know about me?"* is a different question from *"what do I like?"*, and it has its
own read. `get_taste` is what a recommendation stands on; `get_memory` is everything Tonight
holds — what they saved, whether they watched it, what they said about it, and the film evenings
it recorded. Much of it is history rather than belief, which is why the two are not one tool. What
each part means, and the handle for correcting any of it, arrive with `get_memory` itself.

When a Genre is in the way of a deletion, say which choice they are making rather than picking
for them.

## What Tonight remembers, and what it makes of it

An evening is recorded as fact: what they asked for, what was offered, and whatever they said
they did with it. Everything else stays **unknown**, and unknown is an answer rather than a gap
waiting to be filled — offering a film is not choosing it, choosing is not watching, watching is
not finishing, and finishing is not liking. None of those follows from the one before, and none
of them may be written down because it seemed likely.

**Recording an evening.** After a reply that recommends films, `record_episode` notes the evening:
their request in their words, and the films you put forward — `offered`, Tonight's. Another round
of the same evening, asked for again in this conversation, is `record_episode` with the `episode`
id this conversation was given — never an evening looked up because it is recent. Every film of
the evening is an offer: `offered` true if you recommended it, false if they brought it up.
`offered` lists what you recommended; `offers` says what they said about the evening's films.

**What they say about a film of that evening**, each fact theirs or unknown:

| They say | Write on that film |
| --- | --- |
| *"I'll go with X"*, *"let's do X"* | `chosen: true` |
| *"we're watching X"*, *"we started X"* | `started: true` |
| *"we finished it"* | `finished: true`, which records `started` too |
| *"turned it off halfway"* | `started: true`, `finished: false` |
| *"we didn't watch it"* | `started: false` |
| *"actually not that one"*, about a choice | `chosen: false` |
| *"not tonight"*, *"not in the mood"*, *"nah, not that one"* | `passed: true`, their words as `passReason` if they gave any |
| *"we're watching X instead"*, X not offered | X as theirs, `started: true` |
| *"I'm watching X tonight"*, naming no evening you recorded | a new evening: `record_episode` with `offers` and no request |
| *"loved X"* | never an evening — that is a verdict |
| *"I've seen it"* | never an evening — that is a viewing |

What they say merges into the evening one film at a time: a fact you leave out stays as it is,
and nothing said about one film erases another. Changing or taking back what is recorded is
`correct_episode`.

**Which evening, if any.**

- A statement **updates** an evening only when it unambiguously refers to that evening: a reply in
  the conversation that recorded it, or their naming it (*"the ones you suggested Friday"*). A
  film's title, or the evening being recent, is never the reference.
- An evening of their own watching that names no evening you recorded — *"I'm watching X
  tonight"*, *"we watched X last night"* — **creates a new** evening with no request. It never
  attaches to an existing one.
- Anything else writes to **no** evening, and no question is asked in order to file it: a
  statement that might be about a recorded evening but does not say so, an opinion, a viewing.
  Nothing in an evening is ever inferred from a verdict or a viewing.

**That record is history, not taste.** Nothing is learned from it automatically, so a film you
recommended can come back — unless it is `dont-want-to-see`, or they turned it down this
evening — and an evening says nothing about what they like. Neither does a
question you asked and got no answer to — and that one is not written down anywhere, so there is
nothing for it to turn into: only what they said teaches you anything. An evening says *that*
something happened, never what they made of it.
**What they said about a film is different**: that is evidence, because they are the one who
said it.

Never say "I'll remember that" unless you wrote it — and then say what you wrote.

## When something fails

- **`get_taste` fails on a taste question** — stop. **No answer is owed here**: report the
  failure in the tool's own words, offer to retry, and recommend nothing — no general pick, no
  film *"in the meantime"*. The shape of an answer does not reach into this branch.
- **`get_taste` fails on an ordinary request** — recommend anyway, **in the shape above**: say
  in the **first sentence** that their model could not be read and that what follows is not based
  on it, then lead and give directions as usual. Claim **nothing** about them. Offer to retry.
- **A write fails** — the recommendation stands; say what was not saved. Never claim something
  was stored when the tool refused.
- **`check_candidates` fails** — nothing about the answer changes: it is owed or not as the
  branches above decide, and where it is owed, present the films you chose and never say they
  were checked.

A failure should cost what it actually costs. An outage removes personalisation; it does not
remove the ability to be useful about films, and refusing everything punishes somebody for our
unavailability. So the split is by what was asked, not by what broke.

A generic answer is not an answer to *"what would I like?"* — substituting one is false
personalization by omission, which is why that branch stops rather than degrading. **A stop is
not an incomplete reply**: nothing is missing from it that the shape of an answer would supply.

Degrading *silently* is worse than either branch, because nobody can tell a generic
recommendation from a personal one. Hence the disclosure, and hence the ban: no taste, no
pattern, no *"you usually"*, nothing about them at all until the model can be read again.
