# Vibe evolution: a liked or loved film belongs to a Vibe — analysis and minimal plan

Status: **implemented, as approved, with one forced change of placement (see *Implementation*).
Codex plan review: READY after two fixes. Codex implementation review: READY.** The user
authorised commit, push and merge.

- Base: `main` at `f3912b0` (M9 merged). Worktree `tonight-vibe-evolution-analysis`.
- The UI plan (`tonight-ui-plan`, `docs/work/ui/PLAN.md`) is left untouched. It assumes the stores and the
  web routes behave as they do today, and this plan keeps that true (see *Scope*).

## The product decision

- A **positive verdict** (`liked` or `loved`) requires the film to be filed in **at least one Vibe**.
- **No Vibe is required** for: watched-only (`viewing: seen`, no verdict), `disliked`, and
  `dont-want-to-see`.
- **`record_verdict`, positive, film in no Vibe:** nothing is written. The answer is a structured
  `vibe_required` result telling the agent what to do next:
  1. find the best existing Vibe;
  2. propose a minimal change to its sentence when one is needed, written only with their approval;
  3. or offer one recommended new Vibe plus **two** meaningfully different alternatives, so their
     choice says why they like the film.

  Once the film is filed, the agent retries the save in the same conversation.
- **A standing positive verdict cannot be orphaned** by removing its film's last Vibe membership or by
  deleting its last Vibe. This is enforced at the existing MCP write boundaries, with no DB trigger,
  no migration and no new subsystem.

## What the code does today (`f3912b0`)

| Concern | Where | Today |
| --- | --- | --- |
| Positive verdict write | `record_verdict` → `stateVerdict` → `VerdictStore.say` (`lib/verdicts/store/sql.ts`) | one `INSERT` into `tonight_verdict_acts`, no transaction; reads nothing of Taste |
| Which verdict stands | `current()` in `lib/verdicts/model.ts` | resolved in memory from acts; never in SQL |
| Film identity across stores | `filmKey` / `canonicalTitle` (`lib/films/identity.ts`) | `tonight_movies.canonical_title` stores exactly `canonicalTitle(title)` |
| Membership removal | `update_movie({ vibes })` → `TasteStore.updateMovie` | locks the movie `FOR UPDATE` (`lockMovies`), deletes and rewrites `tonight_mix_movies` rows |
| Vibe deletion | `delete_vibe` → `TasteStore.deleteVibe` | locks every filed movie `FOR UPDATE` (`holdFiledMovies`), then the vibe; re-reads the filing; retries ×3 |
| Other membership writes | `create_movie`, `create_vibe`/`update_vibe` (core) | add only; `update_vibe` keeps a replaced core as a member |
| Film deletion | `deleteMovie` | removes the film **and** every verdict act about it (`forgetVerdicts`), so there is no orphan |
| Web writes (UI) | `PATCH /api/verdicts` → `say`; `DELETE /api/vibes/[name]` → `deleteVibe`; `PATCH /api/movies` → viewing only | same store methods |
| Tool results | `answer()` / `attempt()` in `lib/mcp/server.ts` | success: `{ content: [text JSON], structuredContent }`. Refusal: `{ isError: true, content: [text] }`, no `structuredContent`. No tool declares an `outputSchema`. |

## Scope

- **In:** the MCP `record_verdict`, `update_movie` and `delete_vibe` paths, plus the descriptions of
  `record_verdict`, `update_movie`, `delete_vibe` and `update_vibe`, both skills, the README tool table,
  and the tests.
- **Out:**
  - web routes and UI;
  - schema, migration and triggers;
  - backfilling or re-validating existing verdicts;
  - new tools (there are still 20);
  - `get_taste` and `get_memory`;
  - Episodes.
- **How the scope is held:** each new check is behind an **opt-in option** on the existing store
  method. Only the MCP server passes it. Web routes call the same methods without it and behave
  exactly as today.

## Design

### 1. Domain rule (`lib/verdicts/model.ts`)

```ts
export const POSITIVE = ["liked", "loved"] as const;                 // ⊂ JUDGEMENTS
export function needsVibe(act: Act): boolean;                       // verdict && judgement ∈ POSITIVE
export class VibeRequired extends VerdictError {
  constructor(readonly film: Film,
              readonly movie: { title: string; year: number; viewing: string } | null) { … }
}
```

