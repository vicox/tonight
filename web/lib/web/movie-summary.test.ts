import assert from "node:assert/strict";
import test from "node:test";

import type { Movie, MovieState, Written } from "../taste/model.ts";
import {
  DISLIKED,
  FACTS,
  LIKED,
  LOVED,
  NOT_SEEN,
  OPINIONS,
  OTHER_MOVIES,
  SEEN,
  WITHOUT_STATUS,
  filedUnder,
  recentlyAdded,
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
 * The thing to protect is that the row is a list of parts and not a sum. Every
 * control is exactly one state, so each film is counted once and somewhere; the
 * invariant below is what stops `Seen` drifting back into an aggregate that
 * counts the three opinions a second time.
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
const KNOWN: readonly Selection[] = [...FACTS, ...OPINIONS];

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

test("Seen is exactly the bare seen state", () => {
  // Not an aggregate. `Loved`, `Liked` and `Disliked` are named beside it in the
  // same row, so counting them here would count three of the others twice and
  // make the row read as a sum of itself.
  assert.deepEqual(SEEN.states, ["seen"]);
  assert.deepEqual(titles(selected(SEEN, COLLECTION)), ["Heat", "Sunset"]);
  assert.equal(count(SEEN), 2);

  for (const opinion of OPINIONS) {
    for (const state of opinion.states) {
      assert.equal(
        SEEN.states.includes(state),
        false,
        `Seen also counts ${String(state)}, which ${opinion.label} already counts`,
      );
    }
  }

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

test("without status is exactly the films with no state", () => {
  // `null` is the absence of an answer and `not_seen` is something the user
  // said. Counting silence there would put films nobody has mentioned into a
  // list of films they told us they have not watched.
  assert.deepEqual(WITHOUT_STATUS.states, [null]);
  assert.deepEqual(titles(selected(WITHOUT_STATUS, COLLECTION)), ["Sunrise", "Nosferatu"]);
  assert.equal(count(WITHOUT_STATUS), 2);
});

test("the row accounts for every film exactly once", () => {
  // The invariant the one-line summary rests on, over the collection above and
  // over a handful of shapes that have caught this kind of thing before. If a
  // control ever aggregates another, a film lands in two of these and the sum
  // overshoots the number in the heading.
  const ROW = [...FACTS, ...OPINIONS, WITHOUT_STATUS];

  for (const movies of [
    COLLECTION,
    [],
    [film("only", null)],
    [film("a", "seen"), film("b", "loved")],
    [film("a", "not_seen"), film("b", "not_seen")],
    [film("a", "loved"), film("b", "loved"), film("c", "disliked")],
    COLLECTION.filter((one) => one.state !== null),
  ]) {
    const shape = JSON.stringify(titles(movies));
    assert.equal(
      ROW.reduce((sum, selection) => sum + count(selection, movies), 0),
      movies.length,
      `the row does not account for ${shape}`,
    );
    for (const movie of movies) {
      assert.equal(
        ROW.filter((selection) => selection.states.includes(movie.state)).length,
        1,
        `${movie.title} is counted by more than one control in ${shape}`,
      );
    }
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
    ["not_seen", "seen", "liked", "loved", "disliked"],
    "the five controls are not a fixed list in a fixed order",
  );

  // And without status is the one that comes and goes, so it has to be countable
  // to nought as well — the page is what leaves it out.
  assert.equal(count(WITHOUT_STATUS, [film("Heat", "seen")]), 0);
});

test("a mark pressed in the dialog moves the film through the hierarchy", () => {
  // What a re-render does, as arithmetic. Nothing here adjusts a count: the page
  // is given new films and asks the same questions again.
  const before = [film("Heat", "seen"), film("Dune", "not_seen"), film("Sunrise", null)];
  assert.deepEqual([count(SEEN, before), count(LOVED, before)], [1, 0]);

  // Watched, nothing said → loved. It leaves Seen for Loved rather than staying
  // in both: the row is a list of parts, so a film is only ever in one of them.
  const loved = before.map((one) => (one.title === "Heat" ? film("Heat", "loved") : one));
  assert.deepEqual([count(SEEN, loved), count(LOVED, loved)], [0, 1]);

  // Never told → not seen. It leaves the quiet line and joins a fact, and the
  // total is unchanged because no film went anywhere.
  const stated = loved.map((one) => (one.title === "Sunrise" ? film("Sunrise", "not_seen") : one));
  assert.deepEqual(
    [count(NOT_SEEN, stated), count(WITHOUT_STATUS, stated), count(SEEN, stated)],
    [2, 0, 0],
  );
  assert.equal(
    count(NOT_SEEN, stated) + count(SEEN, stated) + count(LOVED, stated) + count(WITHOUT_STATUS, stated),
    stated.length,
  );
});

test("the sentence-shaped control reads as a sentence", () => {
  // One template for one and for many, because the phrase does not inflect.
  assert.equal(sentence(WITHOUT_STATUS, 4), "4 without status");
  assert.equal(sentence(WITHOUT_STATUS, 1), "1 without status");
  assert.equal(sentence(WITHOUT_STATUS, 0), "0 without status");

  // The others are set the other way round and are not phrased at all.
  for (const selection of [...FACTS, ...OPINIONS]) {
    assert.equal(selection.phrase, undefined, `${selection.key} has an inline phrase`);
  }
});

test("only the one ambiguous word is given a second sentence to a listener", () => {
  // The visible text is words then number, which is also how it is said — so for
  // most of these the control's own text is the accessible name and a label would
  // be reading the obvious out twice.
  assert.equal(spoken(NOT_SEEN, 14), undefined);
  assert.equal(spoken(LOVED, 3), undefined);
  assert.equal(spoken(LIKED, 5), undefined);
  assert.equal(spoken(DISLIKED, 0), undefined);

  // This one is true but not sufficient on its own: read out beside the three
  // opinions, "Seen" sounds like it might cover them too.
  assert.equal(spoken(SEEN, 38), "Seen 38, watched, with nothing said about it");
  assert.equal(spoken(WITHOUT_STATUS, 4), undefined);
});

test("a film in no mix is filed under the words the page already uses", () => {
  assert.deepEqual(filedUnder(film("Nosferatu", null)), [OTHER_MOVIES]);
  assert.deepEqual(filedUnder(film("Stalker", "loved", ["Quiet Dread", "Slow Cinema"])), [
    "Quiet Dread",
    "Slow Cinema",
  ]);
});

/**
 * The films saved in the last week.
 *
 * The instant is given rather than taken, so these are about the rule and not
 * about when the suite happened to run.
 */

const NOW = new Date("2026-09-09T12:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

/** A film with a date, and a mark that must not matter. */
const saved = (title: string, createdAt: string | null, state: MovieState | null = null): Written<Movie> => ({
  title,
  year: 2000,
  imdbId: null,
  state,
  mixes: [],
  createdAt,
  // Deliberately today for every one of them: a list built on this would put
  // them all in, in an order of its own.
  updatedAt: NOW.toISOString(),
});

const titlesOf = (movies: readonly Written<Movie>[]) => movies.map((movie) => movie.title);

test("recently added is the last seven days, newest first", () => {
  const movies = [
    saved("Older", daysAgo(3)),
    saved("Newest", daysAgo(0.1)),
    saved("Middle", daysAgo(1)),
  ];
  assert.deepEqual(titlesOf(recentlyAdded(movies, NOW)), ["Newest", "Middle", "Older"]);
});

test("the seven-day edge: just inside, exactly on it, just outside", () => {
  const movies = [
    saved("Just inside", daysAgo(6.999)),
    saved("Exactly seven", daysAgo(7)),
    saved("Just outside", daysAgo(7.001)),
    saved("Long gone", daysAgo(30)),
  ];
  // The boundary itself is in: seven days ago is still within the last seven.
  assert.deepEqual(titlesOf(recentlyAdded(movies, NOW)), ["Just inside", "Exactly seven"]);
});

test("a film with no creation date is not recent, it is undated", () => {
  const movies = [saved("Dated", daysAgo(1)), saved("Undated", null)];
  assert.deepEqual(titlesOf(recentlyAdded(movies, NOW)), ["Dated"]);
});

test("every film from the week, however many, and however they arrive", () => {
  // Fourteen films, all inside the week, handed over scrambled — and the four
  // oldest deliberately first, so an answer that took the input as it came, or
  // cut it before sorting, would be visible. There is no cap: the week is the
  // limit, and the number on the control has to be the list it opens.
  const movies = [
    saved("Aged 6.9", daysAgo(6.9)),
    saved("Aged 6.5", daysAgo(6.5)),
    saved("Aged 6", daysAgo(6)),
    saved("Aged 5.5", daysAgo(5.5)),
    saved("Aged 2.5", daysAgo(2.5)),
    saved("Aged 5", daysAgo(5)),
    saved("Aged 0.5", daysAgo(0.5)),
    saved("Aged 4", daysAgo(4)),
    saved("Aged 3", daysAgo(3)),
    saved("Aged 1.5", daysAgo(1.5)),
    saved("Aged 4.5", daysAgo(4.5)),
    saved("Aged 2", daysAgo(2)),
    saved("Aged 3.5", daysAgo(3.5)),
    saved("Aged 1", daysAgo(1)),
  ];

  assert.deepEqual(titlesOf(recentlyAdded(movies, NOW)), [
    "Aged 0.5",
    "Aged 1",
    "Aged 1.5",
    "Aged 2",
    "Aged 2.5",
    "Aged 3",
    "Aged 3.5",
    "Aged 4",
    "Aged 4.5",
    "Aged 5",
    "Aged 5.5",
    "Aged 6",
    "Aged 6.5",
    "Aged 6.9",
  ]);

  // Said as the thing that used to be capped: more than ten is more than ten.
  assert.equal(recentlyAdded(movies, NOW).length, 14, "something is still cutting the list");
});

test("what was said about a film decides neither whether it is recent nor where", () => {
  // The states run against the dates on purpose: the newest film is disliked and
  // the oldest is loved, with nothing-said, not-seen and liked in between. Any
  // comparator that looked at the state first — loved before liked before the
  // rest, as the mix preview quite reasonably does — would answer in very nearly
  // the opposite order. And the input is scrambled, so input order cannot pass
  // for date order either.
  const movies = [
    saved("Loved", daysAgo(4.5), "loved"),
    saved("Not seen", daysAgo(2.5), "not_seen"),
    saved("Disliked", daysAgo(0.5), "disliked"),
    saved("Liked", daysAgo(3.5), "liked"),
    saved("Nothing said", daysAgo(1.5), null),
  ];

  assert.deepEqual(titlesOf(recentlyAdded(movies, NOW)), [
    "Disliked",
    "Nothing said",
    "Not seen",
    "Liked",
    "Loved",
  ]);
});

test("a mark pressed today does not make an old film recent", () => {
  // Every fixture here carries today's `updatedAt`, which is exactly what a
  // list built on the wrong column would use.
  const movies = [saved("Old", daysAgo(40)), saved("New", daysAgo(2))];
  assert.deepEqual(titlesOf(recentlyAdded(movies, NOW)), ["New"]);
});

test("nothing recent is an empty answer, not an absent one", () => {
  assert.deepEqual(recentlyAdded([saved("Old", daysAgo(40))], NOW), []);
  assert.deepEqual(recentlyAdded([], NOW), []);
});

test("the collection it was given is left as it was", () => {
  const movies = [saved("Older", daysAgo(3)), saved("Newest", daysAgo(0.1))];
  const given = [...movies];
  recentlyAdded(movies, NOW);
  assert.deepEqual(movies, given, "the array it was given was sorted in place");
});
