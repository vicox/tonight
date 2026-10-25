import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The public page, held to what it says.
 *
 * It leads with one line in Tonight's own voice, shows one example reply, and says
 * what Tonight keeps and where it runs. What is pinned here is that the approved
 * words stay, that the headline is the only line that reaches beyond what the
 * product does today, and that nothing of the old scripted conversation comes back.
 *
 * Grep-shaped, like `disclosures.test.ts`: a snapshot of the markup would fail on
 * every class name and say nothing about the page.
 */

const WEB = fileURLToPath(new URL("../../", import.meta.url));
const SELF = relative(WEB, fileURLToPath(import.meta.url));

const read = (path: string) => readFileSync(join(WEB, path), "utf8");

/** Whitespace collapsed, so a sentence is found however JSX happens to wrap it. */
const collapsed = (source: string) => source.replace(/\s+/g, " ");

/** Source with its comments taken out, so only what renders is judged. */
const uncommented = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The headline, word for word. Evocative on purpose and chosen by the product's
 * owner: Tonight does not think about anybody between conversations today, and
 * this is the one line on the page allowed to sound as if it did.
 */
const HEADLINE = "Your next movie is already on my mind.";

/**
 * The `Landing` function in `app/page.tsx`, and nothing after it.
 *
 * The same file renders the signed-in page, so a check against the whole file
 * would pass on something only the other branch renders.
 */
function landing(): string {
  const page = read("app/page.tsx");
  const start = page.indexOf("function Landing()");
  assert.ok(start >= 0, "app/page.tsx has no Landing");
  const end = page.indexOf("\n}\n", start);
  assert.ok(end > start, "Landing does not end where it is expected to");
  return page.slice(start, end + 2);
}

/** Every file under `app/`, `components/` and `lib/`, as paths relative to `web/`. */
function sources(): string[] {
  return ["app", "components", "lib"].flatMap((dir) =>
    readdirSync(join(WEB, dir), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(WEB, join(entry.parentPath, entry.name))),
  );
}

test("the landing page says what it was approved to say", () => {
  const page = collapsed(uncommented(landing()));

  assert.match(
    page,
    /<h2 id="landing-promise"[^>]*> Your next movie is already on my mind\. <\/h2>/,
    "the headline is not the approved line, or is not the heading",
  );

  for (const words of [
    "Your personal movie AI. It remembers what you love, understands why, and helps you find what to watch next.",
    "Example, shortened: a reply in ChatGPT or Claude, with Tonight connected",
    "Anything for tonight?",
    "A little surprise for tonight.",
    "You loved Arrival for its quiet tension and the way its mystery slowly unfolds. I think Moon might be right up your alley. It has that same feeling of something bigger hiding beneath the surface.",
    "Or give me a mood and I’ll aim closer.",
    "Your taste. Your movie nights. Your AI.",
    "Tonight remembers the movies you love and what makes them special to you. So every recommendation feels a little more like you.",
    "Your personal movie AI, inside ChatGPT and Claude.",
  ]) {
    assert.ok(page.includes(words), `the landing page no longer says "${words}"`);
  }
});

test("the headline is the only line that reaches past today", () => {
  const page = collapsed(uncommented(landing()));

  // Exactly once: the exemption below is for the headline, not for the phrase.
  assert.equal(page.split(HEADLINE).length - 1, 1, "the headline is not on the page exactly once");
  const rest = page.replace(HEADLINE, "");

  // Tonight answers when it is asked; nothing runs between conversations, nothing
  // reminds anybody of anything, and the closed beta's data is kept until the beta
  // ends. So none of that is said literally anywhere else — and an evening is
  // written down without a yes, so no blanket promise about saving is made either.
  assert.doesNotMatch(
    rest,
    /on my mind|already know|before you ask|in the background|between (our )?conversations|while you|remind|notification|check(s|ing)? in|for years|every movie night|saves? nothing|nothing is saved|unless you say so/i,
  );
});

