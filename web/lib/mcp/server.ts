import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { AuthenticatedUser } from "../identity.ts";
import {
  IMDB_ID_PATTERN,
  MAX_IMDB_ID_LENGTH,
  MAX_YEAR,
  MIN_YEAR,
  TasteError,
  VIEWINGS,
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
  type Scope,
} from "../verdicts/model.ts";
import { current, spoken, supersession } from "../verdicts/model.ts";
import { compose } from "../memory/model.ts";
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

const vibeName = z
  .string()
  .describe(
    'A vibe\'s name — "Space Tension", "Puzzle Pressure", "Small Town Secrets". Evocative, not ' +
      "descriptive: a genre is named for what it is and a vibe for what it feels like, so if " +
      "knowing the genres already tells you the name, the name is doing no work. " +
      '"Smart, not heavy" and "Funny action" are genre lists, not vibe names. The only ' +
      "identifier Tonight takes, matched case-insensitively. Genres and vibes have separate " +
      "names: a genre called X and a vibe called X are different objects.",
  );

const genreInstruction = z
  .string()
  .describe(
    "What this genre means to THIS user, in their own words, written as their preference. Not a " +
      "dictionary definition of the genre: two users with an Action genre may mean opposite " +
      "things, and this is where the difference lives. Include what they rule out. Write it in " +
      "the user's first person — it is their sentence about themselves, not a note about them.",
  );

const vibeInstruction = z
  .string()
  .describe(
    "What the combination means to the user. A vibe is not the intersection of its genres — the " +
      "genres are the ingredients and this is the meaning. Say something the genres do not " +
      "already say on their own. Write it in the user's first person — it is their sentence " +
      "about themselves, not a note about them.",
  );

