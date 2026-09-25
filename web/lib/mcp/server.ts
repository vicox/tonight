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
import {
  beginEpisode,
  EpisodeError,
  MAX_OFFERED,
  MAX_REQUEST_LENGTH,
  type Correction,
} from "../episodes/model.ts";
import type { EpisodeStore } from "../episodes/store.ts";
import {
  JUDGEMENTS,
  MAX_OCCASION_LENGTH,
  MAX_REASON_LENGTH,
  REACHES,
  stateVerdict,
  TOLD,
  VerdictError,
  withdrawVerdict,
  type Act,
  type Film,
  type Identified,
  type Judgement,
  type Reach,
  type Scope,
  type Standing,
} from "../verdicts/model.ts";
import { current, spoken, supersession } from "../verdicts/model.ts";
import { compose } from "../memory/model.ts";
import { disagrees } from "../precedence.ts";
import { filmKey } from "../films/identity.ts";
import type { MovieState } from "../taste/model.ts";
import type { QuestionStore } from "../verdicts/questions.ts";
import type { VerdictStore } from "../verdicts/store.ts";
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
  /**
   * Opened for the same user, and separate from the taste store on purpose.
   * Episodes are what happened; taste is what they told us. Nothing here reads
   * one to write the other.
   */
  episodes: EpisodeStore;
  /**
   * Opened for the same user, and separate again on purpose. An episode is what
   * happened; a verdict is what they thought of it. Nothing here reads one to
   * write the other, and the chain stops before liking exactly as M1 says.
   */
  verdicts: VerdictStore;
  /**
   * Which films are waiting on an answer — Tonight's own note, not the user's.
   * Inert: it is read inside a conversation the user began, and nothing here
   * ever makes Tonight appear on its own.
   */
  questions: QuestionStore;
};

// --- shared field schemas --------------------------------------------------
//
// The episode fields sit here with the taste fields for the same reason: a
// description is what a model reads to decide how to call a tool, so each is
// written once.

const episodeId = z.string().uuid().describe("The evening, by the id a read returned.");

/**
 * How one verdict act is named, wherever a caller may name one.
 *
 * The same syntax an evening is addressed by, because it is the same kind of
 * handle and a second format for the same idea would be one to get wrong. What
 * it buys is not authorisation — a well-formed reference to somebody else's act
 * is still just a string here — but a place for a malformed one to stop, before
 * the store compares it to a uuid column and the database answers with its own
 * complaint about the type.
 */
const actReference = z.string().uuid();

const episodeRequest = z
  .string()
  .min(1)
  .max(MAX_REQUEST_LENGTH)
  .describe("What they asked for, in their own words. Not a paraphrase and not a summary.");

const episodeOffers = z
  .array(
    z.object({
      title: z.string().min(1).describe("The film's title, as you named it."),
      year: z.number().int().describe("Its release year."),
      lead: z.boolean().describe("Whether this was the one you led with, or one of the others."),
    }),
  )
  .max(MAX_OFFERED)
  .describe(
    "The films you put forward, in the order you put them. Empty if you named none. The same " +
      "film is not offered twice, and only one of them leads.",
  );

const episodeChosen = z
  .object({
    title: z.string().min(1).describe("The film's title."),
    year: z.number().int().describe("Its release year."),
  })
  .nullable()
  .optional()
  .describe(
    "The film they said they went with, which has to be one that evening offered. Null takes " +
      "the choice back to not known. Leave out to keep what is recorded.",
  );

const episodeFlag = z.boolean().nullable().optional();

const verdictFilm = z
  .object({
    title: z.string().min(1).describe("The film's title."),
    year: z.number().int().describe("Its release year."),
  })
  .describe("The film they were talking about. Title and year together name it.");

const verdictTold = z
  .enum(TOLD)
  .describe(
    "How they came to say it. `volunteered` if they said it unasked; `confirmed` if they " +
      "answered a question you put. Both are theirs and both count — but they are not equally " +
      "strong evidence, so record which actually happened rather than guessing.",
  );

const verdictOccasion = z
  .string()
  .min(1)
  .max(MAX_OCCASION_LENGTH)
  .describe(
    "The evening this applies to, named by any stable identifier for it. Required for " +
      "`not-tonight` and refused for anything else.",
  );

