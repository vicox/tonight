import { EPISODES_SCHEMA } from "../episodes/store/sql.ts";
import { OAUTH_SCHEMA } from "../oauth/store/sql.ts";
import { TASTE_SCHEMA } from "../taste/store/sql.ts";
import { VERDICTS_SCHEMA } from "../verdicts/store/sql.ts";
import { WEB_SCHEMA } from "../web/store/sql.ts";
import type { SchemaModule } from "./migrate.ts";
import { RETIRED_SCHEMAS } from "./retired.ts";

/**
 * Every schema in the database, so that something can find one by name.
 *
 * The list used to live in the migration command, where it needed no name: the
 * command runs all of them and the order does not matter, because modules share
 * no version sequence. It is here now because one step reaches across a module
 * boundary — the conversion of legacy Movie opinions into Verdict acts — and a
 * step that declares a need has to be met by *whoever* is migrating, not only by
 * the command that happens to run every module.
 *
 * That is the whole reason this exists. Several places migrate the taste schema
 * without the verdict schema — the development store opener and a number of
 * test suites — and every one of them would otherwise have to learn about a
 * dependency that is none of its business. `migrate` resolves it instead, from
 * here.
 *
 * ## Every module belongs here
 *
 * This is also the list `npm run db:migrate` runs, which makes an omission a
 * deployment that reports success and then refuses every request touching the
 * module nobody migrated: `prepareSchema` is development-only, so in production
 * `requireSchema` is the only thing left and it refuses. `schemas.test.ts`
 * compares this list against the schemas the application actually opens, so a
 * new store cannot be added without appearing here.
 *
 * Imported lazily by `migrate.ts` rather than at the top of it: every module
 * below imports `migrate.ts` for its types, so a static import back would be a
 * cycle. Nothing here is needed until a migration actually declares a need.
 */
export const ALL_SCHEMAS: readonly SchemaModule[] = [
  OAUTH_SCHEMA,
  WEB_SCHEMA,
  TASTE_SCHEMA,
  EPISODES_SCHEMA,
  VERDICTS_SCHEMA,
  // Retired: the tables are dropped and the modules stay, so a deployment hears
  // about the drop and the names cannot be reused. See `retired.ts`.
  ...RETIRED_SCHEMAS,
];

/** One module by name, or nothing — a need naming something unknown is a bug. */
export function schemaNamed(module: string): SchemaModule | undefined {
  return ALL_SCHEMAS.find((schema) => schema.module === module);
}
