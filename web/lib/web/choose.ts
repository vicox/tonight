import { filmKey } from "../films/identity.ts";
import { deployment } from "../oauth/config.ts";
import { wrongOrigin } from "../oauth/origin.ts";
import { configurationFault, errorPage } from "../oauth/responses.ts";
import { TasteError, VibeRequired, checkMovieTitle, checkYear } from "../taste/model.ts";
import { tasteStore } from "../taste/store.ts";
import { VerdictError, isPositive, stateVerdict, withdrawVerdict } from "../verdicts/model.ts";
import { verdictStore } from "../verdicts/store.ts";
import { choiceFor, decide, type Refusal } from "./choices.ts";
import { sessionOf } from "./cookies.ts";
import { contextOf, movieHref } from "./screens.ts";
import { signedInVisitor } from "./session.ts";
import { crossSite } from "./signin.ts";

/**
 * `POST /movie/choose`: one of a film's five choices, pressed on its screen.
 *
 * The website's one write, and as narrow as it can be. It takes a film the user
 * has saved and one of the five choices in `choices.ts`, and writes only what
 * that choice already means in the model — a verdict, a withdrawal, or the film's
 * viewing — through the same stores and the same rules the MCP tools use. It
 * creates nothing, deletes nothing, files nothing and renames nothing: those are
 * said to an assistant.
 *
 *     request
 *        ↓  served at this deployment's own origin?      404 if not
 *        ↓  came from a page of ours (Origin)?           403 if not
 *        ↓  a live session?                              back to / if not
 *        ↓  a film this user has saved, one of five?     400, or the film's page
 *        ↓  decide → write → back to the film's page     303
 *
 * Whose film it is comes from the session and from nowhere else: the stores are
 * opened for the session's user, and the form only names which of their saved
 * films, by the identity the store keeps. A film somebody else saved is a film
 * this user does not have. Every act is written by the taste store while it holds
 * that film (`sayFiled`, `saySaved`, `updateMovie`), so a press that races the
 * film's deletion either finds it gone or is deleted with it.
 *
 * No reason is asked for and none is written: a press has no words in it, and an
 * invented one would be the agent-authored explanation the verdict model leaves
 * nowhere to put. A verdict pressed here is told `confirmed`: it answers the
 * question the page puts, *What do you think?*, and was not said unasked.
 *
 * The answer is always a redirect back to the film's screen (post, redirect,
 * get), carrying a fixed refusal code when the press was not kept, so the page
 * can say why in its own words and a reload does not press again.
 */
export async function handleChoice(request: Request): Promise<Response> {
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
  if (!visitor) return seeOther("/");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorPage("invalid_request", "The choice did not arrive as a form.", 400);
  }

  const choice = choiceFor(form.get("choice"));
  const title = form.get("title");
  const year = form.get("year");
  const from = form.get("from");
  if (!choice || typeof title !== "string" || typeof year !== "string" || !/^[0-9]{4}$/u.test(year)) {
    return errorPage("invalid_request", "That is not one of the choices on a film's page.", 400);
  }
  let named: { title: string; year: number };
  try {
    named = { title: checkMovieTitle(title), year: checkYear(Number(year)) };
  } catch {
    return errorPage("invalid_request", "That is not one of the choices on a film's page.", 400);
  }

  try {
    const [taste, verdicts] = await Promise.all([tasteStore(visitor.user), verdictStore(visitor.user)]);
    const [model, standing] = await Promise.all([taste.taste(), verdicts.standing()]);

    // A film this user has saved, by the identity the store keeps — never a film
    // the form made up, and never somebody else's. Missing is the film's own
    // page, which says it is not here.
    const key = filmKey(named);
    const movie = model.movies.find((one) => filmKey(one) === key);
    if (!movie) return seeOther(movieHref(named));

    const back = movieHref(movie, contextOf(movie, typeof from === "string" ? from : null));
    const film = { title: movie.title, year: movie.year };
    const outcome = decide(choice, {
      viewing: movie.viewing,
      judgement: standing.find((one) => filmKey(one) === key)?.judgement ?? null,
      filed: movie.vibes.length > 0,
      core: model.vibes.some((vibe) => vibe.core !== null && filmKey(vibe.core) === key),
    });

    if ("refused" in outcome) return seeOther(refused(back, outcome.refused));

    const now = new Date().toISOString();
    try {
      switch (outcome.write) {
        case "nothing":
          break;
        case "viewing":
          await taste.updateMovie(movie.title, movie.year, { viewing: outcome.viewing });
          break;
        case "withdrawal":
          await taste.saySaved(withdrawVerdict(film, now));
          break;
        case "judgement": {
          const verdict = stateVerdict(film, { about: "judgement", judgement: outcome.judgement }, "confirmed", now);
          // A liked or loved is kept only for a film in at least one vibe; a
          // disliked only for a film still saved. Each checked in one
          // transaction with the write.
          if (isPositive(outcome.judgement)) await taste.sayFiled(verdict);
          else await taste.saySaved(verdict);
          break;
        }
      }
    } catch (error) {
      // The store decided against it after the check above — the film taken out
      // of its last vibe, anchored, or removed in between. Its own rule, kept,
      // and nothing written.
      if (error instanceof VibeRequired) return seeOther(refused(back, "vibe-required"));
      if (error instanceof TasteError || error instanceof VerdictError) {
        return seeOther(refused(back, "failed"));
      }
      throw error;
    }

    return seeOther(back);
  } catch (error) {
    report("could not keep a choice", error);
    return seeOther(refused(movieHref(named), "failed"));
  }
}

/** Back to a page, as a GET: a reload shows the page again and presses nothing. */
function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });
}

function refused(href: string, refusal: Refusal): string {
  return `${href}&refused=${refusal}`;
}

/** The message only, never the thrown object or anything identifying the user. */
function report(what: string, error: unknown): void {
  console.error(`[tonight] choose: ${what}: ${error instanceof Error ? error.message : "unknown error"}`);
}
