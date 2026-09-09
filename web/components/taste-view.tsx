import { CopyButton } from "./copy-button";
import { GenreLabels } from "./genre-labels";
import { MixCards } from "./mix-cards";
import { MovieSummary } from "./movie-summary";
import { Section } from "./section";
import { TasteAdvanced } from "./taste-advanced";
import type { Taste } from "@/lib/taste/model";
import { recentlyAdded } from "@/lib/web/movie-summary";

/**
 * One person's taste model: a page to read, and the few things on it to press.
 *
 *     YOUR MOVIES     how many films there are, and how they were marked
 *
 *     YOUR GENRES     the reusable components
 *          ↓
 *     YOUR MIXES      what they mean in combination, each with how many
 *                     films are in it and how many of those are loved,
 *                     and one line for the films that are in none
 *
 * Vertical rather than side by side, because the relationship is a derivation and
 * not a comparison: mixes come *from* genres, and an arrow between two stacked
 * sections says that in a way two columns cannot.
 *
 * Three peers, drawn by one `Section`. Films used to float over two boxes with
 * the genres and mixes inside them, which said that those two were containers and
 * the films were a caption on the page — where in fact they are the three things
 * a taste model is made of, and a reader should meet them as three of a kind.
 * What carries an edge on this page is a row or a card, never a section.
 *
 * Genres are unlit and mixes carry the accent. That is the one piece of colour on
 * the page and it is spent saying which of the two the user built themselves — a
 * genre is an ingredient, a mix is a decision. Lighting both would light neither.
 *
 * ## Names and counts are the overview; everything else is one press in
 *
 * No instruction, no genre chip and no film row appears on this page in its
 * resting state. The overview is for seeing the *shape* of a taste model — which
 * ideas somebody has and how much is under each — and putting the whole of every
 * mix on it turned that into a page you scroll rather than a page you read. A
 * genre's label opens its meaning; a mix's card opens its meaning, its genres
 * and its films. What stays outside is what can be scanned: names, and numbers.
 *
 * ## What is JavaScript here, and what is not
 *
 * The page is a Server Component that has already opened the signed-in user's
 * store. What is client code is what can be pressed: the counts, the genre
 * labels and the mix cards, each with the dialog it opens; the copy button; the
 * management island at the foot where genres and mixes are created and renamed;
 * and the mark on a film's row. Nothing else here can change anything — what is
 * on show is a rendering of what the store holds, read on the server each time.
 *
 * Three of those dialogs are the same `<dialog>` used the same way, and the one
 * thing none of them re-implements is focus: a dialog is unmounted in the same
 * commit that closes it, so whatever opened it is what puts focus back. See
 * `lib/web/refocus.ts`.
 */
export function TasteView({ taste }: { taste: Taste }) {
  return (
    <>
      {/*
        First, and above the two sections rather than between them: the arrow says
        a mix comes from genres, and it only says that while the two it points
        between are next to each other. Every film on the page is under one of
        these counts, genres and mixes included.
      */}
      {/*
        The instant is settled here, once, where the render happens: `Recently
        added` is a question about the data and not about the reader's clock.
      */}
      <MovieSummary movies={taste.movies} recent={recentlyAdded(taste.movies, new Date())} />

      <Section
        title="Your genres"
        note="The pieces your taste is made of. Each one means whatever you say it means."
        count={taste.genres.length}
        className="mt-14"
      >
        {taste.genres.length === 0 ? (
          <Empty>
            Nothing here yet. Tell ChatGPT what you are in the mood for, and what you tell it can
            be saved here.
          </Empty>
        ) : (
          <GenreLabels genres={taste.genres} />
        )}
      </Section>

      <Arrow />

      <Section
        title="Your mixes"
        note="Your genres, mixed into something of your own."
        count={taste.mixes.length}
      >
        {taste.mixes.length === 0 && (
          <Empty>
            {taste.genres.length === 0
              ? "A mix combines genres, so those come first."
              : "Nothing here yet. Ask ChatGPT for something two of your genres would both fit."}
          </Empty>
        )}

        {/*
          Always, even with no mixes to draw: the films that are in none of them
          are this section's remainder, and with no mixes that is every film
          there is. Rendering the cards only when there are cards left the one
          way to those films off the page exactly when it was needed most.
        */}
        <MixCards mixes={taste.mixes} movies={taste.movies} />
      </Section>

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

/**
 * The connector between two sections.
 *
 * Decorative, so it is hidden from a screen reader: the heading of the section
 * below says what it is, and "down arrow" read aloud between two of them says
 * nothing a listener can use.
 */
function Arrow() {
  return (
    <div aria-hidden="true" className="flex justify-center py-5 text-[15px] text-beam">
      ↓
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13px] leading-relaxed text-ink-faint">{children}</p>;
}
