# Landing page: plans

This file holds two plans for the signed-out home page, in order:

- **Part 1 — simplification** (below, down to *Implementation*): implemented, uncommitted. Codex
  implementation review is NOT READY on manual checks only.
- **[Part 2 — AI-native landing](#part-2-ai-native-landing)** (at the end): **the current plan,
  revision 3, Codex plan review READY (round 3); implemented, committed and rebased onto
  `origin/main` `5f53947` (not pushed).** Codex implementation review is NOT READY with no code
  blocker; the manual checks on the rebased tree are still owed. A local preview is described at
  the end.
  It keeps Part 1's removals and replaces Part 1's copy.

---

Part 1 status: **revision 2, Codex plan review: READY (round 2), with no blockers and no further notes.
Browser, accessibility, responsive and sign-in checks (A4) remain required during
implementation.** Round 1 was NOT READY with one blocker: the Vibes
sentence promised *"Tonight saves nothing unless you say so"*, which is false — `record_episode`
writes down an evening's request and offers without asking (`web/lib/mcp/server.ts`,
`skills/tonight-recommend/SKILL.md`, *"You recommended a film. They said nothing."*). The sentence
now promises only what holds for Vibes (see *Claims* and *Revisions*).

**Implemented** (uncommitted, on `tonight-landing-plan` at `origin/main` `3655dc2`); see
*Implementation* at the end. **Codex implementation review round 1: NOT READY**, with one blocker,
which is verification rather than code. A4.2–A4.7 (layout, zoom, keyboard, VoiceOver, contrast in
a browser, a full Google sign-in) and the screenshots have to be done before it can be READY, and
this session has neither a browser nor a real OAuth client. The reviewer found no code blocker,
and its one note, a comment that overstated the client-code removal, is fixed. Nothing is
committed, pushed, merged or deployed.

- Ticket / branch / worktree: `tonight-landing-plan`, based on `main` at `3655dc2`.
- Baseline recorded on `main` at `3655dc2` (check-candidates plan): 1341 tests, 1337 pass. The 4
  failures are the known `lib/evaluation.test.ts` ones, which read gitignored evaluation
  `results/` directories that a worktree does not have. The implementer re-records it before the
  first edit (step 0).
- **A second worktree, `tonight-ui-plan`, has uncommitted changes to `web/app/page.tsx` and
  `web/app/globals.css`** (and about 50 other files). This plan is written so that it never edits
  that worktree, and so that whichever of the two lands second has a small conflict with a known
  resolution. See *Integration with `tonight-ui-plan`*.

## Scope (from the user, based on their screenshots)

Simplify the public, signed-out home page into a short, mobile-first page:

- **Keep:** the *Movies That Get You.* tagline, Google sign-in, and the footer with Privacy, Terms
  and Impressum. Keep *Closed beta.* only if it is accurate (it is; see *Claims*).
- **Replace** the long explanatory hero with a crisp value proposition: *Your taste in movies.
  Finally understood.* and *Tonight remembers what you love, understands why, and helps you
  discover what to watch next.*
- **Remove** the scripted ChatGPT conversation with the Popcorn Chaos carousel, its navigation
  dots, its previous/next steps, and the code only it uses.
- **Add** a short Vibes explanation: *More than ratings. Your personal Vibes.* and one sentence
  saying what makes Tonight different.
- Make no claim the product does not support. Keep the page responsive and mobile-first, keep it
  accessible, and keep sign-in working exactly as it does now.

**Out of scope:** the signed-in page (`Yours`) and everything `tonight-ui-plan` is changing;
`SiteHeader`, `SignIn`, `LegalLinks` and the legal pages; sign-in, OAuth and session code;
`next.config.ts`; `app/layout.tsx` metadata; `globals.css`; the README; the ChatGPT plugin
manifest; skills; MCP. No new dependency, no new client component, no images.

## What is on the page today

`web/app/page.tsx` renders `<Landing />` when nobody is signed in (`Home`, line 41). `Landing`
(lines 66–113) contains:

