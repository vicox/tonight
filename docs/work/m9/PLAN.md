# M9 — Episodes: a film evening, offer by offer: plan

Status: **implemented (user approved this plan and the recommended D1–D10). Codex code review is
READY after one fix. Nothing is committed, pushed, merged or deployed.** See *Implementation* at
the end.

- Base: the unmerged M8 commit `818c667`, never `main`. Worktree `tonight-m9-history`.
- Baseline at the base: 1258 tests, 1254 pass. The 4 failures are the pre-existing
  `lib/evaluation.test.ts` ones, which read gitignored evaluation `results/` directories that a
  worktree does not have.
- Every earlier M9 plan, and the Codex verdict on it, is superseded.

## Scope (from the user)

### What M9 changes

**Episodes only:** their persistence, the four existing Episode tools, and the skill's behaviour
when it writes evenings.

**An Episode is one film evening.** It can span several recommendation rounds, and it can include
films the user picked themselves.

**The offer list holds every film of the evening.** Each entry (an Offer) carries an explicit
`offered` flag:

- `true` means Tonight recommended the film;
- `false` means the user brought it up.

**Each offer has four facts, independent of each other:**

| Fact | Meaning |
| --- | --- |
| `chosen` | they intend to watch it |
| `started` | they actually began it; it can be true without `chosen` |
| `finished` | they completed it; it implies `started` |
| `passed` | an explicit "not tonight", with an optional `passReason` |

- **Unknown and no are different.** Unknown (`null`) is never the same as an explicit `false`.
- **Nothing is inferred** from a verdict or from a film being marked seen.
- **An evening can have several offers** chosen, started or finished.

**A film can appear in more than one round.** The plan defines how such a film is identified, how
duplicates are merged, how offers are ordered, what the lead means, and how more than ten offers
across rounds are handled. It adds no round model unless one is needed.

**What must be kept:**

- the original request;
- the source metadata;
- correction and forgetting;
- existing data, carried over by an explicit migration;
- the existing tools, evolved in a backward-compatible way.

**How evenings get written:**

- **After a recommendation, normally.**
- **Updates** happen only when the user refers unambiguously to that evening. An evening is never
  inferred from a film's name or from how recently it happened.
- **A film the user picked themselves** can be recorded even when Tonight recommended nothing.
- The plan defines the lifecycle, the contradictions, rollback and the tests.

### Out of scope

- Any change to Verdicts.
- Any Movie identity or Movie id link.
- Enriching what is read about a Movie, or aggregating history per Movie.
- Changing how recommendations read or filter.
- A separate History.
- Optimising for operations that are only hypothetical.

## Episodes today (`818c667`)

```
tonight_episodes        user_id, id, request text NOT NULL, watched bool NULL, finished bool NULL,
                        request_source, offered_source ('observed' | 'stated'), recorded_at
tonight_episode_offers  user_id, id, episode → episodes ON DELETE CASCADE, position, title, year,
                        lead bool, chosen bool NOT NULL DEFAULT false
                        unique(user_id, episode, position); ≤1 lead; ≤1 chosen   (partial unique)
```

**The model:**

- `record_episode` takes a request (required) and up to 10 offers, with at most one lead and no
  duplicate offer, compared by exact title and year.
- `correct_episode` can do three things:
  - replace the request (it becomes `stated`);
  - replace the offer list (it becomes `stated`);
  - set the one chosen film, plus evening-level `watched` and `finished`.

  A field left out stays as it is; `null` takes a value back to unknown.
- `forget_episode` hard-deletes an evening; `get_episodes` reads them.
- `get_memory` lists each evening under `remembered`. Nothing reads evenings to recommend.

## Design principles (how each decision below was made)

1. **One table of offer rows per evening, no rounds.**
   - An offer is identified by its exact title and year within the evening, so a film offered in
     two rounds is one row.
   - Order is the order in which each offer first appeared.
   - The original request is the evening's request.
   - Rounds would only be worth adding if per-round requests or per-round order had to be
     recorded. Neither is asked for, so they are left out.
2. **Every per-offer fact is a nullable boolean.** `NULL` means unknown, and both `true` and `false`
   are things the user said. One entailment is allowed, because the user specified it:
   `finished = true` implies `started = true`.
3. **An offer the user brought up is in the evening only while something they said about it
   stands.** An offer with `offered: true` is there because Tonight offered it.
4. **Tools evolve without silently changing meaning.**
   - Inputs whose meaning holds are kept: `request`, `offered`, and `record_episode` as it is
     today.
   - Inputs whose meaning cannot hold are refused loudly, never stripped: the old single `chosen`
     and the evening-level `watched` and `finished`.
5. **The release is roll-forward only.**
   - The migration removes evening-level columns the previous build reads, so the previous build
     fails loudly instead of misreading data.
   - Rollback means restoring the backup.

## The proposed data model (episodes v3)

