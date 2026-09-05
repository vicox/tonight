"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { TasteEditor, type Draft } from "./taste-editor";
import { normalise, type Taste } from "@/lib/taste/model";

/**
 * The door for anybody who would rather do it by hand.
 *
 * Tonight is a conversation, and the taste model grows out of one — so the
 * website's default is a page you read. But the model belongs to the user, and a
 * model you cannot correct without asking an assistant to do it for you is not
 * quite yours. So management stays, collapsed, at the foot: not the way in, and
 * not taken away either.
 *
 * ## This is the only thing on the page that writes
 *
 * The view above is server-rendered and cannot change anything; every create,
 * rename and delete goes through here, through the same endpoints the store
 * enforces its rules in. A write that lands therefore leaves the server's
 * rendering of the same model stale — still showing `Sci-Fi` after the rename
 * went through — so it asks the router to re-render the page.
 *
 * ## One copy of the model, and it is the server's
 *
 * This section holds no snapshot of the taste model. It renders the `taste` prop
 * and nothing else, so `router.refresh()` is not a second update to keep in step
 * with a local one: it is the only update there is. Keeping a copy here would be
 * the bug rather than the optimisation — mounted client state survives a refresh,
 * so a model written from an MCP client would reach the quiet view above and
 * never reach this list, and the two would disagree until the page was reloaded.
 * The cost is that a change appears when the server answers rather than
 * instantly, which for a rename nobody is watching is not a cost.
 *
 * ## One write at a time
 *
 * `busy` covers the whole of a write, from the request leaving to the re-render
 * arriving, and every control that could start another is disabled for the
 * duration. Two deletes in flight together would race, and the loser's answer —
 * describing a model that is already one delete out of date — would be the one
 * left on screen. Serialising is the whole fix: there is no second response to
 * arrive late, because there is never a second request.
 *
 * ## Where focus goes when the editor closes
 *
 * Cancelling is the browser's business: `<dialog>` returns focus to whatever
 * opened it. Saving is not, and for two reasons that both come from the section
 * above. The control that opened the editor is disabled from the moment the
 * request leaves until the re-render lands, and a disabled control cannot take
 * focus; and a rename re-keys its row, so the button that was pressed is not
 * merely disabled but gone, replaced by one belonging to the new name.
 *
 * So restoration waits here rather than happening as the editor unmounts, and it
 * addresses the control by what it *is* — the add button for this kind, or the
 * edit button for a named object — instead of by the element it *was*. When the
 * write and its refresh are both done, the control under that name is focused,
 * whether or not it is the same node.
 */
