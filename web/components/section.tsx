/**
 * One section of the taste page: a heading, and what is under it.
 *
 * Films, genres and mixes are three peers, and this is the one component that
 * draws all three of them — the same heading in the same face at the same size,
 * the same quiet count beside it, the same distance down to the first row. Three
 * sections written out three times would be three places for that to drift, and a
 * page whose sections disagree about their own typography is a page with a
 * hierarchy nobody decided on.
 *
 * There is no surface. What sits under a heading sits on the page, and each row
 * or card carries its own edge — a box around a whole section would say that
 * everything in it is one thing at a lower level than the heading above it,
 * which is the reading this deliberately does not have.
 *
 * `note` and `count` are absent where there is nothing for them to say. The
 * films section is the case: its own first tile is the count, so a number beside
 * the heading would be the same fact twice.
 *
 * Where a section sits in the page's rhythm is the page's business and arrives as
 * `className`, the way a film list's does. A section that carried its own margin
 * would be deciding what comes before it from inside itself.
 *
 * ## The heading is also where focus goes when there is nothing else
 *
 * A section's contents can empty: deleting the last genre takes away every
 * control the genres section had, and the client island that drew them is
 * unmounted with them. Something has to be left for focus to land on, or a
 * browser drops it on `<body>` — a reader at the top of the page, with no way
 * back to what they were doing. The heading is the one thing a section always
 * has, and it names the place the reader is still in, so it is marked
 * `data-fallback` and made focusable without joining the tab order. See
 * `sectionFallback`, `lib/web/refocus.ts`, and the deletes in `manage.tsx`.
 */
export function Section({
  title,
  note,
  count,
  className = "",
  children,
}: {
  title: string;
  note?: string;
  count?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <header className="mb-6">
        <div className="flex items-baseline gap-3">
          <h2
            // The section's last resort for focus. `-1` keeps it out of the tab
            // order — nobody should have to tab through three headings to reach
            // the page — while leaving it something `focus()` can be given.
            data-fallback=""
            tabIndex={-1}
            className="font-display text-[26px] leading-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-beam"
          >
            {title}
          </h2>
          {count !== undefined && (
            <span className="text-[12px] text-ink-faint tabular-nums">{count}</span>
          )}
        </div>
        {note !== undefined && <p className="mt-2 text-[12.5px] text-ink-soft">{note}</p>}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/**
 * A section's last resort for focus, found from anything inside it.
 *
 * Asked for by the client islands when what focus was on has been deleted and
 * the section has nothing of its own left to offer. Written here because the
 * heading is this component's, and a selector for it spelled out in two islands
 * would be two places to keep in step with one attribute.
 *
 * `null` when there is no section above the element — which is not a case the
 * page has, and is still an answer rather than a throw, because every caller
 * ends in `?.focus()`.
 */
export function sectionFallback(from: Element | null): HTMLElement | null {
  return from?.closest("section")?.querySelector<HTMLElement>("[data-fallback]") ?? null;
}
