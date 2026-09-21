import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { canonicalTitle, filmIdentity, filmKey } from "./identity.ts";

/**
 * How a film is named, held to being one rule rather than an agreement.
 *
 * The contracts that matter most here are the two Unicode counterexamples. They
 * are not hardening against a future problem: each of them was a live defect,
 * in opposite directions, for as long as two folds existed. They are written as
 * fixed expectations of *this* rule — never as "whatever the database does" —
 * because the whole repair is that the database no longer has an opinion.
 */

/**
 * `İ` (U+0130) lowercases to `i` plus a combining dot in JavaScript, and folds
 * to plain `i` under Postgres' collation. Postgres used to call these one film
 * and JavaScript two.
 */
const CAPITAL_I_WITH_DOT = "İ";

/**
 * `Ⱟ` (U+2C2F) and `ⱟ` (U+2C5F) are a case pair JavaScript knows about and
 * some Postgres collations do not. JavaScript used to call these one film and
 * Postgres two.
 */
const GLAGOLITIC_UPPER = "Ⱟ";
const GLAGOLITIC_LOWER = "ⱟ";

describe("how a film is named", () => {
  test("the rule is whitespace, then case, then composition — in that order", () => {
    assert.equal(canonicalTitle("Black Bag"), "black bag");
    assert.equal(canonicalTitle("  Black Bag  "), "black bag", "the ends were not trimmed");
    assert.equal(canonicalTitle("Black   Bag"), "black bag", "an inner run was not collapsed");
    assert.equal(canonicalTitle("Black\tBag\nAgain"), "black bag again", "tabs and newlines are whitespace");
    assert.equal(canonicalTitle("BLACK BAG"), "black bag");
  });

  test("composition is settled, so the same title typed two ways is one title", () => {
    // é as one code point, and as e plus a combining acute.
    const precomposed = "Amélie";
    const decomposed = "Amélie";
    assert.notEqual(precomposed, decomposed, "the fixture is no longer two spellings");
    assert.equal(canonicalTitle(precomposed), canonicalTitle(decomposed));
    assert.equal(canonicalTitle(precomposed), "amélie".normalize("NFC"));
  });

  test("nothing is folded that the rule does not name", () => {
    // No accent stripping: this is identity, not search.
    assert.notEqual(canonicalTitle("Amélie"), canonicalTitle("Amelie"));
    // No compatibility folding: a ligature is not two letters. NFKC would merge
    // these and the rule deliberately uses NFC.
    assert.notEqual(canonicalTitle("ﬁlm"), canonicalTitle("film"));
    // And no trimming of what is inside a word.
    assert.notEqual(canonicalTitle("Black Bag"), canonicalTitle("BlackBag"));
  });

  test("the year is half of the name", () => {
    assert.notEqual(filmKey({ title: "Heat", year: 1995 }), filmKey({ title: "Heat", year: 1986 }));
    assert.equal(filmKey({ title: "Heat", year: 1995 }), filmKey({ title: " heat ", year: 1995 }));
    assert.deepEqual(filmIdentity({ title: " Black   Bag ", year: 2025 }), {
      canonicalTitle: "black bag",
      year: 2025,
    });
  });

  test("a key cannot be produced two ways", () => {
    // The separator cannot occur in a canonical title, so a title ending in
    // digits cannot borrow the year's place.
    assert.notEqual(filmKey({ title: "ab", year: 12 }), filmKey({ title: "ab 1", year: 2 }));
    assert.notEqual(filmKey({ title: "ab", year: 12 }), filmKey({ title: "ab1", year: 2 }));
  });

  /* --------------------------------------------- the two counterexamples */

  test("İ and i are two films, and that is this rule's answer rather than a database's", () => {
    // Postgres folds these together. JavaScript does not, and JavaScript is now
    // the only thing deciding — so they are two films everywhere, consistently,
    // instead of one in the taste model and two in a verdict history.
    const upper = `${CAPITAL_I_WITH_DOT}stanbul File`;
    const lower = "istanbul File";
    assert.notEqual(
      canonicalTitle(upper),
      canonicalTitle(lower),
      "the rule quietly reproduced a collation's answer",
    );
    assert.notEqual(filmKey({ title: upper, year: 2020 }), filmKey({ title: lower, year: 2020 }));
  });

  test("Ⱟ and ⱟ are one film, and that is this rule's answer too", () => {
    // Some Postgres collations keep these apart. JavaScript folds them, and
    // again JavaScript is the only decider — so they are one film everywhere.
    assert.equal(
      canonicalTitle(GLAGOLITIC_UPPER),
      canonicalTitle(GLAGOLITIC_LOWER),
      "the case pair was not folded",
    );
    assert.equal(
      filmKey({ title: GLAGOLITIC_UPPER, year: 2020 }),
      filmKey({ title: GLAGOLITIC_LOWER, year: 2020 }),
    );
  });

  test("the answer is the same however many times it is asked", () => {
    for (const title of ["Black Bag", `${CAPITAL_I_WITH_DOT}x`, GLAGOLITIC_UPPER, "Amélie", " a  b "]) {
      const once = canonicalTitle(title);
      assert.equal(canonicalTitle(once), once, `${JSON.stringify(title)} is not stable under re-naming`);
      assert.equal(once, once.normalize("NFC"), "the result is not in NFC");
    }
  });

  test("this module reaches for nothing", async () => {
    // Neutrality is the whole reason it exists: the verdict model may import it
    // precisely because importing it brings no taste model, no store and no
    // infrastructure with it.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("identity.ts", import.meta.url), "utf8"),
    );
    assert.equal(/^\s*import /mu.test(source), false, "the shared film identity took a dependency");
  });
});
