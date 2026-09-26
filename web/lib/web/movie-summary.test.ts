import assert from "node:assert/strict";
import test from "node:test";

import type { Movie, Viewing, Written } from "../taste/model.ts";
import type { Judgement, Standing } from "../verdicts/model.ts";
import { positions, withPositions, type Position } from "./judgements.ts";
import {
  DISLIKED,
  LIKED,
  LOVED,
  NO_OPINION,
  NOT_SEEN,
  OTHER_MOVIES,
  SAID,
  SEEN,
  WATCHED,
  WATCHING_UNSAID,
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
  viewing: Viewing | null,
  judgement: Judgement | null = null,
  mixes: string[] = [],
): Shown {
  const position: Position | undefined = judgement === null ? undefined : { judgement };
  return {
    title,
    year: 2000,
    imdbId: null,
    viewing,
    mixes,
    createdAt: null,
    updatedAt: "2024-01-01T00:00:00.000000Z",
    position,
  };
}

/**
 * A collection covering both axes and their combinations.
 *
 * Every viewing answer, every judgement, a film that is seen *and* judged, one
 * that is explicitly unseen while judged — the contradiction a user can create —
 * and two nobody has said anything about at all. A count that matched by
 * accident is a count that fails here.
 */
const COLLECTION: Shown[] = [
  film("Heat", "seen"),
  film("Sunset", "seen"),
  film("Dune", "unseen", null, ["Space Tension"]),
  film("Arrival", "seen", "liked", ["Space Tension"]),
  film("Solaris", null, "loved", ["Quiet Dread"]),
  film("Stalker", "seen", "loved", ["Quiet Dread", "Slow Cinema"]),
  film("Cats", "unseen", "disliked", ["Popcorn Chaos"]),
  film("Sunrise", null, null, ["Slow Cinema"]),
  film("Nosferatu", null),
];

const titles = (movies: readonly Shown[]) => movies.map((movie) => movie.title);
const count = (selection: Selection, movies: readonly Shown[] = COLLECTION) =>
  selected(selection, movies).length;

/** Every control the summary can render. */
const KNOWN: readonly Selection[] = [...WATCHED, ...SAID];

test("the total is the collection, films nobody has spoken about included", () => {
  // Not a selection at all: it belongs beside the heading the way a genre count
  // does, and a film Tonight was never told about is still a film the user saved.
  assert.equal(COLLECTION.length, 9);
  assert.equal(
    COLLECTION.filter((one) => one.viewing === null && one.position === undefined).length,
    2,
    "the collection has no silent films to include",
  );
});

test("Seen is what they said, and what a judgement implies", () => {
  // The derived one. `Solaris` has no viewing at all and is here because it is
  // loved — nobody likes a film they have not seen — and `Cats` is here despite
  // saying `unseen`, because the opinion is the stronger evidence about
  // watching. That is `lib/seen.ts`'s rule, so the page and a recommendation
  // cannot disagree about what "seen" means.
  assert.deepEqual(titles(selected(SEEN, COLLECTION)), [
    "Heat",
    "Sunset",
    "Arrival",
    "Solaris",
    "Stalker",
    "Cats",
  ]);

  // And it never claims a film nobody has said anything about.
  assert.equal(
    selected(SEEN, COLLECTION).some((one) => one.viewing === null && one.position === undefined),
    false,
    "silence was counted as having watched something",
  );
});

test("Not seen is what they said, where nothing contradicts it", () => {
  // `Cats` says `unseen` and is judged, which is a contradiction the user can
  // create. The row resolves it the way everything else does — the opinion wins
  // — so `Cats` is counted as seen and not here, and the three buckets stay
  // exclusive. Nothing is hidden: the raw `unseen` is still on the film's mark.
  assert.deepEqual(titles(selected(NOT_SEEN, COLLECTION)), ["Dune"]);
  assert.equal(count(SEEN, [film("Cats", "unseen", "disliked")]), 1);
  assert.equal(count(NOT_SEEN, [film("Cats", "unseen", "disliked")]), 0);
});

