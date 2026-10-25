import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The public page, held to what it says.
 *
 * It leads with one line in Tonight's own voice, shows one example reply, and says
 * plainly what is here today and what is not yet. What is pinned here is that the
 * approved words stay, that the headline is the only line that reaches beyond what
 * the product does today, and that nothing of the old scripted conversation comes
 * back.
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
    "An AI that gets to know you, remembers what moves you, and helps make your movie nights better.",
    "Example, shortened: a reply in ChatGPT or Claude, with Tonight connected",
    "Anything for tonight?",
    "A surprise, from your Space Tension. You loved Arrival — “it trusts you to keep up,” you said — so I’d start with Moon: one man, one station, and a quiet puzzle that rewards exactly that kind of attention.",
    "Or give me a mood and I’ll aim closer.",
    "Today, in closed beta",
    "Tonight works inside the AI assistant you already use, like ChatGPT or Claude. Ask for a film, and it draws on what it keeps: your films, what you thought of them, your Vibes. Sign in to see your films and Vibes.",
    "Where it’s going",
    "An AI that takes care of your movie nights, not only when you ask. Not available yet.",
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
  assert.ok(collapsed(figure).includes("I’d start with Moon"), "the reply sits outside the example");

  // The website has no chat. A message that looked like a text box would invite
  // somebody to type into a page that cannot answer.
  for (const control of ["<form", "<input", "<textarea", "<button"]) {
    assert.equal(page.includes(control), false, `Landing renders a ${control}`);
  }
});

test("the page is structured and readable", () => {
  const page = landing();

  // `Tonight` in the shared header is the page's one h1; the headline sits under it.
  assert.equal(page.match(/<h1\b/g), null, "Landing has an h1 of its own");
  assert.equal(page.match(/<h2\b/g)?.length, 1, "Landing does not have exactly one heading");

  // Each labelled part points at something that is there: a label pointing at
  // nothing names the part nothing.
  const labels = [...page.matchAll(/aria-labelledby="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["landing-promise", "landing-example"]);
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