test("the example is an example, and nothing on the page can be typed into", () => {
  const page = uncommented(landing());

  const figure = page.slice(page.indexOf("<figure"), page.indexOf("</figure>"));
  assert.ok(figure.length > 0, "the example is not a figure");
  assert.match(figure, /<figcaption[^>]*>\s*Example,/, "the example is not captioned as one");
  assert.ok(
    collapsed(figure).includes("I think Moon might be right up your alley."),
    "the reply sits outside the example",
  );

  // The person in the example is invented. So the reply names none of their Vibes
  // and puts no words in their mouth: its reason for Arrival is said, not quoted.
  // Judged on the text alone, so the quotes around attribute values do not count.
  const said = collapsed(figure.replace(/<[^>]*>/g, " "));
  for (const vibe of ["Space Tension", "Popcorn Chaos", "Small Town Secrets", "Quiet Dread"]) {
    assert.equal(said.includes(vibe), false, `the example names the Vibe ${vibe}`);
  }
  assert.doesNotMatch(said, /you said/i, "the example attributes words to the person");
  assert.doesNotMatch(said, /[“”"]/, "the example quotes somebody");

  // The website has no chat. A message that looked like a text box would invite
  // somebody to type into a page that cannot answer.
  for (const control of ["<form", "<input", "<textarea", "<button"]) {
    assert.equal(page.includes(control), false, `Landing renders a ${control}`);
  }
});

test("the example card is a Stream movie card", () => {
  const page = uncommented(landing());
  const figure = page.slice(page.indexOf("<figure"), page.indexOf("</figure>"));
  const classes = (source: string) => source.split(/\s+/).filter(Boolean);
  const card = read("components/movie-card.tsx");

  // The surface, read from the movie card itself, so the two cannot drift: its
  // corners, its border, its background and its padding. Not its hover, which
  // belongs to something that opens a film.
  const tile = classes(card.match(/<li className="([^"]*)"/)?.[1] ?? "");
  const surface = tile.filter((name) => /^(rounded-|border|bg-|p[xy]-)/.test(name));
  assert.deepEqual(surface, ["rounded-xl", "border", "border-rule", "bg-screen", "px-5", "py-4"]);
  const shell = classes(figure.match(/<figure\b[^>]*className="([^"]*)"/)?.[1] ?? "");
  for (const name of surface) {
    assert.ok(shell.includes(name), `the example card is not ${name}, as a movie card is`);
  }

  // The heading is set exactly as a movie card's title is.
  const title = "font-display text-[22px] leading-tight break-words text-ink";
  assert.ok(card.includes(`"${title}"`), "the movie card's title is no longer set this way");
  assert.equal(figure.match(/<h3\b[^>]*className="([^"]*)"/)?.[1], title);

  // Only the colours a movie card's own text and surface use, plus the app's
  // violet for Tonight's name (below): no amber, no pink, no blue. The card's year
  // is `ink-faint`, which is 3.37:1 on `screen`, so it is not used here either.
  // Every text-, bg- and border- class in the card is a size, the bare border, or
  // one of those — so Tailwind's own palette (`text-purple-500`) is out too.
  const utilities = [...figure.matchAll(/className="([^"]*)"/g)]
    .flatMap((match) => classes(match[1]))
    .map((name) => name.replace(/^(?:[a-z0-9-]+:)+/, ""))
    .filter((name) => /^(?:text|bg|border)(?:-|$)/.test(name));
  for (const name of utilities) {
    assert.ok(
      /^text-\[\d+(?:\.\d+)?px\]$/.test(name) ||
        ["border", "text-ink", "text-ink-soft", "bg-screen", "border-rule", "text-vibe"].includes(name),
      `the example card uses ${name}, which a movie card's text and surface do not`,
    );
  }

  // The one accent: Tonight's name, in the app's violet with its ✨, as a Vibe
  // link draws them — and nowhere else on the card.
  assert.equal(utilities.filter((name) => name === "text-vibe").length, 1, "violet is used more than once");
  assert.match(figure, /<dt className="[^"]*\btext-vibe\b[^"]*">\s*<Sparkles aria-hidden="true"[^>]*\/>\s*Tonight\s*<\/dt>/);

  // At the top of its turn, as You is at the top of theirs. A flex label in a
  // row that stretches would centre itself beside a long reply.
  assert.match(figure, /<dt className="[^"]*\bself-start\b[^"]*\btext-vibe\b[^"]*">/, "Tonight is not top-aligned");

  // No colour of the page's own: every colour on it is a theme token. Arbitrary
  // sizes such as `text-[32px]` are fine; an arbitrary colour is not.
  assert.doesNotMatch(page, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
});

test("the page is structured and readable", () => {
  const page = landing();

  // `Tonight` in the shared header is the page's one h1. Under it: the headline
  // and the closing section as h2s, and the example's own heading as an h3.
  assert.equal(page.match(/<h1\b/g), null, "Landing has an h1 of its own");
  assert.equal(page.match(/<h2\b/g)?.length, 2, "Landing does not have exactly two h2s");
  assert.equal(page.match(/<h3\b/g)?.length, 1, "the example does not have exactly one heading");

  // Each labelled part points at something that is there: a label pointing at
  // nothing names the part nothing.
  const labels = [...page.matchAll(/aria-labelledby="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["landing-promise", "landing-example", "landing-taste"]);
  for (const label of labels) {
    assert.match(page, new RegExp(`id="${label}"`), `nothing has the id ${label}`);
  }

  // `ink-faint` is 3.37:1 on `screen`, under WCAG's 4.5:1 for text this size. The
  // footer's line is older than this page and shared in style with the header;
  // nothing new is set in it.
  assert.equal(page.match(/text-ink-faint/g)?.length, 1, "new text is set in ink-faint");
  assert.match(page, /text-ink-faint">Closed beta\./);
});

test("it keeps the way in and the way out", () => {
  const page = landing();

  assert.match(page, /<SiteHeader>\s*<SignIn \/>\s*<\/SiteHeader>/, "sign-in is not in the header");
  assert.match(page, /<LegalLinks \/>/, "the legal links are gone");
  assert.match(page, /Closed beta\./, "the closed beta is no longer said");

  // The tagline belongs to the shared header, not to this page.
  assert.match(read("components/site-header.tsx"), /Movies That Get You\./);
});

test("the scripted conversation is gone, and nothing is left of it", () => {
  for (const path of [
    "components/worked-examples.tsx",
    "lib/worked-examples.ts",
    "lib/worked-examples.test.ts",
  ]) {
    assert.equal(existsSync(join(WEB, path)), false, `${path} is back`);
  }

  // This file names the deleted paths in order to check they are gone, and is
  // the one file allowed to.
  const mentions = sources().filter(
    (path) => path !== SELF && /worked-examples|WorkedExamples|WORKED_EXAMPLES/.test(read(path)),
  );
  assert.deepEqual(mentions, [], "something still refers to the worked examples");

  // A page with nothing that moves has no reason to be a client component, a
  // carousel, or a live region.
  const page = read("app/page.tsx");
  for (const leftover of ["conversation →", "aria-roledescription", "aria-live", '"use client"']) {
    assert.equal(page.includes(leftover), false, `app/page.tsx still has ${leftover}`);
  }
});
