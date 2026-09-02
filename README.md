# Tonight

**Build your taste. Find your movie.**

Tonight is a personal movie recommender in which you own the recommender. Instead of a profile
that watches what you do and never shows you what it concluded, you write down what you like —
and you can read it, edit it and delete it at any time.

There are two things in it.

**Genres** are the reusable pieces of what you like. A Genre has a name and an *instruction*,
and the instruction is the genre: `Action` means whatever you say Action means. Two people can
both have a Genre called `Action` and mean opposite things by it.

**Mixes** combine one or more of your Genres into something personal, and carry an instruction
of their own for what the combination means to you.

```
[SCI-FI] + [THRILLER]
          ↓
    SPACE TENSION
```

A Mix is not the intersection of its Genres. `Sci-Fi` and `Thriller` are the ingredients; what
you meant by putting them together — contained settings, mystery and pressure rather than
superhero action — is the Mix's own instruction, and nothing derives it for you.

## The architecture

```
    you
     │
    host agent  (Claude, ChatGPT, any MCP host)
     ├── Tonight skills      how to read, model and recommend from a taste model
     ├── Tonight MCP         your Genres and Mixes, and the rules over them
     └── its own knowledge, and whatever film or search tools it has
```

**Tonight owns the taste model. The host agent owns the intelligence.**

Tonight is a store with strong invariants and a small deterministic MCP surface over it. It has
no model inside it: no LLM client, no prompts, no reasoning. Interpreting "action and sci-fi,
but nothing too grim" into Genres, suggesting that two Genres would make a good Mix, and
choosing films for a Mix are all done by the host agent, guided by the skills in
[`skills/`](skills).

It also owns no film data — no catalogue, no lookup, no titles. Movie catalogues, search,
streaming availability and current releases are independent capabilities a host combines with
Tonight at run time. That separation is the architecture rather than a stage of it: Tonight
holds the one thing nobody else can hold for you, and stays useful from any MCP host rather than
from one vendor's.

This mirrors Inbox Labeler, whose MCP server holds a user's label model while the mailbox
belongs to the host's own Gmail connector.

## The skills

Three, with strict boundaries. Each one has a `SKILL.md` and a `test.sh` that checks the
contract in it has not been edited away.

| Skill | Its job |
| --- | --- |
| [`tonight-setup`](skills/tonight-setup) | turn a first description of somebody's taste into their first Genres; carries the starter definitions for bare genre names |
| [`tonight-manage`](skills/tonight-manage) | Genres and Mixes afterwards — model, create, update, rename, delete; suggest Mixes |
| [`tonight-recommend`](skills/tonight-recommend) | choose films for a Genre, a Mix, or a mood |

The semantic behaviour lives here, and so does the static product guidance: the MCP server is
persisted state and deterministic operations over it, nothing else. `tonight-setup` is what
knows the starting wording for a bare `Action`, and that "thrillers, but nothing too brutal" is
one Genre whose instruction carries the exclusion; `tonight-manage` is what knows
that a good Mix name is `Popcorn Chaos` rather than `Action Comedy`; `tonight-recommend` is what
knows to read a Mix's instruction together with the instructions of the Genres under it.

## The MCP tools

Eight, all deterministic, and all of them operations on persisted state. None interprets a
sentence, invents a Genre or chooses a film — and none serves static product guidance either:
setup semantics ship in the skills beside the server, not as a runtime tool.

| Tool | What it does |
| --- | --- |
| `get_server_info` | reachable, authenticated, and which opaque user this session is |
| `get_taste` | the whole model: Genres and Mixes |
| `create_genre` | a Genre, with the instruction that says what it means to this user |
| `update_genre` | reword or rename. A rename rewrites every Mix built from it |
| `delete_genre` | refused while a Mix is built from it, and the refusal names the Mixes |
| `create_mix` | a Mix over one or more existing Genres |
| `update_mix` | reword, rename, or replace the Genres it is built from |
| `delete_mix` | always allowed; the Genres it combined are untouched |

Whose model a tool acts on is never an argument. The store is opened for the authenticated user
before any tool exists to call it, so there is no `user_id` in any schema and nowhere for a
client to put one.

## The invariants

The interesting ones are in the schema rather than in application code, because the name of a
Genre is its primary key:

- **Genre and Mix names are unique per user, ignoring case.** `Sci-Fi` and `sci-fi` are one
  Genre; two users may of course both have an `Action`.
- **Renaming a Genre rewrites every Mix built from it, in one statement.** `ON UPDATE CASCADE`
  — there is no window in which a Mix points at a name that is gone.
- **Deleting a Genre a Mix needs is refused.** `ON DELETE RESTRICT`, with a pre-check so the
  refusal can name the Mixes in the way.
- **A Mix references Genres only.** The reference column's foreign key points at the Genres
  table, so a Mix built from another Mix is not expressible.
- **A Mix names at least one Genre**, and passing a new list replaces the old one.
- **A Genre always needs an instruction**, and the store supplies none. What `Action` means to
  a particular person is the one thing it cannot work out, so a Genre arriving without one is
  refused. Starting wording for the common genre names lives in
  [`skills/tonight-setup`](skills/tonight-setup), where the agent can show it to somebody before
  they agree to it.

## The website

[`web/`](web) is a Next.js application. One address serves two pages: a landing page for anyone,
and — for whoever is signed in — their own taste model, read and managed through the same store
the MCP tools use. There is no second surface and no second copy of the rules.

The website shows and edits the model. It does not recommend, and it has no model inside it to
recommend with: the panel at the foot of the page names the sentence to take to your assistant.

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

```bash
npm run test        # node --test over lib/**/*.test.ts
npm run typecheck
npm run lint
```

and the skill contracts:

```bash
for skill in skills/*/; do "$skill/test.sh"; done
```

## Deliberately not here yet

- **Watch history.** Tonight records nothing about what was recommended or watched. The model is
  designed for it — a recommendation would name the Genre or Mix that caused it, by name, with
  the same cascade everything else here uses — but future behavioural history must be *evidence
  for proposing changes* to the explicit model, never a second invisible model that outvotes it.
- **Legal pages.** `/privacy`, `/terms` and an imprint are required before a Google OAuth
  verification and before anybody outside a closed beta signs in.
