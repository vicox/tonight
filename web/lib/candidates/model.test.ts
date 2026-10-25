import assert from "node:assert/strict";
import test from "node:test";

import { TasteError, type Movie, type Viewing } from "../taste/model.ts";
import type { Judgement, Standing } from "../verdicts/model.ts";
import { askedCandidates, checkCandidates, MAX_CANDIDATES, type Asked } from "./model.ts";

/**
 * The check's contracts, against plain values and no database.
 *
 * What this file is for is the reading of each answer: a film Tonight knows
 * nothing about must never come back looking like one they have not seen, and a
 * film it does know about must come back exactly as stored — nothing ranked,
 * merged or added.
 */

const movie = (title: string, year: number, viewing: Viewing, extra: Partial<Movie> = {}): Movie => ({
  title,
  year,
  imdbId: null,
  viewing,
  vibes: [],
  ...extra,
});

const said = (title: string, year: number, judgement: Judgement, because?: string): Standing => ({
  title,
  year,
  judgement,
  ...(because === undefined ? {} : { because }),
  told: "volunteered",
});

const NONE = { movies: [], standing: [] };

const one = (asked: Asked, held: { movies: Movie[]; standing: Standing[] }) => checkCandidates([asked], held)[0]!;

test("a film Tonight knows nothing about is nothing, and not known to be unseen", () => {
  assert.deepEqual(one({ title: "Arrival", year: 2016 }, NONE), {
    asked: { title: "Arrival", year: 2016 },
    status: "nothing",
    movie: null,
    verdict: null,
    seen: null,
    neverRecommend: false,
    otherYears: [],
    imdbHeldBy: null,
  });
});

test("every viewing against every judgement gives one status, one seen and one turn-down", () => {
  // `null` for the viewing is a film not on their list at all.
  const viewings: (Viewing | null)[] = ["seen", "want-to-see", "dont-want-to-see", null];
  const judgements: (Judgement | null)[] = [null, "liked", "loved", "disliked"];

  for (const viewing of viewings) {
    for (const judgement of judgements) {
      const held = {
        movies: viewing === null ? [] : [movie("Heat", 1995, viewing)],
        standing: judgement === null ? [] : [said("Heat", 1995, judgement)],
      };
      const found = one({ title: "Heat", year: 1995 }, held);
      const what = `${viewing ?? "no movie"} + ${judgement ?? "no verdict"}`;

      assert.equal(
        found.status,
        viewing !== null ? "saved" : judgement !== null ? "said-only" : "nothing",
        `${what}: status`,
      );
      // A judgement means they watched it, whatever the list says; only
      // want-to-see says it is still to see; everything else is not known.
      const seen = viewing === "seen" || judgement !== null ? true : viewing === "want-to-see" ? false : null;
      assert.equal(found.seen, seen, `${what}: seen`);
      assert.equal(found.neverRecommend, viewing === "dont-want-to-see", `${what}: neverRecommend`);
      assert.equal(found.verdict?.judgement ?? null, judgement, `${what}: verdict`);
      assert.equal(found.movie?.viewing ?? null, viewing, `${what}: movie`);
    }
  }

  // The four the plan names, spelled out so a change to the loop cannot hide them.
  const heat = { title: "Heat", year: 1995 };
  assert.equal(one(heat, { movies: [movie("Heat", 1995, "want-to-see")], standing: [said("Heat", 1995, "loved")] }).seen, true);
  const refused = one(heat, { movies: [movie("Heat", 1995, "dont-want-to-see")], standing: [] });
  assert.equal(refused.seen, null, "a turn-down is not evidence they watched it");
  assert.equal(refused.neverRecommend, true);
  const both = one(heat, { movies: [movie("Heat", 1995, "dont-want-to-see")], standing: [said("Heat", 1995, "liked")] });
  assert.deepEqual([both.seen, both.neverRecommend], [true, true]);
  const disliked = one(heat, { movies: [], standing: [said("Heat", 1995, "disliked")] });
  assert.deepEqual([disliked.status, disliked.seen], ["said-only", true]);
});

test("a film is matched by filmKey, and comes back spelled as it was stored", () => {
  const held = { movies: [movie("The Thing", 1982, "seen", { vibes: ["Cold Dread"] })], standing: [] };
  const [asked] = askedCandidates([{ title: "  the  THING ", year: 1982 }]);
  const found = checkCandidates([asked!], held)[0]!;

  assert.equal(found.status, "saved");
  assert.deepEqual(found.asked, { title: "the THING", year: 1982 }, "asked is the checked spelling");
  assert.deepEqual(found.movie, { title: "The Thing", year: 1982, imdbId: null, viewing: "seen", vibes: ["Cold Dread"] });
});

test("matching is exact: no accent folding and no near titles", () => {
  const held = {
    movies: [movie("Amélie", 2001, "seen"), movie("Se7en", 1995, "dont-want-to-see")],
    standing: [],
  };
  assert.equal(one({ title: "Amelie", year: 2001 }, held).status, "nothing");
  assert.equal(one({ title: "Seven", year: 1995 }, held).status, "nothing");
});

