# The recommendation strategy

**Status:** philosophy settled and approved. **Phase 1 is in progress**; Step 1 of the
implementation plan is complete. No skill text, tool descriptions, or application code have been
changed. This document supersedes the recommending sections of
`skills/tonight-recommend/SKILL.md` where the two disagree — §12 lists every contradiction
deliberately — and is written to be handed to an implementation session unchanged.

**Revision 2.** The first draft was reviewed and contradicted itself in six places; §13 records
what changed and why, including the two points where the review was adopted with a qualification.
A future contributor reading only this revision loses nothing.

Written in English to match the rest of the repository.

---

## 1. Executive summary

Tonight's recommender is almost entirely a set of instructions given to somebody else's model.
That is the architecture and it is the right one. What the instructions currently say is that on
an ordinary request — *"what should I watch tonight?"* — the taste model the user spent months
building **binds nothing**, the answer is *"three to six films"* with no film leading, and the
word *tonight* is not answered at all. Everything below follows from changing those three things.

The opinionated core, in nine statements:

1. **The recommendation is for tonight, not forever.** A reason that expires is worth more than
   one that does not — but only when it is real. An evergreen answer is a good answer.
2. **The unit is an evening, not a list.** One idea, one leading film, two or three directions
   away from it.
3. **One film leads, and the system says so out loud.** *"I'd start with this one"* is the
   highest-value sentence in the product and the one every other recommender avoids.
4. **Taste informs every recommendation; only tonight binds.** Evidence always applies;
   exclusions written into an instruction apply when the model was asked for.
5. **A Mix counts from the moment it exists.** It is the most explicit thing a user ever says
   about their taste. Movie states **calibrate confidence** in it; they do not decide whether it
   counts at all. See P5.
6. **Unseen is the default target**, and a `loved` film is a reason rather than a suggestion.
7. **Reinforcement is the entry fee, not the offering.** One reinforcing pick proves the model
   was read; more than one is the system doing the easy thing.
8. **Every expansion has a positive anchor.** A gap in somebody's taste is never by itself a
   reason to recommend something. The reason is always something they positively like.
9. **Nothing is claimed that cannot be supported** — about the world, about availability, or
   about the person. Inventing a taste is as damaging as inventing a release date.

None of this requires Tonight to hold a catalogue, run a model, store new metadata, or record
what it recommended. The work is prompts, one deterministic data-shape change, and evaluation.

---

## 2. Why recommendations exist

### 2.1 The problem

Not *"what should I watch"* — that question is solved, several times over, by search. Tonight
exists for three failures that survive a solved search problem.

**The retrieval failure.** People have taste and cannot produce it on demand. At nine o'clock on
a Tuesday, tired, the thing somebody knows perfectly well about themselves — that they want the
kind of film where a small town knows something — is unavailable to them. They end up scrolling.
The taste model is external memory for a faculty that goes offline exactly when it is needed.

**The custody failure.** Every system that does remember taste keeps it. It never shows you what
it concluded, you cannot correct it, and it does not leave with you. Tonight's answer is the
whole product: you write it, you can read it, you can delete it, and it is addressed by names you
chose.

**The stasis failure.** A recommender that maximises similarity keeps you where you are, because
a satisfied user is its objective. Nobody's recommender has an interest in your taste growing;
growth looks like risk in every metric they hold. This is the failure Tonight is uniquely placed
to attack, precisely because it has no catalogue to sell and no watch time to defend.

### 2.2 What Tonight is not

| | Asks | Optimises | Fails when |
| --- | --- | --- | --- |
| **Search** | what matches these words | recall and precision | you do not have the words |
| **Ranking engine** | what maximises engagement | probability you press play | its interest and yours diverge |
| **Similarity recommender** | what resembles what you liked | proximity in some space | **it succeeds** — you never move |
| **Tonight** | what should *you* watch *tonight* | this evening, and the next five years | it is generic |

The third row is the one worth sitting with. A similarity recommender that works perfectly
produces a person whose taste narrows for as long as they use it. There is no setting to turn
that off, because it is not a bug in the objective — it *is* the objective.

### 2.3 Why a curator

A curator is not a better ranker. It is a different job, and five properties separate them.

- **A curator decides.** A ranked list hands the decision back. The decision is the work.
- **A curator risks something.** It will say *"I think you're ready for this"*, which is a claim
  about a person, not about a film, and it can be wrong.
- **A curator explains from you.** Not *"critically acclaimed neo-noir"* but *"you loved the one
  where nobody tells the truth; this one is that, with the truth arriving too early."*
- **A curator knows what is in the room this week** — when there is something in the room.
- **A curator remembers you and says so.** Out loud, checkably, in a way you can correct.

Tonight can do all five. Four of them cost nothing but instructions.

---

## 3. Core philosophy

Numbered so that later documents and the skill can cite them.

**P1 — The recommendation is for tonight, not forever.** *Tonight* is the operative word in the
product's central question. Where a real reason for this week exists, it should be used and said.
Where none exists, the answer is evergreen and says nothing about now. See §6.

**P2 — The unit is an evening, not an endless list.** Three to four films with one idea over
them, not six films ranked. Six is a menu; a curator does not hand you a menu. See §4.

**P3 — Taste informs every recommendation; only tonight binds.** This reverses the current
default. Evidence — what they love, what a Mix means — applies always. Exclusions written into a
Genre or Mix instruction bind only when the model was asked for, because an exclusion written for
one idea is not a rule over every evening. What they say tonight binds absolutely, in both cases.

**P4 — Unseen is the default target.** Prefer films they have told Tonight nothing about. A film
carrying `seen`, `liked`, `loved` or `disliked` is never presented as new. A `loved` film is a
**reason**, never a suggestion — which is the more valuable use of it anyway.

