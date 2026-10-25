import assert from "node:assert/strict";
import test from "node:test";

import type { Vibe, Viewing } from "../taste/model.ts";
import type { Judgement } from "../verdicts/model.ts";
import type { Shown } from "./judgements.ts";
import { filmsIn } from "./vibes.ts";

/**
 * What is in a vibe.
 *
 * A vibe's screen lists its films and the Stream lists the vibes with none — both
 * through `filmsIn`, read off the films the page was rendered with, so what was
 * said about a film changes none of it. That is what these hold; the rendering is
 * in `overview.test.ts`.
 */

const film = (
  title: string,
  judgement: Judgement | null,
  viewing: Viewing = "want-to-see",
): Shown => ({
  title,
  year: 2000,
  imdbId: null,
  viewing,
  vibes: ["Quiet Dread"],
  createdAt: null,
  updatedAt: "2024-01-01T00:00:00.000000Z",
  position: judgement === null ? undefined : { judgement },
});

const MOVIES: Shown[] = [
  film("Solaris", "loved"),
  film("Stalker", "loved"),
  film("Dune", null, "dont-want-to-see"),
  film("Heat", null, "seen-before"),
  film("Nosferatu", null),
  { ...film("Arrival", "loved"), vibes: ["Space Tension"] },
];

const VIBE: Vibe = {
  name: "Quiet Dread",
  instruction: "Dread that arrives on foot.",
  genres: ["Mystery", "Slow Burn"],
  // Anchored on one of its loved films. The page does not read the core, so
  // nothing below depends on which.
  core: { title: "Solaris", year: 2000 },
  movies: [
    { title: "Solaris", year: 2000 },
    { title: "Stalker", year: 2000 },
    { title: "Dune", year: 2000 },
    { title: "Heat", year: 2000 },
    { title: "Nosferatu", year: 2000 },
  ],
};

test("a vibe holds its members, whatever was said about the films", () => {
  // Two loved, one not wanted, one seen and one nobody has mentioned: five films
  // in the vibe, in the order the vibe holds them.
  assert.deepEqual(
    filmsIn(VIBE, MOVIES).map((movie) => movie.title),
    ["Solaris", "Stalker", "Dune", "Heat", "Nosferatu"],
  );
  assert.deepEqual(
    filmsIn(VIBE, MOVIES).map((movie) => movie.position?.judgement ?? null),
    ["loved", "loved", null, null, null],
  );
});

test("a film in another vibe is not in this one", () => {
  assert.equal(
    filmsIn(VIBE, MOVIES).some((movie) => movie.title === "Arrival"),
    false,
    "a film from another vibe was counted",
  );
});

test("what is said about a film leaves membership alone", () => {
  const after = MOVIES.map((movie) =>
    movie.title === "Dune" ? { ...movie, position: { judgement: "loved" as Judgement } } : movie,
  );
  assert.equal(filmsIn(VIBE, after).length, 5, "membership changed with a verdict");

  const away = MOVIES.map((movie) =>
    movie.title === "Solaris" ? { ...movie, viewing: "dont-want-to-see" as Viewing } : movie,
  );
  assert.equal(filmsIn(VIBE, away).length, 5, "membership changed with a viewing");
});

test("a handle with no film behind it is not counted", () => {
  // Cannot happen from one snapshot, and what a vibe holds still has to be the
  // rows its screen shows.
  const missing: Vibe = { ...VIBE, movies: [...VIBE.movies, { title: "Ghost", year: 1990 }] };
  assert.equal(filmsIn(missing, MOVIES).length, 5);
});

test("an empty vibe holds nothing", () => {
  const empty: Vibe = { ...VIBE, movies: [] };
  assert.equal(filmsIn(empty, MOVIES).length, 0);
});
