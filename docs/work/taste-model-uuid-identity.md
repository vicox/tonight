# Stable UUID identity for the Taste Model

**Status:** architecture reviewed and settled; **recommended as the next architecture change,
before any Movie work begins**. Implementation has not started — no migration, application code
or test in the repository has been touched. The plan below is written to be handed to an
implementation session unchanged.

Written in English to match the rest of the repository.

---

## 1. Executive recommendation

**Migrate now, before Movies.**

This is sequencing a known identity transition ahead of the features that would depend on it, not
future-proofing:

- **The blast radius is at its minimum today.** Exactly one relation — `tonight_mix_genres` —
  carries name-based relational identity, and the tables hold a closed beta's worth of rows.
- **Every name-keyed relation added first is another table to migrate later.** `MixMovie` should
  be *born* referencing `tonight_mixes(user_id, id)`. Introducing it against a mutable Mix name
  and re-keying it afterwards is strictly more work and more risk than doing the identity change
  first.
- **The Movie roadmap turns Mixes into graph nodes.** Once a Mix is referenced from more than one
  place, "rename rewrites every reference" stops being a bounded cascade and becomes a property
  of the whole model.

What the migration buys directly, in the existing code: a rename becomes an `UPDATE` that touches
one row and writes nothing to `tonight_mix_genres`, because an id is immutable and there is
nothing to cascade. Everything else — case-insensitive lookup, atomic rename, safe deletion,
tenant isolation, the eight-tool MCP surface — is preserved exactly.

There is no trigger to wait for. The next architecture change is this one.

---

## 2. Current architecture

Three tables, one migration (`taste` v1), in `web/lib/taste/store/schema.ts`.

| Table | Primary key | Unique | Foreign keys | Tenant scoping |
| --- | --- | --- | --- | --- |
| `tonight_genres` | `(user_id, name)` | `UNIQUE INDEX tonight_genres_identity (user_id, lower(name))` | — | `user_id` leads the PK |
| `tonight_mixes` | `(user_id, name)` | `UNIQUE INDEX tonight_mixes_identity (user_id, lower(name))` | — | `user_id` leads the PK |
| `tonight_mix_genres` | `(user_id, mix, genre)` | — (index on `(user_id, genre)`) | `(user_id, mix) → tonight_mixes(user_id, name)` **ON UPDATE CASCADE ON DELETE CASCADE**; `(user_id, genre) → tonight_genres(user_id, name)` **ON UPDATE CASCADE ON DELETE RESTRICT** | both FKs carry `user_id` |

Check constraints: non-blank `name` and non-blank `instruction` on both object tables.

**Where names are relational identity:** `tonight_mix_genres.mix` and `.genre` — the only two
places. Nothing else in the repository stores a genre or mix name as a reference.

**Where names are display/API handles:** `Genre.name` / `Mix.name` in `lib/taste/model.ts`; the
`genreName` / `mixName` / `mixGenres` Zod params in `lib/mcp/server.ts`; the website routes
`app/api/{genres,mixes}/[name]`; the rendered chips.

**A detail that shapes the target design:** the foreign keys target the **case-sensitive**
`PRIMARY KEY (user_id, name)`. The folded index is a *separate* uniqueness rule that no foreign
key references — and cannot, because PostgreSQL will not back a `UNIQUE` *constraint* with an
expression index. Identity is therefore already split today: exact spelling for referential
integrity, folded spelling for uniqueness and lookup.

**Lookup.** Every entry point takes a name. `fold()` (`sql.ts:276`) sends candidate names through
`SELECT lower(name) FROM unnest($1::text[]) WITH ORDINALITY` so the folding is PostgreSQL's,
never JavaScript's — the `İ` bug this fixed is pinned by `store.test.ts:344` and `:383`. Rows are
then found with `WHERE user_id = $1 AND lower(name) = $2`.

**Rename.** `updateGenre` locks source — and destination, for a rename — then issues one
`UPDATE … SET name = $3`. `ON UPDATE CASCADE` moves every `tonight_mix_genres` row inside that
same statement. There is no window.

