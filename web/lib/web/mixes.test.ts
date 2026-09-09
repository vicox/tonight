import assert from "node:assert/strict";
import test from "node:test";

import type { Mix, Movie, MovieState, Written } from "../taste/model.ts";
import { selected } from "./movie-summary.ts";
import { filmsIn, preview, spokenMix } from "./mixes.ts";

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

/**
 * The three titles a card shows under the name.
 *
 * Which three, and in which order — the part of the card that has a rule rather
 * than a number. Everything here is a pure function of the films the page was
 * rendered with, so what it holds is that the same mix always previews the same
 * way, and that nothing about the preview reaches a count or the dialog.
 */

/** A film with a date, for the ordering to have something to order by. */
const dated = (title: string, state: MovieState | null, createdAt: string | null): Written<Movie> => ({
  title,
  year: 2000,
  imdbId: null,
  state,
  mixes: ["Quiet Dread"],
  createdAt,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const of = (...films: Written<Movie>[]): Mix => ({
  ...MIX,
  movies: films.map((film) => ({ title: film.title, year: film.year })),
});

/** The line a card would show for these films. Empty mixes are their own test. */
function lineFor(films: Written<Movie>[]): string {
  const line = preview(filmsIn(of(...films), films));
  if (line === null) throw new Error("these films previewed as nothing");
  return line;
}

test("a preview is three titles at most, joined with commas", () => {
  const films = [
    dated("Zodiac", "seen", "2026-03-01T00:00:00.000Z"),
    dated("Memories of Murder", "seen", "2026-02-01T00:00:00.000Z"),
    dated("Se7en", "seen", "2026-01-01T00:00:00.000Z"),
  ];
  assert.equal(lineFor(films), "Zodiac, Memories of Murder, Se7en");
});

test("a fourth film is said as `and more`, and only then", () => {
  const three = [
    dated("Zodiac", "seen", "2026-03-01T00:00:00.000Z"),
    dated("Memories of Murder", "seen", "2026-02-01T00:00:00.000Z"),
    dated("Se7en", "seen", "2026-01-01T00:00:00.000Z"),
  ];
  assert.equal(lineFor(three).endsWith("and more"), false, "three films promise a fourth");

  const four = [...three, dated("Prisoners", "seen", "2025-12-01T00:00:00.000Z")];
  assert.equal(lineFor(four), "Zodiac, Memories of Murder, Se7en, and more");
});

test("an empty mix has no preview at all", () => {
  assert.equal(preview([]), null);
});

test("loved comes before liked, and liked before everything else", () => {
  const films = [
    dated("Heat", "seen", "2026-05-01T00:00:00.000Z"),
    dated("Dune", "not_seen", "2026-04-01T00:00:00.000Z"),
    dated("Arrival", "liked", "2026-01-01T00:00:00.000Z"),
    dated("Solaris", "loved", "2025-01-01T00:00:00.000Z"),
  ];
  // The loved film is the oldest of the four and comes first anyway; the two
  // with no opinion on them come last however recently they were saved.
  assert.equal(lineFor(films), "Solaris, Arrival, Heat, and more");
});

test("within one standing, the most recently saved comes first", () => {
  const loved = [
    dated("Stalker", "loved", "2026-01-01T00:00:00.000Z"),
    dated("Solaris", "loved", "2026-06-01T00:00:00.000Z"),
    dated("Andrei Rublev", "loved", "2026-03-01T00:00:00.000Z"),
  ];
  assert.equal(lineFor(loved), "Solaris, Andrei Rublev, Stalker");

  const liked = loved.map((film) => ({ ...film, state: "liked" as MovieState }));
  assert.equal(lineFor(liked), "Solaris, Andrei Rublev, Stalker");

  const rest = loved.map((film) => ({ ...film, state: "not_seen" as MovieState }));
  assert.equal(lineFor(rest), "Solaris, Andrei Rublev, Stalker");
});

test("a film nobody dated comes after the dated films of its own standing", () => {
  // No date is not "old", it is unknown — so it waits behind the films that can
  // say when they arrived, rather than being treated as the earliest.
  const films = [
    dated("Nosferatu", "loved", null),
    dated("Solaris", "loved", "2020-01-01T00:00:00.000Z"),
    dated("Arrival", "liked", "2026-06-01T00:00:00.000Z"),
  ];
  assert.equal(lineFor(films), "Solaris, Nosferatu, Arrival");
});

test("two films with one date come out in one order, every time", () => {
  const same = "2026-01-01T00:00:00.000Z";
  const films = [
    dated("Se7en", "seen", same),
    dated("Zodiac", "seen", same),
    dated("Memories of Murder", "seen", same),
  ];
  const once = lineFor(films);
  assert.equal(once, lineFor([...films].reverse()), "the answer depends on the order given");
  assert.equal(once, "Memories of Murder, Se7en, Zodiac", "the tie is not settled by the handle");
});

test("previewing a mix moves nothing that is counted", () => {
  const films = [
    dated("Solaris", "loved", "2026-01-01T00:00:00.000Z"),
    dated("Stalker", "loved", null),
    dated("Dune", "not_seen", "2026-06-01T00:00:00.000Z"),
    dated("Heat", "seen", "2026-05-01T00:00:00.000Z"),
  ];
  const mix = of(...films);
  const before = filmsIn(mix, films);

  preview(before);

  assert.equal(filmsIn(mix, films).length, 4, "membership changed");
  assert.equal(selected("loved", filmsIn(mix, films)).length, 2, "the loved count changed");
  assert.deepEqual(
    before.map((film) => film.title),
    ["Solaris", "Stalker", "Dune", "Heat"],
    "the films the dialog lists were reordered",
  );
});
