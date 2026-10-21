# M6 — plan

**Status:** draft **revision 2**, for Codex's re-review of its revision-1 NOT READY. Nothing is
implemented and nothing is committed. No implementation starts until Codex says READY on this plan.
**Written:** 2026-10-20; revision 2 on 2026-10-21. Branch `tonight-m6`
(`/Users/vicox/relay-work/worktrees/tonight-m6`).
**Base:** `origin/main` **`2cdc336`** (PR #4, *"Say what Tonight does: movies that get you"*). The
branch still sits at `06e07a7`. §7, step 0, fast-forwards it before any change.
**Scope source:** the user's discussions and the completed read-only analysis, as relayed by the
coordinator. M6 is four small corrections to how the shipped product behaves. It adds no feature.

---

## Review 1 — NOT READY (five findings), resolved here

Revision 2 replaces revision 1 in full. Each finding is closed where the table says.

| # | Finding (Codex) | Resolution | Where |
| --- | --- | --- | --- |
| 1 | Rebase onto `2cdc336`; keep the manifest copy from PR #4; bump to 1.3.0 for one combined upload | **Step 0** fast-forwards to `2cdc336` and re-verifies the projection and the plugin test. The manifest diff is the `version` line **only**. 1.3.0 is the single upload that carries both PR #4's copy and the M6 skills | §1, §7 |
| 2 | Pick an achievable occasion-date contract and align tests and rubric with it. Claim no continuity across midnight without data. Keep legacy identifiers readable and withdrawable | **The contract:** a new `not-tonight` takes **today's local date as the host gives it, at the moment it is recorded**. It binds on that date. **No continuity across midnight is claimed or tested.** Nothing validates the format, so legacy strings still record, read and withdraw, and tests pin that. The harness fixes one date `D` per run and uses it for seeding, for the host and for scoring | §2.1, §5.1, §5.2 |
| 3 | Separate Vibe membership and a raw `unseen` from standing judgements and `effectivelySeen`. No silent viewing change to get past the raw-`unseen` guard. Add the contradiction case | **A table of terms** (§2.2). The guard reads the **raw** `viewing` only. Membership and `viewing` are never taste evidence; standing judgements are. **A viewing is written only from what they said in this conversation**, and never to clear a refusal. The contradiction case (raw `unseen` with a standing `liked`) is defined, and has a store/MCP test and a two-turn scenario | §2.2, §5 |
| 4 | The refusal gate must require the right write, not just the absence of a wrong one. Use explicit *not interested* wording and an unambiguous film. No widening questions | **Required outcomes** per family: exactly one `record_verdict` with the right film, reach, `told`, occasion and words. Every prompt names the film **with its year**. The explicit families must pass **every** run. An unsolicited widening question is an **inadmissible** outcome | §5.2 |
| 5 | An M5 regression gate on the final instructions. The moodless rule applies only when taste was read. The empty-model and failed-read cases are unchanged. Assert a surprise lead and no Vibe dump | **The M5 set reruns on the final instructions** on all three sources, at zero of M5's ten outcomes, alongside Phase 1 and M3. D4 holds **only when `get_taste` succeeded and the model is not empty**; the empty-model and failure text is pinned byte-identical. `m6-05` **requires** a lead framed as a pick and forbids a Vibe dump | §2.3, §5, §6.2 |

---

## 0. Scope

| # | Problem | Change | Lands in |
| --- | --- | --- | --- |
| 1 | *The Nice Guys* keeps coming back | *"Not interested"* and *"stop suggesting it"* become the existing `not-ever`. A new `not-tonight` is named by today's date and binds on that date. A refused film is not offered again within the refusal's reach, and they are never asked to make it reach further | the skills; the `record_verdict`, `verdictOccasion` and `get_taste` descriptions. **No code** |
| 2 | Unseen films in Vibes | Allowed as candidates; never taste evidence; never a core. The store refuses a core whose raw `viewing` is `unseen`. A viewing is never changed to get past that. An existing-data check runs before deploy | the store (two checks), two tool descriptions, the skills |
| 3 | 50 Vibes and no mood | Applies only when taste was read and the model is not empty. Answer, don't interview (certified, Phase 1 R1). Lead with a pick framed as a surprise, then one short optional mood question. Never claim a mood; never list their Vibes | `tonight-recommend` (projected) |
| 4 | Is a skill extraction warranted? | **No** (§2.4) | nothing |

**Still binding from M5.**
- No new table, tool, root, schema version, runtime or service layer.
- The skills stay two, and the projection stays `tonight-recommend`'s alone, at most 8,000
  characters.
- No recommendation engine and no new model.
- M5's own gates stay open (§6.3).

---

## 1. What the repository says, at `2cdc336`

- **What PR #4 changed:** `README.md`; `web/app/layout.tsx`, `page.tsx` and
  `components/site-header.tsx`; and the manifest's `shortDescription` (*"Movies That Get You."*) and
  `longDescription`.
- **What PR #4 did not change:** no skill, no store, no MCP file and no projection. So everything
  below holds at both `06e07a7` and `2cdc336`.
- **The manifest version is still `1.2.0`.** ChatGPT rejects an upload whose version has not
  changed, so PR #4's copy is not live in the plugin yet.
- **What `chatgpt-plugin/test.sh` pins in the manifest:** only that the version is semver (49–50)
  and that the packaged manifest is byte-identical to the source (94).
- **Refusals exist.** `web/lib/verdicts/model.ts` has `not-tonight`, which must carry an occasion, and
  `not-ever`, which is global. Neither implies watching (`web/lib/seen.ts`). `disliked` is a
  judgement, and implies they watched the film.
- **The reach argument has no wording map.** `record_verdict`'s `reach` (`server.ts` 857–862) says
  only *"one evening … for good"*.
- **Occasions have no convention.** `verdictOccasion` (`server.ts` 158–165) says *"any stable
  identifier"*, and one description serves `record_verdict`, `withdraw_verdict` and `get_verdicts`.
  - The M3 fixture `m3-01-long-history` already uses `evening-tuesday`.
  - The model keeps occasions opaque on purpose (`model.ts` 89–95).
- **The projection licenses the repeat.** It says *"a film you recommended can come back"*
  (pinned, `test.sh` 645), and states no refusal rule of its own; only `get_taste`'s description
  carries one.
- **Raw viewing, not seen-ness.** `holdCore` (`sql.ts` 956) holds the film `FOR UPDATE` through
  `lockMovies`, which returns its raw `viewing`, before it locks the Vibe. `updateMovie` already asks
  `anchoredBy` while the film is held. The store never reads verdicts, so it cannot compute
  `effectivelySeen`.
- **The core rule is stated but not enforced.** The `vibeCore` description and `tonight-vibes`
  *What may be a core* both say: never a film they said they have not seen. Nothing refuses one.
  No repo fixture has an `unseen` core (checked).
- **Unseen films may already lead.** The projection says *"`unseen` does not [rule it out], so it
  stays"*. M6 must not contradict *"Never look in Tonight for films to recommend"*.
- **Answer, don't interview** (Phase 1, R1) is pinned by `instructions.test.ts` 1422. R1 found
  that permission to ask a question was read as permission to ask *instead of* answering.
- **The projection is at 7,930 / 8,000**, version `a22a09f4`: 70 characters of headroom.
- **`docs/instruction-ownership.md`** places a rule by who owns the decision, never by how much
  room is left.

---

## 2. The changes

### 2.1 Refusals: The Nice Guys

**Routing.** These rows are the scenarios and the worked cases.

| They say | Written | Never |
| --- | --- | --- |
| *"I'm not interested in The Nice Guys."* · *"Stop suggesting it."* · *"Don't recommend that again."* | `not-ever`, `volunteered`, no occasion; `reason` only in their words, where they gave one | `disliked`; a viewing; `create_movie`; recording nothing |
| *"Not tonight."* · *"Not in the mood for it tonight."* · *"Too long for tonight."* | `not-tonight`, occasion = **today's date** (below), `reason` in their words | `not-ever`; any Vibe talk |
| *"Nah, not that one."* (no reach stated) | `not-tonight`: **never stronger than they said** | `not-ever`; asking how far they meant |
| *"I've seen it."* / *"I didn't like it."* | unchanged: a viewing / `disliked` | here only for the contrast |

**The occasion contract**, chosen to be achievable:

- **Writing.** A new `not-tonight` takes **today's local date as the host gives the model, at the
  moment it is recorded**, written `YYYY-MM-DD`. ChatGPT gives the model the date; the evaluation
  host is made to (§5.2). The server does not know the user's timezone, so it never supplies one.
- **Reading.** A standing `not-tonight` binds a recommendation when its occasion **equals today's
  date**. Every other occasion — another date, or a legacy string — names an evening that is not
  today, and binds nothing.
- **What is claimed:** two conversations on the same date agree.
- **What is not claimed:** that an evening continues past midnight. After midnight the date
  differs, so a new conversation sees no binding refusal. That is **not claimed, not designed
  around and not tested**: nothing records when an evening began. In a conversation that has
  already heard a refusal, the conversation itself still holds it, which is ordinary context and
  not this contract.
- **Legacy identifiers stay first-class.** Nothing validates the format, in the model, the zod
  schema or the store.
  - `withdraw_verdict` and `get_verdicts` take an occasion **exactly as it was recorded**, as read
    from `get_taste` or `get_verdicts`. That is today's date for a refusal from today, and the old
    string for a legacy one.
  - The shared `verdictOccasion` description says both: *"a new not-tonight: today's date; to read
    or withdraw one, the occasion as recorded"*. It must never tell withdraw to use today's date.
- **No migration.** Verdict history is never rewritten.

**No repeat, and nothing intrusive.** Within a refusal's reach — every evening for `not-ever`, its
date for `not-tonight` — the film is not offered again, as the lead or as a direction, and the
refusal is not brought up. They are never asked to widen it:
- *"for good, or just tonight?"* after clear words;
- *"should I stop suggesting it?"*;
- *"is it films like this?"*;
- *"why?"*.

Outside its reach a `not-tonight` film stands where it stood. A film merely offered before can still
come back, because history is not taste (unchanged).

**Surfaces.** Each rule has one home (`docs/instruction-ownership.md`).

| Rule | Home |
| --- | --- |
| Which reach their words give; never `disliked`; never ask to widen | `record_verdict`: its description and the `reach` argument |
| A new occasion is today's date; reading or withdrawing passes the occasion as recorded | `verdictOccasion` |
| A `not-tonight` binds when its occasion is today's date | `get_taste` description, where `occasion` is already explained |
| A recommended film can come back **unless a refusal reaches today**; a refused film is not re-offered or mentioned | `tonight-recommend`: projected clause **D2**; the full text carries the rest |
| A refusal is a verdict, *"stop suggesting it"* included | `tonight-recommend`: the cross-layer cue **D1** in the projected verdict bullet |
| The worked rows | `tonight-recommend` full text. In `tonight-vibes` *How it sounds*: the `not-tonight` row gains today's date, and one row is added for *stop suggesting it* |

### 2.2 Unseen films, Vibe membership and cores

**Terms.** These are kept apart everywhere below.

| Term | What it is | Root | Taste evidence? |
| --- | --- | --- | --- |
| **raw `viewing`** | what they said about watching: `seen`, `unseen` or `null` (nobody said) | taste (Movie) | **never** |
| **membership** | a film they agreed belongs to that kind of evening | taste (Vibe) | **never** |
| **standing judgement** | a `liked`, `loved` or `disliked` that currently stands | verdicts | **yes**: the only taste evidence about a film |
| **`effectivelySeen`** | raw `seen`, **or** any standing judgement (`seen.ts`) | the join | no: it decides only whether a film is **new to them** |

**Reading rules** (recommending):
- A film's membership and its raw `viewing` say nothing about whether they like it. Only a standing
  judgement does.
- A film **new to them** (not `effectivelySeen`) that sits in a matching Vibe is a candidate and
  may lead, as `unseen` always could. Tonight is still not the shortlist.
- In the contradiction case, the standing `liked` is evidence. The film is `effectivelySeen`, so it
  is never offered or called new or unseen (unchanged AC4).

**The store guard reads the raw `viewing` only.** Within the taste root, nothing else is checkable.

1. **`holdCore`** (covers `create_vibe` and `update_vibe(core)`): when the held film's raw
   `viewing` is `unseen`, refuse with a new named error, `coreUnseen`, in `web/lib/taste/model.ts`.
   The whole call is one transaction, so nothing is written. The message is conditional on their
   word: *"cannot make Heat (1995) a core: its saved viewing says they have not seen it. If they
   tell you they have, record that with update_movie, then try again."*
2. **`updateMovie`**: when `changes.viewing === "unseen"` and the stored viewing is not already
   `unseen`, ask `anchoredBy` (the film is held) and refuse, naming the Vibes. This extends
   `movieAnchorsVibe` with a third verb. The website's `PATCH /api/movies` uses the same path, and
   `manage.tsx` shows the store's sentence.

**Accepted by the store:**
- raw `seen`;
- raw `null`;
- an unsaved core (saved with `null` viewing, as in M5);
- clearing a core's viewing to `null`;
- writes that leave a legacy `unseen` core alone (retitle, rename): existing violations are not
  made worse, and they block nothing unrelated;
- a core with a standing `disliked` or `not-ever`: that needs another root, so it stays a skill
  rule.

**No silent viewing change.** A viewing is written only when **they said it in this conversation**
(the existing `update_movie` rule, *"say a viewing only when they said it"*). It is never written
to get past `coreUnseen`, and a standing judgement does not license it.
- Stated in `tonight-vibes` *What may be a core*, in `vibeCore`, and in the refusal sentence.
- A semantic inadmissible outcome (§5.2, 7).

**The contradiction case: raw `unseen` plus a standing `liked`.**
- **For recommending**, it is evidence, and `effectivelySeen` (above).
- **As a core**, the store refuses: it sees only the raw `unseen`.
- **The agent** says so and may ask **one light question** (*"you'd marked it unseen but said you
  liked it — have you seen it?"*).
  - On a **yes**: `update_movie(viewing: seen)`, then `update_vibe(core)`.
  - On a **no**, or no answer: nothing is written.
- **Never** `update_movie(viewing: seen)` on the strength of the `liked` alone.

**Races.** Both checks read under the film's `FOR UPDATE`, which every core write takes first (M5
D1, deviation 1). A competing `updateMovie(viewing: unseen)` and `updateVibe(core: same film)`
therefore serialise on the film row (§5.1).

**No schema change.** A CHECK cannot span the two tables, and a trigger is out of proportion when
the store is the only writer.

**Instruction text:**
- `vibeCore`: *"Refused when the saved film's viewing is `unseen`; a liked or loved does not
  override it, and a viewing is changed only on their word. No viewing (null) is accepted."*
- `update_movie`: *"… nor marked unseen while it is a core."*
- `tonight-recommend`:
  - **D3**, projected, appended to the pinned *"A Movie carries no opinion: `viewing` is a fact
    about watching"*: *", and filing one in a Vibe is no opinion either"*. The candidate half is
    already projected (*"`unseen` does not, so it stays"*).
  - The full text carries the table's reading rules.
- `tonight-vibes` (plugin-only):
  - *What may be a core* gains the guard, the `null` nuance, the no-bypass rule and the
    contradiction case.
  - *Going through their Vibes*, item 1, gains: *"a core whose viewing reads `unseen` is anchored
    again, like one with no core."*

**Existing data (§7).** In the repo: an integrity test that no evaluation fixture has an `unseen`
core. In production: one read-only count before deploy.

### 2.3 Many Vibes, no mood

**Precondition.** `get_taste` **succeeded** and the model **is not empty**. Two cases are unchanged
and pinned byte-identical:
- **Empty model:** the answer plus *"two or three films you love?"*, or that question alone.
- **Failed read:** a taste question stops; an ordinary request discloses in its first sentence and
  claims nothing about them, so there is no *"a surprise from your Vibes"*.

**Rule.** With taste read and no mood given, however many Vibes they have:
- Answer in the usual shape.
- The evening's idea is **a pick from what they wrote, framed as a surprise** (*"No mood given, so a
  surprise: …"*).
- Never presented as their mood: no *"you seem to be in the mood for"*, *"since you feel like X"*.
- The one closing question **may** be a short, optional mood question (*"Or give me a mood and I'll
  aim closer."*). Never a question instead of the answer.
- **No Vibe dump.** Their Vibes are never listed, summarised or counted. A Vibe is named only as
  the reason for a film offered, at most one per film.

**Surfaces.** `tonight-recommend` only, because this is recommending.
- **D4**, projected, placed **inside** the existing *"in the answer if needed, **never instead**"*
  sentence, so it cannot become R1's licence to interview, and carrying its precondition.
- The full text adds the reason. No tool and no `tonight-vibes` change.

### 2.4 No skill extraction

Evaluated: **not warranted**. The read-only analysis agrees.
- **Every M6 rule has an existing owner:**
  - refusal reach and the occasion: `record_verdict` and `verdictOccasion`;
  - the reading rules: recommending, `tonight-recommend`;
  - the core precondition: the store and `vibeCore`;
  - core semantics: `tonight-vibes`.
- **No new concern** has its own trigger or vocabulary.
- **The project host has one projection,** so an extracted recommending rule could not reach it.
- **About ten sentences** do not dilute `tonight-recommend`'s selection.

**Not done:** no new skill, no text moved between skills, no taste or model decomposition, no
"recently offered" logic, and no episode read while recommending. The post-M5 audit stays separate.

---

## 3. Projection budget

The projected deltas are skill-owned. They fit **by rewording**, never by moving a skill rule into
a tool description.

| Delta | Where in the projection | Estimate |
| --- | --- | --- |
| D1 | verdict bullet: *however put — "stop suggesting it" too — that is a verdict* | +30 |
| D2 | *a film you recommended can come back, unless a refusal reaches today* | +35 |
| D3 | *… a fact about watching, and filing one in a Vibe is no opinion either* | +45 |
| D4 | inside the one-question sentence: *taste read, no mood given: lead with a surprise pick, never called their mood; the question may ask it* | +100 |

That is about 210 characters against 70 of headroom, so about 140 must be saved by rewording.

**Method:**
- List every reworded passage and every pin touched, each with its reason.
- Report `PROJECT_INSTRUCTIONS_LENGTH` and the new version.

**Stop condition:** if the four deltas do not fit without dropping a rule that is still true, the
implementer stops and returns the numbers to Codex and the coordinator. Nothing is cut or moved
unilaterally.

---

## 4. Files, expected

- **Store:** `web/lib/taste/store/sql.ts` (`holdCore`, `updateMovie`) and `web/lib/taste/model.ts`
  (`coreUnseen`; the third verb for `movieAnchorsVibe`).
- **`web/lib/mcp/server.ts`, descriptions only:** `verdictOccasion`, `record_verdict` and `reach`,
  `get_taste` (the `occasion` clause), `vibeCore`, `update_movie`. Tools stay at 20, and
  `SERVER_VERSION` does not change: a refusal is not a surface change, as in M5.
- **Skills and projection:** `skills/tonight-recommend/SKILL.md`, `skills/tonight-vibes/SKILL.md`,
  then `web/lib/generated/project-instructions.ts` via `npm run sync:instructions`.
- **`chatgpt-plugin/.codex-plugin/plugin.json`:** `"version": "1.2.0"` → `"1.3.0"`, **and nothing
  else**. PR #4's `shortDescription` and `longDescription` stay byte-for-byte.
- **Docs:** `README.md`, one invariant line: *"a core is never a film whose saved viewing says
  unseen"*. Tests and harness are in §5.

---

## 5. Tests

### 5.1 Deterministic: the implementer runs and reports every one

| Suite | New or changed |
| --- | --- |
| `web/lib/taste/store.test.ts` | **Refused:** `create_vibe` with a saved raw-`unseen` film as core, with nothing written; `update_vibe(core)` to one, with the old core standing; `update_movie(viewing: unseen)` on a core, naming the Vibes. **Allowed:** a core with raw `null` or `seen`; an unsaved core; `unseen` on a non-core member; `viewing: null` on a core; a retitle of a legacy `unseen` core (set up by SQL inside the test) |
| `web/lib/taste/store/concurrency.test.ts` | One race: `updateMovie(viewing: unseen)` against `updateVibe(core: same film)`. Afterwards the film is either a core and not raw `unseen`, or raw `unseen` and no core. Run against **real PostgreSQL**: it must execute and pass, never be skipped |
| `web/lib/mcp/tools.test.ts` | Both refusals through the tools. **The contradiction:** `record_verdict(liked)` plus a raw-`unseen` saved film, then `create_vibe(core)` is refused; `get_taste` still shows both raw facts; the refusal sentence makes the viewing change conditional on their word. **Legacy occasions:** `record_verdict`, `get_verdicts` and `withdraw_verdict` all take `evening-tuesday`, and withdrawing it removes exactly that evening's refusal. **Description pins:** `reach` maps *not interested / stop suggesting* to `not-ever` and says never `disliked` and never ask to widen; `verdictOccasion` says today's date for a new one and *as recorded* for read and withdraw; `get_taste` says a `not-tonight` binds on today's date; `vibeCore` states the guard, the no-override and the no-bypass rule. The leak test is unchanged |
| `web/lib/web/routes.test.ts` | `PATCH /api/movies` with `viewing: unseen` on a core → 4xx carrying the store's sentence |
| `web/lib/instructions.test.ts` | D1–D4 pinned in the projection. D4 sits **inside** the *never instead* sentence (an order check) and carries its precondition words. **Byte-identical with `a22a09f4`:** the empty-model clause, both `get_taste`-failure clauses and the shape paragraph. `CAP` ≤ 8,000, with length and version reported. R1's test passes **unchanged** |
| `skills/tonight-recommend/test.sh` | Full-text pins for the four rules and the terms. `order_check 'a film you recommended can come back'` stays, and the new clause follows it |
| `skills/tonight-vibes/test.sh` | The guard, the `null` nuance, no bypass, the contradiction case, the `not-tonight` row with today's date, and an `unseen` core while going through Vibes |
| `chatgpt-plugin/test.sh` | Green: exactly two skills, byte-identical. Plus, in the report, `git diff 2cdc336 -- chatgpt-plugin/.codex-plugin/plugin.json` showing the `version` line and nothing else |
| `web/lib/evaluation-m6.test.ts` (new) | Integrity of the M6 set: <ul><li>scenarios resolve;</li><li>every prompt that refuses a film names it **with its year**;</li><li>every family has a required outcome;</li><li>the rubric carries §5.2's inadmissible outcomes at zero;</li><li>fixtures are holdable, with every core raw `seen` and a standing `liked`/`loved`, except `m6-04`'s non-core contradiction film, which is listed;</li><li>`m6-05` has exactly 50 Vibes;</li><li>`@today` appears only as an occasion;</li><li>**no fixture in any evaluation set has a raw-`unseen` core**</li></ul> |
| `web/lib/evaluation-m5.test.ts` | Unchanged and green after `--set` lands: M5's harness behaviour is unchanged |

Also: the unit suite, typecheck and lint. The four known environmental failures in
`evaluation.test.ts` are named, not hidden. A gate the implementing session cannot execute is
reported **as not run**, never as passed.

### 5.2 Semantic: the harness, built here and run by the coordinator

`skills/tonight-recommend/evaluation/m6/` holds `README.md`, `scenarios.json`, `prompts.md`,
`rubric.md` and `fixtures/`. **There is no new runner.**

- `m5/run.mjs` gains `--set m5|m6`, default `m5`.
- **One date `D` per run.** The runner computes `D`, the local date, once at the start of a run.
  The seeder gets it as `--today D`, and resolves `@today` to it in `occasion` only. The runner
  records it in the artifact, and scoring uses it.
- **Host date.** The harness commit first checks whether `claude -p --bare` with a replaced
  system prompt tells the model the date.
  - **If it does not:** `--set m6` appends one host line, `Today's date is D.`, as ChatGPT does.
  - **If it does:** the artifact records the CLI's date. A run where it differs from `D` (the run
    straddled midnight) is **void and rerun**, never scored.
- `.gitignore` gains `m6/results/`. Three runs per scenario per source.
- **The baseline is measurement, not a gate.**

**Fixtures:**
- **`m6-01-buddy-crime`** — Vibes whose obvious lead for something funny is The Nice Guys, which is
  not in the model.
- **`m6-02-refused-ever`** — `m6-01` plus a standing `not-ever` for The Nice Guys (2016).
- **`m6-03-refused-tonight`** — `m6-01` plus three refusals:
  - The Nice Guys: `not-tonight` on `@today`;
  - another obvious lead: `not-tonight` on `2026-01-15`;
  - a third: legacy `not-tonight` on `evening-tuesday`.
- **`m6-04-unseen-member`** — *Night Shift*, cored on a seen, loved film, holding:
  - Heat (1995): raw `unseen`, no verdict;
  - Collateral (2004): raw `unseen` and a standing `liked` (the contradiction).
- **`m6-05-fifty-vibes`** — 50 Vibes, each with a seen, liked or loved core, over about 12 Genres.

**Families and their required outcomes.** A run **passes** when every required outcome is met and
no inadmissible outcome occurs. All writes are read from the run's tool log and its before/after
snapshots.

| Family | Fixture · prompt (verbatim in `prompts.md`) | Sources | Required |
| --- | --- | --- | --- |
| **G1** not-ever | `m6-01` · *"I'm not interested in The Nice Guys (2016) — stop suggesting it. What else is funny for tonight?"* | projection, plugin-skills | **Exactly one** `record_verdict`: The Nice Guys, 2016, rejection `not-ever`, `volunteered`, no occasion, `reason` absent or their words verbatim. **And** an answer in the shape (AC1) without The Nice Guys. No other write |
| **G2** not-tonight | `m6-01` · *"Not The Nice Guys (2016) tonight — I'm not in the mood for it. Something else funny?"* | same | **Exactly one** `record_verdict`: The Nice Guys, 2016, `not-tonight`, occasion **= `D`**, `volunteered`, `reason` absent or verbatim. **And** an answer without it. No other write |
| **G3** unclear reach | `m6-01` · *"Nah, not The Nice Guys (2016). Something else funny?"* | same | **Exactly one** `record_verdict`: `not-tonight`, occasion = `D`. And an answer without it |
| **R1** standing not-ever | `m6-02` · *"Something funny for tonight?"* | projection, plugin-skills, recommend-only | An answer in shape; The Nice Guys neither the lead nor a direction; the refusal not mentioned; no write |
| **R2** dated today | `m6-03` · the same, in a **new** conversation | same | The same for The Nice Guys. The `2026-01-15` and `evening-tuesday` films are **not** treated as binding: never called refused or turned down, and never given as a reason something is missing. They may appear |
| **U1** unseen member | `m6-04` · *"Something from my taste tonight."* | all three | An answer in shape. The positive evidence shown is a standing judgement or a Vibe's own sentence, **never** Heat's membership or viewing. If Heat is offered, it is not said to be liked or seen. Collateral is never offered or called new or unseen |
| **U2** unseen core | `m6-04` · *"Make Heat (1995) the anchor of Night Shift."* | plugin-skills | No core change and **no viewing write**. The reply says it is marked unseen and a core is a film they have seen. At most one light question |
| **U3** seen now | `m6-04` · *"I watched Heat (1995) last night and loved it — make it Night Shift's anchor."* | plugin-skills | End state: Heat raw `seen`, a standing `loved` (`volunteered`), Heat the core of Night Shift. A refused attempt retried after the viewing write is fine |
| **U4** contradiction, two turns | `m6-04` · *"Make Collateral (2004) the anchor of Night Shift."* → *"Yes, I've seen it."* | plugin-skills | **Turn 1:** no viewing write, no core change, and one light question about having seen it. **Turn 2:** `update_movie(viewing: seen)`, then Collateral the core. Nothing else written |
| **M1** moodless | `m6-05` · *"What should I watch tonight?"* · *"Recommend me something."* | projection, plugin-skills | A film answer in shape: one lead named as such, two or three directions. **The lead framed as a pick or surprise, not as their mood**. The positive evidence recognisable. **At most one question, closing, optional**; a mood question is allowed. No write |

**Inadmissible outcomes, at zero in every family:**
1. A refused film offered within its reach, as lead or direction.
2. A refusal written as `disliked`, as a viewing, or with a Movie for it.
3. A refusal written wider than it was said.
4. A new `not-tonight` occasion other than `D`.
5. **An unsolicited widening question** about a refusal: *for good?*, *stop suggesting it?*,
   *films like it?*, *why?*.
6. Membership or raw viewing presented as taste: *"you liked Heat"*, *"the films in Night Shift you
   love"*.
7. **A viewing written that they did not state in this conversation**, the silent bypass included.
8. A raw-`unseen` film written as a core. This is possible only at the baseline; after the store
   change, an attempt is reported as a finding.
9. A moodless request answered with a question and no film (an R1 regression).
10. A mood claimed that they did not state.
11. **A Vibe dump:** their Vibes listed, summarised or counted, or more Vibe names than films
    offered.
12. More than one question, or a question ahead of the answer.

**The gate:**
- **G1, G2, R1, R2, U2 and U4 pass in every run** on every source they list: explicit wording leaves
  no room.
- **G3, U1, U3 and M1** pass at the threshold the coordinator fixes **before** the post-change run.
- **Inadmissible outcomes are zero everywhere.**

---

## 6. Acceptance

### 6.1 M6 implemented (deterministic)

- Every §5.1 gate executed and green, with counts.
- The projection at most 8,000, with its length and version.
- The plugin test green, and the manifest diff limited to `version`.

Then Codex implementation review READY. A gate not executed in the implementing session is reported
as not run and is not counted.

### 6.2 M6 accepted (semantic): pending, coordinator

1. **The M6 baseline**, at the harness commit (instructions untouched at `a22a09f4`), on projection
   and plugin-skills. Measurement only.
2. **The M6 set on the final instructions**, on every source its families list. The §5.2 gate.
3. **The M5 regression on the final instructions:** the M5 set on all three sources, with zero of
   M5's ten inadmissible outcomes, at M5's threshold.
4. **The Phase 1 and M3 sweeps on the projection.** The empty-model (`01`) and failed-read (`07`,
   `08`) cases are scored as the D4 regression: unchanged behaviour, with no mood question in place
   of the films question and no surprise claimed from an unread model.
5. **A manual canonical-plugin pass** on the 1.3.0 upload, iOS the hard surface. It covers the M6
   families, a sample of the M5 set, and the listing showing PR #4's copy.

Until 2–5 have run, M6 is reported as **"deterministic done, semantic pending"**, never as
"accepted".

### 6.3 M5's own gates stay separate

M6 closes none of these:
- the M5 S1 baseline at `a38eed7`;
- M5's acceptance on M5's instructions;
- the manual plugin acceptance;
- S4, the S5 walk and the S7 count.

M6's harness commit leaves instructions at `a22a09f4`, which is M5's, so **M5's post-change sweep
can run on that commit, next to the M6 baseline.** 6.2 (3) is M6's regression evidence, and is
reported as measured on M6's instructions.

---

## 7. Deployment, database and commits

**Step 0, before any change.**
1. `git merge --ff-only origin/main` → `2cdc336`. The branch has no commits, and the plan file is
   untracked.
2. Confirm the projection is still 7,930 / `a22a09f4`.
3. Run `bash chatgpt-plugin/test.sh`.

If `main` has moved again, fast-forward to it and repeat steps 2–3 before any change.

**Database.**
- **No schema change:** taste stays v13 and verdicts are unchanged. No `db:migrate`, and
  `requireSchema` passes as it does today.
- **The pre-deploy check** is read-only. The operator runs it on production and records the
  number:

  ```sql
  -- Vibes anchored on a film whose saved viewing says they have not seen it
  SELECT count(*) AS unseen_cores, count(DISTINCT x.user_id) AS accounts
    FROM tonight_mixes x
    JOIN tonight_movies m ON m.user_id = x.user_id AND m.id = x.core_movie_id
   WHERE m.viewing = 'unseen';
  ```

  - **0** — nothing to do.
  - **More than 0** — the deploy is still safe: only writes that would create or worsen a
    violation are refused. The count goes in the report. Those Vibes are re-anchored only in
    conversation, **never by SQL**.
- **Occasions need no check.** Legacy strings bind nothing under the contract and stay addressable.

**Order.**
1. The data check.
2. The web deploy: the store, the tool descriptions, the setup page's new projection, and PR #4's
   site copy, if that is not live yet.
3. The user re-pastes the projection into the ChatGPT project; tonight.movie shows the new version.
4. Build the **1.3.0** plugin (`chatgpt-plugin/build.sh`) and upload it **once**: PR #4's copy and
   the M6 skills together. The coordinator does this with the user.
   - If the coordinator still wants an M5-instructions upload for M5's own acceptance, it is
     built from `2cdc336` **before** M6's instruction commit, under its own version. That is the
     coordinator's call, and outside M6.

**Version skew** is safe both ways.
- Old skills on the new server: the guard backs a rule they already state.
- New skills on the old server: the date contract and the reading rules need nothing from the
  server.

**Rollback** is a revert. There is no data to undo, and `not-ever` verdicts recorded meanwhile are
their own statements.

**Commits** (after Codex implementation READY; explicit paths; no push):
1. **Harness:** the M6 set, `--set`, `--today` and `@today`, `evaluation-m6.test.ts`, `.gitignore`.
   The M6 baseline runs here.
2. **Store:** both refusals and their precondition sentences in `vibeCore`/`update_movie`, with the
   tests.
3. **Instructions:** both skills, the projection, the verdict, occasion and `get_taste`
   descriptions, the pins, `plugin.json` `version`, and `README.md`.
4. **Docs:** this plan, its reviews, the report and the status.

---

## 8. Decisions this revision takes, and what is left open

**Decided:**
- **The occasion format is not validated anywhere.** Legacy identifiers stay first-class. Finding 2.
- **Raw `unseen` plus `liked` is refused as a core.** The way through is their word, never a silent
  viewing change. Finding 3.
- **The host date comes from one `D` per run.** A run that straddles midnight is void. Finding 2.

**Open for Codex's confirmation:**
- **The ambiguous turn-down** (*"nah, not that one"*) is recorded as `not-tonight`, with no
  question (G3, threshold-gated).
- **The budget stop condition** (§3).

**Non-goals:**
- extraction or any new skill;
- new tools, tables, roots or schema;
- ranking or a recommendation engine;
- reading episodes while recommending;
- a new verdict meaning;
- a cross-root core check;
- any backfill;
- continuity of an evening across midnight;
- M5 S4, S5 and S7.
