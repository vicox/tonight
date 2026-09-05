import assert from "node:assert/strict";
import test from "node:test";

import { preview } from "./preview.ts";

/**
 * What the signed-in page shows of an instruction before anybody expands it.
 *
 * The rule that matters is the second field: `more` decides whether a disclosure
 * appears at all, so getting it wrong either hides the rest of somebody's own
 * words behind nothing, or offers to expand a line that has nothing under it.
 */

test("a short instruction is shown whole, with nothing to expand", () => {
  assert.deepEqual(preview("Ideas over spectacle. Ships optional."), {
    opening: "Ideas over spectacle. Ships optional.",
    more: false,
  });
});

test("a paragraph break is where the opening ends", () => {
  const { opening, more } = preview("Something is withheld.\n\nAnd that is the point.");

  assert.equal(opening, "Something is withheld.");
  assert.equal(more, true);
});

test("a long single line is cut on a word, and marked as having more", () => {
  const line = "word ".repeat(60).trim();
  const { opening, more } = preview(line);

  assert.ok(opening.length <= 121, `opening ran to ${opening.length} characters`);
  assert.ok(opening.endsWith("…"));
  assert.equal(opening.includes("wor…"), false, "it cut mid-word");
  assert.equal(more, true);
});

test("an unbreakable line is cut anyway rather than shown whole", () => {
  const { opening, more } = preview("x".repeat(400));

  assert.equal(opening, `${"x".repeat(120)}…`);
  assert.equal(more, true);
});

test("surrounding whitespace does not invent something to expand", () => {
  // A trailing newline is not more instruction, and offering to expand one would
  // open a disclosure onto nothing.
  assert.deepEqual(preview("  Ships optional.\n"), { opening: "Ships optional.", more: false });
});

test("an empty instruction previews as empty", () => {
  assert.deepEqual(preview(""), { opening: "", more: false });
});