**Delete.** `deleteGenre` locks the row, asks
`SELECT DISTINCT mix FROM tonight_mix_genres WHERE genre = …` so the refusal can name the
blocking mixes, then deletes; `ON DELETE RESTRICT` is the backstop. `deleteMix` cascades its
reference rows away.

**Locking.** `lockNames()` folds both names, deduplicates and sorts with `inLockOrder()`, then
takes `FOR UPDATE` one row per statement — one statement each because lock order inside a single
statement is the planner's business. `holdGenres()` takes `FOR KEY SHARE` on each referenced
genre **in the same order**, which is what removes the rename-vs-reference deadlock cycle.
`taste()` runs at `REPEATABLE READ`.

**Tenant isolation.** Structural, three ways: `sqlTasteStore(driver, user)` closes over `owner`
and no method accepts a user; every statement names `user_id = $1`; and both foreign keys are
composite on `(user_id, …)`, so a cross-tenant reference is not expressible.

---

## 3. Target schema — the final contracted state

Names cease to be relational identity. Nothing in the final schema depends on `Genre.name` or
`Mix.name` for referential integrity; names remain the public handle, resolved through
PostgreSQL `lower()`.

```
tonight_genres
  user_id      text NOT NULL
  id           uuid NOT NULL DEFAULT gen_random_uuid()
  name         text NOT NULL
  instruction  text NOT NULL
  created_at, updated_at

  PRIMARY KEY (user_id, id)                          -- tenant-safe FK target
  UNIQUE (id)                                        -- global object identity
  UNIQUE INDEX (user_id, lower(name))                -- human handle, tenant-scoped
  CHECK btrim(name) <> '' , CHECK btrim(instruction) <> ''

tonight_mixes
  … identical shape …

tonight_mix_genres
  user_id   text NOT NULL
  mix_id    uuid NOT NULL
  genre_id  uuid NOT NULL
  position  integer NOT NULL

  PRIMARY KEY (user_id, mix_id, genre_id)

  FOREIGN KEY (user_id, mix_id)
    REFERENCES tonight_mixes (user_id, id)   ON DELETE CASCADE
  FOREIGN KEY (user_id, genre_id)
    REFERENCES tonight_genres (user_id, id)  ON DELETE RESTRICT

  INDEX (user_id, genre_id)                          -- reverse lookup for delete-refusal
```

**`ON UPDATE CASCADE` is gone.** An id is immutable, so there is nothing to cascade — which is
the point of the whole exercise.

### Why these keys

| Concern | Mechanism |
| --- | --- |
| object identity | `id` |
| tenant uniqueness | `user_id` leads the primary key, as it does today |
| **FK tenant safety** | the composite `(user_id, id)` target |
| global lookup (future sharing) | `UNIQUE (id)` |
| human handle | `UNIQUE INDEX (user_id, lower(name))`, unchanged |

**A single-column `genre_id uuid REFERENCES tonight_genres(id)` would destroy structural tenant
isolation.** A UUID is unique with high probability; that is a *collision* property, not an
*authorization* property. Only the `user_id` inside the foreign key prevents user A's mix from
naming user B's genre.

### Mechanics verified against this repository's engine

```
engine: PostgreSQL 18.3 (PGlite 0.5.8)
gen_random_uuid()                                    OK
uuid_generate_v4()                                   NO   (uuid-ossp absent — do not use)
uuid column with DEFAULT gen_random_uuid()           OK
composite FK (user_id,id) -> (user_id,id)            OK
FK targeting a plain unique INDEX                    OK
ALTER TABLE … DROP CONSTRAINT <old pk>               OK
ALTER TABLE … ADD PRIMARY KEY USING INDEX <idx>      OK   (with an FK already depending on it)
UNIQUE (id) alongside                                OK
UNIQUE constraint from an expression index           NO   ("contains expressions")
```

Two consequences the migration depends on:

- **`gen_random_uuid()` is built in** (PostgreSQL ≥ 13) — no `CREATE EXTENSION`, which matters
  because the production path must never run that DDL. **Preflight the production server
  version.**
- **The tenant index created during expansion can be promoted to the primary key during
  contraction** with `ADD PRIMARY KEY USING INDEX`, even while a foreign key already depends on
  it. That gives a clean contract with no duplicate index and no drop-and-recreate of the FKs.

