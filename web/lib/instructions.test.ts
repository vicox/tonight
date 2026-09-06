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

test("the frontmatter is dropped and nothing else is", () => {
  const source = skill();

  // The frontmatter names the skill for a host that discovers skills. Inside a
  // ChatGPT project it is noise, and it is the only thing removed.
  assert.match(source, /^---\nname: tonight-recommend\n/, "the skill still opens with frontmatter");
  assert.equal(PROJECT_INSTRUCTIONS.includes("name: tonight-recommend"), false);
  assert.match(PROJECT_INSTRUCTIONS, /^# Tonight — recommend\n/, "and starts at the heading");

  // Everything after it survives: the rules the skill exists for are still there.
  for (const rule of [
    "There is no setup",
    "Persist durable taste they express or confirm",
    "Asked about the model directly",
    "never look in Tonight for films to recommend",
    "A recommendation is not a saved Movie",
  ]) {
    assert.ok(PROJECT_INSTRUCTIONS.includes(rule), `missing from the copied text: ${rule}`);
  }

  // Nothing is rewritten or reflowed either: the body appears verbatim, and the
  // marker is the only thing the transform adds to it.
  const body = instructionsFrom(source);
  assert.ok(PROJECT_INSTRUCTIONS.startsWith(body), "the body is not carried over unchanged");
  assert.equal(PROJECT_INSTRUCTIONS.slice(body.length).trim(), markerFor(versionOf(body)));
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

test("the length is reported, because that is the open question", () => {
  // No ceiling is asserted. ChatGPT caps a project's instructions and the cap is
  // not documented anywhere reachable, so pinning a number here would be pinning
  // a guess. Once it is known by measurement — Q1 in the design document — this
  // is where it belongs.
  assert.equal(PROJECT_INSTRUCTIONS_LENGTH, PROJECT_INSTRUCTIONS.length);
  assert.ok(PROJECT_INSTRUCTIONS_LENGTH > 0);
});
