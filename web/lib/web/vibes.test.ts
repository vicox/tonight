import assert from "node:assert/strict";
import test from "node:test";

import type { Vibe, Movie, Viewing, Written } from "../taste/model.ts";
import type { Judgement } from "../verdicts/model.ts";
import type { Shown } from "./movie-summary.ts";
import { LOVED, selected } from "./movie-summary.ts";
import { filmsIn, filmsUnder, inNoVibe, inOrder, preview, spokenVibe } from "./vibes.ts";

/**
 * What a vibe card counts, and what its dialog opens.
 *
 * The card shows a membership count and — when there is one — how many of those
 * films are loved. Both are read off the films the page was rendered with, so a
 * mark pressed inside the dialog changes them by the next render and by nothing
 * else. That is what these hold; the rendering is in `overview.test.ts`.
 */

const film = (
  title: string,
  judgement: Judgement | null,
  viewing: Viewing | null = null,
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
  film("Dune", null, "unseen"),
  film("Heat", null, "seen"),
  film("Nosferatu", null),
  { ...film("Arrival", "loved"), vibes: ["Space Tension"] },
];

const VIBE: Vibe = {
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

const loved = (vibe: Vibe, movies: readonly Shown[]) => selected(LOVED, filmsIn(vibe, movies)).length;

test("the count is membership, whatever was said about the films", () => {
  // Two loved, one not seen, one seen and one nobody has mentioned: five films
  // in the vibe, and the count is five.
  assert.equal(filmsIn(VIBE, MOVIES).length, 5);
  assert.deepEqual(
    filmsIn(VIBE, MOVIES).map((movie) => movie.position?.judgement ?? null),
    ["loved", "loved", null, null, null],
  );
});

/**
 * The films a genre reaches.
 *
 * A genre holds none itself, so every one of these is the two-hop answer: the
 * vibes built from the genre, and the films in those.
 */

const genre = (name: string) => ({ name, instruction: `Whatever ${name} means here.` });

/** Two vibes that share a genre, and one film that is in both of them. */
const BOTH: Vibe = {
  name: "Space Tension",
  instruction: "Tension with nowhere to run to.",
  genres: ["Slow Burn", "Off World"],
  movies: [
    { title: "Arrival", year: 2000 },
    { title: "Solaris", year: 2000 },
  ],
};

const SHARED: Shown[] = MOVIES.map((movie) =>
  movie.title === "Solaris" ? { ...movie, vibes: ["Quiet Dread", "Space Tension"] } : movie,
);

test("a genre reaches the films in the vibes built from it", () => {
  assert.deepEqual(
    filmsUnder(genre("Mystery"), [VIBE, BOTH], MOVIES).map((movie) => movie.title),
    ["Solaris", "Stalker", "Dune", "Heat", "Nosferatu"],
  );

  // And nothing from a vibe that does not name it: `Off World` is only in the
  // second vibe, so it reaches what that one holds and none of the rest.
  assert.deepEqual(
    filmsUnder(genre("Off World"), [VIBE, BOTH], MOVIES).map((movie) => movie.title),
    ["Solaris", "Arrival"],
  );
});

test("a film reached through two vibes of one genre is listed once", () => {
  // `Slow Burn` is in both vibes and `Solaris` is in both of them.
  const reached = filmsUnder(genre("Slow Burn"), [VIBE, BOTH], SHARED).map((movie) => movie.title);
  assert.deepEqual(reached, ["Solaris", "Stalker", "Dune", "Heat", "Nosferatu", "Arrival"]);
  assert.equal(new Set(reached).size, reached.length, "a film was reached twice and listed twice");
});

test("the films a genre reaches keep the collection's own order", () => {
  // The store's order, not the vibes' — so the answer does not depend on which
  // vibe was written first, and no film moves because a vibe was renamed.
  const collection = [...SHARED].reverse();
  assert.deepEqual(
    filmsUnder(genre("Slow Burn"), [VIBE, BOTH], collection).map((movie) => movie.title),
    collection.map((movie) => movie.title),
  );

  // Membership and nothing about what was said: this reorders nothing and drops
  // nothing for want of an opinion.
  assert.deepEqual(
    filmsUnder(genre("Mystery"), [VIBE], MOVIES).map((movie) => movie.position?.judgement ?? null),
    ["loved", "loved", null, null, null],
  );
});

test("a genre no vibe is built from reaches no films at all", () => {
  // An ordinary state of a taste somebody is still building: a genre named and
  // not yet combined into anything.
  assert.deepEqual(filmsUnder(genre("Noir"), [VIBE, BOTH], MOVIES), []);
  assert.deepEqual(filmsUnder(genre("Mystery"), [], MOVIES), []);

  // As is a vibe with nothing in it yet.
  assert.deepEqual(filmsUnder(genre("Mystery"), [{ ...VIBE, movies: [] }], MOVIES), []);
});

test("a genre reaches films through the same lookup a vibe card counts with", () => {
  // One handle behind which there is no film, so the two would disagree if this
  // resolved membership its own way: the card drops it, and so does the genre.
  const missing: Vibe = { ...VIBE, movies: [...VIBE.movies, { title: "Ghost", year: 1922 }] };
  assert.equal(filmsIn(missing, MOVIES).length, 5);
  assert.equal(filmsUnder(genre("Mystery"), [missing], MOVIES).length, 5);
});

test("a film in another vibe is not in this one", () => {
  assert.equal(
    filmsIn(VIBE, MOVIES).some((movie) => movie.title === "Arrival"),
    false,
    "a loved film from another vibe was counted",
  );
});

test("the loved signal counts exactly the loved films", () => {
  assert.equal(loved(VIBE, MOVIES), 2);
});

test("no loved films is nothing to show, not a zero", () => {
  const nobody = MOVIES.map((movie) =>
    movie.position?.judgement === "loved" ? { ...movie, position: undefined } : movie,
  );
  assert.equal(loved(VIBE, nobody), 0);
});

test("a new mark moves the loved count and leaves membership alone", () => {
  // Pressed inside the dialog: the film is still in the vibe, so the count after
  // the title does not move, and the heart beside it does.
  const after = MOVIES.map((movie) =>
    movie.title === "Dune" ? { ...movie, position: { judgement: "loved" as Judgement } } : movie,
  );
  assert.equal(filmsIn(VIBE, after).length, 5, "membership changed with a verdict");
  assert.equal(loved(VIBE, after), 3);

  const away = MOVIES.map((movie) =>
    movie.title === "Solaris" ? { ...movie, position: { judgement: "liked" as Judgement } } : movie,
  );
  assert.equal(filmsIn(VIBE, away).length, 5, "membership changed with a state");
  assert.equal(loved(VIBE, away), 1);
});

test("a handle with no film behind it is not counted", () => {
  // Cannot happen from one snapshot, and the number on a card still has to be
  // the number of rows its dialog opens.
  const missing: Vibe = { ...VIBE, movies: [...VIBE.movies, { title: "Ghost", year: 1990 }] };
  assert.equal(filmsIn(missing, MOVIES).length, 5);
});

test("an empty vibe counts nothing and says so in the singular's plural", () => {
  const empty: Vibe = { ...VIBE, movies: [] };
  assert.equal(filmsIn(empty, MOVIES).length, 0);
  assert.equal(spokenVibe("Quiet Dread", 0, 0), "Quiet Dread: 0 films");
});

test("what a listener is given is the vibe, said", () => {
  // Including how many films are in it, which the card itself leaves out: spoken
  // it is part of one phrase rather than a second number beside the loved one.
  assert.equal(spokenVibe("Quiet Dread", 4, 3), "Quiet Dread: 4 films, 3 loved");
  assert.equal(spokenVibe("Quiet Dread", 1, 1), "Quiet Dread: 1 film, 1 loved");
  assert.equal(spokenVibe("Quiet Dread", 4, 0), "Quiet Dread: 4 films");
});

/**
 * The three titles a card shows under the name.
 *
 * Which three, and in which order — the part of the card that has a rule rather
 * than a number. Everything here is a pure function of the films the page was
 * rendered with, so what it holds is that the same vibe always previews the same
 * way, and that nothing about the preview reaches a count or the dialog.
 */

/** A film with a date, for the ordering to have something to order by. */
const dated = (
  title: string,
  judgement: Judgement | null,
  createdAt: string | null,
): Shown => ({
  title,
  year: 2000,
  imdbId: null,
  viewing: judgement === null ? null : "seen",
  vibes: ["Quiet Dread"],
  createdAt,
  updatedAt: "2026-01-01T00:00:00.000Z",
  position: judgement === null ? undefined : { judgement },
});

const of = (...films: Shown[]): Vibe => ({
  ...VIBE,
  movies: films.map((film) => ({ title: film.title, year: film.year })),
});

/** The line a card would show for these films. Empty vibes are their own test. */
function lineFor(films: Shown[]): string {
  const line = preview(filmsIn(of(...films), films));
  if (line === null) throw new Error("these films previewed as nothing");
  return line;
}

test("a preview is three titles at most, joined with commas", () => {
  const films = [
    dated("Zodiac", null, "2026-03-01T00:00:00.000Z"),
    dated("Memories of Murder", null, "2026-02-01T00:00:00.000Z"),
    dated("Se7en", null, "2026-01-01T00:00:00.000Z"),
  ];
  assert.equal(lineFor(films), "Zodiac, Memories of Murder, Se7en");
});

test("what is left over is counted, and only when there is any", () => {
  const three = [
    dated("Zodiac", null, "2026-03-01T00:00:00.000Z"),
    dated("Memories of Murder", null, "2026-02-01T00:00:00.000Z"),
    dated("Se7en", null, "2026-01-01T00:00:00.000Z"),
  ];
  // A preview that is the whole vibe promises nothing after it, and does not say
  // "and 0 more" — there is nothing to open it for.
  assert.equal(lineFor(three), "Zodiac, Memories of Murder, Se7en");
  assert.equal(/\bmore\b/.test(lineFor(three)), false, "three films of three promise a fourth");
  assert.equal(/\b0\b/.test(lineFor(three)), false, "nothing left over is counted out loud");

  // One left over is one, said as one: the line is a sentence, not a template
  // with a plural to keep in step with a number.
  const four = [...three, dated("Prisoners", null, "2025-12-01T00:00:00.000Z")];
  assert.equal(lineFor(four), "Zodiac, Memories of Murder, Se7en, and 1 more");

  // And it counts the films the preview left out rather than the vibe: what a
  // reader is deciding against is what is behind the glance.
  const seven = [
    ...four,
    dated("Prisoners II", null, "2025-11-01T00:00:00.000Z"),
    dated("Prisoners III", null, "2025-10-01T00:00:00.000Z"),
    dated("Prisoners IV", null, "2025-09-01T00:00:00.000Z"),
  ];
  assert.equal(lineFor(seven), "Zodiac, Memories of Murder, Se7en, and 4 more");

  // The three shown are still three, whatever is behind them.
  for (const films of [four, seven]) {
    assert.equal(lineFor(films).split(", ").length - 1, 3, "the preview shows a different number");
  }
});

test("an empty vibe has no preview at all", () => {
  assert.equal(preview([]), null);
});

test("loved comes before liked, and liked before everything else", () => {
  const films = [
    dated("Heat", null, "2026-05-01T00:00:00.000Z"),
    dated("Dune", null, "2026-04-01T00:00:00.000Z"),
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

  const liked = loved.map((film) => ({ ...film, position: { judgement: "liked" as Judgement } }));
  assert.equal(lineFor(liked), "Solaris, Andrei Rublev, Stalker");

  const rest = loved.map((film) => ({ ...film, position: undefined }));
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
    dated("Se7en", null, same),
    dated("Zodiac", null, same),
    dated("Memories of Murder", null, same),
  ];
  const once = lineFor(films);
  assert.equal(once, lineFor([...films].reverse()), "the answer depends on the order given");
  assert.equal(once, "Memories of Murder, Se7en, Zodiac", "the tie is not settled by the handle");
});

test("previewing a vibe moves nothing that is counted", () => {
  const films = [
    dated("Solaris", "loved", "2026-01-01T00:00:00.000Z"),
    dated("Stalker", "loved", null),
    dated("Dune", null, "2026-06-01T00:00:00.000Z"),
    dated("Heat", null, "2026-05-01T00:00:00.000Z"),
  ];
  const vibe = of(...films);
  const before = filmsIn(vibe, films);

  preview(before);

  assert.equal(filmsIn(vibe, films).length, 4, "membership changed");
  assert.equal(selected(LOVED, filmsIn(vibe, films)).length, 2, "the loved count changed");
  assert.deepEqual(
    before.map((film) => film.title),
    ["Solaris", "Stalker", "Dune", "Heat"],
    "the films the dialog lists were reordered",
  );
});

/**
 * The order the overview shows vibes in.
 *
 * Five questions asked in turn, each a tie-break of the last, so each one is
 * tested with the ones above it deliberately level and the ones below it
 * deliberately against the answer — otherwise a comparator that ignored a rung
 * would still look right.
 */

/** A vibe with a date of its own, holding the films given. */
function vibeOf(
  name: string,
  createdAt: string | null,
  films: readonly Written<Movie>[],
): Written<Vibe> {
  return {
    name,
    instruction: `What ${name} means.`,
    genres: ["Mystery"],
    movies: films.map((film) => ({ title: film.title, year: film.year })),
    createdAt,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** A film in a named vibe, with a standing judgement and a date. */
function inVibe(
  vibe: string,
  title: string,
  judgement: Judgement | null,
  createdAt: string | null,
): Shown {
  return {
    title,
    year: 2000,
    imdbId: null,
    viewing: judgement === null ? null : "seen",
    vibes: [vibe],
    createdAt,
    updatedAt: "2026-01-01T00:00:00.000Z",
    position: judgement === null ? undefined : { judgement },
  };
}

const JAN = "2026-01-01T00:00:00.000Z";
const JUN = "2026-06-01T00:00:00.000Z";
const names = (vibes: readonly Written<Vibe>[]) => vibes.map((vibe) => vibe.name);

test("more loved comes first, whatever else is true of the two", () => {
  // The one with fewer loved films is newer, has more likes and a newer vibe
  // date. None of that reaches the first question.
  const loved = [inVibe("Loved", "Solaris", "loved", JAN), inVibe("Loved", "Stalker", "loved", JAN)];
  const liked = [
    inVibe("Liked", "Arrival", "loved", JUN),
    inVibe("Liked", "Heat", "liked", JUN),
    inVibe("Liked", "Dune", "liked", JUN),
  ];
  const vibes = [vibeOf("Liked", JUN, liked), vibeOf("Loved", JAN, loved)];

  assert.deepEqual(names(inOrder(vibes, [...loved, ...liked])), ["Loved", "Liked"]);
});

test("level on loved, more liked comes first", () => {
  // One loved film each, so the first question is level. "Two" has the second
  // like and nothing else going for it: "One" has the newer film, the newer vibe
  // and the earlier name, so every question after this one would put "One"
  // first. Only the liked count can produce this order.
  const one = [inVibe("One", "Solaris", "loved", JUN), inVibe("One", "Arrival", "liked", JUN)];
  const two = [
    inVibe("Two", "Stalker", "loved", JAN),
    inVibe("Two", "Heat", "liked", JAN),
    inVibe("Two", "Dune", "liked", JAN),
  ];
  assert.deepEqual(names(inOrder([vibeOf("One", JUN, one), vibeOf("Two", JAN, two)], [...one, ...two])), [
    "Two",
    "One",
  ]);
});

test("level on both counts, the vibe with the newer film comes first", () => {
  const older = [inVibe("Older", "Solaris", "loved", JAN)];
  const newer = [inVibe("Newer", "Stalker", "loved", JUN)];
  // The vibe dates are the other way round on purpose.
  const vibes = [vibeOf("Older", JUN, older), vibeOf("Newer", JAN, newer)];
  assert.deepEqual(names(inOrder(vibes, [...older, ...newer])), ["Newer", "Older"]);
});

test("the newest film is the newest of all of them, whatever was said about it", () => {
  // Both have one loved film, dated the same. What separates them is a film
  // nobody has an opinion on, which still counts as something added to the vibe.
  const quiet = [inVibe("Quiet", "Solaris", "loved", JAN), inVibe("Quiet", "Nosferatu", null, JUN)];
  const still = [inVibe("Still", "Stalker", "loved", JAN), inVibe("Still", "Dune", null, JAN)];
  const vibes = [vibeOf("Still", JUN, still), vibeOf("Quiet", JAN, quiet)];
  assert.deepEqual(names(inOrder(vibes, [...quiet, ...still])), ["Quiet", "Still"]);
});

test("a vibe whose films have no dates falls behind one whose films do", () => {
  const dated = [inVibe("Dated", "Solaris", "loved", JAN)];
  const undated = [inVibe("Undated", "Stalker", "loved", null)];
  const vibes = [vibeOf("Undated", JUN, undated), vibeOf("Dated", JAN, dated)];
  assert.deepEqual(names(inOrder(vibes, [...dated, ...undated])), ["Dated", "Undated"]);

  // And so does a vibe with no films at all, which has no date to offer either.
  const empty = vibeOf("Empty", JUN, []);
  assert.deepEqual(names(inOrder([empty, vibeOf("Dated", JAN, dated)], dated)), ["Dated", "Empty"]);
});

test("level through the films, the newer vibe comes first", () => {
  // Level on both counts and on the film dates, and both vibes have a real date
  // of their own. The winner is named "Zulu" and the loser "Alpha", so the last
  // question — the name — would put them the other way round: only the vibe's own
  // date can produce this order.
  const alpha = [inVibe("Alpha", "Solaris", "loved", JAN)];
  const zulu = [inVibe("Zulu", "Stalker", "loved", JAN)];
  const vibes = [vibeOf("Alpha", JAN, alpha), vibeOf("Zulu", JUN, zulu)];
  assert.deepEqual(names(inOrder(vibes, [...alpha, ...zulu])), ["Zulu", "Alpha"]);
});

test("a vibe with no date of its own falls behind one that has one", () => {
  const one = [inVibe("Undated", "Solaris", "loved", JAN)];
  const two = [inVibe("Dated", "Stalker", "loved", JAN)];
  // Alphabetically "Dated" would win anyway, so the pair is checked both ways
  // round to be sure it is the date and not the name doing the work.
  assert.deepEqual(
    names(inOrder([vibeOf("Undated", null, one), vibeOf("Dated", JAN, two)], [...one, ...two])),
    ["Dated", "Undated"],
  );
  const three = [inVibe("Aaa", "Arrival", "loved", JAN)];
  assert.deepEqual(
    names(inOrder([vibeOf("Zzz", JAN, two), vibeOf("Aaa", null, three)], [...two, ...three])),
    ["Zzz", "Aaa"],
  );
});

test("vibes that are alike in every way come out by name", () => {
  const films = [
    inVibe("Beta", "Solaris", "loved", JAN),
    inVibe("Alpha", "Stalker", "loved", JAN),
    inVibe("Gamma", "Arrival", "loved", JAN),
  ];
  const vibes = [vibeOf("Beta", JAN, [films[0]]), vibeOf("Gamma", JAN, [films[2]]), vibeOf("Alpha", JAN, [films[1]])];
  assert.deepEqual(names(inOrder(vibes, films)), ["Alpha", "Beta", "Gamma"]);
});

test("the vibes it was given are left as they were", () => {
  const films = [inVibe("Beta", "Solaris", "loved", JAN), inVibe("Alpha", "Stalker", "liked", JAN)];
  const vibes = [vibeOf("Alpha", JAN, [films[1]]), vibeOf("Beta", JAN, [films[0]])];
  const given = [...vibes];

  assert.deepEqual(names(inOrder(vibes, films)), ["Beta", "Alpha"], "the order is not the rule's");
  assert.deepEqual(vibes, given, "the array it was given was sorted in place");
});

test("ordering the vibes moves nothing inside them", () => {
  const films = [
    inVibe("Quiet Dread", "Solaris", "loved", JAN),
    inVibe("Quiet Dread", "Nosferatu", null, null),
    inVibe("Quiet Dread", "Stalker", "liked", JUN),
  ];
  const vibe = vibeOf("Quiet Dread", JAN, films);

  const membership = filmsIn(vibe, films).map((film) => film.title);
  const lovedCount = selected(LOVED, filmsIn(vibe, films)).length;
  const glance = preview(filmsIn(vibe, films));

  inOrder([vibe], films);

  assert.deepEqual(filmsIn(vibe, films).map((film) => film.title), membership, "membership moved");
  assert.equal(selected(LOVED, filmsIn(vibe, films)).length, lovedCount, "the loved count moved");
  assert.equal(preview(filmsIn(vibe, films)), glance, "the preview changed");
  assert.deepEqual(
    membership,
    ["Solaris", "Nosferatu", "Stalker"],
    "the order the dialog lists them in is not the store's",
  );
});

/**
 * The films that are in no vibe.
 *
 * Exactly which films, and in exactly the order they came — the two things a
 * filter is easy to get almost right about. The fixtures are ordered on purpose,
 * so dropping one, reversing them or letting a filed film through all read as
 * failures rather than as a different-looking pass.
 */

test("the remainder is every film in no vibe, and nothing else", () => {
  const movies: Shown[] = [
    { ...dated("Loose one", "loved", JAN), vibes: [] },
    { ...dated("Filed", null, JAN), vibes: ["Quiet Dread"] },
    { ...dated("Loose two", null, null), vibes: [] },
    { ...dated("Filed twice", "liked", JAN), vibes: ["Quiet Dread", "Slow Cinema"] },
    { ...dated("Loose three", "disliked", JUN), vibes: [] },
  ];

  assert.deepEqual(
    inNoVibe(movies).map((movie) => movie.title),
    ["Loose one", "Loose two", "Loose three"],
    "the remainder is not exactly the films in no vibe, in the order they came",
  );
});

test("the remainder keeps the order it was given", () => {
  // Deliberately not alphabetical and not by date, so any sort would show.
  const movies: Shown[] = ["Zulu", "Alpha", "Mike"].map((title, index) => ({
    ...dated(title, null, index === 1 ? JUN : JAN),
    vibes: [],
  }));

  assert.deepEqual(inNoVibe(movies).map((movie) => movie.title), ["Zulu", "Alpha", "Mike"]);
});

test("every film filed somewhere, and the remainder is empty", () => {
  const movies = [{ ...dated("Filed", null, JAN), vibes: ["Quiet Dread"] }];
  assert.deepEqual(inNoVibe(movies), []);
  assert.deepEqual(inNoVibe([]), []);
});

test("no vibes at all, and every film is the remainder", () => {
  // What the page looks like before anybody has made a vibe: the films are all
  // in none of them, and the one way to them has to be there.
  const movies: Shown[] = ["One", "Two", "Three"].map((title) => ({
    ...dated(title, null, JAN),
    vibes: [],
  }));

  assert.equal(inNoVibe(movies).length, 3);
  assert.deepEqual(inOrder([], movies), [], "there are no vibes to order");
});

test("the films it was given are left as they were", () => {
  const movies: Shown[] = [
    { ...dated("Loose", "loved", JAN), vibes: [] },
    { ...dated("Filed", null, JAN), vibes: ["Quiet Dread"] },
  ];
  const given = [...movies];
  inNoVibe(movies);
  assert.deepEqual(movies, given, "the array it was given was changed");
});
