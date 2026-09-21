import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import { beginEpisode, correctEpisode } from "../episodes/model.ts";
import { EPISODES_SCHEMA, sqlEpisodeStore } from "../episodes/store/sql.ts";
import type { EpisodeStore } from "../episodes/store.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { sqlTasteStore, TASTE_SCHEMA } from "../taste/store/sql.ts";
import type { TasteStore } from "../taste/store.ts";
import { stateVerdict, withdrawVerdict, type Film } from "../verdicts/model.ts";
import { sqlVerdictStore, VERDICTS_SCHEMA } from "../verdicts/store/sql.ts";
import type { VerdictStore } from "../verdicts/store.ts";
import { compose, PRECEDENCE, type Conflict, type Memory, type Root } from "./model.ts";

/**
 * The memory composer, held to the one thing it must never do.
 *
 * M3's promise is that Tonight can say what it thinks it knows and be corrected.
 * The risk in keeping that promise is subtle: an explanation surface is where a
 * system is most tempted to tidy, to summarise, to resolve — and any of those
 * would make the answer say more than the roots do. So most of these contracts
 * are about the absence of invention. Nothing appears that no root produced,
 * nothing that happened becomes something they said, and nothing is decided
 * here that is not already decided somewhere with contracts on it.
 *
 * The roots are written through the real stores rather than built as literals.
 * What the composer must arrange is what persistence actually hands over,
 * including the parts — a null `createdAt`, a verdict's reference — that only
 * exist after a round trip.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

const BLACK_BAG: Film = { title: "Black Bag", year: 2025 };
const HEAT_1995: Film = { title: "Heat", year: 1995 };
const HEAT_1986: Film = { title: "Heat", year: 1986 };

const judged = (film: Film, judgement: "liked" | "loved" | "disliked", at: string, because: string | null = null) =>
  stateVerdict(film, { about: "judgement", judgement, because }, "volunteered", at);

const refused = (film: Film, at: string) =>
  stateVerdict(film, { about: "rejection", rejection: { reach: "not-ever", reason: null } }, "confirmed", at);

const notTonight = (film: Film, at: string, occasion: string) =>
  stateVerdict(
    film,
    { about: "rejection", rejection: { reach: "not-tonight", reason: null } },
    "confirmed",
    at,
    { occasion },
  );

describe("the memory composer", () => {
  let driver: SqlDriver;

  before(async () => {
    driver = await embeddedDriver();
    for (const schema of [TASTE_SCHEMA, VERDICTS_SCHEMA, EPISODES_SCHEMA]) await migrate(driver, schema);
  });

  after(async () => {
    await driver.close();
  });

  /** One person, with their own three stores. A fresh one per contract. */
  let next = 0;
  type Person = { taste: TasteStore; verdicts: VerdictStore; episodes: EpisodeStore; memory: () => Promise<Memory> };
  const someone = (name = `person-${String(++next)}`): Person => {
    const who = asUser(`google:${name}`);
    const taste = sqlTasteStore(driver, who);
    const verdicts = sqlVerdictStore(driver, who);
    const episodes = sqlEpisodeStore(driver, who);
    return {
      taste,
      verdicts,
      episodes,
      memory: async () =>
        compose({
          taste: await taste.taste(),
          acts: await verdicts.acts(),
          episodes: await episodes.episodes(),
        }),
    };
  };

  const of = (roots: readonly Root[], kind: Root["of"]) => roots.filter((root) => root.of === kind);

  /* ------------------------------------------------------ held completeness */

  test("everything the user saved or currently says is held", async () => {
    // The expected picture is written here, not read back from the composer:
    // two genres, one mix, two films and one standing verdict.
    const her = someone();
    await her.taste.createGenre({ name: "Slow Burn", instruction: "takes its time" });
    await her.taste.createGenre({ name: "Heist", instruction: "a crew and a plan" });
    await her.taste.createMix({ name: "Long Nights", genres: ["Slow Burn"], instruction: "room to unfold" });
    await her.taste.createMovie({ ...HEAT_1995, state: "loved" });
    await her.taste.createMovie({ ...BLACK_BAG, state: null });
    await her.verdicts.say(judged(BLACK_BAG, "loved", "2026-01-01T20:00:00.000Z", "the tension"));

    const { held } = await her.memory();
    assert.deepEqual(of(held, "genre").map((root) => root.of === "genre" && root.name).sort(), ["Heist", "Slow Burn"]);
    assert.deepEqual(of(held, "mix").map((root) => root.of === "mix" && root.name), ["Long Nights"]);
    assert.deepEqual(
      of(held, "movie").map((root) => (root.of === "movie" ? `${root.film.title} ${String(root.film.year)}` : "")).sort(),
      ["Black Bag 2025", "Heat 1995"],
    );
    assert.equal(of(held, "verdict").length, 1);
    for (const root of held) assert.equal(root.placement, "held");
  });

  test("a held mix carries what it is made of and what is in it", async () => {
    const her = someone();
    await her.taste.createGenre({ name: "Slow Burn", instruction: "takes its time" });
    await her.taste.createMovie({ ...HEAT_1995, state: "loved" });
    await her.taste.createMix({ name: "Long Nights", genres: ["Slow Burn"], instruction: "room to unfold" });
    await her.taste.updateMovie(HEAT_1995.title, HEAT_1995.year, { mixes: ["Long Nights"] });

    const [mix] = of((await her.memory()).held, "mix");
    assert.ok(mix && mix.of === "mix");
    assert.deepEqual([...mix.genres], ["Slow Burn"]);
    assert.deepEqual([...mix.films], [HEAT_1995]);
    assert.equal(mix.instruction, "room to unfold");
  });

  /* ------------------------------------------------ remembered completeness */

  test("evenings and everything no longer standing are remembered", async () => {
    const her = someone();
    await her.episodes.record(beginEpisode("something tense", [{ ...HEAT_1995, lead: true }]));
    await her.verdicts.say(judged(BLACK_BAG, "loved", "2026-01-01T20:00:00.000Z"));
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-02T20:00:00.000Z"));
    await her.verdicts.say(withdrawVerdict(BLACK_BAG, "2026-01-03T20:00:00.000Z"));

    const { held, remembered } = await her.memory();
    assert.equal(of(remembered, "evening").length, 1);
    // Three acts: the displaced verdict, the withdrawn one, and the withdrawal.
    assert.equal(of(remembered, "verdict").length, 3);
    assert.equal(of(held, "verdict").length, 0, "something that no longer stands is still held");
    for (const root of remembered) assert.equal(root.placement, "remembered");
  });

  test("an act's fate is named: superseded, withdrawn, or the withdrawal itself", async () => {
    const her = someone();
    await her.verdicts.say(judged(BLACK_BAG, "loved", "2026-01-01T20:00:00.000Z"));
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-02T20:00:00.000Z"));
    await her.verdicts.say(withdrawVerdict(BLACK_BAG, "2026-01-03T20:00:00.000Z"));

    const acts = of((await her.memory()).remembered, "verdict");
    const fates = acts.map((root) =>
      root.of === "verdict" ? `${root.act.said}:${String(root.basis.kind === "said" ? root.basis.became : "?")}` : "",
    );
    assert.deepEqual(fates.sort(), [
      "verdict:superseded",
      "verdict:withdrawn",
      "withdrawal:undefined",
    ]);
  });

  /* --------------------------------------------------------------- placement */

  test("no root is in two places at once", async () => {
    const her = someone();
    await her.taste.createMovie({ ...HEAT_1995, state: "loved" });
    await her.verdicts.say(judged(HEAT_1995, "disliked", "2026-01-01T20:00:00.000Z"));
    await her.verdicts.say(judged(BLACK_BAG, "loved", "2026-01-01T20:00:00.000Z"));
    await her.verdicts.say(judged(BLACK_BAG, "liked", "2026-01-02T20:00:00.000Z"));
    await her.episodes.record(beginEpisode("something tense", [{ ...HEAT_1995, lead: true }]));

    const { held, remembered } = await her.memory();
    const name = (root: Root) => JSON.stringify(root.handle);
    const both = held.map(name).filter((handle) => remembered.map(name).includes(handle));
    assert.deepEqual(both, [], "a root is both held and remembered");
    // And every root has exactly one placement, matching the list it is in.
    for (const root of held) assert.equal(root.placement, "held");
    for (const root of remembered) assert.equal(root.placement, "remembered");
  });

  test("an evening is remembered and is never held, whatever became of it", async () => {
    const her = someone();
    const offers = [{ ...HEAT_1995, lead: true }];
    const written = await her.episodes.record(beginEpisode("something tense", offers));
    // Chosen, watched and finished — the whole chain, which still teaches nothing.
    await her.episodes.correct(written.id, { chosen: offers[0], watched: true, finished: true });

    const { held, remembered } = await her.memory();
    assert.equal(of(held, "evening").length, 0, "an evening reached held");
    assert.equal(of(remembered, "evening").length, 1);
    assert.equal(held.length, 0, "a finished evening produced something held");
  });

  /* --------------------------------------------------------------- operative */

  test("a disagreeing state and verdict make exactly one conflict, and the verdict governs", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "liked" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));

    const { held, operative } = await her.memory();
    assert.equal(operative.length, 1);
    const [conflict] = operative as [Conflict];
    assert.deepEqual(conflict.film, BLACK_BAG);
    assert.equal(conflict.saved.state, "liked");
    assert.deepEqual(conflict.saved.handle, { by: "film", title: "Black Bag", year: 2025 });
    assert.equal(conflict.governing.act.assertion.about === "judgement" && conflict.governing.act.assertion.judgement, "disliked");
    assert.equal(conflict.because, PRECEDENCE);

    // Both roots stay in held. The Movie is not overwritten and not moved.
    assert.equal(of(held, "movie").length, 1);
    assert.equal(of(held, "verdict").length, 1);
    const [movie] = of(held, "movie");
    assert.equal(movie?.of === "movie" && movie.state, "liked", "the saved state was rewritten by the verdict");
  });

  test("a state and a verdict that agree are not a conflict", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "loved" });
    await her.verdicts.say(judged(BLACK_BAG, "loved", "2026-01-01T20:00:00.000Z"));
    assert.deepEqual((await her.memory()).operative, []);
  });

  test("a non-evaluative state is not contradicted by a verdict", async () => {
    // `seen` says they watched it, never how it went, so a verdict beside it
    // adds an opinion rather than disagreeing with one.
    for (const state of ["seen", "not_seen", null] as const) {
      const her = someone();
      await her.taste.createMovie({ ...BLACK_BAG, state });
      await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
      assert.deepEqual((await her.memory()).operative, [], `${String(state)} was treated as an opinion`);
    }
  });

  /**
   * A refusal is a conflict, and it stays a refusal.
   *
   * *"Never again"* against a film they filed as loved is two roots pulling
   * recommendation opposite ways, which is exactly what `operative` is for. What
   * must not happen is the translation: a refusal is not a rating, and turning
   * it into `disliked` would put an opinion in their mouth that they never gave.
   */
  test("a global not-ever governs the film, and is still a refusal", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "loved" });
    await her.verdicts.say(refused(BLACK_BAG, "2026-01-01T20:00:00.000Z"));

    const { held, operative } = await her.memory();
    assert.equal(operative.length, 1, "a permanent refusal over a loved film explained nothing");
    const [conflict] = operative as [Conflict];
    assert.deepEqual(conflict.where, "everywhere", "a global refusal was scoped to an evening");
    assert.equal(conflict.saved.state, "loved", "the saved preference was rewritten");
    assert.equal(
      conflict.governing.act.assertion.about === "rejection" &&
        conflict.governing.act.assertion.rejection.reach,
      "not-ever",
    );
    assert.equal(JSON.stringify(conflict).includes("disliked"), false, "a refusal was read as a dislike");
    assert.equal(of(held, "movie").length, 1);
    assert.equal(of(held, "verdict").length, 1);
  });

  test("a not-tonight governs its own evening and claims nothing beyond it", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "loved" });
    await her.verdicts.say(notTonight(BLACK_BAG, "2026-01-01T20:00:00.000Z", "tue"));

    const { held, operative } = await her.memory();
    assert.equal(operative.length, 1, "an evening's refusal over a loved film explained nothing");
    const [conflict] = operative as [Conflict];
    assert.deepEqual(conflict.where, { occasion: "tue" }, "the evening's refusal was made global");
    assert.equal(
      conflict.governing.act.assertion.about === "rejection" &&
        conflict.governing.act.assertion.rejection.reach,
      "not-tonight",
    );
    assert.equal(JSON.stringify(conflict).includes("disliked"), false, "not tonight was read as a dislike");

    const [movie] = of(held, "movie");
    assert.equal(movie?.of === "movie" && movie.state, "loved", "the base preference was rewritten");
    assert.equal(
      operative.filter((one) => JSON.stringify(one.where) !== JSON.stringify({ occasion: "tue" })).length,
      0,
      "the refusal was claimed to govern somewhere it was not said",
    );
  });

  test("a refusal against a film they already disliked is not a disagreement", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "disliked" });
    await her.verdicts.say(refused(BLACK_BAG, "2026-01-01T20:00:00.000Z"));
    assert.deepEqual((await her.memory()).operative, []);
  });

  test("a refusal manufactures no preference from a non-evaluative state", async () => {
    for (const state of ["seen", "not_seen", null] as const) {
      const her = someone();
      await her.taste.createMovie({ ...BLACK_BAG, state });
      await her.verdicts.say(refused(BLACK_BAG, "2026-01-01T20:00:00.000Z"));
      assert.deepEqual(
        (await her.memory()).operative,
        [],
        `a refusal beside ${String(state)} was read as a contradicted preference`,
      );
    }
  });

  test("taking a refusal back removes the overlay and leaves the film as they filed it", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "loved" });
    await her.verdicts.say(refused(BLACK_BAG, "2026-01-01T20:00:00.000Z"));
    assert.equal((await her.memory()).operative.length, 1);

    await her.verdicts.say(withdrawVerdict(BLACK_BAG, "2026-01-02T20:00:00.000Z"));
    const after = await her.memory();
    assert.deepEqual(after.operative, [], "the refusal still governed after it was taken back");
    assert.equal(of(after.held, "verdict").length, 0);
    const [movie] = of(after.held, "movie");
    assert.equal(movie?.of === "movie" && movie.state, "loved", "the base did not come back");
  });

  test("taking an evening's refusal back restores that evening to the base too", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "loved" });
    await her.verdicts.say(notTonight(BLACK_BAG, "2026-01-01T20:00:00.000Z", "tue"));
    await her.verdicts.say(withdrawVerdict(BLACK_BAG, "2026-01-02T20:00:00.000Z", { occasion: "tue" }));

    const after = await her.memory();
    assert.deepEqual(after.operative, [], "an evening kept a refusal that was taken back");
    assert.equal(of(after.held, "verdict").length, 0);
  });

  test("two films sharing a title are two films, and the conflict names the right one", async () => {
    // They speak about the *earlier* film on purpose. The taste model comes back
    // ordered by title then year, so a key that dropped the year would end up
    // holding the later film — and a fixture that spoke about that one would
    // pass by accident.
    const her = someone();
    await her.taste.createMovie({ ...HEAT_1986, state: "loved" });
    await her.taste.createMovie({ ...HEAT_1995, state: "liked" });
    await her.verdicts.say(judged(HEAT_1986, "disliked", "2026-01-01T20:00:00.000Z"));

    const { operative } = await her.memory();
    assert.equal(operative.length, 1, "a remake was merged with the film it remade");
    assert.equal(operative[0]?.film.year, 1986);
    // Which saved film is in the conflict matters as much as how many there are:
    // pairing the 1995 verdict with the 1986 Movie would be a count of one and
    // an explanation about the wrong film.
    assert.deepEqual(operative[0]?.saved.handle, { by: "film", title: "Heat", year: 1986 });
    assert.equal(operative[0]?.saved.state, "loved", "the conflict named the other film's state");
  });

  test("a verdict agreeing with its own film is no conflict, whatever the other film says", async () => {
    // The sharper half of the same rule. Here the film they spoke about agrees
    // with what they said, so there is nothing to explain — and only a key that
    // ignored the year could find a disagreement, by reaching the remake.
    const her = someone();
    await her.taste.createMovie({ ...HEAT_1986, state: "disliked" });
    await her.taste.createMovie({ ...HEAT_1995, state: "liked" });
    await her.verdicts.say(judged(HEAT_1986, "disliked", "2026-01-01T20:00:00.000Z"));

    assert.deepEqual((await her.memory()).operative, [], "a conflict was invented from the wrong film");
  });

  test("a film saved and spoken about in different case is one film", async () => {
    // The taste store holds a Movie unique on its folded title; the verdict
    // store matches exactly. They describe one film, so the conflict must be
    // found rather than missed on a capital letter.
    const her = someone();
    await her.taste.createMovie({ title: "black bag", year: 2025, state: "liked" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    assert.equal((await her.memory()).operative.length, 1, "one film was read as two");
  });

  test("a superseded verdict never governs", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "liked" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    await her.verdicts.say(judged(BLACK_BAG, "liked", "2026-01-02T20:00:00.000Z"));

    // The latest verdict agrees with the saved state, so nothing is in conflict
    // — and the displaced one must not resurrect the disagreement.
    assert.deepEqual((await her.memory()).operative, []);
  });

  /* -------------------------------------------------------------- provenance */

  test("a saved root says when the row was written, and never that they spoke then", async () => {
    const her = someone();
    await her.taste.createGenre({ name: "Slow Burn", instruction: "takes its time" });
    const [genre] = of((await her.memory()).held, "genre");
    assert.ok(genre);
    assert.equal(genre.basis.kind, "saved");
    assert.deepEqual(Object.keys(genre.basis).sort(), ["changedAt", "kind", "savedAt"]);
    for (const invented of ["when", "saidAt", "at", "told", "recordedAt"]) {
      assert.equal(invented in genre.basis, false, `a saved root claims ${invented}`);
    }
  });

  test("a said root says when they spoke, how, and what to point at", async () => {
    const her = someone();
    const act = await her.verdicts.say(judged(BLACK_BAG, "loved", "2026-01-01T20:00:00.000Z"));
    const [root] = of((await her.memory()).held, "verdict");
    assert.ok(root && root.of === "verdict" && root.basis.kind === "said");
    assert.equal(root.basis.saidAt, "2026-01-01T20:00:00.000Z");
    assert.equal(root.basis.told, "volunteered");
    assert.equal(root.basis.claimant, "user");
    assert.deepEqual(root.basis.scope, "everywhere");
    assert.equal(root.basis.became, "current");
    assert.deepEqual(root.handle, { by: "ref", ref: act.ref });
    for (const invented of ["when", "savedAt", "recordedAt"]) {
      assert.equal(invented in root.basis, false, `a said root claims ${invented}`);
    }
  });

  test("an evening says when Tonight wrote it down, and where each fact came from", async () => {
    const her = someone();
    const written = await her.episodes.record(beginEpisode("something tense", [{ ...HEAT_1995, lead: true }]));
    await her.episodes.correct(written.id, { request: "something quiet, actually" });

    const [root] = of((await her.memory()).remembered, "evening");
    assert.ok(root && root.of === "evening" && root.basis.kind === "evening");
    assert.equal(root.basis.recordedAt, written.recordedAt);
    assert.equal(root.request, "something quiet, actually");
    assert.equal(root.requestSource, "stated", "a corrected request still claims Tonight heard it");
    assert.equal(root.offeredSource, "observed");
    assert.equal(root.watched.known, false, "an unstated outcome acquired a value");
    assert.deepEqual(root.handle, { by: "id", id: written.id });
    for (const invented of ["when", "saidAt", "savedAt"]) {
      assert.equal(invented in root.basis, false, `an evening claims ${invented}`);
    }
  });

  test("no root anywhere carries an invented universal timestamp", async () => {
    const her = someone();
    await her.taste.createGenre({ name: "Slow Burn", instruction: "takes its time" });
    await her.verdicts.say(judged(BLACK_BAG, "loved", "2026-01-01T20:00:00.000Z"));
    await her.episodes.record(beginEpisode("something tense", [{ ...HEAT_1995, lead: true }]));

    const memory = await her.memory();
    const payload = JSON.stringify(memory);
    assert.equal(/"when"\s*:/.test(payload), false, "a generic when appeared");
    // Nor any of the machinery the boundary already refuses.
    for (const machinery of ["order", "seq"]) {
      assert.equal(new RegExp(`"${machinery}"\\s*:`).test(payload), false, `${machinery} reached the memory view`);
    }
  });

  test("nothing derived, scored or inferred appears anywhere", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "liked" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    await her.episodes.record(beginEpisode("something tense", [{ ...HEAT_1995, lead: true }]));

    const payload = JSON.stringify(await her.memory()).toLowerCase();
    for (const invention of [
      "confidence", "score", "weight", "relevance", "certainty", "probability",
      "observation", "proposal", "inferred", "prediction", "question", "opportunit", "pending",
    ]) {
      assert.equal(payload.includes(`"${invention}`), false, `${invention} appeared in composed memory`);
    }
  });

  /* ---------------------------------------------------------------- isolation */

  test("composing writes nothing and moves nothing", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "liked" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    await her.episodes.record(beginEpisode("something tense", [{ ...HEAT_1995, lead: true }]));

    const before = {
      taste: await her.taste.taste(),
      acts: await her.verdicts.acts(),
      episodes: await her.episodes.episodes(),
    };
    for (let round = 0; round < 3; round += 1) await her.memory();
    assert.deepEqual(await her.taste.taste(), before.taste, "composing changed what recommendation work sees");
    assert.deepEqual(await her.verdicts.acts(), before.acts);
    assert.deepEqual(await her.episodes.episodes(), before.episodes);
    // And the picture itself is the same every time it is asked for.
    assert.deepEqual(await her.memory(), await her.memory());
  });

  test("one person's memory holds nothing of another's", async () => {
    const her = someone("mine");
    const him = someone("theirs");
    await her.taste.createMovie({ ...BLACK_BAG, state: "liked" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    await her.episodes.record(beginEpisode("hers alone", [{ ...HEAT_1995, lead: true }]));

    const his = await him.memory();
    assert.deepEqual(his, { held: [], operative: [], remembered: [] });
    assert.equal(JSON.stringify(his).includes("Black Bag"), false);
    assert.equal(JSON.stringify(his).includes("hers alone"), false);
  });

  /* ------------------------------------------------- correction and deletion */

  test("forgetting the standing verdict returns the saved state to governing alone", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "liked" });
    const act = await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    assert.equal((await her.memory()).operative.length, 1);

    await her.verdicts.forget(act.ref);
    const after = await her.memory();
    assert.deepEqual(after.operative, [], "the conflict outlived the verdict");
    assert.equal(of(after.held, "verdict").length, 0);
    assert.equal(of(after.remembered, "verdict").length, 0, "a forgotten act lingered in remembered");
    // The Movie is untouched and is now the only thing said about the film.
    const [movie] = of(after.held, "movie");
    assert.equal(movie?.of === "movie" && movie.state, "liked");
  });

  test("forgetting a withdrawal brings the verdict it silenced back to held", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "liked" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    const taken = await her.verdicts.say(withdrawVerdict(BLACK_BAG, "2026-01-02T20:00:00.000Z"));
    assert.deepEqual((await her.memory()).operative, [], "a withdrawn verdict was still governing");

    await her.verdicts.forget(taken.ref);
    const after = await her.memory();
    assert.equal(of(after.held, "verdict").length, 1, "the silenced verdict did not come back");
    assert.equal(after.operative.length, 1, "the conflict did not recompute");
    assert.equal(
      after.operative[0]?.governing.act.assertion.about === "judgement" &&
        after.operative[0].governing.act.assertion.judgement,
      "disliked",
    );
  });

  test("correcting an evening changes how it is remembered, and nothing else", async () => {
    const her = someone();
    const offers = [{ ...HEAT_1995, lead: true }, { ...BLACK_BAG, lead: false }];
    const written = await her.episodes.record(correctEpisode(beginEpisode("something tense", offers), { chosen: offers[0] }));
    const before = await her.memory();

    await her.episodes.correct(written.id, { offered: [{ ...HEAT_1995, lead: false }, { ...BLACK_BAG, lead: true }] });
    const after = await her.memory();

    const evening = of(after.remembered, "evening")[0];
    assert.ok(evening && evening.of === "evening");
    assert.equal(evening.offeredSource, "stated");
    assert.deepEqual(evening.chosen.known ? evening.chosen.value : null, { ...HEAT_1995, lead: false });
    assert.deepEqual(after.held, before.held, "correcting an evening changed what is held");
    assert.deepEqual(after.operative, [], "correcting an evening produced a conflict");
  });

  test("deleting a saved film removes it and leaves what they said standing", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "liked" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    assert.equal((await her.memory()).operative.length, 1);

    await her.taste.deleteMovie(BLACK_BAG.title, BLACK_BAG.year);
    const after = await her.memory();
    assert.equal(of(after.held, "movie").length, 0);
    assert.deepEqual(after.operative, [], "a conflict survived the root it was about");
    assert.equal(of(after.held, "verdict").length, 1, "deleting a film took the verdict with it");
  });

  test("the picture is derived every time, never remembered from last time", async () => {
    const her = someone();
    await her.taste.createGenre({ name: "Slow Burn", instruction: "takes its time" });
    const first = await her.memory();
    assert.equal(of(first.held, "genre").length, 1);

    await her.taste.deleteGenre("Slow Burn");
    assert.deepEqual(await her.memory(), { held: [], operative: [], remembered: [] });
  });

  /**
   * Two case-variant acts are one film's history, and only one of them governs.
   *
   * The taste model will not let somebody hold *Black Bag* and *black bag* as
   * two films. The verdict store used to let them say something about each and
   * resolve a current claim for both, which left this view with two governors
   * for one Movie and no rule for choosing. Resolution now names a film the way
   * Taste does, so the two acts are one history — and the expected answer here
   * is written out rather than read back from the composer.
   */
  test("case variants are one film's history, with one governor", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "loved" });
    const first = await her.verdicts.say(judged(BLACK_BAG, "liked", "2026-01-01T20:00:00.000Z"));
    const second = await her.verdicts.say(
      judged({ title: "black bag", year: 2025 }, "disliked", "2026-01-02T20:00:00.000Z"),
    );

    // The store side: one history, both acts in it, each still its own act.
    const history = await her.verdicts.history(BLACK_BAG);
    assert.equal(history.length, 2, "the two spellings are still two histories");
    assert.deepEqual(history.map((act) => act.ref).sort(), [first.ref, second.ref].sort());
    assert.deepEqual(
      (await her.verdicts.history({ title: "black bag", year: 2025 })).map((act) => act.ref).sort(),
      [first.ref, second.ref].sort(),
      "which spelling was asked about changed the history",
    );
    const standing = await her.verdicts.standing();
    assert.equal(standing.length, 1, "one film had two standing claims");

    // The memory side: one governor, and it is the later act.
    const { held, operative, remembered } = await her.memory();
    assert.equal(operative.length, 1, "one Movie had two governors");
    assert.deepEqual(operative[0]?.governing.handle, { by: "ref", ref: second.ref });
    assert.equal(of(held, "verdict").length, 1, "a superseded spelling is still held");
    // And the earlier act is not lost — it is remembered, by its own reference.
    assert.deepEqual(
      of(remembered, "verdict").map((root) => root.handle),
      [{ by: "ref", ref: first.ref }],
    );
  });

  /* ------------------------------------------- the rejection matrix, in full */

  for (const state of ["liked", "loved"] as const) {
    test(`${state} and a global not-ever is one conflict, governing everywhere`, async () => {
      const her = someone();
      await her.taste.createMovie({ ...BLACK_BAG, state });
      await her.verdicts.say(refused(BLACK_BAG, "2026-01-01T20:00:00.000Z"));

      const { operative } = await her.memory();
      assert.equal(operative.length, 1);
      assert.deepEqual(operative[0]?.where, "everywhere");
      assert.equal(operative[0]?.saved.state, state);
      assert.equal(
        operative[0]?.governing.act.assertion.about === "rejection" &&
          operative[0].governing.act.assertion.rejection.reach,
        "not-ever",
      );
      assert.equal(JSON.stringify(operative[0]).includes("disliked"), false);
    });

    test(`${state} and a not-tonight is one conflict, governing only that evening`, async () => {
      const her = someone();
      await her.taste.createMovie({ ...BLACK_BAG, state });
      await her.verdicts.say(notTonight(BLACK_BAG, "2026-01-01T20:00:00.000Z", "tue"));

      const { held, operative } = await her.memory();
      assert.equal(operative.length, 1);
      assert.deepEqual(operative[0]?.where, { occasion: "tue" });
      assert.equal(
        operative[0]?.governing.act.assertion.about === "rejection" &&
          operative[0].governing.act.assertion.rejection.reach,
        "not-tonight",
      );
      assert.equal(JSON.stringify(operative[0]).includes("disliked"), false);
      const [movie] = of(held, "movie");
      assert.equal(movie?.of === "movie" && movie.state, state, "the base preference moved");
    });
  }

  for (const state of ["disliked", "seen", "not_seen", null] as const) {
    test(`${String(state)} and a rejection is no conflict`, async () => {
      for (const reach of ["ever", "tonight"] as const) {
        const her = someone();
        await her.taste.createMovie({ ...BLACK_BAG, state });
        await her.verdicts.say(
          reach === "ever"
            ? refused(BLACK_BAG, "2026-01-01T20:00:00.000Z")
            : notTonight(BLACK_BAG, "2026-01-01T20:00:00.000Z", "tue"),
        );
        assert.deepEqual(
          (await her.memory()).operative,
          [],
          `not-${reach} beside ${String(state)} was read as a contradicted preference`,
        );
      }
    });
  }

  /* ----------------------------------- recomputation across title variants */

  /**
   * One film, three spellings, three acts — and every question about it
   * answered against one canonical identity.
   */
  test("acts spelled differently are one history, and forgetting reaches the right one", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, state: "liked" });
    const v1 = await her.verdicts.say(judged(BLACK_BAG, "liked", "2026-01-01T20:00:00.000Z"));
    const v2 = await her.verdicts.say(
      stateVerdict(
        { title: " black   bag ", year: 2025 },
        { about: "rejection", rejection: { reach: "not-ever", reason: null } },
        "confirmed",
        "2026-01-02T20:00:00.000Z",
      ),
    );
    const v3 = await her.verdicts.say(withdrawVerdict({ title: "BLACK BAG", year: 2025 }, "2026-01-03T20:00:00.000Z"));

    // One history, complete, three refs.
    const history = await her.verdicts.history(BLACK_BAG);
    assert.deepEqual(history.map((act) => act.ref).sort(), [v1.ref, v2.ref, v3.ref].sort());
    assert.equal((await her.verdicts.standing()).length, 0, "a withdrawal left something standing");

    // Nothing stands, so nothing governs, and the saved state is alone.
    let memory = await her.memory();
    assert.deepEqual(memory.operative, []);
    assert.equal(of(memory.held, "verdict").length, 0);
    assert.equal(of(memory.remembered, "verdict").length, 3);

    // Forgetting the withdrawal revives the refusal — the one said second, not
    // the one said first, even though all three were spelled differently.
    await her.verdicts.forget(v3.ref);
    memory = await her.memory();
    assert.equal(memory.operative.length, 1, "the revived refusal did not govern");
    assert.deepEqual(memory.operative[0]?.governing.handle, { by: "ref", ref: v2.ref });
    assert.equal(of(memory.held, "verdict").length, 1, "two governors appeared for one film");

    // Forgetting that one leaves the first, and only the first.
    await her.verdicts.forget(v2.ref);
    memory = await her.memory();
    assert.deepEqual(of(memory.held, "verdict").map((root) => root.handle), [{ by: "ref", ref: v1.ref }]);
    // It agrees with the saved state, so there is nothing to explain.
    assert.deepEqual(memory.operative, []);
    assert.equal(of(memory.remembered, "verdict").length, 0, "a forgotten act lingered");
  });

  test("the composer keeps no naming rule of its own", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("model.ts", import.meta.url), "utf8"),
    );
    // One import of the shared rule, and no lowercasing or trimming anywhere else.
    assert.match(source, /from "\.\.\/films\/identity\.ts"/u, "the composer does not use the shared identity");
    const code = source.replace(/\/\*\*[\s\S]*?\*\//gu, "").replace(/^[ \t]*\/\/.*$/gmu, "");
    for (const local of ["toLowerCase", "toUpperCase", "normalize(", ".trim()"]) {
      assert.equal(code.includes(local), false, `the composer names films itself: ${local}`);
    }
  });

  /* --------------------------------------------------------------- the rule */

  /**
   * How drift between the explanation and the behaviour is caught.
   *
   * Two halves, deliberately apart. The composer's behaviour is proved by the
   * contracts above, which drive real roots and read real output — no prose is
   * consulted at runtime, and `PRECEDENCE` is a sentence for a reader rather
   * than an oracle.
   *
   * This half asks a different question: does the certified instruction still
   * establish the rule the composer explains? It is deliberately not an
   * equality against one English sentence. That was the first attempt and it was
   * wrong both ways — a harmless rewording would fail it, and a sentence left in
   * place while its surrounding meaning was gutted would pass. So it checks the
   * two things that have to be true of whatever wording is there: that a verdict
   * is said to outrank a state, and that taking one back returns the film to
   * what it was.
   */
  test("the instructions still establish that a verdict outranks a state", async () => {
    const skill = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../../../skills/tonight-recommend/SKILL.md", import.meta.url), "utf8"),
    );
    const flat = skill.replace(/\s+/gu, " ");

    // A verdict beats a state it disagrees with, however that is worded.
    assert.match(
      flat,
      /verdict[^.]{0,60}\b(outranks|overrides|beats|wins over|takes precedence over)\b[^.]{0,40}state/iu,
      "the instructions no longer say a verdict outranks a state; the memory view would explain a rule Tonight does not follow",
    );
    // And the two are named as different things, which is what makes one able
    // to outrank the other rather than replace it.
    assert.match(flat, /a verdict is what they told you|what they say about a film is a verdict/iu);
  });

  test("the instructions still establish that taking a verdict back restores what was there", async () => {
    const skill = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../../../skills/tonight-recommend/SKILL.md", import.meta.url), "utf8"),
    );
    const flat = skill.replace(/\s+/gu, " ");
    assert.match(
      flat,
      /taking it back[^.]{0,80}Movie state[^.]{0,40}what is left|taking back[^.]{0,80}means they have said nothing/iu,
      "the instructions no longer say a withdrawal leaves silence; the overlay this view removes would have no basis",
    );
  });

  test("the composer states no rule of its own beyond that one", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("model.ts", import.meta.url), "utf8"),
    );
    const code = source.replace(/\/\*\*[\s\S]*?\*\//gu, "").replace(/^[ \t]*\/\/.*$/gmu, "");
    // No persistence, no second recommendation vocabulary, no caching.
    for (const word of ["INSERT", "UPDATE", "DELETE", "driver", "query(", "cache"]) {
      assert.equal(code.includes(word), false, `${word} appears in the memory composer`);
    }
  });
});
