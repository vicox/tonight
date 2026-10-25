import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SHARED_QUALIFIERS,
  sharedRetry,
} from "../../skills/tonight-recommend/contracts.mjs";

/**
 * What `tonight-recommend` has to keep telling the agent, asserted against the
 * skill itself.
 *
 * `skills/tonight-recommend/SKILL.md` is the text a host loads, whole: the plugin
 * packages it byte for byte (`chatgpt-plugin/test.sh`), and there is no second
 * rendering of it to check instead. What is asserted here is behaviour — that a
 * rule is stated, in which section and in what order, and that what it replaced
 * has not come back. `skills/tonight-recommend/test.sh` holds the same file to its
 * own list, and the two share their definitions through `contracts.mjs`.
 */

const SKILL = new URL("../../skills/tonight-recommend/SKILL.md", import.meta.url);

const skill = () => readFileSync(SKILL, "utf8");

/** The skill with whitespace collapsed: where a sentence wraps is not part of a contract. */
const flatSkill = () => skill().replace(/\s+/g, " ");

test("surfacing a pattern stays optional, and gated on the taste looking durable", () => {
  // An earlier wording had turned a judgement into an instruction: ask, every
  // time. That makes an ordinary recommendation into a save prompt, which is the
  // one thing this product is trying not to be.
  const flat = flatSkill();

  assert.match(flat, /looks lasting\? You \*\*may\*\*/, "the durability gate is gone");
  assert.match(flat, /You \*\*may\*\* ask/, "asking has become obligatory");
  assert.match(
    flat,
    /an ordinary recommendation or a mood for tonight is no reason to/,
    "nothing stops a taste-confirmation prompt after every answer",
  );
});

