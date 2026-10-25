# Seen now / Seen before: plan

Status: **plan READY (Codex, round 2). Implemented on the user's approval. Implementation review
READY (Codex, round 1). Committed and pushed for review on the user's authorization. Merge is held
until the signed-in check is done, and nothing is deployed.**

**Why the merge is held.** The signed-in preview check is a required pre-release gate, and it has
not been done: signing in needs a Google OAuth client registered for the local origin. A
temporary, dev-only page rendered the real film screen from sample props, without signing in. It
showed all seven choices and the right pressed state for each viewing, and it answered 404 in
production. That page was never committed and has been deleted. It does not replace the
signed-in check, which still has to cover:

- both choices against real data;
- the Stream order;
- the core restrictions;
- keyboard use;
- the layout at 375 px.

**Codex implementation review, round 1: READY, with no blockers.** The implementation matches
the approved plan, and the exceptions for the legacy fixtures and the scorer are appropriate.
Codex ran these itself:

- `skills/tonight-recommend/test.sh`: 233/233;
- `skills/tonight-vibes/test.sh`: 129/129;
- `chatgpt-plugin/test.sh`: 37/37;
- a focused run of the implementation tests: 332/332;
- the historical-snapshot scorer tests: 3/3;
- `git diff --check`: clean.

It confirmed that the ten changed JSON fixtures only relabel viewings, and that all six fixtures
still saying `seen` use the documented older-build seed paths.

Non-blocking:

- **Required before release:** the signed-in preview check. It covers both choices, the pressed
  states, the Stream order, the core restrictions, keyboard use and wrapping at 375 px.
- `updatedAt` still moves on unrelated edits, which matches the approved design.

## Implementation notes (where the build differs from, or adds to, the plan)

1. **Fixtures seeded through an older build keep `seen`.** The plan expected `m5-03-legacy` might
   be one; there are six:
   - `m5-03-legacy` (`"seed": "v12-then-migrate"`);
   - the five `"seed": "pre-vibe-rule"` fixtures: `m3-01`, `m3-04`, `m3-05`, `m3-06` and `m5-01`.

   They are seeded through builds (`15a6095`, `f3912b0`) that know no other word, and taste v15
   relabels them when this build starts. The two seeding notes in `evaluation/m3/README.md` and
   `evaluation/m5/README.md` that said "nothing migrates" now say so. Every other fixture is
   `seen-before`. `lib/evaluation-m6.test.ts` allows `seen` only on a fixture with `seed`.
2. **`score.mjs` still counts `seen` as watched,** besides the two new values. A run snapshot
   recorded before v15 says `seen`, and rescoring it must not change its findings.
   `evaluation.test.ts` pins all three.
3. **Migration tests.**
   - The verdicts v3 tests keep today's taste schema, as before, with `seen-before` rows.
   - `schemas.test.ts`'s "M8 release" test now starts taste at v14, the database M7 actually
     left, so `seen` is still a value there. It then upgrades through v15.
   - The end-to-end tests (v10's conversion, production from v7) run through v15 and expect
     `seen-before`.
4. **The guidance pins are also in `lib/recommend-skill.test.ts`, for both skills.** This session
   could not run the two `test.sh` scripts (the sandbox asks for approval). Their new markers are
   the same strings, and the TypeScript test checks every one of them against the files.
5. **The `seen` refusal is the zod enum's own `error`.** `tools.test.ts` confirms the SDK passes
   it through: the refusal names `seen-now`, `seen-before` and the rule. `checkViewing` adds the
   rule only for `seen`.
6. **Gates run here:**
   - `npm test`: 1318 tests, 1314 pass. The 4 failures are the known `lib/evaluation.test.ts`
     ones (`evaluation/results/…` is not in the checkout). The baseline before the change was
     1301 tests with the same 4 failures.
   - `npm run typecheck` and `npm run build` are clean.
   - `npm run lint` has no errors. Its two warnings (`store.test.ts:3160`,
     `concurrency.test.ts:256`) are older than this change.
7. **Not run here:**
   - the signed-in dev-preview check (both choices, the Stream order, keyboard, 375 px). It needs
     a real sign-in;
   - `chatgpt-plugin/build.sh` / `test.sh`, and both skill `test.sh` scripts. Codex is asked to
     run them.

**Codex plan review, round 2: READY, with no blockers.** Codex found:

- `check_candidates.seen` stays a boolean, and tests cover both seen values and watching known
  only from a standing judgement.
- The quotation rule blocks manufactured quotes, keeps reasons the user gave verbatim, and limits
  the wording rule to the new clarification.
- The migration tests keep end-to-end coverage, a `NULL` creation time, and the trigger coming
  back on. The version bump, the README and the rollout checks cover what round 1 missed.
- The accepted trade-offs still hold:
  - two added pills on the film screen;
  - `updatedAt` as record order;
  - other statuses after both seen groups;
  - the cautious default for an unsaved core.

Tests were read, not run. Implementation and its checks are still to do.

**Codex plan review, round 1: NOT READY, with two blockers. Both are addressed below.**

1. **`check_candidates.seen` is a boolean, and the recommend skill's replace rule reads it.**
   Round 1 relabelled recommend `SKILL.md:194` together with the enum references. That paragraph
   consumes the boolean, which is also true for a film known as watched only through a standing
   judgement.
   - It now says to replace a film whose `seen` is `true` unless they asked for a rewatch.
   - It is taken out of the relabel list.
   - It gets a pin, and candidate tests cover both seen values and judgement-derived watching
     (see *Agent-facing strings* and *Tests*).
2. **The quotation rule was too broad.** Round 1 banned timing words from `because` and
   `passReason` altogether, and that would have overridden two rules: a verdict reason is their
   words verbatim, and so is a pass reason (*"pass, I just watched it last night"*). The rule is
   now:
   - nothing is manufactured from setting a viewing: no quote, no verdict reason, no pass reason;
   - reasons they supplied stay verbatim, timing words included;
   - the ban on quoted questions covers only the new now/before clarification;
   - "No dates" bans inventing a watch date and presenting a capture time as one, and does not
     ban acknowledging timing they gave.

   Both halves are pinned (see *The inference rule* and *Tests*).

Non-blocking notes, all taken:

- `README.md:246–258` (the website's choices and "five choices") has been added to *Wording a
  user reads*.
- `SERVER_VERSION` is bumped from 0.3.0 to 0.4.0. `identity.ts:12` requires a bump for a change
  a client notices, and the viewing enum is one; the history shows `0.2.0` for M9 and `0.3.0` for
  `check_candidates`. The pin at `endpoint.test.ts:363` follows.
- Migration tests:
  - end-to-end upgrade tests keep running through the latest schema; historical slices are used
    only for version-specific assertions;
  - a legacy `createdAt: null` row is included;
  - an ordinary update after v15 still advances `updated_at`.
- When evaluation fixtures are relabelled, assertions that check a value is preserved stay exact
  (`=== "seen-before"`, for example). Only "has watched" predicates use `isSeen`.
- Codex confirmed four of the five challenge points: the two new pills, `updatedAt` described as
  record order and never viewing chronology, other statuses after the seen groups, and the
  `seen-before` default for an omitted `core.viewing` (with a saved core ignoring it). The fifth,
  quotes, became blocker 2.

- Ticket / branch / worktree: `seen-now-before`, based on `main` at `5f53947` (UI redesign merged).
- Reviewer: `codex/3f07a06c-5d93-42a9-b955-334ef981e58b`. Implementation starts only after READY.
- **This replaces an earlier draft in this worktree.** That draft was reviewed by another Codex
  session under different decisions. Its main decision was "every existing `seen` becomes *Seen
  now*", and this ticket rules that out. Where the earlier analysis still holds (file and line
  audit, the migration pattern, `isSeen`), it is reused here.
- The landing worktree (`tonight-landing-plan`) is not touched, and this plan does not change
  `web/app/page.tsx`.

## Correction 2 (final): the Stream keeps main's original order, and gets one filter (supersedes *Stream order* below)

**The user's decision, after two revoked attempts.** This ticket does not change the Stream
order. Both earlier variants were reverted, so no sorting concept of this ticket remains:

- the planned grouping: *seen now* by `updatedAt`, then *seen before*, then the rest;
- a later "mixed run, *seen before* last".

**The order is main's original comparator `newestSaved`** (`lib/web/stream.ts`, identical on
`5f53947` and on `origin/main` `c316e8d`):

