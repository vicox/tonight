# Tonight

**Movies That Get You.**

Tonight doesn’t just remember what you love. It understands why. Discover what makes movies
special to you through personal Vibes — and get recommendations that truly match your taste.

Tonight is a personal movie recommender in which you own the recommender. Instead of a profile
that watches what you do and never shows you what it concluded, you write down what you like —
and you can read it, edit it and delete it at any time.

There are four things in it.

**Genres** are the reusable pieces of what you like. A Genre has a name and an *instruction*,
and the instruction is the genre: `Action` means whatever you say Action means. Two people can
both have a Genre called `Action` and mean opposite things by it.

**Vibes** combine one or more of your Genres into something personal, and carry an instruction
of their own for what the combination means to you.

```
SPACE TENSION
  "contained settings, mystery and pressure — not superhero action"
  built from  [SCI-FI]  [THRILLER]
```

The Vibe comes first because that is where its meaning is. The Genres are what it is built from
and what hold it in place; they do not add up to it, and no reading of the two would have
produced `Space Tension`.

**Movies** are the films you have told Tonight about. A Movie has a title and a release year —
together they are its name, so `Dune / 1984` and `Dune / 2021` are two of them — and it may carry
an IMDb id. Its **viewing** says where it stands on your list — always one of `seen`
(*"I've seen it"*), `want-to-see` (*"Put it on my list"*) and `dont-want-to-see` (*"Don't recommend
it again"*) — and a film saved without one is `want-to-see`. The assistant says what it stored, so
you can correct it. That is the whole of what a Movie says about you, and it is a fact rather than
an opinion: a `want-to-see` film may be recommended, a `dont-want-to-see` one never is. A Movie
may be in no Vibe, one, or several, and it is yours in its own right either way: nothing is
looked up, and no film is here unless you put it there.

**Verdicts** are what you thought. One film, one thing said: `liked`, `loved` or `disliked`, with
your own words for why if you gave them, whether you volunteered it or answered a question, and
when. They have a history: changing your mind supersedes what you said before without erasing
it, withdrawing one takes that verdict out of what stands, and forgetting one removes it. Nothing
else anywhere holds an opinion. Turning a film down is not a verdict: *"don't recommend it
again"* is the film's viewing, `dont-want-to-see`, and *"not tonight"* is used that evening and is
never a viewing or a verdict — at most a pass on that evening. Deleting a Movie deletes every
verdict about it too.

A Vibe is not the intersection of its Genres. `Sci-Fi` and `Thriller` are the ingredients; what
you meant by putting them together — contained settings, mystery and pressure rather than
superhero action — is the Vibe's own instruction, and nothing derives it for you.

Their names work differently too, and this is the distinction the product turns on. **A Genre is
named for what it is; a Vibe for what it feels like.** `Clever thriller` and `Slow burn` are
Genres — plain, reusable, boring on purpose. `Space Tension`, `Popcorn Chaos`, `Small Town
Secrets` and `Quiet Dread` are Vibes: the name of a shelf in a good video shop rather than a
filter you applied.

`Smart, not heavy` is not a Vibe name. It is the Genres said again in one line, and the test is
one question — *if knowing only the Genres already tells you the name, the name is doing no
work*. A Vibe earns its keep by being something you would ask for again: *"something like Quiet
Dread, but shorter"* is a sentence people say. Nothing enforces this, because it is a judgement
rather than a rule; the skill asks for it and the MCP tool descriptions say it again at the
moment a name is being chosen.

## The architecture

```
    you
     │
    host agent  (Claude, ChatGPT, any MCP host)
     ├── Tonight skills      how to read, model and recommend from a taste model
     ├── Tonight MCP         your Genres, Vibes and Movies, and the rules over them
     └── its own knowledge, and whatever film or search tools it has
```

**Tonight owns the taste model. The host agent owns the intelligence.**

Tonight is a store with strong invariants and a small deterministic MCP surface over it. It has
no model inside it: no LLM client, no prompts, no reasoning. Interpreting "action and sci-fi,
but nothing too grim" into Genres, suggesting that two Genres would make a good Vibe, and
choosing films for a Vibe are all done by the host agent, guided by the skills in
[`skills/`](skills).

It also owns no film catalogue. Tonight holds the films a user told it about — a title, a year,
an optional IMDb id, whether they said they watched it, and which of their Vibes it is in —
plus, kept separately, whatever they have said about it. Nothing else: no film exists here until
somebody names one, and nothing about it is
ever looked up. Catalogues, search, streaming availability and current releases are independent
capabilities a host combines with Tonight at run time. That separation is the architecture rather
than a stage of it: Tonight holds the one thing nobody else can hold for you, and stays useful
from any MCP host rather than from one vendor's.

This mirrors Inbox Labeler, whose MCP server holds a user's label model while the mailbox
belongs to the host's own Gmail connector.

## The skills

Two, each with a `SKILL.md` and a `test.sh` that checks the contract in it has not been edited
away. [`tonight-recommend`](skills/tonight-recommend) is where every conversation starts:
recommending, keeping a film, recording what somebody said about one, and reading Vibes.
[`tonight-vibes`](skills/tonight-vibes) is how a Vibe is written and grows — anchored on a film
they stand behind, proposed and written only on their yes, from what they say about films. The
split is by concern, not by intent: there is still no setup, and recommend is still the way in.

**There is no setup.** Somebody arriving at Tonight wants a film, not a configuration session,
so the conversation starts where they are:

```
want to watch  →  recommend  →  the model grows  →  better context next time  →  recommend
```

An empty taste model is the normal first state and is answered with a question about films, not
with onboarding. What the person says along the way — *"a clever thriller, but nothing too
bleak"* — becomes the Vibe the recommendation was made for and the Genres under it. The model is
the residue of real conversations rather than something anybody fills in first.

The semantic behaviour lives here: the MCP server is persisted state and deterministic
operations over it, nothing else. The skill is what knows that a Vibe is the shape of a
recommendation idea, that a good one is called `Popcorn Chaos` rather than `Action Comedy`, and
— the rule the product rests on — that what may be written down is durable taste the
user stated, or a meaning they confirmed when the agent asked — never what the agent concluded
on its own, and never a request for tonight, which says what they want now.

### One specification

Each `SKILL.md` is a specification, the only file anybody edits, and the text a host reads: there
is no generated copy of it for any host. What keeps it honest is a contract rather than a
convention — `test.sh` beside each skill, and for `tonight-recommend` also
`web/lib/recommend-skill.test.ts`, assert that each rule is still stated, where it is stated, and
that what it replaced has not come back.

### The ChatGPT plugin

ChatGPT can also read the skill itself, packaged as a plugin. `chatgpt-plugin/` holds its
manifest and a reference to the Tonight connector, and `build.sh` packages them together with
the `SKILL.md` of every skill under `skills/` — the specification unchanged:

```bash
bash chatgpt-plugin/build.sh      # → chatgpt-plugin/dist/tonight.zip
```

Upload the ZIP in ChatGPT as a plugin. It does not bundle the MCP server: `.app.json` names the
connector by its registered app ID, so the connector has to be installed as well.

## The MCP tools

Twenty-one, all deterministic, and all of them operations on the five things Tonight persists:
Movies, Genres, Vibes, Episodes and Verdicts. There is no tool for anything Tonight itself
thought — a question it meant to ask, something it noticed, a change it was about to suggest —
because there is nowhere for such a thing to go. What it thinks while it is talking to somebody
is the conversation's, and it ends with the conversation. None interprets a sentence, invents a
Genre or chooses a film. A tool description carries the rules for using that
tool and nothing else — what a Vibe's name has to earn belongs to `create_vibe`, which is where it
is read at the moment a name is chosen. Everything true across more than one call is method, and
method ships in the skill beside the server rather than as a runtime tool.

| Tool | What it does |
| --- | --- |
| `get_server_info` | reachable, authenticated, and which opaque user this session is |
| `get_taste` | what to write from: the Genres, the Vibes, the Movies, and the verdicts that currently stand |
| `create_genre` | a Genre, with the instruction that says what it means to this user |
| `update_genre` | reword or rename. A rename rewrites every Vibe built from it |
| `delete_genre` | refused while a Vibe is built from it, and the refusal names the Vibes |
| `create_vibe` | a Vibe over one or more existing Genres, anchored on the one film that best embodies it |
| `update_vibe` | reword (a minimal change only on their yes to the exact words), rename, replace the Genres it is built from, or anchor it on a new core |
| `delete_vibe` | refused only when it would leave a film they like or love in no Vibe; the Genres it combined are untouched |
| `create_movie` | a film the user named, and whether they said they watched it |
| `update_movie` | retitle, correct the year, change its viewing, or change which Vibes it is in — never out of one it anchors, and never a liked or loved film out of its last one |
| `delete_movie` | removes the film they asked to remove, and every verdict about it; refused while it anchors a Vibe; the Vibes it was in are untouched |
| `record_verdict` | what they said about one film: liked, loved or disliked. A liked or loved is kept only for a film in at least one Vibe — otherwise nothing is written and the answer is `vibe_required`, with the call to retry once the film is filed. A turn-down is refused and routed to the film's viewing |
| `withdraw_verdict` | they no longer stand by it. The claim stops applying; that they said it stays |
| `forget_verdict` | one act removed outright, by the reference `get_memory` gave it |
| `get_verdicts` | everything said about one film, and which of it stands now |
| `get_memory` | the whole of what Tonight holds: what is current, and what it remembers |
| `record_episode` | a film evening: what was asked for and the films put forward (`offered`), another round of the same evening, or an evening of their own — adding only, never changing what is recorded |
| `correct_episode` | putting an evening right, and what they said happened with each of its films (`offers`: chosen, started, finished, passed), merged one film at a time — only on their unambiguous reference to that evening |
| `forget_episode` | an evening removed |
| `get_episodes` | the evenings, as history rather than as taste: each film an offer, Tonight's or theirs, with its own facts |
| `check_candidates` | the films you are about to recommend, against what Tonight holds about each — saved or not, where it stands, what stands about it; never a film of its own |

Whose model a tool acts on is never an argument. The store is opened for the authenticated user
before any tool exists to call it, so there is no `user_id` in any schema and nowhere for a
client to put one.

## The invariants

The interesting ones are in the schema rather than in application code, and they rest on one
split: **every object has a private uuid, and a public name the user may change.** The uuid is
what relationships point at and it never leaves the store; the name is how everything is
addressed from outside, and there is no id in any tool schema or any answer.

- **Genre and Vibe names are unique per user, ignoring case.** `Sci-Fi` and `sci-fi` are one
  Genre; two users may of course both have an `Action`. PostgreSQL's `lower()` decides that, in
  a unique index — never JavaScript, which folds `İ` differently.
- **Renaming a Genre writes one row and no others.** A Vibe holds the Genre's uuid rather than
  its name, so there is nothing to cascade and no window in which a Vibe points at a name that is
  gone.
- **Deleting a Genre a Vibe needs is refused.** `ON DELETE RESTRICT`, with a pre-check so the
  refusal can name the Vibes in the way.
- **A Vibe references Genres only.** The reference row's foreign key points at the Genres table,
  so a Vibe built from another Vibe is not expressible.
- **Every relation is keyed `(user_id, id)`.** A uuid being unguessable is a fact about
  collisions, not an authorization rule, so each foreign key carries the tenant with it and one
  user's row cannot reference another's however it is constructed.
- **A Vibe names at least one Genre**, and passing a new list replaces the old one.
- **A Genre always needs an instruction**, and the store supplies none. What `Action` means to
  a particular person is the one thing it cannot work out, so a Genre arriving without one is
  refused — the instruction is written from what that person actually said.
- **A Movie is named by its title and year together**, unique per user ignoring case, so one
  person's list can hold both `Dune`s.
- **A Movie's `viewing` is always one of three** — `seen`, `want-to-see`, `dont-want-to-see` —
  `NOT NULL`, with `want-to-see` as the default for a film saved without one. Taste v14 turned
  the old `unseen` into `want-to-see`; it backfills no `NULL`, and fails rather than guess if
  one is there.
- **A Movie carries no opinion.** What somebody thought of a film is a Verdict, with a
  provenance, an instant and a history no column here could hold — so there is nowhere on a
  Movie to put one. Taking a Verdict back removes that act from what stands: no weaker opinion
  is revealed underneath it.
- **A Verdict is a judgement and nothing else** — `liked`, `loved` or `disliked`, about the film,
  on every evening. Verdicts v3 holds the table to that with two `CHECK`s, and the verdict tools
  refuse an `occasion`, a `reach` or a `reason` rather than dropping it.
- **A Vibe is anchored on one core Movie**, the film that best embodies it, and the core is always
  one of its own films: a column on the Vibe with a deferred foreign key into its memberships. A
  core is required to create a Vibe, can be replaced — the old one stays a member — and is never
  cleared. A Vibe from before cores existed reads `core: null` and works as it is until somebody
  chooses its core; nothing anchors one automatically. **A core is a film saved as `seen`**: the
  store saves a new core that way, refuses a saved film that is anything else as a core, and
  refuses to mark a core anything else. It reads that saved fact alone — whether a verdict says
  otherwise is the user's to settle, never a viewing written to get past the refusal.
- **Deleting a Movie is allowed unless it anchors a Vibe**, and takes its Vibe memberships and
  every verdict about the film with it, in one transaction. A Vibe is *defined by* its Genres and
  its core, and merely *holds* its other Movies, which is why those restrict and the rest
  cascade. Taking a core out of its Vibe is refused the same way, and both refusals name the
  Vibes.

## The website

[`web/`](web) is a Next.js application. One address serves two pages: a landing page for anyone,
and — for whoever is signed in — their own taste model, read through the same store the MCP
tools use. There is no second surface and no second copy of the rules.

The website shows a Vibe-oriented view of the model and changes none of it: it has no write
endpoint, and every change — a Genre or Vibe created, renamed or deleted, where a film stands on
the user's list, what they thought of it — is made through an assistant, which uses the MCP
tools and does it there and then. It does not recommend, and it has no model inside it to
recommend with: the panel at the foot of the page names the sentence to take to your assistant.

The page is organised around Vibes, and a Movie in no Vibe is listed under *Other movies* beneath
them — recording that somebody watched a film makes one, and so does deleting the last Vibe it was
in. `get_taste` returns the same model in one piece: the website is a view of it, not the
definition of it.

## Running it

```bash
cd web
npm install
cp .env.example .env.local     # then fill it in — the file explains each variable
npm run dev
```

The embedded Postgres means a checkout works with no database installed. See
[`web/.env.example`](web/.env.example) for what production requires, and note that **production
never migrates from a request** — `npm run db:migrate` is a deploy step, run before the code
that needs it.

### Deploying a migration

Most migrations only add. Some remove something the running build still writes, and those are
**roll-forward only**: once the column is gone, the build that wrote it cannot serve, and there
is no ordering that makes it safe to leave running. Taste v12, which drops the Movie `state`
column, is one of these, and so is taste v14, which refuses the `unseen` and `NULL` viewings the
build before it writes.

So is **verdicts v3** (M8). It turns every `not-ever` that still stands into the saved film's
viewing, `dont-want-to-see`, removes every refusal act and everything said for one evening, and
then holds the table to judgements. It refuses — changing nothing — when a standing `not-ever`
has no saved film (Tonight will not invent one) or is a Vibe's core, naming the account and the
film. Find those first, without writing anything, with `npm run db:preflight-m8` against the
production database, and resolve each with the build that is still running; then follow the four
steps below. The removed acts come back only from the backup.

So is **episodes v3** (M9). An evening becomes its offers, each with its own `offered` flag and
its own `chosen`, `started`, `finished` and `passed`: the evening-level `watched` and `finished`
move onto the film the evening chose (`watched` becomes `started`) and their columns are dropped,
so the build before it fails loudly rather than misreading an evening. It refuses — changing
nothing — when an evening says it watched or finished something without a chosen film, says it
finished a film it did not watch, or offers the same film twice, naming the account and the
evening. Find those first with `npm run db:preflight-m9`, resolve each with the running build,
then follow the four steps below; rollback is the backup. After deploying, reconnect the Tonight
connector in each host — clients may keep the old tool definitions — and check with `tools/list`
that `correct_episode` and `record_episode` take `offers`.

So the contract for any release carrying one is four steps and their order is the whole of it:

1. **Stop the application.** Traffic quiesced, nothing writing.
2. **Back the database up.** The step after this one is not reversible by re-running anything.
3. **`npm run db:migrate`.** Every schema, in one invocation.
4. **Deploy the new build.**

`requireSchema` enforces one half of that and only one half: it refuses to serve a build whose
migrations are missing, which protects a **new** build from an **old** schema. It does nothing
in the other direction. An old build against a migrated database is not protected by the ledger
being ahead of it — after v12 it writes a column that does not exist, and the write simply
fails. That failure is the honest outcome and is better than silence, but it is an outage, so
the application is stopped rather than relied upon to fail cleanly.

```bash
npm run test        # node --test over lib/**/*.test.ts
npm run typecheck
npm run lint
```

and the skill contracts, and the ChatGPT plugin package:

```bash
skills/tonight-recommend/test.sh
skills/tonight-vibes/test.sh
bash chatgpt-plugin/test.sh
```

## Deliberately not here yet

- **Watch history.** A Movie says *whether* a film was watched and never a sequence of events:
  its `viewing` has no timestamp on it, so no timeline exists to read back. A Verdict is dated,
  but its instant is when somebody spoke rather than when they watched, and an Episode's is the
  evening it was written down.
- **Recommendations joined to what caused them.** An Episode already records an evening — what
  was asked for, the films put forward, and what the user said they did with each — so what was
  recommended is written down. What is not here is the join: an offered film names no Genre or
  Vibe as its reason. The model is designed for it — the reference would be by uuid, the way every
  relation here does it, so a later rename would cost nothing — but behavioural history must stay
  *evidence for proposing changes* to the explicit model, never a second invisible model that
  outvotes it.
- **Self-service account deletion.** `/privacy`, `/terms` and `/impressum` are published, and a
  user can have their assistant delete their own Genres and Vibes — but removing an account and
  everything belonging to it is done by hand on request rather than by a button in the product.