| # | Element | Source | Fate |
| - | --- | --- | --- |
| L1 | Header: `Tonight` (h1), *Movies That Get You.*, *Sign in with Google* | `SiteHeader` + `SignIn`, `components/site-header.tsx` | **kept, unchanged** |
| L2 | Hero: *Tonight doesn't just remember what you love. It understands why.* | `page.tsx` 74–78 | **replaced** by the new headline |
| L3 | *Discover what makes movies special to you through personal Vibes — and get recommendations that truly match your taste.* | `page.tsx` 80–83 | **replaced** by the new sub-line |
| L4 | The loop: `conversation → recommendation → your taste grows → better recommendations`, with an `sr-only` sentence | `page.tsx` 85–97 | **removed** |
| L5 | The worked-examples carousel: six scripted *You / ChatGPT / You / Tonight* exchanges (Popcorn Chaos, Everybody's Lying, Space Tension, Small Town Secrets, Beautiful Melancholy, Quiet Dread), an 8-second auto-advance, swipe, arrow keys, six dot buttons, ‹ › step buttons, `aria-live`, and the line *Tonight keeps what you said, never what it worked out about you. Nothing is saved unless you say so.* | `<WorkedExamples />`, `components/worked-examples.tsx` (357 lines, `"use client"`), data in `lib/worked-examples.ts` (118 lines), tests in `lib/worked-examples.test.ts` (6 tests) | **removed, all three files** |
| L6 | Footer: *Closed beta.* and `LegalLinks` (Home, Privacy, Terms, Impressum) | `page.tsx` 107–110, `components/legal.tsx` | **kept, unchanged** |

Who uses what is being removed, checked with `grep` over the repository:

- `WorkedExamples` is imported only by `app/page.tsx`.
- `WORKED_EXAMPLES` / `WorkedExample` are used only by `components/worked-examples.tsx` and
  `lib/worked-examples.test.ts`.
- No test pins the hero, the loop line or the carousel's copy. `lib/web/signin.test.ts` reads
  `app/page.tsx` as text (see *Traps*), and `lib/web/readonly.test.ts` scans every component;
  removing a component cannot fail either.
- `globals.css` has nothing carousel-only. The `prefers-reduced-motion` block and the `beam`
  colour are used across the site (focus rings, the header button), so **`globals.css` is not
  changed.**
- The names *Popcorn Chaos*, *Quiet Dread* and so on also appear in the README, the skills and
  store tests as ordinary example Vibe names. Those are not the carousel and stay.

## The new page

Top to bottom, at every width:

1. **Header (unchanged).** `<SiteHeader><SignIn /></SiteHeader>`: `Tonight` as the page's `h1`,
   the tagline *Movies That Get You.*, and *Sign in with Google* top right. On phone widths the
   header's existing `flex-wrap` puts the button on its own line under the name and tagline, which
   is today's behaviour and keeps it above the fold at 375 × 667.
2. **Value proposition.** A `<section aria-labelledby="landing-promise">`:
   - `h2#landing-promise`, `font-display`, about `text-[34px]` rising to `sm:text-[44px]`,
     `leading-[1.1]`, `text-ink`, on two lines on every width:
     **Your taste in movies.** / **Finally understood.** Each line is a block-level span with a
     literal space between the two sentences in the source, so the accessible name reads
     *"Your taste in movies. Finally understood."* rather than running the sentences together.
   - `p`, `mt-5`, `text-[16px] leading-relaxed text-ink-soft`:
     *Tonight remembers what you love, understands why, and helps you discover what to watch
     next.*
3. **Vibes.** A `<section aria-labelledby="landing-vibes">` in the card style the carousel used
   (`mt-12 sm:mt-16 rounded-2xl border border-rule bg-screen p-6 sm:p-8`):
   - `h2#landing-vibes`, `font-display`, about `text-[24px] sm:text-[28px]`:
     *More than ratings.* followed by *Your personal Vibes.* in `text-beam`. Amber is the colour
     that marks Vibes, as `globals.css` says on `main`, and it keeps true the `tonight-ui-plan`
     wording of that comment (*"the landing page's accent"*) — so neither branch's comment goes
     stale.
   - `p`, `mt-3 text-[15px] leading-relaxed text-ink-soft`, one sentence:
     *Vibes capture the kinds of night you love, and why — and each one is saved only with your
     yes.*
4. **Footer (unchanged).** *Closed beta.* and `<LegalLinks />`, exactly as today.

No other element: no image, illustration, extra call to action, second sign-in button, list of
steps or example. The page has no client code of its own once the carousel is gone (the
`next/link` in `LegalLinks` is the only client component it renders, as before), so nothing moves
and nothing needs a reduced-motion rule.

Sketch of the result — the shape, not code to paste; class values may move by a step during the
browser check:

```tsx
/**
 * The public page: what Tonight is, in two short statements, and the way in.
 *
 * It reads nothing about the visitor and renders the same for everybody. Nothing
 * on it moves: the slideshow that used to be here, and its client code, are gone.
 */
function Landing() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <SiteHeader>
        <SignIn />
      </SiteHeader>

      <section aria-labelledby="landing-promise">
        <h2 id="landing-promise" className="font-display text-[34px] leading-[1.1] sm:text-[44px]">
          <span className="block">Your taste in movies.</span>{" "}
          <span className="block">Finally understood.</span>
        </h2>
        <p className="mt-5 text-[16px] leading-relaxed text-ink-soft">
          Tonight remembers what you love, understands why, and helps you discover what to watch
          next.
        </p>
      </section>

      <section
        aria-labelledby="landing-vibes"
        className="mt-12 rounded-2xl border border-rule bg-screen p-6 sm:mt-16 sm:p-8"
      >
        <h2 id="landing-vibes" className="font-display text-[24px] leading-tight sm:text-[28px]">
          More than ratings. <span className="text-beam">Your personal Vibes.</span>
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Vibes capture the kinds of night you love, and why — and each one is saved only with
          your yes.
        </p>
      </section>

      {/* the existing footer comment and <footer>, unchanged */}
    </main>
  );
}
```

## Claims

Every sentence on the new page, against what the repository says the product does:

| Copy | Basis |
| --- | --- |
| *Movies That Get You.* | Existing tagline (`site-header.tsx`, README line 3, plugin manifest). |
| *Your taste in movies. Finally understood.* | A headline restating the next sentence; it adds no capability. |
| *Tonight remembers what you love* | Tonight stores the user's Movies, Verdicts (`liked` / `loved` / `disliked`), Genres and Vibes (README, *There are four things in it*). |
| *understands why* | Already claimed on the live page and in the README (*"It understands why."*). Its substance: a Vibe and a Genre each carry an *instruction* — what it means to the user — and a Verdict carries *"your own words for why"* (README). |
| *and helps you discover what to watch next* | Recommendation is the product's use: the `tonight-recommend` skill recommends from the model through the user's assistant (README, *The skills*). "Helps" is deliberate: Tonight holds the model and the host agent chooses the films (README, *The architecture*), so the page does not say Tonight itself picks them. |
| *More than ratings.* | Tonight does keep a rating-like Verdict per film, and *more than* is literally true: Vibes, Genres and the user's own reasons sit alongside it. It does not say Tonight has no ratings. |
| *Your personal Vibes.* | Vibes are per-user and built from the user's own Genres (README). |
| *Vibes capture the kinds of night you love, and why* | A Vibe is "a reusable name for a *kind of night*" (`lib/worked-examples.ts`, `docs/work/chatgpt-companion-redesign.md`) with an instruction "for what the combination means to you" (README). |
| *and each one is saved only with your yes* | About Vibes only. A Vibe is "proposed in the conversation and written only on their yes", and a change to one is made "only when needed, and only on their yes" (`skills/tonight-vibes/SKILL.md`, lines 3 and 182); the README's rule for all taste is "durable taste the user stated, or a meaning they confirmed when the agent asked". |
| *Closed beta.* | Accurate: sign-in is limited to `ALLOWED_EMAILS` (`lib/oauth/access.ts`, refused with *"not on the Tonight closed beta's access list"*, `lib/web/signin.ts`), and the privacy page and terms both describe *"a free, invitation-only closed beta"*. Kept. |

Deliberately **not** said: that Tonight works in ChatGPT or Claude, that it has no ratings, that it
learns on its own, any number of users or films, anything about streaming availability, or any
comparison with a named competitor. **And no promise about everything Tonight stores:** evenings
(`record_episode`) are written down without a yes, and a verdict the user volunteers "needs no
yes: they said it" (`skills/tonight-vibes/SKILL.md`, line 133). The carousel's old line *"Nothing
is saved unless you say so"* goes with the carousel and is not carried over in any form.

## Exact files

| File | Change |
| --- | --- |
| `web/app/page.tsx` | Delete the `import { WorkedExamples } from "@/components/worked-examples";` line. Replace `Landing`'s doc comment and the body between `</SiteHeader>` and the footer comment (today's lines 61–65 and 73–100) as above. Nothing else in the file: not the imports for `SiteHeader` / `SignIn` / `LegalLinks`, not the module comment, not `Home`, `resolveVisitor`, `Yours`, `readTaste` or `report`. |
| `web/components/worked-examples.tsx` | **Delete.** |
| `web/lib/worked-examples.ts` | **Delete.** |
| `web/lib/worked-examples.test.ts` | **Delete** (its 6 tests test only the deleted data). |
| `web/lib/web/landing.test.ts` | **New.** Source-level contract, in the style of `signin.test.ts` and `disclosures.test.ts` — see *Acceptance tests*, A3. |
| `docs/work/landing/PLAN.md` | This plan; at the end of implementation, an *Implementation* section with commits and results, as earlier plans do. |

**Not touched:** `web/app/globals.css`, `web/app/layout.tsx`, `components/site-header.tsx`,
`components/legal.tsx`, every file under `app/auth`, `app/oauth`, `app/privacy`, `app/terms`,
`app/impressum`, `lib/web/signin.ts`, `lib/web/visitor.ts`, `next.config.ts`, `README.md`,
`chatgpt-plugin/`, `skills/`, and every test other than the one deleted and the one added.
Historical plans that describe the carousel (`docs/work/chatgpt-companion-redesign.md`,
`phase-1-implementation.md`, `chatgpt-plugin-plan.md`) are records of past decisions and are not
rewritten.

## Traps

