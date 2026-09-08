"use client";

import { useEffect, useRef, useState } from "react";

import { CHIP } from "./chip";
import type { Genre } from "@/lib/taste/model";
import { returnTo } from "@/lib/web/refocus";

/**
 * The genres, as a line of labels, and what one means when you press it.
 *
 * A genre *is* its name: there is nothing else on one to show, so the resting
 * page is the names themselves, read across in one wrapping line — the handful
 * of pieces a taste is made of rather than a list to scroll. A mix keeps its
 * card, because a mix is a composition with films in it and has something to put
 * there.
 *
 * ## Why the meaning is a dialog and not a disclosure
 *
 * A `<details>` under a label has to put its instruction somewhere, and in a
 * wrapping line the only somewhere is inside the line: the pressed label takes
 * the row to itself and every label after it moves. Reading what one genre means
 * therefore rearranged the set of them, which is the one thing this line is for.
 * A dialog leaves the line exactly as it was — the labels cannot reflow, because
 * nothing about them changes when one is opened.
 *
 * The cost is that this is client code where the disclosure was the browser's
 * own. It is the same trade the summary tiles already make, and the same
 * `<dialog>`: `showModal()` for the top layer, the page's inertness and Escape —
 * see `taste-editor.tsx` for why none of that is written out here. Focus on the
 * way out is this component's rather than the dialog's, because a dialog is
 * unmounted in the same commit that closes it and cannot be sure of putting
 * focus anywhere.
 *
 * Nothing about a genre has moved but where its instruction is read. The names
 * and the meanings are the store's, this renders them, and management is where
 * it was: at the foot of the page.
 */
export function GenreLabels({ genres }: { genres: readonly Genre[] }) {
  const [open, setOpen] = useState<Genre | null>(null);
  /** The line of labels, which is where focus goes if the one pressed has gone. */
  const line = useRef<HTMLDivElement>(null);
  /**
   * The label somebody pressed.
   *
   * Kept from the press itself rather than read back off the document: clicking
   * a button does not make it the active element in every browser, so
   * `document.activeElement` answers a question about the browser instead of
   * about what was pressed.
   */
  const invoker = useRef<HTMLElement | null>(null);

  /**
   * Focus, once there is no dialog to hold it.
   *
   * React unmounts a dialog in the same commit that closes it, so the browser's
   * own restoration has no dialog left to restore from and leaves focus on the
   * document. This component is still mounted afterwards, which is what makes it
   * the place that can put focus back on the label that was pressed.
   *
   * A label can stop existing while its own meaning is on screen — renaming a
   * genre re-keys its row — so the line it came from is the fallback. What must
   * not happen is focus on `<body>`, which is a reader at the top of the page
   * with no way back to where they were.
   */
  useEffect(() => {
    if (open !== null || invoker.current === null) return;

    const pressed = invoker.current;
    invoker.current = null;

    const back = returnTo(
      pressed,
      document.contains(pressed),
      line.current?.querySelector<HTMLButtonElement>("button") ?? null,
    );
    back?.focus();
  });

  return (
    <>
      <div ref={line} className="flex flex-wrap gap-2">
        {genres.map((genre) => (
          <button
            key={genre.name}
            type="button"
            aria-haspopup="dialog"
            // The label pressed, from the press itself. See `invoker`.
            onClick={(event) => {
              invoker.current = event.currentTarget;
              setOpen(genre);
            }}
            className={[
              CHIP,
              // A name is valid up to two hundred characters and need not contain
              // a space, so one long enough to fill the line has to wrap inside
              // its own label rather than push the page sideways. Still only as
              // wide as it needs to be: `max-w-full` is a ceiling, not a width.
              "max-w-full cursor-pointer bg-screen text-left break-words",
              "transition-colors hover:text-ink",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam",
            ].join(" ")}
          >
            {genre.name}
          </button>
        ))}
      </div>

      {/* Outside the line, so that opening one cannot move the others. */}
      {open && <Meaning genre={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * What one genre means to this user.
 *
 * The name and the sentence under it, and a way out. Nothing to press but that:
 * a genre is renamed and rewritten at the foot of the page, and a second place
 * to do it would be a second set of rules about a name.
 */
function Meaning({ genre, onClose }: { genre: Genre; onClose: () => void }) {
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
      aria-label={genre.name}
      // Escape is the browser's: it fires `cancel`, and taking the default would
      // let the element close itself while React still had it mounted.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A press that lands on the dialog rather than on the card is a press
      // outside it, and the element itself is the surface around the card.
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      className="m-0 h-dvh max-h-none w-dvw max-w-none overflow-y-auto bg-transparent px-5 py-[8vh] backdrop:bg-scrim"
    >
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-rule bg-screen p-6 text-ink sm:p-8">
        <h2 className="font-display text-[24px] leading-tight break-words">{genre.name}</h2>

        <p className="mt-4 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-soft">
          {genre.instruction}
        </p>

        <div className="mt-7">
          <button
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
