import assert from "node:assert/strict";
import test from "node:test";

import type { Movie, MovieState } from "../taste/model.ts";
import {
  OTHER_MOVIES,
  STATE_TILES,
  WITHOUT_STATUS,
  filedUnder,
  selected,
  withoutStatus,
} from "./movie-summary.ts";

/**
 * The summary's arithmetic: what each tile counts, what the quiet line under
 * them counts, and what the total beside the heading is.
 *
 * All of it is a pure function of the films the page was rendered with, which is
 * what makes it testable here rather than through a browser: pressing a mark is
 * a write and a re-render, and what this holds is that the same films always
 * produce the same answers. The rendering decisions are in `overview.test.ts`.
 */

/** A film, with only the parts a count or a row cares about spelled out. */
function film(title: string, state: MovieState | null, mixes: string[] = []): Movie {
  return { title, year: 2000, imdbId: null, state, mixes };
}

/**
 * A collection with every state in it, and two films nobody has said anything
 * about — so a count that matched by accident is a count that fails here.
 */
const COLLECTION: Movie[] = [
  film("Heat", "seen"),
  film("Dune", "not_seen", ["Space Tension"]),
  film("Arrival", "liked", ["Space Tension"]),
  film("Solaris", "loved", ["Quiet Dread"]),
  film("Stalker", "loved", ["Quiet Dread", "Slow Cinema"]),
  film("Cats", "disliked", ["Popcorn Chaos"]),
  film("Sunrise", null, ["Slow Cinema"]),
  film("Nosferatu", null),
];

/** What the five tiles show, keyed by the state each one matches. */
function tiles(movies: readonly Movie[]): Record<string, number> {
  return Object.fromEntries(
    STATE_TILES.map((tile) => [tile.name, selected(tile.name, movies).length]),
  );
}

const titles = (movies: readonly Movie[]) => movies.map((movie) => movie.title);

test("the five tiles are the five states, in the order they are read", () => {
  assert.deepEqual(
    STATE_TILES.map((tile) => tile.name),
    ["seen", "not_seen", "liked", "loved", "disliked"],
  );
  assert.deepEqual(
    STATE_TILES.map((tile) => tile.label),
    ["Seen", "Not seen", "Liked", "Loved", "Disliked"],
  );
});

test("there is no Total tile: the total is the collection, not a selection", () => {
  // It belongs beside the heading, the way a genre count does. Nothing in the
  // tiles counts everything.
  assert.equal(
    STATE_TILES.some((tile) => tile.label === "Total"),
    false,
    "Total is still one of the tiles",
  );
  assert.equal(COLLECTION.length, 8, "the total is the number of films there are");
});

test("each tile counts exactly the films in its own state", () => {
  assert.deepEqual(tiles(COLLECTION), {
    seen: 1,
    not_seen: 1,
    liked: 1,
    loved: 2,
    disliked: 1,
  });

  assert.deepEqual(titles(selected("seen", COLLECTION)), ["Heat"]);
  assert.deepEqual(titles(selected("not_seen", COLLECTION)), ["Dune"]);
  assert.deepEqual(titles(selected("liked", COLLECTION)), ["Arrival"]);
  assert.deepEqual(titles(selected("loved", COLLECTION)), ["Solaris", "Stalker"]);
  assert.deepEqual(titles(selected("disliked", COLLECTION)), ["Cats"]);
});

test("a film nobody has said anything about is in none of the five", () => {
  // `null` is the absence of a state and `not_seen` is something the user said.
  // Counting silence there would put films nobody has mentioned into a list of
  // films they told us they have not watched.
  const silent = [film("Sunrise", null), film("Nosferatu", null)];
  assert.deepEqual(tiles(silent), { seen: 0, not_seen: 0, liked: 0, loved: 0, disliked: 0 });

  // And the five together account for every film except those.
  const counted = STATE_TILES.reduce((sum, tile) => sum + selected(tile.name, COLLECTION).length, 0);
  assert.equal(counted, COLLECTION.length - 2, "the five tiles cover the films with no state");
});