- **`page.tsx` must not contain the text `params`.** `signin.test.ts` asserts
  `page.includes("params") === false` (on `main`, and in `tonight-ui-plan`'s rewrite of that test).
  None of the new copy or ids contains it; keep it that way in any wording change.
- **No form outside `site-header.tsx`.** `readonly.test.ts` allows exactly the sign-in and
  sign-out forms and only in that file. The landing page reuses `<SignIn />`; it never writes its
  own `<form>` or a second sign-in button.
- **No client code on the page.** Do not add `"use client"`, a hook or an event handler to
  `page.tsx`; there is nothing left that needs one.
- **The header is shared.** The tagline and the sign-in button live in `SiteHeader` / `SignIn`,
  which the signed-in page and `tonight-ui-plan`'s `signed-in.tsx` also use. Styling them for the
  landing page would restyle those too; this plan does not.

## Integration with `tonight-ui-plan`

What that worktree has, read on 2026-10-25 with `git -C ../tonight-ui-plan status/diff` and its
`docs/work/ui/PLAN.md` (read only — nothing there was or will be written):

- **`web/app/page.tsx`:** it replaces the import block (lines 1–9: drops `Account`, `TasteView`,
  the store and visitor imports; adds `SignedIn`, `Unavailable`, `StreamView`, `readHeld`,
  `resolveVisitor`), extends the module comment, moves `resolveVisitor` / `readTaste` / `report`
  into `lib/web/held.ts`, and rewrites `Yours`. **It does not change `Landing`** — its plan says
  "`Landing` is untouched" (§6.1) and lists the landing page under *Not touched*. It **keeps** the
  line `import { WorkedExamples } from "@/components/worked-examples";`.
- **`web/app/globals.css`:** adds `--color-vibe`, `--color-loved`, `--color-liked`, rewrites the
  `beam` and `alarm` comments, removes `--color-scrim`. This plan does not edit `globals.css`, so
  there is nothing to conflict.
- It does not touch `worked-examples.*`, `site-header.tsx`, `legal.tsx` or `layout.tsx`.

So the two changes overlap in exactly one place: the **import block of `page.tsx`**, where it
rewrites lines 1–9 and this plan deletes line 3. Git reports that as a conflict whichever lands
second — it cannot silently keep a dangling import — and the resolution is always the same:
**take `tonight-ui-plan`'s import block, minus the `WorkedExamples` line.** The `Landing` hunk and
the three file deletions apply cleanly in either order.

### Rules for whoever implements this

1. Implement **only in this worktree** (`worktrees/tonight-landing-plan`, branch
   `tonight-landing-plan`). Never `cd` into, check out in, stash in, copy files from or copy files
   to `worktrees/tonight-ui-plan`. Its uncommitted work exists nowhere else; anything that touches
   it can lose it. Use `git -C` read-only commands only, if at all.
2. Never use bare `git stash` here: the stash stack is shared with that worktree.
3. Edit `page.tsx` with targeted edits to the import line and `Landing`, never by writing the
   whole file from another copy — in particular not from `tonight-ui-plan`'s, which would pull
   its uncommitted signed-in work into this branch.
4. Before the first edit (step 0), check whether `tonight-ui-plan` has landed on `main`
   (`git fetch` then `git log origin/main`). If it has, merge `origin/main` into this branch first
   and make the edits on top of it: the only difference is that the import block to edit is
   theirs, and the line to delete is the same.

### Merge order

Either order works; the recommendation is **`tonight-ui-plan` first**, because it is further
along (implemented, awaiting its implementation review) and is the larger change, so it should
not be the one that has to resolve a conflict in someone else's file.

- **UI first (recommended).** After it merges, this branch merges `origin/main`. Conflict in the
  `page.tsx` import block only → keep theirs, delete the `WorkedExamples` line. Then run the full
  check (A1–A4). `globals.css` merges with no conflict because this branch never changed it.
- **Landing first.** `tonight-ui-plan` resolves the same import-block conflict the same way when it
  next takes `main`. Tell that session beforehand (through the user, or over Relay with this
  plan's path), so it does not "fix" the conflict by restoring the import: the file it imports is
  deleted, so restoring it fails `typecheck` and `build`. Its own `PLAN.md` line "restyling the
  landing page (its worked examples keep amber for vibes)" becomes a stale historical note, not a
  code problem.

In both orders, after the second merge: A2's leftover grep (with the same exclusions) returns
nothing, and A1–A4 pass on the merged tree.

## Steps

Each step leaves `npm run test`, `typecheck` and `lint` green.

0. **Baseline.** Check for `tonight-ui-plan` on `main` (rule 4). `cd web && npm ci`; record
   `npm run test`, `npm run typecheck`, `npm run lint`.
1. **Copy and removal, one commit.** Edit `page.tsx` (import line, `Landing`); delete the three
   `worked-examples` files; add `lib/web/landing.test.ts`. These cannot be split: the page cannot
   lose the import while the component is still the only thing on it, and the component cannot be
   deleted while the page imports it.
2. **Checks.** A1–A4 below; record results in this plan's *Implementation* section.

## Acceptance tests

### A1. Repository checks (`web/`)

- `npm run test`: the baseline count **minus the 6** `worked-examples.test.ts` tests **plus** the
  new `landing.test.ts` tests; the same 4 known `evaluation.test.ts` failures and no others. In
  particular `signin.test.ts` (*"signed out, the home page is the landing page and reads nobody's
  taste"*, the `page.tsx` source checks) and `readonly.test.ts`'s form check pass without being
  edited. On today's `main` that check allows exactly the sign-in and sign-out forms; once
  `tonight-ui-plan` has landed it also allows that branch's choice form (three in all). Either way
  this change adds no form, so the count is whatever the tree it sits on expects.
- `npm run typecheck` and `npm run lint`: clean.
- `npm run build`: succeeds; `/` stays dynamic (`ƒ`), as `export const dynamic = "force-dynamic"`
  is unchanged.

### A2. No leftovers

- `grep -rn "worked-examples\|WorkedExamples\|WORKED_EXAMPLES" web/ --exclude-dir=node_modules
  --exclude-dir=.next --exclude=landing.test.ts` → nothing (the new test names the deleted paths
  in order to check they are gone).
- `grep -n "ChatGPT\|carousel\|conversation →" web/app/page.tsx` → nothing.
- After `git fetch`, `git diff --stat origin/main...HEAD` lists only `web/app/page.tsx`, the three
  deleted files, `web/lib/web/landing.test.ts` and `docs/work/landing/PLAN.md`. Against
  `origin/main`, not local `main`, which can be stale after `tonight-ui-plan` merges.

### A3. `web/lib/web/landing.test.ts` (new)

Reads `app/page.tsx` as text, like `signin.test.ts`, and checks what the user asked for:

1. *The landing page says what Tonight is, in the approved words:* `page.tsx` contains *Your
   taste in movies.*, *Finally understood.*, *Tonight remembers what you love, understands why,
   and helps you discover what to watch next.*, *More than ratings.*, *Your personal Vibes.* and
   the Vibes sentence. Whitespace in the source is normalised before matching, since JSX may wrap
   a sentence across lines.
2. *It keeps the way in and the way out:* `Landing` renders `<SignIn />`, `<LegalLinks />` and
   *Closed beta.*, and the tagline is still in `components/site-header.tsx`.
3. *The scripted conversation is gone, and nothing is left of it:*
   `components/worked-examples.tsx`, `lib/worked-examples.ts` and `lib/worked-examples.test.ts` do
   not exist; no file under `app/`, `components/` or `lib/` other than this test mentions
   `worked-examples`; `page.tsx`
   contains no `ChatGPT`, `aria-roledescription`, `aria-live` or `"use client"`.

### A4. In a browser (`npm run dev`, signed out, with `web/.env.local` filled in)

1. `curl -s http://localhost:3000/` contains the six strings of A3.1, *Sign in with Google*,
   *Closed beta.*, `href="/privacy"`, `href="/terms"`, `href="/impressum"`, and does not contain
   *ChatGPT*, *Popcorn Chaos* or `carousel`.
2. **Mobile first.** At 320, 375 and 414 px wide, and at 768 and 1280: no horizontal scroll;
   the header wraps cleanly; the headline is on two lines; at 375 × 667 the sign-in button and the
   whole value proposition are visible without scrolling; the Vibes card does not overflow.
3. **Zoom.** At 200% browser zoom (and text-only zoom in Safari) nothing is clipped or overlapping.
4. **Keyboard.** Tab order is *Sign in with Google* → Home → Privacy → Terms → Impressum, and
   nothing else is focusable (the six dots and two steps are gone). The sign-in button shows its
   amber focus ring; the legal links show the browser's default focus indicator, as they do today
   (`LegalLinks` has no focus style of its own and is out of scope). Each indicator is visible.
5. **Screen reader (VoiceOver).** Headings rotor: `Tonight` (h1), *Your taste in movies. Finally
   understood.* (h2, read with a pause between the sentences), *More than ratings. Your personal
   Vibes.* (h2). No *carousel* or *slide* is announced and nothing is announced on its own.
   Landmarks: main, and navigation (the legal links). The `<header>` and `<footer>` sit inside
   `<main>`, as on today's page and every other page of the site, so they are not exposed as
   banner and contentinfo; that structure is shared with `SiteHeader` and `LegalPage` and is not
   changed here.
6. **Contrast.** New body text is `ink-soft` on `night` (about 7.2:1) and on `screen` (about
   6.75:1); the amber Vibes phrase is `beam` on `screen` (8.51:1, corrected in Part 2). No new text uses
   `ink-faint`.
7. **Sign-in, unchanged.** *Sign in with Google* posts to `/auth/signin` and is redirected to
   `accounts.google.com`. With an account on `ALLOWED_EMAILS`, finishing sign-in lands on `/` and
   shows the signed-in page, not the landing page; signing out returns to the new landing page.
   With an account not on the list, the existing refusal is shown.
8. **Legal links.** Privacy, Terms and Impressum each open their page, and each of those links
   back to Home.

Screenshots at 375 px and 1280 px go with the implementation report.

## Risks

| Risk | Mitigation |
| --- | --- |
| Overwriting or absorbing `tonight-ui-plan`'s uncommitted work | Never touch that worktree; targeted edits only; no shared stash (rules 1–3). |
| The import-block conflict resolved the wrong way (import restored) | The resolution is written down above; A1 (`typecheck`, `build`) and A2's grep fail if the import comes back. |
| Merging second against a moved `main` | Rule 4 and the merge-order section; A1–A4 re-run on the merged tree. |
| A claim the product does not support | Every sentence is traced in *Claims*; A3 pins the approved words so a later edit is deliberate. |
| The page no longer says *how* Tonight is used (through an assistant) — the carousel was the only place that showed it | Accepted per the user's brief; raised as open question 1, not silently added. |
| Google OAuth branding needs a home page that describes the app and links the privacy policy and terms | The page still describes the app in its own words, and `LegalLinks` is unchanged in the footer (A4.8). |
| Pinned copy makes a future wording change touch a test | Intended: it is how this repository pins user-facing statements (`disclosures.test.ts`). |
| `layout.tsx`'s meta description and the README / plugin manifest keep the old hero wording | Still true, so not wrong. Left alone because the README and manifest are being changed in `tonight-ui-plan`; a follow-up can align them after both land (open question 2). |

## Open questions for the user

1. **Say where Tonight is used?** Without the conversation, nothing on the page says Tonight
   works through an assistant (ChatGPT, Claude, any MCP host). This plan follows the brief and
   leaves it out. If wanted, the smallest honest addition is one short line under the Vibes
   sentence; it is not in this plan.
2. **Align the old wording elsewhere?** The meta description (`layout.tsx`), README lines 5–6 and
   the ChatGPT plugin's `longDescription` still use the old hero copy. Recommended: a follow-up
   after both branches land, so this change stays inside the landing page and away from files
   `tonight-ui-plan` is editing.
3. **The exact Vibes sentence.** The plan uses *"Vibes capture the kinds of night you love, and
   why — and each one is saved only with your yes."* because both halves are rules the product
   states for Vibes. The user may prefer other words; any replacement should pass the same check
   in *Claims*, and must not widen the promise from Vibes to everything Tonight stores.

## Revisions

- **Revision 2 (Codex plan review round 1: NOT READY, one blocker).** Blocker: *"Tonight saves
  nothing unless you say so"* is false, because evenings are recorded without a yes. Fixed by
  narrowing the sentence to Vibes (*"…and each one is saved only with your yes"*), with its basis
  in *Claims* and the boundary stated under *Deliberately not said*. Non-blocking notes adopted:
  the merge-order grep now uses A2's exclusions; A2 diffs against fetched `origin/main`; A1 no
  longer assumes two forms after `tonight-ui-plan` lands; A4.4 no longer promises amber focus
  rings on the legal links; A4.5 no longer expects banner and contentinfo landmarks.
- **Codex plan review round 2: READY.** The promise is correctly scoped to Vibes and backed by
  the skill. The integration sequencing and the import-block resolution still match the
  concurrent UI diff. No further notes.

## Implementation

Authorised by the user after the READY plan review. Implemented in this worktree only, against
`origin/main` at `3655dc2`. `tonight-ui-plan` had not landed: `git fetch` left `origin/main` at
`3655dc2`. Its worktree was not opened, read from or written to during implementation, and the
shared stash was not used. Not committed.

**Changes, exactly as planned:**

- `web/app/page.tsx`: the `WorkedExamples` import line removed; `Landing`'s doc comment and
  content replaced by the value-proposition section and the Vibes card, as in *The new page*.
  `SiteHeader` / `SignIn`, the footer (*Closed beta.*, `LegalLinks`), `Home`, `resolveVisitor`,
  `Yours`, `readTaste` and `report` are unchanged, so the signed-in page is as it was.
- Deleted with `git rm` (the deletions are staged, nothing is committed):
  `web/components/worked-examples.tsx`, `web/lib/worked-examples.ts`,
  `web/lib/worked-examples.test.ts`.
- Added `web/lib/web/landing.test.ts`, 4 tests:
  1. the six approved strings are in `Landing`, and no blanket save promise (*saves nothing*,
     *nothing is saved*, *unless you say so*) is — the round 1 blocker, pinned;
  2. `Landing` has no h1 of its own and exactly two h2s, and each `aria-labelledby` names an `id`
     that is there;
  3. `<SignIn />` sits in `<SiteHeader>`, `<LegalLinks />` and *Closed beta.* stay, and the
     tagline is still in `site-header.tsx`;
  4. the three files are gone, no file under `app/`, `components/` or `lib/` other than this test
     mentions them, and `page.tsx` has no `ChatGPT`, `conversation →`, `aria-roledescription`,
     `aria-live` or `"use client"`.

  The checks are scoped to the `Landing` function, not the whole file, so nothing the signed-in
  branch renders can satisfy them.

**Results (A1–A4):**

| Check | Result |
| --- | --- |
| Baseline (`npm ci`, before the first edit) | `npm run test` 1341 tests, 1337 pass, the 4 known `evaluation.test.ts` failures; `typecheck` clean; `lint` 0 errors, 2 warnings (unused variables in `taste/store.test.ts` and `taste/store/concurrency.test.ts`) |
| A1 `npm run test` | **1339 tests, 1335 pass** (1341 − 6 deleted + 4 new); the same 4 failures and no others. `signin.test.ts` and `readonly.test.ts` pass unedited |
| A1 `typecheck` / `lint` | clean / 0 errors, the same 2 existing warnings |
| A1 `npm run build` | succeeds; `/` is `ƒ` (dynamic) |
| A2 leftovers | `grep` for `worked-examples` / `WorkedExamples` / `WORKED_EXAMPLES` under `web/` (excluding `node_modules`, `.next` and `landing.test.ts`): nothing. `page.tsx` has no `ChatGPT`, `carousel` or `conversation →`. `git diff --stat origin/main`: `page.tsx` and the three deletions; `landing.test.ts` and this plan are untracked |
| A3 `landing.test.ts` | 4 / 4 pass |
| A4.1 signed-out `/` (dev server on port 3123, throwaway `.env.local`, in-memory database; fetched with Node's `fetch` because `curl` needs approval in this session) | 200. All six approved strings, *Sign in with Google*, *Movies That Get You.*, *Closed beta.*, `href="/privacy"`, `/terms`, `/impressum` and `action="/auth/signin"` present; *ChatGPT*, *Popcorn Chaos*, `carousel`, `aria-live`, *saves nothing*, *unless you say so*, `conversation →` absent. One h1, two h2s, one form |
| A4.7 sign-in, as far as it can go without a real Google client | `POST /auth/signin` from the same origin: 302 to `https://accounts.google.com/o/oauth2/v2/auth` with `redirect_uri=http://localhost:3123/auth/callback` and a cookie set; from another origin: 403. **Not run:** completing a sign-in, the signed-in page after it, sign-out back to the landing page, and the refusal for an address not on the list — those need a real Google OAuth client |
| A4.8 legal pages | `/privacy`, `/terms`, `/impressum` each 200, each linking Home, Privacy, Terms and Impressum |
| A4.2–A4.6 layout at 320 / 375 / 414 / 768 / 1280 px, 200% zoom, keyboard, VoiceOver, contrast in a browser; screenshots | **Not run:** this session has no browser it may drive. Left as a manual check |

The throwaway `.env.local` was removed afterwards (`git clean -X` on that one ignored file), and
the dev server stopped. Neither the dev server nor the build changed a tracked file.

**Codex implementation review, round 1: NOT READY.**

- Blocker 1 (verification, not code): A4.2–A4.7 and the screenshots are not done. **Open.**
  Closing it needs a person with a browser and the deployment's real Google OAuth client.
  That is the checklist below.
- Non-blocking: the `Landing` doc comment said nothing on the page is a client component, but
  `LegalLinks` renders `next/link`, which is one. **Fixed:** the comment now says the slideshow and
  its client code are gone, and the plan's matching sentences say the same. After the fix, the
  `landing`, `signin` and `readonly` tests pass (48 / 48), `typecheck` is clean and `lint` is
  unchanged (0 errors, the same 2 warnings).
- The reviewer found no code blocker and confirmed that the signed-in path, the sign-in components
  and the footer are preserved.

**Manual checks still required (A4.2–A4.7), with `npm run dev` and a real `web/.env.local`:**

1. At 320, 375, 414, 768 and 1280 px wide: no horizontal scroll; the header wraps cleanly; the
   headline is on two lines; at 375 × 667 the sign-in button and the whole value proposition are
   visible without scrolling; the Vibes card does not overflow. Screenshots at 375 and 1280 px.
2. At 200% zoom, and with text-only zoom in Safari, nothing is clipped or overlapping.
3. Tab order: *Sign in with Google* (amber ring), then Home, Privacy, Terms and Impressum
   (browser default focus); nothing else is focusable.
4. VoiceOver headings: *Tonight* (h1), *Your taste in movies. Finally understood.* (h2, with a
   pause between the sentences), *More than ratings. Your personal Vibes.* (h2). No carousel or
   slide is announced; the landmarks are main and navigation.
5. Contrast as measured in the browser: `ink-soft` text and the amber phrase as in A4.6.
6. Sign in with an address on `ALLOWED_EMAILS` and land on the signed-in page, unchanged; sign out
   back to the new landing page; an address not on the list gets the existing refusal.

**Integration, still to do:** when `tonight-ui-plan` merges, merge `origin/main` into this branch
(UI first, as planned). Resolve the `page.tsx` import block by keeping theirs minus the
`WorkedExamples` line, then re-run A1–A4 on the merged tree. That is not done ahead of time:
`origin/main` does not have it yet. (Part 2 replaces "merge" here with a rebase, at the user's
request; see Part 2, *Integration*.)

---

# Part 2: AI-native landing

Status: **plan, revision 3, Codex READY (round 3, a targeted review of the hero change).**
Revision 2 was Codex READY (round 2). Revision 3 changes one decision, at the user's explicit instruction: the hero is
the user's exact line, *Your next movie is already on my mind.*, not a substitute. The changes that
follow from it are listed under *Revisions (Part 2)*. Implementation READY will still need P-A4's
browser, accessibility and OAuth checks and the screenshots; the shared-text contrast stays a
documented follow-up. Round 1 was NOT READY with one blocker: the
example's caption and *You* label were planned in `ink-faint`, which is 3.37:1 on `screen`, below
WCAG 1.4.3's 4.5:1. Both are now `ink-soft` (6.75:1), with a test guard; see *Revisions (Part 2)*.
Planning only: nothing implemented, committed, pushed, merged or deployed. Implementation starts
only after Codex READY.

- Base: this worktree's working tree, which is `origin/main` at `3655dc2` plus Part 1's
  uncommitted changes. `git fetch` on 2026-10-25: `origin/main` is still `3655dc2`, so
  `tonight-ui-plan` has not landed.
- Part 1's removals stay: the slideshow, its data and its test are gone, and `landing.test.ts`
  exists. **Part 1's copy is replaced**: the hero and the Vibes card. Part 1 is never shipped on its
  own, so its open verification blocker (the manual checks) is carried into Part 2's acceptance
  and done once, on the final page (P-A4).

## The idea (from the user)

Tonight is not another movie-taste app. It is **the AI that takes care of your movie nights**: a
personal memory of what moves you, and responsibility for the next movie night being better. The
page leads with that rather than with features:

- a short hero in the AI's own voice, with a supporting line;
- **one personal Tonight message as the centre of the page**, instead of feature tiles — what it
  is like when Tonight knows you (for example, a reply that builds on *Arrival*);
- Vibes and the film list as **supporting infrastructure**, named in passing, not as a headline;
- a **clear line between what is available today and where Tonight is going**, with no promise of
  proactivity the product does not have.

Constraints: minimal scope; sign-in and the legal pages unchanged; no new architecture.

## What Tonight can and cannot say about itself today

Checked against the repository on 2026-10-25. This list decides the copy below.

| Claim | Today? | Evidence |
| --- | --- | --- |
| Remembers your films, what you thought of them in your words, your Vibes and Genres | **yes** | README, *There are four things in it*; a verdict carries "your own words for why if you gave them" |
| Uses that memory when you ask for a film, quoting what you said | **yes** | `skills/tonight-recommend/SKILL.md` 125–127: "When a verdict shapes the answer, say what they said … use their words and do not make them stronger" |
| Commits to a lead rather than a list | **yes** | same skill, 205–210: "Naming a lead costs nothing … a curator can, because a curator is supposed to have an opinion" |
| Works inside the assistant you already use (ChatGPT, Claude, other MCP hosts) | **yes**, closed beta | README, *The architecture*; `chatgpt-plugin/`; the privacy page: "whatever MCP client you use — Claude, ChatGPT or another" |
| Lets you see your films and Vibes on this site after sign-in | **yes** | `app/page.tsx` `Yours` (the Stream once `tonight-ui-plan` lands) |
| Is "an AI" | **as an experience, yes; as a system, no** | Tonight "has no model inside it" — the user's assistant is the intelligence, and Tonight's memory and skills shape it (README, *The architecture*). The page may say "an AI" only next to the sentence saying where it runs (*Today*), so it never suggests a standalone model |
| Messages you first, reminds you, checks in, or thinks about your next film between conversations | **no** | Neither skill nor the README has any proactive behaviour; Tonight answers when it is asked. **Vision only.** The hero, *Your next movie is already on my mind.*, is the user's chosen marketing line, and the user accepts it as evocative rather than literal. No other text on the page may state background activity literally (P-A3.2) |
| Remembers you *for years* | **no** | Privacy policy: everything is "intended to be kept until the closed beta ends", then deleted. **Not said anywhere, vision included** |
| Knows a new visitor's taste | **no** | "an empty model is normal for somebody new" (recommend skill, 200–201) |
| Brings up a film you turned down | **never** | recommend skill, 122–124: a turned-down film "is not offered again … and the turn-down is not brought up". The example must not do it either |

## Copy, and where it differs from the user's draft

| Element | User's draft | Planned | Why |
| --- | --- | --- | --- |
| Hero (h2, one sentence) | *Your next movie is already on my mind.* | ***Your next movie is already on my mind.*** — exactly, not substituted, softened or rewritten | **The user's decision** (revision 3). It is evocative marketing language, accepted by the user knowing the product is not proactive today. The page around it does two things: it adds **no further literal claim** of background processing (P-A3.2), and it **does not undercut the headline** — no disclaimer argues with it, and *Today* says what is available in positive terms. Revision 1's substitute, *Tell me about tonight. / I'll remember what you love.*, was rejected by the user and is not used |
| Support | *An AI that gets to know you, remembers what moves you, and makes every movie night better.* | *An AI that gets to know you, remembers what moves you, and helps make your movie nights better.* | Only the outcome is softened: "makes every … better" is a guarantee; "helps make … better" is what a recommendation can do |
| Central message | a personal Tonight message, e.g. about *Arrival* | see *The message* below, labelled as an example | — |
| Today / vision | "clearly vision/preview vs available today" | see *Today and next* below | — |
| Tagline, sign-in, footer | — | unchanged: *Movies That Get You.* in the shared header, *Sign in with Google*, *Closed beta.*, Privacy / Terms / Impressum | shared components; the user asked to keep the flows |

### The message (the centre of the page)

A `figure`, captioned as an example, holding one short exchange. **No input field, no send button,
nothing that looks typeable**, because the website has no chat:

> *Example, shortened: a reply in ChatGPT or Claude, with Tonight connected*
>
> **You** — Anything for tonight?
>
> **Tonight** — A surprise, from your Space Tension. You loved *Arrival* — "it trusts you to keep
> up," you said — so I'd start with *Moon*: one man, one station, and a quiet puzzle that rewards
> exactly that kind of attention.
>
> Or give me a mood and I'll aim closer.

Why each part is honest, against `skills/tonight-recommend/SKILL.md`:

- **It is a reply.** The visitor asks first. Nothing in it is sent unprompted.
- **"A surprise, from your Space Tension."** *"Anything for tonight?"* gives no mood, and for
  that case the skill says to make the evening's idea a pick from what they wrote and **say it is
  a surprise** — never that it is what they are in the mood for. It also says a Vibe is named only
  as the reason for a film (148–153), which is how the one Vibe appears here: in passing, as
  infrastructure. *Space Tension* is the README's own example Vibe.
- **"You loved Arrival — 'it trusts you to keep up,' you said"** shows a loved verdict quoted in
  the user's words, without being made stronger (125–127). A loved film is "a reason, not a
  suggestion" (177), so *Arrival* is the reason, not the pick. The quote belongs to an invented
  person; the caption says *Example*.
- **"I'd start with Moon"** names one lead, "named as such", with why it suits them, in one line
  about the film rather than a synopsis (155, 203–210). *Arrival* (2016) and *Moon* (2009) are
  real films. The line claims only what *Moon* is: one man, alone on a lunar base, a slow
  mystery.
- **"Or give me a mood and I'll aim closer."** is the skill's own closing question for a request
  with no mood (151).
- **"shortened"**: a full reply also carries two or three alternative suggestions after the lead
  (155–157). They are left out for length, and the caption says so rather than presenting a
  partial reply as the whole thing.
- **No turned-down film is mentioned** (122–124, 175–176). An earlier draft of this plan had *"not
  Interstellar — you asked me not to suggest it again"*; the skill forbids exactly that, so it is
  out.

### Today and next

A two-item definition list under the message:

- **Today, in closed beta** — *Tonight works inside the AI assistant you already use, like ChatGPT
  or Claude. Ask for a film, and it draws on what it keeps: your films, what you thought of them,
  your Vibes. Sign in to see your films and Vibes.*

  Revision 3 changes the middle sentence. Revision 2 said *"It answers when you ask, and keeps what
  you tell it"*, which, directly under the restored hero, read as a rebuttal of it. The new
  sentence states the same fact as a positive: today it works when you ask for a film, from what
  it keeps. It makes no claim of background activity, and it does not argue with the headline.
- **Where it's going** — *An AI that takes care of your movie nights, not only when you ask. Not
  available yet.*

"Takes care of your movie nights" is the user's own positioning, said where it is true: as the
direction, labelled *Not available yet*. Vibes and films appear only here, as what Tonight keeps,
which makes them the infrastructure and not the headline. *Sign in to see your films and Vibes*
claims only what the signed-in page shows. Evenings are kept but not shown on the website, so the
sentence does not say "everything".

## The page, top to bottom

1. **Header, unchanged.** `<SiteHeader><SignIn /></SiteHeader>`.
2. **Hero.** `<section aria-labelledby="landing-promise">`: `h2#landing-promise`, `font-display`,
   `text-[32px] sm:text-[44px] leading-[1.1] text-balance`, holding the one sentence *Your next
   movie is already on my mind.* as plain text — no spans, no forced break; `text-balance` keeps
   the wrap even on narrow screens. Then the support line, `p`, `mt-5 text-[16px]
   leading-relaxed text-ink-soft`.
3. **The message.** `<figure aria-labelledby="landing-example">`, in the card style Part 1 used
   (`mt-10 sm:mt-14 rounded-2xl border border-rule bg-screen p-6 sm:p-8`).
   `figcaption#landing-example` in `text-[12.5px] text-ink-soft`. The exchange is a `dl`: `dt`
   *You* / *Tonight* and `dd` text, the pattern the old carousel used for its turns. *You* is
   `ink-soft`, *Tonight* `text-beam`. Not `ink-faint`: on `screen` it measures 3.37:1, below
   WCAG 1.4.3's 4.5:1 for text this size, and the caption carries essential context (that this is
   an example, and where it happens). Amber stays the landing page's accent, so the `beam`
   comment in `tonight-ui-plan`'s `globals.css` stays true. The Tonight reply is in
   `font-display text-[21px] sm:text-[24px] leading-snug text-ink`, and the closing question in
   `text-[14px] text-ink-soft`.
4. **Today and next.** `<section aria-label="Today, and where Tonight is going">` holding a `dl`.
   Each `dt` is `text-[12.5px] uppercase tracking-[0.11em] text-ink-soft`, each `dd` is
   `text-[15px] leading-relaxed text-ink-soft`. Stacked on mobile, `sm:grid sm:grid-cols-2
   sm:gap-8` from `sm`.
5. **Footer, unchanged.** *Closed beta.* and `<LegalLinks />`.

Server-rendered, static, no client code of its own, no animation, no image. One `h1` (the
header's), one `h2` (the hero). The message is named by its caption, and the last section by its
label.

## Exact files

| File | Change |
| --- | --- |
| `web/app/page.tsx` | `Landing` only: its doc comment and its content between `</SiteHeader>` and the footer comment, as above. No import changes: `SiteHeader`, `SignIn` and `LegalLinks` are already imported, and nothing new is needed. `Home`, `resolveVisitor`, `Yours`, `readTaste`, `report` and the footer are unchanged |
| `web/lib/web/landing.test.ts` | Updated for the new copy and structure; see P-A3 |
| `docs/work/landing/PLAN.md` | This part, then its *Implementation* section |

**Not touched:** `globals.css`, `layout.tsx`, `site-header.tsx`, `legal.tsx`, sign-in / OAuth /
session code, `next.config.ts`, the legal pages, the README, the plugin manifest, skills, MCP. No
new component file and no new dependency. The page is about 70 lines of JSX, inline in `Landing`
as Part 1's was.

## Traps (Part 1's still apply)

- `app/page.tsx` must not contain the text `params` (`signin.test.ts`).
- No `<form>`, `<input>`, `<textarea>` or `<button>` in `Landing`: the only control is `SignIn`,
  inside `SiteHeader`. A message that looks like a chat box invites typing into a website that
  cannot answer.
- No `"use client"`, hook or handler in `page.tsx`.
- The example may quote invented words, but only inside the captioned example. The hero and
  *Today* say nothing about any particular person.

## Integration with `tonight-ui-plan` (rebase, at the user's request)

The UI work is now committed on its own branch at `06681d8` (*UI redesign: a film-centred
Stream…*), but it is not on `origin/main`, which is still `3655dc2`. Read-only check on
2026-10-25 (`git -C ../tonight-ui-plan diff origin/main -- web/app/page.tsx`; a plain `diff` shows
nothing now that the work is committed): its hunks are the import block (lines 1–12), the module
comment, `resolveVisitor` removed, and `Yours` onward (from line 112 of `main`). **`Landing` is
untouched**, and it still imports `WorkedExamples`.
Part 2 changes nothing outside `Landing`, and Part 1's only change outside it is the deleted import
line. So the conflict is still exactly one, in the import block.

The order, when the user asks for it:

1. `tonight-ui-plan` merges to `main` separately.
2. This work is committed on `tonight-landing-plan`, with the user's approval. A rebase needs a
   commit. The shared stash is not an option and `git pull --rebase --autostash` is not used,
   because it stashes through the shared stack.
3. `git fetch && git rebase origin/main`. Conflict in the `page.tsx` import block → keep
   `origin/main`'s block and delete `import { WorkedExamples } from "@/components/worked-examples";`.
   `Landing` and `Yours` apply without conflict, since their hunks do not touch each other.
   `git rebase --continue`.
4. Re-run P-A1–P-A4 on the rebased tree, then `grep -rn "worked-examples\|WorkedExamples" web/
   --exclude-dir=node_modules --exclude-dir=.next --exclude=landing.test.ts` → nothing.

Nothing is synchronised ahead of time: no copying from, reading into or writing to the UI
worktree, and no rebase until `origin/main` has it.

## Steps

0. Re-check `origin/main` (`git fetch`). If `tonight-ui-plan` has landed, stop and ask the user
   about committing and rebasing first. Record `npm run test` / `typecheck` / `lint` on the
   working tree as it is (expected: Part 1's 1339 tests, 1335 pass, the 4 known failures).
1. Edit `Landing` and `landing.test.ts` together; neither is green without the other.
2. P-A1–P-A3; P-A4 as far as this session can; record the results in Part 2's *Implementation*.

## Acceptance tests

### P-A1. Repository checks (`web/`)

- `npm run test`: Part 1's count adjusted by the change in `landing.test.ts`'s test count; the
  same 4 known `evaluation.test.ts` failures and no others. `signin.test.ts` and
  `readonly.test.ts` pass without edits.
- `npm run typecheck` clean; `npm run lint` 0 errors, and no warning in a changed file.
- `npm run build` succeeds; `/` stays `ƒ`.

### P-A2. Diff

`git diff --stat origin/main` lists only `web/app/page.tsx` and Part 1's three deletions.
`git status --short` additionally shows only the untracked `web/lib/web/landing.test.ts` and
`docs/work/landing/`. `diff --stat` cannot list untracked files, so both commands are needed.

### P-A3. `web/lib/web/landing.test.ts`

Scoped to the `Landing` function's source, as now:

1. **Approved words:** the hero exactly — *Your next movie is already on my mind.* — inside
   `h2#landing-promise`, the support line, the caption (*Example, shortened: …*), *Anything for
   tonight?*, the reply and *Or give me a mood and I'll aim closer.* (whitespace collapsed), the
   *Today* sentences, *Where it's going* and *Not available yet*.
2. **No further literal claims:** with JS and JSX comments stripped and the one approved hero
   sentence removed once, the rest of `Landing` matches none of
   `/on my mind|already know|before you ask|in the background|between (our )?conversations|while you|remind|notification|check(s|ing)? in|for years|every movie night|saves? nothing|nothing is saved|unless you say so/i`.
   So the headline is the only place that evokes Tonight thinking ahead, and nothing else on the
   page says it literally. `on my mind` stays in the pattern so the phrase cannot appear a second
   time.
3. **The example is an example:** a `figure` whose `figcaption` starts with *Example*, and the
   reply sits inside that figure.
4. **Structure:** no `h1`, exactly one `h2`; every `aria-labelledby` names an `id` that exists; no
   `<form`, `<input`, `<textarea` or `<button` in `Landing`. **Contrast guard:** `text-ink-faint`
   appears in `Landing` exactly once, on the footer's existing *Closed beta.* line, so no new text
   is set in the token that fails 4.5:1.
5. **Kept:** `<SiteHeader>` contains `<SignIn />`; `<LegalLinks />` and *Closed beta.* are present;
   the tagline is in `site-header.tsx`.
6. **Gone (Part 1):** the three `worked-examples` files do not exist, nothing but this test
   mentions them, and `page.tsx` has no `ChatGPT`-carousel leftovers (`conversation →`,
   `aria-roledescription`, `aria-live`, `"use client"`). *ChatGPT* itself is now allowed: the
   caption and *Today* name it.

### P-A4. In a browser (`npm run dev`, real `web/.env.local`)

Signed out:

1. The HTML contains every P-A3.1 string, *Sign in with Google*, *Closed beta.* and the three legal
   hrefs. With the approved hero sentence removed once, as in P-A3.2, it contains none of
   P-A3.2's phrases.
2. At 320, 375, 414, 768 and 1280 px: no horizontal scroll; the hero may wrap to three lines at 320
   but nothing overflows. At 375 × 667 the hero and the example's caption (*…a reply in ChatGPT
   or Claude, with Tonight connected*) are visible without scrolling, so "An AI" is never on screen
   without where it runs. *Today* and *Where it's going* stack on mobile and sit side by side from
   `sm`.
   Screenshots at 375 and 1280.
3. At 200% zoom and with text-only zoom: nothing is clipped.
4. Keyboard: *Sign in with Google*, then the four legal links, and nothing else is focusable.
   Nothing in the message looks focusable or typeable.
5. VoiceOver: headings are *Tonight* (h1) and *Your next movie is already on my mind.* (h2); the figure is
   announced with its *Example* caption; *You* / *Tonight* are read as the terms of the list.
6. Contrast (WCAG 2.x formula, theme tokens): `ink` on `screen` 15.6:1, `ink-soft` on `screen`
   6.75:1 and on `night` 7.23:1, `beam` on `screen` 8.51:1. **No new text uses `ink-faint`**
   (3.37:1 on `screen`). The footer's existing *Closed beta.* and legal links and the header
   tagline do use `ink-faint` on `night` (about 3.6:1). That is pre-existing, in shared or
   unchanged markup, and outside this scope; it is recorded as a follow-up, not fixed or worsened
   here.
7. Sign-in: the full round trip with an address on `ALLOWED_EMAILS` reaches the signed-in page,
   unchanged; sign-out returns here; an address not on the list gets the existing refusal.

Items 2–7 need a browser and the real OAuth client. This session has neither (Part 1), so they
are handed to the user with the implementation report; implementation READY waits for them, as
Part 1's did.

## Risks

| Risk | Mitigation |
| --- | --- |
| The page promises proactivity or longevity the product lacks | The hero is the user's accepted evocative line. Everything else is held to *What Tonight can and cannot say*: the vision is labelled *Not available yet*, and P-A3.2 fails on any further literal claim and on `on my mind` appearing a second time |
| "An AI" read as Tonight running its own model | *Today* says it works inside your assistant, in the same view; Claims row |
| The example read as real user data or as a website chat | `figcaption` *Example: a reply in ChatGPT or Claude…*; no input-like elements (P-A3.4) |
| The example teaching behaviour the skill forbids | Built line by line from the skill (122–127, 148–157, 175–177, 203–215); the turn-down line removed; captioned *shortened* because the alternative suggestions are left out |
| Conflict with `tonight-ui-plan` | One import-block conflict, resolution written down; rebase only after both are ready |
| The meta description, README and plugin text still use the older positioning | Still true; left for a follow-up after both branches land (Part 1, open question 2) |

## Open questions for the user

1. **Hero — decided by the user (revision 3):** *Your next movie is already on my mind.*, exactly.
   Not open.
2. **The vision line.** *An AI that takes care of your movie nights, not only when you ask. Not
   available yet.* states an intent. Remove it if you would rather the page say only what is true
   today.
3. **The example's films and words.** *Space Tension*, *Arrival* → *Moon*, and the quote *"it
   trusts you to keep up"* are illustrative and can be swapped. Any replacement should still be a
   reply, follow the skill's shape for the request it shows, quote without making the words
   stronger, name one lead, and mention no turned-down film.
4. **Follow-up, not in this scope:** the shared header's tagline and the footer's *Closed beta.*
   and legal links are `ink-faint` on `night`, about 3.6:1, which is below 4.5:1. They are
   pre-existing, shared with the signed-in page and the legal pages, and unchanged here. A
   one-token fix belongs in its own change after `tonight-ui-plan` lands, because that branch also
   renders them.

## Revisions (Part 2)

- **Revision 2 (Codex plan review round 1: NOT READY, one blocker).** Blocker: the example's
  caption and *You* label were planned in `ink-faint`, 3.37:1 on `screen`, below WCAG 1.4.3.
  **Fixed:** both are now `ink-soft` (6.75:1); P-A4.6 lists the measured ratios; P-A3.4 guards
  that `ink-faint` appears in `Landing` only on the existing footer line. Non-blocking notes
  adopted:
  - the caption that says where Tonight runs must be visible together with the hero at
    375 × 667 (P-A4.2);
  - *Integration* now records that the UI work is committed at `06681d8` on its own branch and
    not on `origin/main`, and inspects it with `diff origin/main`;
  - P-A2 checks untracked files with `git status --short`.

  Also corrected: `beam` on `screen` is 8.51:1, not about 7.7:1 (Part 1's A4.6 too). The
  pre-existing `ink-faint` footer and tagline contrast is recorded as open question 4, not
  changed.
- **Codex plan review round 2: READY.** The contrast blocker is resolved, and the revised
  acceptance checks and integration instructions address the earlier notes. Non-blocking:
  implementation READY needs P-A4 (browser, accessibility, OAuth, screenshots); the shared-text
  contrast remains a follow-up.
- **Revision 3 (user decision, after READY).** The user rejected the substitute hero. The hero is
  now exactly *Your next movie is already on my mind.*, which the user accepts as evocative
  marketing language for a product that is not proactive today. What changes with it:
  - the copy table and the claims row record this as the user's decision;
  - the hero is one plain sentence in the `h2` with `text-balance`, instead of two block spans;
  - the *Today* middle sentence becomes *"Ask for a film, and it draws on what it keeps"*,
    instead of *"It answers when you ask, and keeps what you tell it"*. Same fact, but no longer
    a rebuttal directly under the headline;
  - P-A3.1 pins the exact hero. P-A3.2 removes the approved hero sentence once and then fails on
    any further literal claim of background activity (adding *in the background*, *between
    conversations*, *while you*) and on `on my mind` appearing anywhere else;
  - P-A4.2 and P-A4.5 refer to the one-sentence hero; the risk row and open question 1 are updated.

  Nothing else changes: the support line, the example, the vision line, the files, the scope and
  the integration are as in revision 2.
- **Codex plan review round 3 (targeted): READY.** The headline decision is carried out
  consistently. Its one non-blocking note is adopted: P-A4.1's HTML check applies the same
  one-time hero exemption as P-A3.2.

## Implementation (Part 2)

Implemented right after the round-3 READY, as the user instructed. Uncommitted, on
`tonight-landing-plan`, which is still at `3655dc2` with Part 1's changes in the working tree.
Nothing is committed, pushed, merged or deployed.

**`origin/main` moved during implementation.** `git fetch` at step 0 showed `5f53947` (*Merge pull
request #14 from vicox/tonight-ui-plan*): the UI work has landed. The plan's step 0 said to stop
and ask about committing and rebasing in that case. The user had already decided it, though:
implement now, and rebase onto `origin/main` later, which needs a commit the user has not yet
approved. So the branch was not moved, nothing was stashed, and nothing from `origin/main` was
brought into the working tree. Instead, read-only checks confirm the rebase is still the planned
one:

- `git diff 3655dc2 origin/main -- web/app/page.tsx` has the same four hunks as the UI branch had:
  the import block (still containing `import { WorkedExamples } …`), the module comment,
  `resolveVisitor` removed, and `Yours` onward. **`Landing` is unchanged on `origin/main`.**
- `site-header.tsx`, `legal.tsx` and `layout.tsx` are unchanged on `origin/main`. `globals.css`,
  `readonly.test.ts` and `signin.test.ts` changed, but not in anything `Landing` or
  `landing.test.ts` depends on.
- `origin/main` still has the three `worked-examples` files. The rebase keeps this branch's
  deletions, since the UI branch did not modify them.

**Changes:**

- `web/app/page.tsx`, `Landing` only:
  - doc comment updated;
  - the hero `h2#landing-promise` is exactly *Your next movie is already on my mind.* (plain text,
    `text-balance`), followed by the support line;
  - the example `figure` (caption in `ink-soft`, a `dl` with *You* in `ink-soft` and *Tonight* in
    `beam`, the reply and the closing question);
  - the *Today* / *Where it's going* `dl` in a labelled `section`.

  Footer, `Home`, `Yours` and everything else in the file are unchanged.
- `web/lib/web/landing.test.ts` rewritten to P-A3, with 6 tests:
  1. the approved words, with the headline pinned inside the `h2`;
  2. the headline exactly once, then none of P-A3.2's phrases in the rest, with comments
     stripped;
  3. the example in a `figure` captioned *Example,*, and no `form`, `input`, `textarea` or
     `button`;
  4. one `h2` and no `h1`, labels resolving to ids, and `text-ink-faint` only on *Closed beta.*;
  5. sign-in in the header, the legal links, the tagline;
  6. the `worked-examples` files gone and unmentioned, and no slideshow leftovers.

**Results:**

| Check | Result |
| --- | --- |
| P-A1 `npm run test` | **1341 tests, 1337 pass** (Part 1's 1339 − its 4 landing tests + 6 new); the same 4 known `evaluation.test.ts` failures and no others |
| P-A1 `typecheck` / `lint` / `build` | clean / 0 errors, the same 2 existing warnings in files not touched here / succeeds, `/` is `ƒ` |
| P-A2 | `git diff --stat HEAD`: `page.tsx` and Part 1's three deletions. `git status --short` adds only the untracked `landing.test.ts` and `docs/work/landing/`. Against `HEAD` (`3655dc2`), because `origin/main` now includes the UI merge and its diff would list that too |
| P-A3 | 6 / 6 pass |
| P-A4.1 (dev server, throwaway `.env.local`, removed afterwards) | 200. Every P-A3.1 string, *Sign in with Google*, *Movies That Get You.*, *Closed beta.*, the three legal hrefs and `action="/auth/signin"` are present. The headline appears **once in the rendered markup**; a second copy sits only in Next's serialized React payload (`self.__next_f.push` in a `<script>`), which is not displayed. With the headline removed once, the markup outside scripts has none of P-A3.2's phrases, nor *Popcorn Chaos*, `carousel` or `aria-live`. One `h1`, one `h2`, one `figure`, one form (sign-in), no `input` or `textarea` |
| P-A4.7, as far as possible here | `POST /auth/signin` same-origin: 302 to `accounts.google.com` with `redirect_uri=…/auth/callback` and a cookie set; cross-origin: 403. Legal pages 200 and linked |
| P-A4.2–P-A4.7 in a browser, the full OAuth round trip, screenshots | **Not run:** no browser and no real Google client in this session. They are the user's manual checks, and implementation READY waits for them, as Codex required for Part 1 |

**Codex implementation review (Part 2), round 1: NOT READY, with no code blocker.**

- Blocker 1 (verification): P-A4.2–P-A4.7 and the screenshots must be done **on the final
  rebased tree** before implementation READY. **Open.** Closing it needs the user's commit
  approval (for the rebase), a browser, and the real Google OAuth client. None of them is
  available in this session.
- Non-blocking: the exact headline, the example, the Today / vision split and the contrast
  changes match the plan. Codex independently ran the related tests (50 / 50), typecheck,
  changed-file lint and a whitespace check on the diff. The planned import resolution matches
  `origin/main` at `5f53947`; re-run the automated checks after the rebase.

**Commit and rebase (done, with the user's approval).** One commit on `tonight-landing-plan`,
holding only the landing changes and this plan. It was rebased onto `origin/main` at `5f53947`
(the `tonight-ui-plan` merge). Not pushed, merged or deployed.

`page.tsx` had **two** conflicts, not the one planned:

1. **The import block, as planned.** Kept `origin/main`'s block (`SignedIn`, `Unavailable`,
   `SiteHeader`, `SignIn`, `StreamView`, `readHeld`, `resolveVisitor`, `SignedInVisitor`) and
   deleted `import { WorkedExamples } …`.
2. **An adjacent hunk, not foreseen.** `origin/main` moved `resolveVisitor` and its doc comment to
   `lib/web/held.ts`, and that block sat directly above `Landing`'s doc comment, which this branch
   rewrote. Resolved by keeping `origin/main`'s removal and this branch's new `Landing` comment.

After resolving, `git diff origin/main -- web/app/page.tsx` is exactly the change made before
the rebase (+77 / −27: the import line, `Landing`'s comment and content). `Home`, `Yours` and the
Stream wiring are `origin/main`'s, untouched.

**Checks on the rebased tree:**

| Check | Result |
| --- | --- |
| `npm run test` | **1301 tests, 1297 pass**, the same 4 known `evaluation.test.ts` failures. This equals `origin/main`'s own recorded 1301 / 1297 (UI plan, final run): −6 slideshow tests, +6 landing tests |
| `typecheck` / `lint` | clean / 0 errors, the same 2 existing warnings |
| `build` | succeeds; `/` is `ƒ`; the UI's `/movie`, `/movie/choose` and `/vibe` are present |
| leftovers | `git grep worked-examples\|WorkedExamples\|WORKED_EXAMPLES -- web` (excluding `landing.test.ts`): nothing. `package.json` and the lockfile are unchanged by the merge, so no reinstall was needed |

**Local preview, for the user's visual inspection.** A dev server at `http://localhost:3081`,
bound to `127.0.0.1` only. Production `next start` refuses to run without `DATABASE_URL`
(`lib/db.ts`), so a dev server with the embedded database is the isolated option. Configuration
is a throwaway, gitignored `web/.env.local`: `PUBLIC_ORIGIN=http://localhost:3081`, a
non-existent Google client and placeholder legal details. No `DATABASE_URL` or
`DEV_DATABASE_DIR` is set, so the database is in memory and disappears when the server stops.
Smoke checks:

- `/` is 200 on `localhost` and `127.0.0.1`, with the headline once in the rendered markup, the
  example, *Today* and *Sign in with Google*;
- `POST /auth/signin` returns 302 to `accounts.google.com`;
- the legal pages are 200;
- signed out, `/vibe` and `/movie` return 307 to `/`.

Signing in is **not possible** with this configuration: Google rejects the placeholder client. A
real sign-in needs a real Google client with `http://localhost:3081/auth/callback` as an
authorised redirect URI, and the user's address in `ALLOWED_EMAILS`.

**Still open for implementation READY:** P-A4.2–P-A4.7 and the screenshots, on this tree, then
Codex's implementation review.
