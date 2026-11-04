# Vibe offer: two films, with their posters, for every option — plan and record

Base `3931e25` (plugin 1.10.17, after *Vibe discovery*, PR #29). A presentation change to the one
offer of a recommended Vibe and two alternatives, not a redesign: no schema, store, tool,
argument or API change, nothing written automatically, and the keep flow, first films and every
consent and write rule untouched.

## 1. What changes, and why

*Vibe discovery* showed the recommended Vibe by two or three films and left the alternatives a
name and a sentence, with films only when somebody asked; a poster card, where the host could
give one, was for the recommended Vibe alone. Now **every option is shown the same way**:

- **Exactly two films for each of the three**, the recommended one and both alternatives, by
  title and year: the two most representative of that evening, and what sets it apart from the
  other two — six films, none shown for two options. For one of their Vibes, films it already
  holds may be among its two, and no other film is said to be in it. They are illustration only,
  as before: never written, filed, made a core, or given a viewing or a verdict; more on request,
  on the same terms.
- **Their posters, from the host's own tools only.** Where the host has film or image tools, the
  agent looks each of the six films up with them and shows its poster beside it, all three
  options alike, as a card where the host can show one. A poster is only one those tools
  returned for that film — never one made up, generated, guessed, or built from a URL pattern.
  Tonight holds no catalogue and no images, and its MCP server has no UI, so the posters are the
  host's to give.
- **Text where there are none.** A film its tools return nothing for, and every film on a host
  without such tools, is its title and year, with nothing said about a missing poster. Without a
  card, plain Markdown: each option its name in bold, its sentence and Genres in passing, its two
  films in italics with their years — no table, no headings.

**Scope: every place Tonight proposes Vibes.** After a liked or loved answered `vibe_required` —
an existing Vibe recommended, a new wording, a new Vibe, or both — and a kept film's new Vibe, as
first written; and, after code review 1, the two proposals that had shapes of their own:

- **A film they ask to keep**, with no Vibe that fits: was one Vibe, three to five films and two
  or three other names; now one recommended Vibe and two alternatives — other evenings the film
  could stand for, never other names — each with its core and exactly two films, shown as the
  offer after a liked shows them. One film may anchor all three, since only the pick is written;
  a reply that does not say which is asked about once. Consent, core choice and the write order
  are unchanged. The worked example is rewritten in that shape.
- **A new user's first films**: still the one offer that may hold several Vibes, grouped as
  before; each is now recommended with its two alternatives, each of the three with exactly two
  films (was three or four), shown the same way.

## 2. Where it is said

- **tonight-vibes**, *Said briefly, in their terms*: the films bullet and the layout paragraph,
  and one line saying every Vibe proposed anywhere is shown that way; *Proposing a new Vibe* and
  its worked example; *A new user's first films*.
- **tonight-recommend**, *Proposing a new Vibe*: the keep flow is recommend's to state, since a
  host may load recommend alone — the same shape, with the poster rule in one sentence.
- **`server.ts`, `next` on `vibe_required`** — read at the moment of the offer, by hosts with or
  without the vibes skill: the same two rules, in its own terms. The word *title* is kept out of
  it, as the guard against the reverted ranking rules requires: a film with no poster is *named
  with its year alone*.
- **tonight-recommend**'s pointer to the offer after a liked — one recommendation and two
  alternatives, each named with what it means — is unchanged.
- **M5 rubric T1.6** (K1.5 points at it): two films for each option, six in all, none written; a
  poster only from the host's own tools — on the runner, whose host has none, any image or image
  link fails and a word about posters it cannot show fails; on `chatgpt-plugin (manual)`, each
  film with the poster its tools returned. The keep-no-fit and first-films rows point at it.
- **`alternative-films` retired** — the scenario, its rubric row and its `other-two-films`
  request. It tested that the alternatives named no films until asked, which is no longer the
  rule. Its recordings are read as what they were.

`plugin.json` is 1.10.18: the skill ships in the plugin, and ChatGPT refuses an unchanged version.

## 3. Tests

- `tonight-vibes/test.sh`: the films bullet, the poster paragraph and its text fallback, the
  Markdown layout, each pinned in order; films for the recommended one alone, and none for an
  alternative until asked, gone.
- `recommend-skill.test.ts`, `verdicts.test.ts` (`next`), `evaluation-m5.test.ts` (T1.6, and the
  retired scenario gone from the rubric).

**Run by the implementer:** `npm test` in `web/`, 1397 of 1401 — the four are `evaluation.test.ts`
reading the gitignored `evaluation/results/`; the changed suites 158/158; typecheck and eslint on
the changed files clean. The bash suites need an approval this session cannot give: a Python
reader of `tonight-vibes/test.sh`, calibrated on the base (176/176, Codex's count there), read the
new suite 177/177, and the seven new or changed checks fail on the base skill.

## 4. Behavior runs

Targeted only, as the owner asked — the new offer, no onboarding, no regression set, no baseline —
12 model calls on DeepSeek `deepseek-v4-pro`, a dev-only `web/.env.local` and the key from
opencode's credential store, recorded at `c698b19` (`BEHAVIOR.md`):

- **Two films for every option, in 10 of 10 offers**, 60 films with their years, none shown for
  two options; **none written** — the two yeses wrote Bloom and the liked again, nothing else.
- **Posters UNTESTED.** The runner's host has no film or image tool, so only the text fallback
  ran: every film by title and year, no image, nothing said about posters. No real cover was
  fetched or shown anywhere; that needs the manual pass on `chatgpt-plugin (manual)`.
- **Recorded apart:** 4 of 10 runs failed on Genre wording on the alternatives — the rule
  *vibe-discovery-visual* recorded failing at the base rate, scored more strictly here. Whether
  six films make it likelier is unknown without before runs, which were out of scope.
- **After code review 1, at `ee5985f`, 8 more calls** — the keep flow (2 on `plugin-skills`, 1 on
  `recommend-only`) and first films (1): every proposal one recommended Vibe and two alternatives,
  or first-films groupings, with every Vibe shown by exactly two films, and no illustration film
  written. The `recommend-only` keep run FAILs — no core on its alternatives, and an unshown
  `update_vibe` that changed nothing — and first films FAILs on `hi`, the known onboarding
  fluctuation; both recorded in `BEHAVIOR.md`.

## 5. Review

**Codex code review 1 — NOT READY (`5aa6112`).** For the paths implemented, the skill and `next`
agree, illustration-only and the write rules are intact, the retired scenario is gone, and the
report marks real covers UNTESTED. Codex ran vibes bash 177/177, recommend bash 263/263, and
recommend-skill, evaluation-m5 and verdicts 99/99. One finding:

1. **[P2] The scope exception conflicts with *whenever Tonight proposes Vibes*.** The keep flow
   still proposed one Vibe with three to five films and other names, and first films three or
   four films, neither with posters. **Fixed** as §1 now says, in both skills, the rubric and the
   tests: vibes suite read 183/183, recommend 237 read with 32 slice checks skipped, the changed
   TypeScript suites 158/158, `npm test` 1397 of 1401 (the same four), typecheck and eslint clean.
