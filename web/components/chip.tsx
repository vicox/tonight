/**
 * A genre's name, in the type the website sets a name in.
 *
 * Uppercase and tracked, which is film-credit typography rather than decoration:
 * it is what makes `[SCI-FI]` `[THRILLER]` read as the pieces a vibe is built
 * from at a glance. The name itself is stored as the user wrote it — this is a
 * rendering, and nothing here changes what is in the database.
 *
 * The rule is `CHIP` and the surface is not: a genre's label raises itself off
 * the page as `screen`, and that is chosen where the label is drawn. A name has
 * no fill of its own to lose — it shows whatever is behind it.
 *
 * Its own file because a genre's label is a client component and this is a rule,
 * not a component: it is shared by import rather than by rendering.
 */
export const CHIP =
  "rounded-md border border-rule px-2.5 py-1 text-[11px] tracking-[0.11em] text-ink-soft uppercase";
