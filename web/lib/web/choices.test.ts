import assert from "node:assert/strict";
import test from "node:test";

import type { Viewing } from "../taste/model.ts";
import type { Judgement } from "../verdicts/model.ts";
import {
  CHOICES,
  WHEN,
  asksWhen,
  choiceFor,
  decide,
  isPressed,
  refusalFor,
  refusalSentence,
  REFUSALS,
  type Film,
} from "./choices.ts";

/**
 * A film's screen: the five answers of *What do you think?*, the two of *When did
 * you see it?*, and what each press comes to in the model that already exists —
 * a verdict with its seen value, a listing with the opinion taken back, a
 * withdrawal, the viewing alone, nothing, or a refusal the page can name. The
 * writes themselves are `choose.test.ts`.
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

const VIEWINGS: Viewing[] = ["want-to-see", "seen-now", "seen-before", "dont-want-to-see"];

test("five answers at the top, in the screen's order and words", () => {
  assert.deepEqual(
    CHOICES.map((one) => one.label),
    ["Love it", "Like it", "Want to see", "Not interested", "Dislike"],
  );
  assert.deepEqual(
    CHOICES.map((one) => one.key),
    ["love", "like", "want", "not-interested", "dislike"],
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

test("two answers below, only when they saw it", () => {
  assert.deepEqual(
    WHEN.map((one) => [one.key, one.label, one.kind, one.kind === "when" && one.viewing]),
    [
      ["seen-now", "Seen now", "when", "seen-now"],
      ["seen-before", "Seen before", "when", "seen-before"],
    ],
  );
});

test("only the seven are answers", () => {
  for (const value of ["seen", "loved", "", null, undefined, 1, "Love it", "love ", "Seen now", "seen_now"]) {
    assert.equal(choiceFor(value), null, `${String(value)} was taken for a choice`);
  }
  for (const key of ["love", "like", "want", "not-interested", "dislike", "seen-now", "seen-before"]) {
    assert.ok(choiceFor(key), key);
  }
});

test("the second question is asked exactly while the film is seen", () => {
  assert.deepEqual(
    VIEWINGS.map((viewing) => [viewing, asksWhen(viewing)]),
    [
      ["want-to-see", false],
      ["seen-now", true],
      ["seen-before", true],
      ["dont-want-to-see", false],
    ],
  );
});

test("what is pressed is what is stored, top and below", () => {
  const pressed = (viewing: Viewing, judgement: Judgement | null) => ({
    top: CHOICES.filter((one) => isPressed(one, viewing, judgement)).map((one) => one.key),
    below: WHEN.filter((one) => isPressed(one, viewing, judgement)).map((one) => one.key),
  });

  // As the website leaves a film: an opinion with a seen value, or a listing alone.
  assert.deepEqual(pressed("seen-now", "loved"), { top: ["love"], below: ["seen-now"] });
  assert.deepEqual(pressed("seen-before", "disliked"), { top: ["dislike"], below: ["seen-before"] });
  assert.deepEqual(pressed("want-to-see", null), { top: ["want"], below: [] });
  assert.deepEqual(pressed("dont-want-to-see", null), { top: ["not-interested"], below: [] });

  // Seen before, nothing said — a core anchored without a when, say.
  assert.deepEqual(pressed("seen-before", null), { top: [], below: ["seen-before"] });

  // A contradiction an assistant can still write shows both facts as stored.
  assert.deepEqual(pressed("want-to-see", "liked"), { top: ["like", "want"], below: [] });
});

test("an opinion is written with the seen value the film has, or seen now", () => {
  for (const [key, judgement] of [
    ["love", "loved"],
    ["like", "liked"],
    ["dislike", "disliked"],
  ] as [string, Judgement][]) {
    // From the list, or turned down: seen now, by default.
    for (const viewing of ["want-to-see", "dont-want-to-see"] as Viewing[]) {
      assert.deepEqual(decide(choice(key), film({ viewing })), { write: "opinion", judgement, viewing: "seen-now" });
    }
    // Already seen: when they saw it is kept — a film saved as seen before is not
    // made recent by an opinion.
    for (const viewing of ["seen-now", "seen-before"] as Viewing[]) {
      assert.deepEqual(decide(choice(key), film({ viewing })), { write: "opinion", judgement, viewing });
    }
  }

  // Another opinion replaces the one that stands, and keeps when they saw it.
  assert.deepEqual(decide(choice("like"), film({ viewing: "seen-before", judgement: "loved" })), {
    write: "opinion",
    judgement: "liked",
    viewing: "seen-before",
  });
});

test("the opinion that stands is taken back, and the film stays seen", () => {
  for (const [key, judgement] of [
    ["love", "loved"],
    ["like", "liked"],
    ["dislike", "disliked"],
  ] as [string, Judgement][]) {
    assert.deepEqual(decide(choice(key), film({ viewing: "seen-now", judgement })), { write: "withdrawal" });
  }
});

test("want to see and not interested list the film and take back the opinion", () => {
  for (const [key, viewing] of [
    ["want", "want-to-see"],
    ["not-interested", "dont-want-to-see"],
  ] as const) {
    for (const from of ["seen-now", "seen-before"] as Viewing[]) {
      for (const judgement of [null, "loved", "disliked"] as (Judgement | null)[]) {
        assert.deepEqual(decide(choice(key), film({ viewing: from, judgement })), { write: "listing", viewing });
      }
    }
    // Already there, with nothing said: nothing to write.
    assert.deepEqual(decide(choice(key), film({ viewing })), { write: "nothing" });
    // Already there, but an opinion stands beside it: pressing it takes that back.
    assert.deepEqual(decide(choice(key), film({ viewing, judgement: "liked" })), { write: "listing", viewing });
  }
  // From the one listing to the other.
  assert.deepEqual(decide(choice("want"), film({ viewing: "dont-want-to-see" })), {
    write: "listing",
    viewing: "want-to-see",
  });
});

test("when they saw it changes the viewing alone, and keeps the opinion", () => {
  for (const judgement of [null, "loved", "liked", "disliked"] as (Judgement | null)[]) {
    assert.deepEqual(decide(choice("seen-before"), film({ viewing: "seen-now", judgement })), {
      write: "viewing",
      viewing: "seen-before",
    });
    assert.deepEqual(decide(choice("seen-now"), film({ viewing: "seen-before", judgement })), {
      write: "viewing",
      viewing: "seen-now",
    });
  }
  assert.deepEqual(decide(choice("seen-now"), film({ viewing: "seen-now", judgement: "liked" })), { write: "nothing" });
  assert.deepEqual(decide(choice("seen-before"), film({ viewing: "seen-before" })), { write: "nothing" });
});

test("a full round: an opinion, when, a listing, and an opinion again", () => {
  // Starting on the list: Like it makes it seen now; Seen before keeps the like;
  // Want to see lists it and takes the like back; Love it is seen now again.
  let state: Film = film({ viewing: "want-to-see" });
  const apply = (key: string) => {
    const outcome = decide(choice(key), state);
    if ("refused" in outcome) throw new Error(`${key} refused: ${outcome.refused}`);
    if (outcome.write === "opinion") state = { ...state, judgement: outcome.judgement, viewing: outcome.viewing };
    if (outcome.write === "viewing") state = { ...state, viewing: outcome.viewing };
    if (outcome.write === "listing") state = { ...state, judgement: null, viewing: outcome.viewing };
    if (outcome.write === "withdrawal") state = { ...state, judgement: null };
    return [state.judgement, state.viewing, asksWhen(state.viewing)];
  };
  assert.deepEqual(apply("like"), ["liked", "seen-now", true]);
  assert.deepEqual(apply("seen-before"), ["liked", "seen-before", true]);
  assert.deepEqual(apply("want"), [null, "want-to-see", false]);
  assert.deepEqual(apply("love"), ["loved", "seen-now", true]);
  assert.deepEqual(apply("love"), [null, "seen-now", true]);
});

test("a liked or loved needs the film in a vibe; a dislike and a take-back do not", () => {
  const unfiled = film({ filed: false });
  assert.deepEqual(decide(choice("love"), unfiled), { refused: "vibe-required" });
  assert.deepEqual(decide(choice("like"), unfiled), { refused: "vibe-required" });
  assert.deepEqual(decide(choice("dislike"), unfiled), { write: "opinion", judgement: "disliked", viewing: "seen-now" });
  assert.deepEqual(decide(choice("love"), film({ filed: false, judgement: "loved" })), { write: "withdrawal" });
});

test("a vibe's core stays seen — now or before — keeps it under an opinion, and its opinions are free", () => {
  for (const viewing of ["seen-now", "seen-before"] as const) {
    for (const judgement of [null, "liked"] as (Judgement | null)[]) {
      const core = film({ core: true, viewing, judgement });
      assert.deepEqual(decide(choice("want"), core), { refused: "core" });
      assert.deepEqual(decide(choice("not-interested"), core), { refused: "core" });
    }
    assert.deepEqual(decide(choice("love"), film({ core: true, viewing })), {
      write: "opinion",
      judgement: "loved",
      viewing,
    });
    assert.deepEqual(decide(choice("dislike"), film({ core: true, viewing })), {
      write: "opinion",
      judgement: "disliked",
      viewing,
    });
  }
  // Between the two seen values it moves freely.
  assert.deepEqual(decide(choice("seen-now"), film({ core: true, viewing: "seen-before" })), {
    write: "viewing",
    viewing: "seen-now",
  });
  assert.deepEqual(decide(choice("seen-before"), film({ core: true, viewing: "seen-now" })), {
    write: "viewing",
    viewing: "seen-before",
  });
  assert.match(refusalSentence("core"), /so it stays seen — now or before\./u);
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
