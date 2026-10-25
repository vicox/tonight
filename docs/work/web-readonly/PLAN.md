# Website read-only: plan

Status: **Codex plan review: READY (round 3).** Rounds 1 and 2 were each NOT READY with one
blocker, and both are fixed here:

- Round 1: the privacy page's "Deleting your data" paragraph.
- Round 2: the curl smoke check asserted marks, which only render inside dialogs.

**Implemented** (see *Implementation* at the end) and committed on this branch. Awaiting the
Codex implementation review. Nothing is pushed, merged or deployed.

- Ticket / branch / worktree: `tonight-web-readonly`, based on `main` at `f3912b0`.
- Baseline at the base: 1347 tests, 1343 pass. The 4 failures are the known
  `lib/evaluation.test.ts` ones, which read gitignored evaluation `results/` directories that a
  worktree does not have.

## Scope (from the user)

Make the website **read-only for every persisted user-data mutation**: movies (viewing status),
verdicts, vibes, genres, episodes, and anything else. Keep all reading and navigation. Leave MCP
routes and every agent write exactly as they are. A browser must not be able to get a write
through by calling an endpoint directly. Use the smallest robust route isolation.

**Out of scope:** UI redesign, Vibe Evolution, schema or migration changes, new infrastructure
(no middleware/proxy, no feature flag), MCP tools, skills, and the ChatGPT plugin.

## Audit: every write the website can make today

| # | Surface | Route / code | What it writes | Called from |
| - | --- | --- | --- | --- |
| W1 | Viewing mark | `PATCH /api/movies` → `store.updateMovie` | `viewing` of a film | `components/movie-mark.tsx` (`VIEWING`), on every film row |
| W2 | Judgement mark | `PATCH /api/verdicts` → `verdicts.say` | verdict / withdrawal act | `movie-mark.tsx` (`JUDGEMENT`), on every film row |
| W3 | Delete genre | `DELETE /api/genres/[name]` → `deleteGenre` | removes a genre | `components/manage.tsx` via `lib/web/manage.ts`, in a genre's dialog |
| W4 | Delete vibe | `DELETE /api/vibes/[name]` → `deleteVibe` | removes a vibe | same, in a vibe's dialog |
| W5 | Rename / rewrite genre | `PATCH /api/genres/[name]` → `updateGenre` | genre | **no UI**, reachable by calling it directly |
| W6 | Change vibe | `PATCH /api/vibes/[name]` → `updateVibe` | vibe | **no UI**, direct call only |
| W7 | Create genre | `POST /api/genres` → `createGenre` | genre | **no UI**, direct call only |
| W8 | Create vibe | `POST /api/vibes` → `createVibe` | vibe, and saves its core film | **no UI**, direct call only |

All eight go through one boundary, `lib/web/api.ts` (`authorized`: origin, CSRF, session cookie,
then a store bound to the user). Nothing else on the site writes user data:

- **Episodes:** the website never writes one. Episodes are written only by the MCP tools.
- **No server actions** (no `"use server"` anywhere) and **no other client `fetch`**: the only
  other calls are the two marks and `manage.ts`.
- **Forms:** only sign-in and sign-out (`components/site-header.tsx`), plus the OAuth consent
  page that `lib/oauth/consent.ts` renders for MCP clients.
- **Page render** (`app/page.tsx`) only reads (`taste()`, `standing()`). **In production**, opening
  a store writes nothing: `prepareSchema` only checks the schema version and refuses on a
  mismatch. Outside production it runs pending migrations, which include data backfills. That is
  deployment tooling, not a website action, and it is left alone.

### Mutating routes that stay, and why

| Route | Writes | Why it stays |
| --- | --- | --- |
| `POST /auth/signin`, `GET /auth/callback`, `POST /auth/signout` | the browser's pending-login / session rows, and the sign-in rate-limit counter (`lib/web/signin.ts:86`, `consumeRateLimit`) | Authentication. The read-only page cannot be reached without a session. No taste, verdict or episode data is touched. |
| session lookup in `lib/web/session.ts` | deletes a session whose address left the access list | Access control, not user data. |
| `/mcp` (POST/GET/DELETE), `/oauth/{authorize,register,token,callback}`, `/.well-known/*` | MCP sessions, OAuth clients/codes, and all agent writes | Shared MCP / agent surface. Must stay unchanged. It authenticates with bearer tokens; a website cookie grants nothing there. |

