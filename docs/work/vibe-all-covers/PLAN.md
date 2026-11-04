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

**Scope.** *Whenever Tonight proposes Vibes* is read as every place this offer is made: after a
liked or loved answered `vibe_required` — an existing Vibe recommended, a new wording, a new
Vibe, or both — and a kept film's new Vibe, which is offered as that one is. The keep flow's
single proposal (one Vibe, three to five films, other names) and a new user's first films (an
offer that may hold several Vibes) keep their own shapes: they are not this offer, and changing
them is a separate decision.

## 2. Where it is said

- **tonight-vibes**, *Said briefly, in their terms*: the films bullet and the layout paragraph.
- **`server.ts`, `next` on `vibe_required`** — read at the moment of the offer, by hosts with or
  without the vibes skill: the same two rules, in its own terms. The word *title* is kept out of
  it, as the guard against the reverted ranking rules requires: a film with no poster is *named
  with its year alone*.
- **tonight-recommend** is unchanged: its pointer — one recommendation and two alternatives, each
  named with what it means — still holds.
- **M5 rubric T1.6** (K1.5 points at it): two films for each option, six in all, none written; a
  poster only from the host's own tools — on the runner, whose host has none, any image or image
  link fails and a word about posters it cannot show fails; on `chatgpt-plugin (manual)`, each
  film with the poster its tools returned.
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

## 4. Behavior runs

Targeted only, as the owner asked — the new offer, no onboarding, no baseline — on DeepSeek, in
`BEHAVIOR.md`.