const verdictWords = (what: string) =>
  z
    .string()
    .min(1)
    .max(MAX_REASON_LENGTH)
    .nullable()
    .optional()
    .describe(
      `${what} Their words, not yours. Leave it out where they did not say — an explanation ` +
        "you worked out is not something they told you.",
    );
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
      "things, and this is where the difference lives. Include what they rule out. Write it in " +
      "the user's first person — it is their sentence about themselves, not a note about them.",
  );

const mixInstruction = z
  .string()
  .describe(
    "What the combination means to the user. A mix is not the intersection of its genres — the " +
      "genres are the ingredients and this is the meaning. Say something the genres do not " +
      "already say on their own. Write it in the user's first person — it is their sentence " +
      "about themselves, not a note about them.",
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
      "liked, loved (strongly liked), disliked — those three also mean they saw it. Take the " +
      "state from what they said, at its most specific: \"haven't seen it\" / \"want to watch " +
      "it\" -> not_seen, \"seen it\" -> seen, \"it was good\" -> liked, \"loved it\" -> loved, " +
      "\"didn't like it\" -> disliked. Omit the " +
      "field when they have not said; that " +
      "records nothing, and it is not the same as not_seen. Pass null to go back to having " +
      "been told nothing — and only where clearing the saved state is itself what they asked " +
      "for. **Null is not a way to tidy up after something else.** Forgetting or withdrawing a " +
      "verdict leaves the saved state standing on purpose, because it is what applies once no " +
      "verdict overlays it; clearing it then destroys a second thing they never asked you to " +
      "remove. If they asked for both, do both. These are states the user expressed, never a " +
      "score or star rating — " +
      "and never where a fresh opinion goes: what they say about a film now is a verdict, and " +
      "`record_verdict` is what records it.",
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
  const { store, episodes, verdicts, questions } = session;
  // The instant a claim is made is the server's to know, not a caller's to
  // state: a tool that accepted a timestamp would let a model backdate what
  // somebody said, and when they said it is part of the claim.
  const now = (): string => new Date().toISOString();

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
        "rather than an error. It is context and the vocabulary to reuse when writing — not a " +
        "list of what may be recommended, and a genre or mix existing does not by itself say " +
        "they like it. It is the only record of what they have said they watched. Every genre, " +
        "mix and movie also carries createdAt and updatedAt: when Tonight wrote it, and when " +
        "it last changed — which includes a mix's genres changing and a movie being filed " +
        "differently. Both are Tonight's own, ISO 8601 in UTC. No tool takes either, and " +
        "nothing you send can set or move them. createdAt is null on a film saved before " +
        "Tonight recorded creation times; that is not known rather than not set.\n\n" +
        "`verdicts` is what they have since said about particular films, in their own words, and " +
        "it is separate from movies on purpose: a state is how a film is filed, a verdict is what " +
        "they told you about it. Each entry names the film and either a judgement — liked, loved " +
        "or disliked — or a rejection: `not-ever` turns the film down for good, `not-tonight` " +
        "turns it down for one evening and carries the `occasion` it belongs to. Where they said " +
        "why, `because` holds their words for a judgement and `reason` for a rejection; where " +
        "they did not, neither is there, and you have none to offer — and where they did, use their " +
        "words as they said them and do not make them stronger: \"the tension never lets up\" is " +
        "not \"you love tense films\". `told` says whether they " +
        "volunteered it or answered a question you put — the first tells you more than the " +
        "second, and neither is a number.\n\n" +
        "A refusal reaches exactly as far as they said and no further. `not-tonight` is about " +
        "that evening: outside it the film stands where it stood, it never becomes a dislike, " +
        "and it is never a reason to avoid films like it. `not-ever` stops that film for good — " +
        "that film, not its genre, its director or anything resembling it. One film refused is " +
        "one film refused.\n\n" +
        "Only what currently stands is here. A verdict they corrected shows as the correction and " +
        "the one it replaced is gone from this list; one they took back is gone too, and the " +
        "film's state in movies is what is left of what they said — unchanged, and true again. " +
        "An evening whose refusal they withdrew has nothing of its own once more. Nothing else " +
        "about a film reaches this list: not that you recommended it, not that they watched or " +
        "finished it, not a question of yours waiting on an answer, and not how long any of it " +
        "has been true.\n\n" +
        "`disagreements` appears when a film they filed one way and something they still say " +
        "pull different ways. It names the film, the `saved` state, what is `governedBy` it, and " +
        "— the part to read carefully — where it `applies`: `everywhere`, or one evening. A " +
        "`not-tonight` applies **only** in the evening it names, and outside it the saved state " +
        "is the base as it always was. Nothing here is new: both sides are already above, and " +
        "this only says which governs and where. It is absent when nothing disagrees.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      attempt(async () => {
        // Two sources, kept apart. The taste model is what they filed; the
        // verdicts are what they have since said about particular films, and
        // which of those still stands is resolved by the verdict model rather
        // than assembled here.
        const [taste, said] = await Promise.all([store.taste(), verdicts.standing()]);
        const clashes = disagreements(taste.movies, said);
        // Absent rather than empty, both of them: a user with no verdicts and no
        // disagreement reads exactly as they did before either existed. An empty
        // list would say there is nothing to say, which is what saying nothing
        // already does.
        return {
          ...taste,
          ...(said.length === 0 ? {} : { verdicts: said }),
          ...(clashes.length === 0 ? {} : { disagreements: clashes }),
        };
      }),
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
        "replaces the stored list rather than adding to it, and the list may never be empty. " +
        "Never reword their instruction: the sentence is theirs, and what it means is not " +
        "yours to adjust.",
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
        "File a film the user told you about, with the state it carries. What they are telling " +
        "you about a film — that they loved it, that it is not for tonight, that they never want " +
        "it again — is a verdict and belongs to `record_verdict`; it is never written here as a " +
        "state. A recommendation " +
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
        "Absence is never not_seen: say a state only when they said it. What they are telling " +
        "you now about a film is a verdict, not a state: `record_verdict` records it, and " +
        "`withdraw_verdict` takes one back, after which the state stored here is what is left. " +
        "A recommendation is " +
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
        "Forget a film the user saved, where removing it is itself what they asked for. It " +
        "leaves every mix it was in and the mixes themselves are left alone. Addressed by " +
        "title and year together.\n\n" +
        "**Not a way to tidy up after something else.** Forgetting or withdrawing a verdict " +
        "leaves the saved film standing on purpose, because it is what applies once no verdict " +
        "overlays it; deleting it then destroys a second thing they never asked you to remove. " +
        "If they asked for both, do both.",
      inputSchema: z.object({ title: movieTitle, year: movieYear }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ title, year }) =>
      attempt(async () => ({ deleted: await store.deleteMovie(title, year) })),
  );

  // --- episodes ------------------------------------------------------------
  //
  // What happened on an evening, which is not what the user likes. These tools
  // write history and never taste: nothing below reads a genre, a mix or a movie
  // state, and nothing below writes one. A film recorded as offered is a film
  // Tonight mentioned once, not a film the user has told Tonight about.

  server.registerTool(
    "record_episode",
    {
      title: "Record an evening",
      description:
        "Write down an evening Tonight was part of: what they asked for, in their own words, " +
        "and the films that were put forward. Record only what you actually observed — the " +
        "request as they phrased it and the films you named. What they went on to do is not " +
        "something you saw, so leave it out here and record it later if they say. Offering a " +
        "film is not the same as them choosing it.",
      inputSchema: z.object({ request: episodeRequest, offered: episodeOffers }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ request, offered }) =>
      attempt(async () => ({ episode: await episodes.record(beginEpisode(request, offered)) })),
  );

  server.registerTool(
    "get_episodes",
    {
      title: "Read the evenings",
      description:
        "Every evening recorded for this user, oldest first, with what was asked, what was " +
        "offered, and whatever they said happened. Each of chosen, watched and finished is " +
        "either known — with the value they stated — or not known at all. Not known means " +
        "nobody ever said, and it is a complete answer rather than a gap: do not read it as no, " +
        "and do not fill it in from what seems likely.\n\n" +
        "`requestSource` and `offeredSource` say where those two came from. `observed` means " +
        "Tonight received that request itself, or itself put those films forward, at the time. " +
        "`stated` means the user later corrected it, so what the field now says is theirs " +
        "rather than yours. Both are about the record and never about the film: a corrected " +
        "evening says nothing about what they like, and neither value is something you worked " +
        "out.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => attempt(async () => ({ episodes: await episodes.episodes() })),
  );

  server.registerTool(
    "correct_episode",
    {
      title: "Record or correct what happened",
      description:
        "Put an evening right. Two kinds of thing are correctable here and they are not the " +
        "same: what the user told you happened, and what you yourself wrote down at the time. " +
        "Correcting the request or the films offered marks that fact as theirs rather than " +
        "yours, because a record you had to be corrected on is no longer something you " +
        "witnessed.\n\n" +
        "Say what the user told you about an evening: which film they went with, whether they " +
        "watched it, whether they finished it. Only ever from what they said. Choosing is not " +
        "watching, watching is not finishing, and finishing is not liking — a later one is never " +
        "implied by an earlier one, so pass only the ones they actually told you about. Pass " +
        "null to take something back to not known, which is what a correction to silence is. " +
        "Leave a field out to keep it as it is. The film they chose has to be one of the films " +
        "that evening offered.",
      inputSchema: z.object({
        episode: episodeId,
        request: episodeRequest
          .optional()
          .describe(
            "What they actually asked for, if you wrote it down wrongly. Replaces it, in their " +
              "own words. It cannot be blank: an evening without a request is not an evening.",
          ),
        offered: episodeOffers
          .optional()
          .describe(
            "The films you actually put forward, if the list is wrong. Replaces it whole rather " +
              "than adding to it. An empty list is allowed and means you named no film — but " +
              "not while they are still recorded as having chosen one, so correct what they " +
              "chose in the same call if you are taking that film away.",
          ),
        chosen: episodeChosen,
        watched: episodeFlag.describe(
          "True or false as they said it, or null to take it back to not known. Leave out to " +
            "keep what is recorded.",
        ),
        finished: episodeFlag.describe(
          "True or false as they said it, or null to take it back to not known. Leave out to " +
            "keep what is recorded. Never inferred from watching.",
        ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ episode, request, offered, chosen, watched, finished }) =>
      attempt(async () => {
        // Each key is forwarded only when the caller sent it, because an absent
        // field means "leave it alone" and a present null means "take it back".
        // Collapsing the two here would make retraction unsayable.
        const statement: Correction = {};
        if (request !== undefined) statement.request = request;
        if (offered !== undefined) statement.offered = offered;
        if (chosen !== undefined) {
          statement.chosen = chosen === null ? null : { ...chosen, lead: false };
        }
        if (watched !== undefined) statement.watched = watched;
        if (finished !== undefined) statement.finished = finished;
        return { episode: await episodes.correct(episode, statement) };
      }),
  );

  server.registerTool(
    "forget_episode",
    {
      title: "Forget an evening",
      description:
        "Remove an evening and the films it offered. It is gone: not hidden, not archived, and " +
        "it will not come back in a later read. Use it when the user asks you to forget one.",
      inputSchema: z.object({ episode: episodeId }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ episode }) => attempt(async () => ({ forgotten: await episodes.forget(episode) })),
  );

  // --- verdicts ------------------------------------------------------------
  //
  // What the user said about a film. Only they can say it, so every tool below
  // records something they actually stated and none of them concludes anything:
  // a film watched is not a film liked, a film finished is not a film liked, and
  // a question that went unanswered is not an answer.

  server.registerTool(
    "record_verdict",
    {
      title: "Record what they said about a film",
      description:
        "Write down what they told you they thought of a film. Only what they actually said — " +
        "watching a film is not liking it, finishing one is not liking it, and taking your " +
        "recommendation is not liking it either. Silence is not a verdict at all.\n\n" +
        "A judgement is liked, loved or disliked, and it is about the film, so it applies " +
        "everywhere. A rejection is different: `not-ever` is about the film and also applies " +
        "everywhere, but `not-tonight` is about one evening — it says nothing about the film, " +
        "so it needs the occasion it belongs to and never stands beyond it. Keep their own " +
        "words for why, where they gave them.\n\n" +
        "Changed their mind? Record the new verdict; it supersedes the old one and the old one " +
        "stays in the history. Nothing is rewritten. If a question about this film was waiting " +
        "on an answer, this closes it.",
      inputSchema: z.object({
        film: verdictFilm,
        told: verdictTold,
        said: z
          .discriminatedUnion("about", [
            z.object({
              about: z.literal("judgement"),
              judgement: z.enum(JUDGEMENTS).describe("What they said about it."),
              because: verdictWords("Why, if they said why."),
            }),
            z.object({
              about: z.literal("rejection"),
              reach: z
                .enum(REACHES)
                .describe(
                  "`not-tonight` turns it down for one evening and means nothing beyond it; " +
                    "`not-ever` turns it down for good.",
                ),
              reason: verdictWords("Why they turned it down, if they said."),
              occasion: verdictOccasion.optional(),
            }),
          ])
          .describe("What they said: a judgement about the film, or a refusal of it."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ film, told, said }) =>
      attempt(async () => {
        const assertion =
          said.about === "judgement"
            ? { about: "judgement" as const, judgement: said.judgement, because: said.because }
            : {
                about: "rejection" as const,
                rejection: { reach: said.reach, reason: said.reason ?? null },
              };
        const scope: Scope =
          said.about === "rejection" && said.occasion !== undefined
            ? { occasion: said.occasion }
            : "everywhere";
        // The claim is written first, and the note is closed after. If closing
        // fails the user's verdict still stands and an inert question is left to
        // retire on its own; the other order could lose what they said in order
        // to tidy up something that was never theirs.
        const verdict = await verdicts.say(stateVerdict(film, assertion, told, now(), scope));
        await questions.close(film);
        return { verdict: written(verdict) };
      }),
  );

  server.registerTool(
    "withdraw_verdict",
    {
      title: "Take back what they said about a film",
      description:
        "They no longer stand by what they told you. This leaves no current verdict for that " +
        "scope — not a neutral one, and certainly not a dislike: taking back \"I loved it\" " +
        "means they have said nothing, the way it was before they spoke.\n\n" +
        "Withdraw in the scope the claim was made in. A judgement or a `not-ever` is global, so " +
        "leave the occasion out; an evening's `not-tonight` is taken back by naming that " +
        "evening, and doing so restores whatever applied before it rather than silencing the " +
        "evening.\n\n" +
        "The history is kept. What they said and that they took it back are both true.",
      inputSchema: z.object({ film: verdictFilm, occasion: verdictOccasion.optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ film, occasion }) =>
      attempt(async () => ({
        withdrawal: written(
          await verdicts.say(
            withdrawVerdict(film, now(), occasion === undefined ? "everywhere" : { occasion }),
          ),
        ),
      })),
  );

  server.registerTool(
    "get_verdicts",
    {
      title: "What they have said about a film",
      description:
        "Everything they have said about one film, and which of it stands now. Ask about an " +
        "occasion to see what applies on that evening: an evening's `not-tonight` shows there " +
        "and nowhere else, and where an evening has nothing of its own the global claim shows " +
        "through.\n\n" +
        "`current` is null when they have said nothing, or when they took back what they said. " +
        "Both are silence, and neither is a preference you may act on as though it were one." +
        "\n\nThis reads what they said and nothing else: verdicts and takings-back, for one film. " +
        "It cannot see a saved film's state, a genre, a mix or an evening, so it cannot tell you " +
        "whether what they said disagrees with any of those. **Never conclude from this read that " +
        "nothing conflicts.** A question about a contradiction, or about what Tonight holds as a " +
        "whole, is `get_memory`'s — it names both sides of a disagreement and says which governs.",
      inputSchema: z.object({ film: verdictFilm, occasion: verdictOccasion.optional() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ film, occasion }) =>
      attempt(async () => {
        const history = await verdicts.history(film as Film);
        const asked: Scope = occasion === undefined ? "everywhere" : { occasion };
        // What leaves is what they said. Persistence hangs two handles on an act
        // — the order the table accepted it in, and the reference it is known
        // by — and neither is part of the claim. The order is machinery and was
        // never anybody's business out here; the reference is real, but nothing
        // on this surface can act on one yet, and an identifier a caller cannot
        // use is an invitation to invent a use for it.
        const held = current(history, asked);
        return {
          film,
          current: held === null ? null : spoken(held),
          superseded: supersession(history).map(({ verdict, by }) => ({
            verdict: spoken(verdict),
            by: spoken(by),
          })),
          history: history.map(spoken),
          // What this read answers for, said in the answer rather than left to
          // be remembered from the description. A constant, and nothing above is
          // consulted to build it: a coverage line that changed with whether a
          // saved film existed would report the existence of the very root this
          // read cannot see.
          coverage: VERDICT_COVERAGE,
        };
      }),
  );

  server.registerTool(
    "get_open_questions",
    {
      title: "Films waiting on an answer",
      description:
        "Which films you have something to ask about, oldest first. This is your own note, not " +
        "anything they told you: a film waiting here says nothing about whether they liked it, " +
        "and a question that has waited a long time says nothing either.\n\n" +
        "Read it while you are already talking with them, and ask at most where it fits what " +
        "they came for. It is never a reason to start a conversation — Tonight does not get in " +
        "touch on its own. Reading this costs the question nothing.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => attempt(async () => ({ questions: await questions.pending(now()) })),
  );

  server.registerTool(
    "record_opportunity",
    {
      title: "Note that a chance to ask went by",
      description:
        "Say that there was a real chance to ask about this film — they were here, you were " +
        "already talking, and the question would have fitted — and no answer came of it. Only " +
        "call this when that was actually true; reading the open questions is not a chance, and " +
        "neither is anything happening while nobody is here.\n\n" +
        "A question retires after three such chances, or thirty days, whichever comes first. " +
        "Retiring removes the question and means nothing else: it is not a dislike, not a " +
        "refusal, and not an answer. If they do answer, record the verdict instead — that closes " +
        "the question without any of this mattering.",
      inputSchema: z.object({ film: verdictFilm }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ film }) =>
      attempt(async () => ({ question: await questions.opportunity(film as Film, now()) })),
  );

  // --- memory --------------------------------------------------------------
  //
  // What Tonight remembers, and what it makes of it. Nothing here writes, and
  // nothing here decides anything the stores have not already decided: the
  // arranging is `lib/memory/model.ts`'s, which is where the placement rules
  // and the precedence have contracts on them.

  server.registerTool(
    "get_memory",
    {
      title: "Everything Tonight remembers about them",
      description:
        "The whole of what Tonight holds about this user, in three parts, so that \"what do " +
        "you know about me?\" has a complete and honest answer.\n\n" +
        "`held` is what it currently holds as theirs: their genres, their mixes, the films they " +
        "saved, and the verdicts that still stand. `operative` is only the places where two of " +
        "those disagree about one film — it names both and says which one governs, and it is " +
        "not a second copy of `held`. `remembered` is what it remembers happening: evenings, " +
        "verdicts they replaced, verdicts they took back. **Remembered is not evidence about " +
        "them.** An evening is not a preference, and something they stopped saying is not " +
        "something they say.\n\n" +
        "Every entry carries where it came from and, where one exists, the handle you correct " +
        "it by: a genre or mix by its name, a film by title and year, an evening by its id, and " +
        "one thing they said by its `ref`. A verdict's `ref` is what `forget_verdict` takes. An " +
        "evening also says where its own record came from: `requestSource` and `offeredSource` " +
        "are `observed` where Tonight received the request or put the films forward itself, and " +
        "`stated` where the user later corrected it.\n\n" +
        "`coverage` says what this read answers for — `held`, `operative` and `remembered` are " +
        "the whole of Memory — and what it leaves out. A question you are carrying is your own " +
        "note rather than something they told you, so it is excluded here and read with " +
        "`get_open_questions`. It is the same either way, so their absence from this answer is " +
        "never evidence that there are none.\n\n" +
        "This is for explaining and correcting, not for recommending. `get_taste` is what a " +
        "recommendation reads; this holds history beside belief on purpose, and using the " +
        "history as though it were taste is the one thing it must not be used for. Reading it " +
        "writes nothing and changes nothing.\n\n" +
        "One thing is deliberately not here: a question you are carrying about a film is your " +
        "own note, not something Tonight knows about them, so it is left out on purpose. Its " +
        "absence here is therefore no evidence that there is none — **never say there are no " +
        "open questions on the strength of this read.** `get_open_questions` is the only read " +
        "that can answer that, and it belongs to you rather than to them either way.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      attempt(async () => {
        // Three reads and one call. The boundary gathers roots; what is held,
        // what governs and what is merely remembered is the memory model's
        // answer, and asking it twice in two places is how two answers start.
        const [taste, acts, evenings] = await Promise.all([
          store.taste(),
          verdicts.acts(),
          episodes.episodes(),
        ]);
        // The composer's answer, unchanged, plus what this read does not reach.
        // `COVERAGE` is a constant and nothing above it is consulted to build
        // it: a coverage line computed from whether a question exists would be
        // the existence oracle the exclusion is there to prevent.
        return { ...compose({ taste, acts, episodes: evenings }), coverage: COVERAGE };
      }),
  );

  server.registerTool(
    "forget_verdict",
    {
      title: "Forget that they ever said one thing",
      description:
        "Remove one thing they said about a film, by the `ref` `get_memory` gives it. It is " +
        "gone: not withdrawn, not marked, not kept where anybody can see it.\n\n" +
        "**This is not `withdraw_verdict`, and the difference matters.** Withdrawing says *I " +
        "no longer stand by that* — the claim stops applying and the fact that they said it " +
        "stays true and visible. Forgetting says *take it out of what you remember*. Use this " +
        "when they ask you to forget something, and withdraw when they have changed their " +
        "mind.\n\n" +
        "Only that one act goes. Everything else about the film is worked out again from what " +
        "is left, so forgetting a withdrawal lets the verdict it silenced stand once more, and " +
        "forgetting the last thing they said about a film leaves it as though they had never " +
        "said anything — whatever the saved film says applies again.\n\n" +
        "The answer says what the call did: `writeScope` is `verdict-act-only` and `otherRoots` " +
        "is `unchanged`, because this changes that one act and nothing else. Neither field says " +
        "whether the reference named anything, and neither says your whole errand is done — if " +
        "they asked for something else as well, that is still yours to do.\n\n" +
        "**This call is the whole of the request.** Do not go on to update or delete the saved " +
        "film, and do not touch any genre, mix, evening or anything else, unless they separately " +
        "ask you to change that. A saved film is a different thing from something they said " +
        "about it: it stays exactly as it is, and it is what applies once no verdict overlays " +
        "it. Tidying it away is not part of forgetting — it destroys a second thing they never " +
        "asked you to remove.",
      inputSchema: z.object({
        // Shaped here so a reference that is not one is an argument the tool
        // refuses, rather than a string handed to the store to compare against a
        // uuid column — which answered with the database's own complaint about
        // its type, and told a caller something about how this is stored. The
        // syntax is all this judges: a well-formed reference naming nothing and
        // a well-formed reference naming somebody else's act are both accepted
        // here and both answered identically below, which is what keeps this
        // from being a way to ask whether an act exists.
        ref: actReference.describe(
          "The one act to forget, exactly as `get_memory` gave it. There is no other way to " +
            "name it: a title, a year or a position would not tell two identical statements " +
            "apart.",
        ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ ref }) =>
      attempt(async () => {
        // The same answer whether or not there was anything there. A reference
        // that names nothing, or names somebody else's act, must not be a way to
        // find out that it exists — which is why the two fields below are
        // constants describing the operation rather than anything it found.
        await verdicts.forget(ref);
        return { forgotten: ref, writeScope: "verdict-act-only", otherRoots: "unchanged" };
      }),
  );

  return server;
}

/**
 * What `get_memory` answers for, and what it deliberately does not.
 *
 * A constant, and that is the whole design. A question Tonight is carrying is
 * its own note rather than something the user told it, so it is not Memory and
 * is not in the three sections — but a reader that met their absence would have
 * no way to tell "there are none" from "this read does not carry them", and the
 * first of those is a claim about the user that nothing here can support. So the
 * read says which parts it is complete for and names the one read that answers
 * the rest. Identical for everybody, consulted for nothing: building it from
 * whether a question exists would leak exactly what excluding them protects.
 */
const COVERAGE = {
  completeFor: ["held", "operative", "remembered"],
  excluded: { openQuestions: { readWith: "get_open_questions" } },
} as const;

/**
 * What `get_verdicts` answers for, and what it deliberately does not.
 *
 * The same device as `COVERAGE` above, for the same reason and against a
 * different mistake. This read is complete about one thing — everything said
 * about one film, and which of it stands — and a reader who has only ever called
 * it has seen no saved film, no genre, no mix and no evening. The description
 * says so, but a description is read before the call and the answer is read
 * after it, so the limit travels with the answer too.
 *
 * It is what stands between an honest narrow claim and a false wide one. *"They
 * have said nothing else about this film"* this read supports. *"There is no
 * standing opinion"*, *"this is the only thing on record"*, *"they never marked
 * it liked"* are claims about roots it cannot see, and belong to `get_memory`.
 *
 * Constant, identical for everybody, consulted for nothing — computing it from
 * what the other roots hold would be the existence leak this read is shaped to
 * avoid.
 */
const VERDICT_COVERAGE = {
  completeFor: ["verdictHistory"],
  excluded: { otherMemoryRoots: { readWith: "get_memory" } },
} as const;

/**
 * Where a saved film and a standing verdict pull different ways, for the
 * recommendation read.
 *
 * Derived, never stored, and never new knowledge: both roots are already in this
 * payload and this only says which of them governs and where. It exists because
 * the alternative is every reader re-deriving it, and the one that does not
 * re-derive it reports the saved state alone and sounds confident about a film
 * the user has since turned down.
 *
 * The comparison is `lib/precedence.ts`'s, shared with the memory view, so there
 * is one matrix rather than two that can drift.
 *
 * `applies` is the point of the shape. A `not-tonight` governs in its own
 * evening and nowhere else, and a reader must not be able to take it for a
 * standing fact about the person — so the scope is carried explicitly beside the
 * disagreement instead of being left to be inferred from an occasion field.
 */
function disagreements(
  movies: readonly { title: string; year: number; state: MovieState | null }[],
  standing: readonly Standing[],
): Disagreement[] {
  const filed = new Map(movies.map((movie) => [filmKey(movie), movie] as const));

  const found: Disagreement[] = [];
  for (const said of standing) {
    const movie = filed.get(filmKey(said));
    if (!movie) continue;

    const governedBy: Disagreement["governedBy"] =
      said.judgement === undefined ? { rejected: said.rejected! } : { judgement: said.judgement };
    if (!disagrees(movie.state, governedBy)) continue;

    found.push({
      title: said.title,
      year: said.year,
      saved: movie.state as MovieState,
      governedBy,
      applies: said.occasion === undefined ? "everywhere" : { occasion: said.occasion },
    });
  }
  return found;
}

/** One film two roots disagree about, as a recommendation reads it. */
type Disagreement = {
  title: string;
  year: number;
  saved: MovieState;
  governedBy: { judgement: Judgement } | { rejected: Reach };
  applies: "everywhere" | { occasion: string };
};

/**
 * An act just written, as the caller may have it back.
 *
 * Persistence hangs two handles on an act and only one of them is theirs. The
 * **order** is the table's sequence — machinery, it moves if the table is
 * rebuilt, and because it counts what everybody has written it is a fact about
 * other people; it has no business out here and was leaving in the answer to a
 * write. The **reference** is the opposite: it is what somebody points at to
 * take that one act back, `forget_verdict` is what takes it, and two acts
 * identical in every stated respect are told apart by nothing else. So the
 * order comes off and the reference stays.
 *
 * `get_verdicts` uses `spoken` alone, and is right to: it answers *what was
 * said*, over a history a caller reaches by film rather than by reference.
 */
function written(act: Identified<Act>): Act & { ref: string } {
  return { ...spoken(act), ref: act.ref };
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
    if (
    !(error instanceof TasteError) &&
    !(error instanceof EpisodeError) &&
    !(error instanceof VerdictError)
  ) {
    throw error;
  }
    return {
      isError: true as const,
      content: [{ type: "text" as const, text: error.message }],
    };
  }
}
