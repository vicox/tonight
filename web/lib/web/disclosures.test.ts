import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * What Tonight tells the public it stores, held to what it actually stores.
 *
 * The privacy policy, the terms and the README each state as fact what is and is
 * not kept. Those are factual disclosures about a hosted service rather than
 * copy, so a schema change that makes one of them false is a defect in the same
 * way a wrong column type is — and a silent one, because no user-visible
 * behaviour changes when a policy goes out of date.
 *
 * The `taste` v4 migration is what made this a test. It added films, watched and
 * liked, and all three pages said none of those existed. What survives that
 * change is as important as what breaks: no catalogue, no lookup, no
 * recommendation history, no watch timeline, no scored ratings. Both halves are
 * pinned below — the false claims must be gone, and the true ones must still be
 * there to be weakened later by accident.
 *
 * Grep-shaped on purpose. A snapshot of three long documents would fail on every
 * comma and teach nobody anything.
 */

const PAGES = {
  privacy: new URL("../../app/privacy/page.tsx", import.meta.url),
  terms: new URL("../../app/terms/page.tsx", import.meta.url),
  readme: new URL("../../../README.md", import.meta.url),
};

/** One document, whitespace collapsed, so a claim is found however it is wrapped. */
function text(page: keyof typeof PAGES): string {
  return readFileSync(PAGES[page], "utf8").replace(/\s+/g, " ");
}

test("no page still claims that no film is stored", () => {
  // Each of these was true before v4 and is false after it. They are matched as
  // the sentences they were, because the point is that these exact assurances
  // were given and have to have been withdrawn.
  const withdrawn: [keyof typeof PAGES, string][] = [
    ["privacy", "no watch history, no ratings"],
    ["privacy", "There is no table for any of this"],
    ["privacy", "stores no film records"],
    ["terms", "nothing about what you watch"],
    ["terms", "no viewing history"],
    ["readme", "owns no film data"],
    ["readme", "records nothing about what was recommended or watched"],
  ];

  for (const [page, claim] of withdrawn) {
    assert.equal(text(page).includes(claim), false, `${page} still says "${claim}"`);
  }
});

test("every page says what a film record now holds", () => {
  // Title, year, an optional IMDb id, watched, liked, and which mixes it is in.
  // Said in each document's own register rather than in one shared sentence,
  // which is why these are the parts rather than the whole.
  const privacy = text("privacy");
  assert.match(privacy, /Films you tell it about/);
  assert.match(privacy, /the title and release year you gave/);
  assert.match(privacy, /an optional IMDb title id/);

  // The whole distinction: five explicit states, plus no state at all, and the
  // two are not the same thing. Anything vaguer and a reader cannot tell what a
  // film with nothing said about it is recorded as.
  assert.match(privacy, /The state is a single answer, and there are five of them/);
  for (const state of ["not seen", "seen", "liked", "loved", "disliked"]) {
    assert.match(privacy, new RegExp(`<em>${state}</em>`), `${state} is not named`);
  }
  assert.match(privacy, /means you watched it and said nothing about it — it is not a verdict/);
  assert.match(privacy, /A film may also have no state at all/);
  assert.match(privacy, /It is different from <em>not seen<\/em>, which is something you said/);

  // The legacy tri-state wording is gone, and so is the duplicated word.
  assert.equal(privacy.includes("yes, no, and nothing said"), false, "legacy tri-state wording");
  assert.equal(privacy.includes("hold three answers"), false, "legacy tri-state wording");
  assert.equal(privacy.includes("Liked and Liked"), false, "the duplicated word is back");
  assert.doesNotMatch(privacy, /whether you (have )?watched it, whether you liked it/);
  assert.match(privacy, /The state is a single answer, and there are five of them/);
  assert.match(privacy, /which of your mixes it is in/);

  assert.match(text("terms"), /the films you have told it about/);
  assert.match(text("readme"), /an optional IMDb id, the one state they gave it/);
});

test("a state is disclosed as a state, never as a history", () => {
  // The distinction the whole schema turns on: Tonight knows *that* a film was
  // watched and has no way to know when, how often, or in what order. Losing this
  // sentence would leave a reader assuming a viewing log exists.
  assert.match(text("privacy"), /A state, never a history/);
  assert.match(text("privacy"), /not when, how often, or in what order/);
  assert.match(text("readme"), /never a sequence of events/);
});

