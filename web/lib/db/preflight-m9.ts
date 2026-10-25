import {
  classifyEpisodes,
  episodeBlockers,
  type EpisodeClassification,
} from "../episodes/store/schema.ts";
import type { SqlDriver } from "./driver.ts";

/**
 * What episodes v3 would do to this database, asked before it is run.
 *
 * v3 moves each evening's `watched` / `finished` onto the film it chose, and
 * refuses — changing nothing — when an evening says it watched or finished
 * something without a chosen film, says it finished a film it did not watch, or
 * offers the same film twice. Those are resolved with the build before v3, so
 * the time to learn about them is before the application is stopped.
 *
 * It is the migration's own question: `classifyEpisodes` is what v3 acts on.
 *
 * It writes nothing. The read runs `READ ONLY`, and `REPEATABLE READ` so its
 * statements see one snapshot. Once v3 is recorded it answers `applied` before
 * touching any column v3 dropped.
 */
export type PreflightM9 =
  | { applied: true }
  | { applied: false; found: EpisodeClassification; blocking: string[] };

export async function preflightM9(driver: SqlDriver): Promise<PreflightM9> {
  return driver.transaction(async (tx) => {
    await tx.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const [tracking] = await tx.query<{ present: boolean }>(
      "SELECT to_regclass('schema_migrations') IS NOT NULL AS present",
    );
    if (tracking?.present) {
      const [done] = await tx.query<{ version: number }>(
        "SELECT version FROM schema_migrations WHERE module = 'episodes' AND version = 3",
      );
      if (done) return { applied: true };
    }

    const found = await classifyEpisodes(tx);
    return { applied: false, found, blocking: episodeBlockers(found) };
  });
}