const vibeGenres = z
  .array(z.string())
  .describe(
    "The exact names of the user's genres this vibe is built from, at least one. Genres only — " +
      "a vibe cannot be built from another vibe. Passing this replaces the stored list.",
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

const movieViewing = z
  .enum(VIEWINGS)
  .nullable()
  .describe(
    "Whether they have watched it, as one answer: seen (they said they watched it), unseen " +
      "(they said they have not). Take it from what they said: \"haven't seen it\" / \"want to " +
      "watch it\" -> unseen, \"seen it\" / \"watched it years ago\" -> seen. Omit the field when " +
      "they have not said; that records nothing, and it is not the same as unseen.\n\n" +
      "**This is a fact, never an opinion.** It says whether they watched the film and nothing " +
      "about whether they liked it — it is never a score or star rating, and never where a " +
      "fresh opinion goes. Liked, loved and disliked are verdicts and `record_verdict` " +
      "is what records them; a judgement already says they watched it, so there is nothing to " +
      "write here as well.\n\n" +
      "Pass null to go back to having been told nothing — and only where clearing the saved " +
      "viewing is itself what they asked for. **Null is not a way to tidy up after something " +
      "else.** Forgetting or withdrawing a verdict leaves this standing on purpose: it is a " +
      "different thing they said and it is still true. Clearing it then destroys a second " +
      "thing they never asked you to remove. If they asked for both, do both.",
  );

const movieVibes = z
  .array(z.string())
  .describe(
    "The exact names of the user's vibes this film belongs to. They must already exist, and a " +
      "film may be in none, one or several. Passing this replaces the whole list; an empty list " +
      "takes the film out of every vibe.",
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
  const { store, episodes, verdicts } = session;
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
        "The user's whole movie taste model: their genres, the vibes built from them, and the " +
        "films they have told Tonight about. A genre is a reusable piece of what they like, " +
        "with an instruction saying what it means to them. A vibe combines one or more genres " +
        "and has an instruction of its own for what the combination means; the films in it are " +
        "listed by title and year. Each film also appears once in movies, carrying its identity, " +
        "where it is filed, and `viewing`: seen, unseen, or null for never told. A new user has " +
        "none of it, which is the normal state " +
        "rather than an error. It is context and the vocabulary to reuse when writing — not a " +
        "list of what may be recommended, and a genre or vibe existing does not by itself say " +
        "they like it. Every genre, " +
        "vibe and movie also carries createdAt and updatedAt: when Tonight wrote it, and when " +
        "it last changed — which includes a vibe's genres changing and a movie being filed " +
        "differently. Both are Tonight's own, ISO 8601 in UTC. No tool takes either, and " +
        "nothing you send can set or move them. createdAt is null on a film saved before " +
        "Tonight recorded creation times; that is not known rather than not set.\n\n" +
        "**A movie says nothing about whether they liked it.** `viewing` is a fact about " +
        "watching and the only fact a movie carries about them; every opinion is a verdict. So a " +
        "film in `movies` with no verdict is a film **no current opinion stands about**, however " +
        "long it has been saved — which is not the same as their having said nothing, because " +
        "`viewing` may be something they told you. And `viewing` is never evidence for or " +
        "against recommending it, only for whether it would be new to them.\n\n" +
        "**What you find here is theirs; what you make of it is yours.** Report a verdict as the " +
        "verdict it is — *\"you loved Paterson\"* — and where several of them line up, the line-up " +
        "is your reading and has to sound like one: *\"there may be a quiet, patient thread " +
        "here\"*, never *\"you love quiet films\"* or *\"your taste is X\"*. They said four things; " +
        "the fifth thing, the one about the kind of film they like, is yours until they say it " +
        "themselves. One verdict is one film and never a register, a style or a kind. And where " +
        "`because` is absent they gave no reason, so *\"what made it work for you\"* is a sentence " +
        "you would be writing on their behalf.\n\n" +
        "**If you end by offering to save the reading, their yes is what writes it — and it " +
        "writes it there and then.** *\"Want me to turn that into a genre?\"* is answered with " +
        "`create_genre` and nothing else: the genre they agreed to is a genre they have, the " +
        "same as one they asked for outright, and there is nothing to record beforehand and " +
        "nothing left over after. So offer only what you would write on the spot. Nothing here " +
        "holds a pending offer, so an offer you mean to come back to is an offer only you are " +
        "carrying, and it is gone when this conversation is. Saying what you noticed and asking " +
        "nothing is free and writes nothing at all.\n\n" +
        "`verdicts` is what they have said about particular films, in their own words, and it is " +
        "the whole of what they think: nothing else here holds an opinion. Each entry names the " +
        "film and either a judgement — liked, loved " +
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
        "one film refused. Neither says they have seen it.\n\n" +
        "A standing judgement means they watched the film, whether or not a movie here says so " +
        "— nobody likes a film they have not seen. So a film is new to them when `viewing` is " +
        "not seen **and** no judgement stands; `unseen` is them saying they have not watched it, " +
        "and a null `viewing` with no judgement is nobody having said either way, which you may " +
        "not describe as unseen.\n\n" +
        "Only what currently stands is here. A verdict they corrected shows as the correction and " +
        "the one it replaced is gone from this list; one they took back is gone too. **A taking-back " +
        "reaches exactly as far as the verdict it takes back**, so withdrawing a judgement leaves " +
        "no current judgement about that film — not a weaker one hidden somewhere else — while " +
        "withdrawing an evening's `not-tonight` removes only that evening's refusal and leaves " +
        "whatever they said about the film in general standing where it was. They did say it, " +
        "and `get_memory` still remembers that they did; what changed is that it no longer " +
        "applies. " +
        "An evening whose refusal they withdrew has nothing of its own once more. Nothing else " +
        "about a film reaches this list: not that you recommended it, not that they watched or " +
        "finished it, not anything you asked them and heard no answer to — which is nowhere in " +
        "Tonight to begin with — and not how long any of it has been true.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      attempt(async () => {
        // Two sources, kept apart. The taste model is what they filed; the
        // verdicts are what they have since said about particular films, and
        // which of those still stands is resolved by the verdict model rather
        // than assembled here.
        const [taste, said] = await Promise.all([store.taste(), verdicts.standing()]);
        // Absent rather than empty: a user with no verdicts reads exactly as they
        // did before verdicts existed. An empty list would say there is nothing
        // to say, which is what saying nothing already does.
        return { ...taste, ...(said.length === 0 ? {} : { verdicts: said }) };
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
        "Change a genre's name or what it means. Pass new_name to rename it — every vibe built " +
        "from it follows the new name in the same write, so renaming never breaks a vibe. " +
        "Refining an instruction is how a taste model gets better over time; propose the new " +
        "wording and let the user agree to it rather than editing on their behalf.",
      inputSchema: z.object({
        name: genreName.describe("The genre to change, by its current name."),
        new_name: genreName.describe("Rename the genre to this. Its vibes follow it.").optional(),
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
        "Remove a genre. Refused while any vibe is built from it — change that vibe's genres, or " +
        "delete the vibe first. The refusal names the vibes in the way; tell the user which " +
        "choice they are making rather than picking for them.",
      inputSchema: z.object({ name: genreName }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ name }) => attempt(async () => ({ deleted: await store.deleteGenre(name) })),
  );

  server.registerTool(
    "create_vibe",
    {
      title: "Create a vibe",
      description:
        "Combine one or more of the user's genres into a vibe of their own. Every named genre " +
        "must already exist; a vibe cannot be built from another vibe. Name it the way a shelf in " +
        "a good video shop is named, not the way a filter is: 'Space Tension' beats " +
        "'Sci-Fi Thriller', and the test is whether they would ask for it by name in a month. " +
        "A vibe is the shape of a recommendation idea, so the moment to write one is just after " +
        "using that idea to choose films — but only when the user stated the idea as lasting " +
        "taste, or confirmed a meaning you put to them. Wanting something tonight is not that, " +
        "and having invented a combination, used it and found films that fit is not what makes " +
        "it theirs. A confirmation covers only the meaning they were shown, and settles that " +
        "it is theirs rather than granting permission to write.",
      inputSchema: z.object({ name: vibeName, genres: vibeGenres, instruction: vibeInstruction }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => attempt(async () => ({ vibe: await store.createVibe(args) })),
  );

  server.registerTool(
    "update_vibe",
    {
      title: "Update a vibe",
      description:
        "Change a vibe's name, its meaning, or which genres it is built from. Passing genres " +
        "replaces the stored list rather than adding to it, and the list may never be empty. " +
        "Never reword their instruction: the sentence is theirs, and what it means is not " +
        "yours to adjust.",
      inputSchema: z.object({
        name: vibeName.describe("The vibe to change, by its current name."),
        new_name: vibeName.describe("Rename the vibe to this.").optional(),
        genres: vibeGenres.optional(),
        instruction: vibeInstruction.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ name, new_name: renamed, genres, instruction }) =>
      attempt(async () => ({ vibe: await store.updateVibe(name, { name: renamed, genres, instruction }) })),
  );

  server.registerTool(
    "delete_vibe",
    {
      title: "Delete a vibe",
      description:
        "Remove a vibe. Always allowed — nothing is built from a vibe — and the genres it " +
        "combined are left alone.",
      inputSchema: z.object({ name: vibeName }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ name }) => attempt(async () => ({ deleted: await store.deleteVibe(name) })),
  );

  server.registerTool(
    "create_movie",
    {
      title: "Save a movie",
      description:
        "File a film the user told you about, and whether they have watched it. What they are " +
        "telling you they *thought* of a film — that they loved it, that it is not for tonight, " +
        "that they never want it again — is a verdict and belongs to `record_verdict`; nothing " +
        "here carries an opinion. A recommendation " +
        "is not a saved movie: naming three films persists nothing, and neither does the user " +
        "liking your suggestion of one. Write only Movie identity and what the user expressed, " +
        "or a meaning you put to them and they confirmed — and a confirmation covers only the " +
        "meaning they were shown, settling that it is theirs rather than granting permission to " +
        "write. Absence is never unseen: leave viewing out when you were not told, because " +
        "having said nothing is not the same as having said they have not seen it. Addressed " +
        "by title and year together, so establish the year before writing.",
      inputSchema: z.object({
        title: movieTitle,
        year: movieYear,
        imdb_id: imdbId.optional(),
        viewing: movieViewing.optional(),
        vibes: movieVibes.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ title, year, imdb_id: imdbId, viewing, vibes }) =>
      attempt(async () => ({
        movie: await store.createMovie({ title, year, imdbId, viewing, vibes }),
      })),
  );

  server.registerTool(
    "update_movie",
    {
      title: "Update a movie",
      description:
        "Change what is stored about a saved film, or which vibes it is in. Addressed " +
        "by its current title and year; new_title and new_year change either half and the film " +
        "stays the same object, so its filings follow it. Omitting a field leaves it alone — " +
        "passing null is what clears one back to unknown, and the two are not the same. " +
        "Absence is never unseen: say a viewing only when they said it. What they are telling " +
        "you now about a film is a verdict, not a viewing: `record_verdict` records it and " +
        "`withdraw_verdict` takes one back, and neither touches what is stored here. " +
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
        viewing: movieViewing.optional(),
        vibes: movieVibes.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({
      title,
      year,
      new_title: retitled,
      new_year: reyeared,
      imdb_id: imdbId,
      viewing,
      vibes,
    }) =>
      attempt(async () => ({
        movie: await store.updateMovie(title, year, {
          title: retitled,
          year: reyeared,
          imdbId,
          viewing,
          vibes,
        }),
      })),
  );

  server.registerTool(
    "delete_movie",
    {
      title: "Delete a movie",
      description:
        "Forget a film the user saved, where removing it is itself what they asked for. It " +
        "leaves every vibe it was in and the vibes themselves are left alone. Addressed by " +
        "title and year together.\n\n" +
        "**Not a way to tidy up after something else.** Forgetting or withdrawing a verdict " +
        "leaves the saved film standing on purpose: the film is in their collection and whether " +
        "they watched it is a separate thing they said, and neither stops being true because an " +
        "opinion was taken back. Deleting it then destroys a second thing they never asked you " +
        "to remove. If they asked for both, do both.",
      inputSchema: z.object({ title: movieTitle, year: movieYear }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ title, year }) =>
      attempt(async () => ({ deleted: await store.deleteMovie(title, year) })),
  );

  // --- episodes ------------------------------------------------------------
  //
  // What happened on an evening, which is not what the user likes. These tools
  // write history and never taste: nothing below reads a genre, a vibe or a movie
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
        "film is not the same as them choosing it.\n\n" +
        "**Writing this down does not answer them, and it never finishes a request for a " +
        "film.** Nothing here is shown to the user: this is Tonight's own record of an evening, " +
        "and a reply that reports having saved it — *\"logged this evening's recommendation\"* " +
        "— has told them nothing they can act on. Every film in `offered` must already be in " +
        "the reply they can read, named there and said in full. **A film that exists only in " +
        "this call was never recommended.** If the reply does not carry them, do not repair it " +
        "by calling this: write the recommendation first, then record it.",
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
        "stays in the history. Nothing is rewritten.\n\n" +
        "This writes the verdict and nothing else. If you had asked them about this film, the " +
        "asking was a sentence in your conversation and was never recorded anywhere, so there " +
        "is nothing here to close and nothing that stays open if they never answer.",
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
        "leaves no current opinion standing, the way it applied before they spoke. It does not " +
        "unsay it: that they said it stays true, and `get_memory` still remembers it.\n\n" +
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
        "`current` is null when no verdict applies **in the scope you asked about** — either they " +
        "never gave one there, or they took back the one they gave. It is not a statement about " +
        "every scope: asked without an occasion it says nothing stands in general, and an evening " +
        "may still carry a `not-tonight` of its own; asked about an evening it says that evening " +
        "has nothing of its own and nothing general shows through either. Neither is a preference " +
        "you may act on as though it were one, and a taking-back is not the same as never having " +
        "spoken — `history` below still holds it." +
        "\n\nThis reads what they said and nothing else: verdicts and takings-back, for one film. " +
        "It cannot see a saved film, a genre, a vibe or an evening, so it cannot tell you " +
        "whether the film is even in their collection or whether they have said they watched it. " +
        "**Never conclude from this read what their whole position on a film is.** A question " +
        "about everything Tonight holds is `get_memory`'s.",
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
        "The whole of what Tonight holds about this user, in two parts, so that \"what do " +
        "you know about me?\" has a complete and honest answer.\n\n" +
        "`held` is what it currently holds as theirs: their genres, their vibes, the films they " +
        "saved with whether they have watched them, and the verdicts that still stand. " +
        "`remembered` is what it remembers happening: evenings, " +
        "verdicts they replaced, verdicts they took back. **Remembered is not evidence about " +
        "them.** An evening is not a preference, and something they stopped saying is not " +
        "something they say.\n\n" +
        "A film and a verdict are different kinds of thing and neither contradicts the other. A " +
        "film carries `viewing` — whether they watched it — and no opinion at all; every opinion " +
        "is a verdict. So there is nothing here to rank against anything else: what they think " +
        "of a film is whatever verdict stands, and if none stands, no current opinion stands — " +
        "which `remembered` may still show them having given and taken back.\n\n" +
        "Every entry carries where it came from and, where one exists, the handle you correct " +
        "it by: a genre or vibe by its name, a film by title and year, an evening by its id, and " +
        "one thing they said by its `ref`. A verdict's `ref` is what `forget_verdict` takes. An " +
        "evening also says where its own record came from: `requestSource` and `offeredSource` " +
        "are `observed` where Tonight received the request or put the films forward itself, and " +
        "`stated` where the user later corrected it.\n\n" +
        "`coverage` says what this read answers for, and it answers for all of it: `held` " +
        "and `remembered` are the whole of Memory, and nothing is held back from this " +
        "answer.\n\n" +
        "This is for explaining and correcting, not for recommending. `get_taste` is what a " +
        "recommendation reads; this holds history beside belief on purpose, and using the " +
        "history as though it were taste is the one thing it must not be used for. Reading it " +
        "writes nothing and changes nothing.\n\n" +
        "**A question about what they *like* is `get_taste`'s, not this one's** — *\"what do I " +
        "like?\"*, *\"what are you recommending from?\"*, *\"what do you know about my " +
        "taste?\"*. Those ask what currently stands about them, which is exactly what " +
        "`get_taste` answers, and reaching for this read instead is the wrong read even when the " +
        "answer you write from it happens to be right: everything remembered comes with it, and " +
        "a superset is not a narrower question answered. It asks like explaining and it is not. " +
        "This read is for the wider question — *\"what do you know about me?\"*, *\"show me " +
        "everything you remember\"* — and for putting any of it right.\n\n" +
        "Tonight remembers nothing about a person beyond what is here. Whatever you are " +
        "carrying about them as you talk — something you meant to ask, something you noticed, " +
        "something you were about to suggest — is yours and this conversation's, and it is " +
        "written down nowhere. It will not be here next time, and it is not theirs to correct.",
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

  /* ------------------------------------------------------- what Tonight thinks */






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
        "Only that one act goes. What stands about the film is worked out again from the acts " +
        "that are left, so forgetting a withdrawal lets the verdict it silenced stand once more, " +
        "and forgetting the last thing they said about a film leaves no current opinion standing " +
        "about it — not a weaker one, and nothing hidden anywhere else. Unlike a withdrawal, " +
        "this one really is gone: nothing remembers it afterwards.\n\n" +
        "The answer says what the call did: `writeScope` is `verdict-act-only` and `otherRoots` " +
        "is `unchanged`, because this changes that one act and nothing else. Neither field says " +
        "whether the reference named anything, and neither says your whole errand is done — if " +
        "they asked for something else as well, that is still yours to do.\n\n" +
        "**This call is the whole of the request.** Do not go on to update or delete the saved " +
        "film, and do not touch any genre, vibe, evening or anything else, unless they separately " +
        "ask you to change that. A saved film is a different thing from something they said " +
        "about it: the film is in their collection and whether they watched it is a separate " +
        "thing they said, and neither stops being true because an opinion was taken back. " +
        "Tidying it away is not part of forgetting — it destroys a second thing they never " +
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
 * What `get_memory` answers for: all of it.
 *
 * A constant, and that is the whole design. This read reaches every root Tonight
 * persists — films, genres, vibes, evenings, verdicts — so a reader may say
 * *"that is everything"* on the strength of it, which is the one claim
 * `VERDICT_COVERAGE` below exists to deny its own reader.
 *
 * `excluded` is empty and stays present. It used to name a second read holding
 * notes Tonight had written itself, and the field is what told a reader that an
 * absence here was not a finding. There is no such second place now, and saying
 * so outright is not the same as leaving a reader to infer it from a missing key.
 */
const COVERAGE = {
  completeFor: ["held", "remembered"],
  excluded: {},
} as const;

/**
 * What `get_verdicts` answers for, and what it deliberately does not.
 *
 * The same device as `COVERAGE` above, for the same reason and against a
 * different mistake. This read is complete about one thing — everything said
 * about one film, and which of it stands — and a reader who has only ever called
 * it has seen no saved film, no genre, no vibe and no evening. The description
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
