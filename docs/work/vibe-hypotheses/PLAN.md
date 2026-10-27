# Vibe hypotheses: learning what they loved about a film — plan

Status: **plan, Codex READY — the analysis in three rounds, the _new_ additions in two (§10).**
Implementation follows §9.

- Base: `main` at `5231b1d`. Worktree `tonight-taste-vibes-analysis`.
- Scope: instructions (both skills, tool descriptions, one server constant), their pins, one MCP
  composition test, and the operator-run evaluation set with a small runner extension. **No
  schema, migration, store, tool-schema or web change.**

## 1. The product decision

The user's, 2026-10-27, as given:

- **Three distinct hypotheses.** When Tonight proposes Vibes to learn what somebody loved about a
  film, the three options are genuinely distinct hypotheses about what they loved in it — never
  three creative names for one preference.
- **The title is the choice.** They can choose intuitively from the title alone. Picking a title
  confirms its underlying first-person *"I like…"* description, which stays inspectable and
  editable but need not be read in order to choose.
- **Only the chosen one exists.** The chosen hypothesis alone becomes a Vibe. The others are never
  created and never tracked.
- **No orphan likes.** A liked or loved is never left on a film in no Vibe, and never silently lost:
  anything they accept files the film and keeps the verdict.
- **In-the-moment capture.** What they said — that they watched it, that they liked it, and why — is
  captured in the turn they say it, from their words, in this conversation.
- **Partial overlap.** A film may belong to an existing Vibe's evening without that Vibe saying why
  they liked it. It is filed there and anchors the new Vibe, and both are said out loud.
- **Persisted confirmed Vibes are the source of truth.** What a recommendation reads is what was
  written on their yes, and nothing else.
- **Minimal tests, no speculative infrastructure.** Nothing records a suggestion, an offer or a
  decline.

This is core Tonight taste learning: the pick is how Tonight learns why a film worked for them.

## 2. The scenario, and the end state it must reach

*"I liked The Brothers Bloom because clever characters do smart things."* They have a Vibe,
**Champagne & Blueprints** (C&B), whose evening Bloom fits — glamorous capers — but which does not
say anything about clever characters.

Turn 1 records the liked (refused as `vibe_required` while Bloom is in no Vibe), finds that Bloom
belongs on C&B's evening, and makes **one** offer: Bloom also goes into C&B, and one of three
hypotheses becomes a new Vibe anchored on Bloom, **Masterminds & Misdirection** recommended. Turn 2
is their pick, by title. The end state:

| Root | State |
| --- | --- |
| Movie | The Brothers Bloom (2008), `seen-before` — `seen-now` only if they said recently |
| Vibe | the picked one: its name, its first-person sentence and its Genres **exactly as shown**, core Bloom |
| Genres | only the ones the picked option needed, each with the meaning shown; none for the others |
| Membership | Bloom in {picked Vibe, C&B}; C&B's name, sentence, Genres and core unchanged |
| Verdict | `liked`, `told: volunteered`, `because` = their clause (boundary-trimmed) |
| Anything else | nothing: no record of the offer, the options or the pick |

## 3. What exists today (reviewed)

Every write in §2 is already possible, and every guard it needs already holds.

| Capability | Where |
| --- | --- |
| A film in several Vibes; membership is identity only | `web/lib/taste/store/schema.ts:386-409`; `web/lib/mcp/server.ts:373-379` |
| The core is a member; `create_vibe` saves and files it in one transaction, unsaved as `seen-before` by default | `schema.ts:1248-1264`; `web/lib/taste/store/sql.ts:232-258`, `:1222-1244` (`:1235`), `:1258-1277` |
| A core cannot leave its Vibe; a liked or loved cannot leave its last Vibe | `server.ts:742-749`; `web/lib/mcp/verdicts.test.ts:919-947` |
| A liked or loved needs a Vibe; the refusal carries `retry.arguments` with their words and `told` | `server.ts:1062-1079`, `:1434-1451`; `sql.ts:666-674`; `verdicts.test.ts:825-907` |
| Their words kept unedited; `liked` unless their words carry `loved` | `skills/tonight-vibes/SKILL.md:157-160`; `server.ts:202-212`; trimmed at `web/lib/verdicts/model.ts:590` |
| Nothing written without a yes; no pending offer anywhere | `tonight-vibes/SKILL.md:16-21`; `server.ts:484-491` |
| A recommended Vibe and two alternatives, each a different reason, film as core | `tonight-vibes/SKILL.md:192-196` — only under "Otherwise" |
| Liking says they watched it; the when-question folds into the Vibe offer | `tonight-vibes/SKILL.md:198-203`; `skills/tonight-recommend/SKILL.md:362-365` |
| Matching a film to a Vibe is the model's judgement; tools interpret nothing | `server.ts:63-68` |
| Recommending from a core and a member, never naming a Vibe | `tonight-recommend/SKILL.md:139-157` |
| A Vibe's description is readable and changeable afterwards | `get_taste` (`server.ts:443-531`); `update_vibe` on their words (`server.ts:628-671`) |

## 4. Gaps and root causes

**Reviewed:**

- **G1 — either/or, not composed.** The `vibe_required` steps (`tonight-vibes/SKILL.md:185-196`)
  and the constant the refusal carries (`VIBE_REQUIRED_NEXT`, `server.ts:1412-1425`) branch:
  *a Vibe fits → file it there*; *none fits → three new ones*. "Fits" conflates **which evening the
  film belongs to** with **which Vibe says why it worked for them**. The composite is not
  instructed, and it conflicts with the local branching. It is not proven unreachable: one offer
  may hold several parts. On `recommend-only` the constant is the only guidance.
- **G2 — the rewording trap.** "A minimal change" (`SKILL.md:187-191`; `update_vibe`
  `server.ts:635-639`) lets an agent reword C&B to carry *"clever characters"* — stretching it and
  losing the distinct reason.
- **G3 — the kept path has no three options.** With Bloom already filed, the verdict is kept and
  `SKILL.md:221-222` allows one new Vibe and no alternatives. The budget (`:226-229`) grants the
  alternatives only to `vibe_required`.
- **G4 — alternatives when they gave a reason.** `SKILL.md:192-196`, `:206-207` frame the
  alternatives as learning *"the why they did not give"*. With a reason given, that invites
  invented reasons or a widened one.
- **G5 — the overlap is not part of the offer.** A yes covers only what was shown (`SKILL.md:251`),
  and nothing says to name C&B in the offer. *Writing what they agreed* (`:255-264`) covers
  *further films*, not a new core that also joins an existing Vibe, and `update_movie` replaces the
  whole list.
- **G6 — a fresh liked on a saved want-to-see film.** `server.ts:364-366` (*"a judgement already
  says they watched it, so there is nothing to write here as well"*) and `SKILL.md:56-62` were
  written for a **standing** verdict. A liked said *now* leaves the viewing at want-to-see, the core
  is refused (`sql.ts:1226`), and they are asked something they just told you.
- **G7 — tests prove presence, not behaviour.** Text pins only. No live scenario covers "fits the
  evening, not the reason".

**New:**

- **G8 — choosing by title meets two current rules, and needs one said out loud.**
  - *"A yes covers only the meaning they were shown"* (`SKILL.md:87-88`, `:251`; `create_genre`
    and `create_vibe`, `server.ts:544-545`, `:599-600`) is **not** in conflict: *shown* already
    means presented, never proven read. What is missing is saying that a description presented
    beside the title they pick is shown, so an agent does not ask them to confirm it again.
  - The keep flow's *"two or three names it could have instead"* (`SKILL.md:301-323`;
    `tonight-recommend/SKILL.md:397-399`) is exactly *"three creative names for one preference"*,
    and nothing keeps it out of a hypotheses offer.
  - *"Said in one breath, not laid out as a form"* (`SKILL.md:319`) works against three scannable
    titles.
- **G9 — nothing says the pick is written exactly as shown.** An agent may polish the sentence at
  write time, which writes a meaning nobody was shown.
- **G10 — first films.** `SKILL.md:343-347` offers each first Vibe with *"two meaningfully different
  alternatives beside it"* — the same learning moment, under different words.

## 5. Design

### 5.1 Where it belongs, and why — three questions, not a ladder (reviewed)

1. **Where it belongs.** Every Vibe whose evening it is, judged by its instruction and its Genres'
   instructions: propose filing it there, one Vibe or several.
2. **Whether that says why.** A minimal change to a Vibe's sentence only when the film is that same
   evening and the sentence does not yet cover **the film** — the exact words, on their yes. **Never
   to carry a reason that Vibe was not about**; that is a new Vibe beside it.
3. **A new Vibe for the why.** When their words carry a why none of their Vibes says, or nothing
   fits at all: three hypotheses (5.2), this film as core. **Beside 1, in the same one offer**, never
   instead of it.

A bare *"loved it"* on a filed film still considers existing Vibes only.

### 5.2 Three hypotheses (new, as a general rule)

Wherever Tonight proposes a Vibe to learn what they loved about a film — a liked or loved answered
`vibe_required`; a kept one whose words carry a why no Vibe says; a new user's first films:

- **Exactly three, one recommended.** Each is a different hypothesis about what they loved in
  **that** film, and each would lead to different films. **Never three names for one preference.**
  A test the agent can apply: for any two, a film fits one and not the other.
- **Grounded.** With a reason given, three readings of their words, none wider than them, none an
  exclusion they did not state. Without one, three different reasons the film may have worked.
- **Not an existing Vibe again.** None restates a Vibe they have.
- **Each has a name, a first-person *"I like…"* sentence that adds something its Genres do not say,
  its Genres — any new Genre's first-person meaning shown — and this film as core.**

The keep flow (*"save this one"*, a film they may not have seen) keeps its single proposal with
alternative names. **Alternative names never appear in a hypotheses offer.**

**First films** (`SKILL.md:333-353`) stay the one offer that may hold several Vibes. Each Vibe it
proposes is a **group** — the films it is drawn from, one of them its core — and each group is
offered as three hypotheses chosen by title, as above. **Per group, at most one is created.**

