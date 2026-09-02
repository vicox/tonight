import { deployment } from "../oauth/config.ts";
import { wrongOrigin } from "../oauth/origin.ts";
import { configurationFault, json } from "../oauth/responses.ts";
import { TasteError } from "../taste/model.ts";
import { tasteStore, type TasteStore } from "../taste/store.ts";
import { sessionOf } from "./cookies.ts";
import { signedInVisitor, type SignedInVisitor } from "./session.ts";
import { crossSite } from "./signin.ts";

/**
 * The boundary every write from the website goes through.
 *
 *     request
 *        ↓  served at this deployment's own origin?      404 if not
 *        ↓  came from a page of ours?                    403 if not
 *        ↓  a live session?                              401 if not
 *        ↓  a JSON body?                                 400 if not
 *        ↓  SignedInVisitor + a store bound to them
 *      handler
 *
 * The same shape as `lib/mcp/endpoint.ts`, and for the same reason: a handler is
 * handed a store that is already somebody's, so there is no request field that
 * could name a different owner and no handler that can forget to check. The two
 * boundaries differ only in what they accept as proof — a bearer token there, a
 * session cookie here — and they meet at one `tasteStore(user)`.
 *
 * Everything routed through here changes the taste model, so the CSRF check is
 * unconditional rather than per-route. It is the same function the sign-in and
 * sign-out endpoints use, so "another site cannot act here" is one rule with one
 * implementation.
 *
 * Reading is deliberately not here. The page reads the store directly in a Server
 * Component, so there is no endpoint that hands somebody's genres to a fetch —
 * see `app/page.tsx`.
 */

/** What a handler is given: who is asking, their store, and what they sent. */
export type Authorized = {
  visitor: SignedInVisitor;
  store: TasteStore;
  /** The parsed JSON body. Handlers read fields off it and the domain validates. */
  body: Record<string, unknown>;
};

/**
 * Runs a handler behind the boundary, and turns what it throws into an answer.
 *
 * Three outcomes, and the distinction between them is the point:
 *
 *   `TasteError`         the caller asked for something the taste model does not
 *                        allow. 400, with the domain's own message — the same
 *                        words an MCP client gets, because they come from the
 *                        same place.
 *
 *   `ConfigurationError` ours. 500, and the reason goes to the log rather than to
 *                        the browser: a public endpoint naming the variable it is
 *                        missing tells whoever is probing how this is put together.
 *
 *   anything else        also ours, also 500, also unexplained.
 */
export async function authorized(
  request: Request,
  handler: (context: Authorized) => Promise<unknown>,
): Promise<Response> {
  let config;
  try {
    config = deployment();
  } catch (error) {
    return configurationFault(error);
  }

  const misdirected = wrongOrigin(request, config);
  if (misdirected) return misdirected;

  const forged = crossSite(request, config);
  if (forged) return json({ error: "forbidden", message: "Use the buttons on the site." }, 403);

  let visitor: SignedInVisitor | null;
  try {
    visitor = await signedInVisitor(sessionOf(request, config));
  } catch (error) {
    // Not knowing whether somebody is signed in is not an authentication answer,
    // and must not be turned into one. It is a failure of ours.
    // Nothing has been opened, let alone written, so this one can say so.
    return fault(
      "could not resolve a session",
      error,
      "Your session could not be checked. Nothing has been changed.",
    );
  }
  if (!visitor) {
    return json({ error: "unauthorized", message: "Sign in to change your taste." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "bad_request", message: "The request body must be a JSON object." }, 400);
  }

  try {
    const result = await handler({ visitor, store: await tasteStore(visitor.user), body });
    return json(result ?? {}, 200);
  } catch (error) {
    // A `TasteError` is a decision the domain reached before writing anything, so
    // it keeps its own words and its own certainty.
    if (error instanceof TasteError) return json({ error: "refused", message: error.message }, 400);

    // Anything else was thrown somewhere between here and the database, and the
    // handler reads the model back after changing it — so a failure may be a write
    // that never happened or one that happened and could not be reported. Saying
    // which would be a guess.
    return fault(
      "request failed",
      error,
      "Something went wrong, and the result could not be confirmed. Reload before trying again.",
    );
  }
}

/**
 * Something that went wrong on our side, answered without describing itself.
 *
 * `configurationFault` re-throws anything that is not a `ConfigurationError`, so
 * it is caught here and answered the same way — one shape of 500 whatever the
 * cause, with the message only ever reaching the deployment's log.
 */
function fault(what: string, error: unknown, message: string): Response {
  try {
    return configurationFault(error);
  } catch {
    console.error(
      `[tonight] api: ${what}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return json({ error: "server_error", message }, 500);
  }
}

/**
 * What the caller gave for one field, exactly as they gave it.
 *
 * `undefined` means they did not mention it, which every update in the store
 * reads as "leave it alone" and every create reads as missing. Anything else is
 * passed through untouched — including a number, an object or a list, which the
 * domain refuses by name. Coercing here would be the same bug in a different
 * place: a route that turned `42` into `"42"` would hand the store something the
 * user never wrote.
 */
export function given(body: Record<string, unknown>, name: string): unknown {
  return name in body ? body[name] : undefined;
}
