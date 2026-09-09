import assert from "node:assert/strict";
import test from "node:test";

import type { Movie, MovieState } from "../taste/model.ts";
import {
  DISLIKED,
  FACTS,
  LIKED,
  LOVED,
  NOT_SEEN,
  OPINIONS,
  OTHER_MOVIES,
  SEEN,
  WITHOUT_OPINION,
  WITHOUT_STATUS,
  filedUnder,
  selected,
  sentence,
  spoken,
  type Selection,
} from "./movie-summary.ts";

/**
 * The summary's arithmetic: what each control counts, and what the counts add
 * up to.
 *
 * All of it is a pure function of the films the page was rendered with, which is
 * what makes it testable here rather than through a browser: pressing a mark is
 * a write and a re-render, and what this holds is that the same films always
 * produce the same answers. The rendering decisions are in `overview.test.ts`.
 *
 * The thing to protect is the hierarchy. `Seen` is an aggregate — the bare state
 * plus the three opinions — and the two invariants at the bottom of this file
 * are what stop it drifting back into being a sixth peer that happens to be
 * named after a column.
 */

/** A film, with only the parts a count or a row cares about spelled out. */
function film(title: string, state: MovieState | null, mixes: string[] = []): Movie {
  return { title, year: 2000, imdbId: null, state, mixes };
}

/**
 * A collection with every state in it, more than one of some, and two films
 * nobody has said anything about — so a count that matched by accident is a
 * count that fails here.
 */
const COLLECTION: Movie[] = [
  film("Heat", "seen"),
  film("Sunset", "seen"),
  film("Dune", "not_seen", ["Space Tension"]),
  film("Arrival", "liked", ["Space Tension"]),
  film("Solaris", "loved", ["Quiet Dread"]),
  film("Stalker", "loved", ["Quiet Dread", "Slow Cinema"]),
  film("Cats", "disliked", ["Popcorn Chaos"]),
  film("Sunrise", null, ["Slow Cinema"]),
  film("Nosferatu", null),
];

const titles = (movies: readonly Movie[]) => movies.map((movie) => movie.title);
const count = (selection: Selection, movies: readonly Movie[] = COLLECTION) =>
  selected(selection, movies).length;

/** Every control the summary renders, whatever the collection looks like. */
const KNOWN: readonly Selection[] = [...FACTS, ...OPINIONS, WITHOUT_OPINION];

test("the total is the collection, films nobody has spoken about included", () => {
  // Not a selection at all: it belongs beside the heading the way a genre count
  // does, and a film Tonight was never told about is still a film the user saved.
  assert.equal(COLLECTION.length, 9);
  assert.equal(
    COLLECTION.filter((one) => one.state === null).length,
    2,
    "the collection has no silent films to include",
  );
  assert.equal(
    KNOWN.some((selection) => selection.states.length === 0),
    false,
    "a selection stands for no state at all",
  );
});

test("Not seen is exactly what the user said they have not seen", () => {
  assert.deepEqual(NOT_SEEN.states, ["not_seen"]);
  assert.deepEqual(titles(selected(NOT_SEEN, COLLECTION)), ["Dune"]);
  assert.equal(count(NOT_SEEN), 1);
});

test("Seen is every film watched, opinion or not", () => {
  // The correction this layout exists for. Liking a film says you watched it, so
  // a count under this word that matched only the bare state would tell somebody
  // with forty loved films that they had seen two.
  assert.deepEqual([...SEEN.states].sort(), ["disliked", "liked", "loved", "seen"]);
  assert.deepEqual(titles(selected(SEEN, COLLECTION)), [
    "Heat",
    "Sunset",
    "Arrival",
    "Solaris",
    "Stalker",
    "Cats",
  ]);
  assert.equal(count(SEEN), 6);

  // And it never claims a film nobody has spoken about.
  assert.equal(
    selected(SEEN, COLLECTION).some((one) => one.state === null),
    false,
    "silence was counted as having watched something",
  );
  assert.equal(
    selected(SEEN, COLLECTION).some((one) => one.state === "not_seen"),
    false,
    "a film they said they had not seen was counted as seen",
  );
});

test("each opinion is exactly its own state", () => {
  assert.deepEqual(LOVED.states, ["loved"]);
  assert.deepEqual(LIKED.states, ["liked"]);
  assert.deepEqual(DISLIKED.states, ["disliked"]);

  assert.deepEqual(titles(selected(LOVED, COLLECTION)), ["Solaris", "Stalker"]);
  assert.deepEqual(titles(selected(LIKED, COLLECTION)), ["Arrival"]);
  assert.deepEqual(titles(selected(DISLIKED, COLLECTION)), ["Cats"]);
});

test("without opinion is exactly the bare seen state", () => {
  // Named for what it is rather than for the word in the column: under a line
  // that already says "Seen", a second control called "Seen" is unreadable.
  assert.deepEqual(WITHOUT_OPINION.states, ["seen"]);
  assert.deepEqual(titles(selected(WITHOUT_OPINION, COLLECTION)), ["Heat", "Sunset"]);
  assert.equal(count(WITHOUT_OPINION), 2);
});

test("without status is exactly the films with no state", () => {
  // `null` is the absence of an answer and `not_seen` is something the user
  // said. Counting silence there would put films nobody has mentioned into a
  // list of films they told us they have not watched.
  assert.deepEqual(WITHOUT_STATUS.states, [null]);
  assert.deepEqual(titles(selected(WITHOUT_STATUS, COLLECTION)), ["Sunrise", "Nosferatu"]);
  assert.equal(count(WITHOUT_STATUS), 2);
});