### 2. Guarded save (`lib/verdicts/store.ts`, `store/sql.ts`)

`say(act, options?: { positiveNeedsVibe?: boolean })`.

- **Without the option, or when `needsVibe(act)` is false,** it behaves exactly as today. That covers
  withdrawals, `disliked`, and the web route.
- **With the option and a positive act,** it runs one transaction:
  1. `SELECT id, title, year, viewing FROM tonight_movies WHERE user_id=$1 AND canonical_title=$2 AND year=$3 FOR SHARE`.
     The parameters are `canonicalTitle(film.title)` and `film.year`, the same identity as `filmKey`.
     No row means `throw new VibeRequired(film, null)`.
  2. A **separate statement**: `SELECT EXISTS (SELECT 1 FROM tonight_mix_movies WHERE user_id=$1 AND movie_id=$2)`.
     False means `throw new VibeRequired(film, { title, year, viewing })`.
     - It must be a second statement. Under READ COMMITTED, a subquery in the locking statement would
       still read that statement's pre-wait snapshot. A new statement sees whatever committed before
       the lock was granted.
  3. The existing `INSERT` (factored into `insert(sql, act)`), then commit.
- **Membership includes a core,** because a core is always a `tonight_mix_movies` row (`fileCore`).
- **The verdict store reads `tonight_movies` and `tonight_mix_movies` here.** That crosses the store
  boundary in the opposite direction from `forgetVerdicts`. It is needed because the lock and the
  insert must share one transaction.
  - The MCP endpoint opens `tasteStore` before `verdictStore`, so the taste schema is prepared.

New export for the taste store, in the same file, so that "which verdict stands" is still decided only
by `assemble` and `current()`:

```ts
export async function positiveStanding(sql: Transaction, owner: string, films: readonly Film[]):
  Promise<Map<string /* filmKey */, "liked" | "loved">>;
// reads this user's acts WHERE year = ANY($2), assembles, groups by filmKey, current(), keeps POSITIVE
```

### 3. Removal guards (`lib/taste/store.ts`, `store/sql.ts`, `lib/taste/model.ts`)

`updateMovie(title, year, changes, options?: { positiveNeedsVibe?: boolean })` and
`deleteVibe(name, options?: { positiveNeedsVibe?: boolean })`.

- **`updateMovie`, only when the option is set and `changes.vibes` resolves to `[]`.**
  - Where: after the existing `anchoredBy` core check, while the movie is held `FOR UPDATE`.
  - Check: if `filedUnder(tx, owner, current.id)` is non-empty and `positiveStanding(tx, owner, [current])`
    finds the stored handle, throw `positiveNeedsVibe(current.title, current.year, judgement)`, a
    `TasteError`.
  - **0 → 0 is not refused.** A legacy film already in no Vibe can still take `vibes: []`.
  - Moving the film to other Vibes is never refused.
- **`deleteVibe`, only when the option is set.**
  - Where: inside the attempt, after `same(filed, …)` confirms the held set. At that point every filed
    movie and the vibe are locked.
  - Check:
    1. `SELECT movie_id … FROM tonight_mix_movies WHERE user_id=$1 AND movie_id = ANY($2) GROUP BY movie_id HAVING count(*) = 1`
       finds the films whose only Vibe is this one.
    2. Read their stored `title` and `year`.
    3. Run `positiveStanding`.
    4. If any are positive, throw `vibeHoldsPositive(vibeName, [{ title, year, judgement }])`, a
       `TasteError`.
  - A thrown error leaves the retry loop, so it is never `vibeBusy`.
- **Refusal texts.** Both are plain `TasteError` text, like today's core refusals:
  - `update_movie`: *"Arrival (2016) is loved, and a film they like or love stays in at least one
    vibe — keep one of its vibes in the list, or add another. Withdraw the verdict first only if they
    said they no longer stand by it, never to get past this."*
  - `delete_vibe`: *"Deleting Space Tension would leave Arrival (2016, loved) in no vibe, and a film
    they like or love stays in at least one — move it into another vibe with update_movie first.
    Withdraw a verdict only if they said they no longer stand by it, never to get past this."*

