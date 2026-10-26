"use client";

import { keeper, post } from "@/lib/web/stream-settings/browser";

/**
 * The Stream's one filter, *Include previously seen*, and the one thing it keeps.
 *
 * What a press shows is CSS alone (`app/globals.css`, by this box's id): the
 * films seen before are hidden or shown at once, and nothing waits on the
 * server. All this adds is telling the server the new answer, so the next visit,
 * in this browser or another, opens with the box as it was left — see
 * `lib/web/stream-settings/browser.ts` for how a press is sent and remembered.
 */

/** One per tab, outliving the Stream between visits to it, so Back opens as it was left. */
const box = keeper(post);

// Hidden is the last moment a page is sure to hear of, closing included.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") box.flush();
  });
}

export function IncludePreviouslySeen({ saved, readAt }: { saved: boolean; readAt: number }) {
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 px-1 text-[12px] text-ink-soft">
      <input
        // A new read is a new box: the Stream drawn again in place, from Home
        // while on it, keeps this element, and an element already drawn does
        // not hear a changed `defaultChecked`. The new one opens by `opening`,
        // so a press whose save has not landed is kept, not overwritten.
        key={readAt}
        id="include-previously-seen"
        type="checkbox"
        defaultChecked={box.opening(saved, readAt)}
        onChange={(event) => box.keep(event.currentTarget.checked)}
        className="size-3.5 cursor-pointer accent-ink-soft"
      />
      Include previously seen
    </label>
  );
}
