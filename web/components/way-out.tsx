import { X } from "lucide-react";

/**
 * How a control in a dialog's header is set.
 *
 * One rule rather than a class list on each control, so that anything that comes
 * to share the `×`'s corner cannot disagree with it about size or hover — a pair
 * of controls sitting together that did would read as two different kinds of
 * thing.
 *
 * A square with a wash on hover rather than a bordered button: at the top of a
 * card, beside a name set in the display face, a second outlined box would
 * compete with the card's own edge.
 */
export const HEADER_CONTROL = [
  "flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-faint",
  "transition-colors hover:bg-ink/10 hover:text-ink",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam",
].join(" ");

/**
 * The way out of a dialog: a `×` in the top right, where a reader looks for one.
 *
 * It was a `Close` button at the foot of the card, which put the way out below
 * however much the dialog held — under twenty film rows in the summary's own. So
 * leaving meant scrolling to find a thing you already knew was there, and the
 * further a dialog had been read the further away it was. The header is the one
 * part that is in view the moment a dialog opens and stays in view after that.
 *
 * Rightmost, and last in the header's DOM as well as on screen. Escape and a
 * press outside the card are unchanged and still the dialog's own; this is a
 * third way out rather than a replacement for either.
 *
 * Named for what it closes. "Close" alone is enough while somebody is reading
 * the dialog around it, and it is not enough when a screen reader reaches the
 * control on its own.
 */
export function WayOut({
  name,
  onClose,
}: {
  /** What is being left, which is what the control is called to a listener. */
  name: string;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={`Close ${name}`}
      className={HEADER_CONTROL}
    >
      <X aria-hidden="true" size={16} strokeWidth={1.5} />
    </button>
  );
}
