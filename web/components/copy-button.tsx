"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Puts a piece of text on the clipboard and says it did.
 *
 * The setup steps hand people two things to paste — the MCP endpoint and the
 * project instructions — and the second is long enough that selecting it by hand
 * is the step somebody gives up on. So the text is never shown as something to
 * highlight; the button is the whole interaction.
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

  // A copy that resolves after the component has gone would otherwise set state
  // on nothing, and a second click while the first confirmation is up would let
  // the older timer clear the newer one.
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      // Denied permission, an insecure origin, or a browser without the API.
      // Saying so is the only useful answer: there is nothing to fall back to
      // that does not involve asking somebody to select the text by hand.
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), CONFIRMATION_MS);
  }

  return (
    <button
      type="button"
      onClick={copy}
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
      {state === "copied" ? copied : state === "failed" ? "Press ⌘C instead" : children}
    </button>
  );
}
