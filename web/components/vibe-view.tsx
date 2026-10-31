import { BackToStream } from "./back-to-stream";
import { GenreLabels } from "./genre-labels";
import { MovieCards } from "./movie-card";
import type { Genre, Vibe, Written } from "@/lib/taste/model";
import type { Shown } from "@/lib/web/judgements";

/**
 * One vibe, in full: its name, the genres it is built from, what it means, and
 * the films in it.
 *
 * The only screen a genre appears on. A film's card names its vibes and never a
 * genre: a genre belongs to the vibe built from it, so it is shown here, as a
 * label.
 *
 * The films are the Stream's own cards — the same component, so a film looks the
 * same in both places. Each opens the film's screen with this vibe as its context
 * — the vibe it was reached through, rather than one of several it may also be
 * in.
 *
 * Nothing here changes the vibe, its genres or its films; that is said to an
 * assistant. So the heading has nothing beside it.
 */
export function VibeView({
  vibe,
  vibes,
  genres,
  films,
}: {
  vibe: Written<Vibe>;
  /** Every vibe the user has, so each card can say which its film is the core of. */
  vibes: readonly Vibe[];
  /** The vibe's genres as genres, in its own order. See `genresOf`. */
  genres: Written<Genre>[];
  /** The films in the vibe. See `filmsIn`. */
  films: Shown[];
}) {
  return (
    <>
      <BackToStream />

      <section className="mt-6">
        <h2 className="min-w-0 font-display text-[32px] leading-tight break-words text-ink">
          {vibe.name}
        </h2>

        <div className="mt-4">
          <GenreLabels genres={genres} />
        </div>

        <p className="mt-5 text-[14px] leading-relaxed whitespace-pre-line text-ink-soft">
          {vibe.instruction}
        </p>

        {films.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-faint">No films in this vibe yet.</p>
        ) : (
          <MovieCards movies={films} vibes={vibes} from={vibe.name} label={`Films in ${vibe.name}`} className="mt-6" />
        )}
      </section>
    </>
  );
}
