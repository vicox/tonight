import assert from "node:assert/strict";
import test from "node:test";

import type { Mix, Movie, MovieState, Written } from "../taste/model.ts";
import { LOVED, selected } from "./movie-summary.ts";
import { filmsIn, filmsUnder, inNoMix, inOrder, preview, spokenMix } from "./mixes.ts";

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

const loved = (mix: Mix, movies: readonly Movie[]) => selected(LOVED, filmsIn(mix, movies)).length;

test("the count is membership, whatever was said about the films", () => {
  // Two loved, one not seen, one seen and one nobody has mentioned: five films
  // in the mix, and the count is five.
  assert.equal(filmsIn(MIX, MOVIES).length, 5);
  assert.deepEqual(
    filmsIn(MIX, MOVIES).map((movie) => movie.state),
    ["loved", "loved", "not_seen", "seen", null],
  );
});

/**
 * The films a genre reaches.
 *
 * A genre holds none itself, so every one of these is the two-hop answer: the
 * mixes built from the genre, and the films in those.
 */

const genre = (name: string) => ({ name, instruction: `Whatever ${name} means here.` });

/** Two mixes that share a genre, and one film that is in both of them. */
const BOTH: Mix = {
  name: "Space Tension",
  instruction: "Tension with nowhere to run to.",
  genres: ["Slow Burn", "Off World"],
  movies: [
    { title: "Arrival", year: 2000 },
    { title: "Solaris", year: 2000 },
  ],
};

const SHARED: Movie[] = MOVIES.map((movie) =>
  movie.title === "Solaris" ? { ...movie, mixes: ["Quiet Dread", "Space Tension"] } : movie,
);

test("a genre reaches the films in the mixes built from it", () => {
  assert.deepEqual(
    filmsUnder(genre("Mystery"), [MIX, BOTH], MOVIES).map((movie) => movie.title),
    ["Solaris", "Stalker", "Dune", "Heat", "Nosferatu"],
  );

  // And nothing from a mix that does not name it: `Off World` is only in the
  // second mix, so it reaches what that one holds and none of the rest.
  assert.deepEqual(
    filmsUnder(genre("Off World"), [MIX, BOTH], MOVIES).map((movie) => movie.title),
    ["Solaris", "Arrival"],
  );
});

test("a film reached through two mixes of one genre is listed once", () => {
  // `Slow Burn` is in both mixes and `Solaris` is in both of them.
  const reached = filmsUnder(genre("Slow Burn"), [MIX, BOTH], SHARED).map((movie) => movie.title);
  assert.deepEqual(reached, ["Solaris", "Stalker", "Dune", "Heat", "Nosferatu", "Arrival"]);
  assert.equal(new Set(reached).size, reached.length, "a film was reached twice and listed twice");
});

test("the films a genre reaches keep the collection's own order", () => {
  // The store's order, not the mixes' — so the answer does not depend on which
  // mix was written first, and no film moves because a mix was renamed.
  const collection = [...SHARED].reverse();
  assert.deepEqual(
    filmsUnder(genre("Slow Burn"), [MIX, BOTH], collection).map((movie) => movie.title),
    collection.map((movie) => movie.title),
  );

  // Membership and nothing about state: this reorders nothing and drops nothing
  // for want of an opinion.
  assert.deepEqual(
    filmsUnder(genre("Mystery"), [MIX], MOVIES).map((movie) => movie.state),
    ["loved", "loved", "not_seen", "seen", null],
  );
});

test("a genre no mix is built from reaches no films at all", () => {
  // An ordinary state of a taste somebody is still building: a genre named and
  // not yet combined into anything.
  assert.deepEqual(filmsUnder(genre("Noir"), [MIX, BOTH], MOVIES), []);
  assert.deepEqual(filmsUnder(genre("Mystery"), [], MOVIES), []);

  // As is a mix with nothing in it yet.
  assert.deepEqual(filmsUnder(genre("Mystery"), [{ ...MIX, movies: [] }], MOVIES), []);
});

