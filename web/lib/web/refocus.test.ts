import assert from "node:assert/strict";
import test from "node:test";

import { refocus, rescueTo, returnTo } from "./refocus.ts";

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

/**
 * Where focus goes when a dialog closes, and where it goes if that place then
 * disappears.
 *
 * Two moments of one race, with strings standing in for controls. What the
 * components do is turn DOM facts — is this element still in the document, has
 * anything else taken focus — into these arguments; the decisions are here.
 */

test("focus goes back to the control that opened the dialog", () => {
  assert.equal(returnTo("the tile", true, "a tile"), "the tile");
  assert.equal(returnTo("2 without status", true, "a tile"), "2 without status");
});

test("a refresh that removes the invoker before the dialog closes", () => {
  // Order A: the last film without a status was given one, the page came back
  // without the quiet line, and only then was the dialog dismissed. There is
  // nothing left to focus but something stable.
  assert.equal(returnTo("2 without status", false, "a tile"), "a tile");
  assert.equal(returnTo(null, false, "a tile"), "a tile");

  // And nothing at all is an answer, not a throw: a caller has `?.focus()`.
  assert.equal(returnTo(null, false, null), null);
});

test("a refresh that removes the invoker after the dialog closes", () => {
  // Order B: the dialog closed first, so focus went back to the quiet line —
  // and the render that takes the line off the page arrives next, leaving focus
  // on the document. That is the one case worth moving focus for.
  assert.equal(rescueTo("2 without status", false, true, "a tile"), "a tile");

  // Still there: nothing to rescue, and nothing to disturb.
  assert.equal(rescueTo("2 without status", true, true, "a tile"), null);

  // Gone, but somebody else has focus — they tabbed away, or pressed something.
  // Taking it off them would be worse than the problem.
  assert.equal(rescueTo("2 without status", false, false, "a tile"), null);

  // No dialog has been closed yet, so nothing is owed.
  assert.equal(rescueTo(null, false, true, "a tile"), null);
});
