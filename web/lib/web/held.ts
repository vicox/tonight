import type { Taste } from "../taste/model.ts";
import { tasteStore } from "../taste/store.ts";
import type { Standing } from "../verdicts/model.ts";
import { verdictStore } from "../verdicts/store.ts";
import { currentVisitor, type SignedInVisitor } from "./visitor.ts";

/**
 * What every signed-in screen reads, and from whom.
 *
 * The Stream, a vibe's screen and a film's screen all show the same model, so
 * they all read it here, the same way: the session decides who is asking, and
 * the two stores are opened for that person and nobody else. Nothing here takes
 * a route parameter, a search parameter or a request body — a URL on the vibe
 * and film screens chooses *which* of this person's objects to show, after this
 * has read them, and never *whose*.
 *
 * And it reads. Both calls below are reads. The website's one write is a film's
 * answers, posted to `/movie/choose` and kept in `lib/web/choose.ts` — see
 * `readonly.test.ts` for how that is held to.
 */

/** One person's taste model, and what currently stands about their films. */
export type Held = { taste: Taste; standing: Standing[] };

/**
 * Who is signed in, or nobody.
 *
 * A failure to answer is not allowed to keep a page from rendering. Not knowing
 * whether somebody is signed in is a reason to offer them a sign-in, not a reason
 * to answer an error. Falling this way cannot leak anything — a visitor treated as
 * signed out is shown nobody's taste.
 */
export async function resolveVisitor(): Promise<SignedInVisitor | null> {
  try {
    return await currentVisitor();
  } catch (error) {
    report("could not resolve a session", error);
    return null;
  }
}

/**
 * This user's genres, vibes and films, through the same store `get_taste` reads,
 * and what they have said about the films.
 *
 * Not through the MCP endpoint. That would mean this server holding an access
 * token for its own visitor and talking to itself over HTTP to read tables it is
 * already connected to — and two paths to the same answer that could disagree. One
 * store, one set of rules, one answer.
 *
 * It is a read. An account with no taste model is a normal state with an obvious
 * next step, not a page that quietly writes a starter set on its way to being
 * rendered.
 */
export async function readHeld(visitor: SignedInVisitor): Promise<Held | "unavailable"> {
  try {
    // Two stores, read together. The taste model holds the films; the verdict
    // store holds what the user has said about them, and a page needs both
    // because a film and an opinion about it are different things kept in
    // different places. Either failing means the page cannot be drawn honestly,
    // so neither is read without the other.
    const [taste, standing] = await Promise.all([
      (await tasteStore(visitor.user)).taste(),
      (await verdictStore(visitor.user)).standing(),
    ]);
    return { taste, standing };
  } catch (error) {
    report("could not read what Tonight holds", error);
    return "unavailable";
  }
}

/**
 * A failure, for whoever runs this deployment.
 *
 * The message only, never the thrown object and never anything identifying the
 * user. Nothing from here reaches the browser — a page shows the landing
 * content, or says that something could not be read, and stops.
 */
function report(what: string, error: unknown): void {
  console.error(
    `[tonight] page: ${what}: ${error instanceof Error ? error.message : "unknown error"}`,
  );
}