- `createdAt` descending, for all viewings mixed;
- `createdAt: null` last;
- ties by title (lower-cased, `localeCompare`), then year, then `filmKey`.

`lib/web/stream.ts` and `stream.test.ts` were restored from `origin/main`. The only differences
from main that are kept are the comment on `statusOf` and the relabelled `seen` values in its
tests.

**The filter, in the user-approved design:**

- **Text.** A checkbox labelled exactly *Include previously seen*, ticked on every load.
- **Placement.** Directly under *Your movies* and its count, right-aligned, immediately above the
  first card. There is no container and no extra heading.
- **Look.** Small and neutral: `size-3.5`, `accent-ink-soft`, 12 px `text-ink-soft`. The label has
  a 36 px press area (`min-h-9`).
- **What it does.**
  - Ticked: every film, in main's order.
  - Unticked: the films saved as `seen-before` are not drawn. The others keep their order, and
    nothing is stored, fetched or written.
- **How.**
  - `components/stream-view.tsx`: the checkbox has no form, no name, no handler and no client
    code.
  - `app/globals.css` holds one rule:
    `.stream-films:has(#include-previously-seen:not(:checked)) [data-viewing="seen-before"]
    { display: none; }`.
  - `components/movie-card.tsx`: each card carries `data-viewing`.
  - The filter is scoped to the Stream, so a vibe's screen is unaffected. Reloading ticks it
    again; there is no saved preference.

**Tests:**

- **`overview.test.ts`:**
  - placement order: heading, right-aligned row, checkbox, then the cards;
  - the exact label;
  - `defaultChecked`;
  - no name, form, handler or client code, and the only `<input>` on the Stream;
  - all films still handed over as `stream(movies)`;
  - the card's `data-viewing`;
  - the exact CSS rule, which hides only `seen-before` and does nothing but `display: none`.
- **`stream.test.ts`:**
  - all viewings are one list by `createdAt`;
  - the list without `seen-before` keeps the remaining films in the same order.
- The rule "nothing to press but links" allows exactly this one checkbox on the Stream.

**Unchanged:** the visual tweak below, Correction 1's UX and logic, migration v15, MCP and skills.

**Codex focused review: READY, with no blockers.** It covered three things:

- the visual tweak;
- the Stream sort restored to `c316e8d`;
- the *Include previously seen* filter.

Codex ran the Stream, overview and disclosures tests (60/60) and `git diff --check` (clean). It
did not repeat the browser check. It did not re-review Correction 1.

## Correction 3: the migration maps `seen` to `seen-now` (the user's correction before release)

**The user's correction.** A legacy `viewing = 'seen'` must migrate to **`seen-now`**, not to
`seen-before`. This overrides the ticket's original "existing Seen should not be classed as
recently watched" and the first plan's decision. Nothing had been committed, pushed, merged,
deployed or migrated when it came.

**Implemented:**

- **`web/lib/taste/store/schema.ts` v15** now runs
  `UPDATE tonight_movies SET viewing = 'seen-now' WHERE viewing = 'seen'`. Its comment is updated.
  The rest of the migration is unchanged:
  - the trigger is off for the relabel, so both stamps stay;
  - the four-value `CHECK`;
  - the default and `NOT NULL`;
  - roll-forward only, with no preflight.
- **Tests:**
  - `migrate.test.ts`: v15 turns every `seen` (a dated and an undated row) into `seen-now`, makes
    nothing `seen-before`, and leaves the other viewings and every stamp as they were. After v15,
    the migrated row reads `seen-now` and `seen` is refused.
  - The end-to-end upgrades through v15 now expect `seen-now`: v10's loved film, v14's kept
    `seen`, and the production upgrade from v7 in `schemas.test.ts`.
  - Rows that tests write directly as `seen-before` after the migration are data, not the
    mapping, and are unchanged.
- **Wording:**
  - README's invariant and its *Deploying a migration* paragraph;
  - the comment on `VIEWINGS` in `model.ts`;
  - privacy: films saved as *seen* before the two answers existed are *seen now*, with its pin;
  - the seeding notes in the m3 and m5 evaluation READMEs;
  - two test comments that cited the old mapping.

**Unchanged, on purpose:** these are about new writes, not the migration, and keep `seen-before`
as the value that claims nothing about when:

- a new core named without `core.viewing`;
- the inference rule's "if they still do not say".

The current-build evaluation fixtures relabelled to `seen-before` are unchanged too. Both seen
values read the same there.

**Codex focused review: READY, with no blockers.** It confirmed:

- v15 maps every legacy `seen` to `seen-now` without reading any date;
- the stamps are preserved and the trigger is put back;
- the `CHECK`, the default and `NOT NULL` are intact;
- editing this unreleased, unapplied migration is appropriate.

Codex ran the migration, schema, disclosures and taste-model tests (106/106) and
`git diff --check` (clean), on in-memory databases only. Its one note was that older passages in
this plan still described the old mapping; they are now marked as corrected.

## Card label: Seen, as before (the user's final correction, after Correction 2)

**What a card shows.** On a Stream or vibe card, a film saved as `seen-now` or `seen-before` with
no standing verdict shows exactly the original neutral eye and *Seen*. There is no clock and no
*Seen now* / *Seen before*. With a verdict, the Loved / Liked / Disliked badge stands alone, by
`statusOf`, as before.

**How.** Only `components/movie-mark.tsx` changes: `VIEWING` draws both seen values as
`{ label: "Seen", icon: Eye }`, and the `History` icon is gone.

**What still tells the two apart:**

- the film screen's *When did you see it?*, which uses its own labels and `Check`;
- the *Include previously seen* filter;
- the stored data.

Sorting is unchanged.

**Tests (`overview.test.ts`):**

- the icon and label pins;
- a new test that both seen values are drawn as Eye + *Seen*, with no `History`, *Seen now* or
  *Seen before*;
- that a card draws through `VIEWING` for `statusOf`'s key;
- that a verdict takes precedence for both seen values.

**Codex focused review: READY, with no blockers.** Codex ran the overview, Stream, disclosures and
choices tests (75/75) and `git diff --check` (clean). It did not repeat the browser check.

