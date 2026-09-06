import { CopyButton } from "./copy-button";
import { MovieState } from "./movie-state";
import { TasteAdvanced } from "./taste-advanced";
import type { Genre, Mix, Movie, Taste } from "@/lib/taste/model";

/**
 * One person's taste model: a page to read, with two things on it to press.
 *
 *     YOUR GENRES     the reusable components
 *          ↓
 *     YOUR MIXES      what they mean in combination,
 *                     and the films the user keeps in each
 *     OTHER MOVIES    the films that are in no Mix
 *
 * Vertical rather than side by side, because the relationship is a derivation and
 * not a comparison: mixes come *from* genres, and an arrow between two stacked
 * panels says that in a way two columns cannot.
 *
 * Genres are unlit and mixes carry the accent. That is the one piece of colour on
 * the page and it is spent saying which of the two the user built themselves — a
 * genre is an ingredient, a mix is a decision. Lighting both would light neither.
 *
 * ## Names and films are the overview; meanings are one click in
 *
 * No instruction appears on this page in its resting state. The overview is for
 * seeing the *shape* of a taste model — what it is made of, and which films are
 * in each mix — and a paragraph under every card turns that into a page you
 * scroll rather than a page you read. Each card opens onto its own instruction,
 * which is where the wording belongs. The films stay on show underneath: they are
 * the user's own objects, not a detail of the mix that happens to list them.
 *
 * ## Almost none of this is JavaScript
 *
 * The page is a Server Component that has already opened the signed-in user's
 * store, and instructions expand through native `<details>`. Three things are
 * client code: the copy button, the management island at the foot where genres
 * and mixes are created and renamed, and the two marks on a film's row. Nothing
 * else here can change anything — what is on show is a rendering of what the
 * store holds, read on the server each time.
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
        note="Your genres, mixed into something of your own."
        count={taste.mixes.length}
      >
        {taste.mixes.length === 0 ? (
          <Empty>
            {taste.genres.length === 0
              ? "A mix combines genres, so those come first."
              : "Nothing here yet. Ask ChatGPT for something two of your genres would both fit."}
          </Empty>
        ) : (
          taste.mixes.map((mix) => (
            <MixCard key={mix.name} mix={mix} movies={moviesIn(mix, taste.movies)} />
          ))
        )}
      </Panel>

      <Loose movies={taste.movies} />

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
 * The films that are in no Mix.
 *
 * A film gets here two ways, and neither is a mistake: saying *"I've seen that"*
 * about something records a Movie without filing it anywhere, and deleting a Mix
 * leaves its films behind. Both are ordinary, so this is a place they are visible
 * rather than a queue to work through — the same rows and the same marks as
 * anywhere else, under a plain heading, in the order every list here uses.
 *
 * It is absent when there are none. An empty section under this heading would
 * read as something waiting to be dealt with, which is the one thing these films
 * are not.
 */
function Loose({ movies }: { movies: readonly Movie[] }) {
  const loose = movies.filter((movie) => movie.mixes.length === 0);
  if (!loose.length) return null;

  return (
    <div className="mt-6">
      <Panel
        title="Other movies"
        note="Films you have saved that are not in a mix."
        count={loose.length}
      >
        <Films movies={loose} className="" />
      </Panel>
    </div>
  );
}

/**
 * The films in a mix, as the whole records rather than the handles.
 *
 * A mix carries `{title, year}` and the state lives once in `taste.movies`, so
 * this is the join between the two. Both halves come out of one database
 * snapshot, which is what makes a plain lookup safe — there is no read here that
 * could see a film the mix's handle no longer describes.
 */
