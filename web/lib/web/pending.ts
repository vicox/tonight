/**
 * How a control says it is mid-write without dropping the keyboard.
 *
 * The obvious way — the `disabled` attribute — takes focus away. A browser will
 * not keep focus on a disabled element, so a control that disables itself the
 * moment it is used moves focus to the document body, and whoever pressed it with
 * a keyboard is left at the top of the page.
 *
 * That is exactly what a menu returning focus to its trigger runs into: the
 * trigger is focused, the write starts, the re-render marks it pending, and the
 * focus that was just restored is gone. `aria-disabled` says the same thing to a
 * screen reader and to CSS while leaving the element focusable — so the guard
 * against a second write has to live in the handler instead, which is where it
 * belongs anyway.
 *
 * Returned as props to spread rather than as a boolean, so there is one place
 * that decides what "pending" is written as and no call site can reach for
 * `disabled` by habit.
 */
export type Pending = { "aria-disabled"?: true };

export function pending(busy: boolean): Pending {
  return busy ? { "aria-disabled": true } : {};
}