## Visual tweak: the second question, a step quieter (after Correction 1)

The user asked for this. In `components/movie-choices.tsx` only, with its pins in
`lib/web/overview.test.ts`:

- **The two lower pills** use `SMALL_PILL`, about a fifth smaller than the top ones:
  - text 13.5 → 11 px;
  - padding 16/8 → 13/6.5 px;
  - gap 8 → 6 px;
  - check 15 → 12 px.
- **The press area is kept** by an invisible `after:-inset-1` ring, 4 px on every side. That is
  about a top pill's height, and half the gap, so the two never overlap.
- **The heading *When did you see it?*** goes from 20 px `ink` to 17 px `ink-soft`, and its form's
  margin from `mt-4` to `mt-3`.
- **Unchanged:** the five top pills, green with only a check when selected, neutral when not, and
  all logic.

## Correction 1: the film screen, as the user approved it (supersedes the film-screen part of *UI*)

**The UX, as the user approved it:**

1. **At the top**, *What do you think?* has the **five original pills**, with their original icons,
   in the original order: *Love it*, *Like it*, *Want to see*, *Not interested*, *Dislike*.
2. **An opinion.** Choosing *Love it*, *Like it* or *Dislike* does two things in one consistent
   action:
   - it sets the verdict;
   - it sets the viewing to `seen-now` by default.

   It also reveals a **second heading, *When did you see it?***, with two separate pills: *Seen
   now* and *Seen before*.
3. **The two lower pills look like this:**
   - the selected one is **green, with only a check icon**;
   - the unselected one is neutral;
   - there is no eye or history icon on either.
4. **Switching the lower pill** changes the viewing only. The verdict is kept.
5. **Listing instead.** Choosing *Want to see* or *Not interested* sets the viewing (`want-to-see`
   / `dont-want-to-see`) **and clears the verdict**. The lower question is then hidden. Switching
   back to an opinion makes it `seen-now` again by default.
6. **Persistence.** Verdict and viewing are written together, atomically, under the vibe-core
   rules.

**What a press writes.** Each row is **one transaction**, holding the film `FOR UPDATE`:

| Press | When | Writes | Lower question |
| --- | --- | --- | --- |
| *Love it* / *Like it* / *Dislike* | that judgement does not stand | the verdict, **and** viewing := the film's seen value if it has one, otherwise `seen-now` | shown |
| the same opinion again | it stands | a withdrawal only; the viewing stays | follows the viewing, which does not change: shown for a seen film, and hidden for an assistant-made `want-to-see` + judgement |
| *Want to see* / *Not interested* | viewing differs, or a judgement stands | viewing := that value, **and** a withdrawal of the standing judgement if there is one | hidden |
| *Want to see* / *Not interested* | same viewing, nothing stands | nothing | hidden |
| *Seen now* / *Seen before* | differs | the viewing only; the verdict is kept | shown |

**Refusals write nothing — neither verdict nor viewing:**

- *Love it* / *Like it* for a film in no vibe → `vibe-required`, as today.
- *Want to see* / *Not interested* for a vibe's core → `core`. The verdict is kept too.
- A core may move between *Seen now* and *Seen before*, and an opinion on a core keeps its seen
  value.

**My readings of the approved UX** (the reviewer should flag any it reads otherwise):

- **(a) "`seen-now` by default" applies only when the film is not already seen.**
  - An opinion on a `seen-before` film keeps `seen-before`, so an opinion never overwrites when
    they said they saw it. (This first cited the migration's `seen-before`; since Correction 3 the
    migration gives `seen-now`, and the rule stands on its own.)
  - Moving from want or not-interested to an opinion makes it `seen-now`, as specified.
- **(b) The lower question shows exactly when the stored viewing is `seen-now` or `seen-before`.**
  - An opinion always leads there.
  - A seen film with no opinion (migrated, or told to an assistant) also shows it, with its value
    pressed, so the value can be seen and changed.
  - Withdrawing an opinion keeps the film seen, and so keeps the question.
- **(c) The top five act as one choice.**
  - *Dislike* on a *Not interested* film makes it `seen-now`, so `dont-want-to-see` is gone.
  - A contradiction an assistant made — a judgement standing on a `want-to-see` film — still
    shows both pills pressed, as stored. Pressing *Want to see* there clears the judgement.

**Codex focused plan review of Correction 1:**

- **Round 1: NOT READY**, with two blockers:
  1. decisions were made on the page's earlier read;
  2. acts were stamped before the lock.
- **Round 2: READY, with no blockers.** Readings (a)–(c) are sound.

Its notes are taken in the tests:

- a stale-snapshot test with the change forced between the earlier read and the locked decision;
- equal timestamps;
- a future-dated withdrawal;
- the timestamp guard only on presses that write an act.

**Codex implementation review of Correction 1: READY, with no blockers.**

- All seven presses are decided on the locked state, including the defaults, keeping a seen value,
  the toggles and the refusals.
- Acts are stamped after the lock, and the guard against a later-dated act covers withdrawals.
- Verdict and viewing roll back together.
- The UI matches the approved UX.
- Codex's focused run: 204 tests, 203 pass. The one failure is the expected read-only check that
  detects the uncommitted demo route. `git diff --check` is clean.
- **Release checks that remain:** a real sign-in, keyboard use, and 375 px in a browser. The demo
  stays excluded from any commit or release.

**Implementation of Correction 1:**

- **Store.**
  - `TasteStore.choose(film, decide)` with `HeldFilm` / `FilmWrite` (`lib/taste/store.ts`,
    `lib/taste/store/sql.ts`).
  - `lastSaidWithin` in the verdict module (`lib/verdicts/store/sql.ts`).
  - Only presses that write an act are checked against the timestamp.
- **Route and choices.**
  - `lib/web/choices.ts`: `CHOICES` (five), `WHEN` (two), `asksWhen`, `decide`, `writeFor`, with
    `Film = HeldFilm`.
  - `lib/web/choose.ts` passes `decide` into `choose`, and a refusal is thrown out of the
    transaction.
- **Screen.**
  - `components/movie-choices.tsx`: two forms. The second heading shows only while the film is
    seen.
  - The selected lower pill is green (new `--color-seen` in `app/globals.css`) with the lucide
    `Check` and no other icon; the unselected one is plain.
- **Wording.** README's website paragraph, privacy's choices paragraph (the five, and *Seen now* /
  *Seen before* for a film you have seen, plus what a press also records) and their pins are
  updated. Comments no longer say "seven choices".
- **Tests.**
  - `choices.test.ts`: every transition, a full round trip, pressed states and visibility, core
    and vibe refusals.
  - `choose.test.ts`:
    - an opinion writes `seen-now` with it, and keeps `seen-before`;
    - a listing clears the verdict, and an opinion afterwards defaults back;
    - the lower pills keep the verdict;
    - core refusals keep both;
    - a stale snapshot is forced between the route's read and the locked decision, through the
      seam, which now fires after the `REPEATABLE READ` read;
    - an act dated in the future refuses the press.
  - `store.test.ts`:
    - `decide` sees the locked facts;
    - withdrawal only if a judgement stands;
    - a refusal or a throw writes neither;
    - rollback when the viewing fails after `writeAct`;
    - a future-dated verdict or withdrawal refuses, while a viewing-only press is not held to that;
    - an equal instant lands, with `mock.timers` holding `Date`.
  - `overview.test.ts` / `readonly.test.ts`:
    - the five pills;
    - two forms;
    - `Check` is the only icon below, and there is no `Eye` or `History` in `movie-choices.tsx`;
    - the route writes only through `choose`, and `choose` is a writing operation no page may
      call;
    - the store stamps after the lock, with `confirmed`.
