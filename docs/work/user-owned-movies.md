# User-owned Movies attached to Mixes

**Status:** architecture plan — **implementation not started**. No migration, application code,
test, MCP tool or skill text has been written or changed. **Awaiting Codex architecture review**;
this document is the source of truth a later implementation session should follow.

Written in English to match the rest of the repository.

Two recommendations from the earlier chat-only analysis were **overruled by product decision** and
do not survive here: the Movie handle is `(title, year)` rather than the title alone, and `watched`
is a nullable tri-state rather than `NOT NULL DEFAULT false`. Everything below is written to the
settled model.

---

## 1. Status

| | |
| --- | --- |
| Implementation | not started |
| Review | awaiting Codex |
| Migration | `taste` v4, additive only, not written |
| Deployment | ordinary rolling deploy — see [§18](#18-migration-and-deployment) |

---

## 2. Current repository findings

Established by inspecting the repository as it stands at `taste` v3.

| | |
| --- | --- |
| Migrations | `taste` at **v3**; next is **v4**. Append-only, module-scoped versions, one transaction per version, never edited after shipping |
| Object identity | `PRIMARY KEY (user_id, id)`, `UNIQUE (id)`, `UNIQUE INDEX (user_id, lower(name))`; `id uuid NOT NULL DEFAULT gen_random_uuid()` |
| Relations | `tonight_mix_genres(user_id, mix_id, genre_id, position)`; composite foreign keys `(user_id, X_id)`; `ON DELETE CASCADE` for the mix side, `ON DELETE RESTRICT` for the genre side |
| Domain types | `Genre {name, instruction}`, `Mix {name, instruction, genres: string[]}`, `Taste {genres, mixes}` — name-only. `orderGenre`/`orderMix` rebuild field by field, which is the structural guarantee that a private id cannot leak by being forgotten |
| Store | `tasteStore(user)` closes over `owner`; no method takes a user; private `Stored<T>` and `Reference` types; `resolveGenres` returns `{id, name}`; `holdGenres` locks and verifies the id |
| Locking | `fold()` sends names through PostgreSQL `lower()`; `inLockOrder()` dedupes and sorts; `FOR UPDATE` on the object being changed, `FOR KEY SHARE` on referenced genres, one statement per row; `taste()` runs at `REPEATABLE READ` |
| MCP | **8 tools**. Conventions: address by name, `new_name` renames, a passed list **replaces**, an omitted field means leave alone |
| Website | `TasteView` is a Server Component; `MixCard` renders `[GENRE] + [GENRE]` then the mix name, with an `sr-only` spoken sentence; `Card` shows the instruction's opening line with the rest behind `<details>` |
| Skill | `What Tonight does not remember` currently claims *"No watch history, no record of what was recommended, no ratings, no film data"*, pinned by two contract checks in `test.sh` |
| Engine | PostgreSQL 18.3 in dev (PGlite 0.5.8); `gen_random_uuid()` built in, no extension; expression indexes cannot back a `UNIQUE` constraint, only a `UNIQUE INDEX` |

---

## 3. Current user identity — keep it

`user.id` is `` `google:${payload.sub}` `` (`lib/oauth/google.ts:203`), minted once at
authentication. `lib/identity.ts` documents it as deliberately the whole identity model — one
stable, opaque, provider-qualified key, with the prefix present so two providers can never mint
the same id for two people. Nothing parses it.

**Scoped accurately**, because an earlier draft of this plan overstated it: `user_id` is the tenant
key for the **tenant-owned Taste Model objects and their composite relations** — it leads
`PRIMARY KEY (user_id, id)` on `tonight_genres` and `tonight_mixes`, and it is the first column of
both foreign keys on `tonight_mix_genres`. It does **not** lead every primary key in the
repository: the web and OAuth support tables are keyed by hashes and opaque handles instead
(`session_hash`, `reference_hash`, `client_id`, `code_hash`, `family_id`, `token_hash`, `bucket`).
No claim is made here about how many tables carry the column.

**MUST: keep the current `user_id` for this slice.** Movies create no new requirement. A
`tonight_movies(user_id text, …)` is the same column doing the same job, and the composite
foreign-key pattern already proven by `tonight_mix_genres` transfers unchanged. Introducing an
internal Tonight user uuid would touch three schemas and every foreign key in the product to
enable nothing this feature needs.

**Out of scope, and what would later justify it** — any one of: a user must be able to change
identity provider and keep their model; a table that is *not* tenant-scoped needs to reference a
user (public or shared Mixes); or the Google subject must stop being stored in plaintext wherever
it is currently stored. None applies to Movies, and no count of those places is asserted here.

---

## 4. Final Movie schema — `taste` v4

```sql
CREATE TABLE tonight_movies (
  user_id  text    NOT NULL,
  id       uuid    NOT NULL DEFAULT gen_random_uuid(),
  title    text    NOT NULL,
  year     integer NOT NULL,
  imdb_id  text,
  watched  boolean,
  liked    boolean,

  PRIMARY KEY (user_id, id),
  UNIQUE (id),

  CONSTRAINT tonight_movies_title CHECK (btrim(title) <> '' AND length(title) <= 200),
  CONSTRAINT tonight_movies_year  CHECK (year BETWEEN 1878 AND 2200),
  CONSTRAINT tonight_movies_imdb  CHECK (
    imdb_id IS NULL OR (imdb_id ~ '^tt[0-9]{7,}$' AND length(imdb_id) <= 20)
  )
);

-- The public handle: one movie per (title, year) per user, title folded by Postgres.
CREATE UNIQUE INDEX tonight_movies_identity
  ON tonight_movies (user_id, lower(title), year);

-- An external pointer, not an identity. It stops one user reusing the same
-- supplied pointer for two Movie objects; it is not catalogue deduplication.
CREATE UNIQUE INDEX tonight_movies_imdb
  ON tonight_movies (user_id, imdb_id) WHERE imdb_id IS NOT NULL;

CREATE TABLE tonight_mix_movies (
  user_id  text NOT NULL,
  mix_id   uuid NOT NULL,
  movie_id uuid NOT NULL,

  PRIMARY KEY (user_id, mix_id, movie_id),

  FOREIGN KEY (user_id, mix_id)   REFERENCES tonight_mixes  (user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, movie_id) REFERENCES tonight_movies (user_id, id) ON DELETE CASCADE
);

-- "Which mixes is this movie filed under", without a scan.
CREATE INDEX tonight_mix_movies_movie_index ON tonight_mix_movies (user_id, movie_id);
```

**MUST**

- `PRIMARY KEY (user_id, id)` and composite foreign keys — the `user_id` inside the key is the
  whole of tenant safety. A uuid being unique is a statement about collisions, not permission.
- `gen_random_uuid()`, generated by PostgreSQL. Built in since 13, so **no `CREATE EXTENSION`** —
  production must never run that DDL from a request.
- **No `DEFAULT false` on `watched`.** Both state columns default to `NULL` by omission, which is
  the correct "not expressed" — see [§8](#8-watched-semantics).
- No `created_at`, `updated_at`, or any other timestamp.

**SHOULD**

- **No `position` on the relation.** Genre order is authored — `[SCI-FI] + [THRILLER]` is a
  composition the user wrote. A movie list is a set of examples; ordering it by title and then year
  is predictable and needs no column.
- `CHECK (year BETWEEN 1878 AND 2200)` — 1878 is the first motion picture, and the upper bound is
  generous enough for announced films. A `CHECK` cannot reference `now()`, so the bound is static
  by necessity; it exists to catch `20223`, not to be a fact about cinema.

**No extra index for title lookup.** "All my Dunes" is already answered by
`tonight_movies_identity`, whose leading columns are exactly `(user_id, lower(title))` — a
separate index on that pair would be a duplicate.

---

## 5. Internal Movie identity

Identical in every respect to Genre and Mix. **MUST** for all of the following.

- `id uuid`, generated by PostgreSQL, immutable for the life of the row.
- The only thing `tonight_mix_movies` points at.
- **Never exposed** — not in MCP inputs, MCP outputs, `TasteStore` public objects, `get_taste`, or
  the website. The store's private `Stored<T>` carries it; `orderMovie` will rebuild the public
  object field by field, so an id cannot reach a caller by being forgotten, only by being added
  deliberately.
- **Changing `title`, `year`, or both preserves the uuid.** The handle is not the identity. This is
  the property the v2/v3 migration existed to create, and Movies are born with it.

---

## 6. Public Movie handle — `(title, year)`

**Settled: the handle is the pair, and `year` is required.**

```
UNIQUE INDEX (user_id, lower(title), year)
```

- Title folding is PostgreSQL's `lower()` and never JavaScript's — the `İ` bug that motivated
  `fold()` applies identically here.
- **The whitespace-normalised title is the stored public title**, and is what a caller is shown.
  **Casing and punctuation remain exactly as the user authored them** — nothing is case-folded or
  repunctuated on the way in. See [§6.1](#61-title-normalisation--checkmovietitle).
- `year` is an integer and compares exactly. It participates in identity, not merely in display.

Both of these are naturally distinct movies for one user, with no ceremony:

```
Dune / 1984
Dune / 2021
```

The stored title of each is `Dune`. **A user must never be asked to encode the year into the
title.** Any earlier suggestion of a title like `Dune (1984)` is withdrawn and must not appear in
the implementation, the tool descriptions, or the skill.

**Why the pair rather than the title alone** — a title is not unique in the world and is not
unique in a personal list either; remakes are common and are exactly the case a movie list runs
into. Per-user title uniqueness would force the user to disambiguate by hand in a field meant to
hold the film's name. The cost of the pair is one extra required parameter on every addressing
call, which the MCP schemas make explicit.

**Why not `imdb_id` as the handle** — it is optional, so it cannot address every movie; making it
an alternative handle would give one object two addresses, which is the ambiguity this
architecture has been removing. See [§7](#7-imdb-semantics-and-validation).

### 6.1 Title normalisation — `checkMovieTitle`

A handle that is not normalised is four handles. **MUST**: the title passes through the
repository's existing convention before it is used for anything.

`model.ts` already has exactly this, in `normalise()`:

```ts
value.split(/\s+/u).filter(Boolean).join(" ")
```

which trims the ends and collapses every internal run of whitespace to a single space. Movie
titles **MUST** use it, via a `checkMovieTitle` alongside the existing `checkName`, so that none
of these become distinct handles:

```
"Dune"     " Dune"     "Dune "     "Dune   "
```

**MUST**, in order:

1. Refuse anything that is not text, with the existing `kindOf` message shape.
2. `normalise()` — trim the ends, collapse internal runs.
3. Refuse an empty result.
4. Refuse over the length limit below.
5. **Preserve casing and punctuation exactly.** `Dr. Strangelove or:` keeps every character.
6. **Persist the normalised title.** It is the stored public title, the one `get_taste` returns
   and the one the website renders — not a lookup-only form kept beside a raw one.
7. Use that same normalised title on **every** create, lookup, update, rename and conflict
   check — never the raw input on one path and the normalised value on another.

So the pipeline is one line, and there is only ever one stored representation:

```
raw input -> normalise() -> validate -> persist
```

What that does, and what it leaves alone:

```
"  Dune  "            -> stored as "Dune"            ends trimmed
"Dune   Part Two"     -> stored as "Dune Part Two"   internal run collapsed
"DUNE"                -> stored as "DUNE"            casing untouched
"Dr. Strangelove or:" -> unchanged                   punctuation untouched
```

**PostgreSQL `lower()` remains the case-folding authority.** Normalisation is whitespace only.
JavaScript must never decide whether two spellings are one movie — that is the `İ` bug the
`fold()` helper exists to prevent, and it applies to titles unchanged.

### 6.2 Title length — 200 characters

**MUST**: a finite limit, enforced at the application boundary *and* as a database `CHECK`,
matching how `MAX_NAME_LENGTH` and `MAX_INSTRUCTION_LENGTH` are already handled.

`MAX_NAME_LENGTH` is 60 and **cannot be reused**: *Dr. Strangelove or: How I Learned to Stop
Worrying and Love the Bomb* is 68 characters, so a genre-length cap would reject real films.
`MAX_INSTRUCTION_LENGTH` at 2,000 is a paragraph allowance and would turn the column into free
text.

**`MAX_TITLE_LENGTH = 200`.** It clears every real title with room to spare, and it is far below
anything that could trouble the expression index: `lower(title)` at 200 characters is at most 800
bytes of UTF-8, and a btree entry has roughly 2,700 to spend across `user_id`, the folded title and
a four-byte year.

Refusal wording follows the existing style — say the limit and say where the detail belongs.

### 6.3 Establishing the handle before a write

Because `year` is part of the handle and required, **a Movie cannot be persisted until the host
knows which film is meant.** This is an orchestration rule, not a new dependency: Tonight still
owns no catalogue and still fetches nothing.

**MUST**: before any Movie write, the host must have `title` **and** `year` from one of

1. the user's own words — *"the 2021 Dune"*, *"Dune, the Villeneuve one"*;
2. unambiguous immediate conversation context — the host just recommended one specific *Dune* and
   the user is answering about that one;
3. reliable knowledge or tooling the host already has, independently of Tonight.

**If ambiguity remains, ask which film. Do not guess, and do not default to the recent one.**

*"Remember Dune"* on its own establishes a title and no year. Persisting `Dune / 2021` from it
would be Tonight inventing a fact about the user's meaning — the same failure the ownership rule
forbids everywhere else, arriving through a different door. Asking *"the 1984 one or the 2021
one?"* costs one line and is not save-ceremony: it resolves **which object**, not **whether to
write**.

Once the year is established by any of the three routes, the write proceeds with no further
ceremony.

---

## 7. IMDb semantics and validation

**MUST**

| | |
| --- | --- |
| Storage | `imdb_id text NULL` — the title id only (`tt0111161`), never a URL |
| Nature | an **external pointer**. Not identity, not the primary key, not an MCP handle, never required |
| Tonight without it | must work completely. A movie with no `imdb_id` is ordinary in every path |
| Verification | **none**. No IMDb query, no metadata fetch, no scraping, no API key, no TMDB |

**Syntax rule — `tt` followed by at least seven decimal digits.**

```
regex   ^tt[0-9]{7,}$
length  at most 20 characters
```

Open-ended on the upper digit count deliberately: IMDb has already moved past seven digits and
will move past eight, and freezing the rule at `{7,8}` would make Tonight reject valid ids for no
reason. The length cap exists so the column cannot be used as free text, and is consistent with the
repository's existing `MAX_NAME_LENGTH` / `MAX_INSTRUCTION_LENGTH` style. **Validation establishes
syntax only** — never existence.

Enforced in **both** places, as the repository does for names: a Zod rule at the MCP boundary so
the refusal is a sentence, and a `CHECK` in the schema so the rule cannot be bypassed by the
website's own write path.

**Uniqueness — `UNIQUE (user_id, imdb_id) WHERE imdb_id IS NOT NULL`. SHOULD.**

**What it guarantees, stated narrowly:** within one user, the same **supplied** IMDb pointer
cannot be attached to two Movie objects. That is all.

**What it does not guarantee — and the plan must not claim otherwise:** it is *not*
catalogue-level deduplication, and it does not prevent the same film existing twice in a user's
list. `imdb_id` is optional, so two Movies with no pointer collide with nothing; Tonight never
verifies the pointer externally, so a wrong one is accepted as readily as a right one; and
external providers themselves carry duplicate and remapped entities. The constraint is hygiene on
a field the user supplied, not a fact about films.

Partial, so any number of Movies may carry no pointer. Per user only: two users may hold the same
film, because Movies are user-owned objects.

**Update semantics** — omitted leaves it unchanged; explicit `null` clears it; a string is
validated and set. A collision is refused with a sentence naming the movie that already holds it,
mirroring `genreExists`.

**Website** — may construct `https://www.imdb.com/title/<imdb_id>/` from the validated id.

---

## 8. watched semantics

**`watched boolean NULL`. Three states, and the third is the point.**

| Value | Meaning |
| --- | --- |
| `true` | the user has watched it |
| `false` | the user has said explicitly that they have **not** watched it |
| `null` | Tonight has no persisted knowledge either way |

**MUST: the existence of a Movie must not imply `watched = false`.**

```
"I watched The Outfit."            -> watched = true
"I haven't seen Dune yet."         -> watched = false
"Add Dune to my Sci-Fi Mix."       -> watched = null
```

**Update semantics**

| Input | Effect |
| --- | --- |
| omitted | unchanged |
| `null` | clear to unknown |
| `true` | explicitly watched |
| `false` | explicitly not watched |

There is **no `DEFAULT false`**. A column default of `false` would manufacture a user statement out
of silence, which is the ownership rule this product rests on, read backwards. The nullable
column's natural default is `NULL`, which is exactly right and needs no `DEFAULT` clause.

**MUST NOT**: `watched_at`, watch history, or any inference of watched state from a recommendation
having been made.

---

## 9. liked semantics

**`liked boolean NULL`.**

| Value | Meaning |
| --- | --- |
| `true` | liked |
| `false` | disliked |
| `null` | no persisted opinion |

```
"I loved The Menu."   -> liked = true
"I hated X."          -> liked = false
"I watched X."        -> liked = null   (watched = true; no opinion was expressed)
```

**Update semantics** — omitted unchanged; `null` clears the opinion; `true`/`false` set it.

**MUST NOT**: rating scores, review text, `liked_at`, or inference of liking from mix membership.

### The general state principle

For both columns: **`null` means unknown or not expressed; `false` is an explicit negative
statement.** Absence of knowledge must never collapse into `false`. This is the rule the skill
already applies to Genres and Mixes — *persist what the user expresses or semantically confirms,
and never manufacture user state from missing information* — applied to a new field.

**No `UserMovie`.** The Movie is user-owned, so its state has exactly one home. Liking a film "in
one mix but not another" is not a thing that exists.

---

## 10. MixMovie relation and deletion semantics

Identity only: `user_id`, `mix_id`, `movie_id`. **MUST NOT** carry `watched`, `liked`, `position`
or a timestamp.

| Event | Behaviour | Why |
| --- | --- | --- |
| Delete a **Mix** | `ON DELETE CASCADE` — its filings go, movies survive | matches `mix_genres` |
| Delete a **Movie** | `ON DELETE CASCADE` — its filings go, mixes survive | **MUST**, and deliberately unlike Genre |
| Remove from one Mix | `update_movie { mixes: [...] }` omitting it — relation row only | |
| Add to another | the same call, including it | |

**Why a Movie cascades where a Genre restricts.** A Mix is *defined by* its genres — remove one and
the mix's meaning is gone, so `deleteGenre` is refused while a mix needs it. A Mix merely
*collects* movies as evidence; a mix with one fewer example still means precisely what its
instruction says. `RESTRICT` here would force a user to unfile a movie from every mix before
deleting it, protecting no invariant.

---

## 11. Zero-Mix Movies

**Allowed. Settled. MUST.**

```
"I watched The Outfit and loved it."
  -> The Outfit / 2022, watched = true, liked = true, mixes = []
     (year established from the film just recommended in this conversation)

"Remember Dune. I haven't seen it yet."
  -> NOT YET A WRITE. The title is established, the year is not.
     Ask which Dune, then persist:
     Dune / 2021, watched = false, liked = null, mixes = []
```

The second example is the one worth reading twice. What is settled by *"remember Dune"* is that a
Movie should exist and that `watched = false`; what is **not** settled is which film. See
[§6.3](#63-establishing-the-handle-before-a-write) — the handle must be established first, and
zero-Mix persistence does not licence guessing at it.

Requiring a mix would force the agent to invent one, which is exactly the taste-invention the
naming principle forbids. A zero-Mix Movie stays discoverable and manageable because the canonical
Movie list in `get_taste` is top-level, not nested — see [§14](#14-get_taste-output-shape).

No homepage section for them in v1. They are reachable through `get_taste` and the MCP, and adding
a "loose movies" panel to a page whose redesign was about quietness needs a reason this feature
does not yet have. **COULD**, if it turns out to be common.

---

## 12. MCP tool surface — 3 new tools, 11 total

**MUST NOT** create one tool per field. The shape follows the existing six exactly: address by
handle, `new_*` renames, a passed list replaces, an omitted field leaves alone.

```
create_movie {
  title:    string          -- whitespace-normalised on the way in; casing and
                            -- punctuation preserved exactly as authored
  year:     integer         -- required; part of the handle
  imdb_id?: string | null   -- validated syntax if present
  watched?: boolean | null  -- omitted -> null
  liked?:   boolean | null  -- omitted -> null
  mixes?:   string[]        -- mix names; omitted -> no filings
}                                                        -> { movie }

update_movie {
  title:      string        -- addresses the existing movie, with year
  year:       integer       -- addresses the existing movie, with title
  new_title?: string        -- change the title; identity is preserved
  new_year?:  integer       -- change the year; identity is preserved
  imdb_id?:   string | null
  watched?:   boolean | null
  liked?:     boolean | null
  mixes?:     string[]
}                                                        -> { movie }

delete_movie {
  title: string
  year:  integer
}                                                        -> { deleted }
```

**MUST**: a movie is addressed by `title` **and** `year`. Never by uuid, never by IMDb id, never by
title alone.

**MUST**: the schemas distinguish *omitted* from *explicitly null*. In Zod that is
`.nullable().optional()` for `imdb_id`, `watched` and `liked` — yielding
`boolean | null | undefined` — and the store branches on `=== undefined`, which is the convention
`updateGenre` and `updateMix` already use and which their comments already explain (*"only an
omitted field means leave it alone"*).

**MUST**: `update_movie` changing `new_title`, `new_year` or both preserves the uuid and **writes
no `tonight_mix_movies` row**. The relation points at the id, and the id does not move.

Refusals reuse the existing vocabulary: `movieNotFound(title, year)`, `movieExists(title, year)`,
an IMDb-collision refusal naming the movie that holds it, and a missing-mix refusal for an unknown
mix name.

### 12.1 The persistence boundary belongs in the tool descriptions

**MUST.** A host may discover and call these tools without ever loading the Tonight skill, and the
descriptions are the only thing it will read. The repository already applies this rule to
`create_genre` and `create_mix`; Movies need it more, because a movie title is the single easiest
thing for an assistant to write down unasked.

`create_movie` and `update_movie` **MUST** each carry, compactly and in their own words:

- **A recommendation is not a saved Movie.** Naming three films persists nothing.
- Writes require Movie identity and state the user **expressed or semantically confirmed**.
- **Absence is never `false`.** No `watched` information means `null`, not "not watched"; the same
  for `liked`.
- A confirmation covers **only the meaning that was actually surfaced** to the user.
- Confirming is about whether the meaning is theirs — **not a request to approve a write**.
- `title` and `year` together address the Movie; establish the year before writing.

Compact and tool-local. **MUST NOT** copy the skill into a description. The test is the one the
repository already uses: *if it must be true whenever the tool is called, it belongs in the tool
description* — everything else stays in the skill.

### 12.2 `create_movie` transaction order

The accepted composite Movie lock design is unchanged. What needs stating is that **`create_movie`,
not only `update_movie`, holds both Movie and Mix work in one transaction** when `mixes` is
supplied — an earlier draft implied only the update path did.

**MUST**, in this order:

1. **Validate** the Movie input — normalised title, length, year, IMDb syntax, state fields.
2. **Resolve** the requested Mix handles through PostgreSQL folding, **without taking locks**,
   capturing each Mix's private uuid.
3. **Insert** the Movie, `RETURNING id`, capturing the generated uuid. A unique violation here is
   the handle or IMDb conflict, refused with a sentence.
4. **Lock** each resolved Mix `FOR KEY SHARE`, in the repository's existing deterministic
   folded-name order, one statement per row.
5. **Verify** each locked Mix still carries the uuid resolved at step 2. A mismatch — the Mix was
   renamed away and its name taken by another — refuses the write.
6. **Insert** the `tonight_mix_movies` rows by uuid.
7. **Commit.**

**On any refusal at 4 or 5 the transaction rolls back, so the Movie inserted at step 3 does not
survive.** There is no orphan and no partial write; the whole thing is one transaction, which is
why the insert may safely precede the lock.

**Why this satisfies the declared cross-table ordering.** Step 3 takes the new Movie row's own
lock implicitly; step 4 takes the Mix locks. Movies are therefore locked before mixes, which is the
rule [§20](#20-locking-and-concurrency) states for `update_movie` as well. No operation anywhere
takes a Mix lock before a Movie lock, so the two tables cannot form a cycle. Resolving before
locking (step 2 before step 4) is deliberate and matches `resolveGenres` then `holdGenres`: the
resolution is what produces the ordering keys, and the verification at step 5 is what makes an
unlocked resolution safe.

---

## 13. Mix membership mutation

**The Movie side is the authoritative mutation surface. `update_mix` does not gain `movies` in
v1. MUST.**

| Input | Effect |
| --- | --- |
| `mixes` omitted | **leave the relation rows completely untouched** |
| `mixes: []` | remove the movie from every mix |
| `mixes: [...]` | replace the membership with exactly this set |

**The omitted case is the lesson from the `updateMix` bug, applied before it can be repeated.**
When `mixes` is omitted the implementation **MUST NOT**: derive the current mix names, re-resolve
them, take mix locks, delete relation rows, or reinsert them. It must touch nothing. Deriving the
list and rebuilding it is what made an unrelated update fail when another transaction renamed a
referenced object in between, and it rewrote rows that were already correct.

**The explicit case** follows the `resolveGenres` then `holdGenres` pattern exactly:

```
mix names -> PostgreSQL lower() -> stored Mix rows with private uuids
          -> deterministic locks, in the shared order
          -> verify the locked row's id equals the resolved id
          -> write mix_movies by uuid
```

The id verification is not optional: without it, a rename that frees a name and a second rename
that takes it can substitute a different Mix object between resolution and the write. `holdGenres`
already does this and the movie path must match.

**Why the Movie side owns the relation.** A Mix is *defined by* its genres, so the mix owns that
list. A Movie is *filed under* mixes, so the movie owns its filing. Writing a relation from exactly
one side is what keeps delete semantics unambiguous. The asymmetry is deliberate and must be stated
in the `get_taste` field description — see the risk in [§25](#25-risks-and-open-questions).

---

## 14. get_taste output shape

```jsonc
{
  "genres": [
    { "name": "Mystery", "instruction": "…" }
  ],

  "mixes": [
    {
      "name": "Everybody's Lying",
      "instruction": "…",
      "genres": ["Mystery", "Clever Thriller"],
      "movies": [
        { "title": "The Outfit", "year": 2022 }
      ]
    }
  ],

  "movies": [
    {
      "title": "The Outfit",
      "year": 2022,
      "imdbId": "tt10088166",
      "watched": true,
      "liked": true,
      "mixes": ["Everybody's Lying"]
    },
    {
      "title": "Dune",
      "year": 2021,
      "imdbId": null,
      "watched": false,
      "liked": null,
      "mixes": []
    }
  ]
}
```

**MUST**

- **A Movie is referenced by its full handle everywhere.** `Mix.movies` is an array of
  `{title, year}` objects, **never** title-only strings — a title alone cannot distinguish
  `Dune / 1984` from `Dune / 2021`, and the whole point of the settled handle is that it does.
  This is the one place the shape departs from `Mix.genres: string[]`, and the composite handle is
  the reason.
- **State is canonical exactly once**, in the top-level `movies` array. A movie in three mixes
  appears once with one `watched` and one `liked`; the mixes carry handles only. There is no way
  for two copies to disagree.
- **Zero-Mix Movies are visible**, because the canonical list is top-level.
- `watched` and `liked` serialise as `true` / `false` / `null` and the three remain distinct.
  `null` must not be omitted from the JSON, or unknown would be indistinguishable from a field the
  reader failed to parse.
- **No uuid anywhere.**

### Are both `Mix.movies` and `Movie.mixes` needed?

They are two views of one relation, so within a single `REPEATABLE READ` snapshot they cannot
disagree — the redundancy is payload size, not a consistency risk. **SHOULD keep both**, for two
different jobs:

- `Mix.movies` is what the agent reads while recommending — the evidence sits with the idea it is
  evidence for, which is the product goal.
- `Movie.mixes` is what makes the replace-semantics of `update_movie` safe. Without it, "also file
  this under Quiet Dread" requires the agent to reconstruct the current membership by scanning
  every mix — derived state rebuilt by hand, which is precisely the shape of the bug §13 exists to
  prevent.

**COULD** drop `Movie.mixes` if payload size ever matters. It would make read-modify-write on
membership materially more error-prone, so it is not the default.

---

## 15. Website rendering

Replaces the earlier sketch in this plan entirely. This is the settled overview design; the
sections below are the specification, not an illustration.

The overview is a **reading page**. Instructions do not appear on it, and neither does any
create control — the model is grown in conversation.

### Genres

- The existing neutral Genre badge style, **unchanged**. **MUST**
- Compact, laid out beside each other, wrapping naturally.
- **No instruction text on the overview.** **MUST**
- **No "Add genre" control.** **MUST**
- Clicking a Genre opens a detail view or popup, and **that** is where its instruction is read.

### Mixes

One Card per Mix. **No "Add mix" control. MUST.**

```
  ┌───────────────────────────────────────────────────────────────┐
  │  [MYSTERY]  [CLEVER THRILLER]                                 │
  │                                                               │
  │  Everybody's Lying                                            │
  │                                                               │
  │  The Outfit (2022) IMDb                              👁  ♥    │
  │  Knives Out (2019)                                   👁       │
  │  The Last Stop in Yuma County (2023) IMDb                     │
  └───────────────────────────────────────────────────────────────┘
```

- At the top of the card: the Mix's Genre badges beside each other, **the same existing neutral
  badge style**. **MUST**
- Then the Mix title.
- **No instruction text in the overview.** **MUST** — clicking the card opens the detail
  popup/view that contains it.

### Movies inside a Mix

- A **simple list**. **MUST NOT** be a table, **MUST NOT** have row separators, **MUST NOT**
  carry posters or any image.
- **Left of the row:** `Title (Year) IMDb`
  - The year is in **the same ordinary sans-serif style as the title** — not a differentiated
    metadata treatment. **MUST**
  - The IMDb link follows the year immediately, and its **link text visibly contains "IMDb"**.
    **MUST**
  - The link appears **only** when `imdb_id` exists; without one the row simply ends after the
    year and looks complete. **MUST**
- **Right of the row:** the watched icon and the liked icon, **icons only**.
  **No "Seen" or "Liked" text labels in the visual row. MUST.**

### Tri-state markers — the part most easily got wrong

Both fields have three states and **`false` must never be indistinguishable from `null`**. **MUST.**

| | `true` | `false` | `null` |
| --- | --- | --- | --- |
| `watched` | a visible eye icon | an **unambiguously negative** treatment — eye-off, or the eye with a strike | **nothing rendered** |
| `liked` | a filled heart | an **unambiguously negative** icon — heart-off or heart-with-cross | **nothing rendered** |

**An outline heart is not an acceptable `false`.** **MUST.** In every icon set in common use an
outline heart means *unselected* — that is, unknown — so using it for "disliked" would state the
opposite of the user's data. `false` needs a mark that reads as a negative on its own: a strike, a
cross, or a dedicated off-glyph. If the icon set in use cannot express that, the correct answer is
to add the glyph, not to reuse the outline.

Rendering **nothing** for `null` is the honest treatment: Tonight says nothing because it knows
nothing.

**Programmatic semantics are required for both fields, not only the visual ones. MUST.** Every
icon is `aria-hidden` decoration with an `sr-only` equivalent beside it, following the pattern
`MixCard` already uses:

| | `true` | `false` | `null` |
| --- | --- | --- | --- |
| `watched` | "watched" | "not watched" | nothing announced |
| `liked` | "liked" | "disliked" | nothing announced |

A screen reader must be able to tell disliked from no-opinion. Announcing nothing for `null` is
what makes that distinction audible.

### Out of scope for the overview

No uuid, no timestamps, no posters, no global catalogue UI, and **no CRUD**: the overview stays a
reading page. Zero-Mix Movies get no homepage section in v1 — they are reachable through
`get_taste` and the MCP.

---

## 16. Skill changes — every operative contradiction

An earlier draft of this plan scoped this to a handful of edits. That was too narrow: the skill
states, as fact, several things that stop being true. The table below **is** the inventory — each
claim with its line and its pinning contract check — and **every entry MUST be updated**. No count
is given, because the list is the list. The skill is still not rewritten; these are targeted
corrections.

### What becomes false

| Where | Current claim | Why it breaks |
| --- | --- | --- |
| `SKILL.md:23-24` | Tonight holds Genres and Mixes "and **holds nothing else**. It has no film catalogue, no lookup and **no idea what a film is**." | It now holds Movies and knows exactly what a film is — the ones the user told it about |
| `SKILL.md:30` | the diagram: "the user's Genres and Mixes" | must include Movies |
| `SKILL.md:33` | "**never look for films in Tonight**" | as written this forbids reading the user's own saved Movies. It must be narrowed to what stays true: never look in Tonight for films **to recommend** — it is not a catalogue, and it holds only what the user said |
| `SKILL.md:208` | "keep a note of what was recommended, **watched or rated** anywhere in the model" | *recommended* stays forbidden; *watched* is now persistable when expressed; *rated* must become "scored" — liked/disliked is stored, scores are not |
| `SKILL.md:247` | "No watch history, no record of what was recommended, **no ratings, no film data**" | "no film data" is false; "no ratings" must become **no scored/star ratings** |
| `SKILL.md:249` | "The same film can come back… **there is nothing to look it up in**" | false as an absolute. A film the user saved *is* in the model, with its watched state. What stays true is that recommendations are not recorded automatically |
| tool list | the skill enumerates the Genre/Mix tools | must include the three Movie tools |

### Contract checks that must be repointed

| `test.sh` | Pins |
| --- | --- |
| `:118-121` | "holds nothing else" and "no film catalogue, no lookup and no idea what a film is" |
| `:125-126` | "never look for films in Tonight" |
| `:266` | "No watch history" and "no ratings, no film data" |
| `:267` | "The same film can come back" and "Nothing is learned automatically" |

**The `:249` claim needs the sharpest rewrite**, because both halves of it are load-bearing and only
one of them breaks:

- **Still true, and must survive:** Tonight keeps **no automatic recommendation history**. A film
  it suggested last week is not written down anywhere, so it can come back — and that is by design,
  not an omission.
- **Now false as stated:** *"there is nothing to look it up in."* A Movie the user asked Tonight to
  remember is in the Taste Model, with its `watched` state, and that state **should be respected**
  when choosing what to suggest.

The replacement must therefore separate the two cases rather than soften the sentence: a
*recommended* film may return because recommendations are not recorded; a *user-saved* Movie is a
different thing, and its persisted state exists to be read. **MUST NOT** imply that every
recommendation becomes a Movie, and **MUST NOT** introduce recommendation history to close the gap.

Its check at `:267` must be repointed at that distinction rather than at the obsolete sentence.

**MUST**: repoint each at the invariant that survives, never delete the check. The surviving
invariants are: no catalogue, no lookup, no metadata fetching, no recommendation history, no
watch-event timeline, no automatic learning, no scored ratings.

### What the skill must newly teach

**MUST**, and compactly:

- **A Movie is a user-owned Taste Model object**, alongside Genres and Mixes — not a catalogue
  entry.
- **It can be managed directly** through `create_movie` / `update_movie` / `delete_movie`, the
  same way an explicit Genre or Mix request is handled.
- **`watched` and `liked` may be persisted when grounded in the user's meaning** — expressed or
  semantically confirmed, exactly the existing rule.
- **A recommendation is never persistence.** Naming three films saves nothing.
- **`null` means unknown, not `false`.** Writing `false` because nothing was said manufactures a
  statement the user never made.
- **Establish `title` and `year` before writing** — see
  [§6.3](#63-establishing-the-handle-before-a-write). If the film is ambiguous, ask which one.
  That question resolves *which object*, and is not save-ceremony.
- **Do not infer across fields.** *"I loved The Menu"* sets `liked = true` and says **nothing**
  about `watched`.

### What stays untouched

The ownership rule, semantic confirmation, the Mix naming principle, the persistence table's
existing rows — including *"They watched it and said nothing → **nothing**"*, which remains exactly
right — and the whole recommendation flow.

---

## 17. Public disclosures — what stops being true

Tonight's public pages state, as fact, that no film records, no watched state and no ratings are
stored. **This feature makes those statements false, and the implementation MUST correct them in
the same change that ships it.** These are factual disclosures about what a hosted service holds,
not marketing copy; shipping the feature without them would leave the privacy policy wrong.

### The claims that break

| File | Line | Claim |
| --- | --- | --- |
| `web/app/privacy/page.tsx` | ~130-136 | "Tonight keeps **no record of what was recommended, no watch history, no ratings, no list of films** you were shown or chose… It keeps **no film catalogue** either — no records about films… **There is no table for any of that.**" |
| `web/app/privacy/page.tsx` | ~217-218 | "**No movie database.** Tonight queries no film catalogue or search service, and **stores no film records**." |
| `web/app/terms/page.tsx` | ~104 | "nothing about what you watch — **no recommendation history, no viewing history**, no profile" |
| `README.md` | ~60 | "It also **owns no film data** — no catalogue, no lookup, no titles." |
| `README.md` | ~171 | "**Watch history.** Tonight records nothing about what was recommended **or watched**." |

### The truthful replacement

**MUST** say that Tonight may store user-owned Movie records containing:

- title
- release year
- an optional IMDb title ID
- watched state — watched, explicitly not watched, or unknown
- liked state — liked, disliked, or no opinion
- Mix membership

**MUST** preserve, because each is still exactly true:

- no global or external Movie catalogue
- no automatic recommendation history
- no event timeline or watch history — a Movie carries a *state*, never a sequence of events, and
  there are no timestamps to build one from
- no IMDb metadata fetching, no lookup, no provider integration
- no behavioural learning from recommendations
- **no scored or star ratings**

**MUST NOT** keep saying plainly "no ratings" while liked/disliked is stored. The precise claim is
**no scored or star ratings** — a three-state opinion the user stated is not a rating scale, and
the wording has to make that distinction rather than rely on it.

The privacy page's *"There is no table for any of that"* is the sharpest sentence to fix: after v4
there are two such tables.

**COULD**: the distinction worth drawing for a reader is *state* versus *history* — Tonight knows
that you watched something, and never when, how often, or in what order.

---

## 18. Migration and deployment

**One additive migration, `taste` v4.** Two new tables and their indexes. Nothing existing is
altered, no column changes meaning, no backfill, no data to migrate — no Movie table exists today.

**MUST NOT** copy the v2/v3 machinery: no expand/contract, no bridge release, no reconciliation, no
maintenance boundary. That complexity existed because v3 dropped columns an older build still
wrote. Nothing here is dropped.

**Deployment — an ordinary rolling deploy, and this is checked against the runner rather than
assumed.** `requireSchema()` refuses a build whose declared migration is absent, so the order is
**migrate, then deploy**, as always. The reverse direction is safe here: an older build declares
v1 to v3, `requireSchema` explicitly tolerates a database migrated further, and old code never
names `tonight_movies` or `tonight_mix_movies`. There is therefore no window in which a serving
instance can touch something that has changed under it — which is exactly what made v3 different.

Append v4; never edit v1, v2 or v3.

---

## 19. Store and query implementation

- `Movie` domain type: `{ title, year, imdbId, watched, liked, mixes }`. `orderMovie` rebuilds it
  field by field — the anti-leak guarantee. **MUST**
- `MovieHandle = { title: string; year: number }`, used wherever a movie is referenced.
- `Mix` gains `movies: MovieHandle[]`; `orderMix` gains the field. This touches every place a Mix
  is constructed and a handful of `deepEqual` assertions. **MUST**
- `TasteStore` gains `createMovie`, `updateMovie`, `deleteMovie`, all handle-addressed, with no
  uuid in any signature. `taste()` gains the movie reads.
- Private `Stored<Movie>` and a `Reference`-shaped resolution for mixes, mirroring
  `resolveGenres` and `holdGenres`, including the id verification.
- `readMovies` joins `mix_movies` to `tonight_mixes` for names; `readMixes` gains the reverse join
  for handles.
- `taste()` stays one `REPEATABLE READ` transaction, now covering four reads.

---

## 20. Locking and concurrency

**The composite handle is the one genuinely new problem here.** `lockNames()` folds a single name
and locks on `lower(name) = $2`; reusing it unchanged for movies would make the year invisible to
lock identity, so two different movies sharing a title would contend as though they were one — and
worse, a lock taken for `Dune / 2021` could match `Dune / 1984`.

**MUST: a movie-specific lock helper**, structurally parallel to `lockNames` but matching on the
pair:

```sql
SELECT id, title, year, imdb_id, watched, liked
  FROM tonight_movies
 WHERE user_id = $1 AND lower(title) = $2 AND year = $3
 FOR UPDATE
```

The folded title still comes from `fold()` — PostgreSQL remains authoritative and JavaScript never
folds. Only the *lock ordering key* is composed in the application, from the PostgreSQL-folded
title and the year, separated by a character that cannot occur in a folded title (U+0000 is the
obvious choice) so that `("ab", 12)` and `("ab1", 2)` cannot collide.

**This is safe and consistent with the existing design.** `inLockOrder` already sorts
application-side over PostgreSQL-produced keys, and its comment states why: the comparison only has
to be the same in every session, never the same as PostgreSQL's, because it decides the *sequence*
locks are taken in and never which rows match. A composite key changes nothing about that argument.

**Rename ordering.** `update_movie` changing title or year must hold both the source handle and the
destination handle, sorted by that composite key, for the same reason `lockNames` holds both today:
two crossing renames — `A/2001` to `B/2002` while `B/2002` goes to `A/2001` — would otherwise each
hold what the other needs, and PostgreSQL would break the cycle with a deadlock error instead of
the "already exists" the product means.

**Cross-table ordering — the deadlock analysis.** **Two** operations cross the Movie/Mix boundary,
and both do so only when `mixes` is explicitly supplied:

| Operation | Movie side | Mix side |
| --- | --- | --- |
| `create_movie` with `mixes` | `INSERT … RETURNING id` — the new row's own lock | `FOR KEY SHARE` on each resolved Mix, after the insert |
| `update_movie` with `mixes` | `FOR UPDATE` on the source handle, and on the destination handle when renaming | `FOR KEY SHARE` on each resolved Mix, after the movie locks |

**MUST: always the Movie side first, then the Mix side, never the reverse — in both operations.**
`create_movie` obeys this by inserting at step 3 before locking mixes at step 4; see
[§12.2](#122-create_movie-transaction-order). `update_movie` obeys it by locking its handles before
resolving membership.

Nothing anywhere takes a Mix lock *before* a Movie lock: `update_mix` locks mixes then genres and
never touches movies, `delete_movie` locks only movies, and `create_movie` and `update_movie` both
run Movie-then-Mix. With that ordering held on every path, the two tables cannot form a cycle.

`update_movie` with `mixes` **omitted** crosses nothing: it resolves no mix, takes no mix lock, and
touches no relation row.

The mix locks themselves **MUST** use `inLockOrder` over folded mix names, the *same* order a mix
rename uses, or a movie filing and a mix rename form the cycle `holdGenres` was written to avoid.

**Movie title/year changes take no relation locks at all** and rewrite no relation rows, because
`tonight_mix_movies` points at the uuid. **Omitted `mixes` takes no mix locks whatsoever.**

**Known and accepted:** concurrently deleting a Mix and a Movie that share a filing can contend on
the same `mix_movies` row through two cascades. PostgreSQL resolves it; the window is a row-level
lock during two deletes and no application ordering can remove it. Worth naming, not worth
engineering around.

`taste()` remains one `REPEATABLE READ` snapshot.

---

## 21. Tenant isolation

Unchanged mechanism, three layers: `sqlTasteStore` closes over `owner` and no method accepts a
user; every statement names `user_id = $1`; and both new foreign keys are **composite on
`(user_id, …)`**, so a movie of user A cannot be filed under a mix of user B — the row is not
expressible. **MUST.**

**A single-column `movie_id uuid REFERENCES tonight_movies(id)` would silently destroy this.** It
is the highest-risk mistake available in this slice and must be a review checklist item.

**MUST: the store-level test does not prove it.** As established during the UUID work, going
through the store is refused earlier by name resolution scoped to one user, and that refusal would
pass identically against a single-column key. Direct forged `INSERT`s are required.

**MUST: two of them, one per foreign key.** `tonight_mix_movies` has two composite keys and each
must be proved separately — **no single test proves both**, because a row that violates one may
satisfy the other and be rejected for the wrong reason.

| | Row | Proves |
| --- | --- | --- |
| **A** | Alice's `user_id` + **Bob's** `mix_id` + Alice's `movie_id` | the **Mix-side** composite key |
| **B** | Alice's `user_id` + Alice's `mix_id` + **Bob's** `movie_id` | the **Movie-side** composite key |

Both must fail with SQLSTATE **`23503`**, and both **MUST** bypass application resolution and hit
PostgreSQL directly.

---

## 22. Test plan

Behavioural and structural throughout; no broad snapshots, no assertions on uuid format.

**Movie identity** — create; uuid generated privately; **no uuid leaks** (a structural key check on
the public object, *not* a substring search — `"id"` occurs inside ordinary words such as "ideas");
same title with a different year allowed; same title and same year refused case-insensitively;
folding is PostgreSQL's; a Unicode regression with `İ` mirroring the existing genre and mix tests.

**Year** — required, and a create without it refused; obviously invalid values refused at both the
Zod and `CHECK` layers; **changing year preserves the uuid**; **changing year rewrites no
`mix_movies` row**; **changing title rewrites no `mix_movies` row**. The last two proved with
`xmin`, which the repository has already established as a real signal — comparing ids proves
nothing, since ids are what a rename leaves alone by construction.

**IMDb** — omitted allowed; valid syntax accepted, **including more than eight digits**; invalid
refused; duplicate refused for one user; the same id accepted for a different user; explicit `null`
clears; omitted leaves unchanged.

**watched** — create without it yields **`null`, not `false`**; `true`, `false` and `null` each
persist and read back distinctly; an omitted update leaves the previous value; an explicit `null`
clears a previous `true` **and** a previous `false`.

**liked** — the same six cases.

**State non-inference** — saving a movie with no `watched` does not produce `false`; the same for
`liked`; adding a movie to a mix changes neither.

**Mix membership** — zero, one and several mixes; **omitted `mixes` leaves the relation rows
untouched, proved with `xmin`**; `mixes: []` removes all; an explicit list replaces exactly;
deleting a mix leaves its movies; deleting a movie leaves its mixes.

**Concurrency** — the resolve-then-lock id check refuses a substituted Mix; lock ordering is
deterministic for the composite handle.

**Title normalisation and length** — leading and trailing whitespace normalised; repeated internal
whitespace collapsed per `normalise()`; `"Dune"`, `" Dune"`, `"Dune "` and `"Dune   "` all conflict
as one handle at the same year; casing preserved in what is stored and returned; PostgreSQL
`lower()` still the folding authority, with an `İ` regression as for Genres and Mixes; an
oversized title refused at the application boundary **and** refused structurally by the `CHECK` when
written past it.

**Handle establishment / ambiguity** — a Movie write requires `title` and `year`; *"Remember Dune"*
with the year unresolved **does not silently write a Movie**; a year established by clear context
or host knowledge proceeds with no extra ceremony. Skill-level, tested as a contract claim.

**MCP persistence boundary** — `create_movie` and `update_movie` descriptions carry, in their own
text: recommendation is not persistence; absence of state is not `false`; confirmation covers only
the surfaced meaning and is not a save request.

**Tenant isolation — two forged `INSERT`s, one per foreign key.** **A:** Alice's `user_id` +
**Bob's** `mix_id` + Alice's `movie_id`. **B:** Alice's `user_id` + Alice's `mix_id` + **Bob's**
`movie_id`. Both asserted to fail with SQLSTATE `23503`, both bypassing the store.

**`get_taste`** — `Mix.movies` carries full handles; two same-titled movies stay distinguishable;
a zero-Mix movie is present; a multi-mix movie appears once canonically; `true`, `false` and `null`
survive serialisation distinctly for both state fields; no uuid.

**MCP** — exactly three new tools, **11 total**; `title` and `year` both required to address;
omitted / `null` / `true` / `false` semantics for `watched`, `liked` and `imdb_id`; no uuid in any
response.

**Website** — the overview contains **no Genre instruction** and **no Mix instruction**, and both
appear only in the detail interaction; Genre badges keep the existing neutral style; there is **no
"Add genre" and no "Add mix" control**; a Movie row reads `Title (Year) IMDb` with the year in the
title's own type; the IMDb link text contains "IMDb" and is absent when `imdb_id` is null; **no
poster element**; the Movie list is not a table and carries no row separators, asserted
structurally rather than by snapshot; all three `watched` states and all three `liked` states are
distinguishable, with `null` rendering as absence; **`liked = false` is programmatically and
visibly "disliked", never an outline heart**; `null` announces nothing and implies nothing
negative; `sr-only` equivalents exist for both fields.

**Public disclosures** — a check that the privacy page, terms and README no longer claim no film
data, no watched state or a bare "no ratings", and still claim no catalogue, no fetching and no
scored ratings. A grep-shaped contract test in the style of the skill's `test.sh` is enough; large
snapshots are not.

**Skill** — every repointed contract check from [§16](#16-skill-changes--every-operative-contradiction);
a recommendation does not imply persistence; absence does not become `false`; and the
recommended-versus-saved distinction is pinned — a recommended film may return because
recommendations are not recorded, while a **user-saved Movie is in the model and its watched state
is readable**, with no claim that there is "nothing to look it up in".

**Regression** — every existing Genre/Mix test passes unmodified except those that must gain
`movies: []` to a Mix literal. That near-total pass rate is the signal that nothing changed
meaning, exactly as it was for v2 and v3.

---

## 23. Files likely to change

| File | Change |
| --- | --- |
| `web/lib/taste/store/schema.ts` | migration v4; header comment gains Movies |
| `web/lib/taste/store/sql.ts` | movie CRUD, composite-handle locking, mix resolution, reads |
| `web/lib/taste/store.ts` | three store methods on the interface |
| `web/lib/taste/model.ts` | `Movie`, `MovieHandle`, `orderMovie`, validators, `Mix.movies` |
| `web/lib/mcp/server.ts` | three tools, `get_taste` description |
| `web/components/taste-view.tsx` | movies inside `MixCard`, IMDb link |
| `skills/tonight-recommend/SKILL.md` and `test.sh` | every operative contradiction listed in [§16](#16-skill-changes--every-operative-contradiction), and its repointed contract check |
| `web/lib/taste/store.test.ts`, `web/lib/db/migrate.test.ts`, `web/lib/mcp/tools.test.ts` | new tests |
| `web/lib/generated/project-instructions.ts` | regenerated after the skill change |
| `web/app/privacy/page.tsx` | **MUST** — "no ratings, no film data, no table for any of that" and "stores no film records" become false |
| `web/app/terms/page.tsx` | **MUST** — "nothing about what you watch" becomes false |
| `README.md` | **MUST** — "owns no film data" and "records nothing about what was… watched" become false |
| `web/lib/taste/store/schema.ts` header comment | **MUST** — the "what is not here" paragraph names watch history and film data |
| architecture comments elsewhere | **SHOULD** — grep for "no film", "watch history", "no ratings" and correct each operative claim |

---

## 24. Non-goals

Global Movie catalogue · `UserMovie` · internal Tonight User uuid migration · TMDB · provider
abstraction · metadata fetching · IMDb lookup · posters · cast and crew · streaming availability ·
ratings and scores · reviews · **timestamps of any kind** · recommendation history · watch history ·
sharing · generic entity abstraction · ORM.

---

## 25. Risks and open questions

1. **A single-column foreign key introduced by accident**, destroying structural tenant isolation
   while every store-level test still passes. Mitigated by the review checklist and the direct
   forged-`INSERT` test, which exists for nothing else.
2. **Composite-handle locking is new code in the one area that has already produced two bugs.**
   The rules in [§20](#20-locking-and-concurrency) — compose the key, keep PostgreSQL folding,
   movies before mixes, share the mix order — are the whole mitigation and should be reviewed as a
   unit.
3. **Read/write asymmetry:** `Mix.movies` is read on the mix but written on the movie. Mitigated by
   the field description; worth revisiting after real use.
4. **Tri-state rendering is easy to get subtly wrong**, and the failure is a lie about the user's
   data rather than a crash. The `false` is not `null` requirement needs an explicit test per
   state.
5. **`Mix` gains a field**, touching several `deepEqual` assertions and every Mix construction.
6. **Skill contract churn** — every pinned check named in [§16](#16-skill-changes--every-operative-contradiction)
   changes wording, and each must be repointed at the invariant that survives rather than at the
   sentence being replaced. No count is asserted here; §16 is the list.
7. **Shipping the feature without the disclosure edits** would leave the published privacy policy
   stating something untrue about what the service stores. It is the one item here whose failure
   mode is not a bug but a false public statement, which is why it is a numbered implementation
   step rather than a tidy-up.

**No open product questions.** Everything that was open in the chat analysis — the handle, the
year, the tri-states, zero-Mix movies, the tool surface — has been settled above.

---

## 26. Recommended implementation order

1. Migration v4, plus the schema header comment.
2. `Movie` and `MovieHandle` types, validators, `orderMovie`; `Mix.movies`.
3. Store: composite-handle locking, movie CRUD, mix resolution with id verification, reads.
4. Store tests — including the forged cross-tenant insert and both `xmin` no-rewrite cases.
5. Three MCP tools and the `get_taste` description; tool tests.
6. Website rendering inside `MixCard`, including the three-state markers and the IMDb link.
7. Skill edits, repointed contract checks, regenerated instructions.
8. **Public disclosures — privacy, terms, README and the affected code comments.** Part of *this*
   change, not a follow-up: the moment v4 ships, the privacy page is factually wrong until this
   step lands.
9. Full verification, then migrate-then-deploy.

---

## Final explicit answers

**A. Movie internal identity** — `id uuid NOT NULL DEFAULT gen_random_uuid()`, generated by
PostgreSQL, `PRIMARY KEY (user_id, id)` with `UNIQUE (id)`. Private to the store; never exposed.

**B. Movie public handle** — `(title, year)`, unique per user under PostgreSQL title folding:
`UNIQUE INDEX (user_id, lower(title), year)`. The stored title is the whitespace-normalised one;
casing and punctuation are preserved exactly as the user authored them.

**C. Is year required?** — **Yes.** `integer NOT NULL`, part of the handle, not merely display.

**D. IMDb validation rule** — `^tt[0-9]{7,}$`, at most 20 characters, enforced at both the MCP
boundary and as a `CHECK`. Syntax only; existence is never verified.

**E. Is imdb_id required?** — **No.** Optional, and Tonight works completely without it.

**F. Is imdb_id unique per user?** — **Yes**, when present:
`UNIQUE (user_id, imdb_id) WHERE imdb_id IS NOT NULL`. The same id may exist for different users.

**G. Are zero-Mix Movies allowed?** — **Yes**, and they remain visible in the top-level `movies`
array of `get_taste`.

**H. watched states and default** — `true` watched · `false` explicitly not watched · `null`
unknown. The column is `boolean NULL` with **no `DEFAULT`**; the natural default is `null`.

**I. liked states and default** — `true` liked · `false` disliked · `null` no opinion. `boolean
NULL`, default `null`.

**J. Omitted, on update** — leave the stored value exactly as it is.

**K. Explicit `null`, on update** — clear to unknown or no opinion. `null` is a value the caller
can set, and it is not the same as omitting the field.

**L. New MCP tools** — `create_movie`, `update_movie`, `delete_movie`. **Total: 11.**

**M. Does changing title or year rewrite MixMovie rows?** — **No.** The relation holds the uuid,
which does not move. Proved with `xmin`.

**N. Is the current `user_id` retained?** — **Yes**, for this slice, and Movies create no new
requirement to change it.

**O. Is v4 additive and rolling-deploy safe?** — **Yes.** Two new tables, nothing altered, nothing
dropped, no backfill. Migrate then deploy; an older build tolerates a database ahead of it and
never names the new tables.

**P. READY FOR CODEX REVIEW.** No product decision is outstanding.
