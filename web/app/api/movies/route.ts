import { TasteError, VIEWINGS, checkMovieTitle, checkYear } from "../../../lib/taste/model.ts";
import { authorized, given } from "../../../lib/web/api.ts";

/**
 * Saying whether the user has watched one film they saved.
 *
 * ## Why the handle is in the body rather than the path
 *
 * Genres and vibes are addressed by a name, so their routes carry it as a path
 * segment. A movie is addressed by a *pair*, and one half of it is a film title —
 * `Face/Off`, `Who Framed Roger Rabbit?`, `#Alive` — which is exactly the kind of
 * string a path segment is worst at carrying. Sending the whole handle as the
 * body's own fields also means this route parses nothing: `year` arrives as the
 * number the page had, not as text that would have to be turned back into one
 * here, which is the coercion `given` exists to avoid.
 *
 * ## The answer is the outcome, not the model
 *
 * A successful press answers `{}` with a 200. The genre and vibe routes hand back
 * the whole taste model, which their callers ignore in favour of re-rendering
 * from the store; nothing here needs it either. The control looks at the status
 * and, when something went wrong, at the message — so reading the model back
 * would be nine statements per press whose result is thrown away, and the page
 * re-renders from the store a moment later anyway.
 *
 * A refusal still carries the domain's own sentence, which is the part a caller
 * can act on.
 *
 * ## One field, and it is a fact
 *
 * `viewing` is what the signed-in page can change here, so it is what this
 * accepts. What the user *thought* of the film is not a movie field at all — it
 * is a verdict, and `/api/verdicts` is the route that writes one. Keeping them
 * apart is the whole point of the split: a press on "Seen" says they watched it
 * and says nothing about whether they liked it.
 *
 * A title, a year, an IMDb id and vibe membership are all things the store can
 * change and nothing on the website asks for — an endpoint that accepted them
 * would be capability with no caller, and the assistant already reaches all of
 * it through `update_movie`.
 *
 * The store's nullable viewing is untouched, and this route is narrower than it
 * is on purpose: it takes one of the two answers and nothing else. A press on
 * the page is something the user did, so it always says something — and a `null`
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
 * The viewing as this route accepts it: one of the two, or not mentioned.
 *
 * `undefined` is passed straight through, because that is what the store already
 * reads as "leave it alone". Everything else that is not one of the two — `null`
 * included — is refused before the store is asked, so nothing on this path can
 * put a film back to having been said nothing about.
 */
function pressed(body: Record<string, unknown>): string | undefined {
  const value = given(body, "viewing");
  if (value === undefined) return undefined;
  if (typeof value === "string" && (VIEWINGS as readonly string[]).includes(value)) {
    return value;
  }

  throw new TasteError(
    `"viewing" must be one of ${VIEWINGS.join(", ")} here — a press on the page is something ` +
      "the user did. Setting it back to null, meaning Tonight was never told, is done through " +
      "an assistant. What they thought of the film is a verdict, not a viewing.",
  );
}

export async function PATCH(request: Request): Promise<Response> {
  return authorized(request, async ({ store, body }) => {
    const title = checkMovieTitle(given(body, "title"));
    const year = checkYear(given(body, "year"));

    await store.updateMovie(title, year, { viewing: pressed(body) });
  });
}
