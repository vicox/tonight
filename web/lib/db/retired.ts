import type { SchemaModule } from "./migrate.ts";

/**
 * Tables Tonight used to keep, and the migrations that remove them.
 *
 * Tonight persists product memory as five things: Movies, Genres, Vibes,
 * Episodes and Verdicts. What it thinks while it is talking to somebody —
 * a question it means to ask, a pattern it noticed, a change it wants to
 * offer — is conversation, and conversation does not need a row. Three tables
 * were built on the other assumption and are removed here.
 *
 * ## Why the modules stay registered
 *
 * A schema module removed from `ALL_SCHEMAS` is a deployment that never hears
 * about the drop: the tables keep sitting in the database, unmanaged, owned by
 * nothing, and the next person to read the schema finds product state nobody
 * can explain. So each module keeps its name and carries the step that removes
 * it, and `npm run db:migrate` runs it like any other.
 *
 * No store opens either module, so unlike every live schema there is no
 * `requireSchema` behind these and a deployment that skipped the migration is
 * not refused. That is the right behaviour and worth saying plainly: nothing
 * reads these tables, so their continued existence breaks nothing — it is
 * untidiness, not an outage, and refusing to serve over untidiness would be
 * worse than the untidiness.
 *
 * They are also a reservation. `verdict_questions` and `reflection` cannot be
 * used again for something else without colliding with the record of what they
 * were, which is what stops the tables coming back under the same names by
 * somebody re-adding a module that looks new.
 *
 * ## The version numbers, which are the whole of the correctness here
 *
 * A version already recorded is never re-run. So a retirement numbered at a
 * version the module has already used is a retirement that never happens: the
 * database skips it as applied and keeps the table forever. The numbers below
 * are therefore the ones that come *after* everything each module actually
 * shipped, and nothing else about this file matters as much.
 *
 *   verdict_questions   shipped v1 (create) and v2 (add `opportunities`),
 *                       so the drop is **v3**
 *
 *   reflection          shipped v1 (create) and nothing else,
 *                       so the drop is **v2**
 *
 * ## Why the shipped versions are not restated here
 *
 * Because no database needs them and one population would be harmed by them.
 * The catalog production migrates from has only ever held `oauth`, `taste`,
 * `web`, `episodes` and `verdicts` — these two modules existed on a development
 * branch and nowhere else — so restating their creates would have every
 * production and every fresh database build four tables, alter one, and drop
 * them all again: real DDL, with real ways to fail, for a schema nobody wants.
 * Omitting them is not the same as rewriting them; their definitions are in the
 * history, at `896a325`, unaltered.
 *
 * The two populations both end up in the same place:
 *
 *   a database that ran the branch   has the shipped versions recorded, runs
 *                                    the drop, and loses the tables it has
 *
 *   production, and any fresh one    has nothing recorded, runs the drop, and
 *                                    removes nothing, because there is nothing
 *                                    there — `IF EXISTS` is doing that work
 *
 * `requireSchema` asks whether the versions this code needs have been applied,
 * not whether the database has exactly those and no others — a rollback depends
 * on that — so the leftover rows on a development database are a true record of
 * something that happened rather than a discrepancy.
 */

/**
 * The question Tonight was carrying about a film.
 *
 * `tonight_verdict_questions` held one row per film waiting on an answer, with
 * when it started waiting (v1) and how many chances to ask had gone by (v2).
 * Asking is
 * still something Tonight does; it just does it in the conversation it is
 * already in, where the answer arrives in the same breath. An unanswered
 * question is not evidence either way, and it never was — the difference now is
 * that there is nothing left for it to harden into.
 */
export const RETIRED_QUESTIONS_SCHEMA: SchemaModule = {
  module: "verdict_questions",
  // v3: after the v1 that created the table and the v2 that added
  // `opportunities`. At v2 this would be recorded-and-skipped on every database
  // that has the table, which is precisely the set of databases it is for.
  migrations: [{ version: 3, sql: `DROP TABLE IF EXISTS tonight_verdict_questions` }],
};

/**
 * What Tonight noticed, and what it offered.
 *
 * `tonight_observations` held readings it had written down; `tonight_proposals`
 * held changes it wanted and had not made, each carrying the genre it would
 * create, and each carrying a foreign key back into an observation — which is
 * why the drop below takes them in that order. Both were inert by design and
 * neither was ever the user's, which is the argument against storing them at
 * all. Tonight may still notice a thread and still ask whether to save it; what
 * happens on a yes is that the Genre gets written, by the tool that writes
 * Genres.
 */
export const RETIRED_REFLECTION_SCHEMA: SchemaModule = {
  module: "reflection",
  migrations: [
    {
      // v2: this module shipped one version and never a second.
      version: 2,
      sql: `
        DROP TABLE IF EXISTS tonight_proposals;
        DROP TABLE IF EXISTS tonight_observations;
      `,
    },
  ],
};

/** Both, for the catalog. */
export const RETIRED_SCHEMAS: readonly SchemaModule[] = [
  RETIRED_QUESTIONS_SCHEMA,
  RETIRED_REFLECTION_SCHEMA,
];
