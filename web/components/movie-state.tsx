"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * The two marks on a film's row, as controls rather than as read-outs.
 *
 * The eye and the heart were a rendering of `watched` and `liked`; here they are
 * also the way to set them. Nothing else about a film can be changed on this
 * page — the row is a line of text and two marks, and it stays that.
 *
 * ## Two states on show, three states stored
 *
 * The model keeps three answers and always will: `null` is "Tonight was never
 * told" and `false` is "they said no", and no write anywhere turns the first into
 * the second by accident. What this page does is decline to *draw* the difference.
 * A mark is lit when the answer is yes and muted otherwise, so an unlit eye means
 * "not marked as watched" and covers both of the other two.
 *
 * That is a deliberate trade, and it is the right one here. A control has to say
 * what pressing it will do, and a three-way control that cycles yes → no → unsure
 * is a puzzle on a row that exists to be glanced at. So pressing sets the opposite
 * of yes: from unlit, watched; from lit, not watched. **A press always leaves an
 * explicit answer** — `true` or `false`, never `null` — because a press *is* the
 * user saying something. Getting back to "never told" means asking an assistant,
 * which is the surface where a film's other fields live too.
 *
 * ## One request, then the server's own answer
 *
 * No optimistic state. The mark renders the `watched` and `liked` it was given,
 * the write goes through the same route boundary and the same store every other
 * change does, and the page is re-rendered from the store afterwards. Holding a
 * local copy would mean two versions of one film — and an assistant writing
 * between the render and the click would leave the wrong one on screen with
 * nothing to correct it.
 */
export function MovieState({
  title,
  year,
  watched,
  liked,
}: {
  title: string;
  year: number;
  watched: boolean | null;
  liked: boolean | null;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  // Per row, not per page: two films are two independent writes on two rows, and
  // freezing the whole list because one mark is in flight would make a page of
  // twenty films feel broken. What this does stop is a second press on the mark
  // that is already mid-write.
  const busy = sending || refreshing;

  async function set(field: "watched" | "liked", to: boolean) {
    if (busy) return;
    setSending(true);
    setProblem(null);

    try {
      let response: Response;
      try {
        response = await fetch("/api/movies", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, year, [field]: to }),
        });
      } catch {
        // The request may never have left, or may have been answered and lost.
        // Both look like this from here, and only one of them changed nothing.
        setProblem("Could not reach Tonight. Reload to see where this film stands.");
        return;
      }

      const answer = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setProblem(answer?.message ?? "That could not be saved. Reload before trying again.");
        return;
      }

      // Wrapped in a transition so the controls stay disabled until the new
      // markup has arrived, rather than coming back to life over the old marks.
      startRefresh(() => router.refresh());
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <span className="flex shrink-0 items-center gap-1">
        <Toggle
          label={`Watched — ${title} (${year})`}
          on={watched === true}
          busy={busy}
          onPress={() => set("watched", watched !== true)}
        >
          <Eye />
        </Toggle>
        <Toggle
          label={`Liked — ${title} (${year})`}
          on={liked === true}
          busy={busy}
          onPress={() => set("liked", liked !== true)}
        >
          <Heart on={liked === true} />
        </Toggle>
      </span>

      {problem !== null && (
        <span role="alert" className="w-full text-[12px] leading-relaxed text-ink-faint">
          {problem}
        </span>
      )}
    </>
  );
}

/**
 * One mark, pressed or not.
 *
 * `aria-pressed` is the whole of the state for a listener, which is why there is
 * no `sr-only` sentence beside it: a toggle button already announces its name and
 * whether it is pressed, and a second reading of the same fact in other words
 * would be one to keep in step for nothing. The name carries the whole handle,
 * because a page of these read one after another is otherwise twenty buttons
 * called "Watched" — and a title alone would leave the two `Dune`s sounding
 * identical, which is the case the handle exists for.
 */
function Toggle({
  label,
  on,
  busy,
  onPress,
  children,
}: {
  label: string;
  on: boolean;
  busy: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={busy}
      aria-label={label}
      aria-pressed={on}
      className={[
        "flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors",
        "hover:bg-screen focus-visible:outline-2 focus-visible:outline-offset-2",
        "focus-visible:outline-beam disabled:cursor-default disabled:opacity-60",
        // Lit against muted, and the gap between them is wide enough to read at a
        // glance in one colour. `ink-faint` at half strength is present without
        // asking to be pressed; a mark nobody can see is not a quiet mark.
        on ? "text-ink" : "text-ink-faint/50 hover:text-ink-faint",
      ].join(" ")}
    >
      <span aria-hidden="true" className="flex">
        {children}
      </span>
    </button>
  );
}

function Eye() {
  return (
    <Icon>
      <path d="M1.2 8S3.8 3.6 8 3.6 14.8 8 14.8 8 12.2 12.4 8 12.4 1.2 8 1.2 8Z" />
      <circle cx="8" cy="8" r="1.9" />
    </Icon>
  );
}

/** Filled when it is a yes, outlined when it is not — the one glyph that can. */
function Heart({ on }: { on: boolean }) {
  return (
    <Icon>
      <path
        fill={on ? "currentColor" : "none"}
        d="M8 13.6C8 13.6 1.9 9.9 1.9 5.9A2.9 2.9 0 0 1 8 4.4a2.9 2.9 0 0 1 6.1 1.5c0 4-6.1 7.7-6.1 7.7Z"
      />
    </Icon>
  );
}

/**
 * The frame both marks are drawn in.
 *
 * Inline rather than from an icon set: two glyphs is less code than a dependency,
 * and they inherit `currentColor` so the lit and muted states are one class on
 * the button rather than two versions of a drawing.
 */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
