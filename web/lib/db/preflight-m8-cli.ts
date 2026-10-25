/**
 * `npm run db:preflight-m8` — reads what verdicts v3 would do, and changes nothing.
 *
 * Run it against production before the M8 release. It lists, by account and
 * film, every refusal v3 would turn into `dont-want-to-see`, and every one that
 * would stop it: resolve those with the build that is still running, then stop
 * the application, back up, migrate and deploy. Exits non-zero while anything
 * would stop v3. See `preflight-m8.ts`.
 *
 * Connection handling is `migrate-cli.ts`'s: `DATABASE_URL`, or `--embedded` for
 * the local development database, and never a silent fallback to the latter.
 */
import type { SqlDriver } from "./driver.ts";
import { preflightM8 } from "./preflight-m8.ts";

const url = process.env.DATABASE_URL?.trim();
const EMBEDDED_FLAG = "--embedded";
const embedded = process.argv.includes(EMBEDDED_FLAG);

async function main(): Promise<void> {
  if (!url && !embedded) {
    console.error(
      `DATABASE_URL is not set. Set it to the database to check, or pass ${EMBEDDED_FLAG} to ` +
        "check the local development database instead.",
    );
    process.exitCode = 1;
    return;
  }
  if (url && embedded) {
    console.error(`Both DATABASE_URL and ${EMBEDDED_FLAG} were given, and they name different databases. Pass one.`);
    process.exitCode = 1;
    return;
  }

  const driver: SqlDriver = url
    ? await (await import("./postgres.ts")).postgresDriver(url)
    : await (await import("./pglite.ts")).embeddedDriver(process.env.DEV_DATABASE_DIR);

  try {
    const report = await preflightM8(driver);
    if (report.applied) {
      console.log("verdicts v3 is already applied; there is nothing left to check.");
      return;
    }

    const { found, blocking } = report;
    console.log(`verdicts v3 would mark ${found.convert.length} film(s) dont-want-to-see:`);
    for (const one of found.convert) {
      console.log(`  ${one.userId} ${JSON.stringify(one.title)} (${String(one.year)})`);
    }
    if (blocking.length) {
      console.error("\nverdicts v3 would refuse, changing nothing, until these are resolved:");
      for (const line of blocking) console.error(`  ${line}`);
      process.exitCode = 1;
      return;
    }
    console.log("\nNothing would stop verdicts v3.");
  } finally {
    await driver.close();
  }
}

await main();
