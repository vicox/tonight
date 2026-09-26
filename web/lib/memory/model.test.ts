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
import { compose, type Memory, type Root } from "./model.ts";

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

const judged = (film: Film, judgement: "liked" | "loved" | "disliked", at: string, because: string | null = null) =>
  stateVerdict(film, { about: "judgement", judgement, because }, "volunteered", at);

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
    await her.taste.createMovie({ ...HEAT_1995, viewing: "seen" });
    await her.taste.createMovie({ ...BLACK_BAG, viewing: null });
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
    await her.taste.createMovie({ ...HEAT_1995, viewing: "seen" });
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
    await her.taste.createMovie({ ...HEAT_1995, viewing: "seen" });
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

  /* ------------------------------------------------------ one film, one history */

  test("a film saved and spoken about in different case is one film", async () => {
    // The taste store holds a Movie under its canonical name; the verdict store
    // holds the title as the user spelled it. They describe one film, and the
    // memory view must show one film rather than two roots that look unrelated.
    const her = someone();
    await her.taste.createMovie({ title: "black bag", year: 2025, viewing: "seen" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));

    const held = (await her.memory()).held;
    assert.equal(of(held, "movie").length, 1, "one film was saved twice");
    assert.equal(of(held, "verdict").length, 1);
  });

  test("a superseded verdict is remembered and never held", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, viewing: "seen" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    await her.verdicts.say(judged(BLACK_BAG, "liked", "2026-01-02T20:00:00.000Z"));

    const { held, remembered } = await her.memory();
    assert.equal(of(held, "verdict").length, 1, "two verdicts stand about one film");
    assert.equal(of(remembered, "verdict").length, 1, "the displaced verdict was lost");
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
    await her.taste.createMovie({ ...BLACK_BAG, viewing: "seen" });
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
    await her.taste.createMovie({ ...BLACK_BAG, viewing: "seen" });
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
    await her.taste.createMovie({ ...BLACK_BAG, viewing: "seen" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    await her.episodes.record(beginEpisode("hers alone", [{ ...HEAT_1995, lead: true }]));

    const his = await him.memory();
    assert.deepEqual(his, { held: [], remembered: [] });
    assert.equal(JSON.stringify(his).includes("Black Bag"), false);
    assert.equal(JSON.stringify(his).includes("hers alone"), false);
  });

  /* ------------------------------------------------- correction and deletion */

  test("forgetting the standing verdict leaves nothing evaluative, and no hidden opinion", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, viewing: "seen", mixes: [] });
    const act = await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    assert.equal(of((await her.memory()).held, "verdict").length, 1);

    await her.verdicts.forget(act.ref);
    const after = await her.memory();
    assert.equal(of(after.held, "verdict").length, 0);
    assert.equal(of(after.remembered, "verdict").length, 0, "a forgotten act lingered in remembered");

    // The film is untouched, and there is no second place for an opinion to be
    // left behind: the Movie carries a viewing fact and nothing evaluative.
    const [movie] = of(after.held, "movie");
    assert.equal(movie?.of === "movie" && movie.viewing, "seen");
    assert.equal(
      /liked|loved|disliked/.test(JSON.stringify(after)),
      false,
      "an opinion survived forgetting the only act that carried one",
    );
  });

  test("forgetting a withdrawal brings the verdict it silenced back to held", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, viewing: "seen" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    const taken = await her.verdicts.say(withdrawVerdict(BLACK_BAG, "2026-01-02T20:00:00.000Z"));

    // While the withdrawal stands, nothing evaluative does. A withdrawal leaves
    // silence, and there is nowhere else for an opinion to be hiding.
    const silent = await her.memory();
    assert.equal(of(silent.held, "verdict").length, 0, "a withdrawn verdict was still held");

    await her.verdicts.forget(taken.ref);
    const after = await her.memory();
    const [back] = of(after.held, "verdict");
    assert.equal(
      back?.of === "verdict" && back.act.said === "verdict" && back.act.assertion.about === "judgement"
        ? back.act.assertion.judgement
        : null,
      "disliked",
      "the silenced verdict did not come back",
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
    assert.equal(of(after.held, "verdict").length, 0, "correcting an evening said something");
  });

  test("deleting a saved film removes it and leaves what they said standing", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, viewing: "seen" });
    await her.verdicts.say(judged(BLACK_BAG, "disliked", "2026-01-01T20:00:00.000Z"));
    assert.equal(of((await her.memory()).held, "verdict").length, 1);

    await her.taste.deleteMovie(BLACK_BAG.title, BLACK_BAG.year);
    const after = await her.memory();
    assert.equal(of(after.held, "movie").length, 0);
    assert.equal(of(after.held, "movie").length, 0, "a deleted film survived");
    assert.equal(of(after.held, "verdict").length, 1, "deleting a film took the verdict with it");
  });

  test("the picture is derived every time, never remembered from last time", async () => {
    const her = someone();
    await her.taste.createGenre({ name: "Slow Burn", instruction: "takes its time" });
    const first = await her.memory();
    assert.equal(of(first.held, "genre").length, 1);

    await her.taste.deleteGenre("Slow Burn");
    assert.deepEqual(await her.memory(), { held: [], remembered: [] });
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
    await her.taste.createMovie({ ...BLACK_BAG, viewing: "seen" });
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

    // The memory side: one act stands, and it is the later one.
    const { held, remembered } = await her.memory();
    assert.equal(of(held, "verdict").length, 1, "a superseded spelling is still held");
    assert.deepEqual(of(held, "verdict")[0]?.handle, { by: "ref", ref: second.ref });
    // And the earlier act is not lost — it is remembered, by its own reference.
    assert.deepEqual(
      of(remembered, "verdict").map((root) => root.handle),
      [{ by: "ref", ref: first.ref }],
    );
  });

  /* ----------------------------------- recomputation across title variants */

  /**
   * One film, three spellings, three acts — and every question about it
   * answered against one canonical identity.
   */
  test("acts spelled differently are one history, and forgetting reaches the right one", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, viewing: "seen" });
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

    // Nothing stands, so nothing is held — and the three acts are all still
    // remembered, which is exactly why this is not them having said nothing.
    let memory = await her.memory();
    assert.equal(of(memory.held, "verdict").length, 0);
    assert.equal(of(memory.remembered, "verdict").length, 3);

    // Forgetting the withdrawal revives the refusal — the one said second, not
    // the one said first, even though all three were spelled differently.
    await her.verdicts.forget(v3.ref);
    memory = await her.memory();
    assert.deepEqual(of(memory.held, "verdict").map((root) => root.handle), [{ by: "ref", ref: v2.ref }]);
    assert.equal(of(memory.held, "verdict").length, 1, "two acts stood for one film");

    // Forgetting that one leaves the first, and only the first.
    await her.verdicts.forget(v2.ref);
    memory = await her.memory();
    assert.deepEqual(of(memory.held, "verdict").map((root) => root.handle), [{ by: "ref", ref: v1.ref }]);
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
  test("the composer states no rule of its own at all", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("model.ts", import.meta.url), "utf8"),
    );
    const code = source.replace(/\/\*\*[\s\S]*?\*\//gu, "").replace(/^[ \t]*\/\/.*$/gmu, "");
    // No persistence, no second recommendation vocabulary, no caching.
    for (const word of ["INSERT", "UPDATE", "DELETE", "driver", "query(", "cache"]) {
      assert.equal(code.includes(word), false, `${word} appears in the memory composer`);
    }

    // And no resolution either. There used to be one rule here, because a Movie
    // carried an opinion and a Verdict carried an opinion and something had to
    // rank them. Only Verdicts carry opinions now, so there is no second opinion
    // to rank and nothing left for this file to decide.
    for (const word of ["PRECEDENCE", "Conflict", "conflicts", "operative", "governs"]) {
      assert.equal(code.includes(word), false, `${word} came back to the memory composer`);
    }
  });

  /* ------------------------------ the two roots, and what each does not touch */

  test("a judgement stands without a saved film, and is held on its own", async () => {
    // A verdict does not need a Movie row to exist, and the memory view must
    // show it rather than dropping an opinion for want of something to hang it
    // on. This is also what makes a judgement able to imply they watched a film
    // Tonight has never been told they saved.
    const her = someone();
    await her.verdicts.say(judged(BLACK_BAG, "loved", "2026-01-01T20:00:00.000Z"));

    const { held } = await her.memory();
    assert.equal(of(held, "movie").length, 0, "a film appeared that nobody saved");
    assert.equal(of(held, "verdict").length, 1, "an opinion was dropped for want of a film");
  });

  test("saying, withdrawing and forgetting a verdict leave the film untouched", async () => {
    // The library, the viewing fact and the filing are one root; what the user
    // thinks is another. No verdict operation may reach across.
    const her = someone();
    await her.taste.createGenre({ name: "Slow Burn", instruction: "takes its time" });
    await her.taste.createMix({ name: "Long Nights", genres: ["Slow Burn"], instruction: "room" });
    await her.taste.createMovie({ ...BLACK_BAG, viewing: "unseen", mixes: ["Long Nights"] });

    const film = async () => {
      const [movie] = of((await her.memory()).held, "movie");
      return movie?.of === "movie" ? { viewing: movie.viewing, mixes: [...movie.mixes] } : null;
    };
    const before = await film();
    assert.deepEqual(before, { viewing: "unseen", mixes: ["Long Nights"] });

    const act = await her.verdicts.say(judged(BLACK_BAG, "loved", "2026-01-01T20:00:00.000Z"));
    assert.deepEqual(await film(), before, "recording a verdict changed the film");

    await her.verdicts.say(withdrawVerdict(BLACK_BAG, "2026-01-02T20:00:00.000Z"));
    assert.deepEqual(await film(), before, "withdrawing a verdict changed the film");

    await her.verdicts.forget(act.ref);
    assert.deepEqual(await film(), before, "forgetting a verdict changed the film");

    // And the film is still the only thing that says anything about watching:
    // the `unseen` they set is exactly as they left it, contradiction and all.
    assert.equal((await film())?.viewing, "unseen");
  });

  test("a movie root carries whether they watched it, and nothing evaluative", async () => {
    const her = someone();
    await her.taste.createMovie({ ...BLACK_BAG, viewing: "seen" });

    const [movie] = of((await her.memory()).held, "movie");
    assert.ok(movie && movie.of === "movie");
    assert.equal(movie.viewing, "seen");
    for (const gone of ["state", "judgement", "liked", "loved", "disliked"]) {
      assert.equal(gone in movie, false, `a movie root carries ${gone}`);
    }
  });
});
