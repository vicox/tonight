import { LegalLinks } from "@/components/legal";
import { SignedIn, Unavailable } from "@/components/signed-in";
import { SiteHeader, SignIn } from "@/components/site-header";
import { StreamView } from "@/components/stream-view";
import { WorkedExamples } from "@/components/worked-examples";
import { readHeld, resolveVisitor } from "@/lib/web/held";
import type { SignedInVisitor } from "@/lib/web/visitor";

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
 * Signed in, this is the Stream: every film, newest first. A vibe and a film each
 * have a screen of their own (`app/vibe`, `app/movie`), reached from here.
 *
 * ## Where the owner comes from
 *
 * From the session cookie, through `resolveVisitor`, and from nowhere else. This
 * page reads no route parameter, no search parameter and no request body, and
 * `readHeld` takes the resolved user rather than an id — so there is no
 * expression here in which a value from the request could decide whose taste is
 * read. The stores then scope every statement to that user; see `lib/web/held.ts`
 * and `lib/taste/store.ts`.
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
 * The public page: what the loop is, shown with worked examples.
 *
 * It reads nothing about the visitor and renders the same for everybody.
 */
function Landing() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <SiteHeader>
        <SignIn />
      </SiteHeader>

      <section>
        <p className="font-display text-[28px] leading-tight sm:text-[32px]">
          Tonight doesn&rsquo;t just remember what you love.
          <br />
          It understands why.
        </p>

        <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">
          Discover what makes movies special to you through personal Vibes — and get
          recommendations that truly match your taste.
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

/** The same address, signed in: this user's films, and nobody else's. */
async function Yours({ visitor }: { visitor: SignedInVisitor }) {
  const held = await readHeld(visitor);

  return (
    <SignedIn email={visitor.email}>
      {held === "unavailable" ? (
        <Unavailable />
      ) : (
        <StreamView taste={held.taste} standing={held.standing} />
      )}
    </SignedIn>
  );
}
