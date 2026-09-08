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
 * Five sources, because the page is now five files: the board itself, the section
 * all three of its parts are drawn by, a film's row — shared by the board and the
 * summary's dialog — the summary tiles, and the mark on a row. What can be tested for real is kept out of here and tested
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
const ROW = new URL("../../components/movie-row.tsx", import.meta.url);
const SUMMARY = new URL("../../components/movie-summary.tsx", import.meta.url);
const MARKS = new URL("../../components/movie-state.tsx", import.meta.url);

const source = readFileSync(VIEW, "utf8");
const section = readFileSync(SECTION, "utf8");
const row = readFileSync(ROW, "utf8");
const summary = readFileSync(SUMMARY, "utf8");
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

test("the counts sit above every film they count", () => {
  const view = bodyOf("TasteView");

  // Given the whole collection, not a mix's films: three of the four tiles count
  // a state, and a state is spread across every mix on the page.
  assert.match(view, /<MovieSummary movies=\{taste\.movies\} \/>/, "the page has no counts on it");

  const at = view.indexOf("<MovieSummary");
  assert.ok(at < view.indexOf('title="Your mixes"'), "the counts are below the mixes");
  assert.ok(at < view.indexOf("<Loose movies="), "the counts are below the films in no mix");
});

test("four tiles, each a control, with the count as the thing you read first", () => {
  assert.match(summary, /SELECTIONS\.map\(\(selection\)/, "the tiles are not the four selections");

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
    ["the counts themselves", readFileSync(new URL("./movie-summary.ts", import.meta.url), "utf8")],
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
  assert.match(bodyOf("MovieSummary", summary), /<Section title="Your movies">/);
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

  // The films section has neither a note nor a count beside its heading: four
  // labelled numbers already say what they are, and the first of them is the
  // count, so a number by the heading would be the same fact twice.
  const movies = bodyOf("MovieSummary", summary);
  const opening = movies.slice(movies.indexOf("<Section"), movies.indexOf(">", movies.indexOf("<Section")) + 1);
  assert.equal(opening, '<Section title="Your movies">');
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