```sql
-- tonight_episodes: the evening
ALTER TABLE tonight_episodes ALTER COLUMN request DROP NOT NULL;
-- existing CHECK (btrim(request) <> '') still holds for a non-NULL request.
-- watched / finished are moved to the offer rows (see Migration) and then dropped:
ALTER TABLE tonight_episodes DROP COLUMN watched, DROP COLUMN finished;

-- tonight_episode_offers: one row per offer of the evening (table name kept, as tonight_mixes is)
ALTER TABLE tonight_episode_offers
  ADD COLUMN offered     boolean,                 -- backfilled true, then NOT NULL, no default
  ADD COLUMN started     boolean,                 -- NULL = unknown
  ADD COLUMN finished    boolean,                 -- NULL = unknown
  ADD COLUMN passed      boolean,                 -- NULL = unknown
  ADD COLUMN pass_reason text,
  ALTER COLUMN chosen DROP DEFAULT,
  ALTER COLUMN chosen DROP NOT NULL;              -- old false (= "not said") becomes NULL

DROP INDEX tonight_episode_offers_lead;           -- a lead per round: several per evening
DROP INDEX tonight_episode_offers_chosen;         -- several offers may be chosen
-- One row per offer. There is deliberately NO unique index on the title (review 2, blocking 1).
-- A raw-title B-tree index fails on long legacy titles: M8 accepts 8,192 characters, which
-- fails with 54000. A digest index rejects unequal titles whose digests collide. Identity is
-- therefore enforced where it is today — M8's duplicate rule is model-only — by the model, on
-- the single write path, under the evening's row lock (see Store). Titles are never truncated
-- or folded.

ALTER TABLE tonight_episode_offers
  ADD CONSTRAINT tonight_episode_offers_lead_offered
    CHECK (NOT lead OR offered),                                   -- only Tonight leads
  ADD CONSTRAINT tonight_episode_offers_finished_started
    CHECK (finished IS NOT TRUE OR started IS TRUE),               -- finished ⇒ started
  ADD CONSTRAINT tonight_episode_offers_passed_not_taken
    CHECK (passed IS NOT TRUE OR (chosen IS NOT TRUE AND started IS NOT TRUE)),
  ADD CONSTRAINT tonight_episode_offers_pass_reason
    CHECK (pass_reason IS NULL
           OR (passed IS TRUE AND btrim(pass_reason) <> '' AND char_length(pass_reason) <= 2000)),
  ADD CONSTRAINT tonight_episode_offers_present
    CHECK (offered OR chosen IS NOT NULL OR started IS NOT NULL
           OR finished IS NOT NULL OR passed IS NOT NULL);         -- theirs only while said
```

**Notes on the schema:**

- **Every offer fact is three-state.** `chosen`, `started`, `finished` and `passed` are each
  `NULL` (unknown), `true` or `false` (said).
  - `passed = false` is allowed but rare: *"no, I didn't turn that one down"*. Taking a pass back
    is normally `null`.
- **`chosen = false`** means they said they are not going with it. `chosen` can be `false` while
  `started` is `true`: they began it anyway.
- **`lead`** now means *"Tonight led with it in some round"*. An offer can only have it while
  `offered` is true.
- **`position`** is the order in which offers first appeared in the evening, and never changes
  for an offer. A film offered again in a later round keeps its first position.
- **`tonight_episodes`** keeps `request` (now nullable), `request_source`, `offered_source` and
  `recorded_at`. The two source columns stay evening-level, exactly as today.

### Terminology: Offer

- **An Offer is one film in an evening's list.** It is either offered by Tonight (`offered:
  true`) or brought up by the user (`offered: false`). It is the Episode's child, named `offers`,
  `Offer`, `OfferStatement` and `MAX_OFFERS_PER_EVENING` throughout the API, the model, the
  skills, the docs and the tests.
  - The name is kept from M8.
  - The `offered` flag is what says whether Tonight actually recommended the film. An Offer with
    `offered: false` is one the user brought up.
- **Three names that are not the collection:**
  - `offered`: the **input** on `record_episode` and `correct_episode` that lists the films
    Tonight offered in a round, or its corrected offered set. Its element type is `OfferedFilm`
    (`{ title, year, lead }`), which is M8's former `Offer` shape, renamed so it cannot be confused
    with the new `Offer`.
  - `offeredSource`: evening-level provenance.
  - `MAX_OFFERED` (10): the per-round limit.
- **Both tools' field descriptions repeat the distinction**, so `offered` and `offers` side by
  side are never ambiguous:
  - `offered: OfferedFilm[]` records Tonight's recommendations;
  - input `offers: OfferStatement[]` supplies what the user said;
  - output `offers: Offer[]` is the evening's entries.

  Description pins in the MCP tests cover this.
- **It is not a Movie.** A Movie (My List) is unchanged and unrelated: an Offer never creates,
  reads or links one.
- **Schema names.** The table `tonight_episode_offers` and its constraints keep their names. They
  now match the domain word, so no mapping is needed.

### Domain types (`lib/episodes/model.ts`)

```ts
type Said = Established<boolean>;                 // { known:false } | { known:true, value, source:'stated' }

type Offer = {
  title: string; year: number;                    // identity within the evening (exact)
  offered: boolean;                               // Tonight recommended it (in any round)
  lead: boolean;                                  // Tonight led with it (in some round)
  chosen: Said; started: Said; finished: Said; passed: Said;
  passReason?: string;                            // only while passed is true
};

type Episode = {
  request: string | null;   requestSource: Source;     // null only for an evening they started
  offers: readonly Offer[];   offeredSource: Source;     // first-appearance order
};

type OfferedFilm = { title: string; year: number; lead: boolean };   // one element of the `offered` input (M8's old `Offer`)

type OfferStatement = {                              // what they said about one offer
  title: string; year: number;
  chosen?: boolean | null; started?: boolean | null;
  finished?: boolean | null; passed?: boolean | null;
  passReason?: string | null;
};

