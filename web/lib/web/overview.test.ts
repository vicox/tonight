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
 *
 * Seven sources, because the page is that many files: the board itself, the
 * section all three of its parts are drawn by, the genre labels, the type a name
 * is set in, a film's row — shared by the board and the summary's dialog — the
 * summary tiles, and the mark on a row. What can be tested for real is kept out of here and tested
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
const ROW = new URL("../../components/movie-row.tsx", import.meta.url);
const SUMMARY = new URL("../../components/movie-summary.tsx", import.meta.url);
const MARKS = new URL("../../components/movie-state.tsx", import.meta.url);

const source = readFileSync(VIEW, "utf8");
const section = readFileSync(SECTION, "utf8");
const chip = readFileSync(CHIP, "utf8");
const model = readFileSync(new URL("./movie-summary.ts", import.meta.url), "utf8");
const labels = readFileSync(LABELS, "utf8");
const row = readFileSync(ROW, "utf8");
const summary = readFileSync(SUMMARY, "utf8");
const marks = readFileSync(MARKS, "utf8");

test("the resting page shows names and films, and no instruction", () => {
  // A mix keeps its meaning inside the disclosure its card already is.
  const card = bodyOf("Card");
  const disclosure = card.slice(card.indexOf("<details"), card.indexOf("</details>"));
  assert.match(disclosure, /instruction\}/, "a mix shows its instruction outside its disclosure");
  assert.equal(
    (card.match(/instruction\}/g) ?? []).length,
    1,
    "a mix renders its instruction in more than one place",
  );

  // A genre's is in the dialog its label opens, and in one place there too. The
  // page itself no longer renders a genre's instruction anywhere: there is no
  // instruction text in the line of labels to be read or to take up room.
  assert.equal(
    /genre\.instruction/.test(source),
    false,
    "the page still renders a genre's instruction inline",
  );
  assert.match(bodyOf("Meaning", labels), /\{genre\.instruction\}/, "the dialog has no meaning in it");
  assert.equal(
    (labels.match(/genre\.instruction/g) ?? []).length,
    1,
    "a genre's instruction is rendered in more than one place",
  );
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
  assert.match(view, /<MovieSummary movies=\{taste\.movies\} \/>/, "the page has no counts on it");

  const at = view.indexOf("<MovieSummary");
  assert.ok(at < view.indexOf('title="Your mixes"'), "the counts are below the mixes");
  assert.ok(at < view.indexOf("<Loose movies="), "the counts are below the films in no mix");
});

test("five tiles, each a control, with the count as the thing you read first", () => {
  assert.match(summary, /STATE_TILES\.map/, "the tiles are not the five states");

  const tile = bodyOf("Tile", summary);
  assert.match(tile, /<button/, "a tile is not something you can press");
  assert.match(tile, /aria-haspopup="dialog"/, "a tile does not say it opens a dialog");

  // The count is the primary information and the label is its caption: the
  // number in the display face, the word small and quiet under it.
  assert.match(tile, /font-display text-\[26px\][\s\S]*?\{count\}/, "the count is not the tile");
  assert.match(
    tile,
    /text-\[11px\][\s\S]*?text-ink-faint[\s\S]*?\{selection\.label\}/,
    "the label is not secondary to the count",
  );
  const visible = tile.slice(tile.indexOf('aria-hidden="true"'));
  assert.ok(
    visible.indexOf("{count}") < visible.indexOf("{selection.label}"),
    "the label is set above the count",
  );

  // Said aloud the pair is the other way round, which is what the label on the
  // control is for.
  assert.match(tile, /aria-label=\{`\$\{selection\.label\}: \$\{count\}`\}/);
});

test("the total is beside the heading, and is not a tile", () => {
  const films = bodyOf("MovieSummary", summary);

  // The same heading treatment the genres and the mixes get, with every film
  // counted — the ones nobody has said anything about included.
  assert.match(
    films,
    /<Section title="Your movies" count=\{movies\.length\}>/,
    "the films section does not carry the total beside its heading",
  );

  // And not a second time as a tile. A number for "all of them" in the row
  // invited reading the row as a breakdown of its first entry.
  assert.equal(/"Total"/.test(summary + model), false, "Total is still a tile");
});

