# Core Vibe first on a movie card — plan and record

Base `a949e8d`. A display change to the movie card's vibe line, from the user's mockup: no schema,
store, tool, API or copy change, and nothing else on the card or on any other screen changes.

## 1. What changes

A card's vibe line names the vibes its film is the **core** of first, beside the ✨ and in the
violet the names are drawn in today; the vibes it is only filed under follow on the same line, after
the same `·`, at the same size and in the muted `text-ink-soft`. The line wraps only where the card
is too narrow for it, as it does today. No second line, no connecting word, no extra icon.

- **One core:** that vibe first, violet; the rest after it, muted.
- **Two or more cores:** all of them first, violet, in the order the film holds its vibes (by name);
  then the rest, muted.
- **No core:** every vibe muted, in the order the film holds them. Violet on a card means "this
  film is that vibe's core", so a film that anchors nothing has no violet name; the ✨ stays violet.
- **No vibe:** no line, as today.

The film's screen and the Stream's *Vibes with no films* draw `VibeLinks` without `cores`, so every
name there stays violet, as today.

## 2. How a core is found

From data the page already reads: every `Vibe.core` (a `MovieHandle`, or `null` for a vibe written
before vibes were anchored). `coreFirst(movie, vibes)` in `lib/web/vibes.ts` compares each core with
the film by `filmKey`, the one rule for whether two mentions are one film, so `Dune / 1984` as a core
says nothing about `Dune / 2021`. It returns the film's vibe names with the cores first, and which of
them are cores; only names the film is in are returned.

`MovieCards` takes the user's vibes: `StreamView` passes `taste.vibes`, and `VibeView` passes
`held.taste.vibes` from `app/vibe/page.tsx` (a film on a vibe's screen can be the core of another
vibe). `VibeLinks` takes an optional `cores` and chooses each name's colour from it.

## 3. Tests

- `vibes.test.ts`: `coreFirst` — one core first; no core (and no vibes given) leaves the order and
  marks none; two cores both first in the film's order; another year's film, a `null` core and
  another film are not this film's core; a core spelled differently is still this film by
  `filmKey`; a vibe the film is not in is never named; the film's own list is not changed.
- `overview.test.ts`: the card asks `coreFirst` and passes both answers; a core name is
  `text-vibe` and any other `text-ink-soft`; one size, on the line and on no name; one wrapping
  `<p>`, one ✨, nothing drawn but the ✨ and the names, no block or full-width break, the same `·`
  before every name after the first, and no words but `·`; the film's screen and the empty vibes
  pass no `cores`. The existing pins on the wiring (`vibes=` on both lists and the vibe page) are
  updated.

Layout and wrapping are the browser's: these pin the structure they depend on, as the rest of
`overview.test.ts` does. Sign-in is Google OAuth, so the change was not seen in a running app.

**Run by the implementer:** `npm test` in `web/`, 1390 of 1394 — the four are `evaluation.test.ts`
reading the gitignored `evaluation/results/`, absent in a fresh worktree; the two changed suites
43/43; typecheck clean; eslint 0 errors (two existing warnings in files not touched).

## 4. Review

**Codex code review 1 — READY (working tree on `a949e8d`)**, with no findings: core identification,
ordering, colours and the prop wiring match the request; the no-core and several-cores decisions
are sensible; the scope stays narrow.

Codex ran the two changed suites, 43/43, typecheck, ESLint on the changed files and `git diff
--check`, all clean. The wrapping tests pin the source structure; the layout in a browser is not
verified.

## 5. Muting rolled back

Base `4845975`. At the user's request the muting in §1 is undone and the order is kept: a card still
names its cores first (`coreFirst`, unchanged), and every name is in the violet again, core or not.
Nothing tells a core apart but its place.

- `VibeLinks` is byte-for-byte its version before this work (`a949e8d`): no `cores`, one
  `text-vibe` and one `hover:decoration-vibe` on every name, the same size, ✨, `·` and wrapping.
- `MovieCard` takes only `names` from `coreFirst` and passes no `cores`.
- `overview.test.ts`: the pins changed in §3 go back to `text-vibe`; the card's test now pins the
  core-first `names`, one violet colour and hover on every name, no `cores` in `VibeLinks` and none
  passed anywhere, and keeps the size, line, ✨, separator and no-words pins. The test fails against
  the muted `VibeLinks`.

**Run by the implementer:** the two changed suites 43/43; typecheck clean; ESLint on the changed
files clean; `git diff --check` clean.

**Codex code review 2 — READY (working tree on `4845975`)**, with no findings: `VibeLinks` matches
`a949e8d` exactly; core-first order holds on the Stream's and a vibe's cards; the tests cover the
rollback and the order; keeping `coreFirst`'s return shape suits the scope. Codex ran the same
checks, all clean. The layout in a browser is not verified.
