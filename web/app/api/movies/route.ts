import {
  MOVIE_STATES,
  TasteError,
  checkMovieTitle,
  checkYear,
} from "../../../lib/taste/model.ts";
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
 * ## The answer is the outcome, not the model
 *
 * A successful press answers `{}` with a 200. The genre and mix routes hand back
 * the whole taste model because `TasteAdvanced` reads it as its success signal;
 * nothing does that here. `MovieState` looks at the status and, when something
 * went wrong, at the message — so reading the model back would be nine
 * statements per press whose result is thrown away, and the page re-renders from
 * the store a moment later anyway.
 *
 * A refusal still carries the domain's own sentence, which is the part a caller
 * can act on.
 *
 * ## One field, deliberately
 *
 * `state` is what the signed-in page can change, so it is what this accepts. A
 * title, a year, an IMDb id and mix membership are all things the store can
 * change and nothing on the website asks for — an endpoint that accepted them
 * would be capability with no caller, and the assistant already reaches all of
 * it through `update_movie`.
 *
 * The store's nullable state is untouched, and this route is narrower than it is
 * on purpose: it takes one of the five states and nothing else. A press on the
 * page is something the user did, so it always says something — and a `null`
 * arriving here is a caller this page does not have, which is worth a refusal
 * rather than a silent sixth meaning. Returning a film to "never told" is a real
 * operation and it stays with the assistant, where `update_movie` accepts it.
 *
 * The handle is checked here rather than cast, because a JSON body is `unknown`
 * where a path segment is at least a string. `checkMovieTitle` and `checkYear`
 * are the domain's own, so a malformed handle is refused in the same words an
 * MCP client would get, and nothing is coerced on the way past.
 */
export const dynamic = "force-dynamic";

/**
 * The state as this route accepts it: one of the five, or not mentioned.
 *
 * `undefined` is passed straight through, because that is what the store already
 * reads as "leave it alone". Everything else that is not one of the five — `null`
 * included — is refused before the store is asked, so nothing on this path can
 * put a film back to having been said nothing about.
 */
function pressed(body: Record<string, unknown>): string | undefined {
  const value = given(body, "state");
  if (value === undefined) return undefined;
  if (typeof value === "string" && (MOVIE_STATES as readonly string[]).includes(value)) {
    return value;
  }

  throw new TasteError(
    `"state" must be one of ${MOVIE_STATES.join(", ")} here — a press on the page is something ` +
      "the user did. Setting it back to null, meaning Tonight was never told, is done through " +
      "an assistant.",
  );
}

export async function PATCH(request: Request): Promise<Response> {
  return authorized(request, async ({ store, body }) => {
    const title = checkMovieTitle(given(body, "title"));
    const year = checkYear(given(body, "year"));

    await store.updateMovie(title, year, { state: pressed(body) });
  });
}
