# Vibe discovery: films that show the recommended Vibe, laid out to scan — plan and record

Base `ff74886` (plugin 1.10.16). A presentation change to the one offer of three Vibes after a
liked or loved, not a redesign: no schema, store, tool, argument or API change, nothing written
automatically, and the keep flow, first films and every consent and write rule untouched.

## 1. What changes, and why

The offer — one recommended Vibe and two alternatives, each a name and a short sentence — stays
as it is, and people like it. What a name and a sentence cannot always carry is what makes the
recommended evening *that* evening rather than the two beside it, and *Said briefly, in their
terms* forbade the one thing that shows it fastest: naming films.

- **The recommended Vibe is shown by two or three films**, by title and year and nothing more,
  chosen as the most representative and for what sets that evening apart from the alternatives.
  For one of their Vibes, films it already holds may be among them. They are illustration, like
  the keep flow's and first films': never written, filed, made a core, or given a viewing or a
  verdict. *Never written* already says so for any film named only as an illustration.
- **The alternatives stay a name and a sentence.** Films for one only when they ask what it would
  hold — two or three, on the same terms.
- **Laid out to be taken in on a phone.** Where the host can show a card with a poster for each
  film, the recommended Vibe is shown that way; a poster is only one the host's own film or image
  tools returned, never one made up, generated or guessed a link to. Tonight holds no catalogue
  and no images, and its MCP server has no UI, so a card is the host's to give and the skill only
  says when to prefer one. Otherwise plain Markdown: the recommended Vibe in bold with its sentence
  and its films in italics, each alternative one line — no table, no headings.

## 2. Where it is said

- **tonight-vibes**, *Said briefly, in their terms*: the films bullet replaces *no films listed to
  illustrate an option*, and the layout paragraph follows the bullets. The keep flow's *Those
  films are the one place where naming films is not the start of anything* now says *like any
  film named only to show an idea*, since this is another such place.
- **`server.ts`, `next` on `vibe_required`** — read at the moment of the offer, by hosts with or
  without the skill: the same two rules, in its own terms, between the offer and (3).
- **tonight-recommend** is unchanged: its pointer — one recommendation and two alternatives,
  each named with what it means — still holds.
- **M5 rubric T1.6** (and K1.5, which points at it): the recommended option shown by two or three
  films, none written; the alternatives by none unless asked; a poster only from the host's own
  tools — so any image fails on the runner, whose host has no such tool, while on
  `chatgpt-plugin (manual)` a card with returned posters is preferred and Markdown passes too.

`plugin.json` is 1.10.17: the skill ships in the plugin, and ChatGPT refuses an unchanged version.

## 3. Tests

- `tonight-vibes/test.sh`: the films bullet, its illustration terms, the alternatives on request,
  the layout paragraph and its Markdown fallback, each pinned in order; the old ban gone.
- `recommend-skill.test.ts`: the same, in the shape both skills are checked against.
- `verdicts.test.ts`: `next` pinned — the films, the layout, before (3); the old ban gone.
- `evaluation-m5.test.ts`: T1.6's new criterion.

**Run by the implementer:** `npm test` in `web/`, 1397 of 1401 — the four are `evaluation.test.ts`
reading the gitignored `evaluation/results/`, absent in a fresh worktree; the changed suites
158/158; typecheck clean; eslint 0 errors (two warnings in files not touched). The bash suites
need an approval this session cannot give: every `order_check` in `tonight-vibes/test.sh` was
evaluated on the new skill — 138 of 138 — and the six new or changed ones fail on the base; of its
27 `grep -c` patterns only the old ban's count changed, 1 to 0; the offer section holds no double
quote. `tonight-recommend/test.sh` reads only its own skill, which is unchanged.

**Behavior runs, recorded later on the owner's approval** — `BEHAVIOR.md`, DeepSeek `deepseek-v4-pro`,
a dev-only `web/.env.local` and the key from opencode's credential store:

- **A new M5 scenario** (`569003f`), `alternative-films`: *"What films would go in the other two?"*
  after the offer on `m5-04-reading`, on both sources; the liked-no-fit and liked-fits rows point
  at T1.6.
- **The first recording** (`569003f`) found three defects in the new text: alternatives laid out
  without their Genres, films said to be in a Vibe that did not hold them, and four films on an
  ask. **Fixed in `1a83623`**: the layout keeps the Genres on every line; only films a Vibe holds
  are said to be in it; `next` asks two or three when asked.
- **On `1a83623`:** the films rule held in all 13 offers and all 6 asks, and no film named to show
  an option was written anywhere. What still fails is in `BEHAVIOR.md`, *Verdict*: Genres missing
  on alternatives at the base rate, a second question about when, two single smoke runs, and
  `hi` asking a new user for films in 3 of 10 runs against 4 of 4 on the base — no mechanism
  known, the one result that may be a regression. The poster card is untested: the runner's host
  has no image tool.

## 4. Review

**Codex code review 1 — NOT READY (working tree on `ff74886`).** The skill and `next` agree; the
reference films stay under *Never written*; consent, cores, one Vibe per film, the keep flow's and
first films' counts and instruction ownership are intact; poster provenance is explicit and a card
is conditional. Codex ran vibes 175/175, recommend 263/263 and the changed TypeScript suites
99/99; `git diff --check` clean. Two findings:

1. **[P2] *No image* was unconditional in T1.6**, which also scores `chatgpt-plugin (manual)`,
   where a returned poster is the intended card. **Fixed:** a poster only from the host's own
   tools; any image fails on the runner; on the manual plugin a card is preferred, Markdown
   passes. `evaluation-m5.test.ts` 17/17.
2. **[P2] No behavior report.** **Recorded** after the owner approved live runs: `BEHAVIOR.md`.

**Codex code review 2 — READY, for the code change itself.** Finding 1 resolved —
`evaluation-m5.test.ts` 17/17, `git diff --check` clean — and no remaining code findings. The
behavior report is the one outstanding release requirement: required before shipping, not a
block on this verdict.

**Codex code review 3 — READY, of `1a83623` only**, the fix the first recording led to: the three
fixes agree across the skill and `next`; consent, illustration-only, posters, the keep flow and
first films intact. Vibes bash 176/176, the changed TypeScript suites 82/82, whitespace clean.
