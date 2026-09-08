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
          <h2 className="font-display text-[26px] leading-none">{title}</h2>
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
