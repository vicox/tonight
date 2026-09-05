import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { AuthenticatedUser } from "../identity.ts";
import { TasteError } from "../taste/model.ts";
import type { TasteStore } from "../taste/store.ts";

/**
 * The MCP server Tonight exposes, and the tools on it.
 *
 * Knows nothing about HTTP and nothing about SQL. It is handed an authenticated
 * user and a store already bound to them, and every tool is the same three steps:
 * the SDK validates the arguments against the schema, the store performs the
 * domain operation, the result is returned in both shapes a client might read. No
 * tool builds a query, and no tool decides who is asking.
 *
 * Whose taste model a tool touches is not something a tool can influence. The
 * store was opened for one user before this function was called and carries no
 * argument for a different one, so there is no `user_id` in any schema below and
 * nowhere for a client to put one.
 *
 * Every tool is deterministic. None interprets a sentence, invents a genre or
 * chooses a film, and there is no model behind any of them: each reads or writes
 * the taste model and answers the same way for the same arguments. The store holds
 * genres and mixes and nothing else — no catalogue, no titles, no film data.
 */

/** Named in `serverInfo`, and what a client shows the user. */
const SERVER_NAME = "Tonight";

/**
 * The MCP server's own version, which is the protocol surface's version and not
 * the web application's.
 */
const SERVER_VERSION = "0.1.0";

/**
 * The session a server instance is built for.
 *
 * `reference` is the opaque fingerprint of the user, derived elsewhere so this
 * file needs neither the signing key nor the configuration. `store` is already
 * scoped to `user`: see `lib/taste/store.ts` for why that is the isolation
 * mechanism rather than a check anything here performs.
 */
export type McpSession = {
  user: AuthenticatedUser;
  reference: string;
  store: TasteStore;
};

// --- shared field schemas --------------------------------------------------
//
// Described once, because the description is what a model reads to decide how to
// call a tool, and two tools disagreeing about what `name` means would be worse
// than either description being imperfect.

const genreName = z
  .string()
  .describe(
    'A genre\'s name — "Action", "Sci-Fi", "Slow burn". This is its only identifier; there is ' +
      "no separate id. Matched case-insensitively.",
  );

const mixName = z
  .string()
  .describe(
    'A mix\'s name — "Space Tension", "Popcorn Chaos". Its only identifier, matched ' +
      "case-insensitively. Genres and mixes have separate names: a genre called X and a mix " +
      "called X are different objects.",
  );

const genreInstruction = z
  .string()
  .describe(
    "What this genre means to THIS user, in their own words, written as their preference. Not a " +
      "dictionary definition of the genre: two users with an Action genre may mean opposite " +
      "things, and this is where the difference lives. Include what they rule out.",
  );

const mixInstruction = z
  .string()
  .describe(
    "What the combination means to the user. A mix is not the intersection of its genres — the " +
      "genres are the ingredients and this is the meaning. Say something the genres do not " +
      "already say on their own.",
  );

const mixGenres = z
  .array(z.string())
  .describe(
    "The exact names of the user's genres this mix is built from, at least one. Genres only — " +
      "a mix cannot be built from another mix. Passing this replaces the stored list.",
  );

/**
 * Builds a server bound to one authenticated user.
 *
 * A fresh instance per request, which is what the SDK's per-request factory
 * expects and what makes the binding trustworthy: the session is captured in this
 * closure, so a tool cannot read a different one and there is no shared instance
 * whose identity could be left over from the previous caller.
 */