### 5.3 The offer: titles first (new)

- **The three titles lead, as a numbered list: each item starts with its title in bold, and the
  bold holds the title and nothing else.** The recommended one is item 1, marked *after* the bold
  (*"— my pick"*). A Genre name, a heading or a label is never bold at the start of a line in the
  offer. A title alone must make its hypothesis recognisable, and tell it apart from the other two.
  It is still evocative, never a Genre label (`SKILL.md:98-121`).
- Under each title, its one-line *"I like…"* and any new Genre's meaning — **shown, so it can be
  inspected; not something they must read to choose.**
- Around the list: where else it belongs (*"It also goes on your Champagne & Blueprints shelf"*),
  the when-question if one is owed, and, while it is refused, that the liked is not saved until
  they pick. One offer, short. *"Not laid out as a form"* stays the rule for the keep flow's single
  proposal.
- First films: one numbered list per group, under the films it is drawn from.

The shape is a presentation rule for the person choosing — a number and a title to answer with.
The evaluation reads the same shape (7.2), and scores *"three usable choices were presented"*
apart from whether the exact Markdown was followed.

### 5.4 Picking is the yes; write exactly what was shown (new)

- **Naming a title, its position, or a plain yes (the recommended one) accepts the offer with that
  hypothesis**, including the filing the offer said goes with it. It confirms that option's name,
  sentence and Genre meanings **as shown** — beside the title they picked counts as shown, whether
  or not they read it. Write it then and there; never ask again.
- **Written exactly as shown.** No rewording, tightening or "improving" at write time.
- **An edit is their idea** (*"the second one, but more about the plan"*): show the exact revised
  words and write on their yes to those words.
- **A partial answer writes the agreed part**: *"just the existing one"* files it in C&B and keeps
  the liked, with no Genre and no new Vibe; *"just the new one"* creates the picked Vibe and does not
  file it in C&B.
- **First films:** a pick names one title per group; a group they name no title for gets nothing; a
  plain yes accepts item 1 of every group.
- Afterwards the description is theirs like any other: readable in `get_taste` and on the site,
  changed with `update_vibe` on their words.

### 5.5 Partial overlap (reviewed)

