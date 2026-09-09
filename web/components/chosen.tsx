"use client";

import { useEffect, useRef } from "react";

import { Films } from "./movie-row";
import type { Movie } from "@/lib/taste/model";
import { refocus } from "@/lib/web/refocus";

/**
 * How a way into the collection is set, wherever one appears.
 *
 * A count and a word that open a list of films: the summary has seven of them,
 * the mixes section has one for the films in no mix. One rule for all of them,
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
 * A row's state control, as the menu button it is.
 *
 * The dialog has to be able to find the marks in it without being handed a list
 * of them through every row, and this is what they are: the only menu buttons in
 * here. `movie-state.tsx` is where that semantic is declared and held to.
 */
const MARK = '[aria-haspopup="menu"]';

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
 * The same heading treatment as a panel on the page and the same rows as a mix,
 * so what opens is the page's own list in front of it rather than a second way of
 * showing a film. Compact: the films, and a way out.
 *
 * One dialog for all seven selections, and it knows nothing about which one it
 * is showing beyond the name and the films — the aggregate opens it exactly as a
 * single state does.
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
   * render, so a mark pressed in here changes the list by the next one.
   */
  films: readonly Movie[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const exit = useRef<HTMLButtonElement>(null);
  /**
   * Which row's mark last had focus, by position.
   *
   * A number rather than the element, because the element is what a state change
   * takes away — and rather than a film, because remembering one of those here
   * would be the copy of the collection this component deliberately does not
   * keep. See `lib/web/refocus.ts`.
   */
  const marked = useRef(-1);

  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;

    element.showModal();
    return () => element.close();
  }, []);

  /**
   * Focus, after a mark pressed in here moved its film out of this list.
   *
   * Every render, and it does nothing on almost all of them: while focus is
   * still on something inside the dialog there is nothing to put right. What it
   * catches is the one case the element cannot — the focused row was removed by
   * the re-render, and the browser has dropped focus out of the dialog and onto
   * the document. The dialog stays open, so focus belongs back inside it.
   *
   * Focus on the dialog itself counts as lost: some browsers put it there when
   * they take it off a removed child, and the point is to land on a control
   * somebody can use rather than on the box around them.
   */
  useEffect(() => {
    const element = dialog.current;
    if (!element?.open) return;

    const active = document.activeElement;
    if (active !== element && active instanceof Node && element.contains(active)) return;

    const marks = [...element.querySelectorAll<HTMLButtonElement>(MARK)];
    refocus(marks, marked.current, exit.current)?.focus();
  });

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
      {/*
        The card, and the dialog's only child. Where a mark taking focus is
        noticed, too: capturing, because the control that takes it is several rows
        down and this is the one node above all of them. Only the position is kept.
      */}
      <div
        onFocusCapture={(event) => {
          // As elements rather than as buttons: nothing here presses one, and it
          // is the focused node that has to be found among them.
          const marks: Element[] = [...(dialog.current?.querySelectorAll(MARK) ?? [])];
          const at = marks.indexOf(event.target);
          if (at >= 0) marked.current = at;
        }}
        className="mx-auto w-full max-w-xl rounded-2xl border border-rule bg-screen p-6 text-ink sm:p-8"
      >
        <header className="flex items-baseline gap-3">
          <h2 className="font-display text-[24px] leading-none">{title}</h2>
          <span className="text-[12px] text-ink-faint tabular-nums">{films.length}</span>
        </header>

        {films.length === 0 ? (
          // Reachable two ways: a known state can be empty and is still shown, and
          // the last film under this selection can be given another mark while the
          // list is open.
          <p className="py-6 text-center text-[13px] text-ink-faint">Nothing here now.</p>
        ) : (
          <Films movies={films} filed className="mt-5" />
        )}

        <div className="mt-7">
          <button
            ref={exit}
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-rule px-4 py-2 text-[13px] text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam"
          >
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
