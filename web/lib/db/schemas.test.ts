import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { sqlEpisodeStore } from "../episodes/store/sql.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { sqlTasteStore } from "../taste/store/sql.ts";
import { sqlVerdictStore } from "../verdicts/store/sql.ts";
import { migrate, type SchemaModule } from "./migrate.ts";
import { embeddedDriver } from "./pglite.ts";
import { RETIRED_SCHEMAS } from "./retired.ts";
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

  test("no retired module is opened as a store", async () => {
    // The catalog migrates them; nothing else may touch them. A store opener
    // calls `prepareSchema`, so the complete list of schemas the application
    // prepares at run time is the complete list of schemas it depends on — and
    // a retired module appearing there would mean code still reaching for a
    // table this release drops, which is a production failure on the first
    // request rather than a test failure here.
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) sources.push(path);
      }
    };
    walk(new URL("..", import.meta.url).pathname);

    const prepared = new Set<string>();
    for (const path of sources) {
      for (const [, named] of readFileSync(path, "utf8").matchAll(/prepareSchema\(\s*\w+\s*,\s*(\w+)\s*\)/gu)) {
        prepared.add(named!);
      }
    }

    assert.deepEqual(
      [...prepared].sort(),
      ["EPISODES_SCHEMA", "OAUTH_SCHEMA", "TASTE_SCHEMA", "VERDICTS_SCHEMA", "WEB_SCHEMA"],
      "the schemas the application opens at run time are not the five it should",
    );
    // And the retirement is reachable from exactly one place. `retired.ts`
    // exists to be migrated and for nothing else, so a second importer would be
    // code that had found a use for a schema whose whole purpose is to stop
    // existing.
    const importers = sources.filter((path) => /from "[^"]*retired\.ts"/u.test(readFileSync(path, "utf8")));
    assert.deepEqual(
      importers.map((path) => path.split("/").slice(-2).join("/")),
      ["db/schemas.ts"],
      "something other than the catalog reaches for the retired schemas",
    );

    assert.equal(
      RETIRED_SCHEMAS.every((schema) => ALL_SCHEMAS.includes(schema)),
      true,
      "a retired schema is defined and not deployed, so its drop would never run",
    );
  });

  test("the retired modules are still deployed, and they only ever remove", () => {
    // Two things at once, and they pull in opposite directions.
    //
    // Removing a module from the catalog would leave its tables in the database
    // with nothing owning them, so the modules stay. But their tables never
    // reached a deployed database — the catalog production migrates from has
    // never held either name — so a create here would be real DDL, run against
    // every production and every fresh database, building a schema nobody wants
    // in order to drop it a statement later. So the modules stay and the create
    // is gone: what is left is removal, and only removal.
    for (const name of ["verdict_questions", "reflection"]) {
      const schema = schemaNamed(name);
      assert.ok(schema, `${name} left the catalog and its tables would be orphaned`);
      assert.ok(schema.migrations.length > 0, `${name} has no migrations and does nothing at all`);

      for (const migration of schema.migrations) {
        const sql = "sql" in migration && typeof migration.sql === "string" ? migration.sql : "";
        assert.ok(sql, `${name} v${String(migration.version)} is not plain SQL`);
        assert.match(sql, /DROP TABLE IF EXISTS/u, `${name} v${String(migration.version)} does not drop`);
        assert.doesNotMatch(
          sql,
          /CREATE|ALTER|INSERT|UPDATE/iu,
          `${name} v${String(migration.version)} builds or writes something on its way out`,
        );
      }
    }
  });
});

/**
 * The upgrade this release actually performs, run against the schema production
 * actually has.
 *
 * A fresh database proves the catalog is coherent. It does not prove the deploy
 * is safe, because production is not fresh: it is a database that stopped at a
 * particular version, with rows in it, and the release has to move *that* to
 * the new schema without losing anything or failing halfway.
 *
 * The deployed state is not a guess. The catalog `npm run db:migrate` ran at
 * `origin/main` is `[oauth, taste, web, episodes]`, and those modules were at
 * versions 1, 7, 1 and 1 — so the simulation below migrates exactly that far,
 * writes the kind of rows a user would have left there, and only then runs the
 * release catalog over the top.
 *
 * Three things matter and each is asserted rather than described:
 *
 *   the rows survive       a film somebody saved is still theirs afterwards
 *   the opinions convert   `state: 'loved'` was the only opinion the old schema
 *                          could hold, and the new one holds opinions as
 *                          Verdicts — so the upgrade has to move them, and a
 *                          film whose state said nothing must gain nothing
 *   nothing is built to be thrown away
 *                          production never had the retired tables, so the
 *                          upgrade must not create them on its way to dropping
 *                          them
 */
