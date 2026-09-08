/**
 * Where focus goes when the control that had it is no longer there.
 *
 * A list that changes under somebody is the ordinary case in the summary's
 * dialog: pressing a mark inside it can move that film out of the list it was
 * being read in, and the row — with the pressed control on it — is gone by the
 * time the server's answer has been rendered. A browser drops focus to the
 * document when the focused element is removed, so whoever did that with a
 * keyboard is left outside the dialog they are still looking at, with no way
 * back to it but the mouse.
 *
 * So the position is what is kept, not the control: the row that moves up into
 * the gap is the next film somebody was going to reach anyway, and it is where
 * their hand already is. `at` is a remembered index rather than a saved element
 * for exactly that reason — the element it refers to is the one that has just
 * stopped existing.
 *
 * Deliberately about positions and not about films. It is given the controls that
 * are left, so it needs to know nothing about a movie, a state or a mix, and the
 * dialog does not have to keep a copy of any of them to be able to call it.
 */
export function refocus<T>(remaining: readonly T[], at: number, fallback: T | null): T | null {
  // Nothing left to focus. The caller's fallback is the way out of the dialog —
  // the point is that focus stays inside it either way.
  if (!remaining.length) return fallback;

  const clamped = Math.min(Math.max(at, 0), remaining.length - 1);
  return remaining[clamped] ?? fallback;
}

/**
 * Which control focus is owed to when a dialog closes.
 *
 * The invoker — the control that opened it — and not "whatever had focus before
 * `showModal`": a pointer press does not always make a button the document's
 * active element, so reading that back tells you about the browser rather than
 * about what somebody pressed. What opened the dialog is known at the moment it
 * was opened, and this is that answer used again.
 *
 * `present` is whether the invoker is still in the document. It can have gone:
 * the quiet line under the summary's tiles leaves the page when the last film
 * without a status is given one, which is exactly what somebody may have just
 * done from inside the dialog it opened. The fallback is a control that does not
 * come and go — one of the state tiles.
 */
export function returnTo<T>(invoker: T | null, present: boolean, fallback: T | null): T | null {
  return invoker !== null && present ? invoker : fallback;
}

/**
 * Where focus goes when the control it was handed back to then disappears.
 *
 * The other order of the same race. A write from inside the dialog and the
 * closing of it are two things the user does, and a re-render arriving from the
 * server is a third; if the dialog closes first, focus is handed back to a
 * control that is still there, and the render that removes it lands afterwards.
 * A browser drops focus to the document when the focused element is removed, so
 * this is the second chance: the thing we focused has gone, nothing else has
 * taken focus, and the fallback is where it belongs.
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