test("the boundary says what Tonight does return, not only what it refuses", () => {
  // "No tool here returns films" was false — `get_taste` returns the films they
  // saved. What is actually true is narrower and more useful: no tool turns a
  // taste into a recommendation. Losing that distinction either hides their own
  // Movies from them or implies Tonight does the choosing.
  const flat = flatSkill();

  assert.match(flat, /`get_taste` returns what they saved, not a shortlist/);
  assert.match(flat, /no tool here turns a taste into films/);
  assert.equal(flat.includes("No tool here returns films"), false);

  // Instructions belong to Genres and Vibes; a Movie carries state. What each of
  // those requires is now stated by the tool that writes it, so what the
  // instructions carry is the shape and a pointer.
  assert.match(flat, /Tonight's evidence is what they told it\*\* — Genres, Vibes, Movies, verdicts/);
  assert.match(flat, /Read a Vibe as \*\*its own instruction/);
  // The construction half of the same rule. A Vibe is read as its sentence over
  // its Genres' sentences, and it has to be *written* that way too — the three
  // are one idea or the object is incoherent. Only the fact belongs here; what
  // to do about it when creating or changing one is create_vibe's and
  // update_vibe's, where the change is being made.
  assert.match(flat, /in that order — the\s+three are one idea/);
  assert.match(flat, /arrive with `create_genre` and `create_vibe`/);
  // The verdict routing is stated where the two requests about a film are told
  // apart, and the `viewing` pointer where a recommendation is told from a save.
  assert.match(flat, /that is a verdict, liked, loved or disliked, and it goes to `record_verdict`/);
  assert.match(flat, /`create_movie` carries `viewing` and no opinion/);

  // And the ratings wording was too broad twice over: liked and disliked are
  // real things the user said, and only a score is out of scope. Both of the
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
  const flat = flatSkill();

  // Each pattern is deliberately broader than the sentence that moved. A rule
  // that came back reworded is the same duplicate as one that came back verbatim,
  // and the narrow form of this check could not see the difference.
  for (const [what, gone] of [
    ["the sentence-to-state readings", /at its most specific|→ `liked`|→ `loved`|→ `disliked`/i],
    ["the instruction's voice", /first person/i],
    ["the rewording prohibition", /reword/i],
    [
      "the write invariants",
      /always needs an instruction|at least one existing Genre|built from Genres only|built from another Vibe|no chaining/i,
    ],
    ["the score prohibition", /score/i],
    ["the Vibe naming test", /already tells you the name|what would I get wrong|the instruction test/i],
    // The viewing answers themselves stay: the skill still says what a *stored*
    // answer means when recommending. What moved is what *saving* does to the field.
    [
      "what saving does to the state",
      /never makes it `unseen`|nothing said is `null`|absence is never unseen|not the same as unseen/i,
    ],
  ] as [string, RegExp][]) {
    assert.equal(gone.test(flat), false, `${what} is still stated in the skill as well`);
  }

  // And a pointer is left where the skill still has to refer to the behaviour,
  // so a reader is sent somewhere rather than left with a gap.
  assert.match(flat, /arrive with `create_genre` and `create_vibe`/, "no pointer for the write rules");
  assert.match(
    flat,
    /`create_movie` carries `viewing` and no opinion/,
    "no pointer for the viewing field",
  );
});

test("what is conversation rather than a field stays here", () => {
  // The two the Step 2 review sent back. Both are about what to do *before* a
  // call rather than about what a call may contain, and a description cannot be
  // read before the call it describes.
  const flat = flatSkill();

  assert.match(flat, /[Nn]ever ask for what their sentence gave you/, "asking before calling");
  assert.match(flat, /Say so and let them decide/, "how a change is agreed to");
  assert.match(
    flat,
    /`create_movie` carries `viewing` and no opinion/,
    "where an opinion goes instead of a Movie field",
  );
});

test("both kinds of request read the model; only an exclusion is mode-dependent", () => {
  /**
   * Step 6, adopting P3. Rewritten rather than deleted: the distinction it pinned
   * still exists, but what turns on it has changed.
   *
   * It used to be that nothing persisted bound a plain request — the model was not
   * read at all unless somebody asked for it. That protected a new user from having
   * two Genres narrowed into a filter, and it also meant the Vibe written last night
   * had no effect on tonight's answer, which makes the product's own loop false.
   *
   * What replaces it is narrower and stronger: the model is evidence on any night,
   * and the single thing that depends on what was asked is whether an exclusion
   * *written into an instruction* binds. Tonight's own words bind absolutely either
   * way, which is what stops evidence-always from becoming a filter-always.
   */
  const flat = flatSkill();

  for (const [what, rule] of [
    ["that there are two kinds of request", /Two kinds of request, told apart from what they said/],
    ["that it is never asked about", /never by asking/],
    ["to read the model either way", /Read `get_taste`\s*either way/],
    ["that what is written is evidence on any night",
      /What they have written down is evidence about what they like on any night/],
    ["that tonight's words bind", /What they said tonight binds/],
    ["that this includes tonight's exclusions", /ruled out just now/],
    ["that availability binds too", /can watch/],
    ["which one is the default", /\*\*Discovery is the default\*\*/],
    ["that discovery is exploring", /you are exploring/i],
    ["and explores from what they wrote", /what they have written is where you explore from/],
    ["when taste leads instead", /\*\*Taste-aware is what they ask for\*\*/],
    ["that the model is then the brief", /the model is the brief/],
    ["that its exclusions then hold", /exclusions hold/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the agent is never told ${what}`);
  }

  // The one mode-dependent thing, stated as the exception it is.
  const exclusion = flat.slice(
    flat.indexOf("An exclusion written into"),
    flat.indexOf("Discovery is the default"),
  );
  assert.ok(exclusion.length > 80, "the exclusion rule could not be found");
  assert.match(exclusion, /binds only when they asked for their taste/,
    "the exclusion is not scoped to a taste request");
  assert.match(exclusion, /Everything else in the model is evidence either way/,
    "the exception is not bounded, so it reads as the rule");

  // R3, both halves in one breath. Either alone is a way to pass while failing:
  // the retained candidate had runs that used the model by narrating the
  // exclusion, and runs that stayed silent about it and showed no model at all.
  // One certification run waived the exclusion aloud, which is why the failure
  // form is named and not only the conclusion.
  assert.match(exclusion, /one that does not bind is \*\*not mentioned either\*\*/i,
    "a non-binding exclusion may still be surfaced");
  assert.match(exclusion, /not raised, not contrasted with, not waived out loud/i,
    "the ways of mentioning it are no longer named");
  assert.match(exclusion, /the positive preference that shaped\s+the answer is recognisable in it/i,
    "positive evidence need not be visible in the answer");

  // The visibility rule is about a *positive* preference, and about it being
  // recognisable rather than named. Dropping "positive" would let an exclusion
  // narrated in passing satisfy it — the very run the candidate recorded — and
  // mandating a name would rule out a paraphrase the user would recognise as
  // their own, which the approved behaviour allows.
  assert.match(exclusion, /positive/i, "the visibility rule does not require positive evidence");
  assert.match(exclusion, /is one\s+way to do that and not the only one/,
    "naming a stored object is no longer one way among others");
  assert.doesNotMatch(exclusion, /\b(must|always) name\b|\bname (the|a) (Vibe|Genre)\b/i,
    "the skill makes literal naming mandatory");

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

test("a Vibe is evidence, and the verdicts under it calibrate rather than gate", () => {
  /**
   * Step 6, adopting P5 — the highest-risk change in Phase 1.
   *
   * The rule this replaces said a Genre or Vibe existing is not evidence they like
   * it, and that what makes one trustworthy is the film states under it. That reads
   * as a gate: no states, no weight. It is also the product's own loop denied — the
   * Vibe written in last night's conversation is exactly the one tonight's answer
   * should be using, and it is the most current thing the user has said.
   *
   * So: a Vibe is declarative evidence from the moment it exists, and verdicts are
   * confirmatory — they move confidence, never eligibility. A Vibe with no verdict
   * under it is less certain about specifics and no less weighty about intent.
   */
  const flat = flatSkill();

  for (const [what, rule] of [
    ["that a matching Vibe is a reason, not a filter",
      /a Vibe that matches is a reason\s*the recommendation fits/],
    ["that it counts immediately", /counts from\s*the moment it exists/],
    // M5: a Vibe written since S2 always holds its core, so "nothing under it"
    // stopped describing anything new. What still varies is whether a verdict
    // stands under it, which was the point of the rule all along.
    ["that a new Vibe says as much as a full one",
      /only its core under it says as much about\s*what they like as one with ten films under it/],
    ["that a Genre is thinner", /A Genre is an ingredient/],
    ["that a Genre name alone justifies nothing", /justified only by a Genre name is justified by a label/],
    ["that verdicts calibrate", /Verdicts calibrate that evidence\. They never decide whether it counts/],
    ["that a Movie carries no opinion", /A Movie carries no opinion at all/],
    ["that loved strengthens", /`loved`\s*strengthens it/],
    ["that liked strengthens less", /`liked` strengthens it more weakly/],
    ["that disliked weakens the similar", /`disliked` weakens something similar/],
    ["that disliked is not a ban", /negative sign, not a ban/],
    // Not "leaves nothing", which was false of a scoped one: taking back an
    // evening's refusal leaves a judgement about the film exactly where it was.
    ["what a withdrawal removes", /taking a verdict back removes that\s*act from what stands/],
    ["that it leaves no weaker opinion", /leaves no quieter opinion underneath it/],
    ["that a withdrawal is not an unsaying", /it is not an unsaying/],
    ["that viewing is a fact and not taste",
      /`viewing` says where the film stands on their list and\s*that is a fact, never a sign for or against/],
    ["how a Vibe with no verdict is read", /less confidence about specifics and just as\s*much about intent/],
    ["that describing the match stays allowed", /say how well a film answers what the Vibe asks for/],
    ["that their verdict may not be claimed", /What you may not say is that \*\*they\*\*\s*like it/],
    ["that this changes reach, not eligibility", /never whether you use it/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the agent is never told ${what}`);
  }

  // The gate, in every form the strategy names. A Vibe is never classified as
  // counting or not counting, and no word grades one as provisional.
  assert.doesNotMatch(flat, /A Genre or Vibe existing is not evidence they like it/i,
    "the pre-P5 rule is still here");
  assert.doesNotMatch(flat, /What makes one trustworthy is the film states under it/i);
  assert.doesNotMatch(flat, /\b(aspirational|untested|unproven|provisional)\b/i,
    "a Vibe is graded by a label the strategy rejects");
  assert.doesNotMatch(flat, /(Vibe|Genre)[^.]{0,40}\b(does not count|doesn't count|no weight)\b/i,
    "something in the text classifies a Vibe as not counting");
});

test("an unconfirmed Vibe bounds the claim about a film, never the Vibe itself", () => {
  /**
   * R4 of `docs/work/phase-1-repairs.md`. The candidate produced *"about as pure
   * a fit for Reading Room as exists"* for a Vibe with nothing under it — maximal
   * certainty that a **particular film** matched, while nothing had yet confirmed
   * that anything did.
   *
   * The repair is to the language of the recommendation, not to the standing of
   * the Vibe. P5 is untouched: the Vibe counts fully and immediately, verdicts
   * calibrate rather than gate, and confidence about what the user *meant* is
   * never reduced — only confidence that this film is the thing they meant.
   */
  const flat = flatSkill();
  const bullet = flat.slice(
    flat.indexOf("A Vibe with no verdict under it"),
    flat.indexOf("Either way"),
  );
  assert.ok(bullet.length > 60, "the unconfirmed-Vibe rule could not be found");

  // Intent is certain; what they made of any film is what is not.
  assert.match(bullet, /just as much about intent/i, "confidence about intent was reduced");
  assert.match(bullet, /what they meant is not in question/i, "confidence about intent was reduced");
  assert.match(bullet, /no particular film has been confirmed to fit it yet/i,
    "what is unconfirmed is not named");
  // Describing the match is the thing a written Vibe makes checkable, so it stays allowed.
  assert.match(bullet, /say how well a film answers what the Vibe asks for/i, "describing the match was forbidden");
  // What is refused is a verdict they never gave. Two sweeps failed while the rule
  // chased phrasing instead; the rule names the claim rather than the words.
  assert.match(bullet, /What you may not say is that \*\*they\*\* like it/i, "their verdict may still be claimed");
  assert.match(bullet, /their verdict is what they said about the film, and there is none yet/i,
    "the missing verdict is not named");
  // The Vibe still counts: this changes how you speak, not whether you use it.
  assert.match(bullet, /never whether you use it/i, "an unconfirmed Vibe stopped counting");

  // None of the rejected mechanisms came back with it.
  assert.doesNotMatch(flat, /\b(aspirational|untested|unproven|provisional|tentative Vibe)\b/i,
    "a Vibe is graded by a label the strategy rejects");
  assert.doesNotMatch(bullet, /\b(score|weight|threshold|points?|at least \d+|\d+ or more)\b/i,
    "the rule acquired arithmetic");
});

test("taste is read qualitatively — no score, no threshold, no count", () => {
  /**
   * The rules in this passage describe evidence getting stronger or weaker. They
   * must not turn into arithmetic: a weight, a points scheme or a minimum number of
   * films would be a second taste model, kept in the agent's head, that nobody can
   * read or correct — and a count of states deciding whether a Vibe counts is the
   * exact P5 regression Step 6 exists to remove.
   *
   * Scoped to this passage rather than the file. Numbers are legitimate elsewhere —
   * "three to five other films", "two or three directions" — and this is the one
   * place where a number would be a rule about how much taste is worth.
   */
  const flat = flatSkill();
  const from = flat.indexOf("Two kinds of request");
  const to = flat.indexOf("Either way", from + 1);
  assert.ok(from >= 0 && to > from, "the recommendation-model passage could not be found");
  const passage = flat.slice(from, to);
  assert.ok(passage.length > 200, "the passage is too short to be the right one");

  for (const [what, pattern] of [
    ["points or scoring", /\b(points?|scores?|scoring|scored)\b/i],
    ["a threshold", /\bthresholds?\b/i],
    ["weighting", /\bweigh(t|ts|ted|ting)\b/i],
    ["a minimum count", /\bat least \d+|\b\d+ or more\b/i],
    ["a numeric state count", /\b\d+\s+(loved|liked|disliked|seen|films?|states?)\b/i],
    ["a spelled state count", /\b(one|two|three|four|five|several)\s+(loved|liked|disliked)\b/i],
    ["a gate on counting", /\bbefore it counts\b|\bbefore trusting\b/i],
    ["counting states", /\bcount(s|ing)?\s+(the\s+)?(loved|liked|films|states)\b/i],
  ] as [string, RegExp][]) {
    assert.doesNotMatch(passage, pattern, `the skill reads taste as arithmetic: ${what}`);
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
  const flat = flatSkill();

  for (const [what, rule] of [
    ["to open with an idea", "One idea for the evening, in a line"],
    ["that exactly one film leads", "one lead, named as such"],
    ["the sentence that commits to it", `*"I'd start with X"*`],
    ["to say why it, for them", "and why it, for them"],
    ["how many directions follow", "two or three **directions**"],
    ["when each direction is offered", "opened by when it wins"],
    ["what orders them", "distance from the lead"],
    ["how to close", "Close with one question **or** one lever, never both"],
    // The shape is only worth stating if it is the thing the user receives. A run
    // of the 7cd5b2e3 sweep put its whole recommendation into a record_episode
    // call and replied with one follow-up sentence, which satisfied every rule
    // above and left the user with no film.
    //
    // Said with its condition attached, which is the b343335b repair: unconditioned,
    // the rule reads as "an answer is always owed", and a run of that sweep applied
    // it inside the branch that must stop.
    ["that the answer is what reaches them", "a tool call is not an answer"],
    ["that the rule holds where an answer is owed", "Where an answer is owed"],
  ] as [string, string][]) {
    assert.ok(flat.includes(rule.replace(/\s+/g, " ")), `the agent is never told ${what}`);
  }

  // A direction is an alternative rather than a ranking.
  assert.match(flat, /another way out, never a\s+runner-up/);

  // A quality order says "this is the fourth best", which is useless and probably
  // false. The prohibition has to be explicit: leaving it out reads as a free choice.
  assert.match(flat, /distance from the lead\*\*, not\s+quality/);

  // The old form was a menu, and the menu is what the shape replaces.
  assert.doesNotMatch(flat, /three to six|six films|\b3 to 6\b/i);
});

test("how many Genres stays guidance: two is the usual shape, a third is conditional", () => {
  /**
   * The rule is *"usually two meaningful, distinct ones in all, a third only when
   * it holds a part the two do not, never filler to hit a number"*. The parts pull
   * against each other: the number says what usually works, the hedge says it is
   * not a quota, the condition keeps a third from being as ordinary as two, and
   * `never filler` stops any of it being hit for its own sake.
   *
   * A wording that keeps the number and drops the hedge reads as "create two
   * Genres", which is a rule the skill does not have — a Vibe on one Genre is
   * still a Vibe — and the failure is invisible, because every word in it came
   * from the sentence it replaced. The earlier "often two or three" made a third
   * the same default as a second; it is checked gone so the two cannot stand side
   * by side.
   */
  const flat = flatSkill();
  const at = flat.search(/two meaningful, distinct ones/);
  assert.ok(at >= 0, "the guidance on how many Genres could not be found");

  // The hedge sits with the number, not somewhere else in the document.
  const clause = flat.slice(Math.max(0, at - 60), at + 140);
  assert.match(clause, /\b(often|usually|commonly|typically|tend|can be|may be)\b/,
    "the skill states two as a requirement rather than the usual shape");

  // A third is allowed, and only on a condition.
  assert.match(clause, /a third only when/, "a third Genre is no longer conditional");

  // And padding to reach any of it is still forbidden.
  assert.match(clause, /never filler to hit a number/,
    "the skill names a count without forbidding padding to reach it");

  assert.doesNotMatch(flat, /two or three strong, complementary ones/,
    "the old two-or-three wording is back beside the new one");
});

test("a film they have seen or judged is not offered as a new one", () => {
  /**
   * P4 and P10. The target is what they have not seen or judged — which is not the
   * same as what Tonight has never heard of. `want-to-see` is their list: they have
   * *not* seen the film and want to, which is a reason to offer it, so it is the
   * state that keeps a Movie eligible. `dont-want-to-see` is never offered. A `loved`
   * film is spent as evidence instead, which is worth more than suggesting it again.
   */
  const flat = flatSkill();

  for (const [what, rule] of [
    ["what the target is", "Lead with what they have not seen or judged"],
    ["what rules a film out",
     "`viewing` of `seen` rules a Movie out as new,\nand so does a standing judgement"],
    ["why a judgement does", "**nobody likes a film they have not seen**"],
    ["that want-to-see does not", "`want-to-see`\ndoes not rule it out"],
    ["that a film on the list stays eligible", "so it stays on the table"],
    ["that dont-want-to-see is never recommended", "**`dont-want-to-see` is\nnever recommended**"],
    ["that a turn-down proves nothing about watching", "A turn-down is not evidence they saw it"],
    ["that being ruled out covers being called new", "never called new, unseen or not yet watched"],
    ["what a loved film is for", "`loved` one is a **reason**, not a suggestion"],
    ["that a stretch needs a positive anchor", "Anchor a stretch in something they like"],
    ["that an absence is not a reason", "an absence shows where to look, never why"],
    ["to mark a stretch as one", "say it is one"],
  ] as [string, string][]) {
    assert.ok(flat.includes(rule.replace(/\s+/g, " ")), `the agent is never told ${what}`);
  }

  // Negative half: what rules a Movie out is having watched it — said outright,
  // or implied by a standing judgement. `want-to-see` joining that would silently
  // turn "put it on my list" into a reason to withhold the film, which is the
  // precise inversion of the rule.
  const ruledOut = flat.slice(flat.indexOf("`viewing` of `seen`"), flat.indexOf("`want-to-see` does not"));
  assert.ok(ruledOut.length > 0 && ruledOut.length < 300, "the sentence that rules a film out moved");
  assert.doesNotMatch(ruledOut, /`want-to-see`/);

  // Positive half: absence from that list is not enough on its own — a reader could
  // still conclude that a film Tonight has heard of is spent. Somewhere after the
  // list, `want-to-see` must be named and said to remain available, and the
  // sentence saying so must not be a negation of eligibility.
  const after = flat.slice(flat.indexOf("rules a Movie out as new"));
  const eligibility = after.slice(after.indexOf("`want-to-see`"), after.indexOf("**`dont-want-to-see`"));
  assert.ok(eligibility.includes("`want-to-see`"), "`want-to-see` is never mentioned as still eligible");
  assert.match(
    eligibility,
    /does not|still|remains|stays/,
    "`want-to-see` is named but never said to remain available",
  );
  assert.doesNotMatch(
    eligibility,
    /\bnever (offer|present|suggest)|not (offered|presented|eligible)|(?<!not )rules? (it|a Movie) out/,
    "the text treats a `want-to-see` film as spent",
  );

  // And the target may not be restated as "what Tonight has heard nothing about",
  // which reads on films on their list as well and is how this rule was wrong before.
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
 * between: "never ask X, or require learning Genres and Vibes" forbids both,
 * because `or` continues the negation; "never ask X, but require learning
 * Genres and Vibes" forbids only the first, because `but` turns against it.
 *
 * No spelling of the negation is privileged — "never", "do not" and "don't" are
 * the same rule, and pinning one of them would fail valid wording.
 */
const LEARN_THE_MODEL =
  /\b(?:mak(?:e|es|ing)\s+\S+\s+learn|requir(?:e|es|ing)\s+learning|teach(?:ing)?)\s+Genres and Vibes/i;
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
  // over the skill, so the two suites cannot diverge on which qualifiers count or
  // on which direction is checked.
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
    "never make somebody learn Genres and Vibes",
    "never require learning Genres and Vibes",
    "do not require learning Genres and Vibes",
    "don't make somebody learn Genres and Vibes",
    'never *"what genres do you like?"*, or require learning Genres and Vibes.',
    "never ask about genres, and never require learning Genres and Vibes",
  ]) {
    assert.ok(forbidsLearningTheModel(negative), `a valid prohibition was rejected: ${negative}`);
  }

  for (const affirmative of [
    "require learning Genres and Vibes",
    "make somebody learn Genres and Vibes",
    "never ask what genres they like, but require learning Genres and Vibes",
    "never print the taste model. Require learning Genres and Vibes.",
    "never print the taste model; require learning Genres and Vibes.",
    "ask one question about films",
  ]) {
    assert.ok(!forbidsLearningTheModel(affirmative), `an affirmative form passed: ${affirmative}`);
  }
});

test("a request for a film is still not a configuration session", () => {
  // The guard that had to survive the rewrite. It is the oldest rule in this section
  // and the one the new answer form is most likely to quietly displace.
  const flat = flatSkill();

  for (const [what, rule] of [
    ["that the one question is about films", /ask \*\*one question about films\*\*/],
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
  // and Vibes" contains it and forbids nothing. What has to hold is that the
  // action is governed by a negation — which survives a coordinator that
  // continues the negation ("never X, or Y") and does not survive one that
  // contrasts with it ("never X, but Y").
  const passage = flat.slice(flat.indexOf("Either way"), flat.indexOf("**The shape"));
  assert.ok(passage.length > 100, "the R1 passage could not be found");
  assert.ok(forbidsLearningTheModel(passage), "the data-model prohibition is not stated as one");
});

test("saving a film classifies it, and may grow the model rather than bend it", () => {
  const flat = flatSkill();

  for (const [what, rule] of [
    ["to classify rather than fit", /Classify the film rather than fitting it to what is there/],
    ["to look before deciding", /read the Genres and Vibes first/i],
    ["to reuse a Genre that fits", /Reuse the Genres that (genuinely )?fit/],
    ["to create one when none covers it", /create one for anything (no Genre covers|uncovered)/],
    ["how many, as guidance rather than a quota",
      /\b(often|usually|commonly|typically)\b[^.—]{0,30}two meaningful, distinct ones/],
    ["and never to pad", /never filler to hit a number/],
    ["not to stretch a Vibe", /Never stretch a Vibe to avoid making one/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the agent is never told ${what}`);
  }
});

test("a proposed Vibe is made tangible before it is agreed to", () => {
  /**
   * A name and a sentence are thin things to agree to. Somebody saying yes to
   * "Everybody Has a Plan" has agreed to a label; somebody who has also seen three
   * films that would sit under it has agreed to the idea — which is what the Vibe
   * has to be worth in a month, when they ask for it by name.
   *
   * The films are the whole risk of this rule. They are named, and everything else
   * in the skill treats a named film as the start of something, so the boundary is
   * pinned here as hard as the behaviour is: illustration, no write, no state, no
   * Vibe, no classification. Only the film they asked to keep is in the flow.
   */
  const flat = flatSkill();

  for (const [what, rule] of [
    ["to show the idea rather than only name it", /make (the idea|it) concrete/],
    ["how many films to name", /three to five other films that would belong/],
    ["to offer other names for it", /two or three (names it could have instead|alternative names)/],
    ["that the asking still comes last", /Then ask/],
    ["that the films are illustration", /Those films are illustration only/],
    ["that they are not written and not filed", /never written, never (in a Vibe|filed)/],
    ["that they get no viewing and no verdict", /never given a viewing or a\s+verdict/],
    // M5: a new Vibe is written with its core, which may be a film of theirs other
    // than the one being kept — so two films are saved, and still no illustration.
    ["what is actually being saved", /only the kept film and the core are saved/i],
    ["that the proposal names its core", /name its core/],
    // A yes covers only the meaning they were shown, and a new Genre is part of
    // what they are agreeing to, so the proposal names the Genres and says what a
    // new one would mean.
    ["that the proposal names its Genres, and what a new one would mean",
      /name its\s+Genres with what any new one would mean/],
    ["and the Vibe is written with it", /then the Vibe with its core/],
    ["that a fitting Vibe skips all of it", /a Vibe that (genuinely )?fits needs none of this/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the agent is never told ${what}`);
  }

  // The illustration must not acquire the vocabulary of the persistence flow: no
  // state named against those films, no count of them to store, no second save.
  const proposal = flat.slice(
    flat.indexOf("**Proposing a new Vibe:**"),
    flat.indexOf("**A film in no Vibe is legitimate**"),
  );

  assert.ok(proposal.length > 200, "the proposal passage could not be found");
  assert.doesNotMatch(proposal, /`(unseen|seen|liked|loved|disliked)`/);
});

test("the model can be inspected and changed in the conversation, in plain sentences", () => {
  const flat = flatSkill();

  assert.match(flat, /## Asked about the model directly/);
  assert.match(flat, /\*\*do those\*\*, in the conversation/);
  assert.match(flat, /the answer is ordinary sentences/);
  assert.match(flat, /is \*a\* management surface, not \*the\* one/);
});

/**
 * Which read answers which question.
 *
 * M3 gave Tonight a second thing to read, and the rule above used to send every
 * read-back to `get_taste` — which was right while that was the only read and
 * became wrong the moment `get_memory` existed. *"What do I like?"* and *"what
 * do you know about me?"* are different questions with different answers, and an
 * agent that cannot tell them apart will either recommend from history or
 * explain a person using only the part of them that drives recommendations.
 *
 * Asserted as behaviour rather than as one sentence: what has to survive is that
 * both tools are named and told apart, in whatever wording carries it.
 */
test("a read-back names both reads, and says which is for what", () => {
  const flat = flatSkill();

  // Both are named where a read-back is decided.
  const section = flat.slice(
    flat.indexOf("## Asked about the model directly"),
    flat.indexOf("## What Tonight remembers"),
  );
  assert.ok(section.length > 100, "the read-back section could not be found");
  assert.match(section, /`get_taste`/, "the taste read is not named where a read-back is decided");
  assert.match(section, /`get_memory`/, "the memory read is not named where a read-back is decided");
  // Not an inclusive "get_taste, or get_memory for the whole of it": that named
  // both reads and gave no criterion, and four certification runs sent a narrow
  // taste question to the wider read. The section states which question each
  // read answers.
  // Both halves of the `get_taste` side. "What they like" alone left
  // *"what are you using to recommend something to me?"* unclaimed, and one
  // targeted run sent it to `get_memory`: the question is about the basis of a
  // recommendation rather than about a preference, so the criterion has to name
  // that too. Asserted as two separate matches so losing either one fails.
  assert.match(
    section,
    /`get_taste` for what\s+they like and what a recommendation stands on/iu,
    "the taste read is not claimed for what a recommendation stands on",
  );
  assert.match(
    section,
    /`get_memory` for the wider question of what\s+Tonight holds/iu,
    "the memory read is no longer named for the wider question",
  );
  // And the criterion is about the question asked, not about a read-back: a
  // question about the basis of a recommendation is not somebody asking to be
  // read back to, which is how the narrower framing let it slip.
  assert.match(
    section,
    /\*\*The question picks the read\*\*/u,
    "the section no longer says the question decides which read answers",
  );
  assert.doesNotMatch(
    section,
    /`get_taste`, or `get_memory`/iu,
    "the read-back offers both reads again without a criterion",
  );
  assert.doesNotMatch(
    section,
    /`get_taste` for [^.;]{0,40}\bmemor/iu,
    "the taste read was given the memory question",
  );
});

/**
 * The two rules M3's semantic evaluation had to put here.
 *
 * Both were written into a tool's own description first — `forget_verdict` was
 * told not to tidy up the saved film, `get_verdicts` was told it cannot settle
 * a conflict — and the sweep found the model doing both anyway, three runs of
 * three and one run of three. A description is read when a tool is chosen; the
 * failure in each case was the *next* decision, taken after the description was
 * behind it. So the rules are in the standing text, and these contracts keep
 * them there.
 *
 * What is checked is what the rule establishes, not one arrangement of words.
 */
test("what may be persisted is about persisting, and says inference is not", () => {
  const flat = flatSkill();
  const persisted = flat.slice(
    flat.indexOf("## What may be persisted"),
    flat.indexOf("## Films they tell you about"),
  );
  assert.ok(persisted.length > 400, "the persistence section could not be found");

  // (A) What may be written, and what may not. This section keeps its own rule
  // and only its own rule — the cross-root boundary moved, because a forgetting
  // request is not a persistence question and a model deciding how to honour one
  // never comes here.
  assert.match(persisted, /Persist durable taste they express or confirm/u, "expressed taste stopped being writable");
  assert.match(persisted, /not inference/iu, "inference stopped being ruled out");
  assert.match(persisted, /Never infer a preference from silence/u, "the older inference rule was lost");
});

/**
 * Where the cross-root boundary has to be read.
 *
 * It was written into `forget_verdict`'s description first and failed 3 of 3;
 * put under "What may be persisted" it went to 2 of 3. Both times the model had
 * been told and both times the telling was somewhere it was not looking: the
 * failure is the *second* call, chosen after a forgetting request has already
 * been accepted. So the rule now sits where a direct model operation is
 * authorised, one sentence after the authorisation — which is the sentence the
 * failing runs had just acted on.
 *
 * This contract is about placement. Asserting the rule exists somewhere is what
 * the previous two versions did.
 */
test("authorising a direct operation does not authorise tidying another root", () => {
  const flat = flatSkill();
  const asked = flat.slice(
    flat.indexOf("## Asked about the model directly"),
    flat.indexOf("## What Tonight remembers"),
  );
  assert.ok(asked.length > 200, "the read-back section could not be found");

  // (B) The boundary lives here.
  assert.match(
    asked,
    /Never add an unasked write to tidy another root/u,
    "the cross-root boundary is not where a direct operation is authorised",
  );

  // (C) And it comes straight after the authorisation it qualifies — before the
  // read-back routing, so nothing sits between the permission and its limit.
  const authorises = asked.search(/\*\*do those\*\*/u);
  const boundary = asked.search(/Never add an unasked write/u);
  const readback = asked.search(/\*\*The question picks the read\*\*/u);
  assert.ok(authorises >= 0 && boundary >= 0 && readback >= 0, "the section lost one of its three parts");
  assert.ok(
    authorises < boundary,
    "the boundary is stated before the operation it qualifies is authorised",
  );
  assert.ok(
    boundary < readback,
    "the boundary was pushed past the read-back routing, away from the authorisation",
  );

  // And it is not left behind in the persistence section.
  const persisted = flat.slice(
    flat.indexOf("## What may be persisted"),
    flat.indexOf("## Films they tell you about"),
  );
  assert.doesNotMatch(
    persisted,
    /Never add an unasked write/u,
    "the boundary is in two places, so neither is the one that governs",
  );

  // (D) Structural rather than a list of forbidden phrasings: whatever the rule
  // says, the thing it forbids has to be qualified as *unasked* and as
  // reaching *another* root. A rule that dropped either qualifier would forbid
  // work the user asked for.
  const forbidding = asked.slice(asked.search(/Never add|never write|never change/iu));
  const clause = forbidding.slice(0, forbidding.indexOf(".") + 1);
  assert.ok(clause.length > 10, "the write boundary could not be found");
  assert.match(
    clause,
    /\b(unasked|unrequested|nobody asked|did not ask)\b/iu,
    `the boundary stopped being about writes nobody asked for: ${JSON.stringify(clause)}`,
  );
  assert.match(
    clause,
    /\banother\b[^.]*\broot\b|\broot\b[^.]*\bnobody named\b/iu,
    `the boundary stopped being about a second, different root: ${JSON.stringify(clause)}`,
  );

  // (E), (F) and (G): the shapes it must never take. Each would read as a cap on
  // how much one turn may change, which would break an explicitly requested
  // multi-root change and `correct_episode`, whose whole purpose is putting
  // several fields of one evening right in a single call.
  for (const overreach of [
    /never write (more than one|two)/iu,
    /one root per/iu,
    /never change two/iu,
    /only one (root|field)/iu,
    /never write to two/iu,
    /a single root/iu,
    /one write per/iu,
  ]) {
    assert.doesNotMatch(asked, overreach, "the boundary was widened into a limit on asked-for work");
  }
});

test("a question about what disagrees is routed to the read that can see both sides", () => {
  const flat = flatSkill();
  const asked = flat.slice(
    flat.indexOf("## Asked about the model directly"),
    flat.indexOf("## What Tonight remembers"),
  );
  assert.ok(asked.length > 200, "the read-back section could not be found");

  // (6) `get_memory` is named as the read for a read-back, and disagreement is
  // named as one of the things it answers.
  assert.match(asked, /`get_memory`/u, "the memory view is no longer named for a read-back");
  assert.match(
    asked,
    /`get_memory` for the wider question of what\s+Tonight holds/iu,
    "the memory view is no longer named for the wider question",
  );
  assert.match(
    asked,
    /what a recommendation stands on/iu,
    "the taste read is not claimed for recommendation-basis questions",
  );

  // And the disagreement routing is gone rather than reworded. Nothing carries
  // two opinions any more, so there is no disagreement between roots to route —
  // a rule still promising one would describe behaviour Tonight does not have.
  assert.doesNotMatch(asked, /disagreement/iu, "the skill still promises to resolve a disagreement");

  // (7) And the limit on `get_verdicts` is not restated here. It is a rule about
  // what one tool's answer covers, it is in that tool's own description, and
  // this file holds a contract that a rule which moved to a tool is not stated
  // in the skill as well — see "what moved to the tools is no longer stated
  // here as well" above.
  assert.doesNotMatch(asked, /`get_verdicts`/u, "a tool-local rule came back into the skill");
});

test("recommending still reads the taste model, and never the memory view", () => {
  const flat = flatSkill();
  const recommending = flat.slice(
    flat.indexOf("## Recommending"),
    flat.indexOf("## What may be persisted"),
  );

  assert.ok(recommending.length > 500, "the recommending section could not be found");
  assert.match(recommending, /\*\*Read `get_taste` either way\.\*\*/, "recommendation lost its read");
  // `get_memory` is named here once, and only as where a withdrawn verdict is
  // still remembered — never as something a recommendation reads, calls or uses.
  assert.doesNotMatch(
    recommending,
    /\b(read|call|use|check|consult)s?\b[^.]{0,20}`get_memory`/i,
    "the memory view was made part of recommending",
  );
  for (const mention of recommending.matchAll(/`get_memory`/g)) {
    const sentence = recommending.slice(Math.max(0, mention.index - 60), mention.index + 40);
    assert.match(sentence, /remembers/, `get_memory appears in recommending for something else: ${sentence}`);
  }
});

/**
 * Remembering is not believing, and the skill still says so.
 *
 * M3 makes this reachable — an agent can now ask for the whole of what Tonight
 * holds, most of which is history. The rule that history teaches nothing was
 * already there for M1's sake; this pins it against the new way of meeting it.
 */
test("what is remembered is still not what is believed", () => {
  const flat = flatSkill();
  assert.match(flat, /\*\*That record is history, not taste\.\*\*/);
  assert.match(flat, /Nothing is learned from it automatically/);
  // And the one thing that is evidence is still named as the exception.
  assert.match(flat, /\*\*What they said about a film is different\*\*: that is evidence/iu);
});

test("a taste read that fails is split by what was asked, not by what broke", () => {
  /**
   * Step 5 of `docs/work/phase-1-implementation.md`, implementing strategy 10.1.1.
   * The rule it supersedes stopped in both cases, which turned a store outage into a
   * total product outage for requests that never needed the data.
   *
   * Each branch is read on its own. Against the whole section, a rule that moved
   * from one branch to the other still matches: "stop" landing in the ordinary branch,
   * or both retry offers sitting in one of them, would pass.
   */
  const flat = flatSkill();

  const sliceBetween = (from: string, to: string) => {
    const at = flat.indexOf(from);
    const until = flat.indexOf(to, at + 1);
    assert.ok(at >= 0 && until > at, `the branch starting "${from}" could not be found`);
    return flat.slice(at, until);
  };

  // R2 put the retry back inside each branch. Factored out in front of both it was
  // semantically equivalent and behaviourally weaker — furthest from the branch
  // that had to perform it — and one recorded run dropped it.
  const taste = sliceBetween("`get_taste` fails on a taste question", "`get_taste` fails on an ordinary request");
  const ordinary = sliceBetween("`get_taste` fails on an ordinary request", "**A write fails**");

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
    flat.indexOf("## When something fails"),
    flat.indexOf("`get_taste` fails on a taste question"),
  );
  assert.ok(aboveBranches.length > 0, "the failure section could not be found");
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

  // Each behaviour in the skill's own words, so a rule that lost its sentence
  // fails here even where a looser pattern above would still find something.
  for (const [what, rule] of [
    ["the taste branch stops", /— stop\. \*\*No answer is owed here\*\*/],
    ["it reports the tool's own words", /in the tool's own words/],
    ["the taste branch offers its own retry", /own words, offer to retry/],
    // The b343335b repair. Stopping said what to do and not what to stop doing, and
    // one run read the shape rule as an obligation that outlived the stop.
    ["the taste branch recommends nothing", /and recommend nothing/],
    ["the ordinary branch answers", /recommend anyway/],
    ["the disclosure is the first sentence", /\*\*first sentence\*\*/],
    ["it says the read failed", /their model could not be read/],
    ["it says the answer is not based on it", /not based on it/],
    ["it forbids a personal claim", /Claim \*\*nothing\*\* about them/],
    ["the ordinary branch offers its own retry", /about them\. Offer to retry/],
    ["the ordinary branch owes the answer shape", /recommend anyway, \*\*in the shape above\*\*/],
    ["a failed write still reports", /\*\*A write fails\*\* — the recommendation stands; say what was not saved/],
    ["a failed write is never claimed as stored", /Never claim something was stored when the tool refused/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the skill lost: ${what}`);
  }
});

test("a branch that stops outranks the rule that shapes an answer", () => {
  /**
   * The b343335b Step-8 recertification. The integration rule — a tool call is not
   * an answer — did what it was written for: across sixty runs nothing replaced a
   * recommendation with a write. But it was stated unconditionally, and
   * `07-failure-explicit__taste-explicit__02` applied it inside the branch that must
   * stop: it reported the failed read, offered a retry, and then recommended *The
   * Nice Guys* "in the meantime" — the substitution fixture 07 exists to catch, and
   * a thing no run of the seven earlier sweeps had ever done.
   *
   * So the repair is a precedence, not a retreat. The rule still says the reply is
   * what reaches them; what it no longer says is that a reply is always owed.
   */
  const flat = flatSkill();

  // --- the rule carries its condition ---
  // Unconditioned it reads as an obligation to answer, which is how it was misread.
  assert.match(flat, /Whether an answer is owed is settled before this rule, never by it/,
    "the skill does not say what settles whether an answer is owed");
  assert.match(flat, /This rule says what an owed answer must contain, never that one is owed/,
    "the skill does not say what the rule is silent about");
  // And it names which rule decides instead, so the precedence is followable rather
  // than inferred: a reader landing here is sent to the branch table.
  assert.match(flat, /\*\*When something fails\*\* decides that, and decides it first/,
    "the skill does not say which rule settles it");

  // --- and nothing about it is weakened ---
  // Each of these is the rule the 7cd5b2e3 sweep was repaired for. A precedence that
  // bought itself room by dropping one of them would be a different regression.
  for (const kept of [
    /a tool call is not an answer/i,
    /Tools serve the reply and never stand in for it/,
    /happens \*\*as well as\*\* the answer and never in place of it/,
    /A film named only inside a tool call was never recommended/,
    /a follow-up sentence is not a recommendation they can act on/,
    /Where an answer is owed, it arrives whole and in the shape above/,
    /nothing is left out of the reply because it was written down/,
  ] as RegExp[]) {
    assert.match(flat, kept, `the integration rule lost: ${String(kept)}`);
  }

  // --- where a recommendation is owed, a write is still additive ---
  // The ordinary branch is a branch that owes one, so the shape obligation has to
  // survive there. If the precedence had been written as "the shape applies less
  // often", this is the assertion that would fail.
  const ordinary = flat.slice(
    flat.indexOf("`get_taste` fails on an ordinary request"),
    flat.indexOf("**A write fails**"),
  );
  assert.match(ordinary, /in the shape above/, "a branch that owes an answer lost the shape");
  assert.match(flat, /- \*\*`get_taste` fails on an ordinary request\*\* — recommend anyway/,
    "the ordinary branch no longer answers");

  // --- and where one is not owed, the stop is the whole of it ---
  // AC6a, said as a prohibition rather than left to follow from "stop". The observed
  // run obeyed "stop" and recommended anyway, so "stop" alone is demonstrably not
  // enough to carry it.
  const taste = flat.slice(
    flat.indexOf("`get_taste` fails on a taste question"),
    flat.indexOf("`get_taste` fails on an ordinary request"),
  );
  assert.match(taste, /recommend nothing/i, "the stop branch does not forbid recommending");
  assert.match(taste, /No answer is owed here/, "the skill does not say the stop owes nothing");
  assert.match(taste, /no general pick, no film \*"in the meantime"\*/,
    "the skill does not name the substitution that was observed");
  assert.match(taste, /The shape of an answer does not reach into this branch/,
    "the skill does not put the shape rule out of this branch");
  assert.match(flat,
    /\*\*A stop is not an incomplete reply\*\*: nothing is missing from it that the shape of an answer would supply/,
    "the skill does not say a stop is complete as it stands");

  // The precedence is stated where the rule is, not only where the branch is. A
  // reader who never reaches `## When something fails` still meets the condition.
  assert.ok(
    flat.indexOf("Whether an answer is owed is settled before this rule")
      < flat.indexOf("## When something fails"),
    "the precedence is stated only inside the branch it governs",
  );
});

test("the write flow is stated whole: what may be written, where, and on whose yes", () => {
  const flat = flatSkill();

  for (const [what, rule] of [
    // Watching is a fact the user reported, so it may be written down; what it
    // may never become is an opinion.
    ["watching writes no taste", /writes \*\*no taste\*\*/],
    ["and the viewing and the evening may still be written",
      /`viewing` may hold it, and an evening may record what they said they did/],
    ["keeping a film needs a Vibe", /Never write a Movie this way without at least one Vibe/],
    ["a verdict never invents a Vibe", /No Vibe is needed for one and none may be invented to hold it/],
    ["a verdict never invents a Movie either", /a Verdict stands on its own root/],
    ["a later keep still takes a Vibe", /a later request to keep the film takes a Vibe/],
    // M5 (S3): however a film's working for them is put, it is a verdict, in their
    // words and no stronger.
    ["however it is put, it is a verdict", /how a film worked for them, however\s+they put it/],
    ["kept in their words, never made stronger",
      /recorded in their words and\s+never made stronger than they made it/],
    // M5 (S3, R3-2 of the plan): the full prose of classifying a kept film and of
    // proposing a Vibe moved to the tonight-vibes skill, and what is here is
    // recommend's own statement of those rules. The full prose is pinned where it
    // lives, in `skills/tonight-vibes/test.sh`.
    ["the Vibe question is classification, not permission",
      /is a classification, not a request for permission/],
    ["classify rather than fit", /Classify the film/],
    ["read first", /read the Genres and Vibes first/i],
    ["one that fits is just saved", /save it there, say so in one sentence, ask nothing further/],
    ["never stretch a Vibe", /Never stretch a Vibe to avoid making one/],
    ["none fitting means not yet", /do not save the film yet/],
    ["reuse what fits", /Reuse the Genres that fit/],
    ["create for what is uncovered", /create one for anything uncovered/],
    // "Two" is guidance, not a quota: the number without the hedge reads as a
    // requirement, which is a different rule. A third is allowed on a condition.
    ["two is the usual shape, not a requirement", /usually two meaningful, distinct ones/],
    ["a third only when it is needed", /a third only when it holds a part the two do not/],
    ["and padding is still forbidden", /never filler to hit a number/],
    ["the Vibe choice is yours", /Never ask which they want; that judgement is yours/],
    ["a proposal is made concrete", /make\s+it concrete/],
    ["and names its core", /name its core/],
    ["with three to five films", /three to five other films that would belong/],
    ["and two or three names", /two or three alternative names/],
    ["those films are illustration only", /Those films are illustration only/],
    ["never written, never filed", /never written, never filed/],
    ["no viewing, no verdict", /never given a viewing or a\s+verdict/],
    ["only the kept film and the core are saved", /only the kept film and the core\s+are saved/],
    ["a yes covers the whole flow", /A yes is the whole permission/],
    ["and the Vibe is written with its core", /then the Vibe with its core/],
    ["and is never asked twice", /never ask twice/],
    ["a no settles it", /A no settles it\*\*, never saving the film loose/],
    ["propose while saving", /Propose while saving, not while recommending/],
    ["a fitting Vibe skips it", /a Vibe that (genuinely )?fits needs none of this/],
    ["a film in no Vibe is fine", /A film in no Vibe is legitimate/],
    // M5 (S3): "never unasked" narrows only as far as stays true for every
    // selection of the plugin — a film they ask about, or say something about, is
    // no longer unasked.
    ["and is left alone",
      /Do not sort them, propose Vibes for them, or mention them\s*unless they ask or speak of one/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the skill lost: ${what}`);
  }

  // The unqualified rule, which the skill may not carry again. A film the user
  // says they watched writes no *taste*; it does not write nothing, and an agent
  // told otherwise would decline to record a viewing it was given.
  assert.doesNotMatch(
    flat,
    /watch(?:ed|ing)[^.]{0,40}(?:said nothing|no opinion)[^.]{0,30}writes \*\*nothing\*\*/i,
    "the skill says a watched film writes nothing at all",
  );
});

test("the taste model is evidence, and the skill says how strong", () => {
  /**
   * P3 and P5 are the semantics most likely to be lost in a rewording, because the
   * losses are quiet: a Vibe described in fewer words easily reads as a filter
   * again, and verdicts described in fewer words easily read as a gate.
   */
  const flat = flatSkill();

  for (const [what, rule] of [
    ["the model is read either way", /Read `get_taste`\s*either way/],
    ["tonight's words bind", /What they said tonight binds/],
    ["an exclusion is mode-dependent", /binds only when they asked for their taste/],
    ["a non-binding exclusion is not mentioned", /one that does not bind is \*\*not mentioned either\*\*/],
    ["the positive preference used is recognisable in the answer",
      /the positive preference that shaped\s+the answer is recognisable in it/],
    ["and naming it is one way rather than the only one", /is one\s+way to do that and not the only one/],
    ["and is the only thing that is", /Everything else in the model is evidence either way/],
    ["discovery explores from what they wrote", /what they have written is where you explore from/],
    ["taste-aware makes the model the brief", /Now the model is the brief, and its exclusions hold/],
    ["a matching Vibe is a reason", /a Vibe that matches is a reason\s*the recommendation fits/],
    ["it counts immediately", /counts from\s*the moment it exists/],
    // M5: every new Vibe holds its core, so the illustration is a Vibe with only
    // its core under it.
    ["a new Vibe says as much as a full one",
      /only its core under it says as much about\s*what they like as one with ten films under it/],
    ["a Genre is thinner", /A Genre is an ingredient/],
    ["verdicts calibrate rather than gate", /Verdicts calibrate that evidence. They never decide whether it counts/],
    ["loved strengthens", /`loved`\s*strengthens it/],
    ["liked less so", /`liked` strengthens it more weakly/],
    ["disliked is a sign, not a ban", /negative sign, not a ban/],
    ["a Movie carries no opinion at all",
      /`viewing` says where the film stands on their list and\s*that is a fact, never a sign for or against/],
    ["an unconfirmed Vibe changes reach, not eligibility", /never whether you use it/],
    ["intent stays certain while the fit does not", /what\s+they meant is not in question/],
    ["no film is confirmed to fit it yet", /no particular film has been confirmed to fit it yet/],
    ["that describing the match stays allowed", /say how well a film answers what the Vibe asks for/],
    ["to say how sure it is", /Say how sure you are/],
    ["that their verdict may not be claimed", /it is confirmed, proven or settled for them/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the skill lost: ${what}`);
  }
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
  const flat = flatSkill();

  for (const [what, rule] of [
    ["that the request is answered with a film", /they asked for a film and the answer is one/],
    ["that a question goes in the answer, never in place of it", /in the answer, never instead of it/],
    ["that an empty model is no exception", /An empty model is not\s+an exception/],
  ] as [string, RegExp][]) {
    assert.match(flat, rule, `the agent is never told ${what}`);
  }

  // The question is still permitted — R1 removes the substitution, not the ask.
  assert.match(flat, /ask \*\*one question about films\*\*/);

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
  const flat = flatSkill();

  // The two branches read separately. Spanning both would let a recommendation
  // obligation injected into the taste branch pass on the ordinary branch's
  // "recommend anyway" — the branches are adjacent, so the slice has to stop
  // where the other begins.
  const taste = flat.slice(
    flat.indexOf("`get_taste` fails on a taste question"),
    flat.indexOf("`get_taste` fails on an ordinary request"),
  );
  const ordinary = flat.slice(
    flat.indexOf("`get_taste` fails on an ordinary request"),
    flat.indexOf("**A write fails**"),
  );
  assert.ok(taste.length > 20 && ordinary.length > 40, "the failure branches could not be found");

  assert.match(taste, /\bstop\b/, "the taste branch no longer stops");

  // R1's obligation lives in `## Recommending`, and must not be restated here in
  // any of its wordings. A branch told to stop and also told to recommend is a
  // contradiction the more specific rule would be expected to lose.
  for (const [what, leak] of [
    ["the rule's own wording", /they asked for a film and the answer is one/i],
    ["a shorter wording of the same rule", /answer with a film/i],
    ["an earlier wording of the same rule", /the answer is a film/i],
    ["the ordinary branch's instruction", /answer anyway|recommend anyway/i],
    ["the answer shape itself", /one lead|two or three (directions|\*\*directions)/i],
    ["any other instruction to recommend", /\b(recommend|suggest|offer)\s+(a film|one|something)\b/i],
  ] as [string, RegExp][]) {
    assert.doesNotMatch(taste, leak, `the taste branch was given ${what}`);
  }

  // And the ordinary branch keeps its opposite obligation, which is R1 reaching
  // it through the shared section rather than through a copy of the rule.
  assert.match(ordinary, /recommend anyway/, "the ordinary branch no longer answers");
});

test("every rule the agent cannot work out for itself is in the skill", () => {
  // One line per rule, whitespace collapsed on both sides, because where a sentence
  // wraps is a detail of the source file and not of the contract. A rule that is
  // reworded has to be re-pinned here, which is the point: rewording a rule is a
  // decision, and this list is where it is seen.
  const flat = flatSkill();

  for (const rule of [
    // scope and boundaries
    "There is no setup",
    "Never look in Tonight for films to recommend",
    "Never write a Genre, a Vibe or a Movie anywhere but Tonight",
    "Never ask for or pass an account id",
    // reading and recommending
    "Read `get_taste` either",
    "binds only when they asked for their taste",
    "a Vibe that matches is a reason the recommendation fits",
    "Verdicts calibrate that evidence. They never decide whether it counts",
    "exclusions hold",
    "Never print the taste model while",
    "one lead, named as such",
    "distance from the lead",
    "rules a Movie out as new",
    "never called new, unseen or not yet watched",
    "`want-to-see` does not rule it out",
    "**`dont-want-to-see` is never recommended**",
    "Anchor a stretch in something they like",
    // ownership and semantic confirmation
    // Two rules, and they live in two sections: persistence under "What may be
    // persisted", the cross-root boundary beside the operation it qualifies.
    "Persist durable taste they express or confirm—not inference.",
    "Never add an unasked write to tidy another root.",
    "only the meaning they could agree to",
    "Asking is not asking permission",
    // Tonight persists nothing it thought of by itself, so an offer is a thing
    // said in a conversation and nothing else. The rule the agent cannot work
    // out alone is what that implies: a yes is the only thing that writes, and
    // a no leaves nothing — not a pending offer, not a record it was made.
    "Noticing is free and costs nothing; writing needs a yes",
    "no pending offer, no note that you asked, no record that they declined",
    // The mood rule, at its own statement.
    "or a mood for tonight is no reason to",
    // The judgement half of the same rule: do not offer what you would not act
    // on now, because there is nowhere for an unacted offer to wait.
    "offer only what you could create on the spot",
    "or from anything you noticed or offered yourself",
    // Not "watched and said nothing writes nothing", which was false: watching
    // is a fact the user reported, and both the viewing and the evening may be
    // written from it. What may not be written is an opinion.
    "A film they watched and said nothing about writes **no taste**",
    "`viewing` may hold it, and an evening may record what they said they did with a film",
    "Never infer a preference from silence",
    "Say so and let them decide",
    // genre against vibe
    "A Genre is named for what it is; a Vibe for what it feels like",
    "Never stretch a Vibe to avoid making one",
    // movies
    "Never write a Movie this way without at least one Vibe",
    "No Vibe is needed for one and none may be invented to hold it — and no Movie either",
    "not a bucket",
    "do not save the film yet",
    "Never ask which they want",
    "Those films are illustration only",
    "A yes is the whole permission",
    "never ask twice",
    "A film in no Vibe is legitimate",
    // M5 (S3): narrowed to what stays true for every selection of the plugin.
    "Do not sort them, propose Vibes for them, or mention them unless they ask or speak of one",
    "A recommendation is not a saved Movie",
    "ever ask for what their sentence gave you",
    "that is a verdict, liked, loved or disliked, and it goes to `record_verdict`",
    // M5 — the floor. However a film's working is put, it is a verdict in their
    // words (S3); a proposed Vibe names its core and is written with it (S2); an
    // empty model's one question is the films they love (S6).
    "So is how a film worked for them, however they put it",
    "recorded in their words and never made stronger than they made it",
    "name its core",
    "then the Vibe with its core",
    "two or three films you love",
    "arrive with `create_genre` and `create_vibe`",
    "Settle title and year first",
    // what Tonight is and is not — the boundary, stated so neither half is lost
    "get_taste` returns what they saved, not a shortlist",
    "no tool here turns a taste into films",
    // the model is inspected and managed in conversation, in plain sentences
    "## Asked about the model directly",
    "**do those**",
    "`get_taste` for what",
    "they like and what a recommendation stands on",
    "`get_memory` for the wider question of what",
    "the answer is ordinary sentences",
    // failures
    "offer to retry",
    "`get_taste` fails on a taste question** — stop",
    "`get_taste` fails on an ordinary request** — recommend anyway",
    "Claim **nothing** about them",
    "Never claim something was stored when the tool refused",
  ]) {
    assert.ok(
      flat.includes(rule.replace(/\s+/g, " ")),
      `the agent is never told: ${JSON.stringify(rule)}`,
    );
  }
});

/**
 * M6 — the deltas, and where they sit — as M8 left them.
 *
 * `docs/work/m6/PLAN.md` §2–§3. Four skill-owned rules: a turn-down reaches as
 * far as their words (D1), a recommended film comes back unless it was turned
 * down (D2), being in a Vibe is no opinion (D3), and a request with taste read and
 * no mood is still answered, led as a surprise (D4). Where D4 sits is pinned too:
 * after the sentence that already says *never instead*, so it cannot become R1's
 * licence to interview.
 *
 * M8 (`docs/work/m8/PLAN.md`) took refusals out of verdicts: a turn-down for good
 * is the film's viewing, `dont-want-to-see`, and one for tonight is written nowhere.
 */
test("M6/M8: a turn-down is a viewing or nothing, and a turned-down film is not offered again", () => {
  const flat = flatSkill();
  // D1, right after the verdict routing — which stays whole.
  assert.match(
    flat,
    /that is a verdict, liked, loved or disliked, and it goes to `record_verdict`\./,
  );
  assert.match(flat, /\*\*Turning a film down is not a verdict\.\*\*/);
  assert.match(
    flat,
    /\*"stop suggesting it"\*, \*"not interested"\*, \*"never again"\* say where that film stands on their list: `dont-want-to-see`/,
  );
  // G3 (M6 smoke, 0 of 3): an unclear turn-down was not recorded at all. Since M8
  // that is exactly right — it is about tonight — and it is never made permanent.
  assert.match(
    flat,
    /one that does not say how far — \*"nah, not that one"\* — are about this evening: offer something else and write nothing, and never make one into `dont-want-to-see`/,
  );
  assert.match(flat, /Never `disliked`, which says they watched it/);
  assert.match(flat, /never a question asking them to make it reach further/);
  // D2, inside the sentence it narrows.
  assert.match(
    flat,
    /a film you recommended can come back — unless it is `dont-want-to-see`, or they turned it down this evening/,
  );
  assert.match(flat, /\*\*A turned-down film is not offered again\*\*/);
  assert.match(flat, /`dont-want-to-see` on any evening, \*"not tonight"\* in this one/);
  // No verdict reach and no evening scope survive anywhere in the skill.
  assert.doesNotMatch(flat, /not-ever|not-tonight|occasion/u);
});

test("M6: being in a Vibe is no opinion, and a film new to them there is a candidate", () => {
  const flat = flatSkill();
  // D3. U1 (M6 smoke, 1 of 3): an unseen film with no verdict was called liked
  // because it sat in a Vibe beside films that were. Liking is a film's own verdict,
  // nothing else.
  assert.match(flat, /\*\*Being in a Vibe is no opinion either\*\*/);
  assert.match(flat, /only a standing liked or loved says that/);
  assert.match(
    flat,
    /\*\*Never call a film liked or loved without its own verdict\*\*, however many films beside it in the Vibe they did like/,
  );
  // The candidate half, and the rule it leans on.
  assert.match(
    flat,
    /A film there that is new to them is a candidate for that evening and may lead, as `want-to-see` always could; Tonight is still not the shortlist/,
  );
  assert.match(flat, /`want-to-see` does not rule it out: it is on their list, so it stays on the table/);
});

test("M6: with taste read and no mood, the answer still comes first, led as a surprise", () => {
  const flat = flatSkill();
  // D4 comes after the sentence that says *never instead*, so the question it allows
  // is the answer's, never a substitute.
  const instead = flat.indexOf("**in the answer, never instead of it**");
  const mood = flat.indexOf("**No mood given is not an exception either**");
  const shape = flat.indexOf("**The shape:**");
  assert.ok(
    instead >= 0 && mood > instead && shape > mood,
    "D4 is not after the never-instead sentence, ahead of the answer's shape",
  );
  // Its precondition is all of it: the model was read AND is not empty (Codex
  // implementation review 1). "Taste read" alone is met by a read that succeeded on
  // an empty model, and would hand that case a mood question in competition with
  // its own first-films question.
  assert.match(
    flat,
    /\*\*No mood given is not an exception either\*\*, however many Vibes they have\. With their model read and not empty,/,
    "the skill's moodless rule lost half of its precondition",
  );
  // The reason, and the two other cases kept apart.
  assert.match(
    flat,
    /\*\*say it is a surprise\*\* — never that it is what they are in the mood for, because they have not said/,
  );
  assert.match(flat, /let the one question, if there is one, ask the mood/);
  assert.match(flat, /Their Vibes are never listed, summarised or counted/);
  assert.match(flat, /An empty model and a failed read are their own cases, and nothing here changes them/);
  // The empty model keeps its own question, and asks it alone when nothing was asked.
  assert.match(
    flat,
    /With an empty model the question is \*"what are two or three films you love\?"\* — and somebody new who has asked for nothing yet is asked it on its own, in one sentence/,
  );
});
