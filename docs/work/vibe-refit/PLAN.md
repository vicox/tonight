# Vibe refit: a Vibe's sentence and core, weighed for a liked or loved film — plan and record

Base `a2a0540` (plugin 1.10.18, after *Vibe offer: two films for every option*, PR #30). A change
to what the agent reads — two skills, one tool description and the `next` on `vibe_required` —
with no schema, store, argument or API change, and nothing written automatically.

## 1. The problem

Two offers the owner expected never happened (analysis on `a2a0540`, recorded in the session that
preceded this one):

- **A new wording for a Vibe a film confidently fits.** The minimal change was allowed only where
  *"the sentence does not yet say what makes it fit"* — which a confident fit answers — and a film
  that fits well was offered *"with no new wording"*. So a sentence written from its core, naming
  something only that core has (a city, a decade), stayed as it was after a second film of the
  same evening arrived.
- **A loved film as the core of a Vibe whose core they only liked.** A new core was considered
  only on the kept path, by embodiment alone; the `vibe_required` path files the film as an
  ordinary member and ends after the retry, and nothing pointed at the core's verdict.

## 2. What changes

**One shared rule, weighed every time a liked or loved film is offered for one of their Vibes**
— the recommendation after `vibe_required`, that Vibe as an alternative, or a move on the kept
path — and both parts of **the one offer**: never an offer of their own, never after it, never
written without a yes.

**Its sentence, for both films** — read part by part against the core and the film:

- every part true of both → nothing offered; *a film arriving is never a reason on its own*;
- a part true of the core alone, the film the same evening without it → the exact new wording,
  that part **loosened or dropped**, the rest in their words;
- the part it lacks is what the evening is about → not that evening, not filed there.

**The rewording-trap safeguards, kept and made explicit.** A new wording only ever *takes away*
what is true of the core alone. It never adds what only the new film has, nor their reason for
liking it (that is their `because`; *vibe-hypotheses* G2). It says what the two share — never the
two added together — so it never widens the Vibe. The core still fits wholly, every liked or
loved film in it still fits, the name and Genres stay (needing new ones means another evening),
and it names no film.

**Its core, when this one is loved** — when the film is `loved` and the Vibe's core stands only
`liked`, and the film embodies the Vibe wholly *as its sentence stands now*: offer it as the core,
named against the current one, which stays in it. Not when the core is loved or has no verdict
(a core they chose then falls under the existing *embodies it better* rule), not for a film only
liked, and not for one that fits only with a new wording — which also keeps a core change from
depending on a wording they might decline. *Loved is the reason to ask, never the answer*; a core
never changes on a verdict alone.

**Consent.** Each is its own part of the one offer: a yes to all writes all, a yes to part writes
that part (*"just put it there"* files the film under the core it has), and what they turn down is
not offered again in the conversation.

**Writes.** A film agreed as the core is filed by `update_vibe` with it as `core` (and
`core.viewing` if unsaved) — no `update_movie` for it; the old core stays as a member. A new
wording is `update_vibe` with exactly the sentence shown, before the film is filed under it. Then
`record_verdict` again with `retry.arguments`.

**The kept path** gets the core rule too: *A new core for a Vibe* now also covers a loved film in
a Vibe whose core stands only liked. A move to another Vibe weighs that Vibe the same way. A film
already in a Vibe gets no new wording on its own: the owner scoped the wording to filing, and the
kept path's budget is unchanged.

## 3. Where it is said

| Layer | What |
| --- | --- |
| `tonight-vibes` | step 1 (weigh it, every time) and step 2's trigger (a part true of the core alone); the new *Filing it in one of their Vibes* section; the offer's layout (a new core named with the one that stays); the writes on a yes; the kept path's move and core bullets; the budget (inside the one offer); the table's loved row |
| `tonight-recommend` | the core is *the film that best embodies the Vibe — the one it was written from, or one they chose since* (it can be replaced); the pointer to the offer names both parts, each on a yes |
| `next` on `vibe_required` | the same rule in its own terms — the only guidance a recommend-only host has at that moment — and the core write in step (3) |
| `update_vibe` | the minimal change's trigger and its limits (takes away only, never the new film's, never their reason; a liked or loved film there must still fit), and a loved film over a liked core as a reason to *offer* a core, never to make one |

**Considered and not done: a hint on a kept `record_verdict`.** A response could carry the
Vibe's core and its verdict, and a `next` when a loved film's Vibe has a liked core. Not added:
`m5/README.md` (*The input to S4*) adds a `next` to `record_verdict` only on evidence that agents
stop after a positive verdict, and on `recommend-only` a stop after a kept verdict is correct by
design. The `vibe_required` path, which recommend-only hosts do reach, carries the rule in its
`next`. `get_taste` is unchanged: a Vibe's core and the verdicts are both in it.

