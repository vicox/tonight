# Tonight UI redesign — Stream, Vibe, Movie: implementation plan

Status: **revision 4, Codex plan review READY (review 5); implemented, then changed at the user's
direction as *Revision 5* and *Revision 6* at the end — on `main` at `3655dc2`. Accepted visually
by the user on the live preview, browser checks accepted by the user; Codex implementation:
READY. Released at the user's authorization (see the end).** Revision 3 was Codex READY (review 4)
on the old, writable baseline.

> **Revision 5 supersedes this plan where they differ.** The Stream has no summary, no dialog is
> left anywhere, and a film's screen asks *What do you think?* with five choices that write — the
> website's one write. Read the read-only statements below (the bullet after this one, §1, §4, §10.3,
> §12, §14 item 13) as history: they describe revision 4.

- **Baseline: `main` at `3e65ab9`** — the website read-only change (PR #11,
  `docs/work/web-readonly/PLAN.md`) on top of M9 (PR #10, `f3912b0`), M8 (PR #9) and the Genres audit
  (PR #8). Implementation starts from there and from nothing earlier.
- **The website is read-only and stays so.** Every screen in this plan displays and navigates, and
  nothing else: no edit, delete, form, menu, write route, server action or client request. Every
  change to a film, a verdict, a Genre, a Vibe or an evening is made through an assistant, over MCP.
- The mockup is illustrative. This plan takes its three screens and its navigation, and nothing
  that the data does not hold.

## 1. Goal and scope

Three screens, replacing today's single signed-in page with its dialogs:

| Screen | Shows | Never shows |
| --- | --- | --- |
| **Stream** (`/`) | every film once, as a flat list of dark cards, most recently saved first; each card: year (top left), status icon and word (top right), a prominent title, and ✨ with the Vibes it is in right under it | Genres, marks, groupings, a placeholder for a film in no Vibe, any control that changes data |
| **Vibe detail** | the Vibe's name, its instruction, its Genres (each opens its meaning), its films with their read-only marks | any control that changes data |
| **Movie detail** | title, year, IMDb link, the contextual Vibe (clickable) when reached through one, its other Vibes, where it stands and what was said (read-only), the user's own words for the standing verdict | Genres, a synopsis, a poster, evenings, any control that changes data |

Navigation: Stream → Vibe → Movie, and Stream → Movie → Vibe. A film may be in several Vibes: on the
Stream a card names all of them; on Movie detail the *contextual* Vibe is the one it was reached
through, **never** a property of the film.

**Read-only, as on `main`.** The new screens are `GET` pages that read the same two stores `/` reads
and link to each other. They add no `route.ts`, no server action, no `<form>`, no client `fetch`,
no router use and no store mutation; `lib/web/readonly.test.ts`, which holds the website to that, is
not changed and must stay green. **Nothing else changes** either: the taste and verdict models, any
store, schema or migration, the MCP server, the skills, the landing page, sign-in. The only style
change outside the new components is three colour tokens added to `app/globals.css` (§5.4).

## 2. Vocabulary and data availability (from the repository)

| Mockup word | In Tonight | Source | Available |
| --- | --- | --- | --- |
| Stream | internal name for the signed-in `/`; no new user-facing word — the visible heading stays *Your movies* | `app/page.tsx` | yes |
| Added | when the film was first saved: `Movie.createdAt` | `Written<Movie>.createdAt` (§5.3) | yes, except films saved before taste v6 (`null`) |
| Status | the viewing (*Want to see / Seen / Don't want to see*) and the standing judgement (*Liked / Loved / Disliked*) | `Movie.viewing`, `Position.judgement` | yes |
| Vibe label | the Vibe's `name`, the user's own | `Vibe.name`, `Movie.vibes` | yes |
| Vibe description | the Vibe's `instruction`, shown unlabelled as today | `Vibe.instruction` | yes |
| Genres | `Vibe.genres` (names, in the order given), each a `Genre` with its own `instruction` | `Taste.genres` | yes |
| Associated movies | the Vibe's members | `filmsIn(vibe, movies)` (`lib/web/vibes.ts`) | yes |
| Movie metadata | `title`, `year`, `imdbId` (outbound link only, never fetched), `vibes` | `Movie` | yes |
| Verdicts and status | **two read-only marks**: where it stands (*Want to see / Seen / Don't want to see*) and what was said (*Liked / Loved / Disliked / Nothing said*) — on `main` each is a `<span role="img">` with an accessible name and a tooltip, not a control | `components/movie-mark.tsx` (`MovieMark`, `VIEWING`, `JUDGEMENT`) | yes; changed only through an assistant |
| What they said | the standing judgement's `because` | `Position.because` (`lib/web/judgements.ts`) | yes — joined today, never rendered |
| Verdict history | replaced or withdrawn verdicts | verdict store | not on the website, as the privacy page says; not added |
| Synopsis, poster, runtime, cast | — | Tonight holds no catalogue and looks nothing up (README *The architecture*; `taste/model.ts`: "A Movie is not a catalogue entry") | **no** — not shown, not fetched, no placeholder |
| Watch history, evenings | Episodes | M9 | out of scope — see §9 |

M8 semantics as displayed, unchanged: a verdict is a judgement only (*Liked / Loved / Disliked*,
or nothing); *don't recommend it again* is the viewing `dont-want-to-see`, never a verdict; the
summary counts a judged film as seen (`lib/seen.ts`) while the viewing mark shows the raw viewing.

## 3. The baseline frontend (`main` at `3e65ab9`), and what is reused or goes

- `app/page.tsx` — server page; one address, landing or signed-in. Reads `tasteStore(visitor.user)
  .taste()` and `verdictStore(visitor.user).standing()`; renders `TasteView`.
- `components/taste-view.tsx` — *Your movies* summary, *Your genres*, *Your vibes*, copy prompt.
- `components/vibe-cards.tsx` — vibe cards (genre chips, loved count, three-title preview) and the
  vibe dialog (`Detail`, heading and `×`, no delete); the *N other movies →* line and its dialog.
- `components/genre-labels.tsx` — genre labels and the genre dialog (`Meaning`: instruction, films,
  `×`; no delete).
- `components/movie-summary.tsx` + `components/chosen.tsx` — the count line and its film dialogs.
- `components/movie-row.tsx` (`Films`) — the one film row, used by every dialog; two read-only marks;
  with `filed`, the Vibes a film is in (`filedUnder`, which says *Other movies* for none).
- `components/movie-mark.tsx` — `MovieMark`, `VIEWING`, `JUDGEMENT`; **no `"use client"`**, no
  hooks: an icon in a `<span role="img">` with `aria-label` and `title`.
- `lib/web/vibes.ts` — `filmsIn`, `filmsUnder`, `inNoVibe`, `inOrder`, `preview`, `spokenVibe`.
- `lib/web/movie-summary.ts`, `lib/web/judgements.ts` — selections, positions, `filedUnder`,
  `OTHER_MOVIES`, `recentlyAdded`; `lib/web/refocus.ts` — `returnTo`, `rescueTo`, `fallbackTo`.
- Gone on `main` already, and not brought back: `app/api/**`, `lib/web/api.ts`, `manage.*`,
  `pending.*`, `routes.test.ts`.

Reused unchanged: `MovieSummary`, `Chosen`, `GenreLabels`, `Section`, `Chip`, `WayOut`,
`CopyButton`, `SiteHeader`, `Account`, `LegalLinks`, and all of `lib/web` except as listed below.
Reused with one small, display-only addition each: `Films` (a title link), `MovieMark` (a visible
word) (§5.4). Removed once nothing calls them (step 5): `taste-view.tsx`, `vibe-cards.tsx`; from
`lib/web/vibes.ts` `inOrder`, `inNoVibe`, `preview`, `spokenVibe` and their private helpers (only
`vibe-cards.tsx` uses them), with their tests; `OTHER_MOVIES` (§6.1). `filmsIn` and `filmsUnder`
stay.

## 4. Routes

| Route | Signed in | Signed out |
| --- | --- | --- |
| `/` | Stream | landing page, unchanged |
| `/vibe?name=<vibe name>` | Vibe detail | `redirect("/")` |
| `/movie?title=<title>&year=<year>[&from=<vibe name>]` | Movie detail | `redirect("/")` |

- **Pages only.** Each new route is an `app/<route>/page.tsx` that renders on `GET`; there is no
  `route.ts`, so `readonly.test.ts`'s list of routes that accept a write stays exactly as it is.
- **Query parameters, not path segments.** A Vibe name and a film title are arbitrary user text: a
  Vibe may be called `..`, which a browser normalises out of a path before Next.js sees it, and
  titles such as `Face/Off` or `#Alive` are what a path segment carries worst. `URLSearchParams`
  round-trips any string.
- **`from` is navigation context, not data.** Vibe detail's rows set it; the Stream does not (a card
  is not in one Vibe). It is honoured only when the film is a member of that Vibe now (§6,
  `contextOf`); otherwise the page has no contextual Vibe. Nothing is written.
- **Owner.** As on `/`: the visitor comes from the session cookie and nowhere else. Query values only
  choose *which* of the visitor's own, already-read objects is shown; they never reach a store.
- **Headers.** `next.config.ts` gets rules for `/vibe` and `/movie` identical to `/`
  (`cache-control: private, no-store, max-age=0, must-revalidate`, `x-frame-options: DENY`,
  `referrer-policy: same-origin`) — the URL carries a film title and the response one person's data.
- **No `config.redirects`.** The signed-out redirect is `redirect()` from `next/navigation` inside the
  page (a server function, not the client router `readonly.test.ts` bans in components);
  `signin.test.ts` keeps asserting `config.redirects === undefined`.
- **Links.** `next/link` with `prefetch={false}` on every link to `/vibe` and `/movie`: the Stream
  renders a link per film plus one per Vibe membership, and each prefetch would be a private,
  uncacheable server render.
- No `loading.tsx`, no `not-found.tsx`, no per-page `metadata`: navigation waits for the server
  render, as a page load does today; a missing object is an in-page state (§7).

## 5. Data contracts

No endpoint and no new store query. Each signed-in page reads exactly what `/` reads today.

### 5.1 `lib/web/held.ts` — server-only, extracted from `app/page.tsx`

```ts
export type Held = { taste: Taste; standing: Standing[] };
/** The session's visitor, or null — a failure to resolve is logged and treated as signed out. */
export async function resolveVisitor(): Promise<SignedInVisitor | null>;
/** tasteStore(visitor.user).taste() and verdictStore(visitor.user).standing(), together. */
export async function readHeld(visitor: SignedInVisitor): Promise<Held | "unavailable">;
```

The bodies are today's `resolveVisitor`, `readTaste` and `report` from `app/page.tsx`, moved, not
changed. All three pages call them. Two reads, no write.

### 5.2 `lib/web/screens.ts` — pure, unit-tested

```ts
export function vibeHref(name: string): string;                         // "/vibe?name=…"
export function movieHref(film: MovieHandle, from?: string | null): string; // "/movie?title=…&year=…[&from=…]"
/** One search-param value, or null when absent or repeated (`?a=1&a=2`). */
export function single(value: string | string[] | undefined): string | null;
/** Exact stored name. Links are generated from stored names; a stale or hand-typed one is null. */
export function findVibe<T extends Vibe>(vibes: readonly T[], name: string | null): T | null;
/** By `filmKey` (lib/films/identity.ts) — the identity the store indexes. Year must be 4 digits. */
export function findMovie<T extends Movie>(movies: readonly T[], title: string | null, year: string | null): T | null;
/** `from` when the film is in that Vibe now, else null. */
export function contextOf(movie: Movie, from: string | null): string | null;
/** The film's Vibes other than the context, in `movie.vibes` order. */
export function alsoIn(movie: Movie, context: string | null): string[];
/** The Vibe's Genres as objects, in the Vibe's order; a name with no Genre is skipped. */
export function genresOf<T extends Genre>(vibe: Vibe, genres: readonly T[]): T[];
```

### 5.3 `lib/web/stream.ts` — pure, unit-tested

```ts
/** Every film once, most recently saved first. A new array; the input is not touched. */
export function stream<T extends Written<Movie>>(movies: readonly T[]): T[];
/** What a card's status shows, in order. Never empty. */
export type StatusKey = Viewing | Judgement;
export function statusOf(viewing: Viewing, judgement: Judgement | null): StatusKey[];
/** Vibes with no films (pre-core Vibes only, since M6), in store order. */
export function emptyVibes(vibes: readonly Written<Vibe>[], movies: readonly Shown[]): Written<Vibe>[];
/** Genres no Vibe is built from, in store order. */
export function looseGenres(genres: readonly Written<Genre>[], vibes: readonly Vibe[]): Written<Genre>[];
```

**What "added" is, from the schema.** `tonight_movies.created_at` (taste v6,
`lib/taste/store/schema.ts`) is set by the `tonight_written_at` trigger on `INSERT` to
`clock_timestamp()` and put back to its old value on every `UPDATE` — no writer can supply or change
it. It is the moment the film was first saved (an assistant saves it; the website cannot); a
retitle, a viewing, a refiling, a verdict (which never touches the film) leave it as it was;
deleting and saving a film again is a new save. The table is created once (v4) and no migration
inserts into it. It reaches the page as `Written<Movie>.createdAt`, an ISO string of fixed width
(`YYYY-MM-DDTHH:MM:SS.ffffffZ`, UTC, microseconds), so string order is time order — which
`recentlyAdded` already relies on. **It is `null` for every film saved before taste v6**: nobody
recorded that moment, and v6 deliberately did not invent one. Later migrations only update movie
rows (v9, v10 and v14, with the trigger disabled) and none of them writes `created_at`; v11 only
reads it.

`updatedAt` is **not** used: it moves on every change of viewing, refiling and retitle, and for
undated films it is one shared migration baseline, so ordering by it would reorder the Stream
whenever an assistant changed a status and say nothing true about when a film arrived.

`stream` order — newest first, regardless of viewing or verdict:

1. Films with a `createdAt`, newest first.
2. Then films with `createdAt: null`, after **every** dated film: unknown is neither old nor new, and
   is not guessed — the convention `newestFirst` in `lib/web/vibes.ts` and `recentlyAdded` already
   follow.
3. Ties — equal stamps, and the undated films among themselves — by title ignoring case, then year
   (the comparison `byTitle` in `lib/taste/model.ts` uses); and where that still says equal, by
   `filmKey(movie)` compared code unit by code unit (`<` / `>`, never `localeCompare`). `byTitle`
   alone is not total — `localeCompare` calls distinct titles such as `alien` and `a​lien`
   equal — and the rows `taste()` sorts come from a query with no `ORDER BY`, so its order cannot
   be leaned on. `filmKey` is the canonical title and the year, which the unique index
   `tonight_movies_identity (user_id, canonical_title, year)` makes distinct for every film of one
   user, so the comparison is total and the result does not depend on the input's order.

Invariants: every film exactly once; no film added, dropped or grouped; inputs not mutated; a change
of viewing or verdict changes no position (neither touches `createdAt`).

`statusOf` — one rule, from the facts the two marks hold:

- a standing judgement → `[judgement]`, plus `"dont-want-to-see"` when that is the viewing;
- no judgement → `[viewing]`.

So, each as icon **and** word, with the icon of the matching mark choice: *Want to see* → bookmark;
*Seen* → eye; *Don't want to see* → eye-off; *Liked* → filled thumbs-up, **blue**; *Loved* →
filled heart, **pink**; *Disliked* → thumbs-down; a judged film that is also *Don't want to see*
shows both. Only *Loved* and *Liked* carry a colour (the user's criteria name those two); every other
status is the quiet `ink-soft`, and *Disliked* is deliberately not red — a verdict is not an error.
A judgement already means watched (`lib/seen.ts`), so `seen` beside it would repeat it, and a
`want-to-see` beside it is the contradiction the summary already resolves as seen — the card agrees
with the counts above it. *Don't want to see* is implied by no judgement and is the one fact that
keeps a film out of every recommendation, so it is never hidden. Movie detail still shows the raw
viewing on its own mark, as today.

### 5.4 Component props

| Component | Kind | Props |
| --- | --- | --- |
| `StreamView` (`components/stream-view.tsx`) | server | `{ taste: Taste; standing: readonly Standing[] }` |
| `MovieCard` (`components/movie-card.tsx`) | server | `{ movie: Shown }` |
| `MovieStatus` (`components/movie-status.tsx`) | server | `{ viewing: Viewing; judgement: Judgement \| null }` — renders `statusOf(…)`: per key, the icon (`aria-hidden`, filled where the choice is) and the visible word of the matching choice in `VIEWING` / `JUDGEMENT`, coloured `text-loved` for `loved`, `text-liked` for `liked`, `text-ink-soft` otherwise. A server component: on `main`, `movie-mark.tsx` has no `"use client"`, so its two vocabularies are plain values — one source for every icon and word |
| `VibeLinks` (`components/vibe-links.tsx`) | server | `{ names: readonly string[]; label: string; labelVisible?: boolean; raised?: boolean }` — nothing when `names` is empty; otherwise an `aria-hidden` lucide `Sparkles` in `text-vibe`, the `label` (*Vibes:*, *Vibe:*, *Also in*, *In:*; visually hidden unless `labelVisible`, then quiet `ink-soft` text), then each name as a `Link` to `vibeHref(name)` in `text-vibe`, separated by `·`, wrapping. With `raised`, **each link** — never the wrapper — gets `relative z-10`: on a card only the names sit above the stretched Movie link, and the ✨, the label, the separators and the gaps stay under it, so a press there opens the Movie. Used by the card (`raised`) and by Movie detail, so a Vibe name links the same way wherever it appears |
| Colour tokens (`app/globals.css`, added) | — | `--color-vibe` (purple), `--color-loved` (pink), `--color-liked` (blue): values taken from the approved mockup, each at least 4.5:1 against `screen` (`#14141b`). If the mockup's exact values are not to hand, `#a78bfa`, `#f472b6`, `#60a5fa` measure about 6.8, 6.9 and 7.2:1. The `beam` comment is updated: amber stays the focus ring and the landing page's accent, and no longer marks Vibe names on the signed-in screens |
| `VibeView` (`components/vibe-view.tsx`) | server | `{ vibe: Written<Vibe>; genres: Written<Genre>[]; films: Shown[]; taste: Taste; movies: Shown[] }` |
| `MovieView` (`components/movie-view.tsx`) | server | `{ movie: Shown; context: string \| null }` |
| `BackToStream` (`components/back-to-stream.tsx`) | server | none — a link *← Your movies* to `/` |
| `Films` (`components/movie-row.tsx`, changed) | either | adds `from?: string` — the row's title becomes a link to `movieHref(movie, from)`; with `filed`, a film in no Vibe shows nothing (§6.1). The marks stay as they are on `main` |
| `MovieMark` (`components/movie-mark.tsx`, changed) | either | adds `labelled?: boolean` — the same `<span role="img">`, `aria-label` and `title`, plus `current.label` as visible text beside the icon (the box widens to fit); default off, so every existing call site is unchanged. Still not a control: no button, handler, hook or `"use client"` |

`movies` is always `withPositions(taste.movies, positions(standing))`, worked out once per page as
`TasteView` does today.

## 6. Screens

### 6.1 Stream — `app/page.tsx` → `StreamView`

`Yours` renders `StreamView` instead of `TasteView`; `Landing` is untouched. Top to bottom:

1. **`MovieSummary`, unchanged** — *Your movies* with its count, the count line and *recently added*,
   each opening `Chosen`. Rows in those dialogs, and in a genre's `Meaning` dialog, now link to
   Movie detail with no `from` (neither is a Vibe).
2. **The stream** — directly under it, no second heading: one flat `<ul aria-label="Your movies,
   most recently saved first">` of `MovieCard`, one per film of `stream(movies)`. No grouping, no
   section per status or Vibe; *Want to see*, *Seen*, *Don't want to see* and judged films are all
   ordinary cards. A card (`<li>`, `position: relative`), top to bottom:

   ```
   ┌───────────────────────────────────────────────┐   dark card: bg-screen, border-rule,
   │ 2021                               ♥ Loved    │   rounded-xl, on the night page
   │ Dune                                          │   year top left · status top right
   │ ✨ Space Tension · Quiet Dread                │   prominent title
   └───────────────────────────────────────────────┘   ✨ + Vibe names right under the title
   ```

   - **Surface** — a dark card: `bg-screen`, a `border-rule` edge, `rounded-xl`, padding, on the
     page's `night`; hover lifts the edge to `ink-faint`; while its title link has keyboard focus the
     card shows the `beam` focus ring (`has-[a:focus-visible]`).
   - **Top row** — the **year** at top left (small, `text-ink-faint`, `tabular-nums`, `aria-hidden`:
     the link below already says it), and the **status** at top right: `MovieStatus` — icon and word
     per §5.3, lucide icons, not emoji (*Loved* with a filled heart in pink, *Liked* with a filled
     thumbs-up in blue; *Want to see* bookmark, *Seen* eye, *Don't want to see* eye-off, *Disliked*
     thumbs-down, in `ink-soft`), two of them side by side, wrapping right-aligned, when a judged film
     is also *Don't want to see*. Read, never pressed: no button, no handler, no `tabIndex`; it
     changes only when an assistant changes the film or the verdict.
   - **Title** — the most prominent text on the card: `font-display`, larger than anything else on
     it (about `text-[22px]`), `text-ink`, wrapping (`min-w-0 break-words`). It is a `Link` to
     `movieHref(movie)` (no `from`) stretched over the whole card (`after:absolute after:inset-0`),
     so pressing anywhere on the card but a Vibe name opens Movie detail. Its accessible name is
     *Dune (2021)*: the visible year is above, so the link carries ` (2021)` as visually hidden text
     — two *Dune*s stay two links a listener can tell apart.
   - **Vibes, immediately under the title** — `VibeLinks names={movie.vibes} label="Vibes:" raised`:
     a purple ✨ and **every** Vibe the film is in, in `movie.vibes` order, each its own purple link
     to that Vibe. Only the links are raised above the stretched link, so a name opens the Vibe,
     never the Movie, while the ✨, separators and gaps around the names still open the Movie. All
     of them rather than the first and a count: a film in two Vibes is in both, *"Space Tension +2"*
     is the form `filedUnder`'s comment already rules out as unreadable, and every Vibe is one press
     away without a second card.
   - **In no Vibe** — nothing: no line, no ✨, no *No vibe assigned* or *Other movies*.
   No Genre, no mark, no IMDb link, no date beyond the year, no image, no control. The links are
   siblings, never nested. **Reading order and layout are set separately:** the DOM — and so the
   screen reader and tab order — is the title link, then the status (not focusable), then the Vibe
   names; a CSS grid (`grid-template-areas: "year status" "title title" "vibes vibes"`) places them,
   so the year and status sit on the top row and the Vibes sit visually immediately under the title.

   *Other movies* no longer names a place anywhere — its line and dialog go with `vibe-cards.tsx` —
   so it is dropped wherever it stood for "no Vibe": `filedUnder` returns `movie.vibes` (empty for
   none) and `Filed` renders nothing for an empty list; `OTHER_MOVIES` is removed; Movie detail shows
   no line (§6.3). The texts that name it are updated (§11).
3. **Remainder, only when non-empty** — two small `Section`s, so that every Vibe and every Genre in
   the model stays readable on the website, as on `main` (whose *Your genres* and *Your vibes* show
   all of them), while the Stream reaches a Vibe only through a film in it:
   - *Vibes with no films* — `emptyVibes(…)` as links to `vibeHref`.
   - *Other genres* (note: *Genres no vibe is built from yet.*) — `GenreLabels` over
     `looseGenres(…)`, each opening its meaning as on `main`.
   These are the only Genre names on the Stream, and only those that belong to no Vibe. They are not
   film groupings: no film is in them. Nothing on the website removes a Genre or a Vibe, and nothing
   refreshes the page, so a section here changes only on a navigation or a reload; `GenreLabels`'
   focus return is used as on `main`.
4. **Copy prompt** — `Prompt` moved verbatim from `taste-view.tsx`.

Empty state: no films → no summary (as today) and, in place of the stream, today's sentence
*Nothing here yet. Tell ChatGPT what you are in the mood for, and what you tell it can be saved
here.* The remainder sections still render if they have anything.

### 6.2 Vibe detail — `app/vibe/page.tsx` → `VibeView`

`dynamic = "force-dynamic"`. `resolveVisitor` → `redirect("/")` if null → `readHeld` →
`findVibe(taste.vibes, single(query.name))`.

1. `BackToStream`.
2. A `<section>` whose heading is the Vibe's name, carrying `data-fallback` and `tabIndex={-1}` so
   `GenreLabels`' focus return (`sectionFallback`) still finds it. Nothing beside the heading.
3. **Genres**: `GenreLabels genres={genresOf(vibe, taste.genres)} vibes={taste.vibes}
   movies={movies}` — the Vibe's Genres, visible, each opening `main`'s `Meaning` dialog (its
   instruction, the films under it, the `×`). This is the only screen on which a Vibe's Genres
   appear. (Reading of "genres displayed here on click": the Genres are shown on the screen a click
   on the Vibe opens, and a click on one shows what it means. If the list itself should start
   collapsed, it is a `<details>` around the same line.)
4. **Description**: `{vibe.instruction}`, `whitespace-pre-line`, as in today's dialog.
5. **Films**: `Films movies={filmsIn(vibe, movies)} from={vibe.name}` — `main`'s rows with their
   read-only marks, in the store's order as today's dialog lists them, the title now a link to Movie
   detail with this Vibe as context. Empty: *No films in this vibe yet.*

Nothing on Vibe detail changes the Vibe, its Genres or its films; that is done through an assistant.

### 6.3 Movie detail — `app/movie/page.tsx` → `MovieView`

`dynamic = "force-dynamic"`. `resolveVisitor` → `redirect("/")` if null → `readHeld` →
`findMovie(movies, single(query.title), single(query.year))` →
`context = contextOf(movie, single(query.from))`.

1. `BackToStream`.
2. **Contextual Vibe** (when `context`): `VibeLinks names={[context]} label="Vibe:"` — the same purple
   ✨ and link as on a card.
3. **Heading**: `title (year)`; the IMDb link when `imdbId` is set — today's file-local `Imdb` in
   `movie-row.tsx`, exported unchanged (`rel="noreferrer noopener"`).
4. **Where it stands, and what was said** — read-only: `MovieMark mark={VIEWING}
   value={movie.viewing} labelled` and `MovieMark mark={JUDGEMENT}
   value={movie.position?.judgement ?? null} labelled` — each its icon and its word (*Nothing said*
   when no verdict stands), with `main`'s accessible name and tooltip. Both facts, separately and
   raw, where the card shows one summary of them (§5.3).
5. **Their words**: `movie.position.because`, quoted, only when a judgement stands and it is present.
6. **Other Vibes**: with a context, `VibeLinks names={alsoIn(movie, context)} label="Also in"
   labelVisible` (absent when empty); without one, `VibeLinks names={movie.vibes} label="In:"`; in
   none, nothing. From a Vibe, its own film rows carry that Vibe as the new context.

No Genre, synopsis, poster, rating, date, core marker or evening. No control of any kind — no edit,
delete, retitle, refile, menu or form: every change to the film or to what was said about it is made
through an assistant, as the README and the legal pages say.

## 7. States

| State | Stream | Vibe detail | Movie detail |
| --- | --- | --- | --- |
| signed out / session unresolvable | landing (today) | `redirect("/")` | `redirect("/")` |
| store unreadable | today's *Your taste could not be read just now* | same sentence | same sentence |
| not found (stale link, rename, delete, bad or repeated param, a film with a verdict but never saved) | — | *Nothing here — it may have been renamed or deleted.* + `BackToStream`; the query is not echoed | same |
| `from` absent / not a member | — | — | no contextual Vibe; *In …* line, or nothing in no Vibe |
| empty | §6.1 empty sentence | *No films in this vibe yet.* | — |
| undated films (before taste v6) | after every dated card, by title then year, then `filmKey` (§5.3) | — | — |
| film in no Vibe | card without a Vibe line | — | no Vibe line |
| a change made through an assistant | shown on the next navigation or reload; a card's status changes, its place does not | same | same |

There is no pending, saving, refused or deleted state: nothing on these screens writes. Back and
forward may restore Next's previous render of a screen until it is reloaded or navigated to; nothing
re-reads it on the client, because `readonly.test.ts` keeps the router and `fetch` out of every
component.

## 8. Implementation steps

Each step leaves `npm run test`, `typecheck` and `lint` green — `readonly.test.ts` included — and is
shippable on its own.

0. **Baseline.** On a fresh branch from `main` at `3e65ab9`, `npm ci`, record `npm run test` (the
   read-only change recorded 1306 tests, 1302 passing, the 4 failures the known
   `lib/evaluation.test.ts` ones), `typecheck`, `lint`.
1. **Pure helpers.** `lib/web/screens.ts` + `screens.test.ts`; `lib/web/stream.ts` +
   `stream.test.ts`. No UI change.
2. **Shared read.** `lib/web/held.ts` from `app/page.tsx`, no behaviour change; update the
   `signin.test.ts` contract (§10).
3. **Vibe detail.** `app/vibe/page.tsx`, `VibeView`, `BackToStream`; header rule for `/vibe`.
   Reachable by URL only.
4. **Movie detail and links.** `app/movie/page.tsx`, `MovieView`; header rule for `/movie`;
   `MovieMark.labelled`; `Films.from`, titles become links. From here today's dialogs link into the
   detail screens (the vibe dialog passes its name as `from`), so steps 3–4 ship without the Stream.
5. **Stream.** `StreamView`, `MovieCard`, `MovieStatus`, `VibeLinks` (and Movie detail switched to
   it); the three colour tokens; `app/page.tsx` renders it; `filedUnder` without *Other movies*;
   delete `taste-view.tsx`, `vibe-cards.tsx`, `OTHER_MOVIES`, and `inOrder` / `inNoVibe` / `preview`
   / `spokenVibe` with their tests; rewrite the affected contract tests.
6. **Text.** README *The website*, the privacy page's *shows you less* paragraph, and the
   `disclosures.test.ts` pins on them (§11) — in the same commit as step 5, since step 5 makes the
   old wording untrue. Browser check (§10.4).

## 9. Baselines and dependencies

- **The read-only website (`3e65ab9`) is the baseline, and its rules bind every step.**
  `readonly.test.ts` walks `app/`, `components/` and `lib/` and fails on: an `app/api` tree; a
  `route.ts` exporting `POST`, `PUT`, `PATCH` or `DELETE` beyond sign-in, sign-out, MCP and OAuth; a
  `"use server"` directive; `fetch(`, `router.refresh(` or `useRouter` in a component; a `<form>`
  outside `site-header.tsx`'s sign-in and sign-out; a store write (`create*`, `update*`, `delete*`,
  `say`, `forget`, `record`, `addRound`, `correct`) called from a page or component. Every new file
  in this plan is inside those rules, and the test is not edited to make room for anything. The
  read-only change's open items — operator approval of its legal wording, and the stale
  *"management surface"* line in `skills/tonight-recommend/SKILL.md` — are not part of this plan.
- **M9 (`f3912b0`) — no dependency.** M9 changes Episodes; its out-of-scope list includes "any
  Movie identity", "enriching what is read about a Movie, or aggregating history per Movie" and
  "changing how recommendations read or filter". The screens read `Taste` and `Standing` only; M9
  changes neither, and the Stream's order uses only `Movie.createdAt`, which M9 does not touch.
- **The screens must not read Episodes.** No card or Movie detail shows an evening, offer, *started*
  or *finished*, and "added" is the film's save time, never an evening's: that would be the per-Movie
  history M9 excludes, and the privacy page states (pinned in `disclosures.test.ts`) that the
  evenings Tonight recorded are not on the website.
- **Files shared with earlier work.** This plan edits the README's *The website* section, the
  privacy page's *This website shows you less* paragraph and, in `disclosures.test.ts`, only the
  test *the website is disclosed as a narrower view…* — each on top of the wording the read-only
  change left there. No other open branch is known to touch them.
- **Vocabulary.** The viewing labels and the judgement set are `main`'s and unchanged; M9's D3
  wording is MCP and skill text.

## 10. Tests

UI tests here are source contracts (`node --test` cannot render JSX — see the header of
`lib/web/overview.test.ts`) plus pure logic. This plan keeps that style and adds no framework.

### 10.1 Pure tests

- `screens.test.ts` (new) — `vibeHref`/`movieHref` round-trip through `URLSearchParams` for `..`,
  `.`, `Face/Off`, `#Alive`, `Who Framed Roger Rabbit?`, `C++`, `100%`, `a&b=c`, a non-BMP character
  and surrounding spaces; `from` omitted when null or absent. `single` rejects arrays and undefined.
  `findVibe` exact only (other case → null). `findMovie` resolves an alternate spelling by
  `filmKey`, rejects the other year, a non-4-digit or non-numeric year, a missing title.
  `contextOf` null for a non-member and for null. `alsoIn` excludes the context and keeps order.
  `genresOf` keeps the Vibe's order, skips an unknown name.
- `stream.test.ts` (new) — `stream`: newest `createdAt` first, across microsecond-close stamps;
  every undated film after every dated one, including a dated film far older than "now"; ties and
  undated films by title ignoring case, then year (`Dune 1984` before `Dune 2021`, `alien` before
  `Brazil`); the same answer for shuffled input; every film exactly once; the same order whatever
  the films' viewings and positions (a film turned *Loved* or *Don't want to see* keeps its place);
  `[]` for none; input unmutated; two undated films of one year whose titles `localeCompare` calls
  equal (`alien` / `a​lien`) come out in the same order from both input orders, decided by
  `filmKey`. `statusOf`: the full table — three viewings × (no judgement and each of three
  judgements), twelve rows, including `want-to-see` + `loved` → `["loved"]` and `dont-want-to-see` +
  `disliked` → `["disliked", "dont-want-to-see"]`; never empty. `emptyVibes` and `looseGenres` exact
  and ordered.
- `vibes.test.ts` — the `inOrder`, `inNoVibe`, `preview` and `spokenVibe` cases go with the
  functions; `filmsIn` / `filmsUnder` cases stay.
- `movie-summary.test.ts` — *a film in no vibe is filed under the words the page already uses*
  becomes: a film in no Vibe is filed under nothing (`[]`), and no *Other movies* is produced.
- `refocus.test.ts` — unchanged.

### 10.2 Contract tests (`overview.test.ts` as on `main`, rewritten where it pins removed files)

Retired with the files they pin, each replaced by the intent below: *films in no vibe are one line
under the vibes, not a section*; *films, genres and vibes are three peers, drawn by one section*;
the vibe half of *a genre is a compact label, and a vibe is a compact card*; *a closed vibe card is a
name, what it is made of, and a loved count*; *a card previews three of its films*; *a vibe card
opens its own dialog*; *a vibe dialog is dismissed like the others*; *what a vibe card shows is read
off the films*; *the vibes' remainder is dismissed…*; *with no vibes at all, the films in none of
them are still reachable* (now: the Stream lists them); *the remainder's focus is handed back…*.
Ported (same intent, new file): *the resting page shows names and counts, and no instruction*;
*nothing on the page offers to create anything* (all three screens); *the page has no management
section and no way to edit anything* (all three screens and every new component); *both detail
dialogs carry a heading and a way out, and nothing to manage with* (the genre dialog; the Vibe
page's heading has nothing beside it); the genre half of *a genre or vibe that has gone hands focus
on*; *every dialog is left by a ×* (genre, summary); *a long name stays inside…* (card, Vibe heading,
Movie heading). Kept: *a mark is an image with a name, not a control* and *a mark writes nothing,
and keeps nothing of its own* — extended to `labelled`; *the dialog shows the page's own rows, and
says where each film is filed* and *a row reads title, year, IMDb, then where it is filed, then the
mark* — `Filed` renders nothing for `[]`.

New pins:

- **Stream** — `StreamView` passes `stream(movies)` (no Vibes argument) to one `<ul>` of
  `MovieCard`, with no other film list and no heading between cards; `MovieCard` references no
  `genres`, `Chip`, `GenreLabels`, `MovieMark`, `<img`, `poster`, `synopsis`, `createdAt`,
  `Other movies`, `No vibe`; the card carries `bg-screen`, `border-rule` and `rounded-xl`; the year
  is rendered apart from the title and `aria-hidden`; the title `Link` goes to `movieHref(movie)`
  with no `from`, is `font-display` and the largest text size in the file, contains the year as
  `sr-only` text, and carries the stretched `after:absolute after:inset-0`; `VibeLinks` is given
  `movie.vibes` and `raised`; the DOM order is title link, `MovieStatus`, `VibeLinks`, and the grid
  areas put `vibes` in the row directly below `title`; `MovieStatus` is rendered with
  `movie.viewing` and the standing judgement; `GenreLabels` on the Stream receives only
  `looseGenres(`; `MovieSummary` and `Prompt` still render; every `Link` sets `prefetch={false}`.
- **Status** — `MovieStatus` uses `statusOf(` and takes icon, fill and word only from `VIEWING` /
  `JUDGEMENT` choices; the word is visible text and the icons are `aria-hidden`; `loved` maps to
  `text-loved`, `liked` to `text-liked`, everything else to `text-ink-soft`; it has no
  `"use client"`, hook, `button`, `onClick`, `onKeyDown` or `tabIndex`.
- **Vibe links** — `VibeLinks` renders nothing for an empty list; its `Sparkles` and links use
  `text-vibe`, the icon is `aria-hidden`, each name is a `Link` to `vibeHref(` with
  `prefetch={false}`; with `raised`, `relative z-10` is on each `Link` and not on the wrapper (the
  wrapper carries no `z-` class and no `relative`); `MovieView` uses it for the contextual and other
  Vibes. `globals.css` defines `--color-vibe`, `--color-loved`, `--color-liked`.
- **Vibe detail** — `{vibe.instruction}` rendered once; `GenreLabels` given `genresOf(`; `Films`
  given `from={vibe.name}`; the heading carries `data-fallback`; nothing beside it.
- **Movie detail** — no `genres`, `synopsis`, `poster`, `<img`, `episode`, `offer`, `Other movies`;
  both marks, `VIEWING` and `JUDGEMENT`, with `labelled`; the contextual link goes through
  `contextOf(` and `vibeHref(`; `because` only under a standing judgement.
- **Nothing to press but links and views** — the source of the seven new components (`StreamView`,
  `MovieCard`, `MovieStatus`, `VibeLinks`, `VibeView`, `MovieView`, `BackToStream`) and the two new
  pages contains no `<button`, `role="menu"`, `aria-haspopup="menu"`, `onClick`, `<form`, `<input`,
  `"use client"`, `Manage` or a delete or edit control; their own interactive elements are `Link`s.
  The only other controls on the three screens are `main`'s existing ones that open and close a view
  — `GenreLabels`' labels, `MovieSummary`'s counts, each dialog's `×` — and the copy prompt's
  `CopyButton` with its read-only clipboard-fallback textarea; none of them writes anything.
- **Rows and marks** — the title link keeps `{movie.title} ({movie.year})`; `labelled` keeps the
  `role="img"`, the `aria-label` and the `title` exactly, adding only visible text.

### 10.3 Boundary and disclosure tests

- `readonly.test.ts` — **unchanged, and green after every step.** It walks the new pages and
  components like every other file: it is the evidence that the website still writes nothing, and
  that the new screens added no write route, server action, form, client request or store write.
- `signin.test.ts`, *the home page is declared private and uncacheable* — extended to `/vibe` and
  `/movie`.
- `signin.test.ts`, *the signed-in page opens one store…* — retargeted: `lib/web/held.ts` holds the
  only `tasteStore(visitor.user)` and `verdictStore(visitor.user)`; `app/page.tsx` still reads no
  `searchParams`/`params`; `app/vibe/page.tsx` and `app/movie/page.tsx` read `searchParams` only into
  `single(` → `findVibe(`/`findMovie(`/`contextOf(`, call `readHeld(visitor)`, and call no store
  operation that writes.
- `signin.test.ts`, *there is one application route, and no /dashboard behind it* — kept (no
  `/dashboard`, no `config.redirects`), retitled; plus: the `page.tsx` files under `app/` are exactly
  `/`, `/vibe`, `/movie` and the three legal pages.
- `disclosures.test.ts`, *the website is disclosed as a narrower view than the MCP answer…* — the
  four pins on the old layout are replaced by the §11 wording: privacy `lists the rest under` and
  `Other movies` → the sentence that every saved film is listed with the Vibes it is in; README
  `shows a Vibe-oriented view of the model` and `a Movie in no Vibe is listed under \*Other movies\*`
  → their §11 replacements. Every other pin in that test is unchanged and must hold — the three
  omissions, *None of that is deleted…*, and all of the read-only change's pins: *changes none of it:
  it has no write endpoint*, *is made through an assistant*, *the signed-in page only shows them*,
  *delete any vibe at any time through your assistant*, the terms' *the website only shows them*, and
  the absence of every claim of a website control. No other test in the file is touched.

### 10.4 Browser check (manual, `npm run dev`, signed in with a local Google client)

1. Stream: one flat list, each film once, most recently saved first; a film saved now (through the
   assistant) appears at the top on reload; *Want to see*, *Seen*, *Don't want to see* and judged
   films are ordinary cards with the §5.3 icons; a film in two Vibes shows ✨ and both names; a film
   in none shows no Vibe line; summary counts and dialogs as on `main`, and a row's title inside a
   summary dialog opens Movie detail with the dialog gone; copy prompt works. (A fresh development
   database dates every film — the trigger allows no `NULL` — so undated ordering is held by
   `stream.test.ts`, not here.)
2. Press a card anywhere but its Vibe names — including the year, the status, the ✨, a `·`
   separator and the gaps between names — → Movie detail with no contextual Vibe and an *In* line;
   press a Vibe name on a card → that Vibe, never the Movie.
3. Stream → Vibe → film row → Movie: the contextual Vibe is that Vibe; → its link → back on the Vibe.
   Stream → card → Movie → an *In* Vibe → that Vibe.
4. Through an assistant, mark a film *Loved*, then *Don't want to see*; reload the Stream: the card's
   status shows the new value and the card is **where it was**; Movie detail, navigated to, shows
   both facts in words.
5. **Nothing changes data:** the Stream, a Vibe, a Movie, the genre dialog and the summary dialogs
   show no button but `×`, the dialogs' ways in and the copy prompt's *Copy*, no menu, no form, no
   *Delete*, *Manage* or edit control; every mark is an image with a tooltip; the only forms on any page are sign-in and
   sign-out.
6. Keyboard only: per card the title then each Vibe name, focus visible; statuses and marks are
   never tab stops; the genre dialog returns focus to its label on close.
7. Screen reader: a card reads as its title and year, its status (*Loved*, or *Loved* and *Don't
   want to see*), then *Vibes:* and each name; nothing announces a missing Vibe; Movie detail's two
   marks read with `main`'s names.
8. Stale URL, `?year=abc`, `?name=a&name=b`, `from` of a Vibe the film is not in; signed out on
   `/vibe` and `/movie` → `/`; response headers on both routes.
9. Narrow viewport: a 200-character title wraps under the top row without running into the status;
   two statuses side by side wrap right-aligned; three 60-character Vibe names wrap inside the card;
   headings wrap on the detail screens.
10. **Visual check against the approved mockup** — side by side, at a desktop width and at 375 px,
    with a development account holding one film in each status (want to see; seen; don't want to
    see; liked; loved; disliked; loved and don't want to see), one in two Vibes, one in none, and one
    with a 200-character title, all saved through an assistant as usual. Each of §12 V1–V8 holds,
    and spacing, sizes and colours match the mockup; any difference is either fixed or written down
    as accepted by the user. The mockup is not in the repository: the implementer gets it from the
    user and attaches it, with the two screenshots, to the pull request.

## 11. Text changes (on top of the read-only wording on `main`)

- **README, *The website*** — "One address serves two pages: a landing page for anyone, and — for
  whoever is signed in — their own taste model, …" says three screens instead: a landing page for
  anyone and, for whoever is signed in, the Stream of their films, a page for each Vibe and a page for
  each film, read through the same store the MCP tools use. "The website shows a Vibe-oriented view
  of the model and changes none of it: it has no write endpoint, …" becomes "The website shows a
  film-centred view of the model, with a page for each Vibe, and changes none of it: it has no write
  endpoint, …" — the rest of that paragraph, *is made through an assistant* included, verbatim. "The
  page is organised around Vibes, and a Movie in no Vibe is listed under *Other movies* beneath them
  — recording that somebody watched a film makes one, and so does deleting the last Vibe it was in."
  becomes "Every Movie is listed, newest first, with the Vibes it is in — a Movie in no Vibe is
  listed too, and recording that somebody watched a film makes one, as does deleting the last Vibe
  it was in." *The website is a view of it, not the definition of it* stays verbatim.
- **Privacy, *This website shows you less*** — "The signed-in page is built for reading a
  collection: it groups your films under the vibes they are in, lists the rest under “Other
  movies”, and keeps each instruction one click away rather than on the page." becomes "The
  signed-in pages are built for reading a collection: they list every film you saved, each with the
  vibes it is in, and keep each instruction a click or two away rather than on the overview."
  Nothing about what is stored, disclosed or editable changes; the three named omissions and the
  rest of the paragraph stay verbatim, and so does every sentence the read-only change wrote. A
  description of the layout, not of what is done with data — so no `LEGAL_UPDATED` change is
  proposed; the operator approves the wording before merge, as for the read-only change.
- **Terms** — no change: "the website only shows them" and every sentence about the assistant
  stay true.

## 12. Acceptance criteria

1. `/` (signed in) lists every saved film exactly once, in one flat list without groupings, most
   recently saved first per §5.3 — whatever its viewing or verdict; *Want to see*, *Seen* and *Don't
   want to see* films are ordinary cards.
2. Each card meets the visual criteria V1–V8 below. No card shows a Genre, a mark, a date beyond the
   year, or an image.
3. Pressing a card opens Movie detail; pressing a Vibe name on it opens that Vibe.
4. A change of viewing or verdict, made through an assistant, never moves a card; undated
   (pre-taste-v6) films are after every dated film, by title then year, then `filmKey`; the order is
   the same on every render.
5. Vibe detail shows name, instruction, Genres (each opening its meaning), and its films with their
   read-only marks; each film opens Movie detail with this Vibe as context.
6. Movie detail shows title, year, IMDb link when there is an id, the contextual Vibe as a link when
   valid, its other Vibes as links (nothing when in none), where it stands and what was said as
   read-only marks with their words, and the user's own words when a judgement stands. It shows no
   Genre, synopsis, poster or evening.
7. Stream → Vibe → Movie → Vibe and Stream → Movie → Vibe work; a screen navigated to shows what the
   stores hold at that moment.
8. A film's context comes only from `from` and only when it is a member; no URL can show another
   account's data or a film not saved by this account.
9. **The website writes nothing.** No screen has an edit, delete, menu, form or other control that
   changes data; the new code adds no `route.ts`, server action, `<form>`, client `fetch`, router use
   or store write; `readonly.test.ts` is unchanged and green. Every change is made through an
   assistant over MCP. The verdicts shown are *Liked / Loved / Disliked / Nothing said*; *Don't want
   to see* is a viewing.
10. Everything readable today stays readable: summary counts and dialogs, recently added, every Vibe
    (including one with no films), every Genre (including one no Vibe is built from), the copy
    prompt, the landing page.
11. `/vibe` and `/movie` are `private, no-store`, `DENY`, `same-origin`; signed out they redirect to
    `/`.
12. Closing a genre or summary dialog returns focus to what opened it, as on `main`.
13. Keyboard and screen reader per §10.4 items 6–7: statuses and marks are never focusable; every
    link is.
14. README and privacy say what the screens do (§11); `disclosures.test.ts` holds.
15. `npm run test` (only the four known failures), `typecheck`, `lint`; `skills/*/test.sh` and
    `chatgpt-plugin/test.sh` unaffected.
16. No change to any schema, migration, store, route handler, MCP tool or skill.

**Visual criteria for a Stream card** (the user's; checked in the browser against the approved
mockup, §10.4 item 10, and pinned in source where a pin can hold them, §10.2):

- **V1 Dark card.** Each film is its own dark card — `bg-screen` with a `border-rule` edge and rounded
  corners on the `night` page — not a row in a table or list of lines.
- **V2 Year top left.** The release year sits at the card's top left, small and quiet.
- **V3 Status top right, icon and word.** At the card's top right, non-interactive:
  - *Loved*: filled heart + *Loved*, both **pink** (`text-loved`);
  - *Liked*: filled thumbs-up + *Liked*, both **blue** (`text-liked`);
  - *Want to see*: bookmark + *Want to see*;
  - *Seen*: eye + *Seen* (the eye the *Seen* mark already uses; the criteria allow check or eye);
  - *Don't want to see*: eye-off + *Don't want to see*;
  - *Disliked* (not in the user's list, but a verdict M8 keeps): thumbs-down + *Disliked*;
  - the last four in `ink-soft`; a judged film that is also *Don't want to see* shows its verdict and
    *Don't want to see* side by side (§5.3).
- **V4 Prominent title.** The film's title is the largest, most prominent text on the card (display
  serif, `ink`), wrapping rather than truncating.
- **V5 Vibes immediately under the title.** A **purple** ✨ (`text-vibe`) followed by every Vibe the
  film is in, each a clickable purple link to that Vibe, directly beneath the title with nothing in
  between.
- **V6 No placeholder.** A film in no Vibe shows no Vibe line at all — no *No vibe assigned*, no
  *Other movies*, no empty ✨.
- **V7 Pressing.** The card opens Movie detail; a Vibe name opens Vibe detail; the status, year,
  ✨, separators and gaps are not separate targets — a press on them opens Movie detail.
- **V8 Legible.** Pink, blue and purple each at least 4.5:1 against the card; text wraps inside the
  card at 375 px; the layout matches the approved mockup, or the difference is recorded as accepted.

## 13. Not in this plan

Any control on the website that changes data — editing, deleting, adding, retitling or refiling a
film, a verdict, a Genre or a Vibe, mark menus, forms, write routes, server actions; every change
stays with the assistant. Also: synopsis or any looked-up metadata; posters; a catalogue; a core
marker; dates or "added … ago" on any screen; verdict history (replaced or withdrawn verdicts);
groupings, sections, filters or sort options on the Stream; hiding or dimming any viewing; marks on
Stream cards; recolouring the marks on Movie detail or the rows; restyling the landing page (its
worked examples keep amber for vibes); evenings or per-Movie history; search, pagination; loading
skeletons; per-page document titles; refreshing a screen on the client; backfilling `created_at`;
any change to recommendations.

## 14. Decisions (recommended; for the user's approval)

1. **Flat Stream ordered by `createdAt`, newest first**, regardless of viewing or verdict — the
   persisted, trigger-set save time; `updatedAt` rejected (moves on every change; a shared baseline
   for legacy films).
2. **Undated films (`createdAt: null`, saved before taste v6) after every dated film, by title then
   year** — not guessed and not backfilled; the same title/year rule breaks equal stamps, and
   `filmKey` by code unit breaks what that leaves, so the order is total.
3. **Status: one rule (`statusOf`)** — the standing judgement if any, else the viewing; *Don't want to
   see* always shown, beside a judgement when both hold. Read-only, as everything on the website is.
4. **Every Vibe on the card**, one purple ✨, each name its own purple link — no first-plus-count, no
   second card. The same `VibeLinks` on Movie detail, so a Vibe name looks and links the same on both.
4a. **Colour**: three new tokens (`vibe` purple, `loved` pink, `liked` blue) from the approved mockup;
   only *Loved* and *Liked* statuses are coloured, *Disliked* is not red; amber stays the focus ring
   and the landing page's accent. *Seen* keeps the eye of its mark rather than a check.
5. **No placeholder for a film in no Vibe** — on cards, on Movie detail, and in dialog rows
   (`filedUnder` without *Other movies*); README, privacy and their pins follow.
6. **The whole card opens Movie detail** (stretched title link, Vibe links raised above it); a Movie
   opened from the Stream has no contextual Vibe.
7. **No marks on Stream cards** — the card shows one status summary; the two read-only marks stay on
   Movie detail (with words) and on every film row.
8. **Routes with query parameters**, as `GET` pages, rather than nested dialogs or path segments (§4).
9. **Stream remainder sections** for Vibes with no films and Genres no Vibe is built from — so every
   Vibe and Genre stays readable on the website without Genres on the Stream's cards.
10. **Their own words (`because`) on Movie detail** — already joined, never shown.
11. **Other Vibes on Movie detail** (*Also in* / *In*) — membership is several; the context is one.
12. **Genres visible on Vibe detail**, not collapsed (§6.2, 3).
13. **Read-only by construction** — the redesign adds pages and links only, reuses `main`'s read-only
    marks (with a visible word on Movie detail), and leaves `readonly.test.ts` untouched as its guard.

## Review log

- **Codex plan review 1 — NOT READY.** Blocking: deleting the last Genre in *Other genres* removed
  the section whose heading `GenreLabels` falls back to. Fixed with a page-level focus fallback.
  Non-blocking notes adopted.
- **Codex plan review 2 — READY** (revision 1, Vibe-grouped Stream).
- **Revision 2 — user-approved change of direction.** One flat, film-centric Stream: one card per
  film, newest saved first regardless of verdict, a read-only status, every Vibe as a ✨ link, no
  placeholder for no Vibe, no groupings. Not reviewed: a Relay busy collision.
- **Revision 3 — the user's explicit visual criteria** (§12 V1–V8, §10.4 item 10).
- **Codex plan review 3 (revision 3) — NOT READY.** Blocking: (1) the fallback order was not total;
  (2) raising the whole `VibeLinks` wrapper made the ✨, separators and gaps dead areas. Fixed:
  `filmKey` by code unit as the final tie-break; `VibeLinks raised` lifts each link only.
  Non-blocking note adopted: DOM order and grid placement set separately.
- **Codex plan review 4 — READY** (revision 3, writable baseline).
- **Revision 4 — rebased onto the read-only website on `main` (`3e65ab9`), at the user's request.**
  The film-centric design is unchanged. Removed: every website write path the plan used — the mark
  menus and their `PATCH /api/movies` / `PATCH /api/verdicts` writes on Movie detail and rows, Vibe
  and Genre deletes (`Manage`, `VibeActions`, `router.replace`), and with them the delete-focus fix
  (`GenreLabels fallback`, `pageFallback`, the `SiteHeader` attribute), the Back-refresh client
  island, `routes.test.ts`, and the states and checks for pending, refused and deleted. Changed:
  baseline and status (header, §3, §9); §1 and §2 (read-only marks, no verdict history); §4 (pages
  only); §5.4 (`MovieStatus` a server component; `MovieMark.labelled` display-only; `VibeActions`
  gone); §6.1 remainder (readability rather than deletes); §6.2 and §6.3 (no controls); §7; §8 steps
  0, 3–5; §10 (`readonly.test.ts` as the guard, test names rebased on `main`'s `overview.test.ts`, a
  *nothing to press but links* pin, browser checks 4–7); §11 (rebased on the read-only wording);
  §12 items 4–7, 9, 10, 12, 13, 16; §13; §14 items 3, 7–9, 13.
- **Codex plan review 5 (revision 4, against `origin/main` `3e65ab9`) — READY.** No blocking findings:
  the new pages and components fit the unchanged `readonly.test.ts`; the server `redirect()`, the
  display-only marks, the remainder sections and the removal of Back-refresh are sound; the
  disclosure changes keep the assistant-only wording. Non-blocking note, adopted without a further
  review: §10.2's control list and §10.4 item 5 now name `main`'s `CopyButton` and its read-only
  clipboard-fallback textarea.

## Implementation

Uncommitted, in the `tonight-ui-plan` worktree. Nothing pushed, merged or deployed.

**Baseline.** The branch had no commits of its own; it was fast-forwarded to `origin/main` at
`14d992d` (Vibe Evolution, PR #12, on top of the read-only `3e65ab9`), with this plan kept
untracked. Vibe Evolution changes the write side only — a liked or loved film stays in at least one
vibe — and leaves `Taste`, `Movie`, `Standing`, `taste()` and the README's website section as they
were, so nothing in the plan changed. Baseline there: 1322 tests, 1318 passing (the 4 known
`lib/evaluation.test.ts` failures), typecheck clean, lint 0 errors and 2 known warnings.

**Added:** `lib/web/held.ts`, `screens.ts`, `stream.ts` and their tests `screens.test.ts`,
`stream.test.ts`; `components/stream-view.tsx`, `movie-card.tsx`, `movie-status.tsx`,
`vibe-links.tsx`, `vibe-view.tsx`, `movie-view.tsx`, `back-to-stream.tsx`, `signed-in.tsx`;
`app/vibe/page.tsx`, `app/movie/page.tsx`. **Changed:** `app/page.tsx`, `next.config.ts`,
`app/globals.css`, `components/movie-mark.tsx` (`labelled`), `movie-row.tsx` (title link, `from`,
`Imdb` exported, nothing filed for none), `lib/web/movie-summary.ts` (`filedUnder` without *Other
movies*), `lib/web/vibes.ts` (`filmsIn`, `filmsUnder` only), `chip.tsx`, comments in `chosen.tsx`
and `movie-summary.tsx`, README *The website*, the privacy page's *shows you less* sentence; tests
`overview.test.ts`, `signin.test.ts`, `disclosures.test.ts`, `movie-summary.test.ts`,
`vibes.test.ts`. **Removed:** `components/taste-view.tsx`, `components/vibe-cards.tsx`, `OTHER_MOVIES`,
`inOrder`, `inNoVibe`, `preview`, `spokenVibe`. **Not touched:** `readonly.test.ts`, every store,
schema, migration, route handler, MCP tool, skill and the landing page.

**Where it differs from the plan, and why:**

- `components/signed-in.tsx` — one more presentational file than §5.4 lists: the header, width and
  footer every signed-in page shares, and the *could not be read* and *not here* states, written
  once instead of three times. No control in it; it is in the *nothing to press* pin.
- The card's grid places its parts with explicit `col-start` / `row-start` utilities rather than
  `grid-template-areas`: the same layout, from standard utilities. The DOM order (title, status,
  vibes) and the placement (year and status on top, vibes directly under the title) are as planned
  and pinned. The title is an `<h3>`, so a screen reader can move from film to film.
- `Chip` (the component) is removed: its only callers were the vibe cards. `CHIP`, the rule genre
  labels use, stays.
- The three colour tokens use the plan's fallback values (`#a78bfa`, `#f472b6`, `#60a5fa`): the
  approved mockup is not in the repository. Swap them for the mockup's values if they differ.
- The privacy sentence keeps *The signed-in page* in the singular, so the pinned *the evenings
  Tonight recorded are not on it* stays true word for word; otherwise it is the §11 wording.
- A mark with its words shows *Nothing said* in `ink-soft` rather than the icon's faint `/50`, which
  is too faint for text.

**Verification:**

| Check | Result |
| --- | --- |
| `npm run test` | 1322 tests, 1318 pass — the same 4 known `lib/evaluation.test.ts` failures as the baseline |
| `readonly.test.ts` | unchanged, green |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors; the 2 known warnings in untouched test files |
| `npm run build` | succeeds; route table has `/`, `/vibe`, `/movie` dynamic and no `/api/*`; the new utility classes and tokens are in the built CSS |
| Signed-in smoke, `next dev` on a seeded scratch database (8 films in every status, two *Dune*s, a film in two vibes, films in none, a loose genre, a 200-character title) | 39 of 42 checks pass: newest-saved order; one card per film; no context on card links; no vibe line and no placeholder for a film in none; both vibes named; *Loved* pink, *Liked* blue, *Disliked* beside *Don't want to see*; no genre or control on a card; a vibe's heading, genres, instruction and rows carrying it as context; a film's context, *Also in*, both marks with words, their words, no genre; a stale or foreign `from` ignored; four *not here* cases; `Face/Off` opens; signed out → `/`. The 3 failures are `Cache-Control`, which `next dev` overrides on every page, `/` included |
| Headers, `next start` (production build) | `/`, `/vibe`, `/movie`: `private, no-store, max-age=0, must-revalidate`, `DENY`, `same-origin`; `/vibe` and `/movie` signed out → 307 to `/` |
| Real browser (§10.4 items 2, 4, 6, 7, 9, 10) | **not run**: no browser automation here, and the approved mockup is not in the repository. Keyboard, screen reader, layout at 375 px, the press-through areas and the mockup comparison are left as a manual check |

The scratch database, seed and check scripts, and `.env.local` were deleted afterwards.

**Codex implementation review 1 — NOT READY.** No code blocker: Codex found no write path or
ownership leak and no problem in ordering, statuses, contextual navigation, the detail screens or
the removals, and re-ran the suite (1318/1322, the 4 known failures), typecheck, lint and build.
The one blocker is verification: §10.4's browser checks and the item 10 comparison with the
approved mockup are not done, and visual fidelity is a stated acceptance requirement. Neither
session can close it here — launching Chrome needs a permission this session cannot grant, Chrome
aborts in Codex's sandbox, and the mockup is not in the repository. It needs the user: a browser
run (or permission to launch headless Chrome for it) and the mockup to compare against.
Non-blocking, adopted: the stale `--color-alarm` comment in `globals.css` now says nothing on the
read-only website uses it.

## Revision 5 — no summary, no dialog, and a film's five choices

At the user's direction, after implementation review 1. Uncommitted, in the same worktree. Nothing
pushed, merged or deployed.

**Baseline.** Fast-forwarded to `origin/main` at `3655dc2` (Check Candidates, PR #13) with every
uncommitted change kept: the only tracked file both sides touched was `README.md`, set aside as a
patch, restored, fast-forwarded and re-applied with `git apply --3way` — clean, no conflict. Check
Candidates only widens `effectivelySeen` (`lib/seen.ts`) to take a `null` viewing; nothing here reads it.

**1. The Stream: the heading, the count, the films.** `MovieSummary` and *Recently added* are gone,
and with them every count and word between *Your movies N* and the first card (*seen*, *want to
see*, *with no opinion* …). The sections after the films (*Vibes with no films*, *Other genres*)
stay.

**2. The film-list dialog, gone everywhere.** Removed with no replacement:
`components/movie-summary.tsx`, `chosen.tsx`, `way-out.tsx`; `lib/web/movie-summary.ts`,
`refocus.ts` and their tests; the clickable section headings that opened it (`Section` is a plain
heading again, `sectionFallback` gone); the genre labels that opened it (`GenreLabels` is a server
component listing names, on the Stream and on a vibe's screen); the vibe-screen heading that opened
it; the `filed` row variant only the dialog used; `filmsUnder`; `MovieMark.labelled`; `Shown` moved
to `lib/web/judgements.ts`; `--color-scrim`. The film, vibe and Stream pages, and every link between
them, stay. **A consequence:** what a genre *means* (its instruction) was only on the website inside
that dialog, so the website no longer shows it anywhere. A genre's name still shows; its meaning is
asked of an assistant. The privacy page says so.

**3. A film's screen.** The year as an eyebrow above a large title (the title no longer carries
*(year)*; a screen reader still hears it), then the vibe line as on the Stream (✨, purple, each vibe
a link, the context first), then *What do you think?* — then their own words and IMDb, as before. No
poster, runtime, cast or synopsis: Tonight holds none.

**4. The five choices, and the website's one write.** Five submit buttons in one
`<form method="post" action="/movie/choose">`, each `aria-pressed` with the store's state; no text
field, nothing asked for. `POST /movie/choose` (`app/movie/choose/route.ts` → `lib/web/choose.ts`):

| Pressed | Writes, through the existing store and rules | Pressed again | Refused |
| --- | --- | --- | --- |
| Love it / Like it | a verdict, `loved` / `liked`, `confirmed`, no `because`, via `taste.sayFiled` | a withdrawal, via `taste.saySaved` | the film is in no vibe (Vibe Evolution) |
| Dislike | a verdict, `disliked`, `confirmed`, no `because`, via `taste.saySaved` | a withdrawal, via `taste.saySaved` | — |
| Want to see / Not interested | the film's `viewing` (`want-to-see` / `dont-want-to-see`), via `taste.updateMovie` | nothing | a vibe is anchored on the film (a core stays `seen`) |

An opinion never writes the viewing and a viewing never writes a verdict (the M8 split), so an
opinion and a viewing can both be pressed. Another opinion replaces the standing one. A `seen` film
shows neither viewing pressed. Every act is kept in the verdict history, as from an assistant. A
pressed verdict is told `confirmed` — *"given in answer to a question Tonight put"* — because the
page asks *What do you think?*; `volunteered` is for what is said unasked.

Every write is made by the taste store while it holds the film: `sayFiled` (liked, loved) and the
new `saySaved` (disliked, a withdrawal) take the saved film `FOR SHARE` in the same transaction as
the append, and `updateMovie` holds it `FOR UPDATE`. A deletion or retitle through an assistant at
the same moment either commits first — the press finds no film and is refused, nothing written — or
waits, and a deletion then forgets the act with the film. (A verdict needs no saved film, so the
verdict store's own `say` stays as it is for the MCP tools; `saySaved` is for a caller that only
speaks about saved films.)

The route, in order: this deployment's origin (`wrongOrigin`), a same-origin `Origin` header
(`crossSite`, the sign-out's CSRF check), a live session (else 303 to `/`), a form body with one of
the five keys, a valid title and a four-digit year (else 400). The stores are opened for the
session's user only; the film is found among *their* saved films by `filmKey`, so another user's
film or an unsaved one writes nothing and goes to its *not here* page. The answer is a 303 back to
the film's page (its context kept only if the film is in that vibe), with a fixed `refused=` code
when nothing was kept, which the page says in a fixed sentence (`role="alert"`). The rules are
decided first in `choices.ts` so the page can name them, and still enforced by the stores. No
schema, migration, table or new storage.

**Guard, docs and skill — the read-only claims rewritten, not left behind.** `readonly.test.ts`
now says the website reads, with one narrow exception: it allows `movie/choose POST`, expects three
forms (sign-in, sign-out, the choices), and pins `choose.ts`'s three writes (`updateMovie` for the
viewing only, `sayFiled` for a liked or loved, `saySaved` for a disliked or a withdrawal), never
the verdict store's `say`, `confirmed` and never `volunteered`, no other mutator, and its origin,
`crossSite` and session checks — and that no other website file, page or component calls a store's
mutator, `sayFiled` and `saySaved` included. README *The website*, the privacy page (scope,
*shows you less*, deletion), the terms (*Ending it*) and `SKILL.md` (with its `test.sh` and
`recommend-skill.test.ts` pins) say what the five choices write and that everything else is still
said to an assistant; `disclosures.test.ts` pins the new sentences and the absence of the old
read-only ones. `chatgpt-plugin` version 1.8.0 → 1.8.1 for the skill text. Comments that said
*read-only* or *the dialogs* updated (`held.ts`, `signed-in.tsx`, `screens.ts`, `signin.ts`,
`taste/store.ts`, `movie-status.tsx`, `movie-mark.tsx`, `globals.css`).

**`lib/db.ts` — one connection per process.** `next dev` loads a module once per bundle, so the
choose route and the film page each opened their own embedded database on the same directory: a
press was kept but did not show until a restart. The opened connection is now cached on
`globalThis` (`Symbol.for("tonight.database")`) rather than in the module. In production (Postgres,
`DATABASE_URL`) this only means the route and pages share one pool instead of each opening one; the
tests run each file in its own process and are unaffected.

**Verification:**

| Check | Result |
| --- | --- |
| `npm test` | 1308 tests, 1304 pass — the 4 known `lib/evaluation.test.ts` failures (gitignored local evaluation results absent from this worktree) |
| New tests | `choices.test.ts` (10, the rules); `choose.test.ts` (12, the route on embedded Postgres: no session, cross-site and no Origin, love told `confirmed`, replace and take back, vibe required, viewing no-op, core, another user's film, store spelling, a stale context, malformed input, and the film deleted between the route's read and each of its four kinds of write — shown to fail against the old `verdicts.say` writes); `store.test.ts` (5 on `saySaved`: saved film and spelling, not saved or another account's, liked/loved refused, deleted after a read, forgotten with its film) |
| Two-connection races (`concurrency.test.ts`, 3 on `saySaved`: said then deleted, deleted then said, retitled then said) | written, **not run here**: they need a real Postgres (`TEST_DATABASE_URL`), which this machine does not have; the embedded one serialises every transaction |
| `overview.test.ts` + `readonly.test.ts` | 42/42: no summary between heading and cards, no dialog or its parts anywhere, genre labels not interactive, the film screen's order, five buttons in one form, the write's narrow shape |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors; the 2 known warnings in untouched test files |
| `npm run build` | succeeds; routes `/`, `/vibe`, `/movie`, `/movie/choose` dynamic; no `/api/*` |
| `test.sh` order check | the changed pin emulated and holding (`test.sh` itself needs a permission this session lacks) |
| Signed-in end-to-end, `next dev` on the seeded scratch database | 33/33: Stream with nothing between count and cards and no dialog; vibe genres as plain labels; film screen order, no year in the title, five choices in order with their words, no poster/runtime/cast/synopsis; Love it kept and shown on reload, pressed again taken back; Not interested and back; Love it refused for a film in no vibe and said; Not interested refused for a core and said; no Origin, another site → 403; no session → `/`; none of those wrote; an unsaved film → its *not here* page. Every change was pressed back |
| Real browser and mockup comparison | **not run** — still the open gate from implementation review 1 |

**Codex implementation review 2 — NOT READY.** Blocking: (1) a Dislike or a take-back was
appended through the verdict store outside the saved-film check, so a deletion landing between the
two left an act about a deleted film (reproduced); (2) pressed verdicts were told `volunteered`,
where the model's `confirmed` is the answer to a question Tonight put; (3) the visual gate. Fixed
(1) with `TasteStore.saySaved` and the route on it, with route, store and two-connection tests;
(2) with `confirmed`, pinned in the route test and the guard. Non-blocking, adopted: the
`KeepFiled` comment no longer says the website writes nothing; the page and component guard lists
`sayFiled` and `saySaved`. (3) stays open.

**Codex implementation review 3 — NOT READY, the visual gate the only blocker.** Both code
blockers resolved, no new code blocker; the suite (1304/1308, the 4 known), typecheck, lint and
build re-run by Codex. The two-connection races could not be run by either session (no
`TEST_DATABASE_URL`, no Docker); Codex reviewed their interleavings and assertions. Left: the
desktop and 375 px comparison with the approved mockup, keyboard and click-target checks, with
accepted differences recorded here.

**Open, for the user:** (1) the browser check and the mockup comparison; (2) the operator's
approval of the changed privacy and terms wording; (3) the genre-meaning consequence above; (4) a
`seen` film pressed *Want to see* or *Not interested* stops being `seen`, and the website has no
way back — that is said to an assistant (the user's five choices have no *Seen*).

## Revision 6 — a vibe's films as the Stream's cards; no genres on the Stream

At the user's direction, after they looked at desktop screenshots of the three screens (Stream and
film screen approved as they are). Uncommitted, in the same worktree.

**1. A vibe's films are the Stream's cards.** The plain list of titles with two marks is replaced
by the same card the Stream draws — year eyebrow, title, how the film stands on the right, its ✨
vibe links, the whole card opening the film. One component, not a copy: `components/movie-card.tsx`
now exports `MovieCards` (the `<ul>` with its accessible label, one `MovieCard` per film), and the
Stream and a vibe's screen both render it. A card takes an optional `from`: the Stream passes none
(as before), a vibe's screen passes its own name, so each card opens the film with that vibe as its
context — the navigation the old rows had. A vibe's heading, genre labels and description are
unchanged; the films are `filmsIn`, in the vibe's own order, as before. No poster: the earlier image
mockup's posters were a mistake, and the approved cards have none. A card on a vibe's screen names
every vibe its film is in, this one included — the Stream's card exactly.

**2. No *Other genres* on the Stream.** The section, its heading, its note and its labels are gone,
and `looseGenres`, which only it used. No genre is deleted or changed; the Stream simply stops
listing the ones no vibe is built from. **Consequence:** such a genre is now on no screen of the
website (a vibe's screen lists only its own genres). `get_taste` and the assistant still have it,
and the Stream's copy-prompt still falls back to the first genre when there is no vibe.

**Removed with the old list, because nothing else used them:** `components/movie-row.tsx` (`Films`;
its `Imdb` link moved into `movie-view.tsx`, its one user), the `MovieMark` drawing and the
`unset`/`asks` fields only it read (`movie-mark.tsx` keeps `VIEWING` and `JUDGEMENT`, the
vocabulary the card status and the five choices draw). Comments in `stream-view.tsx`,
`vibe-view.tsx`, `movie-card.tsx` and `section.tsx` updated. No README, privacy or terms sentence
claimed the Stream lists genres, so none changed.

**Tests:** `overview.test.ts` — the Stream and a vibe's screen both render `MovieCards` and draw no
films of their own; the vibe's cards carry `from={vibe.name}`, the Stream's none; the card's link is
`movieHref(movie, from)`; no `GenreLabels`, `looseGenres` or *Other genres* copy on the Stream; two
sections only; `movie-row.tsx` and `MovieMark` gone; the IMDb test on `movie-view.tsx`; the row and
mark tests that pinned the removed code removed. `stream.test.ts` — the `looseGenres` test removed.

| Check | Result |
| --- | --- |
| `npm test` | 1301 tests, 1297 pass — the 4 known `lib/evaluation.test.ts` failures (7 tests fewer: the removed row, mark and loose-genre tests) |
| `npm run typecheck` / `lint` / `build` | clean / 0 errors, the 2 known warnings / succeeds (run beside the preview server: Next 16 builds to `.next`, dev to `.next/dev`) |
| The running preview (`localhost:3080`, scratch data), read only | 16/16: no *Other genres* and no *Noir* on the Stream; Stream card links carry no vibe; the vibe screen keeps heading, genres and description, shows the Stream's cards in a list labelled *Films in Space Tension*, every card opening its film with `from=Space Tension`, year/title/status/vibe links on a card, no old rows or marks, no image, button, form or dialog; a card opens the film screen with the vibe first |
| Browser at 375 px, keyboard, mockup | **not run** — the overall visual gate stays open |

**Codex implementation review 4 (Revision 6) — NOT READY, the visual gate the only blocker.** No
blocking finding in the delta: shared-card reuse, the context passed only from a vibe's screen, the
list labels and the `h2` → `h3` structure sound, and nothing left that used the removed components;
Codex re-ran 135 targeted tests, typecheck, build and the 16 preview checks. Non-blocking, adopted:
two stale comments in `lib/web/stream.ts` that still named the removed summary (`recentlyAdded`, the
counts) reworded.

**User visual acceptance, 25 October 2026.** The user explicitly approved the new UI visually, on
the live preview at `http://localhost:3080` (this worktree, uncommitted, the scratch database and
test account): the rendered Stream, Vibe screen and film screen as they stand after Revision 6,
looked at in their own browser — after the desktop screenshots that led to Revision 6. That is
what was approved: the rendered screens, by eye. **Not performed, and not claimed:** a check at a
375 px viewport, keyboard-only use, a screen reader, or a side-by-side comparison with the image
mockup (not in the repository, and wrong about posters).

**What could be checked here without a browser** (`web/.devdb/ui-review/a11y.py`, read only,
against the served HTML of `/`, `/vibe?name=Space Tension`, a film reached from that vibe and a
film in two vibes with an IMDb id): the viewport tag is `width=device-width, initial-scale=1` on
every page; the focusable elements in DOM order — the tab order, since no `tabindex` is positive —
are the header's *Sign out*, *Your movies*, then per card its title link (named with the year,
e.g. *Dune (2021)*) and its vibe links, then *Copy* on the Stream; on a vibe's screen the cards'
links carry `from=Space Tension`; on a film's screen its vibes, the five choices in order, IMDb;
then the footer. Every one has an accessible name; none suppresses its focus ring (all but the
footer's four links have their own `focus-visible` style; those keep the browser's); no class
fixes a width wider than a 375 px screen — the only width or no-wrap classes are
`grid-cols-[minmax(0,1fr)_auto]`, `min-w-0`, `shrink-0`, and `truncate` on the header's signed-in
email line, unchanged from `main`. 0 problems. This is the HTML, not a rendering: whether anything
overflows at 375 px, and what a focus ring looks like, still need a browser.

**Codex, on the gate (after the user's acceptance) — NOT READY, only the browser checks left.**
(a) The user's explicit acceptance of the rendered Revision 6 UI closes the mockup comparison.
(b) The served HTML shows structure, not wrapping, overlap, hit targets or visible focus, so a real
browser is still needed — device emulation at 375 CSS px is enough, and no screen-reader run is
required. The minimum, on the preview:

1. **375 px:** the Stream, a Vibe screen and one film screen — no horizontal overflow, clipped
   controls or overlapping text, with the longest title, a card with several vibe names and a card
   with two statuses.
2. **Card hit targets:** on a card with several vibes, a press on the padding, year, status, ✨,
   separators and gaps opens the film; a vibe name opens its vibe; a card opened from a Vibe screen
   keeps that vibe as the film's context.
3. **Keyboard:** Stream → Vibe → film → Vibe with Tab, Shift+Tab and Enter — focus visible, a
   card's title before its vibe links, no stop on a status, the five choices in their displayed
   order.

Not yet done.

**Browser acceptance and Codex — READY (Relay cursor 17524).** The user then accepted the browser
interactions and responsiveness themselves and told Codex so directly; this session did not see
the individual results. Codex's verdict, verbatim: *"READY — Die ausdrückliche Nutzerabnahme
schließt den letzten offenen Review-Gate für Browser-Interaktionen und Responsiveness. Die Freigabe
beruht auf seiner Bestätigung; ich habe keine zusätzlichen Einzeltests durchgeführt."* — the user's
explicit acceptance closes the last gate, the verdict rests on that confirmation, and Codex ran no
further checks of its own. Neither Codex nor this session ran the 375 px, hit-target or keyboard
checks in a browser; what was run here is the served-HTML check above.

**Release, authorized by the user on 25 October 2026:** commit, push, merge to `main` and the
production deploy (Vercel deploys `main` to production). No migration: no schema changed. Not part
of it: the ChatGPT plugin ZIP (version 1.8.1, carrying the new skill sentence about the website) is
built and uploaded by hand (`chatgpt-plugin/build.sh`), and the changed privacy and terms wording
ships with the website on the user's release authorization, without a separate legal review on
record. `skills/tonight-recommend/test.sh` and `chatgpt-plugin/test.sh` need a permission this
session lacks: Codex ran the skill contracts in implementation review 2 (223/223), and no skill file
changed after; the plugin check's only rule on the manifest's version is that it is semantic.