const MAX_OFFERED = 10;         // per round, unchanged
const MAX_OFFERS_PER_EVENING = 50;           // per evening, all rounds and their own offers together
const MAX_PASS_REASON_LENGTH = 2_000;
```

## Semantics

### Identity, rounds, order and lead

- **Identity.** An offer is identified within an evening by its exact title and year (full title,
  compared exactly), the rule `checkOffered` already uses.
  - **It is enforced by the model on the single write path, under the evening's row lock.** Today
    the duplicate rule is enforced the same way, with no DB index.
  - **No digest is involved,** so two different titles can never be treated as one offer.
  - **The skill reuses the spelling the evening already holds**, which `record_episode` and
    `get_episodes` return.
- **A new round** is `record_episode` with `episode`. For each offered film:
  - if it is not yet in the evening, it is appended, `offered = true`;
  - if it is already there, from an earlier round, or as one they brought up (`offered: false`), it gets
    `offered = true`, and its position and stated facts are kept;
  - `lead = true` if it leads this round. A round has at most one lead, as today, but an evening
    may have several.
- **Limits.** A round still holds at most 10 offers. The evening holds at most 50 offers; a call
  that would exceed that is refused. There are no per-round records, and later rounds' asks are
  not stored, so the original request stays the evening's request.

### The four facts

| Rule | Behaviour |
| --- | --- |
| F1 Independence | Nothing is set from anything else, except F2. `chosen` does not imply `started`; `started` does not imply `chosen`; a verdict, a viewing or a later evening never writes any of these. |
| F2 `finished ⇒ started` | See **F2, exactly** below. |
| F3 A pass excludes taking | `passed: true` together with `chosen: true` or `started: true` (resulting state) is refused. If they changed their mind, the same call clears the pass (`passed: null`). |
| F4 Reason | `passReason` only while `passed` is true. It is trimmed and non-blank, at most 2000. Clearing the pass clears the reason. |
| F5 Their offers | An offer with `offered = false` exists only while at least one of its facts is known. Adding one needs at least one known fact. When their last fact is taken back, the offer leaves the evening, and the answer shows it gone. The rule is applied **after** the whole call has merged. |
| F6 An evening they started | An evening with **no request** exists only while it holds at least one offer. When a correction removes its last offer (F5), the evening is **deleted** in the same transaction, exactly as `forget_episode` deletes one. The answer is `{ episode: null, forgotten: <id> }`. Retraction therefore always works (**D8**). An evening that has a request can hold no offers, as today. |
| F7 One statement per offer | A call naming the same offer twice, in `offers` or in `offered`, is refused. A re-offer ORs `lead` in and never clears it; only an `offered` correction can set `lead` false. |

**F2, exactly.** Each call works on `merged = stored ⊕ the keys the call states`. Explicit keys
always take precedence over the entailment.

1. If `merged.finished` is true and the call states `started: false` or `started: null`, the call
   is **refused**. The sentence takes back the start while asserting the finish.
2. Otherwise, if `merged.finished` is true and `merged.started` is false, the call is
   **refused**. A stored no is not overridden by implication; the call must state `started: true`
   with it. Stating `started: true` and `finished: true` together over a stored `started: false`
   is accepted.
3. Otherwise, if `merged.finished` is true and `merged.started` is unknown, `started` becomes
   **true**.
4. The entailed start is stored as an ordinary stated fact, because *"we finished it"* did say
   they began it. No provenance is kept. Taking `finished` back later (`null` or `false`) leaves
   `started` as it is. If they also take back the start, the call states `started` too.
5. `finished: false` implies nothing about `started`.

### Adding and correcting, per offer (merge, not whole-set)

- **`offers: OfferStatement[]`** merges into the evening one offer at a time. Facts left out keep
  their stored values, and `null` takes a fact back to unknown.
- **An offer not yet in the evening** is added as **theirs** (`offered = false`), at the end.
  That is how a film Tonight did not recommend is recorded.
- **There is no whole-set field**, so a statement about one offer cannot erase another.
- **`offered` (on `correct_episode`)** corrects Tonight's own record: *"you didn't offer X"*,
  *"you also offered Y"*. Its meaning is kept from today: the list given becomes exactly the set
  Tonight offered, with leads as given, and `offeredSource` becomes `stated`.
  - Offers leaving that set become `offered = false` and `lead = false`. They stay only if a fact
    stands (F5). This replaces today's refusal of *"dropping the chosen film"*: their choice is
    kept on an offer with `offered: false`.
  - An offer in the new list that is already present becomes offered and keeps its facts and its
    position. New offers are appended in the order given.
  - The list may hold up to `MAX_OFFERS_PER_EVENING`.
- **`request`** works as today on `correct_episode`: it is replaced and becomes `stated`. A
  request cannot be removed. An evening recorded without one can gain one.

### Lifecycle of an evening

1. **After a reply that recommends films:** `record_episode({ request, offered })`. This is
   unchanged.
2. **Another round in the same conversation for the same evening:** `record_episode({ episode,
   offered })` appends. The agent uses the `episode` id it was given in this conversation and
   never looks up a "recent" evening.
3. **Statements about that evening's offers:** `correct_episode({ episode, offers: [...] })`. These
   are only made when they unambiguously refer to that evening:
   - a reply in the conversation that recorded it;
   - or naming it (*"the ones you suggested Friday"*).

   A film's title, or recency, is never the reference.
4. **An evening Tonight was not asked about**, such as *"I'm watching Heat tonight"*, or *"we
   watched Heat last night"* when they refer to no recorded evening:
   `record_episode({ offers: [{ Heat, ... }] })`, with no `request` and no offers. This is the
   **only** way an evening without a request is created. *"I've seen Heat"* (a viewing, at any
   time) never creates an evening.

**The attribution rule, in full.** It covers steps 2–4, and reconciles D5 with *"no evening is
inferred"*:

- **(i) Updating an existing evening** needs an unambiguous reference to that evening. That means
  its id from this conversation, or their naming it. A title or recency is never a reference.
- **(ii) Telling you about an evening of watching of their own** that names no recorded evening
  creates **a new** evening, with no request (D5). It never attaches to an existing one.
- **(iii) Anything else is written to no evening**, and no question is asked in order to file it.
  This includes a statement that might be about a recorded evening but does not say so, an
  opinion, and a viewing.
5. **Corrections** at any point use `correct_episode`. **Forgetting** uses `forget_episode`, as
   today.

**`record_episode` can carry statements too.** It also accepts `offers` (statements made in the same
breath, mainly for step 4). An evening is refused if it would have no request and no offer.

## Tools (still 20)

### `record_episode`

```
{ episode?: uuid,                                   // NEW: append a round to that evening
  request?: string,                                 // was required; required when a new evening has offers;
                                                    // refused together with `episode`
  offered?: [OfferedFilm] (≤10, ≤1 lead),           // { title, year, lead }; was required; now optional, default []
  offers?: [OfferStatement] (≤50) }                   // NEW: their own statements, same shape as below
