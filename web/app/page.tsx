import { LegalLinks } from "@/components/legal";
import { SetupSteps } from "@/components/setup-steps";
import { SiteHeader, SignIn, Account, SetupLink } from "@/components/site-header";
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

      <WorkedExample />

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

/**
 * One exchange, start to finish: a request, real films, a yes, and what Tonight
 * kept because of it.
 *
 * The films are named rather than described. A stranger works out what this is
 * from the answer they would have got, and "recommends three films" is not an
 * answer — it is a stage direction. Naming them is also the honest order of
 * events: the recommendation is what the product is for, and the taste model is
 * the residue of having asked well, not a form to fill in first.
 *
 * The mix is drawn the way the signed-in page draws it, because it is the part
 * that is hard to explain and easy to show. Two genres are two things somebody
 * said; the mix is the third thing they decided, and seeing it composed from the
 * other two says more than a sentence about combinations would.
 *
 * The "yes" is in it on purpose. Tonight stores what somebody said and never what
 * the assistant concluded about them, so the model grows one accepted offer at a
 * time — showing the acceptance is the difference between a product that keeps
 * what you tell it and one that watches you.
 */
function WorkedExample() {
  return (
    <section className="mt-12 rounded-2xl border border-rule bg-screen p-6 sm:p-8">
      <dl className="flex flex-col gap-3 text-[13.5px] leading-relaxed">
        <Turn who="You">I want a clever thriller tonight, nothing too bleak.</Turn>
        <Turn who="ChatGPT">
          <span className="block">Knives Out, The Nice Guys, or Game Night.</span>
          <span className="mt-1 block text-ink-soft">
            Want me to remember the kind of thing this is?
          </span>
        </Turn>
        <Turn who="You">yes</Turn>
        <Turn who="Tonight" lit>
          <span className="block">
            <span className="sr-only">
              Saved two genres, Clever thriller and Light suspense, and the mix they make
              together: Smart, not heavy.
            </span>
            <span aria-hidden="true" className="block">
              <span className="flex flex-wrap items-center gap-1.5">
                <Chip>Clever thriller</Chip>
                <span className="text-[12px] text-ink-faint">+</span>
                <Chip>Light suspense</Chip>
              </span>
              <span className="mt-1.5 block text-[13px] leading-none text-beam">↓</span>
              <span className="mt-1.5 block font-display text-[20px] leading-tight text-ink">
                Smart, not heavy
              </span>
            </span>
          </span>
        </Turn>
      </dl>

      <div className="mt-5 border-t border-rule pt-4 text-[12.5px] leading-relaxed text-ink-faint">
        <p>
          <span className="text-ink-soft">Next Friday the whole request is</span> “something like
          Smart, not heavy, but shorter” <span className="text-ink-soft">— and it knows.</span>
        </p>
        <p className="mt-1.5">
          Tonight keeps what you said, never what it worked out about you. Nothing is saved unless
          you say so.
        </p>
      </div>
    </section>
  );
}

function Turn({
  who,
  lit = false,
  children,
}: {
  who: string;
  lit?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
      <dt className={`shrink-0 sm:w-20 ${lit ? "text-beam" : "text-ink-faint"}`}>{who}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

/** A genre's name, in film-credit typography. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-rule px-2.5 py-1 text-[11px] tracking-[0.11em] text-ink-soft uppercase">
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
