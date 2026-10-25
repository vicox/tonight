"use client";

import { useEffect, useRef } from "react";

import { Films } from "./movie-row";
import { WayOut } from "./way-out";
import type { Shown } from "@/lib/web/movie-summary";

/**
 * How a way into the collection is set, wherever one appears.
 *
 * A count and a word that open a list of films: the summary has seven of them,
 * the vibes section has one for the films in no vibe. One rule for all of them,
 * because they are one kind of thing and a reader should not have to work out
 * whether two of them behave the same.
 *
 * The underline is here in both states and only its colour moves. Switching the
 * *line* on and off made these flicker: the controls are a few words tall with
 * little between them, so a pointer crossing them leaves and re-enters several,
 * and each crossing flashed a line into existence. A colour is transitionable
 * and a line is not, so this fades — and neither state changes the geometry or
 * the hit area by a pixel.
 */
export const WAY_IN = [
  "inline-flex cursor-pointer items-baseline gap-1.5 text-left transition-colors",
  "underline decoration-transparent underline-offset-4 hover:decoration-rule",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam",
].join(" ");

/**
 * One count, pressable.
 *
 * The words then the number, which is both how it is set and how it is said — so
 * for all but one of them the control's own text is a perfectly good accessible
 * name and it is given no label at all. `Seen` is the one whose words are true
 * but not sufficient — read out beside the three opinions it sounds like it
 * might cover them too — and `spoken` is what adds the rest for it alone.
 *
 * Underline on hover and a real focus ring: it behaves like the way in that it
 * is. Nothing here draws a surface, a border or a radius around a number.
 */
/**
 * The films behind one selection.
 *
 * The same heading treatment as a panel on the page and the same rows as a vibe,
 * so what opens is the page's own list in front of it rather than a second way of
 * showing a film. Compact: the films, and a way out.
 *
 * One dialog for all seven selections, and it knows nothing about which one it
 * is showing beyond the name and the films — the aggregate opens it exactly as a
 * single state does.
 *
 * ## The primitive is the browser's
 *
 * A `<dialog>` opened with `showModal()`, which is what every dialog on this
 * page is and the reason none of them writes out what a modal needs. `showModal`
 * puts the dialog in the top layer, makes everything behind it inert so Tab
 * cannot reach the page underneath, and fires `cancel` for Escape. The
 * alternative was a focus trap, an `inert` attribute on the rest of the page and
 * a saved reference to the control that opened it — three things to keep
 * correct, all of them already correct in the browser. Focus on the way out is
 * the one exception, and it belongs to whatever opened the dialog: React
 * unmounts a dialog in the same commit that closes it.
 */
export function Chosen({
  title,
  films,
  onClose,
}: {
  /** What the dialog is called: a selection's label, or `Recently added`. */
  title: string;
  /**
   * The films to show, worked out by the caller on every render.
   *
   * Given rather than derived, because the summary now opens two kinds of
   * answer through one dialog: six of them are a set of states, and the seventh
   * is the films saved this week, which is not a state at all. Deriving it here
   * would mean this component knowing which kind it was looking at, and a second
   * dialog for the odd one out would mean two of everything a dialog does.
   *
   * Still no copy anywhere: the caller derives them from its own props each
   * render.
   */
  films: readonly Shown[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;

    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={title}
      // Escape is the browser's: it fires `cancel`, and taking the default would
      // let the element close itself while React still had it mounted. Refusing
      // it and going through `onClose` keeps one path out of here.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A press that lands on the dialog rather than on the card is a press
      // outside it, and the element itself is the surface around the card — so
      // this is the whole of "pressed away", with no scrim of our own to keep in
      // step with it.
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      className="m-0 h-dvh max-h-none w-dvw max-w-none overflow-y-auto bg-transparent px-5 py-[8vh] backdrop:bg-scrim"
    >
      {/* The card, and the dialog's only child. */}
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-rule bg-screen p-6 text-ink sm:p-8">
        {/*
          What was opened, how many there are, and the way out on the right. The
          name and its number stay one phrase inside a box of their own, which is
          what keeps them together when the `×` takes the end of the row.
        */}
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 className="font-display text-[24px] leading-none">{title}</h2>
            <span className="text-[12px] text-ink-faint tabular-nums">{films.length}</span>
          </div>
          <WayOut name={title} onClose={onClose} />
        </header>

        {films.length === 0 ? (
          // Reachable when a known state is empty and is still shown.
          <p className="py-6 text-center text-[13px] text-ink-faint">Nothing here now.</p>
        ) : (
          <Films movies={films} filed className="mt-5" />
        )}
      </div>
    </dialog>
  );
}
