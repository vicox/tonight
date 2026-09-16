import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SHARED_QUALIFIERS,
  sharedRetry,
} from "../../skills/tonight-recommend/contracts.mjs";
import {
  instructionsFrom,
  markerFor,
  projectInstructionsFrom,
  versionOf,
} from "../scripts/sync-instructions.mjs";
import {
  PROJECT_INSTRUCTIONS,
  PROJECT_INSTRUCTIONS_LENGTH,
  PROJECT_INSTRUCTIONS_VERSION,
} from "./instructions.ts";

/**
 * The mirror of the skill that the website hands people to paste.
 *
 * `skills/tonight-recommend/SKILL.md` is the source of truth; the generated
 * module is committed so a fresh checkout builds without a prebuild step. What
 * makes that safe rather than a second version to maintain is the first test
 * below: edit the skill without re-running the sync and the suite says so, and
 * says which command to run.
 */

const SKILL = new URL("../../skills/tonight-recommend/SKILL.md", import.meta.url);

const skill = () => readFileSync(SKILL, "utf8");

/**
 * The skill without its compact projections.
 *
 * `project:compact` blocks hold a shorter wording of a rule *for one target*. They
 * live in the same file as the canonical sentences, so a plain read finds a rule in
 * either — and an assertion that the skill still states a rule would be satisfied by
 * the projection's copy of it. That is exactly the drift these tests exist to catch,
 * so anything checking the specification reads the specification alone.
 */
const COMPACT_BLOCK = /^[ \t]*<!--[ \t]*project:compact[ \t]*\r?\n[\s\S]*?^[ \t]*project:compact[ \t]*-->[ \t]*\r?\n?/gm;
const canonicalSkill = () => skill().replace(COMPACT_BLOCK, "");

test("the copied instructions are the transform of the skill, byte for byte", () => {
  assert.equal(
    PROJECT_INSTRUCTIONS,
    projectInstructionsFrom(skill()),
    "the generated instructions no longer match the skill — run `npm run sync:instructions`",
  );
});

