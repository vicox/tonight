# Turning the website into a companion page

**Status:** implemented, in the two commits described under
[Migration strategy](#migration-strategy). Two sentences of it are deliberately absent and
marked `TODO(Q2)` in the code — see [What is gated on what](#what-is-gated-on-what). The
document is kept as written: it is the record of what was decided and why, not a changelog.

Written in English to match the rest of the repository.

---

## Goals

1. **Somebody can set Tonight up from the website.** Today they cannot: the MCP endpoint
   appears nowhere they could copy it, and no page explains what to do with it.
2. **The website stops reading as a CRUD frontend.** A visitor should understand that the
   product happens in a conversation, and that this page is where they look at what came out
   of it.
3. **The taste model is visible without being editable at a glance.** Each name with what it
   means, the rest on request, management behind a door.
4. **The loop is explained, not implied.** Conversation → recommendation → the model grows →
   better recommendations.

Non-goals: changing the MCP surface, the schema, the skill's behaviour, or the write
endpoints. This is a presentation change with one piece of new plumbing.

---

## Product vision

Tonight is not a movie database and not a web app for curating a taste profile. **The
application is the conversation.** The website is its companion page, and it does four things:

- explains how Tonight works;
- gets somebody set up;
- shows, transparently, what is stored;
- offers management to people who go looking for it.

A normal user grows their taste model by talking to ChatGPT and never touches a form.

---

## Who this works for

Tonight writes. `create_genre`, `create_mix` and the updates *are* the loop — a Tonight that
can only be read is a Tonight that cannot grow.

That makes host eligibility a question about the audience, not a footnote on the setup page.
Custom MCP connectors in ChatGPT are a developer-mode beta, and **calling a write tool is gated
more tightly than calling a read one** — by plan, and reportedly also by a setting an
administrator holds. Which plans, which roles, which setting: this document names none of them.
What we had was secondary reporting, and a prerequisite stated confidently and wrongly on the
front page is worse than one stated late. Establishing it is
[Q2](#q2--is-the-connector-write-capable-for-the-people-we-invite-blocking-the-walkthrough).

What does not depend on that answer is the shape of the failure. Wherever reads are permitted
and writes are not, somebody completes every step, watches `get_taste` answer, and never gains a
single genre. Nothing errors, nothing is missing from the page, and the half that works is the
half that makes it look fine. That is the worst way for a product to fail, and it is the reason
the requirement belongs above step 1 rather than in a troubleshooting list.

Three consequences for this design:

1. **The walkthrough states the requirement before step 1**, not at the bottom — whatever Q2
   turns out to say it is. Failing at the last step for a reason given at the top is an annoying
   afternoon; failing invisibly forever is a lost user.
2. **The MCP endpoint is presented host-neutrally.** `https://tonight.movie/mcp` is the
   product's edge, and ChatGPT is the walkthrough we illustrate rather than the boundary of
   what works. The README already says "Claude, ChatGPT, any MCP host"; this page should not
   quietly narrow that to one host with a plan requirement.
3. **The closed beta is the answer to "who".** `ALLOWED_EMAILS` decides who gets in, so the
   supported audience is a list we control and eligibility is something to check per invitee.
   That is what makes this constraint survivable — for a public product it would be a launch
   blocker rather than a prerequisite line.

Verification is [Q2](#q2--is-the-connector-write-capable-for-the-people-we-invite-blocking-the-walkthrough). It needs real
accounts and cannot be done from the repository, which is exactly why nothing above states a
plan by name.

---

## Where the site is today

One product page. `/` serves a pitch to a stranger and the taste model to whoever is signed
in; `/privacy`, `/terms` and `/impressum` sit beside it.

```
components/taste-board.tsx    384 lines  "use client"   the CRUD frontend
components/taste-editor.tsx   209 lines  "use client"   create/edit dialog
components/site-header.tsx     85 lines
app/api/{genres,mixes}[/[name]]                          four write endpoints
```

The signed-in view shows, per object: the name, the **full instruction**, `Edit` and `Delete`,
with `Add genre` and `Add mix` as panel actions. Empty states say *"Add one here"*.

Two concrete gaps:

- **`https://tonight.movie/mcp` is not displayed anywhere.** The only hint is a footer line,
  "Connect Tonight to your assistant over MCP."
- **There are no Project Instructions.** The candidate text is the skill, and until this cycle
  nothing in `web/` could reach it.

---

## Information architecture

Four routes. Nothing that needs a navigation bar — a `Setup` link beside the account is
enough.

| Route | Audience | Purpose |
| --- | --- | --- |
| `/` signed out | a stranger | what it is, the loop, an example, the four setup steps |
| `/` signed in | a user | their taste model, read-only, plus a compact setup reminder |
| `/setup` | anybody | prerequisites, every step in full text, and what each failure looks like |
| `/privacy` `/terms` `/impressum` | unchanged | unchanged |

---

## Page structure

### `/` signed out

1. **Hero**, smaller than today — the name and *"Build your taste. Find your movie."*
2. **The loop**, one line:
   `conversation → recommendation → your taste grows → better recommendations`
3. **A worked example**, short enough to read standing up:

   > **You:** I want a clever thriller tonight, nothing too bleak.
   > **ChatGPT:** Knives Out, The Nice Guys, or Game Night.
   > Want me to remember the kind of thing this is?
   > **You:** yes
   > **Tonight:** `[CLEVER THRILLER] + [LIGHT SUSPENSE] ↓ Smart, not heavy`
   >
   > *Next Friday the whole request is "something like Smart, not heavy, but shorter" — and it
   > knows.*

   Four things have to be in it, and the first two are what an earlier draft left out.

   **The films are named.** A stranger works out what this is from the answer they would have
   got; *"recommends three films"* is a stage direction, not an answer. It also puts the
   product the right way round — the recommendation is the point, and the taste model is the
   residue of having asked well rather than a form to fill in first.

   **The mix is drawn, not mentioned.** It is the idea that is hard to say and easy to show:
   two genres are two things somebody said, the mix is the third thing they decided. Rendered
   the way the signed-in page renders it, so the same shape teaches twice.

   **The payoff is stated once.** Without the last line the example explains persistence and
   never says what it buys — which is a shorter request that lands better, next time.

   **The "yes" stays.** Tonight saves what somebody said and never what the assistant
   concluded, so not every sentence becomes a genre, and where the host asks before it writes
   the model grows one accepted offer at a time. Whether that confirmation comes every time or
   once is [Q2](#q2--is-the-connector-write-capable-for-the-people-we-invite-blocking-the-walkthrough).

4. **Setup — four steps**, the main body of the page, under one line saying what the plan has
   to be:
   1. Add the MCP connector — the URL, with a copy button. Signing in to Google happens here,
      inside the host's own flow, and an address that is not on the beta list is refused at
      this point and nowhere later.
   2. Create a ChatGPT project — and one sentence, where the project's memory is being set
      up, saying that the project's memory and your taste model are two separate stores:
      Tonight cannot see the first, and the website cannot show it.
   3. **Copy Project Instructions** — the large button, paste into the project
   4. **Turn Tonight on in the project, then ask it what to watch.** A connector that is
      installed is not a connector that is being used — it has to be selected in the project,
      or named in the message, before the assistant reaches for it. This is the step people
      skip, because nothing in the previous three suggests one more is needed. The affordance
      and what it is called come out of [Q2](#q2--is-the-connector-write-capable-for-the-people-we-invite-blocking-the-walkthrough).

      Then ask what it knows about your taste, which is the cheapest proof it is being called
      at all. An empty model answering "nothing yet" is a pass; an assistant answering from its
      own head reads almost the same and is a fail, so the guide has to say what the difference
      looks like.
5. **Link to `/setup`** for the prerequisites in full and for what each failure looks like.
6. **Sign in**, secondary. Signing in is not how somebody starts using Tonight; connecting
   ChatGPT is.

### `/` signed in

1. Header with account and `Setup`.
2. **Your genres** — the name, and beneath it the opening line of the instruction. Anything
   longer expands.
3. **Your mixes** — the `[Genre] + [Genre] ↓ Name` composition, and the opening line of the
   instruction beneath the name.
4. **A prompt to take to ChatGPT**, one line, copyable.
5. **One line saying what this page speaks for.** It shows what Tonight stores. The assistant
   may also be drawing on its own memory of your conversations, which Tonight cannot see and
   this page does not show.
6. **Advanced**, collapsed, at the foot: add, edit, rename, delete.

A name is a handle, not a meaning: `SCI-FI` says nothing about whose Sci-Fi. The instruction is
the part the user wrote and the part the assistant acts on, so names alone would turn an
explicit taste model back into generic tags — the abstraction this product exists to refuse.
One line of it is the compromise between that and a wall of prose.

```
YOUR GENRES

  SCI-FI                                    ›
  Ideas over spectacle. Ships optional.

  MYSTERY                                   ›
  Something is withheld, and the withholding
  is the point.

YOUR MIXES

  [MYSTERY] + [CHARACTER STORY]
        ↓
  Smart, tense, but still fun               ›
  Tense enough to lean in, warm enough to stay.

▸ Advanced
```

### `/setup`

The same four steps at length, each with the exact thing to click and the exact thing that
goes wrong: an ineligible plan, a refused authorization, a Google address that is not on the
beta list, a connector that installed but was never selected in the project. Prerequisites are
the top of the page, not an appendix — see [Who this works for](#who-this-works-for).

Complete in text on its own. Screenshots come later and supplement it; see [Q3](#q3--screenshots).

---

## User flows

**First run.** Lands on `/` → reads the loop and the example → step 1, copies the MCP URL →
step 2, creates a project → step 3, copies the instructions and pastes them → step 4, turns
Tonight on in the project, asks for a film, then asks what it knows about their taste and gets
an answer that could only have come from Tonight. Signing in to the website is optional and
comes later, when they want to see what accumulated.

**Returning, curious.** Signs in → sees genre and mix names → expands one to read what it
means → leaves. No form was shown.

**Returning, wants a change.** Two paths, both supported: say it to ChatGPT ("rename my Sci-Fi
genre to Spacey"), or open **Advanced** on the website. The skill already handles the first;
neither is a redirect to the other.

**Stuck during setup.** Follows the `/setup` link and gets the prerequisites in full, every
step at length, and what each failure looks like.

---

## Component changes

| Element | Action |
| --- | --- |
| `AddButton` (×2) | remove from the default view |
| `RowAction` `Edit` / `Delete` | remove from the default view |
| empty state *"Add one here"* | reword: *"Nothing here yet. Tell ChatGPT what you are in the mood for, and what you tell it can be saved here."* |
| `Card` with the full instruction | name, the opening line of the instruction, the rest behind `<details>` |
| `ForTonight` panel | fold into the loop/example presentation |
| `TasteEditor` (209 lines) | keep unchanged, mount only from **Advanced** |
| four API routes | keep unchanged — they serve **Advanced** |
| `CopyButton` | **built** — generic, one job |
| `lib/setup-steps.ts` | new — the steps as data: what to do, what it should look like, what going wrong looks like |
| `SetupSteps` | new — renders that data compactly for `/`; `/setup` renders the same data its own way rather than one component branching on a `detailed` flag |
| `app/setup/page.tsx` | new |
| `public/setup/*.png` | later, in neither commit — see [Q3](#q3--screenshots) |

### A side effect worth having

`taste-board.tsx` is `"use client"` only because the editor lives inside it. If the default
view becomes read-only and instructions expand through native `<details>`, **the read path
needs no JavaScript**: it can be a Server Component, and only the **Advanced** island stays
client-side. Smaller bundle, and `<details>` brings its own keyboard and screen-reader
behaviour rather than somebody reimplementing it.

That is `<details>` being correct, which is not the same as the page being correct. One thing
here has no spoken form at all: `[MYSTERY] + [CHARACTER STORY] ↓ Smart, tense, but still fun`
read aloud is a list of punctuation. The brackets and the arrow are decoration and should be
marked as such, with the sentence they stand for available instead — *"Smart, tense, but still
fun combines Mystery and Character Story."* `CopyButton` already announces both its success and
its failure, so the copy actions need nothing further.

---

## Architectural decisions

**AD-1 — The skill stays the source of truth for the Project Instructions.**
`skills/tonight-recommend/SKILL.md` is the only file anybody edits. Decided by the product
owner; this document does not reopen it.

**AD-2 — The instructions reach the web app as a generated TypeScript module, not a file read
at runtime.** `npm run sync:instructions` writes `web/lib/generated/project-instructions.ts`.
A `.md` read at runtime would have to survive bundling and output tracing, and Vercel's
deployment root is `web/` — `../skills` is not uploaded. An imported string cannot go missing.

**AD-3 — The generated module is committed, and a test guards it.** A fresh checkout
typechecks, tests and builds with no prebuild step. `lib/instructions.test.ts` applies the
transform in AD-4 to the skill and compares the result to the committed module byte for byte,
naming the command to run when it drifts. The comparison is against the transform's output, not
against the skill file — the transform is three steps and total, so this is still a cache with a
guard rather than a second version to maintain.

**AD-4 — One transform, defined here, and nothing else touches the text.** The skill becomes the
copied instructions by exactly three steps, in this order:

1. **Strip the YAML frontmatter.** It names the skill for a host that discovers skills; inside a
   ChatGPT project it is noise.
2. **Hash what remains** — a short digest over the body as it stands after step 1, and over
   nothing else. Hashing text that already contained the marker would be circular.
3. **Append one line carrying that digest**, after a blank line, as the last line of the text.

Nothing is rewritten, shortened or reflowed; step 3 adds a line rather than changing one. "Byte
for byte" in AD-3 means byte for byte with the output of these three steps, and that sentence is
the whole contract — an implementer should not have to infer it from three decisions that each
describe part of it.

Appended rather than prepended, for two reasons. The strongest position in the text belongs to
the instructions and not to metadata. And a marker at the end is the first thing a length limit
would take, so its absence from somebody's pasted copy is itself the signal that the text was
truncated — the failure [Q1](#q1--do-the-instructions-fit-a-chatgpt-project-and-work-once-pasted-blocking-step-3) exists to look for.

**AD-5 — One seam for the copied text.** `lib/instructions.ts` is the single answer to "what
does the button copy". If the instructions turn out not to fit and we derive a shorter text,
that module and the sync script change; the button and the pages do not.

**AD-6 — Management stays available on both surfaces.** The website is *a* management surface,
not the required one, and the skill already handles explicit rename/delete/inspect through the
MCP tools. Hiding management behind **Advanced** is about the default view, not about removing
the capability.

**AD-7 — The marker exists so that an old paste can be recognised as old.** AD-3 keeps the
website's copy equal to the skill. Nothing keeps the copy somebody already pasted into their
project equal to either: the moment the skill changes, every existing installation is a version
behind and silent about it — and the skill is where the persistence and ownership rules live, so
a stale copy is not a cosmetic difference. Hence AD-4's third step, the same marker shown beside
the button on the website, and one line there saying to replace the instructions when it
changes.

Derived rather than hand-maintained: a number somebody has to remember to increment is a number
that will eventually be wrong. Addressed to a person, though the assistant reads it too — one
line of metadata inside a document of instructions is a fair price for a copy that can say how
old it is. And it is a way to *notice*, not a way to be notified: there is no channel into
somebody's ChatGPT project, and a distributed app would be the only real answer to that.

**AD-8 — Advanced owns every write, and refreshes the read view after one.** The read view is
server-rendered and the editor is a client island, so a write inside the island leaves the
server render stale: the quiet list above still says `Sci-Fi` after the rename succeeded. So
the island renders its own editable list of the same model, is the only thing on the page that
writes, and calls `router.refresh()` after a successful write so the server view re-renders.
Two renderings of one model is the price of keeping management on the page rather than behind a
fifth route; they read the same store through the same endpoints, so they can be briefly stale
but cannot disagree.

---

## Migration strategy

Two commits, in this order.

**1 — Make setup visible.** `CopyButton`, the step data, the four steps on `/`, `/setup`
complete in text with the prerequisites at the top, the MCP URL copyable, the instructions
wired through the seam. This closes the real gap and can ship on its own; the taste view is
untouched. One line of it — the plan requirement at the top — is waiting on
[Q2](#q2--is-the-connector-write-capable-for-the-people-we-invite-blocking-the-walkthrough), and it is the line most
worth getting right, because it is the one people act on before doing anything else.

**2 — Quieten the taste model.** Read-only default, collapsed instructions, **Advanced**
disclosure, taste view moved to a Server Component. No API, schema or MCP change, so it is
reversible by reverting one commit.

Nothing here requires a database migration, a schema change or a change to the eight MCP
tools.

### What is gated on what

The two spikes are not a phase in front of the work, because some of the work is the instrument
the spikes are run with. Treating them as a blanket precondition would stall things that cannot
be wrong and, worse, would leave Q1 with nothing to paste.

| | |
| --- | --- |
| Needed **for** the spikes | the seam, the sync script and `CopyButton` — already built. Q1 is one paste, and without them there is nothing to paste. |
| Gated **by** Q1 | the length assertion in `instructions.test.ts`, and whether the copied text stays the whole skill or becomes something derived from it. AD-5 is the seam either way. |
| Gated **by** Q2 | the requirement line above step 1, the wording of step 4's activation, and whether the worked example shows a confirmation. |
| Gated by **neither** | the MCP URL on the page, the step data, the structure of `/setup`, and the whole of commit 2. |

So commit 1 gets built and its two Q2-dependent sentences get written last. Commit 2 depends on
neither answer and could go first if the spikes take a while.

**The gate is `VALIDATED` in `web/lib/setup-steps.ts`** — two booleans, one per spike, both
`false`. While either is false, `/` and `/setup` say at the top that the walkthrough has not been
tested end to end and name the three things that are open. It does not hide the steps or disable
the buttons: Q1 is answered by pasting the text the page hands over, so gating the instrument
behind the measurement would leave no way to take it. `lib/setup-steps.test.ts` holds the other
half — while Q2 is open, no prerequisite may be published and no ChatGPT plan may be named
anywhere in the guide.

The connection check is `get_server_info` and the version it reports, not *"what do you know
about my taste?"*. The softer question is answered just as fluently by an assistant with no
connector at all, and on a new account both answer "nothing yet" — so it cannot distinguish the
case it exists to catch.

### What it became

Commit 1 — *Show people how to connect Tonight, on the page they land on*:

```
web/scripts/sync-instructions.mjs          all three steps of AD-4
web/lib/generated/project-instructions.ts  generated, committed
web/lib/instructions.ts                    the seam: text, version, length
web/lib/instructions.test.ts               drift, transform, marker, length
web/lib/setup-steps.ts                     the steps as data; PREREQUISITES empty (Q2)
web/components/setup-steps.tsx             the compact rendering, for `/`
web/components/copy-button.tsx             generic, one job
web/app/setup/page.tsx                     the same data at length
web/lib/web/setup.ts                       the MCP address, or null
web/app/page.tsx                           hero, loop, example, steps
web/components/site-header.tsx             + `SetupLink`
```

Commit 2 — *Make the taste model something you read, not a form you fill in*:

```
web/components/taste-view.tsx              the read path, a Server Component
web/components/taste-advanced.tsx          the island; the only writer on the page
web/lib/web/preview.ts                     what "the opening line" means, with tests
web/components/taste-board.tsx             removed — replaced by the two above
web/components/taste-editor.tsx            unchanged, mounted from Advanced
```

415 tests, typecheck, lint, build, skill contract 46/46.

---

## Open questions and trade-offs

### Q1 — Do the instructions fit a ChatGPT project, and work once pasted? *(blocking step 3)*

Measured: **11,203 characters** after the frontmatter (11,543 with it).

No authoritative limit for *Project* instructions could be found. OpenAI's help centre returns
403 to fetching, and the figures in circulation belong to neighbouring features:

| Feature | Limit | Source quality |
| --- | --- | --- |
| Custom Instructions (personalization) | 5,000, raised from 1,500 on 15 July 2026 | reported widely |
| GPT instructions | ~8,000 | empirical, undocumented |
| **Project instructions** | **unknown** | forum complaints, no number |

11,203 is above both known figures, so it probably does not fit — but probably is not
measured. **The test is one paste**, and `CopyButton` is the instrument. Once known, the number
belongs in `lib/instructions.test.ts`, where the assertion is deliberately left out.

Fitting is the first question and not the only one. A paste that is accepted can still be
truncated, outweighed by the project's own memory, or simply not acted on; the instructions
have to make the assistant reach for the connector, and nothing about that is observable from
a character count. So the spike is: paste, then check that an empty model reads, that something
said in conversation gets written, and that "rename my Sci-Fi genre" reaches the MCP rather
than being answered conversationally.

If it does not fit, the choice is between shortening the skill (one document, editorial work,
AD-1 holds unchanged) and generating a shorter text from it (two texts, the sync script gains
a transform, and distillation is editorial rather than mechanical — a generator would have to
be written by hand and maintained).

Shortening has a cost that comparison hides: the skill is host-neutral, and cutting it to a
length set by one host's text box makes every other host read a document shaped by ChatGPT's
current UI. The lean is still towards shortening — one document beats two, and a behavioural
specification that cannot survive being halved may be overwritten prose anyway — but if the cut
would remove behaviour rather than words, deriving is the better trade and AD-5 is already the
seam for it. Decide after the spike, not before it.

### Q2 — Is the connector write-capable for the people we invite? *(blocking the walkthrough)*

Not "is there a connector" — reading is the easy half, and a Tonight that only reads is not
Tonight. Write capability is gated more tightly than read capability, and beyond that this
document asserts nothing. The reporting we found is secondary and OpenAI's help centre returns
403 to fetching, so a plan matrix copied out of it into a prerequisite line would be a confident
lie waiting to be found by the first person who followed it.

The spike is therefore an inventory rather than a confirmation, run on whatever accounts we can
actually get hold of, starting with the ones our invitees have:

| Question | What it decides |
| --- | --- |
| does the connector install at all? | whether this account is out before step 1 |
| does `get_taste` answer? | reading working is the state that hides the failure |
| does `create_genre` appear, and does calling it succeed? | this is the loop; without it Tonight cannot grow |
| did an administrator have to permit something first? | whether the prerequisite is a person rather than a plan |
| is each write confirmed, or authorised once? | whether the worked example shows an acceptance |
| how is Tonight selected inside a project, and what is it called? | the wording of step 4 |

What comes out is a written record — plan, role, workspace setting, platform, and the name of
the affordance — and the requirement line quotes that record. Until it exists the line is not
written, and no plan is named anywhere on the site.

If the answer is bad it decides something larger than copy: a product whose loop needs a
workspace plan is a different product from one anybody can set up.
[Who this works for](#who-this-works-for) is the current answer to that, and the closed beta is
what keeps it an answer rather than a crisis.

### Q3 — Screenshots

They need the real ChatGPT interface and cannot be produced from here. Neither commit ships
placeholders: a public page of named empty boxes gives a reader neither illustration nor help,
and is worse than a page that never promised one. `/setup` ships complete in text, and
screenshots are added afterwards as a supplement, each captioned with the date it was taken —
a beta interface moves, and an undated screenshot of one becomes wrong without anybody having
edited it.

### Trade-offs accepted

- **Advanced is discoverable.** Somebody determined to treat the site as an editor still can.
  That is deliberate: the alternative is removing a capability the product owner wants kept.
- **A committed generated file.** Ordinarily a smell; here it buys a working fresh checkout
  and is held honest by a test (AD-3).
- **Two places to manage the model.** The conversation and **Advanced** can both write. They
  meet at the same store and the same invariants, so they cannot disagree — but there are two
  ways to do the same thing, and that is a cost.
- **Signing in is demoted.** Somebody who signs in expecting the product will find a read-only
  view and a set of instructions pointing elsewhere. That is the intended message and it will
  read as sparse to anybody expecting an app.
- **Two renderings of the taste model.** Quiet and read-only above, editable inside
  **Advanced**. AD-8 says why and names the thread holding them together; it is still two
  places where one model is drawn.
- **The page is not the whole story.** A recommendation can be shaped by the assistant's own
  memory of the conversation, which Tonight neither sees nor stores, so "here is what Tonight
  knows" is not quite "here is why you were shown that film". Setup names the two stores at the
  moment the project is created and the signed-in page repeats it in one line. It cannot do
  better than say so, and it should not pretend to.
- **Setup states the memory boundary; it does not recommend a memory setting.** Telling somebody
  to switch their project to project-only memory would be a specific claim about a host's
  settings of exactly the kind [Q2](#q2--is-the-connector-write-capable-for-the-people-we-invite-blocking-the-walkthrough)
  exists to stop us making unverified. It would also be advice we cannot justify: for a movie
  recommender, an assistant that remembers what you said about films last month is plausibly
  *better*, not contaminated. What somebody needs is to know the two stores are separate before
  they choose, which is what step 2 gives them. Which setting to pick is theirs.
