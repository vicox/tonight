"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { TasteEditor, type Draft } from "./taste-editor";
import type { Genre, Mix, Taste } from "@/lib/taste/model";

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
 * enforces its rules in. That leaves one problem, which `settled` solves: a
 * successful write here would otherwise leave the server's rendering of the same
 * model stale, still showing `Sci-Fi` after the rename went through. So a write
 * that lands asks the router to re-render the page. The two renderings can be
 * briefly out of step; they cannot disagree, because they read one store.
 */
export function TasteAdvanced({ taste }: { taste: Taste }) {
  const router = useRouter();
  const [genres, setGenres] = useState<Genre[]>(taste.genres);
  const [mixes, setMixes] = useState<Mix[]>(taste.mixes);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const names = genres.map((genre) => genre.name);

  /**
   * Sends one write and replaces the whole model with what came back.
   *
   * The response carries the model as the store now holds it, so a rename that
   * rewrote three mixes shows all three moving without this having to work out
   * which. It also means this can never drift from the database by applying an
   * optimistic guess that the domain then refused.
   */
  async function write(path: string, method: string, body: unknown): Promise<string | null> {
    let response: Response;
    try {
      response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
    } catch {
      // The request may never have left, or may have been answered and lost. Both
      // look like this from here, and only one of them changed nothing.
      return "Could not reach Tonight. Reload to see where your taste model stands.";
    }

    const answer = (await response.json().catch(() => null)) as
      | { taste?: Taste; message?: string }
      | null;

    if (!response.ok || !answer?.taste) {
      // The server's own sentence when it gave one: those are decisions it reached
      // before writing, and they are precise. The fallback is for a reply that
      // carried no reason, which tells us nothing about whether the write landed.
      return (
        answer?.message ?? "Something went wrong. Reload to see where your taste model stands."
      );
    }

    setGenres(answer.taste.genres);
    setMixes(answer.taste.mixes);
    settled();
    return null;
  }

  /**
   * Something changed, so the read view above has to be told.
   *
   * `router.refresh()` re-runs the Server Component and merges the result without
   * discarding client state, which is what keeps this section open and scrolled
   * where it was while the quiet list above catches up.
   */
  function settled() {
    router.refresh();
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

    if (!failure) setDraft(null);
    return failure;
  }

  async function remove(kind: "genre" | "mix", name: string) {
    const what = kind === "genre" ? "genres" : "mixes";
    setProblem(await write(`/api/${what}/${encodeURIComponent(name)}`, "DELETE", {}));
  }

  return (
    <details className="group mt-4 rounded-2xl border border-rule bg-screen">
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
              onClick={() => setDraft({ kind: "genre", name: "", instruction: "", genres: [] })}
            />
          }
        >
          {genres.map((genre) => (
            <Row
              key={genre.name}
              name={genre.name}
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
              disabled={genres.length === 0}
              onClick={() => setDraft({ kind: "mix", name: "", instruction: "", genres: [] })}
            />
          }
        >
          {mixes.map((mix) => (
            <Row
              key={mix.name}
              name={mix.name}
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
  onEdit,
  onDelete,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <span className="min-w-0 truncate text-[13px] text-ink">{name}</span>
      <span className="flex shrink-0 gap-1">
        <RowAction onClick={onEdit}>Edit</RowAction>
        <RowAction onClick={onDelete}>Delete</RowAction>
      </span>
    </li>
  );
}

function RowAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-md px-2 py-1 text-[12px] text-ink-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam"
    >
      {children}
    </button>
  );
}

function AddButton({
  label,
  disabled = false,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-md border border-rule px-3 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-ink-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}
