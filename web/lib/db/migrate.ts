import { ConfigurationError } from "../oauth/config.ts";
import type { SqlDriver } from "./driver.ts";

/**
 * One migration mechanism, for every schema in the database.
 *
 * There are three independent schemas — the OAuth flow state, the browser
 * sessions and the taste model — and they have no business sharing a version
 * sequence: a change to one should not renumber the others, and any of them must
 * be able to move without the others being touched. So a migration is identified
 * by a module *and* a version, and each module counts from one.
 *
 * The guard against two instances migrating at once is the tracking table's own
 * primary key, not a lock. Each migration claims its row and runs its DDL in one
 * transaction: two instances starting together both try to claim it, one blocks
 * until the other commits and then finds the row already taken, and does nothing.
 * Exactly one application of each version, with no advisory lock to acquire, hold
 * or leak.
 */

/** One step, and the SQL that takes it. */
export type Migration = { version: number; sql: string };

/**
 * A named schema and its ordered steps.
 *
 * Append to `migrations`; never edit an entry that has shipped. A version
 * already recorded is never re-run, so changing one would leave two deployments
 * disagreeing about what the schema is.
 */
export type SchemaModule = { module: string; migrations: readonly Migration[] };

/**
 * Makes a module's schema ready to use, in the way this environment allows.
 *
 * The two environments do genuinely different things here, and that is the point
 * of the function existing:
 *
 *   development   migrate, so a checkout works after `npm install` and a schema
 *                 change is picked up by whichever process needs it.
 *
 *   production    check, and refuse. A request from the internet must never be
 *                 what causes DDL to run: the first request after a deploy would
 *                 be an arbitrary one, several instances would race to be it, and
 *                 a migration failing halfway would do so inside somebody's page
 *                 load with nobody watching. Schema changes are a step an operator
 *                 takes — `npm run db:migrate` — and this is where a deployment
 *                 that skipped it says so instead of guessing.
 *
 * The production path reads one row and writes nothing, not even the tracking
 * table: a missing tracking table is itself the answer, so creating it would be
 * the very DDL this exists to avoid.
 */
export async function prepareSchema(driver: SqlDriver, schema: SchemaModule): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    await migrate(driver, schema);
    return;
  }
  await requireSchema(driver, schema);
}

/**
 * Refuses unless every migration this code needs has already been applied.
 *
 * Named versions rather than a count, so a database migrated by a *newer* deploy
 * than this one still satisfies an older instance — which is what a rollback looks
 * like, and it should not be an outage.
 */
async function requireSchema(driver: SqlDriver, schema: SchemaModule): Promise<void> {
  const wanted = schema.migrations.map((migration) => migration.version);
  if (!wanted.length) return;

  // Asked as its own question first, because a statement naming a table that does
  // not exist fails when Postgres plans it — a WHERE clause guarding the reference
  // never gets the chance to be false.
  const [tracking] = await driver.query<{ present: boolean }>(
    "SELECT to_regclass('schema_migrations') IS NOT NULL AS present",
  );

  const applied = tracking?.present
    ? (
        await driver.query<{ version: number }>(
          "SELECT version FROM schema_migrations WHERE module = $1",
          [schema.module],
        )
      ).map((row) => row.version)
    : [];

  const missing = wanted.filter((version) => !applied.includes(version));
  if (missing.length) {
    throw new ConfigurationError(
      `The ${schema.module} schema is not up to date: migration(s) ` +
        `${missing.join(", ")} have not been applied. Run \`npm run db:migrate\` against ` +
        `this deployment's DATABASE_URL before the new code serves traffic. ` +
        `Production never migrates from a request.`,
    );
  }
}

/**
 * Brings one module's schema up to date, returning how many steps ran.
 *
 * Idempotent, so it is safe on every deploy and safe twice. Called by
 * `npm run db:migrate`, and by `prepareSchema` outside production.
 */
export async function migrate(driver: SqlDriver, schema: SchemaModule): Promise<number> {
  await ensureTrackingTable(driver);

  let applied = 0;
  for (const migration of schema.migrations) {
    const ran = await driver.transaction(async (tx) => {
      // Claimed rather than inserted-and-caught. `ON CONFLICT DO NOTHING` returns
      // no row when the version is already recorded, which is the whole of the
      // concurrent-startup case: an instance whose claim loses the race waits for
      // the winner to commit, sees no row, and skips the DDL the winner has by
      // then applied.
      //
      // The alternative — insert, then forgive a unique violation — forgives
      // *any* unique violation raised anywhere in the transaction, including one
      // from the migration's own SQL. That would turn a real uniqueness bug in a
      // migration into a step that silently did not run. Here nothing is caught,
      // so a failure inside `migration.sql` is a failure.
      const claimed = await tx.query<{ version: number }>(
        `INSERT INTO schema_migrations (module, version) VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING version`,
        [schema.module, migration.version],
      );
      if (!claimed.length) return false;

      await tx.exec(migration.sql);
      return true;
    });
    if (ran) applied += 1;
  }
  return applied;
}

/**
 * How many times the bootstrap below will try before giving up.
 *
 * Three, because what it is waiting for is another session's `CREATE TABLE` to
 * commit, which is one round trip away and not a queue. More attempts would only
 * lengthen the wait before a real fault — no privileges, no database — is
 * reported.
 */
const BOOTSTRAP_ATTEMPTS = 3;

/**
 * Creates the tracking table if this database has never been migrated.
 *
 * `CREATE TABLE IF NOT EXISTS` is not atomic against another session doing the
 * same thing: it looks in the catalogue, finds nothing, and then writes to it, so
 * two sessions starting against an empty database can both get past the look and
 * one then collides on a system catalogue's own unique index. Postgres documents
 * this, and it is exactly the situation two instances of a deploy booting
 * together produce.
 *
 * The recovery asks the only question that matters — is the table there now —
 * rather than which SQLSTATE arrived. That is narrower than classifying the
 * error, not broader: a failure is forgiven only when the state it was supposed
 * to establish holds, and re-thrown otherwise. It also cannot be confused with a
 * uniqueness failure from a migration's own SQL, because this is a different
 * statement in a different call: `migrate` runs `migration.sql` below, well after
 * this has returned, and nothing there is caught at all.
 *
 * The retry is for the window where the winner has not committed yet, so our
 * check cannot see its table either. On the next attempt the `IF NOT EXISTS` is
 * simply true and returns.
 */
async function ensureTrackingTable(driver: SqlDriver): Promise<void> {
  const create = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      module     text NOT NULL,
      version    integer NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (module, version)
    );
  `;

  for (let attempt = 1; ; attempt++) {
    try {
      await driver.exec(create);
      return;
    } catch (error) {
      if (await trackingTableExists(driver)) return;
      if (attempt === BOOTSTRAP_ATTEMPTS) throw error;
    }
  }
}

/**
 * Whether the tracking table is there.
 *
 * Asked with `to_regclass` rather than by selecting from it, because a statement
 * naming a table that does not exist fails when Postgres plans it — there is no
 * way to guard the reference with a condition that could be false.
 */
async function trackingTableExists(driver: SqlDriver): Promise<boolean> {
  const [row] = await driver.query<{ present: boolean }>(
    "SELECT to_regclass('schema_migrations') IS NOT NULL AS present",
  );
  return row?.present ?? false;
}