test("Not said is nobody having said, and never the same as not seen", () => {
  // `null` is the absence of an answer and `unseen` is something the user said.
  // A film that counts as seen through a judgement is not here either — that is
  // something Tonight does know.
  assert.deepEqual(titles(selected(WATCHING_UNSAID, COLLECTION)), ["Sunrise", "Nosferatu"]);
  assert.equal(
    selected(WATCHING_UNSAID, COLLECTION).some((one) => one.viewing === "unseen"),
    false,
    "something they said was counted as silence",
  );
  assert.equal(
    selected(WATCHING_UNSAID, COLLECTION).some((one) => one.position?.judgement !== undefined),
    false,
    "a judged film was counted as nobody having said",
  );
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

test("a film turned down for good is in No opinion, and is not seen either", () => {
  // The reason the bucket is not called "nothing said", built the way the page
  // builds it rather than asserted about a film with nothing on it. A standing
  // `not-ever` is a great deal said — and it is still not a judgement, so the
  // film belongs here.
  const refused: Standing[] = [
    { title: "Solaris", year: 1972, rejected: "not-ever", reason: "three hours of misery", told: "confirmed" },
  ];
  const [shown] = withPositions(
    [{ ...film("Solaris", null), title: "Solaris", year: 1972 }],
    positions(refused),
  );
  assert.ok(shown);

  // The refusal reached the page as a refusal and not as an opinion: nothing
  // about it became a judgement on the way through.
  assert.equal(shown.position?.judgement, undefined, "a refusal arrived as a judgement");

  assert.equal(count(NO_OPINION, [shown]), 1, "a refused film is not counted as unjudged");
  for (const opinion of [LIKED, LOVED, DISLIKED]) {
    assert.equal(count(opinion, [shown]), 0, `a refusal was counted as ${opinion.label}`);
  }

  // And it says nothing about watching, in either direction: `not ever` is most
  // often said about a film somebody has never seen.
  assert.equal(count(SEEN, [shown]), 0, "a refusal was read as having watched it");
  assert.equal(count(WATCHING_UNSAID, [shown]), 1, "the refusal decided the watching question");
});

test("an evening's refusal never reaches a page showing a collection", () => {
  // `positions` takes global claims only. A `not-tonight` belongs to one evening
  // and a collection is not an evening — carrying it here would turn a Tuesday's
  // mood into a fact about the film.
  const tonight: Standing[] = [
    { title: "Heat", year: 1995, rejected: "not-tonight", occasion: "evening-tuesday", told: "confirmed" },
  ];
  assert.equal(positions(tonight).size, 0);

  // And neither does an evening-scoped judgement, which is the same rule and
  // the easier one to get wrong.
  const loved: Standing[] = [
    { title: "Heat", year: 1995, judgement: "loved", occasion: "evening-tuesday", told: "volunteered" },
  ];
  assert.equal(positions(loved).size, 0, "an evening's judgement became the standing one");
});

test("a film the user marked unseen and never judged is in No opinion", () => {
  assert.equal(count(NO_OPINION, [film("Unwatched", "unseen")]), 1);
  assert.equal(count(NOT_SEEN, [film("Unwatched", "unseen")]), 1, "the raw fact stopped being shown");
});

test("each row accounts for every film exactly once, and the rows are independent", () => {
  // The invariant the summary rests on, now asserted per row. A film is in one
  // bucket of *each*, so the two rows each sum to the collection and the two
  // sums are of the same films counted two different ways.
  for (const movies of [
    COLLECTION,
    [],
    [film("only", null)],
    [film("a", "seen"), film("b", null, "loved")],
    [film("a", "unseen"), film("b", "unseen")],
    [film("a", "seen", "loved"), film("b", null, "loved"), film("c", "unseen", "disliked")],
    COLLECTION.filter((one) => one.viewing !== null),
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
    ["seen", "unseen", "watching_unsaid", "liked", "loved", "disliked", "no_opinion"],
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
  for (const [selection, words] of [
    [NO_OPINION, "with no opinion"],
    [WATCHING_UNSAID, "not said"],
  ] as const) {
    assert.equal(sentence(selection, 4), `4 ${words}`);
    assert.equal(sentence(selection, 1), `1 ${words}`);
    assert.equal(sentence(selection, 0), `0 ${words}`);
  }

  // The answers are set the other way round and are not phrased at all.
  for (const selection of [SEEN, NOT_SEEN, LIKED, LOVED, DISLIKED]) {
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
  assert.equal(spoken(NO_OPINION, 4), "No opinion 4, nothing said about what they made of it");

  // These two are true but not sufficient on their own. "Seen" counts films
  // nobody ever marked, because a judgement puts them there; "Not said" is about
  // watching and sits in a row beside an opinion control with a similar name.
  assert.equal(spoken(SEEN, 38), "Seen 38, watched, or judged — which means watched");
  assert.equal(
    spoken(WATCHING_UNSAID, 4),
    "Not said 4, nobody has said whether they watched it",
  );
});

test("a film in no mix is filed under the words the page already uses", () => {
  assert.deepEqual(filedUnder(film("Nosferatu", null)), [OTHER_MOVIES]);
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
  viewing: Viewing | null = null,
): Written<Movie> => ({
  title,
  year: 2000,
  imdbId: null,
  viewing,
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
    saved("Loved", daysAgo(4.5), "seen"),
    saved("Not seen", daysAgo(2.5), "unseen"),
    saved("Disliked", daysAgo(0.5), "seen"),
    saved("Liked", daysAgo(3.5), "seen"),
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