- **The local demo** (`app/dev/demo/route.ts`, uncommitted, never released) is taken out for the
  release gates and put back for the local preview. The read-only test rightly fails while it is
  there.

**How it is stored (round 2, after Codex's plan review: decided under the lock).** Every press,
all seven, goes through one new taste-store method, **`choose(film, decide)`**. In one
transaction it:

1. **Locks the film `FOR UPDATE`.**
2. **Reads what the press is decided from, under that lock:**
   - the viewing;
   - the judgement that stands (`standingWithin`);
   - whether the film is filed;
   - whether it is a core.

   This is a `HeldFilm`, the same shape as `choices.ts`'s `Film`.
3. **Calls the pure `decide(choice, held)` from `choices.ts`.** The route passes that in; the page's
   earlier read decides nothing.
   - A refusal is thrown from there, and nothing is written.
   - Otherwise it answers with a `FilmWrite`: `{ judgement?, withdraw?, viewing? }`.

   So the whole transition is decided on the locked state: keeping a seen value, the default
   `seen-now`, the toggle on a repeated opinion, the no-op and the refusals.
4. **Stamps the act *after* the lock.**
   - It reads when the last act about the film was said, with a new `lastSaidWithin` in the
     verdict module that matches by `filmKey` as `standingWithin` does.
   - If that is later than the stamp, the press is refused (`TasteError`, shown as `failed`) and
     nothing is written. An act that would sort before one already said cannot silently fail to
     take effect while the viewing changes.
   - Ordering stays the verdict module's own: time, then insertion sequence.
5. **Writes, the act first and then the viewing:**
   - a verdict (`told: confirmed`). A liked or loved needs the film filed, which the store checks
     itself (`VibeRequired`);
   - or a withdrawal, **only if a judgement stands under the lock**, so nothing that is not there
     is ever taken back;
   - then the viewing, if it changes. A change to a listing is refused for a core
     (`movieAnchorsVibe … "unsee"`).

   Any failure rolls back both.

`sayWatched` and `listInstead` are dropped. The repeated-opinion path no longer goes through
`saySaved`. `updateMovie` is no longer called by the website. `saySaved` and `sayFiled` stay for
the MCP tools.

**Tests added in round 2:**

- **Stale snapshots, through the route.** The film is changed behind the page, then pressed:
  - *Like it* on a film made `seen-before` meanwhile keeps `seen-before`;
  - *Like it* after the standing liked was withdrawn meanwhile writes liked, not a withdrawal;
  - *Want to see* after the judgement was withdrawn meanwhile writes no withdrawal.
- **Reversed timestamps.** An act dated later than the press already stands, so the press is
  refused and both facts are unchanged. The assertion is on the resulting standing state.
- **Rollback.** The viewing update fails after `writeAct`, and neither half persists.
- **Under the lock.** `decide` receives the locked facts, and a throw from it writes nothing.

**Look.**

- Two forms post to `/movie/choose`: the five pills, then, when shown, the two.
- The second heading is an `h3`, styled like the first.
- Selected lower pill: a new `--color-seen` green, with the lucide `Check` icon and no other icon.
  Unselected lower pill: the neutral style, with no icon.
- No client code.

**Unchanged:**

- the MCP tools and the skills: an assistant still writes a verdict and a viewing as two separate
  things;
- the card status;
- the Stream order;
- migration v15.

**Tests:**

- **`choices.test.ts`:**
  - every row of the table above;
  - the pressed state for each persisted state;
  - when the lower question shows;
  - the core and vibe refusals.
- **`choose.test.ts`:**
  - an opinion writes the verdict and `seen-now` together;
  - a lower pill keeps the verdict;
  - *Want to see* clears the verdict;
  - back to an opinion gives `seen-now`;
  - a refusal writes neither the verdict nor the viewing.
- **`store.test.ts`** (round 2: `choose` replaces the two methods first planned):
  - `choose` is atomic, and a refusal or a throw from `decide` leaves both facts as they were;
  - the core cases;
  - no withdrawal is written when nothing stands;
  - `decide` receives the facts read under the lock, after a change made after the page's read;
  - equal timestamps pass through the insertion sequence;
  - a future-dated verdict or withdrawal refuses the press;
  - a viewing-only press is not held to the timestamp guard.
- **`overview.test.ts`:**
  - five top pills with their original icons;
  - the lower pills draw `Check` only, and `movie-choices.tsx` uses no `Eye` or `History`;
  - two forms, both posting to the route;
  - no client code.
- **Wording:** README's website paragraph and privacy `:514` (the five choices, and *When did you
  see it?*), with their pins.

**The local demo** (`/dev/demo`, uncommitted, never released) shows the corrected screen.

## The ticket's decisions (fixed)

1. *Seen now* means watched recently: in an evening with Tonight, or after Tonight suggested it.
   It does not have to be the same day. *Seen before* means watched some time in the past, with the
   exact date unknown.
2. **Existing `seen` films must not be classed as recently watched.**
3. Stream: *Seen now* first, by an existing relevant date, newest first. Then *Seen before*, by an
   existing record date, newest first. Other statuses keep sensible handling. **No date Tonight
   recorded is presented as a watch date.**
4. Film screen: a clear, selectable *Seen now* / *Seen before*, minimal and consistent with the
   shipped UI.
5. Agent (ChatGPT / Claude skills):
   - infer *now* from an evening with Tonight or from recent context;
   - infer *before* when the user says it was long ago;
   - ask one short question when it is ambiguous;
   - no automatic literal quotes.
6. The verdict/vibe model and data ownership stay as they are. Migration and backward
   compatibility are planned explicitly.

## What the code holds today (inspected)

- `Movie.viewing` is one `NOT NULL` text column. Its values are `seen`, `want-to-see` and
  `dont-want-to-see`, held by `CHECK tonight_movies_viewing`, with default `want-to-see` (taste
  v14, `schema.ts:1292`).
  - Rule in `lib/taste/model.ts:160`: no `null`, no "unknown".
  - `VIEWINGS` is at `model.ts:174`.
- Dates on a film: `created_at` (set once, on insert; `null` before taste v6) and `updated_at`.
  - The trigger `tonight_written_at` moves `updated_at` on every update, and on a membership
    change through `tonight_mix_movies_touch`.
  - Verdicts carry their own `at`. Episodes carry `recordedAt`, which is "when Tonight wrote the
    evening down — never presented as when it happened" (`episodes/model.ts`).
  - **None of these is a watch date.**
- **The film screen has no Seen button.** Its five choices (`lib/web/choices.ts:53`) are *Love
  it*, *Like it*, *Want to see*, *Not interested* and *Dislike*. The UI plan says so
  (`docs/work/ui/PLAN.md:938`: "the user's five choices have no *Seen*").
  - Today *Seen* appears only as the read-only status mark: eye plus *Seen*
    (`components/movie-mark.tsx:45`), shown on a card when no judgement stands
    (`statusOf`, `stream.ts:83`).
  - A `seen` film shows no viewing choice pressed, and the website has no way back to seen.
