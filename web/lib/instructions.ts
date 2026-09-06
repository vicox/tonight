import {
  PROJECT_INSTRUCTIONS,
  PROJECT_INSTRUCTIONS_VERSION,
} from "./generated/project-instructions.ts";

/**
 * The text somebody pastes into a ChatGPT project to make Tonight work there.
 *
 * One place answers "what does the Copy button copy", and this is it. Today the
 * answer is the whole skill, mirrored by `npm run sync:instructions`; if the
 * skill turns out not to fit a ChatGPT project and we decide to derive a shorter
 * text from it, this module is what changes and nothing above it does.
 *
 * `skills/tonight-recommend/SKILL.md` stays the source of truth either way. It is
 * the file anybody edits, and `instructions.test.ts` fails when the mirror stops
 * matching it.
 */
export { PROJECT_INSTRUCTIONS };

/**
 * The digest carried by the last line of the text.
 *
 * Shown beside the copy button so a copy already pasted into somebody's project
 * can be recognised as old. Nothing reaches into that project to check — the
 * version is here so a person can compare, which is the most a pasted copy can
 * offer.
 */
export { PROJECT_INSTRUCTIONS_VERSION };

/**
 * How long that text is.
 *
 * Exported because it is the number that decides whether all of it arrives. The
 * cap is not documented anywhere reachable, so it was measured: pasted whole, a
 * 22,080-character version was cut off at 8,083. `instructions.test.ts` holds the
 * generated text below that, with room to spare.
 */
export const PROJECT_INSTRUCTIONS_LENGTH = PROJECT_INSTRUCTIONS.length;
