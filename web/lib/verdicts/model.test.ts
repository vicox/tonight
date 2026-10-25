import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  current,
  filmKey,
  JUDGEMENTS,
  MAX_REASON_LENGTH,
  MAX_TITLE_LENGTH,
  NOT_A_VERDICT,
  stateVerdict,
  supersession,
  VerdictError,
  withdrawVerdict,
  type Act,
  type Film,
} from "./model.ts";

/**
 * The verdict model, held to the sentence it exists to make true: only the user
 * has an opinion about a film, and Tonight never acquires one.
 *
 * As in M1, most of these contracts are about what the model refuses to express.
 * A verdict that can only come from a user statement is worth nothing if a
 * caller can reach the same belief by another route, so the tests try the
 * routes — an agent claimant, an observed provenance, a refusal quietly
 * becoming a dislike, an evening quietly narrowing a claim, a withdrawal quietly
 * becoming a neutral value, and a malformed object walking straight past the
 * constructors into the history functions.
 */

const prisoners: Film = { title: "Prisoners", year: 2013 };
const zodiac: Film = { title: "Zodiac", year: 2007 };
const TUESDAY = { occasion: "evening-1" };

const loved = (at = "2026-01-01T20:00:00.000Z", film = prisoners) =>
  stateVerdict(film, { about: "judgement", judgement: "loved" }, "volunteered", at);

const judged = (judgement: string, at: string, because?: unknown) =>
  stateVerdict(prisoners, { about: "judgement", judgement, because }, "volunteered", at);

/* ----------------------------------------------------- the claim and its facets */

test("a verdict carries every facet a Claim is required to identify", () => {
  const verdict = loved();
  assert.deepEqual(Object.keys(verdict).sort(), [
    "assertion",
    "at",
    "claimant",
    "film",
    "said",
    "scope",
    "told",
  ]);
  assert.equal(verdict.claimant, "user");
  assert.deepEqual(verdict.film, prisoners);
  assert.equal(verdict.told, "volunteered");
  assert.equal(verdict.at, "2026-01-01T20:00:00.000Z");
});

test("the scope is stated rather than left out", () => {
  assert.equal(loved().scope, "everywhere");
  assert.equal(withdrawVerdict(prisoners, "2026-01-02T20:00:00.000Z").scope, "everywhere");
});

test("only the user claims a verdict, and there is no second claimant", () => {
  assert.equal(loved().claimant, "user");
  assert.equal(withdrawVerdict(prisoners, "2026-01-02T20:00:00.000Z").claimant, "user");
  const fromTheAgent = { ...loved(), claimant: "agent" } as unknown as Act;
  assert.throws(() => current([fromTheAgent]), VerdictError);
});

/* ------------------------------------------------------------------ the texture */

test("how they came to say it is kept, because the two are not equal evidence", () => {
  assert.equal(loved().told, "volunteered");
  assert.equal(judged("liked", "2026-01-01T20:00:00.000Z").told, "volunteered");
  assert.equal(
    stateVerdict(prisoners, { about: "judgement", judgement: "liked" }, "confirmed", "2026-01-01T20:00:00.000Z").told,
    "confirmed",
  );
});

test("a verdict cannot be observed or derived, only said", () => {
  for (const provenance of ["observed", "derived", "inferred", "", null, undefined]) {
    assert.throws(
      () => stateVerdict(prisoners, { about: "judgement", judgement: "loved" }, provenance, "2026-01-01T20:00:00.000Z"),
      VerdictError,
      `${String(provenance)} was accepted as a way a verdict came to be`,
    );
  }
});

/* --------------------------------------------------------------- what is claimed */

test("only the three states that carry an opinion are judgements", () => {
  assert.deepEqual([...JUDGEMENTS], ["liked", "loved", "disliked"]);
  for (const notAnOpinion of ["seen", "unseen", null, "watched", "finished"]) {
    assert.throws(
      () => judged(notAnOpinion as string, "2026-01-01T20:00:00.000Z"),
      VerdictError,
      `${String(notAnOpinion)} was accepted as a judgement`,
    );
  }
});

