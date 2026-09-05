"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The one form the website writes the taste model through.
 *
 * Four operations use it — create a genre, edit a genre, create a mix, edit a mix
 * — because they are the same form with one field's difference, and three
 * near-identical dialogs would be three places for a rule about a name to be
 * written differently.
 *
 * It decides nothing. Whether a name is acceptable, whether an instruction may be
 * empty, whether a mix's genres exist: all of that is `lib/taste/model.ts` and the
 * store, reached through the write endpoints, and what comes back is what this
 * shows. There is no client-side copy of a domain rule here to disagree with the
 * server's — the only thing the form insists on is that the submit button does not
 * fire twice.
 */

export type Draft = {
  kind: "genre" | "mix";
  /** The name it is stored under, when editing. Absent when creating. */
  original?: string;
  name: string;
  instruction: string;
  /** Mix only: the genres it is built from. */
  genres: string[];
};

type Props = {
  draft: Draft;
  /** Every genre this user has, for a mix to be built from. */
  available: string[];
  /** Saves it. Resolves to an error message, or nothing when it worked. */
  onSave: (draft: Draft) => Promise<string | null>;
  onClose: () => void;
};

export function TasteEditor({ draft, available, onSave, onClose }: Props) {
  const [name, setName] = useState(draft.name);
  const [instruction, setInstruction] = useState(draft.instruction);
  const [genres, setGenres] = useState(draft.genres);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  /**
   * Opened as a real modal, and closed again when this unmounts.
   *
   * `showModal` is what a hand-written dialog has to reimplement and usually
   * only half does: it puts the dialog in the top layer, makes everything behind
   * it inert so Tab cannot reach the page underneath, and hands focus back to
   * whatever was focused before when it closes. The alternative here was a focus
   * trap, an `inert` attribute on the rest of the page and a saved reference to
   * the button that opened this — three things to keep correct, all of them
   * already correct in the browser.
   */
  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;

    // Where focus goes back to when this closes without saving. The browser
    // restores it on `close()`, and the saved reference is the belt to that pair
    // of braces: React may unmount this before the close event has been dealt
    // with, and a caller left with focus on `<body>` has lost their place.
    const opener = document.activeElement;
    element.showModal();

    return () => {
      element.close();

      // Not after a save. The control that opened this is disabled from the
      // moment the write leaves until the re-render lands, and a rename replaces
      // its row outright — so on that path the element here is either unfocusable
      // or no longer in the document, and the caller restores focus by name once
      // the write has settled. Trying anyway would do nothing except look like it
      // had been handled.
      if (!(opener instanceof HTMLElement)) return;
      if (!document.contains(opener) || opener.matches(":disabled")) return;
      opener.focus();
    };
  }, []);

  const editing = draft.original !== undefined;
  const title = `${editing ? "Edit" : "New"} ${draft.kind}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    // The server's own refusal, in the server's own words — the same sentence an
    // MCP client would be given, because it comes from the same place.
    const failure = await onSave({ ...draft, name, instruction, genres });
    if (failure) {
      setError(failure);
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-label={title}
      // Escape is the browser's, not ours: it fires `cancel`, and taking the
      // default lets the element close itself while React still believes it is
      // mounted. Refusing the default and going through `onClose` keeps the one
      // path out of here that the Cancel button uses.
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
      // The backdrop is part of the dialog, so a press on it arrives here rather
      // than on a scrim of our own. Anywhere inside the panel is not the backdrop.
      onClick={(event) => {
        if (event.target === dialog.current && !saving) onClose();
      }}
      className="m-0 max-h-none max-w-none bg-transparent p-0 backdrop:bg-scrim"
    >
      <div className="flex min-h-dvh w-dvw items-start justify-center overflow-y-auto px-5 py-[8vh]">
        <div className="w-full max-w-xl rounded-2xl border border-rule bg-screen p-8 text-ink">
          <h2 className="font-display text-[24px] leading-tight">{title}</h2>

          <form onSubmit={submit} className="mt-6">
            <Field label="Name">
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={draft.kind === "genre" ? "Sci-Fi" : "Space Tension"}
                className={INPUT}
              />
            </Field>

            {draft.kind === "mix" && (
              <Field label="Built from">
                {available.length === 0 ? (
                  <p className="text-[13px] text-ink-faint">
                    A mix combines genres, and there are none yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {available.map((genre) => {
                      const on = genres.includes(genre);
                      return (
                        <button
                          key={genre}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setGenres(
                              on ? genres.filter((one) => one !== genre) : [...genres, genre],
                            )
                          }
                          className={[
                            "cursor-pointer rounded-md border px-2.5 py-1 text-[11px] tracking-[0.09em] uppercase",
                            "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam",
                            on
                              ? "border-beam-dim bg-beam-dim/25 text-ink"
                              : "border-rule text-ink-faint hover:text-ink-soft",
                          ].join(" ")}
                        >
                          {genre}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Field>
            )}

            <Field
              label="What it means to you"
              hint={
                draft.kind === "genre"
                  ? "Required. What this genre means to you — including what it rules out."
                  : "The genres are the ingredients. This is what the combination means."
              }
            >
              <textarea
                rows={5}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={
                  draft.kind === "genre"
                    ? "I like tension and suspense, but not brutality…"
                    : "Tense science fiction where suspense is the point…"
                }
                className={`${INPUT} resize-y leading-relaxed`}
              />
            </Field>

            {error && (
              <p role="alert" className="mt-5 text-[13px] leading-snug text-beam">
                {error}
              </p>
            )}

            <div className="mt-7 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="cursor-pointer rounded-md bg-ink px-4 py-2 text-[13px] font-medium text-night transition-opacity disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              {/*
                Closed off while a save is in flight, for the same reason Escape
                and the backdrop are: there is one write happening and no way to
                call it back. Leaving this open was the one way out that still
                worked — it would unmount the dialog mid-request, so a refusal
                would arrive with nothing left to show it in, and focus would be
                handed to a control that stays disabled until the write settles.
              */}
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="cursor-pointer rounded-md border border-rule px-4 py-2 text-[13px] text-ink-soft transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </dialog>
  );
}

const INPUT =
  "w-full rounded-md border border-rule bg-night px-3 py-2 text-[14px] text-ink " +
  "placeholder:text-ink-faint focus:border-ink-faint focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-5 block first:mt-0">
      <span className="mb-2 block text-[11px] tracking-[0.13em] text-ink-faint uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-2 block text-[12px] text-ink-faint">{hint}</span>}
    </label>
  );
}
