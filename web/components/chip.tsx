/**
 * A genre's or a mix's name, in the type the page sets a name in.
 *
 * Uppercase and tracked, which is film-credit typography rather than decoration:
 * it is what makes `[SCI-FI] + [THRILLER] ↓ SPACE TENSION` read as a composition
 * at a glance. The name itself is stored as the user wrote it — this is a
 * rendering, and nothing here changes what is in the database.
 *
 * The rule is `CHIP` and the surface is not, because the same name is set the
 * same way on two different grounds: cut into a mix's card as `night` against
 * its `screen`, and raised off the page as `screen` where a genre labels itself.
 * A name has no fill of its own to lose — it shows whatever is behind it, and
 * when that is the surface it sits on the shape stops being a chip and becomes a
 * rectangle drawn around some words.
 *
 * Its own file so that both can have it: the page renders the chip inside a mix
 * on the server, and a genre's label is a client component, so a rule they share
 * cannot live in either of them.
 */
export const CHIP =
  "rounded-md border border-rule px-2.5 py-1 text-[11px] tracking-[0.11em] text-ink-soft uppercase";

/**
 * The name as it appears inside a card: cut into the surface it sits on.
 *
 * A chip holds a name the user chose, and a name is valid up to two hundred
 * characters with no space required anywhere in it — so it breaks and stops at
 * the width it is given rather than pushing what is around it sideways. On the
 * rule rather than at a call site because that is true of every chip: whatever
 * is inside one came from somebody typing it.
 *
 * `min-w-0` is what makes the other two mean anything. A chip is a flex item
 * wherever it is used, and a flex item is as wide as its longest unbreakable
 * word unless it is allowed to be narrower.
 */
export function Chip({ children }: { children: React.ReactNode }) {
  return <span className={`${CHIP} min-w-0 max-w-full bg-night break-words`}>{children}</span>;
}
