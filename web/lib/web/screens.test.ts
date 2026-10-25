import assert from "node:assert/strict";
import test from "node:test";

import type { Genre, Movie, Vibe } from "../taste/model.ts";
import {
  alsoIn,
  contextOf,
  findMovie,
  findVibe,
  genresOf,
  movieHref,
  single,
  vibeHref,
} from "./screens.ts";

/**
 * The signed-in screens' addresses, and what a URL is allowed to choose.
 *
 * A vibe's name and a film's title are whatever the user said, so every awkward
 * string has to survive the trip into a link and back out of the query the page
 * is given — and a URL that names something no longer there has to find nothing,
 * never something else.
 */

/** What a page reads back from one of these links, as Next.js parses it. */
function query(href: string): URLSearchParams {
  return new URL(href, "http://localhost").searchParams;
}

const AWKWARD = [
  "..",
  ".",
  "Face/Off",
  "#Alive",
  "Who Framed Roger Rabbit?",
  "C++",
  "100%",
  "a&b=c",
  "𝔇𝔲𝔫𝔢",
  "  Spaced  Out  ",
];

test("a vibe's name survives the trip into its link and back", () => {
  for (const name of AWKWARD) {
    const href = vibeHref(name);
    assert.ok(href.startsWith("/vibe?"), `${name} is not addressed by a query`);
    assert.equal(query(href).get("name"), name, `${name} came back as something else`);
  }
});

test("a film's title and year survive the trip, and so does the vibe it came from", () => {
  for (const title of AWKWARD) {
    const href = movieHref({ title, year: 1997 }, title);
    assert.ok(href.startsWith("/movie?"), `${title} is not addressed by a query`);
    const back = query(href);
    assert.equal(back.get("title"), title);
    assert.equal(back.get("year"), "1997");
    assert.equal(back.get("from"), title);
  }
});

test("a film reached from nowhere in particular carries no vibe", () => {
  assert.equal(query(movieHref({ title: "Dune", year: 2021 })).has("from"), false);
  assert.equal(query(movieHref({ title: "Dune", year: 2021 }, null)).has("from"), false);
});

test("one value is an answer, and a list or nothing is not", () => {
  assert.equal(single("Quiet Dread"), "Quiet Dread");
  assert.equal(single(""), "");
  assert.equal(single(["a", "b"]), null);
  assert.equal(single(undefined), null);
});

const vibe = (name: string, genres: string[] = ["Mystery"]): Vibe => ({
  name,
  instruction: `${name}, in their words.`,
  genres,
  core: null,
  movies: [],
});

test("a vibe is found by its stored name, exactly", () => {
  const vibes = [vibe("Quiet Dread"), vibe("..")];
  assert.equal(findVibe(vibes, "Quiet Dread")?.name, "Quiet Dread");
  assert.equal(findVibe(vibes, "..")?.name, "..");

  // Another spelling is not a guess this page makes: links are written from the
  // stored name, so only a stale or hand-typed one misses.
  assert.equal(findVibe(vibes, "quiet dread"), null);
  assert.equal(findVibe(vibes, "Quiet  Dread"), null);
  assert.equal(findVibe(vibes, "Space Tension"), null);
  assert.equal(findVibe(vibes, null), null);
});

const movie = (title: string, year: number, vibes: string[] = []): Movie => ({
  title,
  year,
  imdbId: null,
  viewing: "want-to-see",
  vibes,
});

test("a film is found by the identity the store keeps, not by its spelling", () => {
  const movies = [movie("Dune", 1984), movie("Dune", 2021), movie("Black Bag", 2025)];

  assert.equal(findMovie(movies, "Dune", "2021"), movies[1]);
  assert.equal(findMovie(movies, "Dune", "1984"), movies[0]);
  // The same film however it is spaced or cased — the rule a verdict is joined by.
  assert.equal(findMovie(movies, "  black   BAG ", "2025"), movies[2]);
});

test("a film is not found under another year, or a year that is not one", () => {
  const movies = [movie("Dune", 2021)];
  for (const year of ["2020", "21", "02021", "2021.0", "abc", "", " 2021"]) {
    assert.equal(findMovie(movies, "Dune", year), null, `"${year}" found a film`);
  }
  assert.equal(findMovie(movies, null, "2021"), null);
  assert.equal(findMovie(movies, "Dune", null), null);
  assert.equal(findMovie(movies, "Arrival", "2021"), null);
});

test("a context is the vibe the film is in now, and nothing else", () => {
  const dune = movie("Dune", 2021, ["Space Tension", "Quiet Dread"]);
  assert.equal(contextOf(dune, "Space Tension"), "Space Tension");
  // Taken out of the vibe since the link was written, or never in it.
  assert.equal(contextOf(dune, "Popcorn Chaos"), null);
  assert.equal(contextOf(dune, "space tension"), null);
  assert.equal(contextOf(dune, null), null);
});

test("the other vibes are every one but the context, in the film's own order", () => {
  const dune = movie("Dune", 2021, ["Quiet Dread", "Space Tension", "Slow Nights"]);
  assert.deepEqual(alsoIn(dune, "Space Tension"), ["Quiet Dread", "Slow Nights"]);
  assert.deepEqual(alsoIn(dune, null), ["Quiet Dread", "Space Tension", "Slow Nights"]);
  assert.deepEqual(alsoIn(movie("Heat", 1995, ["Slow Nights"]), "Slow Nights"), []);
});

test("a vibe's genres come back as genres, in the vibe's order", () => {
  const genres: Genre[] = [
    { name: "Mystery", instruction: "Questions first." },
    { name: "Off World", instruction: "Somewhere else." },
    { name: "Slow Burn", instruction: "Take its time." },
  ];
  const space = vibe("Space Tension", ["Slow Burn", "Off World"]);
  assert.deepEqual(
    genresOf(space, genres).map((genre) => genre.name),
    ["Slow Burn", "Off World"],
  );

  // A name with no genre behind it is skipped, not drawn as an empty label.
  assert.deepEqual(
    genresOf(vibe("Ghostly", ["Slow Burn", "Gone"]), genres).map((genre) => genre.name),
    ["Slow Burn"],
  );
});
