"use client";

import { useEffect, useRef, useState } from "react";

import { CHIP } from "./chip";
import { Manage } from "./manage";
import { Films } from "./movie-row";
import { sectionFallback } from "./section";
import type { Genre, Mix, Movie } from "@/lib/taste/model";
import { filmsUnder } from "@/lib/web/mixes";
import { fallbackTo, rescueTo, returnTo } from "@/lib/web/refocus";

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
 * see `manage.tsx` for why none of that is written out here. Focus on the
 * way out is this component's rather than the dialog's, because a dialog is
 * unmounted in the same commit that closes it and cannot be sure of putting
 * focus anywhere.
 *
 * Nothing about a genre has moved but where its instruction is read. The names
 * and the meanings are the store's, this renders them, and management is where
 * it was: at the foot of the page.
 */
export function GenreLabels({
  genres,
  mixes,
  movies,
}: {
  readonly genres: readonly Genre[];
  /** The mixes, to reach the films: a genre has none of its own. See `filmsUnder`. */
  readonly mixes: readonly Mix[];
  readonly movies: readonly Movie[];
}) {
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
   * What focus was last handed back to, until it is known to have survived.
   *
   * A label can stop existing after it has been given focus: a genre deleted
   * from another window, or from an assistant, takes its label away on the next
   * render. Handing focus back and forgetting immediately left a reader on
   * `<body>` when that render arrived second — see the effect below, and
   * `lib/web/refocus.ts` for both halves of the race as rules.
   */
  const handedTo = useRef<HTMLElement | null>(null);
  /**
   * Whether the genre whose dialog is closing was deleted rather than dismissed.
   *
   * The page is a render behind at that moment: the deletion has landed in the
   * store and the label is still on screen, so "is the invoker still in the
   * document" answers yes about a control with one render left to live. This is
   * what the answer should have been.
   */
  const removed = useRef(false);

  /**
   * Focus, once there is no dialog to hold it.
   *
   * React unmounts a dialog in the same commit that closes it, so the browser's
   * own restoration has no dialog left to restore from and leaves focus on the
   * document. This component is still mounted afterwards, which is what makes it
   * the place that can put focus back on the label that was pressed — and what
   * was pressed can be gone by then, or be about to go: renaming a genre re-keys
   * its label, and deleting one takes the label away with it. So the line is
   * asked for what it has left, the section's heading is behind that, and the
   * whole thing is checked twice: once when the dialog closes, and again if what
   * took focus then disappears.
   *
   * What must not happen is focus on `<body>`, which is a reader at the top of
   * the page with no way back to where they were.
   */
  useEffect(() => {
    const labels = [...(line.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    // The deleted label last of all, and skipped: the section's own heading is a
    // better place than a control that is one render from being removed. It is
    // also all that is left when the genre deleted was the only one — the line
    // and this component go with it.
    const stable = fallbackTo([...labels, sectionFallback(line.current)], invoker.current);

    if (open === null && invoker.current !== null) {
      const pressed = invoker.current;
      const gone = removed.current;
      invoker.current = null;
      removed.current = false;

      const back = returnTo(gone ? null : pressed, document.contains(pressed), stable);
      handedTo.current = back;
      back?.focus();
      return;
    }

    // The other half: what focus was handed back to has since been removed by a
    // re-render and nothing else has taken it, so it is on the document and
    // belongs on a label that is still there.
    const rescued = rescueTo(
      handedTo.current,
      handedTo.current !== null && document.contains(handedTo.current),
      document.activeElement === document.body || document.activeElement === null,
      stable,
    );
    if (handedTo.current !== null && !document.contains(handedTo.current)) handedTo.current = null;
    rescued?.focus();
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
      {open && (
        <Meaning
          genre={open}
          films={filmsUnder(open, mixes, movies)}
          onClose={() => setOpen(null)}
          // Closed because the genre is gone, which is not the same as closed.
          // See `removed`.
          onRemoved={() => {
            removed.current = true;
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

/**
 * What one genre means to this user, and what they have filed under it.
 *
 * The name, the sentence under it, then the films — the same rows a mix opens
 * and the summary opens, because a film's row is the same object wherever
 * somebody meets it. They say which mixes they are filed in, since a genre
 * gathers films from several and the heading above them names none.
 *
 * Nothing else to press: a genre is renamed and rewritten at the foot of the
 * page, and a second place to do it would be a second set of rules about a name.
 *
 * No films is left as no films. A genre with mixes that are empty, or with no
 * mixes yet, is an ordinary state of a taste somebody is still building, and a
 * line describing the gap would make it read as something gone wrong.
 */
function Meaning({
  genre,
  films,
  onClose,
  onRemoved,
}: {
  genre: Genre;
  /** Worked out by the caller each render, so a mark pressed here shows by the next. */
  films: readonly Movie[];
  onClose: () => void;
  /** Closed because the genre was deleted, which the line answers differently. */
  onRemoved: () => void;
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
        {/*
          The name, and the one thing that can be done to the genre from here.
          `items-start` rather than a baseline: a name that wraps to three lines
          must not carry the menu down with it.
        */}
        <header className="flex items-start justify-between gap-4">
          <h2 className="min-w-0 font-display text-[24px] leading-tight break-words">
            {genre.name}
          </h2>
          <Manage kind="genre" name={genre.name} onRemoved={onRemoved} />
        </header>

        <p className="mt-4 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-soft">
          {genre.instruction}
        </p>

        <Films movies={films} filed className="mt-5" />

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
