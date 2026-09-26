import { ConfigurationError } from "../oauth/config.ts";
import type { SqlDriver, Transaction } from "./driver.ts";

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
export type Migration = {
  version: number;
  /**
   * Versions in *other* modules this step reads or writes, and cannot run without.
   *
   * Almost nothing needs this. Modules are separate because they have no business
   * sharing a version sequence, and a step that reaches across one is usually a
   * step in the wrong module. The exception is a one-time conversion: legacy Movie
   * opinions become Verdict acts, which means reading one module's table and
   * writing another's, and there is no version of that which lives in one module.
   *
   * `migrate` satisfies a need by migrating the module it names first, so a
   * caller bringing up one module does not have to know which others it leans on.
   * The check then runs again inside the step's own transaction and throws if the
   * need is still unmet — before the claim, so an unmet need leaves no row behind
   * and the version stays unapplied rather than being recorded as skipped.
   */
  needs?: readonly { module: string; version: number }[];
} & (
  | { sql: string; run?: never }
  /**
   * A step that needs the domain to compute what it writes.
   *
   * Almost every migration is SQL and should be: a schema change belongs in the
   * database and a string is the whole of it. This exists for the one thing SQL
   * cannot do — write a value that only the application's own rule can produce.
   *
   * The taste model's film identity is that case. Which two spellings are one
   * film used to be Postgres' answer, on a unique index over `lower(title)`,
   * and it had to stop being Postgres' answer because a second store resolves
   * the same question in memory and the two folds disagree in both directions.
   * The canonical name is now `lib/films/identity.ts`'s, which means a backfill
   * cannot be an UPDATE with an expression in it.
   *
   * Runs inside the migration's own transaction, with the same claim-or-skip
   * behaviour as a SQL step: it either lands whole or not at all, and throwing
   * is how a step refuses.
   */
  | { run: (tx: Transaction) => Promise<void>; sql?: never }
);

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
    // Outside the transaction, because satisfying a need means running another
    // module's migrations and those claim rows of their own. Their claims make
    // this safe to do concurrently; `requireNeeds` below is what makes it safe
    // to be wrong about.
    await satisfyNeeds(driver, schema, migration);

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
      // Before the claim, so an unmet need records nothing. See `Migration.needs`.
      await requireNeeds(tx, schema, migration);

      const claimed = await tx.query<{ version: number }>(
        `INSERT INTO schema_migrations (module, version) VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING version`,
        [schema.module, migration.version],
      );
      if (!claimed.length) return false;

      // One or the other, never both: the type above admits exactly one.
      if (migration.sql === undefined) await migration.run(tx);
      else await tx.exec(migration.sql);
      return true;
    });
    if (ran) applied += 1;
  }
  return applied;
}

/**
 * Brings up the modules a step declares a need on, before the step runs.
 *
 * Recurses through `migrate`, which is what makes a chain of needs work and what
 * keeps the concurrency story the same one everywhere: the needed module's own
 * claims decide who applies what.
 *
 * A need naming a module that does not exist is left to `requireNeeds` to
 * refuse. Guessing here — skipping it, or treating unknown as satisfied — would
 * turn a typo in a migration into a step that quietly ran without its
 * prerequisite.
 */
async function satisfyNeeds(
  driver: SqlDriver,
  schema: SchemaModule,
  migration: Migration,
): Promise<void> {
  if (!migration.needs?.length) return;

  const { schemaNamed } = await import("./schemas.ts");
  for (const need of migration.needs) {
    if (need.module === schema.module) continue;
    const needed = schemaNamed(need.module);
    if (needed) await migrate(driver, needed);
  }
}

/**
 * Refuses a step whose cross-module prerequisites are not applied yet.
 *
 * Read inside the step's own transaction, against the same tracking table the
 * claim writes, so what is checked is what is committed. Throwing rather than
 * skipping: a step quietly not running would let `npm run db:migrate` report
 * success over an incomplete schema, and the deployment would then fail later at
 * `requireSchema` with a message about the wrong thing.
 */
async function requireNeeds(
  tx: Transaction,
  schema: SchemaModule,
  migration: Migration,
): Promise<void> {
  if (!migration.needs?.length) return;

  const missing: string[] = [];
  for (const need of migration.needs) {
    const [row] = await tx.query<{ version: number }>(
      "SELECT version FROM schema_migrations WHERE module = $1 AND version = $2",
      [need.module, need.version],
    );
    if (!row) missing.push(`${need.module} ${String(need.version)}`);
  }
  if (!missing.length) return;

  throw new ConfigurationError(
    `The ${schema.module} schema cannot apply migration ${String(migration.version)} until ` +
      `${missing.join(" and ")} ${missing.length === 1 ? "has" : "have"} been applied. ` +
      "Run `npm run db:migrate`, which brings every schema up in an order that satisfies this. " +
      "Nothing has been changed.",
  );
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
