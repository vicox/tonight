# `check_candidates`: plan

Status: **implemented in `763ce37` (see *Implementation* at the end).**

**Codex implementation review: READY, with no blockers.** It ran the shell suites this session
could not: `skills/tonight-recommend/test.sh` 223/223, `skills/tonight-vibes/test.sh` 126/126,
`chatgpt-plugin/test.sh` 37/37. It also ran the affected Node suites (157/157), and
`git diff --check` was clean.

Its two non-blocking notes are left for a follow-up:

- `lib/mcp/candidates.test.ts` counts both stores with one counter. Two reads in total does not
  prove each store was read once; separate counters would.
- The `otherYears` fixture in `lib/candidates/model.test.ts` is already in ascending order, so
  removing `.sort()` would not fail the test. A reversed fixture would.

**Codex plan review: READY (round 2), with no blockers.**

Its two non-blocking notes were folded in after the verdict and were not re-reviewed:

- The helper's validation sentence now says which checks the schema makes and which only
  `askedCandidates` makes.
- The "refusal reads nothing" test counts the calls to `taste()` and `standing()` instead of
  relying on `get_memory` being unchanged.

Round 1 was **NOT READY, with four blockers, all fixed here:**

- A second hard-coded tool count, `tools.test.ts:990`, was missing from *Tests*.
- *"Every film the answer will name"* also covered films named only as the reason for a pick.
  The check is now scoped to the films put forward.
- The helper would have accepted a `null` IMDb id through `checkImdbId`. It now refuses one.
- After Vibe Evolution, a liked verdict on an unsaved film cannot be written through MCP. The
  fixture now uses a `disliked`.

Both non-blocking notes are also taken: input is validated before anything is read, and the
failure bullet now covers a `get_taste` that also failed.

Separately, one sentence of the skill paragraph restated *"`nothing` is not new to them"*. That
rule is the tool description's (`test.sh:871`, `recommend-skill.test.ts:110`), so the sentence is
gone.

Nothing is pushed, merged or deployed.

