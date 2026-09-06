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
const MARKS = new URL("../../components/movie-state.tsx", import.meta.url);

const source = readFileSync(VIEW, "utf8");
const marks = readFileSync(MARKS, "utf8");

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

test("films in no mix are listed, and the section is absent when there are none", () => {
  // A film gets there by ordinary means — recording that somebody watched it, or
  // deleting the last mix it was in — so the page has to show it rather than lose
  // it. What it must not become is a queue: same rows, same marks, no controls of
  // its own, and no empty heading standing there implying something is outstanding.
  // The section being right is not the same as the page having it. Every other
  // assertion here reads the helper, and all of them would go on passing if the
  // one line that renders it were deleted — so the invocation is pinned first.
  assert.match(
    bodyOf("TasteView"),
    /<Loose movies=\{taste\.movies\}/,
    "the page does not render the section, so a film in no mix is nowhere",
  );

  const loose = bodyOf("Loose");

  assert.match(loose, /movie\.mixes\.length === 0/, "the section is not selected on emptiness");
  assert.match(loose, /if \(!loose\.length\) return null;/, "an empty section is still rendered");
  assert.match(loose, /title="Other movies"/);
  assert.match(loose, /<Films movies=\{loose\}/, "it does not draw its own rows");

  // No second ontology: no sorting, no dating, no status of its own.
  assert.equal(
    /sort\(|Date|recent|inbox|unsorted|archive|status/i.test(loose),
    false,
    "the section grew a concept of its own",
  );
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

test("both marks are always drawn, and lit only by a yes", () => {
  // The model keeps three answers; this page draws two. `false` and `null` are
  // deliberately the same picture here — an unlit eye reads as "not marked as
  // watched", which is true of both — so nothing may render conditionally on the
  // value, and only `=== true` may light a mark.
  const toggle = bodyOf("Toggle", marks);
  assert.equal(
    /value === null|watched === null|liked === null/.test(marks),
    false,
    "a mark still disappears when nothing has been said",
  );

  assert.match(marks, /on=\{watched === true\}/);
  assert.match(marks, /on=\{liked === true\}/);
  assert.match(toggle, /aria-pressed=\{on\}/);
});

test("pressing a mark states the opposite of yes, from either unlit state", () => {
  // `!== true` is the whole rule, and it is the reason the two unlit states can
  // look alike: from `false` and from `null` the press means the same thing.
  // `=== false` would leave a film nobody had spoken about unable to be lit.
  assert.match(marks, /onPress=\{\(\) => set\("watched", watched !== true\)\}/);
  assert.match(marks, /onPress=\{\(\) => set\("liked", liked !== true\)\}/);

  // And what is sent is that boolean, so a press always leaves an explicit
  // answer. Nothing on this page can write `null` back.
  assert.match(bodyOf("MovieState", marks), /set\(field: "watched" \| "liked", to: boolean\)/);
  assert.equal(/watched: null|liked: null/.test(marks), false, "the page can write null");
});

test("a mark is a button with a name and a state, and no words on screen", () => {
  const toggle = bodyOf("Toggle", marks);
  assert.match(toggle, /<button/);
  assert.match(toggle, /type="button"/);
  assert.match(toggle, /aria-label=\{label\}/);
  assert.match(toggle, /disabled=\{busy\}/);

  // The glyph is decoration; the button carries the meaning.
  assert.match(toggle, /aria-hidden="true"/);

  // The whole handle is in the accessible name. A list of these is otherwise a
  // column of buttons all called the same thing — and with the title alone, the
  // two `Dune`s would sound identical, which is the case the handle exists for.
  assert.match(marks, /label=\{`Watched — \$\{title\} \(\$\{year\}\)`\}/);
  assert.match(marks, /label=\{`Liked — \$\{title\} \(\$\{year\}\)`\}/);

  // And nowhere else. Counted over the code with the prose taken out, because a
  // comment explaining why the name reads "Watched" is not a caption on screen.
  const code = withoutComments(marks);
  for (const word of ["Watched", "Liked", "Seen"]) {
    const anywhere = [...code.matchAll(new RegExp(word, "g"))].length;
    const inTheName = [...code.matchAll(new RegExp(`label=\\{\`${word} `, "g"))].length;
    assert.equal(anywhere, inTheName, `"${word}" is written somewhere other than the label`);
  }
});

test("a mark writes through the one route boundary, and keeps no copy of its own", () => {
  const write = bodyOf("MovieState", marks);

  // The same route boundary, the same store, the same domain rules as every
  // other write from this website. No second path to the movie table.
  assert.match(write, /fetch\("\/api\/movies", \{/);
  assert.match(write, /method: "PATCH"/);
  assert.match(write, /router\.refresh\(\)/);

  // No optimistic state: the mark renders the props it was given, so an
  // assistant writing between the render and the press cannot leave this
  // showing a film the store disagrees about.
  assert.equal(
    /useState[<(]\s*boolean/.test(marks),
    false,
    "the control holds its own copy of the value",
  );
  assert.match(write, /if \(busy\) return;/, "a second press during a write is not stopped");
});

/**
 * One function out of the source, so a check cannot match the wrong one.
 *
 * Ends at the next declaration *or* the next doc comment, whichever comes first —
 * without the second, a function would swallow the prose introducing the one
 * after it, and a check for the word "poster" would fail on a comment promising
 * there are none.
 */
function bodyOf(name: string, file: string = source): string {
  const start = file.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `no ${name}() in the component`);

  const rest = file.slice(start);
  const ends = ["\n/**", "\nfunction "].map((mark) => rest.indexOf(mark, 1)).filter((at) => at > 0);
  return ends.length ? rest.slice(0, Math.min(...ends)) : rest;
}

/** The file with its prose removed, for checks about what reaches the screen. */
function withoutComments(file: string): string {
  return file.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
