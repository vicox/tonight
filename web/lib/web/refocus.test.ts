import assert from "node:assert/strict";
import test from "node:test";

import { fallbackTo, rescueTo, returnTo } from "./refocus.ts";

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
 * Where focus lands when what opened a dialog has gone.
 *
 * Deleting can take away every control of its kind, and the answer must never be
 * nothing: a browser with nothing to focus drops it on `<body>`, which is a
 * reader at the top of the page with no way back to where they were. So each
 * case below ends with an assertion that an answer was given.
 *
 * The two islands compose these three rules the same way, and `closing` and
 * `refreshed` below are that composition written once, with strings standing in
 * for controls. That the components compose it this way is `overview.test.ts`;
 * that a browser really lands there is the pass through a real one.
 */

/** The genres section, as the labels it has and the heading it always has. */
const HEADING = "Your genres";
const SECTION = HEADING;

/** The dialog closing: focus is owed back to what opened it, if it is still there. */
const closing = (
  invoker: string | null,
  present: boolean,
  ways: readonly (string | null)[],
  section: string | null,
) => returnTo(invoker, present, fallbackTo([...ways, section], invoker));

/** The render after it: whatever took focus has gone, and nothing else has it. */
const refreshed = (
  handedTo: string | null,
  ways: readonly (string | null)[],
  section: string | null,
) => rescueTo(handedTo, ways.includes(handedTo), true, fallbackTo([...ways, section], null));

test("a genre that has gone hands focus to a genre that is still there", () => {
  const back = closing("Mystery", false, ["Slow Burn", "Popcorn Chaos"], SECTION);
  assert.equal(back, "Slow Burn");
  assert.notEqual(back, null);

  // And a later render strands nothing, because focus is not on what went.
  assert.equal(refreshed(back, ["Slow Burn", "Popcorn Chaos"], SECTION), null);
});

test("the last genre gone hands focus to the section itself", () => {
  // Nothing of the same kind is left, and the island that drew the labels is
  // unmounted with them. The heading is what the section keeps either way.
  const back = closing("Mystery", false, [], SECTION);
  assert.equal(back, HEADING);
  assert.notEqual(back, null);
});

test("a vibe that has gone hands focus to another card before anything else", () => {
  const back = closing("Quiet Dread", false, ["Small Town Secrets", "9 other movies"], "Your vibes");
  assert.equal(back, "Small Town Secrets");
  assert.notEqual(back, null);
});

test("the last vibe gone hands focus to the films that are in none", () => {
  // The stack is empty and the remainder's line is the only way into a film
  // from this section — which is exactly where a reader is going.
  const back = closing("Quiet Dread", false, ["9 other movies"], "Your vibes");
  assert.equal(back, "9 other movies");
  assert.notEqual(back, null);
});

test("the last vibe gone with every film filed hands focus to the section", () => {
  // No card left and no remainder — every film is in some other vibe, or there
  // are no films at all. The heading is still there.
  const back = closing("Quiet Dread", false, [null], "Your vibes");
  assert.equal(back, "Your vibes");
  assert.notEqual(back, null);
});

test("dismissing a dialog hands focus back to what opened it", () => {
  // Escape, the way out and a press outside changed nothing. What opened the
  // dialog is where focus was.
  assert.equal(closing("Mystery", true, ["Slow Burn", "Mystery"], SECTION), "Mystery");
  assert.equal(closing("Quiet Dread", true, ["Quiet Dread"], "Your vibes"), "Quiet Dread");
});

test("a control that has gone from somewhere else is rescued by the next render", () => {
  // The other order: the dialog was dismissed, focus went back to the label —
  // and a render without it arrives afterwards. Nothing else has focus, so it is
  // on the document.
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
