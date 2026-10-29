import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { AuthenticatedUser } from "../identity.ts";
import {
  IMDB_ID_PATTERN,
  MAX_IMDB_ID_LENGTH,
  MAX_YEAR,
  MIN_YEAR,
  SEEN_RULE,
  SEEN_VIEWINGS,
  TasteError,
  VibeRequired,
  VIEWINGS,
} from "../taste/model.ts";
import {
  beginEpisode,
  EpisodeError,
  FACTS_ARE_PER_OFFER,
  MAX_OFFERED,
  MAX_OFFERS_PER_EVENING,
  MAX_PASS_REASON_LENGTH,
  MAX_REQUEST_LENGTH,
  shown,
  type Correction,
} from "../episodes/model.ts";
import type { EpisodeStore } from "../episodes/store.ts";
import {
  isPositive,
  JUDGEMENTS,
  MAX_REASON_LENGTH,
  NOT_A_VERDICT,
  stateVerdict,
  TOLD,
  VerdictError,
  withdrawVerdict,
  type Act,
  type Film,
  type Identified,
  type Verdict,
} from "../verdicts/model.ts";
import { current, spoken, supersession } from "../verdicts/model.ts";
import { compose } from "../memory/model.ts";
import { askedCandidates, checkCandidates, MAX_CANDIDATES } from "../candidates/model.ts";
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

/** One film as Tonight put it forward: an element of `offered`. */
const offeredFilm = z.object({
  title: z.string().min(1).describe("The film's title, as you named it."),
  year: z.number().int().describe("Its release year."),
  lead: z.boolean().describe("Whether this was the one you led with, or one of the others."),
});

/**
 * What the user said about one film of the evening: an element of `offers`.
 *
 * Strict, so a key from the old shape — `watched` above all — is an error that
 * writes nothing rather than a word silently dropped.
 */
const offerFact = (what: string) => z.boolean().nullable().optional().describe(what);

const offerStatement = z.strictObject(
  {
    title: z.string().min(1).describe("The film's title, spelled as the evening holds it if it is there."),
    year: z.number().int().describe("Its release year."),
    chosen: offerFact(
      "They intend to watch it — \"I'll go with X\", \"let's do X\". false: they said they are not " +
        "going with it after all. Not implied by anything else.",
    ),
    started: offerFact(
      "They actually began it — \"we're watching X\", \"we started X\". May be true without chosen. " +
        "false: they said they did not watch it.",
    ),
    finished: offerFact(
      "They completed it. true also records started, since it says they began it — refused if " +
        "they said they did not start it, unless started: true is said in the same call. false " +
        "(\"turned it off halfway\") implies nothing about started.",
    ),
    passed: offerFact(
      "An explicit turn-down for that evening — \"not tonight\", \"not in the mood\", \"nah, not " +
        "that one\". Never dont-want-to-see and never a verdict. A passed film cannot also be " +
        "chosen or started; if they changed their mind, take the pass back (null).",
    ),
    passReason: z
      .string()
      .min(1)
      .max(MAX_PASS_REASON_LENGTH)
      .nullable()
      .optional()
      .describe("Their words for passing, if they gave any. Only with a pass. Never your words."),
  },
  {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `Not a fact about an offer: ${issue.keys.join(", ")}. The facts are chosen, started, ` +
          "finished and passed (with passReason) — \"watched it\" is started."
        : undefined,
  },
);

/**
 * The three names around an evening's films, said once so both tools say it the
 * same way: `offered` is Tonight's recommendations, input `offers` is what the
 * user said, and the answer's `offers` is the evening's entries.
 */
const OFFERED_VS_OFFERS =
  "`offered` lists the films Tonight recommended; `offers` (input) says what the user said about " +
  "films of the evening; the answer's `offers` is the evening's list of films, each with " +
  "`offered` true (Tonight recommended it) or false (they brought it up).";

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

/**
 * A verdict tool's arguments, refusing anything they do not name.
 *
 * An ordinary object drops an unknown key and carries on, and on these tools
 * that would widen what somebody said: a client written when a verdict could
 * name an evening sends `withdraw_verdict({ film, occasion })` to take back one
 * evening's refusal, and with `occasion` dropped that becomes taking back what
 * they said about the film everywhere. So `occasion`, `reach` and `reason` — and
 * anything else unknown — are an error that writes nothing.
 */
const strictly = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject(shape, {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `Not taken here: ${issue.keys.join(", ")}. A verdict is liked, loved or disliked, about ` +
          `the film on every evening — there is no evening to name and no refusal to record. ${NOT_A_VERDICT}`
        : undefined,
  });
//
// Described once, because the description is what a model reads to decide how to
// call a tool, and two tools disagreeing about what `name` means would be worse
// than either description being imperfect.

const genreName = z
  .string()
  .describe(
    "A genre's name — plain, named for what it is. This is the only identifier Tonight " +
      "takes: genres are addressed by name everywhere, and there is no id to look up or pass. " +
      "Matched case-insensitively.",
  );

const vibeName = z
  .string()
  .describe(
    "A vibe's name. Evocative, not descriptive: a genre is named for what it is and a vibe for " +
      "what it feels like, so if knowing the genres already tells you the name, the name is doing " +
      "no work. A name that lists the genres, or puts a quality in front of one, is a genre list, " +
      "not a vibe name. The only identifier Tonight takes, matched case-insensitively. Genres " +
      "and vibes have separate names: a genre called X and a vibe called X are different objects.",
  );

const genreInstruction = z
  .string()
  .describe(
    "What this genre means to THIS user, in their own words, written as their preference. Not a " +
      "dictionary definition of the genre: two users with genres of the same name may mean " +
      "opposite things, and this is where the difference lives. Include what they rule out. Write it in " +
      "the user's first person — it is their sentence about themselves, not a note about them.",
  );

const vibeInstruction = z
  .string()
  .describe(
    "What the combination means to the user. A vibe is not the intersection of its genres — the " +
      "genres are the ingredients and this is the meaning. Say something the genres do not " +
      "already say on their own, and nothing that goes against what they do say: read their " +
      "instructions before writing this, not just their names. Write it in the user's first " +
      "person — it is their sentence about themselves, not a note about them.",
  );

