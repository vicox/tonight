"use client";

import { Heart } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Chip } from "./chip";
import { Chosen, WAY_IN } from "./chosen";
import { Manage } from "./manage";
import { Films } from "./movie-row";
import { sectionFallback } from "./section";
import type { Mix, Movie, Written } from "@/lib/taste/model";
import { filmsIn, inNoMix, inOrder, preview, spokenMix } from "@/lib/web/mixes";
import { LOVED, selected } from "@/lib/web/movie-summary";
import { fallbackTo, rescueTo, returnTo } from "@/lib/web/refocus";

/**
 * The user's mixes: a name each, and everything else one press in.
 *
 * A card used to be the whole mix — its genres as chips, an arrow, its name, its
 * instruction behind a disclosure and its films underneath. Two mixes filled a
 * screen, which made the one thing this section is for, *seeing which mixes you
 * have*, the thing it was worst at. So a card is now the answer to "which mix is
 * this and is it the one I want tonight", and the rest is a dialog.
 *
 * ## What survives on the card, and why those three
 *
 * The name, because a mix *is* its name. A heart with a number when any of its
 * films are loved, because that is the reason to open this mix tonight rather
 * than another one. And three of the titles, because that is what somebody
 * recognises their own shelf by.
 *
 * How many films are in it is not among them. It is a measurement rather than a
 * recognition — it does not help anybody pick a mix, and set beside the loved
 * count it read as the second half of a score. A listener is still given it,
 * because "four films, three loved" is how somebody would say a mix out loud,
 * and the dialog still counts what it opens.
 *
 * The heart is one heart and a number, never one heart per film: three hearts in
 * a row is a rating, and this is a count. It says that three films in this mix
 * are loved, and it is absent when none are, because there is nothing to say.
 *
 * ## What is on the card comes from the films, every render
 *
 * None of it is stored on a mix and none of it is kept here: the films the mix's
 * handles resolve to are read again on every render, and the heart is how many
 * of those are loved. So a mark pressed inside the dialog moves the heart on the
 * card by the next render. See `lib/web/mixes.ts`.
 *
 * The order the cards come in is the same kind of answer: read off the films
 * every render, the liveliest mix first, and never written down. A mark pressed
 * in a dialog can therefore move a card up the list by the next render, which is
 * the point — the list is for finding tonight's mix, not for remembering which
 * was made first.
 */
/**
 * What the section's one non-mix way in stands for.
 *
 * A marker rather than a mix, so that one piece of state says which of the two
 * dialogs is open without either of them being pretended into the other's shape.
 */
const OTHER = "other" as const;

