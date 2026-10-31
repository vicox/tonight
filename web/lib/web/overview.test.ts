import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { statusOf } from "./stream.ts";

/**
 * The signed-in screens, held to the decisions that make them reading pages.
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
 * "nothing said", a control that writes on a page that is supposed to be read.
 *
 * Many sources, because the signed-in screens are that many files: the Stream
 * and the cards it shares with a vibe's screen, a card's status and its vibe
 * links, a vibe's screen and a film's with its answers, the pages and the
 * frame behind them, the section every heading is drawn by, the genre labels,
 * the type a name is set in, and the icons and words a film's answers are drawn
 * with. What can be tested for real is kept out of here
 * and tested that way: the Stream's order and a card's status in
 * `stream.test.ts`, what a URL may choose in `screens.test.ts`, what a choice
 * means in `choices.test.ts` and what it writes in `choose.test.ts`. That the
 * choices are the website's one write is `readonly.test.ts`.
 *
 * ## What is browser-only, and stays that way
 *
 * Some things below are pinned as the wiring that produces a behaviour rather
 * than as the behaviour itself, because reproducing them needs a browser: that a
 * press on a card's ✨ or between its vibe names falls through to the film, and
 * that a long title or three long vibe names lay out inside the card. Layout and
 * hit-testing are the browser's, and no assertion over source can stand in for
 * them — what these tests can do is fail when the structure those behaviours
 * depend on is taken apart.
 */

const VIEW = new URL("../../components/stream-view.tsx", import.meta.url);
const SECTION = new URL("../../components/section.tsx", import.meta.url);
const CHIP = new URL("../../components/chip.tsx", import.meta.url);
const LABELS = new URL("../../components/genre-labels.tsx", import.meta.url);
const MARKS = new URL("../../components/movie-mark.tsx", import.meta.url);
const CHOICES = new URL("../../components/movie-choices.tsx", import.meta.url);
const CARD = new URL("../../components/movie-card.tsx", import.meta.url);
const STATUS = new URL("../../components/movie-status.tsx", import.meta.url);
const LINKS = new URL("../../components/vibe-links.tsx", import.meta.url);
const VIBE_VIEW = new URL("../../components/vibe-view.tsx", import.meta.url);
const MOVIE_VIEW = new URL("../../components/movie-view.tsx", import.meta.url);
const BACK = new URL("../../components/back-to-stream.tsx", import.meta.url);
const FRAME = new URL("../../components/signed-in.tsx", import.meta.url);
const VIBE_PAGE = new URL("../../app/vibe/page.tsx", import.meta.url);
const MOVIE_PAGE = new URL("../../app/movie/page.tsx", import.meta.url);
const FILTER = new URL("../../components/include-previously-seen.tsx", import.meta.url);
const HOME_PAGE = new URL("../../app/page.tsx", import.meta.url);

const source = readFileSync(VIEW, "utf8");
const section = readFileSync(SECTION, "utf8");
const chip = readFileSync(CHIP, "utf8");
const labels = readFileSync(LABELS, "utf8");
const marks = readFileSync(MARKS, "utf8");
const choices = readFileSync(CHOICES, "utf8");
const card = readFileSync(CARD, "utf8");
const status = readFileSync(STATUS, "utf8");
const links = readFileSync(LINKS, "utf8");
const vibeView = readFileSync(VIBE_VIEW, "utf8");
const movieView = readFileSync(MOVIE_VIEW, "utf8");
const back = readFileSync(BACK, "utf8");
const frame = readFileSync(FRAME, "utf8");
const vibePage = readFileSync(VIBE_PAGE, "utf8");
const moviePage = readFileSync(MOVIE_PAGE, "utf8");
const filter = readFileSync(FILTER, "utf8");
const page = readFileSync(HOME_PAGE, "utf8");
const globals = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** Every file the redesigned screens added, by name, for the checks that hold all of them. */
const NEW: [string, string][] = [
  ["stream-view.tsx", source],
  ["movie-card.tsx", card],
  ["movie-status.tsx", status],
  ["vibe-links.tsx", links],
  ["vibe-view.tsx", vibeView],
  ["movie-view.tsx", movieView],
  ["movie-choices.tsx", choices],
  ["back-to-stream.tsx", back],
  ["signed-in.tsx", frame],
  ["app/vibe/page.tsx", vibePage],
  ["app/movie/page.tsx", moviePage],
];

test("the Stream shows no instruction, and each is rendered once, where it is read", () => {
  // No instruction is on the Stream: a vibe's is on the vibe's own screen. What
  // is on the Stream is what can be scanned — films and names.
  // Read as what is rendered rather than as the word: the page's own prose
  // explains that there is no instruction on it, and prose is not a defect.
  assert.equal(
    /\.instruction\}|instruction=/.test(source + card),
    false,
    "the Stream renders an instruction, or hands one to something that does",
  );

  // A vibe's is rendered once, on its screen.
  assert.match(bodyOf("VibeView", vibeView), /\{vibe\.instruction\}/, "a vibe has no meaning on its screen");
  assert.equal((vibeView.match(/\.instruction\}/g) ?? []).length, 1, "a vibe's instruction is rendered twice");

  // A genre is a label and nothing more: the dialog that showed what one means is
  // gone with the rest of the dialogs, and nothing replaced it.
  assert.equal(/\.instruction\b/.test(labels), false, "a genre's instruction is rendered");
});