## Decisions

**D1 — Route isolation: delete the website write routes. Do not guard them.**
Delete the whole `web/app/api/` tree (the six `route.ts` files behind W1–W8). Next.js routes by
file, so with no handler every method on those paths returns 404. There is nothing left to
bypass, and nothing has to be kept correct. A middleware/proxy that refuses mutating methods
would add infrastructure to guard code that has no caller anymore. `/mcp` and `/oauth` live
outside `/api` and are not touched.

**D2 — Delete the website write boundary.** `lib/web/api.ts` (`authorized`, `given`) has no
callers once D1 is done, so it is removed. `crossSite` stays in `lib/web/signin.ts`, because
sign-in and sign-out still use it.

**D3 — Marks become read-only indicators. Same place, same icon, same look.**
`components/movie-mark.tsx` keeps `MovieMark`, `VIEWING` and `JUDGEMENT`, and rows render it the
same way (`<MovieMark mark={…} value={…} title={…} year={…} />`). What changes:

- It draws the current answer's icon in the same `size-7` box with the same said/unsaid colours.
  It is no longer a button: it becomes a `<span role="img">` with the existing accessible label
  (`${asks} ${title} (${year}): ${label}`) and a `title` tooltip with the answer's label. The
  tooltip is the one small addition, so a sighted user can still find out what the icon means
  now that the menu is gone.
- Removed: the menu, keyboard handling, `fetch`, `router.refresh`, the pending/problem state, the
  hooks, and `"use client"`. The component no longer has any client behaviour, so it renders on
  either side of the boundary.
- The `Mark` type loses `endpoint` and `field`. `choices` stay, as the icon and label vocabulary
  for each value.
- `lib/web/pending.ts` and its test are deleted. The mark's in-flight state was their only
  caller.

**D4 — Delete removal of genres and vibes from the UI.**
- Delete `components/manage.tsx`, `lib/web/manage.ts` and `lib/web/manage.test.ts`.
- Remove `<Manage>` from the header of the genre dialog (`genre-labels.tsx`, `Meaning`) and of the
  vibe dialog (`vibe-cards.tsx`, `Detail`). The `×` stays where it is.
- Remove the `onRemoved` prop and the `removed` ref, which only existed to tell a delete apart
  from a dismissal. Focus-on-close (`returnTo`, `rescueTo`, `fallbackTo`) is otherwise left as it
  is.

**D5 — Remove the dialog's focus tracking for pressed marks.**
`components/chosen.tsx` tracks which mark had focus (`MARK = '[aria-haspopup="menu"]'`,
`marked`, `onFocusCapture`, and the `refocus` effect) only so it can recover when a mark press
moves a film out of the open list. With read-only marks nothing can do that, and the selector
would match nothing, so all of it is removed. That leaves `refocus()` in `lib/web/refocus.ts`
with no caller: it is removed together with its cases in `refocus.test.ts`. `returnTo`,
`rescueTo` and `fallbackTo` stay.

**D6 — Comments.**
- In the files this change touches, comments that describe website writes are reworded to what
  is true now (for example `movie-row.tsx`: "the things on this page that can be changed").
- Comments elsewhere that point at a deleted file are repointed. Those are `taste-view.tsx:67`,
  `section.tsx:33`, `movie-summary.tsx:90`, `genre-labels.tsx:36` and `signin.ts:314`, plus the
  stale `movie-state.tsx` references in `chosen.tsx` and `vibe-cards.tsx`.
- The explanation in `manage.tsx` of why `showModal()` needs no hand-written modal code is the
  one other files point to. It moves, shortened, onto `Chosen` in `chosen.tsx`, the shared films
  dialog, and the references point there instead.
- Nothing else in untouched files changes.

**D7 — Public copy that would become false is corrected, minimally.**
- `app/terms/page.tsx`, *Ending it*: say that genres, vibes and films (where a film stands, and
  what you thought of it) are changed or deleted through your assistant, not on the website. The
  sentence about the deletion rule stays.
