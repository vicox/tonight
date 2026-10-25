/**
 * Where focus goes when a dialog closes, and the control that opened it may no
 * longer be there.
 *
 * A browser drops focus to the document when the focused element is removed,
 * which leaves a keyboard reader at the top of the page with no way back to
 * where they were. These are the rules each section asks, given the controls it
 * has left — so they need to know nothing about a movie, a genre or a vibe.
 */

/**
 * Which control focus is owed to when a dialog closes.
 *
 * The invoker — the control that opened it — and not "whatever had focus before
 * `showModal`": a pointer press does not always make a button the document's
 * active element, so reading that back tells you about the browser rather than
 * about what somebody pressed. What opened the dialog is known at the moment it
 * was opened, and this is that answer used again.
 *
 * `present` is whether the invoker is still in the document. It can have gone —
 * a re-render can take a count, a label or a card away — and the fallback is a
 * control that does not come and go.
 */
export function returnTo<T>(invoker: T | null, present: boolean, fallback: T | null): T | null {
  return invoker !== null && present ? invoker : fallback;
}

/**
 * Where focus goes when the control it was handed back to then disappears.
 *
 * The other order of the same race: the dialog closes first, focus is handed
 * back to a control that is still there, and a render that removes it lands
 * afterwards. A browser drops focus to the document when the focused element is
 * removed, so this is the second chance: the thing we focused has gone, nothing
 * else has taken focus, and the fallback is where it belongs.
 *
 * `null` when there is nothing to do — which is almost always, because almost
 * every render leaves the focused control exactly where it was.
 */
export function rescueTo<T>(
  handedTo: T | null,
  present: boolean,
  stranded: boolean,
  fallback: T | null,
): T | null {
  if (handedTo === null || present) return null;
  return stranded ? fallback : null;
}

/**
 * The first control focus can actually be given, out of a list in the order it
 * should be tried.
 *
 * A section's own ways in, the most specific first, and last of them something
 * the section keeps whether it holds anything or not. It is a list rather than a
 * single fallback because a section can be emptied — the last genre or vibe
 * deleted — and "one stable control" quietly assumed there was another of the
 * same kind left. When there was not, the browser dropped focus on `<body>`: a
 * reader at the top of the page, with no way back to what they were doing.
 *
 * `leaving` is a control that is not to be chosen as a fallback — the invoker,
 * which is the control the fallback stands in for.
 */
export function fallbackTo<T>(
  candidates: readonly (T | null)[],
  leaving: T | null = null,
): T | null {
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== leaving) return candidate;
  }
  return null;
}
