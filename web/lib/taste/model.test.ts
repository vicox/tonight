import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { effectivelySeen } from "../seen.ts";
import { JUDGEMENTS, REACHES } from "../verdicts/model.ts";
import { VIEWINGS, checkViewing, orderMovie } from "./model.ts";

/**
 * What a Movie says, and the one thing it may never be made to say.
 *
 * A Movie carries whether the user watched a film. It does not carry what they
 * thought of it — that is a Verdict, and the whole of this refactor was moving
 * the three words that expressed an opinion out of a field that also expressed a
 * fact. So these are mostly about what is *not* here: no opinion, and no way for
 * silence to become a statement.
 *
 * The derivation that joins the two back together lives in `lib/seen.ts` and is
 * exercised at the bottom, because it is the one place where a verdict is
 * allowed to say something about a Movie's subject — and it says it about
 * watching, never about liking.
 */

describe("what a movie says about watching", () => {
  test("there are two answers, and the third is not one of them", () => {
    assert.deepEqual(VIEWINGS, ["seen", "unseen"]);

    // `null` is deliberately outside the union. It is the absence of an answer,
    // and a value in the list would make an exhaustive `switch` able to treat it
    // as one more thing the user said.
    assert.equal((VIEWINGS as readonly string[]).includes("null"), false);
  });

  test("an opinion is not one of them", () => {
    // The whole point. These three were `MovieState` values and are `Judgement`
    // values now, and a Movie that could still take one would be two sources of
    // truth for the same sentence.
    for (const judgement of JUDGEMENTS) {
      assert.equal((VIEWINGS as readonly string[]).includes(judgement), false, judgement);
      assert.throws(() => checkViewing(judgement), /must be one of seen, unseen/u, judgement);
    }

    // And a refusal is not one either: turning a film down is neither watching
    // it nor an opinion of it.
    for (const reach of REACHES) {
      assert.throws(() => checkViewing(reach), /must be one of seen, unseen/u, reach);
    }
  });

  test("the refusal says where an opinion goes instead", () => {
    // A caller sending `liked` here has not made a typo, it has misunderstood the
    // model — so the message says which tool it wanted rather than only listing
    // what this field takes.
    assert.throws(() => checkViewing("liked"), /verdict/iu);
  });

  test("silence is accepted, and never turned into a statement", () => {
    // `null` is a value and not a refusal: it says Tonight has not been told.
    assert.equal(checkViewing(null), null);

    // The one thing this must never do. `unseen` is something the user said and
    // nothing here may put that sentence in their mouth.
    for (const nothing of [undefined, "", "unknown", "not_seen"]) {
      assert.notEqual(checkViewing(null), "unseen");
      if (nothing === undefined) continue;
      assert.throws(() => checkViewing(nothing), /must be one of/u, JSON.stringify(nothing));
    }
  });

  test("both answers survive the boundary unchanged", () => {
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
    assert.equal(effectivelySeen("unseen", null), false);
    assert.equal(effectivelySeen(null, null), false);
  });

  test("a standing judgement says it too, with no movie at all", () => {
    // Nobody likes a film they have not seen. This is the half that keeps a
    // judgement from losing the viewing knowledge the old `liked` state carried
    // — and it holds for a film that was never saved, because a verdict does not
    // need a Movie row to exist.
    for (const judgement of JUDGEMENTS) {
      assert.equal(effectivelySeen(null, { judgement }), true, judgement);
    }
  });

  test("a refusal says nothing about watching", () => {
    // *"Not ever"* is most often said about a film somebody has never seen and
    // does not intend to, and *"not tonight"* is about an evening. Reading
    // either as evidence of watching would invent a viewing out of a refusal.
    for (const rejected of REACHES) {
      assert.equal(effectivelySeen(null, { rejected }), false, rejected);
      assert.equal(effectivelySeen("unseen", { rejected }), false, rejected);
      // And it does not take away a fact that was stated.
      assert.equal(effectivelySeen("seen", { rejected }), true, rejected);
    }
  });

  test("explicitly unseen plus a judgement resolves to seen, and loses neither fact", () => {
    // A contradiction the user can create, and the opinion is the stronger
    // evidence about whether they watched it. Deliberately the whole of the
    // handling: both raw facts stay exactly where they are stored, and the page
    // and the recommendation both read them from there.
    assert.equal(effectivelySeen("unseen", { judgement: "loved" }), true);
  });

  test("the rule is about what stands, so a taken-back opinion cannot reach it", () => {
    // Structural rather than checked: what arrives here is already resolved by
    // `current`, and `null` is what a withdrawn or superseded judgement leaves.
    assert.equal(effectivelySeen(null, null), false);
    assert.equal(effectivelySeen("unseen", null), false);
  });
});