export function MixCards({
  mixes,
  movies,
}: {
  mixes: readonly Written<Mix>[];
  movies: readonly Written<Movie>[];
}) {
  /** A mix, or the films that are in none of them. */
  const [open, setOpen] = useState<Mix | typeof OTHER | null>(null);
  /** The stack of cards, which is where focus goes if the one pressed has gone. */
  const stack = useRef<HTMLDivElement>(null);
  /**
   * The card somebody pressed.
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
   * The remainder's own control is the case: filing the last film that is in no
   * mix takes the line off the page, and that can land either side of the dialog
   * closing. Handing focus back and forgetting immediately left a reader on
   * `<body>` when the render arrived second — see the effect below, and
   * `lib/web/refocus.ts` for both halves of the race as rules.
   */
  const handedTo = useRef<HTMLElement | null>(null);
  /**
   * The remainder's own control, when there is one.
   *
   * Held rather than looked for, because it is outside the stack: it belongs to
   * the films that are in no mix, not to a mix. Deleting the last mix is what
   * makes it matter — the stack empties, and the line under it is the nearest
   * thing left of the same kind.
   */
  const remainder = useRef<HTMLButtonElement>(null);
  /**
   * Whether the mix whose dialog is closing was deleted rather than dismissed.
   *
   * The page is a render behind at that moment: the deletion has landed in the
   * store and the card is still on screen, so "is the invoker still in the
   * document" answers yes about a control with one render left to live.
   */
  const removed = useRef(false);

  /**
   * Focus, once there is no dialog to hold it.
   *
   * React unmounts a dialog in the same commit that closes it, so the browser's
   * own restoration has no dialog left to restore from and leaves focus on the
   * document. This component is still mounted afterwards, which is what makes it
   * the place that can put focus back on the card that was pressed — and what
   * was pressed can be gone by then: renaming a mix re-keys its row, and filing
   * the last film that is in no mix takes the remainder's line away, and
   * deleting a mix takes its card. So the fallback is a list rather than one
   * control — another card, then the remainder's line, then the section's own
   * heading, which is there whether this section holds anything or not — and it
   * is checked twice: once when the dialog closes, and again if what took focus
   * then disappears.
   */
  useEffect(() => {
    const cards = [...(stack.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    // The deleted card is skipped even though the page still shows it: the
    // deletion has landed, and this render is the last one it appears in.
    const stable = fallbackTo(
      [...cards, remainder.current, sectionFallback(stack.current)],
      invoker.current,
    );

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
    // belongs on a card that is still there.
    const rescued = rescueTo(
      handedTo.current,
      handedTo.current !== null && document.contains(handedTo.current),
      document.activeElement === document.body || document.activeElement === null,
      stable,
    );
    if (handedTo.current !== null && !document.contains(handedTo.current)) handedTo.current = null;
    rescued?.focus();
  });

  /**
   * The films that are in no mix, in the order the store holds them.
   *
   * One quiet line, and the same dialog every other way in opens. Which films
   * those are, and in which order, is `lib/web/mixes.ts` — a component should
   * not carry a rule that a test cannot reach.
   */
  const other = inNoMix(movies);

  return (
    <>
      <div ref={stack} className="flex flex-col gap-3">
        {/*
          The liveliest first, which is a question about the films in each mix and
          therefore not something a card can answer for itself. The rule is
          `lib/web/mixes.ts`; nothing about the order is written down.
        */}
        {inOrder(mixes, movies).map((mix) => {
          const films = filmsIn(mix, movies);
          const loved = selected(LOVED, films).length;
          const glance = preview(films);

          return (
            <button
              key={mix.name}
              type="button"
              aria-haspopup="dialog"
              // The name and both numbers, said the way somebody would say
              // them. A listener is given the count the card leaves out: it is
              // one phrase spoken, where on the card it was a second number
              // beside the loved one.
              aria-label={spokenMix(mix.name, films.length, loved)}
              // The card pressed, from the press itself. See `invoker`.
              onClick={(event) => {
                invoker.current = event.currentTarget;
                setOpen(mix);
              }}
              className={[
                "flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1",
                // The accent edge a mix has always had: it is the thing on this
                // page the user built themselves.
                "cursor-pointer rounded-xl border border-beam-dim bg-screen px-5 py-4 text-left",
                "transition-colors hover:border-beam focus-visible:outline-2",
                "focus-visible:outline-offset-2 focus-visible:outline-beam",
              ].join(" ")}
            >
              {/*
                A name is valid up to two hundred characters, so it wraps rather
                than pushing the card sideways.

                `min-w-0` is what makes `break-words` mean anything here. A flex
                item is as wide as its longest unbreakable word unless it is
                allowed to be narrower, and a name need not contain a space —
                without it a long one was 507px wide in a 350px card.
              */}
              <span
                aria-hidden="true"
                className="min-w-0 font-display text-[22px] leading-tight break-words text-ink"
              >
                {mix.name}
              </span>

              {loved > 0 && (
                <span
                  aria-hidden="true"
                  // `ml-auto` and not only the row's `justify-between`: a long
                  // name pushes this onto a line of its own, and a lone item on
                  // a line is at its start. The margin puts it on the right
                  // either way.
                  className="ml-auto flex shrink-0 items-center gap-1.5 text-[12px] text-ink-soft tabular-nums"
                >
                  <Heart size={13} strokeWidth={1.5} fill="currentColor" />
                  {loved}
                </span>
              )}

              {/*
                Three of the films, to be glanced at. The name says which mix
                this is; the titles are what somebody recognises their own shelf
                by, and reading them here is usually the press they would
                otherwise have to make.

                Last of the three, and that is the whole reason it is written
                after the heart rather than before it: `w-full` gives it a line
                of its own wherever it sits, and put first it took the line the
                heart was on and pushed the heart down to a third. So the name
                and the heart stay on one line and this reads underneath them.
                It breaks rather than pushing the card sideways.

                Which three, and in which order, is `lib/web/mixes.ts` — a card
                should not carry a rule.
              */}
              {glance !== null && (
                <span
                  aria-hidden="true"
                  className="mt-1.5 w-full min-w-0 text-left text-[12.5px] leading-relaxed text-ink-faint break-words"
                >
                  {glance}
                </span>
              )}

            </button>
          );
        })}
      </div>

      {/*
        The remainder, under the cards and attached to them: quieter than a mix's
        name, in the same type as the summary's own ways in, and absent when every
        film is filed somewhere.
      */}
      {other.length > 0 && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
          <button
            ref={remainder}
            type="button"
            aria-haspopup="dialog"
            // The control pressed, from the press itself. See `invoker`.
            onClick={(event) => {
              invoker.current = event.currentTarget;
              setOpen(OTHER);
            }}
            className={`${WAY_IN} hover:text-ink-soft`}
          >
            {other.length} other movies{" "}
            {/* Punctuation standing in for "opens these"; the words already say
                it, so a listener is not read a direction. */}
            <span aria-hidden="true">→</span>
          </button>
        </p>
      )}

      {/* Outside the stack, so that opening one cannot move the others. */}
      {open === OTHER ? (
        <Chosen title="Other movies" films={other} onClose={() => setOpen(null)} />
      ) : (
        open && (
          <Detail
            mix={open}
            films={filmsIn(open, movies)}
            onClose={() => setOpen(null)}
            // Closed because the mix is gone, which is not the same as closed.
            // See `removed`.
            onRemoved={() => {
              removed.current = true;
              setOpen(null);
            }}
          />
        )
      )}
    </>
  );
}

/**
 * One mix, in full: what it is called, what it means, what it is made of, and
 * what is in it.
 *
 * That order, and it is the order the mix was built in — a name for an idea, the
 * idea in the user's own words, the genres it combines, and then the films they
 * have kept under it. The films are the only part that can be changed from here,
 * through the same rows and the same marks as everywhere else.
 *
 * The genres are chips and nothing more. On the overview a genre's own label
 * opens its meaning; here a genre is context for the mix, and a control inside
 * a dialog that opened another dialog would be a maze.
 */
function Detail({
  mix,
  films,
  onClose,
  onRemoved,
}: {
  mix: Mix;
  films: readonly Movie[];
  onClose: () => void;
  /** Closed because the mix was deleted, which the stack answers differently. */
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
      aria-label={mix.name}
      // Escape is the browser's: it fires `cancel`, and taking the default would
      // let the element close itself while React still had it mounted. A mark's
      // menu inside here takes its own Escape first — see `movie-state.tsx`.
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
        {/* The name, and the one thing that can be done to the mix from here. */}
        <header className="flex items-start justify-between gap-4">
          <h2 className="min-w-0 font-display text-[24px] leading-tight break-words">{mix.name}</h2>
          <Manage kind="mix" name={mix.name} onRemoved={onRemoved} />
        </header>

        <p className="mt-4 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-soft">
          {mix.instruction}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          {mix.genres.map((genre) => (
            <Chip key={genre}>{genre}</Chip>
          ))}
        </div>

        {films.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-faint">No films in this mix yet.</p>
        ) : (
          <Films movies={films} className="mt-5" />
        )}

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
