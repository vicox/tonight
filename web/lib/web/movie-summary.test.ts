import assert from "node:assert/strict";
import test from "node:test";

import type { Movie, MovieState } from "../taste/model.ts";
import { OTHER_MOVIES, SELECTIONS, filedUnder, selected } from "./movie-summary.ts";

/**
 * The four counts, and the films each one stands for.
 *
 * These are the arithmetic of the summary tiles and nothing else: what a tile
 * says, what opens under it when it is pressed, and — the part worth a test of
 * its own — that those two are the same answer. The rendering decisions the
 * tiles and their dialog are held to are in `overview.test.ts`, with the rest of
 * the signed-in page's contract.
 */

/** A film, with only the parts a count or a row cares about spelled out. */
function film(title: string, state: MovieState | null, mixes: string[] = []): Movie {
  return { title, year: 2000, imdbId: null, state, mixes };
}

/**
 * A collection with every state in it, including the one that is not a state.
 *
 * Two loved, one liked, one not seen, and — deliberately — a seen, a disliked
 * and two films Tonight was never told about, so that a count matching by
 * accident is a count that fails here.
 */
const COLLECTION: Movie[] = [
  film("Solaris", "loved", ["Quiet Dread"]),
  film("Stalker", "loved", ["Quiet Dread", "Slow Cinema"]),
  film("Arrival", "liked", ["Space Tension"]),
  film("Dune", "not_seen", ["Space Tension"]),
  film("Heat", "seen"),
  film("Cats", "disliked", ["Popcorn Chaos"]),
  film("Sunrise", null, ["Slow Cinema"]),
  film("Nosferatu", null),
];

/** What the four tiles show for that collection. */
function counts(movies: readonly Movie[]): Record<string, number> {
  return Object.fromEntries(
    SELECTIONS.map(({ name }) => [name, selected(name, movies).length]),
  );
}

test("the four tiles count the collection and three of its states", () => {
  assert.deepEqual(counts(COLLECTION), { all: 8, loved: 2, liked: 1, not_seen: 1 });
});

test("the four tiles are Total, Loved, Liked and Not seen", () => {
  assert.deepEqual(
    SELECTIONS.map(({ label }) => label),
    ["Total", "Loved", "Liked", "Not seen"],
  );
});

test("a film Tonight was never told about is in Total and in nothing else", () => {
  // `null` means the user has not said, and "Not seen" is something they said.
  // Counting silence there would put films somebody has never mentioned into a
  // list of films they told us they have not watched.
  const silent = [film("Sunrise", null), film("Nosferatu", null)];
  assert.deepEqual(counts(silent), { all: 2, loved: 0, liked: 0, not_seen: 0 });

  assert.deepEqual(
    selected("not_seen", COLLECTION).map((movie) => movie.title),
    ["Dune"],
    "a film with no state was counted as not seen",
  );
});

test("a tile opens the films it counted, and only those", () => {
  const opened = (name: (typeof SELECTIONS)[number]["name"]) =>
    selected(name, COLLECTION).map((movie) => movie.title);

  assert.deepEqual(opened("all"), COLLECTION.map((movie) => movie.title));
  assert.deepEqual(opened("loved"), ["Solaris", "Stalker"]);
  assert.deepEqual(opened("liked"), ["Arrival"]);
  assert.deepEqual(opened("not_seen"), ["Dune"]);
});

test("what a tile counts is what it opens, for every tile", () => {
  // The guarantee the tiles rest on: one function is asked for the number and
  // asked again for the list, so a tile saying four and opening three films is
  // not a state this can be in.
  for (const { name } of SELECTIONS) {
    assert.equal(counts(COLLECTION)[name], selected(name, COLLECTION).length);
  }
});

test("the order films are held in is the order they are shown in", () => {
  // No ordering of the summary's own: every list on the overview is in the
  // store's order, and a dialog that sorted differently would be a second idea
  // about the same films.
  assert.deepEqual(
    selected("all", COLLECTION),
    [...COLLECTION],
    "the films were reordered on their way to a tile",
  );
});

test("a new mark moves a film between tiles, and leaves Total alone", () => {
  // What the dialog does when a mark is pressed inside it: the page is
  // re-rendered, these functions are asked again with the films the server
  // answered with, and the film is under whichever tile it now belongs to. The
  // collection has not changed size — nothing was added or removed, one thing
  // was said.
  const before = COLLECTION;
  const after = before.map((movie) =>
    movie.title === "Stalker" ? { ...movie, state: "seen" as MovieState } : movie,
  );

  assert.deepEqual(counts(before), { all: 8, loved: 2, liked: 1, not_seen: 1 });
  assert.deepEqual(counts(after), { all: 8, loved: 1, liked: 1, not_seen: 1 });

  assert.deepEqual(
    selected("loved", after).map((movie) => movie.title),
    ["Solaris"],
    "a film that stopped being loved is still in the loved list",
  );
  assert.equal(
    selected("all", after).some((movie) => movie.title === "Stalker"),
    true,
    "a film left the collection by being given another mark",
  );
});

test("a film that leaves a tile can empty it", () => {
  // The dialog has to survive this: the last film under the open tile is given
  // another mark while its list is on screen.
  const one = [film("Arrival", "liked")];
  const none = one.map((movie) => ({ ...movie, state: "disliked" as MovieState }));

  assert.deepEqual(selected("liked", none), []);
  assert.equal(selected("all", none).length, 1);
});

test("an empty collection counts four zeros rather than refusing to", () => {
  // The tiles are not rendered at all when there are no films — that decision is
  // the component's, and pinned in `overview.test.ts`. The arithmetic still has
  // to hold, so that hiding them stays a rendering choice rather than a
  // workaround for something that cannot be counted.
  assert.deepEqual(counts([]), { all: 0, loved: 0, liked: 0, not_seen: 0 });
});

test("a row says every mix its film is in", () => {
  assert.deepEqual(filedUnder(film("Arrival", "liked", ["Space Tension"])), ["Space Tension"]);

  // All of them, in the order the film holds them, and none abbreviated away: the
  // names are the answer to why this film is in this list.
  assert.deepEqual(
    filedUnder(film("Stalker", "loved", ["Quiet Dread", "Slow Cinema", "Popcorn Chaos"])),
    ["Quiet Dread", "Slow Cinema", "Popcorn Chaos"],
  );
});

test("a film in no mix is filed under Other movies, the page's own words", () => {
  assert.deepEqual(filedUnder(film("Nosferatu", null)), ["Other movies"]);
  assert.equal(OTHER_MOVIES, "Other movies");

  // And not under a second ontology invented here for the same films.
  for (const invented of ["Unsorted", "Inbox", "Archive", "Uncategorised", "Loose", "None"]) {
    assert.notEqual(filedUnder(film("Nosferatu", null))[0], invented);
  }
});
