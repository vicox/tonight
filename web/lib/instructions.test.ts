import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

test("an ordinary request is Discovery, and the model does not bound it", () => {
  /**
   * The distinction this document exists to teach twice over: what to recommend,
   * and what the saved model has to do with it. Before it, every request read as
   * "find the matching Mix" — a new user with two Genres got recommendations
   * filtered through two Genres. Nothing failed; the answers were just narrow.
   */
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  for (const [what, rule] of [
    ["that there are two kinds of request", "Two kinds of request, told apart from what they said"],
    ["that it is never asked about", "never by asking"],
    ["which one is the default", "**Discovery is the default**"],
    ["what an ordinary request asks for", "a good film, not their model"],
    ["what does bind in Discovery", "What **they** asked for binds"],
    ["that this includes tonight's exclusions", "including what they ruled out just now"],
    ["that availability binds too", "what they can watch"],
    ["that nothing persisted binds", "**Nothing persisted binds**"],
    ["that this covers every kind of persisted thing",
     "not a Genre, not a Mix, not a saved film or its state"],
    ["that a persisted exclusion is not a rule over every evening",
     "not what a Genre's or Mix's instruction rules out"],
    ["that an exclusion was written for one idea",
     "an exclusion they wrote for one idea is not a rule over every evening"],
    ["that nothing in it is a criterion unasked", "nothing in it is a criterion unless they asked"],
    ["that a small model is not a filter", "a small or new one must never become a filter"],
    ["when taste leads instead", "**Taste-aware is what they ask for**"],
    ["reading the model for it", "Read it with `get_taste` and weigh it"],
    ["that exclusions are evidence once they ask",
     "Now the model is evidence, including what its instructions rule out"],
  ] as [string, string][]) {
    assert.ok(flat.includes(rule.replace(/\s+/g, " ")), `the agent is never told ${what}`);
  }
});

test("what counts as taste evidence, and what does not", () => {
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  for (const [what, rule] of [
    ["that liked is positive", "`liked` is a positive sign"],
    ["that loved is stronger", "`loved` a stronger one"],
    ["that disliked is negative but not a ban", "`disliked` is a negative sign, not a ban"],
    ["that the other three carry no preference",
     "`seen`, `not_seen` and `null` are no preference evidence at all"],
    ["that existing is not liking", "A Genre or Mix existing is not evidence they like it"],
    ["what does make one trustworthy", "What makes one trustworthy is the film states under it"],
    ["that evidence accumulates", "and they accumulate"],
    ["that one film settles nothing", "one `loved` film is a hint"],
    ["that consistency is what earns confidence", "several consistent ones something to lean on"],
    ["that conflicting evidence weakens it", "conflicting ones weaken it again"],
    ["to say how sure it is", "Say how sure you are"],
  ] as [string, string][]) {
    assert.ok(flat.includes(rule.replace(/\s+/g, " ")), `the agent is never told ${what}`);
  }
});

test("taste is read qualitatively — no score, no threshold, no count", () => {
  // The rules above describe evidence getting stronger or weaker. They must not
  // turn into arithmetic: a weight or a minimum number of films would be a second
  // taste model, kept in the agent's head, that nobody can read or correct.
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");
  const taste = flat.slice(flat.indexOf("**Taste-aware is what they ask for**"), flat.indexOf("Either way:"));

  assert.ok(taste.length > 200, "the taste-aware passage could not be found");
  assert.doesNotMatch(taste, /\b(score|weight|threshold|points?|at least \d+|\d+ or more)\b/i);
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
     "`seen`, `liked`, `loved` and `disliked` each rule a Movie out as new"],
    ["that not_seen does not", "`not_seen` does not"],
    ["that a not_seen film stays eligible", "so it stays on the table"],
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

test("a request for a film is still not a configuration session", () => {
  // The guard that had to survive the rewrite. It is the oldest rule in this section
  // and the one the new answer form is most likely to quietly displace.
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  for (const rule of [
    "ask **one question about films**",
    `never *"what genres do you like?"*`,
    "never make somebody learn Genres and Mixes to get a film",
    "**Never print the taste model while recommending**",
  ]) {
    assert.ok(flat.includes(rule.replace(/\s+/g, " ")), `the guard lost: ${rule}`);
  }
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

  // The projection factors the shared prefix and the shared retry offer out in front
  // of the two branches, so the branches start at their own labels.
  const shared = sliceBetween("**`get_taste` fails**", "*Taste question*");
  const taste = sliceBetween("*Taste question*", "*Ordinary*");
  const ordinary = sliceBetween("*Ordinary*", "**A write fails**");

  // Retry is offered once, for both branches, and must say so. Factored out, a bare
  // mention would leave which branch it covers to the reader.
  assert.match(shared, /retry/i, "the shared clause does not offer a retry");
  assert.match(shared, /either way|both/i, "the retry offer does not cover both branches");

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

  // Neither branch may take the shared retry back, which is the failure mode the
  // per-branch count guarded against before the offer was factored out.
  for (const [name, branch] of [["taste", taste], ["ordinary", ordinary]] as [string, string][]) {
    assert.doesNotMatch(branch, /no retry|do not offer (a )?retry|without offering/i,
      `the ${name} branch withdraws the shared retry offer`);
  }

  // The superseded rule must not survive beside its replacement.
  assert.doesNotMatch(flat, /report the error verbatim|Never recommend from a model you could not read/i);

  // Write-failure behaviour is projected verbatim and is unchanged by any of this.
  assert.ok(flat.includes("**A write fails** — the recommendation stands; say what was not saved."));
  assert.ok(flat.includes("Never claim something was stored when the tool refused"));
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
    ["a retry is offered for the taste branch",
      /own words and offer to retry/, /either way, offer to retry/],
    ["the ordinary branch answers", /recommend anyway/, /answer anyway/],
    ["the disclosure is the first sentence", /\*\*first sentence\*\*/, /first sentence/],
    ["it says the read failed", /their model could not be read/, /model unread/],
    ["it says the answer is not based on it", /not based on it/, /not based on it/],
    ["it forbids a personal claim", /Claim \*\*nothing\*\* about them/, /claim nothing about them/],
    ["a retry is offered for the ordinary branch too",
      /about them\. Offer to retry/, /either way, offer to retry/],
    ["a failed write still reports", /Never claim something was stored when the tool refused/,
      /Never claim something was stored when the tool refused/],
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
    "Read it with `get_taste` and weigh it",
    "rules out",
    "Never print the taste model while",
    "one lead, named as such",
    "distance from the lead",
    "each rule a Movie out as new",
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
    "either way, offer to retry",
    "*Taste question*: stop",
    "*Ordinary*: answer anyway",
    "claim nothing about them",
    "Never claim something was stored when the tool refused",
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
