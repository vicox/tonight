import type { SchemaModule } from "../../db/migrate.ts";

/**
 * Where Tonight keeps its own thinking.
 *
 * Two tables, both agent-owned, neither authoritative. The taste tables hold
 * what the user established; these hold what Tonight made of it, and the
 * separation is the storage half of §5's boundary — *thinking may persist its
 * own work; belief ownership stays governed.*
 *
 * ## What is not here
 *
 * No confidence, no score, no weight, no evidence graph. An Observation that
 * carried a number would be a weak belief rather than an inert reading, and the
 * roadmap is explicit that an unaccepted Observation *"changes no answer at
 * all"*. There is nowhere for a strength to be written, so nothing can read one.
 *
 * No expiry column either. §6 says a Proposal expires and sets no limit; a
 * column with no rule to fill it would be a decision made by storage.
 *
 * ## Why the target is columns rather than a blob
 *
 * `target_kind`, `target_name`, `target_instruction` — a CHECK on the kind, and
 * the two fields that kind needs. A JSON payload would let a proposal describe
 * an operation nobody designed, which is exactly the open-ended workflow engine
 * this is meant not to be. A second kind means a migration and a new branch,
 * and having to write both is the point.
 *
 * ## State, and what a decided proposal keeps
 *
 * `state` is CHECK-constrained to the three the model has. A decided proposal
 * keeps its row: §6 requires that a rejected proposal *stays* rejected — *"a
 * rejected proposal that returns next month is a worse failure than never
 * proposing"* — and a row that were deleted on rejection could not say so.
 */
export const REFLECTION_SCHEMA: SchemaModule = {
  module: "reflection",
  migrations: [
    {
      version: 1,
      sql: [
        `CREATE TABLE tonight_observations (
           id          uuid NOT NULL DEFAULT gen_random_uuid(),
           user_id     text NOT NULL,
           noticed     text NOT NULL,
           noticed_at  timestamptz NOT NULL DEFAULT now(),

           PRIMARY KEY (user_id, id),
           UNIQUE (id),

           CONSTRAINT tonight_observations_noticed CHECK (btrim(noticed) <> '')
         )`,

        `CREATE TABLE tonight_proposals (
           id                 uuid NOT NULL DEFAULT gen_random_uuid(),
           user_id            text NOT NULL,
           -- The observation it came from, where there was one. Composite, so a
           -- proposal can only ever point at its own user's observation.
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
             ON DELETE SET NULL,

           CONSTRAINT tonight_proposals_noticed CHECK (btrim(noticed) <> ''),
           CONSTRAINT tonight_proposals_kind CHECK (target_kind IN ('genre')),
           CONSTRAINT tonight_proposals_name CHECK (btrim(target_name) <> ''),
           CONSTRAINT tonight_proposals_instruction CHECK (btrim(target_instruction) <> ''),
           CONSTRAINT tonight_proposals_state CHECK (state IN ('pending', 'accepted', 'rejected')),
           -- A decided proposal knows when; a pending one cannot pretend to.
           CONSTRAINT tonight_proposals_decided CHECK (
             (state = 'pending' AND decided_at IS NULL) OR
             (state <> 'pending' AND decided_at IS NOT NULL)
           )
         )`,

        `CREATE INDEX tonight_proposals_pending
           ON tonight_proposals (user_id, proposed_at)
           WHERE state = 'pending'`,
      ].join(";\n"),
    },
  ],
};