export function TasteAdvanced({ taste }: { taste: Taste }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  const { genres, mixes } = taste;
  const names = genres.map((genre) => genre.name);
  const busy = sending || refreshing;

  /**
   * Where focus goes when the write has settled, and a nudge to go and put it
   * there.
   *
   * The key is a ref because nothing renders differently for holding it, and the
   * counter is state because the effect below has to run again when a save
   * completes — `busy` alone would be enough in practice and fragile in
   * principle, since it only works while a write is slow enough to be observed
   * as two renders.
   */
  const section = useRef<HTMLDetailsElement>(null);
  const returnTo = useRef<string | null>(null);
  const [saved, setSaved] = useState(0);

  // Once the write and its refresh are both done, the control is enabled again
  // and — after a rename — the one under the new name has been rendered. Both
  // become true at the same moment, which is why this waits for `busy` rather
  // than for the editor to unmount.
  useEffect(() => {
    if (busy) return;
    const key = returnTo.current;
    if (key === null) return;
    returnTo.current = null;

    // Found in the document rather than held as an element reference: after a
    // rename the button that was pressed no longer exists, and the right place
    // for focus is the one now standing where it stood. Compared rather than
    // selected, because a key carries a name the user chose and building a
    // selector out of one means reasoning about quotes and backslashes in it.
    const add = `add:${key.split(":")[1] ?? ""}`;
    let found: HTMLElement | undefined;
    let fallback: HTMLElement | undefined;

    for (const control of section.current?.querySelectorAll<HTMLElement>("[data-focus]") ?? []) {
      if (control.dataset.focus === key) {
        found = control;
        break;
      }
      // The add button of the same kind, for when the named one is not there —
      // the store settled on a name we did not predict. Somewhere in the right
      // section beats the top of the document.
      if (control.dataset.focus === add) fallback = control;
    }

    (found ?? fallback)?.focus();
  }, [busy, saved]);

  /**
   * Sends one write, and asks the server for the model it produced.
   *
   * The response body carries the new model, and this deliberately ignores it in
   * favour of re-rendering from the store. The two would nearly always agree —
   * but "nearly always" is the failure: an MCP client committing between the two
   * would leave this holding an older model than the page around it, with nothing
   * to correct it.
   *
   * Refused while another write is in flight, so a caller cannot start a second.
   */
  async function write(path: string, method: string, body: unknown): Promise<string | null> {
    if (busy) return null;
    setSending(true);
    try {
      let response: Response;
      try {
        response = await fetch(path, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
      } catch {
        // The request may never have left, or may have been answered and lost.
        // Both look like this from here, and only one of them changed nothing.
        return "Could not reach Tonight. Reload to see where your taste model stands.";
      }

      const answer = (await response.json().catch(() => null)) as
        | { taste?: Taste; message?: string }
        | null;

      if (!response.ok || !answer?.taste) {
        // The server's own sentence when it gave one: those are decisions it
        // reached before writing, and they are precise. The fallback is for a
        // reply that carried no reason, which tells us nothing about whether the
        // write landed.
        return (
          answer?.message ?? "Something went wrong. Reload to see where your taste model stands."
        );
      }

      settled();
      return null;
    } finally {
      setSending(false);
    }
  }

  /**
   * Something changed, so the page has to be re-rendered from the store.
   *
   * `router.refresh()` re-runs the Server Component and merges the result without
   * discarding client state, which is what keeps this section open and scrolled
   * where it was. Wrapped in a transition so `refreshing` stays true until the new
   * markup has actually arrived — otherwise the controls would come back to life
   * while the list they act on is still the old one.
   */
  function settled() {
    startRefresh(() => router.refresh());
  }

  async function save(next: Draft): Promise<string | null> {
    const kind = next.kind === "genre" ? "genres" : "mixes";
    const payload =
      next.kind === "genre"
        ? { name: next.name, instruction: next.instruction }
        : { name: next.name, instruction: next.instruction, genres: next.genres };

    const failure =
      next.original === undefined
        ? await write(`/api/${kind}`, "POST", payload)
        : await write(`/api/${kind}/${encodeURIComponent(next.original)}`, "PATCH", {
            ...payload,
            new_name: next.name,
            // `name` addresses the row; `new_name` renames it. Sending the new
            // name in both would ask the store to find a row that does not exist
            // yet.
            name: undefined,
          });

    if (!failure) {
      // Cancelling does not come through here, so the dialog keeps its own
      // restoration for that path and this only claims the one it cannot serve.
      returnTo.current = focusKeyFor(next);
      setSaved((count) => count + 1);
      setDraft(null);
    }
    return failure;
  }

  async function remove(kind: "genre" | "mix", name: string) {
    if (busy) return;
    const what = kind === "genre" ? "genres" : "mixes";
    setProblem(await write(`/api/${what}/${encodeURIComponent(name)}`, "DELETE", {}));
  }

  return (
    <details ref={section} className="group mt-4 rounded-2xl border border-rule bg-screen">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-6 py-4 text-[13px] text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-[11px] transition-transform group-open:rotate-90">
          ▸
        </span>
        Advanced
      </summary>

      <div className="border-t border-rule px-6 py-6">
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          Change the model by hand. Saying it to ChatGPT does the same thing, and neither is the
          proper way round.
        </p>

        {problem && (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-beam-dim bg-beam-dim/15 px-4 py-3 text-[13px] text-ink"
          >
            {problem}
          </p>
        )}

        <Section
          title="Genres"
          empty={genres.length === 0}
          action={
            <AddButton
              label="Add genre"
              focus="add:genre"
              disabled={busy}
              onClick={() => setDraft({ kind: "genre", name: "", instruction: "", genres: [] })}
            />
          }
        >
          {genres.map((genre) => (
            <Row
              key={genre.name}
              name={genre.name}
              focus={`edit:genre:${genre.name}`}
              busy={busy}
              onEdit={() =>
                setDraft({
                  kind: "genre",
                  original: genre.name,
                  name: genre.name,
                  instruction: genre.instruction,
                  genres: [],
                })
              }
              onDelete={() => remove("genre", genre.name)}
            />
          ))}
        </Section>

        <Section
          title="Mixes"
          empty={mixes.length === 0}
          action={
            <AddButton
              label="Add mix"
              focus="add:mix"
              disabled={busy || genres.length === 0}
              onClick={() => setDraft({ kind: "mix", name: "", instruction: "", genres: [] })}
            />
          }
        >
          {mixes.map((mix) => (
            <Row
              key={mix.name}
              name={mix.name}
              focus={`edit:mix:${mix.name}`}
              busy={busy}
              onEdit={() =>
                setDraft({
                  kind: "mix",
                  original: mix.name,
                  name: mix.name,
                  instruction: mix.instruction,
                  genres: [...mix.genres],
                })
              }
              onDelete={() => remove("mix", mix.name)}
            />
          ))}
        </Section>
      </div>

      {draft && (
        <TasteEditor
          draft={draft}
          available={names}
          onSave={save}
          onClose={() => setDraft(null)}
        />
      )}
    </details>
  );
}

/**
 * Which control the editor was opened from, as a key rather than an element.
 *
 * A create returns to the add button it came from. An edit returns to the row's
 * edit button — under the name the store will be holding once the write lands,
 * which for a rename is the new one. `normalise` is the same whitespace collapse
 * the store applies, used here to build a lookup key and not to decide whether
 * two names are the same: that question is the database's, and a key that misses
 * falls back rather than guessing.
 */
function focusKeyFor(draft: Draft): string {
  return draft.original === undefined
    ? `add:${draft.kind}`
    : `edit:${draft.kind}:${normalise(draft.name)}`;
}

/**
 * Genres or mixes, as a list to act on.
 *
 * Names only, and deliberately: the reading of the model is the page above, and
 * repeating the instructions here would make this a second place to read it
 * rather than a place to change it.
 */
function Section({
  title,
  action,
  empty,
  children,
}: {
  title: string;
  action: React.ReactNode;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="text-[12px] tracking-[0.11em] text-ink-faint uppercase">{title}</h3>
        {action}
      </header>
      {empty ? (
        <p className="mt-3 text-[12.5px] text-ink-faint">None yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-rule border-t border-rule">{children}</ul>
      )}
    </section>
  );
}

function Row({
  name,
  busy,
  focus,
  onEdit,
  onDelete,
}: {
  name: string;
  busy: boolean;
  /** So focus can find its way back here after a save, including after a rename. */
  focus: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <span className="min-w-0 truncate text-[13px] text-ink">{name}</span>
      <span className="flex shrink-0 gap-1">
        <RowAction focus={focus} disabled={busy} onClick={onEdit}>
          Edit
        </RowAction>
        <RowAction disabled={busy} onClick={onDelete}>
          Delete
        </RowAction>
      </span>
    </li>
  );
}

function RowAction({
  disabled,
  onClick,
  children,
  focus,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** Names this control so focus can be returned to it. */
  focus?: string;
}) {
  return (
    <button
      data-focus={focus}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-md px-2 py-1 text-[12px] text-ink-faint transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam"
    >
      {children}
    </button>
  );
}

function AddButton({
  label,
  disabled = false,
  onClick,
  focus,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  /** Names this control so focus can be returned to it. */
  focus?: string;
}) {
  return (
    <button
      data-focus={focus}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-md border border-rule px-3 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-ink-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}
