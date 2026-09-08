"use client";

import { useEffect, useRef, useState } from "react";

import { Films } from "./movie-row";
import { Section } from "./section";
import type { Movie } from "@/lib/taste/model";
import {
  STATE_TILES,
  WITHOUT_STATUS,
  selected,
  withoutStatus,
  type Selection,
} from "@/lib/web/movie-summary";
import { refocus, rescueTo, returnTo } from "@/lib/web/refocus";

/**
 * How many films there are, and — one press in — which ones.
 *
 * The films section of the page, and one of its three peers: the same `Section`
 * heading as the genres and the mixes, with the same count beside it — the number
 * of films there are, every one of them, including the ones nobody has said
 * anything about. The heading lives here rather than on the page because this is
 * what knows whether there is anything to count.
 *
 * Under it, one tile per state over a page that files films by mix. The page
 * answers "what is in this mix"; these answer "how many have I loved", which the
 * page cannot, because the loved ones are spread across every mix on it. Pressing
 * one opens the films it counted, which is the only place on the website where a
 * film can be met outside the mix it happens to be in.
 *
 * ## Five tiles, and one quiet line that is not a tile
 *
 * The five are the five states. The films Tonight was never told about are the
 * line underneath, and the difference in weight is the point: `null` is the
 * absence of an answer, not a sixth answer, and a sixth tile would make silence
 * look like a verdict. There is no total tile either — a number for "all of
 * them" is what the heading is for, and having it twice invited reading the row
 * as a breakdown of the first tile.
 *
 * It is an overview of a collection and not a report about it: counts, no
 * proportion of anything, no arrow saying which way it went, and nothing about
 * when a film was saved. A tile that said "+3 this week" would be a claim about
 * the user's habits, and Tonight is not keeping score.
 *
 * ## The number is the point, the word is the caption
 *
 * The count is set in the display face and the label under it is small and quiet,
 * which is the reading order somebody scanning a row of tiles actually uses. A
 * listener is given the pair the other way round — "Loved, 3" — because that is
 * how the sentence is said.
 *
 * ## A dialog the browser opens
 *
 * `<dialog>` with `showModal()`, as `TasteEditor` uses: the top layer, the rest
 * of the page inert, and Escape, all from the element. See `taste-editor.tsx`
 * for the longer version of why none of that is written here.
 *
 * Focus on the way out is the exception, and it is `MovieSummary`'s rather than
 * this component's: React unmounts a dialog in the same commit that closes it,
 * so the one place that can still be sure of putting focus somewhere is the one
 * that is still mounted afterwards.
 *
 * The element is the whole surface, and the card is its only child. That is what
 * makes a press outside the card a press on the dialog itself, which is the one
 * thing a dismissal can be told from a press on the films — a full-viewport box
 * *inside* the dialog would swallow every one of them, and the dialog would only
 * be dismissable by Escape.
 *
 * ## Nothing here holds a copy of a film
 *
 * The only state is which selection is open. Both the counts and the open list are
 * derived from the `movies` prop on every render, so a mark pressed inside the
 * dialog needs no adjustment here at all: `MovieState` writes through the same
 * route boundary it always does and asks for the page to be re-rendered, the
 * server's answer arrives as a new `movies`, and the tile, its count and the list
 * under it are all recomputed from it. A film that no longer belongs to the open
 * tile leaves the list, because the list was never a snapshot to leave it in.
 */
