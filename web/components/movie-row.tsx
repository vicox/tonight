import { MovieState } from "./movie-state";
import type { Movie } from "@/lib/taste/model";
import { filedUnder } from "@/lib/web/movie-summary";

/**
 * The user's films as a list, and deliberately only a list.
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
 *
 * ## One list, in two places
 *
 * The overview renders it inside a mix, where the mix is the heading above it;
 * the summary tiles open it in a dialog, where the films come from every mix
 * there is. That difference is `filed`, and it is the whole difference — the same
 * markup, the same marks and the same keyboard, because a film's row is the same
 * object wherever somebody meets it.
 *
 * This file has no `"use client"` of its own. Rendered from the server page it
 * stays on the server, rendered from the dialog it goes to the browser, and
 * `MovieState` is the client boundary either way round.
 */
export function Films({
  movies,
  /**
   * Whether each row says where its film is filed.
   *
   * On in the dialog, where a row has no mix above it to say so. Off inside a
   * mix, where naming it again on every row would repeat the heading twenty
   * times.
   */
  filed = false,
  className = "mt-4",
}: {
  movies: readonly Movie[];
  filed?: boolean;
  className?: string;
}) {
  if (!movies.length) return null;

  return (
    <ul className={`${className} flex flex-col gap-1.5 text-[13.5px] leading-relaxed`}>
      {movies.map((movie) => (
        <li
          key={`${movie.year} ${movie.title}`}
          // Wrapping, so that the sentence a failed write puts under the row has
          // somewhere to go. Nothing wraps while nothing is wrong.
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1"
        >
          {/*
            The words, as one thing that gives way: it takes the room the mark
            does not want and wraps inside itself when a long title and three
            long mix names need two lines. The mark is its sibling rather than
            its last item, which is what keeps it on the right of the row's
            first line instead of being pushed under it — and the reading order
            is unchanged, because the words still come first.
          */}
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-0.5">
            <span className="min-w-0 text-ink">
              {movie.title} ({movie.year})
              {movie.imdbId !== null && (
                <>
                  {" "}
                  <Imdb id={movie.imdbId} title={movie.title} />
                </>
              )}
            </span>
            {filed && <Filed movie={movie} />}
          </span>
          <MovieState title={movie.title} year={movie.year} state={movie.state} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Which mixes a film is in, as secondary information.
 *
 * Between the name and the mark, quieter than both: what somebody scanning this
 * list wants is the films and what they said about them, and where each one is
 * filed is the answer to a question they ask about one row in particular.
 *
 * Plain text rather than the uppercase chips the overview gives a mix. A chip is
 * how a mix appears when it is the subject — here it is a footnote to a film, and
 * three chips on a row would out-shout the film's own name.
 */
function Filed({ movie }: { movie: Movie }) {
  return (
    <span className="min-w-0 text-[12.5px] text-ink-faint">{filedUnder(movie).join(", ")}</span>
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