test("the total is not seen, plus seen, plus without status", () => {
  // The first invariant, over the collection above and over a handful of shapes
  // that have caught this kind of thing before.
  for (const movies of [
    COLLECTION,
    [],
    [film("only", null)],
    [film("a", "seen"), film("b", "loved")],
    [film("a", "not_seen"), film("b", "not_seen")],
    COLLECTION.filter((one) => one.state !== null),
  ]) {
    assert.equal(
      count(NOT_SEEN, movies) + count(SEEN, movies) + count(WITHOUT_STATUS, movies),
      movies.length,
      `the three do not account for ${JSON.stringify(titles(movies))}`,
    );
  }
});

test("seen is loved, plus liked, plus disliked, plus without opinion", () => {
  // The second invariant, and the one the indent on the page is claiming. If
  // these ever disagree, the layout is telling the reader something false about
  // the collection.
  for (const movies of [
    COLLECTION,
    [],
    [film("only", "seen")],
    [film("a", "loved"), film("b", "loved"), film("c", "disliked")],
    [film("a", null), film("b", "not_seen")],
  ]) {
    assert.equal(
      count(LOVED, movies) +
        count(LIKED, movies) +
        count(DISLIKED, movies) +
        count(WITHOUT_OPINION, movies),
      count(SEEN, movies),
      `the parts do not make up Seen for ${JSON.stringify(titles(movies))}`,
    );
  }
});

test("what a control counts is what it opens, for every one of them", () => {
  // The guarantee the summary rests on: one function is asked for the number and
  // asked again for the list, so a control saying two and opening three films is
  // not a state this can be in.
  for (const selection of [...KNOWN, WITHOUT_STATUS]) {
    const list = selected(selection, COLLECTION);
    assert.equal(list.length, count(selection), `${selection.key} counts and lists differently`);
    for (const movie of list) {
      assert.ok(
        selection.states.includes(movie.state),
        `${movie.title} is in ${selection.key}, which does not stand for ${String(movie.state)}`,
      );
    }
  }
});

test("every known-state control still exists when its count is nought", () => {
  // The navigation has to be learnable, so it does not rearrange itself around
  // an empty collection. The controls are a fixed list; only the numbers move.
  const silent = [film("Sunrise", null), film("Nosferatu", null)];

  for (const selection of KNOWN) {
    assert.equal(count(selection, silent), 0, `${selection.key} found something`);
  }
  assert.deepEqual(
    KNOWN.map((selection) => selection.key),
    ["not_seen", "seen", "loved", "liked", "disliked", "without_opinion"],
    "the six controls are not a fixed list in a fixed order",
  );

  // And without status is the one that comes and goes, so it has to be countable
  // to nought as well — the page is what leaves it out.
  assert.equal(count(WITHOUT_STATUS, [film("Heat", "seen")]), 0);
});

test("a mark pressed in the dialog moves the film through the hierarchy", () => {
  // What a re-render does, as arithmetic. Nothing here adjusts a count: the page
  // is given new films and asks the same questions again.
  const before = [film("Heat", "seen"), film("Dune", "not_seen"), film("Sunrise", null)];
  assert.deepEqual(
    [count(SEEN, before), count(WITHOUT_OPINION, before), count(LOVED, before)],
    [1, 1, 0],
  );

  // Watched, nothing said → loved. It stays inside Seen and moves between its
  // children, which is exactly what the indent claims.
  const loved = before.map((one) => (one.title === "Heat" ? film("Heat", "loved") : one));
  assert.deepEqual(
    [count(SEEN, loved), count(WITHOUT_OPINION, loved), count(LOVED, loved)],
    [1, 0, 1],
  );

  // Never told → not seen. It leaves the quiet line and joins a fact, and the
  // total is unchanged because no film went anywhere.
  const stated = loved.map((one) => (one.title === "Sunrise" ? film("Sunrise", "not_seen") : one));
  assert.deepEqual(
    [count(NOT_SEEN, stated), count(WITHOUT_STATUS, stated), count(SEEN, stated)],
    [2, 0, 1],
  );
  assert.equal(
    count(NOT_SEEN, stated) + count(SEEN, stated) + count(WITHOUT_STATUS, stated),
    stated.length,
  );
});

test("the two sentence-shaped controls read as sentences", () => {
  // One template for one and for many, because the phrase does not inflect.
  assert.equal(sentence(WITHOUT_OPINION, 30), "30 without opinion");
  assert.equal(sentence(WITHOUT_STATUS, 1), "1 without status");
  assert.equal(sentence(WITHOUT_STATUS, 0), "0 without status");

  // The others are set the other way round and are not phrased at all.
  for (const selection of [...FACTS, ...OPINIONS]) {
    assert.equal(selection.phrase, undefined, `${selection.key} has an inline phrase`);
  }
});

test("only the two ambiguous words are given a second sentence to a listener", () => {
  // The visible text is words then number, which is also how it is said — so for
  // most of these the control's own text is the accessible name and a label would
  // be reading the obvious out twice.
  assert.equal(spoken(NOT_SEEN, 14), undefined);
  assert.equal(spoken(LOVED, 3), undefined);
  assert.equal(spoken(LIKED, 5), undefined);
  assert.equal(spoken(DISLIKED, 0), undefined);

  // These two are true but not sufficient on their own.
  assert.equal(spoken(SEEN, 38), "Seen 38, every film you have watched, opinion or not");
  assert.equal(
    spoken(WITHOUT_OPINION, 30),
    "Without opinion 30, watched, with nothing said about it",
  );
});

test("a film in no mix is filed under the words the page already uses", () => {
  assert.deepEqual(filedUnder(film("Nosferatu", null)), [OTHER_MOVIES]);
  assert.deepEqual(filedUnder(film("Stalker", "loved", ["Quiet Dread", "Slow Cinema"])), [
    "Quiet Dread",
    "Slow Cinema",
  ]);
});
