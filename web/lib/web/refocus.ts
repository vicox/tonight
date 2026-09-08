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