test("turning a film down is not a verdict, and the refusal says where it goes instead", () => {
  // The shapes a caller who learned the old surface would send. Each is refused
  // with the one sentence that routes it — never read as `disliked`, which says
  // they watched it, and never dropped into the nearest valid shape.
  for (const refusal of [
    { about: "rejection", rejection: { reach: "not-ever", reason: null } },
    { about: "rejection", rejection: { reach: "not-tonight", reason: "too long" } },
    { about: "judgement", judgement: "disliked", rejection: { reach: "not-ever", reason: null } },
  ]) {
    assert.throws(
      () => stateVerdict(prisoners, refusal, "volunteered", "2026-01-01T20:00:00.000Z"),
      (error: unknown) => error instanceof VerdictError && error.message === NOT_A_VERDICT,
      `${JSON.stringify(refusal)} was not refused as a refusal`,
    );
  }
  assert.match(NOT_A_VERDICT, /dont-want-to-see/u, "the refusal does not say where a turn-down goes");
});

/* ------------------------------------------------- an evening is not a scope */

test("a claim naming an evening is refused rather than widened", () => {
  // A claim that arrived scoped to one evening was meant to apply only there;
  // quietly making it global would widen what somebody said. Both constructors,
  // and both with a well-formed evening — the refusal is about there being no
  // such scope, not about the evening being malformed.
  assert.throws(
    () => stateVerdict(prisoners, { about: "judgement", judgement: "loved" }, "volunteered", "2026-01-01T20:00:00.000Z", TUESDAY),
    VerdictError,
    "a judgement was accepted for one evening",
  );
  assert.throws(
    () => withdrawVerdict(prisoners, "2026-01-01T20:00:00.000Z", TUESDAY),
    VerdictError,
    "a taking-back was accepted for one evening",
  );
});

/* ------------------------------ finding 2 — the user's explanation is theirs, kept */

test("a judgement keeps the user's explanation verbatim", () => {
  const verdict = judged("loved", "2026-01-01T20:00:00.000Z", "  the tension never lets up  ");
  assert.deepEqual(verdict.assertion, {
    about: "judgement",
    judgement: "loved",
    because: "the tension never lets up",
  });
});

test("no explanation is an explicit absence, not a missing field", () => {
  for (const silent of [null, undefined]) {
    const verdict = judged("liked", "2026-01-01T20:00:00.000Z", silent);
    assert.equal("because" in verdict.assertion, true, "the facet went missing");
    assert.equal((verdict.assertion as { because: string | null }).because, null);
  }
});

test("the explanation does not change what was judged", () => {
  const bare = judged("loved", "2026-01-01T20:00:00.000Z");
  const explained = judged("loved", "2026-01-01T20:00:00.000Z", "it earns its length");
  assert.equal((bare.assertion as { judgement: string }).judgement, "loved");
  assert.equal((explained.assertion as { judgement: string }).judgement, "loved");
});

test("an explanation Tonight worked out for itself cannot get in", () => {
  // An agent-authored reason is an Observation, and §2 says an Observation may
  // never become a Verdict without a user act. There is nowhere to put one: the
  // facet takes the user's words and refuses every richer shape.
  for (const notTheirWords of [
    { text: "you always like slow films", generated: true },
    { source: "agent", words: "derived from your history" },
    ["inferred"],
    42,
    true,
  ]) {
    assert.throws(
      () => judged("loved", "2026-01-01T20:00:00.000Z", notTheirWords),
      VerdictError,
      `${JSON.stringify(notTheirWords)} was accepted as their explanation`,
    );
  }
  for (const empty of ["", "   ", "x".repeat(MAX_REASON_LENGTH + 1)]) {
    assert.throws(() => judged("loved", "2026-01-01T20:00:00.000Z", empty), VerdictError);
  }
});

/* ------------------------- finding 3 — the history functions check the whole claim */