const vibeGenres = z
  .array(z.string())
  .describe(
    "The exact names of the user's genres this vibe is built from, at least one. Genres only — " +
      "a vibe cannot be built from another vibe. Passing this replaces the stored list, which " +
      "changes what the vibe means: read the incoming genres' instructions against the name and " +
      "the sentence the vibe already has, and say so if they no longer fit together.",
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
      "addressed: two films that share a title are two films. Establish it before writing rather " +
      "than guessing — if you do not know it, ask.",
  );

// The syntax alone, said once: a write takes it nullable, a check does not.
const imdbIdText = z
  .string()
  // Trimmed before the syntax is judged, so this and the store agree about
  // `" tt0111161 "`. Neither of them accepts a blank one: there is exactly one
  // way to clear an id, and it is null.
  .trim()
  .max(MAX_IMDB_ID_LENGTH, "an IMDb title id is far shorter than that")
  .regex(
    IMDB_ID_PATTERN,
    "an IMDb title id looks like tt0111161 — tt followed by at least seven digits",
  );

const imdbId = imdbIdText
  .nullable()
  .describe(
    'An IMDb title id — "tt0111161". Stored as a pointer and never looked up: Tonight does not ' +
      "ask IMDb anything. Omit it if you do not have one; pass null to clear one that is there. " +
      "An empty string is not a way to clear it and is refused.",
  );

const movieViewing = z
  .enum(VIEWINGS, {
    // Read by a client still holding the old vocabulary — `seen` — before it
    // reconnects: it is told how to choose between the two that replaced it.
    error: () =>
      `viewing must be one of ${VIEWINGS.join(", ")}. A watched film is ${SEEN_RULE}.`,
  })
  .describe(
    "Where the film stands on their list, always one of four: seen-now (they watched it " +
      "recently), seen-before (they watched it some time ago), want-to-see (on their list to " +
      "see), dont-want-to-see (never to be recommended). Take it from what they said: \"just " +
      "watched it\" / \"saw it last night\" / a film they started or finished in an evening with " +
      "Tonight / one you suggested that they then watched -> seen-now, a rewatch included; " +
      "\"watched it years ago\" / \"saw it as a kid\" -> seen-before; \"I've seen it\" with " +
      "nothing about when -> ask them once, briefly and in your own words, whether it was " +
      "recently — inside a question you are already putting, if there is one, never as a round " +
      "of its own — and use seen-before if they still do not say; \"haven't " +
      "seen it\" / \"put it on my list\" / \"want to watch it\" -> want-to-see, \"don't recommend " +
      "it again\" / \"stop suggesting it\" / \"not interested\" / \"never again\" -> " +
      "dont-want-to-see — the one way to keep a film from being recommended, and that film " +
      "only. \"Not tonight\" is none of these: it is about the evening, so it is used tonight " +
      "and is never a viewing or a verdict — at most a pass on that evening. A film saved " +
      "without one is want-to-see, so give seen-now or seen-before whenever " +
      "they told you they watched it.\n\n" +
      "**Neither seen value is a date.** Never state or estimate when they watched a film, and " +
      "never present Tonight's createdAt or updatedAt — when it wrote the film down — as when " +
      "they watched it. Saying back the timing they gave you is fine.\n\n" +
      "**Setting a viewing writes the viewing and nothing else** — no verdict, no `because`, no " +
      "pass reason, and no quote of what they said about when. A reason they did give is " +
      "recorded where it belongs, in their words, as it always is.\n\n" +
      "**Say what you stored.** After the write, tell them in one short sentence where the film " +
      "now stands — the film, and the viewing you wrote — so that " +
      "a status they did not mean is corrected there and then. A correction is another " +
      "`update_movie`.\n\n" +
      "**This is a fact, never an opinion.** It says where the film stands for them and nothing " +
      "about whether they liked it — it is never a score or star rating, and never where a " +
      "fresh opinion goes. Liked, loved and disliked are verdicts and `record_verdict` " +
      "is what records them; a judgement already says they watched it, so there is nothing to " +
      "write here as well — except for a film saved as want-to-see that they tell you now they " +
      "liked or loved: that is their word that they watched it, so it becomes seen-now or " +
      "seen-before by the rule above, in the same turn. A liked or loved that only stands from " +
      "before does not move it.\n\n" +
      "**Not a way to tidy up after something else.** Forgetting or withdrawing a verdict " +
      "leaves this standing on purpose: it is a different thing they said and it is still " +
      "true. Change it only where changing it is itself what they asked for. If they asked " +
      "for both, do both.",
  );

const movieVibes = z
  .array(z.string())
  .describe(
    "The exact names of the user's vibes this film belongs to. They must already exist, and a " +
      "film may be in none, one or several. Passing this replaces the whole list; an empty list " +
      "takes the film out of every vibe — except one it is the core of, which it cannot leave.",
  );

