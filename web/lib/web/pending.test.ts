import assert from "node:assert/strict";
import test from "node:test";

import { pending } from "./pending.ts";

/**
 * The one place that decides how "a write is in flight" is written into the DOM.
 *
 * A unit test, not a DOM one. The behaviour that matters is a browser's — a
 * disabled element cannot hold or take focus — and nothing available here models
 * it faithfully: jsdom implements only half of it, so an assertion about the
 * other half would be green whatever the code did. What can be pinned honestly is
 * the decision itself, which is why it was pulled out into a function: `pending`
 * is small enough that "does it ever say `disabled`" is the whole question.
 *
 * The other half of the guard is in `overview.test.ts`, which holds the trigger
 * to using this and to carrying no native `disabled` attribute of its own.
 */

test("pending says aria-disabled, and never the attribute that breaks the keyboard", () => {
  assert.deepEqual(pending(true), { "aria-disabled": true });
  assert.deepEqual(pending(false), {});
});

test("nothing it returns is a native disabled, under any spelling", () => {
  // Asserted over the keys rather than by naming the one word, so a future
  // `disabled: false` or an `inert` cannot slip past a test looking for a string.
  for (const busy of [true, false]) {
    for (const key of Object.keys(pending(busy))) {
      assert.ok(key.startsWith("aria-"), `pending(${busy}) sets ${key}, which is not an ARIA hint`);
    }
  }

  assert.equal("disabled" in pending(true), false);
  assert.equal("inert" in pending(true), false);
});