test("a malformed act is refused wherever it came from", () => {
  // These never went through a constructor. A type annotation is not a check,
  // and the history functions are a boundary rather than an internal step.
  const sound = loved("2026-01-01T20:00:00.000Z");
  const malformed: Record<string, unknown>[] = [
    { ...sound, told: "observed" },
    { ...sound, told: "derived" },
    { ...sound, assertion: { about: "judgement", judgement: "adored", because: null } },
    { ...sound, assertion: { about: "judgement", judgement: "seen", because: null } },
    { ...sound, assertion: { about: "nonsense" } },
    { ...sound, assertion: { about: "rejection", rejection: { reach: "maybe", reason: null } } },
    { ...sound, assertion: { about: "rejection", rejection: { reach: "not-tonight", reason: null } } },
    { ...sound, assertion: { about: "judgement", judgement: "loved", because: { generated: true } } },
    { ...sound, assertion: { about: "judgement", judgement: "loved", because: "" } },
    { ...sound, scope: { occasion: "" } },
    { ...sound, scope: { occasion: 7 } },
    { ...sound, scope: "somewhere" },
    { ...sound, scope: TUESDAY },
    { ...sound, at: "whenever" },
    { ...sound, at: "2026-01-01" },
    { ...sound, at: "2026-01-01T20:00:00" },
    { ...sound, at: 20260101 },
    { ...sound, film: { title: "", year: 2013 } },
    { ...sound, film: { title: "Prisoners", year: 2013.5 } },
    { ...sound, said: "opinion" },
    { said: "withdrawal", claimant: "user", film: prisoners, scope: "everywhere", at: "2026-01-01T20:00:00.000Z", told: "volunteered" },
    { said: "withdrawal", claimant: "user", film: prisoners, scope: "everywhere", at: "2026-01-01T20:00:00.000Z", assertion: { about: "judgement", judgement: "loved", because: null } },
    { said: "withdrawal", claimant: "user", film: prisoners, scope: "nowhere", at: "2026-01-01T20:00:00.000Z" },
    { said: "withdrawal", claimant: "user", film: prisoners, scope: TUESDAY, at: "2026-01-01T20:00:00.000Z" },
    { said: "withdrawal", claimant: "user", film: prisoners, scope: "everywhere", at: "nope" },
  ];
  for (const act of malformed) {
    assert.throws(
      () => current([act as unknown as Act]),
      VerdictError,
      `current accepted ${JSON.stringify(act)}`,
    );
    assert.throws(
      () => supersession([act as unknown as Act]),
      VerdictError,
      `supersession accepted ${JSON.stringify(act)}`,
    );
  }
});

test("a well-formed act still passes the boundary unchanged", () => {
  const verdict = loved("2026-01-01T20:00:00.000Z");
  assert.deepEqual(current([verdict]), verdict);
});

test("acts about different films are refused rather than quietly filtered", () => {
  const acts = [loved("2026-01-01T20:00:00.000Z", prisoners), loved("2026-03-01T20:00:00.000Z", zodiac)];
  assert.throws(() => current(acts), VerdictError);
  assert.throws(() => supersession(acts), VerdictError);
});

/* --------------------------- finding 4 — instants, not strings; and a stable order */

test("the same instant written two ways is one instant", () => {
  const utc = loved("2026-01-01T20:00:00.000Z");
  const offset = loved("2026-01-01T21:00:00+01:00");
  assert.equal(utc.at, offset.at, "equivalent offsets did not canonicalise to one value");
  assert.equal(utc.at, "2026-01-01T20:00:00.000Z");
});

test("chronological order is right across timezone offsets", () => {
  // Lexicographically "2026-01-01T21:00:00+01:00" sorts after
  // "2026-01-01T20:30:00Z", and chronologically it comes first.
  const earlier = stateVerdict(prisoners, { about: "judgement", judgement: "loved" }, "volunteered", "2026-01-01T21:00:00+01:00");
  const later = stateVerdict(prisoners, { about: "judgement", judgement: "disliked" }, "volunteered", "2026-01-01T20:30:00Z");
  assert.deepEqual(current([earlier, later]), later);
  assert.deepEqual(current([later, earlier]), later);
  assert.deepEqual(supersession([later, earlier]), [{ verdict: earlier, by: later }]);
});

test("reversing the list cannot change which verdict stands", () => {
  const first = loved("2026-01-01T20:00:00.000Z");
  const second = judged("disliked", "2026-03-01T20:00:00.000Z");
  const third = withdrawVerdict(prisoners, "2026-05-01T20:00:00.000Z");
  const acts = [first, second, third];
  const backwards = [...acts].reverse();
  assert.deepEqual(current(acts), current(backwards));
  assert.deepEqual(supersession(acts), supersession(backwards));
});

