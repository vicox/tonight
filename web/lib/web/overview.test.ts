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

test("the row shows one mark, and it is the state the film is in", () => {
  // One icon per film, not five. A page of twenty films has to stay readable, and
  // the mark has to say what the film is rather than what it is not.
  assert.match(marks, /const shown = \(state: MovieState \| null\) =>/);
  assert.match(marks, /CHOICES\.find\(\(choice\) => choice\.state === state\) \?\? NOTHING_SAID/);
  assert.match(marks, /<current\.icon/, "the trigger does not draw the current state");

  // Exactly one icon element outside the menu.
  const trigger = marks.slice(marks.indexOf("<button\n          ref={trigger}"), marks.indexOf("{open && ("));
  assert.equal((trigger.match(/<current\.icon/g) ?? []).length, 1);
});

test("each state has its Lucide icon, and nothing-said has its own", () => {
  assert.match(marks, /from "lucide-react"/);
  for (const [state, icon] of [
    ["not_seen", "EyeOff"],
    ["seen", "Check"],
    ["liked", "ThumbsUp"],
    ["loved", "Heart"],
    ["disliked", "ThumbsDown"],
  ]) {
    assert.match(
      marks,
      new RegExp(`state: "${state}",[^}]*icon: ${icon}`),
      `${state} is not drawn with ${icon}`,
    );
  }

  // Circle draws `null`, and only that. It must not join the five: nothing in the
  // model, the store or the tools knows about it.
  assert.match(marks, /const NOTHING_SAID = \{ label: "Nothing said", icon: Circle \}/);
  assert.equal(
    /state: "nothing_said"|"circle"|MOVIE_STATES.*Circle/.test(marks),
    false,
    "Circle has been made into a sixth state",
  );
});

test("the menu offers the five real states, with an icon and words for each", () => {
  const menu = marks.slice(marks.indexOf("{open && ("));

  assert.match(menu, /role="menu"/);
  assert.match(menu, /CHOICES\.map/, "the menu does not offer the five");
  assert.match(menu, /<Icon\n/, "an option has no icon");
  assert.match(menu, /\{label\}/, "an option has no words");

  // And no way back to nothing said: a press is a statement, and unsaying one is
  // an operation this page deliberately does not have.
  assert.equal(menu.includes("NOTHING_SAID"), false, "the menu offers nothing-said");
  assert.equal(/set\(null\)|state: null/.test(menu), false, "the menu can write null");
});

test("it is a menu button, with a menu button's semantics", () => {
  // Radio-group semantics were right when the five were all on screen at once.
  // Now that they are behind a trigger, the honest description is a menu — and a
  // control that says radiogroup while behaving like a menu is worse than either.
  assert.equal(/role="radiogroup"/.test(marks), false, "the old radiogroup role is still here");

  assert.match(marks, /aria-haspopup="menu"/);
  assert.match(marks, /aria-expanded=\{open\}/);
  assert.match(marks, /aria-controls=\{open \? menuId : undefined\}/);
  assert.match(marks, /aria-label=\{`What you said about \$\{title\} \(\$\{year\}\): \$\{current\.label\}`\}/);

  // One answer out of a set is what menuitemradio is for, and `aria-checked` is
  // how a listener is told which one it currently is.
  assert.match(marks, /role="menuitemradio"/);
  assert.match(marks, /aria-checked=\{state === choice\}/);
});

test("the menu's keyboard is a menu's: arrows move, Enter chooses, Escape returns", () => {
  const from = marks.indexOf("function steer(");
  const steer = marks.slice(from, marks.indexOf("\n  }\n", from));

  for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Tab"]) {
    assert.ok(steer.includes(`"${key}"`), `${key} does nothing`);
  }
  assert.match(steer, /\.focus\(\)/, "the arrows do not move focus");
  assert.match(steer, /event\.preventDefault\(\)/, "the page scrolls under the arrows");

  // Moving is not choosing: every choice is a network write, so walking the list
  // must not fire four of them to reach the fifth.
  assert.equal(steer.includes("set("), false, "arrowing writes to the server");

  // Escape hands focus back to the trigger; Tab just closes.
  assert.match(steer, /close\(event\.key === "Escape"\)/);
  assert.match(marks, /function close\(toTrigger: boolean\) \{/);
  assert.match(marks, /if \(toTrigger\) trigger\.current\?\.focus\(\);/);

  // ArrowDown on the trigger opens it, which is the other half of the pattern.
  assert.match(marks, /if \(busy \|\| event\.key !== "ArrowDown"\) return;/);

  // The trigger is never natively disabled — that would take it out of the
  // keyboard's reach the moment a choice was taken, undoing the focus the closing
  // menu just handed back. `lib/web/pending.test.ts` holds the seam itself; this
  // is the component's side of it.
  assert.match(marks, /\{\.\.\.pending\(busy\)\}/, "the trigger does not use the pending seam");

  // Any spelling of the native attribute, not just the one that was there before:
  // `disabled`, `disabled={…}`, `disabled = {…}`. The lookbehind is what lets
  // `aria-disabled` — in the props and in the Tailwind variants — through.
  const opening = marks.slice(marks.indexOf("<button\n          ref={trigger}"), marks.indexOf("{open && ("));
  assert.doesNotMatch(
    opening,
    /(?<!aria-)\bdisabled\b/,
    "the trigger carries a native disabled attribute again",
  );

  // Which means the guard against a second write has to be in the handlers.
  assert.match(marks, /if \(busy\) return;\n {4}\/\//, "a second write is not guarded in code");
  assert.match(marks, /if \(busy\) return;\n {12}setOpen/, "a press mid-write still opens it");

  // And a press anywhere else dismisses it.
  assert.match(marks, /document\.addEventListener\("pointerdown", elsewhere\)/);
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