test("the frontmatter goes, and what is left is the skill's own sentences", () => {
  const source = skill();

  // The frontmatter names the skill for a host that discovers skills. Inside a
  // ChatGPT project it is noise.
  assert.match(source, /^---\nname: tonight-recommend\n/, "the skill still opens with frontmatter");
  assert.equal(PROJECT_INSTRUCTIONS.includes("name: tonight-recommend"), false);
  assert.match(PROJECT_INSTRUCTIONS, /^# Tonight — recommend\n/, "and starts at the heading");

  // Nothing is summarised or reflowed. Whole blocks are removed and the rest is
  // carried over as written, with the marker the only thing added.
  const body = instructionsFrom(source);
  assert.ok(PROJECT_INSTRUCTIONS.startsWith(body), "the body is not carried over unchanged");
  assert.equal(PROJECT_INSTRUCTIONS.slice(body.length).trim(), markerFor(versionOf(body)));

  // Every line of the output is a line of the skill.
  for (const line of body.split("\n")) {
    if (line.trim()) assert.ok(source.includes(line), `the generator invented: ${line}`);
  }
});

test("surfacing a pattern stays optional, and gated on the taste looking durable", () => {
  // The compressed wording had turned a judgement into an instruction: ask, every
  // time. That makes an ordinary recommendation into a save prompt, which is the
  // one thing this product is trying not to be.
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  assert.match(flat, /looks lasting\? You \*\*may\*\*/, "the durability gate is gone");
  assert.match(flat, /You \*\*may\*\* put it to them/, "asking has become obligatory");
  assert.match(
    flat,
    /an ordinary recommendation, or a mood for tonight, is no reason to ask/,
    "nothing stops a taste-confirmation prompt after every answer",
  );
});

test("the boundary says what Tonight does return, not only what it refuses", () => {
  // "No tool here returns films" was false — `get_taste` returns the films they
  // saved. What is actually true is narrower and more useful: no tool turns a
  // taste into a recommendation. Losing that distinction either hides their own
  // Movies from them or implies Tonight does the choosing.
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  assert.match(flat, /`get_taste` returns their saved Movies/);
  assert.match(flat, /no Tonight tool turns a taste into film recommendations/);
  assert.equal(flat.includes("No tool here returns films"), false);

  // Instructions belong to Genres and Mixes; a Movie carries state. What each of
  // those requires is now stated by the tool that writes it, so what the
  // instructions carry is the shape and a pointer.
  assert.match(flat, /holds the taste model and nothing else\*\* — Genres, Mixes, Movies/);
  assert.match(flat, /Read a Mix as \*\*its own instruction/);
  assert.match(flat, /arrive with `create_genre` and `create_mix`/);
  assert.match(flat, /Which sentence means which state is in `create_movie`/);

  // And the ratings wording was too broad twice over: liked and disliked are
  // real Movie state the user gave, and only a score is out of scope. Both of the
  // earlier phrasings would have told the agent not to record them. The positive
  // statement is now on the `state` field itself — see `lib/mcp/tools.test.ts`;
  // what this still guards is that neither over-broad phrasing comes back.
  assert.doesNotMatch(flat, /no ratings\b/);
  assert.doesNotMatch(flat, /rating of any kind/);
});

test("what moved to the tools is no longer stated here as well", () => {
  /**
   * Step 3 of `docs/work/phase-1-implementation.md`. A rule that is true whenever
   * one call is made now lives in that call's description, and this is the half
   * that makes it a *move*: two homes for one rule is how the two come to
   * disagree, and nothing would fail when they did.
   *
   * Their new home is `lib/mcp/tools.test.ts`, which holds the same contracts
   * against the descriptions a client actually discovers.
   */
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  // Each pattern is deliberately broader than the sentence that moved. A rule
  // that came back reworded is the same duplicate as one that came back verbatim,
  // and the narrow form of this check could not see the difference.
  for (const [what, gone] of [
    ["the sentence-to-state readings", /at its most specific|→ `liked`|→ `loved`|→ `disliked`/i],
    ["the instruction's voice", /first person/i],
    ["the rewording prohibition", /reword/i],
    [
      "the write invariants",
      /always needs an instruction|at least one existing Genre|built from Genres only|built from another Mix|no chaining/i,
    ],
    ["the score prohibition", /score/i],
    ["the Mix naming test", /already tells you the name|what would I get wrong|the instruction test/i],
    // `not_seen` itself stays: the instructions still say what a *stored* state
    // means when recommending. What moved is what *saving* does to the field.
    [
      "what saving does to the state",
      /never makes it `not_seen`|nothing said is `null`|absence is never not_seen|not the same as not_seen/i,
    ],
  ] as [string, RegExp][]) {
    assert.equal(gone.test(flat), false, `${what} is still stated in the instructions as well`);
  }

  // And a pointer is left where the skill still has to refer to the behaviour,
  // so a reader is sent somewhere rather than left with a gap.
  assert.match(flat, /arrive with `create_genre` and `create_mix`/, "no pointer for the write rules");
  assert.match(flat, /Which sentence means which state is in `create_movie`/, "no pointer for the state");
});

test("what is conversation rather than a field stays here", () => {
  // The two the Step 2 review sent back. Both are about what to do *before* a
  // call rather than about what a call may contain, and a description cannot be
  // read before the call it describes.
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  assert.match(flat, /never ask for a state their sentence gave you/, "asking before calling");
  assert.match(flat, /Say so and let them decide/, "how a change is agreed to");
  assert.match(flat, /already say they saw it/, "why an opinion needs no second question");
});

test("both kinds of request read the model; only an exclusion is mode-dependent", () => {
  /**
   * Step 6, adopting P3. Rewritten rather than deleted: the distinction it pinned
   * still exists, but what turns on it has changed.
   *
   * It used to be that nothing persisted bound a plain request — the model was not
   * read at all unless somebody asked for it. That protected a new user from having
   * two Genres narrowed into a filter, and it also meant the Mix written last night
   * had no effect on tonight's answer, which makes the product's own loop false.
   *
   * What replaces it is narrower and stronger: the model is evidence on any night,
   * and the single thing that depends on what was asked is whether an exclusion
   * *written into an instruction* binds. Tonight's own words bind absolutely either
   * way, which is what stops evidence-always from becoming a filter-always.
   */
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  for (const [what, rule] of [
    ["that there are two kinds of request", /Two kinds of request, told apart from what they said/],
    ["that it is never asked about", /never by asking/],
    ["to read the model either way", /Read `get_taste` either\s*way/],
    ["that what is written is evidence on any night", /what they wrote is evidence on any night/],
    ["that tonight's words bind", /What they said tonight binds/],
    ["that this includes tonight's exclusions", /ruled out just now/],
    ["that availability binds too", /can watch/],
    ["which one is the default", /\*\*Discovery is the default\*\*/],
    ["that discovery is exploring", /you are exploring/i],
    ["and explores from what they wrote", /from what they wrote/],
    ["when taste leads instead", /\*\*Taste-aware is what they ask for\*\*/],
    ["that the model is then the brief", /the model is the brief/],
    ["that its exclusions then hold", /exclusions hold/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the agent is never told ${what}`);
  }

  // The one mode-dependent thing, stated as the exception it is. The projection
  // says it more briefly than the skill — the *reason* an exclusion does not
  // travel is rationale and stays canonical-only — so this reads the rule.
  const exclusion = flat.slice(
    flat.indexOf("stored exclusion"),
    flat.indexOf("Discovery is the default"),
  );
  assert.ok(exclusion.length > 80, "the exclusion rule could not be found");
  assert.match(exclusion, /binds only when they asked for their taste/,
    "the exclusion is not scoped to a taste request");
  assert.match(exclusion, /Everything else is evidence either way/,
    "the exception is not bounded, so it reads as the rule");

  // R3, both halves in one breath. Either alone is a way to pass while failing:
  // the retained candidate had runs that used the model by narrating the
  // exclusion, and runs that stayed silent about it and showed no model at all.
  assert.match(exclusion, /when it does not bind it is \*\*never\s+mentioned\*\*/i,
    "a non-binding exclusion may still be surfaced");
  assert.match(exclusion, /show the positive evidence you used/i,
    "positive evidence need not be visible in the answer");

  // The visibility rule is about a *positive* preference, and about it being
  // recognisable rather than named. Dropping "positive" would let an exclusion
  // narrated in passing satisfy it — the very run the candidate recorded — and
  // mandating a name would rule out a paraphrase the user would recognise as
  // their own, which the approved behaviour allows.
  assert.match(exclusion, /positive/i, "the visibility rule does not require positive evidence");
  assert.doesNotMatch(exclusion, /\b(must|always) name\b|\bname (the|a) (Mix|Genre)\b/i,
    "the projection makes literal naming mandatory");

  // And the silence rule is about the exclusion, never about the model: an
  // instruction not to mention stored taste at all would destroy the other half.
  assert.doesNotMatch(flat, /never mention (the|their|stored) (model|taste)/i,
    "the silence was widened from the exclusion to the whole model");

  // The superseded rule must not survive beside its replacement: it says the exact
  // opposite of P3 and would win, being the more absolute of the two.
  assert.doesNotMatch(flat, /Nothing\s+persisted binds/i, "the pre-P3 rule is still here");
  assert.doesNotMatch(flat, /nothing in it is a criterion unless they asked/i);
  assert.doesNotMatch(flat, /a small or new one must never become a filter/i);
  assert.doesNotMatch(flat, /Read it with `get_taste` and weigh it/i);
});

test("a Mix is evidence, and the states under it calibrate rather than gate", () => {
  /**
   * Step 6, adopting P5 — the highest-risk change in Phase 1.
   *
   * The rule this replaces said a Genre or Mix existing is not evidence they like
   * it, and that what makes one trustworthy is the film states under it. That reads
   * as a gate: no states, no weight. It is also the product's own loop denied — the
   * Mix written in last night's conversation is exactly the one tonight's answer
   * should be using, and it is the most current thing the user has said.
   *
   * So: a Mix is declarative evidence from the moment it exists, and states are
   * confirmatory — they move confidence, never eligibility. A Mix with nothing
   * under it is less certain about specifics and no less weighty about intent.
   */
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  for (const [what, rule] of [
    ["that a matching Mix is a reason, not a filter",
      /A matching Mix is a reason the recommendation fits/],
    ["that it counts immediately", /counts from the moment it exists/],
    ["that an empty Mix says as much as a full one",
      /nothing under it, says as much as one with ten films/],
    ["that a Genre is thinner", /A Genre is an ingredient/],
    ["that a Genre name alone justifies nothing", /a Genre name alone is a label/],
    ["that states calibrate", /States calibrate it, never decide whether it counts/],
    ["that loved strengthens", /`loved` strengthens/],
    ["that liked strengthens less", /`liked` more\s*weakly/],
    ["that disliked weakens the similar", /`disliked` weakens something similar/],
    ["that disliked is not a ban", /a sign, not a ban/],
    ["that not_seen and null are not negative evidence",
      /`not_seen` and `null` are\s*absence of experience, not evidence against/],
    ["what seen does and does not say", /`seen` says only that they watched it/],
    ["how an empty Mix is read", /intent certain, fit unconfirmed/],
    ["what to say instead of a perfect fit", /the best you know of, said\s+as that/],
    ["that this changes phrasing, not eligibility",
      /[Cc]hanges phrasing and reach, never whether you use it/],
    ["to say how sure it is", /Say how sure you are/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the agent is never told ${what}`);
  }

  // The gate, in every form the strategy names. A Mix is never classified as
  // counting or not counting, and no word grades one as provisional.
  assert.doesNotMatch(flat, /A Genre or Mix existing is not evidence they like it/i,
    "the pre-P5 rule is still here");
  assert.doesNotMatch(flat, /What makes one trustworthy is the film states under it/i);
  assert.doesNotMatch(flat, /\b(aspirational|untested|unproven|provisional)\b/i,
    "a Mix is graded by a label the strategy rejects");
  assert.doesNotMatch(flat, /(Mix|Genre)[^.]{0,40}\b(does not count|doesn't count|no weight)\b/i,
    "something in the text classifies a Mix as not counting");
});

test("an unconfirmed Mix bounds the claim about a film, never the Mix itself", () => {
  /**
   * R4 of `docs/work/phase-1-repairs.md`. The candidate produced *"about as pure
   * a fit for Reading Room as exists"* for a Mix with nothing under it — maximal
   * certainty that a **particular film** matched, while nothing had yet confirmed
   * that anything did.
   *
   * The repair is to the language of the recommendation, not to the standing of
   * the Mix. P5 is untouched: the Mix counts fully and immediately, states
   * calibrate rather than gate, and confidence about what the user *meant* is
   * never reduced — only confidence that this film is the thing they meant.
   */
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");
  const bullet = flat.slice(
    flat.indexOf("A Mix with nothing under it"),
    flat.indexOf("Either way"),
  );
  assert.ok(bullet.length > 60, "the unconfirmed-Mix rule could not be found");

  // Intent is certain; the fit is what is not.
  assert.match(bullet, /intent certain/i, "confidence about intent was reduced");
  assert.match(bullet, /fit unconfirmed/i, "the claim about a specific film is not bounded");
  // And what to say instead, so the lead stays committed rather than hedged away.
  assert.match(bullet, /the best you know of/i, "the lead is left with nothing to say");
  // The Mix still counts: this changes how you speak, not whether you use it.
  assert.match(bullet, /never whether you use it/i, "an unconfirmed Mix stopped counting");

  // None of the rejected mechanisms came back with it.
  assert.doesNotMatch(flat, /\b(aspirational|untested|unproven|provisional|tentative Mix)\b/i,
    "a Mix is graded by a label the strategy rejects");
  assert.doesNotMatch(bullet, /\b(score|weight|threshold|points?|at least \d+|\d+ or more)\b/i,
    "the rule acquired arithmetic");
});

test("taste is read qualitatively — no score, no threshold, no count", () => {
  /**
   * The rules in this passage describe evidence getting stronger or weaker. They
   * must not turn into arithmetic: a weight, a points scheme or a minimum number of
   * films would be a second taste model, kept in the agent's head, that nobody can
   * read or correct — and a count of states deciding whether a Mix counts is the
   * exact P5 regression Step 6 exists to remove.
   *
   * Checked on **both** artifacts, independently. The specification and the
   * projection are written separately, so arithmetic can be introduced into either
   * one alone; a guard on the shipped text only would miss it in the skill, which
   * is the copy a skill-capable host actually reads.
   *
   * Scoped to this passage rather than the file. Numbers are legitimate elsewhere —
   * "three to five other films", "two or three directions" — and this is the one
   * place where a number would be a rule about how much taste is worth.
   */
  const between = (text: string) => {
    const flat = text.replace(/\s+/g, " ");
    const from = flat.indexOf("Two kinds of request");
    const to = flat.indexOf("Either way", from + 1);
    assert.ok(from >= 0 && to > from, "the recommendation-model passage could not be found");
    return flat.slice(from, to);
  };

  const arithmetic: [string, RegExp][] = [
    ["points or scoring", /\b(points?|scores?|scoring|scored)\b/i],
    ["a threshold", /\bthresholds?\b/i],
    ["weighting", /\bweigh(t|ts|ted|ting)\b/i],
    ["a minimum count", /\bat least \d+|\b\d+ or more\b/i],
    ["a numeric state count", /\b\d+\s+(loved|liked|disliked|seen|films?|states?)\b/i],
    ["a spelled state count", /\b(one|two|three|four|five|several)\s+(loved|liked|disliked)\b/i],
    ["a gate on counting", /\bbefore it counts\b|\bbefore trusting\b/i],
    ["counting states", /\bcount(s|ing)?\s+(the\s+)?(loved|liked|films|states)\b/i],
  ];

  for (const [where, text] of [
    ["the skill", canonicalSkill()],
    ["the projection", PROJECT_INSTRUCTIONS],
  ] as [string, string][]) {
    const passage = between(text);
    assert.ok(passage.length > 200, `${where}: the passage is too short to be the right one`);
    for (const [what, pattern] of arithmetic) {
      assert.doesNotMatch(passage, pattern, `${where} reads taste as arithmetic: ${what}`);
    }
  }
});

test("the answer has one lead, and the rest are directions from it", () => {
  /**
   * Step 4 of `docs/work/phase-1-implementation.md`. Deciding is the work: a list of
   * equal candidates hands it back to the person who asked precisely because they
   * could not make it. Pinned as semantics, not prose — what has to survive is that
   * there is one lead, that it is committed to out loud, that the rest are directions
   * ordered by distance, and that the set is small enough not to be a menu.
   */
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  for (const [what, rule] of [
    ["to open with an idea", "One idea for the evening, in a line"],
    ["that exactly one film leads", "one lead, named as such"],
    ["the sentence that commits to it", `*"I'd start with X"*`],
    ["to say why it, for them", "and why it, for them"],
    ["how many directions follow", "two or three **directions**"],
    ["when each direction is offered", "opened by when it wins"],
    ["what a direction is not", "never a runner-up"],
    ["what orders them", "distance from the lead"],
    ["that the lead is what distance is measured from", "another way out"],
    ["how to close", "Close with one question **or** one lever, never both"],
  ] as [string, string][]) {
    assert.ok(flat.includes(rule.replace(/\s+/g, " ")), `the agent is never told ${what}`);
  }

  // A quality order says "this is the fourth best", which is useless and probably
  // false. The prohibition has to be explicit: leaving it out reads as a free choice.
  assert.match(flat, /distance from the lead\*\*, not\s+quality/);

  // The old form was a menu, and the menu is what the shape replaces.
  assert.doesNotMatch(flat, /three to six|six films|\b3 to 6\b/i);
});

test("how many Genres to create stays guidance, in both wordings", () => {
  /**
   * The canonical rule is *"two or three strong, complementary ones is often the
   * shape, never filler to hit a number"*. Both halves matter and they pull against
   * each other: the numbers say what usually works, the hedge says it is not a quota,
   * and `never filler` stops the numbers being hit for their own sake.
   *
   * A compact projection that keeps the numbers and drops the hedge reads as
   * "create two or three Genres", which is a rule the skill does not have — and the
   * failure is invisible, because every word in it came from the canonical sentence.
   */
  const projected = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");
  const at = projected.search(/two or three strong, complementary ones/);
  assert.ok(at >= 0, "the guidance on how many Genres could not be found");

  // The hedge sits with the numbers, not somewhere else in the document.
  const clause = projected.slice(Math.max(0, at - 60), at + 80);
  assert.match(clause, /\b(often|usually|commonly|typically|tend|can be|may be)\b/,
    "the projection states two or three as a requirement rather than the usual shape");

  // And padding to reach them is still forbidden.
  assert.match(clause, /never filler to hit a number/,
    "the projection names a count without forbidding padding to reach it");
});

test("a film they have seen or judged is not offered as a new one", () => {
  /**
   * P4 and P10. The target is what they have not seen or judged — which is not the
   * same as what Tonight has never heard of. `not_seen` is a stored state, and it
   * means they told Tonight they have *not* seen the film: that is a reason to offer
   * it, so it is the one state that keeps a Movie eligible. A `loved` film is spent
   * as evidence instead, which is worth more than suggesting it again.
   */
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  for (const [what, rule] of [
    ["what the target is", "Lead with what they have not seen or judged"],
    ["which states rule a film out",
     "`seen`, `liked`, `loved` and `disliked` rule a Movie out as new"],
    ["that not_seen does not", "`not_seen` does not"],
    ["that a not_seen film stays eligible", "so it stays"],
    ["that being ruled out covers being called new", "out of being called new or unseen"],
    ["what a loved film is for", "`loved` one is a **reason**, not a suggestion"],
    ["that a stretch needs a positive anchor", "Anchor a stretch in something they like"],
    ["that an absence is not a reason", "an absence shows where to look, never why"],
    ["to mark a stretch as one", "say it is one"],
  ] as [string, string][]) {
    assert.ok(flat.includes(rule.replace(/\s+/g, " ")), `the agent is never told ${what}`);
  }

  // Negative half: the list that rules a Movie out is exactly the four judgements.
  // `not_seen` joining it would silently turn "I have not seen this" into a reason to
  // withhold the film — the precise inversion of the rule.
  const ruledOut = flat.slice(flat.indexOf("`seen`, `liked`"), flat.indexOf("rule a Movie out as new"));
  assert.ok(ruledOut.length > 0 && ruledOut.length < 60, "the list that rules a film out moved");
  assert.doesNotMatch(ruledOut, /not_seen/);

  // Positive half: absence from that list is not enough on its own — a reader could
  // still conclude that a film Tonight has heard of is spent. Somewhere after the
  // list, `not_seen` must be named and said to remain available, and the sentence
  // saying so must not be a negation of eligibility.
  const after = flat.slice(flat.indexOf("rule a Movie out as new"));
  const eligibility = after.slice(after.indexOf("`not_seen`"), after.indexOf("`loved` one is"));
  assert.ok(eligibility.includes("`not_seen`"), "`not_seen` is never mentioned as still eligible");
  assert.match(
    eligibility,
    /does not|still|remains|stays/,
    "`not_seen` is named but never said to remain available",
  );
  assert.doesNotMatch(
    eligibility,
    /\bnever (offer|present|suggest)|not (offered|presented|eligible)|rules? (it|a Movie) out/,
    "the text treats a `not_seen` film as spent",
  );

  // And the target may not be restated as "what Tonight has heard nothing about",
  // which reads on `not_seen` films as well and is how this rule was wrong before.
  assert.doesNotMatch(
    flat,
    /told Tonight nothing about|Tonight (has )?(knows|heard) nothing about|no stored state/i,
    "the target is stated as Tonight's ignorance rather than what they have not seen",
  );
});

/**
 * Does this text forbid making somebody learn the data model?
 *
 * Bound to the action rather than to the sentence. A negation governs the
 * action when it precedes it in the same clause-run with nothing contrastive in
 * between: "never ask X, or require learning Genres and Mixes" forbids both,
 * because `or` continues the negation; "never ask X, but require learning
 * Genres and Mixes" forbids only the first, because `but` turns against it.
 *
 * No spelling of the negation is privileged — "never", "do not" and "don't" are
 * the same rule, and pinning one of them would fail valid wording.
 */
const LEARN_THE_MODEL =
  /\b(?:mak(?:e|es|ing)\s+\S+\s+learn|requir(?:e|es|ing)\s+learning|teach(?:ing)?)\s+Genres and Mixes/i;
const NEGATION = /\b(?:never|not|no|cannot|can'?t|don'?t|doesn'?t|won'?t)\b/gi;
const CONTRASTIVE = /\b(?:but|however|yet|though|although|except|whereas|instead)\b/i;

function forbidsLearningTheModel(text: string) {
  for (const segment of text.split(/(?<=[.!?;])\s+/)) {
    const action = LEARN_THE_MODEL.exec(segment);
    if (!action) continue;
    const before = segment.slice(0, action.index);
    const negations = [...before.matchAll(NEGATION)];
    const last = negations[negations.length - 1];
    // No negation before the action in its own segment, or something contrastive
    // between the two: the action is stated affirmatively.
    if (!last) return false;
    if (CONTRASTIVE.test(before.slice(last.index + last[0].length))) return false;
    return true;
  }
  return false;
}

test("a retry covering both branches is rejected, in either word order", () => {
  // The shared definition, checked directly. `test.sh` calls the same function
  // over the canonical text, so canonical and projection cannot diverge on which
  // qualifiers count or on which direction is checked.
  for (const qualifier of SHARED_QUALIFIERS) {
    for (const phrasing of [
      `${qualifier}, offer to retry.`,
      `offer to retry, ${qualifier} it was.`,
    ]) {
      assert.ok(sharedRetry(phrasing), `a shared retry was allowed: ${phrasing}`);
    }
  }

  // A branch-local retry is not a shared one.
  for (const local of [
    "*Taste question*: stop, quote the error, offer to retry.",
    "claim nothing about them; offer to retry.",
    "- **A write fails** — the recommendation stands.",
  ]) {
    assert.equal(sharedRetry(local), null, `a branch-local retry was rejected: ${local}`);
  }
});

test("the data-model prohibition is read as a prohibition, in any wording", () => {
  // The predicate above, checked against the forms it must separate. This is
  // what stops the guard being satisfied by a sentence that merely contains the
  // word "never", and what stops it rejecting a valid "do not".
  for (const negative of [
    "never make somebody learn Genres and Mixes",
    "never require learning Genres and Mixes",
    "do not require learning Genres and Mixes",
    "don't make somebody learn Genres and Mixes",
    'never *"what genres do you like?"*, or require learning Genres and Mixes.',
    "never ask about genres, and never require learning Genres and Mixes",
  ]) {
    assert.ok(forbidsLearningTheModel(negative), `a valid prohibition was rejected: ${negative}`);
  }

  for (const affirmative of [
    "require learning Genres and Mixes",
    "make somebody learn Genres and Mixes",
    "never ask what genres they like, but require learning Genres and Mixes",
    "never print the taste model. Require learning Genres and Mixes.",
    "never print the taste model; require learning Genres and Mixes.",
    "ask one question about films",
  ]) {
    assert.ok(!forbidsLearningTheModel(affirmative), `an affirmative form passed: ${affirmative}`);
  }
});

test("a request for a film is still not a configuration session", () => {
  // The guard that had to survive the rewrite. It is the oldest rule in this section
  // and the one the new answer form is most likely to quietly displace.
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  // Matched by what each prohibition forbids, not by its wording: the projection
  // says the same two in fewer words than the skill does.
  for (const [what, rule] of [
    ["that the one question is about films", /ask \*\*one (question about films|film question)\*\*/i],
    ["not to ask about genres", /never \*"what genres do you like\?"\*/],
    ["never to print the model", /\*\*Never print the taste model while recommending\*\*/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the guard lost: ${what}`);
  }

  // The data-model prohibition, proved as a prohibition.
  //
  // Matching the phrase alone would be satisfied by an instruction that
  // *required* learning the model, and requiring the word "never" somewhere in
  // the sentence is barely better: "never ask X, but require learning Genres
  // and Mixes" contains it and forbids nothing. What has to hold is that the
  // action is governed by a negation — which survives a coordinator that
  // continues the negation ("never X, or Y") and does not survive one that
  // contrasts with it ("never X, but Y").
  const passage = flat.slice(flat.indexOf("Either way"), flat.indexOf("**The shape"));
  assert.ok(passage.length > 100, "the R1 passage could not be found");
  assert.ok(forbidsLearningTheModel(passage), "the data-model prohibition is not stated as one");

  // The same rule holds of the skill, which says it in its own words.
  const canonicalPassage = canonicalSkill()
    .replace(/\s+/g, " ")
    .slice(canonicalSkill().replace(/\s+/g, " ").indexOf("Either way"));
  assert.ok(
    forbidsLearningTheModel(canonicalPassage.slice(0, canonicalPassage.indexOf("**The shape"))),
    "the skill's data-model prohibition is not stated as one",
  );
});

test("saving a film classifies it, and may grow the model rather than bend it", () => {
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  for (const [what, rule] of [
    ["to classify rather than fit", /Classify the film[,;] do not fit it to what is there/],
    ["to look before deciding", /read the Genres and Mixes first/i],
    ["to reuse a Genre that fits", /Reuse the Genres that (genuinely )?fit/],
    ["to create one when none covers it", /create one for anything (no Genre covers|uncovered)/],
    ["how many, as guidance rather than a quota",
      /\b(often|usually|commonly|typically)\b[^.—]{0,30}two or three strong, complementary ones/],
    ["and never to pad", /never filler to hit a number/],
    ["not to stretch a Mix", /Never stretch a Mix to avoid making one/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the agent is never told ${what}`);
  }
});

test("a proposed Mix is made tangible before it is agreed to", () => {
  /**
   * A name and a sentence are thin things to agree to. Somebody saying yes to
   * "Everybody Has a Plan" has agreed to a label; somebody who has also seen three
   * films that would sit under it has agreed to the idea — which is what the Mix
   * has to be worth in a month, when they ask for it by name.
   *
   * The films are the whole risk of this rule. They are named, and everything else
   * in the skill treats a named film as the start of something, so the boundary is
   * pinned here as hard as the behaviour is: illustration, no write, no state, no
   * Mix, no classification. Only the film they asked to keep is in the flow.
   */
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  for (const [what, rule] of [
    ["to show the idea rather than only name it", /make (the idea|it) concrete/],
    ["how many films to name", /three to five other films that would belong/],
    ["to offer other names for it", /two or three (names it could have instead|alternative names)/],
    ["that the asking still comes last", /Then ask/],
    ["that the films are illustration", /Those films are illustration only/],
    ["that they are not written and not filed", /never written, never in (the|a) Mix/],
    ["that they get no state and no classification", /never given a state, nothing to classify/],
    ["what is actually being saved", /only the film they asked to keep is (being )?saved/i],
    ["that a fitting Mix skips all of it", /a Mix that genuinely fits needs none of this/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the agent is never told ${what}`);
  }

  // The illustration must not acquire the vocabulary of the persistence flow: no
  // state named against those films, no count of them to store, no second save.
  const proposal = flat.slice(
    flat.indexOf("**Proposing a new Mix:**"),
    flat.indexOf("**A film in no Mix is legitimate**"),
  );

  assert.ok(proposal.length > 200, "the proposal passage could not be found");
  assert.doesNotMatch(proposal, /`(not_seen|seen|liked|loved|disliked)`/);
});

test("the model can be inspected and changed in the conversation, in plain sentences", () => {
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  assert.match(flat, /## Asked about the model directly/);
  assert.match(flat, /\*\*do those\*\*, in the conversation/);
  assert.match(flat, /call `get_taste` and answer in ordinary sentences/);
  assert.match(flat, /is \*a\* management surface, not \*the\* one/);
});

test("a taste read that fails is split by what was asked, not by what broke", () => {
  /**
   * Step 5 of `docs/work/phase-1-implementation.md`, implementing strategy 10.1.1.
   * The rule it supersedes stopped in both cases, which turned a store outage into a
   * total product outage for requests that never needed the data.
   *
   * This projection says the rule in fewer words than the skill does — strategy 9.5,
   * and the `project:compact` block in `## When something fails`. So the assertions
   * below are about behaviour, never about the skill's sentences: what has to survive
   * projection is the rule, in whichever wording this target can carry. The canonical
   * wording is asserted separately, against `SKILL.md`, by the skill's own test.sh.
   *
   * Each branch is still read on its own. Against the whole section, a rule that moved
   * from one branch to the other still matches: "stop" landing in the ordinary branch,
   * or both retry offers sitting in one of them, would pass.
   */
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  const sliceBetween = (from: string, to: string) => {
    const at = flat.indexOf(from);
    const until = flat.indexOf(to, at + 1);
    assert.ok(at >= 0 && until > at, `the branch starting "${from}" could not be found`);
    return flat.slice(at, until);
  };

  // R2 put the retry back inside each branch. Factored out in front of both it was
  // semantically equivalent and behaviourally weaker — furthest from the branch
  // that had to perform it — and one recorded run dropped it.
  const taste = sliceBetween("*Taste question*", "*Ordinary*");
  const ordinary = sliceBetween("*Ordinary*", "**A write fails**");

  // --- the taste-explicit branch, read alone ---
  assert.match(taste, /\bstop\b/i, "the taste branch does not stop");
  assert.match(taste, /quote|verbatim|own words|what the tool said/i,
    "the taste branch does not report the failure in the tool's own words");
  // Stopping *is* the no-recommendation rule: an instruction to answer anyway would
  // make this branch indistinguishable from the other one.
  assert.doesNotMatch(taste, /answer anyway|recommend anyway|recommend well/i,
    "the taste branch recommends from taste it could not read");

  // --- the ordinary-request branch, read alone ---
  assert.match(ordinary, /answer anyway|recommend anyway/i, "the ordinary branch does not answer");
  assert.match(ordinary, /first sentence/i, "the ordinary branch does not pin the disclosure");
  assert.match(ordinary, /model unread|model could not be read/i,
    "the ordinary branch does not disclose that the read failed");
  assert.match(ordinary, /not based on it/i,
    "the ordinary branch does not say the answer is not based on the model");
  assert.match(ordinary, /claim nothing about them|claim \*\*nothing\*\* about them/i,
    "the ordinary branch does not forbid a personal claim");
  // The disclosure must precede what it is disclosing about.
  assert.ok(
    ordinary.search(/first sentence/i) < ordinary.search(/model unread|model could not be read/i),
    "the disclosure is not tied to where it must appear",
  );
  // And this branch must not stop, or carry the other branch's reporting rule.
  assert.doesNotMatch(ordinary, /\bstop\b/i, "the ordinary branch stops too");
  assert.doesNotMatch(ordinary, /quote the error|own words/i,
    "the branches' error reporting has run together");

  // Exactly one retry offer inside each branch. A count over the whole section is
  // satisfied by both sitting in one of them, which is what R2 repaired.
  for (const [name, branch] of [["taste", taste], ["ordinary", ordinary]] as [string, string][]) {
    assert.equal((branch.match(/retry/gi) ?? []).length, 1,
      `the ${name} branch does not offer exactly one retry of its own`);
  }

  // R2's other half: the ordinary branch names the shape obligation itself, so it
  // cannot degrade into a disclosure, a question, or a bare list. R1 remains the
  // source of the rule; this is the branch saying it still applies here.
  assert.match(ordinary, /in the usual shape|in the shape above/i,
    "the ordinary branch no longer reinforces the answer shape");

  // And no retry sits *above* the branches. Two local retries plus a shared
  // clause in front of them is the arrangement R2 removed: it is the factoring
  // the retained candidate showed to be less reliable, and having both would
  // reinstate it while every positive assertion above still passed.
  const aboveBranches = flat.slice(
    flat.indexOf("**`get_taste` fails**"),
    flat.indexOf("*Taste question*"),
  );
  assert.ok(aboveBranches.length > 0, "the failure bullet could not be found");
  assert.doesNotMatch(aboveBranches, /retry/i,
    "a retry instruction sits above the branches rather than inside them");

  // And not as one obligation covering both, in either word order. The predicate
  // lives in `skills/tonight-recommend/contracts.mjs` and `test.sh` uses the same
  // one: written twice, this rule diverged immediately — `whichever` was covered
  // on one side, and in one direction only.
  const section = flat.slice(flat.indexOf("## When something fails"));
  assert.equal(sharedRetry(section), null, "the retry is expressed as one shared obligation");

  // The superseded rule must not survive beside its replacement.
  assert.doesNotMatch(flat, /report the error verbatim|Never recommend from a model you could not read/i);

  // Write-failure behaviour is projected verbatim and is unchanged by any of this.
  // Write-failure behaviour is unchanged by R2 and is projected in fewer words.
  assert.match(flat, /\*\*A write fails\*\* — the recommendation stands; say what was not saved/);
  assert.match(flat, /(Never claim something was stored when the tool refused|never that it was stored)/);
});

test("the compact projection of a failure says the same thing the skill does", () => {
  /**
   * Strategy 9.5: the skill is the specification, this file is one projection of
   * it, and a projection may use shorter wording but may not mean anything else.
   * `## When something fails` is the first place the two wordings differ.
   *
   * One list of behaviours, applied to both artifacts. Each behaviour is a pair of
   * patterns — what the canonical sentence looks like, and what the compact one
   * looks like — so this fails if a rule is present in one artifact and absent from
   * the other, whichever side loses it. It is deliberately not a string comparison:
   * equal strings would defeat the point of having a compact projection at all.
   */
  const canonical = canonicalSkill().replace(/\s+/g, " ");
  const projected = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  const behaviours: [string, RegExp, RegExp][] = [
    ["the taste branch stops", /stop\. Report the failure/, /\*Taste question\*: stop/],
    ["it reports the tool's own words", /in the tool's own words/, /quote the error/],
    ["the taste branch offers its own retry",
      /own words\s+and offer to retry/, /stop, quote the error, offer to retry/],
    ["the ordinary branch answers", /recommend anyway/, /answer anyway/],
    ["the disclosure is the first sentence", /\*\*first sentence\*\*/, /first sentence/],
    ["it says the read failed", /their model could not be read/, /model unread/],
    ["it says the answer is not based on it", /not based on it/, /not based on it/],
    ["it forbids a personal claim", /Claim \*\*nothing\*\* about them/, /claim nothing about them/],
    ["the ordinary branch offers its own retry",
      /about them\. Offer to retry/, /claim nothing about them; offer to retry/],
    ["the ordinary branch owes the answer shape",
      /recommend anyway, \*\*in the shape above\*\*/, /answer anyway \*\*in the usual shape\*\*/],
    ["a failed write still reports", /Never claim something was stored when the tool refused/,
      /say what was not saved, never that it was stored/],
  ];

  for (const [what, inSkill, inProjection] of behaviours) {
    assert.match(canonical, inSkill, `the skill lost: ${what}`);
    assert.match(projected, inProjection, `the projection lost: ${what}`);
  }

  // The canonical wording is the specification and must not leak into this target,
  // or the section would ship twice and the compact block would save nothing.
  assert.doesNotMatch(projected, /fails on a taste question|fails on an ordinary request/,
    "both wordings of the failure rule reached the projection");

  // And the compact wording is owned by the skill: it is read out of `SKILL.md`,
  // never written here. If it stops being there, this projection has a second source.
  // The raw file, not the canonical-only view, because the block is what is sought.
  assert.match(skill(), /<!-- project:compact/, "the compact wording is not in the skill");
});

test("the compact projection of the write flow says the same thing the skill does", () => {
  /**
   * Strategy 9.5, the same contract as `## When something fails` and for the same
   * reason: this target cannot carry the canonical wording of everything, so it
   * carries a shorter wording of the same rules.
   *
   * One list of behaviours, applied to both artifacts. Each is a pair of patterns —
   * the canonical sentence and the compact one — so a rule lost on either side fails
   * here, whichever side loses it. Deliberately not a string comparison: equal
   * strings would defeat the point of a compact projection.
   */
  const canonical = canonicalSkill().replace(/\s+/g, " ");
  const projected = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  const behaviours: [string, RegExp, RegExp][] = [
    ["keeping a film needs a Mix",
      /Never write a Movie this way without at least one Mix/,
      /Never write a Movie this way without at least one Mix/],
    ["recording a state never invents one",
      /Never invent a Mix, or ask for one, to record a state/,
      /Never invent a Mix, or ask for one, to record a state/],
    ["a later keep still takes a Mix", /A later request to keep it takes a Mix/,
      /A later request to keep it takes a Mix/],
    ["the Mix question is classification, not permission",
      /not \*"may I save this\?"\* but \*"what kind of night is this\?"\*/,
      /is a classification, never a request for permission/],
    ["classify rather than fit", /Classify the film/, /Classify the film/],
    ["read first", /Read the Genres and Mixes first/i, /read the Genres and Mixes first/i],
    ["one that fits is just saved", /save it there, say so in one sentence, ask nothing further/,
      /save it there, say so in one sentence, ask nothing further/],
    ["never stretch a Mix", /Never stretch a Mix to avoid making one/,
      /Never stretch a Mix to avoid making one/],
    ["none fitting means not yet", /do not save the film yet/, /do not save the film yet/],
    ["reuse what fits", /Reuse the Genres that genuinely fit/, /Reuse the Genres that fit/],
    ["create for what is uncovered", /create one for anything no Genre covers/,
      /create one for anything uncovered/],
    // "Two or three" is guidance, not a quota. Both wordings have to say so: a
    // projection that names the numbers without the hedge reads as a requirement,
    // which is a different rule from the one the skill states.
    ["two or three is the usual shape, not a requirement",
      /two or three strong, complementary ones is often the shape/,
      /often two or three strong, complementary ones/],
    ["and padding is still forbidden",
      /never filler to hit a number/, /never filler to hit a number/],
    ["the Mix choice is yours", /Never ask which Mix they want; that judgement is yours/,
      /Never ask which Mix they want; that judgement is yours/],
    ["a proposal is made concrete", /make the idea concrete/, /make it concrete/],
    ["with three to five films", /three to five other films that would belong in it/,
      /three to five other films that would belong/],
    ["and two or three names", /two or three names it could have instead/,
      /two or three alternative names/],
    ["those films are illustration only", /Those films are illustration only/,
      /Those films are illustration only/],
    ["never written, never filed", /never written, never in the Mix/, /never written, never in a Mix/],
    ["no state, no classification", /never given a state, nothing to classify/,
      /never given a state, nothing to classify/],
    ["only the asked-for film is saved", /Only the film they asked to keep is being saved/,
      /only the film they asked to keep is saved/],
    ["a yes covers the whole flow", /A yes is the whole of the permission/,
      /A yes is the whole of the permission/],
    ["and is never asked twice", /never ask a second time/, /never ask a second time/],
    ["a no settles it", /A no settles it\*\*, never saving the film loose/,
      /A no settles it\*\*, never saving the film loose/],
    ["propose while saving", /Propose while saving, not while recommending/,
      /Propose while saving, not while recommending/],
    ["a fitting Mix skips it", /a Mix that genuinely fits needs none of this/,
      /a Mix that genuinely fits needs none of this/],
    ["a film in no Mix is fine", /A film in no Mix is legitimate/, /A film in no Mix is legitimate/],
    ["and is left alone", /Do not sort them, propose Mixes for them, or mention them\s*unasked/,
      /Do not sort them, propose Mixes for them, or mention them\s*unasked/],
  ];

  for (const [what, inSkill, inProjection] of behaviours) {
    assert.match(canonical, inSkill, `the skill lost: ${what}`);
    assert.match(projected, inProjection, `the projection lost: ${what}`);
  }

  // The canonical wording must not also reach this target, or the section would ship
  // twice and the compact block would save nothing.
  assert.doesNotMatch(projected, /Two requests write a Movie, and they differ/,
    "both wordings of the write flow reached the projection");
  assert.doesNotMatch(projected, /may I save this/,
    "the canonical framing of the Mix question reached the projection");
});

test("the compact projection of the taste model says the same thing the skill does", () => {
  /**
   * Strategy 9.5, third use of the mechanism. P3 and P5 are the semantics most
   * likely to be lost in a shorter wording, because the losses are quiet: a Mix
   * described in fewer words easily reads as a filter again, and states described
   * in fewer words easily read as a gate.
   */
  const canonical = canonicalSkill().replace(/\s+/g, " ");
  const projected = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  const behaviours: [string, RegExp, RegExp][] = [
    ["the model is read either way", /Read `get_taste`\s*either way/, /Read `get_taste` either\s*way/],
    ["tonight's words bind", /What they said tonight binds/, /What they said tonight binds/],
    ["an exclusion is mode-dependent",
      /binds only when they asked for their taste/, /binds only when they asked for their taste/],
    ["a non-binding exclusion is not mentioned",
      /one that does not bind is \*\*not mentioned either\*\*/,
      /when it does not bind it is \*\*never\s+mentioned\*\*/],
    ["the positive preference used is recognisable in the answer",
      /the positive preference that shaped\s+the answer is recognisable in it/,
      /show the positive evidence you used/],
    ["and naming it is one way rather than the only one",
      /is one\s+way to do that and not the only one/, /show the positive evidence/],
    ["and is the only thing that is",
      /Everything else in the model is evidence either way/, /Everything else is evidence either way/],
    ["discovery explores from what they wrote",
      /what they have written is where you explore from/, /you are exploring, from what they wrote/],
    ["taste-aware makes the model the brief",
      /Now the model is the brief, and its exclusions hold/, /the model is the brief, and its\s*exclusions hold/],
    ["a matching Mix is a reason",
      /a Mix that matches is a reason\s*the recommendation fits/,
      /A matching Mix is a reason the recommendation fits/],
    ["it counts immediately", /counts from\s*the moment it exists/, /counts from the moment it exists/],
    ["an empty Mix says as much as a full one",
      /nothing under it yet says as much about what\s*they like as one with ten films under it/,
      /nothing under it, says as much as one with ten films/],
    ["a Genre is thinner", /A Genre is an ingredient/, /A Genre is an ingredient/],
    ["states calibrate rather than gate",
      /Movie states calibrate that evidence. They never decide whether it counts/,
      /States calibrate it, never decide whether it counts/],
    ["loved strengthens", /`loved`\s*strengthens it/, /`loved` strengthens/],
    ["liked less so", /`liked` strengthens it more weakly/, /`liked` more\s*weakly/],
    ["disliked is a sign, not a ban", /negative sign, not a ban/, /a sign, not a ban/],
    ["absence is not negative evidence",
      /`not_seen` and `null` are absence of experience, never evidence\s*against/,
      /`not_seen` and `null` are\s*absence of experience, not evidence against/],
    ["an empty Mix changes phrasing, not eligibility",
      /never whether you use it/, /never whether you use it/],
    ["intent stays certain while the fit does not",
      /what\s+they meant is not in question/, /intent certain/],
    ["no film is confirmed to fit it yet",
      /no particular film has been confirmed to fit it yet/, /fit unconfirmed/],
    ["and the lead is said as the best you know",
      /it is\s+the best you know of, said as that/, /the best you know of, said\s+as that/],
    ["to say how sure it is", /Say how sure you are/, /Say how sure you are/],
  ];

  for (const [what, inSkill, inProjection] of behaviours) {
    assert.match(canonical, inSkill, `the skill lost: ${what}`);
    assert.match(projected, inProjection, `the projection lost: ${what}`);
  }

  // Both wordings must not ship: the canonical passage is the longer one, and its
  // presence here would mean the compact block saved nothing.
  assert.doesNotMatch(projected, /not a\s*setting that one kind of request switches on/,
    "both wordings of the taste model reached the projection");
});

test("an ordinary request is answered, never only interviewed", () => {
  /**
   * R1 of `docs/work/phase-1-repairs.md`, repairing the AC1 failures in the
   * `645a831f` candidate: three of five empty-model runs and one ordinary
   * failure-fallback run asked a clarifying question **instead of**
   * recommending.
   *
   * The licence was here rather than in either branch — *"ask one question
   * about films if something important is missing"*, stated in the section that
   * governs every recommendation, read as permission to ask in place of
   * answering. It outranked `answer anyway` three sections later, which is why
   * the same defect appeared with an empty model and after a failed read.
   *
   * The question survives; what it may no longer do is replace the answer.
   */
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  for (const [what, rule] of [
    ["that the request is answered with a film",
      /(the answer is a film, not a question|answer with a film)/i],
    ["that a question goes in the answer, never in place of it",
      /in the answer[^.]{0,30}never instead/i],
    ["that an empty model is no exception",
      /(an empty model is no exception|even with an empty model)/i],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the agent is never told ${what}`);
  }

  // The question is still permitted — R1 removes the substitution, not the ask.
  assert.match(flat, /ask \*\*one (question about films|film question)\*\*/i);

  // The skill says the same rule at greater length; the projection carries a
  // shorter wording of it. Both must say it, or the two have drifted.
  const canonical = canonicalSkill().replace(/\s+/g, " ");
  for (const [what, inSkill, inProjection] of [
    ["the answer is a film",
      /they asked for a film and the answer is one/, /answer with a film/],
    ["a question does not replace it",
      /in the answer, never instead of it/, /in the answer[^.]{0,30}never instead/],
    ["an empty model is no exception",
      /An empty model is not\s+an exception/, /even with an empty model/],
  ] as [string, RegExp, RegExp][]) {
    assert.match(canonical, inSkill, `the skill lost: ${what}`);
    assert.match(flat, inProjection, `the projection lost: ${what}`);
  }

  // And the Step 4 obligations it defers to are untouched.
  for (const shape of [
    "One idea for the evening, in a line",
    "one lead, named as such",
    "two or three **directions**",
    "Close with one question **or** one lever, never both",
  ]) {
    assert.ok(flat.includes(shape.replace(/\s+/g, " ")), `the answer shape lost: ${shape}`);
  }
});

test("R1 does not force the branch that is required to stop", () => {
  /**
   * The one request that owes no recommendation is a taste question whose taste
   * read failed: §10.1.1 says it stops. R1 makes the ordinary request always
   * produce an answer, and must not reach across into that branch — the two
   * live in different sections and the failure branch is the more specific.
   */
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  // The two branches read separately. Spanning both would let a recommendation
  // obligation injected into the taste branch pass on the ordinary branch's
  // "answer anyway" — the branches are adjacent and share a bullet, so the slice
  // has to stop where the other begins.
  const taste = flat.slice(flat.indexOf("*Taste question*"), flat.indexOf("*Ordinary*"));
  const ordinary = flat.slice(flat.indexOf("*Ordinary*"), flat.indexOf("**A write fails**"));
  assert.ok(taste.length > 20 && ordinary.length > 40, "the failure branches could not be found");

  assert.match(taste, /\bstop\b/, "the taste branch no longer stops");

  // R1's obligation lives in `## Recommending`, and must not be restated here in
  // any of its wordings. A branch told to stop and also told to recommend is a
  // contradiction the more specific rule would be expected to lose.
  for (const [what, leak] of [
    ["the current projection wording", /answer with a film/i],
    ["an earlier wording of the same rule", /the answer is a film/i],
    ["the ordinary branch's instruction", /answer anyway|recommend anyway/i],
    ["the answer shape itself", /one lead|two or three (directions|\*\*directions)/i],
    ["any other instruction to recommend", /\b(recommend|suggest|offer)\s+(a film|one|something)\b/i],
  ] as [string, RegExp][]) {
    assert.doesNotMatch(taste, leak, `the taste branch was given ${what}`);
  }

  // And the ordinary branch keeps its opposite obligation, which is R1 reaching
  // it through the shared section rather than through a copy of the rule.
  assert.match(ordinary, /answer anyway/, "the ordinary branch no longer answers");
});

test("the version marker is the last line, and is derived from the body without it", () => {
  const lines = PROJECT_INSTRUCTIONS.split("\n");

  // Trailing newline, then the marker, then the blank line separating it from
  // the instructions — the three steps of the transform, read backwards.
  assert.equal(lines.at(-1), "", "the text should end with a newline");
  assert.equal(lines.at(-2), markerFor(PROJECT_INSTRUCTIONS_VERSION));
  assert.equal(lines.at(-3), "", "the marker should stand alone after a blank line");

  // Hashing text that already carried the digest would be circular, so the
  // digest covers the body as it stands after the frontmatter is stripped and
  // before anything is appended.
  assert.equal(PROJECT_INSTRUCTIONS_VERSION, versionOf(instructionsFrom(skill())));

  // A change anywhere in the instructions has to reach the version, or a stale
  // paste would keep claiming to be current.
  assert.notEqual(PROJECT_INSTRUCTIONS_VERSION, versionOf(instructionsFrom(skill()) + "edited\n"));
});

/**
 * The cap, measured rather than guessed.
 *
 * A 22,080-character version pasted into a ChatGPT project was cut off at 8,083
 * with nothing to say so — more than half the skill never reached the agent. That
 * is what `full:start` … `full:end` exists for, and this is what stops it
 * regressing.
 */
const CAP = 8000;

/**
 * Where the guard sits.
 *
 * Above the 6,800 originally aimed for. The complete normative contract measures
 * ~7,700 written telegraphically, and the last 900 characters are not prose but
 * rules — reaching 6,800 would mean dropping some. The number here is therefore
 * what the contract actually costs plus a little room; lowering it is a product
 * decision about which rules stop reaching the agent, not an editing task.
 */
const GUARD = 7900;

test("all of the instructions fit in a ChatGPT project, with room to spare", () => {
  assert.equal(PROJECT_INSTRUCTIONS_LENGTH, PROJECT_INSTRUCTIONS.length);
  assert.ok(PROJECT_INSTRUCTIONS_LENGTH > 0);

  assert.ok(
    PROJECT_INSTRUCTIONS_LENGTH < CAP,
    `the instructions are ${PROJECT_INSTRUCTIONS_LENGTH} characters and would be truncated at ${CAP}`,
  );
  assert.ok(
    PROJECT_INSTRUCTIONS_LENGTH <= GUARD,
    `the instructions are ${PROJECT_INSTRUCTIONS_LENGTH} characters, past the ${GUARD} guard — ` +
      "move rationale between full:start and full:end rather than raising this",
  );
});

test("nothing marked full-skill-only reaches the agent", () => {
  // Both that the blocks are gone and that the markers themselves are: a stray
  // `<!-- full:end -->` in the output would mean the regex matched nothing and
  // the whole file shipped.
  assert.doesNotMatch(PROJECT_INSTRUCTIONS, /full:(start|end)/);

  for (const onlyInTheSkill of [
    "want to watch  →  recommend",
    "A Mix name is evocative, not descriptive",
    "playlist somebody made at two in the morning",
    "Knives Out",
    "| Ask this | Not this |",
  ]) {
    assert.equal(
      PROJECT_INSTRUCTIONS.includes(onlyInTheSkill),
      false,
      `"${onlyInTheSkill}" is rationale and should not be spending the agent's budget`,
    );
  }
});

test("an unbalanced marker is an error rather than a silent half-copy", () => {
  // Left to the regex, a missing `full:end` eats the rest of the file and a
  // missing `full:start` keeps a block. Both ship the wrong instructions and
  // neither says anything.
  assert.throws(() => instructionsFrom("---\nname: x\n---\n\n<!-- full:start -->\nrationale\n"), {
    message: /unbalanced/,
  });
});

test("every rule the agent cannot work out for itself is in the text it is given", () => {
  // The contract is asserted against the GENERATED instructions, not the skill.
  // Marking a block full-skill-only is a one-line edit, and until this test
  // existed it could quietly take a rule out of the agent's hands.
  for (const rule of [
    // scope and boundaries
    "There is no setup",
    "Never look in Tonight for films to recommend",
    "Never write a Genre, a Mix or a Movie anywhere but Tonight",
    "Never ask for or pass an account id",
    // reading and recommending
    "Read `get_taste` either",
    "binds only when they asked for their taste",
    "A matching Mix is a reason the recommendation fits",
    "States calibrate it, never decide whether it counts",
    "exclusions hold",
    "Never print the taste model while",
    "one lead, named as such",
    "distance from the lead",
    "rule a Movie out as new",
    "out of being called new or unseen",
    "`not_seen` does not",
    "Anchor a stretch in something they like",
    // ownership and semantic confirmation
    "Persist durable taste they express or confirm. Never persist what you conclude alone.",
    "only the meaning they could agree to",
    "is not asking permission",
    "writes **nothing** — what they want now, not what they are like",
    "watched and said nothing about writes **nothing**",
    "Never infer a preference from silence",
    "Say so and let them decide",
    // genre against mix
    "A Genre is named for what it is; a Mix for what it feels like",
    "Never stretch a Mix to avoid making one",
    // movies
    "Never write a Movie this way without at least one Mix",
    "Never invent a Mix, or ask for one, to record",
    "not a bucket",
    "do not save the film yet",
    "Never ask which Mix they want",
    "Those films are illustration only",
    "A yes is the whole of the permission",
    "never ask a second time",
    "A film in no Mix is legitimate",
    "Do not sort them, propose Mixes for them, or mention them unasked",
    "A recommendation is not a saved Movie",
    "never ask for a state their sentence gave you",
    "Which sentence means which state is in `create_movie`",
    "arrive with `create_genre` and `create_mix`",
    "Settle title and year first",
    // what Tonight is and is not — the boundary, stated so neither half is lost
    "get_taste` returns their saved Movies",
    "no Tonight tool turns a taste into film recommendations",
    // the model is inspected and managed in conversation, in plain sentences
    "## Asked about the model directly",
    "**do those**",
    "call `get_taste` and answer in ordinary sentences",
    // failures
    "offer to retry",
    "*Taste question*: stop",
    "*Ordinary*: answer anyway",
    "claim nothing about them",
    "never that it was stored",
  ]) {
    // Compared with whitespace collapsed on both sides, because where a sentence
    // wraps is a detail of the source file and not of the contract.
    const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");
    assert.ok(
      flat.includes(rule.replace(/\s+/g, " ")),
      `the agent is never told: ${JSON.stringify(rule)}`,
    );
  }
});