### 4. MCP (`lib/mcp/server.ts`)

- **`record_verdict`** calls `verdicts.say(stateVerdict(…), { positiveNeedsVibe: true })`.
  - Its handler catches `VibeRequired` and returns the result below.
  - Every other error still goes through `attempt`.
- **`update_movie` and `delete_vibe`** pass `{ positiveNeedsVibe: true }`. Their refusals stay ordinary
  `attempt` refusals.
- **Annotations and input schemas are unchanged.** There are still 20 tools, and `SERVER_VERSION`
  stays `0.2.0` because no schema changes. A host with cached descriptions still receives the
  self-describing answer.

**The `vibe_required` result:**

```jsonc
{
  "isError": true,
  "content": [{ "type": "text", "text": "<JSON.stringify(structuredContent, null, 2)>" }],
  "structuredContent": {
    "saved": false,
    "reason": "vibe_required",
    "film": { "title": "Arrival", "year": 2016 },          // as stateVerdict checked it
    "movie": null,                                          // or { title, year, viewing }: saved, in no vibe
    "retry": {
      "tool": "record_verdict",
      "arguments": { "film": { "title": "Arrival", "year": 2016 }, "told": "volunteered",
                     "said": { "about": "judgement", "judgement": "loved", "because": "…" } }  // because only if given
    },
    "next": "<VIBE_REQUIRED_NEXT, a constant>"
  }
}
```

**Why `isError: true`:**

- Nothing was written. An `isError: false` answer lets an agent report *"saved"*.
- It matches every other refusal.

**Why the contract is safe with SDK 2.0.0:**

- `validateToolOutput` returns early when there is no `outputSchema` and when `isError` is set.
- `projectCallToolResult` passes an object `structuredContent` through.
- The same JSON is also in the `content` text, for hosts that show the model only text on an error.

**`VIBE_REQUIRED_NEXT`:**

> Nothing was written. A liked or loved verdict is kept only for a film in at least one of their
> vibes. Read get_taste, then in this conversation:
>
> (1) If one of their vibes fits — judge by its instruction and genres, not its name — propose filing
> the film there. If it fits except that its sentence does not yet cover this film, show them the
> exact minimal new wording and change it with update_vibe only on their yes to those words.
>
> (2) If none fits, offer one recommended new vibe and two meaningfully different alternatives. Each
> is a different reason the film may have worked for them, with a name, a sentence, their genres, and
> this film as core. Their choice says why.
>
> (3) On their yes, file it — update_movie with its vibes, create_movie with viewing seen and vibes
> for an unsaved film, or create_vibe with it as core — then call record_verdict again with
> retry.arguments.
>
> If they decline, it stays unsaved: say so once, and write nothing in its place.

**Description edits:**

- **`record_verdict`:** a new paragraph on the Vibe rule and `vibe_required`. `disliked` needs no Vibe
  and no saved film.
- **`update_movie`:** an empty list is refused for a filed film that has a standing liked or loved.
- **`delete_vibe`:** *"Always allowed"* becomes *"refused only when it would leave a film they like or
  love in no vibe; the refusal names them."*
- **`update_vibe`:** *"Never reword their instruction"* becomes *"Never reword their instruction on
  your own … you may propose a minimal change — the exact new words — when a film they like belongs
  to that same evening and the sentence does not yet cover it; write it only on their yes to those
  words. A change that makes it a different evening is a new vibe."*

### 5. Skills

**`tonight-vibes`:**