test("at the same instant, the one written later stands", () => {
  // The order the store accepted them in, not the content. A correction made
  // inside one millisecond is still a correction.
  const first = { ...judged("loved", "2026-01-01T20:00:00.000Z"), order: 1 } as unknown as Act;
  const second = { ...judged("disliked", "2026-01-01T20:00:00.000Z"), order: 2 } as unknown as Act;
  assert.equal((current([first, second]) as { assertion: { judgement: string } }).assertion.judgement, "disliked");
  assert.equal((current([second, first]) as { assertion: { judgement: string } }).assertion.judgement, "disliked");
  assert.deepEqual(supersession([second, first]), [{ verdict: first, by: second }]);
});

test("a written order beats the content fallback, never the other way round", () => {
  // Content ordering would put "confirmed" before "volunteered" and make the
  // first claim stand. The written order says otherwise, and it wins.
  const first = { ...loved("2026-01-01T20:00:00.000Z"), order: 7 } as unknown as Act;
  const second = {
    ...stateVerdict(prisoners, { about: "judgement", judgement: "liked" }, "confirmed", "2026-01-01T20:00:00.000Z"),
    order: 8,
  } as unknown as Act;
  assert.equal((current([first, second]) as { assertion: { judgement: string } }).assertion.judgement, "liked");
});

test("an act carrying a written order sorts after one that does not", () => {
  const legacy = loved("2026-01-01T20:00:00.000Z");
  const later = { ...judged("disliked", "2026-01-01T20:00:00.000Z"), order: 1 } as unknown as Act;
  assert.equal((current([later, legacy]) as { assertion: { judgement: string } }).assertion.judgement, "disliked");
});

test("a write order nobody could have been given is refused", () => {
  // The store allocates it. Anything else means the row did not come from there.
  for (const forged of [0, -1, 1.5, "2", true, {}]) {
    assert.throws(
      () => current([{ ...loved("2026-01-01T20:00:00.000Z"), order: forged } as unknown as Act]),
      VerdictError,
      `${JSON.stringify(forged)} was accepted as a write order`,
    );
  }
});

test("a verdict built here carries no write order", () => {
  // It is the store's to give, so no constructor produces one — a claim that
  // carried its own would be a claim whose author chose its place in history.
  assert.equal("order" in loved(), false);
  assert.equal("order" in withdrawVerdict(prisoners, "2026-01-01T20:00:00.000Z"), false);
});

test("two claims at the very same instant resolve the same way every time", () => {
  // Arbitrary but stable: whoever hands the history over, and in whatever order,
  // gets one answer. A sequence number would be less arbitrary and belongs to a
  // store this slice does not have.
  const a = judged("loved", "2026-01-01T20:00:00.000Z");
  const b = judged("disliked", "2026-01-01T20:00:00.000Z");
  const one = current([a, b]);
  const other = current([b, a]);
  assert.deepEqual(one, other, "equal instants resolved by the caller's order");
  assert.deepEqual(supersession([a, b]), supersession([b, a]));
});

test("supersession follows the same order current does", () => {
  const first = loved("2026-01-01T21:00:00+01:00");
  const second = judged("liked", "2026-02-01T20:00:00.000Z");
  const stands = current([second, first]);
  assert.deepEqual(stands, second);
  assert.deepEqual(supersession([second, first]), [{ verdict: first, by: second }]);
});

/* ------------------------------------------------------------- temporal standing */

test("nothing said means no verdict, which is not a verdict of any kind", () => {
  assert.equal(current([]), null);
});

test("the latest verdict is the one that stands", () => {
  const first = loved("2026-01-01T20:00:00.000Z");
  const second = judged("liked", "2026-03-01T20:00:00.000Z");
  assert.deepEqual(current([first, second]), second);
  assert.deepEqual(supersession([first, second]), [{ verdict: first, by: second }]);
  assert.deepEqual(supersession([first]), []);
});

test("a withdrawal leaves no verdict rather than a neutral one", () => {
  const acts = [loved("2026-01-01T20:00:00.000Z"), withdrawVerdict(prisoners, "2026-03-01T20:00:00.000Z")];
  assert.equal(current(acts), null, "a withdrawal left something behind");
  for (const judgement of JUDGEMENTS) {
    assert.notDeepEqual(current(acts), { about: "judgement", judgement });
  }
});

