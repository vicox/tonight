import assert from "node:assert/strict";
import test from "node:test";

import type { Movie, Vibe, Viewing, Written } from "../taste/model.ts";
import type { Judgement } from "../verdicts/model.ts";
import type { Shown } from "./judgements.ts";
import { emptyVibes, statusOf, stream } from "./stream.ts";

/**
 * The Stream's order and what a card's status says.
 *
 * The order is a promise the page makes to somebody using it: newest saved
 * first, and a card never moves because something was said about its film. What
 * these hold is that the promise is kept for every input, including the films
 * nobody dated and the titles a locale calls equal.
 */

const film = (
  title: string,
  createdAt: string | null,
  { year = 2000, viewing = "want-to-see", judgement = null, vibes = [] }: {
    year?: number;
    viewing?: Viewing;
    judgement?: Judgement | null;
    vibes?: string[];
  } = {},
): Shown => ({
  title,
  year,
  imdbId: null,
  viewing,
  vibes,
  createdAt,
  updatedAt: "2026-10-01T00:00:00.000000Z",
  position: judgement === null ? undefined : { judgement },
});

const titles = (movies: readonly Written<Movie>[]) => movies.map((movie) => `${movie.title} ${movie.year}`);

test("the newest saved film comes first", () => {
  const movies = [
    film("Heat", "2026-01-01T10:00:00.000000Z"),
    film("Dune", "2026-03-01T10:00:00.000000Z"),
    film("Arrival", "2026-02-01T10:00:00.000000Z"),
  ];
  assert.deepEqual(titles(stream(movies)), ["Dune 2000", "Arrival 2000", "Heat 2000"]);
});

test("a microsecond apart is still apart", () => {
  const movies = [
    film("First", "2026-05-01T10:00:00.000001Z"),
    film("Second", "2026-05-01T10:00:00.000002Z"),
  ];
  assert.deepEqual(titles(stream(movies)), ["Second 2000", "First 2000"]);
});

test("every film nobody dated comes after every film somebody did", () => {
  const movies = [
    film("Undated", null),
    film("Ancient", "1999-01-01T00:00:00.000000Z"),
    film("Recent", "2026-10-24T00:00:00.000000Z"),
    film("Also undated", null),
  ];
  assert.deepEqual(titles(stream(movies)), [
    "Recent 2000",
    "Ancient 2000",
    "Also undated 2000",
    "Undated 2000",
  ]);
});

test("equal stamps, and undated films, go by title ignoring case, then year", () => {
  const same = "2026-05-01T10:00:00.000000Z";
  const movies = [
    film("Dune", same, { year: 2021 }),
    film("brazil", same),
    film("Dune", same, { year: 1984 }),
    film("alien", same),
  ];
  assert.deepEqual(titles(stream(movies)), ["alien 2000", "brazil 2000", "Dune 1984", "Dune 2021"]);

  const undated = [film("Dune", null, { year: 2021 }), film("Brazil", null), film("Dune", null, { year: 1984 })];
  assert.deepEqual(titles(stream(undated)), ["Brazil 2000", "Dune 1984", "Dune 2021"]);
});

test("titles a locale calls equal still come out in one order", () => {
  // `localeCompare` ignores the zero-width space, so these two compare equal
  // there — and the store hands films over in no fixed order. `filmKey` decides.
  const plain = film("alien", null);
  const spaced = film("a​lien", null);
  assert.equal("alien".localeCompare("a​lien"), 0, "the locale no longer calls these equal");

  const one = titles(stream([plain, spaced]));
  const other = titles(stream([spaced, plain]));
  assert.deepEqual(one, other);
});

test("the order does not depend on the order the films arrived in", () => {
  const movies = [
    film("Heat", "2026-01-01T10:00:00.000000Z"),
    film("Dune", "2026-03-01T10:00:00.000000Z", { year: 2021 }),
    film("Dune", "2026-03-01T10:00:00.000000Z", { year: 1984 }),
    film("Undated", null),
    film("Arrival", null),
  ];
  const expected = titles(stream(movies));
  for (const shuffled of [[...movies].reverse(), [movies[3], movies[0], movies[4], movies[2], movies[1]]]) {
    assert.deepEqual(titles(stream(shuffled)), expected);
  }
});