describe("upgrading the database production actually has", () => {
  /** The catalog `origin/main` deploys, at the versions it deploys them to. */
  const DEPLOYED = { oauth: 1, taste: 7, web: 1, episodes: 1 };

  /** One module's schema, truncated to the last version production ran. */
  const asDeployed = (name: string): SchemaModule => {
    const schema = schemaNamed(name);
    assert.ok(schema, `${name} is not in the catalog`);
    const upTo = DEPLOYED[name as keyof typeof DEPLOYED];
    return { module: name, migrations: schema.migrations.filter((one) => one.version <= upTo) };
  };

  test("a populated production database upgrades, keeps its rows, and converts its opinions", async () => {
    const driver = await embeddedDriver();
    try {
      // (1) Production, as it stands this morning.
      for (const name of Object.keys(DEPLOYED)) await migrate(driver, asDeployed(name));

      const applied = async (name: string) =>
        (
          await driver.query<{ version: number }>(
            "SELECT version FROM schema_migrations WHERE module = $1 ORDER BY version",
            [name],
          )
        ).map((row) => row.version);
      assert.deepEqual(await applied("taste"), [1, 2, 3, 4, 5, 6, 7], "the starting point is not taste v7");
      assert.deepEqual(await applied("verdicts"), [], "production already has verdicts, which it does not");

      // (2) What somebody left in it. Written as SQL rather than through a
      // store, because the stores in this checkout speak the new schema — the
      // whole point is to start from rows the old one wrote.
      const who = "google:already-here";
      const saved = [
        { title: "Heat", year: 1995, state: "loved" },
        { title: "Zodiac", year: 2007, state: "disliked" },
        { title: "Prisoners", year: 2013, state: "seen" },
        { title: "Dune", year: 2021, state: null },
      ];
      for (const movie of saved) {
        await driver.query(
          "INSERT INTO tonight_movies (user_id, title, year, state) VALUES ($1, $2, $3, $4)",
          [who, movie.title, movie.year, movie.state],
        );
      }
      await driver.query(
        "INSERT INTO tonight_genres (user_id, name, instruction) VALUES ($1, $2, $3)",
        [who, "Slow Burn", "takes its time"],
      );
      const [evening] = await driver.query<{ id: string }>(
        "INSERT INTO tonight_episodes (user_id, request) VALUES ($1, $2) RETURNING id",
        [who, "something tense"],
      );
      await driver.query(
        `INSERT INTO tonight_episode_offers (user_id, episode, position, title, year, lead)
         VALUES ($1, $2, 0, $3, $4, true)`,
        [who, evening!.id, "Heat", 1995],
      );

      // (3) The deploy: `npm run db:migrate` with this release's catalog.
      for (const schema of ALL_SCHEMAS) await migrate(driver, schema);

      // The schema moved the whole way.
      assert.deepEqual(await applied("taste"), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      assert.deepEqual(await applied("episodes"), [1, 2]);
      assert.deepEqual(await applied("verdicts"), [1, 2]);
      // The retirements run here too, and record nothing but themselves: this
      // database never had the tables, so the drop removes nothing.
      assert.deepEqual(await applied("verdict_questions"), [3], "the retired module did not record its removal");
      assert.deepEqual(await applied("reflection"), [2], "the retired module did not record its removal");

      // (4) Their films are still theirs, and the evening is still there.
      const user = asUser(who);
      const taste = sqlTasteStore(driver, user);
      const model = await taste.taste();
      assert.deepEqual(
        model.movies.map((one) => one.title).sort(),
        ["Dune", "Heat", "Prisoners", "Zodiac"],
        "the upgrade lost somebody's films",
      );
      assert.deepEqual(model.genres.map((one) => one.name), ["Slow Burn"]);
      assert.equal((await sqlEpisodeStore(driver, user).episodes()).length, 1, "the upgrade lost an evening");

      // (5) The opinions moved to where opinions live now. `seen` and a film
      // with nothing said are facts about watching, not opinions, and must
      // arrive as no verdict at all — an upgrade that read either as an opinion
      // would be inventing one.
      const standing = await sqlVerdictStore(driver, user).standing();
      assert.deepEqual(
        standing
          .map((one) => ({ title: one.title, judgement: one.judgement }))
          .sort((a, b) => a.title.localeCompare(b.title)),
        [
          { title: "Heat", judgement: "loved" },
          { title: "Zodiac", judgement: "disliked" },
        ],
        "the legacy opinions did not convert, or something that was not an opinion did",
      );

      // (6) And the watching facts survived the split, on the films that had one.
      const viewingOf = (title: string) => model.movies.find((one) => one.title === title)?.viewing;
      assert.equal(viewingOf("Prisoners"), "seen");
      assert.equal(viewingOf("Heat"), "seen", "a film they loved is a film they watched");
      assert.equal(viewingOf("Dune"), null, "a film nobody said anything about gained a viewing");
    } finally {
      await driver.close();
    }
  });

  test("the upgrade never builds the retired tables on its way to dropping them", async () => {
    const driver = await embeddedDriver();
    try {
      for (const name of Object.keys(DEPLOYED)) await migrate(driver, asDeployed(name));
      for (const schema of ALL_SCHEMAS) await migrate(driver, schema);

      // Not *"they are absent afterwards"* — a create followed by a drop leaves
      // them absent too, and that is the thing this release decided against.
      // Asked of the migrations instead: a database that never had these tables
      // must never be asked to make one.
      for (const name of ["verdict_questions", "reflection"]) {
        for (const migration of schemaNamed(name)!.migrations) {
          const sql = "sql" in migration && typeof migration.sql === "string" ? migration.sql : "";
          assert.doesNotMatch(sql, /CREATE TABLE/iu, `${name} builds a table production never had`);
        }
      }

      for (const table of ["tonight_verdict_questions", "tonight_observations", "tonight_proposals"]) {
        const [row] = await driver.query<{ present: boolean }>(
          "SELECT to_regclass($1) IS NOT NULL AS present",
          [table],
        );
        assert.equal(row?.present, false, `${table} exists after the upgrade`);
      }
    } finally {
      await driver.close();
    }
  });

  test("a database that ran the development branch loses the tables it actually has", async () => {
    // The other population, and the reason the retired modules stay in the
    // catalog at all: a checkout of the branch that built these tables has them,
    // and the release has to reach that database too and leave it with the same
    // schema as production.
    //
    // **The versions are the test.** `verdict_questions` shipped v1 and v2, so a
    // branch database has both recorded — and a retirement numbered v2 would be
    // read as already applied and skipped, leaving the table in place forever
    // with nothing owning it. That is not a hypothetical: it is what this file
    // asserted before, with the drop at v2 and this fixture recording only v1,
    // so the fixture agreed with the bug. The claims below are what the branch
    // actually left behind.
    const driver = await embeddedDriver();
    try {
      for (const name of Object.keys(DEPLOYED)) await migrate(driver, asDeployed(name));

      // The branch, reconstructed: the tables as they were, and the claims that
      // say so. Only the shape matters — nothing reads them again.
      await driver.exec(`
        CREATE TABLE tonight_verdict_questions (
          user_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
          title text NOT NULL, year integer NOT NULL, since timestamptz NOT NULL,
          opportunities integer NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, id)
        );
        CREATE TABLE tonight_observations (id uuid NOT NULL, user_id text NOT NULL, noticed text NOT NULL, UNIQUE (id));
        CREATE TABLE tonight_proposals (id uuid NOT NULL, user_id text NOT NULL, from_id uuid REFERENCES tonight_observations (id));
      `);
      // Exactly what shipped: questions v1 and v2, reflection v1.
      await driver.query(
        "INSERT INTO schema_migrations (module, version) VALUES ('verdict_questions', 1), ('verdict_questions', 2), ('reflection', 1)",
      );

      for (const schema of ALL_SCHEMAS) await migrate(driver, schema);

      // The retirement ran, at a version the database had not already used.
      const applied = async (name: string) =>
        (
          await driver.query<{ version: number }>(
            "SELECT version FROM schema_migrations WHERE module = $1 ORDER BY version",
            [name],
          )
        ).map((row) => row.version);
      assert.deepEqual(
        await applied("verdict_questions"),
        [1, 2, 3],
        "the questions retirement did not run — it is numbered at a version this database already had",
      );
      assert.deepEqual(await applied("reflection"), [1, 2]);

      for (const table of ["tonight_verdict_questions", "tonight_observations", "tonight_proposals"]) {
        const [row] = await driver.query<{ present: boolean }>(
          "SELECT to_regclass($1) IS NOT NULL AS present",
          [table],
        );
        assert.equal(row?.present, false, `${table} survived the upgrade on a development database`);
      }
    } finally {
      await driver.close();
    }
  });

  test("each retirement is numbered past everything its module shipped", () => {
    // The rule the test above exercises, stated where somebody adding a third
    // retirement will read it. Version numbers come from the history of the
    // module, not from the file that is left: `896a325` is the last commit that
    // held these schemas, and it is where these numbers come from.
    const SHIPPED = { verdict_questions: 2, reflection: 1 };
    for (const [name, last] of Object.entries(SHIPPED)) {
      const schema = schemaNamed(name);
      assert.ok(schema, `${name} is not in the catalog`);
      for (const migration of schema.migrations) {
        assert.ok(
          migration.version > last,
          `${name} v${String(migration.version)} reuses a version this module already shipped, ` +
            `so a database that has it would record the retirement as done without running it`,
        );
      }
    }
  });
});
