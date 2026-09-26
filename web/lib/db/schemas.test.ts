import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { sqlEpisodeStore } from "../episodes/store/sql.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { sqlTasteStore } from "../taste/store/sql.ts";
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

      // Each store is asked for the read its own surface is built on. A table
      // the catalog did not create fails here rather than in production.
      assert.deepEqual((await taste.taste()).genres, []);
      assert.deepEqual(await episodes.episodes(), []);
      assert.deepEqual(await verdicts.standing(), []);

    } finally {
      await driver.close();
    }
  });

  test("product memory is five roots, and the catalog says so", () => {
    // The invariant this repository now holds: Tonight persists product memory
    // only as Movies, Genres, Mixes, Episodes and Verdicts. What it thinks while
    // it is talking to somebody is conversation, and conversation does not need
    // a row — the three tables built on the other assumption are dropped by
    // `retired.ts`, whose modules stay registered so a deployment hears about it.
    //
    // Derived from the migrations rather than from a list somebody keeps in step,
    // because a list that agreed with another list would be satisfied by both
    // being wrong.
    const created = new Set<string>();
    for (const schema of ALL_SCHEMAS) {
      for (const migration of schema.migrations) {
        const sql = "sql" in migration && typeof migration.sql === "string" ? migration.sql : "";
        for (const [, table] of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/gu)) {
          created.add(table!);
        }
        for (const [, table] of sql.matchAll(/DROP TABLE (?:IF EXISTS )?([a-z_]+)/gu)) {
          created.delete(table!);
        }
      }
    }

    // Infrastructure is not product memory: signing somebody in is not something
    // Tonight knows about their taste. Named explicitly so that adding one is a
    // deliberate act rather than a silent widening of the rule.
    const INFRASTRUCTURE = [
      "oauth_clients",
      "oauth_pending_logins",
      "oauth_authorization_codes",
      "oauth_refresh_families",
      "oauth_refresh_tokens",
      "oauth_rate_limits",
      "web_logins",
      "web_sessions",
    ];

    // The five roots, and the relations that constitute them. A mix's genres and
    // a film's mixes are what a Mix and a Movie *are*; an evening's offers are
    // part of the evening. None is a root of its own.
    const PRODUCT_MEMORY = [
      "tonight_movies",
      "tonight_genres",
      "tonight_mixes",
      "tonight_mix_genres",
      "tonight_mix_movies",
      "tonight_episodes",
      "tonight_episode_offers",
      "tonight_verdict_acts",
    ];

    assert.deepEqual(
      [...created].sort(),
      [...INFRASTRUCTURE, ...PRODUCT_MEMORY].sort(),
      "a table exists that is neither infrastructure nor one of the five product-memory roots",
    );

    // And the three that are gone stay gone. Named individually: the failure
    // this guards against is one of them coming back under its own name.
    for (const retired of ["tonight_verdict_questions", "tonight_observations", "tonight_proposals"]) {
      assert.equal(created.has(retired), false, `${retired} is a live table again`);
    }
  });

  test("the retired modules are still deployed, so the drop actually runs", () => {
    // Removing a module from the catalog would leave its tables in the database
    // with nothing owning them. The modules stay; their last migration drops.
    for (const name of ["verdict_questions", "reflection"]) {
      const schema = schemaNamed(name);
      assert.ok(schema, `${name} left the catalog and its tables would be orphaned`);
      const last = schema.migrations.at(-1);
      assert.ok(last, `${name} has no migrations`);
      const sql = "sql" in last && typeof last.sql === "string" ? last.sql : "";
      assert.match(sql, /DROP TABLE/u, `${name}'s last migration does not drop anything`);
    }
  });
});