test("every film is there exactly once, whatever it is or is in", () => {
  const movies = [
    film("Seen", "2026-01-01T00:00:00.000000Z", { viewing: "seen" }),
    film("Listed", "2026-01-02T00:00:00.000000Z"),
    film("Refused", "2026-01-03T00:00:00.000000Z", { viewing: "dont-want-to-see" }),
    film("Loved", "2026-01-04T00:00:00.000000Z", { judgement: "loved", vibes: ["A", "B"] }),
    film("Nowhere", null),
  ];
  const out = stream(movies);
  assert.equal(out.length, movies.length);
  assert.deepEqual(new Set(out), new Set(movies));
});

test("what was said about a film never moves its card", () => {
  const movies = [
    film("Heat", "2026-01-01T10:00:00.000000Z"),
    film("Dune", "2026-03-01T10:00:00.000000Z"),
    film("Arrival", "2026-02-01T10:00:00.000000Z"),
  ];
  const before = titles(stream(movies));

  const loved = movies.map((movie) =>
    movie.title === "Heat" ? { ...movie, position: { judgement: "loved" as Judgement } } : movie,
  );
  const refused = movies.map((movie) =>
    movie.title === "Dune" ? { ...movie, viewing: "dont-want-to-see" as Viewing } : movie,
  );
  assert.deepEqual(titles(stream(loved)), before);
  assert.deepEqual(titles(stream(refused)), before);
});

test("nothing is an empty stream, and the films given are left as they were", () => {
  assert.deepEqual(stream([]), []);

  const movies = [film("Heat", "2026-01-01T10:00:00.000000Z"), film("Dune", "2026-03-01T10:00:00.000000Z")];
  const copy = [...movies];
  stream(movies);
  assert.deepEqual(movies, copy);
});

test("a card's status: the verdict when one stands, the viewing when none does", () => {
  const VIEWINGS: Viewing[] = ["want-to-see", "seen", "dont-want-to-see"];
  const expected: Record<Viewing, Record<string, string[]>> = {
    "want-to-see": {
      none: ["want-to-see"],
      liked: ["liked"],
      loved: ["loved"],
      disliked: ["disliked"],
    },
    seen: { none: ["seen"], liked: ["liked"], loved: ["loved"], disliked: ["disliked"] },
    "dont-want-to-see": {
      none: ["dont-want-to-see"],
      liked: ["liked", "dont-want-to-see"],
      loved: ["loved", "dont-want-to-see"],
      disliked: ["disliked", "dont-want-to-see"],
    },
  };

  for (const viewing of VIEWINGS) {
    for (const judgement of [null, "liked", "loved", "disliked"] as (Judgement | null)[]) {
      const got = statusOf(viewing, judgement);
      assert.deepEqual(got, expected[viewing][judgement ?? "none"], `${viewing} + ${judgement}`);
      assert.ok(got.length > 0, "a card has no status");
    }
  }
});

const vibe = (name: string, genres: string[], movies: { title: string; year: number }[]): Vibe => ({
  name,
  instruction: `${name}, in their words.`,
  genres,
  core: null,
  movies,
});

test("the vibes with no films are exactly those, in the order given", () => {
  const movies = [film("Dune", null, { vibes: ["Space Tension"] })];
  const vibes = [
    vibe("Quiet Dread", ["Mystery"], []),
    vibe("Space Tension", ["Off World"], [{ title: "Dune", year: 2000 }]),
    // A handle with no film behind it holds nothing.
    vibe("Ghostly", ["Mystery"], [{ title: "Gone", year: 1922 }]),
  ];
  assert.deepEqual(
    emptyVibes(vibes, movies).map((one) => one.name),
    ["Quiet Dread", "Ghostly"],
  );
  assert.deepEqual(emptyVibes([], movies), []);
});