test("withdrawing the latest verdict does not revive an earlier one", () => {
  const acts = [
    loved("2026-01-01T20:00:00.000Z"),
    judged("liked", "2026-02-01T20:00:00.000Z"),
    withdrawVerdict(prisoners, "2026-03-01T20:00:00.000Z"),
  ];
  assert.equal(current(acts), null);
});

test("a verdict can be given again after a withdrawal", () => {
  const taken = withdrawVerdict(prisoners, "2026-01-01T20:00:00.000Z");
  const again = loved("2026-03-01T20:00:00.000Z");
  assert.deepEqual(current([taken, again]), again);
});

/* -------------------------------------------------------------------- the naming */

test("a verdict is about a film named by title and year", () => {
  for (const notAFilm of [null, "Prisoners", { title: "Prisoners" }, { year: 2013 }, { title: "  ", year: 2013 }, { title: "Prisoners", year: 2013.5 }]) {
    assert.throws(
      () => loved("2026-01-01T20:00:00.000Z", notAFilm as Film),
      VerdictError,
      `${JSON.stringify(notAFilm)} was accepted as a film`,
    );
  }
  assert.equal(loved("2026-01-01T20:00:00.000Z", { title: "  Prisoners  ", year: 2013 }).film.title, "Prisoners");
  assert.throws(
    () => loved("2026-01-01T20:00:00.000Z", { title: "x".repeat(MAX_TITLE_LENGTH + 1), year: 2013 }),
    VerdictError,
  );
});

/* ------------------------------------------------------------------ the boundary */

test("there is no route from something that happened to something they think", async () => {
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("model.ts", import.meta.url), "utf8"),
  );
  const code = source.replace(/\/\*\*[\s\S]*?\*\//gu, "").replace(/^[ \t]*\/\/.*$/gmu, "");

  // Everything except one neighbour. `../films/` is how a film is named, and it
  // is neutral by construction: it depends on nothing, the taste model imports
  // it too, and it holds no opinion about anybody's taste. Letting it through is
  // not a loophole in this rule but the thing that makes the rule survivable —
  // the alternative was this model restating the naming rule and a contract
  // asserting two implementations were equivalent, which is not something a
  // contract can honestly assert across a database boundary.
  for (const elsewhere of ["../episodes/", "../taste/", "../memory/", "../mcp/", "./store", "node:"]) {
    assert.equal(source.includes(elsewhere), false, `the verdict model reached ${elsewhere}`);
  }
  // And the one it may reach brings nothing else with it.
  const identity = readFileSync(new URL("../films/identity.ts", import.meta.url), "utf8");
  assert.equal(/^\s*import /mu.test(identity), false, "the shared film identity reached for something");
  for (const owned of ["Episode", "episode", "offered", "MovieState", "genre", "vibe", "recommend"]) {
    assert.equal(
      new RegExp(`\\b${owned}`, "u").test(code),
      false,
      `${owned} appears in verdict code, outside its comments`,
    );
  }
});

test("a film is named by its title and its year, both", () => {
  // Case and whitespace are how a title was typed, not which film it is.
  assert.equal(filmKey({ title: "Black Bag", year: 2025 }), filmKey({ title: "black bag", year: 2025 }));
  assert.equal(filmKey({ title: "Black Bag", year: 2025 }), filmKey({ title: " Black  Bag ", year: 2025 }));
  // The year is not decoration: a remake is another film.
  assert.notEqual(filmKey({ title: "Heat", year: 1995 }), filmKey({ title: "Heat", year: 1986 }));
  // Non-ASCII folds too, because `toLowerCase` is the whole of the policy.
  assert.equal(filmKey({ title: "AMÉLIE", year: 2001 }), filmKey({ title: "amélie", year: 2001 }));
  // And two different films are never one.
  assert.notEqual(filmKey({ title: "Heat", year: 1995 }), filmKey({ title: "Heat 2", year: 1995 }));
});

test("nothing here decides how much a verdict should weigh", () => {
  const verdict = loved();
  for (const weight of ["confidence", "weight", "strength", "relevance", "score"]) {
    assert.equal(weight in verdict, false, `${weight} was stored beside a verdict`);
  }
});
