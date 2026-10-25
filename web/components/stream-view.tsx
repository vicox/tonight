import { CopyButton } from "./copy-button";
import { MovieCards } from "./movie-card";
import { Section } from "./section";
import { VibeLinks } from "./vibe-links";
import type { Taste } from "@/lib/taste/model";
import type { Standing } from "@/lib/verdicts/model";
import { positions, withPositions } from "@/lib/web/judgements";
import { emptyVibes, stream } from "@/lib/web/stream";

/**
 * The Stream: one person's films, newest first, and everything else one press away.
 *
 *     YOUR MOVIES  12
 *     ┌──────────┐
 *     │ a film   │    every film once, most recently saved first, straight under
 *     └──────────┘    the heading — each a card, each card a way to the film and its vibes
 *     …
 *     the vibes with no films, when there are any
 *     the sentence to take to a conversation
 *
 * The heading and how many films there are, and then the films. No summary of how
 * they stand sits between — no counts of seen or wanted, no "recently added":
 * each card says how its own film stands, and the list is the films themselves.
 *
 * Film-centred: the films are what a person comes back for, so the page is them,
 * in the order they arrived. A film on their list, one they have seen, one they
 * loved and one they do not want to see are all a card like any other, in the
 * same list — how a film stands is said on its card, and does not decide where
 * the card is. No section per vibe and none per status.
 *
 * A vibe is reached through its films: every card names the vibes its film is
 * in, and each name opens that vibe's screen, where its meaning, its genres and
 * its films are. The short list at the foot is the vibes a film cannot reach,
 * because nothing is in them yet. It is not a grouping of films: no film is in
 * it. No genre is listed here — a genre is read on the screen of a vibe built
 * from it.
 *
 * ## Read, not changed
 *
 * Nothing on the Stream writes: no form, no request, no control that changes a
 * film, a verdict, a genre or a vibe. A film's own screen is the one place on the
 * website that does — its five choices — and everything else is said to an
 * assistant, which changes the model through the MCP tools. The only client code
 * here is the copy button.
 */
export function StreamView({ taste, standing }: { taste: Taste; standing: readonly Standing[] }) {
  /**
   * The films with what currently stands about each, worked out once.
   *
   * Two stores answer this page and neither knows about the other: the taste
   * model says which films are saved and whether they have been watched, and the
   * verdict store says what the user thinks of them.
   */
  const movies = withPositions(taste.movies, positions(standing));
  const empty = emptyVibes(taste.vibes, movies);

  return (
    <>
      <Section title="Your movies" count={movies.length}>
        {movies.length === 0 ? (
          <Empty>
            Nothing here yet. Tell ChatGPT what you are in the mood for, and what you tell it can be
            saved here.
          </Empty>
        ) : (
          <MovieCards movies={stream(movies)} label="Your movies, most recently saved first" />
        )}
      </Section>

      {empty.length > 0 && (
        <Section
          title="Vibes with no films"
          note="Nothing is in these yet."
          count={empty.length}
          className="mt-14"
        >
          <VibeLinks names={empty.map((vibe) => vibe.name)} label="Vibes:" />
        </Section>
      )}

      <Prompt taste={taste} />
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
  const subject = taste.vibes[0]?.name ?? taste.genres[0]?.name;
  if (!subject) return null;

  const sentence = `What should I watch tonight? Use my ${subject} ${
    taste.vibes.length ? "vibe" : "genre"
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13px] leading-relaxed text-ink-faint">{children}</p>;
}
