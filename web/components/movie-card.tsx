import Link from "next/link";

import { MovieStatus } from "./movie-status";
import { VibeLinks } from "./vibe-links";
import type { Vibe } from "@/lib/taste/model";
import type { Shown } from "@/lib/web/judgements";
import { movieHref } from "@/lib/web/screens";
import { coreFirst } from "@/lib/web/vibes";

/**
 * Films as cards, one under another — the Stream's films, and a vibe's.
 *
 * One list for both screens, so a film looks the same wherever it is listed: the
 * Stream hands it every film, newest saved first; a vibe's screen hands it the
 * films in that vibe, and the vibe's name as `from`, so each card opens its film
 * with that vibe as the one it was reached through. The list says what it is
 * (`label`), because a screen reader lands on it as a list.
 */
export function MovieCards({
  movies,
  vibes,
  label,
  from,
  className = "",
}: {
  movies: readonly Shown[];
  /** Every vibe the user has, which say what each film is the core of. */
  vibes: readonly Vibe[];
  label: string;
  /** The vibe these cards are read under, which each film's screen then names first. */
  from?: string;
  className?: string;
}) {
  return (
    <ul aria-label={label} className={`flex flex-col gap-3 ${className}`}>
      {movies.map((movie) => (
        <MovieCard key={`${movie.year} ${movie.title}`} movie={movie} vibes={vibes} from={from} />
      ))}
    </ul>
  );
}

/**
 * One film, as a card.
 *
 *     ┌───────────────────────────────────────────┐
 *     │ 2021                          ♥ Loved     │   year · status
 *     │ Dune                                      │   the title, most of all
 *     │ ✨ Space Tension · Quiet Dread            │   every vibe it is in, its cores first
 *     └───────────────────────────────────────────┘
 *
 * A dark card, because each film is a thing of its own here and not a line in a
 * table. What is on it is what tells one film from the next: the title, set
 * larger than anything else; the year, quietly; how it stands, in a word; and the
 * vibes it is in, each a way to its screen. No genre — a genre belongs to a
 * vibe, and is read there — no mark to press, no poster, and nothing for a film
 * in no vibe: no line at all, rather than a word standing in for the absence.
 *
 * ## The vibes it is the core of, first
 *
 * A film that is a vibe's core — the film that best embodies it — names that
 * vibe first, in the violet beside the ✨, and the vibes it is only filed under
 * after it, muted: one line, the same size and the same separator, wrapping
 * only where the card is too narrow for it. A film that is the core of two
 * vibes names both first; one that is the core of none names every vibe muted.
 * Which they are is `coreFirst`'s, from every vibe's own core.
 *
 * ## One link over the whole card
 *
 * The title is the film's link, and it is stretched over the card, so a press
 * anywhere on it opens the film — with no vibe as its context on the Stream, and
 * with the vibe it is listed under on that vibe's screen. The vibe names are
 * raised above that — each name, not the line around them — so they open their
 * vibe instead, and the ✨, the separators and the gaps between names still open
 * the film.
 *
 * ## Reading order and layout are set apart
 *
 * Read, and tabbed, it is the title, then how the film stands, then its vibes —
 * the order the facts matter in. Seen, the year and the status sit on the top
 * row and the vibes directly under the title. The grid places each part where it
 * is seen, so neither order has to give way to the other. The year is hidden from
 * a listener: the title's link already says it, in the words "Dune (2021)", so two
 * Dunes are two links a listener can tell apart.
 */
function MovieCard({ movie, vibes, from }: { movie: Shown; vibes: readonly Vibe[]; from?: string }) {
  const { names, cores } = coreFirst(movie, vibes);

  return (
    <li className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 rounded-xl border border-rule bg-screen px-5 py-4 transition-colors hover:border-ink-faint" data-viewing={movie.viewing}>
      <span aria-hidden="true" className="col-start-1 row-start-1 self-center text-[12px] text-ink-faint tabular-nums">
        {movie.year}
      </span>

      <h3 className="col-span-2 row-start-2 min-w-0">
        <Link
          href={movieHref(movie, from)}
          prefetch={false}
          className={[
            "font-display text-[22px] leading-tight break-words text-ink",
            // Stretched over the card, which is `relative`: the whole card is the
            // film's link, and its focus ring is drawn around the whole card.
            "after:absolute after:inset-0 after:rounded-xl",
            "focus-visible:outline-none focus-visible:after:outline-2",
            "focus-visible:after:outline-offset-2 focus-visible:after:outline-beam",
          ].join(" ")}
        >
          {movie.title}
          <span className="sr-only"> ({movie.year})</span>
        </Link>
      </h3>

      <MovieStatus
        viewing={movie.viewing}
        judgement={movie.position?.judgement ?? null}
        className="col-start-2 row-start-1"
      />

      {movie.vibes.length > 0 && (
        <div className="col-span-2 row-start-3 min-w-0">
          <VibeLinks names={names} cores={cores} label="Vibes:" raised />
        </div>
      )}
    </li>
  );
}
