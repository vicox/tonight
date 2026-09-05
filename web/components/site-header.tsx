import Link from "next/link";

/**
 * The site's header, which is one header in two states rather than two headers.
 *
 * The product name and what it does sit on the left, and whatever the visitor can
 * do about their session sits at the top right — signing in, or signing out.
 * Keeping the shell here rather than writing it out on each branch is what stops
 * the two from drifting apart: they cannot differ in width, rule, spacing or
 * alignment, because there is only one of each.
 */

/**
 * Both actions look the same because they are the same thing in the same place:
 * the one control this header offers. Defined once so they cannot drift.
 */
const ACTION =
  "cursor-pointer rounded-md border border-rule bg-screen px-3.5 py-2 text-[12.5px] text-ink " +
  "transition-colors hover:border-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-beam";

/**
 * The way back to the walkthrough, for somebody already signed in.
 *
 * The whole of this site's navigation. There are four pages and three of them are
 * legal text in the footer, so a bar across the top would be furniture around a
 * single link — and the one link worth having is the one that says how to connect
 * an assistant, because that is where the product actually happens.
 */
export function SetupLink() {
  return (
    <Link href="/setup" className="shrink-0 text-[12.5px] text-ink-faint hover:text-ink-soft">
      Setup
    </Link>
  );
}

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="mb-12 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-b border-rule pb-5 sm:mb-16">
      <div className="flex items-baseline gap-4">
        <h1 className="font-display text-[26px] leading-none tracking-[-0.01em]">Tonight</h1>
        <p className="text-[12.5px] text-ink-faint">Build your taste. Find your movie.</p>
      </div>
      {children}
    </header>
  );
}

/**
 * A form rather than a link, and a POST rather than a GET.
 *
 * Starting a sign-in parks a record and sets a cookie, so it has to be something a
 * person did: a GET would be reachable by a prefetch, a link preview or another
 * site's image tag. The endpoint refuses a request that did not come from this
 * origin — see lib/web/signin.ts.
 */
export function SignIn() {
  return (
    <form action="/auth/signin" method="post">
      <button type="submit" className={ACTION}>
        Sign in with Google
      </button>
    </form>
  );
}

/**
 * The same, for the same reason and more so: signing out changes state on the
 * server, and a GET that changes state is one a prefetch, a scanner or another
 * site's image tag can perform on somebody's behalf.
 *
 * `shrink-0` because it shares its row with an address that may be long: the
 * address gives way, the control never does.
 */
export function SignOut() {
  return (
    <form action="/auth/signout" method="post" className="shrink-0">
      <button type="submit" className={ACTION}>
        Sign out
      </button>
    </form>
  );
}

/**
 * The signed-in right-hand slot: whose session this is, and the way out of it.
 *
 * It is the address Google verified at sign-in, held on the session row and
 * nowhere else. The user's underlying identity — the provider subject that keys
 * their genres — is never rendered, here or anywhere else on the site.
 */
export function Account({ email }: { email: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-3">
      <p className="min-w-0 truncate text-[12.5px] text-ink-faint">
        <span className="sr-only">Signed in as </span>
        {email}
      </p>
      <SignOut />
    </div>
  );
}
