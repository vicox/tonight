import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { RETIRED_SCHEMAS } from "../db/retired.ts";
import { ALL_SCHEMAS } from "../db/schemas.ts";
import { tonightMcpServer } from "../mcp/server.ts";

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

/**
 * Any text with its emphasis taken off.
 *
 * A prohibition written against the raw file is a prohibition on one way of
 * typing the sentence. `A Movie carries one *state*` says exactly what `one
 * state` says, and it walked past this guard once already; `_state_` and
 * `<em>state</em>` would have done the same. So markdown markers and the inline
 * tags these pages use come off before anything is matched.
 *
 * Underscores are the one careful case. `_state_` is emphasis and `not_seen` is
 * a stored spelling, so only underscores that bracket a run of text between
 * non-word characters are removed — which leaves `not_seen` intact and visible
 * to the guard that forbids it.
 */
function stripped(document: string): string {
  return document
    .replace(/<\/?(?:em|strong|code|b|i)>/g, "")
    .replace(/[*`]/g, "")
    .replace(/(^|[^\w])_([^_\n]+)_(?![\w])/g, "$1$2")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ");
}

/** One document with its emphasis taken off. */
function plain(page: keyof typeof PAGES): string {
  return stripped(readFileSync(PAGES[page], "utf8"));
}

/**
 * The legacy Movie contract, found by what it says rather than how it is typed.
 *
 * The old model gave a film **one** value drawn from a vocabulary that mixed
 * watching with opinion: seen, not seen, liked, loved, disliked, nothing said.
 * That is the claim that must be impossible to make on a public page, and it is
 * the same claim in any order, in any emphasis, and with any of the six words
 * left out — so matching a fixed sentence is matching one typing of it.
 *
 * What is looked for instead, per sentence: a film or a movie, at least one of
 * the watching words, and at least two of the three judgements. Two rather than
 * three because `seen, liked, loved` is the same contract with a word missing;
 * a film and one judgement is not, because *"a film you loved"* is an ordinary
 * true sentence and forbidding it would forbid the product.
 *
 * Returns the offending sentence, so a failure names what it found rather than
 * saying a pattern matched somewhere.
 */
const WATCHING = /\b(?:not[ _-]?seen|unseen|seen)\b/i;
const JUDGEMENTS = [/\bliked\b/i, /\bloved\b/i, /\bdisliked\b/i];
const ABOUT_A_FILM = /\b(?:movie|movies|film|films)\b/i;

function legacyMovieContract(document: string): string | null {
  // Split on full stops only. A colon is where this claim habitually puts its
  // list — `one state: seen, loved, liked` — so treating it as a break would cut
  // the sentence in half and lose the subject the guard is looking for.
  for (const sentence of stripped(document).split(/(?<=[.?!])\s+/)) {
    if (!ABOUT_A_FILM.test(sentence)) continue;
    if (!WATCHING.test(sentence)) continue;
    if (JUDGEMENTS.filter((one) => one.test(sentence)).length < 2) continue;
    return sentence.trim();
  }
  return null;
}

/** The same document unwrapped, for the one claim that is a table. */
function lines(page: keyof typeof PAGES): string {
  return readFileSync(PAGES[page], "utf8");
}

/** Every tool the server registers, which is what a document about them owes. */
const TOOL_NAMES = Object.keys(
  (
    tonightMcpServer({ user: { id: "google:someone" }, reference: "ref" } as never) as unknown as {
      _registeredTools: Record<string, unknown>;
    }
  )._registeredTools,
);

/** How a count reads in prose, for the small numbers a document spells out. */
function numberWord(count: number): string {
  const words: Record<number, string> = { 11: "eleven", 19: "nineteen", 20: "twenty", 21: "twenty-one", 22: "twenty-two", 23: "twenty-three", 26: "twenty-six", 27: "twenty-seven", 28: "twenty-eight" };
  return words[count] ?? String(count);
}

test("no page still claims that no film is stored", () => {
  // Each of these was true before v4 and is false after it. They are matched as
  // the sentences they were, because the point is that these exact assurances
  // were given and have to have been withdrawn.
  const withdrawn: [keyof typeof PAGES, string][] = [
    ["privacy", "an evening is history, not taste"],
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

  // The whole distinction, on the axis the film actually carries: two explicit
  // answers about watching, plus nothing at all, and the three are not the same
  // thing. Anything vaguer and a reader cannot tell what a film nobody has
  // spoken about is recorded as.
  assert.match(privacy, /it has three answers/);
  for (const viewing of ["seen", "not seen"]) {
    assert.match(privacy, new RegExp(`<em>${viewing}</em>`), `${viewing} is not named`);
  }
  assert.match(privacy, /That last one is a fact and not an opinion/);
  assert.match(privacy, /Nothing at all is what a film starts as/);
  assert.match(privacy, /it is different from <em>not seen<\/em>, which is\s+something you said/);

  // And the opinion is disclosed as its own thing, because it is stored as one:
  // a policy that described only the film would under-describe what is kept.
  assert.match(privacy, /What you thought of a film/);
  for (const judgement of ["liked", "loved", "disliked"]) {
    assert.match(privacy, new RegExp(`<em>${judgement}</em>`), `${judgement} is not named`);
  }
  for (const refusal of ["not tonight", "not ever"]) {
    assert.match(privacy, new RegExp(`<em>${refusal}</em>`), `${refusal} is not named`);
  }
  assert.match(privacy, /records your own words for why if you gave them/);
  assert.match(privacy, /Verdicts keep their history, and you can take one back/);
  // The promise the refactor makes true, said where somebody can rely on it,
  // and precise about all three halves of it. A withdrawal takes out *that
  // verdict*; it reaches as far as that verdict reached, so an evening's
  // refusal taken back leaves a general opinion where it was; and "you said
  // nothing" is false about somebody who spoke and then took it back.
  assert.match(privacy, /Withdrawing one takes <strong>that verdict<\/strong> out of what currently applies/);
  assert.match(privacy, /reaches exactly as far as the verdict did/);
  assert.match(privacy, /still standing/);
  assert.match(privacy, /does not unsay it/);
  assert.match(privacy, /still part of what Tonight remembers/);
  assert.doesNotMatch(
    privacy,
    /withdrawing one leaves you having said nothing/i,
    "a withdrawal is disclosed as never having spoken",
  );
  // And not the scope-blind claim this replaced: a withdrawal that always left
  // "no current opinion" on the film is false of a scoped one.
  assert.doesNotMatch(
    privacy,
    /Withdrawing one leaves <strong>no current opinion<\/strong>/,
    "a withdrawal is disclosed as reaching every scope",
  );
  assert.match(privacy, /Neither reaches the film itself/);

  // The legacy wording is gone, all of it.
  assert.equal(privacy.includes("yes, no, and nothing said"), false, "legacy tri-state wording");
  assert.equal(privacy.includes("hold three answers"), false, "legacy tri-state wording");
  assert.equal(privacy.includes("Liked and Liked"), false, "the duplicated word is back");
  assert.doesNotMatch(privacy, /whether you (have )?watched it, whether you liked it/);
  assert.doesNotMatch(privacy, /there are five of them|the one state you gave/i, "the five states");
  assert.match(privacy, /which of your mixes it is in/);

  assert.match(text("terms"), /the films you have told it about/);
  assert.match(text("readme"), /whether they said they watched it/);
  assert.doesNotMatch(text("readme"), /the one state they gave it/, "the README still says state");
});

test("a state is disclosed as a state, never as a history", () => {
  // The distinction the whole schema turns on: Tonight knows *that* a film was
  // watched and has no way to know when, how often, or in what order. Losing this
  // sentence would leave a reader assuming a viewing log exists.
  assert.match(text("privacy"), /Whether, never when/);
  assert.match(text("privacy"), /not when, how often, or in what order/);
  // And the verdict's own instant says what it is the instant *of*, so a reader
  // does not take it for a viewing time.
  assert.match(text("privacy"), /when you spoke rather than when you watched/);
  assert.match(text("readme"), /never a sequence of events/);
});

test("what is still true is still claimed", () => {
  // Every one of these survived v4 unchanged, and each is a promise somebody
  // might rely on. They are pinned so that correcting a policy cannot quietly
  // drop one along the way.
  const surviving: [keyof typeof PAGES, RegExp][] = [
    ["privacy", /no scored or star ratings/],
    ["privacy", /Anything you do not say stays <em>unknown<\/em>/],
    ["privacy", /Nor does it keep a film catalogue/],
    ["privacy", /is ever looked up from a movie database/],
    ["privacy", /stored as a pointer and never followed/],
    ["privacy", /queries no film catalogue or search service/],
    ["terms", /that record is history rather\s+than taste/],
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
  assert.match(privacy, /whether you have said you watched it/);
  assert.match(privacy, /everything you have said about\s+particular films/);
});

test("the website is disclosed as a narrower view than the MCP answer, not the same thing rearranged", () => {
  // The claim this replaces said the page showed the same model, arranged
  // differently. It does not, and `lib/web/judgements.ts` is where it stops
  // being true: positions are joined onto saved Movies by `filmKey`, occasion
  // scoped claims are dropped, and only what stands is read. So three stored
  // things never reach the page, and a reader deciding whether to authorize a
  // client — or believing they can audit their data here — has to be told which.
  const privacy = text("privacy");
  assert.match(privacy, /shows you less than that/);
  assert.match(privacy, /a view of your data rather than\s+the same answer rearranged/);
  assert.match(privacy, /lists the rest under/);
  assert.match(privacy, /Other movies/);

  // Each omission named, because a general "less" tells a reader nothing about
  // whether the thing they are looking for should be here.
  assert.match(privacy, /a verdict about a film you never saved/, "the verdict-only film is not named");
  assert.match(privacy, /belongs to an evening rather than to the film/, "the scoped refusal is not named");
  assert.match(privacy, /a verdict you replaced or took back/, "the superseded and withdrawn are not named");
  assert.match(privacy, /evenings Tonight recorded are not on it/, "the evenings are not named");

  // And the other half, which is what makes the omission lawful rather than a
  // quiet loss: none of it is deleted, and it is still covered here.
  assert.match(privacy, /None of that is deleted, hidden from you, or outside this policy/);

  // The equivalence claims, in both the shapes they have taken.
  assert.equal(
    privacy.includes("the same content you see on this website"),
    false,
    "privacy still equates the MCP answer with the page",
  );
  assert.equal(
    privacy.includes("the same model this website shows"),
    false,
    "privacy still equates the MCP answer with the page",
  );

  // And the page does not edit everything it shows. It sets a film's two marks
  // and nothing else about a film, which a reader exercising a right of
  // rectification has to be told accurately in both directions: what they can
  // change here, and what only an assistant can.
  assert.match(privacy, /lets you say whether you have seen a film and what you thought of it/);
  assert.match(privacy, /changing its title or year, and removing it are done through your assistant/);
  assert.match(text("terms"), /say whether you have seen it and what you thought of it/);
  assert.match(text("terms"), /adding or removing one is done through your assistant/);
  assert.match(text("readme"), /whether a film has been seen and what the user thought of it can be set there/);
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

test("the terms overview names the model the rest of the terms describe", () => {
  // The overview defined the model as genres, mixes and films, and said
  // recommending reads "your genres and mixes". Both were written before
  // verdicts existed, and the data section further down had already been
  // corrected — so the document disagreed with itself about what is stored and
  // about what crosses to an assistant.
  const terms = text("terms");
  assert.match(terms, /what you thought of a film/, "the overview still omits verdicts");
  assert.match(terms, /kept separately from the film/, "the overview does not say a verdict is its own root");
  assert.match(terms, /the only\s+place an opinion is stored/);
  assert.match(terms, /It also records the evenings it took part in/, "the overview omits episodes");

  // And what recommending reads is not overstated in either direction.
  assert.match(terms, /the films\s+you saved, and the verdicts that currently stand/);
  assert.equal(
    terms.includes("it reads your genres and mixes and brings"),
    false,
    "the terms still say a recommendation reads only genres and mixes",
  );
});

test("the no-profile claim says what is actually true", () => {
  // "No behavioural profile of any kind" stopped being accurate the moment
  // Tonight could persist a pattern it noticed. The narrower claim is the one
  // the product keeps: nothing is recorded from how the service is used, and
  // nothing Tonight works out on its own reaches a recommendation unasked.
  const privacy = text("privacy");
  assert.equal(
    privacy.includes("no behavioural profile of any kind"),
    false,
    "privacy still claims there is no behavioural profile of any kind",
  );
  assert.match(privacy, /no profile built from how you use it/);
  assert.match(privacy, /nothing is recorded from what you click, when\s+you visit or how often/);
  assert.match(
    privacy,
    /nothing Tonight works out on its own becomes part of what it\s+recommends without your say-so/,
  );
});

test("every durable root the application opens is named in the retention promise", () => {
  // The guard that would have caught this one. A new store means a new kind of
  // record kept against a user, and the retention paragraphs have to grow with
  // it — so the list is derived from the schemas the deployment actually
  // migrates rather than from memory.
  const promised: Record<string, RegExp> = {
    taste: /your genres; your mixes/,
    episodes: /the evenings Tonight recorded/,
    verdicts: /every verdict you gave/,
    // Sign-in and connection data is disclosed in its own section rather than
    // in the taste-model retention list, and named here so it is not thought
    // missing.
    oauth: /Sign-in and connection data/,
    web: /Sign-in and connection data/,
  };

  const terms = text("terms");
  const privacy = text("privacy");
  for (const [module, claim] of Object.entries(promised)) {
    assert.ok(
      claim.test(terms) || claim.test(privacy),
      `${module} is stored and no public page says what happens to it`,
    );
  }

  // The retired modules are the other half of the same guard. They stay in the
  // catalog so a deployment runs the migration that drops their tables, and
  // they hold nothing afterwards — so they must be promised nothing, and a
  // module that is neither promised nor retired is a store nobody disclosed.
  const retired = RETIRED_SCHEMAS.map((schema) => schema.module);
  assert.deepEqual(
    [...Object.keys(promised), ...retired].sort(),
    ALL_SCHEMAS.map((schema) => schema.module).sort(),
    "a schema is deployed that this disclosure guard does not know about",
  );
});

test("nothing Tonight thought of by itself is promised anywhere, because none is kept", () => {
  // Tonight used to keep the questions it was carrying and the readings it had
  // written, and both were disclosed. They are gone: what it thinks while it is
  // talking to somebody is conversation, and conversation is not stored. A page
  // still describing that storage would be promising a retention for tables
  // that no longer exist — a false statement about what is held, which is worse
  // than a missing one.
  for (const page of ["terms", "privacy"] as const) {
    const said = text(page);
    for (const gone of [
      /an <em>observation<\/em>|a reading of its own is (?:stored|kept)/i,
      /what Tonight noticed or offered/i,
      /question it is waiting to ask/i,
      /stored against your account, with what was noticed/i,
    ]) {
      assert.doesNotMatch(said, gone, `${page} still describes storage that was removed`);
    }
  }

  // And each says outright that it is not kept, so a reader is told rather than
  // left to notice an absence.
  const privacy = text("privacy");
  assert.match(privacy, /What Tonight thinks is not stored at all/i);
  assert.match(privacy, /lives in the conversation you are having and\s+ends with it/i);
  assert.match(privacy, /nothing enters your data unless you say so/i);
});

test("retention covers the films, what was said about them, and the evenings recorded", () => {
  // "What you have said about each" tied a verdict's retention to a saved film,
  // and a verdict does not need one — it is its own root, so a film nobody saved
  // can carry one, and a retention promise that reached only as far as the
  // library would have been silent about it. Episodes were missing outright.
  const privacy = text("privacy");
  assert.match(privacy, /Everything Tonight holds about you/);
  assert.match(privacy, /everything you have said about a film whether or not that film is one\s+you saved/);
  assert.match(privacy, /the evenings Tonight recorded/);
  assert.equal(
    privacy.includes("the films you saved along with what you have said about each"),
    false,
    "retention still reads a verdict as something a saved film carries",
  );
  // M1 added episodes and M2 added verdicts, so what is kept until deletion grew
  // twice. A retention promise that named less than is stored would be the wrong
  // half of the truth.
  // The terms listed "the films you saved, what you said about them", which read
  // a verdict as something a saved film carries. It is its own root, so it is
  // named in its own right and its retention does not depend on a Movie.
  const terms = text("terms");
  assert.match(terms, /kept in its own\s+right/);
  assert.match(terms, /your genres; your mixes; the films you saved/);
  assert.match(terms, /every verdict you gave, <strong>whether or not the film it is about is one you\s+saved<\/strong>/);
  assert.match(terms, /the evenings Tonight recorded/);
  assert.equal(
    terms.includes("the films you saved, what you said about them"),
    false,
    "the terms still read a verdict as something a saved film carries",
  );
});

test("no page claims the website shows everything that is stored", () => {
  // The terms said Tonight makes all of it "available to you on this website and
  // to an assistant", which is false of the website and contradicted the privacy
  // policy's own account of what the page leaves out. The two now agree, and the
  // equivalence is guarded on both so neither can drift back alone.
  const terms = text("terms");
  assert.match(terms, /An assistant you connect over MCP can read all of it. This website shows you\s+part of it/);
  assert.match(terms, /a verdict about a film you never\s+saved is not on it/);
  assert.match(terms, /nor the evenings Tonight recorded/);
  assert.match(terms, /still\s+stored, still yours, and still covered by the same retention and deletion terms/);
  assert.equal(
    terms.includes("available to you on this website and to"),
    false,
    "the terms still say everything stored is available on the website",
  );

  // Privacy says the same thing in its own words, and neither page may say the
  // page and the MCP answer are the same data.
  for (const page of ["privacy", "terms"] as const) {
    assert.doesNotMatch(
      text(page),
      /(?:all|everything|the whole)[^.]{0,60}(?:available|shown|visible)[^.]{0,30}on this website/i,
      `${page} claims the website exposes everything stored`,
    );
  }
});

test("no page says a withdrawal leaves silence whatever its scope was", () => {
  // The README said taking a Verdict back "leaves silence", which is true of a
  // global judgement and false of an evening's refusal — withdrawing that leaves
  // a global judgement applying exactly where it was. The unqualified claim is
  // what must not come back; the qualified one is asserted beside it so the
  // prohibition cannot be satisfied by saying nothing at all.
  for (const page of ["privacy", "terms", "readme"] as const) {
    assert.doesNotMatch(
      plain(page),
      /(?:taking|withdrawing)[^.]{0,60}back[^.]{0,40}leaves silence/i,
      `${page} describes a withdrawal as leaving silence whatever its scope`,
    );
  }

  const readme = text("readme");
  assert.match(readme, /reaches exactly\s+as far as the act did/);
  assert.match(readme, /no weaker opinion is revealed underneath it in that scope/);
  assert.match(readme, /a\s+withdrawn evening's `not-tonight` leaves a global judgement applying where it was/);
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

test("the legacy six-state Movie contract cannot come back to any public page", () => {
  // A blanket guard rather than one assertion per sentence. The old model said a
  // film carried *one* answer out of five, with a sixth meaning nothing was
  // said, and every page described it that way. Each phrasing below was in one
  // of them; any of them returning to any of them fails here, whatever else
  // the page says correctly.
  const legacy: [RegExp, string][] = [
    [/\bnot_seen\b/, "the stored spelling of the old unseen state"],
    [/\bone state\b/i, "a film described as carrying one state"],
    [/there are five of them/i, "the five-value enumeration"],
    [/a sixth (possibility|state)/i, "the sixth-possibility framing"],
    [/movie'?s state|film'?s state/i, "state as a property of a film"],
    [/set (the |that )?state/i, "setting a state as an operation"],
    [/state you gave/i, "a state as something the user gave a film"],
    // And the shape of the old enum, whichever order it is written in: a film
    // cannot carry a judgement any more, so a page listing one beside the
    // viewing answers is describing the model that was replaced.
    [/<em>(liked|loved|disliked)<\/em>[^<]{0,40}<em>(seen|not seen)<\/em>/i, "an opinion listed as a viewing answer"],
    [/<em>(seen|not seen)<\/em>[^<]{0,40}<em>(liked|loved|disliked)<\/em>/i, "a viewing answer listed as an opinion"],
    [/\bcarr(?:y|ies|ying) (?:one |a |its )?state\b/i, "a film described as carrying a state"],
  ];

  // Against the document as written **and** with its emphasis stripped. The
  // second is the one that matters: every phrase above is a claim about the
  // model, and none of them stops being that claim because a word is in italics.
  for (const page of ["privacy", "terms", "readme"] as const) {
    for (const [pattern, what] of legacy) {
      assert.doesNotMatch(text(page), pattern, `${page}: ${what}`);
      assert.doesNotMatch(plain(page), pattern, `${page}: ${what}, with the formatting taken off`);
    }

    // And the contract itself, found by what a sentence says.
    const found = legacyMovieContract(readFileSync(PAGES[page], "utf8"));
    assert.equal(found, null, `${page} describes a film as carrying one combined state: ${found}`);
  }
});

test("the legacy-contract matcher catches the claim however it is written", () => {
  // The probe for the guard above, and it runs through the **same** function
  // that reads the three documents — an earlier version proved a separate
  // `/one state/` regex instead, which said nothing about whether the matcher
  // used on the pages could fail.
  //
  // Each of these is the same contract: one value a film carries, drawn from a
  // vocabulary that mixes watching with opinion. The orders differ, the emphasis
  // differs, the wrapper word differs, and one leaves a value out.
  const contracts = [
    "A Movie carries one state — not seen, seen, liked, loved, disliked, or nothing said.",
    "A Movie carries one *state* — not seen, seen, liked, loved, disliked, or nothing said.",
    "A Movie carries one _state_: seen, loved, liked, disliked, not seen, or nothing said.",
    "A Movie carries one <em>state</em>: loved, disliked, seen, liked, not seen, nothing said.",
    "Each film holds a single answer: liked, loved, or seen.",
    "A film&rsquo;s status is one of seen, not_seen, liked, loved or disliked.",
  ];
  for (const sentence of contracts) {
    assert.ok(
      legacyMovieContract(sentence) !== null,
      `the matcher does not catch: ${sentence}`,
    );
  }

  // And the sentences the product actually needs, which must stay sayable. Each
  // is true of the model as it is now, and a guard that failed one of these
  // would be a guard nobody could write a policy under.
  const allowed = [
    "A Movie has a title and a release year, and it may carry a viewing: seen, not seen, or nothing said either way.",
    "A verdict is something you said about one film: that you liked, loved or disliked it.",
    "Liked, loved and disliked are things you said about a film, not a rating scale.",
    "A film you have seen and loved is still a film you loved.",
  ];
  for (const sentence of allowed) {
    assert.equal(
      legacyMovieContract(sentence),
      null,
      `the matcher forbids a true sentence: ${sentence}`,
    );
  }
});

test("every public page describes the split rather than one multiplexed field", () => {
  // The positive half of the guard above: removing the old sentences is not the
  // same as saying the new thing, and a page could pass the prohibition by
  // describing nothing at all.
  const privacy = text("privacy");
  assert.match(privacy, /whether you have watched it/);
  assert.match(privacy, /a fact and not an opinion/);
  assert.match(privacy, /What you thought of a film/);
  assert.match(privacy, /Kept separately from the film itself/);

  // The README names both roots and what each holds.
  const readme = text("readme");
  assert.match(readme, /a \*\*viewing\*\*: seen, not seen, or nothing said either way/);
  assert.match(readme, /\*\*Verdicts\*\* are what you thought/);
  assert.match(readme, /Nothing else anywhere holds an opinion/);

  // And the terms name what is retained, on both axes.
  assert.match(text("terms"), /whether you have said you watched each/);
  assert.match(text("terms"), /what you have said about particular films/);
});

test("the README documents the tools the server actually offers", () => {
  // It claimed eleven for a long time and the surface was twenty-two. A count in
  // prose drifts silently; this reads the table and the server together.
  const readme = text("readme");
  const documented = [...lines("readme").matchAll(/^\| `([a-z_]+)` \|/gmu)].map((row) => row[1]!);
  assert.ok(documented.length > 0, "the tool table is gone");

  assert.match(readme, new RegExp(String.raw`\b${numberWord(documented.length)}\b`, "iu"));
  assert.deepEqual(
    [...documented].sort(),
    [...TOOL_NAMES].sort(),
    "the documented tools are not the tools the server registers",
  );
});