The offer names the existing Vibe the film also belongs to and why the two differ (*"that one is
the glamour and the plan; this one is the people being clever"*). Written in either order: the new
Vibe with its core, then `update_movie` with **every** Vibe it is in now — the new one, the existing
one, any other agreed; or `create_movie` into the existing Vibe first, then `create_vibe`. The core
guard protects the new membership; nothing protects the C&B one from being omitted, so the list has
to carry it.

### 5.6 No orphan likes, no orphan Genres (new)

- The server already refuses a liked or loved on a film in no Vibe, and refuses to strand one
  (§3). The flow ends every accepted path with `record_verdict(retry.arguments)`, so a yes to any
  part — the existing Vibe alone included — keeps the liked.
- **A decline writes nothing further, and keeps everything already recorded.** On the
  `vibe_required` path no further write follows — a viewing 5.7 already captured for a saved,
  unfiled film stays — and they are told once that the liked is not kept (unchanged). On the kept path the liked, and a viewing captured by 5.7, stay: they were said, and
  the offer was only about a new Vibe. *"Not kept"* is said only of a liked that is still refused.
- **A Genre is created only for the option they picked**, after the pick. A Genre only an unpicked
  option needed is never written.

### 5.7 In-the-moment capture (new)

- **The verdict is attempted in the turn they say it**, in their words; `vibe_required` hands the
  same words forward in `retry.arguments`. Unchanged, now named.
- **A liked or loved said now is them saying they watched it.**
  - Unsaved film: saved `seen-before` with its filing (`core.viewing` or `create_movie`), `seen-now`
    if they placed it recently. The when-question is folded into the offer (unchanged).
  - **Saved as want-to-see: moved to `seen-now` or `seen-before` in the same turn** (`update_movie`,
    then say what was stored), by the same rule. This is G6's fix.
  - `dont-want-to-see` is not touched: two things they said disagree, and that is still one
    question (`SKILL.md:56-62`).
  - **A standing verdict from before is unchanged**: it does not move a want-to-see, and anchoring
    on it still asks once (M6 U4).

### 5.8 Nothing tracked; persisted Vibes are the truth (new)

- No record of an offer, the options, the pick or a decline — anywhere, in any root. The unpicked
  hypotheses exist only in the conversation, as offers they declined to pick.
- **A recommendation reads what was written.** An unpicked hypothesis is never used as their taste,
  later in the same conversation included.

### 5.9 The budget (new wording, both paths)

At most one offer per statement. **An offer may show three hypotheses, of which at most one is
created** — on the `vibe_required` path and on the kept path alike. The first-films offer is the one
offer that may hold several groups: three hypotheses per group, at most one created per group. A
declined offer is not made again in this conversation.

## 6. Changes, file by file

**`skills/tonight-vibes/SKILL.md`** — the bulk of the change:

- `:56-62` — what may be a core: a liked said now vs a standing one (5.7).
- `:87-88`, `:251` — *"shown"* includes shown under the title they picked (5.4).
- `:127-130` — the Vibe is the evening; `because` keeps why; a further Vibe may say it.
- `:177-208` — *When a liked or loved needs a Vibe*: the three questions (5.1), and a new subsection
  **Three hypotheses, chosen by title** (5.2-5.4), referenced from every place it applies.
- `:210-229` — the kept path's new-Vibe bullet and the budget (5.9).
- `:249-269` — *Writing what they agreed*: Genres only for the pick; the pick as shown; a core that
  also joins an existing Vibe; *Never written* gains *an option they did not pick, or a Genre only it
  needed*.
- `:271-284` — one worked row for the Bloom sentence.
- `:301-323` — one sentence: this proposal is the keep flow's; a Vibe learned from a liked is
  offered as three hypotheses.
- `:333-353` — first films: each group offered as three hypotheses chosen by title, at most one
  created per group; a plain yes takes item 1 of each.

**`skills/tonight-recommend/SKILL.md`**: `:58-60` (the why sentence), `:339-343` (the
`vibe_required` summary — keeps *"one recommendation and two meaningfully different
alternatives"*, pinned at `skills/tonight-recommend/test.sh:762`), `:362-365` (a liked said now
on a want-to-see film), and one clause at `:397-405` (the keep flow's proposal is not how a liked
film's Vibe is offered).

**`web/lib/mcp/server.ts`** — descriptions and one constant, no schema:

- `record_verdict` (`:1033-1038`): the why sentence, and the composite.
- `VIBE_REQUIRED_NEXT` (`:1412-1425`): 5.1 to 5.6 in one paragraph.
- `update_vibe` (`:635-639`): never to carry a reason the vibe was not about.
- `create_vibe` (`:599-600`, `:614-616`) and `create_genre` (`:544-545`): shown beside a picked
  title counts as shown; written as shown.
- `movieViewing` (`:364-366`) and `vibeCore` (`:401-403`): a liked or loved said now moves a
  want-to-see film to seen; a standing one does not.
- `SERVER_VERSION` unchanged: no tool schema changes.

**`chatgpt-plugin/.codex-plugin/plugin.json`**: `1.9.1` → `1.10.0`.

**Not touched:** schema, migrations, stores, tool input schemas, web routes and components,
README (its tool table does not paraphrase the constant).

## 7. Tests

### 7.1 Deterministic, in CI

- **Pins** (`skills/tonight-vibes/test.sh`, `skills/tonight-recommend/test.sh`,
  `web/lib/recommend-skill.test.ts`, `web/lib/mcp/tools.test.ts`, `web/lib/mcp/verdicts.test.ts`):
  - replace the step ladder (`vibes test.sh:256-267`), the kept-path new-Vibe pin (`:241-244`), the
    budget (`:287-289`) and first films (`:393-395`);
  - add one pin per rule in 5.1-5.9: beside not instead; never to carry a reason; three
    hypotheses, never three names; titles lead; picking is the yes; written as shown; Genres only
    for the pick; the overlap said; a liked said now; nothing tracked;
  - `verdicts.test.ts:852` (`/if one of their vibes fits/`) follows the new constant; the other
    four `next` pins keep their phrases.
- **One composition test** (`verdicts.test.ts`), green before any text changes, because it pins
  what already works: C&B (Heist + Glamour, core a loved film) → `record_verdict` Bloom liked with
  `because` → `vibe_required`, `movie: null` → one `create_genre` → `create_vibe` with core Bloom and
  no viewing → `update_movie` Bloom `vibes: [new, C&B]` → the retry is kept. Assert from
  `get_taste`:
  - the new Vibe's core is Bloom;
  - Bloom is in both Vibes, `seen-before`;
  - C&B's name, sentence, Genres and core are unchanged;
  - `because` is verbatim and `told` is `volunteered`;
  - `update_movie` Bloom `vibes: [C&B]` is refused, and `get_taste` is unchanged after it.
- **Evaluation integrity** (`web/lib/evaluation-m5.test.ts`, `web/lib/evaluation-lean.test.ts`): the
  new fixtures are shapes the product can hold; every scenario resolves; follow-up lists and title
  picks resolve; call counting and run names for several follow-ups.

### 7.2 Live behavioural, operator-run (M5 runner, lean budget)

**Runner extension (new, evaluation harness only)** — the smallest that makes these runs possible:

- **`then` may be a list** of follow-up turns, each resuming the same session, so a pick can be
  followed by a request in the same conversation. A string stays exactly as today, run names
  included (`__then-yes`); a list names each (`__then-a__then-b`). `callsPerRun` is one plus the
  number of follow-ups.
- **A follow-up may pick a title from the answer before it.** A request whose whole text is
  `{title:N}` is resolved against the immediately previous answer:
  - a title is a **numbered list item whose line starts with the number, then a bold span** —
    `^\s*N[.)]\s+\*\*([^*\n]+)\*\*` — and the title is that span, trimmed, and nothing after it (a
    recommended marker sits outside the bold, by 5.3);
  - it resolves only when **exactly one** such item is numbered N; none, or more than one (two
    lists in one answer), is ambiguous;
  - an ambiguous pick **fails the turn before any model call**, as *"no unambiguous title N to
    pick"*. The reviewer still scores whether three usable choices were presented (5.3);
  - what is sent is the title alone, as the user would say it.
- **Every continuation is held to what the second turn is held to today**: it resumes the first
  session and is failed if it answers in another (*"did not resume"*); a failed turn stops the
  turns after it; a quota or sign-in failure on any turn stops the invocation.
- **The artifact records every turn**: the request key, the message **as sent** (the resolved
  title included), the answer, and the turn's **transcript boundary** — which numbered Tonight
  calls it made — so a reviewer can tell which writes came before the pick.
- Helpers in `evaluation/lean.mjs` (pure, unit-tested: follow-ups, call counting, run names, title
  resolution); `m5/run.mjs` loops over the turns.

**Fixtures** (current vocabulary, seeded through today's tools):

- `m5-05-partial-fit`: Genres Heist (*"I like a plan, a crew, and watching the job come together."*)
  and Glamour (*"I like beautiful places and people dressed for them."*); Champagne & Blueprints
  (Heist + Glamour, *"Glamorous capers, where I get to enjoy the plan as much as the places."*),
  core Ocean's Eleven (2001), loved. A second Vibe whose evening Bloom is not, so that "where it
  belongs" is a real judgement. Bloom absent.
- `m5-06-bloom-saved`: the same, with Bloom saved **want-to-see** in C&B and no verdict — the kept
  path and in-the-moment capture together.

**Requests:** `bloom-clever` — the user's sentence verbatim. Follow-ups: `pick-title-one`
(`{title:1}`), `pick-title-two` (`{title:2}`), `existing-only` (*"Just the existing one — no new
one."*), `new-only` (*"Just the new one — leave it out of the other."*), `no` (existing), and
`like-bloom-tonight` (*"Something like The Brothers Bloom for tonight?"*) — a request that names
the film, so the picked hypothesis is the evidence it should reach for.

**Scenarios.** Pass criteria go in the rubric, with zero inadmissible outcomes throughout. **The
first-turn criteria (T1) are scored on turn 1 of every run that starts with `bloom-clever`**, read up
to that turn's transcript boundary, so no run exists only to look at the offer.

**T1, on fixture 05:**
- `record_verdict` is called with liked, volunteered and `because` verbatim, and answered
  `vibe_required`.
- **Zero taste writes.**
- One offer, in which C&B is named as also its evening and is unchanged: no new wording for it, and
  Bloom is not its core.
- **Three hypotheses as numbered bold titles**, the recommended one first and marked, grounded in
  their reason. No alternative names. Each has an *"I like…"* sentence, its Genres and Bloom as
  core.
- The when-question at most once.
- Never says the liked is saved.
- **Distinct:** the reviewer matches the three titles to their shuffled descriptions, and names for
  each pair a film that fits one and not the other.

**T1 on fixture 06** is the same, except:
- the liked is kept in turn 1;
- Bloom's viewing moves from want-to-see to **`seen-before`** in turn 1 — an opinion said now
  places no recent viewing;
- there is no line saying the liked is not saved.

| # | Fixture · turns | Sources | Pass, after T1 |
| --- | --- | --- | --- |
| H1 | 05 · `bloom-clever` → `pick-title-two` | both | only that option's Vibe is created, its name, sentence and Genre meanings **identical to turn 1**; 0-1 `create_genre`, none only an unpicked option needed; Bloom also filed in C&B; the retry kept; no second confirmation question; the unpicked titles appear in no write |
| H2 | 05 · `bloom-clever` → `existing-only` | plugin | Bloom filed in C&B, the liked kept; no Genre, no Vibe created |
| H3 | 05 · `bloom-clever` → `new-only` | plugin | the recommended Vibe created, the liked kept; no C&B membership |
| H4 | 05 · `bloom-clever` → `no` | plugin | nothing written — no movie, viewing, Genre, Vibe or verdict; said once that it is not kept |
| H5 | 06 · `bloom-clever` → `pick-title-one` → `like-bloom-tonight` | plugin | turn 2: the recommended Vibe is created with core Bloom (anchoring succeeds on the `seen-before` captured in turn 1), written as shown, and Bloom is still in C&B; turn 3: a recommendation that reflects the **picked** hypothesis in their words, names no Vibe or Genre, uses neither unpicked hypothesis as their taste, and writes no taste |
| F1 | `m5-02-empty` · `hi` → `three-films` (existing scenario) | plugin, scored here | the rubric gains: each proposed group is offered as three hypotheses in a numbered bold-title list; at most one per group is to be created; a plain yes would take item 1 of each; nothing is written without a yes |

H1 runs on `recommend-only` too, because the refusal's constant is the only guidance there.
H2-H5 are lifecycle and run on the plugin with both skills. One pass, `--runs 1`:

```bash
node skills/tonight-recommend/evaluation/m5/run.mjs --source recommend-only \
  --only m5-05-partial-fit --runs 1 --budget 2
node skills/tonight-recommend/evaluation/m5/run.mjs --source plugin-skills \
  --only m5-05-partial-fit,m5-06-bloom-saved,m5-02-empty__hi__then-three-films --runs 1 --budget 13
```

That is 2 model calls on `recommend-only`, and 2 + 2 + 2 + 2 + 3 + 2 = 13 on the plugin.

**Inadmissible outcome 3** (*"Their words rewritten, or a judgement escalated"*) covers a
hypothesis that states an exclusion or a generalisation their words did not carry.

### 7.3 Baselines

- **Deterministic:** the whole suite (`npm test`, `npm run typecheck`, `npm run lint`, the three
  `test.sh`) at `5231b1d`, before any change.
- **Live:** the commands in 7.2, at **commit A** of §9 — the harness, fixtures and composition test,
  committed before any instruction text changes. At commit A the two `SKILL.md` files and the whole
  MCP server (`web/lib/**` outside tests) are byte-identical to `5231b1d`, so the runner's guard
  (`m5/run.mjs:179-190`) passes, and the recording is a baseline of the unchanged instructions. Then
  the same commands again at the reviewed commit. This needs `web/.env.local`, a running server and
  the `claude` CLI, so it is the operator's run; this worktree has no `web/.env.local`. A baseline
  recorded later is still recorded at commit A, never at a later commit.

## 8. Out of scope, and rejected

- Any record of a suggestion, an offer, the unpicked options or a decline.
- A reason per membership (`schema.ts:386-388`; *being in a Vibe carries no opinion*).
- Deterministic Vibe matching or scoring; a merge tool; an atomic "file and anchor" tool — the
  sequence is not atomic, and every partial state is valid and reported.
- A `SERVER_VERSION` bump.
- The keep flow's own proposal; *going through their Vibes*; web routes.
- The M6 rubric's stale `seen` expectations (`m6/rubric.md:43-44`) — a separate one-line fix.

## 9. Order of work

1. Codex review of the _new_ additions (§1, G8-G10, 5.2-5.4, 5.6-5.9, 7.2's runner extension and
   matrix). Nothing below starts before READY.
2. Deterministic baseline at `5231b1d`.
3. **Commit A** (local): the composition test (green on the base), the fixtures, the requests,
   scenarios and rubric rows, and the runner extension with its tests. No instruction text and no
   server code changes.
4. **Live baseline at commit A** (operator, 7.3), before any instruction text is recorded against.
   If the operator runs it later, it is still run at commit A.
5. **Commit B** (local): the instruction text — both skills, the tool descriptions, the constant,
   `plugin.json` — and their pins.
6. Deterministic suite green; Codex code review; fixes until READY.
7. Live after-run (operator) at the reviewed commit, with the same commands.
8. Nothing pushed, merged or deployed.

## 10. Review log

- **Codex analysis review 1 — NOT READY.** Three blocking issues: the budget had to cover the kept
  path; the membership/reason distinction had to reach every authoritative sentence; the acceptance
  matrix needed explicit partial outcomes, both sources for the unfiled path, and a fixture for
  later turns. Corrections adopted: G1 restated as *not instructed* rather than *unreachable*;
  m5-01's `seen` is intentional legacy seeding; the runner checks three files against `HEAD`;
  `because` is trimmed.
- **Codex analysis review 2 — NOT READY.** The worked hypotheses strengthened their reason (an
  exclusion they never stated) and broke the first-person and adds-meaning contracts.
- **Codex analysis review 3 — READY.** With the revised examples:
  - **Masterminds & Misdirection** (Heist + Clever characters): *"I want the clever ones running a
    game on everybody, me included, and to see at the end how they did it."*
  - **Smartest Person in the Room** (Clever characters): *"I like one mind seeing further than
    everyone around it, and getting to watch it work."*
  - **Thinking on Their Feet** (Clever characters): *"I like watching clever people improvise when
    the plan breaks, and still make the smart move."*
  - The one new Genre, **Clever characters**: *"I like characters who are clever and do smart
    things."*
- **Additions review 1 — NOT READY** (the earlier READY stands). Codex agreed that a description
  shown beside the picked title keeps the confirmation contract honest, that numbered bold titles
  are a reasonable presentation, that 5.7 is consistent with M6 U2-U4, and that the runner extension
  is justified. Five blockers, each resolved:
  1. **First films versus the budget.** Resolved in 5.2, 5.4 and 5.9: three hypotheses per group,
     at most one created per group, and a plain yes takes item 1 of each. Verified on the existing
     `m5-02-empty__hi__then-three-films` scenario (F1).
  2. **A decline on the kept path.** Resolved in 5.6: a decline writes nothing further and keeps
     what was already recorded; *"not kept"* is said only of a liked that is still refused.
  3. **The title extractor.** Resolved in 5.3 and 7.2: numbered items with the title alone in bold,
     the marker outside it; exactly one item numbered N, or the turn fails before any model call;
     the message as sent and each turn's transcript boundary are recorded; every continuation keeps
     the resume check and the stops.
  4. **The matrix.** Resolved in 7.2:
     - fixture 06 expects `seen-before`;
     - the saved-film path continues through a pick (H5);
     - the third turn names the film (`like-bloom-tonight`);
     - H6 is merged into H5, and the first-turn criteria are scored inside the continuation runs —
       13 + 2 calls instead of 16.
  5. **The live baseline in the work order.** Resolved in 7.3 and §9: commit A carries the harness
     with instructions and server byte-identical to `5231b1d`; the baseline is recorded there,
     before commit B, and the exact commands carry `--runs 1`, the sources and `--only`.
- **Additions review 2 — READY.** No new blockers. One wording note, adopted in 5.6: on the
  `vibe_required` path a decline means no further write, and a viewing already captured for a
  saved, unfiled film stays.

## 11. Implementation

### Baseline at `5231b1d` (§9 step 2)

| Check | Result |
| --- | --- |
| `npm test` | 1351 tests, 1347 pass. The 4 failures are the known `lib/evaluation.test.ts` ones, which need the gitignored `results/` |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, the 2 known warnings |
| `skills/*/test.sh` | **not executed here**: this session cannot run shell scripts without an approval it does not have. Every `order_check` and whole-file `grep -c` check was replayed in Python instead: vibes 117 of 129, recommend 197 of 239, 0 failing. The remaining checks (`in_slice`, `sed`, `ls`) are for Codex's review run |

### Commit A — `fdb99b9` (§9 step 3)

- **The composition test** (`verdicts.test.ts`, *"a picked hypothesis anchors a new vibe…"*) is
  green on the unchanged base. That confirms the end state of §2 was always reachable with today's
  tools, and nothing in the server's behaviour changes.
- **Fixtures** `m5-05-partial-fit` and `m5-06-bloom-saved`; **requests** `bloom-clever`,
  `like-bloom-tonight`, `pick-title-one`, `pick-title-two`, `existing-only` and `new-only`; **five
  scenarios**; **rubric** rows and T1; **README** pass commands.
- **The runner**: `followUps`, `titleNumbered` and `resolveTurn` in `lean.mjs`; `run.mjs` loops
  over the turns with the resume check, the stop and the quota stop on each, and records what each
  turn sent and its transcript boundary.
- **The dry runs** list exactly the planned runs: 6 runs and 13 calls on `plugin-skills`, 1 run and
  2 calls on `recommend-only`.
- **The live baseline (§9 step 4) is not recorded**: this worktree has no `web/.env.local`. It is
  the operator's, at `fdb99b9`.

### Commit B (§9 step 5)

The instruction text of §6:

- `skills/tonight-vibes/SKILL.md`:
  - the three questions;
  - *Three hypotheses, chosen by title*;
  - the kept path and the budget;
  - writing as shown;
  - the worked row;
  - the keep flow's scope;
  - first films;
  - a liked said now.
- `skills/tonight-recommend/SKILL.md`: the why sentence, the `vibe_required` summary, a liked
  said now, the keep flow's scope, and an unpicked Vibe that is not their taste.
- `web/lib/mcp/server.ts`: `record_verdict`, `create_genre`, `create_vibe`, `update_vibe`,
  `movieViewing`, `vibeCore` and `VIBE_REQUIRED_NEXT`. No input schema changes, and
  `SERVER_VERSION` is unchanged.
- `plugin.json`: 1.10.0.
- Pins:
  - 21 new or replaced checks in `skills/tonight-vibes/test.sh` and 5 in
    `skills/tonight-recommend/test.sh`;
  - the `next` pins and the description pins in `verdicts.test.ts` and `tools.test.ts`.
- **Results:**
  - `npm test`: 1355 tests, 1351 pass, with the same 4 known failures.
  - typecheck clean; lint unchanged.

### Codex code review 1 — NOT READY

**Codex ran:**

- **The shell suites:** vibes 150/150, recommend 244/244, plugin 37/37.
- **Node:** 139 focused tests.
- **The runner:**
  - both dry runs;
  - in-memory checks of the turn loop for 1, 2 and 3 turns: transcript boundaries, title
    resolution, a failed pick stopping, the quota stop, and a resume mismatch;
  - compatibility of names, counts and selections across the 33 existing M5/M6 scenarios.

**It found** no runner blocker and no storage of unselected suggestions. Three instruction gaps,
each fixed:

1. **`VIBE_REQUIRED_NEXT` listed the write tools as alternatives.** On `recommend-only` that could
   create the new Vibe and retry the liked without filing the film in Champagne & Blueprints. It
   now gives the order:
   - the picked Genres only;
   - `create_vibe` with the film as core;
   - `update_movie` listing the Vibes it is in now — the new one included — plus every agreed
     existing one;
   - then the retry.

   It also says what to do when no new Vibe was picked. Pinned, including that the retry comes
   after the filing.
2. **`VIBE_REQUIRED_NEXT` lacked the hypothesis constraints** that `recommend-only` is scored on:
   - readings of their words, none wider and none ruling out more, when they gave a reason;
   - different reasons when they gave none;
   - any new Genre's meaning shown;
   - the recommended marker after the bold title.

   Added and pinned.
3. **First films had no boundary for an unpicked list.** A title now accepts its own list only; a
   list they pick nothing from gets nothing; a plain yes takes the recommended one, first in every
   list. Said in *Three hypotheses, chosen by title*, in its *Their pick is their yes* rule, and in
   *A new user's first films*. Pinned in all three places.

The fixes are in `760b4f9`. After them: 116 focused tests pass, typecheck is clean, lint is
unchanged, and the Python replay of both `test.sh` files shows no failures.

### Codex code review 2 — READY

All three blockers are resolved, and Codex found no new ones. It reran:

- the vibes shell suite: 150 passed;
- the recommend shell suite: 244 passed;
- the verdict tests: 38 passed.

### What is left, and whose

- **The live baseline:** the operator runs the 7.2 commands at `fdb99b9`.
- **The live after-run:** the operator runs the same commands at the reviewed commit.
- **The manual ChatGPT plugin pass:** the coordinator's, as for every deploy that changes
  instructions (`m5/README.md`).
- **Nothing is pushed, merged or deployed.**

## 12. DeepSeek as a second backend for the live evaluation — plan delta

Status: **new scope, approved by the user on 2026-10-27; under Codex review of this section only.**
Everything above stays READY and is not reopened.

**The ask:**

- Let the existing M5/M6 runner (`m5/run.mjs`) drive a DeepSeek model instead of `claude -p`.
- Run the five Vibe-hypothesis scenarios (H1-H5) with it, at the baseline `fdb99b9` and at `HEAD`.
- Report the actual transcripts, tool writes, rubric scores, model and version, and costs.

**The bounds:**

- The smallest adapter that works, reusing the harness, fixtures and rubric — no second
  framework.
- The Claude runner preserved.
- No product change.

### 12.1 What is there (inspected, nothing printed)

- **A DeepSeek key exists.** It is not in the environment (`DEEPSEEK_API_KEY` is unset). It is in
  opencode's credential store (`~/.local/share/opencode/auth.json`, entry `deepseek`, type `api`).
  - `GET /models` with it answers `deepseek-flash` and `deepseek-v4-pro`.
  - `GET /user/balance`: available, USD 25.23.
  - The key is never printed or written. A run receives it only as `DEEPSEEK_API_KEY` in the
    environment of the process that starts the runner.
- **No `web/.env.local` exists**, in this worktree or the hub checkout. The dev server and the
  seeder need `OAUTH_SIGNING_SECRET`; everything else is optional in development. A dev-only file
  is created in this worktree:
  - `PUBLIC_ORIGIN=http://localhost:3000`;
  - a freshly generated 48-byte secret;
  - no `DEV_DATABASE_DIR`, so the database is in memory.

  `web/.gitignore` ignores `.env*`, so it is never committed; the secret is never printed.
- **Ports** 3000 (server) and 3997 (proxy) are free.
- **The DeepSeek API, per its docs as of 2026-10-27:**
  - OpenAI-compatible `POST /chat/completions` with `tools`.
  - Both models call tools.
  - Thinking is on by default (`thinking: {type: "enabled"}`).
  - With `tools`, the whole assistant message — `content`, `reasoning_content`, `tool_calls` — has
    to be sent back in every later request, or the API answers 400.
  - Prices are per 1M tokens and halve off-peak. Peak is 01:00-04:00 and 06:00-10:00 UTC on
    weekdays.

    | Model | Input, cache hit (off-peak / peak) | Input, cache miss | Output |
    | --- | --- | --- | --- |
    | `deepseek-v4-pro` | $0.022 / $0.044 | $0.66 / $1.32 | $1.98 / $3.96 |
    | `deepseek-flash` | $0.003 / $0.006 | $0.15 / $0.30 | $0.60 / $1.20 |
- **Only the instruction files differ at runtime.** Between `fdb99b9` and `HEAD` the only runtime
  files that differ are the two `SKILL.md` files, `web/lib/mcp/server.ts` and `plugin.json`
  (`git diff --stat`, tests excluded).

### 12.2 Design

**`evaluation/deepseek.mjs` — the adapter, one export:**
`deepseekBackend({ key, model, base, fetch })` → `{ turn(said, configFile, resume, system) }`. It
is plain `fetch`, with no SDK and no new dependency.

- **It reads the per-run MCP config file the CLI reads** — the proxy URL and its
  `Authorization`. So it talks to the same proxy, and the proxy log, the transcript, the turn
  boundaries and the snapshots are produced exactly as for a Claude run.
- **Tools:** `tools/list` through the proxy, with the same request shape the seeder uses (stateless
  JSON-RPC, SSE answers). Each tool becomes an OpenAI function tool with its MCP `inputSchema` as
  `parameters` (`$schema` dropped). Tonight's tools only; there is nothing else to call.
- **The loop, per turn:**
  1. `POST {base}/chat/completions` with `{ model, messages, tools, thinking: { type: "enabled" } }`.
  2. Append `choices[0].message` whole, as the API requires.
  3. Run each `tool_call`, in order, as `tools/call` through the proxy. The tool message is the
     tool's text content; an `isError` result is prefixed `Error: `, so the model is told the way
     the CLI tells Claude.
  4. Repeat until a message has no tool calls; its `content` is the answer.

  At most 40 requests per turn, or the turn fails as `error_max_turns`, as the CLI names it.

**Completion and failure (review 1, blocker 2):**

- **Each request sends `max_tokens: 32768`, `reasoning_effort: "high"` and `thinking: { type:
  "enabled" }`.** These are explicit, and recorded, rather than left to the provider's defaults.
- **Each request has a 300-second timeout.**
- **A turn succeeds only on `finish_reason: "stop"`** with no tool calls. `"tool_calls"` runs the
  calls. Anything else fails the turn as `deepseek finish_reason <reason>`: `length` (truncated),
  `content_filter`, `insufficient_system_resource`, or a missing or unknown reason.
- **Tool calls:**
  - each keeps its `id` in the tool message (`tool_call_id`);
  - arguments that are not valid JSON are answered `Error: arguments are not valid JSON`, and
    never called;
  - a JSON-RPC error from the server is answered `Error: <its message>`;
  - an `isError` result's text — a refusal's whole payload, `vibe_required` included — is passed
    unchanged after `Error: `.

  The `Error: ` prefix is this adapter's convention. It has not been verified as identical to
  what the CLI shows Claude.
- **Transport failures fail the turn** (`deepseek …` or `mcp …`): `fetch` throwing, a timeout, an
  HTTP error, or a body that does not parse.
- **Usage counted before a failure is kept** and returned with it.
- **The key is redacted** from every failure and message the adapter produces — an error body that
  echoes it included — before anything leaves the adapter.
- **The runner awaits the turn (review 2, blocker 2).** Today it does not — `run.mjs:402` calls
  `turn()` synchronously, which only worked because the CLI turn is synchronous.
  - The turn loop moves into `lean.mjs` as `runTurns(requests, { turn, boundary })`. Each turn is
    resolved, its boundary read, the turn **awaited**, and the boundary read again; the next turn
    starts only after that.
  - `run.mjs` awaits `runTurns` inside the `try` whose `finally` stops the proxy, so cleanup waits
    for the last turn.
  - Tested with a delayed asynchronous backend that logs its tool call only after a delay: the
    recorded boundary includes it, and cleanup is observed only after the last turn.

**Accounting (review 1, blocker 3):**

- **Two units, named apart.** A *turn* is one user message and everything the agent does before it
  answers — the unit `--budget` and `callsPerRun` count, as today. An *API request* is one
  `/chat/completions` call; a turn makes one or more.
- **Every API request is recorded, in a sidecar** `usage/<run>.jsonl` in the result directory,
  key-free. Each line has:
  - the turn, its UTC start time and its duration;
  - `finish_reason`;
  - `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`, `completion_tokens`, and
    `completion_tokens_details.reasoning_tokens`.

  A request that failed after the API answered is recorded too.
- **The artifact header carries the totals:** turns, API requests, cache-hit input, cache-miss
  input and output.
- **Pricing stays outside the harness.** The report prices each request at its own UTC time: peak
  01:00-04:00 and 06:00-10:00 UTC on weekdays, everything else off-peak — including Chinese public
  holidays (none falls on 2026-10-27). Output is priced on `completion_tokens`, which already
  includes reasoning; `reasoning_tokens` is information, never added again.
- **The worst case** at the 40-request cap is 26 × 40 = 1,040 API requests. Expected: a handful a
  turn.
- **Sessions:** a conversation is kept in memory under a random session id. A resumed turn
  appends its user message to that conversation; an unknown id fails the turn as *"did not
  resume"*.
- **What a turn returns:** `{ answer, session, failure, model, fingerprint, usage }`.
  - `model` and `fingerprint` are the API's own `model` and `system_fingerprint`.
  - `usage` sums requests, cache-hit input, cache-miss input, output and reasoning tokens.
- **Failures** read `deepseek HTTP <status> — <message>`. `lean.mjs`'s stop list gains DeepSeek's
  two wordings that every later call would repeat: `Insufficient Balance` (402) and
  `Authentication Fails` (401). A 429 already stops.
- **The key** comes from the environment only, and is refused before anything is seeded when it
  is missing (a dry run excepted). It never reaches a log, an artifact or an error message.

**`m5/run.mjs`:**

- **`--backend claude|deepseek`, default `claude`.** Without it nothing changes: the same
  `claude -p` call, `--host`, default model `claude-sonnet-5`, `answeredBy`, result directory and
  artifact.
- **With `deepseek`:**
  - `--model` defaults to `deepseek-v4-pro`;
  - `claude --version` is not called;
  - `--host` is refused, because it has no meaning here;
  - the result directory gains `-deepseek-<model>`, so recordings never mix with Claude's;
  - the artifact records `backend`, `model_resolved` and `fingerprint` from the API, and `usage`;
    `cli_version: none (DeepSeek API)`; a host line that describes the loop.
- **`turn()` dispatches** to the adapter or to the CLI. The turn loop, title resolution,
  transcript boundaries and stops are unchanged.
- **`--against <commit>`** — how a baseline is recorded with today's harness. The runner does the
  swap itself, so it cannot be left half done (review 1, blocker 1):
  1. **Refuse unless the tracked tree is clean** (`git status --porcelain --untracked-files=no` is
     empty). So the harness is exactly `HEAD`, and the three instruction files carry no edit to
     lose.
  2. **Freeze both SHAs** (`git rev-parse`): the target and `HEAD`.
  3. **Install the restore before touching anything.** On `exit` — normal, `process.exit` or an
     uncaught error — and on `SIGINT` and `SIGTERM`, run `git restore --source <HEAD sha> -- <3
     files>`, synchronously, then exit with the signal's code. It is idempotent, so running twice
     is harmless.
  4. **Swap:** `git restore --source <target sha> -- <3 files>`. This touches the working tree only,
     never the index.
  5. **The guard compares the three files with the target sha**, not `HEAD`, as today's guard
     compares them with `HEAD`.
  6. **Wait until the server serves the expected catalog** (review 2, blocker 1 — see *The
     catalog check* below).
  7. **Record**, then restore.

  **The catalog check.** A digest that merely changed would prove nothing about which revision is
  being served. So the check compares against the *expected* catalog:
  - **Expected:** a fresh child `node` process imports the working-tree `server.ts` — which the
    guard has just proven equal to the target — and lists each registered tool's name and
    description. The digest is sha256 over the sorted (name, description) pairs. A child process,
    so no module cache from an earlier revision can answer.
  - **Served:** the same digest over the live `tools/list`, read through the server with a token
    minted the way the seeder mints one.
  - **The runner polls the served digest until it equals the expected one**, for up to 120
    seconds. On a timeout the invocation stops before anything is seeded — the restore still runs
    — and the message names both digests.
  - **When it runs:** before every DeepSeek invocation and every `--against` invocation, `HEAD`
    included. So a `HEAD` pass that starts while the server still serves the baseline waits for
    the restored catalog, and a stale or transient catalog is never accepted.
  - **Its limit:** a revision that differs only outside the tool descriptions is not told apart by
    the digest. The guard covers the files themselves.

  The artifact gains:
  - `target:` the target sha;
  - `harness:` the `HEAD` sha;
  - `tools_digest:` the digest of the descriptions the server served for that run. It is recorded
    on every run, so a baseline and an after-run show different digests, and runs of one pass the
    same.
- **Results are partitioned by harness.** With `--against`, the result directory is
  `…-<target>-harness-<HEAD>-deepseek-<model>`, so `--resume` never mixes recordings made by two
  versions of the adapter.
- **A DeepSeek run requires a committed harness:** it refuses while anything under
  `skills/tonight-recommend/evaluation/` differs from `HEAD`. The Claude path keeps today's
  guard, unchanged.

### 12.3 Tests (deterministic, no network)

- **`web/lib/evaluation-deepseek.test.ts`** drives the adapter against a stub `fetch` that plays
  both DeepSeek and the MCP proxy. It checks:
  - tools are mapped;
  - the tool loop runs calls in order and returns the final answer;
  - the whole assistant message, `reasoning_content` included, is sent back, across a resumed
    turn too;
  - `tool_call_id` is kept;
  - an `isError` result's payload passes unchanged after `Error: `;
  - a JSON-RPC error, and arguments that are not JSON, are answered as errors;
  - a resumed turn continues the conversation, and an unknown session fails;
  - each of `length`, `content_filter`, `insufficient_system_resource` and a missing finish reason
    fails the turn, with the usage before it kept;
  - a timeout and a transport failure fail the turn;
  - a 402 fails with a failure `stopsTheRun` accepts;
  - the request cap fails the turn;
  - per-request usage is recorded and summed;
  - `max_tokens`, `reasoning_effort` and `thinking` are sent;
  - **the key appears in no returned value, no usage record and no failure — an error body that
    echoes it included**.
- **Runner pins:**
  - the Claude path unchanged (the existing pins, plus `--backend` defaulting to `claude`);
  - `--host` refused with `deepseek`;
  - the `-deepseek-<model>` and `-harness-<sha>` suffixes;
  - the `--against` sequence: clean-tree refusal, both SHAs frozen, the restore installed before
    the swap, the server-reload wait, the guard and `target:` following the target, and
    `harness:` and `tools_digest:` recorded;
  - the boundary read after the awaited turn.
- **The swap and restore**, against a scratch git repository in a temp directory: a dirty file
  refuses; a swap is undone on exit and on a thrown error. It runs no server and makes no model
  call.
- **The catalog check:**
  - `waitForCatalog` against a stub reader: a stale catalog that then turns correct is waited
    out; one that never matches times out with both digests named; a transient read error is
    retried;
  - the child-process expected digest equals the digest of the in-process `tonightMcpServer`'s
    registered tools for the current `server.ts`.
- **`runTurns`** with a delayed asynchronous backend: boundaries are read after the awaited turn,
  a failed turn stops the rest, a pick is resolved before its call, and the returned promise
  settles only after the last turn.

### 12.4 The live runs (this session is the operator; the key is available)

1. Commit the adapter and its tests, so `harness:` names the code that ran. Write `web/.env.local`
   (12.1) and start `npm run dev`.
2. **Baseline:** both commands with `--backend deepseek --model deepseek-v4-pro --against fdb99b9
   --runs 1`:
   - `recommend-only --only m5-05-partial-fit --budget 2`;
   - `plugin-skills --only m5-05-partial-fit,m5-06-bloom-saved --budget 11`.

   The runner swaps the files, waits for the server, records, and restores (12.2).
3. **`HEAD`:** the same two commands, without `--against`.
4. **The report**, for each of the 2 × 6 runs:
   - the transcript (tool calls and their arguments) and the writes;
   - the answers;
   - a rubric score against T1 and the family rows, with the evidence cited;
   - the model and fingerprint;
   - tokens, and a cost from 12.1's prices at the run's UTC time.

   Codex is asked to check the scoring.

That is 13 model turns a pass and 26 in all — the five new scenarios only. The re-scored first-films
run (F1) is an existing scenario and is not part of this ask.

**One run per scenario per pass is a single-pass comparison.** It shows what this model did once
under each set of instructions. It is not a pass rate, and it does not prove an improvement. The
report says so.

### 12.6 Review log

- **Codex plan-delta review 1 — NOT READY.** It accepted the adapter's size, the use of the
  existing key through the process environment, the full-message replay, `deepseek-v4-pro` and
  the prices. Three blockers, resolved in 12.2-12.4:
  1. **The baseline swap was not safe.** The runner now does the swap itself: a clean tree is
     required, both SHAs are frozen, the restore is installed before the swap and runs on exit,
     error and signal, the server reload is awaited, a committed harness is required, and results
     are partitioned by harness.
  2. **Completion and failure were undefined.** Only `stop` is success; every other finish reason
     fails the turn; the limits and the timeout are explicit; tool-call ids, refusal payloads,
     JSON-RPC errors and bad arguments are handled; usage survives a failure; the key is redacted.
  3. **The accounting could not price a run.** Turns and API requests are named apart, every API
     request has its usage and UTC time in a sidecar, and the report prices each request at its
     own time, with output on `completion_tokens` only.

  Also adopted: `Error: ` described as the adapter's convention, a redaction test against an echoed
  key, and single-pass wording.
- **Codex plan-delta review 2 — NOT READY.** The completion, accounting and restore protections
  were accepted. Two blockers, resolved in 12.2-12.3:
  1. **A changed digest did not prove the requested revision was serving.** The check now compares
     the served catalog with the expected one, computed from the guarded `server.ts` in a fresh
     child process. It runs before every DeepSeek and every `--against` invocation, `HEAD`
     included, and is tested for stale and never-matching catalogs.
  2. **The runner did not await the turn.** It does now: the loop moves into `runTurns` and is
     awaited before every boundary read and before cleanup, tested with a delayed asynchronous
     backend.
- **Codex plan-delta review 3 — READY.** No blockers in the delta.

### 12.7 Implementation

**New files:**

- `evaluation/deepseek.mjs` — the adapter.
- `evaluation/revision.mjs` — the catalog digest, the expected catalog computed in a child process,
  `waitForCatalog`, and the guarded swap.
- `web/lib/evaluation-deepseek.test.ts` — 12 tests, no network.

**Changed:**

- `evaluation/lean.mjs` — `runTurns`, and the two DeepSeek stop words.
- `m5/run.mjs`:
  - `--backend`, `--against`;
  - the dispatching, awaited `turn`;
  - the catalog check;
  - the usage sidecar and the extra header lines.
- The M5 README.
- Three runner pins, moved to where the loop now lives (`evaluation-lean.test.ts`,
  `evaluation-m5.test.ts`).

**Kept as it was:**

- A Claude run's `const HOST = agentHost(…)`, its `host:` and `host_isolation:` lines, and its
  results directory name. A DeepSeek run replaces the host's line, isolation and suffix with its
  own.
- The M6 host pins, unchanged and passing.

**Checks:**

- **Dry runs:**
  - the Claude result directory is named exactly as before (`m5-plugin-skills-<digest>-<sha>`);
  - the DeepSeek one is `…-deepseek-deepseek-v4-pro`;
  - `--backend deepseek --host login` is refused.
- **typecheck** is clean.
- **lint** shows 0 errors and the two known warnings.

**Committed as `908b1f2`.** After the commit:

- `npm test`: 1367 tests, 1363 pass, with the 4 known failures.
- A real `--against fdb99b9` dry run left the tree clean.

### 12.8 Codex code review 1 — NOT READY

Codex reproduced each finding with stubs and found the Claude path unchanged. Four blockers, each
fixed with a regression test:

1. **A failed per-run catalog read bypassed cleanup**, leaving the bearer config and the proxy
   behind, and a mismatched catalog was rejected only after the turns. The read now happens in
   `checkedTurns` (`lean.mjs`), inside the `try` whose `finally` cleans up and before any turn. A
   catalog that is unreadable or not the expected one ends the run with no model call.
2. **An MCP HTTP failure could become a successful turn.** The proxy's own 502 (`{ error: "…could
   not reach Tonight" }`) was told to the model as a tool error. `mcp()` now accepts only a JSON-RPC
   answer — a result, or an error with a numeric code — and a non-2xx only when it carries one.
   Anything else fails the turn, `tools/list` included.
3. **The catalog timeout was not enforced on a hanging read.** Each read now races what is left of
   the deadline, with the timer cleared when the read wins; a match that arrives after the deadline
   is refused. Tested with a read that never answers and with a late match.
4. **Failed API attempts were missing from the accounting.** Every attempt is recorded now:
   `outcome` (`answered`, `http_error`, `transport_error` or `not_json`), `status`, `at`, `ms`, and
   `usage_reported`. Usage the API did not report is null, never zero. The artifact's usage line
   counts failed attempts and unreported usage.

After the fixes: the evaluation tests (47) pass, typecheck is clean, and lint is unchanged.

**Codex code review 2 — READY** (`cab2a0b`). Its extra stub checks: a failed catalog check makes
zero model calls, removes the bearer config and stops the proxy.

### 12.9 The live DeepSeek runs (2026-10-27, single pass)

**What ran:**

- Model `deepseek-v4-pro`, fingerprint `a307abda487cd1b463329ccb945ce396`, in every run.
- Harness `cab2a0b`, one run per scenario.
- Baseline `fdb99b9` (served catalog `c5521c63643dba7a`, as expected) against `HEAD` `cab2a0b`
  (served `282f74c4aa8033d7`, as expected).
- After every `--against` invocation the tree was clean again.
- The artifacts are in the four `…-deepseek-deepseek-v4-pro` result directories (gitignored).

**Scores.** These are Codex's checked scores, stricter than the first pass; B is the baseline, H is
`HEAD`.

| Run | B | H |
| --- | --- | --- |
| H1 recommend-only | FAIL: Champagne & Blueprints (C&B) only, reason folded into it; no hypotheses; pick not sent | FAIL: `create_movie` filed Bloom into C&B in turn 1 with no yes (inadmissible 1); no hypotheses; `vibe_required`, and so the new `next`, never exercised |
| H1 plugin (pick title 2) | FAIL: C&B only; pick not sent | Title selection, overlap and the verdict right. Sharp Company's name and sentence written as shown; Bloom in both Vibes; C&B unchanged. **Exact write FAIL:** the new Genre shown as *"characters whose…"* was written as *"I like characters whose…"* |
| H2 existing-only | T1 FAIL (three ideas, but unnumbered, with other names, C&B unnamed); turn 2 PASS | T1 **grounding FAIL** (*Trick Mirror*, unreliable narration, is not their reason); turn 2 PASS |
| H3 new-only | FAIL (turn 1 offered only C&B, so turn 2 asked again) | FAIL: turn 2 asked the when-question a second time instead of writing; nothing kept. T1 doubtful: *A Fine Art* generalises their reason |
| H4 no | T1 FAIL; turn 2 PASS (nothing written) | T1 FAIL, outcome 3 (*No Dumb Moves* states an exclusion they never gave); turn 2 PASS |
| H5 kept path, 3 turns | FAIL: viewing left `want-to-see`; one Vibe with other names; pick not sent | **FAIL on T1:** the viewing was not moved in turn 1 — it was moved in turn 2, before anchoring. The rest passed: three grounded hypotheses; the pick written exactly as shown; C&B kept; the recommendation from the picked hypothesis in their words, with no Vibe or Genre named and no taste write |

**Also shared:** in `HEAD` H1-H3, new Genre meanings were shown as definitions, not in the first
person the plan requires. The rubric's T1 does not yet repeat that requirement.

**Summary** (Codex's wording, adopted): *in this single sample, `HEAD` consistently produced
numbered title choices on `plugin-skills` and preserved the overlap in both completed new-Vibe
writes. Grounding, exact wording, immediate capture and new-only completion still failed.
Recommend-only introduced an unconfirmed taste write.* The baseline H2 already produced three
hypotheses once, so "fixes hypotheses" would overstate it.

**Cost:**

- 52 API requests, all off-peak (15:22-15:45 UTC), 0 failed, 0 without usage.
- Input: 1,828,096 cache-hit and 139,980 cache-miss tokens. Output: 112,029 tokens, reasoning
  included.
- **USD 0.354** at the docs' off-peak prices.
- The account balance went from USD 25.23 to 24.90 — USD 0.33. The two figures do not reconcile and
  are reported apart.

**What the runs point at.** These are instruction changes, and each is its own plan and review —
not done here:

1. **Recommend-only filed a liked film without a yes.** The keep flow's *"one genuinely fits → save
   it there, ask nothing further"* looks like the route. The skill should say that it is for a film
   they ask to keep, and that a liked goes to `record_verdict` first.
2. **A pick without an answer about when** has to write `seen-before`, never ask again.
3. **New Genre meanings are shown in the first person**, exactly as they will be written — and T1
   should say so.
4. **Hypotheses keep their reason's own subject.** No unreliable narration for *"clever
   characters"*, no competence at anything, no stated exclusion.
5. **A want-to-see film moves in the turn the liked is said**, before the offer.

### 12.10 The live runs on DeepSeek Flash (2026-10-27, single pass)

**What ran:**

- `--backend deepseek --model deepseek-flash` — the only Flash id the API lists, served by
  DeepSeek-V4.1-Flash-1017.
- `model_resolved` is `deepseek-flash` and the fingerprint is `bc19ba97cbe016479903222bb1578db6`,
  in every run.
- The harness is `fa30737` (evaluation code unchanged since `cab2a0b`); no code changes.
- The baseline `fdb99b9` was served catalog `c5521c63643dba7a` and `HEAD` `fa30737` was served
  `282f74c4aa8033d7`, each as expected.
- After every invocation the tree was clean again.
- Results are in the four `…-deepseek-deepseek-flash` directories (gitignored).

**Scores.** These apply the strict criteria of 12.9; they are this session's own, not
independently checked. B is the baseline, H is `HEAD`.

| Run | B | H |
| --- | --- | --- |
| H1 recommend-only | FAIL: `record_verdict` never called; a single new Vibe with other names; C&B declined as stretching; pick not sent | FAIL: `record_verdict` never called; one of the three options **is the existing C&B**; the number inside the bold (`**1. "…"**`); pick not sent |
| H1 plugin (pick title 2) | FAIL: offered to **reword C&B's sentence** (the G2 trap); no hypotheses; pick not sent | FAIL: C&B named and unchanged, the overlap said, three bold titles, *my pick* marked — but **not numbered**, so the pick was not sent and turn 2 is untested; new Genre meanings not in the first person; two options (*Clever Company*, *Fast Talkers*) barely distinct |
| H2 existing-only | T1 FAIL: no C&B (a shelf of its own); other names; unnumbered. Turn 2 PASS | T1 FAIL on numbering; C&B and overlap right; meanings in the first person; *The Beautiful Lie* borderline wider. Turn 2 PASS (filed in C&B, liked kept, nothing else) |
| H3 new-only | T1 FAIL (C&B only, reason folded in); turn 2 FAIL (a single new Vibe with other names, asked again, nothing written) | T1: numbered correctly, C&B and overlap right; meanings not in the first person; *Nothing Up My Sleeve* (the film fooling the viewer) wider than their reason. Turn 2 FAIL: asked which of the three, nothing written |
| H4 no | T1 FAIL (the reword offered again); turn 2 PASS | T1 FAIL: unnumbered; meanings not in the first person; *Everybody's Lying* and *The People Behind the Plan* wider than their reason. Turn 2 PASS |
| H5 kept path | FAIL: viewing left `want-to-see`; the reword offered; no hypotheses; pick not sent | T1: liked kept; **viewing moved to `seen-before` in turn 1 and said** (passes the in-the-moment capture `deepseek-v4-pro` missed); overlap and difference said. Unnumbered, so the pick was not sent and turns 2-3 are untested; a meaning not in the first person; *In Capable Hands* (competence at anything) wider. FAIL |

**What changed between B and H** — one pass each:

- The C&B rewording trap went from three runs to none.
- The film was named in C&B with the overlap said in 4/4 `HEAD` plugin runs (B: 2/5, through a
  folded reason or a reword).
- Three hypotheses with the recommended one marked: `HEAD` 4/4, B 1/5.
- In-the-moment capture on the kept path: `HEAD` passed, B failed.

**What still failed at `HEAD` on Flash:**

- The numbered list — 1 of 4, so no pick could be exercised.
- First-person Genre meanings — 3 of 4.
- Grounding — wider options in 3 runs.
- The "new only" completion.
- Recommend-only: no verdict attempted, and an existing Vibe offered as a hypothesis.

**Against the `deepseek-v4-pro` pass (12.9):**

- v4-pro numbered 5/5 and wrote two picks exactly as shown, but missed the in-the-moment capture.
- Flash got the capture right, and numbered almost never.
- On recommend-only: v4-pro filed without a yes; Flash never recorded the verdict at all.

**A note on the test itself.** `new-only` (*"Just the new one — leave it out of the other."*) does
not say which of three new options. The rubric assumes the recommended one; both models read it as
needing a choice — v4-pro took the recommended, then asked about when; Flash asked which. Keeping
H3 meaningful may need a prompt that names the pick.

**Cost:**

- 39 API requests, all off-peak (16:34-16:40 UTC), 0 failed, 0 without usage.
- Input: 1,177,600 cache-hit and 133,654 cache-miss tokens. Output: 43,582 tokens, reasoning
  included.
- **USD 0.0497** at the Flash off-peak prices ($0.003 / $0.15 / $0.60 per 1M).
- The balance went from USD 24.90 to 24.84 (USD 0.06, at cent precision).

## 13. Fixing what the live runs found (user decision, 2026-10-27)

**The order the user set:**

1. Fix the genuine behaviour the v4-pro and Flash runs exposed.
2. Codex reviews the changed implementation.
3. Only after READY, rerun the same scenarios on `deepseek-flash`, baseline against `HEAD`.

The scope is minimal, with no new framework, schema or API: instructions, tool descriptions,
`VIBE_REQUIRED_NEXT`, the evaluation's follow-up and title reading, the rubric, and pins.

| Found | Fixed in |
| --- | --- |
| Recommend-only filed a liked without a yes (v4-pro), or never recorded it (Flash) | `tonight-recommend`: call `record_verdict` in the turn they say it, before anything else — even for a film you can see is in no Vibe — and never file the film first to make the liked keepable; never file into a Vibe without a yes, even one that fits; the keep flow's no-question filing is for a film they ask to keep, never a liked. `record_verdict`'s description says the same where every host reads it |
| A pick without a when-answer asked about when again, and wrote nothing (v4-pro H3) | `tonight-vibes` *Their pick is their yes*, `tonight-recommend`'s viewing rule and `next`: a pick that does not say when is them not saying — `seen-before` with it, never asked again |
| A Genre meaning shown one way was written another (v4-pro H1), or shown as a definition (Flash) | `tonight-vibes` and `next`: each new Genre's meaning shown as the *"I like…"* sentence it will be written as, and written word for word; `create_genre`'s description says to show it as the first-person sentence it will be written as |
| Hypotheses wider than their reason, or stating a rule they never gave; an existing Vibe offered as one of three | `tonight-vibes` and `next`: each reading keeps the subject of their reason (a worked example that is not the scenario's: *"the dialogue was so sharp"*); no reading turns into a rule they never gave; where the film already belongs is said beside the three, never as one of them |
| A liked want-to-see film was asked about before it moved (v4-pro H5) | `tonight-vibes`, `tonight-recommend`, `record_verdict`'s description and `next`: write the move before you offer or ask anything, never asking about when first |

**The evaluation:**

- **`new-only` names its pick:** *"{title:1} — just that one, and leave it out of Champagne &
  Blueprints."* With three new options, *"just the new one"* did not say which; `{title:N}` is now
  resolved anywhere in a follow-up.
- **Formatting is not behaviour.** `titleNumbered` reads titles by number where they are numbered,
  and as the three line-leading bold titles, in order, where none is — the number inside the bold,
  and quotes, included.
- **The rubric** scores behaviour (eight T1 criteria, *After a pick*, *After a decline*) apart from
  presentation, which is recorded and never a behavioural FAIL alone. A turn never sent is UNTESTED.
- The table that T1 had split in two is whole again.

**Pins:** both `test.sh` files, `verdicts.test.ts` (`next` and `record_verdict`), `tools.test.ts`
(`create_genre`), `evaluation-lean.test.ts` (titles and placeholders), and `evaluation-m5.test.ts`
(the rubric's criteria and the `new-only` request). `plugin.json` is 1.10.1.

**Committed as `525e2a8`.** `npm test`: 1371 tests, 1367 pass, with the 4 known failures.

### 13.1 Codex code review 1 — NOT READY

**Codex ran** the shell suites (vibes 154/154, recommend 248/248, plugin 37/37) and 164 focused
tests. It found that the changes target the observed failures and that `next`'s length (559
words) is not a blocker. Three blockers, each fixed:

1. **The pick-without-timing default ignored timing already given** (*"I watched it last night
   and liked it"* → pick → must stay `seen-now`). Now `seen-before` applies only when nothing they
   said in the conversation placed it; timing they gave stands, and a seen viewing already stored
   is kept. Said in the vibes skill, the recommend viewing rule, `next` and the rubric.
2. **The relaxed extractor could manufacture a wrong pick.** It sent a bold Genre line under
   unbolded numbered titles, and unwrapped `'Til Dawn` into `Til Dawn`.
   - Where the answer numbers a list at all, only numbered bold titles choose; the unnumbered
     fallback applies only where nothing is numbered.
   - Only quotes that wrap the whole title come off.
   - Both have regression tests.
3. **An extraction failure still counted against the agent.** The rubric now says a pick the
   runner cannot resolve is the runner's limit: the turns after it are UNTESTED, and behaviour 4 is
   scored by the reviewer from the answer itself.

### 13.2 Codex code review 2 — READY (`566f562`)

No new blockers. Codex reran vibes 154/154, recommend 248/248, plugin 37/37 and 164 focused tests;
the original parser reproductions now pass.

### 13.3 The fresh Flash run after the fixes (2026-10-27, single pass)

**What ran:**

- `deepseek-flash`, fingerprint `bc19ba97cbe016479903222bb1578db6` in every run, harness
  `a095d37`, `--runs 1`.
- Baseline `fdb99b9` (served catalog `c5521c63643dba7a`) against `HEAD` `a095d37` (served
  `ffaaeb811785202c`), each as expected; the tree was clean after every invocation.
- Results are in the four `…-a095d37…-deepseek-deepseek-flash` directories.
- Scored by this session against the §13 rubric (B1-B8, *After a pick*, *After a decline*,
  presentation apart); not independently checked.

**Written as shown (criterion 3, mechanical).** All eight Genre meanings and Vibe sentences that
`HEAD` wrote appear word for word in the turn-1 offer.

| Run | B (`fdb99b9`) | H (`a095d37`) |
| --- | --- | --- |
| H1 recommend-only | `record_verdict` first ✓. Proposed new words for C&B (the G2 trap) ✗. No three hypotheses (B4 ✗); pick UNTESTED | `record_verdict` first ✓; no write before a yes ✓. Three numbered titles, first-person meanings ✓. **C&B offered as an alternative to the three, not beside them (B3 ✗)**. *The Job Done Well* (competence) is wider (B5 ✗). Pick *Fast Talk*: written word for word, `seen-before`, no second question, liked kept ✓ — filed in Fast Talk only, consistent with the offer |
| H1 plugin (pick title 2) | C&B only, reason folded in (B4 ✗); pick UNTESTED | B1-B4, B6-B8 ✓. *The Machine Closes* (logistics over people) wider (B5 ✗). Pick *Wit*: written word for word; Bloom in C&B and Wit; `seen-before`; no second question; liked kept ✓. The Vibe and its new Genre are both named *Wit* — a Genre said again (naming rule) |
| H2 existing-only | C&B only (B4 ✗); turn 2 ✓ | T1: B5 ✗ (*Frighteningly Good*); rest ✓ — the number inside the bold is presentation. Turn 2 ✓ (C&B only, `seen-before`, liked kept, nothing else) |
| H3 new-only (names its pick) | **Filed Bloom into C&B and kept the liked in turn 1 with no yes — outcome 1**; pick UNTESTED | T1: B5 ✗ (*Steady Hands*); rest ✓. Turn 2 (*Masterminds & Misdirection*, not C&B): written word for word, only its Genre, C&B left out as asked, `seen-before` said, no second question, liked kept ✓ |
| H4 no | C&B only (B4 ✗); turn 2 ✓ nothing written | T1: B5 ✗ (*Very Good At This*); rest ✓. Turn 2 ✓: nothing written, said once |
| H5 kept path | Liked kept, but the viewing was left `want-to-see` and asked about (✗); no hypotheses; pick UNTESTED | T1: liked kept; **viewing moved to `seen-before` in turn 1, before the offer** ✓; overlap said ✓; B5 ✗ (*Nothing to Prove*). Turn 2: written word for word, C&B kept ✓. Turn 3: **not assessable** — the recorded answer is only *"Four above — The Sting is where I'd start…"*, while `record_episode` offered four films, two of them in no recorded reply |

**What the fixes did, in this one pass:**

- **Fix 1 (verdict first, no filing without a yes):** held in all six `HEAD` runs. The baseline
  filed without a yes once.
- **Fix 2 (no second question about when):** held in all four completed picks.
- **Fix 3 (written as shown):** held for all eight strings, with first-person meanings in all six.
- **Fix 5 (want-to-see moved at once):** held.
- **The picks themselves:** every pick resolved on `HEAD`, so every follow-up was exercised. On the
  baseline, all three picks were UNTESTED because no turn 1 offered three choices.
- **Still failing — fix 4 (grounding):** in all six `HEAD` runs one of the three readings
  generalised *"clever characters do smart things"* into competence at anything, in spite of the
  new rule. Recommend-only also offered C&B *instead of* beside the three.

**A limit of the harness, not the agent.** The DeepSeek adapter records only a turn's final
assistant message. Text the model sends together with tool calls — here, very likely H5's actual
recommendation, written before `record_episode` — is not in the artifact. Until the adapter
records every assistant text of a turn, such a turn cannot be scored. That is a harness change for
its own review.

**Cost:**

- 64 API requests, all off-peak (17:06-17:13 UTC), 0 failed, 0 without usage.
- Input: 2,187,776 cache-hit and 78,294 cache-miss tokens. Output: 49,174 tokens.
- **USD 0.0478** at the Flash prices.
- Balance USD 24.84 → 24.78.

### 13.4 Grounding only, on `deepseek-v4-pro` (2026-10-27, single pass)

**Scope** (user-approved): whether the three hypotheses stay grounded in *"clever characters do
smart things"*. Six first turns — five plugin, one recommend-only — on `HEAD` `7ec5b9b`.

**What ran:**

- Instructions byte-identical to the reviewed `a095d37`: the instruction digests are 783e37b0 and
  524b2eb9, the same as §13.3, and the catalog is `ffaaeb811785202c` as expected.
- Fingerprint `a307abda487cd1b463329ccb945ce396`.
- The runner cannot stop after turn 1 without a code change, so the existing commands ran and only
  turn 1 is scored. The follow-ups ran too, as stated cost.

**Judgments** ("subject drift" means the reading moved from the characters to the plan):

| Run | The three hypotheses | Grounding |
| --- | --- | --- |
| recommend-only | *Sleight of Mind* (outsmart everyone) · *Sharp Company* (cleverness in how they talk) · *Battle of Wits* (clever characters outmanoeuvre each other) | **PASS** |
| existing-only | *Masterminds & Misdirection* (*"a scheme… the plan is cleverer than it looks… pieces clicking at the reveal"*) · *Sharp Tongues* · *Bright Company* | **FAIL, mild:** #1's subject drifts from the characters to the plan |
| new-only | *One Step Ahead* · *Silver Tongues* · *Clever Company* | **PASS** |
| no | *Masterminds & Misdirection* (clever characters running rings) · *Clever Company* · *Wit's End* (clever talk) | **PASS** |
| pick-title-two | *Masterminds & Misdirection* (its new Genre *Double-cross*: *"nobody at the table is telling the whole truth"* — deception as such, borderline) · *Quick Wits* · *The Right Moves* (sentence grounded; its new Genre *Competence*: *"I like watching people who are very good at what they do do it well"*) | **FAIL:** generic competence, carried in #3's Genre |
| kept (06) | *The Smartest Person in the Room* · *Sleight of Hand* (*"clever plans and neat tricks unfold, where the cleverness itself is the point"*) · *Two Steps Ahead* | **FAIL, mild:** #2's subject drifts to plans and tricks |

**Overall:**

- **3 PASS, 3 FAIL.**
- Generic competence: 1 of 6, and only in a Genre. Flash, under the same instructions, had it in
  6 of 6 (§13.3).
- Invented exclusions: 0 of 6.
- Drift from the characters to the plan: 2 of 6, both mild.

**Cost:**

- Turn 1 (scored): 18 API requests, USD 0.1721.
- Follow-ups (extra): 24 requests, USD 0.0552.
- In total, 42 requests and USD 0.2273, all off-peak, 0 failed. The balance went from USD 24.78 to
  24.59; that does not reconcile with the price estimate, as in §12.9.

## 14. A small change to grounding (user decision, 2026-10-27)

**What the runs showed:**

- Flash generalised the reason into competence in 6 of 6 offers (§13.3).
- v4-pro did it once, in a new Genre whose sentence was grounded, and twice let a reading slide
  from the people to the plan (§13.4).

**The change** is wording only, generic, and names nothing from the scenario:

- **`tonight-vibes`**, *Three hypotheses*: the three may read differently what they loved about the
  subject of their reason, never swap it for another. When the reason is about people — what they
  did, how they talked, who they were — every reading is about those people, never a plan or a
  trick on its own, and never being good at things in general.
- **`tonight-vibes`**, *Each is a whole Vibe*: a new Genre made for a reading is no broader than that
  reading's sentence; one that would hold films the reading would not is the reading widened by
  another route.
- **`VIBE_REQUIRED_NEXT`**: both, in one clause each, for recommend alone.
- **The rubric, B5**: grounding holds for any new Genre a hypothesis is built on.

**Not changed:** schema, API, tools, the runner, other rules. `plugin.json` is 1.10.2.

**Pins:**

- `verdicts.test.ts`: both clauses of `next`, and that `next` names nothing from the scenario.
- `tonight-vibes/test.sh`: both rules, and that the *Three hypotheses* section names nothing from the
  scenario.
- `evaluation-m5.test.ts`: the B5 Genre clause.

**Committed as `e5c67ac`.** `npm test`: 1371 tests, 1367 pass, with the 4 known failures.

### 14.1 Codex code review 1 — NOT READY

**Codex ran** vibes 157/157, recommend 248/248, plugin 37/37 and 164 focused tests, and found that
the pins catch the deletion of both rules. Two wording conflicts, each fixed:

1. **"No broader than that reading's sentence" contradicted Genres as reusable ingredients.**
   *"I like clever characters"* is a valid ingredient of a narrower reading, and an existing,
   broader Genre may already be reused. Now a new Genre made for a reading **stays inside their
   reason**: it may hold more films than the reading, as an ingredient does, but never a subject or
   a quality their words did not carry. Said in the skill, `next` and rubric B5.
2. **The ban on competence in general also refused it when somebody says it.** Now readings never
   bring in being good at things in general **unless their words said so** — in the skill and in
   `next`.

**Pins:**

- Both texts are pinned in the new wording.
- `verdicts.test.ts` refuses the old *"no broader than the reading's own sentence"* in `next`.
- `tonight-vibes/test.sh` refuses *"no broader than that reading"* in the skill.

### 14.2 Codex code review 2 — READY (`30ef225`)

Both blockers are resolved: the wording keeps Genres reusable and allows competence that was said.
No new blockers. Codex reran vibes 158/158, recommend 248/248, plugin 37/37 and 164 focused tests.
Stopped here by the user's instruction: no live run until the user decides.

### 12.5 Not in scope

- An SDK or a second framework.
- DeepSeek in `run-baseline.mjs` or `m3/run.mjs`.
- A price table in the harness.
- Automated scoring.
- Any change to fixtures, rubric criteria, the seeder, the proxy or product code.