- The Stream (`lib/web/stream.ts:46`) is one flat list of every film, newest saved first
  (`createdAt` desc, undated last, ties by title then `filmKey`). There are no sections.
- The website reads taste and standing verdicts only (`lib/web/held.ts`), never episodes.
- Code that compares a viewing to `seen`:
  - `lib/seen.ts:48` (`effectivelySeen`), which `check_candidates` and the website use;
  - `taste/store/sql.ts:494`, where a core may not be marked anything but `seen`;
  - `sql.ts:1145`, where a saved core must be `seen`;
  - `sql.ts:1151`, where a new core is inserted as `'seen'`;
  - `components/movie-mark.tsx:45`;
  - `skills/tonight-recommend/evaluation/score.mjs:154`;
  - the evaluation `gates.ts` / `trajectories.ts` under `lib/memory`, `lib/verdicts` and
    `lib/episodes`.
- Agent-facing strings that name `seen` are listed in *Agent-facing strings* below.

## Data model: one field, four answers

`Movie.viewing` stays the one field for where a film stands. `seen` is replaced by two values:

    seen-now           watched recently — in an evening with Tonight, after a suggestion, or lately
    seen-before        watched some time in the past; when is not known
    want-to-see        unchanged (and still the default for a film saved without one)
    dont-want-to-see   unchanged

- In `lib/taste/model.ts`:
  - `VIEWINGS = ["seen-now", "seen-before", "want-to-see", "dont-want-to-see"]`;
  - a `SEEN_VIEWINGS` subset with the two seen values, and a `SeenViewing` type;
  - the comments go from "three" to "four".
- In `lib/seen.ts`: a new `isSeen(viewing)`, true for both seen values.
  - `effectivelySeen` uses it.
  - So does every place listed above that compares to `"seen"`.
  - `"seen"` leaves the `Viewing` type, so `tsc` flags any comparison that is missed.
- **Neither value is a date, and no date is added.** *Seen before* says exactly what `seen`
  said: watched, when not known. *Seen now* adds only "recently". Recommendation logic does not
  change: both values rule a film out as new, as `seen` does today.
- **Why not keep `seen` and add one value:**
  - Keeping `seen` as "before" would leave the ambiguous word in the API. That is the thing the
    ticket removes.
  - A missed `=== "seen"` comparison would compile and quietly treat *Seen now* films as
    unwatched, so they would be recommended as new.
- **Why not an "unknown" fifth value:**
  - *Seen before* already means "watched, date unknown", which is exactly what every existing
    `seen` row records.
  - A fifth value would be a third seen state with no meaning of its own.
  - It would also need its own UI word, and its own place in the Stream.

## Migration: taste v15 (`lib/taste/store/schema.ts`)

> **Corrected by the user (Correction 3).** The mapping below was `seen → seen-before`. It is
> now **`seen → seen-now`**, and nothing becomes `seen-before`. Everything else in this section
> stands. The two "why" bullets record the reasoning of the first plan, which the user overrode.

**Every existing `seen` becomes `seen-now`. Nothing becomes `seen-before`.** This follows v14
(`schema.ts:1292`):

```sql
ALTER TABLE tonight_movies DROP CONSTRAINT tonight_movies_viewing;
ALTER TABLE tonight_movies DISABLE TRIGGER tonight_movies_written_at;
UPDATE tonight_movies SET viewing = 'seen-now' WHERE viewing = 'seen';
ALTER TABLE tonight_movies ENABLE TRIGGER tonight_movies_written_at;
ALTER TABLE tonight_movies ADD CONSTRAINT tonight_movies_viewing
  CHECK (viewing IN ('seen-now', 'seen-before', 'want-to-see', 'dont-want-to-see'));
```

- **(First plan, overridden) Why `seen-before`:** it is the reading that claims nothing new. An
  existing `seen` never said when.
- **(First plan, overridden) Why not infer `seen-now` for some rows:**
  - From an episode in which the film was started or finished: that would be a taste migration
    reading the episodes root, which breaks the ownership line. It would also need a "recent"
    threshold.
  - From `updated_at` or a verdict's `at`: those are capture times, not watch times.
  - The user moves a film to *Seen now* with one press on its screen, or through an assistant.
- **The trigger is off for the relabel**, as in v10 and v14, so `created_at` and `updated_at` do
  not move. The user did not touch these films. This also keeps the Stream's dates honest; see
  below.
- `DEFAULT 'want-to-see'` and `NOT NULL` stay as they are.
- **No preflight is needed.** v14's `CHECK` guarantees that every row is one of three values, and
  the mapping covers all three.
- **Roll-forward only.**
  - The build before this one writes `seen`, both from `checkViewing` and from the `holdCore`
    literal, and the new `CHECK` refuses it.
  - So the release follows the README's four steps (see *Rollout*), as v12, v14, verdicts v3 and
    episodes v3 did.
  - `requireSchema` already stops the new build from serving against v14.

## Store rules

- **A core is a film they have seen:** `seen-now` or `seen-before`.
  - `sql.ts:494`: the refusal fires only when the new viewing is not `isSeen`. So a core may move
    between the two seen values, and is still refused *want to see* and *don't want to see*.
  - `sql.ts:1145`: a saved film is a valid core only when `isSeen(found.viewing)`.
- **A core that is not saved yet:**
  - `vibeCore` (`server.ts:361`) gains an optional `viewing: "seen-now" | "seen-before"`.
  - `checkCore` (`model.ts:583`) validates it and returns `{ title, year, viewing? }`.
  - `holdCore(tx, owner, handle, viewing)` inserts with `viewing ?? 'seen-before'`, inside the
    transaction that anchors the vibe, as today. A vibe that is refused still leaves no loose
    film.
  - This works the same for `create_vibe` and `update_vibe` (`sql.ts:234`, `:273`).
  - The stored and returned `Vibe.core` stays `{ title, year }`.
- **Why a default of `seen-before` here, and not a refusal:**
  - The skill still tells the agent to pass `seen-now` when the context says recent, and to ask
    when it is ambiguous (see *The inference rule*). The default only catches an omission.
  - It catches an omission on the side that claims no recency, which is what decision 2 asks
    for.
  - It also keeps working, without misclassifying, for every caller that does not know the field
    yet:
    - a host with cached tool definitions during rollout;
    - `skills/tonight-recommend/evaluation/m3/seed.mjs:225`;
    - the store tests.
  - A refusal would break all of these, and a wrong value here costs only Stream order and one
    press to fix.
- **A saved core ignores `core.viewing`.** A saved film's viewing changes only through
  `update_movie`, as it does today. The `vibeCore` description says so, and a test pins it.

## Stream order (`lib/web/stream.ts`) — WITHDRAWN, see *Correction 2 (final)*

> **Not implemented.** The user withdrew this grouping, and the Stream keeps main's original
> `newestSaved` order. This section is kept only as the record of what was reviewed.

`stream()` sorts by a rank on the stored viewing. Inside a rank it sorts by that rank's date,
newest first. Ties are broken as today (title ignoring case, then year, then `filmKey`).

