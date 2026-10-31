import assert from "node:assert/strict";
import test from "node:test";

import type { Movie, Vibe, Viewing } from "../taste/model.ts";
import type { Judgement } from "../verdicts/model.ts";
import type { Shown } from "./judgements.ts";
import { coreFirst, filmsIn } from "./vibes.ts";

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

/**
 * Which of a film's vibes its card names first: the ones it is the core of.
 *
 * The card's rendering — the violet, the muted rest, the one line — is pinned in
 * `overview.test.ts`; which names, in which order, and which of them are cores
 * is `coreFirst`, and held here.
 */

const DUNE: Movie = {
  title: "Dune",
  year: 2021,
  imdbId: null,
  viewing: "seen-before",
  // As the store hands a film's vibes over: by name, ignoring case.
  vibes: ["Desert Myth", "Quiet Dread", "Space Tension"],
};

const anchored = (name: string, core: Vibe["core"]): Vibe => ({
  name,
  instruction: "What it means to them.",
  genres: ["Sci-Fi"],
  core,
  movies: [{ title: "Dune", year: 2021 }],
});

test("a film names the vibe it is the core of first, then the vibes it is only in", () => {
  const vibes = [
    anchored("Desert Myth", { title: "Lawrence of Arabia", year: 1962 }),
    anchored("Quiet Dread", { title: "Solaris", year: 1972 }),
    anchored("Space Tension", { title: "Dune", year: 2021 }),
  ];
  assert.deepEqual(coreFirst(DUNE, vibes), {
    names: ["Space Tension", "Desert Myth", "Quiet Dread"],
    cores: ["Space Tension"],
  });
});

test("a film that is the core of no vibe names its vibes as it holds them, none a core", () => {
  const vibes = [
    anchored("Desert Myth", { title: "Lawrence of Arabia", year: 1962 }),
    anchored("Quiet Dread", { title: "Solaris", year: 1972 }),
    anchored("Space Tension", { title: "Alien", year: 1979 }),
  ];
  assert.deepEqual(coreFirst(DUNE, vibes), { names: DUNE.vibes, cores: [] });

  // No vibes to ask is the same answer.
  assert.deepEqual(coreFirst(DUNE, []), { names: DUNE.vibes, cores: [] });
});

test("a film that is the core of two vibes names both first, in its own order", () => {
  const vibes = [
    anchored("Space Tension", { title: "Dune", year: 2021 }),
    anchored("Quiet Dread", { title: "Solaris", year: 1972 }),
    anchored("Desert Myth", { title: "Dune", year: 2021 }),
  ];
  assert.deepEqual(coreFirst(DUNE, vibes), {
    names: ["Desert Myth", "Space Tension", "Quiet Dread"],
    cores: ["Desert Myth", "Space Tension"],
  });
});

test("only this film is its core: not another year's, and not a vibe never anchored", () => {
  const vibes = [
    // The other Dune.
    anchored("Desert Myth", { title: "Dune", year: 1984 }),
    // A vibe from before vibes were anchored.
    anchored("Quiet Dread", null),
    anchored("Space Tension", { title: "Arrival", year: 2016 }),
  ];
  assert.deepEqual(coreFirst(DUNE, vibes), { names: DUNE.vibes, cores: [] });
});

test("a core is this film however its title is spelled, by `filmKey`", () => {
  const vibes = [anchored("Space Tension", { title: "  dune ", year: 2021 })];
  assert.deepEqual(coreFirst(DUNE, vibes).cores, ["Space Tension"]);
});

test("a vibe a film is not in is never named on its card, core or not", () => {
  // Cannot happen from one snapshot — a core is always in its vibe — and the
  // card still names only what the film is in.
  const vibes = [anchored("Popcorn Chaos", { title: "Dune", year: 2021 })];
  assert.deepEqual(coreFirst(DUNE, vibes), { names: DUNE.vibes, cores: [] });

  const nowhere: Movie = { ...DUNE, vibes: [] };
  assert.deepEqual(coreFirst(nowhere, vibes), { names: [], cores: [] });
});

test("ordering a card's vibes leaves the film's own order alone", () => {
  const before = [...DUNE.vibes];
  coreFirst(DUNE, [anchored("Space Tension", { title: "Dune", year: 2021 })]);
  assert.deepEqual(DUNE.vibes, before);
});
