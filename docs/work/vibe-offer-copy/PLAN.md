# Vibe offer copy: a short offer after a liked — plan and record

Base `b3b9c56` (plugin 1.10.13). A copy fix, not a redesign: no schema, store, tool behaviour or
API change, nothing filed automatically, and first films untouched.

## 1. What was wrong

After somebody said a film worked for them and a new Vibe was offered, the reply opened with a
long explanation of how Tonight stores a liked — why it is not kept yet, that it needs a Vibe, what
filing does — and then gave three options, each a name, a sentence and a run of Genres with their
meanings, read like three small specifications.

## 2. Root cause

Every layer the agent reads at that moment says **what** the offer contains, and none says how it
**reads**:

- **`next`** on `vibe_required` — read at the very moment — opens with the storage rule (*"A liked
  or loved verdict is kept only for a film in at least one of their vibes"*) and never says it is
  the agent's to act on rather than the user's to read; so it is relayed. It then specifies each
  option as *"a name, a sentence, their genres and this film as core"*, three times over, with
  nothing about length.
- **tonight-vibes**, steps 1–3 and *Two concrete alternatives, always*: each option is *"a name, a
  sentence and its Genres — any new Genre's meaning shown"*. Right as a statement of what is
  agreed; with nothing about how it is said, it is rendered as a full specification per option.
  The skill's one worked proposal — the keep flow's, with illustration films and other names —
  is the only shape on the page.
- **tonight-recommend** points at tonight-vibes for the offer, with no word on its length or on
  keeping the mechanics out of it.

## 3. The change

- **tonight-vibes:** one paragraph, *Said briefly, in their terms*, after *When both make sense*
  and before the writes, for this offer and a kept film's new Vibe: a brief, natural
  acknowledgement and nothing about how Tonight keeps things — never that the liked is saved
  before it is, never why it is not, only what did change in a few plain words; the
  recommendation first and said to be one, then the two alternatives, each its name and what it
  means in a short sentence — for a new Vibe the sentence written on a yes, its Genres named in
  passing, a new one's meaning in a short phrase, which is what its instruction is written with;
  a new wording shown
  exactly; no Genre explained at length, no illustration films, no other names; one simple
  question, the question about when folded in. A new user's first films keep their own offer.
  Abstract: no film, Vibe or example reply.
- **tonight-recommend:** the pointer to tonight-vibes says *in a few short lines that explain
  nothing about how Tonight keeps it*.
- **`server.ts`, `next` only:** the same, between (2) and (3), for either offer, with first films
  keeping theirs. The refusal itself — `isError`, nothing written, `retry` — is unchanged.

Kept as they were: three options, one recommended; an existing Vibe first; the minimal rewording
and *When both make sense*; a new Genre shown with its meaning, since a yes covers only what was
shown; the whole Vibe agreed before `create_vibe`; the liked never said to be saved before it is;
the viewing a liked moved said; the budget; *Writing what they agreed*; first films; the keep
flow's proposal.

`plugin.json` is 1.10.14. The skill half ships with the plugin; the `next` half with the web app.
Each holds alone, and they say the same.

## 4. Tests

- `tonight-vibes/test.sh`: the paragraph pinned in place and in order; first films keep their
  illustration films; the paragraph quotes no example reply.
- `tonight-recommend/test.sh`: the pointer pinned.
- `recommend-skill.test.ts`: both skills agree; the shape is abstract; the rules beside it stand.
- `verdicts.test.ts`: `next` pinned — the brevity, its place between (2) and (3), first films.
- M5 rubric: T1.6 and K1.5, *Said briefly, in their terms*; `evaluation-m5.test.ts` follows.

**Run by the implementer:** `npm test` in `web/`, 1373 of 1377 — the four are `evaluation.test.ts`
reading the gitignored `evaluation/results/`, absent in a fresh worktree; the three changed suites
98/98; typecheck and eslint clean. The bash suites need an approval this session cannot give:
every `grep -c` pattern in both was counted on the base and the new skill, with no count changed,
and the new and affected order checks pass on the new text, the new ones failing on the base. No
live M5 runs, and no plugin build.

## 5. Review

**Codex code review 1 — READY (working tree on `b3b9c56`)**, with no findings: the copy reaches
all three places the agent reads at that moment, stays abstract, and keeps consent, the three
options, a new Genre's meaning, the viewing a liked moved, the asking budget and first films.

Codex ran vibes 160/160, recommend 259/259 and the three changed TypeScript suites, 98/98; the
new checks fail on the base text — three in vibes, one in recommend, three TypeScript tests; `git
diff --check` clean. `chatgpt-plugin/test.sh` was not run, since it builds the ZIP. No live M5
runs.
