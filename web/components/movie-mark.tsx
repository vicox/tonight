"use client";

import { Circle, Eye, EyeOff, Heart, MessageCircleOff, ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import type { Viewing } from "@/lib/taste/model";
import type { Judgement } from "@/lib/verdicts/model";
import { pending } from "@/lib/web/pending";

/**
 * One thing the user has said about a film: a mark, and a menu to change it.
 *
 * Two of these sit on a row and they say different kinds of thing. The first is
 * a **fact** — have they watched it — and writes the film. The second is an
 * **opinion** — what did they make of it — and writes a verdict. They are drawn
 * alike because they are both "what you said", and they are separate controls
 * because they are separate answers: a film can be seen and loved at once, and a
 * single menu offering both would make the user choose which of two true things
 * to record.
 *
 * ## One component, two marks
 *
 * The menu below is the whole of the keyboard, focus and dismissal behaviour,
 * and none of it differs between the two. So it is written once and given its
 * choices, its wording and the route it writes to. What each mark *means* lives
 * in `VIEWING` and `JUDGEMENT` at the bottom of this file, where a reader can
 * see both vocabularies side by side.
 *
 * ## What "nothing said" is on each
 *
 * On the viewing mark it is drawn and cannot be chosen: a press is a statement,
 * and unsaying one is a real operation that stays with the assistant. On the
 * judgement mark it *is* choosable, because taking back what you said about a
 * film is an ordinary thing to want and the verdict model has a word for it —
 * a withdrawal, which leaves silence rather than a neutral opinion.
 *
 * ## A menu, so the keyboard is a menu's
 *
 * `aria-haspopup="menu"` on the trigger and `role="menu"` on what it opens, with
 * `role="menuitemradio"` on each choice: they are one answer out of a set, and
 * that role is how a menu says so. Arrow keys move focus without choosing —
 * choosing is Enter, Space or a click — so walking the list never fires a write.
 * Escape closes and hands focus back, which is the part a popover most often
 * gets wrong.
 *
 * ## Pending without losing the keyboard
 *
 * The trigger is never `disabled` while a write is in flight. A browser takes
 * focus off a disabled element, so disabling the trigger a moment after handing
 * focus back to it would undo exactly what closing the menu just did. It carries
 * `aria-disabled` instead — see `lib/web/pending.ts` — and the guard against a
 * second write is in the handlers.
 *
 * ## One request, then the server's own answer
 *
 * No optimistic state. The mark renders the value it was given, the write goes
 * through the same route boundary and the same store every other change does,
 * and the page is re-rendered from the store afterwards. Holding a local copy
 * would mean two versions of one film — and an assistant writing between the
 * render and the press would leave the wrong one on screen with nothing to
 * correct it.
 *
 * A press that repeats what already stands is sent and answered, and the route
 * writes nothing: confirming what you can see is not a new thing said, and a
 * verdict history full of clicks would be read back as things the user told
 * Tonight.
 */

/** One answer a mark offers, and how it is drawn. */
type Choice<T> = { value: T; label: string; icon: typeof Eye; filled?: boolean };

/** What a mark is: its answers, its words, and where a press goes. */
type Mark<T> = {
  /** The answers the menu offers, in the order it offers them. */
  choices: readonly Choice<T>[];
  /** How the unset value is drawn. Choosable only if it is also in `choices`. */
  unset: { label: string; icon: typeof Eye };
  /** What this mark is asking, for the trigger's label and the menu's. */
  asks: string;
  /** The route a press writes to, and the field it sends. */
  endpoint: string;
  field: string;
};

/**
 * Whether they watched it.
 *
 * Two answers and no third: the same eye, struck through and not, which is one
 * question with two answers. `null` is drawn — an empty circle — and is not in
 * `choices`, so there is no way back to "never told" from here.
 */
export const VIEWING: Mark<Viewing> = {
  choices: [
    { value: "unseen", label: "Not seen", icon: EyeOff },
    { value: "seen", label: "Seen", icon: Eye },
  ],
  unset: { label: "Not said", icon: Circle },
  asks: "Whether you have seen",
  endpoint: "/api/movies",
  field: "viewing",
};

/**
 * What they made of it.
 *
 * The three judgements in the order the summary reads them — liked, loved, then
 * the one nobody reaches for — and then taking it back, which is a real answer
 * here and is why `null` appears in `choices` on this mark and not on the other.
 */
export const JUDGEMENT: Mark<Judgement | null> = {
  choices: [
    { value: "liked", label: "Liked", icon: ThumbsUp, filled: true },
    { value: "loved", label: "Loved", icon: Heart, filled: true },
    { value: "disliked", label: "Disliked", icon: ThumbsDown },
    { value: null, label: "Nothing said", icon: MessageCircleOff },
  ],
  unset: { label: "Nothing said", icon: Circle },
  asks: "What you said about",
  endpoint: "/api/verdicts",
  field: "judgement",
};

export function MovieMark<T>({
  mark,
  value,
  title,
  year,
}: {
  mark: Mark<T>;
  value: T | null;
  title: string;
  year: number;
}) {
  const router = useRouter();
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  // Per row, not per page: two films are two independent writes on two rows, and
  // freezing the whole list because one is in flight would make a page of twenty
  // films feel broken. What this does stop is a second press mid-write.
  const busy = sending || refreshing;
  const chosen = mark.choices.find((choice) => choice.value === value);
  const current = chosen ?? mark.unset;
  const said = value !== null;

  /**
   * Opening puts focus on the current choice, which is where somebody arrived
   * expecting to be — and it is what makes Escape a round trip rather than a
   * dead end.
   */
  useEffect(() => {
    if (!open) return;

    const items = menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    const checked = menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    (checked ?? items?.[0])?.focus();

    // A menu is dismissed by anything that is not it. Pointer down rather than
    // click, so a press that starts outside does not also land on what is under
    // the menu once it has gone.
    function elsewhere(event: PointerEvent) {
      const target = event.target as Node;
      if (menu.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", elsewhere);
    return () => document.removeEventListener("pointerdown", elsewhere);
  }, [open]);

  function close(toTrigger: boolean) {
    setOpen(false);
    if (toTrigger) trigger.current?.focus();
  }

  async function set(to: T) {
    if (busy) return;
    // Focus goes back before the write starts, and stays there: the re-render
    // marks the trigger pending with `aria-disabled`, which does not blur it.
    close(true);
    setSending(true);
    setProblem(null);

    try {
      let response: Response;
      try {
        response = await fetch(mark.endpoint, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, year, [mark.field]: to }),
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

      // Wrapped in a transition so the control stays disabled until the new
      // markup has arrived, rather than coming back to life over the old mark.
      startRefresh(() => router.refresh());
    } finally {
      setSending(false);
    }
  }

  /** Arrow, Home and End move focus. Choosing is Enter, Space or a click. */
  function steer(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      // The default action of this key is the browser's close request, and a row
      // can be inside a dialog — the summary opens one full of them. Without
      // taking the default, one press would dismiss this menu *and* the dialog
      // around it, which is two things for one keystroke and the wrong one
      // first. So Escape closes the menu and stops there; a second press, with
      // no menu open to take it, reaches the dialog.
      event.preventDefault();
      close(true);
      return;
    }

    if (event.key === "Tab") {
      // Not prevented: moving on is what Tab is for, and the menu closing is
      // this control tidying up after itself on the way out.
      close(false);
      return;
    }

    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;

    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const here = items.indexOf(document.activeElement as HTMLButtonElement);
    if (here < 0) return;

    const to =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (here + 1) % items.length
            : (here - 1 + items.length) % items.length;

    items[to]?.focus();
    event.preventDefault();
  }

  return (
    <>
      <span className="relative flex shrink-0 items-center">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`${mark.asks} ${title} (${year}): ${current.label}`}
          {...pending(busy)}
          onClick={() => {
            if (busy) return;
            setOpen((was) => !was);
          }}
          onKeyDown={(event) => {
            if (busy || event.key !== "ArrowDown") return;
            setOpen(true);
            event.preventDefault();
          }}
          className={[
            "flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors",
            // A wash rather than a named surface: a row is read on the page, on a
            // vibe's card and in the summary's dialog, and `screen` — which the
            // last two are — is a hover nobody can see on two of the three.
            "hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2",
            "focus-visible:outline-beam aria-disabled:cursor-default aria-disabled:opacity-60",
            // Lit when they have said something, muted while they have not. A
            // mark nobody can see is a missing one, so muted is still present.
            said ? "text-ink" : "text-ink-faint/50 hover:text-ink-faint",
          ].join(" ")}
        >
          <current.icon
            aria-hidden="true"
            size={15}
            strokeWidth={1.5}
            fill={chosen?.filled === true ? "currentColor" : "none"}
          />
        </button>

        {open && (
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={`${mark.asks} ${title} (${year})`}
            onKeyDown={steer}
            className="absolute top-full right-0 z-10 mt-1 flex min-w-40 flex-col rounded-lg border border-rule bg-screen py-1"
          >
            {mark.choices.map(({ value: choice, label, icon: Icon, filled }) => (
              <button
                key={label}
                type="button"
                role="menuitemradio"
                aria-checked={value === choice}
                onClick={() => set(choice)}
                className={[
                  "flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left",
                  "text-[13px] leading-none transition-colors hover:bg-night",
                  "focus-visible:bg-night focus-visible:outline-none",
                  value === choice ? "text-ink" : "text-ink-soft",
                ].join(" ")}
              >
                <Icon
                  aria-hidden="true"
                  size={14}
                  strokeWidth={1.5}
                  fill={value === choice && filled === true ? "currentColor" : "none"}
                />
                {label}
              </button>
            ))}
          </div>
        )}
      </span>

      {problem !== null && (
        <span role="alert" className="w-full text-[12px] leading-relaxed text-ink-faint">
          {problem}
        </span>
      )}
    </>
  );
}