export function MovieSummary({ movies }: { movies: readonly Movie[] }) {
  const [open, setOpen] = useState<Selection | null>(null);
  /**
   * The row of tiles, which is where focus goes when the control that opened a
   * dialog is not there to take it back.
   */
  const tiles = useRef<HTMLDivElement>(null);
  /**
   * The control somebody pressed, kept from the press itself rather than read
   * back off the document: a pointer press does not make a button the active
   * element in every browser, so `document.activeElement` answers a question
   * about the browser instead of about what was pressed.
   */
  const invoker = useRef<HTMLElement | null>(null);
  /**
   * What focus was last handed back to, until it is known to have survived.
   *
   * The quiet line can be the answer and can then disappear: giving the last
   * film without a status a state takes it off the page, and that can land
   * either side of the dialog closing. This is the second half of that race —
   * see the effect below, and `lib/web/refocus.ts` for both halves as rules.
   */
  const handedTo = useRef<HTMLElement | null>(null);

  /**
   * Focus, once there is no dialog to hold it.
   *
   * Every render, and it does nothing on almost all of them. Two things it
   * catches, in whichever order they happen:
   *
   * - the dialog has just closed, so focus is owed back to whatever opened it,
   *   or to the tiles if that control has gone in the meantime;
   * - what focus was handed back to has since been removed by a re-render, and
   *   nothing else has taken it, so it is on the document and belongs on the
   *   tiles.
   *
   * No copy of a film anywhere in it: the two refs hold elements the user
   * pressed, and the decisions are two lines in `refocus.ts`.
   */
  useEffect(() => {
    const stable = tiles.current?.querySelector<HTMLButtonElement>("button") ?? null;

    if (open === null && invoker.current !== null) {
      const back = returnTo(invoker.current, document.contains(invoker.current), stable);
      invoker.current = null;
      handedTo.current = back;
      back?.focus();
      return;
    }

    const rescued = rescueTo(
      handedTo.current,
      handedTo.current !== null && document.contains(handedTo.current),
      document.activeElement === document.body || document.activeElement === null,
      stable,
    );
    if (handedTo.current !== null && !document.contains(handedTo.current)) handedTo.current = null;
    rescued?.focus();
  });

  // Nothing to summarise yet, so no summary. A row of zeros over an empty taste
  // model would read as a broken instrument rather than as an honest count — the
  // same reason the "Other movies" section is absent when there are none.
  if (!movies.length) return null;

  const quiet = selected(WITHOUT_STATUS.name, movies);

  return (
    <>
      <Section title="Your movies" count={movies.length}>
        {/*
          Five tiles, in one row where a genre or a mix has a column of cards, and
          two or three rows of them where there is not the width for five. No copy
          under the heading: labelled numbers say what they are, and a sentence
          explaining them would be the only section on the page that needed one.
        */}
        <div ref={tiles} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {STATE_TILES.map((selection) => (
            <Tile
              key={selection.label}
              selection={selection}
              count={selected(selection.name, movies).length}
              // What was pressed, from the press itself. See `invoker`.
              onOpen={(event) => {
                invoker.current = event.currentTarget;
                setOpen(selection);
              }}
            />
          ))}
        </div>

        {/*
          The films nobody has said anything about, as a line rather than a tile:
          quiet type, no surface, no border, and only as wide as its own words. It
          is absent when there are none — there is nothing to say, and a "0" here
          would invite reading it as a state that happens to be empty.
        */}
        {quiet.length > 0 && (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={(event) => {
              invoker.current = event.currentTarget;
              setOpen(WITHOUT_STATUS);
            }}
            className="w-fit cursor-pointer text-left text-[12.5px] text-ink-faint transition-colors hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam"
          >
            {withoutStatus(quiet.length)}{" "}
            {/* Punctuation standing in for "opens these"; the words already say it. */}
            <span aria-hidden="true">→</span>
          </button>
        )}
      </Section>

      {open && <Chosen selection={open} movies={movies} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * A row's state control, as the menu button it is.
 *
 * The dialog has to be able to find the marks in it without being handed a list
 * of them through every row, and this is what they are: the only menu buttons in
 * here. `movie-state.tsx` is where that semantic is declared and held to.
 */
const MARK = '[aria-haspopup="menu"]';

/** One count, pressable. */
function Tile({
  selection,
  count,
  onOpen,
}: {
  selection: Selection;
  count: number;
  onOpen: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      // The visible order is the count and then the word; said aloud it is the
      // other way round, and `aria-label` is what lets both be right.
      aria-label={`${selection.label}: ${count}`}
      onClick={onOpen}
      className={[
        "cursor-pointer rounded-xl border border-rule bg-screen px-4 py-3 text-left",
        "transition-colors hover:border-ink-faint",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam",
      ].join(" ")}
    >
      <span aria-hidden="true" className="block font-display text-[26px] leading-none tabular-nums">
        {count}
      </span>
      <span
        aria-hidden="true"
        className="mt-2 block text-[11px] tracking-[0.11em] text-ink-faint uppercase"
      >
        {selection.label}
      </span>
    </button>
  );
}

/**
 * The films behind one tile.
 *
 * The same heading treatment as a panel on the page and the same rows as a mix,
 * so what opens is the page's own list in front of it rather than a second way of
 * showing a film. Compact: the films, and a way out.
 */
function Chosen({
  selection,
  movies,
  onClose,
}: {
  selection: Selection;
  movies: readonly Movie[];
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

  const films = selected(selection.name, movies);

  return (
    <dialog
      ref={dialog}
      aria-label={selection.label}
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
          <h2 className="font-display text-[24px] leading-none">{selection.label}</h2>
          <span className="text-[12px] text-ink-faint tabular-nums">{films.length}</span>
        </header>

        {films.length === 0 ? (
          // Reachable from inside: the last film under this tile can be given
          // another mark while the list is open, and then this is the truthful
          // thing to show.
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