test("a genre reaches films through the same lookup a mix card counts with", () => {
  // One handle behind which there is no film, so the two would disagree if this
  // resolved membership its own way: the card drops it, and so does the genre.
  const missing: Mix = { ...MIX, movies: [...MIX.movies, { title: "Ghost", year: 1922 }] };
  assert.equal(filmsIn(missing, MOVIES).length, 5);
  assert.equal(filmsUnder(genre("Mystery"), [missing], MOVIES).length, 5);
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

test("what a listener is given is the mix, said", () => {
  // Including how many films are in it, which the card itself leaves out: spoken
  // it is part of one phrase rather than a second number beside the loved one.
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

test("what is left over is counted, and only when there is any", () => {
  const three = [
    dated("Zodiac", "seen", "2026-03-01T00:00:00.000Z"),
    dated("Memories of Murder", "seen", "2026-02-01T00:00:00.000Z"),
    dated("Se7en", "seen", "2026-01-01T00:00:00.000Z"),
  ];
  // A preview that is the whole mix promises nothing after it, and does not say
  // "and 0 more" — there is nothing to open it for.
  assert.equal(lineFor(three), "Zodiac, Memories of Murder, Se7en");
  assert.equal(/\bmore\b/.test(lineFor(three)), false, "three films of three promise a fourth");
  assert.equal(/\b0\b/.test(lineFor(three)), false, "nothing left over is counted out loud");

  // One left over is one, said as one: the line is a sentence, not a template
  // with a plural to keep in step with a number.
  const four = [...three, dated("Prisoners", "seen", "2025-12-01T00:00:00.000Z")];
  assert.equal(lineFor(four), "Zodiac, Memories of Murder, Se7en, and 1 more");

  // And it counts the films the preview left out rather than the mix: what a
  // reader is deciding against is what is behind the glance.
  const seven = [
    ...four,
    dated("Prisoners II", "seen", "2025-11-01T00:00:00.000Z"),
    dated("Prisoners III", "seen", "2025-10-01T00:00:00.000Z"),
    dated("Prisoners IV", "seen", "2025-09-01T00:00:00.000Z"),
  ];
  assert.equal(lineFor(seven), "Zodiac, Memories of Murder, Se7en, and 4 more");

  // The three shown are still three, whatever is behind them.
  for (const films of [four, seven]) {
    assert.equal(lineFor(films).split(", ").length - 1, 3, "the preview shows a different number");
  }
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
  assert.equal(lineFor(films), "Solaris, Arrival, Heat, and 1 more");
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
  assert.equal(selected(LOVED, filmsIn(mix, films)).length, 2, "the loved count changed");
  assert.deepEqual(
    before.map((film) => film.title),
    ["Solaris", "Stalker", "Dune", "Heat"],
    "the films the dialog lists were reordered",
  );
});

/**
 * The order the overview shows mixes in.
 *
 * Five questions asked in turn, each a tie-break of the last, so each one is
 * tested with the ones above it deliberately level and the ones below it
 * deliberately against the answer — otherwise a comparator that ignored a rung
 * would still look right.
 */

/** A mix with a date of its own, holding the films given. */
function mixOf(
  name: string,
  createdAt: string | null,
  films: readonly Written<Movie>[],
): Written<Mix> {
  return {
    name,
    instruction: `What ${name} means.`,
    genres: ["Mystery"],
    movies: films.map((film) => ({ title: film.title, year: film.year })),
    createdAt,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** A film in a named mix, with a state and a date. */
function inMix(
  mix: string,
  title: string,
  state: MovieState | null,
  createdAt: string | null,
): Written<Movie> {
  return {
    title,
    year: 2000,
    imdbId: null,
    state,
    mixes: [mix],
    createdAt,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const JAN = "2026-01-01T00:00:00.000Z";
const JUN = "2026-06-01T00:00:00.000Z";
const names = (mixes: readonly Written<Mix>[]) => mixes.map((mix) => mix.name);

test("more loved comes first, whatever else is true of the two", () => {
  // The one with fewer loved films is newer, has more likes and a newer mix
  // date. None of that reaches the first question.
  const loved = [inMix("Loved", "Solaris", "loved", JAN), inMix("Loved", "Stalker", "loved", JAN)];
  const liked = [
    inMix("Liked", "Arrival", "loved", JUN),
    inMix("Liked", "Heat", "liked", JUN),
    inMix("Liked", "Dune", "liked", JUN),
  ];
  const mixes = [mixOf("Liked", JUN, liked), mixOf("Loved", JAN, loved)];

  assert.deepEqual(names(inOrder(mixes, [...loved, ...liked])), ["Loved", "Liked"]);
});

test("level on loved, more liked comes first", () => {
  // One loved film each, so the first question is level. "Two" has the second
  // like and nothing else going for it: "One" has the newer film, the newer mix
  // and the earlier name, so every question after this one would put "One"
  // first. Only the liked count can produce this order.
  const one = [inMix("One", "Solaris", "loved", JUN), inMix("One", "Arrival", "liked", JUN)];
  const two = [
    inMix("Two", "Stalker", "loved", JAN),
    inMix("Two", "Heat", "liked", JAN),
    inMix("Two", "Dune", "liked", JAN),
  ];
  assert.deepEqual(names(inOrder([mixOf("One", JUN, one), mixOf("Two", JAN, two)], [...one, ...two])), [
    "Two",
    "One",
  ]);
});

test("level on both counts, the mix with the newer film comes first", () => {
  const older = [inMix("Older", "Solaris", "loved", JAN)];
  const newer = [inMix("Newer", "Stalker", "loved", JUN)];
  // The mix dates are the other way round on purpose.
  const mixes = [mixOf("Older", JUN, older), mixOf("Newer", JAN, newer)];
  assert.deepEqual(names(inOrder(mixes, [...older, ...newer])), ["Newer", "Older"]);
});

test("the newest film is the newest of all of them, whatever was said about it", () => {
  // Both have one loved film, dated the same. What separates them is a film
  // nobody has an opinion on, which still counts as something added to the mix.
  const quiet = [inMix("Quiet", "Solaris", "loved", JAN), inMix("Quiet", "Nosferatu", null, JUN)];
  const still = [inMix("Still", "Stalker", "loved", JAN), inMix("Still", "Dune", "not_seen", JAN)];
  const mixes = [mixOf("Still", JUN, still), mixOf("Quiet", JAN, quiet)];
  assert.deepEqual(names(inOrder(mixes, [...quiet, ...still])), ["Quiet", "Still"]);
});

test("a mix whose films have no dates falls behind one whose films do", () => {
  const dated = [inMix("Dated", "Solaris", "loved", JAN)];
  const undated = [inMix("Undated", "Stalker", "loved", null)];
  const mixes = [mixOf("Undated", JUN, undated), mixOf("Dated", JAN, dated)];
  assert.deepEqual(names(inOrder(mixes, [...dated, ...undated])), ["Dated", "Undated"]);

  // And so does a mix with no films at all, which has no date to offer either.
  const empty = mixOf("Empty", JUN, []);
  assert.deepEqual(names(inOrder([empty, mixOf("Dated", JAN, dated)], dated)), ["Dated", "Empty"]);
});

test("level through the films, the newer mix comes first", () => {
  // Level on both counts and on the film dates, and both mixes have a real date
  // of their own. The winner is named "Zulu" and the loser "Alpha", so the last
  // question — the name — would put them the other way round: only the mix's own
  // date can produce this order.
  const alpha = [inMix("Alpha", "Solaris", "loved", JAN)];
  const zulu = [inMix("Zulu", "Stalker", "loved", JAN)];
  const mixes = [mixOf("Alpha", JAN, alpha), mixOf("Zulu", JUN, zulu)];
  assert.deepEqual(names(inOrder(mixes, [...alpha, ...zulu])), ["Zulu", "Alpha"]);
});

test("a mix with no date of its own falls behind one that has one", () => {
  const one = [inMix("Undated", "Solaris", "loved", JAN)];
  const two = [inMix("Dated", "Stalker", "loved", JAN)];
  // Alphabetically "Dated" would win anyway, so the pair is checked both ways
  // round to be sure it is the date and not the name doing the work.
  assert.deepEqual(
    names(inOrder([mixOf("Undated", null, one), mixOf("Dated", JAN, two)], [...one, ...two])),
    ["Dated", "Undated"],
  );
  const three = [inMix("Aaa", "Arrival", "loved", JAN)];
  assert.deepEqual(
    names(inOrder([mixOf("Zzz", JAN, two), mixOf("Aaa", null, three)], [...two, ...three])),
    ["Zzz", "Aaa"],
  );
});

test("mixes that are alike in every way come out by name", () => {
  const films = [
    inMix("Beta", "Solaris", "loved", JAN),
    inMix("Alpha", "Stalker", "loved", JAN),
    inMix("Gamma", "Arrival", "loved", JAN),
  ];
  const mixes = [mixOf("Beta", JAN, [films[0]]), mixOf("Gamma", JAN, [films[2]]), mixOf("Alpha", JAN, [films[1]])];
  assert.deepEqual(names(inOrder(mixes, films)), ["Alpha", "Beta", "Gamma"]);
});

test("the mixes it was given are left as they were", () => {
  const films = [inMix("Beta", "Solaris", "loved", JAN), inMix("Alpha", "Stalker", "liked", JAN)];
  const mixes = [mixOf("Alpha", JAN, [films[1]]), mixOf("Beta", JAN, [films[0]])];
  const given = [...mixes];

  assert.deepEqual(names(inOrder(mixes, films)), ["Beta", "Alpha"], "the order is not the rule's");
  assert.deepEqual(mixes, given, "the array it was given was sorted in place");
});

test("ordering the mixes moves nothing inside them", () => {
  const films = [
    inMix("Quiet Dread", "Solaris", "loved", JAN),
    inMix("Quiet Dread", "Nosferatu", null, null),
    inMix("Quiet Dread", "Stalker", "liked", JUN),
  ];
  const mix = mixOf("Quiet Dread", JAN, films);

  const membership = filmsIn(mix, films).map((film) => film.title);
  const lovedCount = selected(LOVED, filmsIn(mix, films)).length;
  const glance = preview(filmsIn(mix, films));

  inOrder([mix], films);

  assert.deepEqual(filmsIn(mix, films).map((film) => film.title), membership, "membership moved");
  assert.equal(selected(LOVED, filmsIn(mix, films)).length, lovedCount, "the loved count moved");
  assert.equal(preview(filmsIn(mix, films)), glance, "the preview changed");
  assert.deepEqual(
    membership,
    ["Solaris", "Nosferatu", "Stalker"],
    "the order the dialog lists them in is not the store's",
  );
});

/**
 * The films that are in no mix.
 *
 * Exactly which films, and in exactly the order they came — the two things a
 * filter is easy to get almost right about. The fixtures are ordered on purpose,
 * so dropping one, reversing them or letting a filed film through all read as
 * failures rather than as a different-looking pass.
 */

test("the remainder is every film in no mix, and nothing else", () => {
  const movies: Written<Movie>[] = [
    { ...dated("Loose one", "loved", JAN), mixes: [] },
    { ...dated("Filed", "seen", JAN), mixes: ["Quiet Dread"] },
    { ...dated("Loose two", null, null), mixes: [] },
    { ...dated("Filed twice", "liked", JAN), mixes: ["Quiet Dread", "Slow Cinema"] },
    { ...dated("Loose three", "disliked", JUN), mixes: [] },
  ];

  assert.deepEqual(
    inNoMix(movies).map((movie) => movie.title),
    ["Loose one", "Loose two", "Loose three"],
    "the remainder is not exactly the films in no mix, in the order they came",
  );
});

test("the remainder keeps the order it was given", () => {
  // Deliberately not alphabetical and not by date, so any sort would show.
  const movies: Written<Movie>[] = ["Zulu", "Alpha", "Mike"].map((title, index) => ({
    ...dated(title, "seen", index === 1 ? JUN : JAN),
    mixes: [],
  }));

  assert.deepEqual(inNoMix(movies).map((movie) => movie.title), ["Zulu", "Alpha", "Mike"]);
});

test("every film filed somewhere, and the remainder is empty", () => {
  const movies = [{ ...dated("Filed", "seen", JAN), mixes: ["Quiet Dread"] }];
  assert.deepEqual(inNoMix(movies), []);
  assert.deepEqual(inNoMix([]), []);
});

test("no mixes at all, and every film is the remainder", () => {
  // What the page looks like before anybody has made a mix: the films are all
  // in none of them, and the one way to them has to be there.
  const movies: Written<Movie>[] = ["One", "Two", "Three"].map((title) => ({
    ...dated(title, null, JAN),
    mixes: [],
  }));

  assert.equal(inNoMix(movies).length, 3);
  assert.deepEqual(inOrder([], movies), [], "there are no mixes to order");
});

test("the films it was given are left as they were", () => {
  const movies: Written<Movie>[] = [
    { ...dated("Loose", "loved", JAN), mixes: [] },
    { ...dated("Filed", "seen", JAN), mixes: ["Quiet Dread"] },
  ];
  const given = [...movies];
  inNoMix(movies);
  assert.deepEqual(movies, given, "the array it was given was changed");
});
