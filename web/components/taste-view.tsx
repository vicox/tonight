import { CopyButton } from "./copy-button";
import { TasteAdvanced } from "./taste-advanced";
import type { Genre, Mix, Taste } from "@/lib/taste/model";
import { preview } from "@/lib/web/preview";

/**
 * One person's taste model, read rather than edited.
 *
 *     YOUR GENRES     the reusable components
 *          ↓
 *     YOUR MIXES      what they mean in combination
 *
 * Vertical rather than side by side, because the relationship is a derivation and
 * not a comparison: mixes come *from* genres, and an arrow between two stacked
 * panels says that in a way two columns cannot.
 *
 * Genres are unlit and mixes carry the accent. That is the one piece of colour on
 * the page and it is spent saying which of the two the user built themselves — a
 * genre is an ingredient, a mix is a decision. Lighting both would light neither.
 *
 * No JavaScript reaches the browser for any of this. The page above is a Server
 * Component that has already opened the signed-in user's store, instructions
 * expand through native `<details>`, and the only client code on the page is the
 * copy button and the management island at the foot — which is where every write
 * lives. What is on show here is a rendering of what the store holds, and nothing
 * here can change it.
 */
export function TasteView({ taste }: { taste: Taste }) {
  return (
    <>
      <Panel
        title="Your genres"
        note="The pieces your taste is made of. Each one means whatever you say it means."
        count={taste.genres.length}
      >
        {taste.genres.length === 0 ? (
          <Empty>
            Nothing here yet. Tell ChatGPT what you are in the mood for, and what you tell it can
            be saved here.
          </Empty>
        ) : (
          taste.genres.map((genre) => <GenreCard key={genre.name} genre={genre} />)
        )}
      </Panel>

      <Arrow />

      <Panel
        title="Your mixes"
        note="Genres combined into something of your own — and what you meant by combining them."
        count={taste.mixes.length}
      >
        {taste.mixes.length === 0 ? (
          <Empty>
            {taste.genres.length === 0
              ? "A mix combines genres, so those come first."
              : "Nothing here yet. Ask ChatGPT for something two of your genres would both fit."}
          </Empty>
        ) : (
          taste.mixes.map((mix) => <MixCard key={mix.name} mix={mix} />)
        )}
      </Panel>

      <Prompt taste={taste} />

      <p className="mt-10 text-[12.5px] leading-relaxed text-ink-faint">
        This is what Tonight stores. Your assistant may also be drawing on its own memory of your
        conversations, which Tonight cannot see and this page cannot show.
      </p>

      <TasteAdvanced taste={taste} />
    </>
  );
}

/**
 * The sentence to take to a conversation, ready to paste.
 *
 * The website holds the taste model; recommending happens somewhere else. Naming
 * the sentence that crosses between them is what makes the connection something a
 * person can act on rather than infer.
 */
function Prompt({ taste }: { taste: Taste }) {
  const subject = taste.mixes[0]?.name ?? taste.genres[0]?.name;
  if (!subject) return null;

  const sentence = `What should I watch tonight? Use my ${subject} ${
    taste.mixes.length ? "mix" : "genre"
  }.`;

  return (
    <section className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2.5">
      <p className="min-w-0 flex-1 rounded-lg border border-rule bg-screen px-4 py-3 font-mono text-[12.5px] text-ink">
        {sentence}
      </p>
      <CopyButton text={sentence}>Copy</CopyButton>
    </section>
  );
}

/** One vertical section of the board. */
function Panel({
  title,
  note,
  count,
  children,
}: {
  title: string;
  note: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-rule bg-screen p-6 sm:p-8">
      <header className="mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-[26px] leading-none">{title}</h2>
          <span className="text-[12px] text-ink-faint tabular-nums">{count}</span>
        </div>
        <p className="mt-2 text-[12.5px] text-ink-soft">{note}</p>
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function GenreCard({ genre }: { genre: Genre }) {
  return (
    <Card instruction={genre.instruction}>
      <Chip>{genre.name}</Chip>
    </Card>
  );
}

/**
 * A mix, as the composition it is.
 *
 * `[MYSTERY] + [CHARACTER STORY] ↓ Small Town Secrets` read aloud is a
 * list of punctuation, so the brackets and the arrow are hidden and the sentence
 * they draw is offered instead. Nothing is lost either way round: the same three
 * facts reach a reader and a listener, in the form each can use.
 */
function MixCard({ mix }: { mix: Mix }) {
  return (
    <Card instruction={mix.instruction} lit>
      <span className="block">
        <span className="sr-only">
          {mix.name} combines {spoken(mix.genres)}.
        </span>
        <span aria-hidden="true" className="block">
          <span className="flex flex-wrap items-center gap-1.5">
            {mix.genres.map((genre, index) => (
              <span key={genre} className="flex items-center gap-1.5">
                {index > 0 && <span className="text-[12px] text-ink-faint">+</span>}
                <Chip>{genre}</Chip>
              </span>
            ))}
          </span>
          <span className="mt-1.5 block text-[13px] leading-none text-beam">↓</span>
          <span className="mt-1.5 block font-display text-[22px] leading-tight text-ink">
            {mix.name}
          </span>
        </span>
      </span>
    </Card>
  );
}

/** "Mystery and Character Story", the way somebody would say it. */
function spoken(genres: readonly string[]): string {
  if (genres.length <= 1) return genres[0] ?? "";
  return `${genres.slice(0, -1).join(", ")} and ${genres[genres.length - 1]}`;
}

/**
 * A genre or a mix: what it is called, and what the user said it means.
 *
 * The opening of the instruction is always on show, because a name without its
 * meaning is a tag and tags are what Tonight exists not to be. The rest is behind
 * a native `<details>`, which brings its own keyboard and screen-reader behaviour
 * — and when there is nothing more to show, there is no control to press.
 *
 * `lit` gives a mix the accent edge that says it is theirs.
 */
function Card({
  children,
  instruction,
  lit = false,
}: {
  children: React.ReactNode;
  instruction: string;
  lit?: boolean;
}) {
  const { opening, more } = preview(instruction);
  const frame = ["rounded-xl border bg-night px-5 py-4", lit ? "border-beam-dim" : "border-rule"];

  if (!more) {
    return (
      <article className={frame.join(" ")}>
        {children}
        <Opening>{opening}</Opening>
      </article>
    );
  }

  return (
    <article className={frame.join(" ")}>
      <details className="group">
        <summary className="cursor-pointer list-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam [&::-webkit-details-marker]:hidden">
          <span className="flex items-start justify-between gap-4">
            <span className="min-w-0">{children}</span>
            <Chevron />
          </span>
          {/* The opening is the closed state's whole content; open, the full
              instruction says it again and better. */}
          <span className="group-open:hidden">
            <Opening>{opening}</Opening>
          </span>
        </summary>
        <Opening>{instruction}</Opening>
      </details>
    </article>
  );
}

function Opening({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-soft">
      {children}
    </p>
  );
}

/**
 * The disclosure's own marker, in place of the browser's triangle.
 *
 * Decorative: `<summary>` is already announced as an expandable control with its
 * state, so a listener is told what a reader infers from the direction it points.
 */
function Chevron() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 shrink-0 text-[13px] text-ink-faint transition-transform group-open:rotate-90"
    >
      ›
    </span>
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
  return <p className="py-6 text-center text-[13px] leading-relaxed text-ink-faint">{children}</p>;
}
