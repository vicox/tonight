"use client";

import { Check, Circle, EyeOff, Heart, ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { type MovieState } from "@/lib/taste/model";
import { pending } from "@/lib/web/pending";

/**
 * What the user said about a film: one mark, and a menu to change it.
 *
 * The row shows a single icon — the state the film is in — and pressing it opens
 * the five states to choose from. One mark rather than five keeps a page of
 * twenty films readable, and it says the thing that matters at a glance: this
 * film is *loved*, not "loved and four other things it is not".
 *
 * ## Six things to draw, five things to choose
 *
 * The sixth is `null`: Tonight was never told. `Circle` is how that is drawn and
 * it is **not a sixth state** — nothing in the model, the store or the tools
 * knows about it, and the menu does not offer it. There is deliberately no way
 * back to `null` from here: a press is a statement, and unsaying one is a real
 * operation that stays with the assistant.
 *
 * `null` and `not_seen` stay distinct throughout — an empty circle against a
 * struck eye — because one is silence and the other is something they said.
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
 * No optimistic state. The mark renders the `state` it was given, the write goes
 * through the same route boundary and the same store every other change does, and
 * the page is re-rendered from the store afterwards. Holding a local copy would
 * mean two versions of one film — and an assistant writing between the render and
 * the press would leave the wrong one on screen with nothing to correct it.
 */

/** The five states, in the order somebody moves through them. */
const CHOICES: { state: MovieState; label: string; icon: typeof Check }[] = [
  { state: "not_seen", label: "Not seen", icon: EyeOff },
  { state: "seen", label: "Seen", icon: Check },
  { state: "liked", label: "Liked", icon: ThumbsUp },
  { state: "loved", label: "Loved", icon: Heart },
  { state: "disliked", label: "Disliked", icon: ThumbsDown },
];

/** How "nothing said" is drawn. Not a state — see the note above. */
const NOTHING_SAID = { label: "Nothing said", icon: Circle };

const shown = (state: MovieState | null) =>
  CHOICES.find((choice) => choice.state === state) ?? NOTHING_SAID;

export function MovieState({
  title,
  year,
  state,
}: {
  title: string;
  year: number;
  state: MovieState | null;
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
  const current = shown(state);

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

  async function set(to: MovieState) {
    if (busy) return;
    // Focus goes back before the write starts, and stays there: the re-render
    // marks the trigger pending with `aria-disabled`, which does not blur it.
    close(true);
    setSending(true);
    setProblem(null);

    try {
      let response: Response;
      try {
        response = await fetch("/api/movies", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, year, state: to }),
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
    if (event.key === "Escape" || event.key === "Tab") {
      close(event.key === "Escape");
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
          aria-label={`What you said about ${title} (${year}): ${current.label}`}
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
            "hover:bg-screen focus-visible:outline-2 focus-visible:outline-offset-2",
            "focus-visible:outline-beam aria-disabled:cursor-default aria-disabled:opacity-60",
            // Lit when they have said something, muted while they have not. A
            // mark nobody can see is a missing one, so muted is still present.
            state === null ? "text-ink-faint/50 hover:text-ink-faint" : "text-ink",
          ].join(" ")}
        >
          <current.icon
            aria-hidden="true"
            size={15}
            strokeWidth={1.5}
            fill={state === "loved" || state === "liked" ? "currentColor" : "none"}
          />
        </button>

        {open && (
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={`What you said about ${title} (${year})`}
            onKeyDown={steer}
            className="absolute top-full right-0 z-10 mt-1 flex min-w-40 flex-col rounded-lg border border-rule bg-screen py-1"
          >
            {CHOICES.map(({ state: choice, label, icon: Icon }) => (
              <button
                key={choice}
                type="button"
                role="menuitemradio"
                aria-checked={state === choice}
                onClick={() => set(choice)}
                className={[
                  "flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left",
                  "text-[13px] leading-none transition-colors hover:bg-night",
                  "focus-visible:bg-night focus-visible:outline-none",
                  state === choice ? "text-ink" : "text-ink-soft",
                ].join(" ")}
              >
                <Icon
                  aria-hidden="true"
                  size={14}
                  strokeWidth={1.5}
                  fill={
                    state === choice && (choice === "loved" || choice === "liked")
                      ? "currentColor"
                      : "none"
                  }
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
