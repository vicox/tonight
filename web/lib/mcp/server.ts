import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { AuthenticatedUser } from "../identity.ts";
import {
  IMDB_ID_PATTERN,
  MAX_IMDB_ID_LENGTH,
  MAX_YEAR,
  MIN_YEAR,
  MOVIE_STATES,
  TasteError,
} from "../taste/model.ts";
import type { TasteStore } from "../taste/store.ts";
import { SERVER_NAME, SERVER_VERSION } from "./identity.ts";

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
 * the taste model and answers the same way for the same arguments. The store does
 * hold films — the ones the user told Tonight about — but only those: there is no
 * catalogue behind them, nothing is looked up, and no tool here recommends
 * anything.
 */

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
    'A genre\'s name — "Action", "Sci-Fi", "Slow burn". This is the only identifier Tonight ' +
      "takes: genres are addressed by name everywhere, and there is no id to look up or pass. " +
      "Matched case-insensitively.",
  );

const mixName = z
  .string()
  .describe(
    'A mix\'s name — "Space Tension", "Puzzle Pressure", "Small Town Secrets". Evocative, not ' +
      "descriptive: a genre is named for what it is and a mix for what it feels like, so if " +
      "knowing the genres already tells you the name, the name is doing no work. " +
      '"Smart, not heavy" and "Funny action" are genre lists, not mix names. The only ' +
      "identifier Tonight takes, matched case-insensitively. Genres and mixes have separate " +
      "names: a genre called X and a mix called X are different objects.",
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

const movieTitle = z
  .string()
  .describe(
    "A film's title, as the user writes it. Casing and punctuation are kept exactly; only " +
      "surrounding and repeated spaces are tidied. Half of how a movie is addressed — the year " +
      "is the other half — and matched case-insensitively.",
  );

// The bounds and the syntax below are the domain's own constants rather than
// numbers repeated here. The store checks them again and the column `CHECK`s
// them a third time — this layer exists so a client is told the shape in the
// schema it discovers, not so anything downstream can stop checking.
const movieYear = z
  .number()
  .int()
  .min(MIN_YEAR, `a movie's year must be between ${MIN_YEAR} and ${MAX_YEAR}`)
  .max(MAX_YEAR, `a movie's year must be between ${MIN_YEAR} and ${MAX_YEAR}`)
  .describe(
    "The film's release year. Required, because it is the other half of how a movie is " +
      "addressed: Dune 1984 and Dune 2021 are two films. Establish it before writing rather " +
      "than guessing — if you do not know it, ask.",
  );

const imdbId = z
  .string()
  // Trimmed before the syntax is judged, so this and the store agree about
  // `" tt0111161 "`. Neither of them accepts a blank one: there is exactly one
  // way to clear an id, and it is null.
  .trim()
  .max(MAX_IMDB_ID_LENGTH, "an IMDb title id is far shorter than that")
  .regex(
    IMDB_ID_PATTERN,
    "an IMDb title id looks like tt0111161 — tt followed by at least seven digits",
  )
  .nullable()
  .describe(
    'An IMDb title id — "tt0111161". Stored as a pointer and never looked up: Tonight does not ' +
      "ask IMDb anything. Omit it if you do not have one; pass null to clear one that is there. " +
      "An empty string is not a way to clear it and is refused.",
  );

const movieState = z
  .enum(MOVIE_STATES)
  .nullable()
  .describe(
    "What the user has said about this film, as one answer: not_seen (they said they have not " +
      "seen it), seen (they watched it and said nothing about it — not a neutral verdict), " +
      "liked, loved (strongly liked), disliked — those three also mean they saw it. Omit the " +
      "field when they have not said; that " +
      "records nothing, and it is not the same as not_seen. Pass null to go back to having " +
      "been told nothing. These are states the user expressed, never a score or star rating.",
  );

const movieMixes = z
  .array(z.string())
  .describe(
    "The exact names of the user's mixes this film belongs to. They must already exist, and a " +
      "film may be in none, one or several. Passing this replaces the whole list; an empty list " +
      "takes the film out of every mix.",
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
        "The user's whole movie taste model: their genres, the mixes built from them, and the " +
        "films they have told Tonight about. A genre is a reusable piece of what they like, " +
        "with an instruction saying what it means to them. A mix combines one or more genres " +
        "and has an instruction of its own for what the combination means; the films in it are " +
        "listed by title and year. Each film also appears once in movies, which is where the " +
        "rest of what the user said about it lives — one state out of not_seen, seen, liked, " +
        "loved and disliked, or null for never told. A new user has none of it, which is the normal state " +
        "rather than an error. Read this before proposing anything: it is the vocabulary to " +
        "reuse, and the only record of what they have said they watched.",
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
        "user stated as lasting taste, or from a meaning you put to them and they confirmed — " +
        "never from what you concluded alone, films you chose and patterns you noticed " +
        "included, and never from a request for tonight, which says what they want now rather " +
        "than what they are like. A confirmation covers only the meaning they were shown, and " +
        "settles that it is theirs rather than granting permission to write.",
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
        "must already exist; a mix cannot be built from another mix. Name it the way a shelf in " +
        "a good video shop is named, not the way a filter is: 'Space Tension' beats " +
        "'Sci-Fi Thriller', and the test is whether they would ask for it by name in a month. " +
        "A mix is the shape of a recommendation idea, so the moment to write one is just after " +
        "using that idea to choose films — but only when the user stated the idea as lasting " +
        "taste, or confirmed a meaning you put to them. Wanting something tonight is not that, " +
        "and having invented a combination, used it and found films that fit is not what makes " +
        "it theirs. A confirmation covers only the meaning they were shown, and settles that " +
        "it is theirs rather than granting permission to write.",
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

  server.registerTool(
    "create_movie",
    {
      title: "Save a movie",
      description:
        "Record a film the user told you about, and what they said about it. A recommendation " +
        "is not a saved movie: naming three films persists nothing, and neither does the user " +
        "liking your suggestion of one. Write only Movie identity and state the user expressed, " +
        "or a meaning you put to them and they confirmed — and a confirmation covers only the " +
        "meaning they were shown, settling that it is theirs rather than granting permission to " +
        "write. Absence is never not_seen: leave state out when you were not told, because " +
        "having said nothing is not the same as having said they have not seen it. Addressed " +
        "by title and year together, so establish the year before writing.",
      inputSchema: z.object({
        title: movieTitle,
        year: movieYear,
        imdb_id: imdbId.optional(),
        state: movieState.optional(),
        mixes: movieMixes.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ title, year, imdb_id: imdbId, state, mixes }) =>
      attempt(async () => ({
        movie: await store.createMovie({ title, year, imdbId, state, mixes }),
      })),
  );

  server.registerTool(
    "update_movie",
    {
      title: "Update a movie",
      description:
        "Change what is stored about a saved film, or which mixes it is in. Addressed " +
        "by its current title and year; new_title and new_year change either half and the film " +
        "stays the same object, so its filings follow it. Omitting a field leaves it alone — " +
        "passing null is what clears one back to unknown, and the two are not the same. " +
        "Absence is never not_seen: say a state only when they said it. A recommendation is " +
        "not a saved movie here either — proposing a film, or the user watching one you " +
        "proposed, is nothing Tonight knows unless they said so. Write only what they " +
        "expressed or confirmed, and a confirmation covers only the meaning they were shown; " +
        "it is not permission to write more than that.",
      inputSchema: z.object({
        title: movieTitle.describe("The film to change, by its current title."),
        year: movieYear.describe("The film to change, by its current year."),
        new_title: movieTitle.describe("Retitle the film to this.").optional(),
        new_year: movieYear.describe("Change the release year to this.").optional(),
        imdb_id: imdbId.optional(),
        state: movieState.optional(),
        mixes: movieMixes.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({
      title,
      year,
      new_title: retitled,
      new_year: reyeared,
      imdb_id: imdbId,
      state,
      mixes,
    }) =>
      attempt(async () => ({
        movie: await store.updateMovie(title, year, {
          title: retitled,
          year: reyeared,
          imdbId,
          state,
          mixes,
        }),
      })),
  );

  server.registerTool(
    "delete_movie",
    {
      title: "Delete a movie",
      description:
        "Forget a film the user saved. Always allowed: it leaves every mix it was in and the " +
        "mixes themselves are left alone. Addressed by title and year together.",
      inputSchema: z.object({ title: movieTitle, year: movieYear }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ title, year }) =>
      attempt(async () => ({ deleted: await store.deleteMovie(title, year) })),
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
