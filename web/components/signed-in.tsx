import { LegalLinks } from "./legal";
import { SiteHeader, Account } from "./site-header";

/**
 * The frame every signed-in screen sits in, and the two things one can say
 * instead of showing what was asked for.
 *
 * The Stream, a vibe's screen and a film's screen are one product read from one
 * model, so they share a header with the account in it, a width, and a footer —
 * written once here rather than three times beside three pages.
 */
export function SignedIn({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <SiteHeader>
        <Account email={email} />
      </SiteHeader>

      {children}

      <footer className="mt-14 border-t border-rule pt-5 sm:mt-20">
        <LegalLinks />
      </footer>
    </main>
  );
}

/** The stores could not be read. Said plainly: reading them changes nothing. */
export function Unavailable() {
  return (
    <p className="py-24 text-center text-[14px] text-ink-soft">
      <span className="block text-ink">Your taste could not be read just now</span>
      <span className="mt-1.5 block text-[12.5px] text-ink-faint">
        Nothing has been changed. Try again in a moment.
      </span>
    </p>
  );
}

/**
 * A vibe or a film a URL named and this person does not have — renamed, deleted,
 * or never there.
 *
 * The query is not repeated back: it is whatever was in the address bar, and the
 * page has nothing true to say about it beyond that it is not here.
 */
export function NotHere({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-20 text-center">
      <p className="text-[14px] text-ink">Nothing here — it may have been renamed or deleted.</p>
      <p className="mt-4 text-[13px]">{children}</p>
    </div>
  );
}
