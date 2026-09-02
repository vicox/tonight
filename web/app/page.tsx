import { SiteHeader, SignIn, Account } from "@/components/site-header";
import { TasteBoard } from "@/components/taste-board";
import type { Taste } from "@/lib/taste/model";
import { tasteStore } from "@/lib/taste/store";
import { currentVisitor, type SignedInVisitor } from "@/lib/web/visitor";

/**
 * One address, two pages: the landing page for anyone, and this user's taste
 * model for whoever is signed in.
 *
 * There is no separate app URL, and that is the point. A signed-in person who
 * types the product's name into a browser wants their genres, not a page about
 * the product with a link to their genres on it — and a second surface showing the
 * same rows is a second place for the two to disagree about what they say and who
 * may read them.
 *
 * ## Where the owner comes from
 *
 * From the session cookie, through `currentVisitor`, and from nowhere else. This
 * page reads no route parameter, no search parameter and no request body, and
 * `tasteStore` takes the resolved user rather than an id — so there is no
 * expression here in which a value from the request could decide whose taste is
 * read. The store then scopes every statement to that user; see
 * `lib/taste/store.ts`.
 */

/**
 * Never prerendered and never cached. This page reads a session cookie and, for a
 * signed-in visitor, one user's rows; a cached answer would be one person's taste
 * handed to the next. The response headers that say so to every cache in between
 * are in `next.config.ts`, because a Server Component cannot set one.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const visitor = await resolveVisitor();
  return visitor ? <Yours visitor={visitor} /> : <Landing />;
}

/**
 * Who is signed in, or nobody.
 *
 * A failure to answer is not allowed to keep the page from rendering. Not knowing
 * whether somebody is signed in is a reason to offer them a sign-in, not a reason
 * to answer an error. Falling this way cannot leak anything — a visitor treated as
 * signed out is shown nobody's taste.
 */
async function resolveVisitor(): Promise<SignedInVisitor | null> {
  try {
    return await currentVisitor();
  } catch (error) {
    report("could not resolve a session", error);
    return null;
  }
}

/**
 * The public page: the mechanic first, and the way in.
 *
 * The hero is the product in three lines — two genres, an arrow, the mix they
 * make — because that is understandable in a second and "personalised movie
 * recommendations" is not. It reads nothing and renders the same for everybody.
 */
function Landing() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <SiteHeader>
        <SignIn />
      </SiteHeader>

      <section className="py-10 text-center sm:py-16">
        <p className="font-display text-[34px] leading-tight sm:text-[46px]">
          Build your taste.
          <br />
          Find your movie.
        </p>

        <div className="mt-12 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <HeroChip>Sci-Fi</HeroChip>
            <span className="text-[13px] text-ink-faint">+</span>
            <HeroChip>Thriller</HeroChip>
          </div>
          <span aria-hidden="true" className="text-[16px] text-beam">
            ↓
          </span>
          <p className="font-display text-[30px] leading-none text-ink sm:text-[36px]">
            Space Tension
          </p>
        </div>

        <p className="mx-auto mt-12 max-w-lg text-[14px] leading-relaxed text-ink-soft">
          You say what you like, in your own words. Tonight keeps it as genres you own and can
          edit, and mixes you build from them. Your assistant reads that model and finds you
          something to watch.
        </p>
      </section>

      <footer className="mt-10 border-t border-rule pt-5 text-[12.5px] text-ink-faint">
        Closed beta. Connect Tonight to your assistant over MCP.
      </footer>
    </main>
  );
}

function HeroChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-rule px-3 py-1.5 text-[12px] tracking-[0.13em] text-ink-soft uppercase">
      {children}
    </span>
  );
}

/** The same address, signed in: this user's taste model, and nobody else's. */
async function Yours({ visitor }: { visitor: SignedInVisitor }) {
  const taste = await readTaste(visitor);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <SiteHeader>
        <Account email={visitor.email} />
      </SiteHeader>

      {taste === "unavailable" ? (
        <p className="py-24 text-center text-[14px] text-ink-soft">
          <span className="block text-ink">Your taste could not be read just now</span>
          <span className="mt-1.5 block text-[12.5px] text-ink-faint">
            Nothing has been changed. Try again in a moment.
          </span>
        </p>
      ) : (
        <TasteBoard taste={taste} />
      )}
    </main>
  );
}

/**
 * This user's genres and mixes, through the same store `get_taste` reads.
 *
 * Not through the MCP endpoint. That would mean this server holding an access
 * token for its own visitor and talking to itself over HTTP to read tables it is
 * already connected to — and two paths to the same answer that could disagree. One
 * store, one set of rules, one answer.
 *
 * It is a read. Nothing here creates a genre or writes anything at all: an account
 * with no taste model is a normal state with an obvious next step, not a page that
 * quietly writes a starter set on its way to being rendered.
 */
async function readTaste(visitor: SignedInVisitor): Promise<Taste | "unavailable"> {
  try {
    return await (await tasteStore(visitor.user)).taste();
  } catch (error) {
    report("could not read the taste model", error);
    return "unavailable";
  }
}

/**
 * A failure, for whoever runs this deployment.
 *
 * The message only, never the thrown object and never anything identifying the
 * user. Nothing from here reaches the browser — the page shows the landing
 * content, or says that something could not be read, and stops.
 */
function report(what: string, error: unknown): void {
  console.error(
    `[tonight] home: ${what}: ${error instanceof Error ? error.message : "unknown error"}`,
  );
}
