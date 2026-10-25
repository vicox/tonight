import { CHIP } from "./chip";
import type { Genre } from "@/lib/taste/model";

/**
 * The genres, as a line of labels.
 *
 * A genre *is* its name here: the handful of pieces a vibe is built from, read
 * across in one wrapping line. A label is a name and nothing to press — there is
 * no dialog behind it and no list of films: a vibe's screen is where its films
 * are, and what a genre means, and changing it, are said to an assistant.
 */
export function GenreLabels({ genres }: { readonly genres: readonly Genre[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {genres.map((genre) => (
        <li
          key={genre.name}
          className={[
            CHIP,
            // A name is valid up to sixty characters and need not contain a
            // space, so one long enough to fill the line wraps inside its own
            // label rather than pushing the page sideways. Still only as wide as
            // it needs to be: `max-w-full` is a ceiling, not a width.
            "max-w-full bg-screen break-words",
          ].join(" ")}
        >
          {genre.name}
        </li>
      ))}
    </ul>
  );
}
