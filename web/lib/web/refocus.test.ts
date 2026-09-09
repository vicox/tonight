import assert from "node:assert/strict";
import test from "node:test";

import { fallbackTo, refocus, rescueTo, returnTo } from "./refocus.ts";

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

/**
 * Where focus lands after something is deleted.
 *
 * A delete is the one thing that can take away every control of its kind, and
 * the answer must never be nothing: a browser with nothing to focus drops it on
 * `<body>`, which is a reader at the top of the page with no way back to where
 * they were. So each case below ends with an assertion that an answer was given.
 *
 * The two islands compose these three rules the same way, and `closing` and
 * `refreshed` below are that composition written once, with strings standing in
 * for controls. That the components compose it this way is `overview.test.ts`;
 * that a browser really lands there is the pass through a real one.
 */

/** The genres section, as the labels it has and the heading it always has. */
const HEADING = "Your genres";
const SECTION = HEADING;

/**
 * The dialog closing: focus is owed back, unless what opened it was just deleted.
 */
const closing = (
  invoker: string | null,
  present: boolean,
  removed: boolean,
  ways: readonly (string | null)[],
  section: string | null,
) => returnTo(removed ? null : invoker, present, fallbackTo([...ways, section], invoker));

/** The render after it: whatever took focus has gone, and nothing else has it. */
const refreshed = (
  handedTo: string | null,
  ways: readonly (string | null)[],
  section: string | null,
) => rescueTo(handedTo, ways.includes(handedTo), true, fallbackTo([...ways, section], null));

test("deleting a genre hands focus to a genre that is still there", () => {
  // The page is a render behind: the deleted label is still on screen, and it is
  // still what opened the dialog. It is not where focus belongs.
  const back = closing("Mystery", true, true, ["Slow Burn", "Mystery", "Popcorn Chaos"], SECTION);
  assert.equal(back, "Slow Burn");
  assert.notEqual(back, "Mystery", "focus was handed to the label that is about to go");
  assert.notEqual(back, null);

  // And the render that removes it strands nothing, because focus is not on it.
  assert.equal(refreshed(back, ["Slow Burn", "Popcorn Chaos"], SECTION), null);
});

test("deleting the last genre hands focus to the section itself", () => {
  // Nothing of the same kind is left, and the island that drew the labels is
  // unmounted with them. The heading is what the section keeps either way.
  const back = closing("Mystery", true, true, ["Mystery"], SECTION);
  assert.equal(back, HEADING);
  assert.notEqual(back, null);
});

test("deleting a mix hands focus to another card before anything else", () => {
  const cards = ["Small Town Secrets", "Quiet Dread"];
  const back = closing("Quiet Dread", true, true, [...cards, "9 other movies"], "Your mixes");
  assert.equal(back, "Small Town Secrets");
  assert.notEqual(back, null);
});

test("deleting the last mix hands focus to the films that are in none", () => {
  // The stack is empty and the remainder's line has just become the only way
  // into a film from this section — which is exactly where a reader is going.
  const back = closing("Quiet Dread", true, true, ["Quiet Dread", "9 other movies"], "Your mixes");
  assert.equal(back, "9 other movies");
  assert.notEqual(back, null);
});

test("deleting the last mix with every film filed hands focus to the section", () => {
  // No card left and no remainder — every film is in some other mix, or there
  // are no films at all. The heading is still there.
  const back = closing("Quiet Dread", true, true, ["Quiet Dread", null], "Your mixes");
  assert.equal(back, "Your mixes");
  assert.notEqual(back, null);
});

test("dismissing a dialog still hands focus back to what opened it", () => {
  // Cancel, Escape, Close and a press outside are not deletions, and none of
  // them changed anything. What opened the dialog is where focus was.
  assert.equal(closing("Mystery", true, false, ["Slow Burn", "Mystery"], SECTION), "Mystery");
  assert.equal(closing("Quiet Dread", true, false, ["Quiet Dread"], "Your mixes"), "Quiet Dread");
});

test("a control deleted from somewhere else is rescued by the next render", () => {
  // The other order, and the other agent: the dialog was dismissed, focus went
  // back to the label — and a delete from an assistant or a second window takes
  // that label away. Nothing else has focus, so it is on the document.
  assert.equal(refreshed("Mystery", ["Slow Burn"], SECTION), "Slow Burn");
  assert.equal(refreshed("Mystery", [], SECTION), HEADING);
});

test("no section can run out of somewhere to put focus", () => {
  // The whole point of the list. Every one of these is a section with nothing of
  // its own left, and every one of them still answers.
  for (const ways of [[], [null], ["Mystery"], [null, null]]) {
    assert.notEqual(
      fallbackTo([...ways, SECTION], "Mystery"),
      null,
      `a section with ${JSON.stringify(ways)} had nowhere to put focus`,
    );
  }

  // And a list with genuinely nothing in it is `null` rather than a throw: every
  // caller ends in `?.focus()`, and a page without sections is not a page.
  assert.equal(fallbackTo([]), null);
  assert.equal(fallbackTo([null, null]), null);
  assert.equal(fallbackTo(["Mystery"], "Mystery"), null);
});
