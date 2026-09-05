"use client";

import { useEffect, useRef, useState } from "react";

import { WORKED_EXAMPLES, type WorkedExample } from "@/lib/worked-examples";

/**
 * Six evenings, one at a time, browsable.
 *
 * The thing a stranger has to understand is not that Tonight remembers a
 * preference — one example says that — but that a Mix is a reusable name for a
 * *kind of night*, and that somebody has several. `Quiet Dread` and
 * `Popcorn Chaos` are different Fridays for the same person. That is an argument
 * made by seeing two or three of them, so the page moves through them slowly and
 * lets anybody take over.
 *
 * ## Calm rather than a carousel
 *
 * It advances every eight seconds and stops the moment anybody is near it —
 * pointer over it, focus inside it, a finger down on it, or the tab in the
 * background. Nothing slides: the examples are stacked in one grid cell and
 * cross-faded, which is also what keeps the height from jumping, because the box
 * is always as tall as the longest of the six. Under `prefers-reduced-motion` it
 * does not advance on its own at all — the controls are the whole interface then,
 * and they are the whole interface for a keyboard anyway.
 *
 * ## No dependency, and not much code
 *
 * A carousel library would bring virtualisation, infinite loops and a plugin API
 * for a list of six that never changes. What this needs is an index, a timer, and
 * the sense to stop it.
 */

/** Slow enough to read the whole example without hurrying. */
const ADVANCE_MS = 8000;

/** How far a finger travels before it counts as a swipe rather than a tap. */
const SWIPE_PX = 40;

