/**
 * Mirrors the skill into the web application, so the website can hand somebody
 * the text to paste into a ChatGPT project.
 *
 *   npm run sync:instructions
 *
 * `skills/tonight-recommend/SKILL.md` is the source of truth and the only file
 * anybody edits. This writes a module beside it that the app can import — a
 * module rather than a copy of the markdown, because a `.md` read at runtime
 * would have to survive bundling and output tracing, and an imported string
 * simply cannot go missing from a deployment.
 *
 * The generated file is committed. That is not a second version to maintain:
 * `lib/instructions.test.ts` fails the moment it stops matching the skill, and
 * the failure names this command. Committing it is what lets a fresh checkout
 * typecheck, test and build without a prebuild step in the way.
 *
 * ## The transform, in three steps
 *
 * 1. Strip the YAML frontmatter. It names the skill for a host that discovers
 *    skills, and inside a ChatGPT project it is noise.
 * 2. Hash what remains, over the body after step 1 and over nothing else.
 * 3. Append one line carrying that digest, after a blank line, at the end.
 *
 * Nothing is rewritten, shortened or reflowed; step 3 adds a line rather than
 * changing one. "Byte for byte" means byte for byte with the output of these
 * three steps, and `projectInstructionsFrom` is the whole of it.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, "..", "..", "skills", "tonight-recommend", "SKILL.md");
const TARGET = join(here, "..", "lib", "generated", "project-instructions.ts");

/** Step 1: the skill without its frontmatter block. */
export function instructionsFrom(markdown) {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n+/;
  return markdown.replace(frontmatter, "").trim() + "\n";
}

/**
 * Step 2: a short digest of the body.
 *
 * Of the body *before* the marker is appended, which is the only order that
 * works — hashing text that already carried the digest would be circular.
 *
 * Eight hex characters. This distinguishes one release of the instructions from
 * another for somebody comparing two strings by eye; it is not defending against
 * anybody choosing a collision, so the length is set by what a person can hold in
 * their head rather than by a security margin.
 */
export function versionOf(body) {
  return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 8);
}

/**
 * Step 3's line.
 *
 * Addressed to a person, though the assistant reads it too: it is one line of
 * metadata inside a document of instructions, and that is the price of a pasted
 * copy that can say how old it is. Says what to do about being out of date,
 * because a version somebody cannot act on is trivia.
 */
export function markerFor(version) {
  return (
    `Tonight project instructions · version ${version} · ` +
    `replace these when tonight.movie shows a different version.`
  );
}

/** The whole transform: the skill as the text somebody pastes. */
export function projectInstructionsFrom(markdown) {
  const body = instructionsFrom(markdown);
  return `${body}\n${markerFor(versionOf(body))}\n`;
}

/** The generated module, with the text as a template literal. */
function moduleFor(instructions, version) {
  // Only the three sequences a template literal can end or escape out of. The
  // instructions are prose and markdown, so this is belt and braces rather than
  // something that has come up.
  const escaped = instructions
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");

  return `/**
 * The skill, as the text somebody pastes into a ChatGPT project.
 *
 * GENERATED — do not edit. Change \`skills/tonight-recommend/SKILL.md\` and run
 * \`npm run sync:instructions\`. \`lib/instructions.test.ts\` fails if this drifts.
 */
export const PROJECT_INSTRUCTIONS = \`${escaped}\`;

/** The digest in the last line of the text above, for the website to show. */
export const PROJECT_INSTRUCTIONS_VERSION = "${version}";
`;
}

/**
 * Only when run as a command, never on import.
 *
 * `instructions.test.ts` imports the transform to check the committed module
 * still matches the skill. Writing at module scope would make that test repair
 * the drift it exists to report, and it would pass on the second run whatever
 * had happened on the first.
 */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const skill = readFileSync(SOURCE, "utf8");
  const instructions = projectInstructionsFrom(skill);
  const version = versionOf(instructionsFrom(skill));

  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, moduleFor(instructions, version), "utf8");

  console.log(
    `Wrote lib/generated/project-instructions.ts — ` +
      `${instructions.length} characters, version ${version}.`,
  );
}
