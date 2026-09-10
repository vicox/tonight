"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { HEADER_CONTROL } from "./way-out";
import { remove as ask } from "@/lib/web/manage";

/**
 * The one thing you can do to a genre or a mix from the website: delete it.
 *
 * Tonight is a conversation, and the taste model grows out of one — so the
 * website is a page you read, and naming a genre or composing a mix is said to
 * an assistant rather than typed into a form. Deleting is the exception, and it
 * is the exception for a reason that has nothing to do with convenience: a model
 * you cannot take something out of without asking an assistant to do it for you
 * is not quite yours.
 *
 * So it lives where the thing itself is. A genre's dialog is where you go to
 * find out what a genre means to you, and it is therefore where you find out you
 * do not mean it any more. There is no list of everything with a Delete beside
 * each row, because that list read as the real interface and made the page above
 * it look like a preview of it.
 *
 * ## Two presses, and the second one names what it is destroying
 *
 * A menu behind `…`, and `Delete` in the menu opens a question rather than doing
 * anything. Deleting a mix is the only act on this website that cannot be
 * undone by saying the opposite — the composition is gone, though its films are
 * not — so the last press is one somebody makes on purpose, against a sentence
 * that says the name back to them.
 *
 * ## The primitives are the ones already here
 *
 * The menu is `MovieState`'s: `aria-haspopup="menu"` on the trigger, `role="menu"`
 * on what it opens, focus moved into it, dismissed by a press anywhere else, and
 * Escape taken so that one press closes the menu and a second reaches the dialog
 * around it.
 *
 * The question is a `<dialog>` opened with `showModal()`, which is what every
 * dialog on this page is and the reason none of them writes out what a modal
 * needs. `showModal` puts the dialog in the top layer, makes everything behind
 * it inert so Tab cannot reach the page underneath, fires `cancel` for Escape,
 * and hands focus back to whatever was focused before when it closes. The
 * alternative was a focus trap, an `inert` attribute on the rest of the page and
 * a saved reference to the control that opened it — three things to keep
 * correct, all of them already correct in the browser. It is opened from inside
 * another modal dialog, which the top layer stacks: the question sits over the
 * detail, and Escape dismisses the question first.
 *
 * There is one menu item, so there is nowhere for an arrow key to go: the menu
 * opens with focus already on it, and Escape and Tab are the two ways out.
 *
 * ## What happens when it lands
 *
 * The write itself is `lib/web/manage.ts`, so that pressing the red button is
 * something a test can do without a browser. It goes to the same endpoint and
 * the same store rules an assistant's would, and nothing about deletion is
 * decided here — a genre that a mix is built from is the store's business to
 * refuse or allow, and this shows whatever it says.
 *
 * On success the page is re-rendered from the store and `onRemoved` closes the
 * detail dialog, which is describing something that no longer exists. `onRemoved`
 * rather than `onClose`, because the two are different questions for whoever has
 * to put focus somewhere afterwards: a dismissed dialog owes focus back to the
 * control that opened it, and a deleted one owes it somewhere else — that
 * control is on its last render. See `lib/web/refocus.ts`.
 */
export function Manage({
  kind,
  name,
  onRemoved,
}: {
  kind: "genre" | "mix";
  /** The name as the store holds it: what is shown, and what addresses the row. */
  name: string;
  /** Called once the deletion has landed, to close the dialog that described it. */
  onRemoved: () => void;
}) {
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  /** Whether a question has been asked, so its closing can be noticed below. */
  const asked = useRef(false);

  /**
   * Opening puts focus in the menu, which is what makes Escape a round trip
   * rather than a dead end.
   */
  useEffect(() => {
    if (!open) return;

    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();

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

  /**
   * Focus, once the question has gone.
   *
   * `showModal` hands focus back to whatever held it before — which here is the
   * menu item that opened the question, and that item was unmounted with the
   * menu. So the browser's restoration has nothing to restore to and focus falls
   * to `<body>`, which is a reader at the top of the page with no way back to
   * where they were. This runs after the question has actually closed, which is
   * why it is an effect and not a line inside the cancel handler.
   *
   * Skipped when the trigger has gone too. That is the successful delete: the
   * dialog this sits in closed with it, and the component that outlives that
   * dialog is the one that puts focus back. See `lib/web/refocus.ts`.
   */
  useEffect(() => {
    if (asking || !asked.current) return;
    asked.current = false;
    if (trigger.current && document.contains(trigger.current)) trigger.current.focus();
  }, [asking]);

  function close(toTrigger: boolean) {
    setOpen(false);
    if (toTrigger) trigger.current?.focus();
  }

  return (
    <>
      <div className="relative flex shrink-0 items-center">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`Manage ${name}`}
          onClick={() => setOpen((was) => !was)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown") return;
            setOpen(true);
            event.preventDefault();
          }}
          // The same square as the `×` beside it. See `way-out.tsx`.
          className={HEADER_CONTROL}
        >
          <MoreHorizontal aria-hidden="true" size={16} strokeWidth={1.5} />
        </button>

        {open && (
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={`Manage ${name}`}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                // The default action of this key is the browser's close request,
                // and this menu is inside a dialog. Without taking it, one press
                // would dismiss the menu *and* the dialog around it, which is two
                // things for one keystroke and the wrong one first.
                event.preventDefault();
                close(true);
                return;
              }
              // Not prevented: moving on is what Tab is for, and the menu closing
              // is this control tidying up after itself on the way out.
              if (event.key === "Tab") close(false);
            }}
            className="absolute top-full right-0 z-10 mt-1 flex min-w-40 flex-col rounded-lg border border-rule bg-screen py-1"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                asked.current = true;
                setAsking(true);
              }}
              className={[
                "flex cursor-pointer items-center px-3 py-1.5 text-left text-[13px]",
                "leading-none text-alarm transition-colors hover:bg-night",
                "focus-visible:bg-night focus-visible:outline-none",
              ].join(" ")}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {asking && (
        <Confirm
          kind={kind}
          name={name}
          onCancel={() => setAsking(false)}
          onRemoved={onRemoved}
        />
      )}
    </>
  );
}

