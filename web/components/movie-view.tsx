import { BackToStream } from "./back-to-stream";
import { MovieChoices } from "./movie-choices";
import { VibeLinks } from "./vibe-links";
import type { Refusal } from "@/lib/web/choices";
import type { Shown } from "@/lib/web/judgements";
import { alsoIn } from "@/lib/web/screens";

/**
 * One film: its year, its title, the vibes it is in, and what the user thinks of it.
 *
 *     2021
 *     Dune
 *     ✨ Space Tension · Quiet Dread
 *
 *     What do you think?
 *     ( Love it ) ( Like it ) ( Want to see ) ( Not interested ) ( Dislike )
 *
 * Everything here is what the user told Tonight. A title and a year, the vibes
 * it is in, where it stands and what they made of it — and below, quietly, an
 * IMDb id if they gave one (a link out, never looked up) and their own words for
 * the verdict that stands. Nothing else: no synopsis, no poster, no runtime, no
 * cast, because Tonight has no catalogue and fetches nothing. And no genre: a
 * genre belongs to a vibe, and is read on the vibe's screen.
 *
 * ## The vibes, the way a card names them
 *
 * Every vibe the film is in, each a link, behind one ✨ — as on the Stream. When
 * the screen was reached through one of them, that one is named first: it is the
 * context, and none of them is a property of the film.
 *
 * ## The five choices
 *
 * The one thing on the website that writes, and only what each choice already
 * means: a verdict, or the film's viewing. See `movie-choices.tsx` and
 * `lib/web/choices.ts`. Its title, its year, its vibes and whether it is kept at
 * all are said to an assistant.
 */
export function MovieView({
  movie,
  context,
  refused,
}: {
  movie: Shown;
  context: string | null;
  refused: Refusal | null;
}) {
  const vibes = context === null ? movie.vibes : [context, ...alsoIn(movie, context)];

  return (
    <>
      <BackToStream />

      <article className="mt-6">
        {/* The year above the title rather than after it; the heading says it to a listener. */}
        <p aria-hidden="true" className="text-[13px] tracking-wide text-ink-faint tabular-nums">
          {movie.year}
        </p>
        <h2 className="mt-1 min-w-0 font-display text-[36px] leading-tight break-words text-ink">
          {movie.title}
          <span className="sr-only"> ({movie.year})</span>
        </h2>

        <div className="mt-3">
          <VibeLinks names={vibes} label="Vibes:" />
        </div>

        <div className="mt-8">
          <MovieChoices
            title={movie.title}
            year={movie.year}
            viewing={movie.viewing}
            judgement={movie.position?.judgement ?? null}
            from={context}
            refused={refused}
          />
        </div>

        {/* Their own words for the verdict that stands, when they gave any. */}
        {movie.position?.judgement !== undefined && movie.position.because !== undefined && (
          <blockquote className="mt-6 border-l border-rule pl-4 text-[14px] leading-relaxed whitespace-pre-line text-ink-soft">
            <span className="sr-only">In your words: </span>
            &ldquo;{movie.position.because}&rdquo;
          </blockquote>
        )}

        {movie.imdbId !== null && (
          <p className="mt-6 text-[13px]">
            <Imdb id={movie.imdbId} title={movie.title} />
          </p>
        )}
      </article>
    </>
  );
}

/**
 * A pointer out to IMDb, and the only outbound link on the website.
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
