import assert from "node:assert/strict";
import test from "node:test";

import type { Viewing } from "../taste/model.ts";
import type { Judgement } from "../verdicts/model.ts";
import {
  CHOICES,
  choiceFor,
  decide,
  isPressed,
  refusalFor,
  refusalSentence,
  REFUSALS,
  type Film,
} from "./choices.ts";

/**
 * The five choices on a film's screen, and what each press comes to in the model
 * that already exists: a verdict, a withdrawal, the film's viewing, nothing, or a
 * refusal the page can name. The writes themselves are `choose.test.ts`.
 */

const choice = (key: string) => {
  const found = choiceFor(key);
  assert.ok(found, `${key} is not a choice`);
  return found;
};

const film = (overrides: Partial<Film> = {}): Film => ({
  viewing: "want-to-see",
  judgement: null,
  filed: true,
  core: false,
  ...overrides,
});

test("five choices, in the screen's order and words", () => {
  assert.deepEqual(
    CHOICES.map((one) => one.label),
    ["Love it", "Like it", "Want to see", "Not interested", "Dislike"],
  );
});

test("three are opinions and two are where the film stands", () => {
  const meaning = CHOICES.map((one) =>
    one.kind === "judgement" ? `verdict:${one.judgement}` : `viewing:${one.viewing}`,
  );
  assert.deepEqual(meaning, [
    "verdict:loved",
    "verdict:liked",
    "viewing:want-to-see",
    "viewing:dont-want-to-see",
    "verdict:disliked",
  ]);
});

test("only the five are choices", () => {
  for (const value of ["seen", "loved", "", null, undefined, 1, "Love it", "love "]) {
    assert.equal(choiceFor(value), null, `${String(value)} was taken for a choice`);
  }
});

test("a button is pressed when its own fact is what the film stands at", () => {
  // An opinion and a viewing are separate facts, so both can be pressed at once.
  const loved = (viewing: Viewing) =>
    CHOICES.filter((one) => isPressed(one, viewing, "loved")).map((one) => one.key);
  assert.deepEqual(loved("want-to-see"), ["love", "want"]);
  assert.deepEqual(loved("dont-want-to-see"), ["love", "not-interested"]);
  // Seen is neither viewing button.
  assert.deepEqual(loved("seen"), ["love"]);
  assert.deepEqual(
    CHOICES.filter((one) => isPressed(one, "seen", null)).map((one) => one.key),
    [],
  );
});

test("an opinion is said, and the one that stands is taken back", () => {
  for (const [key, judgement] of [
    ["love", "loved"],
    ["like", "liked"],
    ["dislike", "disliked"],
  ] as [string, Judgement][]) {
    assert.deepEqual(decide(choice(key), film()), { write: "judgement", judgement });
    assert.deepEqual(decide(choice(key), film({ judgement })), { write: "withdrawal" });
  }

  // Another opinion replaces the one that stands: the verdict model keeps both.
  assert.deepEqual(decide(choice("like"), film({ judgement: "loved" })), {
    write: "judgement",
    judgement: "liked",
  });
});

test("an opinion never writes the viewing, and a viewing never writes an opinion", () => {
  for (const viewing of ["want-to-see", "seen", "dont-want-to-see"] as Viewing[]) {
    assert.deepEqual(decide(choice("love"), film({ viewing })), { write: "judgement", judgement: "loved" });
  }
  for (const judgement of [null, "loved", "disliked"] as (Judgement | null)[]) {
    assert.deepEqual(decide(choice("not-interested"), film({ judgement })), {
      write: "viewing",
      viewing: "dont-want-to-see",
    });
  }
});

test("a viewing is set, and pressing the one it has writes nothing", () => {
  assert.deepEqual(decide(choice("want"), film({ viewing: "seen" })), { write: "viewing", viewing: "want-to-see" });
  assert.deepEqual(decide(choice("want"), film({ viewing: "want-to-see" })), { write: "nothing" });
  assert.deepEqual(decide(choice("not-interested"), film({ viewing: "dont-want-to-see" })), { write: "nothing" });
});

test("a liked or loved needs the film in a vibe; a dislike and a take-back do not", () => {
  const unfiled = film({ filed: false });
  assert.deepEqual(decide(choice("love"), unfiled), { refused: "vibe-required" });
  assert.deepEqual(decide(choice("like"), unfiled), { refused: "vibe-required" });
  assert.deepEqual(decide(choice("dislike"), unfiled), { write: "judgement", judgement: "disliked" });
  assert.deepEqual(decide(choice("love"), film({ filed: false, judgement: "loved" })), { write: "withdrawal" });
});

test("a vibe's core stays seen, and its opinions are still free", () => {
  const core = film({ core: true, viewing: "seen" });
  assert.deepEqual(decide(choice("want"), core), { refused: "core" });
  assert.deepEqual(decide(choice("not-interested"), core), { refused: "core" });
  assert.deepEqual(decide(choice("love"), core), { write: "judgement", judgement: "loved" });
});

test("a refusal is one of a fixed set, said in fixed words", () => {
  for (const refusal of REFUSALS) {
    assert.equal(refusalFor(refusal), refusal);
    assert.ok(refusalSentence(refusal).length > 0);
  }
  for (const value of [null, "", "nope", "<script>", "Vibe-Required"]) {
    assert.equal(refusalFor(value), null, `${value} was taken for a refusal`);
  }
});