/**
 * The question, and the only place the deletion is actually sent from.
 *
 * The name is in the heading rather than only in the sentence under it, because
 * this dialog opens over another one and somebody who pressed the wrong `…`
 * should be told so by the first line they read.
 *
 * Cancel changes nothing and is where focus starts, so the destructive answer is
 * never the one a stray Return reaches. Escape and a press outside are Cancel:
 * every way out of here that is not the red button leaves the model as it was.
 */
function Confirm({
  kind,
  name,
  onCancel,
  onRemoved,
}: {
  kind: "genre" | "mix";
  name: string;
  onCancel: () => void;
  onRemoved: () => void;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  // One delete at a time, and it covers the re-render as well as the request: a
  // second press while the page is still catching up would address a row that is
  // already gone.
  const busy = sending || refreshing;

  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;

    element.showModal();
    cancel.current?.focus();
    return () => element.close();
  }, []);

  async function remove() {
    if (busy) return;
    setSending(true);
    setProblem(null);

    try {
      const answer = await ask(kind, name);
      if (!answer.removed) {
        setProblem(answer.problem);
        return;
      }

      // Re-rendered from the store rather than from the answer's own copy of the
      // model: this page holds no snapshot, so the server's rendering is the only
      // update there is. Then the dialog that described this goes, because what
      // it described is gone.
      startRefresh(() => router.refresh());
      onRemoved();
    } finally {
      setSending(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-label={`Delete ${name}?`}
      // Escape is the browser's: it fires `cancel`, and taking the default would
      // let the element close itself while React still had it mounted.
      //
      // Stopped as well as prevented, and that is the part worth reading. This
      // dialog is rendered inside the detail dialog's own React tree, and React
      // carries `cancel` up that tree — so without this, one Escape would be
      // answered by the question *and* by the dialog behind it, which is two
      // things for one keystroke and the wrong one first. Natively only the
      // topmost dialog is asked, and this makes React agree.
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onCancel();
      }}
      // A press that lands on the dialog rather than on the card is a press
      // outside it, and the element itself is the surface around the card.
      onClick={(event) => {
        if (event.target === dialog.current && !busy) onCancel();
      }}
      className="m-0 h-dvh max-h-none w-dvw max-w-none overflow-y-auto bg-transparent px-5 py-[8vh] backdrop:bg-scrim"
    >
      <div className="mx-auto w-full max-w-md rounded-2xl border border-rule bg-screen p-6 text-ink">
        <h2 className="font-display text-[20px] leading-tight break-words">
          Delete {name}?
        </h2>

        <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
          {kind === "genre"
            ? "The genre and what it means to you are removed from your taste model. Your films stay where they are."
            : "The mix and what it means to you are removed from your taste model. The films in it stay in your collection."}
        </p>

        {problem !== null && (
          <p role="alert" className="mt-4 text-[12.5px] leading-relaxed break-words text-alarm">
            {problem}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            ref={cancel}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="cursor-pointer rounded-md border border-rule px-4 py-2 text-[13px] text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="cursor-pointer rounded-md border border-alarm-dim bg-alarm-dim/25 px-4 py-2 text-[13px] text-alarm transition-colors hover:border-alarm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alarm disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