Accordingly the expansion creates `(user_id, id)` as a **plain unique index**, not a constraint:
a foreign key may target it, and only an index (never a constraint) can later be promoted.

---

## 4. Public MCP impact

**Nothing changes. Eight tools, same names, same schemas, same handlers.** UUIDs stay inside the
store.

**Do not expose UUIDs.** No caller has a reason to hold one: `create_mix` takes genre *names*, the
website routes are `/api/genres/[name]`, and the skill's whole vocabulary is names.

**`get_taste` remains name-only.** Its consumers — `TasteView`, `TasteAdvanced`, `Prompt`, the
skill — key on names. Adding `id` would enlarge every response an agent reads for no behaviour it
enables.

### Private identity flow

PostgreSQL generates the ids, and the domain objects stay name-only. The store therefore needs a
private representation that carries an id alongside the public shape, used **only** between
resolution and the relationship write:

- `createMix` must capture its generated id:
  `INSERT INTO tonight_mixes (…) VALUES (…) RETURNING id`, and pass that id — not the name — into
  `writeMixGenres`.
- `updateMix` already locks its row; `lockNames` must select `id` so the update path has the mix
  id available for the delete-and-rewrite of reference rows.
- `resolveGenres` returns `{ id, name }` per resolved genre; `holdGenres` returns the ids it held.
  `writeMixGenres` writes those ids.
- `Genre`, `Mix` and `Taste` in `lib/taste/model.ts` are unchanged. The `TasteStore` interface in
  `lib/taste/store.ts` is unchanged. The private row type lives in `store/sql.ts` and goes no
  further.

**One documentation change is required**, because a sentence becomes false:

> `lib/mcp/server.ts:52` — *"This is its only identifier; **there is no separate id**."*

