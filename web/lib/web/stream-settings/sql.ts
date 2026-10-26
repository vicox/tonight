import type { SqlDriver } from "../../db/driver.ts";
import type { SchemaModule } from "../../db/migrate.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import type { StreamSettings } from "../stream-settings.ts";

/**
 * The Stream's one setting in SQL: whether *Include previously seen* is ticked.
 *
 * One row per user who has ever changed it, keyed by the same provider-qualified
 * subject that keys `web_sessions` and `tonight_genres`, so every browser signed
 * in to one Google account reads the same answer. No row is the default, ticked.
 *
 * Its own module rather than a step in `web`: production refuses a store whose
 * migrations are missing, and a deploy that skipped this one should lose the
 * setting — the box ticked, as before — not every session with it.
 */

export const STREAM_SETTINGS_SCHEMA: SchemaModule = {
  module: "stream_settings",
  migrations: [
    {
      version: 1,
      sql: `
        -- The latest answer and nothing else: no time it was changed, no history
        -- of changes, nothing about the visit it was changed on.
        CREATE TABLE stream_settings (
          user_id      text PRIMARY KEY,
          include_seen boolean NOT NULL
        );
      `,
    },
  ],
};

export function sqlStreamSettings(driver: SqlDriver, user: AuthenticatedUser): StreamSettings {
  return {
    async includeSeen() {
      const [row] = await driver.query<{ include_seen: boolean }>(
        "SELECT include_seen FROM stream_settings WHERE user_id = $1",
        [user.id],
      );
      return row?.include_seen ?? true;
    },

    async keepIncludeSeen(value) {
      // One statement, so two browsers changing it at once leave one of their
      // answers rather than an error.
      await driver.query(
        `INSERT INTO stream_settings (user_id, include_seen) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET include_seen = EXCLUDED.include_seen`,
        [user.id, value],
      );
    },
  };
}