test("what is still true is still claimed", () => {
  // Every one of these survived v4 unchanged, and each is a promise somebody
  // might rely on. They are pinned so that correcting a policy cannot quietly
  // drop one along the way.
  const surviving: [keyof typeof PAGES, RegExp][] = [
    ["privacy", /no scored or star ratings/],
    ["privacy", /no record of what was recommended/],
    ["privacy", /Nor does it keep a film catalogue/],
    ["privacy", /is ever looked up from a movie database/],
    ["privacy", /stored as a pointer and never followed/],
    ["privacy", /queries no film catalogue or search service/],
    ["terms", /no record of what was recommended/],
    ["terms", /nothing about them is looked up/],
    ["readme", /no film exists here until somebody names one/],
  ];

  for (const [page, claim] of surviving) {
    assert.match(text(page), claim, `${page} no longer promises ${claim}`);
  }
});

test("what an assistant may fetch is disclosed as the whole model, films included", () => {
  // An MCP client receives the taste model in full. Saying it receives "your
  // genres and mixes" understated it the moment v4 shipped, and a reader
  // deciding whether to authorize a client has to be told what actually crosses.
  const privacy = text("privacy");
  assert.match(privacy, /may <strong>request<\/strong> your taste model/);
  assert.match(privacy, /returns <strong>all<\/strong> of it/);
  assert.match(privacy, /every film you have saved/);
  assert.match(privacy, /the one state you gave it/);
});

test("the website is disclosed as a view of the model, arranged its own way", () => {
  // The page shows every object the endpoint returns, grouped its own way: films
  // under the mixes they are in, the rest under "Other movies", instructions one
  // click away. A reader deciding whether to authorize a client needs the
  // difference stated as arrangement rather than as omission.
  const privacy = text("privacy");
  assert.match(privacy, /the same model this website shows you, arranged differently/);
  assert.match(privacy, /lists the rest under/);
  assert.match(privacy, /Other movies/);
  assert.equal(
    privacy.includes("the same content you see on this website"),
    false,
    "privacy still equates the MCP answer with the page",
  );

  // And the page does not edit everything it shows. It sets a film's two marks
  // and nothing else about a film, which a reader exercising a right of
  // rectification has to be told accurately in both directions: what they can
  // change here, and what only an assistant can.
  assert.match(privacy, /lets you set that state/);
  assert.match(privacy, /changing its title or year, and removing it are done through your assistant/);
  assert.match(text("terms"), /set the state of a film/);
  assert.match(text("terms"), /adding or removing one is done through your assistant/);
  assert.match(text("readme"), /a Movie's state can be set there/);
  assert.match(text("readme"), /everything else about a Movie is done through an assistant/);

  // The README has to agree with itself. It said the website "shows the whole
  // model" one paragraph above saying a Movie in no Mix is not on it, and only
  // the second of those is true.
  const readme = text("readme");
  assert.equal(
    readme.includes("shows the whole model"),
    false,
    "the README still claims the website shows the whole model",
  );
  assert.match(readme, /shows a Mix-oriented view of the model/);
  assert.match(readme, /a Movie in no Mix is listed under \*Other movies\*/);
  assert.match(readme, /the website is a view of it, not the definition of it/);
});

test("retention covers the films and their state, not only genres and mixes", () => {
  assert.match(
    text("privacy"),
    /your genres, your mixes, and the films you saved along with the state you gave each/,
  );
  assert.match(text("terms"), /genres, mixes, and the films you saved with the state you gave each/);
});

test("the README no longer describes names as relational identity", () => {
  // v2 and v3 moved every relationship onto private uuids. The README went on
  // saying a Genre's name was its primary key and that a rename cascaded through
  // the reference rows, which is how this class of staleness happens: nothing
  // fails when prose about the schema stops matching the schema.
  const readme = text("readme");

  for (const stale of ["the name of a Genre is its primary key", "ON UPDATE CASCADE"]) {
    assert.equal(readme.includes(stale), false, `the README still says "${stale}"`);
  }

  assert.match(readme, /every object has a private uuid, and a public name the user may change/);
  assert.match(readme, /A Mix holds the Genre's uuid rather than its name/);
  assert.match(readme, /Every relation is keyed `\(user_id, id\)`/);
});

test("no page promises there are no ratings without saying which kind", () => {
  // Liked and disliked are stored, so a bare "no ratings" is now misleading even
  // though no score is kept anywhere. The precise claim is the only honest one.
  for (const page of ["privacy", "terms", "readme"] as const) {
    for (const [, phrase] of text(page).matchAll(/no ((?:\w+ ){0,3}?)ratings/g)) {
      assert.match(phrase, /scored|star/, `${page} says "no ${phrase}ratings" without qualifying it`);
    }
  }
});
