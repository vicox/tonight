import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { effectivelySeen, isSeen } from "../seen.ts";
import { JUDGEMENTS } from "../verdicts/model.ts";
import {
  DEFAULT_VIEWING,
  SEEN_RULE,
  SEEN_VIEWINGS,
  TasteError,
  VIEWINGS,
  checkCore,
  checkViewing,
  orderMovie,
} from "./model.ts";

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
  test("there are four answers, and a new film is on the list to see", () => {
    assert.deepEqual(VIEWINGS, ["seen-now", "seen-before", "want-to-see", "dont-want-to-see"]);
    assert.deepEqual(SEEN_VIEWINGS, ["seen-now", "seen-before"]);
    assert.equal(DEFAULT_VIEWING, "want-to-see");
  });

  test("the old single seen is refused, with how to choose between the two", () => {
    // A caller still holding the vocabulary from before taste v15 is told the
    // rule, not given a value: which of the two is theirs to work out or ask.
    assert.throws(
      () => checkViewing("seen"),
      (error: unknown) =>
        error instanceof TasteError &&
        error.message.includes("must be one of seen-now, seen-before, want-to-see, dont-want-to-see") &&
        error.message.includes(`A watched film is ${SEEN_RULE}.`),
    );
    // Only for `seen`: another unknown word is not given the rule.
    assert.throws(
      () => checkViewing("watched"),
      (error: unknown) => error instanceof TasteError && !error.message.includes(SEEN_RULE),
    );
  });

  test("the rule says recent is now, long ago is before, and unclear is a question", () => {
    assert.match(SEEN_RULE, /^seen-now when they watched it recently/u);
    assert.match(SEEN_RULE, /in an evening with Tonight, or after Tonight suggested it/u);
    assert.match(SEEN_RULE, /seen-before when they place it some time ago/u);
    assert.match(SEEN_RULE, /when they did not say when, ask them once, briefly, and use seen-before if they still do not say$/u);
    assert.doesNotMatch(SEEN_RULE, /"/u, "the rule scripts a line in quotation marks");
  });

  test("an opinion is not one of them", () => {
    // The whole point. These three were `MovieState` values and are `Judgement`
    // values now, and a Movie that could still take one would be two sources of
    // truth for the same sentence.
    for (const judgement of JUDGEMENTS) {
      assert.equal((VIEWINGS as readonly string[]).includes(judgement), false, judgement);
      assert.throws(
        () => checkViewing(judgement),
        /must be one of seen-now, seen-before, want-to-see, dont-want-to-see/u,
        judgement,
      );
    }

    // And the words a refusal used to be written in are not one either: not
    // wanting a film is `dont-want-to-see`, and an evening is not a viewing.
    for (const reach of ["not-ever", "not-tonight"]) {
      assert.throws(
        () => checkViewing(reach),
        /must be one of seen-now, seen-before, want-to-see, dont-want-to-see/u,
        reach,
      );
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

  test("all four answers survive the boundary unchanged", () => {
    for (const viewing of VIEWINGS) assert.equal(checkViewing(viewing), viewing);
  });

  test("a core may name which seen value to save it as, and nothing else", () => {
    // Left out, it is absent — the store fills in seen-before, not this.
    assert.deepEqual(checkCore({ title: " Heat ", year: 1995 }, "create"), { title: "Heat", year: 1995 });
    for (const viewing of SEEN_VIEWINGS) {
      assert.deepEqual(checkCore({ title: "Heat", year: 1995, viewing }, "update"), {
        title: "Heat",
        year: 1995,
        viewing,
      });
    }
    for (const wrong of ["want-to-see", "dont-want-to-see", "seen", null, 1]) {
      assert.throws(
        () => checkCore({ title: "Heat", year: 1995, viewing: wrong }, "create"),
        /a core's viewing must be seen-now or seen-before/u,
        String(wrong),
      );
    }
  });

  test("a movie's public shape carries viewing and no opinion", () => {
    const movie = orderMovie({
      title: "Heat",
      year: 1995,
      imdbId: null,
      viewing: "seen-before",
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
  test("the fact says it outright, now or before", () => {
    assert.equal(effectivelySeen("seen-now", null), true);
    assert.equal(effectivelySeen("seen-before", null), true);
    assert.equal(effectivelySeen("want-to-see", null), false);
    assert.equal(effectivelySeen("dont-want-to-see", null), false);

    // `isSeen` is the list's half alone, for all four and for no film at all.
    assert.deepEqual(
      [...VIEWINGS, null].map((viewing) => [viewing, isSeen(viewing)]),
      [
        ["seen-now", true],
        ["seen-before", true],
        ["want-to-see", false],
        ["dont-want-to-see", false],
        [null, false],
      ],
    );
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