export function tonightMcpServer(session: McpSession): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const { store } = session;

  server.registerTool(
    "get_server_info",
    {
      title: "Server information",
      description:
        "Reports that Tonight's MCP endpoint is reachable and that this session is authenticated. Takes no arguments and reads nothing.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      // `authenticated` is a constant, and that is the honest answer rather than a
      // stub: this code is only reachable through the bearer gate, so by the time
      // it runs the question has been settled. `user` is the opaque reference,
      // never the account, the address or any claim.
      answer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        authenticated: true,
        user: session.reference,
      }),
  );

  server.registerTool(
    "get_taste",
    {
      title: "Read the taste model",
      description:
        "The user's whole movie taste model: their genres, and the mixes built from them. A " +
        "genre is a reusable piece of what they like, with an instruction saying what it means " +
        "to them. A mix combines one or more genres and has an instruction of its own for what " +
        "the combination means. A new user has neither, which is the normal state rather than " +
        "an error. Read this before proposing anything: it is the vocabulary to reuse.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => attempt(() => store.taste()),
  );

  server.registerTool(
    "create_genre",
    {
      title: "Create a genre",
      description:
        "Define a new genre. The name must be unique among this user's genres, ignoring case. " +
        "The instruction is required: a genre with no stated meaning is a movie-database tag " +
        "rather than somebody's taste, and Tonight will not invent one. Write it from what the " +
        "user said. Write down what they told you, never what you concluded from it: the taste " +
        "model is theirs, and this writes to it.",
      inputSchema: z.object({ name: genreName, instruction: genreInstruction }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => attempt(async () => ({ genre: await store.createGenre(args) })),
  );

  server.registerTool(
    "update_genre",
    {
      title: "Update a genre",
      description:
        "Change a genre's name or what it means. Pass new_name to rename it — every mix built " +
        "from it follows the new name in the same write, so renaming never breaks a mix. " +
        "Refining an instruction is how a taste model gets better over time; propose the new " +
        "wording and let the user agree to it rather than editing on their behalf.",
      inputSchema: z.object({
        name: genreName.describe("The genre to change, by its current name."),
        new_name: genreName.describe("Rename the genre to this. Its mixes follow it.").optional(),
        instruction: genreInstruction.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ name, new_name: renamed, instruction }) =>
      attempt(async () => ({ genre: await store.updateGenre(name, { name: renamed, instruction }) })),
  );

  server.registerTool(
    "delete_genre",
    {
      title: "Delete a genre",
      description:
        "Remove a genre. Refused while any mix is built from it — change that mix's genres, or " +
        "delete the mix first. The refusal names the mixes in the way; tell the user which " +
        "choice they are making rather than picking for them.",
      inputSchema: z.object({ name: genreName }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ name }) => attempt(async () => ({ deleted: await store.deleteGenre(name) })),
  );

  server.registerTool(
    "create_mix",
    {
      title: "Create a mix",
      description:
        "Combine one or more of the user's genres into a mix of their own. Every named genre " +
        "must already exist; a mix cannot be built from another mix. Give it a name the user " +
        "would enjoy having — mixes are personal, and 'Space Tension' beats 'Sci-Fi Thriller'. " +
        "A mix is the shape of a recommendation idea, so the natural moment to write one is when " +
        "you have just used that idea to choose films the user asked for — but only when the " +
        "idea itself came from them. Having invented a combination, used it, and found films " +
        "that fit it is not what makes it their taste. Write down what they told you, never " +
        "what you concluded from it: the taste model is theirs, and this writes to it.",
      inputSchema: z.object({ name: mixName, genres: mixGenres, instruction: mixInstruction }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => attempt(async () => ({ mix: await store.createMix(args) })),
  );

  server.registerTool(
    "update_mix",
    {
      title: "Update a mix",
      description:
        "Change a mix's name, its meaning, or which genres it is built from. Passing genres " +
        "replaces the stored list rather than adding to it, and the list may never be empty.",
      inputSchema: z.object({
        name: mixName.describe("The mix to change, by its current name."),
        new_name: mixName.describe("Rename the mix to this.").optional(),
        genres: mixGenres.optional(),
        instruction: mixInstruction.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ name, new_name: renamed, genres, instruction }) =>
      attempt(async () => ({ mix: await store.updateMix(name, { name: renamed, genres, instruction }) })),
  );

  server.registerTool(
    "delete_mix",
    {
      title: "Delete a mix",
      description:
        "Remove a mix. Always allowed — nothing is built from a mix — and the genres it " +
        "combined are left alone.",
      inputSchema: z.object({ name: mixName }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ name }) => attempt(async () => ({ deleted: await store.deleteMix(name) })),
  );

  return server;
}

/**
 * One result, in both shapes a client might read.
 *
 * `structuredContent` is what a client that understands it should use; the JSON
 * in `content` is what one that does not will show the model instead. Both are
 * the same value, so the two kinds of client see the same answer.
 */
function answer(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

/**
 * Runs an operation, turning a refusal into a result rather than a failure.
 *
 * A tool error, not a protocol error: the call reached the tool and the tool
 * answered, so the caller gets the reason in a form it can read and act on — "a
 * genre called Action already exists" is guidance a model can correct for, not a
 * transport problem.
 *
 * Anything that is not a `TasteError` is ours rather than the caller's — a
 * database failure, a misconfigured deployment — and is left to the SDK, which
 * answers it without describing our internals or leaking what is missing.
 */
async function attempt(work: () => Promise<unknown>) {
  try {
    return answer(await work());
  } catch (error) {
    if (!(error instanceof TasteError)) throw error;
    return {
      isError: true as const,
      content: [{ type: "text" as const, text: error.message }],
    };
  }
}