- `app/privacy/page.tsx`:
  - Scope paragraph (around line 43): drop "the endpoints that page writes through under
    `/api`".
  - "Nothing you do changes your taste model…" (around line 238): change "by you on this website,
    or by an assistant you have asked" to changes made through an assistant you have asked.
  - **"Deleting your data" (around lines 508–514):**
    - Vibes are deleted "through your assistant", not "on this website or through your
      assistant".
    - Where a film stands, and what you thought of it, are said through your assistant, not on
      the signed-in page.
    - The deletion semantics are kept word for word: the genre/vibe rule, and "removing a film
      removes everything you said about it… including ones you replaced or took back".
    - The account-deletion contact and the timing are unchanged.
- `lib/legal.ts`: set `LEGAL_UPDATED` to `25 October 2026`, because what the website lets you do
  is a change in substance. **The operator must approve the legal wording before merge.**
- `README.md`, *The website*: the site shows the model and does not edit it, and every change is
  made through an assistant. In *Self-service account deletion*, drop "a user can delete their
  own Genres and Vibes" as a website capability. The sentence pinned by `disclosures.test.ts`
  ("the website is a view of it, not the definition of it") is kept.
- **Deliberately not changed:** `skills/tonight-recommend/SKILL.md:381` ("The website is *a*
  management surface, not *the* one"). It is agent instruction, pinned by
  `recommend-skill.test.ts` and `skills/tonight-recommend/test.sh`. What it tells the agent to do
  (make the change in the conversation, and don't send the user to the website) is still right.
  Flagged for the coordinator as a follow-up skill edit.

## Tests

- **Deleted, along with what they test:** `lib/web/routes.test.ts` (the `/api` routes),
  `lib/web/manage.test.ts`, `lib/web/pending.test.ts`, and the `refocus()` cases in
  `lib/web/refocus.test.ts`.
- **New `lib/web/readonly.test.ts`** (a structural guard, in the existing source-contract style):
  1. `app/api/` does not exist.
  2. Every `route.ts` under `app/` is walked and each exported `POST`/`PUT`/`PATCH`/`DELETE` is
     collected. The set must equal the allowlist: `auth/signin POST`, `auth/signout POST`,
     `mcp POST`, `mcp DELETE`, `oauth/authorize POST`, `oauth/register POST`, `oauth/token POST`.
     A new website write route fails this test.
  3. No `"use server"` directive anywhere in `app/`, `components/` or `lib/` (so no server
     actions).
  4. No `fetch(` and no `router.refresh` in `components/`.
  5. `<form` appears only in `site-header.tsx`, and its actions are `/auth/signin` and
     `/auth/signout`.
  6. Website page and component code (`app/**/page.tsx`, `components/**`) never calls a store
     mutator: `create*` / `update*` / `delete*` of Genre, Vibe and Movie, `say`, `forget`,
     `record`, `addRound`, `correct`.
- **Updated `lib/web/overview.test.ts`:**
  - Drop the assertions that pin the write UI: mark menu semantics and keyboard, "a mark writes
    through the one route boundary", the overflow menu, Delete-confirm, the `removed` / `gone`
    focus wiring, and the `MARK` refocus wiring in `Chosen`.
  - Replace them with read-only mark assertions: the current icon is drawn, the accessible label
    and tooltip are present, and there is no `<button`, `role="menu"`, `fetch`, hook or
    `"use client"`.
  - Keep the vocabulary and icon tests (minus `endpoint`/`field`), and keep the focus-on-close
    tests (minus `removed`).
  - Extend "no management section" so it asserts that `manage.tsx` is gone.
- **Unchanged:** the MCP suites (`lib/mcp/*.test.ts`) and the store suites still cover every
  agent write. They are the evidence that agent writes are intact.

## Verification

1. `npm test`: everything passes except the 4 known evaluation failures.
   `npm run typecheck`, `npm run lint` and `npm run build` are clean.
2. Against `npm run dev`, with curl:
   - `POST /api/genres`, `PATCH /api/movies`, `PATCH /api/verdicts` and
     `DELETE /api/vibes/x` each return 404, with and without a session cookie.
   - `GET /` still renders the landing page.
   - `POST /mcp` without a token still answers 401 with its `WWW-Authenticate` challenge, as it
     does on `main`.
3. **Signed-in smoke check:**
   - **Setup:** a scratch `DEV_DATABASE_DIR` inside the worktree (gitignored, deleted afterwards).
     A small one-off script, using only the existing store APIs and run before `next dev` starts,
     creates a user with two genres, a vibe, films carrying each viewing and a verdict, and a web
     session. `ALLOWED_EMAILS` names that user.
   - **What `GET /` with that cookie must show:** the films summary counts, the genre labels and
     the vibe cards. Film rows, and so the marks, render only inside a dialog, and every dialog
     starts closed, so curl asserts nothing about marks or menus.
   - **Marks and the absence of menus or `Manage`** are covered by the source-contract tests
     (`overview.test.ts` and `readonly.test.ts`). In a browser they are covered by the
     opened-dialog check below.
   - **Opened dialogs** (summary, genre and vibe), their read-only marks and labels, the absence
     of any menu or `Manage` trigger, and focus restoration are browser-only. If no browser
     automation is available in this environment, they are reported as not run and handed to the
     coordinator as a manual check. They are not claimed as done.
4. `git diff --stat main` touches only `web/app/api/**` (deleted), the files named above, the
   legal pages, `README.md` and this plan. It touches no schema, migration, MCP, skill or plugin
   file.

## Delivery

One commit on `tonight-web-readonly`, then a distinct Codex implementation review, fixing
blockers until READY. No push, merge or deploy without the coordinator.

## Implementation

D1–D7 were implemented as written. Four small consequences were not spelled out in the plan:

- **`components/way-out.tsx`**: its optional `ref` prop is gone. It existed only so `Chosen`
  could hand focus to the `×` as the fallback for the mark-refocus that D5 removed. The header
  comment that mentioned the `…` beside it was reworded.
- **`lib/web/refocus.test.ts`**:
  - The `closing` helper loses its `removed` argument, so it matches the components'
    composition after D4.
  - The "deleting …" cases are now "… has gone" cases (the invoker is no longer present), with
    the same expected focus targets.
- **`lib/web/disclosures.test.ts`**: it pinned the old D7 sentences ("the website lets you…",
  "can be set there"). It now pins the new assistant-only wording, and checks that each old
  claim is absent.
- **Comments** in the touched files were reworded where they described a mark press or delete
  (D6).

### Verification results

1. **Tests and build:**
   - `npm test`: 1306 tests, 1302 pass. The 4 failures are the known `lib/evaluation.test.ts`
     ones, the same as at baseline.
   - `npm run typecheck` is clean.
   - `npm run lint`: 0 errors. The 2 warnings are pre-existing, in untouched test files.
   - `npm run build` succeeds, and its route table has no `/api/*` route.
   - The new guard was checked by temporarily restoring `app/api/movies/route.ts`: 3 of its 7
     tests failed. The file was then removed again.
2. **`next dev` with curl:**
   - `POST /api/genres`, `PATCH|DELETE /api/genres/Sci-Fi`, `POST /api/vibes`,
     `PATCH|DELETE /api/vibes/Space%20Tension`, `PATCH /api/movies`, `PATCH /api/verdicts` and
     `GET /api/movies` all return 404, both anonymous and with a valid session cookie.
   - `GET /` (anonymous) returns 200 with the landing page.
   - `POST /mcp` with no token returns 401 with
     `Bearer error="invalid_token" … resource_metadata=…`.
3. **Signed-in smoke check:**
   - `GET /` with the seeded cookie returned 200 and showed the account, "Your movies" with its
     counts, the genre labels `Sci-Fi` and `Slow Burn`, the `Space Tension` vibe card, and the
     "other movies" line.
   - It contained no `Manage` trigger, no `aria-haspopup="menu"` and no `Delete`.
   - The scratch `.devdb/`, the seed and probe scripts, and `.env.local` were deleted afterwards.
   - **Not run:** opened-dialog marks and labels, and focus restoration in a real browser. No
     browser automation is available in this environment. Handed to the coordinator as a manual
     check.
4. **Scope:** `git diff --stat f3912b0` touches only the files named above. No schema,
   migration, MCP, skill or plugin file is changed.

### Open items for the coordinator

- **Operator approval of the legal wording** in `app/terms/page.tsx` and `app/privacy/page.tsx`,
  and of the `LEGAL_UPDATED` bump.
- **Follow-up skill edit:** `skills/tonight-recommend/SKILL.md:381` ("The website is *a*
  management surface") is now stale. It is pinned by `recommend-skill.test.ts` and
  `skills/tonight-recommend/test.sh`.
- **Manual browser check** of the opened dialogs and focus restoration.
