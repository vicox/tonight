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
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div
      className="fixed inset-0 z-50 flex cursor-pointer items-start justify-center overflow-y-auto bg-scrim px-5 py-[8vh]"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-xl cursor-default rounded-2xl border border-rule bg-screen p-8 outline-none"
      >
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
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-rule px-4 py-2 text-[13px] text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
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
