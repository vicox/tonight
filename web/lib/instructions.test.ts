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

  assert.match(flat, /looks lasting and worth keeping/, "the durability gate is gone");
  assert.match(flat, /You \*\*may\*\* put it to them/, "asking has become obligatory");
  assert.match(
    flat,
    /an ordinary recommendation, or a mood that belongs to tonight, is no reason to ask/,
    "nothing stops a taste-confirmation prompt after every answer",
  );
});

test("the boundary says what Tonight does return, not only what it refuses", () => {
  // "No tool here returns films" was false — `get_taste` returns the films they
  // saved. What is actually true is narrower and more useful: no tool turns a
  // taste into a recommendation. Losing that distinction either hides their own
  // Movies from them or implies Tonight does the choosing.
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  assert.match(flat, /`get_taste` returns the Movies they saved/);
  assert.match(flat, /no Tonight tool turns a taste into film recommendations/);
  assert.equal(flat.includes("No tool here returns films"), false);

  // Instructions belong to Genres and Mixes; a Movie carries state.
  assert.match(flat, /Genres and Mixes with the instructions that say what they mean/);
  assert.match(flat, /the Movies they told it about with what they said/);

  // And the ratings wording was too broad twice over: liked and disliked are
  // real Movie state the user gave, and only a score is out of scope. Both of the
  // earlier phrasings would have told the agent not to record them.
  assert.match(flat, /no scored or star ratings/);
  assert.match(flat, /Never record a score or star rating/);
  assert.doesNotMatch(flat, /no ratings\b/);
  assert.doesNotMatch(flat, /rating of any kind/);
});

test("a persisted instruction is written in the user's own voice", () => {
  assert.match(
    PROJECT_INSTRUCTIONS.replace(/\s+/g, " "),
    /Write every instruction \*\*in the first person\*\*, as the user's own preference/,
  );
});

test("the model can be inspected and changed in the conversation, in plain sentences", () => {
  const flat = PROJECT_INSTRUCTIONS.replace(/\s+/g, " ");

  assert.match(flat, /## Asked about the model directly/);
  assert.match(flat, /\*\*do those\*\*, in the conversation/);
  assert.match(flat, /call `get_taste` and say what is there in ordinary sentences/);
  assert.match(flat, /is \*a\* management surface, not \*the\* one/);
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
    "Read the model first with `get_taste`",
    "rules out",
    "Never print the taste model while",
    "Recommend three to six films, for range as well as fit",
    // ownership and semantic confirmation
    "Persist durable taste they express or confirm. Never persist what you conclude alone.",
    "only the meaning they could see themselves agreeing to",
    "it is not asking permission",
    "writes **nothing** — what they want now, not what they are like",
    "watched and said nothing about writes **nothing**",
    "Never infer a preference from silence",
    "Never record a score or star rating",
    "Say so and let them decide",
    // genre against mix
    "A Genre is named for what it is; a Mix for what it feels like",
    "the name is doing no work",
    "Never stretch a Mix's instruction to avoid a second Mix",
    // movies
    "Never write a Movie this way without at least one Mix",
    "Never invent a Mix, or ask for one, to record",
    "an existing Mix is not a bucket",
    "do not save the film yet",
    "Never ask them which Mix they want",
    "A yes is the whole of the permission",
    "Never ask a second time whether to save",
    "A film in no Mix is legitimate",
    "Do not sort them, propose Mixes for them, or mention them unasked",
    "A recommendation is not a saved Movie",
    "Nothing said is `null`, never `false`",
    "Settle title and year first",
    // what Tonight is and is not — the boundary, stated so neither half is lost
    "get_taste` returns the Movies they saved",
    "no Tonight tool turns a taste into film recommendations",
    "no scored or star ratings",
    // the model is inspected and managed in conversation, in plain sentences
    "## Asked about the model directly",
    "**do those**",
    "call `get_taste` and say what is there in ordinary sentences",
    // failures
    "report the error verbatim and stop",
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
