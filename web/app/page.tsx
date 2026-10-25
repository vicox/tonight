import { Sparkles } from "lucide-react";

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
          Your personal movie AI. It remembers what you love, understands why, and helps you find
          what to watch next.
        </p>
      </section>

      {/*
        One reply, captioned as an example: the person in it is invented, and the
        website has no chat, so nothing here looks like something to type into. It
        keeps to the recommend skill's shape for a request with no mood — a
        surprise, the loved film as the reason, one lead — and, like the skill, it
        never brings up a film they turned down. It names no Vibe and puts no
        quoted words in anybody's mouth.

        The card is a Stream movie card (`movie-card.tsx`): its surface, its
        title's type and its quiet `ink-soft` for the small lines, which is how a
        card says how a film stands. Not its hover, because this card opens
        nothing; and not the year's `ink-faint`, which is 3.37:1 on `screen`.
        One accent only: Tonight's name in the app's violet with its ✨, drawn
        the way a Vibe link draws them (`vibe-links.tsx`).
      */}
      <figure
        aria-labelledby="landing-example"
        className="mt-10 rounded-xl border border-rule bg-screen px-5 py-4 sm:mt-14"
      >
        <figcaption id="landing-example" className="text-[12px] text-ink-soft">
          Example, shortened: a reply in ChatGPT or Claude, with Tonight connected
        </figcaption>

        <dl className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <dt className="shrink-0 text-[12px] text-ink-soft sm:w-16">You</dt>
            <dd className="min-w-0 text-[15px] text-ink">Anything for tonight?</dd>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <dt className="flex shrink-0 items-center gap-1.5 self-start text-[12px] text-vibe sm:w-16">
              <Sparkles aria-hidden="true" size={13} strokeWidth={1.75} className="shrink-0" />
              Tonight
            </dt>
            <dd className="min-w-0">
              <h3 className="font-display text-[22px] leading-tight break-words text-ink">
                A little surprise for tonight.
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink">
                You loved Arrival for its quiet tension and the way its mystery slowly unfolds. I
                think Moon might be right up your alley. It has that same feeling of something
                bigger hiding beneath the surface.
              </p>
              <p className="mt-3 text-[14px] text-ink-soft">
                Or give me a mood and I’ll aim closer.
              </p>
            </dd>
          </div>
        </dl>
      </figure>

      {/*
        What Tonight keeps, and where it runs. The last line is small on purpose
        but stays `ink-soft`: `ink-faint` on `night` is about 3.6:1, under the
        4.5:1 text this size needs.
      */}
      <section aria-labelledby="landing-taste" className="mt-10 sm:mt-14">
        <h2 id="landing-taste" className="font-display text-[24px] leading-tight sm:text-[28px]">
          Your taste. Your movie nights. Your AI.
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Tonight remembers the movies you love and what makes them special to you. So every
          recommendation feels a little more like you.
        </p>
        <p className="mt-4 text-[12.5px] text-ink-soft">
          Your personal movie AI, inside ChatGPT and Claude.
        </p>
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
