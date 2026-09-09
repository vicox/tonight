import assert from "node:assert/strict";
import test from "node:test";

import type { Mix, Movie, MovieState } from "../taste/model.ts";
import { selected } from "./movie-summary.ts";
import { filmsIn, spokenMix } from "./mixes.ts";

/**
 * What a mix card counts, and what its dialog opens.
 *
 * The card shows a membership count and — when there is one — how many of those
 * films are loved. Both are read off the films the page was rendered with, so a
 * mark pressed inside the dialog changes them by the next render and by nothing
 * else. That is what these hold; the rendering is in `overview.test.ts`.
 */

const film = (title: string, state: MovieState | null): Movie => ({
  title,
  year: 2000,
  imdbId: null,
  state,
  mixes: ["Quiet Dread"],
});

const MOVIES: Movie[] = [
  film("Solaris", "loved"),
  film("Stalker", "loved"),
  film("Dune", "not_seen"),
  film("Heat", "seen"),
  film("Nosferatu", null),
  { ...film("Arrival", "loved"), mixes: ["Space Tension"] },
];

const MIX: Mix = {
  name: "Quiet Dread",
  instruction: "Dread that arrives on foot.",
  genres: ["Mystery", "Slow Burn"],
  movies: [
    { title: "Solaris", year: 2000 },
    { title: "Stalker", year: 2000 },
    { title: "Dune", year: 2000 },
    { title: "Heat", year: 2000 },
    { title: "Nosferatu", year: 2000 },
  ],
};

const loved = (mix: Mix, movies: readonly Movie[]) => selected("loved", filmsIn(mix, movies)).length;

test("the count is membership, whatever was said about the films", () => {
  // Two loved, one not seen, one seen and one nobody has mentioned: five films
  // in the mix, and the count is five.
  assert.equal(filmsIn(MIX, MOVIES).length, 5);
  assert.deepEqual(
    filmsIn(MIX, MOVIES).map((movie) => movie.state),
    ["loved", "loved", "not_seen", "seen", null],
  );
});

test("a film in another mix is not in this one", () => {
  assert.equal(
    filmsIn(MIX, MOVIES).some((movie) => movie.title === "Arrival"),
    false,
    "a loved film from another mix was counted",
  );
});

test("the loved signal counts exactly the loved films", () => {
  assert.equal(loved(MIX, MOVIES), 2);
});

test("no loved films is nothing to show, not a zero", () => {
  const nobody = MOVIES.map((movie) =>
    movie.state === "loved" ? { ...movie, state: "seen" as MovieState } : movie,
  );
  assert.equal(loved(MIX, nobody), 0);
});

test("a new mark moves the loved count and leaves membership alone", () => {
  // Pressed inside the dialog: the film is still in the mix, so the count after
  // the title does not move, and the heart beside it does.
  const after = MOVIES.map((movie) =>
    movie.title === "Dune" ? { ...movie, state: "loved" as MovieState } : movie,
  );
  assert.equal(filmsIn(MIX, after).length, 5, "membership changed with a state");
  assert.equal(loved(MIX, after), 3);

  const away = MOVIES.map((movie) =>
    movie.title === "Solaris" ? { ...movie, state: "liked" as MovieState } : movie,
  );
  assert.equal(filmsIn(MIX, away).length, 5, "membership changed with a state");
  assert.equal(loved(MIX, away), 1);
});

test("a handle with no film behind it is not counted", () => {
  // Cannot happen from one snapshot, and the number on a card still has to be
  // the number of rows its dialog opens.
  const missing: Mix = { ...MIX, movies: [...MIX.movies, { title: "Ghost", year: 1990 }] };
  assert.equal(filmsIn(missing, MOVIES).length, 5);
});

test("an empty mix counts nothing and says so in the singular's plural", () => {
  const empty: Mix = { ...MIX, movies: [] };
  assert.equal(filmsIn(empty, MOVIES).length, 0);
  assert.equal(spokenMix("Quiet Dread", 0, 0), "Quiet Dread: 0 films");
});

test("what a listener is given is the card, said", () => {
  assert.equal(spokenMix("Quiet Dread", 4, 3), "Quiet Dread: 4 films, 3 loved");
  assert.equal(spokenMix("Quiet Dread", 1, 1), "Quiet Dread: 1 film, 1 loved");
  assert.equal(spokenMix("Quiet Dread", 4, 0), "Quiet Dread: 4 films");
});
