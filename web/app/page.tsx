import { LegalLinks } from "@/components/legal";
import { SetupSteps } from "@/components/setup-steps";
import { SiteHeader, SignIn, Account, SetupLink } from "@/components/site-header";
import { WorkedExamples } from "@/components/worked-examples";
import { TasteView } from "@/components/taste-view";
import { PROJECT_INSTRUCTIONS, PROJECT_INSTRUCTIONS_VERSION } from "@/lib/instructions";
import { setupSteps } from "@/lib/setup-steps";
import type { Taste } from "@/lib/taste/model";
import { tasteStore } from "@/lib/taste/store";
import { mcpEndpoint } from "@/lib/web/setup";
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
 * The public page: what the loop is, and how to join it.
 *
 * Setup is the body of the page rather than a link off it. The product happens in
 * a conversation, so the useful thing this page can do for a stranger is hand
 * them the two things they have to carry into one — Tonight's address and the
 * project instructions — and say what to do with them. Signing in is not how
 * somebody starts; connecting their assistant is.
 *
 * It reads nothing about the visitor and renders the same for everybody.
 */
function Landing() {
  const endpoint = mcpEndpoint();

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <SiteHeader>
        <SignIn />
      </SiteHeader>

      <section>
        <p className="font-display text-[28px] leading-tight sm:text-[32px]">
          Build your taste.
          <br />
          Find your movie.
        </p>

        <p className="mt-6 text-[13px] leading-relaxed text-ink-soft">
          {/*
            The arrows are punctuation standing in for "leads to", and read aloud
            they are noise. The sentence they draw is available instead.
          */}
          <span className="sr-only">
            A conversation leads to a recommendation, your taste grows, and the recommendations
            get better.
          </span>
          <span aria-hidden="true" className="font-mono text-[12.5px]">
            conversation → recommendation → your taste grows → better recommendations
          </span>
        </p>
      </section>

      <WorkedExamples />

      <div className="mt-14">
        {endpoint === null ? (
          <p className="rounded-xl border border-rule bg-screen px-5 py-4 text-[13.5px] leading-relaxed text-ink-soft">
            The setup steps cannot be shown just now. Try again in a moment.
          </p>
        ) : (
          <SetupSteps
            steps={setupSteps(endpoint)}
            endpoint={endpoint}
            instructions={PROJECT_INSTRUCTIONS}
            version={PROJECT_INSTRUCTIONS_VERSION}
          />
        )}
      </div>

      {/*
        Linked rather than merely present: Google's OAuth branding step asks for a
        home page, a privacy policy and terms on the app's own domain, and a page
        nothing points at is one nobody — reviewer or user — is expected to find.
      */}
      <footer className="mt-14 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-rule pt-5">
        <p className="text-[12.5px] text-ink-faint">Closed beta.</p>
        <LegalLinks />
      </footer>
    </main>
  );
}

/** The same address, signed in: this user's taste model, and nobody else's. */
async function Yours({ visitor }: { visitor: SignedInVisitor }) {
  const taste = await readTaste(visitor);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <SiteHeader>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-2">
          <SetupLink />
          <Account email={visitor.email} />
        </div>
      </SiteHeader>

      {taste === "unavailable" ? (
        <p className="py-24 text-center text-[14px] text-ink-soft">
          <span className="block text-ink">Your taste could not be read just now</span>
          <span className="mt-1.5 block text-[12.5px] text-ink-faint">
            Nothing has been changed. Try again in a moment.
          </span>
        </p>
      ) : (
        <TasteView taste={taste} />
      )}

      <footer className="mt-14 border-t border-rule pt-5 sm:mt-20">
        <LegalLinks />
      </footer>
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
