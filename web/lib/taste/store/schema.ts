import type { SchemaModule } from "../../db/migrate.ts";

/**
 * The taste model in Postgres: genres, mixes, and which genres a mix is built
 * from.
 *
 * ## Why the name is the key
 *
 * A genre's name is its only identifier, and so is a mix's. There is no
 * surrogate id, because introducing one would invent an identity the product does
 * not have — the user refers to their genres by name, the MCP tools take names,
 * and the page shows names. Instead the reference table names `(user_id, genre)`
 * and carries a foreign key with `ON UPDATE CASCADE`, which is what makes the two
 * hard operations fall out of the schema rather than out of application code:
 *
 *     rename   UPDATE tonight_genres SET name = 'Space opera' …
 *                → every mix built from it follows, in one statement, atomically
 *
 *     delete   DELETE FROM tonight_genres …
 *                → REFUSED while any mix is built from it
 *
 * There is no window in which a genre is under one name and a mix still points at
 * the old one, because there is no second statement to be interrupted between.
 *
 * ## Why genres and mixes are two tables and not one with a kind column
 *
 * Because the rule that matters is "a mix is built from genres, never from
 * another mix", and two tables make that a foreign key instead of a check
 * somebody has to remember to write. `tonight_mix_genres.genre` references
 * `tonight_genres`; there is no column it could point at a mix with, so chaining
 * is not something this schema can express. One table with a kind column would
 * make every reference syntactically legal and push the whole invariant into
 * application code.
 *
 * The cost is that a genre and a mix may share a name — they are separate
 * namespaces. That is the right trade: the two are shown in separate sections and
 * asked for by separate parameters, so there is nowhere the ambiguity could be
 * resolved wrongly, and nothing anywhere resolves a bare name against both.
 *
 * ## What is not here
 *
 * There is no table of recommendations, no watch history, and nowhere to record
 * that a movie was shown to somebody. Recommending reads this and writes nothing.
 * When history arrives it will be its own migration and its own tables, and the
 * shape of it is already decided by the tables above: a recommendation names the
 * genre or mix that caused it, by name, with the same `ON UPDATE CASCADE` that
 * everything else here uses. It will be evidence for *proposing* changes to this
 * model — never a second, invisible model that quietly outvotes it.
 */
export const TASTE_SCHEMA: SchemaModule = {
  module: "taste",
  migrations: [
    {
      version: 1,
      sql: `
        CREATE TABLE tonight_genres (
          user_id     text NOT NULL,
          name        text NOT NULL,
          instruction text NOT NULL,
          created_at  timestamptz NOT NULL DEFAULT now(),
          updated_at  timestamptz NOT NULL DEFAULT now(),

          PRIMARY KEY (user_id, name),

          -- The text rules that survive being written down. A value outside them
          -- means a bug in the code that writes here, not bad input: everything
          -- reaching this table has been through lib/taste/model.ts.
          CONSTRAINT tonight_genres_name CHECK (btrim(name) <> ''),
          -- A genre with no instruction is a movie-database tag rather than
          -- somebody's taste, which is the one thing this product is not.
          CONSTRAINT tonight_genres_instruction CHECK (btrim(instruction) <> '')
        );

        -- Genres are unique per user ignoring case, which the primary key alone
        -- does not say: "Sci-Fi" and "sci-fi" are one genre. Two users may of
        -- course both have an "Action" — user_id leads every key here.
        CREATE UNIQUE INDEX tonight_genres_identity
          ON tonight_genres (user_id, lower(name));

        CREATE TABLE tonight_mixes (
          user_id     text NOT NULL,
          name        text NOT NULL,
          instruction text NOT NULL,
          created_at  timestamptz NOT NULL DEFAULT now(),
          updated_at  timestamptz NOT NULL DEFAULT now(),

          PRIMARY KEY (user_id, name),

          CONSTRAINT tonight_mixes_name CHECK (btrim(name) <> ''),
          -- A mix's instruction is the whole reason a mix is not an intersection.
          CONSTRAINT tonight_mixes_instruction CHECK (btrim(instruction) <> '')
        );

        CREATE UNIQUE INDEX tonight_mixes_identity
          ON tonight_mixes (user_id, lower(name));

        -- Which genres a mix is built from, one row each, ordered so the list
        -- comes back the way it was given: [Sci-Fi] + [Thriller] reads in the
        -- order the user wrote it.
        CREATE TABLE tonight_mix_genres (
          user_id  text NOT NULL,
          mix      text NOT NULL,
          genre    text NOT NULL,
          position integer NOT NULL,

          PRIMARY KEY (user_id, mix, genre),

          -- Renaming the mix carries its genre list with it; deleting the mix
          -- takes the list too, because a list belonging to nothing is nothing.
          CONSTRAINT tonight_mix_genres_mix
            FOREIGN KEY (user_id, mix) REFERENCES tonight_mixes (user_id, name)
            ON UPDATE CASCADE ON DELETE CASCADE,

          -- Renaming a genre rewrites every mix built from it, and deleting one
          -- is refused while a mix still is. Both rules are stated in prose in
          -- the MCP tool descriptions; here they are the schema, so neither can
          -- be forgotten.
          --
          -- This column is also the whole of "no mix-to-mix chaining": it can
          -- only ever hold a genre, because that is the only table it points at.
          CONSTRAINT tonight_mix_genres_genre
            FOREIGN KEY (user_id, genre) REFERENCES tonight_genres (user_id, name)
            ON UPDATE CASCADE ON DELETE RESTRICT
        );

        -- Answering "which mixes are built from this genre" without a scan, which
        -- is what a delete has to ask before it is allowed to proceed.
        CREATE INDEX tonight_mix_genres_genre_index
          ON tonight_mix_genres (user_id, genre);
      `,
    },
  ],
};
