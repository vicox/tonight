import assert from "node:assert/strict";
import test from "node:test";

import { refocus } from "./refocus.ts";

/**
 * Where focus lands when a row leaves the list it was being read in.
 *
 * The rule, on its own, with strings standing in for controls: the dialog's
 * effect is three lines of glue around this, and this is the part with the
 * decisions in it. What cannot be tested here is that a browser is asked to
 * focus the answer — see `overview.test.ts`, and the note there about what
 * remains browser-only.
 */

const MARKS = ["Solaris", "Stalker", "Arrival", "Dune"];

test("the row that moved up into the gap takes the focus", () => {
  // The film at index 1 was given another mark and left the list. The films
  // after it have moved up, so index 1 is now the one under the reader's hand.
  assert.equal(refocus(["Solaris", "Arrival", "Dune"], 1, "Close"), "Arrival");
});

test("the last row leaving falls back to the row above it", () => {
  assert.equal(refocus(["Solaris", "Stalker", "Arrival"], 3, "Close"), "Arrival");
  assert.equal(refocus(["Solaris"], 3, "Close"), "Solaris");
});

test("the first row leaving keeps the focus at the top of the list", () => {
  assert.equal(refocus(["Stalker", "Arrival", "Dune"], 0, "Close"), "Stalker");
});

test("an emptied list hands focus to the way out", () => {
  // The last film under this tile was given another mark. Focus has to stay
  // inside the dialog, and the only thing left in it is the way out.
  assert.equal(refocus([], 0, "Close"), "Close");
  assert.equal(refocus([], 7, "Close"), "Close");
});

test("nothing to focus and nothing to fall back to is nothing, not a throw", () => {
  // Reachable only if the dialog has no controls at all, which it always has.
  // Answering null keeps that a caller's `?.focus()` rather than a crash inside
  // an effect.
  assert.equal(refocus([], 0, null), null);
});

test("a position that was never remembered focuses the first row", () => {
  // Nothing in the list had been focused: the reader arrived, the list changed.
  assert.equal(refocus(MARKS, -1, "Close"), "Solaris");
});

test("an unchanged list focuses where focus already was", () => {
  // Not a case the dialog uses — it only calls this when focus has been lost —
  // but the rule has to be total, and a list that did not change is the one
  // place it could be asked something ambiguous.
  assert.equal(refocus(MARKS, 2, "Close"), "Arrival");
});
