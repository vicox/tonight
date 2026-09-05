import type { SchemaModule } from "../../db/migrate.ts";

/**
 * The taste model in Postgres: genres, mixes, and which genres a mix is built
 * from.
 *
 * ## Why a name is a handle and an id is the identity
 *
 * v1 made the name the key, and said so at length: no surrogate id, because one
 * would invent an identity the product did not have. That was true of a model
 * whose only relation was mix-to-genre, where `ON UPDATE CASCADE` made a rename
 * fall out of the schema for free. It stops being true as soon as anything else
 * refers to a mix, because then a rename rewrites every reference to it — and
 * `docs/work/taste-model-uuid-identity.md` is the review that decided to make the
 * change before that happens rather than after.
 *
 * So there are now two things where there was one:
 *
 *     id      uuid, generated here, immutable, never leaves the store
 *     name    what the user typed, what the tools take, what the page shows,
 *             and what they may change whenever they like
 *
 * The reference table holds ids. A rename is one `UPDATE` that writes one row and
 * touches no reference at all; the cascade is gone because there is nothing left
 * to cascade. Deletion is unchanged — `ON DELETE RESTRICT` still refuses while a
 * mix is built from a genre.
 *
 * Three keys, doing three jobs that used to be conflated:
 *
 *     PRIMARY KEY (user_id, id)         identity, and the only thing a relation
 *                                       may point at — the `user_id` in it is
 *                                       what makes a cross-tenant reference
 *                                       inexpressible rather than merely unlikely
 *     UNIQUE (id)                       one object, one id, globally
 *     UNIQUE (user_id, lower(name))     the human handle, unique per user,
 *                                       folded by Postgres and by nothing else
 *
 * A uuid is unique with overwhelming probability. That is a statement about
 * collisions and not about permission: nothing stops user A naming user B's genre
 * id except the `user_id` inside the foreign key, which is why both foreign keys
 * are composite.
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
 * shape of it is already decided by the tables above: it will reference
 * `(user_id, id)`, so a rename will cost it nothing. It will be evidence for
 * *proposing* changes to this model — never a second, invisible model that
 * quietly outvotes it.
 */
/**
 * Fills in reference rows that carry a name but no id.
 *
 * Written once and used three times: as v2's backfill, as v3's opening
 * statements, and by whoever runs the reconciliation after old writers have
 * drained. Three copies of this would be three chances for them to disagree
 * about what "the same row" means.
 *
 * Guarded on `IS NULL` so it is idempotent — v2 runs it against rows that are
 * all null, the operator runs it against the few an old instance added after
 * that, and v3 runs it against what should by then be none.
 *
 * Only meaningful against the expanded schema: v3 drops the name columns it
 * reads, so there is nothing left to reconcile from afterwards.
 */
