import {
  blockers,
  classifyRefusals,
  type RefusalClassification,
} from "../verdicts/store/schema.ts";
import type { SqlDriver } from "./driver.ts";

/**
 * What verdicts v3 would do to this database, asked before it is run.
 *
 * v3 turns every current `not-ever` into the saved film's `dont-want-to-see` and
 * refuses — changing nothing — when one has no saved film, is a vibe's core, or
 * cannot be told apart from another act at the same instant. Those cases are
 * resolved with the build before v3, so the time to learn about them is before
 * the application is stopped, not halfway through a release.
 *
 * It is the migration's own question rather than a second one: `classifyRefusals`
 * is what v3 acts on, so which film a title names, which act is current and what
 * counts as unresolvable are decided once. A query written for this alone would
 * fold titles with `lower()`, which is not how a film is named, and would report
 * refusals that are not current.
 *
 * It writes nothing. The read runs in a `READ ONLY` transaction, so even a
 * mistake here could not change the database, and `REPEATABLE READ` so its several
 * statements see one snapshot.
 */
export type Preflight =
  | { applied: true }
  | { applied: false; found: RefusalClassification; blocking: string[] };

export async function preflightM8(driver: SqlDriver): Promise<Preflight> {
  return driver.transaction(async (tx) => {
    await tx.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const [done] = await tx.query<{ version: number }>(
      "SELECT version FROM schema_migrations WHERE module = 'verdicts' AND version = 3",
    );
    if (done) return { applied: true };

    const found = await classifyRefusals(tx);
    return { applied: false, found, blocking: blockers(found) };
  });
}
