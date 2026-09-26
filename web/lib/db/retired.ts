import type { SchemaModule } from "./migrate.ts";

/**
 * Tables Tonight used to keep, and the migrations that remove them.
 *
 * Tonight persists product memory as five things: Movies, Genres, Mixes,
 * Episodes and Verdicts. What it thinks while it is talking to somebody —
 * a question it means to ask, a pattern it noticed, a change it wants to
 * offer — is conversation, and conversation does not need a row. Three tables
 * were built on the other assumption and are dropped here.
 *
 * ## Why the modules stay registered
 *
 * A schema module removed from `ALL_SCHEMAS` is a deployment that never hears
 * about the drop: the tables keep sitting in the database, unmanaged, owned by
 * nothing, and the next person to read the schema finds product state nobody
 * can explain. So each module keeps its name and gains a final migration.
 * `requireSchema` then refuses to serve until the drop has been applied, which
 * is the same guarantee every other version carries — the code and the database
 * agree about what exists.
 *
 * They are also a reservation. `verdict_questions` and `reflection` cannot be
 * used again for something else without colliding with the record of what they
 * were, which is what stops the tables coming back under the same names by
 * somebody re-adding a module that looks new.
 */

/**
 * The question Tonight was carrying about a film.
 *
 * One row per film waiting on an answer, with when it started waiting and how
 * many chances to ask had gone by. Asking is still something Tonight does; it
 * just does it in the conversation it is already in, where the answer arrives
 * in the same breath. An unanswered question is not evidence either way, and it
 * never was — the difference now is that there is nothing left for it to
 * harden into.
 */
export const RETIRED_QUESTIONS_SCHEMA: SchemaModule = {
  module: "verdict_questions",
  migrations: [
    {
      version: 1,
      sql: `
        CREATE TABLE tonight_verdict_questions (
          user_id       text NOT NULL,
          title         text NOT NULL,
          year          integer NOT NULL,
          since         timestamptz NOT NULL DEFAULT now(),
          opportunities integer NOT NULL DEFAULT 0,

          PRIMARY KEY (user_id, title, year)
        )
      `,
    },
    // A deployment that never ran v1 creates the table and drops it again. That
    // is two statements it did not need, and it is the price of every version
    // being a step from the one before rather than a snapshot of the end.
    { version: 2, sql: `DROP TABLE IF EXISTS tonight_verdict_questions` },
  ],
};

/**
 * What Tonight noticed, and what it offered.
 *
 * Observations were readings it wrote down; Proposals were changes it wanted
 * and had not made, each carrying the genre it would create. Both were
 * inert by design and neither was ever the user's — which is the argument
 * against storing them at all. Tonight may still notice a thread and still ask
 * whether to save it; what happens on a yes is that the Genre gets written, by
 * the tool that writes Genres.
 *
 * Proposals go first: they carry a foreign key into observations.
 */
export const RETIRED_REFLECTION_SCHEMA: SchemaModule = {
  module: "reflection",
  migrations: [
    {
      version: 1,
      sql: `
        CREATE TABLE tonight_observations (
          id          uuid NOT NULL DEFAULT gen_random_uuid(),
          user_id     text NOT NULL,
          noticed     text NOT NULL,
          noticed_at  timestamptz NOT NULL DEFAULT now(),

          PRIMARY KEY (user_id, id),
          UNIQUE (id)
        );

        CREATE TABLE tonight_proposals (
          id                 uuid NOT NULL DEFAULT gen_random_uuid(),
          user_id            text NOT NULL,
          from_id            uuid,
          noticed            text NOT NULL,
          target_kind        text NOT NULL,
          target_name        text NOT NULL,
          target_instruction text NOT NULL,
          state              text NOT NULL DEFAULT 'pending',
          proposed_at        timestamptz NOT NULL DEFAULT now(),
          decided_at         timestamptz,

          PRIMARY KEY (user_id, id),
          UNIQUE (id),
          FOREIGN KEY (user_id, from_id) REFERENCES tonight_observations (user_id, id)
            ON DELETE SET NULL
        )
      `,
    },
    {
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
