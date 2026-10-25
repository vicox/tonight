import assert from "node:assert/strict";
import test from "node:test";

import type { Movie, Viewing, Written } from "../taste/model.ts";
import type { Judgement, Standing } from "../verdicts/model.ts";
import { positions, withPositions, type Position } from "./judgements.ts";
import {
  DISLIKED,
  LIKED,
  LOVED,
  DONT_WANT_TO_SEE,
  NO_OPINION,
  OTHER_MOVIES,
  SAID,
  SEEN,
  WANT_TO_SEE,
  WATCHED,
  filedUnder,
  recentlyAdded,
  selected,
  sentence,
  spoken,
  type Selection,
  type Shown,
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
 * ## Two rows, and why the old invariant is gone rather than adjusted
 *
 * This used to hold that six controls summed to the collection with nothing
 * counted twice. They could, because a film had exactly one state out of five
 * and the sixth was having none. A film now answers two independent questions —
 * whether it was watched, and what the user said about it — and is in one
 * bucket of each. A film can be seen *and* loved, so a single row cannot be
 * exhaustive and must not be made to look as though it is.
 *
 * So the invariant is per row, asserted twice, and the thing being protected is
 * that neither row quietly stops accounting for every film.
 */

/** A film, with only the parts a count or a row cares about spelled out. */
function film(
  title: string,
  viewing: Viewing,
  judgement: Judgement | null = null,
  vibes: string[] = [],
): Shown {
  const position: Position | undefined = judgement === null ? undefined : { judgement };
  return {
    title,
    year: 2000,
    imdbId: null,
    viewing,
    vibes,
    createdAt: null,
    updatedAt: "2024-01-01T00:00:00.000000Z",
    position,
  };
}

/**
 * A collection covering both axes and their combinations.
 *
 * Every viewing answer, every judgement, a film that is seen *and* judged, and
 * two that are judged while the list says they are not seen — the contradiction
 * a user can create. A count that matched by accident is a count that fails here.
 */
const COLLECTION: Shown[] = [
  film("Heat", "seen"),
  film("Sunset", "seen"),
  film("Dune", "want-to-see", null, ["Space Tension"]),
  film("Arrival", "seen", "liked", ["Space Tension"]),
  film("Solaris", "want-to-see", "loved", ["Quiet Dread"]),
  film("Stalker", "seen", "loved", ["Quiet Dread", "Slow Cinema"]),
  film("Cats", "dont-want-to-see", "disliked", ["Popcorn Chaos"]),
  film("Sunrise", "want-to-see", null, ["Slow Cinema"]),
  film("Nosferatu", "dont-want-to-see"),
];

const titles = (movies: readonly Shown[]) => movies.map((movie) => movie.title);
const count = (selection: Selection, movies: readonly Shown[] = COLLECTION) =>
  selected(selection, movies).length;

/** Every control the summary can render. */
const KNOWN: readonly Selection[] = [...WATCHED, ...SAID];

test("the total is the collection, films nobody has judged included", () => {
  // Not a selection at all: it belongs beside the heading the way a genre count
  // does, and a film with no opinion on it is still a film the user saved.
  assert.equal(COLLECTION.length, 9);
  assert.equal(
    COLLECTION.filter((one) => one.position === undefined).length,
    5,
    "the collection has no unjudged films to include",
  );
});

test("Seen is what they said, and what a judgement implies", () => {
  // The derived one. `Solaris` is on the list to see and is here because it is
  // loved — nobody likes a film they have not seen — and `Cats` is here despite
  // saying `dont-want-to-see`, because the opinion is the stronger evidence
  // about watching. That is `lib/seen.ts`'s rule, so the page and a recommendation
  // cannot disagree about what "seen" means.
  assert.deepEqual(titles(selected(SEEN, COLLECTION)), [
    "Heat",
    "Sunset",
    "Arrival",
    "Solaris",
    "Stalker",
    "Cats",
  ]);

  // And it never claims a film whose list says otherwise and nothing implies it.
  assert.equal(
    selected(SEEN, COLLECTION).some((one) => one.viewing !== "seen" && one.position === undefined),
    false,
    "a film on the list was counted as having been watched",
  );
});

test("Want to see is the list, where nothing contradicts it", () => {
  // `Solaris` is on the list and loved, which is a contradiction the user can
  // create. The row resolves it the way everything else does — the opinion wins
  // — so `Solaris` is counted as seen and not here, and the three buckets stay
  // exclusive. Nothing is hidden: the raw viewing is still on the film's mark.
  assert.deepEqual(titles(selected(WANT_TO_SEE, COLLECTION)), ["Dune", "Sunrise"]);
  assert.equal(count(SEEN, [film("Solaris", "want-to-see", "loved")]), 1);
  assert.equal(count(WANT_TO_SEE, [film("Solaris", "want-to-see", "loved")]), 0);
});

test("Don't want to see is what they said, where nothing contradicts it", () => {
  assert.deepEqual(titles(selected(DONT_WANT_TO_SEE, COLLECTION)), ["Nosferatu"]);
  assert.equal(count(SEEN, [film("Cats", "dont-want-to-see", "disliked")]), 1);
  assert.equal(count(DONT_WANT_TO_SEE, [film("Cats", "dont-want-to-see", "disliked")]), 0);
});

test("each opinion is exactly its own standing judgement", () => {
  assert.deepEqual(titles(selected(LOVED, COLLECTION)), ["Solaris", "Stalker"]);
  assert.deepEqual(titles(selected(LIKED, COLLECTION)), ["Arrival"]);
  assert.deepEqual(titles(selected(DISLIKED, COLLECTION)), ["Cats"]);

  // A viewing is never an opinion. Two films here are `seen` with nothing said,
  // and no opinion control may claim them.
  for (const opinion of [LOVED, LIKED, DISLIKED]) {
    assert.equal(
      selected(opinion, COLLECTION).some((one) => one.position?.judgement === undefined),
      false,
      `${opinion.label} counted a film with no standing judgement`,
    );
  }
});

test("No opinion is exactly the films with no standing judgement, refusals included", () => {
  assert.deepEqual(titles(selected(NO_OPINION, COLLECTION)), [
    "Heat",
    "Sunset",
    "Dune",
    "Sunrise",
    "Nosferatu",
  ]);

  assert.equal(NO_OPINION.label, "No opinion");
});

test("a film they do not want recommended is in No opinion, and is not seen either", () => {
  // The reason the bucket is not called "nothing said", built the way the page
  // builds it rather than asserted about a film with nothing on it. Not wanting
  // a film recommended is a great deal said — and it is where the film stands on
  // their list, not a judgement, so the film belongs here.
  const nothingStands: Standing[] = [];
  const [shown] = withPositions(
    [{ ...film("Solaris", "dont-want-to-see"), title: "Solaris", year: 1972 }],
    positions(nothingStands),
  );
  assert.ok(shown);
  assert.equal(shown.position?.judgement, undefined, "a viewing arrived as a judgement");

  assert.equal(count(NO_OPINION, [shown]), 1, "a film they do not want is not counted as unjudged");
  for (const opinion of [LIKED, LOVED, DISLIKED]) {
    assert.equal(count(opinion, [shown]), 0, `not wanting a film was counted as ${opinion.label}`);
  }

  // And it says nothing about having watched it: it is its own answer.
  assert.equal(count(SEEN, [shown]), 0, "not wanting a film was read as having watched it");
  assert.equal(count(DONT_WANT_TO_SEE, [shown]), 1, "the film is not where its viewing puts it");
});

test("a film on the list to see and never judged is in No opinion", () => {
  assert.equal(count(NO_OPINION, [film("Unwatched", "want-to-see")]), 1);
  assert.equal(count(WANT_TO_SEE, [film("Unwatched", "want-to-see")]), 1, "the raw fact stopped being shown");
});

test("each row accounts for every film exactly once, and the rows are independent", () => {
  // The invariant the summary rests on, now asserted per row. A film is in one
  // bucket of *each*, so the two rows each sum to the collection and the two
  // sums are of the same films counted two different ways.
  for (const movies of [
    COLLECTION,
    [],
    [film("only", "want-to-see")],
    [film("a", "seen"), film("b", "want-to-see", "loved")],
    [film("a", "dont-want-to-see"), film("b", "want-to-see")],
    [film("a", "seen", "loved"), film("b", "dont-want-to-see", "loved"), film("c", "want-to-see", "disliked")],
    COLLECTION.filter((one) => one.viewing !== "seen"),
  ]) {
    const shape = JSON.stringify(titles(movies));

    for (const [name, row] of [["watched", WATCHED], ["said", SAID]] as const) {
      assert.equal(
        row.reduce((sum, selection) => sum + count(selection, movies), 0),
        movies.length,
        `the ${name} row does not account for ${shape}`,
      );
      for (const movie of movies) {
        assert.equal(
          row.filter((selection) => selection.holds(movie)).length,
          1,
          `${movie.title} is in more than one ${name} control in ${shape}`,
        );
      }
    }
  }
});

test("a film can be in both rows at once, which is why they are two rows", () => {
  // The thing the six-bucket arrangement could not express, stated as its own
  // contract so nobody folds the rows back together.
  const both = [film("Stalker", "seen", "loved")];
  assert.equal(count(SEEN, both), 1);
  assert.equal(count(LOVED, both), 1);
  assert.equal(
    WATCHED.reduce((sum, one) => sum + count(one, both), 0) +
      SAID.reduce((sum, one) => sum + count(one, both), 0),
    2,
    "one film did not land in both rows",
  );
});

test("what a control counts is what it opens, for every one of them", () => {
  // The guarantee the summary rests on: one function is asked for the number and
  // asked again for the list, so a control saying two and opening three films is
  // not a state this can be in.
  for (const selection of KNOWN) {
    const list = selected(selection, COLLECTION);
    assert.equal(list.length, count(selection), `${selection.key} counts and lists differently`);
    for (const movie of list) {
      assert.ok(selection.holds(movie), `${movie.title} is in ${selection.key} and does not belong`);
    }
  }
});

test("the controls are a fixed list in a fixed order, countable to nought", () => {
  // The navigation has to be learnable, so it does not rearrange itself around
  // an empty collection. The page is what leaves an empty one out; the list here
  // does not move.
  assert.deepEqual(
    KNOWN.map((selection) => selection.key),
    ["seen", "want_to_see", "dont_want_to_see", "liked", "loved", "disliked", "no_opinion"],
    "the controls are not a fixed list in a fixed order",
  );

  const nothing: Shown[] = [];
  for (const selection of KNOWN) {
    assert.equal(count(selection, nothing), 0, `${selection.key} found something in nothing`);
  }
});

test("a mark pressed in the dialog moves the film through both rows", () => {
  // Pressing is a write and a re-render, so what this holds is that the same
  // film with a different answer is counted somewhere else — and that changing
  // one axis leaves the other exactly where it was.
  const watched = [film("Heat", "seen")];
  assert.equal(count(SEEN, watched), 1);
  assert.equal(count(NO_OPINION, watched), 1, "a film with no verdict is not in No opinion");

  const judged = [film("Heat", "seen", "loved")];
  assert.equal(count(SEEN, judged), 1, "recording an opinion changed what is known about watching");
  assert.equal(count(LOVED, judged), 1);
  assert.equal(count(NO_OPINION, judged), 0);

  const taken = [film("Heat", "seen")];
  assert.equal(count(LOVED, taken), 0, "a withdrawn opinion still counted");
  assert.equal(count(SEEN, taken), 1, "taking an opinion back changed the viewing fact");
});

test("the sentence-shaped controls read as sentences", () => {
  // One template for one and for many, because the phrase does not inflect.
  for (const [selection, words] of [[NO_OPINION, "with no opinion"]] as const) {
    assert.equal(sentence(selection, 4), `4 ${words}`);
    assert.equal(sentence(selection, 1), `1 ${words}`);
    assert.equal(sentence(selection, 0), `0 ${words}`);
  }

  // The answers are set the other way round and are not phrased at all.
  for (const selection of [SEEN, WANT_TO_SEE, DONT_WANT_TO_SEE, LIKED, LOVED, DISLIKED]) {
    assert.equal(selection.phrase, undefined, `${selection.key} has an inline phrase`);
  }
});

test("only the one ambiguous word is given a second sentence to a listener", () => {
  // The visible text is words then number, which is also how it is said — so for
  // most of these the control's own text is the accessible name and a label would
  // be reading the obvious out twice.
  assert.equal(spoken(WANT_TO_SEE, 14), undefined);
  assert.equal(spoken(DONT_WANT_TO_SEE, 2), undefined);
  assert.equal(spoken(LOVED, 3), undefined);
  assert.equal(spoken(LIKED, 5), undefined);
  assert.equal(spoken(DISLIKED, 0), undefined);
  assert.equal(spoken(NO_OPINION, 4), "No opinion 4, nothing said about what they made of it");

  // This one is true but not sufficient on its own: "Seen" counts films nobody
  // ever marked, because a judgement puts them there.
  assert.equal(spoken(SEEN, 38), "Seen 38, watched, or judged — which means watched");
});

test("a film in no vibe is filed under the words the page already uses", () => {
  assert.deepEqual(filedUnder(film("Nosferatu", "want-to-see")), [OTHER_MOVIES]);
  assert.deepEqual(filedUnder(film("Stalker", "seen", "loved", ["Quiet Dread", "Slow Cinema"])), [
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

/** A film with a date, and marks that must not matter. */
const saved = (
  title: string,
  createdAt: string | null,
  viewing: Viewing = "want-to-see",
): Written<Movie> => ({
  title,
  year: 2000,
  imdbId: null,
  viewing,
  vibes: [],
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
  // the oldest is loved, with on-the-list, not-wanted and liked in between. Any
  // comparator that looked at the state first — loved before liked before the
  // rest, as the vibe preview quite reasonably does — would answer in very nearly
  // the opposite order. And the input is scrambled, so input order cannot pass
  // for date order either.
  const movies = [
    saved("Loved", daysAgo(4.5), "seen"),
    saved("Not wanted", daysAgo(2.5), "dont-want-to-see"),
    saved("Disliked", daysAgo(0.5), "seen"),
    saved("Liked", daysAgo(3.5), "seen"),
    saved("On the list", daysAgo(1.5), "want-to-see"),
  ];

  assert.deepEqual(titlesOf(recentlyAdded(movies, NOW)), [
    "Disliked",
    "On the list",
    "Not wanted",
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
