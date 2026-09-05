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
 * About one line at the width the cards are read at.
 *
 * Generous rather than tight: cutting a short instruction that would have fitted
 * costs a reader more than a line that runs slightly long.
 */
const OPENING_LENGTH = 120;

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
  if (firstLine.length <= OPENING_LENGTH) {
    return { opening: firstLine, more: firstLine !== whole };
  }

  return { opening: `${cut(firstLine)}…`, more: true };
}

/**
 * The first `OPENING_LENGTH` characters, ending on a word.
 *
 * Falls back to the hard cut when there is no space to break on, which is a URL
 * or a language that does not put spaces between words — both better shown
 * clipped than not shown.
 */
function cut(line: string): string {
  const head = line.slice(0, OPENING_LENGTH);
  const lastSpace = head.lastIndexOf(" ");
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).trimEnd();
}
