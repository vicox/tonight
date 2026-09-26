import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { sqlEpisodeStore } from "../episodes/store/sql.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { sqlReflectionStore } from "../reflection/store/sql.ts";
import { sqlTasteStore } from "../taste/store/sql.ts";
import { sqlQuestionStore } from "../verdicts/questions/sql.ts";
import { sqlVerdictStore } from "../verdicts/store/sql.ts";
import { migrate } from "./migrate.ts";
import { embeddedDriver } from "./pglite.ts";
import { ALL_SCHEMAS, schemaNamed } from "./schemas.ts";

/**
 * The deploy path, and what it has to leave working.
 *
 * `ALL_SCHEMAS` is what `npm run db:migrate` runs. A module missing from it is
 * not a missing table anybody notices at deploy time: the command reports
 * success, and then production refuses every request that touches the module —
 * `prepareSchema` migrates only outside production, so `requireSchema` is all
 * that is left there and it throws.
 *
 * M4's reflection schema was added to the application and not to this list,
 * which is exactly that failure. So the test below is not *"is REFLECTION_SCHEMA
 * in the array"* — that would pass again the next time somebody adds a store and
 * forgets. It migrates through the catalog the way a deployment does, then opens
 * every store the MCP session opens and asks each one to do its job.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

describe("the production migration catalog", () => {
  test("migrating the catalog leaves every store the application opens ready to use", async () => {
    const driver = await embeddedDriver();
    try {
      // The deploy path: the whole catalog, in the order the command runs it,
      // and nothing else. No store opener runs first, so nothing can quietly
      // create a table on the way past.
      for (const schema of ALL_SCHEMAS) await migrate(driver, schema);

      const who = asUser("google:deployed");
      const taste = sqlTasteStore(driver, who);
      const episodes = sqlEpisodeStore(driver, who);
      const verdicts = sqlVerdictStore(driver, who);
      const questions = sqlQuestionStore(driver, who);
      const reflection = sqlReflectionStore(driver, who);

      // Each store is asked for the read its own surface is built on. A table
      // the catalog did not create fails here rather than in production.
      assert.deepEqual((await taste.taste()).genres, []);
      assert.deepEqual(await episodes.episodes(), []);
      assert.deepEqual(await verdicts.standing(), []);
      assert.deepEqual(await questions.pending(new Date().toISOString()), []);
      assert.deepEqual(await reflection.observations(), []);
      assert.deepEqual(await reflection.proposals(), []);

      // And a write, because a missing column is not a missing table: the
      // reflection lifecycle is exercised end to end against the deployed
      // schema, including the acceptance that writes across two modules.
      const noticed = await reflection.observe("they keep choosing quiet films");
      const offered = await reflection.propose(noticed.ref, "worth making a genre?", {
        kind: "genre",
        name: "Restrained Thriller",
        instruction: "Tension carried by what is withheld rather than what is shown.",
      });
      await reflection.accept(offered.ref);
      assert.deepEqual(
        (await taste.taste()).genres.map((one) => one.name),
        ["Restrained Thriller"],
      );
    } finally {
      await driver.close();
    }
  });

  test("every schema the application opens is in the catalog", () => {
    // The other direction, and the cheap one: a module the stores know about
    // and the catalog does not is the defect above waiting to happen again.
    // Named rather than discovered, because a list that derived itself from the
    // stores would be satisfied by any two lists that agreed with each other.
    const opened = ["oauth", "web", "taste", "episodes", "verdicts", "verdict_questions", "reflection"];
    for (const named of opened) {
      assert.ok(schemaNamed(named), `${named} is not in the production migration catalog`);
    }
    assert.equal(
      ALL_SCHEMAS.length,
      opened.length,
      "the catalog holds a module this test does not know about — add it here and check it is deployed",
    );
  });
});
