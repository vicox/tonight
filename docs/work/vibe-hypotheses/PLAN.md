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