- Ticket / branch / worktree: `tonight-check-candidates-plan`, based on `main` at `3e65ab9`.
- **Vibe Evolution merged into `main` as `14d992d` (PR #12) while this plan was written.** Every
  file and line this plan relies on was checked at both commits (see *Vibe Evolution*). The
  implementation starts from `main` at or after `14d992d`.
- The tool name `check_candidates` is the user's choice.

## The problem

The recommend skill already says what a recommendation must not do with films Tonight knows
about. A `dont-want-to-see` film is never recommended. A film that is seen or judged is never
offered as new. Right now an agent can only apply those rules from its memory of a `get_taste`
read made earlier in the turn, matching titles by eye. That breaks in three places:

- with spelling (`The Thing` vs `the thing`);
- with years (`Dune` 1984 vs 2021);
- with replacements chosen after the read.

`check_candidates` is one deterministic read. It takes the films the agent has already chosen
and returns what Tonight holds about each one, keyed by the same film identity the stores use
(`filmKey`).

## Scope

**In:**

- one read-only MCP tool;
- a pure helper with unit tests;
- MCP contract tests;
- a short addition to the `tonight-recommend` skill, with its contract tests;
- the README tool table, the server version and the plugin version.

**Out:**

- schema, migration, new table or new store method;
- fuzzy or near-title search;
- anything that chooses, ranks or suggests films;
- availability or streaming lookup, and IMDb lookup;
- reading Episodes;
- any server-side guarantee about the reply text the agent writes;
- the website, `tonight-vibes`, and the descriptions of other tools.

## What the code does today (`3e65ab9`, unchanged in `14d992d`)

| Concern | Where | Today |
| --- | --- | --- |
| Film identity | `lib/films/identity.ts`: `filmKey`, `canonicalTitle` | whitespace collapsed, `toLowerCase`, NFC; the year is always part of the key; no accent folding |
| Saved films | `TasteStore.taste()` → `Taste.movies` | `{ title, year, imdbId, viewing, vibes }` plus timestamps; IMDb id unique per user (`movieImdbTaken`) |
| Opinions | `VerdictStore.standing()` → `Standing[]` | one current `{ title, year, judgement, because?, told }` per film; withdrawn and replaced verdicts are already resolved away |
| "Has watched" | `lib/seen.ts` `effectivelySeen(viewing, standing)` | `seen`, or any standing judgement; "the one place that joins them" |
| Input checks | `lib/taste/model.ts` `checkMovieTitle`, `checkYear`, `checkImdbId` | `TasteError` with product wording |
| Shared schemas | `lib/mcp/server.ts` `movieTitle`, `movieYear`, `imdbId` | `imdbId` is `.nullable()`, and its description is about clearing a stored id |
| Refusals | `attempt()` | `TasteError` → `{ isError: true, content: [text] }` |
| Tool surface | 20 tools; `SERVER_VERSION` `0.2.0` | pinned by `endpoint.test.ts` (sorted list, count, version) and `tools.test.ts` (registration order); the README table is pinned by `disclosures.test.ts` |

`get_taste` already reads `store.taste()` and `verdicts.standing()` together. The new tool reads
**exactly those two and nothing else**.

## Design

### D1 — The tool contract

```text
check_candidates({ candidates: [{ title, year, imdb_id? }] })   // 1 to 10
```

**Input:**

- `title` is `movieTitle`, `year` is `movieYear`, and `imdb_id` is optional. Each gets a
  `.describe()` written for a check rather than a write: as you would name the film to them; no
  "ask if you do not know"; no "null to clear".
- `imdb_id` uses the same syntax rule as `imdbId`, but **not nullable**. To avoid copying the
  regex, `imdbId` is split into `imdbIdText` (trim, max, regex) and
  `imdbId = imdbIdText.nullable().describe(…)`. `imdbId`'s behaviour and description stay exactly
  as they are.
- The list is `.min(1).max(MAX_CANDIDATES)`, with `MAX_CANDIDATES = 10`. That covers a lead,
  three directions and their replacements.
- The objects are ordinary `z.object`, not strict. This is a read, so an unknown key cannot widen
  anything, and the final check should not fail because an agent also sent `lead`.

**Annotations:** `{ readOnlyHint: true, openWorldHint: false }`, the same as `get_taste`.

**Answer:** one entry per candidate, in the order sent. Every field is always present.

```jsonc
{
  "candidates": [
    {
      "asked":   { "title": "Seven", "year": 1995, "imdbId": "tt0114369" }, // as checked; imdbId only if sent
      "status":  "nothing",            // "saved" | "said-only" | "nothing"
      "movie":   null,                 // or { title, year, imdbId, viewing, vibes } as stored, no timestamps
      "verdict": null,                 // or { judgement, because?, told } — what stands now
      "seen":    null,                 // true | false | null
      "neverRecommend": false,
      "otherYears": [],                // years of a film with the same canonical title that Tonight holds
      "imdbHeldBy": { "title": "Se7en", "year": 1995 }   // or null
    }
  ]
}
```

**What each field means:**

- **`status`:**
  - `saved`: a Movie has this `filmKey`. It may also have a verdict.
  - `said-only`: there is no Movie, but a verdict stands. After Vibe Evolution this is usually a
    `disliked`. A liked or loved one is legacy data, and is read the same way.
  - `nothing`: neither. A verdict that was only ever withdrawn is `nothing`, the same as in
    `get_taste`.
- **`seen`:**
  - `true` exactly when `effectivelySeen` says so.
  - `false` only for a saved `want-to-see` film with no standing judgement. That is the one thing
    that says a film is new to them.
  - `null` otherwise: `nothing`, or `dont-want-to-see` with no judgement. A turn-down is not
    evidence of watching.

  **`null` is "Tonight does not know", never "unseen".** This is the misreading the field exists
  to prevent.
- **`neverRecommend`:** `movie.viewing === "dont-want-to-see"`. It is the only hard rule the store
  holds, so it is the only one that gets a flag.
  - There is **no** `eligible`, `valid` or `ok` field. Whether a seen film fits as a rewatch, or a
    disliked one is a poor pick, is recommendation judgement, and it belongs to the skill.
- **`otherYears`:** sorted, unique years other than the asked one, taken from saved Movies and
  standing verdicts whose `canonicalTitle` equals the asked title. The comparison is exact, not
  fuzzy.
- **`imdbHeldBy`:** set when `imdb_id` was sent and a saved Movie with a **different** `filmKey`
  holds exactly that id. It returns `{ title, year }` and nothing else. Neither this field nor
  `otherYears` is merged into the entry. The agent checks that film by its own title and year if
  it is the one they meant.

**Refused, before anything is read.** Over MCP the schema refuses first, as the SDK's
`isError` answer. The helper checks the same things again and refuses with a `TasteError`
through `attempt`, which is what the in-process `_registeredTools` path meets. Refused are:

- an empty list;
- more than 10 candidates;
- an invalid title, year or IMDb id (the messages of the existing validators);
- an `imdb_id` of `null`. Leaving it out is how "no id" is said, and a check has nothing to
  clear;
- **two candidates with the same `filmKey`**. The message names both spellings: *"Heat (1995) is
  in this check twice, as "Heat" and "heat " — name each film once."* A film named twice in one
  answer is a mistake in the answer, and the refusal surfaces it.

  The same title in two different years is two films and is not refused.

**Description** (the only guidance on the tool). It covers what the call reads and how to read
the answer. **When** to call it is method, so it goes in the skill
(`docs/instruction-ownership.md`). The description says:

- It reads what Tonight holds about films **you** chose, one entry per film, in order. It
  **never offers, ranks or filters a film**, and knows no film it was not told about.
- Matching is by title and year together, case and spacing aside, and otherwise exact: *Amélie*
  and *Amelie* are two films, and so are *Dune* 1984 and *Dune* 2021.
- The three statuses.
- ***`nothing` means Tonight holds nothing about the film, never that they have not seen it*.**
  It also explains `seen`'s three values, and that `null` is not `false`.
- `neverRecommend` means never recommended, as the lead or as a direction, the wording
  `get_taste` already uses.
- `verdict` is only what stands now, with their words where they gave them.
- `movie.vibes` is where the film is filed, and is no opinion about it.
- `otherYears` and `imdbHeldBy` are not merged into the entry: check that film by its own title
  and year if it is the one you meant.
- Episodes are not read: a film turned down for one evening is not here. That lives in the
  conversation.

### D2 — The pure helper: `web/lib/candidates/model.ts`

This follows `lib/memory/model.ts`: a cross-root join with no store of its own.

```ts
export const MAX_CANDIDATES = 10;
export type Asked = { title: string; year: number; imdbId?: string };
export type CandidateCheck = { asked; status; movie; verdict; seen; neverRecommend; otherYears; imdbHeldBy };
/** Validates; throws TasteError. Reads nothing. */
export function askedCandidates(raw: readonly { title: unknown; year: unknown; imdbId?: unknown }[]): Asked[];
/** The join. Pure. */
export function checkCandidates(asked: readonly Asked[], held: { movies: readonly Movie[]; standing: readonly Standing[] }): CandidateCheck[];
```

- **Validation (`askedCandidates`):**
  - the count first;
  - then each candidate through `checkMovieTitle` and `checkYear`;
  - then the IMDb id: `undefined` stays absent, `null` is refused with its own `TasteError`
    (*"an IMDb id here is text, or left out"*), and anything else goes through `checkImdbId`;
  - then duplicates by `filmKey`.

  The schema already checks the count, the year range, the id syntax and the id not being
  `null`. A blank title and duplicate films are this function's alone. It checks all of them,
  as the store does for every write, so the `_registeredTools` path the tests use cannot bypass
  any of it.
- **Lookup:** three maps are built once from `held`: `filmKey` → Movie, `filmKey` → Standing, and
  `imdbId` → Movie. A fourth maps `canonicalTitle` → years. Every entry then costs a constant
  number of lookups.
- **`seen`:** goes through `effectivelySeen`. Its `viewing` parameter is widened to
  `Viewing | null` (no saved film), with one line of documentation. The body is unchanged, so the
  existing callers (`lib/web/judgements.ts`, `lib/web/movie-summary.ts`) behave exactly as
  before, and `lib/seen.ts` stays the one place that joins the two roots.
- **Pure:** it never mutates its inputs, and the same inputs always give the same output. There
  is no I/O, no clock and no randomness.

### D3 — Registration: `web/lib/mcp/server.ts`

The tool is registered **last**, after `forget_verdict`, with its own section comment. That keeps
the existing registration order (which `tools.test.ts` pins) and touches none of the hunks Vibe
Evolution changed.

```ts
async ({ candidates }) =>
  attempt(async () => {
    // Validated before either store is read, so a refusal reads nothing.
    const asked = askedCandidates(candidates.map(({ title, year, imdb_id }) => ({ title, year, imdbId: imdb_id })));
    const [taste, standing] = await Promise.all([store.taste(), verdicts.standing()]);
    return { candidates: checkCandidates(asked, { movies: taste.movies, standing }) };
  })
```

`SERVER_VERSION` becomes `0.3.0`. A new tool means a host's cached tool list is stale, which is
what `endpoint.test.ts` says the version is for (M9 bumped it to `0.2.0` for the same reason).

### D4 — The skill: `skills/tonight-recommend/SKILL.md`

**One new paragraph in `## Recommending`**, directly after *"Being in the model is never evidence
they have not seen it …"* and before *"The model counts as evidence in the taste-aware mode …"*:

> **Check the films before you present them.** Call `check_candidates` **immediately before
> presenting**, with every film you put forward — the lead and each direction, by title and year,
> with an IMDb id where you have one. A film you name only as the reason for one — *"you loved
> Sleuth"* — is not put forward: it is not checked and not replaced. The tool checks films you
> chose; it never supplies one. Replace a film it marks `neverRecommend`, one whose own standing
> verdict is `disliked`, and one that is `seen` unless they asked for a rewatch — then say it is
> one. Check each replacement the same way before it is presented. Where `otherYears` or
> `imdbHeldBy` says Tonight may hold the film under another year or name, settle which film you
> mean before naming it. The check covers the films you send, not the sentences you write — the
> films you put forward are the ones you checked.

**One new bullet in `## When something fails`**, after **A write fails**, so the two
`get_taste` branch slices and the ordinary-branch end marker do not move:

> - **`check_candidates` fails** — nothing about the answer changes: it is owed or not as the
>   branches above decide, and where it is owed, present the films you chose and never say they
>   were checked.

The bullet is written this way for three reasons:

- It does not use the word *retry*, so `sharedRetry(section)` and the "no retry above the
  branches" checks are unaffected.
- It does not restate either `get_taste` branch. Where `get_taste` also failed on an ordinary
  request, that branch's disclosure and its *"claim **nothing** about them"* already govern the
  answer, and this bullet only adds that the films were not checked.
- It does not tell the agent to fall back on a `get_taste` result, which in that case does not
  exist.

**Wording constraints the implementation must keep** (existing skill contracts):

- **No restating of what `nothing` or `null` means.** That rule is the tool description's
  (`test.sh:871`, `recommend-skill.test.ts:110`: "null against unseen lives only on the tool").
- **Never `` `seen` `` followed within 40 characters by a backticked judgement**
  (`test.sh:952`). The paragraph names `disliked` before `seen` for that reason.
- **No *"Tonight knows / has heard nothing about"*** (`test.sh:346`).
- **The paragraph stays outside the slice from *"rules a Movie out as new"* to
  *"`loved` one is a"*.** That slice is `test.sh:362` and must not say *"never suggest"*.

**What is deliberately unchanged:**

- *"Never look in Tonight for films to recommend"* and *"no Tonight tool that takes a taste and
  returns films, and there is not going to be one"* stay true and pinned, because the tool takes
  films and returns facts.
- *"A `loved` one is a reason, not a suggestion"* stands, and so does *"Anchor a stretch in
  something they like"*. A film named as that reason is not put forward, so it is neither
  checked nor replaced. A loved film is put forward only as a rewatch they asked for.
- *"`disliked` weakens something similar — a negative sign, not a ban"* stands. It is about
  similar films; the new rule is about the disliked film itself.

### D5 — Docs and packaging

- **`README.md`:**
  - *Twenty* becomes *Twenty-one*.
  - New table row: `` | `check_candidates` | the films you are about to recommend, against what
    Tonight holds about each — saved or not, where it stands, what stands about it; never a film
    of its own | ``.
  - *"None interprets a sentence, invents a Genre or chooses a film"* stays true.
- **`chatgpt-plugin/.codex-plugin/plugin.json`:** the version is `1.6.0` at `3e65ab9` and `1.7.0`
  at `14d992d`. It becomes `1.8.0`, because the packaged skill changed (as Vibe Evolution did).

## Tests

**New `web/lib/candidates/model.test.ts`** (pure, no database):

1. **Empty model:** each candidate is `nothing`, with `movie`/`verdict` null, `seen` null,
   `neverRecommend` false, `otherYears` `[]` and `imdbHeldBy` null.
2. **Table:** viewing {`seen`, `want-to-see`, `dont-want-to-see`, no Movie} × verdict {none,
   `liked`, `loved`, `disliked`}, giving `status`, `seen` and `neverRecommend`. In particular:
   - `want-to-see` + `loved` gives `seen: true`;
   - `dont-want-to-see` + none gives `seen: null` and `neverRecommend: true`;
   - `dont-want-to-see` + `liked` gives `seen: true` and `neverRecommend: true`;
   - no Movie + `disliked` gives `said-only` and `seen: true`.
3. **Identity:** `"  the  THING "` 1982 matches a saved `The Thing` 1982. `movie` carries the
   stored spelling and `asked` the checked one.
4. **No fuzzy matching:** `Amelie` does not match `Amélie`, and `Seven` does not match `Se7en`.
5. **`otherYears`:**
   - a saved `Dune` 1984 and a standing (said-only) `Dune` 2000 give `Dune` 2021 `nothing` with
     `[1984, 2000]`;
   - the asked year is never listed;
   - the list is sorted and unique.
6. **`imdbHeldBy`:**
   - `Seven` 1995 `tt0114369`, with `Se7en` 1995 saved holding that id, gives `nothing` and
     `{ title: "Se7en", year: 1995 }`;
   - the holder itself gives null;
   - no id sent gives null;
   - an unknown id gives null.
7. **Order:** the order is preserved, with one entry per candidate.
8. **Refusals** (each a `TasteError`, from `askedCandidates`):
   - an empty list;
   - 11 candidates;
   - a duplicate `filmKey` (`Heat` / `heat ` 1995), with both spellings in the message;
   - `Heat` 1995 + `Heat` 1986 is **not** refused;
   - a blank title, a year out of range, or a malformed id;
   - **`imdbId: null` is refused, while an omitted `imdbId` is accepted and stays absent from
     `asked`.**
9. **Purity:** frozen inputs are not mutated, and repeated calls are `deepEqual`.
10. **`verdict`:** `because` appears only when given; `told` passes through; there is no
    `title`/`year` inside `verdict`.

**New `web/lib/mcp/candidates.test.ts`** (embedded PGlite, real stores, `_registeredTools`, the same
harness as `taste-verdicts.test.ts`). Fixtures follow Vibe Evolution: at `14d992d`,
`record_verdict` writes a liked or loved verdict through `store.sayFiled`, which refuses a film in
no Vibe. So every liked or loved fixture is filed in a Vibe first.

1. **End to end, from real writes:**
   - a Vibe with core `Heat` (seen, loved);
   - `Arrival` `want-to-see` in it;
   - `Cats` `dont-want-to-see`;
   - an unsaved `Solaris` `disliked`;
   - an unknown film.

   All five are checked in one call, giving the expected entries.
2. **Only what stands:**
   - an unsaved film recorded `disliked` and then withdrawn gives `nothing` with `seen: null`.
     A disliked needs no Vibe and no Movie, so the film stays unsaved;
   - a filed film recorded `liked` and then `disliked` gives `saved` with
     `verdict.judgement: "disliked"`.
3. **Legacy:** a `loved` about an unsaved film is seeded **directly through
   `sqlVerdictStore(…).say`**, bypassing the MCP rule, and labelled as legacy data from before
   Vibe Evolution. It gives `said-only` with `seen: true`.
4. **Reads only:** `get_memory` (stamps blanked) is equal before and after, and no episode exists.
5. **Isolation:** Ben's films and verdicts never appear in Ana's answer.
6. **A refusal writes and reads nothing:**
   - a duplicate gives `isError` with the message, and `get_memory` is unchanged;
   - `imdb_id: null` through the handler gives `isError`;
   - zero reads is proved directly. The server is built with a taste store and a verdict store
     whose `taste()` and `standing()` count their calls (or throw). For each invalid input
     (duplicate, `null` id, blank title, empty list, 11), the count stays 0.

**Updated `web/lib/mcp/tools.test.ts`** (through the HTTP endpoint and zod):

- The registration-order list gains `check_candidates` last. *"twenty tools"* becomes
  *"twenty-one tools"* in the test name and comment.
- **A new test:**
  - the annotations are `readOnlyHint: true` and `openWorldHint: false`;
  - `inputSchema` requires `candidates`, with `minItems` 1 and `maxItems` 10, and items requiring
    `["title", "year"]`;
  - 11 candidates, a malformed `imdb_id`, or `imdb_id: null` are `refused`, while an omitted
    `imdb_id` is `ok`;
  - the description pins:
    - *never that they have not seen it*;
    - that it never offers a film;
    - `null` is not `false`;
    - `neverRecommend` / `dont-want-to-see`;
    - Episodes are not read.
- *"no cross-tool rule has been copied into a tool description"* gains
  `/immediately before present/i`, so the timing stays in the skill.
- *"create_vibe requires a core, and a call without one writes nothing"*
  (`tools.test.ts:990` at `3e65ab9`, `:995` at `14d992d`) asserts `tools.length === 20`. It
  becomes 21. Its protection stays: the core is still an argument, not a tool, and the 21st tool
  is `check_candidates`, whose name the registration-order test pins. The message is extended
  to say so.

**Updated `web/lib/mcp/endpoint.test.ts`:**

- the sorted list gains `check_candidates`;
- `tools.length` becomes 21, with the comment updated (a read across Movies and standing
  Verdicts, writing nothing);
- the version becomes `0.3.0`, with its comment.

**Unchanged, and still expected to pass:**

- `evaluation-m3.test.ts` and `evaluation-m5.test.ts` compare *mutating* tools, and this one is
  read-only;
- `disclosures.test.ts` reads the README table and the count word (`twenty-one` exists);
- the generic every-tool checks: no user-id property, no timestamp argument, no persistent
  question.

**Skill contracts:**

- `skills/tonight-recommend/test.sh` gets a new section, *"the films are checked before they are
  presented"*. It uses `order_check` over the paragraph's markers:
  - `**Check the films before you present them.**`
  - `**immediately before presenting**`
  - `every film you put forward — the lead and each direction`
  - `A film you name only as the reason for one`
  - `it is not checked and not replaced`
  - `it never supplies one`
  - `neverRecommend`
  - `` `disliked` ``
  - `unless they asked for a rewatch`
  - `Check each replacement the same way`
  - `` `otherYears` or `imdbHeldBy` ``
  - `the films you put forward are the ones you checked`

  It also checks:
  - that the paragraph sits between `## Recommending` and `## What may be persisted`;
  - that the failure bullet follows `**A write fails**`;
  - that the existing *"null against unseen lives only on the tool"* check still finds 0.
- `web/lib/recommend-skill.test.ts`:
  - a new test asserts the same rules, in order, inside the `## Recommending` slice;
  - the key sentences are added to *"every rule the agent cannot work out for itself is in the
    skill"*;
  - the failure bullet is asserted to sit after `**A write fails**` and to contain no `retry`;
  - the existing *"no tool here turns a taste into films"* assertions are left as they are.

## Verification

1. `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` in `web/`. The baseline is
   taken first on the implementation base, because the 4 `lib/evaluation.test.ts` failures depend
   on the gitignored `results/` directories and are expected there.
2. `skills/tonight-recommend/test.sh`, `skills/tonight-vibes/test.sh`, `bash chatgpt-plugin/test.sh`.
3. Each new guard is shown to bite once:
   - remove the paragraph and the skill tests fail;
   - make `seen` return `false` for `nothing` and the helper test fails;
   - drop the duplicate check and its test fails.

   Each is then restored.
4. `git diff --stat` touches only:
   - `lib/candidates/*` (new);
   - `lib/mcp/server.ts`;
   - `lib/mcp/identity.ts`;
   - `lib/seen.ts` (type only);
   - the test files named above;
   - `SKILL.md` and its two contract files;
   - `README.md`;
   - `plugin.json`;
   - this plan.

   No schema, migration, store, website or `tonight-vibes` file changes.
5. **Not run:** live LLM evaluation of the skill. No skill-eval run is planned, and if one is
   wanted it is a follow-up.

## Vibe Evolution

Checked against `14d992d`:

- `store.taste()`, `verdicts.standing()`, `effectivelySeen`, `filmKey` and the validators are
  untouched by it.
- Its `server.ts` hunks are in `update_vibe`, `delete_vibe`, `update_movie`, `record_verdict`,
  the constants after `VERDICT_COVERAGE`, and `attempt` (which now also answers `Refused`).
  Registering last avoids all of them, and `check_candidates` throws only `TasteError`.
- The tool count is still 20 on `14d992d`, so this makes it 21.
- Its `SKILL.md` hunks (the Movie/Verdict paragraph and the verdict bullet in *Films they tell you
  about*) are not where D4 edits.
- Its rule is that a liked or loved film must be in a Vibe. As merged, `record_verdict` writes
  those through `store.sayFiled`, a `TasteStore` method, and turns `VibeRequired` into a
  `Refused` answer. That only changes how test fixtures are written (see the MCP tests; legacy
  data is seeded directly). The helper reads every standing verdict the same way, including
  legacy liked or loved films with no Vibe.
- The second hard-coded count (`tools.test.ts:990`, `:995` after the merge) is listed under
  *Tests*.

The UI plan (`tonight-ui-plan`) is unaffected: no website file changes.

## Delivery

One commit on the implementation branch, then a separate Codex implementation review, fixing
blockers until READY. No push, merge or deploy without the coordinator.

There is no migration. After deploying, reconnect the Tonight connector in each host and confirm
that `tools/list` includes `check_candidates`.

## Implementation

Implemented on `tonight-check-candidates-plan`, fast-forwarded from `3e65ab9` to `origin/main` at
`14d992d` first. There were no conflicts, and this plan file was carried over unchanged.

D1–D5 were implemented as written. Three small things the plan did not spell out:

- **`tools.test.ts:995`** becomes 21 and also asserts that no tool is named for the core. That
  keeps the old protection explicit, rather than relying only on the registration list.
- **The duplicate refusal** names the two spellings after `checkMovieTitle` normalises them, so
  `"heat "` reads as `"heat"`.
- **"A refused check reads neither store"** builds the server with counting stub stores, and
  checks that a valid call reads each store once, so the counter is shown to count.

### Verification results

1. **Baseline at `14d992d`:** 1322 tests, 1318 pass. The 4 failures are the known
   `lib/evaluation.test.ts` ones, which read the gitignored `results/` directories.

   That run overlapped the first edits to `server.ts`. Its output contains none of the new tests,
   and both tool-count tests passed at 20, so they loaded the old server. A clean re-run from an
   exported tree was not possible here, because writing outside the worktree needs approval.
2. **With the change:**
   - `npm test`: 1341 tests, 1337 pass. The same 4 failures. The 19 new tests are 10 helper, 7
     MCP, 1 endpoint contract and 1 skill contract.
   - `npm run typecheck`: clean.
   - `npm run lint`: 0 errors. The 2 warnings are pre-existing, in untouched files.
   - `npm run build`: succeeds.
3. **Each guard bites,** and was restored afterwards:
   - `seen` returning `false` for an unknown film fails 2 helper tests;
   - dropping the duplicate check fails 3 tests (helper, handler, and zero reads);
   - removing the skill paragraph fails 2 `recommend-skill.test.ts` tests.
4. **Shell suites:** `skills/tonight-recommend/test.sh`, `skills/tonight-vibes/test.sh` and
   `bash chatgpt-plugin/test.sh` could not be run in this session, because running them needs
   approval. They are handed to the implementation review.

   The new `test.sh` checks, and the whole-skill guards the paragraph could trip (`:346`, `:362`,
   `:871`, `:952`), were reproduced against the skill with `grep` and `node`, and all pass.
5. **Scope:** the diff touches exactly the files *Verification* lists. No schema, migration,
   store, website or `tonight-vibes` file changes.

An empty, gitignored `web/coverage/cc-baseline/` was left behind by the blocked baseline export.
It could not be removed in this session.