```

The answer is the whole evening. Today's calls (`request` + `offered`) behave exactly as now.

### `correct_episode`

```
{ episode: uuid,
  request?: string,                                 // unchanged
  offered?: [OfferedFilm] (≤50),                    // unchanged meaning: Tonight's offered set
  offers?: [OfferStatement] (≤50),                    // NEW: per-offer facts, merge
  chosen?, watched?, finished?  → REFUSED: "facts are per offer now — offers: [{ title, year, chosen | started | finished | passed }]" }
```

- The input object becomes **strict**, so any other unknown key is refused rather than stripped.
- **The answer** is `{ episode }`, or `{ episode: null, forgotten: <id> }` when F6 deletes the
  evening. Annotations change to `destructiveHint: true`; `idempotentHint` stays `true`.
- **`record_episode`'s `offers`** only fill unknown facts or a missing reason. `null`, changing a
  known fact, and replacing a reason are refused and routed to `correct_episode`. Its annotations
  stay unchanged and non-destructive.
- The descriptions state F1–F5, the merge rule, and the attribution rule (update only on an
  unambiguous reference to that evening).

### `get_episodes` (output changes)

```
{ id, recordedAt, request: string | null, requestSource?, offeredSource,
  offers: [{ title, year, offered, lead,
            chosen, started, finished, passed,          // Established<boolean> each
            passReason? }] }
