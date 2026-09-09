import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
 *
 * Ten sources, because the page is that many files: the board itself, the
 * section all three of its parts are drawn by, the genre labels, the mix cards,
 * the dialog they and the summary all open, the type a name is set in, a film's
 * row — shared by the board and the summary's dialog — the summary tiles, the
 * mark on a row, and the delete a genre's and a mix's dialogs both carry. What can be tested for real is kept out of here and tested
 * that way: the arithmetic behind the tiles in `movie-summary.test.ts`, and where
 * focus goes when a row is removed in `refocus.test.ts`.
 *
 * ## What is browser-only, and stays that way
 *
 * Three things below are pinned as the wiring that produces a behaviour rather
 * than as the behaviour itself, because reproducing them needs a browser: that a
 * press on the surface around the card *reaches* the dialog element and not a box
 * in front of it; that a removed row actually drops focus, so the effect that
 * puts it back has something to do; and that a long title with three long mix
 * names lays out with the mark still on the right. Layout, hit-testing and focus
 * on element removal are the browser's, and no assertion over source can stand in
 * for them — what these tests can do is fail when the structure those behaviours
 * depend on is taken apart, which is how all three were broken in the first place.
 */

const VIEW = new URL("../../components/taste-view.tsx", import.meta.url);
const SECTION = new URL("../../components/section.tsx", import.meta.url);
const CHIP = new URL("../../components/chip.tsx", import.meta.url);
const LABELS = new URL("../../components/genre-labels.tsx", import.meta.url);
const DIALOG = new URL("../../components/chosen.tsx", import.meta.url);
const MIXES = new URL("../../components/mix-cards.tsx", import.meta.url);
const ROW = new URL("../../components/movie-row.tsx", import.meta.url);
const SUMMARY = new URL("../../components/movie-summary.tsx", import.meta.url);
const MARKS = new URL("../../components/movie-state.tsx", import.meta.url);
const MANAGE = new URL("../../components/manage.tsx", import.meta.url);

const source = readFileSync(VIEW, "utf8");
const section = readFileSync(SECTION, "utf8");
const chip = readFileSync(CHIP, "utf8");
const model = readFileSync(new URL("./movie-summary.ts", import.meta.url), "utf8");
const labels = readFileSync(LABELS, "utf8");
const dialog = readFileSync(DIALOG, "utf8");
const cards = readFileSync(MIXES, "utf8");
const row = readFileSync(ROW, "utf8");
const summary = readFileSync(SUMMARY, "utf8");
const marks = readFileSync(MARKS, "utf8");
const manage = readFileSync(MANAGE, "utf8");

test("the resting page shows names and counts, and no instruction", () => {
  // Neither kind of instruction is on the page at rest any more: a genre's is in
  // the dialog its label opens, a mix's is in the dialog its card opens. What is
  // left outside is what can be scanned.
  // Read as what is rendered rather than as the word: the page's own prose
  // explains that there is no instruction on it, and prose is not a defect.
  assert.equal(
    /\.instruction\}|instruction=/.test(source),
    false,
    "the page renders an instruction, or hands one to something that does",
  );

  // And each is rendered in exactly one place, inside the dialog that owns it.
  for (const [what, body, file] of [
    ["a genre", bodyOf("Meaning", labels), labels],
    ["a mix", bodyOf("Detail", cards), cards],
  ] as [string, string, string][]) {
    assert.match(body, /\{mix\.instruction\}|\{genre\.instruction\}/, `${what} has no meaning in its dialog`);
    assert.equal(
      (file.match(/\.instruction\}/g) ?? []).length,
      1,
      `${what}'s instruction is rendered in more than one place`,
    );
  }
});

