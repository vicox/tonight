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
 * ## Two renderings, one document
 *
 * A ChatGPT project caps its instructions at about eight thousand characters and
 * silently truncates the rest, so the skill cannot be pasted whole: more than half
 * of it would never reach the agent. What ships instead is the same document with
 * its rationale removed.
 *
 * The removal is marked in the source rather than worked out here. Anything
 * between `<!-- full:start -->` and `<!-- full:end -->` is explanation, worked
 * example or diagram — it belongs in the skill somebody reads and not in the text
 * an agent is given. Everything else goes.
 *
 * **Unmarked content ships.** That direction is the whole safety property: a rule
 * written without thinking about this file still reaches the agent. Marking what
 * to *keep* instead would mean a new rule silently never shipping, which is the
 * failure this mechanism exists to end.
 *
 * ## The transform, in four steps
 *
 * 1. Strip the YAML frontmatter. It names the skill for a host that discovers
 *    skills, and inside a ChatGPT project it is noise.
 * 2. Remove every `full:start` … `full:end` block, then collapse the blank lines
 *    they leave behind. Unbalanced markers are an error rather than a guess.
 * 3. Hash what remains, over the body after step 2 and over nothing else — so the
 *    version changes exactly when what the agent sees changes.
 * 4. Append one line carrying that digest, after a blank line, at the end.
 *
 * Nothing is summarised, reworded or reflowed. Every sentence in the output is a
 * sentence in the skill, and `projectInstructionsFrom` is the whole of it.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, "..", "..", "skills", "tonight-recommend", "SKILL.md");
const TARGET = join(here, "..", "lib", "generated", "project-instructions.ts");

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n+/;

/** A block that belongs to the skill somebody reads and not to the agent. */
const FULL_ONLY = /^[ \t]*<!--[ \t]*full:start[ \t]*-->[\s\S]*?^[ \t]*<!--[ \t]*full:end[ \t]*-->[ \t]*\r?\n?/gm;

const OPENS = /<!--[ \t]*full:start[ \t]*-->/g;
const CLOSES = /<!--[ \t]*full:end[ \t]*-->/g;

/** Steps 1 and 2: the skill without its frontmatter and without its rationale. */
export function instructionsFrom(markdown) {
  const opens = (markdown.match(OPENS) ?? []).length;
  const closes = (markdown.match(CLOSES) ?? []).length;
  if (opens !== closes) {
    // Left to the regex this would silently keep a block or eat the rest of the
    // file, and the first anybody would know is an agent behaving oddly.
    throw new Error(`unbalanced full:start/full:end in the skill: ${opens} open, ${closes} closed`);
  }

  const body = markdown.replace(FRONTMATTER, "").replace(FULL_ONLY, "");
  return body.replace(/\n{3,}/g, "\n\n").trim() + "\n";
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
