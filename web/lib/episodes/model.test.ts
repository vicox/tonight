import assert from "node:assert/strict";
import test from "node:test";

import {
  beginEpisode,
  EpisodeError,
  MAX_OFFERED,
  MAX_REQUEST_LENGTH,
  stateOutcome,
  type Episode,
  type Offer,
} from "./model.ts";

/**
 * The episode model, held to the one thing it exists to get right.
 *
 * Most of these contracts are about what the model refuses to express. An
 * episode that can only hold established facts is worth little if a caller can
 * reach the same wrong history by another route, so the tests below try the
 * routes: inferring an outcome from the offer, inferring one outcome from
 * another, and claiming a film that was never on the table.
 */

const offers: Offer[] = [
  { title: "Prisoners", year: 2013, lead: true },
  { title: "Zodiac", year: 2007, lead: false },
];

const evening = (): Episode => beginEpisode("something tense tonight", offers);

test("an episode records what was asked in their words", () => {
  const episode = beginEpisode("  something tense tonight  ", offers);
  assert.equal(episode.request, "something tense tonight");
});

test("an episode records what was offered, including that nothing was", () => {
  assert.deepEqual(evening().offered, offers);
  assert.deepEqual(beginEpisode("anything", []).offered, []);
});

test("every outcome starts unknown, and beginning one cannot start it anywhere else", () => {
  const episode = evening();
  assert.equal(episode.chosen.known, false);
  assert.equal(episode.watched.known, false);
  assert.equal(episode.finished.known, false);

  // The signature is the guard: there is no third parameter to pass an outcome in.
  assert.equal(beginEpisode.length, 2);
});

test("a recommendation does not imply a choice", () => {
  // One film offered, and it led. Nothing about the episode says it was chosen.
  const episode = beginEpisode("something tense", [{ title: "Prisoners", year: 2013, lead: true }]);
  assert.equal(episode.chosen.known, false);
});

test("a choice does not imply it was watched", () => {
  const episode = stateOutcome(evening(), { chosen: offers[0] });
  assert.equal(episode.chosen.known, true);
  assert.equal(episode.watched.known, false, "watching was inferred from choosing");
  assert.equal(episode.finished.known, false);
});

test("watching does not imply finishing", () => {
  const episode = stateOutcome(evening(), { watched: true });
  assert.equal(episode.watched.known, true);
  assert.equal(episode.finished.known, false, "finishing was inferred from watching");
});

test("finishing implies nothing further — there is nowhere to record a verdict", () => {
  const episode = stateOutcome(evening(), { watched: true, finished: true });
  assert.equal(episode.finished.known, true);
  // M2 owns verdicts. If this key ever appears, the milestone boundary moved.
  assert.equal("liked" in episode, false, "a verdict field appeared in M1");
  assert.deepEqual(Object.keys(episode).sort(), [
    "chosen",
    "finished",
    "offered",
    "request",
    "watched",
  ]);
});

test("an established choice never later becomes a watching", () => {
  // The chain has to hold across statements, not only within one. Once chosen is
  // established, a later statement about something else must leave watched alone.
  const chosen = stateOutcome(evening(), { chosen: offers[0] });
  const later = stateOutcome(chosen, { finished: null });
  assert.equal(later.watched.known, false, "watching was derived from an earlier choice");
});

test("an established watching never later becomes a finishing", () => {
  const watched = stateOutcome(evening(), { watched: true });
  const later = stateOutcome(watched, { chosen: offers[0] });
  assert.equal(later.finished.known, false, "finishing was derived from an earlier watching");
});

test("an established outcome says the user is its source", () => {
  const episode = stateOutcome(evening(), { watched: true });
  assert.equal(episode.watched.known && episode.watched.source, "stated");
});

test("a stated no is not the same as nobody saying", () => {
  const said = stateOutcome(evening(), { watched: false });
  assert.equal(said.watched.known, true, "a stated no was stored as silence");
  assert.equal(said.watched.known && said.watched.value, false);

  const silent = evening();
  assert.equal(silent.watched.known, false);
});

test("null retracts a field to unknown rather than to a false value", () => {
  const said = stateOutcome(evening(), { watched: true, finished: true });
  const taken = stateOutcome(said, { finished: null });
  assert.equal(taken.finished.known, false, "a retraction left a value behind");
  assert.equal(taken.watched.known, true, "a retraction touched a field it was not about");
});

test("a field left out of a statement is untouched", () => {
  const first = stateOutcome(evening(), { watched: true });
  const second = stateOutcome(first, { finished: false });
  assert.equal(second.watched.known && second.watched.value, true);
  assert.equal(second.finished.known && second.finished.value, false);
  assert.equal(second.chosen.known, false);
});

test("a statement that says nothing is refused rather than silently doing nothing", () => {
  assert.throws(() => stateOutcome(evening(), {}), EpisodeError);
});

test("the chosen film must be one Tonight actually offered", () => {
  assert.throws(
    () => stateOutcome(evening(), { chosen: { title: "Heat", year: 1995, lead: false } }),
    EpisodeError,
  );
  const episode = stateOutcome(evening(), { chosen: offers[1] });
  assert.equal(episode.chosen.known && episode.chosen.value.title, "Zodiac");
});

test("an episode needs the words they used", () => {
  for (const bad of ["", "   ", undefined, null, 42, {}]) {
    assert.throws(() => beginEpisode(bad, []), EpisodeError, `accepted ${String(bad)} as a request`);
  }
  assert.throws(() => beginEpisode("x".repeat(MAX_REQUEST_LENGTH + 1), []), EpisodeError);
});

test("what was offered has to look like films that were offered", () => {
  for (const bad of [undefined, null, "Prisoners", {}]) {
    assert.throws(() => beginEpisode("anything", bad), EpisodeError);
  }
  for (const bad of [{ title: "", year: 2013, lead: true }, { title: "P", year: 2013 }, { year: 1 }]) {
    assert.throws(() => beginEpisode("anything", [bad]), EpisodeError);
  }
  assert.throws(
    () => beginEpisode("anything", Array.from({ length: MAX_OFFERED + 1 }, () => offers[1])),
    EpisodeError,
  );
});

test("an answer has one lead, matching the shape Phase 1 ships", () => {
  assert.throws(
    () =>
      beginEpisode("anything", [
        { title: "Prisoners", year: 2013, lead: true },
        { title: "Zodiac", year: 2007, lead: true },
      ]),
    EpisodeError,
  );
});

test("the same film is not offered twice in one answer", () => {
  // Choosing is recorded against the film, so two identical offers would be two
  // rows nothing could tell apart — and the store would be asked to mark both.
  assert.throws(
    () =>
      beginEpisode("anything", [
        { title: "Prisoners", year: 2013, lead: true },
        { title: "Prisoners", year: 2013, lead: false },
      ]),
    EpisodeError,
  );
  // The same title in a different year is a different film, and stays legal.
  assert.equal(
    beginEpisode("anything", [
      { title: "Insomnia", year: 1997, lead: true },
      { title: "Insomnia", year: 2002, lead: false },
    ]).offered.length,
    2,
  );
});

test("nothing here reaches the taste model", async () => {
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("model.ts", import.meta.url), "utf8"),
  );
  assert.equal(source.includes("../taste/"), false, "the episode model imported taste");
  for (const owned of ["MovieState", "liked", "loved", "disliked", "genre", "mix"]) {
    assert.equal(
      new RegExp(`\\b${owned}\\b`).test(source.replace(/\/\*\*[\s\S]*?\*\//gu, "")),
      false,
      `${owned} appears in episode code, outside its comments`,
    );
  }
});
