/**
 * The opening of an instruction, for a taste model read rather than edited.
 *
 * A name is a handle, not a meaning: `SCI-FI` says nothing about whose Sci-Fi.
 * The instruction is the part the user wrote and the part the assistant acts on,
 * so a list of names alone would turn an explicit taste model back into generic
 * tags. A wall of prose is the other failure. One line of each is the compromise,
 * and the rest is one disclosure away.
 */

/**
 * About one line at the width the cards are read at, counted in characters as a
 * reader would count them.
 *
 * Generous rather than tight: cutting a short instruction that would have fitted
 * costs a reader more than a line that runs slightly long.
 */
const OPENING_LENGTH = 120;

/**
 * The instruction as a reader sees it: one entry per visible character.
 *
 * `"a".length` and `"👍".length` disagree — the second is two UTF-16 code units,
 * and a flag or a family emoji is several more. Counting or cutting in code units
 * would truncate a genre named in Hindi at a different place than the same length
 * of English, and can leave half a surrogate pair behind, which renders as a
 * replacement character. `Intl.Segmenter` counts what a person would point at.
 */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function characters(text: string): string[] {
  return [...GRAPHEMES.segment(text)].map((segment) => segment.segment);
}

/** The instruction reduced to its opening, and what is left after it. */
export type Preview = {
  /** Always present, and never empty for a non-empty instruction. */
  opening: string;
  /** True when the opening is not the whole thing, so it is worth expanding. */
  more: boolean;
};

export function preview(instruction: string): Preview {
  const whole = instruction.trim();

  // A paragraph break is the author's own idea of where the opening ends, so it
  // is preferred over any count of characters.
  const firstLine = whole.split("\n", 1)[0].trim();
  const letters = characters(firstLine);
  if (letters.length <= OPENING_LENGTH) {
    return { opening: firstLine, more: firstLine !== whole };
  }

  return { opening: `${cut(letters)}…`, more: true };
}

/**
 * The first `OPENING_LENGTH` characters, ending on a word.
 *
 * Falls back to the hard cut when there is no space to break on, which is a URL
 * or a language that does not put spaces between words — both better shown
 * clipped than not shown. The hard cut is on a character boundary rather than a
 * code-unit one, so it can shorten an emoji sequence but never break one.
 */
function cut(letters: readonly string[]): string {
  const head = letters.slice(0, OPENING_LENGTH);
  const lastSpace = head.lastIndexOf(" ");
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).join("").trimEnd();
}