`plugin.json` is 1.10.19: the skills ship in the plugin, and ChatGPT refuses an unchanged version.

## 4. Tests

- `tonight-vibes/test.sh`: 18 new checks (the section in order, step 1 and 2, the safeguards, the
  core rule and its exclusions, partial consent, the writes, the kept path, the budget, the table)
  and one changed (*a film that fits well* now says when no wording is offered); the old trigger
  pinned gone.
- `tonight-recommend/test.sh`: the core's definition, and the offer pointer.
- `recommend-skill.test.ts`: the same, plus the new section read in order.
- `verdicts.test.ts`: the `next` text and the order of the core write before the retry.
- `tools.test.ts`: `update_vibe`'s new trigger, limits and core sentence; the old trigger gone.
- `evaluation-m5.test.ts`: the new fixtures, scenarios and rubric criteria.

## 5. Behavior evaluations

Two fixtures, `m5-08-refit` and `m5-09-refit-kept` (`m5/README.md`, *The Vibe-refit set*):

| scenario | expects |
| --- | --- |
| `m5-08-refit__loved-before-sunrise__then-yes` | loved, `vibe_required`; one offer: Walk and Talk with Before Sunrise as its core in place of Before Sunset (liked), which stays; no new wording; on yes, `update_vibe` core, then the retry |
| `…__then-keep-before-sunset` | the same offer; *"Yes, but leave Before Sunset as the main one"* files it, changes no core |
| `m5-08-refit__liked-only-god-forgives__then-yes` | liked; one offer: Neon and Silence with *Los Angeles* loosened or dropped, nothing of the new film added, Drive (loved) still its core, no core offer; on yes, `update_vibe` instruction, then filing, then the retry |
| `m5-09-refit-kept__loved-before-sunrise__then-yes` | the kept path: viewing moved, then one offer of Before Sunrise as the core; on yes, `update_vibe` core |
| `m5-05-partial-fit__bloom-clever__then-yes` | the rewording trap, which must not come back |

Scored by `m5/rubric.md`, *A film for one of their Vibes* (R1–R4), on DeepSeek; the report is
`BEHAVIOR.md` beside this file.

**Recorded** on DeepSeek `deepseek-v4-pro` — the model the API reported on all 143 requests —
with a dev-only `web/.env.local` (in-memory database) and the key from opencode's credential
store: 15 runs at `2785f86`, then at `203c35f` the wording scenario again (3), recommend-only (2)
and the regression set (6), 26 runs and 49 turns in all.

- **Core:** offered 10 of 10 times for a loved Before Sunrise beside a liked Before Sunset —
  plugin, recommend-only and the kept path — always named against Before Sunset, which stays;
  every yes one `update_vibe` with `core` (7 of 7); *"leave Before Sunset as the main one"*
  filed it and changed no core (3 of 3).
- **Wording:** none offered where the sentence is true of both (0 of 10); offered 7 of 7 where
  only the core has the detail, never adding the new film's or their reason, never a core offer
  for a liked film. Minimal in 6 of 7 — one run changed *after dark* too, fixed in `203c35f`
  (*every other word left as they wrote it*, in `next` and `update_vibe`); 4 of 4 after it.
- **The rewording trap held** in 5 of 5 `bloom-clever` runs.
- **Not this change:** T1.6 presentation failures, chiefly an illustration film said to belong to
  the one-film Vibe recommended (5 runs — *vibe-all-covers*' rule, worth its own change), and
  the regression set's three base weaknesses (no film in the recorded `what-tonight` answer,
  the onboarding `hi`, the kept path's K1.3).

## 6. Review

**Codex review — READY (`2785f86`).** Codex (`codex/2770f608`, through Relay) found no P1/P2/P3:
the skill, `next`, `update_vibe` and recommend agree; the write sequence matches the store
(`update_vibe` with `core` saves and files the film and keeps the old core); not adding a kept
`record_verdict` hint matches the recommend-only contract; the fixtures and rubric are sound.
Codex ran vibes bash 201/201, recommend bash 266/266, `chatgpt-plugin/test.sh` 37/37, and the
four changed TypeScript suites 140/140.

**After the behavior runs, `203c35f`** — the one finding came from DeepSeek, not the review: a
new wording changed a word it did not need to. **Codex re-review — READY**, no findings, the four
suites 140/140.
