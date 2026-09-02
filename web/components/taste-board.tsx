"use client";

import { useState } from "react";

import type { Genre, Mix, Taste } from "@/lib/taste/model";
import { TasteEditor, type Draft } from "./taste-editor";

/**
 * One person's taste model, read top to bottom.
 *
 *     YOUR GENRES     the reusable components
 *          ↓
 *     YOUR MIXES      what they mean in combination
 *          ↓
 *     FOR TONIGHT     what to do with them
 *
 * Vertical rather than side by side, because the relationship is a derivation and
 * not a comparison: mixes come *from* genres, and an arrow between two stacked
 * panels says that in a way two columns cannot.
 *
 * Genres are unlit and mixes carry the accent. That is the one piece of colour on
 * the page and it is spent saying which of the two the user built themselves — a
 * genre is an ingredient, a mix is a decision. Lighting both would light neither.
 *
 * Given its data rather than fetching it. The page above is a Server Component
 * that has already opened the signed-in user's store, so there is no endpoint that
 * hands somebody's genres to a fetch. Writes go the other way, through
 * `lib/web/api.ts`, and each one answers with the model as the store now holds it
 * — which is what this then shows, rather than what was typed.
 */
export function TasteBoard({ taste }: { taste: Taste }) {
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
   * which. It also means the page can never drift from the database by applying an
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
    return null;
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
    setProblem(
      await write(`/api/${what}/${encodeURIComponent(name)}`, "DELETE", {}),
    );
  }

  return (
    <>
      {problem && (
        <p role="alert" className="mb-8 rounded-lg border border-beam-dim bg-beam-dim/15 px-4 py-3 text-[13px] text-ink">
          {problem}
        </p>
      )}

      <Panel
        title="Your genres"
        note="The pieces your taste is made of. Each one means whatever you say it means."
        count={genres.length}
        action={
          <AddButton
            label="Add genre"
            onClick={() => setDraft({ kind: "genre", name: "", instruction: "", genres: [] })}
          />
        }
      >
        {genres.length === 0 ? (
          <Empty>Nothing yet. Add one here, or describe what you like to your assistant.</Empty>
        ) : (
          genres.map((genre) => (
            <Card
              key={genre.name}
              heading={<Chip>{genre.name}</Chip>}
              body={genre.instruction}
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
          ))
        )}
      </Panel>

      <Arrow />

      <Panel
        title="Your mixes"
        note="Genres combined into something of your own — and what you meant by combining them."
        count={mixes.length}
        action={
          <AddButton
            label="Add mix"
            disabled={genres.length === 0}
            onClick={() => setDraft({ kind: "mix", name: "", instruction: "", genres: [] })}
          />
        }
      >
        {mixes.length === 0 ? (
          <Empty>
            {genres.length === 0
              ? "A mix combines genres, so start with those."
              : "Nothing yet. Combine two genres, or ask your assistant to suggest some."}
          </Empty>
        ) : (
          mixes.map((mix) => (
            <Card
              key={mix.name}
              heading={
                <span className="block">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {mix.genres.map((genre, index) => (
                      <span key={genre} className="flex items-center gap-1.5">
                        {index > 0 && <span className="text-[12px] text-ink-faint">+</span>}
                        <Chip>{genre}</Chip>
                      </span>
                    ))}
                  </span>
                  <span aria-hidden="true" className="mt-1.5 block text-[13px] leading-none text-beam">
                    ↓
                  </span>
                  <span className="mt-1.5 block font-display text-[22px] leading-tight text-ink">
                    {mix.name}
                  </span>
                </span>
              }
              body={mix.instruction}
              lit
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
          ))
        )}
      </Panel>

      <Arrow />

      <ForTonight mixes={mixes} genres={genres} />

      {draft && (
        <TasteEditor
          draft={draft}
          available={names}
          onSave={save}
          onClose={() => setDraft(null)}
        />
      )}
    </>
  );
}

/**
 * The third panel: the prompt to take to a host agent, and the mix to name in it.
 *
 * The website shows and edits the taste model; recommending happens in a
 * conversation, where the agent reads this model over MCP. Naming the sentence
 * that crosses between them is what makes the connection visible.
 */
function ForTonight({ mixes, genres }: { mixes: Mix[]; genres: Genre[] }) {
  const subject = mixes[0]?.name ?? genres[0]?.name;

  return (
    <section className="rounded-2xl border border-rule bg-screen p-6 sm:p-8">
      <h2 className="font-display text-[26px] leading-none">For tonight</h2>
      <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-soft">
        Tonight keeps your taste. Your assistant does the watching suggestions — connect Tonight
        to it over MCP and ask.
      </p>
      {subject ? (
        <p className="mt-5 rounded-lg border border-rule bg-night px-4 py-3 font-mono text-[13px] text-ink">
          What should I watch tonight? Use my {subject}
          {mixes.length ? " mix" : " genre"}.
        </p>
      ) : (
        <p className="mt-5 text-[13px] text-ink-faint">
          Add a genre first — there is nothing to recommend from yet.
        </p>
      )}
    </section>
  );
}

/** One vertical section of the board. */
function Panel({
  title,
  note,
  count,
  action,
  children,
}: {
  title: string;
  note: string;
  count: number;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-rule bg-screen p-6 sm:p-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-[26px] leading-none">{title}</h2>
          <span className="text-[12px] text-ink-faint tabular-nums">{count}</span>
        </div>
        {action}
        <p className="w-full text-[12.5px] text-ink-soft">{note}</p>
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/**
 * The connector between two panels.
 *
 * Decorative, so it is hidden from a screen reader: the heading of the panel below
 * says what it is, and "down arrow" read aloud between two sections says nothing a
 * listener can use.
 */
function Arrow() {
  return (
    <div aria-hidden="true" className="flex justify-center py-5 text-[15px] text-beam">
      ↓
    </div>
  );
}

/** A genre or a mix. `lit` gives a mix the accent edge that says it is theirs. */
function Card({
  heading,
  body,
  lit = false,
  onEdit,
  onDelete,
}: {
  heading: React.ReactNode;
  body: string;
  lit?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={[
        "rounded-xl border bg-night px-5 py-4",
        lit ? "border-beam-dim" : "border-rule",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">{heading}</div>
        <div className="flex shrink-0 gap-1">
          <RowAction onClick={onEdit}>Edit</RowAction>
          <RowAction onClick={onDelete}>Delete</RowAction>
        </div>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">{body}</p>
    </article>
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
      className="cursor-pointer rounded-md border border-rule px-3 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-ink-faint hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam"
    >
      {label}
    </button>
  );
}

/**
 * A genre's or mix's name, as a chip.
 *
 * Uppercase and tracked, which is film-credit typography rather than decoration:
 * it is what makes `[SCI-FI] + [THRILLER] ↓ SPACE TENSION` read as a composition
 * at a glance. The name itself is stored as the user wrote it — this is a
 * rendering, and nothing here changes what is in the database.
 */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-rule px-2.5 py-1 text-[11px] tracking-[0.11em] text-ink-soft uppercase">
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-ink-faint">{children}</p>;
}