- **The flow diagram:** positive and saved → consider Vibes as today. Positive and answered
  `vibe_required` → a new subsection, *When a liked or loved needs a Vibe*, which:
  - says nothing is saved yet;
  - reads `get_taste`;
  - proposes the best existing Vibe, with an optional minimal sentence change shown verbatim and
    written on a yes to those words;
  - otherwise makes one offer: a recommended new Vibe plus two meaningfully different alternatives,
    meaning three different reasons and not three names for one idea, each with a name, a sentence,
    Genres (any new Genre's meaning shown) and this film as core;
  - on a yes, writes it, then calls `record_verdict` with `retry.arguments`, then says one sentence;
  - on a no, says the verdict is not kept and writes nothing in its place.

  This is the statement's one offer.
- **Scope two existing rules to films already filed:** *"A bare 'loved it' considers existing Vibes
  only"* and *"When nothing fits, stop"*.
- **Keep *"Never stretch a Vibe to avoid making one"*,** and add the boundary of a minimal adjustment:
  it must describe the same evening.
- ***A new user's first films*:**
  - each loved film is kept only once it has a Vibe;
  - each proposed Vibe carries two meaningfully different alternatives;
  - a user who declines keeps nothing positive;
  - verdicts are retried after the write.
- ***Writing what they agreed*:** add a last step, *retry every verdict that was answered
  `vibe_required`*.
- ***How it sounds* (the worked examples, `SKILL.md:228–239`):**
  - The positive rows today read as an immediate save followed by optional Vibe talk. Each gains the
    `vibe_required` branch: *"I loved Paterson."* is `loved` if Paterson is filed; otherwise it is
    not saved yet, and you propose its Vibe (an existing one, or the recommended one plus two
    alternatives), file it, then retry.
  - *"existing Vibes only"* is scoped to a film already filed.
  - The `disliked` and turn-down rows are unchanged.
- **Merge:** move the films before `delete_vibe`, because it refuses to strand a liked or loved film.

**`tonight-recommend`:**

- The *own root* sentence (lines 57–58) and the bullet in *Films they tell you about*: `disliked`
  needs no Vibe and no Movie. A liked or loved is kept only in a Vibe. `vibe_required` means
  nothing was saved; go to `tonight-vibes`; filing the film saves it.
- `plugin.json` → `1.7.0`.

**`README.md`:** the tool-table rows for `record_verdict`, `update_movie`, `delete_vibe` and
`update_vibe`.

**Unchanged, still true:** the privacy and terms pages. They describe storage and retention. Verdicts
still have their own root, and legacy, `disliked` and web verdicts can still be about unsaved films.

## Concurrency (what is and is not guaranteed)

**Mechanism.** Every guarded path takes a row lock on the film's `tonight_movies` row:

- the save takes `FOR SHARE`;
- `updateMovie` takes `FOR UPDATE`;
- `deleteVibe` takes `FOR UPDATE`, on every filed film.

Each path makes its deciding read in a statement after the lock is granted, and these lock modes
conflict. So for any two of them on the same film, one commits before the other decides:

| Interleaving | Outcome |
| --- | --- |
| save first, then unfile or delete-vibe | the remover's verdict read sees the new positive act → refused |
| unfile or delete-vibe first, then save | the save's `EXISTS` sees no membership → `vibe_required` |
| save racing a retitle | after the wait, `FOR SHARE` re-checks the row, which no longer matches → `vibe_required` |
| save racing `create_movie` / filing | worst case a false `vibe_required`, and the agent retries. It never orphans. |
| save racing `delete_movie` | the film and its acts go together, either way round |

**Deadlocks.** The save holds at most one row lock. Its `INSERT` takes no lock on any other table,
because `tonight_verdict_acts` has no FK to Taste. The removers only add reads after locks they
already take. No new lock order is introduced, so no new cycle.

**Guarantee, stated narrowly.** Among MCP `record_verdict`, `update_movie` and `delete_vibe` calls,
no interleaving creates a standing liked or loved on a film in no Vibe, and none strands one that was
filed. This is an **application-level** guarantee at the MCP boundary under READ COMMITTED. It is
**not** a database constraint.

**Not covered (limitations, by design or out of scope):**

1. **Web routes.** `PATCH /api/verdicts` can still save a positive verdict on an unfiled film.
   `DELETE /api/vibes/[name]` can still strand one. The UI plan is untouched, and adopting the option
   there is that plan's decision.
2. **`forget_verdict`** can reinstate an earlier liked or loved by forgetting a later withdrawal or
   dislike, on a film now in no Vibe. It is never refused:
   - erasure must always work;
   - its answer is a constant by design, so it cannot report state.
3. **Retitle or re-year** (`update_movie` `new_title` / `new_year`). Verdicts name the film by title
   and year and do not follow a retitle, so a positive verdict about the old handle detaches. This is
   not a membership removal, and it is unchanged.
4. **Existing data.** Positive verdicts already in no Vibe stay as they are: no backfill and no
   re-validation. A new positive `record_verdict` about such a film gets `vibe_required`. Its
   `vibes: []` (0 → 0) is not refused.
5. **Direct SQL, scripts, and any future caller that omits the option.**

## Tests

**Model (`verdicts/model.test`):**

- `needsVibe` is true for `liked` and `loved`;
- it is false for `disliked` and for a withdrawal.

**Verdict store (`verdicts/store.test`, PGlite, with `TASTE_SCHEMA` migrated):**

1. Positive with the option:
   - on an unsaved film → `VibeRequired(movie: null)`, and no act is written;
   - on a film saved in no Vibe → `movie: { title, year, viewing }`, and no act is written.
2. Positive with the option is written when the film is:
   - a member of a Vibe;
   - only a core;
   - named with a case or whitespace variant of its title (`filmKey`).
3. With the option, `disliked` and a withdrawal are written whether or not the film is filed.
   Without the option, an unfiled positive is written, as the web route does.
4. Another user's filed film of the same title does not satisfy the rule.
5. `positiveStanding`:
   - loved → disliked is not positive;
   - loved → withdrawn is not positive;
   - liked is positive;
   - a case variant is matched.

**Taste store (`taste/store.test`):**

6. `updateMovie(vibes: [])` with the option, on a filed loved film → refused naming the verdict, with
   the filing unchanged. The same call without the option succeeds.
7. With the option, each of these is allowed:
   - moving the film to another Vibe;
   - `[]` with a disliked, a withdrawn or no verdict;
   - `[]` on an already unfiled loved film (0 → 0).
8. `deleteVibe` with the option:
   - when it is the film's only Vibe and the film is loved → refused naming the film, with the Vibe
     and its memberships intact;
   - when the film is also in another Vibe → allowed;
   - without the option → allowed;
   - a refusal is never `vibeBusy`.

**Concurrency (`taste/store/concurrency.test`, real PostgreSQL through `TEST_DATABASE_URL`).** These
use the file's holder-connection pattern to force each order:

9. A guarded positive `say` against a guarded `updateMovie(vibes: [])`, both orders. Exactly one
   succeeds, and the final state never has a standing positive verdict with zero memberships.
10. The same against a guarded `deleteVibe`.

**MCP (`mcp/verdicts.test`, `mcp/taste-verdicts.test`, `mcp/tools.test`):**

11. `record_verdict` loved on an unsaved film:
    - `isError: true`;
    - `structuredContent` deep-equals the shape above;
    - `JSON.parse(content[0].text)` equals `structuredContent`;
    - `get_verdicts` history is empty and `get_taste` is unchanged.
12. Retry: `create_vibe` with the film as core, or `update_movie` with its vibes, then
    `record_verdict(retry.arguments)` succeeds, keeping the original `told` and `because`.
13. liked on a film saved in no Vibe → `movie` carries its viewing. `disliked` on an unsaved film is
    written as today.
14. `update_movie(vibes: [])` and `delete_vibe` are refused for a stranded loved film, and nothing is
    written.
15. Description pins:
    - `record_verdict`'s Vibe rule;
    - `update_movie`;
    - `delete_vibe`;
    - `update_vibe`'s new rewording rule, replacing the pins at `tools.test.ts:552` and `:644`.
16. **The scope pin (`web/routes.test`):**
    - `PATCH /api/verdicts` loved on an unfiled film still succeeds;
    - `DELETE /api/vibes/[name]` still deletes.

    The MCP-only scope is then explicit.
17. `forget_verdict` that reinstates a positive verdict on an unfiled film still succeeds with the
    constant answer. This pins limitation 2.

**Existing tests to adapt** (fixture changes only, assertions kept):

- **Which tests:** the positive `record_verdict` calls on unfiled films in
  - `mcp/verdicts.test`, `taste-verdicts.test`, `memory.test`, `episodes.test`, `tools.test` and
    `endpoint.test`;
  - the M2 runner (`verdicts/evaluation/m2.test`);
  - the M3 runner (`memory/evaluation/m3.test`).
- **How to adapt them:**
  - where the verdict tool itself is under test, file the film first with a shared helper, before any
    baseline snapshot;
  - where a verdict is only seed data, seed through the store's unguarded `say`.

**Skill contracts:**

- `skills/*/test.sh` and `recommend-skill.test.ts`: replace the pins on the changed sentences:
  - `test.sh` in `tonight-vibes`: 241–249 (bare-loved, nothing-fits and the one-new-Vibe budget,
    each now scoped to a film already filed) and 351;
  - `test.sh` in `tonight-recommend`: 727–733, 778;
  - `recommend-skill.test.ts`: 1139–1140, 1384.
- Add pins for the `vibe_required` flow:
  - existing Vibe first;
  - a minimal sentence change only on a yes to the exact words;
  - recommended plus two meaningfully different alternatives;
  - retry with `retry.arguments`;
  - a decline writes nothing.

**Live evaluation seeders** (not in CI, and not re-run in this change):

- **`clear()`:** `evaluation/seed.mjs` and `m3/seed.mjs` must forget verdicts **before** `delete_vibe`.
- **Five fixtures hold positive acts on films in no Vibe, and that state is kept, not filed.**

  | Fixture | Films | Why the unfiled state is kept |
  | --- | --- | --- |
  | m5-01 | Hit Man | `exists_for` includes `unfiled`; *"Hit Man is unfiled with a standing loved verdict"* |
  | m3-01 | Black Bag, Solaris, Prisoners | *"every class M3 can hold is present exactly once"*, including a verdict about a film never saved |
  | m3-04, m3-05 | Aftersun | a stability pair with identical evidence; filing would change the recommendation evidence |
  | m3-06 | Black Bag | *"one thing said about one film"* |

  Filing any of these films would change what the fixture measures. So under the new build such a
  state exists only as legacy data, and the fixtures are seeded the way `m5-03-legacy` already is:
  - **Through the tools of the pre-change build** (`f3912b0`), and never by direct SQL. Unlike
    m5-03, there is no migration: the new build serves the seeded database as it is.
  - **Marked `"seed": "pre-vibe-rule"`** in the fixture.
  - **Run only by an operator:**
    - The M5 runner's `isLegacy` (`m5/run.mjs:446`) and its reseed guard (`:340`) treat any fixture
      with a `seed` value as operator-seeded. Today they check only `"v12-then-migrate"`.
    - The M3 runner gets the M5 rules exactly (`m3/run.mjs:235` reseeds on every run today):
      - **without** `--legacy-seeded`, a marked scenario is skipped with the M5-style message;
      - **with** it, the run must name exactly one marked scenario (`--only`) and pass `--runs 1`,
        or it refuses;
      - in that run, the fresh `seed(fixture)` at `:235` is skipped and the operator-seeded
        database is used. Its snapshot and token calls (`:236–237`) are unchanged.
  - **One run per seeding,** because a run writes.
  - **The evaluation README** gets one paragraph for this.
- **`m5-03-legacy`** is seeded through an old build and is unaffected.

## Files touched (implementation, later)

- **Code:**
  - `web/lib/verdicts/model.ts`, `store.ts`, `store/sql.ts`;
  - `web/lib/taste/model.ts`, `store.ts`, `store/sql.ts`;
  - `web/lib/mcp/server.ts`.
- **Text:**
  - both `SKILL.md` files;
  - `README.md`;
  - `chatgpt-plugin/.codex-plugin/plugin.json`.
- **Tests and seeders:** as listed above.
- **Not touched:**
  - web routes and components;
  - schemas and migrations;
  - Episodes;
  - the UI plan.

## Review log

- **Codex plan review 1 — NOT READY.** One blocking issue:
  - **The issue:** filing m5-01's Hit Man destroys intentional `unfiled` coverage.
  - **Resolved:** no fixture is filed. All five fixtures keep their unfiled positive state and are
    seeded through the pre-change build's tools, marked `"seed": "pre-vibe-rule"`. The runners
    treat them as operator-seeded, as they treat `m5-03-legacy`.
  - **Also confirmed:** the opt-in options keep web behaviour unchanged; the row-lock approach and
    the separate membership statement fit READ COMMITTED; SDK 2.0.0 accepts the
    `isError` + `structuredContent` payload.
  - **Note adopted:** the *How it sounds* worked examples are included in the skill edits.
- **Codex plan review 2 — NOT READY.** One blocking issue:
  - **The issue:** the M3 runner condition was reversed.
  - **Resolved:** the M5 rules, exactly:
    - without `--legacy-seeded`, a marked scenario is skipped;
    - with it, exactly one marked scenario and `--runs 1`, the fresh reseed is skipped, and the
      operator-seeded database is used.
- **Codex plan review 3 — READY.** No blocking issues.

## Implementation

### Deviation: where the guarded save and the verdict read live

**The plan put cross-store code in the verdict store; two existing architecture tests forbid it.**
The behaviour, the locking and the answer are as planned. Only the placement moved, so both
boundaries hold.

- **The two tests:**
  - `verdicts/store.test.ts`, *"nothing here answers a question about taste"*, forbids
    `tonight_movies`, `count(`, `group by` and the word `current` in `verdicts/store/sql.ts`.
  - `verdicts/model.test.ts`, *"there is no route from something that happened to something they
    think"*, forbids `vibe` in the code of `verdicts/model.ts`.
- **Why the taste store:** it is already the one place that crosses into verdict tables
  (`forgetVerdicts`, in the same transaction as a film).

| Planned | Implemented |
| --- | --- |
| `VerdictStore.say(act, { positiveNeedsVibe })` | `TasteStore.sayFiled(verdict)`: one transaction — the movie row `FOR SHARE`, membership read by a **second** statement, then the insert. Refuses anything but a liked or loved. `VerdictStore` is unchanged, and its five-operation surface pin still holds. |
| the insert inside `say` | `writeAct(tx, owner, act)`, exported from `verdicts/store/sql.ts`. `say` now calls it, so there is still one insert path and one validation. |
| `positiveStanding` in the verdict store | `standingWithin(tx, owner, films)` in the verdict store, resolved by the model's `standing()`. The taste-side `positiveAbout` keeps the positive judgements. |
| `VibeRequired extends VerdictError` in the verdict model | `VibeRequired extends TasteError` in `taste/model.ts`, carrying `film` and `movie` (`{ title, year, viewing }` or `null`). |
| `needsVibe(act)` | dropped. The verdict model exports only `POSITIVE` and `isPositive`. |
| MCP `record_verdict` → `verdicts.say(..., option)` | a liked or loved goes to `store.sayFiled`; `disliked` goes to `verdicts.say`, as before. |

### What was built

- **Code:**
  - `web/lib/verdicts/model.ts`: `POSITIVE`, `isPositive`.
  - `web/lib/verdicts/store/sql.ts`: `writeAct` and `standingWithin`; `say` delegates to `writeAct`.
  - `web/lib/taste/model.ts`: `VibeRequired`, `positiveNeedsVibe()`, `vibeHoldsPositive()`.
  - `web/lib/taste/store.ts` and `store/sql.ts`:
    - `sayFiled`, through `requireFiled`;
    - `updateMovie(…, { positiveNeedsVibe })`, refusing only when the filing goes from at least one
      Vibe to none, under the movie's `FOR UPDATE`;
    - `deleteVibe(…, { positiveNeedsVibe })`, checked after `same(…)`, with every filed film and
      the vibe held. `onlyHere` finds the films whose only Vibe this is. The refusal is thrown and
      never retried.
  - `web/lib/mcp/server.ts`:
    - `record_verdict` returns the `vibe_required` result exactly as planned: `isError: true`, and
      the payload in both `structuredContent` and the `content` text JSON;
    - `update_movie` and `delete_vibe` pass the option;
    - descriptions for `record_verdict`, `update_movie`, `delete_vibe` and `update_vibe`;
    - `VIBE_REQUIRED_NEXT`;
    - `SERVER_VERSION` unchanged.
- **Text:**
  - both `SKILL.md` files, including the worked examples, first films and merge;
  - `README.md`;
  - `plugin.json` 1.7.0;
  - the M3 and M5 evaluation READMEs.
- **Evaluation:**
  - **Seeders:** verdicts are forgotten before `delete_vibe`.
  - **Fixtures:** five marked `"seed": "pre-vibe-rule"`.
  - **M5 runner:** `isLegacy` is now `seed !== undefined`, and it reseeds only when there is no
    `seed`.
  - **M3 runner:** the M5 rules exactly, with `--legacy-seeded`.

### Test changes (as planned, and where they differ)

- **New tests:**
  - **Taste store:** six tests — refused with nothing written; written as member, core or variant
    spelling; only a liked or loved, and isolation; the unfiling guard both ways; only a standing
    positive keeps a film; the vibe-deletion guard both ways.
  - **Verdict store:** `standingWithin` and `writeAct`.
  - **Verdict model:** `isPositive`.
  - **MCP (`verdicts.test.ts`):** seven tests — the exact `vibe_required` shape and text; the saved
    film with its viewing; the retry, as core and as member, keeping `told` and `because`;
    `disliked` needs nothing; both removal refusals and the moves that are allowed; the
    `forget_verdict` limitation; description pins. Also `update_vibe` pins in `tools.test.ts`.
  - **Website scope pin:** in `web/routes.test.ts` (`DELETE /api/vibes` still deletes). The
    existing test 710 already pins `PATCH /api/verdicts` on an unsaved film.
  - **Four real-PostgreSQL races** in `taste/store/concurrency.test.ts`: save then unfile, unfile
    then save, save then delete-vibe, delete-vibe then save. Each forces the order and asserts the
    second writer was blocked.
- **Adapted tests (fixtures only):** the MCP verdict, taste-verdict, memory, episode and tool tests
  file a film before recording a liked or loved about it.
- **Where the adaptation differs from the plan:**
  - **The M2 runner** files every film a trajectory names into the baseline Vibe during setup, the
    same way in every trajectory. Filing only where a liked verdict occurs would break gate 1,
    which compares the saved films of two trajectories.
  - **The M3 runner** keeps its trajectories unchanged. A step answered `vibe_required` is written
    through the verdict store, as pre-rule or website verdicts were. Its round trip files its two
    films first.
- **Skill pins:**
  - Replaced: the changed sentences in both `test.sh` files and in `recommend-skill.test.ts`.
  - Kept verbatim: the bare-loved, nothing-fits and budget sentences. Their text is unchanged, and
    the new preceding sentence scopes them to a film already filed.
  - Added: twelve `tonight-vibes` pins for the `vibe_required` flow.

### Results

| Check | Result |
| --- | --- |
| Baseline at `f3912b0` | 1347 tests, 1343 pass. The 4 failures are the pre-existing `lib/evaluation.test.ts` ones, which need gitignored `results/`. |
| `npm run test` after | **1364 tests, 1360 pass.** The 4 failures are the same pre-existing ones. |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors; the 2 pre-existing warnings |
| `taste/store/concurrency.test.ts` (real PostgreSQL) | **not executed**: no PostgreSQL server here and no `TEST_DATABASE_URL`, so the four new races skip |
| `skills/*/test.sh`, `chatgpt-plugin/test.sh` | **not executed**: shell scripts need approval this session does not have |
| The same checks, read only | Every `order_check` and whole-file `grep -c` pin in both `test.sh` files was replayed by an equivalent script. Results: 117 + 183 evaluated, 0 failing; the replay also reports 0 failing on the original files. The skipped slice and `sed` checks touch no edited text, and the skipped `grep -c` checks were run directly, all 0 as expected. |

- **Codex implementation review — READY.** No blocking issues. Codex ran:
  - the 13 targeted test files and typecheck;
  - all three shell suites — 126 Vibes, 218 recommendation and 37 plugin checks, 381 in all,
    every one passing;
  - an HTTP-level check: the `vibe_required` refusal reaches the client unchanged and writes
    nothing, and the retry after filing succeeds.

  The real-PostgreSQL races remain unexecuted there too: no PostgreSQL binaries, no test URL, and
  no Docker daemon.
