"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Puts a piece of text on the clipboard, says it did, and has an answer for when
 * it could not.
 *
 * The setup steps hand people two things to paste — the MCP endpoint and the
 * project instructions — and the second is long enough that selecting it by hand
 * is the step somebody gives up on. So the text is not shown as something to
 * highlight: the button is the whole interaction, right up until it fails.
 *
 * When it does fail, the text appears in a box that is focused and selected, and
 * the reader is told to copy it. That is the difference between a fallback and a
 * dead end: telling somebody to press a keyboard shortcut without first selecting
 * anything asks them to copy the empty selection they already had — and names a
 * key that half of them do not have.
 *
 * It knows nothing about what it is copying. Whatever the project instructions
 * turn out to be, this component does not change.
 */

type Props = {
  /** What lands on the clipboard. */
  text: string;
  children: React.ReactNode;
  /** `primary` for the one button a page is built around. */
  tone?: "primary" | "quiet";
  /** Said instead of the label for a moment after a successful copy. */
  copied?: string;
};

/** How long the confirmation stays up. Long enough to read, short enough to trust. */
const CONFIRMATION_MS = 2000;

export function CopyButton({ text, children, tone = "quiet", copied = "Copied" }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fallback = useRef<HTMLTextAreaElement>(null);
  const describedBy = useId();

  // A copy that resolves after the component has gone would otherwise set state
  // on nothing, and a second click while the first confirmation is up would let
  // the older timer clear the newer one.
  useEffect(() => () => clearTimeout(timer.current), []);

  // Selected as well as shown. The instruction to copy is only true once there is
  // something selected to copy, and doing it here rather than at render time
  // means it also happens when somebody presses the button a second time.
  useEffect(() => {
    if (state !== "failed") return;
    const box = fallback.current;
    if (!box) return;
    box.focus();
    box.select();
  }, [state]);

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      timer.current = setTimeout(() => setState("idle"), CONFIRMATION_MS);
    } catch {
      // Denied permission, an insecure origin, a browser policy, or no API at
      // all. The box below is the answer to every one of them, and it stays up
      // until the reader is done with it rather than timing out underneath them.
      setState("failed");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-describedby={state === "failed" ? describedBy : undefined}
        // Announced rather than only shown, because the button's own label is what
        // changes and a screen reader would otherwise pass over it in silence.
        aria-live="polite"
        className={[
          "cursor-pointer rounded-md px-4 py-2.5 text-[13px] font-medium transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam",
          tone === "primary"
            ? "bg-beam text-night hover:bg-beam/90"
            : "border border-rule bg-screen text-ink hover:border-ink-faint",
        ].join(" ")}
      >
        {state === "copied" ? copied : children}
      </button>

      {state === "failed" && (
        <div className="w-full basis-full">
          <p id={describedBy} className="text-[12.5px] leading-relaxed text-ink-soft">
            Your browser would not let Tonight use the clipboard. The text is below, selected —
            copy it from there.
          </p>
          <textarea
            ref={fallback}
            readOnly
            value={text}
            rows={text.length > 200 ? 8 : 2}
            aria-label="The text to copy"
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full resize-y rounded-md border border-rule bg-night px-3 py-2 font-mono text-[12px] leading-relaxed text-ink focus:border-ink-faint focus:outline-none"
          />
        </div>
      )}
    </>
  );
}
