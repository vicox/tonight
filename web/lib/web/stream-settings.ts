import type { SqlDriver } from "../db/driver.ts";
import { database } from "../db.ts";
import { prepareSchema } from "../db/migrate.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { deployment } from "../oauth/config.ts";
import { wrongOrigin } from "../oauth/origin.ts";
import { configurationFault, errorPage } from "../oauth/responses.ts";
import { sessionOf } from "./cookies.ts";
import { signedInVisitor, type SignedInVisitor } from "./session.ts";
import { crossSite } from "./signin.ts";

/**
 * Whether *Include previously seen* is ticked on the Stream, kept per user.
 *
 * One yes-or-no, read when the Stream is drawn and written when the box is
 * pressed, so the box is as the user left it on their next visit, in this
 * browser or another. It is not part of the taste model: nothing else reads it,
 * and it decides only which cards are drawn, never which films there are or the
 * order they are in.
 */
export type StreamSettings = {
  /** Ticked unless this user has unticked it. */
  includeSeen(): Promise<boolean>;
  keepIncludeSeen(value: boolean): Promise<void>;
};

/** The setting for one user — the same shape as `tasteStore(user)`. */
export async function streamSettings(user: AuthenticatedUser): Promise<StreamSettings> {
  const driver = await prepared();
  const { sqlStreamSettings } = await import("./stream-settings/sql.ts");
  return sqlStreamSettings(driver, user);
}

/**
 * The connection, with this schema known to be current — once per process, and
 * forgotten on failure, for the reasons `tasteStore` gives.
 */
let preparing: Promise<SqlDriver> | undefined;

function prepared(): Promise<SqlDriver> {
  preparing ??= (async () => {
    const driver = await database();
    const { STREAM_SETTINGS_SCHEMA } = await import("./stream-settings/sql.ts");
    await prepareSchema(driver, STREAM_SETTINGS_SCHEMA);
    return driver;
  })().catch((error: unknown) => {
    preparing = undefined;
    throw error;
  });
  return preparing;
}

/**
 * The setting as the Stream was drawn with it, and when it was read.
 *
 * `readAt` is the server's clock just before the read, so a write the read
 * might have missed is never counted as one it saw: the browser compares it
 * with when its own press was kept (`stream-settings/browser.ts`). Not stored.
 */
export type IncludeSeen = { saved: boolean; readAt: number };

/**
 * The setting, for the Stream being drawn — ticked when it cannot be read.
 *
 * A setting that cannot be read is no reason for the Stream not to be drawn,
 * and ticked is what the box was before anything was kept: every film shown.
 * That guess is dated before everything, so a press the browser already knows
 * was kept still wins over it.
 */
export async function readIncludeSeen(visitor: SignedInVisitor): Promise<IncludeSeen> {
  const readAt = Date.now();
  try {
    return { saved: await (await streamSettings(visitor.user)).includeSeen(), readAt };
  } catch (error) {
    report("could not read the Stream setting", error);
    return { saved: true, readAt: 0 };
  }
}

/**
 * `POST /stream/include-seen`: the box pressed, with its new answer.
 *
 *     request
 *        ↓  served at this deployment's own origin?    404 if not
 *        ↓  came from a page of ours (Origin)?         403 if not
 *        ↓  a live session?                            401 if not
 *        ↓  include-seen=true or include-seen=false?   400 if not
 *        ↓  kept for the session's user                200 { keptAt }
 *
 * The same checks, in the same order, as a film's answers (`choose.ts`). Whose
 * setting it is comes from the session and from nowhere else. It is pressed
 * from a script rather than a form, so it answers with data and no page: when
 * the write landed, by the server's clock, for the browser to tell a Stream
 * read before it from one read after (`stream-settings/browser.ts`).
 */
export async function handleIncludeSeen(request: Request): Promise<Response> {
  let config;
  try {
    config = deployment();
  } catch (error) {
    return configurationFault(error, "text");
  }

  const misdirected = wrongOrigin(request, config, "text");
  if (misdirected) return misdirected;

  const forged = crossSite(request, config);
  if (forged) return forged;

  let visitor;
  try {
    visitor = await signedInVisitor(sessionOf(request, config));
  } catch (error) {
    report("could not resolve a session", error);
    return errorPage("server_error", "Your session could not be checked. Nothing has been changed.", 500);
  }
  if (!visitor) return errorPage("login_required", "Sign in to keep this setting.", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorPage("invalid_request", "The setting did not arrive as a form.", 400);
  }
  const value = form.get("include-seen");
  if (value !== "true" && value !== "false") {
    return errorPage("invalid_request", "include-seen is true or false.", 400);
  }

  let keptAt: number;
  try {
    await (await streamSettings(visitor.user)).keepIncludeSeen(value === "true");
    // After the write has landed: a Stream read later than this has it.
    keptAt = Date.now();
  } catch (error) {
    report("could not keep the Stream setting", error);
    return errorPage("server_error", "The setting could not be kept.", 500);
  }
  return Response.json({ keptAt }, { headers: { "cache-control": "no-store" } });
}

/** The message only, never the thrown object or anything identifying the user. */
function report(what: string, error: unknown): void {
  console.error(`[tonight] stream: ${what}: ${error instanceof Error ? error.message : "unknown error"}`);
}