test("the films with no state are a quiet line, not a sixth tile", () => {
  const films = bodyOf("MovieSummary", summary);

  // Absent when there are none: nothing to say, and a zero here would read as a
  // state that happens to be empty.
  assert.match(films, /\{quiet\.length > 0 && \(/, "the line is rendered even when there are none");
  assert.match(films, /withoutStatus\(quiet\.length\)/, "the line does not say how many there are");
  // The arrow is punctuation standing in for "opens these", and the words
  // already say it, so a listener is not read a direction.
  assert.match(films, /<span aria-hidden="true">→<\/span>/);
  assert.match(films, /setOpen\(WITHOUT_STATUS\)/, "the line opens something else");
  assert.match(films, /aria-haspopup="dialog"/);

  // Quiet: the small faint type the page uses for an aside, and none of what
  // makes a tile a tile.
  const line = films.slice(films.indexOf("quiet.length > 0"));
  assert.match(line, /text-\[12\.5px\][^"]*text-ink-faint/, "the line is not set as an aside");
  assert.equal(
    /bg-screen|rounded-xl|border-rule|font-display/.test(line),
    false,
    "the line has been given a tile's surface",
  );

  // It is below the tiles, and outside the grid they are laid out in.
  assert.ok(films.indexOf("STATE_TILES.map") < films.indexOf("quiet.length > 0"));
  assert.ok(
    films.slice(films.indexOf("STATE_TILES.map"), films.indexOf("quiet.length > 0")).includes("</div>"),
    "the line is inside the tile grid",
  );
});

test("one dialog serves the tiles and the quiet line alike", () => {
  const films = bodyOf("MovieSummary", summary);

  // The same `Chosen`, opened with whichever selection was pressed. A second
  // implementation for the films with no state would be a second set of rules
  // about a film's row, its mark and its dialog.
  assert.equal(
    (summary.match(/element\.showModal\(\)/g) ?? []).length,
    1,
    "there is more than one dialog in here",
  );
  assert.equal((bodyOf("Chosen", summary).match(/<dialog/g) ?? []).length, 1);
  assert.equal((films.match(/<Chosen/g) ?? []).length, 1, "the two selections open different dialogs");
  assert.match(films, /selection=\{open\}/, "the dialog is not given what was pressed");
});

test("the summary is an overview of a collection, not a report about it", () => {
  // Four numbers. No share of anything, no direction of travel, nothing to
  // animate and no fifth metric — a tile reading "+3 this week" would be a claim
  // about the user's habits, and this is a page for finding a film.
  assert.equal(
    /%|percent|chart|graph|trend|sparkline|average|Math\.round|animate-/i.test(summary),
    false,
    "the summary grew a measurement of its own",
  );

  // And it is not about when anything was saved. The tiles count films by what
  // the user said, so a timestamp reaching them would be a second idea about the
  // collection arriving through the back door.
  for (const [name, file] of [
    ["the tiles", summary],
    ["a film's row", row],
    ["the counts themselves", model],
  ] as [string, string][]) {
    assert.equal(/createdAt|updatedAt/.test(file), false, `${name} reads a timestamp`);
  }
});

test("the tiles are absent when there is nothing to count", () => {
  // Four zeros over an empty taste model read as a broken instrument. Same
  // reasoning as the "Other movies" section, which is also absent when empty —
  // and the arithmetic still holds, see `movie-summary.test.ts`.
  assert.match(bodyOf("MovieSummary", summary), /if \(!movies\.length\) return null;/);
});

test("a tile opens the dialog the browser has, not one written here", () => {
  const chosen = bodyOf("Chosen", summary);

  assert.match(chosen, /<dialog/, "the films open in something other than a dialog");
  assert.match(summary, /element\.showModal\(\);/, "it is not opened as a modal");

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
    /role="dialog"|aria-modal=|inert=|tabIndex=/.test(summary),
    false,
    "the dialog has grown a hand-written half",
  );
});

test("the dialog shows the page's own rows, and says where each film is filed", () => {
  const chosen = bodyOf("Chosen", summary);

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

  assert.match(summary, /count=\{selected\(selection\.name, movies\)\.length\}/);
  assert.match(bodyOf("Chosen", summary), /const films = selected\(selection\.name, movies\);/);
});

test("a press outside the card closes the dialog, and so do Escape and Close", () => {
  const chosen = bodyOf("Chosen", summary);

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
  assert.equal(
    (films.match(/invoker\.current = event\.currentTarget;/g) ?? []).length,
    2,
    "one of the two controls does not remember what was pressed",
  );

  // And restoring it is this component's, not the dialog's: React unmounts a
  // dialog in the same commit that closes it, so the only thing that can be sure
  // of putting focus anywhere is the thing still mounted afterwards.
  assert.match(films, /returnTo\(invoker\.current, document\.contains\(invoker\.current\)/);
  const chosen = bodyOf("Chosen", summary);
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
  const chosen = bodyOf("Chosen", summary);

  // The rule is `lib/web/refocus.ts` and is tested there against every shape of
  // list. This is the wiring: the marks that are left, the position that was
  // remembered, and the way out when there is nothing else.
  assert.match(chosen, /refocus\(marks, marked\.current, exit\.current\)\?\.focus\(\)/);
  assert.match(chosen, /element\.querySelectorAll<HTMLButtonElement>\(MARK\)/);
  assert.match(summary, /const MARK = '\[aria-haspopup="menu"\]';/);

  // It does nothing while focus is still on something in the dialog, which is
  // every render but the one that removed the row it was on. Focus on the dialog
  // itself counts as lost.
  assert.match(
    chosen,
    /if \(active !== element && active instanceof Node && element\.contains\(active\)\) return;/,
  );

  // And the dialog stays open through it: recovering focus is not a dismissal.
  const recovery = chosen.slice(
    chosen.indexOf("const active = document.activeElement"),
    chosen.indexOf("const films ="),
  );
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
  assert.match(bodyOf("MovieSummary", summary), /<Section title="Your movies" count=/);
  assert.match(view, /<Section\n\s+title="Your genres"/);
  assert.match(view, /<Section\n\s+title="Your mixes"/);
  assert.match(bodyOf("Loose"), /<Section\n\s+title="Other movies"/);

  // And the heading itself is written once, in that component. A second <h2> on
  // the page would be a section drawing its own.
  assert.match(section, /<h2 className="font-display text-\[26px\] leading-none">\{title\}<\/h2>/);
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
  assert.match(bodyOf("Loose"), /note="Films you have saved that are not in a mix\."/);

  // The films section carries the total beside its heading, like the other two,
  // and no note under it: labelled numbers say what they are, and a sentence
  // explaining them would be the only copy of its kind on the page.
  const movies = bodyOf("MovieSummary", summary);
  const opening = movies.slice(movies.indexOf("<Section"), movies.indexOf(">", movies.indexOf("<Section")) + 1);
  assert.equal(opening, '<Section title="Your movies" count={movies.length}>');
});

test("a genre is a compact label, and a mix is still a card", () => {
  // A genre is its name and nothing else, so it is the size of its name and sits
  // next to the others rather than under them. A mix is a composition with films
  // in it, and keeps the card it needs.
  assert.match(bodyOf("TasteView"), /<GenreLabels genres=\{taste\.genres\}/, "genres are not labels");
  assert.match(bodyOf("MixCard"), /<Card /, "a mix has stopped being a card");

  const row = bodyOf("GenreLabels", labels);
  assert.match(row, /flex flex-wrap/, "the labels are not laid out to wrap");
  assert.match(row, /<button/, "a label is not a control");
  assert.match(row, /aria-haspopup="dialog"/, "a label does not say what it opens");

  // Nothing left of the row it used to be, and — the point of the change —
  // nothing that could grow: no disclosure in the line, and no class that
  // behaves one way while something is open.
  assert.equal(
    // `max-w-full` is a ceiling and not a width — a long name has to wrap inside
    // its label rather than push the page sideways — so only a bare `w-full` is
    // the label giving up being the size of its own name.
    /<Chevron|<details|<summary|open:|(?<!max-)\bw-full/.test(row),
    false,
    "a label can still expand in place, so opening one moves the others",
  );

  // The minimum a long name needs: it wraps inside the label, the label stops at
  // the width of the line, and the words stay left where a button would centre
  // them.
  assert.match(row, /max-w-full/, "a long name can push the page sideways");
  assert.match(row, /break-words/, "an unbroken name has nowhere to break");
  assert.match(row, /text-left/, "a wrapped name is centred");
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
  assert.match(row, /returnTo\(\s*pressed,\s*document\.contains\(pressed\)/);
  assert.match(
    row,
    /line\.current\?\.querySelector<HTMLButtonElement>\("button"\)/,
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
  assert.match(dialog, /<h2 className="font-display/, "the name is not the dialog's heading");
  assert.match(dialog, /aria-label=\{genre\.name\}/, "the dialog is not named for its genre");
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
