# Skill compliance: three targeted fixes — plan and record

Base `a610a04` (plugin 1.10.12). A bugfix, not a redesign: no schema, store, tool or API change,
nothing filed automatically, and nothing remembered that was not before.

## 1. What was wrong

1. **Recited, not personal.** After a liked The Brothers Bloom *"because clever characters do smart
   things"*, a request for something like it got that sentence back on the idea, the lead and
   every direction, and again in the next answer. Recommend said *"When a verdict shapes the
   answer, say what they said"*, and *"Their words about that film are said back as theirs"*:
   read as an obligation on every film that a verdict touched.
2. **Two skills, two orders.** Recommend calls `record_verdict` first, before anything else.
   Vibes said *"for a film in none, the Vibe comes before the verdict is saved"*, and its table
   *"in no Vibe, that offer comes first and the verdict after it"* — read as offering the Vibe
   before calling the tool. And `vibe_required` arrives as a tool error (`isError`, which some
   hosts show as *Error:*), so replies apologised for it.
3. **A fitting Vibe offered alone.** Where one of their Vibes fits, the spec was one confirmation
   — *"A film that fits well is only proposed for filing … with nothing more offered"* — which in
   practice came out as *"file it there, or I can create a new one"*. The current product spec is
   the fitting Vibe recommended, with two concrete alternatives beside it.

## 2. The change

- **`tonight-recommend`:**
  - *A verdict said back is what they said* replaces *When a verdict shapes the answer, say what
    they said*; a film's own `because` comes first *where* it is said back.
  - **Personal, not recited**, in *Saying why*: every reason aimed at what they like; saying back
    what they said of a film is never required, at most once an answer, never repeated in a later
    one; the lead and each direction get a reason of their own.
  - *however they put it and in whatever language*.
  - `vibe_required` is *an expected answer, not a failure: no apology, and no error to report*;
    its offer is one recommendation and two meaningfully different alternatives, each concrete,
    never a bare *"or I can make a new one"* — a Vibe that fits is the recommendation.
- **`tonight-vibes`:**
  - `record_verdict` comes first, as recommend says; the Vibe-before-verdict phrasing is gone,
    from the intro and from two table rows.
  - `vibe_required` is expected: no apology, no error, and no reason to file the film yourself.
  - Step 1's fitting Vibe is the recommendation, and **Two concrete alternatives, always**: any
    recommendation comes with two, each another Vibe of theirs the film fits or a new Vibe with a
    name, a sentence and its Genres and the film as core. A fit-well film gets its two
    alternatives and no new wording. *When both make sense*, the budget and writing are unchanged.
- **`server.ts`, `next` only:** the same two points, where a recommend-only host reads them.
  The refusal itself — `isError`, nothing written, `retry` — is unchanged.

`plugin.json` is 1.10.13.

## 3. Tests

- `tonight-recommend/test.sh`, `tonight-vibes/test.sh`: the new rules pinned; the replaced
  phrasings refused.
- `recommend-skill.test.ts`: *personal, not recited*; and both skills agreeing on verdict first,
  `vibe_required` expected, and the offer.
- `verdicts.test.ts`: `next` pinned; a German *"war mega"* — a bare liked, no `because` — on an
  unfiled film where a Vibe fits is refused with nothing filed, saved or moved, its `retry` exactly
  what they said, and kept once filed.
- M5 evaluation: `bloom-war-mega` (*"Brothers Bloom war mega!"*) on `m5-05-partial-fit`, family
  `liked-fits-german`, on both sources; `liked-fits` and T1.3 score the fitting Vibe with two
  concrete alternatives; T1.5 and the refused rows score no apology; `like-bloom-tonight` scores
  what they said of Bloom said back at most once. `evaluation-m5.test.ts` follows.
