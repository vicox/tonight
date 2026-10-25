import { LegalLinks } from "@/components/legal";
import { SignedIn, Unavailable } from "@/components/signed-in";
import { SiteHeader, SignIn } from "@/components/site-header";
import { StreamView } from "@/components/stream-view";
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
 * The public page: one line in Tonight's own voice, one example of what it is like
 * when it knows you, and the way in.
 *
 * It reads nothing about the visitor and renders the same for everybody. Nothing
 * on it moves: the slideshow that used to be here, and its client code, are gone.
 */
function Landing() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <SiteHeader>
        <SignIn />
      </SiteHeader>

      <section aria-labelledby="landing-promise">
        <h2
          id="landing-promise"
          className="font-display text-[32px] leading-[1.1] text-balance sm:text-[44px]"
        >
          Your next movie is already on my mind.
        </h2>

        <p className="mt-5 text-[16px] leading-relaxed text-ink-soft">
          An AI that gets to know you, remembers what moves you, and helps make your movie nights
          better.
        </p>
      </section>

      {/*
        One reply, captioned as an example: the words quoted are an invented
        person's, and the website has no chat, so nothing here looks like
        something to type into. It keeps to the recommend skill's shape for a
        request with no mood — a surprise, one lead, their words not made
        stronger — and, like the skill, it never brings up a film they turned
        down. Amber marks Tonight's turn, as it did in the examples before it.
      */}
      <figure
        aria-labelledby="landing-example"
        className="mt-10 rounded-2xl border border-rule bg-screen p-6 sm:mt-14 sm:p-8"
      >
        <figcaption id="landing-example" className="text-[12.5px] text-ink-soft">
          Example, shortened: a reply in ChatGPT or Claude, with Tonight connected
        </figcaption>

        <dl className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <dt className="shrink-0 text-[13px] text-ink-soft sm:w-16">You</dt>
            <dd className="min-w-0 text-[15px] text-ink">Anything for tonight?</dd>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <dt className="shrink-0 text-[13px] text-beam sm:w-16">Tonight</dt>
            <dd className="min-w-0">
              <p className="font-display text-[21px] leading-snug text-ink sm:text-[24px]">
                A surprise, from your Space Tension. You loved Arrival — “it trusts you to keep
                up,” you said — so I’d start with Moon: one man, one station, and a quiet puzzle
                that rewards exactly that kind of attention.
              </p>
              <p className="mt-3 text-[14px] text-ink-soft">
                Or give me a mood and I’ll aim closer.
              </p>
            </dd>
          </div>
        </dl>
      </figure>

      {/*
        What is here now and what is not, side by side and plainly labelled. Today
        is said as what it does rather than as a correction of the line above.
      */}
      <section aria-label="Today, and where Tonight is going" className="mt-10 sm:mt-14">
        <dl className="flex flex-col gap-6 sm:grid sm:grid-cols-2 sm:gap-8">
          <div>
            <dt className="text-[12.5px] tracking-[0.11em] text-ink-soft uppercase">
              Today, in closed beta
            </dt>
            <dd className="mt-2 text-[15px] leading-relaxed text-ink-soft">
              Tonight works inside the AI assistant you already use, like ChatGPT or Claude. Ask
              for a film, and it draws on what it keeps: your films, what you thought of them,
              your Vibes. Sign in to see your films and Vibes.
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] tracking-[0.11em] text-ink-soft uppercase">
              Where it’s going
            </dt>
            <dd className="mt-2 text-[15px] leading-relaxed text-ink-soft">
              An AI that takes care of your movie nights, not only when you ask. Not available yet.
            </dd>
          </div>
        </dl>
      </section>

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
