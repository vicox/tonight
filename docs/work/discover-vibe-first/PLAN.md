# Discover the Vibe first. Recognize the connection second. — plan and record

Base `5e42129` (plugin 1.10.19, after *Vibe refit*, PR #33). A change to what the agent reads —
two skills, the `next` on `vibe_required` and the `vibes` field of the two movie tools — with no
schema, store, argument or API change, no migration, and nothing written automatically.

## 1. The problem

Every flow that finds a film its Vibe started from their Vibes. Step 1 of the `vibe_required`
offer was *"An existing Vibe first"*; the saving flow said *"Read the Genres and Vibes first"*;
`next` began *"Read get_taste, then … if one of their vibes fits"*. So the nearest Vibe — the one
that shares a Genre, a setting, or was just talked about — was weighed before anybody had said
what the film was, and a new Vibe was what was left over when none fitted. Two failures follow
from that order: a neighbour is recommended because it is close, and a Vibe that is the film's
evening in other words is missed because its words are not the film's.

## 2. What changes

**One rule, stated once in `tonight-vibes`** (*Discover the Vibe first; recognize the connection
second*) and pointed at from every flow that finds a film its Vibe — a liked or loved answered
`vibe_required`, one already kept, a film they ask to keep:

- **First, the film as it was for them.** Before any Vibe of theirs is weighed, settle what kind
  of evening the film was — from the film itself, grounded in what they said about it in this
  conversation (not only the last sentence). Their words lead where they gave any; where they gave
  none, the film and what they have liked are enough, and nobody is asked why. The pass does not
  start from their Vibes' names or Genres and is not a search for the nearest one.
- **Then, the connection.** Only now read each Vibe's sentence, its Genres' instructions and its
  core, for one that **is** that evening — said in their words, embodied by its core; recognition,
  not argument. The same evening in other words is that evening, and a new Vibe beside it would
  split one evening in two. A detail true of the core alone does not undo a connection (the refit
  weighs it).
- **Not a connection on its own:** a neighbour — a Vibe the film shares only a Genre, a word of the
  name, a setting, a period, a maker or a cast with; what they share proves nothing either way,
  since the Vibe that is its evening may share it too. A Vibe made warm by the conversation (read
  back, recommended from, offered) is weighed like any other: having come up neither makes it the
  evening nor rules it out.
- **Neither side preferred:** no Vibe recommended because it exists, no new one because it is
  new. A real connection is the recommendation; otherwise the evening found first is the new Vibe
  recommended, never reshaped toward one of theirs.

**Kept as it was:** no reason needed; one film, one Vibe; the refit (sentence and core weighed
inside the one offer); two concrete alternatives; the offer's shape and posters; writes only on a
yes; first films; no examples added to either skill.

## 3. Where it is said

| Layer | What |
| --- | --- |
| `tonight-vibes` | the new section before *When a liked or loved needs a Vibe*; the flow's *discover* step before *consider*; step 1 is *One of their Vibes, where it is that evening* (core included); step 3's recommended Vibe is the evening found first; the kept path and the saving flow (*"what kind of night is this?"* answered first, then the Vibe that is that night, never a neighbour); the table's loved row |
| `tonight-recommend` | the `vibe_required` pointer says the rule in its own words (*The evening first, their Vibes second*), with neighbour, warm and neither-preferred; the saving flow the same |
| `next` on `vibe_required` | *Discover the vibe first* before `get_taste`; (1) a vibe only where it is that evening — a real connection, read in instruction, genres and core, not a neighbour, not for existing or having come up; (2) the recommended new vibe is the evening found first |
| `vibes` on `create_movie` / `update_movie` | the saving call's own field: the evening the film is, settled before any vibe was weighed, is the one that vibe's instruction, genres and core describe |

`plugin.json` is 1.10.20: the skills ship in the plugin, and ChatGPT refuses an unchanged version.
The server text ships with the web deploy, which Vercel makes from `main` on merge — the same
merge as the plugin version.

## 4. Tests

- `tonight-vibes/test.sh`: a new section of 13 checks — the flow order, the rule's place and
  scope, blind, grounded in their words, the real connection, the refit's detail, neighbour, warm,
  neither preferred, step 3, the kept path, the old wording gone, no evaluation film named — plus
  the saving flow (2) and the three step-1 pins moved to the new wording.
- `tonight-recommend/test.sh`: the pointer and saving flow (3 new), the old wording gone, no
  evaluation film named; two pins moved.
- `recommend-skill.test.ts`: a test that both skills say the rule and its four cases; six pins moved.
- `verdicts.test.ts`: `next`'s discover clause, (1) and (2), their order, the old trigger gone.
- `tools.test.ts`: the `vibes` field of both movie tools; no evaluation film in any description.
- `evaluation-m5.test.ts`: the discover set — scenarios, fixtures, requests and rubric criteria;
  T1.3's title.

Each new pin fails against the base skills (checked by emulating `order_check` over the base
files).

## 5. Behavior evaluations

Two fixtures (`m5/README.md`, *The discover set*): `m5-10-discover` — Alone With It is Moon's
evening in words that say nothing of space, on Genres that name none; Zero-G Popcorn shares only
the Space Genre — and `m5-11-discover-blind`, the same model without Alone With It.

| scenario | case | expects |
| --- | --- | --- |
| `m5-10-discover__liked-moon` | real connection | liked, no reason; Alone With It recommended, no new wording, no core offer; Zero-G Popcorn not offered as a fit |
| `m5-10-discover__loved-interstellar` | neighbour | loved; a new Vibe recommended; neither Vibe of theirs offered as a fit |
| `m5-11-discover-blind__liked-moon` | blind | the same request; Moon's own evening as the recommended new Vibe, never reshaped toward Zero-G Popcorn |
| `m5-10-discover__space-vibe-about__then-liked-moon` | warm context | the neighbour read back as *"my space vibe"*, then Moon: as the real connection |
| `m5-10-discover__alone-vibe-about__then-liked-moon` | warm context, control | Alone With It read back, then Moon: still recommended there — recency rules nothing out |

Scored by `m5/rubric.md`, *Discover the Vibe first* (D1–D4). Not recorded in this change.

## 6. Review

**Codex code review 1 — NOT READY (`4d388f4`).** Codex (`codex/b0e3ddb4`, through Relay) ran
vibes bash 216/216, recommend bash 271/271, `chatgpt-plugin/test.sh` 37/37 and the four changed
TypeScript suites 143/143. **One P2:** surface overlap and recency read as exclusions — recommend
said a Vibe that had just come up made *"a neighbour, never a fit"*, against tonight-vibes'
*"weighed like any other"*, and the neighbour clauses in tonight-vibes and `next` were as
categorical. **Fixed:** a shared Genre, name or surface is never a fit *on its own* and proves
nothing either way; a Vibe having just come up *neither makes one nor rules one out* — in both
skills and `next`, with pins refusing the old wording, and a warm-context control scenario
(`discover-warm-fits`) where the Vibe just read back is the evening and is still recommended.