export const RECONCILE_MIX_GENRES = `
  UPDATE tonight_mix_genres AS r SET mix_id = m.id
    FROM tonight_mixes AS m
   WHERE m.user_id = r.user_id AND m.name = r.mix AND r.mix_id IS NULL;

  UPDATE tonight_mix_genres AS r SET genre_id = g.id
    FROM tonight_genres AS g
   WHERE g.user_id = r.user_id AND g.name = r.genre AND r.genre_id IS NULL;
`;

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

    /**
     * EXPAND. Additive only: every statement here leaves v1 working.
     *
     * An instance deployed before this migration keeps inserting
     * `(user_id, mix, genre, position)` and reading by name, and must keep
     * succeeding — which is why the two id columns on the reference table are
     * nullable and why nothing old is dropped. See the plan's EXPAND phase.
     */
    {
      version: 2,
      sql: `
        -- Generated by Postgres, not by the application: gen_random_uuid() is
        -- built in from 13 onwards, so there is no extension to create — which
        -- matters because production never runs DDL from a request.
        ALTER TABLE tonight_genres ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
        ALTER TABLE tonight_mixes  ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();

        -- A plain index rather than a constraint, deliberately. A foreign key may
        -- target either, but only an index can later be promoted with
        -- ALTER TABLE ... ADD PRIMARY KEY USING INDEX — which is how v3 turns
        -- this into the primary key without dropping and recreating the foreign
        -- keys that depend on it.
        CREATE UNIQUE INDEX tonight_genres_tenant_id ON tonight_genres (user_id, id);
        CREATE UNIQUE INDEX tonight_mixes_tenant_id  ON tonight_mixes  (user_id, id);

        -- One object, one id, across every user. Not the reference target: a
        -- reference must carry user_id to be tenant-safe.
        ALTER TABLE tonight_genres ADD CONSTRAINT tonight_genres_id UNIQUE (id);
        ALTER TABLE tonight_mixes  ADD CONSTRAINT tonight_mixes_id  UNIQUE (id);

        -- Nullable, and this is not an oversight: an instance from before this
        -- migration inserts a reference row without mentioning them.
        ALTER TABLE tonight_mix_genres
          ADD COLUMN mix_id   uuid,
          ADD COLUMN genre_id uuid;

        ${RECONCILE_MIX_GENRES}

        -- Composite on user_id, which is the whole of tenant safety here. They
        -- permit NULL while the columns are nullable, so old writers stay legal.
        ALTER TABLE tonight_mix_genres
          ADD CONSTRAINT tonight_mix_genres_mix_id
            FOREIGN KEY (user_id, mix_id) REFERENCES tonight_mixes (user_id, id)
            ON DELETE CASCADE,
          ADD CONSTRAINT tonight_mix_genres_genre_id
            FOREIGN KEY (user_id, genre_id) REFERENCES tonight_genres (user_id, id)
            ON DELETE RESTRICT;

        CREATE INDEX tonight_mix_genres_genre_id_index
          ON tonight_mix_genres (user_id, genre_id);
      `,
    },

    /**
     * CONTRACT. Destructive, and the reason the plan asks for a maintenance
     * boundary: an instance deployed before v2 would still be writing the name
     * columns this drops, and nothing in this repository can prove one is not.
     *
     * It opens by reconciling, which is belt and braces rather than the real
     * mechanism — the operator runs `reconcileMixGenres` after the drain and
     * checks the gate. Repeating it here means a row written by an old instance
     * between that check and this migration is repaired rather than turning
     * `SET NOT NULL` into a failed deploy.
     */
    {
      version: 3,
      sql: `
        ${RECONCILE_MIX_GENRES}

        -- The name-based foreign keys go first: the primary keys below cannot be
        -- dropped while they are pointing at them.
        ALTER TABLE tonight_mix_genres
          DROP CONSTRAINT tonight_mix_genres_mix,
          DROP CONSTRAINT tonight_mix_genres_genre;

        ALTER TABLE tonight_mix_genres
          ALTER COLUMN mix_id   SET NOT NULL,
          ALTER COLUMN genre_id SET NOT NULL;

        ALTER TABLE tonight_mix_genres DROP CONSTRAINT tonight_mix_genres_pkey;
        ALTER TABLE tonight_mix_genres ADD PRIMARY KEY (user_id, mix_id, genre_id);

        DROP INDEX tonight_mix_genres_genre_index;
        ALTER TABLE tonight_mix_genres DROP COLUMN mix, DROP COLUMN genre;

        -- The identity swap. Promoting the index v2 created keeps the foreign
        -- keys that depend on it working across the change, and leaves no
        -- duplicate index behind.
        ALTER TABLE tonight_genres DROP CONSTRAINT tonight_genres_pkey;
        ALTER TABLE tonight_genres ADD PRIMARY KEY USING INDEX tonight_genres_tenant_id;

        ALTER TABLE tonight_mixes DROP CONSTRAINT tonight_mixes_pkey;
        ALTER TABLE tonight_mixes ADD PRIMARY KEY USING INDEX tonight_mixes_tenant_id;
      `,
    },
  ],
};
