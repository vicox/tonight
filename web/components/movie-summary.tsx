"use client";

import { useEffect, useRef, useState } from "react";

import { Chosen, WAY_IN } from "./chosen";
import { Section } from "./section";
import type { Movie } from "@/lib/taste/model";
import {
  FACTS,
  OPINIONS,
  WITHOUT_STATUS,
  selected,
  sentence,
  spoken,
  type Selection,
} from "@/lib/web/movie-summary";
import { rescueTo, returnTo } from "@/lib/web/refocus";

/**
 * How many films there are, and — one press in — which ones.
 *
 * The films section of the page, and one of its three peers: the same `Section`
 * heading as the genres and the mixes, with the same count beside it — the number
 * of films there are, every one of them, including the ones nobody has said
 * anything about. The heading lives here rather than on the page because this is
 * what knows whether there is anything to count.
 *
 * Under it, a few lines of text over a page that files films by mix. The page
 * answers "what is in this mix"; these answer "how many have I loved", which the
 * page cannot, because the loved ones are spread across every mix on it. Pressing
 * one opens the films it counted, which is the only place on the website where a
 * film can be met outside the mix it happens to be in.
 *
 * ## One row, because the numbers account for every film once
 *
 * This was a row of five equal tiles, one per state, and `Seen` was an aggregate
 * of four of them — so the first thing anybody tried to do with the tiles, add
 * them up, gave an answer that was not the number in the heading.
 *
 * So the arrangement now says what is true:
 *
 *     Not seen 14 · Seen 38 · Liked 5 · ♥ Loved 3 · Disliked 2 · 4 without status
 *
 *     6 recently added →
 *
 * Six words that between them account for every film exactly once, set as one
 * wrapping line because that is what a list of parts is. `without status` is set
 * quieter than the five answers: it is what is *left over* rather than something
 * somebody said. And `Seen` — the one word that is ambiguous read out beside the
 * three opinions — carries its meaning for a listener.
 *
 * ## Set as text, not as instruments
 *
 * No surfaces, no borders around a number, no grid. The counts are set in the
 * page's own text sizes and the controls behave like the links they resemble,
 * because the job here is navigation: read the shape of the collection, then
 * press the part you want to look at. A tile made each number an exhibit; this
 * makes it a way in.
 *
 * It is still an overview and not a report: counts, no proportion of anything,
 * no arrow saying which way it went, and nothing about when a film was saved. A
 * line reading "+3 this week" would be a claim about the user's habits, and
 * Tonight is not keeping score.
 *
 * ## Zero is shown
 *
 * Every one of the five known-state controls is rendered at nought, because they
 * are the navigation and a navigation that rearranges itself is one nobody can
 * learn. `without status` is the exception and always was: it is absent when
 * there are none, since there is nothing to say and a "0" there would read as a
 * state that happens to be empty.
 *
 * ## A dialog the browser opens
 *
 * `<dialog>` with `showModal()`, as every dialog here does: the top layer, the
 * rest of the page inert, and Escape, all from the element. See `manage.tsx`
 * for the longer version of why none of that is written here.
 *
 * Focus on the way out is the exception, and it is `MovieSummary`'s rather than
 * `Chosen`'s: React unmounts a dialog in the same commit that closes it, so the
 * one place that can still be sure of putting focus somewhere is the one that is
 * still mounted afterwards.
 *
 * ## Nothing here holds a copy of a film
 *
 * The only state is which selection is open. Both the counts and the open list are
 * derived from the `movies` prop on every render, so a mark pressed inside the
 * dialog needs no adjustment here at all: `MovieState` writes through the same
 * route boundary it always does and asks for the page to be re-rendered, the
 * server's answer arrives as a new `movies`, and every count in the row and the
 * list under it are all recomputed from it. A film that no longer
 * belongs to the open selection leaves the list, because the list was never a
 * snapshot to leave it in.
 */
/**
 * The films saved this week, as the summary's seventh way in.
 *
 * Shaped like a selection so that one control and one dialog serve all seven,
 * and deliberately holding no states: what it stands for is not something
 * somebody said about a film but when the film arrived, and `selected` is never
 * asked about it — `recentlyAdded` answers instead. The empty `states` is what
 * makes that a shape rather than a promise.
 */
const RECENT: Selection = {
  key: "recent",
  states: [],
  label: "Recently added",
  phrase: "recently added",
};

