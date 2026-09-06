import { TasteError, checkMovieTitle, checkYear } from "../../../lib/taste/model.ts";
import { authorized, given } from "../../../lib/web/api.ts";

/**
 * Setting what the user has said about one film they saved.
 *
 * ## Why the handle is in the body rather than the path
 *
 * Genres and mixes are addressed by a name, so their routes carry it as a path
 * segment. A movie is addressed by a *pair*, and one half of it is a film title —
 * `Face/Off`, `Who Framed Roger Rabbit?`, `#Alive` — which is exactly the kind of
 * string a path segment is worst at carrying. Sending the whole handle as the
 * body's own fields also means this route parses nothing: `year` arrives as the
 * number the page had, not as text that would have to be turned back into one
 * here, which is the coercion `given` exists to avoid.
 *
 * ## Two fields, deliberately
 *
 * `watched` and `liked` are what the signed-in page can change, so they are what
 * this accepts. A title, a year, an IMDb id and mix membership are all things the
 * store can change and nothing on the website asks for — an endpoint that
 * accepted them would be capability with no caller, and the assistant already
 * reaches all of it through `update_movie`.
 *
 * The store's three-valued semantics are untouched, and this route is narrower
 * than they are on purpose: it takes a boolean or nothing. A mark on the page is
 * something the user pressed, so it can only ever mean yes or no — and a `null`
 * arriving here is a caller this page does not have, which is worth a refusal
 * rather than a silent third meaning. Returning a film to "never told" is a real
 * operation and it stays with the assistant, where `update_movie` accepts it.
 *
 * The handle is checked here rather than cast, because a JSON body is `unknown`
 * where a path segment is at least a string. `checkMovieTitle` and `checkYear`
 * are the domain's own, so a malformed handle is refused in the same words an
 * MCP client would get, and nothing is coerced on the way past.
 */
export const dynamic = "force-dynamic";

/**
 * One mark as this route accepts it: `true`, `false`, or not mentioned.
 *
 * `undefined` is passed straight through, because that is what the store already
 * reads as "leave it alone". Everything else that is not a boolean — `null`
 * included — is refused before the store is asked, so nothing on this path can
 * write the third state.
 */
function pressed(body: Record<string, unknown>, field: "watched" | "liked"): boolean | undefined {
  const value = given(body, field);
  if (value === undefined || typeof value === "boolean") return value;

  throw new TasteError(
    `"${field}" must be true or false here — a mark on the page is something the user pressed. ` +
      "Setting it back to null, meaning Tonight was never told, is done through an assistant.",
  );
}

export async function PATCH(request: Request): Promise<Response> {
  return authorized(request, async ({ store, body }) => {
    const title = checkMovieTitle(given(body, "title"));
    const year = checkYear(given(body, "year"));

    await store.updateMovie(title, year, {
      watched: pressed(body, "watched"),
      liked: pressed(body, "liked"),
    });
    return { taste: await store.taste() };
  });
}
