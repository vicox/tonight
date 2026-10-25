import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { effectivelySeen } from "../seen.ts";
import { JUDGEMENTS } from "../verdicts/model.ts";
import { DEFAULT_VIEWING, VIEWINGS, checkViewing, orderMovie } from "./model.ts";

/**
 * What a Movie says, and the one thing it may never be made to say.
 *
 * A Movie carries where a film stands on the user's list. It does not carry what
 * they thought of it — that is a Verdict, and the whole of this refactor was
 * moving the three words that expressed an opinion out of a field that also
 * expressed a fact. So these are mostly about what is *not* here: no opinion,
 * and no empty answer.
 *
 * The derivation that joins the two back together lives in `lib/seen.ts` and is
 * exercised at the bottom, because it is the one place where a verdict is
 * allowed to say something about a Movie's subject — and it says it about
 * watching, never about liking.
 */

describe("what a movie says about watching", () => {
  test("there are three answers, and a new film is on the list to see", () => {
    assert.deepEqual(VIEWINGS, ["seen", "want-to-see", "dont-want-to-see"]);
    assert.equal(DEFAULT_VIEWING, "want-to-see");
  });

  test("an opinion is not one of them", () => {
    // The whole point. These three were `MovieState` values and are `Judgement`
    // values now, and a Movie that could still take one would be two sources of
    // truth for the same sentence.
    for (const judgement of JUDGEMENTS) {
      assert.equal((VIEWINGS as readonly string[]).includes(judgement), false, judgement);
      assert.throws(() => checkViewing(judgement), /must be one of seen, want-to-see, dont-want-to-see/u, judgement);
    }

    // And the words a refusal used to be written in are not one either: not
    // wanting a film is `dont-want-to-see`, and an evening is not a viewing.
    for (const reach of ["not-ever", "not-tonight"]) {
      assert.throws(() => checkViewing(reach), /must be one of seen, want-to-see, dont-want-to-see/u, reach);
    }
  });

  test("the refusal says where an opinion goes instead", () => {
    // A caller sending `liked` here has not made a typo, it has misunderstood the
    // model — so the message says which tool it wanted rather than only listing
    // what this field takes.
    assert.throws(() => checkViewing("liked"), /verdict/iu);
  });

  test("there is no empty answer, and the old spellings are refused", () => {
    for (const nothing of [null, undefined, "", "unknown", "unseen", "not_seen"]) {
      assert.throws(() => checkViewing(nothing), /must be one of/u, JSON.stringify(nothing));
    }
  });

  test("all three answers survive the boundary unchanged", () => {
    for (const viewing of VIEWINGS) assert.equal(checkViewing(viewing), viewing);
  });

  test("a movie's public shape carries viewing and no opinion", () => {
    const movie = orderMovie({
      title: "Heat",
      year: 1995,
      imdbId: null,
      viewing: "seen",
      vibes: ["Quiet Dread"],
    });

    // Named field by field, which is what stops the store's own uuid reaching a
    // caller — and now also what would make re-adding an opinion deliberate.
    assert.deepEqual(Object.keys(movie), ["title", "year", "imdbId", "viewing", "vibes"]);
    for (const gone of ["state", "liked", "loved", "disliked", "judgement"]) {
      assert.equal(gone in movie, false, `${gone} is back on a movie`);
    }
  });
});

describe("whether they have seen it, from both things that can say so", () => {
  test("the fact says it outright", () => {
    assert.equal(effectivelySeen("seen", null), true);
    assert.equal(effectivelySeen("want-to-see", null), false);
    assert.equal(effectivelySeen("dont-want-to-see", null), false);
  });

  test("a standing judgement says it too, with no movie at all", () => {
    // Nobody likes a film they have not seen. This is the half that keeps a
    // judgement from losing the viewing knowledge the old `liked` state carried
    // — and it holds whatever the list says, because a verdict does not need a
    // Movie row to agree with it.
    for (const judgement of JUDGEMENTS) {
      assert.equal(effectivelySeen("want-to-see", { judgement }), true, judgement);
    }
  });

  test("not seen on the list plus a judgement resolves to seen, and loses neither fact", () => {
    // A contradiction the user can create, and the opinion is the stronger
    // evidence about whether they watched it. Deliberately the whole of the
    // handling: both raw facts stay exactly where they are stored, and the page
    // and the recommendation both read them from there.
    assert.equal(effectivelySeen("want-to-see", { judgement: "loved" }), true);
    assert.equal(effectivelySeen("dont-want-to-see", { judgement: "loved" }), true);
  });

  test("the rule is about what stands, so a taken-back opinion cannot reach it", () => {
    // Structural rather than checked: what arrives here is already resolved by
    // `current`, and `null` is what a withdrawn or superseded judgement leaves.
    assert.equal(effectivelySeen("want-to-see", null), false);
  });
});
