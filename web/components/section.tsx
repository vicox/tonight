/**
 * One section of a signed-in screen: a heading, and what is under it.
 *
 * The Stream's films and its short list of empty vibes are drawn by this one
 * component — the same heading in the same face at the same size, the same quiet
 * count beside it, the same distance down to the first card. Sections written
 * out separately would be places for that to drift.
 *
 * There is no surface. What sits under a heading sits on the page, and each card
 * carries its own edge — a box around a whole section would say that everything
 * in it is one thing at a lower level than the heading above it.
 *
 * `note` and `count` are absent where there is nothing for them to say.
 *
 * Where a section sits in the page's rhythm is the page's business and arrives as
 * `className`. A section that carried its own margin would be deciding what comes
 * before it from inside itself.
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