After the migration there is a separate id; it is simply not exposed. The clause must say the name
is the only identifier *the API takes*. The same applies to `schema.ts:9-10` (*"There is no
surrogate id"*), which becomes the record of a decision that was reversed and must be rewritten,
not deleted.

---

## 5. Name-resolution architecture

Unchanged in shape, one hop longer:

```
MCP input name
  → normalise()                     whitespace only — lib/taste/model.ts
  → fold() via SELECT lower($1)     PostgreSQL decides identity — never JS
  → SELECT id, name, instruction
      WHERE user_id = $1 AND lower(name) = $2  FOR UPDATE
  → mutate BY (user_id, id)
  → return the stored spelling
```

**PostgreSQL-authoritative resolution is strengthened, not regressed.** Every entry point still
takes a name, so `fold()` remains on the hot path exactly as today. The only change is that what
gets *written into the relation* becomes an id instead of a stored spelling. Exact stored spelling
stays meaningful: `resolveGenres` already returns the stored spelling and will now return it
alongside the id, with the name still the thing shown. Case-insensitive uniqueness is untouched
because the folded index is untouched.

`resolveGenres` keeps its one-round-trip folding of both sides and its duplicate collapsing on the
database's key.

---

## 6. Concurrency and locking

**Locks stay on tenant-scoped folded names. Do not move them to ids.** Three reasons from the
code:

1. **The input is a name.** Locking by id requires first finding the row by folded name — the same
   statement that currently takes the lock. Moving the lock to a second statement on id adds a
   window between find and lock that does not exist today.
2. **The rename-swap deadlock is a contest over names, not ids.** `A → B` while `B → A`: the
   destination row for a rename is identified by *name* and may not exist at all. There is no id
   to order by. `inLockOrder()` must keep sorting folded name keys.
3. **`holdGenres` is a contest between a rename and a reference-write**, and the rename's side of
   that cycle is name-ordered. The two must share one order or the cycle returns.

So `lockNames`, `inLockOrder`, `lockGenre`, `lockMix` and `holdGenres` keep their present
structure and their comments. The changes are narrow: the locked row type gains `id`;
`holdGenres` returns the ids it held; `lockMix` reads its reference list by `mix_id` and joins to
`tonight_genres` for the display names.

`REPEATABLE READ` on `taste()` is unaffected.

**One genuine simplification:** `updateMix` currently deletes and rewrites `tonight_mix_genres`
*after* the rename, relying on the cascade having already moved the rows to the new name
(`sql.ts:221-229`). With ids the reference rows never move, so that ordering dependency
disappears. Note it; do not restructure around it.

---

## 7. Tenant isolation

Mechanism today, and unchanged after: **composite foreign keys carrying `user_id`.** A row in
`tonight_mix_genres` names one `user_id`, and both foreign keys resolve within it — there is no
expressible row in which a mix of user A references a genre of user B.

Belt and braces beyond the foreign key, all already present: `sqlTasteStore` closes over `owner`,
no method takes a user, `signedInVisitor()` resolves the owner from a session cookie and nothing
else, and every statement names `user_id = $1`. The migration must not relax any of them.

**The existing store test does not prove this.** `store.test.ts:140` builds a mix through
`alice.createMix({ genres: ["Sci-Fi", "Bob only"] })` and asserts the refusal
`"Bob only" is not one of them`. That refusal comes from `resolveGenres`, which resolves names
within `user_id` and never reaches the database's referential check. **The test passes identically
against a single-column foreign key.** A direct database-level test is therefore required — see
[Test plan](#10-test-plan), item 1.

---

## 8. Migration strategy

### The deployment constraint, stated correctly

The previous version of this plan claimed `requireSchema()` protects an old build from a database
that has moved ahead of it. **It does not, and the code says so explicitly.**

- `requireSchema()` (`migrate.ts:62-98`) is documented to *tolerate* a database migrated by a
  newer deploy — *"which is what a rollback looks like, and it should not be an outage."* It
  checks only that versions the code wants are present.
- `prepared()` (`store.ts:102-115`) caches the successful check **once per process**. An instance
  that started before the migration never re-checks.

So an old Vercel instance will keep serving happily against a contracted schema and will fail only
when a statement touches a dropped column — mid-request, in production. **Nothing in this
repository can prove that all old instances have drained.** There is no instance registry, no
heartbeat, no request-drain signal available to the application. Blanking `ALLOWED_EMAILS` blocks
new website sessions but does not invalidate already-issued MCP access tokens, which are signed
and stateless by design — so it is a partial lever, not a drain.

**Therefore: expansion is zero-downtime; contraction is not, and must not be claimed to be.**

| Phase | Downtime | Why |
| --- | --- | --- |
| EXPAND | none | purely additive; old readers and writers unaffected |
| BRIDGE CODE | none | ordinary rolling deploy |
| DRAIN | none | waiting, not acting |
| RECONCILE | none | data-only backfill |
| VERIFY | none | reads only |
| **CONTRACT** | **maintenance boundary required** | destructive DDL with no way to prove drain |
| FINAL CODE | none | deployed immediately after CONTRACT |

If a maintenance boundary is unacceptable, the correct response is to **stay expanded longer** —
the compatibility schema is stable and can be held indefinitely — not to contract optimistically.

### EXPAND — migration `taste` v2, additive only

Old code must keep working throughout. Append v2; never edit v1.

1. `ALTER TABLE tonight_genres ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid()` and the same
   for `tonight_mixes`. Old inserts never mention the column and receive a default.
2. `CREATE UNIQUE INDEX tonight_genres_tenant_id ON tonight_genres (user_id, id)` and the same for
   mixes. **A plain index, not a constraint** — a foreign key may target it, and only an index can
   later be promoted to the primary key.
3. `ALTER TABLE … ADD CONSTRAINT … UNIQUE (id)` on both.
4. `ALTER TABLE tonight_mix_genres ADD COLUMN mix_id uuid NULL, ADD COLUMN genre_id uuid NULL`.
   **Nullable is mandatory:** an old instance inserts `(user_id, mix, genre, position)` and
   supplies no ids.
5. Backfill:
   `UPDATE tonight_mix_genres r SET mix_id = m.id FROM tonight_mixes m
    WHERE m.user_id = r.user_id AND m.name = r.mix`, and the same for genres.
6. Add both composite foreign keys on the id columns. They permit NULL while the columns are
   nullable, so old writers remain legal.
7. `CREATE INDEX tonight_mix_genres_genre_id_index ON tonight_mix_genres (user_id, genre_id)`.
8. **Keep** the old primary keys, the name columns, their foreign keys and the `ON UPDATE CASCADE`.

The old `PRIMARY KEY (user_id, name)` cannot be dropped here: the old name-based foreign keys
depend on it, and old instances still use it.

### BRIDGE CODE — deploy

The store writes **both** representations on every reference insert — `mix`, `genre`, `mix_id`,
`genre_id` — and reads by id, falling back to the name join where `mix_id IS NULL`. Renames still
cascade the name columns, harmlessly. This build is compatible with the expanded schema and
coexists with old instances.

**What a single worktree can hold.** *(Recorded during implementation.)* The bridge store and
the final store are mutually exclusive: the bridge writes `mix` and `genre`, which v3 drops, and
`requireSchema()` makes any build require every migration its code declares. So the repository
rests at **FINAL CODE** — v2 and v3 both appended, the store addressing rows by id only. Taking
the zero-downtime expansion path therefore means deploying an intermediate commit that declares
v2 alone and carries the dual-write store: a deployment artifact, not a state the repository
holds. If the operator instead takes one maintenance boundary for the whole change — minutes, for
a closed beta — v2 and v3 apply together and no bridge build is needed. Either way the
reconciliation runs, because v3 begins with it.

### DRAIN

Wait until no instance from before the bridge deploy can still be serving. This cannot be proven
from inside the application; it is an operator judgement based on the platform's rollout and
connection behaviour. Being generous here costs nothing.

### RECONCILE — one-time backfill, after the drain

An old instance can have inserted reference rows with NULL ids *after* the v2 backfill ran. The
read fallback displays those rows correctly but **does not repair them**. So repeat the backfill
from EXPAND step 5 as an explicit one-time reconciliation.

A transactional read-repair inside the store was considered and rejected: it would add a write
path to a read, on every request, to fix a condition that exists only inside one bounded window.
One reconciliation statement after the drain is smaller and provably complete.

*Implemented as* `RECONCILE_MIX_GENRES` in `store/schema.ts`: one guarded, idempotent statement
pair used three times — as v2's backfill, by the operator after the drain, and as v3's opening
lines. Three copies would be three chances to disagree about what the same row is.

### VERIFY — gate, must pass before CONTRACT

1. `SELECT count(*) FROM tonight_mix_genres WHERE mix_id IS NULL OR genre_id IS NULL` → `0`.
2. Correspondence: every row's `mix_id` resolves to the mix its `mix` column names, and every
   `genre_id` to the genre its `genre` column names, within the same `user_id`.
3. No orphans: every `mix_id` and `genre_id` exists in the parent table under the same `user_id`.

Do not proceed unless all three hold.

### CONTRACT — migration `taste` v3, destructive, behind a maintenance boundary

1. Take traffic off the deployment.
2. Back up the database. **This is the only irreversible step in the plan.**
3. Drop the two name-based foreign keys on `tonight_mix_genres`.
4. `ALTER TABLE tonight_mix_genres SET NOT NULL` on `mix_id` and `genre_id`; drop the old primary
   key; `ADD PRIMARY KEY (user_id, mix_id, genre_id)`; drop columns `mix` and `genre`; drop the
   old `(user_id, genre)` index.
5. On both object tables: `DROP CONSTRAINT <old pkey>`, then
   `ADD PRIMARY KEY USING INDEX <tenant_id index>`. The new composite UUID primary keys become
   active here, and the id-based foreign keys keep working across the promotion — verified above.

Steps 3–5 are one transactional migration, so the schema is never half-contracted.

### FINAL CODE — deploy immediately

Remove the dual write and the name fallback; rewrite the `schema.ts` header comment and the one
MCP clause. Restore traffic.

---

## 9. Rollback and failure modes

| Failure | Prevention / detection |
| --- | --- |
| Missing backfilled object ids | `DEFAULT gen_random_uuid()` + `NOT NULL` from the moment the column exists — a row without one is not expressible |
| Missing `mix_genres` ids | nullable by design during expansion; RECONCILE repairs them after the drain; the VERIFY gate counts them; `SET NOT NULL` in CONTRACT fails loudly rather than silently |
| **NULL ids written after the initial backfill** | RECONCILE exists specifically for this. Do not rely on the read fallback, which displays such rows but never repairs them |
| Wrong `mix_id`/`genre_id` mapping | the backfill joins on `(user_id, name)`, the exact key the current foreign key already enforces; the correspondence check proves it |
| **Cross-tenant references** | the composite `(user_id, id)` foreign key — and the direct database test in the test plan, because no existing store test would catch a single-column FK |
| Rename during EXPAND or BRIDGE | `ON UPDATE CASCADE` is retained until CONTRACT, so a rename moves the name columns while the ids stay valid; both representations remain correct |
| **Old instance ↔ contracted schema** | the reason CONTRACT requires a maintenance boundary. `requireSchema()` does **not** protect this: it tolerates a database ahead of the code, and `prepared()` caches its check once per process |
| New build ↔ un-migrated schema | `requireSchema()` does cover this direction, refusing with a `ConfigurationError` that names the missing version |
| Partially contracted schema | steps 3–5 of CONTRACT are one transactional migration |
| UUID function unavailable | preflight `SELECT gen_random_uuid()` against production before writing v2. No `CREATE EXTENSION` — production must not run that DDL |
| Unicode/case lookup regression | `fold()` and the folded index are untouched; `store.test.ts:344` and `:383` must stay green unmodified |
| Concurrency regression | `inLockOrder` keeps sorting folded names; `store.test.ts:669` must stay green unmodified |

**Rollback.** Everything up to and including RECONCILE is additive: reverting the code leaves a
schema that is a superset, and old code works untouched. After CONTRACT the name columns are gone
and rollback means restore-from-backup — which is why the backup is taken immediately before
CONTRACT and nowhere else.

---

## 10. Test plan

The existing store tests are the specification. **The strongest signal that the migration is
behaviour-preserving is that almost all of them pass unmodified** — so change as few as possible.

Unchanged, and must stay green as-is: case-insensitive lookup (`:156`, `:172`), the two `İ` tests
(`:344`, `:383`), conflict-detection agreement (`:421`), rename carries mixes (`:551`), delete
refusal names the mix (`:586`), lock ordering (`:669`), snapshot consistency (`:630`, `:729`),
duplicate collapsing and stored spelling (`:523`), and the existing cross-tenant test (`:140`) —
which stays because it protects name-resolution scoping, not because it proves the foreign key.

New tests are scheduled by **the schema phase in which the property they assert actually
exists**. Three of them are false under the compatibility schema and would fail if written
earlier — not because the code is wrong, but because the expanded schema deliberately keeps
legacy name-based relational identity alive for old instances.

### Valid under the compatibility schema — write and run during EXPAND and BRIDGE

1. **A rename preserves the id.** Read the id, rename, read again, assert equal.
2. **A mix survives a genre rename.** Rename, then `taste()`, and assert the mix names the new
   spelling.
3. **Reconciliation.** Insert a reference row with NULL ids as an old instance would, run the
   reconciliation statement, assert the ids are filled and correspond.
4. **v2 expand round-trip.** Seed v1-shaped rows, run v2, assert `taste()` returns byte-identical
   output and that every reference row has been backfilled. `migrate.test.ts` is the natural home.

Together with the unchanged behavioural suite above, these are the whole of bridge verification.

### Valid only after CONTRACT — write during BRIDGE, gate, enable in FINAL CODE

These three assert properties of the **contracted** schema. Write them alongside the bridge work
so nothing is forgotten, but gate them so they do not run until v3 has been applied.

5. **Structural tenant isolation, at the database.** Alice owns a Mix, Bob owns a Genre; attempt a
   direct `INSERT INTO tonight_mix_genres` carrying Alice's `user_id`, Alice's `mix_id` and
   **Bob's** `genre_id`. PostgreSQL must reject it through the composite foreign key. This test
   exists solely to prove a single-column FK was not introduced, and it must bypass the store —
   going through `createMix` would be refused earlier by name resolution and prove nothing.
   *Contract-dependent* because the composite UUID foreign key is not the only referential rule
   until the name-based ones are dropped.
6. **A rename writes no reference rows.** Capture a genuine row-version signal — `xmin` of the
   `tonight_mix_genres` rows — before and after a genre rename, and assert it is unchanged.
   Comparing the id pair proves nothing, because the ids are what the rename leaves alone by
   construction. **Contract-dependent, and this is the important case:** during EXPAND and BRIDGE
   the legacy foreign key still carries `ON UPDATE CASCADE`, so a rename *legitimately* rewrites
   the reference row and `xmin` *legitimately* changes. The no-write property only becomes true
   once v3 has removed name-based relational identity. Asserting it earlier would be asserting a
   falsehood about a schema working exactly as designed.
7. **Complete production-shape migration.** Seed v1-shaped rows, run v2 **and** v3, assert the
   final `taste()` output is semantically unchanged. *Contract-dependent* for the plainest reason
   of all: v3 does not exist until it has been written.

Deliberately not added: schema snapshots, and any assertion on uuid *format*.

---

## 11. Future Movie compatibility

This section validates the identity architecture and nothing else.

```
tonight_mix_movies
  user_id   text NOT NULL
  mix_id    uuid NOT NULL
  movie_id  <opaque future identity>

  FOREIGN KEY (user_id, mix_id)
    REFERENCES tonight_mixes (user_id, id)
```

The property being demonstrated: the Mix side is a tenant-composite reference to immutable object
identity, so a Mix rename touches no row in this table, and a cross-tenant reference is not
expressible. That is the same shape `tonight_mix_genres` will have, which is what makes the
pattern generalise.

**Explicitly undecided, and out of scope here:** whether Movies are global or per-user, how a
Movie is identified externally (provider identifiers of any kind), what makes two Movies the same
Movie, and what deletion means on either side. `movie_id` above is an opaque placeholder for
whatever that work decides. Nothing in this plan constrains it.

Recommendation/watch history is likewise not designed here. The relevant identity property is the
same one: a history row referencing `(user_id, mix_id)` survives every rename with zero writes.

---

## 12. Files likely to change

| File | Change |
| --- | --- |
| `web/lib/taste/store/schema.ts` | migrations v2 and v3; rewrite the "Why the name is the key" comment — it is the record of a decision being reversed |
| `web/lib/taste/store/sql.ts` | private row type gains `id`; `lockNames`/`lockGenre`/`lockMix` select it; `createMix` uses `RETURNING id`; `holdGenres` returns held ids; `resolveGenres` returns `{id, name}`; `writeMixGenres`, `readMixes`, `lockMix`'s reference read and `deleteGenre`'s blocking query move to ids; dual write and fallback added in BRIDGE and removed in FINAL CODE |
| `web/lib/taste/store.test.ts` | +3: plan item 1, and items 5–6 which assert the contracted schema. Item 2 needed nothing — `renaming a genre carries every mix built from it` already asserts it and passes unchanged. One stale comment there credited the cascade and was corrected |
| `web/lib/db/migrate.test.ts` | +3: the v2 expand round-trip and the reconciliation repair (plan items 4 and 3), and the full v1 → v2 → v3 round-trip (item 7) |
| `web/lib/mcp/server.ts` | **one clause** in `genreName`/`mixName` — *"there is no separate id"* |

Explicitly **not** changing: `lib/taste/model.ts` (pure, name-only, no identity opinion),
`lib/taste/store.ts` (the interface stays name-based), the eight tool schemas and handlers,
`app/api/**` routes, every component, the skill, the README.

---

## 13. Risks and unresolved decisions

**Risks, highest first**

1. **A single-column foreign key introduced by accident**, destroying structural tenant isolation
   while every existing test still passes. Mitigation: the composite foreign key is a review
   checklist item, and test 1 of the test plan exists for nothing else.
2. **Contracting before old instances have drained.** No mechanism in this repository can prove
   the drain, which is why CONTRACT requires a maintenance boundary rather than a rolling deploy.
3. **Production PostgreSQL version unverified.** `gen_random_uuid()` needs ≥ 13. Dev is 18.3;
   production is whatever the operator's `DATABASE_URL` points at. Preflight, not an assumption.
4. **Dropping the name columns in CONTRACT is irreversible** without the backup.
5. Comment rot: `schema.ts` argues at length *against* surrogate ids. Leaving it would make the
   file lie about its own schema.

**Unresolved decisions**

1. **The length of the drain window**, and how the maintenance boundary for CONTRACT is actually
   effected on this deployment. An operator decision, not a code one.
2. Whether the expanded schema should be held for a period before contracting, rather than
   contracting at the first opportunity. Holding is always the safer option and costs only two
   unused columns.
3. Whether a future `share_id` for public Mixes should be the object `id` itself or a separate
   column. Not needed by this migration; `UNIQUE (id)` leaves both open.

---

## 14. Implementation sequence

Executable checklist, in order. Suitable for handing to an implementation session unchanged.

**Preflight**

1. `SELECT version();` against production — confirm PostgreSQL ≥ 13.
2. `SELECT gen_random_uuid();` against production — confirm no extension is needed.
3. Count production rows in all three tables.
4. Back up the production database.

**EXPAND — migration v2**

5. Append `{version: 2, sql: …}` to `TASTE_SCHEMA.migrations`. Never edit v1.
6. In one migration: add `id` columns (`NOT NULL DEFAULT gen_random_uuid()`); create the
   `(user_id, id)` **unique index** on both object tables; add `UNIQUE (id)` on both; add
   **nullable** `mix_id`/`genre_id`; backfill both by joining on `(user_id, name)`; add the two
   **composite** foreign keys; add the `(user_id, genre_id)` index. Keep the old primary keys,
   name columns and existing foreign keys.
7. `npm run db:migrate` in dev; confirm the full suite passes with the store untouched.

**BRIDGE CODE**

8. Private row type gains `id`; `lockNames` selects it.
9. `createMix` inserts with `RETURNING id` and passes that id into `writeMixGenres`.
10. `updateMix` uses the id from its locked row for the reference delete-and-rewrite.
11. `resolveGenres` returns `{ id, name }`; `holdGenres` returns the ids it held.
12. `writeMixGenres` writes ids **and** names (dual write).
13. `readMixes`, `lockMix`'s reference read and `deleteGenre`'s blocking query read by id, joining
    for display names, with a name fallback where `mix_id IS NULL`.
14. Add test-plan items 1–4 — the tests valid under the compatibility schema — and run them.
    Write items 5–7 at the same time but **gate them on the contracted schema**: all three assert
    properties that are false until v3, so they must not run yet. In particular the `xmin` no-write
    test would fail here for a correct reason — the legacy foreign key still cascades on rename.
15. Full verification: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`,
    `skills/tonight-recommend/test.sh`, `git diff --check`.

**DEPLOY**

16. Migrate production, then deploy the bridge build. Never the reverse.

**DRAIN**

17. Wait until no pre-bridge instance can still be serving. Be generous; it costs nothing.

**RECONCILE**

18. Run the one-time reconciliation backfill (EXPAND step 5, repeated).

**VERIFY**

19. Zero NULL ids; correspondence holds; no orphans. Do not proceed otherwise.

**CONTRACT — migration v3, maintenance boundary**

20. Take traffic off the deployment.
21. Back up the database.
22. Append v3: drop the two name-based foreign keys; `SET NOT NULL` on both id columns; swap
    `tonight_mix_genres` to `PRIMARY KEY (user_id, mix_id, genre_id)`; drop `mix`, `genre` and the
    old `(user_id, genre)` index; on both object tables drop the old primary key and
    `ADD PRIMARY KEY USING INDEX` the tenant index.
23. Migrate production.

**FINAL CODE**

24. Remove the dual write and the name fallback.
25. Rewrite the `schema.ts` header comment and the one MCP clause.
26. Enable test-plan items 5–7 — the direct cross-tenant foreign-key rejection, the `xmin`
    no-write rename, and the complete v1 → v2 → v3 round-trip — and confirm all three pass.
27. Full verification again, deploy, restore traffic.

**Out of scope throughout:** Movies, recommendation history, sharing, the skill, the MCP tool
count, any ORM, any generic entity abstraction, Inbox Labeler.