const vibeCore = z
  .object({
    title: movieTitle,
    year: movieYear,
    viewing: z
      .enum(SEEN_VIEWINGS)
      .describe(
        "Only for a film not saved yet: which seen value it is saved as — " +
          `${SEEN_RULE}. Left out, it is saved as seen-before. A saved film keeps its own ` +
          "viewing whatever this says; change that with update_movie, and only on their word.",
      )
      .optional(),
  })
  .describe(
    "The vibe's core: the one film that best embodies it. A film they have seen and stand " +
      "behind — one they liked or loved, or one they named as what the vibe means — and never a " +
      "film you only offered as an illustration, one they said they have not seen, one they " +
      "disliked, or one they do not want recommended. The core is filed in the vibe by this same call, and " +
      "saved first if it is not saved yet — as `viewing` says, seen-now or seen-before, or as " +
      "seen-before without one — with nothing else about it.\n\n" +
      "Refused when the saved film's viewing is anything but `seen-now` or `seen-before` — a " +
      "liked or loved does not override it, and a viewing is changed only on their word, never " +
      "to get past this. A liked or loved they tell you now is their word that they watched it; " +
      "one that only stands from before is not.",
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
        "listed by title and year, and `core` names the one that best embodies it — always one " +
        "of its films, or null on a vibe written before vibes were anchored to a film, which is " +
        "complete and usable as it is. Each film also appears once in movies, carrying its identity, " +
        "where it is filed, and `viewing`: seen-now, seen-before, want-to-see or " +
        "dont-want-to-see. A new user has " +
        "none of it, which is the normal state " +
        "rather than an error. It is context and the vocabulary to reuse when writing — not a " +
        "list of what may be recommended, and a genre or vibe existing does not by itself say " +
        "they like it. Every genre, " +
        "vibe and movie also carries createdAt and updatedAt: when Tonight wrote it, and when " +
        "it last changed — which includes a vibe's genres changing and a movie being filed " +
        "differently. Both are Tonight's own, ISO 8601 in UTC. No tool takes either, and " +
        "nothing you send can set or move them. createdAt is null on a film saved before " +
        "Tonight recorded creation times; that is not known rather than not set. **Neither is " +
        "when they watched a film**, and nothing here is: seen-now and seen-before carry no date, " +
        "so never present either timestamp as a watch time.\n\n" +
        "**A movie says nothing about whether they liked it.** `viewing` is where the film " +
        "stands on their list and the only fact a movie carries about them; every opinion is a " +
        "verdict. So a film in `movies` with no verdict is a film **no current opinion stands " +
        "about**, however long it has been saved — which is not the same as their having said " +
        "nothing, because `viewing` may be something they told you. And `viewing` is never " +
        "evidence about their taste. It settles two things only: a `want-to-see` film is new " +
        "to them and may be recommended, and a `dont-want-to-see` film is **never recommended** " +
        "— not as the lead, not as a direction.\n\n" +
        "**What you find here is theirs; what you make of it is yours.** Report a verdict as the " +
        "verdict it is — that they loved that film — and where several of them line up, the line-up " +
        "is your reading and has to sound like one: something you noticed, said as a possibility, " +
        "never as the kind of film they love or what their taste is. They said four things; " +
        "the fifth thing, the one about the kind of film they like, is yours until they say it " +
        "themselves. One verdict is one film and never a register, a style or a kind. And where " +
        "`because` is absent they gave no reason, so *\"what made it work for you\"* is a sentence " +
        "you would be writing on their behalf.\n\n" +
        "**If you end by offering to save the reading, their yes is what writes it — and it " +
        "writes it there and then.** *\"Want me to turn that into a genre?\"* is answered with " +
        "`create_genre` and nothing else: the genre they agreed to is a genre they have, the " +
        "same as one they asked for outright, and there is nothing to record beforehand and " +
        "nothing left over after. After they say how one film worked for them, though, a genre is " +
        "never offered on its own: a new genre then comes only as part of a new vibe, and only " +
        "where one is offered at all. So offer only what you would write on the spot. Nothing here " +
        "holds a pending offer, so an offer you mean to come back to is an offer only you are " +
        "carrying, and it is gone when this conversation is. Saying what you noticed and asking " +
        "nothing is free and writes nothing at all.\n\n" +
        "`verdicts` is what they have said about particular films, in their own words, and it is " +
        "the whole of what they think: nothing else here holds an opinion. Each entry names the " +
        "film and a judgement — liked, loved or disliked. Where they said why, `because` holds " +
        "their words; where they did not, it is not there, and you have none to offer — and " +
        "where they did, use their " +
        "words as they said them and do not make them stronger: a quality they named in one film " +
        "is never a claim that they love every film with it. `told` says whether they " +
        "volunteered it or answered a question you put — the first tells you more than the " +
        "second, and neither is a number.\n\n" +
        "A verdict is an opinion and never a refusal: a film they do not want recommended is a " +
        "movie whose `viewing` is `dont-want-to-see` — that film, not its genre, its director " +
        "or anything resembling it — and a film they turned down for one evening is nowhere " +
        "here at all.\n\n" +
        "A standing judgement means they watched the film, whether or not a movie here says so " +
        "— nobody likes a film they have not seen. So a film is new to them when `viewing` is " +
        "neither seen-now nor seen-before **and** no judgement stands.\n\n" +
        "Only what currently stands is here. A verdict they corrected shows as the correction and " +
        "the one it replaced is gone from this list; one they took back is gone too, and " +
        "withdrawing a judgement leaves no current judgement about that film — not a weaker one " +
        "hidden somewhere else. They did say it, " +
        "and `get_memory` still remembers that they did; what changed is that it no longer " +
        "applies. Nothing else " +
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
        "a good video shop is named, not the way a filter is: never its genres said again, and " +
        "the test is whether they would ask for it by name in a month. " +
        "A vibe is the shape of a recommendation idea, so the moment to write one is just after " +
        "using that idea to choose films — but only when the user stated the idea as lasting " +
        "taste, or confirmed a meaning you put to them. Wanting something tonight is not that, " +
        "and having invented a combination, used it and found films that fit is not what makes " +
        "it theirs. A confirmation covers only the meaning they were shown, and settles that " +
        "it is theirs rather than granting permission to write.\n\n" +
        "**A vibe is a name, a sentence and some genres, and the three have to be one idea.** " +
        "So read what each genre's instruction actually says — the names are labels and settle " +
        "nothing. A vibe meaning slow, unsettling tension is not built from a genre whose " +
        "instruction is broad physical comedy, however the two are named. The sentence adds what " +
        "the genres do not say and contradicts nothing they do.\n\n" +
        "Coherent is not derived. The genres hold the idea in place; they never produce it, and " +
        "no reading of them would have found the name. The question is not whether the genres " +
        "give you this vibe, but whether the three could be one thing a person meant. Nothing " +
        "here checks that — the store takes whatever is structurally valid, and the judgement " +
        "is yours. How many films are filed in a vibe is no part of it: one written just now " +
        "with only its core is as coherent as one with ten. **The core is part of it** — the " +
        "film has to embody that one idea, and a film that fits only the name or only one genre " +
        "is not a core.\n\n" +
        "Write it only when the whole vibe was agreed — name, sentence, genres and core. " +
        "Films you named to show what the idea covers are illustration: none of them is the " +
        "core, and none is written.",
      inputSchema: z.object({
        name: vibeName,
        genres: vibeGenres,
        instruction: vibeInstruction,
        core: vibeCore,
      }),
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
        "Never reword their instruction on your own: the sentence is theirs, and what it means " +
        "is not yours to adjust. The one change you may propose is a minimal one — the exact new " +
        "words, shown to them — when a film they like belongs to that same evening and the " +
        "sentence does not yet cover it; write it only on their yes to those words. A change " +
        "that would make it a different evening is a new vibe, not a reworded one, and so is one " +
        "its core would no longer fit wholly.\n\n" +
        "**Every one of these changes the whole vibe, so settle the whole vibe before you " +
        "call.** Work out what the result would be — the name it would then have, the sentence " +
        "it would then have, the genres it would then be built from, and what those genres' " +
        "instructions say — and make the call only if those are one idea. Nothing here checks " +
        "that and nothing undoes it: the write lands, and an incoherent vibe is what Tonight " +
        "holds from that moment until somebody fixes it.\n\n" +
        "A name, a sentence and a set of genres are one idea or the vibe is incoherent, and each " +
        "field can break that on its own: a new name the old sentence no longer fits, a new " +
        "sentence that goes against the genres, or — most easily missed — a new genre list " +
        "under a name and sentence chosen for the old one. Replacing the genres is not a " +
        "bookkeeping change. Read the incoming genres' instructions, not their names, and if " +
        "the result would be two ideas wearing one name, do not write it: say so and let the " +
        "user decide which they meant. Changing the rest to fit is rewording their sentence by " +
        "another route.\n\n" +
        "Passing core anchors the vibe on that film: a vibe whose core is null gets its first, " +
        "or a vibe gets a film that embodies it better than its current core. Only with their " +
        "yes. The film it replaces stays in the vibe as an ordinary member, and a core cannot be " +
        "cleared — only replaced, or the vibe deleted.",
      inputSchema: z.object({
        name: vibeName.describe("The vibe to change, by its current name."),
        new_name: vibeName.describe("Rename the vibe to this.").optional(),
        genres: vibeGenres.optional(),
        instruction: vibeInstruction.optional(),
        core: vibeCore.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ name, new_name: renamed, genres, instruction, core }) =>
      attempt(async () => ({
        vibe: await store.updateVibe(name, { name: renamed, genres, instruction, core }),
      })),
  );

  server.registerTool(
    "delete_vibe",
    {
      title: "Delete a vibe",
      description:
        "Remove a vibe. Nothing is built from a vibe, so the one refusal is for a film they like " +
        "or love that is in no other vibe: a liked or loved film stays in at least one, and the " +
        "refusal names those films — move each into another vibe with `update_movie` first. " +
        "Otherwise the genres it combined are left alone, as are its films, its core included.",
      inputSchema: z.object({ name: vibeName }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ name }) =>
      attempt(async () => ({ deleted: await store.deleteVibe(name, { positiveNeedsVibe: true }) })),
  );

  server.registerTool(
    "create_movie",
    {
      title: "Save a movie",
      description:
        "File a film on their list, and where it stands for them: a film they watched is " +
        `${SEEN_RULE}; ` +
        "*\"put it on my list\"* is want-to-see, *\"don't recommend it again\"*, *\"stop " +
        "suggesting it\"* or *\"not interested\"* is dont-want-to-see. What they are telling you " +
        "they *thought* of a film — that they loved it, liked it, disliked it — is a verdict and " +
        "belongs to `record_verdict`; nothing here carries an opinion. A recommendation " +
        "is not a saved movie: naming three films persists nothing, and neither does the user " +
        "liking your suggestion of one. Write only Movie identity and what the user expressed, " +
        "or a meaning you put to them and they confirmed — and a confirmation covers only the " +
        "meaning they were shown, settling that it is theirs rather than granting permission to " +
        "write. Leave viewing out and the film is saved as want-to-see; then say what you " +
        "stored, so they can correct it. Addressed by title and year together, so establish " +
        "the year before writing.",
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
        "stays the same object, so its filings follow it. Omitting a field leaves it alone, " +
        "and passing null clears an IMDb id. A viewing is never cleared: it is always seen-now, " +
        "seen-before, want-to-see or dont-want-to-see — change it when they tell you where the " +
        "film stands, *\"stop suggesting it\"* included, a film they watched being " +
        `${SEEN_RULE} — and a rewatch they just did is seen-now — and say what you stored. ` +
        "What they thought of a " +
        "film is a verdict, not a viewing: `record_verdict` records it and " +
        "`withdraw_verdict` takes one back, and neither touches what is stored here. " +
        "A recommendation is " +
        "not a saved movie here either — proposing a film, or the user watching one you " +
        "proposed, is nothing Tonight knows unless they said so. Write only what they " +
        "expressed or confirmed, and a confirmation covers only the meaning they were shown; " +
        "it is not permission to write more than that.\n\n" +
        "A film cannot be taken out of a vibe it is the core of, nor marked anything but " +
        "seen-now or seen-before while it is a core — between those two it may move. The refusal " +
        "names the vibes: make another film the core with " +
        "`update_vibe` first, or delete the vibe.\n\n" +
        "Nor can a film they like or love be taken out of its last vibe: an empty `vibes` list " +
        "is refused for a filed film with a standing liked or loved, and the refusal names the " +
        "verdict — keep one of its vibes or add another. A film already in no vibe may be given " +
        "an empty list.",
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
        movie: await store.updateMovie(
          title,
          year,
          { title: retitled, year: reyeared, imdbId, viewing, vibes },
          { positiveNeedsVibe: true },
        ),
      })),
  );

  server.registerTool(
    "delete_movie",
    {
      title: "Delete a movie",
      description:
        "Forget a film the user saved, where removing it is itself what they asked for. It " +
        "leaves every vibe it was in and the vibes themselves are left alone. Addressed by " +
        "title and year together. Refused while the film is a vibe's core: the refusal names " +
        "the vibes, and the way through is another core with `update_vibe`, or deleting the " +
        "vibe — which is theirs to choose.\n\n" +
        "**Everything they said about the film goes with it**: every verdict — the one that " +
        "stands, the ones it replaced, the ones they took back — in the same write, and none of " +
        "it comes back. If they only want it never recommended, that is dont-want-to-see with " +
        "`update_movie`, which keeps the film and what they said; if they have said things " +
        "about it, tell them those go too.\n\n" +
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
  // What happened on a film evening, which is not what the user likes. These
  // tools write history and never taste: nothing below reads a genre, a vibe, a
  // movie or a verdict, and nothing below writes one. A film in an evening is an
  // offer — Tonight's, or one they brought up — never a saved Movie.

  server.registerTool(
    "record_episode",
    {
      title: "Record an evening",
      description:
        "Write down a film evening: after a reply that recommends films, what they asked for — " +
        "in their own words — and the films you put forward (`offered`). Record only what you " +
        "actually observed. What they went on to do is not something you saw: record it when " +
        "they say, with `offers`. Offering a film is not the same as them choosing it.\n\n" +
        "**Writing this down does not answer them, and it never finishes a request for a " +
        "film.** Nothing here is shown to the user: this is Tonight's own record of an evening, " +
        "and a reply that reports having saved it — *\"logged this evening's recommendation\"* " +
        "— has told them nothing they can act on. Every film in `offered` must already be in " +
        "the reply they can read, named there and said in full. **A film that exists only in " +
        "this call was never recommended.** If the reply does not carry them, do not repair it " +
        "by calling this: write the recommendation first, then record it.\n\n" +
        "**Another round of the same evening** — they asked for something else and you " +
        "recommended again, in this conversation — is this call with `episode`: the id this " +
        "conversation was given when the evening was recorded. Never look up a recent evening " +
        "to append to. A film already in the evening keeps its place and what was said about " +
        "it, and gains the lead if it leads this round. The request stays the evening's first; " +
        "`request` is refused together with `episode`.\n\n" +
        "**An evening they tell you about without asking you anything** — *\"I'm watching X " +
        "tonight\"*, *\"we watched X last night\"*, naming no evening you recorded — is this " +
        "call with `offers` and no `request`: a new evening of their own. It never attaches to " +
        "an existing one. *\"I've seen X\"* is a viewing, never an evening.\n\n" +
        "**This call only adds.** `offers` here may fill a fact that is not known yet; " +
        "restating a stored value changes nothing; taking something back (null), changing a " +
        "known fact or replacing a reason is a correction and is refused — use " +
        "`correct_episode`.\n\n" +
        OFFERED_VS_OFFERS,
      inputSchema: z.object({
        episode: episodeId
          .optional()
          .describe(
            "Another round of an evening recorded in this conversation, by the id you were given. " +
              "Leave out to record a new evening.",
          ),
        request: episodeRequest
          .optional()
          .describe(
            "What they asked for, in their own words. Required for a new evening you " +
              "recommended films for; left out for an evening of their own; refused with `episode`.",
          ),
        offered: z
          .array(offeredFilm)
          .max(MAX_OFFERED)
          .optional()
          .describe(
            "The films you recommended in this reply, in the order you put them, at most one " +
              "leading. Leave out or empty if you named none. These are Tonight's offers.",
          ),
        offers: z
          .array(offerStatement)
          .max(MAX_OFFERS_PER_EVENING)
          .optional()
          .describe(
            "What they said about films of this evening, in the same breath — one entry per " +
              "film. A film not offered by you is added as theirs. Values only: no null here.",
          ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ episode, request, offered, offers }) =>
      attempt(async () => {
        if (episode !== undefined) {
          if (request !== undefined) {
            throw new EpisodeError(
              "An evening keeps the request it was recorded with; a later round adds films, not a new request.",
            );
          }
          return {
            episode: shown(await episodes.addRound(episode, { offered: offered ?? [], offers: offers ?? [] })),
          };
        }
        return { episode: shown(await episodes.record(beginEpisode({ request, offered, offers }))) };
      }),
  );

  server.registerTool(
    "get_episodes",
    {
      title: "Read the evenings",
      description:
        "Every evening recorded for this user, oldest first: what was asked (`request`, null for " +
        "an evening they told you about without asking anything), and `offers` — every film of " +
        "the evening, in the order it first appeared. Each offer says whether Tonight recommended " +
        "it (`offered`) or they brought it up, whether it led a round (`lead`), and four facts: " +
        "`chosen` (they intend to watch it), `started` (they began it), `finished` (they " +
        "completed it) and `passed` (\"not tonight\", with `passReason` if they gave one). Each " +
        "fact is either known — with the value they stated — or not known at all. Not known " +
        "means nobody ever said, and it is a complete answer rather than a gap: do not read it " +
        "as no, and do not fill it in from what seems likely — not from a verdict, not from a " +
        "viewing, not from another evening.\n\n" +
        "`requestSource` and `offeredSource` say where those came from. `observed` means " +
        "Tonight received that request itself, or itself put those films forward, at the time. " +
        "`stated` means the user later corrected it, so what the field now says is theirs " +
        "rather than yours. Both are about the record and never about the film: a corrected " +
        "evening says nothing about what they like, and neither value is something you worked " +
        "out.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => attempt(async () => ({ episodes: (await episodes.episodes()).map(shown) })),
  );

  server.registerTool(
    "correct_episode",
    {
      title: "Record or correct what happened",
      description:
        "Put an evening right, and say what the user told you happened with its films. Two " +
        "kinds of thing are correctable here and they are not the same: what the user told " +
        "you, and what you yourself wrote down at the time. Correcting the request or the " +
        "films offered marks that fact as theirs rather than yours, because a record you had " +
        "to be corrected on is no longer something you witnessed.\n\n" +
        "**Only an evening they unambiguously referred to.** Update an evening only from " +
        "something they said about that evening: a reply to that recommendation in the " +
        "conversation that recorded it, or their naming it (*\"the ones you suggested Friday\"*). " +
        "A title that matches one of its films is never the reference, and neither is the " +
        "evening being the latest or recent. If they did not say which evening, write to no " +
        "evening — and do not ask a question in order to file it. **A verdict is not a watch on " +
        "an evening:** *\"loved X\"* says what they thought of the film and writes no " +
        "evening, even one that offered X; nothing here is inferred from a verdict or from " +
        "a film being marked seen now or seen before.\n\n" +
        "**Facts are per film, and they merge.** `offers` says what they said about films of " +
        "the evening, one entry per film; facts left out keep what is recorded, and null takes " +
        "one back to not known. A film not in the evening is added as theirs (`offered` " +
        "false). Each fact stands alone: chosen is not started, started is not chosen, and " +
        "finishing is not liking — the one exception is that `finished: true` records " +
        "`started: true` as well, because it says they began it. A passed film cannot also be " +
        "chosen or started. A film they brought up stays only while something they said about " +
        "it stands; take back the last of it and it leaves the evening — and an evening with " +
        "no request that loses its last film is deleted, answered as `forgotten`.\n\n" +
        "`chosen`, `watched` and `finished` at the top level are no longer taken: an evening " +
        "can hold several chosen films, so each fact belongs to its film in `offers` " +
        "(\"watched it\" is `started`).\n\n" +
        OFFERED_VS_OFFERS,
      inputSchema: z.strictObject(
        {
          episode: episodeId,
          request: episodeRequest
            .optional()
            .describe(
              "What they actually asked for, if you wrote it down wrongly — or the request an " +
                "evening of their own never had. Replaces it, in their own words. Cannot be removed.",
            ),
          offered: z
            .array(offeredFilm)
            .max(MAX_OFFERS_PER_EVENING)
            .optional()
            .describe(
              "The films you actually recommended that evening, every round, if the record is " +
                "wrong. Replaces Tonight's set whole, with leads as given. A film leaving the set " +
                "stays as theirs while something they said about it stands; otherwise it goes.",
            ),
          offers: z
            .array(offerStatement)
            .max(MAX_OFFERS_PER_EVENING)
            .optional()
            .describe(
              "What they said about films of the evening — one entry per film, merged into what " +
                "is recorded. null takes a fact back to not known.",
            ),
        },
        {
          error: (issue) => {
            if (issue.code !== "unrecognized_keys") return undefined;
            const retired = issue.keys.some((key) => ["chosen", "watched", "finished"].includes(key));
            return `Not taken here: ${issue.keys.join(", ")}.` + (retired ? ` ${FACTS_ARE_PER_OFFER}` : "");
          },
        },
      ),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ episode, request, offered, offers }) =>
      attempt(async () => {
        // Each key is forwarded only when the caller sent it, because an absent
        // field means "leave it alone" and a present null means "take it back".
        const statement: Correction = {};
        if (request !== undefined) statement.request = request;
        if (offered !== undefined) statement.offered = offered;
        if (offers !== undefined) statement.offers = offers;
        const done = await episodes.correct(episode, statement);
        return "forgotten" in done ? { episode: null, forgotten: done.forgotten } : { episode: shown(done) };
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
    async ({ episode }) =>
      attempt(async () => ({ forgotten: shown(await episodes.forget(episode)) })),
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
        "A verdict is a judgement — liked, loved or disliked — about the film, and it applies " +
        "everywhere. Keep their own words for why, where they gave them.\n\n" +
        "**A liked or loved needs a vibe.** It is kept only for a film filed in at least one of " +
        "their vibes, because the vibe is what says why it worked for them. If the film is in " +
        "none — or not saved at all — nothing is written and the answer is `reason: " +
        "\"vibe_required\"`, with `retry` and `next`: find the vibe it belongs in with them, file " +
        "the film, then call this again with `retry.arguments`, in this conversation. Until then " +
        "it is not saved, so never say it is. `disliked` needs no vibe and no saved film.\n\n" +
        "**Call this in the turn they say it, before anything else** — before offering a vibe, " +
        "filing the film or asking about when, and even for a film you can see is in no vibe: its " +
        "answer is how a liked is kept. Never file the film first to make a liked keepable; filing " +
        "it needs their yes. A liked or loved said now about a film saved as want-to-see is their " +
        "word that they watched it: move it with update_movie to seen-before — seen-now only if " +
        "they placed it recently — in this same turn, before you ask anything.\n\n" +
        "**Turning a film down is not a verdict.** *\"Not interested\"*, *\"stop suggesting it\"*, " +
        "*\"don't recommend it again\"* say where the film stands on their list: dont-want-to-see, " +
        "with `create_movie` or `update_movie`. *\"Not tonight\"* and *\"not in the mood for " +
        "it\"* are about the evening — offer something else; never a viewing or a verdict, at most " +
        "a pass on that evening (`correct_episode`). Neither is ever " +
        "`disliked`, which says they watched it, and neither is a question asking them to say " +
        "more than they did.\n\n" +
        "Changed their mind? Record the new verdict; it supersedes the old one and the old one " +
        "stays in the history. Nothing is rewritten.\n\n" +
        "This writes the verdict and nothing else. If you had asked them about this film, the " +
        "asking was a sentence in your conversation and was never recorded anywhere, so there " +
        "is nothing here to close and nothing that stays open if they never answer.",
      inputSchema: strictly({
        film: verdictFilm,
        told: verdictTold,
        said: strictly({
          about: z.literal("judgement", { error: NOT_A_VERDICT }),
          judgement: z.enum(JUDGEMENTS).describe("What they said about it."),
          because: verdictWords("Why, if they said why."),
        }).describe("What they said: a judgement about the film."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ film, told, said }) =>
      attempt(async () => {
        // Handed over as it arrived, `about` included, so the model refuses a
        // refusal itself rather than relying on the schema in front of it.
        const verdict = stateVerdict(film, said, told, now());
        try {
          // A liked or loved is held to the vibe rule, and whether a film is
          // filed is the taste store's question, so that store writes it — in
          // the same transaction as it checks. Anything else needs no vibe.
          const kept = isPositive(verdict.assertion.judgement)
            ? await store.sayFiled(verdict)
            : await verdicts.say(verdict);
          return { verdict: written(kept) };
        } catch (error) {
          if (error instanceof VibeRequired) throw new Refused(vibeRequired(error, verdict));
          throw error;
        }
      }),
  );

  server.registerTool(
    "withdraw_verdict",
    {
      title: "Take back what they said about a film",
      description:
        "They no longer stand by what they told you. This leaves no current verdict about the " +
        "film — not a neutral one, and certainly not a dislike: taking back \"I loved it\" " +
        "leaves no current opinion standing, the way it applied before they spoke. It does not " +
        "unsay it: that they said it stays true, and `get_memory` still remembers it.\n\n" +
        "The history is kept. What they said and that they took it back are both true.",
      inputSchema: strictly({ film: verdictFilm }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ film }) =>
      attempt(async () => ({ withdrawal: written(await verdicts.say(withdrawVerdict(film, now()))) })),
  );

  server.registerTool(
    "get_verdicts",
    {
      title: "What they have said about a film",
      description:
        "Everything they have said about one film, and which of it stands now.\n\n" +
        "`current` is null when no verdict stands — either they never gave one, or they took " +
        "back the one they gave. That is not a preference you may act on as though it were " +
        "one, and a taking-back is not the same as never having spoken — `history` below still " +
        "holds it." +
        "\n\nThis reads what they said and nothing else: verdicts and takings-back, for one film. " +
        "It cannot see a saved film, a genre, a vibe or an evening, so it cannot tell you " +
        "whether the film is even in their collection or whether they have said they watched it. " +
        "**Never conclude from this read what their whole position on a film is.** A question " +
        "about everything Tonight holds is `get_memory`'s.",
      inputSchema: strictly({ film: verdictFilm }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ film }) =>
      attempt(async () => {
        const history = await verdicts.history(film as Film);
        // What leaves is what they said. Persistence hangs two handles on an act
        // — the order the table accepted it in, and the reference it is known
        // by — and neither is part of the claim. The order is machinery and was
        // never anybody's business out here; the reference is real, but nothing
        // on this surface can act on one yet, and an identifier a caller cannot
        // use is an invitation to invent a use for it.
        const held = current(history);
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
        "`held` is what it currently holds as theirs: their genres, their vibes — each with its " +
        "`core`, the film anchoring it, or null where none has been chosen yet — the films they " +
        "saved with where each stands on their list, and the verdicts that still stand. " +
        "`remembered` is what it remembers happening: evenings, " +
        "verdicts they replaced, verdicts they took back. **Remembered is not evidence about " +
        "them.** An evening is not a preference, and something they stopped saying is not " +
        "something they say.\n\n" +
        "A film and a verdict are different kinds of thing and neither contradicts the other. A " +
        "film carries `viewing` — where it stands on their list — and no opinion at all; every " +
        "opinion is a verdict. So there is nothing here to rank against anything else: what they " +
        "think of a film is whatever verdict stands, and if none stands, no current opinion stands — " +
        "which `remembered` may still show them having given and taken back.\n\n" +
        "Every entry carries where it came from and, where one exists, the handle you correct " +
        "it by: a genre or vibe by its name, a film by title and year, an evening by its id, and " +
        "one thing they said by its `ref`. A verdict's `ref` is what `forget_verdict` takes. An " +
        "evening carries `offers` — every film of it, as `get_episodes` shows them, each with " +
        "`offered` (Tonight's or theirs) and its own chosen, started, finished and passed — and " +
        "says where its own record came from: `requestSource` and `offeredSource` are `observed` " +
        "where Tonight received the request or put the films forward itself, and `stated` where " +
        "the user later corrected it. An evening they told you about without asking anything has " +
        "`request` null and no `requestSource`.\n\n" +
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

  // --- candidates ----------------------------------------------------------
  //
  // Films the agent chose, checked against what Tonight holds. The same two
  // reads `get_taste` makes and no others, joined by `lib/candidates/model.ts`:
  // nothing here supplies a film, and nothing here writes.

  server.registerTool(
    "check_candidates",
    {
      title: "Check films you mean to recommend",
      description:
        "What Tonight holds about films you have chosen to recommend, one entry per film, in the " +
        `order you sent them — at most ${MAX_CANDIDATES}. It checks the films you name and never ` +
        "offers one: nothing here suggests, ranks or filters a film, and it knows no film it was " +
        "not told about.\n\n" +
        "Each film is matched by title and year together, the way Tonight names a film: case and " +
        "spacing aside, exactly. A title with and without its accents is two films here, and so " +
        "is one title in two years.\n\n" +
        "`status` is what was found. `saved`: a film on their list, which `movie` shows as stored " +
        "— its `viewing`, and the `vibes` it is filed in. `said-only`: no saved film, but a verdict " +
        "about it stands. `nothing`: neither. **`nothing` means Tonight holds nothing about the " +
        "film, never that they have not seen it.**\n\n" +
        "`seen` is `true` when they have watched it — their list says seen-now or seen-before, or " +
        "a judgement stands, " +
        "since nobody likes a film they have not seen; `false` only when their list says " +
        "want-to-see and no judgement stands; `null` when Tonight does not know, and `null` is not " +
        "`false`. `neverRecommend` is `true` for a film saved as dont-want-to-see: it is **never " +
        "recommended** — not as the lead, not as a direction — whatever else is true of it. " +
        "`verdict` is the judgement that stands now, with `because` only where they gave their " +
        "words; one they took back or replaced is not here. Being in a vibe is no opinion about a " +
        "film.\n\n" +
        "`otherYears` lists other years in which Tonight holds a film of exactly this title, and " +
        "`imdbHeldBy` names the saved film that carries the IMDb id you sent, when that is a " +
        "different title or year. Neither is merged into the entry: if one of them is the film you " +
        "meant, check that film by its own title and year.\n\n" +
        "Episodes are not read: an evening is history, not taste, and a film they turned down for " +
        "one evening is not here — that is in your conversation. Reading this writes nothing.",
      inputSchema: z.object({
        candidates: z
          .array(
            z.object({
              title: movieTitle.describe(
                "The film's title, as you would name it to them. Matched together with the year, " +
                  "case and spacing aside.",
              ),
              year: movieYear.describe(
                "Its release year — the other half of how Tonight names a film: one title in two " +
                  "years is two films.",
              ),
              imdb_id: imdbIdText
                .optional()
                .describe(
                  'Its IMDb title id, if you have one — "tt0111161". Compared exactly with the ids ' +
                    "on their saved films and never looked up. Leave it out if you have none.",
                ),
            }),
          )
          .min(1)
          .max(MAX_CANDIDATES)
          .describe("The films you are about to put forward, each named once."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ candidates }) =>
      attempt(async () => {
        // Checked before either store is read, so a refusal reads nothing.
        const asked = askedCandidates(
          candidates.map(({ title, year, imdb_id: imdbId }) => ({ title, year, imdbId })),
        );
        const [taste, standing] = await Promise.all([store.taste(), verdicts.standing()]);
        return { candidates: checkCandidates(asked, { movies: taste.movies, standing }) };
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
 * What to do after a liked or loved was refused for want of a vibe.
 *
 * A constant, carried in the answer so it is read at the moment it applies, and
 * the same sentence the vibes skill gives. Nothing about the refusal is
 * remembered anywhere: `retry` is the only thing that carries it forward, and it
 * lives in this conversation.
 */
const VIBE_REQUIRED_NEXT =
  "Nothing was written. This is the expected answer, not a failure: apologise for nothing and " +
  "report no error. A liked or loved verdict is kept only for a film in at least one of " +
  "their vibes. If `movie.viewing` is want-to-see, their liked says they watched it: move it " +
  "with update_movie to seen-before (seen-now only if they placed it recently) now, before the " +
  "offer, and say so. Read get_taste, then in this conversation: (1) if one of their vibes fits — " +
  "judge by its instruction and genres, not its name — recommend filing the film there, with two " +
  "concrete alternatives beside it and never a bare offer to make a new one: each another vibe " +
  "of theirs it fits, or a new vibe with a name, a sentence, its genres and this film as core — " +
  "another evening the film could stand for; if it " +
  "fits except that its sentence does not yet cover this film, show them the exact minimal new " +
  "wording — one its core still fits wholly — and change it with update_vibe only on their yes " +
  "to those words; where a new vibe would make sense too, offer both in the one offer — that " +
  "wording, and a new vibe offered as (2) offers one — say in one line which you would choose " +
  "and why, and let them choose; a reply that does not make clear which they chose is asked " +
  "about once before anything is written. A film that only partly fits a vibe goes there only " +
  "beside one it fits well or anchors. (2) If none fits, " +
  "offer one recommended new vibe and two meaningfully different alternatives — each a " +
  "different evening the film could stand for, read from the film, their vibes and what they " +
  "have liked and anything they said about it, with a name, a sentence, their genres and this " +
  "film as core — and let their choice say which; never ask them why they liked it. (3) On " +
  "their yes, file it — " +
  "update_movie with its vibes, create_movie with viewing seen-now or seen-before and vibes for " +
  "an unsaved film, or create_vibe with it as core and core.viewing; where they chose the new " +
  "wording, update_vibe with it first; where they chose a new vibe beside one the film partly " +
  "fits, create_vibe with it as core and core.viewing, then update_movie listing that new vibe " +
  "and the one it partly fits, because the list replaces what was there — a watched film is " +
  `${SEEN_RULE}, and when they did not say when, that question goes into the one you put ` +
  "about the vibe; a yes that does not say when is them not saying: unless something they said " +
  "earlier placed it or the film already has a seen viewing, write seen-before, and never ask " +
  "about when again — then call record_verdict again with retry.arguments. If " +
  "they decline, it stays unsaved: say so once, and write nothing in its place.";

/**
 * The answer to a liked or loved refused for want of a vibe.
 *
 * `retry.arguments` is the call to make again once the film is filed, built from
 * what was checked — their judgement, their words and how they came to say it —
 * so the retry records exactly what they said and nothing the agent re-typed.
 */
function vibeRequired(refusal: VibeRequired, verdict: Verdict): Record<string, unknown> {
  const { judgement, because } = verdict.assertion;
  return {
    saved: false,
    reason: "vibe_required",
    film: refusal.film,
    movie: refusal.movie,
    retry: {
      tool: "record_verdict",
      arguments: {
        film: refusal.film,
        told: verdict.told,
        said: { about: "judgement", judgement, ...(because === null ? {} : { because }) },
      },
    },
    next: VIBE_REQUIRED_NEXT,
  };
}

/**
 * A refusal that carries a structured answer, rather than a sentence alone.
 *
 * Still a refusal — `isError`, nothing written — so no client mistakes it for a
 * save. The value travels in `structuredContent` and, as JSON, in `content`, for
 * a host that shows the model only the text of an error.
 */
class Refused extends Error {
  readonly value: Record<string, unknown>;

  constructor(value: Record<string, unknown>) {
    super(String(value.reason));
    this.value = value;
  }
}

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
 * A `Refused` is the same kind of answer with a structured value in it, shaped
 * like a success's so a client reads it the same way, and marked `isError` so it
 * is never read as one.
 *
 * Anything that is not a `TasteError` is ours rather than the caller's — a
 * database failure, a misconfigured deployment — and is left to the SDK, which
 * answers it without describing our internals or leaking what is missing.
 */
async function attempt(work: () => Promise<unknown>) {
  try {
    return answer(await work());
  } catch (error) {
    if (error instanceof Refused) return { isError: true as const, ...answer(error.value) };
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