| Rank | Viewing | Date inside the rank | Why that date |
| --- | --- | --- | --- |
| 0 | `seen-now` | `updatedAt` | The last time Tonight wrote this film. For a *Seen now* film this is never earlier than the moment it was marked *Seen now*, because that write moves it. It is never `null`. |
| 1 | `seen-before` | `createdAt`, undated last | The record date the Stream already uses: when the film was saved. "When they marked it before" says nothing worth ordering by. |
| 2 | `want-to-see`, `dont-want-to-see` | `createdAt`, undated last | Exactly today's order. |

- **Other statuses come after both seen groups,** in today's newest-saved order. *Want to see*
  and *don't want to see* are not ordered against each other, as today. The ticket orders the two
  seen groups and leaves the rest as they are.
- **Grouping uses the stored viewing only.** A *want to see* film with a standing *liked* is in
  rank 2, and its card still says *Liked*.
- **`updatedAt` is record order, never viewing chronology.** Code comments, tests and any wording
  call it "last written", never "watched".
- **Known limit of `updatedAt`:** a later retitle, IMDb edit or re-filing of a *Seen now* film
  moves it up inside *Seen now*. It never moves it out of its group. A "viewing changed at"
  column would remove this, but the ticket asks for existing dates and the cost is small.
- **No date is shown,** on the Stream or anywhere else, and no text calls any of these dates a
  watch time.
  - The list's accessible label (`stream-view.tsx:66`) changes from "Your movies, most recently
    saved first" to "Your movies: seen now, then seen before, then the rest, newest first".
  - The comments that say "in the order it arrived" (`stream.ts:7`, `stream-view.tsx`) are
    updated.
- **Still one flat list, with no section headings.** The shipped design has no section per
  status. Each card already says *Seen now* or *Seen before* where no judgement stands.
- A vibe's screen keeps the vibe's own order (`filmsIn`). Only the Stream changes.

## UI

- **Marks (`components/movie-mark.tsx`).** `VIEWING` has four entries, in the order a film moves:
  - *Want to see* (bookmark);
  - *Seen now* (eye);
  - *Seen before* (lucide `History`, a clock turning back; checked to exist in the installed
    `lucide-react`, with `Eye` as the fallback);
  - *Don't want to see* (eye-off).

  A card's status shows the new words. **`statusOf` is unchanged**, so a judgement still stands
  alone on a card.
- **Film screen (`lib/web/choices.ts`, `components/movie-choices.tsx`).**
  - The ticket's "current Seen button" does not exist on the shipped film screen (see above).
    This plan reads it as: the website's *Seen* becomes two clear choices on the film's screen,
    in the same form and the same pill style as the other five. Codex should flag this if it
    reads the ticket differently.
  - The choices become seven, in this order: *Love it*, *Like it*, *Want to see*, **Seen now**,
    **Seen before**, *Not interested*, *Dislike*.
  - The keys are `seen-now` and `seen-before`, both of kind `viewing`.
  - They are plain submit buttons with `aria-pressed`, drawn by the existing `CHOICES.map`.
  - There is no dropdown, no modal, no client code and no poster. The page answers with a 303
    back to itself, as today.
  - The four viewing choices now cover every value, so **exactly one viewing is always pressed**.
    A seen film no longer shows none.
- **`decide`:**
  - Pressing the viewing a film already has writes nothing, as today.
  - **A core may switch between *Seen now* and *Seen before*.** *Want to see* and *Not
    interested* are still refused for a core (`refused: "core"`).
  - This also closes UI-plan open item 4: the website now has a way back to seen.
- **`refusalSentence("core")`:** the wording changes from *"so it stays seen"* to *"so it stays
  seen (now or before)"*. It stays a fixed sentence.
- **`lib/web/choose.ts`:** no logic change. It still makes only
  `taste.updateMovie({ viewing })`.
  - Its comments and `app/movie/page.tsx:21` change "five choices" to "seven".
  - A film's choices are still the website's only write.
- **Narrow screens.** The row already wraps (`flex flex-wrap gap-2`). Seven pills are checked at
  375 px during implementation.

## The inference rule (one wording; everything else refers to it)

It applies whenever a viewing is being written for a film they watched:

- **`seen-now`:**
  - they watched it lately — "tonight", "last night", "just finished it", "this week";
  - a film from an evening with Tonight that they say they started or finished;
  - a film Tonight suggested that they say they watched;
  - a rewatch they have just done.
- **`seen-before`:** they place it explicitly in the past — "years ago", "as a kid", "back when it
  came out", "a long time ago".
- **Ambiguous:** a bare "I've seen it" / "seen it" / "loved it" with nothing about when.
  - Ask **one short question** about whether it was recent, in your own words.
  - If you are already asking something (a Vibe proposal, the core's ask-once), fold it into that
    question. It is never a separate round.
  - If they do not say, save `seen-before`, the value that claims nothing about when, and say so.
- **No invented dates.**
  - Never state or estimate a date or a time when they watched it.
  - Never present `createdAt`, `updatedAt`, a verdict's time or an evening's `recordedAt` as a
    watch time.
  - Acknowledging timing they gave is fine ("you watched it last night").
- **No automatic literal quotes.** Setting a viewing manufactures nothing:
  - Writing `seen-now` or `seen-before` creates no quote, no verdict, no `because` and no
    `passReason`. The viewing is the whole write.
  - Their timing words are not turned into a stored quote because a viewing was set.
  - Reasons they actually gave are untouched and stay verbatim, timing words included. A
    verdict's `because` is still their words, unedited (vibes `SKILL.md:152`), and so is a pass
    reason (recommend `SKILL.md:453`). *"Pass, I just watched it last night"* is still a pass with
    that reason; that the film was watched last night may also set `seen-now`.
  - The confirmation says what was stored ("saved Heat as seen before"). It does not quote their
    timing words back as the reason for it.
  - **The new now/before clarification** is described by its intent, not scripted. The skills put
    no fixed sentence in quotation marks for the agent to recite as that question. Existing,
    unrelated example questions in the skills are not affected.

The canonical wording is in the `movieViewing` description (`server.ts:326`). The recommend
skill's viewing bullet (`SKILL.md:331`) states it. Every other site refers to it.

**Unchanged:** whether an evening's statement also writes a viewing. *"I watched it last night"*
is a viewing today (vibes `SKILL.md:278`) and now becomes `seen-now`. The episode facts
(`started`, `finished`) still never write or imply a viewing on their own. Episodes stay their
own root.

## Agent-facing strings (`tsc` does not see inside strings)

Found with `grep -n -i '\bseen\b'` over `lib/mcp/server.ts`, `lib/taste/model.ts`,
`lib/taste/store/sql.ts` and both `SKILL.md` files.

**`lib/mcp/server.ts`:**

| Where | Now | Change |
| --- | --- | --- |
| `:326–351` `movieViewing` | three values; "I've seen it" / "watched it years ago" → seen | four values, the inference rule. The enum gets a custom error (zod v4 `error`) naming the four values and the rule, so a host still sending `seen` is told how to choose. |
| `:361–371` `vibeCore` | new core saved "as seen"; refused unless `seen` | `viewing` (`seen-now` / `seen-before`, by the rule) for a film not saved yet, `seen-before` if omitted, ignored for a saved film; refused unless one of the two seen values |
| `:422` `get_taste` | lists three viewings | four values, plus: `createdAt` / `updatedAt` are when Tonight wrote the film, never when they watched it, and neither seen value carries a date |
| `:470–471` | new = "not seen" | new = neither seen value and no judgement |
| `:658` `create_movie` | *"I've seen it"* is seen | the rule: recent → `seen-now`, long ago → `seen-before`, ambiguous → ask once |
| `:693` `update_movie` | "it is always seen, …" | the four values; a rewatch is `seen-now` |
| `:703` | a core cannot be marked anything but seen | anything but `seen-now` or `seen-before` |
| `:898` | "a film being marked seen" | wording only ("marked seen now or before") |
| `:1267` `check_candidates` | "their list says seen" | "seen-now or seen-before"; the `seen` boolean is unchanged |
| `:1380` `VIBE_REQUIRED_NEXT` | "create_movie with viewing seen" | `seen-now` or `seen-before` by the rule, or `create_vibe` with `core.viewing` |

**`lib/taste/model.ts`:**

- `:791` (`movieAnchorsVibe … "unsee"`): "anything but seen" becomes "anything but seen now or
  seen before".
- `:865–869` (`coreNotSeen`): "then record seen with update_movie" becomes "record `seen-now` or
  `seen-before` with update_movie — whichever they said, asking once if they did not say when".
- `checkViewing` (`:528`): the message lists the four values. When the value is `seen`, it adds
  the rule in one clause.

**`skills/tonight-recommend/SKILL.md`:**

- `:55`, `:109`, `:172`: "`seen`" becomes "`seen-now` or `seen-before`". Both rule a film out as
  new, and nothing else about recommending changes. These three refer to the stored `viewing`.
- `:189–194`, the "Check the films before you present them" paragraph, consumes
  `check_candidates`. **Its `seen` is the result's boolean, not a viewing**, and is not relabelled.
  - The wording becomes "one whose `seen` is `true` unless they asked for a rewatch", so it
    cannot be read as the enum.
  - That boolean is already true for both seen values and for a film known as watched only
    through a standing judgement (`candidates/model.ts:160`, `:183`).
- `:309`: "unless they said they have seen it" becomes "unless they said they have seen it (then
  by the rule)".
