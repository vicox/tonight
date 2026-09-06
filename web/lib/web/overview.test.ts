import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The signed-in overview, held to the decisions that make it a reading page.
 *
 * ## Why this reads the source rather than the rendering
 *
 * These would be better as assertions over rendered markup. They cannot be: the
 * suite is `node --test` over `.ts` files, Node's type stripping does not
 * transform JSX, and adding a transform to check a handful of properties would be
 * a test framework arriving for one component. So this is a contract test in the
 * style of `skills/tonight-recommend/test.sh` — it catches the deletion or
 * inversion of an explicit decision, and makes no claim to catch every way the
 * page could go wrong.
 *
 * What it pins is the set of decisions that are invisible when they break: a page
 * that quietly grew a poster, a `false` that became indistinguishable from
 * "nothing said", a create control on a page that is supposed to be read.
 */

const VIEW = new URL("../../components/taste-view.tsx", import.meta.url);

const source = readFileSync(VIEW, "utf8");

test("the resting page shows names and films, and no instruction", () => {
  // The instruction appears exactly once, and inside the disclosure. Twice would
  // mean the old always-on opening had come back under another name.
  assert.equal(
    source.split("{instruction}").length - 1,
    1,
    "an instruction is rendered in more than one place",
  );

  const card = bodyOf("Card");
  const disclosure = card.slice(card.indexOf("<details"), card.indexOf("</details>"));
  assert.ok(disclosure.includes("{instruction}"), "the instruction is outside the disclosure");
});

test("nothing on the page offers to create anything", () => {
  // The overview is grown in conversation. A create control here would make the
  // website the way in, which it deliberately is not.
  for (const control of ["Add genre", "Add mix", "Add movie", "Add film", "New genre", "New mix"]) {
    assert.equal(source.includes(control), false, `the overview offers "${control}"`);
  }
});

test("a film list is a list, without rules, columns or pictures", () => {
  const films = bodyOf("Films");

  assert.ok(films.includes("<ul"), "the films are not a list");
  assert.equal(/<table|<t[dhr]\b|role="(table|row|cell)"/.test(films), false, "it is a table");
  assert.equal(/divide-|border-[tb]\b|border-y\b/.test(films), false, "it has row separators");
  assert.equal(/<img|Image|poster|backdrop/i.test(films), false, "it carries an image");

  // The year is part of the film's name here, so it is set in the title's own
  // type: no size, colour or numeric treatment of its own.
  assert.match(films, /\{movie\.title\} \(\{movie\.year\}\)/, "the year is styled apart");
});

test("the IMDb link says IMDb, and is absent when there is no id", () => {
  const films = bodyOf("Films");
  assert.match(films, /movie\.imdbId !== null/, "the link is not conditional on there being an id");

  const link = bodyOf("Imdb");
  assert.match(link, /https:\/\/www\.imdb\.com\/title\//);
  assert.match(link, />\s*IMDb</, "the visible link text does not contain IMDb");
});

test("false is a mark of its own, and null is nothing at all", () => {
  const mark = bodyOf("Mark");

  // Nothing rendered for null: Tonight says nothing because it was told nothing,
  // and any glyph at all would be read as an answer.
  assert.match(mark, /if \(value === null\) return null;/);

  // And `false` is not a lighter version of `true`. `struck={!value}` is the
  // whole distinction, and both glyphs draw the strike from the same path — an
  // outline heart would say "unselected", which is the state above.
  assert.match(mark, /struck=\{!value\}/);
  for (const glyph of ["Eye", "Heart"]) {
    assert.match(bodyOf(glyph), /\{struck && <Strike \/>\}/, glyph);
  }
  assert.match(source, /function Strike\(\)/);
});

test("both states are announced in words, and null announces nothing", () => {
  // A listener has to be able to tell disliked from no opinion. The sr-only text
  // is inside `Mark`, which renders nothing at all for null — so the third state
  // is audible precisely by there being no third word.
  const mark = bodyOf("Mark");
  assert.match(mark, /<span className="sr-only">\{value \? yes : no\}<\/span>/);
  assert.match(mark, /aria-hidden="true"/, "the glyph is not hidden from a screen reader");

  const films = bodyOf("Films");
  assert.match(films, /yes="watched" no="not watched"/);
  assert.match(films, /yes="liked" no="disliked"/);
});

/**
 * One function out of the source, so a check cannot match the wrong one.
 *
 * Ends at the next declaration *or* the next doc comment, whichever comes first —
 * without the second, a function would swallow the prose introducing the one
 * after it, and a check for the word "poster" would fail on a comment promising
 * there are none.
 */
function bodyOf(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `no ${name}() in the component`);

  const rest = source.slice(start);
  const ends = ["\n/**", "\nfunction "].map((mark) => rest.indexOf(mark, 1)).filter((at) => at > 0);
  return ends.length ? rest.slice(0, Math.min(...ends)) : rest;
}