test("the Stream is every film, once, in one flat list, newest saved first", () => {
  const view = bodyOf("StreamView");

  // Which films, and in which order, is `stream` — held in `stream.test.ts`
  // against fixtures that fail on a dropped film, a moved card or an undated film
  // put first. What is pinned here is that the page asks it, and draws what it
  // answers as one list of cards, with no vibe as their context.
  assert.match(
    view,
    /<MovieCards movies=\{stream\(movies\)\} vibes=\{taste\.vibes\} label="Your movies, most recently saved first" \/>/,
    "the cards are not the films `stream` orders, or the list does not say what it is",
  );
  assert.equal((view.match(/<MovieCards\b/g) ?? []).length, 1, "the films are split across more than one list");
  assert.equal(/<MovieCard\b|<ul\b|<li\b/.test(view), false, "the Stream draws films of its own");

  // One list, and every card in it the same card.
  const list = bodyOf("MovieCards", card);
  assert.equal((list.match(/<ul\b/g) ?? []).length, 1);
  assert.match(list, /<ul aria-label=\{label\}/, "the list does not say what it is");
  assert.match(
    list,
    /\{movies\.map\(\(movie\) => \(\s*<MovieCard key=\{`\$\{movie\.year\} \$\{movie\.title\}`\} movie=\{movie\} vibes=\{vibes\} from=\{from\} \/>/,
  );

  // No grouping of any kind: not by vibe, and not by how a film stands. A film
  // in no vibe is a card like the rest, with no word standing in for the vibe.
  assert.equal(
    /inOrder|filmsIn\(|selected\(|\.viewing ===|<Films\b/.test(view),
    false,
    "the Stream groups its films",
  );
  assert.equal(/Other movies|No vibe/.test(source + card), false, "a film in no vibe gets a placeholder");
});

test("nothing on any screen offers to create anything", () => {
  // The model is grown in conversation. A create control here would make the
  // website the way in, which it deliberately is not.
  for (const [name, file] of NEW) {
    for (const control of ["Add genre", "Add vibe", "Add movie", "Add film", "New genre", "New vibe"]) {
      assert.equal(file.includes(control), false, `${name} offers "${control}"`);
    }
  }
});

test("a film list is a list of cards, without rules, columns or pictures", () => {
  const list = bodyOf("MovieCards", card);
  const drawn = list + bodyOf("MovieCard", card);

  assert.ok(list.includes("<ul"), "the films are not a list");
  assert.equal(/<table|<t[dhr]\b|role="(table|row|cell)"/.test(drawn), false, "it is a table");
  assert.equal(/divide-|border-[tb]\b|border-y\b/.test(list), false, "it has row separators");
  assert.equal(/<img|Image|poster|backdrop/i.test(drawn), false, "it carries an image");

  // The plain list of titles every vibe used to show is gone, and so is the
  // mark drawn on each of its rows; the cards replace both.
  for (const file of ["components/movie-row.tsx"]) {
    assert.equal(existsSync(new URL(`../../${file}`, import.meta.url)), false, `${file} is still in the tree`);
  }
  assert.doesNotMatch(marks, /function MovieMark\b/, "the row's mark is still drawn");
});

test("the IMDb link says IMDb, and is absent when there is no id", () => {
  assert.match(bodyOf("MovieView", movieView), /movie\.imdbId !== null/, "the link is not conditional on there being an id");

  const link = bodyOf("Imdb", movieView);
  assert.match(link, /https:\/\/www\.imdb\.com\/title\//);
  assert.match(link, />\s*IMDb</, "the visible link text does not contain IMDb");
});

test("each answer has its Lucide icon, and nothing-said has its own", () => {
  assert.match(marks, /from "lucide-react"/);
  for (const [value, icon] of [
    ["seen-now", "Eye"],
    ["seen-before", "Eye"],
    ["want-to-see", "Bookmark"],
    ["dont-want-to-see", "EyeOff"],
    ["liked", "ThumbsUp"],
    ["loved", "Heart"],
    ["disliked", "ThumbsDown"],
  ]) {
    assert.match(
      marks,
      new RegExp(`value: "${value}",[^}]*icon: ${icon}`),
      `${value} is not drawn with ${icon}`,
    );
  }
  assert.match(marks, /value: null, label: "Nothing said", icon: MessageCircleOff/);
});

test("the viewing mark shows the four answers and no empty one", () => {
  // A film on the list always stands somewhere, so there is no silence to draw.
  const viewing = marks.slice(marks.indexOf("export const VIEWING"), marks.indexOf("export const JUDGEMENT"));
  assert.deepEqual(
    [...viewing.matchAll(/value: "([a-z-]+)"/g)].map((match) => match[1]),
    ["want-to-see", "seen-now", "seen-before", "dont-want-to-see"],
    "the viewing mark no longer reads want to see, seen now, seen before — the direction a film moves",
  );
  assert.deepEqual(
    [...viewing.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]),
    ["Want to see", "Seen", "Seen", "Don't want to see"],
  );
  assert.equal(/value: null/.test(viewing), false, "the viewing mark has an answer for silence");
});

test("a card says Seen with the eye for a film seen now or seen before, and a verdict wins over it", () => {
  // The card's status draws the mark's own entry for the key `statusOf` gives it.
  // Both seen values are drawn as the original one — the eye and *Seen* — and no
  // clock: when they saw it is said on the film's screen, not on a card.
  const viewing = marks.slice(marks.indexOf("export const VIEWING"), marks.indexOf("export const JUDGEMENT"));
  for (const value of ["seen-now", "seen-before"]) {
    assert.match(viewing, new RegExp(`\\{ value: "${value}", label: "Seen", icon: Eye \\}`), `${value} is not drawn as Seen`);
  }
  assert.doesNotMatch(marks, /\bHistory\b|"Seen now"|"Seen before"/, "a card can still say when they saw it");
  assert.match(status, /VIEWING\.choices\.find\(\(choice\) => choice\.value === key\)/, "a card draws its status some other way");
  assert.match(status, /statusOf\(viewing, judgement\)/);

  // With no verdict the card shows the viewing; with one, only the verdict.
  for (const seen of ["seen-now", "seen-before"] as const) {
    assert.deepEqual(statusOf(seen, null), [seen]);
    for (const judgement of ["liked", "loved", "disliked"] as const) {
      assert.deepEqual(statusOf(seen, judgement), [judgement], `${seen} + ${judgement}`);
    }
  }
});

test("the judgement mark shows the three, and silence as its own answer", () => {
  // `null` *is* an answer here, and that is the difference between the two
  // marks: nothing said about a film is a real state, and not a neutral opinion.
  const judgement = marks.slice(marks.indexOf("export const JUDGEMENT"));
  assert.deepEqual(
    [...judgement.matchAll(/value: (?:"([a-z]+)"|(null))/g)].map((match) => match[1] ?? match[2]),
    ["liked", "loved", "disliked", "null"],
    "the judgement mark no longer reads the three warmest-last and then silence",
  );
});

test("the marks' vocabulary is how an answer looks, and nothing to press or send", () => {
  // Where a film stands and what they made of it are written by a film's
  // answers, through their own route, and otherwise said to an assistant. This
  // is only how each answer is drawn: no control, no request, no state.
  for (const [what, pattern] of [
    ["a button", /<button\b/],
    ["a menu", /role="menu|aria-haspopup|aria-expanded/],
    ["a key handler", /onKeyDown|onClick/],
    ["a request", /\bfetch\s*\(|method:/],
    ["a route to write to", /endpoint|\/api\//],
    ["a router to refresh", /useRouter|router\./],
    ["state of its own", /\buse(State|Effect|Ref|Transition|Id)\b/],
  ] as [string, RegExp][]) {
    assert.doesNotMatch(marks, pattern, `the marks have ${what}`);
  }
  assert.doesNotMatch(marks, /^"use client";/, "the marks are a client component again");
  assert.equal(existsSync(new URL("./pending.ts", import.meta.url)), false, "the pending seam is back");
});

test("the Stream is its heading, how many films, and then the films — nothing between", () => {
  const view = bodyOf("StreamView");

  // The films section is the heading and the count, and the cards straight under
  // it: no line of counts by status, no "recently added", no summary of any kind.
  assert.match(
    view,
    /<Section title="Your movies" count=\{movies\.length\}>\s*\{movies\.length === 0 \? \(/,
    "something sits between the heading and the films",
  );
  for (const [what, pattern] of [
    ["a summary", /MovieSummary|recentlyAdded|selected\(|WATCHED|\bSAID\b/],
    ["a count by status", /Recently added|with no opinion|No opinion|Seen \{|Want to see \{/],
  ] as [string, RegExp][]) {
    assert.doesNotMatch(source, pattern, `the Stream has ${what}`);
  }

  // And the files that drew it are gone rather than orphaned.
  for (const file of ["components/movie-summary.tsx", "lib/web/movie-summary.ts"]) {
    assert.equal(existsSync(new URL(`../../${file}`, import.meta.url)), false, `${file} is still in the tree`);
  }
});

test("every section on the Stream is drawn by one component", () => {
  const view = bodyOf("StreamView");

  // The films, and the short list of vibes a film cannot reach. One component
  // draws both headings, which is what keeps them from drifting apart.
  assert.match(view, /<Section title="Your movies" count=\{movies\.length\}>/);
  assert.match(view, /<Section\n\s+title="Vibes with no films"/);
  assert.equal((view.match(/<Section\b/g) ?? []).length, 2, "the Stream has a section besides those two");

  // And the heading itself is written once, in that component. A second <h2> on
  // the page would be a section drawing its own.
  assert.match(section, /<h2 className="font-display text-\[26px\] leading-none">\{title\}<\/h2>/);
  assert.equal(/<h2/.test(source), false, "the page draws a section heading of its own");
});

test("a section carries no surface, and is not handed one", () => {
  // The change this test exists for: genres and vibes used to sit inside a
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
    /<Section[^>]*className="[^"]*(bg-|\bborder|rounded|\bp-\d|\bpx-\d|\bpy-\d)/.test(source),
    false,
    "a section is handed a surface through its class name",
  );
});

test("each section keeps its own copy", () => {
  const view = bodyOf("StreamView");

  // With no films, the one sentence that says where they come from: a
  // conversation, not a form on this page.
  assert.match(
    view,
    /Nothing here yet\. Tell ChatGPT what you are in the mood for, and what you tell it can be\s+saved here\./u,
    "the empty Stream no longer says where films come from",
  );
  // The short list says what it is.
  assert.match(view, /note="Nothing is in these yet\."/);

  // None of the Stream's copy reads a vibe as what its genres have in common, or
  // asks for two genres when one is enough — the two mistakes the old empty
  // state made, however it is reworded later.
  for (const derivation of [/would both fit/iu, /\boverlap\b/iu, /\bintersect/iu, /both of your genres/iu]) {
    assert.doesNotMatch(view, derivation, "the Stream reads a vibe as what its genres have in common");
  }
  for (const plural of [/two of your genres/iu, /two genres/iu, /at least two/iu]) {
    assert.doesNotMatch(view, plural, "the Stream asks for two genres, and one is enough");
  }
  assert.doesNotMatch(view, /mixed into something/u, "the mixing metaphor came back");
});

test("a genre is a compact label, on a vibe's screen only, and nothing to press", () => {
  // A genre is its name and nothing else here, and it is listed in one place: a
  // vibe's screen, the genres that vibe is built from.
  assert.match(bodyOf("VibeView", vibeView), /<GenreLabels genres=\{genres\} \/>/);
  assert.match(vibePage, /genres=\{genresOf\(vibe, held\.taste\.genres\)\}/, "a vibe is given other genres");

  // Not on the Stream: no section of genres no vibe is built from, no labels,
  // and no copy about them. The genres themselves are untouched — this only
  // stops listing them.
  for (const [what, pattern] of [
    ["genre labels", /GenreLabels/],
    ["the loose genres", /looseGenres|\bloose\b/],
    ["the section's heading or note", /Other genres|Genres no vibe is built from/],
  ] as [string, RegExp][]) {
    assert.doesNotMatch(source, pattern, `the Stream has ${what}`);
  }
  assert.doesNotMatch(
    readFileSync(new URL("./stream.ts", import.meta.url), "utf8"),
    /looseGenres/,
    "what only the Stream's genre section used is still here",
  );

  const line = bodyOf("GenreLabels", labels);
  assert.match(line, /<ul className="flex flex-wrap/, "the labels are not one wrapping list");
  assert.match(line, /<li\b/);
  assert.match(line, /max-w-full/, "a long name can push the page sideways");
  assert.match(line, /break-words/, "a name with no spaces in it has nowhere to break");

  // A label opens nothing: no button, no dialog, no list of films behind it.
  for (const [what, pattern] of [
    ["a button", /<button\b/],
    ["a dialog", /<dialog|showModal|aria-haspopup/],
    ["a handler", /onClick|onKeyDown/],
    ["client code", /^"use client";|\buse(State|Effect|Ref)\b/m],
    ["a list of films", /<Films\b|filmsUnder/],
  ] as [string, RegExp][]) {
    assert.doesNotMatch(labels, pattern, `a genre label has ${what}`);
  }
});

test("a long name stays inside its card, and inside its heading", () => {
  // A title is valid up to two hundred characters and a vibe's name up to sixty,
  // and neither need contain a space. `min-w-0` is what makes the breaking mean
  // anything: a flex or grid item is as wide as its longest unbreakable word
  // until it is allowed to be narrower.
  const drawn = bodyOf("MovieCard", card);
  assert.match(drawn, /<h3 className="[^"]*\bmin-w-0\b/, "a long title can widen the card");
  assert.match(drawn, /font-display text-\[22px\] leading-tight break-words/, "a long title has nowhere to break");
  assert.match(bodyOf("VibeLinks", links), /"min-w-0 break-words /, "a long vibe name can widen the card");
  assert.match(
    bodyOf("VibeView", vibeView),
    /<h2[\s\S]{0,120}?className="min-w-0[^"]*break-words/,
    "a long vibe name can widen its screen",
  );
  assert.match(
    bodyOf("MovieView", movieView),
    /<h2 className="[^"]*min-w-0[^"]*break-words/,
    "a long title can widen its screen",
  );

  // And none is cut off to keep it on one line.
  for (const [name, file] of NEW) {
    assert.equal(/truncate|text-ellipsis|line-clamp/.test(file), false, `${name} cuts a name off`);
  }
});

test("a name is set one way, on whichever surface it is read", () => {
  // One rule for the typography, and the ground it sits on chosen where it is
  // used. Written as what has to be true rather than as how it is spelled: how
  // the rule is declared and how the classes are joined are the component's
  // business, and a check on either would fail on a reformatting that changed
  // nothing.
  const everywhere = [source, labels, chip, ...NEW.map(([, file]) => file)].join("\n");
  for (const [rule, count] of [
    ["tracking-[0.11em]", (everywhere.match(/tracking-\[0\.11em\]/g) ?? []).length],
    ["uppercase", (everywhere.match(/\buppercase\b/g) ?? []).length],
  ] as [string, number][]) {
    assert.equal(count, 1, `${rule} is written out in more than one place`);
  }

  // A genre's label reaches for that one rule, and raises itself off the page.
  const label = bodyOf("GenreLabels", labels);
  assert.match(label, /\bCHIP\b/, "a genre label sets its own name styling");
  assert.match(label, /bg-screen/, "a genre label is not raised off the page");
  assert.doesNotMatch(label, /bg-night/, "a genre label is cut into the page");
});

test("no screen manages anything, and the only forms are a film's two questions", () => {
  const everywhere = [source, labels, marks, ...NEW.map(([, file]) => file)].join("\n");
  assert.equal(/Advanced/.test(everywhere), false, "the Advanced section is still here");
  assert.equal(/<details|<summary/.test(source), false, "the Stream carries a collapsed section of its own");

  // Nothing renames, rewrites or deletes: no field to type in, and no draft.
  assert.equal(
    /<textarea|type="text"|new_name|onSave|Draft\b/.test(everywhere),
    false,
    "a screen can edit a genre, a vibe or a film's name",
  );

  // Two forms — *What do you think?* and *When did you see it?* — both posting to
  // the one write route, and the one kind of field they need: which film it is
  // about, written once and put in both.
  const forms = everywhere.match(/<form\b[^>]*>/g) ?? [];
  assert.equal(forms.length, 2, `unexpected forms:\n${forms.join("\n")}`);
  for (const form of forms) assert.match(form, /method="post"\s+action="\/movie\/choose"/);
  assert.equal((choices.match(/\{film\}/g) ?? []).length, 2, "a form does not say which film it is about");
  assert.deepEqual(
    [...choices.matchAll(/<input type="(\w+)" name="(\w+)"/g)].map((match) => `${match[1]} ${match[2]}`),
    ["hidden title", "hidden year", "hidden from"],
  );

  // Nor anything that deletes, and no other endpoint.
  assert.equal(/\/api\//.test(everywhere), false, "a screen names a write endpoint");
  assert.equal(/<Manage\b|onRemoved/.test(everywhere), false, "a genre or vibe can be deleted here");
  for (const control of ["Edit", "Rename", "Delete", "Add genre", "Add vibe", "New genre", "New vibe"]) {
    assert.equal(
      new RegExp(`>\\s*${control}\\s*<|>${control}</`).test(everywhere),
      false,
      `a screen offers "${control}"`,
    );
  }

  // And the files that held all of it are gone rather than orphaned.
  for (const file of [
    "taste-advanced.tsx",
    "taste-editor.tsx",
    "manage.tsx",
    "taste-view.tsx",
    "vibe-cards.tsx",
  ]) {
    assert.equal(existsSync(new URL(`../../components/${file}`, import.meta.url)), false, `${file} is still in the tree`);
  }
});

test("a vibe's screen carries its name, and nothing to manage it with", () => {
  const heading = enclosing(bodyOf("VibeView", vibeView), "{vibe.name}");
  assert.equal(heading.tag, "h2", "the vibe's name is not its screen's heading");
  assert.equal(
    /<Manage\b|onRemoved|aria-haspopup|<button\b|<form\b/.test(vibeView),
    false,
    "a vibe can be managed on its screen",
  );
  assert.match(bodyOf("VibeView", vibeView), /<BackToStream \/>/, "there is no way back to the Stream");
});

/**
 * No dialog is left.
 *
 * The website used to open a dialog full of film rows from its counts, from a
 * genre's label and from the films in no vibe. All of it is gone, not hidden: a
 * film is opened on its own screen, a vibe on its own, and nothing pops up over
 * either.
 */

test("no dialog is left anywhere, and nothing that drew one", () => {
  const roots = ["app", "components", "lib/web"];
  for (const root of roots) {
    const base = new URL(`../../${root}/`, import.meta.url);
    for (const entry of readdirSync(base, { recursive: true, encoding: "utf8" })) {
      if (!/\.(tsx?|css)$/.test(entry) || /\.test\.ts$/.test(entry)) continue;
      const text = readFileSync(new URL(entry, base), "utf8");
      for (const [what, pattern] of [
        ["a dialog", /<dialog\b|showModal\(|role="dialog"|aria-haspopup="dialog"/],
        ["the old films dialog", /\bChosen\b|\bWayOut\b|\bWAY_IN\b|refocus\.ts|returnTo\(|rescueTo\(|fallbackTo\(/],
        ["a focus fallback for one", /sectionFallback|data-fallback|--color-scrim|backdrop:/],
      ] as [string, RegExp][]) {
        assert.doesNotMatch(text, pattern, `${root}/${entry} has ${what}`);
      }
    }
  }

  for (const file of [
    "components/chosen.tsx",
    "components/way-out.tsx",
    "components/movie-summary.tsx",
    "lib/web/movie-summary.ts",
    "lib/web/refocus.ts",
  ]) {
    assert.equal(existsSync(new URL(`../../${file}`, import.meta.url)), false, `${file} is still in the tree`);
  }
});

/**
 * The Stream's cards, and the two screens they open.
 *
 * What a card is made of and what it leaves out, which part of it is pressed for
 * what, and what a vibe's and a film's screen show. Which films and in which
 * order is `stream.test.ts`; what a URL may choose is `screens.test.ts`; what a
 * film's choices mean is `choices.test.ts`, and what they write `choose.test.ts`.
 */

test("a film's card is its year, how it stands, its title and its vibes, and nothing else", () => {
  const drawn = bodyOf("MovieCard", card);

  // A dark card of its own: the screen's surface, an edge and rounded corners —
  // a thing of its own, not a line in a table.
  const li = drawn.match(/<li className="([^"]*)" data-viewing=\{movie\.viewing\}>/);
  assert.ok(li, "a card is not a list item with a class list of its own, saying where its film stands");
  for (const rule of ["relative", "rounded-xl", "border", "border-rule", "bg-screen"]) {
    assert.ok(li[1].split(/\s+/).includes(rule), `a card has no ${rule}`);
  }

  // The year, quiet and apart from the title, and hidden from a listener: the
  // title's link says it.
  assert.match(
    drawn,
    /<span aria-hidden="true" className="[^"]*text-ink-faint[^"]*tabular-nums[^"]*">\s*\{movie\.year\}\s*<\/span>/,
    "the year is not the quiet aside it should be",
  );
  assert.match(drawn, /<span className="sr-only"> \(\{movie\.year\}\)<\/span>/, "a listener is not told the year");

  // The title, in the display type and larger than anything else on the card.
  assert.match(drawn, /font-display text-\[22px\]/, "the title is not set in the display type");
  const sizes = [...card.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((match) => Number(match[1]));
  assert.equal(Math.max(...sizes), 22, "something on the card is set larger than the title");

  // How it stands, and every vibe it is in — and no line at all for none.
  assert.match(
    drawn,
    /<MovieStatus\s+viewing=\{movie\.viewing\}\s+judgement=\{movie\.position\?\.judgement \?\? null\}/,
    "the status is not the film's own",
  );
  assert.match(drawn, /\{movie\.vibes\.length > 0 && \(/, "a film in no vibe still gets a line");
  assert.match(drawn, /<VibeLinks names=\{names\} cores=\{cores\} label="Vibes:" raised \/>/, "the card names other vibes");

  // And nothing else: no genre, no mark to press, no picture, no date, and no
  // word standing in for a missing vibe.
  for (const [what, pattern] of [
    ["a genre", /genre|<Chip|CHIP|GenreLabels/i],
    ["a mark", /<MovieMark/],
    ["a picture", /<img|Image|poster|backdrop/i],
    ["a synopsis", /synopsis/i],
    ["a date", /createdAt|updatedAt/],
    ["a placeholder for no vibe", /Other movies|No vibe/],
  ] as [string, RegExp][]) {
    assert.doesNotMatch(drawn, pattern, `a card shows ${what}`);
  }
});

test("a card is one link to its film, and only a vibe's name is raised above it", () => {
  const drawn = bodyOf("MovieCard", card);

  // The title is the card's one link, to the film — with the vibe it is listed
  // under as its context on that vibe's screen, and none on the Stream —
  // stretched over the whole card, which carries the focus ring while it has
  // focus.
  assert.equal((drawn.match(/<Link\b/g) ?? []).length, 1, "the card has a second link of its own");
  assert.match(drawn, /<Link\s+href=\{movieHref\(movie, from\)\}\s+prefetch=\{false\}/, "the card's link is not the film's");
  assert.doesNotMatch(bodyOf("StreamView"), /<MovieCards\b[^>]*\bfrom=/, "a card on the Stream is given a vibe");
  assert.match(drawn, /after:absolute after:inset-0/, "the title's link does not cover the card");
  assert.match(drawn, /focus-visible:after:outline-beam/, "the card shows no focus ring");

  // Each name is raised above it, and never the line around them: the ✨, the
  // separators and the gaps fall through to the film.
  const names = bodyOf("VibeLinks", links);
  assert.match(names, /raised \? "relative z-10" : ""/, "a name is not raised above the card's link");
  for (const [, classes] of names.matchAll(/className="([^"]*)"/g)) {
    assert.equal(
      /\brelative\b|\bz-\d/.test(classes),
      false,
      "something around the names is raised, so a press on it no longer opens the film",
    );
  }
});

test("a card reads title, status, then vibes, and shows the year and status first", () => {
  const drawn = bodyOf("MovieCard", card);

  // The order a listener and the keyboard meet the parts in.
  const order = ["<h3", "<MovieStatus", "<VibeLinks"].map((mark) => drawn.indexOf(mark));
  assert.equal(order.some((at) => at === -1), false, "the card is missing one of the three");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "the card is read out of order");

  // And where each is seen, placed by the grid rather than by that order: the
  // year and the status on the top row, the title under them, and the vibes
  // directly under the title.
  assert.match(drawn, /grid grid-cols-\[minmax\(0,1fr\)_auto\]/, "the card is not laid out by a grid");
  assert.match(drawn, /className="col-start-1 row-start-1\b/, "the year is not at the top left");
  assert.match(drawn, /className="col-start-2 row-start-1"/, "the status is not at the top right");
  assert.match(drawn, /<h3 className="col-span-2 row-start-2\b/, "the title is not under the top row");
  assert.match(drawn, /<div className="col-span-2 row-start-3\b/, "the vibes are not directly under the title");
});

test("a status is the marks' own icon and word, and only loved and liked are coloured", () => {
  const drawn = bodyOf("MovieStatus", status);

  // Which facts is `statusOf`'s rule; how each is drawn is the marks' vocabulary,
  // so a card cannot draw a verdict differently from a film's screen.
  assert.match(drawn, /statusOf\(viewing, judgement\)/, "the status decides for itself what to show");
  assert.match(status, /VIEWING\.choices\.find/);
  assert.match(status, /JUDGEMENT\.choices\.find/);
  assert.equal(/from "lucide-react"/.test(status), false, "the status draws icons of its own");

  // An icon and its word: the icon hidden from a listener, the word read.
  assert.match(drawn, /<Icon\s+aria-hidden="true"/, "the icon is read out as well as the word");
  assert.match(drawn, /\{choice\.label\}/, "the status is an icon without its word");

  // Loved in pink, liked in blue, and everything else quiet — disliked included.
  assert.match(status, /loved: "text-loved"/);
  assert.match(status, /liked: "text-liked"/);
  assert.match(drawn, /TONE\[key\] \?\? "text-ink-soft"/, "the other statuses are not quiet");
  assert.equal(/alarm|text-red|disliked:/.test(status), false, "a verdict is drawn as an error");
  for (const token of ["--color-loved:", "--color-liked:", "--color-vibe:"]) {
    assert.ok(globals.includes(token), `${token} is not defined`);
  }

  // Read, never pressed, and nothing of its own: no client code at all.
  for (const [what, pattern] of [
    ["client code", /^"use client";/m],
    ["state", /\buse(State|Effect|Ref)\b/],
    ["a button", /<button\b/],
    ["a handler or a tab stop", /onClick|onKeyDown|tabIndex/],
  ] as [string, RegExp][]) {
    assert.doesNotMatch(status, pattern, `the status has ${what}`);
  }
});

test("a vibe's names are each a link to its screen, behind one violet sparkle", () => {
  const drawn = bodyOf("VibeLinks", links);

  assert.match(drawn, /if \(!names\.length\) return null;/, "no vibes still draws a line");
  assert.match(drawn, /<Sparkles aria-hidden="true"[^>]*text-vibe/, "the sparkle is not the vibe's violet");
  assert.equal((drawn.match(/<Sparkles\b/g) ?? []).length, 1, "a sparkle is drawn per name");

  // Every name, each its own link — never the first and a count.
  assert.match(drawn, /names\.map\(\(name, index\)/, "not every name is drawn");
  assert.match(drawn, /<Link\s+href=\{vibeHref\(name\)\}\s+prefetch=\{false\}/, "a name does not open its vibe");
  assert.match(
    drawn,
    /cores === undefined \|\| cores\.includes\(name\)\s*\? "text-vibe hover:decoration-vibe"/,
    "a name is not in the vibe's violet",
  );
  assert.equal(/slice\(0|\.length - |\bmore\b/.test(drawn), false, "the names are cut to the first and a count");

  // A film's screen names its vibes the same way, in one line like a card's —
  // the one it was reached through first, then the others.
  assert.match(movieView, /const vibes = context === null \? movie\.vibes : \[context, \.\.\.alsoIn\(movie, context\)\];/);
  assert.match(movieView, /<VibeLinks names=\{vibes\} label="Vibes:" \/>/);
  assert.equal((movieView.match(/<VibeLinks\b/g) ?? []).length, 1, "a film's screen names its vibes in two places");
});

test("a card names its film's cores first, in the violet, and its other vibes muted on the same line", () => {
  // Which names, in which order, and which are cores is `coreFirst`, held in
  // `vibes.test.ts`. Pinned here: the card asks it and hands on both answers.
  const drawn = bodyOf("MovieCard", card);
  assert.match(drawn, /const \{ names, cores \} = coreFirst\(movie, vibes\);/, "the card decides its cores for itself");
  assert.match(drawn, /<VibeLinks names=\{names\} cores=\{cores\} label="Vibes:" raised \/>/);

  // A core in the violet the ✨ is in; every other name muted — quiet, and still
  // the readable ink rather than the faint one the separators are in.
  const line = bodyOf("VibeLinks", links);
  assert.match(
    line,
    /cores === undefined \|\| cores\.includes\(name\)\s*\? "text-vibe hover:decoration-vibe"\s*: "text-ink-soft hover:decoration-ink-soft"/,
    "a core and a vibe the film is only in are not told apart, or the second is not muted",
  );

  // The same size for both: set once, on the line, and on no name.
  assert.equal((line.match(/text-\[\d+(?:\.\d+)?px\]/g) ?? []).length, 1, "a name is set in a size of its own");
  assert.match(line, /<p className="[^"]*text-\[13px\]/, "the line has no size of its own");

  // One line, wrapping only where the card is too narrow for it: the ✨ once,
  // then every name with the same · before it — no second line, no connecting
  // word and no second icon between the cores and the rest.
  assert.equal((line.match(/<p\b/g) ?? []).length, 1, "the vibes are split into more than one line");
  assert.match(line, /<p className="flex min-w-0 flex-wrap /, "the line does not wrap");
  assert.equal(
    /<br\b|<div\b|<ul\b|flex-col|basis-full|w-full|\bblock\b/.test(line),
    false,
    "a name is put on a line of its own",
  );
  assert.equal((line.match(/<Sparkles\b/g) ?? []).length, 1, "a second icon");
  assert.equal((line.match(/<(?!\/)[A-Z]\w*/g) ?? []).length, 2, "something other than the ✨ and the names is drawn");
  assert.match(
    line,
    /\{index > 0 && \(\s*<span aria-hidden="true" className="text-ink-faint">\s*·\s*<\/span>\s*\)\}/,
    "a name after the first is not set off by the one separator",
  );
  const words = [...line.matchAll(/>([^<>{}()]+)</g)].map((match) => match[1].trim()).filter(Boolean);
  assert.deepEqual(words, ["·"], "the line says something besides the names and the separator");

  // Only a card passes cores: a film's screen and the vibes with no films keep
  // every name in the violet.
  assert.doesNotMatch(movieView, /cores=/, "a film's screen mutes a vibe");
  assert.doesNotMatch(source, /<VibeLinks\b[^>]*\bcores=/, "the vibes with no films are muted");
});

test("a vibe's screen is its name, its genres, what it means and its films, in that order", () => {
  const drawn = bodyOf("VibeView", vibeView);

  const title = drawn.search(/>\s*\{vibe\.name\}\s*<\/h2>/);
  assert.notEqual(title, -1, "the screen has no heading showing the vibe's name");
  const order = [title, ...["<GenreLabels", "{vibe.instruction}", "<MovieCards"].map((mark) => drawn.indexOf(mark))];
  assert.equal(order.some((at) => at === -1), false, "the screen is missing one of the four");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "the four are out of order");

  // Its films are the Stream's own cards — the same component, not a copy of
  // its markup — and each opens the film with this vibe as the one it was
  // reached through.
  assert.match(
    drawn,
    /<MovieCards movies=\{films\} vibes=\{vibes\} from=\{vibe\.name\} label=\{`Films in \$\{vibe\.name\}`\}/,
    "a vibe's films are not the Stream's cards, or a film opened from here does not know its vibe",
  );
  assert.equal(/<MovieCard\b|<ul\b|<li\b|<Films\b|<Link\b/.test(vibeView), false, "a vibe's screen draws films of its own");
  assert.match(drawn, /No films in this vibe yet\./, "an empty vibe says nothing");

  // The page hands it what the rules that own them work out.
  assert.match(vibePage, /findVibe\(held\.taste\.vibes, single\(query\.name\)\)/);
  assert.match(vibePage, /films=\{filmsIn\(vibe, movies\)\}/);
  assert.match(vibePage, /vibes=\{held\.taste\.vibes\}/, "a vibe's cards cannot tell which vibes their films are the core of");
});

test("a film's screen is its year, its title, its vibes, then what do you think", () => {
  const drawn = bodyOf("MovieView", movieView);

  // The year above the title rather than after it, hidden there from a listener,
  // who hears it as part of the heading.
  assert.match(drawn, /<p aria-hidden="true" className="[^"]*tabular-nums[^"]*">\s*\{movie\.year\}\s*<\/p>/);
  assert.match(
    drawn,
    /<h2 className="[^"]*font-display text-\[36px\][^"]*">\s*\{movie\.title\}\s*<span className="sr-only"> \(\{movie\.year\}\)<\/span>/,
    "the title is not the large heading, with its year said to a listener",
  );
  assert.doesNotMatch(drawn, /\{movie\.title\} \(\{movie\.year\}\)/, "the year is appended to the title");

  // In that order: year, title, vibes, the choices.
  const order = ["{movie.year}", "<h2", "<VibeLinks", "<MovieChoices"].map((mark) => drawn.indexOf(mark));
  assert.equal(order.some((at) => at === -1), false, "the screen is missing one of the four");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "the four are out of order");

  // The choices are given the film's own facts and the way back.
  assert.match(drawn, /viewing=\{movie\.viewing\}\s+judgement=\{movie\.position\?\.judgement \?\? null\}\s+from=\{context\}\s+refused=\{refused\}/);

  // Below them, quietly: their own words beside a standing verdict, and IMDb.
  const choicesAt = drawn.indexOf("<MovieChoices");
  assert.ok(choicesAt < drawn.indexOf("movie.position.because"), "their words are above the choices");
  assert.ok(choicesAt < drawn.indexOf("<Imdb"), "the IMDb link is above the choices");
  assert.match(drawn, /movie\.position\?\.judgement !== undefined && movie\.position\.because !== undefined/);

  // The page hands it the film, the context and a refusal, each chosen by the
  // query and checked against what was read.
  assert.match(moviePage, /findMovie\(movies, single\(query\.title\), single\(query\.year\)\)/);
  assert.match(moviePage, /contextOf\(movie, single\(query\.from\)\)/);
  assert.match(moviePage, /refusalFor\(single\(query\.refused\)\)/);

  // Nothing the film does not hold.
  for (const [what, pattern] of [
    ["a genre", /genre/i],
    ["a synopsis", /synopsis/i],
    ["a picture", /<img|poster|backdrop/i],
    ["a runtime or cast", /\bruntime\b|\bcast\b/i],
    ["an evening", /episode|offer|evening/i],
    ["a placeholder for no vibe", /Other movies|No vibe/],
  ] as [string, RegExp][]) {
    assert.doesNotMatch(drawn, pattern, `a film's screen shows ${what}`);
  }
});

test("what do you think is five buttons, and when did you see it two, each in a form posting to the one write route", () => {
  const drawn = bodyOf("MovieChoices", choices);

  assert.match(drawn, /<h3 id="what-do-you-think"[^>]*>\s*What do you think\?\s*<\/h3>/);
  assert.match(drawn, /<form method="post" action="\/movie\/choose"/, "the choices post somewhere else");

  // The five at the top: each one of them, in their order, sending its own key,
  // and pressed when its fact is what the film stands at.
  assert.match(drawn, /\{CHOICES\.map\(\(choice\) => \{/);
  assert.equal((drawn.match(/<button\b/g) ?? []).length, 2, "a button is drawn outside the two questions");
  assert.equal(/<details\b|<select\b|role="menu"|aria-haspopup/.test(choices), false, "an answer is hidden behind a menu");
  assert.match(drawn, /type="submit"\s+name="choice"\s+value=\{choice\.key\}\s+aria-pressed=\{pressed\}/);
  assert.match(drawn, /const pressed = isPressed\(choice, viewing, judgement\);/);

  // The two below: asked only while the film is seen, under their own heading,
  // in their own form; each sends its own key and is pressed by the viewing.
  const below = drawn.slice(drawn.indexOf("{asksWhen(viewing) && ("));
  assert.ok(below.length > 0 && below.indexOf("{WHEN.map(") > 0, "the second question is not asked only while seen");
  assert.match(below, /<h3 id="when-did-you-see-it"[^>]*>\s*When did you see it\?\s*<\/h3>/);
  assert.match(below, /<form\s+method="post"\s+action="\/movie\/choose"/);
  assert.match(below, /\{WHEN\.map\(\(choice\) => \{/);

  // The icons at the top are the marks' own; loved and liked carry their colours
  // when pressed. Below, the one that stands is green with a check — the only
  // icon there — and the other has none: no eye, no clock.
  assert.match(choices, /JUDGEMENT\.choices\.find/);
  assert.match(choices, /VIEWING\.choices\.find/);
  assert.match(choices, /^import \{ Check \} from "lucide-react";$/m, "the choices draw icons of their own");
  assert.equal(/\b(Eye|EyeOff|History)\b/.test(choices), false, "the choices draw an eye or a clock of their own");
  assert.match(below, /\{pressed && <Check aria-hidden="true"[^>]*\/>\}/, "the pressed answer below is not checked");
  assert.equal((below.match(/<Check\b/g) ?? []).length, 1, "more than the check is drawn below");
  assert.equal(/<Icon\b/.test(below), false, "an answer below draws a mark's icon");
  assert.match(choices, /const SEEN = "border-seen bg-seen\/10 text-seen";/);
  assert.match(below, /pressed \? SEEN : UNPRESSED/);

  // The five above are drawn as they always were; the two below, and their
  // heading, a step smaller and quieter — a follow-up, not a second equal question.
  assert.match(
    choices,
    /const PILL = \[\s*"inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-\[13\.5px\]",/,
    "the five above changed size",
  );
  assert.match(drawn.slice(0, drawn.indexOf("{asksWhen(")), /\[\s*PILL,\s*pressed \? PRESSED\[choice\.key\]/, "the five above are not the top pill");
  assert.match(below, /className=\{\[SMALL_PILL, pressed \? SEEN : UNPRESSED\]\.join\(" "\)\}/, "the two below are not the smaller pill");
  assert.match(below, /<Check aria-hidden="true" size=\{12\}/, "the check is not drawn smaller");
  const small = choices.slice(choices.indexOf("const SMALL_PILL"), choices.indexOf("].join", choices.indexOf("const SMALL_PILL")));
  assert.match(small, /px-\[13px\] py-\[6\.5px\] text-\[11px\]/, "the two below are not about a fifth smaller");
  // A smaller drawing, and the same reach: an invisible ring around each, half the gap.
  assert.match(small, /\brelative\b/);
  assert.match(small, /after:absolute after:-inset-1 after:rounded-full/, "the smaller pill lost its press area");
  assert.match(small, /focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam/);
  assert.match(drawn, /<h3 id="what-do-you-think" className="font-display text-\[20px\] leading-tight text-ink">/);
  assert.match(below, /<h3 id="when-did-you-see-it" className="mt-8 font-display text-\[17px\] leading-tight text-ink-soft">/);
  assert.match(choices, /love: "border-loved bg-loved\/10 text-loved"/);
  assert.match(choices, /like: "border-liked bg-liked\/10 text-liked"/);

  // A refusal is said in fixed words, as an alert; no reason is ever asked for.
  assert.match(drawn, /<p role="alert"[^>]*>\s*\{refusalSentence\(refused\)\}/);
  assert.equal(/<textarea|type="text"|name="because"/.test(choices), false, "a press asks for words");

  // No client code: the browser sends the form, the server answers with the page.
  for (const [what, pattern] of [
    ["client code", /^"use client";/m],
    ["state", /\buse(State|Effect|Ref|Transition)\b/],
    ["a handler", /onClick|onSubmit/],
    ["a request", /\bfetch\s*\(/],
    ["a router", /useRouter|router\./],
  ] as [string, RegExp][]) {
    assert.doesNotMatch(choices, pattern, `the choices have ${what}`);
  }
});

test("the Stream's one filter: include previously seen, under the heading, drawing only, and kept per user", () => {
  // Inside the Stream's own list of films, before the cards: the first thing under
  // *Your movies* and its count, right-aligned, then the cards.
  const films = source.slice(source.indexOf('<div className="stream-films">'), source.indexOf("</Section>"));
  assert.ok(films.length > 0, "the films are not wrapped for the filter");
  const row = films.indexOf('<div className="-mt-4 mb-1 flex justify-end">');
  const box = films.indexOf("<IncludePreviouslySeen saved={includeSeen.saved} readAt={includeSeen.readAt} />");
  const cards = films.indexOf("<MovieCards");
  assert.ok(row >= 0 && row < box && box < cards, "the filter is not right-aligned under the heading, above the first card");

  // The Stream stays a server component with no field of its own: the box is
  // the one piece of it that runs in the browser.
  assert.equal((source.match(/<input\b/g) ?? []).length, 0, "the Stream has a field of its own");
  assert.doesNotMatch(source, /<form\b|^"use client";|\buse(State|Effect)\b|localStorage|document\.cookie|\bfetch\s*\(/m);

  // The label in the user's words, small and quiet, and a press area of 36px.
  assert.match(filter, /<label className="inline-flex min-h-9 cursor-pointer items-center gap-2 px-1 text-\[12px\] text-ink-soft">/);
  assert.match(filter, /\/>\s*Include previously seen\s*<\/label>/);

  // Opens as this user left it — what the server read, unless this tab pressed
  // it since — and a press keeps the new answer. Never controlled, and never a
  // form. Which answer wins, and when a press is sent, is behaviour, tested in
  // `stream-settings/browser.test.ts`.
  const at = filter.indexOf("<input");
  const input = filter.slice(at, filter.indexOf("/>", at) + 2);
  assert.match(input, /id="include-previously-seen"/);
  assert.match(input, /type="checkbox"/);
  assert.match(input, /defaultChecked=\{box\.opening\(saved, readAt\)\}/, "the filter does not open as it was left");
  // Drawn again in place from a new read, the box is a new element, or it would
  // keep the old answer: a changed `defaultChecked` does not reach one already drawn.
  assert.match(input, /\bkey=\{readAt\}/, "a Stream read again in place keeps the old answer");
  assert.match(input, /onChange=\{\(event\) => box\.keep\(event\.currentTarget\.checked\)\}/);
  assert.doesNotMatch(input, /\bname=|\bchecked=|\bform=/, "the filter is controlled, or posts as a form");
  assert.equal((filter.match(/<input\b/g) ?? []).length, 1, "the filter has another field");
  assert.match(page, /readIncludeSeen\(visitor\)/, "the Stream does not read the kept answer");
  assert.match(page, /<StreamView taste=\{held\.taste\} standing=\{held\.standing\} includeSeen=\{includeSeen\} \/>/);

  // What a press keeps is its answer, through the one sender for it — sent
  // before the page goes when it is hidden — and nothing in the browser.
  assert.match(filter, /^"use client";/m);
  assert.match(filter, /const box = keeper\(post\);/);
  assert.match(filter, /if \(document\.visibilityState === "hidden"\) box\.flush\(\);/, "a waiting press is lost when the page closes");
  assert.doesNotMatch(filter, /\bfetch\s*\(|<form\b|localStorage|sessionStorage|document\.cookie|useRouter|router\./);

  // Every film is still handed over, in the order `stream` gives — the filter
  // draws less, it never orders or fetches a film.
  assert.match(films, /<MovieCards movies=\{stream\(movies\)\} vibes=\{taste\.vibes\} label="Your movies, most recently saved first" \/>/);
  assert.match(card, /<li className="[^"]*" data-viewing=\{movie\.viewing\}>/, "a card does not say where its film stands");

  // Unticked, exactly the films seen before are not drawn — on the Stream only.
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const rule = css.match(/([^{}]*#include-previously-seen[^{}]*)\{([^}]*)\}/);
  assert.ok(rule, "nothing hides a film when the filter is unticked");
  assert.equal(
    rule[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(),
    '.stream-films:has(#include-previously-seen:not(:checked)) [data-viewing="seen-before"]',
  );
  assert.equal(rule[2].trim(), "display: none;", "the filter does more than hide");
});

test("the new screens have nothing to press but links, and a film's answers", () => {
  // The Stream's one filter is a component of its own, pinned above, and not
  // one of these.
  for (const [name, file] of NEW) {
    // Its forms and their buttons are the answers, pinned above; what it must
    // not have is pinned there too.
    if (name === "movie-choices.tsx") continue;
    for (const [what, pattern] of [
      ["a button", /<button\b/],
      ["a menu", /role="menu"|aria-haspopup="menu"/],
      ["a handler", /\bon(Click|KeyDown|Submit|Change)=/],
      ["a form or a field", /<form\b|<input\b|<textarea\b|<select\b/],
      ["client code", /^"use client";/m],
      ["a router", /useRouter|router\./],
      ["a request", /\bfetch\s*\(/],
      ["a management control", /<Manage\b|onRemoved|>\s*(Delete|Edit|Rename|Save)\s*</],
    ] as [string, RegExp][]) {
      assert.doesNotMatch(file, pattern, `${name} has ${what}`);
    }
  }

  // Every way to a screen is a link that fetches nothing ahead of a press: a
  // prefetch of a private page is a private render nobody asked for.
  for (const [name, file] of NEW) {
    const all = (file.match(/<Link\b/g) ?? []).length;
    const quiet = (file.match(/<Link\b[^>]*?prefetch=\{false\}/g) ?? []).length;
    assert.equal(quiet, all, `${name} has a link that prefetches`);
  }
});

/**
 * The element one piece of JSX is written inside, as the browser will build it.
 *
 * The nearest tag opened before the marker, with its attributes and what it
 * holds — so an assertion can be about a wrapper's element and its attributes
 * rather than about the shape of the source around them. Which line a prop is
 * written on, and in what order, is then not something a test can fail on.
 *
 * `classes` is the class list as words, taken from a plain string or a template
 * literal, because both are ways the components write one.
 */
function enclosing(
  body: string,
  marker: string,
): { tag: string; attributes: string; contents: string; classes: string[] } {
  const at = body.indexOf(marker);
  assert.notEqual(at, -1, `no ${marker} in the component`);

  // The last element opened before it. Matched only where a tag name really
  // follows, so that a `<` in a comment or a comparison is not one.
  const opens = [...body.slice(0, at).matchAll(/<([A-Za-z][\w.]*)(?=[\s/>])/g)];
  const open = opens.at(-1);
  assert.ok(open, `${marker} is not inside an element`);

  // The end of the opening tag, skipping any `>` that belongs to a string or to
  // an expression written in a prop.
  let depth = 0;
  let quote = "";
  let end = -1;
  for (let i = open.index + open[0].length; i < at; i += 1) {
    const char = body[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) {
      end = i;
      break;
    }
  }
  assert.notEqual(end, -1, `the element around ${marker} has no opening tag`);

  const attributes = body.slice(open.index + open[0].length, end);
  const closed = body.indexOf(`</${open[1]}>`, end);
  const written = attributes.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/);
  return {
    tag: open[1],
    attributes,
    contents: body.slice(end + 1, closed === -1 ? body.length : closed),
    classes: (written?.[1] ?? written?.[2] ?? "").split(/\s+/).filter(Boolean),
  };
}

/**
 * One function out of the source, so a check cannot match the wrong one.
 *
 * Ends at the next declaration *or* the next doc comment, whichever comes first —
 * without the second, a function would swallow the prose introducing the one
 * after it, and a check for the word "poster" would fail on a comment promising
 * there are none.
 */
function bodyOf(name: string, file: string = source): string {
  // A generic component declares `function Name<T>(`, so the parameter list is
  // not always what follows the name.
  const start = file.search(new RegExp(`function ${name}(?:<[^>]*>)?\\(`));
  assert.notEqual(start, -1, `no ${name}() in the component`);

  const rest = file.slice(start);
  const ends = ["\n/**", "\nfunction "].map((mark) => rest.indexOf(mark, 1)).filter((at) => at > 0);
  return ends.length ? rest.slice(0, Math.min(...ends)) : rest;
}