test("the films with no state are what the quiet line counts", () => {
  assert.equal(WITHOUT_STATUS.name, null, "without status matches something other than no state");
  assert.deepEqual(titles(selected(WITHOUT_STATUS.name, COLLECTION)), ["Sunrise", "Nosferatu"]);
  assert.equal(selected(WITHOUT_STATUS.name, COLLECTION).length, 2);
});

test("the total counts every film, the ones with no state included", () => {
  // The total is `movies.length` and nothing cleverer: a film Tonight was never
  // told about is still a film the user saved.
  const everything = STATE_TILES.map((tile) => selected(tile.name, COLLECTION))
    .concat([selected(WITHOUT_STATUS.name, COLLECTION)])
    .flat();
  assert.equal(everything.length, COLLECTION.length);
  assert.deepEqual(new Set(titles(everything)), new Set(titles(COLLECTION)));
});

test("what a selection counts is what it opens, for every one of them", () => {
  // The guarantee the summary rests on: one function is asked for the number and
  // asked again for the list, so a tile saying two and opening three films is not
  // a state this can be in.
  for (const selection of [...STATE_TILES, WITHOUT_STATUS]) {
    const list = selected(selection.name, COLLECTION);
    assert.equal(list.length, selected(selection.name, COLLECTION).length);
    for (const movie of list) {
      assert.equal(movie.state, selection.name, `${movie.title} is in the wrong selection`);
    }
  }
});

test("the quiet line reads the same for one film as for many", () => {
  // The phrase does not inflect: it is the count and then what those films are
  // without.
  assert.equal(withoutStatus(1), "1 without status");
  assert.equal(withoutStatus(2), "2 without status");
  assert.equal(withoutStatus(26), "26 without status");
});

test("a new mark moves a film between tiles and leaves the total alone", () => {
  // What happens when a mark is pressed: the page is re-rendered, these
  // functions are asked again with the films the server answered with, and the
  // film is under whichever selection it now belongs to. Nothing was added or
  // removed — one thing was said.
  const after = COLLECTION.map((movie) =>
    movie.title === "Stalker" ? { ...movie, state: "seen" as MovieState } : movie,
  );

  assert.deepEqual(tiles(after), { seen: 2, not_seen: 1, liked: 1, loved: 1, disliked: 1 });
  assert.deepEqual(titles(selected("loved", after)), ["Solaris"]);
  assert.equal(after.length, COLLECTION.length, "the collection changed size");
});

test("saying something about a film takes it out of the quiet line", () => {
  // The case the without-status dialog is for: one of the five is assigned from
  // inside it. The film leaves that selection, the tile it now belongs to counts
  // one more, and the total is untouched.
  const before = COLLECTION;
  const after = before.map((movie) =>
    movie.title === "Sunrise" ? { ...movie, state: "liked" as MovieState } : movie,
  );

  assert.equal(selected(null, before).length, 2);
  assert.equal(selected(null, after).length, 1, "the film is still without status");
  assert.deepEqual(titles(selected(null, after)), ["Nosferatu"]);

  assert.equal(tiles(before).liked, 1);
  assert.equal(tiles(after).liked, 2, "the tile it moved to did not count it");
  assert.equal(after.length, before.length, "the total changed");
});

test("the last film leaving the quiet line empties it", () => {
  // Which is what makes the line disappear from the page — see `overview.test.ts`
  // for the rendering, and for where focus goes when it does.
  const one = [film("Nosferatu", null)];
  const none = one.map((movie) => ({ ...movie, state: "seen" as MovieState }));

  assert.deepEqual(selected(null, none), []);
  assert.equal(withoutStatus(0), "0 without status", "the words still work at zero");
  assert.equal(none.length, 1, "the film left the collection");
});

test("the order films are held in is the order they are shown in", () => {
  // No ordering of the summary's own: every list on the overview is in the
  // store's order, and a dialog that sorted differently would be a second idea
  // about the same films.
  assert.deepEqual(selected("loved", COLLECTION), [COLLECTION[3], COLLECTION[4]]);
});

test("an empty collection counts zeros rather than refusing to", () => {
  assert.deepEqual(tiles([]), { seen: 0, not_seen: 0, liked: 0, loved: 0, disliked: 0 });
  assert.deepEqual(selected(null, []), []);
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