- `:331–336`: the viewing bullet states the inference rule. That covers four sentences: recent,
  long ago, ambiguous, and *"don't recommend it again"*.
- `:384`: "give `seen`" becomes "give `seen-now` or `seen-before`, by the rule".
- `:457`: *"I've seen it"* is still never an evening. It is a viewing, by the rule.

**`skills/tonight-vibes/SKILL.md`:**

- `:45`: a core must be `seen-now` or `seen-before`.
- `:51`: a core that is not saved yet is saved with `core.viewing` by the rule; omitted means
  `seen-before`.
- `:54–55`: ask once whether they have seen it and, if so, recently or a while ago — one question.
  On a yes, `update_movie` with the value that follows from their answer.
- `:196` (positive-verdict filing): `create_movie` with `seen-now` or `seen-before` by the rule,
  or `create_vibe` with `core.viewing`. Liking it says they watched it, not when. An ambiguous
  timing goes into the same question as the Vibe proposal.
- `:278` (table): *"I watched it last night."* becomes a viewing, `seen-now`.
- `:363`: a core that is neither seen value is anchored again.

## Wording a user reads

Only the sentences that would become wrong are changed:

- `README.md:33`: the viewing vocabulary. `seen-now` (*"I just watched it"*) and `seen-before`
  (*"I saw it years ago"*).
- `README.md:213`: four viewings. Taste v15 turned every `seen` into `seen-before`.
- `README.md:228`: a core is saved as `seen-now` or `seen-before`. A new core is `seen-before`
  unless the assistant says otherwise.
- `README.md:246–258`, the website's write:
  - *Want to see*, *Seen now*, *Seen before* and *Not interested* set where the film stands;
  - a Vibe's core stays a film they watched, and may move between now and before;
  - "its five choices" becomes "its choices".
- `README.md:278`, *Deploying a migration*: taste v15 is roll-forward only. Reconnect the
  connector.
- Privacy, `app/privacy/page.tsx:150–153`:
  - four answers: *seen now*, *seen before*, *want to see*, *don't want to see*;
  - a film saved as the heart of a vibe is *seen now* or *seen before*, as you said, and *seen
    before* when you did not say;
  - films saved as *seen* before this change are *seen now* (Correction 3; first written as *seen
    before*);
  - Tonight keeps no date for when you watched a film.
- Privacy `:514` and terms `app/terms/page.tsx:144`: "the five choices" becomes "the choices"
  (the privacy text lists all seven).
- The pins in `lib/web/disclosures.test.ts` (`:157`, `:305–317`) are updated to match.

## Plugin

- `chatgpt-plugin/.codex-plugin/plugin.json`: version 1.8.1 → 1.9.0. `build.sh` copies both
  `SKILL.md` files at build time. `test.sh` checks only that the version is semver.
- `SERVER_VERSION` (`lib/mcp/identity.ts:17`) goes from 0.3.0 to **0.4.0**, because the viewing
  enum and `vibeCore` change the tool surface. `identity.ts:12` asks for a bump on a change a
  client would notice.
  - The pin at `lib/mcp/endpoint.test.ts:360–363` and its comment follow.
  - After deploying, `get_server_info` reading 0.4.0 is how a connection is checked against the
    new surface.

## Tests

**New:**