function moviesIn(mix: Mix, movies: readonly Movie[]): Movie[] {
  // Keyed year-first, so the space that separates the two is unambiguous: a year
  // is digits, and the first space is therefore always the separator however the
  // title is spelled.
  const known = new Map(movies.map((movie) => [`${movie.year} ${movie.title}`, movie]));
  return mix.movies.flatMap((handle) => known.get(`${handle.year} ${handle.title}`) ?? []);
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
 * A mix, as the composition it is, with the user's films in it.
 *
 * `[MYSTERY] + [CHARACTER STORY] ↓ Small Town Secrets` read aloud is a
 * list of punctuation, so the brackets and the arrow are hidden and the sentence
 * they draw is offered instead. Nothing is lost either way round: the same three
 * facts reach a reader and a listener, in the form each can use.
 *
 * The films sit outside the disclosure rather than inside it. They are the
 * user's own objects rather than a detail of the mix, so they belong in the
 * resting page — and a film row carries a link, which does not belong inside a
 * control that toggles.
 */
function MixCard({ mix, movies }: { mix: Mix; movies: readonly Movie[] }) {
  return (
    <Card instruction={mix.instruction} lit after={<Films movies={movies} />}>
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

/**
 * The user's films in one mix: a list, and deliberately only a list.
 *
 * Not a table and without rules between the rows, because a table invites reading
 * down a column and there is no column here worth comparing — and no posters,
 * because Tonight has no catalogue to take one from. The year is set in the
 * title's own type for the same reason: it is half of the film's name here, not
 * metadata about it.
 *
 * A row is a line of text and one control. That control is the one thing on this
 * page that can be changed without an assistant — see `MovieState` for why it
 * offers five choices while the model keeps a sixth.
 */
function Films({ movies, className = "mt-4" }: { movies: readonly Movie[]; className?: string }) {
  if (!movies.length) return null;

  return (
    <ul className={`${className} flex flex-col gap-1.5 text-[13.5px] leading-relaxed`}>
      {movies.map((movie) => (
        <li
          key={`${movie.year} ${movie.title}`}
          // Wrapping, so that the sentence a failed write puts under the row has
          // somewhere to go. Nothing wraps while nothing is wrong.
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
        >
          <span className="min-w-0 text-ink">
            {movie.title} ({movie.year})
            {movie.imdbId !== null && (
              <>
                {" "}
                <Imdb id={movie.imdbId} title={movie.title} />
              </>
            )}
          </span>
          <MovieState title={movie.title} year={movie.year} state={movie.state} />
        </li>
      ))}
    </ul>
  );
}

/**
 * A pointer out to IMDb, and the only outbound link on the page.
 *
 * The user supplied the id and Tonight has never checked it — nothing here is
 * fetched, and no title, year or poster comes back. What the link does is let
 * somebody go and look, which is the whole reason to keep an id nobody verified.
 */
function Imdb({ id, title }: { id: string; title: string }) {
  return (
    <a
      href={`https://www.imdb.com/title/${id}/`}
      target="_blank"
      rel="noreferrer noopener"
      className="text-ink-soft underline decoration-rule underline-offset-2 hover:text-ink hover:decoration-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam"
    >
      IMDb<span className="sr-only"> page for {title}</span>
    </a>
  );
}

/** "Mystery and Character Story", the way somebody would say it. */
function spoken(genres: readonly string[]): string {
  if (genres.length <= 1) return genres[0] ?? "";
  return `${genres.slice(0, -1).join(", ")} and ${genres[genres.length - 1]}`;
}

/**
 * A genre or a mix: what it is called, and — one click in — what it means.
 *
 * The instruction is never on show in the resting page. A name is a handle and
 * the instruction is the meaning, but showing every meaning at once turns an
 * overview into a document: what somebody comes here to see is which ideas they
 * have and which films are in each, and the wording of any one of them is a
 * question they ask about that idea in particular. So the whole card is the
 * control, and the native `<details>` brings its own keyboard and screen-reader
 * behaviour rather than a re-implementation of it.
 *
 * `after` is rendered outside the disclosure, for the part of a card that is
 * overview rather than detail.
 *
 * `lit` gives a mix the accent edge that says it is theirs.
 */
function Card({
  children,
  instruction,
  after,
  lit = false,
}: {
  children: React.ReactNode;
  instruction: string;
  after?: React.ReactNode;
  lit?: boolean;
}) {
  return (
    <article
      className={["rounded-xl border bg-night px-5 py-4", lit ? "border-beam-dim" : "border-rule"].join(
        " ",
      )}
    >
      <details className="group">
        <summary className="cursor-pointer list-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam [&::-webkit-details-marker]:hidden">
          <span className="flex items-start justify-between gap-4">
            <span className="min-w-0">{children}</span>
            <Chevron />
          </span>
        </summary>
        <p className="mt-3 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-soft">
          {instruction}
        </p>
      </details>
      {after}
    </article>
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