**P5 — Two kinds of evidence, and they are not interchangeable.** This is the most important
distinction in the document and the one the first draft got wrong.

- **Declarative evidence — what they said.** A Genre's instruction, a Mix's instruction, and the
  fact that they wrote or confirmed it. This is the most explicit statement of taste anywhere in
  the system: a whole sentence, in their own words, about a kind of evening. **It applies from
  the moment it exists.** A Mix created last night, with nothing under it yet, is exactly as much
  a statement about what they like as one with ten films in it — and it is *more* current.
- **Confirmatory evidence — how it played out.** Movie states. These do not decide whether a
  declaration counts. They **calibrate confidence** in it and sharpen aim inside it: which parts
  of the declaration are borne out, where the films under it agree with its sentence, and where
  a `loved` film quietly disagrees with it.

A Mix with no states is read with **less confidence about specifics and no less weight about
intent**. The practical difference is how the recommendation is phrased and how far it reaches,
never whether the Mix is consulted. Anything that classifies a Mix as not counting — including
any deterministic "trustworthy versus aspirational" label — is rejected: it would make the
product's own loop false, since the Mix written in last night's conversation is precisely the one
tonight's recommendation should be using.

**P6 — Genres support Mixes.** A Genre is an ingredient. On its own it is thinner declarative
evidence than a Mix, because a Mix says what the combination means and a Genre only names a part.
A recommendation justified only by a Genre name is justified by a label.

**P7 — States are confirmatory, and silence is not evidence.** `loved` is strong, `liked` is
positive, `disliked` is a negative sign and not a ban — a `disliked` film inside an otherwise
loved Mix is one of the most informative objects in the model. `seen`, `not_seen` and `null` say
nothing about preference and must never be read as if they did.

**P8 — Reinforcement is the entry fee, not the offering.** See §7.1.

**P9 — Every set contains one thing they are ready for.** The test is not *"this is unlike their
list"* — that produces noise. The test is *"I can say in one sentence why they are ready for
it, and the sentence names something they like."* If that sentence will not come, it is not an
expansion and a second reinforcing pick is the honest answer.

**P10 — Every expansion has a positive taste anchor.** An absence — no pre-1970 films, no
subtitled films — is never on its own a reason to recommend something. It may suggest *where* to
look; the *reason* must always be something they positively like. "You have never watched a
subtitled film" is an observation about a list. "You loved *Under the Skin* for what it does with
silence, and the film it is descended from happens to be Polish" is a recommendation.

**P11 — Recommendations explain themselves, and the explanation is about the person.** See §5.

**P12 — Nothing unsupported is claimed**, in either direction. Not about the world (§6.3) and not
about the person (§5.2). Inventing a preference is the same class of failure as inventing a
release date, and is harder for the user to catch.

**P13 — The model is theirs, and it grows by consent.** Nothing about recommending changes the
existing write rule: durable taste they stated, or a meaning they confirmed. A rejection tonight
is strong evidence tonight and is never written down.

---

## 4. The experience — *"What should I watch tonight?"*

### 4.1 The shape of an answer

```
   One idea, in a line                      the thesis: what kind of evening this is

   ▸ THE LEAD            one line           why this, for them — and why tonight, if there is a reason
     A direction         one line           "if that is too heavy —"
     A direction         one line           "if you want to laugh instead —"
     A direction         one line           (optional third)

   One question, or one lever               never both
```

Three to four films. The lead is named as the lead.

### 4.2 Why one film leads

Because deciding is the work. A list of four equal candidates is the decision handed back to the
person who asked precisely because they could not make it. Every other recommender avoids the
committing sentence, for a reason that does not apply here: a ranker cannot say *"start with this
one"* without exposing that its ranking is a guess. A curator can, because a curator is supposed
to have an opinion.

The sentence to say is *"I'd start with X."* It costs nothing, it is the product's most
distinctive moment, and its absence is what makes a recommendation feel like output.

### 4.3 Why the rest are directions, not runners-up

A second-place film is a worse version of the lead. A **direction** is a different way to leave
it: shorter, lighter, stranger, older, quieter. That changes what a refusal means. *"No"* to a
runner-up says nothing; *"no, the second one"* says which axis was wrong, without anybody having
to name an axis.

Each direction is introduced by the condition under which it wins — *"if you have ninety
minutes"*, *"if you want to laugh instead"* — so the set reads as a small map rather than a
podium.

### 4.4 Why the order is what it is

The lead is first because it is the recommendation. The rest are ordered **by distance from the
lead**, not by quality. A quality order says *"this is the fourth best"*, which is both useless
and probably false. A distance order says *"this is the furthest from what I just suggested"*,
which is exactly what somebody who did not like the lead needs to know.

### 4.5 How many

**One lead plus two, at most three, directions.** Fewer than the current *"three to six"*, and
deliberately. Six films is a menu, and a menu is the failure mode this whole document exists to
avoid.

### 4.6 A worked answer