export function WorkedExamples({
  examples = WORKED_EXAMPLES,
}: {
  examples?: readonly WorkedExample[];
}) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const swipeFrom = useRef<number | null>(null);

  const count = examples.length;
  const go = (to: number) => setIndex(((to % count) + count) % count);

  /**
   * Advances, unless somebody is here.
   *
   * Keyed on the index as well, so any manual move restarts the eight seconds
   * rather than leaving a half-spent timer to yank the page a moment later.
   */
  useEffect(() => {
    if (held || count < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer = window.setTimeout(next, ADVANCE_MS);

    // A tab nobody is looking at should not be advancing, and should not come
    // back mid-fade either.
    function onVisibility() {
      window.clearTimeout(timer);
      if (!document.hidden) timer = window.setTimeout(next, ADVANCE_MS);
    }
    function next() {
      setIndex((current) => (current + 1) % count);
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [index, held, count]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight") go(index + 1);
    else if (event.key === "ArrowLeft") go(index - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(count - 1);
    else return;
    event.preventDefault();
  }

  return (
    <section
      // Announced as what it is, so somebody arriving by keyboard is told there
      // is more here than the one example they can see.
      aria-roledescription="carousel"
      aria-label="Example evenings"
      onKeyDown={onKeyDown}
      onPointerEnter={(event) => event.pointerType === "mouse" && setHeld(true)}
      onPointerLeave={(event) => event.pointerType === "mouse" && setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        swipeFrom.current = event.clientX;
        setHeld(true);
      }}
      onPointerUp={(event) => {
        const from = swipeFrom.current;
        swipeFrom.current = null;
        setHeld(false);
        if (from === null) return;
        const travelled = event.clientX - from;
        if (Math.abs(travelled) >= SWIPE_PX) go(index + (travelled < 0 ? 1 : -1));
      }}
      onPointerCancel={() => {
        swipeFrom.current = null;
        setHeld(false);
      }}
      className="mt-12 rounded-2xl border border-rule bg-screen p-6 sm:p-8"
    >
      {/*
        All six occupy the same grid cell, so the box is as tall as the longest of
        them and never resizes as they change. `aria-live` speaks only while
        somebody is steering: an announcement every eight seconds unprompted is
        not information, it is interruption.
      */}
      <div className="grid" aria-live={held ? "polite" : "off"}>
        {examples.map((example, position) => (
          <div
            key={example.mix}
            role="group"
            aria-roledescription="slide"
            aria-label={`${position + 1} of ${count}: ${example.mix}`}
            aria-hidden={position !== index}
            inert={position !== index}
            style={{ gridArea: "1 / 1" }}
            className={[
              // Two pixels of travel and half a second. Enough that the eye
              // registers an arrival rather than a dissolve, far too little to
              // be called an animation. Reduced motion drops it entirely.
              "transition-all duration-500 ease-out motion-reduce:transition-none",
              position === index
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-0.5 opacity-0",
            ].join(" ")}
          >
            <Example example={example} />
          </div>
        ))}
      </div>

      <Controls index={index} examples={examples} go={go} />

      {/*
        Outside the fading part, because it is the same sentence on all six. Held
        inside a card that changes, an invariant reads as content and gets
        re-read every eight seconds; held still underneath them, it reads as what
        it is — the standing promise the six examples are evidence for.
      */}
      <p className="mt-6 text-[12.5px] leading-relaxed text-ink-faint">
        Tonight keeps what you said, never what it worked out about you. Nothing is saved unless
        you say so.
      </p>
    </section>
  );
}

/** One evening, from the request to the name it left behind. */
function Example({ example }: { example: WorkedExample }) {
  return (
    <>
      <dl className="flex flex-col gap-3 text-[13.5px] leading-relaxed">
        <Turn who="You">{example.prompt}</Turn>
        <Turn who="ChatGPT">
          {/*
            A step up from everything around it. The films are what the product
            actually did, and at the dialogue's own size they weighed the same as
            the word "yes" — the eye had no reason to stop on the answer.
          */}
          <span className="block text-[15px] leading-snug">{list(example.films)}</span>
          <span className="mt-1.5 block text-ink-soft">
            Want me to remember the kind of thing this is?
          </span>
        </Turn>
        <Turn who="You">yes</Turn>
        <Turn who="Tonight" lit>
          <span className="block">
            <span className="sr-only">
              Saved {example.genres.length} genres, {spoken(example.genres)}, and the mix they
              make together: {example.mix}.
            </span>
            <span aria-hidden="true" className="block">
              <span className="flex flex-wrap items-center gap-1.5">
                {example.genres.map((genre, position) => (
                  <span key={genre} className="flex items-center gap-1.5">
                    {position > 0 && <span className="text-[12px] text-ink-faint">+</span>}
                    <Chip>{genre}</Chip>
                  </span>
                ))}
              </span>
              <span className="mt-2.5 block text-[13px] leading-none text-beam">↓</span>
              {/*
                The anchor. Everything above is the working; this is the thing
                worth keeping, and it is the only line on the card set at a size
                that says so.
              */}
              {/*
                Centred rather than baselined: emoji sit on the baseline
                differently on every platform, so aligning to it makes the mark
                look dropped on one machine and floating on the next.
              */}
              <span className="mt-2.5 flex items-center gap-3">
                <span className="text-[24px] leading-none sm:text-[27px]">{example.mark}</span>
                <span className="font-display text-[26px] leading-tight text-ink sm:text-[30px]">
                  {example.mix}
                </span>
              </span>
            </span>
          </span>
        </Turn>
      </dl>

      {/*
        No rule above this. It is the last line of the same thought, not a
        footnote to it, and a second horizontal line two lines above the controls
        made the card look like a form.
      */}
      <p className="mt-6 text-[12.5px] leading-relaxed text-ink-faint">
        <span className="text-ink-soft">Next Friday the whole request is</span> “something like{" "}
        {example.mix}, {example.followUp}” <span className="text-ink-soft">— and it knows.</span>
      </p>
    </>
  );
}

/**
 * Where you are, and how to move.
 *
 * The marks are buttons rather than decoration, because six of them is the one
 * honest way to say how many evenings there are — and somebody who wants the
 * fifth should not have to press Next four times to reach it.
 */
function Controls({
  index,
  examples,
  go,
}: {
  index: number;
  examples: readonly WorkedExample[];
  go: (to: number) => void;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-4 border-t border-rule pt-4">
      <div className="flex items-center gap-1.5">
        {examples.map((example, position) => (
          <button
            key={example.mix}
            type="button"
            onClick={() => go(position)}
            aria-label={example.mix}
            aria-current={position === index ? "true" : undefined}
            className={[
              "group cursor-pointer rounded-full",
              "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-beam",
              // The tap target is comfortable; the mark inside it is small.
              "flex size-6 items-center justify-center",
            ].join(" ")}
          >
            {/*
              `rule` on `screen` is about 1.3:1 — a dot nobody can see is not a
              quiet dot, it is a missing one. `ink-faint` at half strength is
              quiet and present. The current one widens into a short bar rather
              than only changing colour, so where you are survives being read at
              a glance, or in one colour.
            */}
            <span
              className={[
                "h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none",
                position === index
                  ? "w-4 bg-beam"
                  : "w-1.5 bg-ink-faint/50 group-hover:bg-ink-faint",
              ].join(" ")}
            />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <Step label="Previous example" onClick={() => go(index - 1)}>
          ‹
        </Step>
        <Step label="Next example" onClick={() => go(index + 1)}>
          ›
        </Step>
      </div>
    </div>
  );
}

function Step({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-8 cursor-pointer items-center justify-center rounded-md text-[15px] text-ink-faint transition-colors hover:bg-night hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

function Turn({
  who,
  lit = false,
  children,
}: {
  who: string;
  lit?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
      <dt className={`shrink-0 sm:w-20 ${lit ? "text-beam" : "text-ink-faint"}`}>{who}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

/** A genre's name, in film-credit typography. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-rule px-2.5 py-1 text-[11px] tracking-[0.11em] text-ink-soft uppercase">
      {children}
    </span>
  );
}

/** "Bullet Train, Game Night, or The Fall Guy" — an offer, so `or`. */
function list(films: readonly string[]): string {
  if (films.length <= 1) return films[0] ?? "";
  return `${films.slice(0, -1).join(", ")}, or ${films[films.length - 1]}`;
}

/** The same, said rather than offered. */
function spoken(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