```

**This replaces** `offered`, `chosen`, `watched` and `finished`. `requestSource` is absent when
there is no request.

**This is a breaking change to the read contract (D4).** The old `chosen` and the evening-level
`watched` / `finished` have no faithful projection once an evening can hold several chosen offers
and per-offer outcomes, so no compatibility fields are derived. The transition:

- the tool descriptions and schemas change in the same deploy;
- the skills ship in the same release (plugin 1.6.0);
- no other client reads these tools;
- hosts may cache tool definitions, so connected hosts are **reconnected and verified** after the
  deploy (release steps 6–7, D10). Until a host is refreshed, its old write fields are refused
  loudly (D4).

### Unchanged tools, and `get_memory`

- **`forget_episode`** is unchanged.
- **`get_memory`:** the evening root carries the same fields as `get_episodes`, passed through by
  `compose`, and the description is updated.

## Migration (episodes v3, one transaction, roll-forward only)

### What it does

1. **Classify** (read-only; shared with a new `npm run db:preflight-m9`):
   - **Attributable:** an evening with a chosen offer and evening-level `watched` / `finished`
     known.
   - **Blocker — unattributable** (decision D2): an evening with `watched` or `finished` known and
     **no** chosen offer. These cannot be put on an offer without guessing which one.
   - **Blocker — contradiction:** an evening with `finished = true` and `watched = false`, which
     would break F2.
   - **Blocker — duplicate identity:** two offers of one evening with the exact same title and
     year. The old database never forbade this, although `checkOffered` refused it. The model
     must be able to read every evening, so these are resolved first, by correcting that evening's
     offer list with the running build.

   There is no title-length blocker and no title index. A title of any length is kept exactly.

   **The pre-flight** follows M8's wrapper. It reads in a `READ ONLY, REPEATABLE READ`
   transaction, and checks the ledger first: it answers `applied` once episodes v3 is recorded,
   before it touches any column that v3 drops.

   Blockers refuse the migration. The error names `user_id` and the episode id, nothing is
   changed, and the version is not recorded. Each blocker is resolved first with the running
   build: set the outcomes to `null`, or set the chosen film if the user says which it was.
2. **Columns:** add the new columns. Backfill `offered = true` (every existing row was offered),
   then `SET NOT NULL`. Set `chosen = NULL WHERE chosen = false`. Drop the two partial indexes.
   No index is created on the title.
3. **Move outcomes** onto M8's chosen offer (decision D1):
   - `started := watched`, so a stated no stays a no;
   - `finished := finished`;
   - where `finished = true` and `watched` is unknown, `started := true`, by F2.
4. **Add the CHECKs, and drop** `tonight_episodes.watched, finished`. Make `request` nullable.

### What it preserves

- requests and their sources;
- the offers, with their order and leads;
- the choice, now `chosen = true`;
- every outcome that can be attributed;
- refs (episode ids) and `recorded_at`.

### Release

- **Steps:**
  1. `db:preflight-m9`, then resolve what it lists.
  2. Stop the application.
  3. Back up.
  4. `npm run db:migrate`.
  5. Deploy.
  6. **Refresh connected hosts** (review 2, blocking 4). MCP clients may cache tool definitions,
     and Tonight's endpoint is stateless per request, so it cannot push `tools/list_changed`.
     After the deploy, reconnect the Tonight connector in each host — ChatGPT's app or connector
     settings, Claude's MCP connection — so that each runs discovery again.
  7. **Verify discovery against production.** Run `tools/list` and check that:
     - `correct_episode` takes `offers` and is strict;
     - `record_episode` takes `episode` and `offers`;
     - the descriptions are the M9 ones.

  `SERVER_VERSION` moves from 0.1.0 to 0.2.0, so a host that compares `serverInfo` sees the
  change.

  **A host still on stale definitions fails loudly rather than silently.** Its old `correct_episode`
  fields are refused with a routing message (D4). Its `get_episodes` reads return the new
  `offers[]` shape, which it can still parse as JSON.
- **The previous build against v3 fails loudly.** Its reads select the dropped columns, and its
  inserts omit `offered NOT NULL`. It never misreads data.
- **Rollback** means restoring the backup and redeploying the previous build.
- **Combined with M8:** follow M8's procedure, with both pre-flights run first.

## Store (`lib/episodes/store/sql.ts`)

- **Writes go through one path.**
  1. Lock the episode row `FOR UPDATE`.
  2. Assemble the current evening.
  3. Apply the pure model (`addRound` / `correct`). Every rule, including identity, is checked on
     the resulting evening before any SQL.
  4. Take one of two branches:
     - **Normal:** update the episode row, then **replace the evening's offer rows** with the
       model's list. The rows are deleted and re-inserted with positions as computed, so the
       CHECKs see only final rows. Today's offer replacement already does this, and offer row ids
       are not exposed anywhere.
     - **F6:** when the model's result has **no request and no offer**, `DELETE` the episode row
       instead, and the offers go with it by cascade. The store returns `{ forgotten: id }`.
  - **The two cases are distinct.** Creating an evening with neither a request nor an offer is
    **refused**, as an `EpisodeError` with nothing written. Deleting under F6 happens only to an
    **existing** evening, and only in `correct`.
  - **Store result types:**
    - `record(episode)` and `addRound(id, round)` return `Recorded<Episode>`;
    - `correct(id, correction)` returns `Recorded<Episode> | { forgotten: string }`.
- **`record_episode` is additive only** (review 2, blocking 3; review 3, blocking 1).
  - In `record_episode`, a `OfferStatement` may only **fill what is unknown**:
    - a fact goes from unknown to `true` or `false`;
    - a `passReason` is given where there is none.
  - Restating the stored value is a no-op. That includes a `passReason` identical to the stored
    one after trimming.
  - **Refused**, with a message routing to `correct_episode`:
    - `null` (a retraction);
    - a fact that is already known, set to a different value;
    - a **different** `passReason` where one is stored.

    A refusal refuses the whole call, round included.
  - The round's own effects are additive too: an offer is appended, `offered` false becomes true,
    and `lead` is ORed in.
  - So `record_episode` never removes or overwrites anything, and stays `destructiveHint: false`
    within MCP's meaning, "additive updates only". Every change or retraction belongs to
    `correct_episode`.
- **Identity on every write path.** `record(episode)`, for a new evening, runs the same model
  validation as the other paths: exact identity, F1–F7 and the limits. Writes to an existing
  evening validate after taking its row lock.
- **`record(episode)` persists a whole Episode**, including statements: one insert for the
  evening, then its offer rows.
- **Concurrency.** Every write on an evening holds that evening's row lock. Nothing outside the
  episode store writes Episodes, and no Movie is involved.

## Skill write behaviour (`tonight-recommend`, `tonight-vibes`)

| They say | Write |
| --- | --- |
| (after a recommending reply) | `record_episode` — a new evening, or `episode` for another round of the same evening |
| *"I'll go with X"*, *"let's do X"* | `chosen: true` |
| *"we're watching X"*, *"we started X"* | `started: true` |
| *"we finished it"* | `finished: true` (makes `started` true) |
| *"turned it off halfway"* | `started: true, finished: false` |
| *"we didn't watch it"* | `started: false` |
| *"actually not that one"* (about a choice) | `chosen: false` |
| *"not tonight"*, *"not in the mood"*, *"nah, not that one"* | `passed: true`, with `passReason` their words, if any |
| *"we're watching Heat instead"* (not offered) | Heat with `started: true`, as theirs |
| *"I'm watching Heat tonight"* with no recorded evening referred to | `record_episode({ offers: [{ Heat, started: true }] })` |
| *"loved Arrival"* | never an evening (it is a verdict, per M8) |
| *"I've seen it"* | never an evening (it is a viewing) |

- **The attribution rule** (review 2, blocking 2) — the complete rule, written into both skills
  and replacing the old blanket sentence:
  - **(i)** A statement **updates** an evening only when it unambiguously refers to that evening:
    its id from this conversation, or their naming it. A title or recency is never a reference.
  - **(ii)** A report of an evening of their own watching that names no recorded evening —
    *"I'm watching Heat tonight"*, *"we watched Heat last night"* — **creates a new** evening with
    no request. It never attaches to an existing one.
  - **(iii)** Anything else writes to **no** evening, and no question is asked in order to file
    one. That includes a statement that might be about a recorded evening but does not say so, an
    opinion, and a viewing.
- **Tonight is never inferred:** an offer the user brought up is `offered: false`, even if Tonight
  might have suggested it some other time.
- **Text changes:**
  - **`tonight-vibes`:** the *"I watched it last night"* route and the *"not tonight"* row.
  - **"Not tonight" outside Episodes (D3).** Six places say it is written nowhere: the
    `record_verdict` description, the `NOT_A_VERDICT` text, the `viewing` field description, the
    README, the privacy page, and `tonight-recommend`'s turn-down bullets. The proposal is to edit
    only that wording, to *"never a viewing or a verdict; at most a pass on that evening"*.
  - **The privacy page's evening paragraph:** films they brought up themselves, per-offer facts, and stored pass
    reasons.
  - **`plugin.json`:** 1.6.0.

## Tests

### Model (`episodes/model.test`)

- F1–F5, each refusal leaving the evening unchanged.
- **Identity and rounds:**
  - a round re-offers an offer already present, keeping its position and facts and gaining the
    lead;
  - a round re-offers a film they picked (`offered: false`), which becomes offered and keeps its
    facts;
  - a round with a duplicate inside it is refused.
- **Limits:** the 50-offer cap, and 10 offers per round.
- **`offered` replacement:**
  - an offer leaving the set while chosen stays as theirs;
  - an offer leaving with no facts goes;
  - a re-included offer keeps its position.
- **Merging statements:** two statements in turn about A and B keep both; `null` retracts.
- **Several offers chosen, started or finished** in one evening.
- **Evenings without a request:**
  - one created from statements only;
  - one with neither a request nor an offer is refused;
  - `request` combined with `episode` is refused;
  - **F6:** retracting the last fact of the only offer on such an evening deletes the evening, and
    the answer says `forgotten`;
  - an evening with a request and no offers survives.
- **F2 precedence, one case each:**
  - stored `started: false` plus a statement of `started: true` and `finished: true` is accepted;
  - stored `started: false` plus `finished: true` alone is refused;
  - `started: null` plus `finished: true` is refused;
  - `finished: true` over an unknown start sets `started` to true;
  - retracting `finished` afterwards keeps `started: true`;
  - `finished: false` sets nothing.
- **F7:** a duplicate **within one array** is refused. The same offer may appear in both
  `offered` and `offers` in one call, as an offer plus what they said about it. A re-offer keeps
  `lead`.
- **Identity** is the exact full title: titles differing only in case, or only beyond the 200th
  character, are two offers.

### Store (`episodes/store.test`, PGlite)

- A round-trip of every field, in first-appearance order.
- Appending a round.
- The DB CHECKs refuse the bad shapes directly.
- Failure injection: a failed write leaves the evening as it was.
- User isolation, and `forget` cascades.
- **F6 through the store:**
  - `correct` retracting the last fact of the only offer on an evening without a request deletes
    the evening and its offers, and returns `{ forgotten }`;
  - failure injection on that `DELETE` leaves the evening whole;
  - creating an empty evening is refused, with nothing written.
- **`record_episode` is additive.** On a round appended to an evening that has a stored
  `started: true` and a stored pass with a reason:
  - the call is **refused** when it sends any of:
    - `started: false`;
    - `passed: false`;
    - another `passReason`;
    - `null`;
  - restating `started: true`, or the same `passReason` after trimming, is a no-op;
  - filling an unknown `finished` is accepted;
  - **an append that carries new offers and a forbidden fact change is refused whole.** The
    evening stays byte-identical: offers, offers, `lead` flags, facts and reasons;
  - a duplicate inside a new evening's `offered` or `offers` is refused, so `record` validates
    identity.

### Migration (`db/migrate.test`, `db/schemas.test`)

- Every M8 evening shape:
  - offered only;
  - chosen only;
  - chosen with `watched` true or false;
  - chosen with `finished` true while `watched` is unknown, which becomes `started` true;
  - case-variant offers.
- Each converts as specified. Requests, sources, `recorded_at`, ids, order and leads are
  unchanged.
- **Blockers:** each of these refuses with no change:
  - an unattributable outcome;
  - the `finished`/`watched` contradiction;
  - an exact duplicate identity, inserted with raw SQL.
- **Long titles:** a legacy 8,192-character title migrates and keeps exactly the same text, and
  the evening stays correctable afterwards.
- **Pre-flight:** it agrees with the migration and writes nothing.
- **Catalog upgrade:** from the M8 state.
- **The previous build fails loudly.** The pre-M9 select and insert, copied verbatim, error
  against v3.

### MCP (`mcp/episodes.test`, `mcp/memory.test`)

- `record_episode` called today's way behaves identically, apart from the output shape.
- Appending with `episode`.
- An evening of their own (`offers`, no `request`).
- `correct_episode` with `chosen`, `watched` or `finished` is **refused**, writes nothing, and the
  message routes to `offers`. Unknown keys are refused.
- **F6 through the protocol:**
  - `correct_episode` answers `{ episode: null, forgotten: <id> }`;
  - the evening is then absent from `get_episodes` **and** `get_memory`;
  - `correct_episode`'s annotation becomes `destructiveHint: true`, and `record_episode`'s stays
    `false`;
  - both annotations are pinned.
- **Discovery:** `tools/list` through the endpoint shows the new strict `correct_episode` schema,
  the new `record_episode` fields, and `SERVER_VERSION` 0.2.0.
- **The attribution rule:** skill contract pins on both cases — an explicit report of their own
  evening creates a new evening, and an ambiguous reference updates none.
- The output shape of `get_episodes` and `get_memory`.
- Description pins: F1–F5, the merge rule, the attribution rule, and *"never inferred from a
  verdict or a viewing"*.
- Still 20 tools.

### No inference

- `record_verdict` about a film, and `update_movie(viewing: "seen")` for it, leave an evening that
  offered it **byte-identical**. Each runs on its own fixture and asserts success.
- `get_taste` never reads episodes: it is tested with a throwing stub.

### Evaluation harnesses

- **M1 (`lib/episodes/evaluation`):** rewritten for per-offer statements.
  - `Statement` covers `request`, `offered`, `offers`, and a round.
  - `declared()` replays the merge, F2's entailment, F5's removal and **F6's deletion**: an
    evening its script deletes is expected to be absent.
  - The gates check every offer's facts and `passReason` against what was declared (factuality,
    permission, correction, retraction).
  - Success is asserted on every step expected to succeed, and the evening is shown unchanged
    immediately around every refusal.
  - The trajectories cover:
    - every fact moving unknown → true / false → unknown;
    - several offers chosen;
    - started without chosen;
    - the entailment from `finished`;
    - a pass excluding taking;
    - an offer they brought up (`offered: false`), added and then removed by retraction;
    - a film offered again in a later round;
    - the 50-offer cap;
    - gate 7 (taste unchanged).
- **M3 memory harness and `memory/model.test`:** move to `offers`.
- **Other callers of the old Episode inputs.** Their episode fixtures and calls move to the new
  shape: `record_episode` stays as it is, and `correct_episode` sends `offers: [{ …, chosen,
  started, finished }]` instead of `chosen` / `watched` / `finished`. The callers:
  - the M2 runner, `lib/verdicts/evaluation/m2.test.ts:160`;
  - `lib/mcp/taste-verdicts.test.ts:246–281`;
  - `lib/mcp/verdicts.test.ts:495–503`.

  Their existing assertions — that an evening's outcome writes no verdict and no taste — are kept
  exactly. No verdict code or behaviour changes.

### Skill contracts

- Both `test.sh` files and `recommend-skill.test.ts` pin:
  - the table above;
  - the attribution rule;
  - *"never an evening"* for a verdict or a viewing;
  - the per-offer merge;
  - D3's wording.
- `disclosures.test` covers the privacy text.

## Decisions for the user

- **D1 — How M8's evening outcomes move to the chosen offer.**
  - **Recommended:** `watched → started`, so *"they watched it"* means they began it and *"didn't
    watch it"* stays a stated no; `finished → finished`; and where `finished` is true and
    `watched` unknown, `started` becomes true.
  - **Alternative:** move only `finished`, and drop `watched`. Not recommended.
- **D2 — Outcomes with no chosen offer**, which cannot be attributed.
  - **Recommended:** the migration refuses; `db:preflight-m9` lists them; they are resolved by
    hand before release, by `null`, or by the chosen film if the user says which.
  - **Alternative:** drop them automatically, which loses what they said. Or keep them as a legacy
    field on the evening, which adds API surface for rows that are probably rare.
- **D3 — "Not tonight" wording outside Episodes.**
  - **Recommended:** text-only edits in six places.
  - **Alternative:** leave the descriptions contradicting each other.
- **D4 — Tool contract changes.** These are breaking, and need explicit approval.
  - **Writes:** the old `correct_episode` fields `chosen`, `watched` and `finished`.
    - **Recommended:** refuse them loudly with a routing message.
    - **Alternative:** map them. This is ambiguous once an evening can have several chosen offers.
  - **Reads:** `get_episodes` and `get_memory` replace `offered`, `chosen`, `watched` and
    `finished` with `offers[]`.
    - **Recommended:** a clean break in one release. Descriptions and skills ship together, and no
      other client exists.
    - **Alternative:** also return a derived `offered` list for one release. `chosen`, `watched`
      and `finished` cannot be derived faithfully.
  - **Unchanged:** today's `record_episode` calls, `correct_episode` with `request` or `offered`,
    and `forget_episode`.
- **D5 — Evenings Tonight was not asked about** (step 4).
  - **Recommended:** a reported evening of watching that refers to no recorded evening creates its
    own evening, with no request. This can produce two records of one night when the user did not
    say it was the evening Tonight was part of.
  - **Alternative:** record films they brought up only on an evening already recorded.
- **D6 — Limits.**
  - **Recommended:** 10 offers per round and 50 offers per evening.
- **D7 — Release.**
  - **Recommended:** roll-forward only. The previous build fails loudly, and rollback means
    restoring the backup.
- **D8 — An evening they started, once its last offer is retracted.**
  - **Recommended:** the evening is deleted with it (F6). It existed only because of what they
    said.
  - **Alternative:** keep an empty evening, with no request and no offer. That is a record of
    nothing.
- **D9 — The entailed start, once `finished` is retracted.**
  - **Recommended:** it stays (F2.4). *"We finished it"* said they began it, and no provenance is
    stored.
  - **Alternative:** store where `started` came from, so that it can be withdrawn automatically.
    That adds a column.
- **Not proposed: a title-length policy, or any title index.** Identity is the exact full title,
  enforced by the model on the single locked write path, as M8's duplicate rule is. No new title
  restriction needs approval.
- **D10 — Refreshing connected hosts after deploy.**
  - **Recommended:** reconnect the Tonight connector in each host, and verify `tools/list` (release
    steps 6–7).
  - **Alternative:** rely on hosts rediscovering by themselves. Not reliable.

## Review log

- **Superseded** (no verdict carries over): History, History + Verdicts, Episodes + Verdicts +
  links, attribution text only, and outcomes bound to a single chosen film.
- **The user approved the new Episode model direction:** offer entries with `offered`, independent
  per-offer facts, several offers per state, user-picked films, and rounds.
- **Codex review 1 — NOT READY.** Five blocking issues, each resolved:
  1. **The lifecycle of an evening without a request.** Resolved by F6 (deleting it when its last
     film goes; D8), the attribution rule (i)–(iii) reconciling D5, and an optional `offered`
     defaulting to `[]`.
  2. **F2 precedence and lifetime.** Specified exactly (F2.1–F2.5; D9), with a test per case.
  3. **The identity index.** `md5(title)`, so any title length is kept exactly, plus a pre-flight
     blocker for exact duplicates and a long-title migration test.
  4. **Breaking the read contract.** D4 now covers reads as well as writes, and states the
     transition.
  5. **Missed callers.** The M2 runner, `taste-verdicts.test` and `verdicts.test` are added,
     keeping their assertions.

  Notes adopted:
  - F7: duplicate statements are refused, a re-offer keeps `lead`, and F5 is applied after the
    merge;
  - the pre-flight follows M8's wrapper and checks the ledger first.
- **Codex review 2 — NOT READY.** F2, D8 and D9 resolved the model ambiguities. Four blocking
  issues, each resolved:
  1. **Digest collisions.** The digest index is removed. Identity is the exact full title,
     enforced by the model on the single locked write path, as M8's duplicate rule is, so there is
     no collision class.
  2. **A stale skill sentence.** It is replaced by the complete rule (i)–(iii) in both skills, with
     both cases pinned.
  3. **F6 in the store contract.**
     - The write path has a delete branch, with result types `{ forgotten }`.
     - Refusing an empty creation is kept distinct from deleting an existing evening.
     - `record_episode` statements cannot retract, so it is never destructive.
     - `correct_episode` gets `destructiveHint: true`.
     - Store and MCP tests cover the absence from `get_episodes` and `get_memory`, the answer, and
       rollback.
     - The M1 oracle replays F6.
  4. **Hosts may keep cached tool definitions.** Added a reconnect step for each host, `tools/list`
     verification, `SERVER_VERSION` 0.2.0, and D10.

  Note adopted: F7 refuses duplicates within each array.
- **Codex review 3 — NOT READY.** One blocking issue: statements limited to values still let
  `record_episode` overwrite a known fact or reason, contrary to `destructiveHint: false`.
  - **Resolved:** `record_episode` statements only fill what is unknown, a restatement is a no-op,
    and any change or retraction is refused and routed to `correct_episode`. There is a test per
    case.
  - **Notes adopted:** `record` validates identity for a new evening, and the transition wording
    now matches the reconnect procedure.
- **The user asked for a terminology change only: Film → Candidate.** The user then **reverted**
  that choice, and the collection is now **`offers[]`**, typed `Offer` / `OfferStatement`.
  - The Candidate naming was reviewed READY by Codex as a naming change, and that review is
    superseded.
  - Final mapping from the review-4 plan:

    | Review-4 name | Final name |
    | --- | --- |
    | `films` | `offers` |
    | `Film` | `Offer` |
    | `FilmStatement` | `OfferStatement` |
    | `MAX_FILMS` | `MAX_OFFERS_PER_EVENING` |

    It is named that way, rather than `MAX_OFFERS`, so it is not confused with the per-round
    `MAX_OFFERED`.
  - M8's old `Offer` (`{ title, year, lead }`) becomes `OfferedFilm`. It is the element of the
    `offered` input.
  - The table and constraint names (`tonight_episode_offers*`) are unchanged and now match.
    `Movie` is unrelated, as before.
  - **Unchanged:** the semantics, F1–F7, D1–D10 and the architecture.
- **Codex focused naming review (offers) — READY.** No blocking issues:
  - the inputs, the `offers[]` output, the refusal message, the test inventory and the skill pins
    are consistent, and Candidate and Film remain only in the rename history;
  - `offered` and `offers` are distinguishable, and no naming decision is needed;
  - the SQL names match.

  Note adopted: both tools' field descriptions repeat the `offered` / `offers` distinction, and it
  is pinned.
- **Codex review 4 — READY**, pending the user's approval of the exact model and D1–D10. No
  blocking issues, and no further product decisions. Two notes, both adopted:
  - an identical `passReason` (after trimming) is a no-op;
  - a test that an append mixing new offers with a forbidden change is refused whole, with the
    evening left byte-identical.
- **The user approved the implementation** of this plan, with the recommended D1–D10.

## Implementation

**Production code:**

- `web/lib/episodes/model.ts`: rewritten.
  - Types: `Offer`, `OfferStatement`, `OfferedFilm`.
  - Functions: `beginEpisode`, `addRound` (additive), `correctEpisode`, `checkEpisode`, `isEmpty`
    and `shown`.
  - It enforces F1–F7, identity and the limits.
- `web/lib/episodes/store.ts` and `store/sql.ts`:
  - `record`, `addRound` and `correct` (which can return `{ forgotten }`).
  - A single write path: the episode row is locked, the model runs, then the offers are rewritten.
    When the result is empty (F6), the evening is deleted instead.
- `web/lib/episodes/store/schema.ts`: episodes v3 (`offerByOffer`), plus `classifyEpisodes` and
  `episodeBlockers`.
- `web/lib/db/preflight-m9.ts`, `preflight-m9-cli.ts`, and the `npm run db:preflight-m9` script.
- `web/lib/mcp/server.ts`:
  - `record_episode` gains `episode`, `request?`, `offered?` and `offers?`.
  - `correct_episode` becomes strict: it takes `offers`, refuses `chosen` / `watched` /
    `finished`, and is `destructiveHint: true`.
  - `get_episodes` and `forget_episode` answer through `shown`.
  - The D3 wording applies to `movieViewing` and `record_verdict`.
- `web/lib/mcp/identity.ts`: 0.2.0.
- `web/lib/memory/model.ts`: the evening root carries `offers`, and `requestSource` only alongside
  a request.
- `web/lib/verdicts/model.ts`: the D3 wording, text only, in `NOT_A_VERDICT`.

**Text:**

- both `SKILL.md` files;
- `README.md`;
- the privacy and terms pages;
- `plugin.json`, now 1.6.0.

**Tests:**

- **Rewritten:**
  - `episodes/model.test`, `episodes/store.test`;
  - the M1 harness, and the M3 harness with its gates;
  - `memory/model.test`, `mcp/memory.test`, `mcp/episodes.test`.
- **New:**
  - `db/preflight-m9.test`;
  - `episodes/store/concurrency.test`, which runs on a real PostgreSQL through `TEST_DATABASE_URL`.
- **Updated:**
  - `tools.test`, `endpoint.test`;
  - `taste-verdicts.test`, `verdicts.test`, `verdicts/model.test`, `m2.test`;
  - `schemas.test`;
  - `recommend-skill.test`, `disclosures.test`;
  - both skill `test.sh` files.

**Results:**

| Check | Result |
| --- | --- |
| `npm run test` | 1347 tests, 1343 pass. The 4 failures are the pre-existing `lib/evaluation.test.ts` ones, the same as the baseline. |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors; 2 pre-existing warnings in taste test files |
| Real PostgreSQL 17.10 (scratch embedded server, `TEST_DATABASE_URL`) | `episodes/store/concurrency.test`: **3/3** |
| The other DB suites on the same server | 325/331. The 6 failures are pre-existing and none touches M9 (`web/lib/taste` is unchanged since `818c667`): the v5-schema bridge test, and five core-race tests whose fixtures save a film as the M7 default `want-to-see` and then make it a core |
| `skills/*/test.sh`, `chatgpt-plugin/test.sh` | **not executed** — shell scripts need approval this session does not have. Evaluated read-only by an equivalent check, and every new or changed pin holds |

The three real-PostgreSQL tests:

- two rounds adding one film to an evening are serialised by the evening's row lock and leave one
  row;
- an F6 deletion, with a round queued behind it, finds the evening gone;
- v3 converts an M8 evening identically.

- **Codex code review 1 — NOT READY.** Codex ran 458 relevant Node tests, both skill shell
  suites and the plugin packaging test: all passed.
  - **Blocking issue:** `tonight-vibes` stated only half of the attribution rule for *"I watched
    it last night"*.
  - **Resolved:** the bullet and the table row now carry the whole rule:
    - (i) update an evening only on an unambiguous reference, never by title or recency;
    - (ii) a new evening of their own when they named no recorded one;
    - (iii) no evening, and no question, when it is unclear.

    There are five new `test.sh` pins.
  - **Non-blocking, adopted:** the `get_memory` description now names `offers` and the missing
    `requestSource` on an evening they started.
- **Codex code re-review — READY.** The blocker is closed and the note addressed. The Vibes shell
  suite passes 107/107, run by Codex.
