import { filmKey } from "../../../lib/films/identity.ts";
import { checkMovieTitle, checkYear } from "../../../lib/taste/model.ts";
import {
  JUDGEMENTS,
  VerdictError,
  stateVerdict,
  withdrawVerdict,
  type Judgement,
} from "../../../lib/verdicts/model.ts";
import { authorized, given } from "../../../lib/web/api.ts";

/**
 * What the user thinks of one film, set or taken back from the page.
 *
 * The other half of the split that took opinions off the Movie. `/api/movies`
 * says whether they watched a film; this says what they made of it, and the two
 * are separate routes because they are separate facts with separate lifetimes —
 * a verdict has a scope, an instant, a provenance and a history, and none of
 * that could live on a saved film.
 *
 * ## A press is a global judgement, and nothing else
 *
 * The page shows a collection, not an evening. So this writes a judgement that
 * applies everywhere and there is no way to say otherwise: a `not-tonight`
 * belongs to one evening, and an evening is not something a list of films has.
 * Turning down a film for a particular night stays with the assistant, which is
 * where the evening is.
 *
 * `volunteered`, because it is. Tonight asked nothing — the user went to the
 * page and pressed. That is the stronger of the two provenances and recording it
 * as the weaker one would understate what happened.
 *
 * No `because`. The control is a press and a press has no words in it; inventing
 * a reason would be exactly the agent-authored explanation the verdict model
 * leaves nowhere to put.
 *
 * ## Why a repeat writes nothing
 *
 * This is a "set the current value" control, and pressing *Loved* on a film that
 * already stands as loved means the user is confirming what they see rather than
 * saying something new. Writing an act for it would fill their history with
 * entries that record a click, and `get_memory` would read them back as things
 * they said. So the standing judgement is read first and an unchanged one is a
 * no-op.
 *
 * The same for taking one back: withdrawing when nothing stands would record the
 * user retracting something they never said.
 *
 * ## Why this does not touch the film
 *
 * A judgement already means they watched it — that derivation is `lib/seen.ts`'s
 * and every reader applies it — so writing `viewing: "seen"` here as well would
 * store a second copy of a fact that is already implied, and the copy could
 * outlive the judgement it came from. The film is left exactly as it is.
 */
export const dynamic = "force-dynamic";

/** The judgement as this route accepts it: one of the three, or `null` to take it back. */
function pressed(body: Record<string, unknown>): Judgement | null {
  const value = given(body, "judgement");
  if (value === null) return null;
  if (typeof value === "string" && (JUDGEMENTS as readonly string[]).includes(value)) {
    return value as Judgement;
  }

  throw new VerdictError(
    `"judgement" must be one of ${JUDGEMENTS.join(", ")}, or null to take back what they said. ` +
      "Turning a film down for one evening is a rejection rather than a judgement, and it is " +
      "not something this page can say.",
  );
}

export async function PATCH(request: Request): Promise<Response> {
  return authorized(request, async ({ verdicts, body }) => {
    const film = {
      title: checkMovieTitle(given(body, "title")),
      year: checkYear(given(body, "year")),
    };
    const wanted = pressed(body);

    // What stands globally about this film right now. Matched by `filmKey`,
    // because a verdict names a film as the user spelled it and two spellings of
    // one film must not read as two positions.
    const standing = await verdicts.standing();
    const held = standing.find((one) => one.occasion === undefined && filmKey(one) === filmKey(film));

    if (wanted === null) {
      if (held?.judgement === undefined) return;
      await verdicts.say(withdrawVerdict(film, new Date().toISOString()));
      return;
    }

    if (held?.judgement === wanted) return;
    await verdicts.say(stateVerdict(film, { about: "judgement", judgement: wanted }, "volunteered", new Date().toISOString()));
  });
}