export function MovieSummary({
  movies,
  recent,
}: {
  movies: readonly Movie[];
  /**
   * The films saved in the last week, newest first, as `recentlyAdded` chose
   * them. Handed in rather than worked out here: the page renders on the
   * server, and a client component asking the browser what time it is would
   * answer one thing during the render and another during hydration.
   */
  recent: readonly Movie[];
}) {
  const [open, setOpen] = useState<Selection | null>(null);
  /**
   * The films the open dialog shows, worked out on every render.
   *
   * Six of the seven are a set of states and one is this week's arrivals, so the
   * answer is derived here rather than in the dialog — and derived rather than
   * remembered, which is what keeps a mark pressed inside it from leaving a
   * stale list behind.
   */
  /**
   * The summary's own row, which is where focus goes when the control that
   * opened a dialog is not there to take it back.
   *
   * Its first button is `Not seen`, which is rendered whatever the collection
   * looks like — so the fallback is a control that exists rather than whichever
   * one happens to be first today.
   */
  const lines = useRef<HTMLParagraphElement>(null);
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
   *   or to the summary's first control if that one has gone in the meantime;
   * - what focus was handed back to has since been removed by a re-render, and
   *   nothing else has taken it, so it is on the document and belongs on the
   *   summary.
   *
   * No copy of a film anywhere in it: the two refs hold elements the user
   * pressed, and the decisions are two lines in `refocus.ts`.
   */
  useEffect(() => {
    const stable = lines.current?.querySelector<HTMLButtonElement>("button") ?? null;

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

  // Nothing to summarise yet, so no summary. Lines of zeros over an empty taste
  // model would read as a broken instrument rather than as an honest count — the
  // same reason the "Other movies" section is absent when there are none.
  if (!movies.length) return null;

  const quiet = selected(WITHOUT_STATUS, movies);

  /**
   * The one that is set quieter than the five.
   *
   * It is the same kind of control and it sits in the same line, but it is what
   * is *left over* — the films nothing has been said about at all — rather than
   * something somebody answered. The five are the answers.
   */
  const remainders = [WITHOUT_STATUS];

  /**
   * The seven ways in, in the order they are read.
   *
   * The two facts, the three opinions, then what is left over — the same order
   * the model lists them in, laid end to end because they are one line now.
   * `without status` is left out when there is none: nothing to say, and a zero
   * there would read as a state that happens to be empty.
   */
  const row = [...FACTS, ...OPINIONS, ...(quiet.length > 0 ? [WITHOUT_STATUS] : [])];

  return (
    <>
      <Section
        title="Your movies"
        note="Films you've saved, seen, or want to watch."
        count={movies.length}
      >
        {/*
          One line. Every way into the collection is a word and a number in the
          same type as the words beside it, because they are the same kind of
          thing: press any of them and the same dialog opens on the films it
          names. Setting one louder than another would be a claim about which
          answer matters, and the reader is the one who knows that.

          A separator is written before the control it precedes and inside the
          same box, so a line never breaks after a dot and leaves it hanging.
        */}
        <p
          ref={lines}
          // The type the five answers are set in, on the row, so none of them
          // carries one of its own — the two remainders step down from it, and
          // nothing else in here does.
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[15px] leading-relaxed text-ink"
        >
          {row.map((selection, index) => (
            <span key={selection.key} className="flex items-baseline gap-x-3">
              {index > 0 && <Separator />}
              <Count
                selection={selection}
                count={selected(selection, movies).length}
                // What was pressed, from the press itself. See `invoker`.
                onOpen={(event) => {
                  invoker.current = event.currentTarget;
                  setOpen(selection);
                }}
                className={
                  remainders.includes(selection)
                    ? "text-[12.5px] text-ink-faint hover:text-ink-soft"
                    : "hover:text-ink"
                }
                phrased={remainders.includes(selection)}
              />
            </span>
          ))}
        </p>

        {/*
          What just happened to the collection, as one line rather than a list of
          it — and quieter than the row above, which is the only place a
          difference in weight says anything: that row is the collection, this is
          a corner of it. Absent when nothing was saved this week.
        */}
        {recent.length > 0 && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
            <Count
              selection={RECENT}
              count={recent.length}
              onOpen={(event) => {
                invoker.current = event.currentTarget;
                setOpen(RECENT);
              }}
              className="hover:text-ink-soft"
              phrased
              // Punctuation standing in for "opens these"; the words already say
              // it, so a listener is not read a direction.
              after={<span aria-hidden="true">→</span>}
            />
          </p>
        )}
      </Section>

      {open && (
        <Chosen
          title={open.label}
          films={open === RECENT ? recent : selected(open, movies)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/** Between two counts on one line, and only for the eye. */
function Separator() {
  return (
    <span aria-hidden="true" className="text-ink-faint">
      ·
    </span>
  );
}

function Count({
  selection,
  count,
  onOpen,
  className,
  phrased = false,
  after,
}: {
  selection: Selection;
  count: number;
  onOpen: (event: React.MouseEvent<HTMLElement>) => void;
  className: string;
  /** Set as `4 without status` rather than as `Loved 3`. */
  phrased?: boolean;
  after?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={spoken(selection, count)}
      onClick={onOpen}
      className={[
        WAY_IN,
        className,
      ].join(" ")}
    >
      {phrased ? (
        sentence(selection, count)
      ) : (
        <>
          {selection.label} <span className="tabular-nums">{count}</span>
        </>
      )}
      {after}
    </button>
  );
}