- **Migration v15 (`lib/db/migrate.test.ts`, `schemas.test.ts`):**
  - every `seen` becomes `seen-now`, and nothing becomes `seen-before` (Correction 3; first
    planned the other way round);
  - `want-to-see` and `dont-want-to-see` are untouched;
  - `created_at` and `updated_at` are byte-identical;
  - `seen` is refused afterwards, and both new values are accepted;
  - the default is still `want-to-see`;
  - a legacy row with `created_at` `NULL` keeps it `NULL`, and becomes `seen-now`;
  - **the trigger is back on:** an ordinary `UPDATE` after v15 still advances `updated_at` and
    keeps `created_at`.
  - **End-to-end upgrade tests keep running through the latest schema** (`TASTE_SCHEMA`). Where
    they assert a migrated `seen`, the assertion becomes `seen-now`, which is what a real upgrade
    now yields (Correction 3).
  - Only an assertion specific to one version (for example v14's "keeps seen") stops at its own
    version, using a `BEFORE_SEEN_NOW` slice like `BEFORE_MY_LIST`.
- **`taste/model.test.ts`:**
  - `checkViewing` accepts the four values and refuses `seen`, with the rule in the message;
  - `checkCore` accepts `viewing` as one of the two seen values only.
- **`seen.ts`:** `isSeen` and `effectivelySeen` for all four values.
- **`taste/store.test.ts`:**
  - a core moves `seen-now` ↔ `seen-before`, and is still refused `want-to-see`;
  - `seen-before` and `seen-now` both anchor;
  - an unsaved core is saved with the `core.viewing` given, through `createVibe` and through
    `updateVibe`, and as `seen-before` when it is omitted;
  - a saved *want to see* film named as a core with `core.viewing: "seen-now"` is still refused
    with `coreNotSeen`, and its viewing is unchanged;
  - a saved `seen-before` core named with `core.viewing: "seen-now"` stays `seen-before`.
- **`stream.test.ts`:**
  - the three ranks;
  - *Seen now* by `updatedAt`, newest first, including a film saved long ago and marked now
    (top);
  - *Seen before* and rank 2 by `createdAt`, undated last;
  - rank 2 keeps today's order;
  - a judged *want to see* film is in rank 2;
  - ties are total (`filmKey`).
- **`choices.test.ts` / `choose.test.ts`:**
  - seven choices in order and words;
  - both seen keys write the viewing, and the same value writes nothing;
  - a core may switch between the two seen values, and is refused *want to see*;
  - the route writes `seen-before` through `taste.updateMovie`;
  - exactly one viewing choice is pressed for each of the four values.
- **`overview.test.ts` / `readonly.test.ts`:**
  - still one `<button>` in source and one form;
  - the two new keys are among the buttons, in order;
  - still no client code;
  - the viewing order pin and the Stream label pin (`overview.test.ts:121`) are updated.
- **Candidates (`candidates/model.test.ts`, `mcp/candidates.test.ts`):** `seen` is `true` for a
  saved `seen-now` film, for a saved `seen-before` film, and for a `want-to-see` film or an
  unsaved one with a standing judgement. It is `false` only for `want-to-see` with no judgement,
  and `null` when nothing is known. The shape is unchanged.
- **`endpoint.test.ts:363`:** `get_server_info` answers 0.4.0.
- **MCP `tools.test.ts`:**
  - the viewing enum is the four values, and `seen` is refused with text naming `seen-now` and
    `seen-before`;
  - `vibeCore.viewing` accepts only the two seen values;
  - `create_vibe` on an unsaved core without it saves `seen-before`;
  - the reading pairs at `:609`:
    - "just watched it" → `seen-now`;
    - "watched it years ago" → `seen-before`;
    - "I've seen it" → ask (the phrase is followed by the ask-once rule, not by a value);
    - the three list sentences, unchanged.
  - The regex at `:625` gains the two new values, longest first.
- **Guidance pins, as text** (`tools.test.ts` for descriptions, `recommend-skill.test.ts`, both
  skill `test.sh`):
  - **What is pinned:**
    - recent / evening with Tonight / after a suggestion → `seen-now`;
    - explicitly long ago → `seen-before`;
    - ambiguous → one short question, folded into one already being put;
    - unanswered → `seen-before`;
    - no invented watch date, and Tonight's timestamps are never presented as one;
    - **nothing manufactured:** setting a viewing writes no quote, no verdict reason and no pass
      reason;
    - **supplied reasons intact:** the existing "their words go in `because`, unedited" (vibes
      `:152`) and "their words as `passReason`" (recommend `:453`) pins stay. A new pin says that
      a reason they gave stays verbatim even when it contains timing words.
  - **Where it is pinned:** `movieViewing`, `create_movie`, `vibeCore`, `VIBE_REQUIRED_NEXT`,
    `coreNotSeen`, the recommend skill's viewing bullet, and the vibes skill's core and filing
    paragraphs.
  - **The candidates replace rule (recommend `:189–194`):** pinned as "whose `seen` is `true`
    unless they asked for a rewatch". It must not mention `seen-now` or `seen-before`; a
    `grep -c` over that paragraph checks this.
  - **Absent everywhere:**
    - no tool description or `SKILL.md` tells an agent to write `seen`;
    - inside the now/before clarification passage, no question is set in quotation marks for the
      agent to say. That check is limited to the passage; the skills' other example questions
      stay.
  - The existing `test.sh` pins that quote `` `seen` `` move to the new wording: vibes `:476`,
    `:482`, `:486`, `:522`; recommend `:342`, `:776`. The recommend pins on the candidates
    paragraph keep the boolean wording.

**Relabelled mechanically:**

- Every test fixture and evaluation fixture or trajectory that uses `seen` as current data becomes
  `seen-before`. This was chosen as the value the migration first gave; since Correction 3 the
  migration gives `seen-now`. The fixtures are left as they are, because for recommending both
  seen values read the same. This covers:
  - `lib/**/*.test.ts`;
  - `lib/*/evaluation/{trajectories,gates}.ts`, including the local `Viewing` type in
    `lib/memory/evaluation/trajectories.ts:39`;
  - `skills/tonight-recommend/evaluation/**/fixtures/*.json`;
  - `score.mjs:154`, which uses both seen values.
- Tests about the new distinction use both values explicitly.
- **Exact assertions stay exact.** A gate that checks a stored value was preserved (for example
  `lib/verdicts/evaluation/gates.ts:350`, where withdrawing a verdict did not change the film)
  compares to the exact relabelled value, `seen-before`. Only a "has watched" predicate
  (`score.mjs:154`, for example) uses `isSeen`.
- **Not relabelled:**
  - migration tests that model data from before v15;
  - historical evaluation prose (rubrics, prompts, `preflight*.prompts.md`).

**Gates:**

- `npm test`, with the 4 known `lib/evaluation.test.ts` failures and no new ones;
- `npm run typecheck`, `npm run lint` and `npm run build`;
- both skill `test.sh` and `chatgpt-plugin/test.sh` (Codex runs these if this session lacks the
  permission);
- a signed-in check on the dev preview:
  - both new choices set the value, the pressed state follows, and the Stream order follows;
  - a core switches between now and before, and is refused *Want to see*;
  - Tab and Enter reach and press each choice;
  - at 375 px wide, seven pills wrap with no overflow.

## Rollout (only on the user's release authorization)

1. **Release steps.** Taste v15 is roll-forward only, so the README's four steps apply:
   1. stop the application;
   2. back up the database;
   3. run `npm run db:migrate`;
   4. deploy the new build.
2. **Reconnect the Tonight connector in each host.** Check that `get_server_info` answers 0.4.0,
   and that `tools/list` shows `viewing` as the four values.
   - Until a host reconnects, a `viewing: "seen"` is refused with a message naming the two values
     and the rule. Nothing is written silently.
   - A `create_vibe` without `core.viewing` keeps working, as `seen-before`.
3. **Rebuild and upload the ChatGPT plugin ZIP (1.9.0)** with `chatgpt-plugin/build.sh`.
4. **After release,** every saved seen film is *Seen now* (Correction 3). The user moves older ones
   to *Seen before* with one press, or through an assistant.

## Out of scope

- A watched date of any kind, and a "viewing changed at" column.
- Section headings on the Stream.
- Showing now/before beside a judgement on a card.
- Episode facts writing viewings.
- `check_candidates` returning now/before.
- Any change to recommendation logic beyond "both seen values are seen".
- A model-in-the-loop evaluation of the new guidance. It is pinned as text, as the earlier skill
  changes were.

## Points the reviewer was asked to challenge (round 1 outcome)

1. **The film screen has no Seen button today, so two choices are added.** Confirmed.
2. **The reading of "no automatic literal quotes".** Narrowed in round 2 (blocker 2).
3. **`updatedAt` as the *Seen now* date.** Accepted, as record order and never as viewing
   chronology, with its known limit.
4. **Other statuses after both seen groups.** Accepted, in their combined `createdAt` order.
5. **`seen-before` as the default for an omitted `core.viewing`.** Accepted, with a saved core
   ignoring the field.