Chosen to exercise P5. The user has a `Quiet Dread` Mix (*"dread that arrives on foot, in
daylight, without music"*) with five films under it, two `loved`. Last week they created
`Reading Room` — *"films that are patient with me, where nothing is chasing anyone"* — and
nothing is under it yet. They ask the plain question, on a Thursday in October, and say they are
tired.

> **Three films that are patient with you, and one of them is frightening about it.**
>
> **I'd start with *Museum Hours* (2012).** You wrote *Reading Room* for films where nothing is
> chasing anyone, and this is the purest one I know — two people, a gallery, a city in winter.
> It is also ninety minutes, which is the version of *Reading Room* that survives a Thursday.
>
> If that is too still: **Columbus (2017)** — the same patience, with two people who have
> somewhere they are avoiding going.
>
> If you want the dread instead: **Lake Mungo (2008)**. This one is the stretch. You loved
> *Under the Skin* for what silence does; this does it with home video footage, and it is the one
> genuinely frightening film I can offer in October that never raises its voice. I am guessing at
> the overlap between your two shelves here — tell me if it is the wrong half.
>
> More of the first kind, or shall I keep going towards the third?

What is doing the work: `Reading Room` **leads the answer on the day after it was written**, with
no states under it, because it is the most explicit and most current thing the user has said
about their taste (P5). The confidence language is where its untested status shows — *"the
purest one I know"* about the film, *"I am guessing at the overlap"* about the person. *"You are
tired"* is used because they said it, not because it is Thursday (§6.1). October is a seasonal
observation, not an availability claim. The stretch is marked as a stretch and anchored in a
`loved` film (P10).

---

## 5. *"Why this?"*

### 5.1 The evidence ladder

Strongest first. A recommendation should reach for the highest rung it can honestly stand on, and
the two kinds of evidence in P5 sit on it together: a declaration says *what*, a state says *how
sure*.

1. **A film they loved, named, tied to a declaration.** *"You wrote Quiet Dread for dread that
   arrives in daylight, and Stalker is the one you loved under it."* Both kinds at once, and the
   strongest thing the system can say.
2. **A Mix's own sentence, quoted back.** Their words, whether or not anything under it has a
   state. This is what makes a week-old Mix usable tonight.
3. **A film they loved, named, on its own.** Specific and checkable, but it does not say what
   about the film landed — so the reason drawn from it must be modest.
4. **A pattern across several states.** Something they never said out loud. Say it as an
   observation, with the films named, and leave them room to reject it.
5. **A Genre instruction.** Supporting. Thin on its own.
6. **Something they said tonight.** Binding, but it is a constraint, not taste.

### 5.2 What a reason may not be

- **A synopsis.** What the film is about is not why they should watch it.
- **A label.** *"A slow-burn psychological thriller"* is a search result describing itself.
- **Critical consensus.** *"Widely regarded as"* is somebody else's reason.
- **A claim about the person they did not make.** *"You clearly love ambiguity"* invents a taste
  and, worse, invents it confidently. This is **false personalization**, it is the failure this
  product is least able to detect from the inside, and it is an explicit criterion in §10.7.
- **An unverifiable comparison.** *"Fans of films like this"* — which films, whose fans.

The rule underneath all five: **a reason names something they can check.** If they cannot check
it, it is flattery, and flattery is what a recommender produces when it has nothing.

### 5.3 Confidence, and marking the stretch

Say how sure you are, and mean it. Confidence has two separate sources and the language should
distinguish them: how sure you are **about the film** is your own knowledge, and how sure you are
**about them** depends on what the model actually contains (P5). A week-old Mix with nothing under
it supports a confident statement of intent and a tentative statement of fit.

The expansion pick is **marked as a stretch in words** — not as a badge, not as a category name,
but in the sentence: *"this one is further out, and here is the thread."*

This is not hedging. Unmarked risk reads as a system that did not understand them; marked risk
reads as a curator making an argument. It is also the mechanism that makes a miss survivable: a
stretch that lands is a discovery, and a stretch that misses is information, but only if it was
announced as a stretch before it was watched.

---

## 6. *"Why now?"*

*Tonight* is the operative word in the product's central question, and the current instructions
do not contain a single rule about it. This section is the largest addition in this document.

The purpose is not novelty. It is that **a reason that expires converts a recommendation into a
watch.** But a manufactured reason is worse than no reason, so this section is written as an
evidence standard first and a preference second.

### 6.1 Three layers, with different evidence standards

| Layer | May be used | May **not** be used |
| --- | --- | --- |
| **Their evening** | only what they actually stated this conversation — *"I'm tired"*, *"we're two"*, *"I have ninety minutes"*, *"early start tomorrow"* | anything inferred about their state from the clock, the weekday, or the season. The date is known; the person is not |
| **The calendar** | facts derivable to a high standard from the date plus knowledge that is stable and widely held — the season; that a film released in 2000 turns twenty-five this year | anything needing a precise date the model may be wrong about: *"twenty-five years ago today"*, a birth or death date, a festival's dates, when an awards ceremony falls, a retrospective's run |
| **The world** | claims with direct evidence for **the exact claim**: this film, this date, this service, this territory | anything else. A tool that answered about a different territory, an earlier month, or a similar title has not answered |

The first layer is what actually answers *tonight*, and it was missing from the first draft.
Note the restriction: the system may know it is Thursday in October, and may use that about
*films*; it may not use it about *the person*. "You're probably winding down" is an invented fact
about somebody's evening and belongs in the same bin as an invented streaming window.

The second layer is cheap but not free. An anniversary needs the release year, which Tonight
stores and which is usually reliable; *"twenty-five years ago today"* needs the release date,
which it does not. The gradation matters: the safe half of the calendar layer is genuinely
useful and the unsafe half is indistinguishable from confident invention.

### 6.2 Temporal relevance is preferred, not required

> When two candidates fit the evening equally well, **the one with a real reason for this week is
> preferred** for the lead. When no candidate has one, the lead is the strongest thing the
> evidence supports, and **nothing about now is said**.

An evergreen answer is a complete answer. This is stated as a preference rather than a weight on
purpose: a weight would be optimised towards, and a system optimising towards timeliness produces
manufactured urgency — the tone of marketing, which is the one register this product must never
acquire.

### 6.3 The standard for a volatile claim

Availability is the most volatile thing a recommendation can assert and the most damaging to get
wrong. A claim about it is made only when the evidence names all of:

- **the exact film** — title *and* year, since `Dune` names two;
- **the date the evidence is good for**, since a window that closed last week reads as a lie;
- **the service**, where the claim is about one;
- **the territory**, where the claim is territorial — which for streaming it always is. A German
  user told that something is on a service because it is on that service in the United States has
  been given a false statement with a true-sounding source.

With no tool available, either say nothing about availability or say plainly that it could not be
checked. Never infer a window from a release date. Never state a date to make a point.

---

## 7. Growing taste

### 7.1 Reinforcement is the entry fee

The earlier draft of this strategy proposed *"mostly reinforce, one expand"*. That was risk
thinking borrowed from ranking, and it is wrong here for two reasons.

**The competitor is paralysis, not a better recommendation.** The alternative to Tonight's four
films is not somebody else's four films; it is forty minutes of scrolling followed by a rewatch.
Measured against that, a miss costs very little and a narrow hit gains very little.

**The reinforcing pick is the least valuable thing Tonight can offer.** *"Another slow, creepy
film"*, to somebody with *Stalker* and *Under the Skin* on a shelf, is a search query. They did
not need a curator for it. Its real function is **credibility** — it proves the model was read —
and one pick discharges that completely.

So: **one reinforcing pick, one genuine expansion, and the remainder decided by what the evening
and the week actually offer.**

### 7.2 Neighbouring rooms

*"I think you're ready for this"* needs a direction, and a taste model is a set of points, not a
vector. The direction does not come from embeddings — there is no catalogue to index — it comes
from film history, which the host model holds and no catalogue encodes. What the instructions
must supply is the **kinds** of adjacency, or the model picks at random and calls it discovery.

Every one of these starts from something they like (P10); the direction says where to walk from
there, never where the gaps are.

| Direction | What it is | Anchored in |
| --- | --- | --- |
| **The ancestor** | where a film they love came from | that film |
| **The descendant** | what it made possible | that film |
| **The same idea elsewhere** | another country or decade, same preoccupation | the preoccupation, named |
| **The harder film by the same hand** | same signature, one step less compromising | the director they already chose |
| **The serious cousin / the playful cousin** | same territory, other register | the territory |
| **The form jump** | subtitles, black and white, silent, long, animation, documentary | see §7.3 — still a film they love |

### 7.3 Form barriers are hypotheses, not findings

Genre boundaries are cheap to cross and are rarely what limits somebody. Form boundaries —
subtitles, black and white, animation for adults, documentary, three hours — are plausibly where
taste actually stops, and crossing one opens far more than a genre ever does.

Three rules, because the first draft overstated all three.

- **A form gap is a hypothesis about a list, not a proven barrier about a person.** Tonight does
  not store language, runtime or form (§7.4). That somebody's saved films contain no subtitled
  title may mean they avoid subtitles, or that they have watched twelve subtitled films and told
  Tonight about none of them. It may be voiced as a question — *"do subtitles put you off?"* —
  and never as a finding.
- **A crossing that lands reduces uncertainty; it does not grant blanket permission.** One
  `loved` subtitled film makes the hypothesis weaker, not the barrier gone. It is evidence about
  that film and that kind of film, and it should widen what is offered gradually rather than
  unlock a category.
- **No inference may depend on knowing that Tonight recommended something.** There is no
  provenance and there is deliberately never going to be (§8.4). A `loved` film that crosses a
  boundary might have been watched a decade ago. Any mechanism that needs *"it worked when I
  suggested it"* is unbuildable here and must not be designed in.

Practically: at most one form jump per conversation, and it leads only when they asked to be
surprised.

### 7.4 What Tonight can and cannot know about absence

Tonight stores, per Movie: title, year, an optional IMDb id that is **never looked up**, one
state, and Mix membership, plus timestamps. From that, and only that, the following is
**deterministic**:

- the distribution of **release years** — decades present, decades absent, the span;
- counts and the distribution of **states**;
- **Mix membership**, including films in none;
- when each record was written or last changed.

The following is **not stored and therefore not computable**: runtime, language, country, form
(documentary, animation, black and white, silent), director, cast, genre-as-metadata.

The first draft claimed *"nothing over two hours, nothing outside one language, never a
documentary"* was computable without new infrastructure. It is not, and the claim is withdrawn.
Those remain **model hypotheses** drawn from titles it recognises, they carry the model's own
uncertainty about whether it recognised them correctly, and §7.3 governs how they may be voiced.

**Storing more metadata is a separate product decision and is not proposed here.** It would
change what a Movie is — today a Movie is entirely what the user said about a film, with nothing
looked up — and that is the sentence the whole product rests on. If it is ever revisited it needs
its own document.

### 7.5 How far to reach is graded by what is known

The first draft graded this by `loved` count alone, which contradicted P5. Corrected, it is a
function of both kinds of evidence, and a declaration on its own is already enough to lead with.

| What the model contains | Lead with | Reach of the expansion |
| --- | --- | --- |
| **Nothing** | an excellent, broadly reachable film, plus **one** good question about films | none — *"you are ready for this"* about a stranger has nothing behind it |
| **Declarations only** — Genres and Mixes, few or no states | **the declaration, in their own words**; it is current, explicit and theirs | one room over, anchored in what the declaration says, phrased as a reading of it that they can correct |
| **Declarations plus states** | the declaration, sharpened by which films under it landed | further, because the anchor is now a film they actually loved rather than a sentence you are interpreting |
| **States that disagree with the declaration** | the evidence, and say that it diverges (§7.6) | this is the most informative state the model can be in |

### 7.6 The loved outlier

The most interesting object in any taste model is **a `loved` film that does not fit the
instruction of the Mix it sits in.** That is a taste and its own description drifting apart, with
evidence attached. It is the best available answer to *"where is this person going?"*, and it is
the natural moment to offer a Mix a new wording (§8.4, and Phase 6) — offer, never perform.

---

## 8. Conversation

### 8.1 A follow-up is a steer, not a new request

The thesis survives; one axis moves. *"Like that, but shorter"* moves length and **nothing
else** — not accessibility, not familiarity, not era. Compounding an unrequested second axis is
the most common way a recommender loses somebody on the second turn: they asked for one change
and received a different set entirely.

### 8.2 The axes

```
shorter ↔ longer        lighter ↔ heavier       stranger ↔ safer
older ↔ newer           quieter ↔ louder        closer ↔ further from their taste
```

Naming them in the instructions matters because the model must map an arbitrary sentence onto one
of them, and because the closing lever in §4.1 is drawn from the same list.

### 8.3 Escalation, not contraction

Somebody who has refused three safe suggestions has told you that the safe register is not
working. The response is to **reach further**, not to narrow. Concretely: after two unsuccessful
turns, change the thesis and say that you are changing it. Silently producing a fourth variation
of a failed idea is the behaviour that makes people close the tab.

Within a session, never offer the same film twice. That costs nothing — it is in the context
window.

### 8.4 What is not remembered, and why

Tonight keeps no record of what was recommended. This is deliberate and it should stay
deliberate: a log of what a system showed you, which you never see and cannot delete, is exactly
the custody failure in §2.1 reappearing inside the product that exists to fix it.

The consequence is binding on design, not just on storage: **no rule anywhere in this strategy
may depend on knowing what was previously suggested.** §7.3 is where that bites hardest.

Across sessions, three instruments do the work instead, and all three are things the **user**
says:

- A film they actually watched carries a **state**, and is therefore out of "offer as new".
- An evening that keeps coming back is a **Mix**, and proposing one is already in the skill.
- A set varies **within itself**: no two by one director, not all one decade, not all one
  register.

If that proves insufficient, the only extension consistent with the product is a **statement**,
not a log — a `not_interested` state the user expresses, visible on the website and deletable
like everything else. That is a schema change and a separate decision; §11 lists it unresolved.

---

## 9. Architecture

### 9.1 Responsibilities

| Layer | Owns | Must not own |
| --- | --- | --- |
| **Deterministic code** (`lib/taste`, `lib/web`) | the join Mix → films → states; the release-year distribution (§7.4); the instruction sync and its budget guard; the evaluation harness | film knowledge, selection, prose, any judgement about whether a Mix counts |
| **MCP tools** (`lib/mcp/server.ts`) | reads and writes over the taste model, and the shape those reads arrive in | a `recommend` tool, candidates, ranking |
| **Tool descriptions** | **tool-local invariants, persistence preconditions and write mechanics** — what this call requires, what it refuses, what each field means | cross-tool workflow, consent, classification, the recommend/configure boundary |
| **Skill / project instructions** | the curator's method **and** every rule that spans more than one call: consent, classification, orchestration, the mode boundary | field-level mechanics the tool description already states at the point of use |
| **Host model** | candidates, film history, the thesis, the writing, the judgement, hypotheses about form and language | anything Tonight knows deterministically |

The tool-description row is the correction that matters. A tool description is read at the moment
of one call, by an agent that has already decided to make it. That makes it the right home for
*"a Mix needs at least one existing Genre"* and the wrong home for *"decide whether this
conversation should be writing anything at all"* — the second has to have been read **before** the
first tool call, and a description cannot be read before the call it describes.

### 9.2 Why the recommendation logic lives in the host

1. **Tonight has no catalogue, so candidate generation is not available to it.** Everything else
   follows from this one fact.
2. **Acquiring one makes Tonight a different product** — licensing, freshness, cost, coverage —
   and a worse copy of something the host already has.
3. **The host's model holds what no catalogue encodes:** why a film matters, what it descends
   from, what it was a reaction against. §7.2 is entirely built on that knowledge.
4. **A model inside Tonight would need keys, a vendor and a budget**, and would then be
   permanently behind the model the user is already talking to.

**What this costs, stated plainly:** Tonight cannot guarantee the quality of any single
recommendation, cannot A/B test one, and cannot repair a weak host. Its entire influence is
exercised through instructions and through the shape of the data it returns. That is a real
limitation and the reason §10.7 exists.

### 9.3 The delivery budget, recalculated

A ChatGPT project truncates its instructions at about 8,000 characters without saying so. The
generated text is ≈7,816 against a 7,900 guard: **roughly eighty characters of headroom.**

| Section | Characters | Share |
| --- | ---: | ---: |
| Preamble and boundaries | ≈1,040 | 13% |
| **Recommending** | **≈1,730** | **22%** |
| What may be persisted | ≈1,040 | 13% |
| Films they tell you about | ≈2,880 | 37% |
| Model questions, memory, failures | ≈1,170 | 15% |

The first draft proposed moving *the write rules* into the tool descriptions and estimated a
harvest of 1,500–2,000 characters. Applying the split in §9.1 honestly, sentence by sentence,
that estimate was roughly double what is actually available:

| Candidate | Verdict | Characters |
| --- | --- | ---: |
| The Mix naming tests (*"if I knew only its Genres…"*) | tool-local to `create_mix`, and **already in its description** | ≈200 |
| *"A Genre always needs an instruction… a Mix needs at least one existing Genre"* | tool-local invariants, already in both descriptions | ≈130 |
| *"Write every Genre and Mix instruction in the user's first person"* | tool-local to the four write tools | ≈65 |
| The sentence → state mapping | tool-local to `create_movie` / `update_movie`, if `state`'s own schema description carries it in full | ≈300 |
| *"Never reword their instruction"*, *"never record a score"* | tool-local to the update tools | ≈100 |
| Consent, *"never persist what you conclude alone"*, the ask-first rule | **cross-tool — stays** | 0 |
| The two-requests split, the classification ladder, Mix proposal, *"propose while saving, not while recommending"* | **cross-tool — stays** | 0 |
| *"A recommendation is not a saved Movie"*, *"a film in no Mix is legitimate"* | **cross-tool — stays** | 0 |
| **Realistic harvest** | | **≈700–800** |

So the method's budget goes from ≈1,730 to ≈2,500, not to ≈3,500. That is enough for Phases 1 and
2 written telegraphically, and probably not enough for Phase 3 as well. Three consequences, and
the third is the honest one:

1. **Size the phases to the budget.** Each phase states its character cost and the guard stays at
   7,900.
2. **Spend the harvest on method, not prose.** Rationale continues to live in `full:` blocks and
   reaches skill-capable hosts only.
3. **Decide the second channel early rather than as a fallback.** A separate, uncapped
   "Recommending" block offered on `/setup` — or accepting that a ChatGPT project gets a
   deliberately reduced method while skill hosts get all of it — is now a likely requirement
   rather than a contingency. §11 lists it as the first unresolved decision.

This also settles a live contradiction with `README.md` — *"none serves product guidance either"*.
The correct restatement is narrower than the first draft's: **a tool description carries the rules
for using that tool, and nothing else.** That is true of the current code, consistent with
`user-owned-movies.md` §12.1, and it is exactly the boundary §9.1 draws.

### 9.4 Four things that must not happen

1. **No LLM inside Tonight.** §9.2.
2. **No catalogue.** The moment films exist that nobody named, a Movie stops being theirs.
3. **No `recommend` tool.** It would have to either return the user's own saved films, which is
   not a recommendation, or invent a catalogue.
4. **No hidden record of what was recommended**, and no rule that depends on one. §8.4.

---

## 10. Roadmap

### Phase 1 — The shape of an answer

**Objective.** Replace *"three to six films"* with one idea, one leading film named as the lead,
and two or three directions ordered by distance. Adopt P3, P4 and P5. Define the read-failure
behaviour (§10.1.1). Carry out the reallocation of §9.3 in the same change.

**User benefit.** The plain question gets an **answer** rather than a list, and the model they
built — including a Mix written yesterday — starts affecting the answer they get.

**Implementation.** Rewrite `## Recommending` in `SKILL.md`. Move only the tool-local rules named
in §9.3 into the `create_*` / `update_*` descriptions. Regenerate the project instructions.
Repoint the contract tests that pin moved rules — `instructions.test.ts` around the Discovery
boundary and the state mapping, and the `order_check` markers in `skills/tonight-recommend/test.sh`
— at their new home rather than deleting them. Restate the README sentence named in §9.3.

**Risks.** An exclusion written months ago becoming a permanent filter — mitigated by splitting
evidence from exclusions rather than flipping the switch, and tested by the pair of fixtures in
§10.7. A film request drifting into a configuration session — the existing guard must survive the
rewrite verbatim. Rule drift once a rule is stated in one place and summarised in another — the
repointed tests are the defence. Budget overrun — §9.3.

**Dependencies.** None. This is first.

#### 10.1.1 What happens when the taste model cannot be read

The first draft made `get_taste` mandatory on every recommendation without saying what happens
when it fails — which silently turned a store outage into a total product outage, including for
requests that never needed the data. The decision, and it is **split by what was asked**:

| Request | Behaviour |
| --- | --- |
| **Taste-explicit** — *"based on my taste"*, *"what would I like?"* | **Stop.** Report the failure in the tool's own words, offer to retry. A non-personalized answer is not an answer to that question, and substituting one is false personalization by omission |
| **Ordinary** — *"what should I watch tonight?"* | **Disclosed fallback.** Say in the first sentence that the taste model could not be read and that what follows is not based on it. Then recommend well, in the shape of §4. Make **no** personal claim of any kind. Offer to retry |

The reasoning: a failure should cost what it actually costs. An outage removes personalization; it
does not remove the ability to be useful about films, and refusing everything punishes the user
for our unavailability. But degrading *silently* is worse than either option, because the user
cannot tell a generic recommendation from a personal one — hence the disclosure and the ban on
personal claims. This supersedes the current skill rule, which stops in both cases.

**Acceptance criteria for Phase 1**

1. A plain request produces exactly one lead, named as such, plus two or three directions.
2. A Mix created with no Movie states under it demonstrably shapes the answer, and the language
   about *fit* is more tentative than the language about *intent*.
3. An exclusion inside a Mix instruction binds a taste-explicit request and does **not** bind an
   unrelated plain request.
4. No film carrying a state is presented as new.
5. Every expansion carries a positive anchor naming something they like (P10).
6. On a `get_taste` failure, both branches of §10.1.1 behave as specified, and the ordinary branch
   makes no personal claim.
7. The generated instructions stay under the 7,900 guard.

### Phase 2 — *Why now*

**Objective.** The three layers of §6.1 with their separate evidence standards, the preference
rule of §6.2, and the volatile-claim standard of §6.3.

**User benefit.** The answer acquires an expiry date when there genuinely is one, and stays quiet
about now when there is not.

**Implementation.** A new subsection in the recommending instructions, ≈600 characters. No code.

**Risks.** Invented availability — the most damaging failure in the product. Invented calendar
facts, which the first draft treated as free and §6.1 now bounds. Manufactured urgency in quiet
weeks — mitigated by §6.2 stating that an evergreen answer is complete.

**Dependencies.** Phase 1, for the space.

### Phase 3 — The neighbouring room

**Objective.** The six expansion directions, the anchor requirement (P10), the readiness test
(P9), the hypothesis rules of §7.3, and the graded reach of §7.5.

**User benefit.** *"I think you're ready for this"* starts happening, with a thread the user can
follow rather than a surprise they have to trust.

**Implementation.** Instructions, ≈700 characters — **which is where the budget probably runs
out**, and the point at which the second-channel decision in §11 must already have been made.

**Risks.** Surprise as quota. Gap-driven recommendations with no anchor, which P10 exists to
prevent and §10.7 tests for. Boldness against an empty model (§7.5, first row).

**Dependencies.** Phases 1 and 2, and the §11 channel decision.

### Phase 4 — Evidence out of `get_taste`

**Objective.** Return the Mix → films → states join already performed, and the release-year
distribution of §7.4. **No trustworthy-versus-aspirational classification**: the response reports
what is there and never grades a Mix.

**User benefit.** Recommendations get better as the model grows rather than harder to read. Today
a large model arrives as an alphabetical list with the confirmatory evidence scattered through it.

**Implementation.** `lib/taste/store/sql.ts` read shape, the `get_taste` description, the store
tests; `user-owned-movies.md` §14 documents the current shape. Possibly a second read-only tool if
the payload grows uncomfortable.

**Risks.** Payload size. Two truths about one relation if the join is returned alongside the raw
arrays. **Derived signals reading as verdicts** — the reason the classification is dropped rather
than renamed; a field called anything like "weak" would be a judgement about a person rendered as
data.

**Dependencies.** None. Parallel with Phases 1–3; raises the ceiling for 3 and 6.

### Phase 5 — The conversation

**Objective.** §8: the steer, the axes, escalation after two misses, no repeats within a session.

**User benefit.** The second and third *"no"* move somewhere instead of producing variations of a
failed idea.

**Implementation.** Instructions, ≈400 characters.

**Risks.** Mechanical axis-shifting that reads as a knob rather than a conversation. Abandoning a
good thesis too early.

**Dependencies.** Phase 1.

### Phase 6 — Mixes that age with the person

**Objective.** Surface drift between a Mix's instruction and the states under it; offer a
rewording under the existing consent rule; look for the loved outlier of §7.6.

**User benefit.** The model stops being a snapshot of who they were when they wrote it.

**Implementation.** The derived data from Phase 4, plus instructions for what to do with it. The
consent rule is not relaxed: the system says what it noticed and offers wording; the user decides.

**Risks.** Eagerness — a system that proposes rewordings often is one nobody trusts with their own
sentences. Rewriting meaning rather than wording, which the existing rule forbids and which must
survive this phase intact.

**Dependencies.** Phase 4.

### 10.7 Evaluation — paired, blind, and part of Phase 1

Not a later phase. **A paired current-versus-proposed evaluation ships with Phase 1**, because
every change above is a prompt change whose effect is otherwise invisible, and because two of the
findings that produced this revision were contradictions no test would have caught.

**Method.** For each fixture and prompt, generate outputs from both instruction sets, strip any
marker of which is which, shuffle, and score. **Repeat each pair several times** — these systems
are nondeterministic, and a failure that appears in one run of five is a real failure at a rate
users will meet.

**Fixtures**

| Fixture | Exists to catch |
| --- | --- |
| **Empty taste model** | onboarding drift; invented personalization from nothing; §7.5 row 1 |
| **Newly created Mix, no Movie states** | the P5 regression — a declaration being ignored because nothing under it is loved |
| **State-rich model** | whether confirmatory evidence sharpens the answer or merely narrows it |
| **Contradictory model** — a `disliked` film under a Mix whose instruction it matches | whether conflict is handled as information or averaged away |
| **A Mix instruction with an explicit exclusion, asked about directly** | the exclusion must bind |
| **The same model, asked an unrelated plain question** | the exclusion must **not** become a global filter — the P3 pair, and the single most important test here |

**Criteria**, scored per output

| Criterion | Asks |
| --- | --- |
| **Fit** | does the lead plausibly suit what was asked? |
| **Constraint compliance** | was everything they said tonight honoured, including what they ruled out? |
| **Decisiveness** | is there exactly one lead, named as such? |
| **Justified personalization** | does each personal claim cite something checkable in the model? |
| **Discovery quality** | is there an expansion, is it anchored (P10), and is it marked as a stretch? |
| **Unsupported claims** | any availability, release or cultural claim without evidence to §6.3's standard |
| **False personalization** | any taste attributed to the user that they never expressed — scored separately from unsupported claims, because it is the failure they are least able to catch |

Scored by hand first. A judge model only once hand-scoring cannot keep up, and never for the last
two criteria without spot checks — they are the ones a judge model is most likely to wave through.

---

## 11. Risks and unresolved decisions

**Risks, highest first**

1. **Invented currency.** A fabricated release date, restoration or streaming window destroys
   trust in a way no wrong film does. §6.1 and §6.3 are the mitigation; §10.7 tests it.
2. **False personalization.** A taste attributed to somebody they never expressed. Harder to
   detect than an invented fact, because the user may accept it. P12, §5.2 and a criterion of its
   own in §10.7.
3. **The exclusion regression.** P3 splits evidence from exclusions. Implemented carelessly, it
   reinstates the problem the current rule was written against. The fixture pair in §10.7 exists
   for nothing else.
4. **Expansion as quota, or expansion from gaps.** P9's sentence test and P10's anchor are the
   whole defence. Without them, "one surprise per set" degrades into one random film per set.
5. **Budget overrun.** §9.3. Phase 3 is the likely casualty, and silently truncated instructions
   fail invisibly.
6. **Rule drift across two homes.** Moving tool-local rules into descriptions creates two places
   a rule could be stated. Tests are repointed, not removed.

**Unresolved decisions**

1. **The second delivery channel** — now likely required rather than a fallback (§9.3). Either an
   uncapped "Recommending" block offered on `/setup`, or an explicit decision that a ChatGPT
   project receives a reduced method while skill hosts receive all of it. **This must be settled
   before Phase 3 is written.**
2. **May the lead be wrong?** Product identity, not engineering. If a confident lead that misses
   is acceptable — and the skill may say so out loud, *"if it does not land, tell me and I will
   know more"* — the leap may lead and §7.5 stands. If not, expansion is permanently second and
   §7.5's last two rows change. This document is written for the first answer.
3. **Whether Movies should carry more metadata** — runtime, language, form. It would make §7.4's
   hypotheses into facts, and it would change what a Movie is. Out of scope here; needs its own
   document (§7.4).
4. **`not_interested` as a sixth state.** §8.4. Only worth revisiting if Phases 1–6 leave
   cross-session repetition as a real complaint.
5. **Whether `get_taste` carries the derived data or a second read-only tool does.** A
   payload-size question that cannot be settled until Phase 4 measures a large model.

---

## 12. What this document changes in the skill

Stated explicitly, because a future contributor will read `SKILL.md` and this document side by
side and needs to know which is newer.

| Currently in the skill | Becomes |
| --- | --- |
| *"Nothing persisted binds"* on an ordinary request | Evidence always informs; only exclusions are mode-dependent (P3) |
| `get_taste` read only in the taste-aware mode | Read on every recommendation, with §10.1.1 governing failure |
| *"`get_taste` fails — report the error verbatim and stop"* | Stop for a taste-explicit request; disclosed non-personalized fallback for an ordinary one (§10.1.1) |
| *"three to six films, for range as well as fit"* | One lead plus two or three directions (§4.5) |
| No film leads | The lead is named, and the system says it would start there (§4.2) |
| No rule about currency of any kind | Three layers with separate evidence standards, a preference rule, and a volatile-claim standard (§6) |
| No rule about expansion beyond "range" | One anchored expansion per set, with named directions (§7) |
| No rule about follow-up turns | Steer one axis; escalate after two misses (§8) |
| Presentation guidance held in `full:` blocks, never reaching a ChatGPT project | Normative, and in the shipped text as far as the budget allows (§9.3) |

---

## 13. Review responses — what changed in revision 2

Recorded so that the reasoning is not lost, and so that a future reader can see which positions
were tested.

**Adopted in full**

1. **Mix evidence had two incompatible meanings.** The first draft said Mixes are the strongest
   evidence and then, in its own worked example and in Phase 4, dismissed a Mix with no `loved`
   films as "an intention rather than evidence". That contradiction would have broken the
   product's loop at its most important moment: the Mix written in last night's conversation is
   exactly the one tonight's recommendation should use. Resolved by P5's declarative/confirmatory
   split; the deterministic trustworthy-versus-aspirational classification is removed from §7.5,
   §9.1, Phase 4 and the worked example, which is now built to demonstrate the corrected rule.
2. **Tool descriptions were being asked to carry cross-tool behaviour.** §9.1 now draws the line
   at what can be read *at the moment of one call*, and §9.3 re-derives the harvest sentence by
   sentence: ≈700–800 characters, not 1,500–2,000. The consequence is stated rather than hidden —
   the second delivery channel moves from contingency to likely requirement, and Phase 3 is the
   first thing that does not fit.
3. **Deterministic absence signals exceeded the stored data.** Runtime, language and form are not
   stored. §7.4 now lists exactly what is computable — release years, states, membership,
   timestamps — withdraws the claim, and marks additional metadata as a separate product decision
   with its own document.
4. **Form barriers and landed jumps were overstated.** §7.3 reframes gaps as hypotheses about a
   list, a crossing as reduced uncertainty rather than permission, and — the sharpest of the
   findings — forbids any mechanism that depends on knowing Tonight recommended something, since
   there is no provenance and never will be. P10 is new: an expansion always has a positive
   anchor, never a gap.
5. **`get_taste` failure was undefined.** §10.1.1, with acceptance criteria.
6. **Evaluation was too weak and too late.** §10.7 is now part of Phase 1: paired, blind,
   repeated, with the fixture set and criteria named, including the P3 exclusion pair and false
   personalization as a criterion of its own.

**Adopted with a qualification**

7. **On the calendar layer.** The review asked that anniversaries, birthdays and festivals not be
   treated as automatically tool-free. Adopted — but not by collapsing the layer into "needs
   evidence", which would throw away the half of it that is both safe and useful. §6.1 splits it:
   what is derivable from the date plus a release *year* Tonight stores (a film turning
   twenty-five this year; the season) is usable; what needs a precise date the model may misplace
   (*"twenty-five years ago today"*, a birth date, a festival's run, when a ceremony falls) is
   not. The gradation is the point — a rule that forbids all calendar reasoning would be obeyed
   by dropping the cheapest real source of *why now* the product has.

8. **On `get_taste` failure, neither offered option was taken whole.** The review asked for one of
   *stop everything* or *disclosed fallback*. §10.1.1 splits by what was asked, because the two
   requests fail differently: a taste-explicit question cannot be answered without the model at
   all, while an ordinary one can be answered well without it. Stopping both punishes the user for
   an outage that only removed personalization; falling back on both answers a question that was
   not asked. The disclosure requirement and the ban on personal claims carry the risk the single
   fallback option was worried about.

**Not adopted:** nothing. Every finding identified a real contradiction, and the two
qualifications above are refinements of how to resolve them rather than disagreements about
whether they are real.
