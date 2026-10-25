import Link from "next/link";

/** The way back to the Stream, at the top of a vibe's or a film's screen. */
export function BackToStream() {
  return (
    <Link
      href="/"
      prefetch={false}
      className="inline-flex items-baseline gap-1.5 text-[12.5px] text-ink-soft underline decoration-transparent underline-offset-4 transition-colors hover:text-ink hover:decoration-rule focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam"
    >
      <span aria-hidden="true">←</span>
      Your movies
    </Link>
  );
}