test("other years of the same title are named, and never merged", () => {
  const held = { movies: [movie("Dune", 1984, "seen")], standing: [said("dune", 2000, "disliked")] };
  const found = one({ title: "Dune", year: 2021 }, held);

  assert.equal(found.status, "nothing");
  assert.deepEqual(found.otherYears, [1984, 2000]);
  // The asked year is never listed, and a year held twice is listed once.
  const twice = { movies: [movie("Dune", 1984, "seen")], standing: [said("Dune", 1984, "loved"), said("Dune", 2021, "liked")] };
  assert.deepEqual(one({ title: "Dune", year: 2021 }, twice).otherYears, [1984]);
  assert.deepEqual(one({ title: "Dune", year: 1984 }, twice).otherYears, [2021]);
});

test("an IMDb id held by a different saved film is named, and never merged", () => {
  const held = { movies: [movie("Se7en", 1995, "dont-want-to-see", { imdbId: "tt0114369" })], standing: [] };

  const other = one({ title: "Seven", year: 1995, imdbId: "tt0114369" }, held);
  assert.equal(other.status, "nothing");
  assert.equal(other.neverRecommend, false, "the holder's facts are not this entry's");
  assert.deepEqual(other.imdbHeldBy, { title: "Se7en", year: 1995 });

  assert.equal(one({ title: "se7en", year: 1995, imdbId: "tt0114369" }, held).imdbHeldBy, null, "the holder itself");
  assert.equal(one({ title: "Seven", year: 1995 }, held).imdbHeldBy, null, "no id asked");
  assert.equal(one({ title: "Seven", year: 1995, imdbId: "tt9999999" }, held).imdbHeldBy, null, "an id nobody holds");
});

test("one entry per candidate, in the order asked", () => {
  const held = { movies: [movie("Heat", 1995, "seen")], standing: [] };
  const asked = [
    { title: "Moon", year: 2009 },
    { title: "Heat", year: 1995 },
    { title: "Heat", year: 1986 },
  ];
  assert.deepEqual(
    checkCandidates(asked, held).map((found) => [found.asked.title, found.asked.year, found.status]),
    [
      ["Moon", 2009, "nothing"],
      ["Heat", 1995, "saved"],
      ["Heat", 1986, "nothing"],
    ],
  );
});

test("a check that cannot be answered is refused before anything is read", () => {
  const refuses = (raw: { title: unknown; year: unknown; imdbId?: unknown }[], message: RegExp) =>
    assert.throws(() => askedCandidates(raw), (error: unknown) => error instanceof TasteError && message.test(error.message));

  refuses([], /at least one film/);
  refuses(
    Array.from({ length: MAX_CANDIDATES + 1 }, (_, n) => ({ title: `Film ${String(n)}`, year: 2000 })),
    /at most 10 films/,
  );
  // One film twice, however it was spelled — and the message names both spellings.
  refuses([{ title: "Heat", year: 1995 }, { title: "heat ", year: 1995 }], /Heat \(1995\) is in this check twice, as "Heat" and "heat"/);
  refuses([{ title: "   ", year: 1995 }], /needs a title/);
  refuses([{ title: "Heat", year: 1700 }], /between 1878 and 2200/);
  refuses([{ title: "Heat", year: 1995, imdbId: "0113277" }], /not an IMDb title id/);
  refuses([{ title: "Heat", year: 1995, imdbId: null }], /an IMDb id here is text, or left out/);

  // The same title in two years is two films.
  assert.equal(askedCandidates([{ title: "Heat", year: 1995 }, { title: "Heat", year: 1986 }]).length, 2);
  // Left out, the id stays absent — not null, not an empty string.
  assert.deepEqual(askedCandidates([{ title: "Heat", year: 1995 }]), [{ title: "Heat", year: 1995 }]);
  assert.deepEqual(askedCandidates([{ title: "Heat", year: 1995, imdbId: " tt0113277 " }]), [
    { title: "Heat", year: 1995, imdbId: "tt0113277" },
  ]);
});

test("the check is pure: nothing it is given changes, and it answers the same way twice", () => {
  const held = {
    movies: [movie("Heat", 1995, "seen", { vibes: ["Night Shift"], imdbId: "tt0113277" })],
    standing: [said("Heat", 1995, "loved", "the diner scene")],
  };
  const asked: Asked[] = [{ title: "Heat", year: 1995, imdbId: "tt0113277" }, { title: "Heat", year: 1986 }];
  const frozen = (value: unknown): unknown => {
    if (value !== null && typeof value === "object") {
      for (const inner of Object.values(value)) frozen(inner);
      Object.freeze(value);
    }
    return value;
  };
  frozen(held);
  frozen(asked);

  const first = checkCandidates(asked, held);
  assert.deepEqual(checkCandidates(asked, held), first);
  // Answers are copies: changing one cannot reach back into what was held.
  first[0]!.movie!.vibes.push("Elsewhere");
  assert.deepEqual(held.movies[0]!.vibes, ["Night Shift"]);
});

test("a verdict is what stands, as said: their words only where they gave them", () => {
  const withWords = one({ title: "Heat", year: 1995 }, { movies: [], standing: [said("Heat", 1995, "loved", "the diner scene")] });
  assert.deepEqual(withWords.verdict, { judgement: "loved", because: "the diner scene", told: "volunteered" });

  const without = one({ title: "Heat", year: 1995 }, { movies: [], standing: [{ ...said("Heat", 1995, "liked"), told: "confirmed" }] });
  assert.deepEqual(without.verdict, { judgement: "liked", told: "confirmed" });
  assert.equal("because" in without.verdict!, false);
});