test("films in no mix are one line under the mixes, not a section", () => {
  const stack = bodyOf("MixCards", cards);

  // A film gets there by ordinary means — saying "I've seen that" files nothing,
  // and deleting a mix leaves its films behind — so it is the mixes' own
  // remainder rather than a place of its own. It was a heading, a sentence and a
  // list of rows; it is a line that opens the same dialog every other way in
  // opens.
  // Which films, and in which order, is `inNoMix` — held in `mixes.test.ts`
  // against fixtures that fail on a dropped item, a reversal or a filed film.
  // What is left to pin here is that the component asks it and nothing else.
  const declaration = stack.slice(stack.indexOf("const other ="));
  assert.equal(
    declaration.slice(0, declaration.indexOf(";") + 1),
    "const other = inNoMix(movies);",
    "the remainder is worked out here rather than by the rule, or changed after it",
  );
  assert.match(stack, /\{other\.length > 0 && \(/, "the line is shown when there are none");
  assert.match(stack, /\{other\.length\} other movies/, "the line does not say how many there are");
  assert.match(stack, /setOpen\(OTHER\)/, "the line opens something else");
  assert.match(stack, /<Chosen title="Other movies" films=\{other\}/, "it opens a dialog of its own");

  // Nothing of the section survives: no heading, no sentence under it, no rows
  // on the page, and no ordering of its own.
  assert.equal(/Other movies</.test(source), false, "the page still has the heading");
  assert.equal(/<Loose|title="Other movies"/.test(source), false, "the section is still rendered");
  assert.equal(/<Films/.test(stack), false, "the films are drawn on the page again");


  // Set like the summary's own ways in, quiet and after the cards.
  assert.match(stack, /\$\{WAY_IN\} hover:text-ink-soft/, "the line is set apart from the others");
  assert.match(stack, /mt-3 text-\[12\.5px\] leading-relaxed text-ink-faint/);
  assert.ok(
    stack.indexOf("inOrder(mixes, movies)") < stack.indexOf("other.length > 0"),
    "the line is set above the cards",
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
  const films = bodyOf("Films", row);

  assert.ok(films.includes("<ul"), "the films are not a list");
  assert.equal(/<table|<t[dhr]\b|role="(table|row|cell)"/.test(films), false, "it is a table");
  assert.equal(/divide-|border-[tb]\b|border-y\b/.test(films), false, "it has row separators");
  assert.equal(/<img|Image|poster|backdrop/i.test(films), false, "it carries an image");

  // The year is part of the film's name here, so it is set in the title's own
  // type: no size, colour or numeric treatment of its own.
  assert.match(films, /\{movie\.title\} \(\{movie\.year\}\)/, "the year is styled apart");
});

test("the IMDb link says IMDb, and is absent when there is no id", () => {
  const films = bodyOf("Films", row);
  assert.match(films, /movie\.imdbId !== null/, "the link is not conditional on there being an id");

  const link = bodyOf("Imdb", row);
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
    ["seen", "Eye"],
    ["not_seen", "EyeOff"],
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

  // In one order, and it is the order the summary reads them in: the two facts
  // first — not seen before seen, the direction a film moves through them — and
  // then the three ways of having an opinion. A reader meeting both should not
  // have to learn two orders.
  assert.deepEqual(
    [...marks.matchAll(/\{ state: "([a-z_]+)"/g)].map((match) => match[1]),
    ["not_seen", "seen", "liked", "loved", "disliked"],
    "the menu no longer offers the five in the order the summary reads them",
  );

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

  // Escape closes the menu and stops there. The default action of the key is the
  // browser's close request, and a row can be inside a dialog — so one press
  // that dismissed the menu *and* the dialog around it would be two things for
  // one keystroke. Pinned as the pair it has to be: the key, then its default
  // taken, before anything closes. An `preventDefault()` somewhere else in the
  // handler — the arrows have one — is not this.
  const escape = steer.slice(steer.indexOf('=== "Escape"'), steer.indexOf('=== "Tab"'));
  assert.match(escape, /event\.preventDefault\(\)/, "Escape reaches the dialog around the menu");
  assert.match(escape, /close\(true\)/, "Escape does not hand focus back to the trigger");

  // Tab closes the menu and is deliberately not prevented: moving on is what it
  // is for, and focus stays where the browser is taking it.
  const tab = steer.slice(steer.indexOf('=== "Tab"'), steer.indexOf("const keys"));
  assert.match(tab, /close\(false\)/, "Tab pulls focus back instead of moving on");
  assert.doesNotMatch(tab, /preventDefault/, "Tab no longer moves focus on");
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

test("the counts sit above every film they count", () => {
  const view = bodyOf("TasteView");

  // Given the whole collection, not a mix's films: three of the four tiles count
  // a state, and a state is spread across every mix on the page.
  assert.match(view, /<MovieSummary\s+movies=\{taste\.movies\}/, "the page has no counts on it");

  const at = view.indexOf("<MovieSummary");
  assert.ok(at < view.indexOf('title="Your genres"'), "the counts are below the genres");
  assert.ok(at < view.indexOf('title="Your mixes"'), "the counts are below the mixes");
});

test("the counts are one line of plain text, in one type", () => {
  const films = bodyOf("MovieSummary", summary);

  // The six, in the order they are read, laid end to end. Composed from the
  // model's own lists so the order is the model's and not a second opinion about
  // it, with `without status` left out when there is none.
  assert.match(films, /const row = \[\s*\.\.\.FACTS,\s*\.\.\.OPINIONS,/);
  assert.match(films, /quiet\.length > 0 \? \[WITHOUT_STATUS\] : \[\]/);
  assert.match(films, /row\.map\(\(selection, index\)/, "the row is not rendered as one list");

  // One `Count` draws all six, so the five answers cannot drift apart from one
  // another: they are given the row's own type and nothing of their own.
  const line = films.slice(films.indexOf("row.map"), films.indexOf("recent.length > 0"));
  assert.equal((line.match(/<Count\b/g) ?? []).length, 1, "an item is drawn differently");
  assert.match(line, /"hover:text-ink"/, "the five answers carry a type of their own");

  // The remainder steps down from that type — smaller and quieter, because it is
  // what is left over rather than something somebody said — and it is the only
  // exception, taken from a list rather than named at the item.
  assert.match(line, /remainders\.includes\(selection\)/, "the exception is not one list");
  assert.match(
    line,
    /"text-\[12\.5px\] text-ink-faint hover:text-ink-soft"/,
    "the remainder is not set quieter than the five",
  );
  assert.match(films, /const remainders = \[WITHOUT_STATUS\];/);
  assert.equal(
    /font-|tracking-|opacity-|leading-(snug|tight)/.test(line),
    false,
    "an item is set apart by its weight, tracking, opacity or leading",
  );

  // The type is on the row, once.
  const row = films.match(/className="flex flex-wrap items-baseline[^"]*"/);
  assert.ok(row, "the row is not a wrapping line");
  // The type the two facts were set in before the row was flattened, now the
  // type of every item in it.
  assert.match(row[0], /text-\[15px\]/, "the row is not set in the type the facts had");
  assert.match(row[0], /leading-relaxed/, "the row's lines are set tighter than the facts were");
  assert.match(row[0], /\btext-ink\b/, "the row is not set in the colour the facts had");

  // Nothing left of the hierarchy that used to be drawn around them, and nothing
  // that made a tile a tile.
  assert.equal(/grid-cols-|border-l|\bpl-[34]\b/.test(films), false, "the hierarchy is back");
  const inside = films.slice(films.indexOf('ref={lines}'), films.indexOf("</Section>"));
  assert.equal(
    /bg-screen|rounded-xl|rounded-2xl|border border-rule|font-display/.test(inside),
    false,
    "a count has been given a tile's surface again",
  );

  // Wrapping rather than overflowing, and a separator is written before the
  // control it precedes and inside the same box — so a line cannot break after
  // a dot and leave it hanging.
  assert.match(films, /flex-wrap/, "the line cannot wrap");
  assert.equal(/overflow-x|whitespace-nowrap|min-w-\[/.test(films), false, "a line can overflow");
  assert.match(
    line,
    /<span key=\{selection\.key\} className="flex items-baseline[^"]*">\s*\{index > 0 && <Separator \/>\}/,
    "a separator can be left dangling at the end of a line",
  );
});

test("a count is a control, with the words first and the number after", () => {
  const count = bodyOf("Count", summary);

  assert.match(count, /<button/, "a count is not something you can press");
  assert.match(count, /aria-haspopup="dialog"/, "a count does not say it opens a dialog");

  // The words then the number, which is how it is set and how it is said — so
  // the control's own text is its accessible name, and only the two whose words
  // are not sufficient get a label of their own.
  assert.match(count, /\{selection\.label\} <span className="tabular-nums">\{count\}<\/span>/);
  assert.match(count, /aria-label=\{spoken\(selection, count\)\}/);
  // The number is part of the name, not decoration, and there is no glyph left
  // in here to hide from a listener — the arrow on `recently added` is passed in
  // from outside, already hidden.
  assert.equal(
    (count.match(/aria-hidden="true"/g) ?? []).length,
    0,
    "something in the control is hidden from a listener",
  );

  // Hover and focus that read as navigation: an underline and a real focus ring,
  // and nothing that turns it back into a pill. The line is there in both states
  // and only its colour moves — see the test below for why switching the line
  // itself made these flicker.
  assert.match(count, /WAY_IN/, "a count is not set like the other ways in");
  // The focus ring is part of the shared rule, and it is checked against that
  // rule rather than against this file — see the test below.
  assert.match(count, /WAY_IN/, "a count does not take its focus ring from the shared rule");
  assert.equal(/rounded-full|px-3 py-1|bg-/.test(count), false, "a count is a pill again");
});

test("no heart, and no icon at all, in the summary", () => {
  // The heart belonged to the hierarchy it sat in: a mark on one of five rungs.
  // In two lines of text it was one glyph pretending to be a heading, so it is
  // gone, and the summary draws no icon of its own.
  assert.equal(/lucide-react/.test(summary), false, "the summary still imports an icon");
  assert.equal(/<Heart|icon=|typeof Heart/.test(summary), false, "a count still draws an icon");
});

test("the total is beside the heading, and is not a tile", () => {
  const films = bodyOf("MovieSummary", summary);

  // The same heading treatment the genres and the mixes get, with every film
  // counted — the ones nobody has said anything about included.
  assert.match(
    films,
    /<Section[\s\S]{0,200}?title="Your movies"[\s\S]{0,200}?count=\{movies\.length\}/,
    "the films section does not carry the total beside its heading",
  );

  // And not a second time as a tile. A number for "all of them" in the row
  // invited reading the row as a breakdown of its first entry.
  assert.equal(/"Total"/.test(summary + model), false, "Total is still a tile");
});

test("the films with no state are in the row, and absent when there are none", () => {
  const films = bodyOf("MovieSummary", summary);

  // In the row with the rest, in the same type, and last — and out of it
  // entirely when there is none: nothing to say, and a zero there would read as
  // a state that happens to be empty.
  assert.match(films, /quiet\.length > 0 \? \[WITHOUT_STATUS\] : \[\]/, "the count is always shown");
  assert.match(films, /const quiet = selected\(WITHOUT_STATUS, movies\);/);

  const line = films.slice(films.indexOf("row.map"), films.indexOf("recent.length > 0"));
  assert.match(
    line,
    /phrased=\{remainders\.includes\(selection\)\}/,
    "the two remainders are not written as sentences",
  );

  // Quieter than the five, and still in their row: the step down is a size and a
  // colour, not a line of its own, an indent or a container.
  assert.match(line, /text-\[12\.5px\] text-ink-faint/, "the remainders are not set quieter");
  assert.equal(
    /border|\bpl-\d|<div/.test(line),
    false,
    "the remainders have been given a hierarchy of their own again",
  );
});

test("one dialog serves every one of the seven ways in", () => {
  const films = bodyOf("MovieSummary", summary);

  // The same `Chosen`, whichever count was pressed — and now also for this
  // week's arrivals, which is not a state at all. A second dialog for the odd
  // one out would be two of everything a dialog does.
  assert.equal(
    (dialog.match(/element\.showModal\(\)/g) ?? []).length,
    1,
    "there is more than one films dialog",
  );
  assert.equal((films.match(/<Chosen/g) ?? []).length, 1, "the counts open different dialogs");
  assert.match(films, /title=\{open\.label\}/, "the dialog is not named for what was pressed");

  // Six of the seven are a set of states; the seventh is the week, and it is
  // answered by `recentlyAdded` rather than by `selected`.
  assert.match(
    films,
    /films=\{open === RECENT \? recent : selected\(open, movies\)\}/,
    "the dialog is not given the films the pressed control stands for",
  );
  assert.match(summary, /const RECENT: Selection = \{/, "this week is not shaped like the others");
  assert.match(summary, /states: \[\]/, "this week claims to be a state");
});

test("the summary is an overview of a collection, not a report about it", () => {
  // Four numbers. No share of anything, no direction of travel, nothing to
  // animate and no fifth metric — a tile reading "+3 this week" would be a claim
  // about the user's habits, and this is a page for finding a film.
  assert.equal(
    // Word-bounded, so that an `HTMLParagraphElement` is not read as a graph.
    /%|\bpercent|\bchart|\bgraph\b|\btrend|\bsparkline|\baverage|Math\.round|animate-/i.test(
      summary,
    ),
    false,
    "the summary grew a measurement of its own",
  );

  // The counts are not about when anything was saved. `Recently added` is —
  // that is the whole of what it says — so the line is drawn around the
  // arithmetic rather than around the module: what a film was said to be, and
  // when it arrived, stay two separate questions.
  // Read as the property being taken rather than as the word, because the
  // module's own prose explains which timestamp it uses and why — and prose is
  // not a defect.
  const takes = /\.(createdAt|updatedAt)\b/;
  assert.equal(takes.test(bodyOf("selected", model)), false, "a count reads a timestamp");
  for (const [name, file] of [
    ["the summary", summary],
    ["a film's row", row],
  ] as [string, string][]) {
    assert.equal(takes.test(file), false, `${name} reads a timestamp`);
  }

  // And `updatedAt` is taken nowhere. It moves when a mark is pressed, so a
  // "recently added" built on it would answer "recently touched" and reorder
  // itself under somebody's hand as they used it.
  assert.equal(/\.updatedAt\b/.test(model), false, "the section reads the wrong timestamp");
});

test("the counts are absent when there is nothing to count", () => {
  // Four zeros over an empty taste model read as a broken instrument. Same
  // reasoning as the "Other movies" section, which is also absent when empty —
  // and the arithmetic still holds, see `movie-summary.test.ts`.
  assert.match(bodyOf("MovieSummary", summary), /if \(!movies\.length\) return null;/);
});

test("a count opens the dialog the browser has, not one written here", () => {
  const chosen = bodyOf("Chosen", dialog);

  assert.match(chosen, /<dialog/, "the films open in something other than a dialog");
  assert.match(dialog, /element\.showModal\(\);/, "it is not opened as a modal");

  // Escape through the element's own `cancel`, and the backdrop is the element
  // rather than a scrim of our own. `TasteEditor` does both the same way.
  assert.match(chosen, /onCancel=\{\(event\) => \{/);
  assert.match(chosen, /event\.target === dialog\.current/);
  assert.match(chosen, /backdrop:bg-scrim/);

  // Which means none of what `showModal` brings is re-implemented next to it: no
  // role to declare, no trap to keep, no note of what to focus on the way out.
  // Reading `document.activeElement` is not on this list — putting focus back
  // after a row has been removed under the reader is the one thing the element
  // does not do, and it is pinned as its own test below.
  assert.equal(
    /role="dialog"|aria-modal=|inert=|tabIndex=/.test(summary + dialog),
    false,
    "the dialog has grown a hand-written half",
  );
});

test("the dialog shows the page's own rows, and says where each film is filed", () => {
  const chosen = bodyOf("Chosen", dialog);

  assert.match(chosen, /<Films movies=\{films\} filed/, "the dialog does not reuse the film list");
  assert.equal(
    /<MovieState|<li|imdb\.com/i.test(summary),
    false,
    "the dialog draws a film row of its own",
  );

  // The same heading treatment as a panel on the page, so what opens reads as
  // the page in front of itself rather than as a second design.
  assert.match(chosen, /<h2 className="font-display/);

  // Inside a mix the heading above the list already says where the films are, so
  // only the dialog asks for it.
  assert.equal(/<Films[^>]*filed/.test(source), false, "a mix repeats its own name on every row");
});

test("a row reads title, year, IMDb, then where it is filed, then the mark", () => {
  const films = bodyOf("Films", row);

  const title = films.indexOf("{movie.title} ({movie.year})");
  const imdb = films.indexOf("<Imdb id=");
  const filed = films.indexOf("<Filed movie=");
  const mark = films.indexOf("<MovieState ");

  assert.ok(title < imdb, "the IMDb link is not after the year");
  assert.ok(imdb < filed, "the mixes come before the link out");
  assert.ok(filed < mark, "the mark is not the last thing on the row");
  assert.match(films, /\{filed && <Filed movie=\{movie\} \/>\}/, "the mixes are always shown");

  // Every mix, as plain secondary text. A chip is how a mix appears when it is
  // the subject; three of them on a film's row would out-shout the film's name.
  const where = bodyOf("Filed", row);
  assert.match(where, /filedUnder\(movie\)/, "the row decides for itself what to say");
  assert.match(where, /text-ink-faint/, "where a film is filed is not secondary");
  assert.equal(/<Chip|uppercase|slice\(0|\+ *\d/.test(where), false, "the mixes are abbreviated");
});

test("it is the same mark on a row in both places, with the same behaviour", () => {
  // Not a second control that happens to look like it: the row is one component,
  // rendered by the page and by the dialog, handing `MovieState` the same three
  // things either way round. Everything the mark itself is held to — the menu,
  // its keyboard, the one route boundary it writes through — is pinned above and
  // applies to a row in the dialog because it is the same row.
  assert.match(
    bodyOf("Films", row),
    /<MovieState title=\{movie\.title\} year=\{movie\.year\} state=\{movie\.state\} \/>/,
  );

  // The row file is on both sides of the client boundary — the server page
  // renders it, the dialog ships it — so it must not claim one of them.
  assert.doesNotMatch(row, /^"use client";/, "the row can no longer render on the server");
  assert.match(summary, /^"use client";/, "the tiles cannot open anything");
});

test("neither a count nor an open list is a copy of the films", () => {
  // The only state is which tile is open. A mark pressed inside the dialog
  // writes through `MovieState`, which asks for the page to be re-rendered; the
  // server's answer arrives as a new `movies`, and every count and the open list
  // are computed from it again. So a film that no longer belongs to the open tile
  // leaves the list, and the tile above it is already showing one fewer.
  assert.match(summary, /useState<Selection \| null>\(null\)/);
  assert.equal(
    /useState[<(][^)]*Movie|useEffect\([^)]*movies/.test(summary),
    false,
    "the summary holds its own copy of the films",
  );

  assert.match(summary, /count=\{selected\(selection, movies\)\.length\}/);
  // The list the dialog shows is worked out by the summary on every render and
  // handed over, rather than derived inside a component that is unmounted and
  // remounted around it — and never stored, which is what keeps a mark pressed
  // inside the dialog from leaving a stale list behind.
  assert.match(bodyOf("MovieSummary", summary), /selected\(open, movies\)/);
  assert.equal(
    /useState[<(][^)]*Movie|useRef[<(][^)]*Movie\b/.test(summary),
    false,
    "the summary holds a copy of the films",
  );
});

test("a press outside the card closes the dialog, and so do Escape and Close", () => {
  const chosen = bodyOf("Chosen", dialog);

  // The press has to be able to land on the element: it is the surface the card
  // sits on, and the card is its only child. A box of the dialog's own filling
  // the viewport would be the target of every press outside the card instead,
  // and Escape would quietly become the only way out.
  assert.match(chosen, /if \(event\.target === dialog\.current\) onClose\(\);/);
  assert.match(
    chosen,
    /<dialog[\s\S]*?className="m-0 h-dvh[^"]*w-dvw[^"]*overflow-y-auto[^"]*px-5 py-\[8vh\]/,
    "the dialog is not the surface the card sits on",
  );

  const inside = chosen.slice(chosen.indexOf("backdrop:bg-scrim"));
  assert.equal(
    /min-h-dvh|h-dvh|w-dvw|w-screen|inset-0/.test(inside),
    false,
    "something inside the dialog covers it, so a press outside the card cannot reach it",
  );

  // The other two ways out are untouched by that.
  assert.match(chosen, /onCancel=\{\(event\) => \{/, "Escape no longer closes it");
  assert.match(chosen, /ref=\{exit\}[\s\S]*?>\s*Close\s*</, "there is no Close button");
});

test("closing the dialog puts focus back on the control that opened it", () => {
  const films = bodyOf("MovieSummary", summary);

  // What was pressed is kept from the press — `event.currentTarget` — and not
  // read back off the document: a pointer press does not make a button the
  // active element in every browser, so `document.activeElement` would answer a
  // question about the browser rather than about what somebody pressed.
  assert.match(films, /invoker\.current = event\.currentTarget;/, "the press is not remembered");
  // Every way in remembers its own press. Counted as handlers rather than as
  // controls, because the row is rendered from a list: what has to hold is that
  // no `Count` is given an `onOpen` that forgets.
  const handlers = (films.match(/onOpen=\{\(event\) => \{/g) ?? []).length;
  assert.equal(
    (films.match(/invoker\.current = event\.currentTarget;/g) ?? []).length,
    handlers,
    "one of the controls does not remember what was pressed",
  );
  assert.equal((films.match(/<Count\b/g) ?? []).length, handlers, "a count opens nothing");

  // The fallback is a control that is always there. `Not seen` is the first
  // button inside the summary's lines and is rendered at nought, so focus has
  // somewhere intentional to land when the invoker has gone.
  assert.match(films, /lines\.current\?\.querySelector<HTMLButtonElement>\("button"\)/);

  // And restoring it is this component's, not the dialog's: React unmounts a
  // dialog in the same commit that closes it, so the only thing that can be sure
  // of putting focus anywhere is the thing still mounted afterwards.
  assert.match(films, /returnTo\(invoker\.current, document\.contains\(invoker\.current\)/);
  const chosen = bodyOf("Chosen", dialog);
  const from = chosen.indexOf("const element = dialog.current;");
  const opening = chosen.slice(from, chosen.indexOf("useEffect", from));
  assert.match(opening, /showModal\(\)/, "the effect sliced is not the one that opens it");
  assert.doesNotMatch(opening, /\.focus\(\)/, "the dialog restores focus on its way out again");

  // The two orderings of the race are decided in `refocus.ts` and tested there.
  // What is pinned here is that both are asked: the invoker at the moment of
  // closing, and — for the one that arrives after it — whatever focus was handed
  // to, once it has left the document with nothing else taking focus.
  assert.match(films, /rescueTo\(/, "the later half of the race is not handled");
  assert.match(films, /document\.activeElement === document\.body/);
  assert.match(films, /handedTo\.current = back;/, "what focus went to is not remembered");
});

test("focus stays in the dialog when the film it was on leaves the list", () => {
  const chosen = bodyOf("Chosen", dialog);

  // The rule is `lib/web/refocus.ts` and is tested there against every shape of
  // list. This is the wiring: the marks that are left, the position that was
  // remembered, and the way out when there is nothing else.
  assert.match(chosen, /refocus\(marks, marked\.current, exit\.current\)\?\.focus\(\)/);
  assert.match(chosen, /element\.querySelectorAll<HTMLButtonElement>\(MARK\)/);
  assert.match(dialog, /const MARK = '\[aria-haspopup="menu"\]';/);

  // It does nothing while focus is still on something in the dialog, which is
  // every render but the one that removed the row it was on. Focus on the dialog
  // itself counts as lost.
  assert.match(
    chosen,
    /if \(active !== element && active instanceof Node && element\.contains\(active\)\) return;/,
  );

  // And the dialog stays open through it: recovering focus is not a dismissal.
  const from = chosen.indexOf("const active = document.activeElement");
  const recovery = chosen.slice(from, chosen.indexOf("\n  return (", from));
  assert.equal(/onClose|\.close\(\)/.test(recovery), false, "losing focus closes the dialog");

  // What is remembered is a position among the marks. Remembering the film
  // instead would be the copy of the collection this component does not keep —
  // and it would be a copy of exactly the row that has just stopped existing.
  assert.match(chosen, /const marked = useRef\(-1\);/);
  assert.match(chosen, /if \(at >= 0\) marked\.current = at;/);
  assert.equal(
    /useRef[<(][^)]*Movie/.test(summary),
    false,
    "the dialog holds films of its own to manage focus with",
  );
});

test("the mark stays on the right of a row, however the words wrap", () => {
  const films = bodyOf("Films", row);

  // The words are one box that gives way: it grows into the room the mark does
  // not want, and a long title with three long mix names wraps inside it. The
  // mark is that box's sibling rather than its last item, which is what keeps it
  // on the right of the row's first line instead of being pushed under it.
  assert.match(films, /className="flex min-w-0 flex-1 flex-wrap items-baseline/);
  assert.ok(
    films.includes("</span>\n          <MovieState"),
    "the mark is inside the box that wraps, so a long row pushes it off the line",
  );

  // Which is also why the row is no longer three items spread apart: with two,
  // one of them growing, there is nothing left to spread.
  assert.equal(/justify-between/.test(films), false, "the row spreads its items again");
});

test("films, genres and mixes are three peers, drawn by one section", () => {
  const view = bodyOf("TasteView");

  // The three parts of a taste model, each a section of the page and none of
  // them inside another. One component draws all three, which is what keeps
  // their headings from drifting apart.
  assert.match(
    bodyOf("MovieSummary", summary),
    /<Section[\s\S]{0,200}?title="Your movies"[\s\S]{0,200}?count=/,
  );
  assert.match(view, /<Section\n\s+title="Your genres"/);
  assert.match(view, /<Section\n\s+title="Your mixes"/);

  // And the heading itself is written once, in that component. A second <h2> on
  // the page would be a section drawing its own.
  assert.match(section, /<h2[\s\S]{0,400}?font-display text-\[26px\] leading-none/);
  assert.match(section, /\{title\}\s*<\/h2>/, "the heading does not render the section's title");
  assert.equal(/<h2/.test(source), false, "the page draws a section heading of its own");
});

test("a section carries no surface, and is not handed one", () => {
  // The change this test exists for: genres and mixes used to sit inside a
  // rounded, filled box while the films floated above them, which read as two
  // containers and a caption rather than as three of a kind. What has an edge on
  // this page is a row or a card — never a section.
  const drawn = bodyOf("Section", section);
  assert.equal(
    // Word-bounded, so that a `gap-3` is not read as padding.
    /rounded|\bborder|bg-|shadow|\bp-\d|\bpx-\d|\bpy-\d/.test(drawn),
    false,
    "the section draws a box around itself again",
  );

  // Nor through the class name it is given: that is the page's rhythm — where a
  // section sits — and nothing else.
  assert.equal(
    /<Section[^>]*className="[^"]*(bg-|\bborder|rounded|\bp-\d|\bpx-\d|\bpy-\d)/.test(source + summary),
    false,
    "a section is handed a surface through its class name",
  );
});

test("each section keeps its own copy, and the films section stays quiet", () => {
  const view = bodyOf("TasteView");

  // The descriptive lines under the two headings are the ones that were there.
  assert.match(view, /note="The pieces your taste is made of\./);
  assert.match(view, /note="Your genres, mixed into something of your own\."/);

  // The films section carries the total beside its heading and a line under it
  // saying what these films are, exactly as the other two do — three sections of
  // one page, described the same way.
  const movies = bodyOf("MovieSummary", summary);
  const opening = movies.slice(movies.indexOf("<Section"), movies.indexOf(">", movies.indexOf("<Section")) + 1);
  assert.match(opening, /title="Your movies"/, "the films section lost its heading");
  assert.match(opening, /count=\{movies\.length\}/, "the total is no longer beside the heading");
  assert.match(
    opening,
    /note="Films you've saved, seen, or want to watch\."/,
    "the films section has no line saying what these films are",
  );
});

test("a genre is a compact label, and a mix is a compact card", () => {
  // A genre is its name and nothing else, so it is the size of its name and sits
  // next to the others. A mix is a composition, so it keeps a card — with the
  // accent edge that says the user made it — and the card is now a name and two
  // numbers rather than the whole mix.
  assert.match(
    bodyOf("TasteView"),
    /<GenreLabels genres=\{taste\.genres\} mixes=\{taste\.mixes\} movies=\{taste\.movies\}/,
    "genres are not labels, or are not given what they need to reach their films",
  );
  assert.match(
    bodyOf("TasteView"),
    /<MixCards mixes=\{taste\.mixes\} movies=\{taste\.movies\}/,
    "the page does not hand the mixes their films",
  );

  const row = bodyOf("GenreLabels", labels);
  assert.match(row, /flex flex-wrap/, "the labels are not laid out to wrap");
  assert.match(row, /<button/, "a label is not a control");
  assert.match(row, /aria-haspopup="dialog"/, "a label does not say what it opens");
  assert.equal(
    /<Chevron|<details|<summary|open:|(?<!max-)\bw-full/.test(row),
    false,
    "a label can still expand in place, so opening one moves the others",
  );
  assert.match(row, /max-w-full/, "a long name can push the page sideways");
  assert.match(row, /break-words/, "a name with no spaces in it has nowhere to break");
  assert.match(row, /text-left/, "a name that wrapped onto two lines is centred");

  const stack = bodyOf("MixCards", cards);
  assert.match(stack, /border-beam-dim/, "a mix has lost the edge that says it is the user's");
  assert.match(stack, /rounded-xl border/, "a mix has stopped being a card");
});

test("a closed mix card is a name and a loved count, and nothing else", () => {
  const stack = bodyOf("MixCards", cards);

  // The name, and — only when there are any — how many of its films are loved.
  assert.match(stack, /\{mix\.name\}/, "the card does not show what the mix is called");
  assert.match(stack, /\{loved > 0 && \(/, "a mix with nothing loved still shows a heart");
  assert.match(stack, /<Heart /, "the loved signal is not the mark's own heart");
  assert.match(stack, /\{loved\}/, "the heart is not given a number");

  // One heart with a number beside it, never one per film: a row of hearts is a
  // rating, and this is a count.
  assert.equal((stack.match(/<Heart /g) ?? []).length, 1, "the hearts are being repeated");
  assert.equal(/\.map\([^)]*Heart|Array\.from/.test(stack), false, "a heart is drawn per film");

  // How many films are in it is not on the card. It is a measurement rather than
  // a recognition, and beside the loved count it read as half of a score. Read
  // as what is rendered, since the spoken label is still given the number.
  assert.equal(
    /\{films\.length\}/.test(stack),
    false,
    "the card shows how many films are in the mix again",
  );
  assert.match(
    stack,
    /aria-label=\{spokenMix\(mix\.name, films\.length, loved\)\}/,
    "a listener is no longer given the count the card leaves out",
  );

  // And none of the mix is on the closed card: no instruction, no genre chip, no
  // film row, no mark. All of it is in the dialog.
  assert.equal(
    /instruction|<Chip|<Films|MovieState/.test(stack),
    false,
    "the closed card still carries the mix's details",
  );
});

test("a card previews three of its films, quietly, under the name", () => {
  const stack = bodyOf("MixCards", cards);

  // Titles and nothing else, and which three is a rule the card does not carry:
  // `lib/web/mixes.ts` decides, and its own tests hold the ordering.
  assert.match(stack, /const glance = preview\(films\);/, "the card chooses its own preview");
  assert.match(stack, /\{glance !== null && \(/, "an empty mix still gets a line");

  // Under the name rather than beside it, and on a line of its own: `w-full` is
  // what puts it there without disturbing the name or the loved signal above.
  const line = stack.match(/className="([^"]*text-\[12\.5px\][^"]*)"[\s\S]{0,80}\{glance\}/);
  assert.ok(line, "the preview is not the quiet aside it should be");
  assert.match(line[1], /\bw-full\b/, "the preview shares a line with the name");
  assert.match(line[1], /text-ink-faint/, "the preview is not quieter than the name");
  assert.match(line[1], /text-left/, "the preview is centred");

  // A film's title can be long and need not contain a space.
  assert.match(line[1], /min-w-0/, "a long title can widen the card");
  assert.match(line[1], /break-words/, "a long title has nowhere to break");

  // Written after both numbers, which is what keeps them on one line together:
  // a `w-full` item takes the line it is placed on, so putting the preview first
  // pushed the heart down to a line of its own. Reading order is unaffected —
  // the preview has a line to itself either way.
  const name = stack.search(/>\s*\{mix\.name\}\s*</);
  assert.ok(name < stack.indexOf("{glance}"), "the preview is above the name");
  assert.ok(
    stack.indexOf("{loved}") < stack.indexOf("{glance}"),
    "the preview is written before the heart, which costs the heart its line",
  );
});

test("a mix card opens its own dialog, in the order the mix was built", () => {
  const stack = bodyOf("MixCards", cards);
  assert.match(stack, /aria-haspopup="dialog"/, "the card does not say what it opens");
  assert.match(stack, /setOpen\(mix\)/, "pressing a card opens something else");
  assert.match(stack, /<Detail\b/, "the card opens no dialog");
  assert.match(stack, /mix=\{open\}/, "the dialog is not given the mix that was pressed");

  const detail = bodyOf("Detail", cards);
  assert.match(detail, /<dialog/, "the mix opens in something other than a dialog");
  assert.match(cards, /element\.showModal\(\);/, "it is not opened as a modal");

  // Name, then what it means, then what it is made of, then what is in it —
  // which is the order the mix was built in. Keyed on the heading that shows the
  // name rather than on the name itself: `aria-label={mix.name}` is on the
  // element above and would answer for a title that had been moved or removed.
  const title = detail.search(/<h2[^>]*>\{mix\.name\}<\/h2>/);
  assert.notEqual(title, -1, "the dialog has no heading showing the mix's name");

  const order = [title, ...["{mix.instruction}", "<Chip", "<Films"].map((mark) => detail.indexOf(mark))];
  assert.equal(order.some((at) => at === -1), false, "the dialog is missing one of the four");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "the four are out of order");

  // The films are the page's own rows, with their own marks, and the genres are
  // chips rather than another set of controls: inside a dialog they are context.
  assert.match(detail, /<Films movies=\{films\}/, "the dialog draws film rows of its own");
  assert.equal(/<GenreLabels|aria-haspopup="dialog"/.test(detail), false, "a genre here opens a dialog");
});

test("a mix dialog is dismissed like the others, and hands focus back to the card", () => {
  const detail = bodyOf("Detail", cards);

  assert.match(detail, /onCancel=\{\(event\) => \{/, "Escape does not close it");
  assert.match(detail, /event\.target === dialog\.current/, "a press outside the card does nothing");
  assert.match(detail, />\s*Close\s*</, "there is no Close control");
  assert.match(detail, /backdrop:bg-scrim/);
  assert.equal(
    /role="dialog"|aria-modal=|inert=|tabIndex=/.test(cards),
    false,
    "the dialog has grown a hand-written half",
  );

  // Escape inside here can arrive with a mark's menu open, and that menu takes
  // it first — `movie-state.tsx` prevents the key's default so one press closes
  // one thing. That contract is held in the mark's own test; what matters here is
  // that this dialog uses the element's own `cancel` rather than a key handler
  // of its own, which is what leaves room for it.
  assert.equal(/onKeyDown|"Escape"/.test(cards), false, "the dialog handles keys itself");

  const stack = bodyOf("MixCards", cards);
  assert.match(stack, /invoker\.current = event\.currentTarget;/, "the card pressed is not kept");
  assert.match(stack, /returnTo\([\s\S]{0,60}?document\.contains\(/);
  assert.match(
    stack,
    /stack\.current\?\.querySelectorAll<HTMLElement>\("button"\)/,
    "there is nowhere to put focus when the card pressed has gone",
  );

  // And what that choice answers is what is focused — deciding correctly and
  // then not asking for focus would look the same in every other assertion here.
  const chosen = stack.slice(stack.indexOf("const back = returnTo("));
  assert.match(
    chosen.slice(0, chosen.indexOf("\n  });")),
    /back\?\.focus\(\);/,
    "the element the rule chose is never asked to take focus",
  );
  assert.doesNotMatch(detail, /\.focus\(\)/, "the dialog restores focus on its way out again");
});

test("a long name stays inside the card, and inside the dialog", () => {
  const stack = bodyOf("MixCards", cards);

  // A name is valid up to two hundred characters and need not contain a space.
  // `min-w-0` is what makes the breaking mean anything: a flex item is as wide
  // as its longest unbreakable word until it is allowed to be narrower, which
  // is how a 63-character name came to be 507px wide in a 350px card.
  //
  // It is needed on the flex item the name is, which is the name's own element
  // now that no count sits beside it — and it is checked against that element's
  // own class list, because read over the whole file some other list would
  // answer for it.
  //
  // That is the last plain class list before the name is rendered: the card
  // itself builds its own from an array, so it is not one of them. Anchored on
  // the name as an element's content rather than as text: `key=` and the spoken
  // label both mention it, and both come first.
  const rendered = stack.search(/>\s*\{mix\.name\}\s*</);
  assert.notEqual(rendered, -1, "the card no longer renders the mix's name");
  const upToTheName = stack.slice(0, rendered);
  const lists = [...upToTheName.matchAll(/className="([^"]*)"/g)].map((match) => match[1]);
  assert.ok(lists.length >= 1, "the name is no longer rendered with a class list of its own");

  const name = lists[lists.length - 1];
  assert.match(name, /font-display/, "the name is not the display type on the card");
  assert.match(name, /min-w-0/, "a long name can widen the card");
  assert.match(name, /break-words/, "a long name has nowhere to break");
  assert.equal(
    /truncate|text-ellipsis|line-clamp/.test(stack),
    false,
    "a name is being cut off to keep it on one line",
  );

  // The loved signal stays on the right even when the name pushes it onto a line
  // of its own, which `justify-between` alone does not do for a single item.
  const signal = stack.match(/className="([^"]*shrink-0[^"]*tabular-nums[^"]*)"/);
  assert.ok(signal, "the loved signal is not the compact one it was");
  assert.match(signal[1], /ml-auto/, "the loved signal falls to the left when it wraps");

  // And a genre's name in the dialog is a chip, which carries the same
  // protection on the rule itself: every chip holds something somebody typed.
  // Read off the class list the chip actually renders with, because the file
  // explains `min-w-0` in prose and prose is not a safeguard.
  const chipClasses = bodyOf("Chip", chip).match(/className=\{`([^`]*)`\}/);
  assert.ok(chipClasses, "a chip no longer renders a class list of its own");
  for (const [rule, why] of [
    ["min-w-0", "a long genre name can widen the dialog"],
    ["max-w-full", "a chip can be wider than what it sits in"],
    ["break-words", "a genre name with no spaces has nowhere to break"],
  ] as [string, string][]) {
    assert.ok(chipClasses[1].includes(rule), why);
  }
});

test("what a mix card shows is read off the films, not held anywhere", () => {
  const stack = bodyOf("MixCards", cards);

  // Membership from the mix's own handles, loved from the same films — so a mark
  // pressed in the dialog moves the heart by the next render. The arithmetic
  // itself is `mixes.test.ts`.
  assert.match(stack, /filmsIn\(mix, movies\)/, "the card counts something other than its films");

  // The order of the cards is the same kind of answer, and the same rule holds
  // it: read off the films every render rather than kept anywhere. Which order,
  // and why, is `mixes.test.ts`.
  assert.match(stack, /inOrder\(mixes, movies\)\.map/, "the cards are not shown liveliest first");
  assert.match(stack, /selected\(LOVED, films\)\.length/, "the heart counts something else");
  assert.equal(
    /useState[<(][^)]*Movie|useRef[<(][^)]*Movie\b/.test(cards),
    false,
    "the cards keep a copy of the films",
  );
});

test("opening a genre cannot move the labels", () => {
  const row = bodyOf("GenreLabels", labels);

  // The dialog is a sibling of the line rather than a child of it: whatever it
  // does, it does outside the flow the labels are laid out in.
  const line = row.indexOf("flex flex-wrap");
  const dialog = row.indexOf("<Meaning");
  assert.ok(line < dialog, "the dialog is rendered before the labels");
  assert.ok(
    row.slice(line, dialog).includes("</div>"),
    "the dialog is inside the wrapping line, where it can push the labels around",
  );

  // And what is open is a genre, not a piece of layout.
  assert.match(row, /useState<Genre \| null>\(null\)/, "the labels keep something else in state");
});

test("a name is set one way, on whichever surface it is read", () => {
  // One rule for the typography, and the ground it sits on chosen where it is
  // used. Written as what has to be true rather than as how it is spelled: how
  // the rule is declared and how the classes are joined are the component's
  // business, and a check on either would fail on a reformatting that changed
  // nothing.
  const everywhere = source + labels + chip;
  for (const [rule, count] of [
    ["tracking-[0.11em]", (everywhere.match(/tracking-\[0\.11em\]/g) ?? []).length],
    ["uppercase", (everywhere.match(/\buppercase\b/g) ?? []).length],
  ] as [string, number][]) {
    assert.equal(count, 1, `${rule} is written out in more than one place`);
  }

  // Both the label and the chip inside a mix reach for that one rule.
  const label = bodyOf("GenreLabels", labels);
  const inCard = bodyOf("Chip", chip);
  assert.match(label, /\bCHIP\b/, "a genre label sets its own name styling");
  assert.match(inCard, /\bCHIP\b/, "a chip in a mix sets its own name styling");

  // And they are told apart by the ground each sits on: a genre labels itself on
  // the page and is raised off it, the same name inside a mix's card is cut into
  // it. Whichever way they are written, the two must not end up the same.
  assert.match(label, /bg-screen/, "a genre label is not raised off the page");
  assert.doesNotMatch(label, /bg-night/, "a genre label is cut into the page");
  assert.match(inCard, /bg-night/, "a chip in a mix is not cut into the card");
  assert.doesNotMatch(inCard, /bg-screen/, "a chip in a mix is raised off the card");
});

test("a genre opens its films, in the rows the rest of the page uses", () => {
  const dialog = bodyOf("Meaning", labels);

  // The name, the meaning, then the films: the order a reader wants them, and
  // the same `Films` a mix's dialog and the summary's open. No second way of
  // showing a film anywhere on this page.
  assert.match(dialog, /<Films movies=\{films\}/, "a genre's films are not the page's own rows");
  assert.ok(
    dialog.indexOf("{genre.instruction}") < dialog.indexOf("<Films"),
    "the films are above the meaning",
  );
  assert.match(dialog, /<Films[^>]*\bfiled\b/, "a row does not say which mixes it is filed in");

  // Derived by the labels on every render and handed in, like every other list
  // on this page: nothing in here holds a copy of a film, so a mark pressed in a
  // row shows by the next render.
  const row = bodyOf("GenreLabels", labels);
  assert.match(row, /films=\{filmsUnder\(open, mixes, movies\)\}/, "the films are not derived per render");
  assert.equal(
    /useState<(readonly )?Movie|useMemo|\.filter\(|\.map\(\(movie/.test(dialog),
    false,
    "the dialog works out or keeps its own films",
  );

  // No films is left as no films. A genre named and not yet combined into
  // anything is an ordinary state, and a line describing the gap would read as
  // something gone wrong.
  assert.equal(
    /films\.length === 0|Nothing here|No films/.test(dialog),
    false,
    "a genre with no films behind it says so instead of saying nothing",
  );
});

test("a genre's meaning can be dismissed three ways, and hands focus back", () => {
  const dialog = bodyOf("Meaning", labels);

  // The same dialog the summary tiles open, for the same reasons: `showModal`
  // brings the top layer, the page's inertness, Escape and the focus handed back
  // to the control that opened it.
  assert.match(dialog, /<dialog/, "the meaning opens in something other than a dialog");
  assert.match(labels, /element\.showModal\(\);/, "it is not opened as a modal");
  assert.match(dialog, /onCancel=\{\(event\) => \{/, "Escape does not close it");
  assert.match(dialog, /event\.target === dialog\.current/, "a press outside the card does nothing");
  assert.match(dialog, />\s*Close\s*</, "there is no Close control");
  assert.match(dialog, /backdrop:bg-scrim/);

  // Which means none of what the element brings is re-implemented beside it: no
  // role to declare, no trap to keep, no inertness to arrange.
  assert.equal(
    /role="dialog"|aria-modal=|inert=|tabIndex=/.test(labels),
    false,
    "the dialog has grown a hand-written half",
  );

  // A long name in the heading wraps rather than widening the card.
  assert.match(dialog, /<h2[^>]*break-words/, "a long name can stretch the dialog");

  // Focus on the way out is the exception, and it belongs to the labels rather
  // than to this: React unmounts a dialog in the same commit that closes it. So
  // what is pinned is that the label pressed is remembered from the press and
  // restored by the component that outlives the dialog.
  const row = bodyOf("GenreLabels", labels);

  // The label that was pressed, taken from the press. Not `document.activeElement`
  // — clicking a button does not make it the active element in every browser, so
  // that would answer a question about the browser rather than about what
  // somebody pressed.
  assert.match(row, /invoker\.current = event\.currentTarget;/, "the label pressed is not kept");
  assert.match(row, /onClick=\{\(event\) => \{/, "the press does not carry what was pressed");

  // Restored to that exact button when it is still there, and to a label that is
  // still there when it is not — renaming a genre re-keys its row — rather than
  // to `<body>`, which is a reader at the top of the page with no way back.
  assert.match(row, /returnTo\([\s\S]{0,60}?document\.contains\(/);
  assert.match(
    row,
    /line\.current\?\.querySelectorAll<HTMLElement>\("button"\)/,
    "there is nowhere to put focus when the label pressed has gone",
  );
  assert.match(row, /<div ref=\{line\}/, "the line of labels cannot be reached to fall back to");
  assert.doesNotMatch(dialog, /\.focus\(\)/, "the dialog restores focus on its way out again");

  // Nothing inside it writes. A genre is renamed and rewritten at the foot of
  // the page, and a second way in would be a second set of rules about a name.
  assert.equal(
    /fetch\(|onSave|<input|<textarea|method: "/.test(labels),
    false,
    "the meaning has become a second editor",
  );

  // The card, the heading and the surface are the page's own.
  assert.match(dialog, /rounded-2xl border border-rule bg-screen/);
  assert.match(dialog, /<h2 className="[^"]*font-display/, "the name is not the dialog's heading");
  assert.match(dialog, /aria-label=\{genre\.name\}/, "the dialog is not named for its genre");
});

/**
 * Deleting, which is the one thing the website can do to a genre or a mix.
 *
 * The page used to carry a management section at its foot — a list of names with
 * Edit and Delete beside each — and that list read as the real interface. What
 * replaces it is nothing for creating or renaming, which is conversation's work,
 * and a delete that lives inside the dialog for the thing being deleted.
 */

test("the page has no management section and no way to edit anything", () => {
  // The foot of the page is prose and nothing else now.
  const everywhere = source + labels + cards + summary + dialog + row + marks + manage;
  assert.equal(/Advanced/.test(everywhere), false, "the Advanced section is still here");
  assert.equal(
    /<details|<summary/.test(source),
    false,
    "the page still carries a collapsed section of its own",
  );

  // No editing, and nothing standing in for it: no form, no field, no rename.
  assert.equal(
    /<input|<textarea|<form|new_name|onSave|Draft\b/.test(everywhere),
    false,
    "the page can still edit a genre or a mix",
  );

  // The only thing the page asks of a genre or a mix endpoint is a delete. A
  // film's mark still writes, and that is the other endpoint entirely.
  for (const [file, body] of [
    ["the board", source],
    ["the genre labels", labels],
    ["the mix cards", cards],
    ["the summary", summary],
    ["a film's row", row],
  ] as [string, string][]) {
    assert.equal(
      /\/api\/(genres|mixes)/.test(body),
      false,
      `${file} writes to a genre or mix endpoint of its own`,
    );
  }
  assert.equal(
    /"(POST|PATCH|PUT)"/.test(manage),
    false,
    "the delete component can create or rename as well",
  );

  for (const control of ["Edit", "Rename", "Add genre", "Add mix", "New genre", "New mix"]) {
    assert.equal(
      new RegExp(`>\\s*${control}\\s*<|>${control}</`).test(everywhere),
      false,
      `the page offers "${control}"`,
    );
  }

  // And the two files that held all of it are gone rather than orphaned.
  for (const file of ["taste-advanced.tsx", "taste-editor.tsx"]) {
    assert.equal(
      existsSync(new URL(`../../components/${file}`, import.meta.url)),
      false,
      `${file} is still in the tree`,
    );
  }
});

test("both detail dialogs carry the same overflow menu, in the top right", () => {
  // One component, used twice: a genre and a mix are deleted the same way, and
  // two of these would be two places for the question to be worded differently.
  for (const [what, body, kind] of [
    ["a genre", bodyOf("Meaning", labels), "genre"],
    ["a mix", bodyOf("Detail", cards), "mix"],
  ] as [string, string, string][]) {
    const at = body.indexOf("<Manage");
    assert.notEqual(at, -1, `${what} cannot be deleted from its own dialog`);

    // What it is given, in no particular order: props are not a sequence.
    const given = body.slice(at, body.indexOf("/>", at));
    assert.match(given, new RegExp(`kind="${kind}"`), `${what}'s menu does not know its kind`);
    assert.match(given, new RegExp(`name=\\{${kind}\\.name\\}`), `${what}'s menu has no name`);
    // Deleting is not dismissing, and whoever puts focus back afterwards needs
    // to be told which of the two happened. See the focus test below.
    assert.match(given, /onRemoved=\{onRemoved\}/, `${what}'s dialog reads a delete as a close`);

    // Beside the heading and at the end of that row, which is the top right.
    const header = body.slice(body.indexOf("<header"), body.indexOf("</header>"));
    assert.match(header, /justify-between/, `${what}'s menu is not at the end of the heading row`);
    assert.ok(header.indexOf("<h2") < header.indexOf("<Manage"), `${what}'s menu comes first`);
    // A name can wrap to several lines and must not carry the menu down with it.
    assert.match(header, /items-start/, `${what}'s menu is aligned to a wrapping name`);
    assert.match(header, /<h2[^>]*\bmin-w-0\b/, `a long name can widen ${what}'s dialog`);
  }

  // The app's own menu, not a second pattern: the mark on a film's row is the
  // one this follows.
  assert.match(manage, /aria-haspopup="menu"/, "the trigger does not say what it opens");
  assert.match(manage, /role="menu"/, "what opens is not a menu");
  assert.match(manage, /role="menuitem"/, "the menu has no item in it");
  assert.match(manage, /aria-expanded=\{open\}/, "the trigger does not say whether it is open");
  assert.match(manage, /addEventListener\("pointerdown", elsewhere\)/, "a press elsewhere leaves it open");

  // And it nests validly: a menu is a flow-content box, a `<span>` holds
  // phrasing content, so the box around the trigger and its menu is a `<div>`.
  const drawn = bodyOf("Manage", manage);
  const box = drawn.slice(0, drawn.indexOf('role="menu"'));
  assert.match(box, /<div\b/, "the trigger and its menu are not in a box of their own");
  assert.equal(/<span\b/.test(box), false, "the menu is inside a span, which cannot hold one");

  // Escape closes the menu and stops there, so one press does not also dismiss
  // the dialog the menu is inside.
  const steer = manage.slice(manage.indexOf('if (event.key === "Escape")'));
  assert.match(steer, /event\.preventDefault\(\);\s*close\(true\);/, "Escape falls through to the dialog");
});

test("Delete asks before it deletes, and only the answer writes", () => {
  const menu = bodyOf("Manage", manage);
  const question = bodyOf("Confirm", manage);

  // The menu item opens the question and does nothing else: no request leaves
  // from the menu, so a mis-pressed `Delete` costs a second press to undo.
  assert.match(menu, /setAsking\(true\)/, "the menu item does not open a question");
  assert.match(menu, /asking && /, "there is no question to answer");
  assert.match(menu, /<Confirm/, "the question is not the one written here");

  // The question names what it is about to destroy, in its first line.
  assert.match(question, /Delete \{name\}\?/, "the question does not name what it deletes");
  assert.match(question, /aria-label=\{`Delete \$\{name\}\?`\}/, "a listener is not told what this asks");
  assert.match(question, /element\.showModal\(\);/, "the question is not a modal dialog");

  // Two answers. Cancel writes nothing and is where focus starts, so the
  // destructive one is never what a stray Return reaches.
  assert.match(question, />\s*Cancel\s*</, "there is no way to say no");
  assert.match(question, /cancel\.current\?\.focus\(\);/, "focus does not start on Cancel");
  assert.match(question, /onCancel=\{onCancel\}|onClick=\{onCancel\}/, "Cancel does nothing");

  // And focus comes back to the `…` it was opened from, after the question has
  // closed rather than inside the handler that closes it: `showModal` hands
  // focus back to the menu item that opened this, which went with the menu, so
  // the browser's own restoration lands on `<body>`. Skipped when the trigger
  // has gone too — that is the successful delete, and the section that outlives
  // this puts focus back instead.
  assert.match(menu, /if \(asking \|\| !asked\.current\) return;/, "the question's closing is not noticed");
  assert.match(
    menu,
    /document\.contains\(trigger\.current\)\) trigger\.current\.focus\(\)/,
    "focus is not returned to the control the question was opened from",
  );

  // Escape and a press outside are Cancel too: every way out that is not the red
  // button leaves the model as it was.
  assert.match(question, /onCancel=\{\(event\) => \{[\s\S]*?onCancel\(\);/, "Escape is not a Cancel");

  // And answered here only. This dialog is rendered inside the detail dialog's
  // React tree, and React carries `cancel` up that tree — so one Escape would
  // otherwise close the question and the dialog behind it together.
  assert.match(
    question,
    /event\.preventDefault\(\);\s*event\.stopPropagation\(\);/,
    "one Escape dismisses the dialog behind the question as well",
  );
  assert.match(
    question,
    /event\.target === dialog\.current && !busy\) onCancel\(\)/,
    "a press outside is not a Cancel",
  );

  // The red button is wired to the one delete there is. What it sends, and what
  // each kind of answer means, is `lib/web/manage.ts` — tested for real in
  // `manage.test.ts` rather than read off this file.
  assert.match(question, /onClick=\{remove\}/, "the red button is not what deletes");
  assert.match(question, /await ask\(kind, name\)/, "the button does not go through that one path");
  assert.equal(
    /fetch\(|method: "DELETE"/.test(manage),
    false,
    "the dialog has a delete of its own beside the shared one",
  );

  // What lands is read back from the store rather than from the answer's copy of
  // the model, and then the dialog describing the deleted thing goes — both of
  // them only once the store has said it is gone.
  assert.match(question, /if \(!answer\.removed\)/, "a refusal is treated as a deletion");
  assert.match(question, /startRefresh\(\(\) => router\.refresh\(\)\)/, "the page is not re-read");
  assert.match(question, /onRemoved\(\)/, "the dialog stays open over something that is gone");
  assert.equal(
    /useState<[^>]*Genre|useState<[^>]*Mix|answer\.taste/.test(manage),
    false,
    "it keeps its own copy of the model",
  );

  // A refusal is the store's own sentence, said where the question was asked —
  // and a long one breaks rather than widening a dialog on a narrow screen.
  assert.match(question, /role="alert"/, "a refusal is not announced");
  assert.match(question, /setProblem\(answer\.problem\)/, "the store's own reason is thrown away");
  const alert = question.slice(question.indexOf('role="alert"'), question.indexOf("{problem}"));
  assert.match(alert, /break-words/, "a long refusal can push the dialog sideways");
});

test("a deleted genre or mix hands focus on rather than dropping it", () => {
  // The rules themselves are `refocus.test.ts`, including which control each
  // case should land on. What is pinned here is that both islands ask them, and
  // ask them with everything their section has left.
  const line = bodyOf("GenreLabels", labels);
  const stack = bodyOf("MixCards", cards);

  for (const [what, body, own] of [
    ["the genres", line, /line\.current\?\.querySelectorAll/],
    ["the mixes", stack, /stack\.current\?\.querySelectorAll/],
  ] as [string, string, RegExp][]) {
    assert.match(body, /fallbackTo\(/, `${what} still fall back to a single control`);
    assert.match(body, own, `${what} do not offer what the section has left`);
    // The heading, last: a section that has been emptied still has one, and the
    // island that drew its controls is unmounted with them.
    assert.match(body, /sectionFallback\(/, `${what} have nowhere to go when the section empties`);

    // The deleted control is skipped even while the page still shows it — the
    // deletion has landed, and this render is the last one it appears in.
    const chain = body.slice(body.indexOf("fallbackTo("), body.indexOf("if (open === null"));
    assert.match(chain, /invoker\.current/, `${what} can hand focus to what was just deleted`);
    assert.match(body, /removed\.current/, `${what} read a delete as an ordinary dismissal`);
    assert.match(body, /returnTo\(gone \? null : pressed/, `${what} return focus to a doomed control`);

    // And again after the render, for the other order of the same race.
    assert.match(body, /rescueTo\(/, `${what} do not look again once the page comes back`);
  }

  // The mixes prefer another card, then the films that are in no mix, then the
  // heading — the order a reader would go looking in.
  assert.match(
    stack,
    /\[\.\.\.cards, remainder\.current, sectionFallback\(stack\.current\)\]/,
    "the mixes do not prefer a card, then the remainder, then the section",
  );
  assert.match(cards, /ref=\{remainder\}/, "the remainder's line cannot be focused");

  // The last resort is real, and on every section: focusable, and out of the tab
  // order so that nobody has to pass three headings to reach the page.
  assert.match(section, /data-fallback/, "a section has no last resort for focus");
  assert.match(section, /tabIndex=\{-1\}/, "the heading cannot be given focus");
  assert.match(section, /export function sectionFallback/, "the anchor is found by two spellings");
});

test("a way in's underline is there in both states, and only its colour moves", () => {
  // One rule for every way into the collection — the summary's seven and the
  // mixes' remainder — so a reader never has to work out whether two of them
  // behave the same.
  // Read as the value it declares, not as the way it is written: one string, an
  // array joined, or anything else that comes out the same is the same rule.
  // Everything below is asserted against that declaration alone — the file it
  // sits in also holds a Close button with a focus ring of its own, and reading
  // the file would let that button answer for this rule.
  const at = dialog.indexOf("export const WAY_IN");
  assert.notEqual(at, -1, "there is no one rule for a way in any more");
  const rule = dialog.slice(at, dialog.indexOf(";", at) + 1);

  // The line exists at rest and on hover; hover changes the colour. Switching
  // the *line* on and off is what made these flicker: the controls are a few
  // words tall with little between them, so a pointer crossing the block leaves
  // and re-enters several of them, and each crossing flashed a line into
  // existence. A colour is transitionable, and a line is not.
  assert.match(rule, /\bunderline\b/, "the resting line is gone");
  assert.match(rule, /decoration-transparent/, "the resting line is visible");
  assert.match(rule, /hover:decoration-/, "hover does not change the line's colour");
  // `no-underline` is rejected in any form, not only a hovered one: bare, it
  // takes the resting line away — and `\bunderline\b` above would still match
  // inside the word, so the rest of this test would go on passing.
  assert.equal(
    /hover:underline|\bno-underline\b|group-hover:underline/.test(rule),
    false,
    "the underline is switched on and off again",
  );

  // The keyboard's own signal, on the rule itself: a ring, offset off the text,
  // in the page's one accent. Every way in gets it because every way in is set
  // from here.
  assert.match(rule, /focus-visible:outline-2/, "the rule gives no focus ring");
  assert.match(rule, /focus-visible:outline-offset-2/, "the ring sits on the words");
  assert.match(rule, /focus-visible:outline-beam/, "the ring is not the page's accent");

  // And nothing about hover touches the box: no border, width or padding that
  // only one state has.
  assert.equal(
    /hover:(border|p[xytblr]?-|w-|h-|text-\[)/.test(rule),
    false,
    "hover changes the control's geometry",
  );

  // Both places use it, and neither writes the treatment out again.
  assert.match(bodyOf("Count", summary), /WAY_IN/, "a count is set some other way");
  assert.match(bodyOf("MixCards", cards), /WAY_IN/, "the remainder is set some other way");
  for (const [name, file] of [
    ["the summary", summary],
    ["the mix cards", cards],
  ] as [string, string][]) {
    assert.equal(
      /decoration-transparent/.test(file),
      false,
      `${name} writes the underline treatment out again`,
    );
  }
});

test("recently added is one quiet control, not a list", () => {
  const films = bodyOf("MovieSummary", summary);

  // A count and an arrow, and the films themselves behind the same dialog every
  // other count opens. No rows on the page: the summary says what there is, and
  // opening something is how you see it.
  assert.match(films, /\{recent\.length > 0 && \(/, "an empty week still gets a control");
  assert.match(films, /selection=\{RECENT\}/, "the control stands for something else");
  assert.match(films, /count=\{recent\.length\}/, "the control does not say how many there are");
  assert.match(films, /setOpen\(RECENT\)/, "the control opens something else");
  assert.equal(/<Films/.test(films), false, "the recent films are drawn on the page again");
  assert.match(bodyOf("Chosen", dialog), /<Films movies=\{films\}/, "the dialog draws no rows");
  assert.equal(/Recently added<\/h3>|<h3/.test(summary), false, "the subsection heading is back");

  // Quieter than the row, which is the one place weight says something.
  const control = films.slice(films.indexOf("recent.length > 0"));
  assert.match(control, /text-ink-faint/, "the control is not quieter than the row");
  // A step away from the row, not a paragraph break: it is a separate action and
  // it belongs to the same compact summary.
  assert.match(control, /mt-3/, "there is no room between the row and the control");

  // The page settles the instant, once, where the render happens.
  assert.match(
    bodyOf("TasteView"),
    /recent=\{recentlyAdded\(taste\.movies, new Date\(\)\)\}/,
    "the page does not hand the summary its recent films",
  );
});

test("the mixes' remainder is dismissed and hands focus back like the rest", () => {
  const stack = bodyOf("MixCards", cards);

  // A real button that says what it opens, remembering its own press — and the
  // same architecture the cards already use, not a second one beside it.
  assert.match(stack, /<button[\s\S]{0,120}?aria-haspopup="dialog"/);
  assert.equal(
    (stack.match(/invoker\.current = event\.currentTarget;/g) ?? []).length,
    2,
    "the remainder does not remember its own press, or the cards stopped doing so",
  );

  // Focus back to it while it is there, and to a surviving card when it has
  // gone — which is what happens when the last film in no mix is filed into one.
  // The line itself is one of the places focus can fall back *to*, which is what
  // catches the other way round: the last mix deleted, with films still in none.
  assert.match(stack, /returnTo\([\s\S]{0,60}?document\.contains\(/);
  assert.match(stack, /stack\.current\?\.querySelectorAll<HTMLElement>\("button"\)/);
  assert.match(stack, /remainder\.current/, "the remainder is not somewhere focus can land");
  // One films dialog for the remainder — the one the summary opens — beside the
  // mix's own detail, which is a different thing and keeps its own.
  assert.equal((cards.match(/<Chosen/g) ?? []).length, 1, "there is a second films dialog");
  assert.match(cards, /<Films movies=\{films\}/, "a mix's own detail lost its rows");
});

test("with no mixes at all, the films in none of them are still reachable", () => {
  const view = bodyOf("TasteView");

  // The cards are rendered whatever the mixes look like, because the remainder
  // lives under them: with no mixes every film is in none of them, which is
  // exactly when the one way to those films must not be missing. The message
  // that there are no mixes yet is beside it, not instead of it.
  assert.match(
    view,
    /<MixCards mixes=\{taste\.mixes\} movies=\{taste\.movies\}/,
    "the page does not render the mixes section",
  );
  assert.match(view, /\{taste\.mixes\.length === 0 && \(/, "the empty message is not shown beside it");
  assert.equal(
    /taste\.mixes\.length === 0 \? \(/.test(view),
    false,
    "the cards are still shown instead of the empty message, so the remainder goes with them",
  );

  // And the control itself asks only whether there are such films, never how
  // many mixes there are.
  const stack = bodyOf("MixCards", cards);
  assert.match(stack, /\{other\.length > 0 && \(/, "the line asks about something else");
  assert.equal(
    /mixes\.length === 0|!mixes\.length/.test(stack),
    false,
    "the line is hidden when there are no mixes",
  );
});

test("the remainder's focus is handed back, and rescued if its line then goes", () => {
  const stack = bodyOf("MixCards", cards);

  // Filing the last film that is in no mix takes the line off the page, and that
  // can land either side of the dialog closing. Both halves are asked, the same
  // two rules the summary uses: the invoker at the moment of closing, and — for
  // the render that arrives after it — whatever focus was handed to, once it has
  // left the document with nothing else having taken it.
  assert.match(stack, /returnTo\([\s\S]{0,60}?document\.contains\(/);
  assert.match(stack, /handedTo\.current = back;/, "what focus went to is not remembered");
  assert.match(stack, /rescueTo\(/, "the later half of the race is not handled");
  assert.match(stack, /document\.activeElement === document\.body/, "a moved focus would be stolen");

  // The fallback is worked out once and used by both halves, so the two cannot
  // come to different answers about where focus belongs.
  assert.equal(
    (stack.match(/const stable = fallbackTo\(/g) ?? []).length,
    1,
    "the fallback is worked out more than once, or not at all",
  );
  assert.equal(
    (stack.match(/\bstable\b/g) ?? []).length,
    3,
    "one of the two halves works out its own fallback, or does not use it",
  );
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
