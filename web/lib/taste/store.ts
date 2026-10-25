import { database } from "../db.ts";
import type { SqlDriver } from "../db/driver.ts";
import { prepareSchema } from "../db/migrate.ts";
import type { AuthenticatedUser } from "../identity.ts";
import type { Act, Identified, Judgement, Verdict } from "../verdicts/model.ts";
import type { Genre, Vibe, Movie, MovieHandle, Viewing, Taste } from "./model.ts";

/**
 * One user's taste model, and every operation on it.
 *
 * The user is not a parameter of anything below. It is fixed when the store is
 * opened and captured for the life of it, so there is no argument a caller could
 * get wrong and no field an MCP client or a browser request could supply:
 * `tasteStore(user)` is the only way to reach any of this, and the only user it
 * can reach is the one it was given. That is the whole isolation mechanism, and
 * it is a shape rather than a check — a tool cannot ask for someone else's
 * genres because there is nowhere to say whose genres it wants.
 *
 * The operations are the product's, not the database's. There is no `insert`
 * here and no `where`: `createVibe` is a thing Tonight does, and what SQL it takes
 * is the adapter's business. That is what keeps SQL out of the MCP tools and out
 * of the web routes.
 *
 * **Nothing here recommends a movie.** It does hold movies — the ones the user
 * told Tonight about, and the one thing they said about each — but a film is only here
 * because somebody put it here. There is no catalogue behind it and nothing is
 * looked up. Choosing what to watch stays the host agent's, over the top of what
 * these operations return.
 */

/**
 * What creating a genre is given.
 *
 * Both fields are the caller's. A genre with no instruction is refused rather
 * than given a meaning nobody chose: what `Action` means to this person is the
 * one thing the store has no way to work out.
 */
export type GenreDraft = { name: unknown; instruction: unknown };

/**
 * What updating a genre may change.
 *
 * Every field is optional and `undefined` means "leave it alone". Renaming
 * carries every vibe reference with it; see the schema for why that is one
 * statement rather than several.
 */
export type GenreChanges = { name?: unknown; instruction?: unknown };

/**
 * What creating a vibe is given. Every field is the caller's, as a genre's are.
 *
 * `core` is required: the film that best embodies the vibe, by title and year. It
 * is filed in the vibe by the same write, and saved first if it is not saved yet —
 * as its optional `viewing`, `seen-now` or `seen-before`, and `seen-before`
 * without one. A saved film keeps its own viewing.
 */
export type VibeDraft = { name: unknown; instruction: unknown; genres: unknown; core: unknown };

/**
 * What updating a vibe may change.
 *
 * Passing `genres` replaces the list rather than adding to it, which is why this
 * is not simply a partial vibe: "these are its genres now" has to be
 * distinguishable from not mentioning them.
 *
 * Passing `core` anchors the vibe on that film — a pre-M5 vibe for the first
 * time, or any vibe on a better embodiment. The film it replaces stays in the
 * vibe. It cannot be passed as `null`: a core is replaced, never cleared.
 */
export type VibeChanges = {
  name?: unknown;
  instruction?: unknown;
  genres?: unknown;
  core?: unknown;
};

/**
 * What creating a movie is given.
 *
 * `title` and `year` are required because together they are how a movie is
 * addressed. Everything else is optional, and leaving `viewing` out saves the
 * film as `want-to-see`, on their list — `DEFAULT_VIEWING`.
 */
export type MovieDraft = {
  title: unknown;
  year: unknown;
  imdbId?: unknown;
  viewing?: unknown;
  vibes?: unknown;
};

/**
 * What updating a movie may change.
 *
 * `undefined` means leave it alone; `null` is a value the caller can send. It
 * clears an IMDb id and is refused for a viewing, which always stands somewhere —
 * so these are `unknown` rather than typed optionals, and the domain decides.
 *
 * Passing `vibes` replaces the filing exactly, `[]` included. Omitting it leaves
 * the relation rows untouched: not re-derived, not re-resolved, not rewritten.
 */
export type MovieChanges = {
  title?: unknown;
  year?: unknown;
  imdbId?: unknown;
  viewing?: unknown;
  vibes?: unknown;
};

/**
 * How a caller asks a write to keep every film they like or love in a vibe.
 *
 * With `positiveNeedsVibe`, `updateMovie` refuses to take a film with a standing
 * liked or loved out of its last vibe, and `deleteVibe` refuses to delete the
 * last vibe of one. Decided inside the write's transaction, while the films are
 * held. Only the MCP server passes it — the website's one write never files,
 * unfiles or deletes — and a caller that leaves it out gets these writes exactly
 * as they always were.
 */
export type KeepFiled = { positiveNeedsVibe?: boolean };

export type TasteStore = {
  /**
   * The whole model — genres, vibes and movies — from one database snapshot.
   *
   * The only read there is. Everything that shows a taste model shows all of it —
   * a vibe is unreadable without the genres under it — so a per-object read would
   * be an interface nobody wants and a second way for the parts to disagree.
   */
  taste(): Promise<Taste>;

  createGenre(draft: GenreDraft): Promise<Genre>;
  /** Applies changes, rewriting every vibe that names this genre when it is renamed. */
  updateGenre(name: string, changes: GenreChanges): Promise<Genre>;
  /** Removes a genre. Refused while any vibe is built from it. */
  deleteGenre(name: string): Promise<Genre>;

  createVibe(draft: VibeDraft): Promise<Vibe>;
  updateVibe(name: string, changes: VibeChanges): Promise<Vibe>;
  /**
   * Removes a vibe. Allowed whenever nothing is built from it — which is always —
   * unless `positiveNeedsVibe` is passed and it is the last vibe of a film they
   * like or love.
   */
  deleteVibe(name: string, options?: KeepFiled): Promise<Vibe>;

  createMovie(draft: MovieDraft): Promise<Movie>;
  /**
   * Applies changes, addressed by the movie's current title and year.
   *
   * Changing either leaves the object it is: the filings point at an id, so a
   * retitled movie is still in the same vibes and no relation row is written.
   * A new filing that leaves out a vibe this movie is the core of is refused, and
   * so — with `positiveNeedsVibe` — is an empty filing for a film that is filed
   * now and has a standing liked or loved.
   */
  updateMovie(title: string, year: number, changes: MovieChanges, options?: KeepFiled): Promise<Movie>;
  /**
   * Removes a movie: its filings go with it, the vibes stay. Refused while it is a
   * vibe's core, and the refusal names the vibes.
   *
   * Every verdict act about the film goes with it too — current, replaced and
   * withdrawn — in the same transaction, so nothing they said about a film they
   * removed outlives it.
   */
  deleteMovie(title: string, year: number): Promise<Movie>;

  /**
   * Writes a liked or loved verdict, only while its film is filed in at least
   * one vibe; otherwise refuses with `VibeRequired` and writes nothing.
   *
   * Here rather than on the verdict store because the question is the taste
   * model's: whether a film is filed. The film is held `FOR SHARE` and the act
   * written in the same transaction, so a write taking the film out of its last
   * vibe either committed first and is seen, or waits and then sees the verdict.
   * The act itself is written by the verdict module, exactly as `say` writes
   * one. Anything but a liked or loved is refused: those need no vibe and go to
   * the verdict store. The MCP server calls this, and so does the website's one
   * write — a film's *Love it* and *Like it* (`lib/web/choose.ts`).
   */
  sayFiled(verdict: Verdict): Promise<Identified<Act>>;

  /**
   * Writes any other act — a disliked, or a taking-back — only while its film is
   * saved; otherwise refuses as for a missing movie and writes nothing.
   *
   * A verdict needs no saved film, and the verdict store's `say` writes one
   * either way. This is for a caller that only ever speaks about the user's saved
   * films — a film's *Dislike*, and pressing a standing opinion again
   * (`lib/web/choose.ts`) — so a press cannot land after the film was deleted and
   * outlive it. Held as `sayFiled` holds it. A liked or loved is refused: that is
   * `sayFiled`.
   */
  saySaved(act: Act): Promise<Identified<Act>>;

  /**
   * One press on a saved film's own screen (`lib/web/choose.ts`), decided and
   * written whole while the film is held.
   *
   * One transaction, holding the film `FOR UPDATE` before anything is read: its
   * viewing, the judgement that stands about it, whether it is filed and whether
   * it is a core are read under that lock and handed to `decide`, which answers
   * with what to write or throws a refusal. So what a press does is decided from
   * the film as it is, never from the page somebody loaded earlier.
   *
   * The act is stamped after the lock, `told: confirmed` — an answer to the
   * question the page puts. One that would sort before an act already said about
   * the film is refused (`TasteError`), because it could not change what stands.
   * Then the act — a verdict, or a withdrawal only if a judgement stands — and
   * then the viewing, if it changes: a liked or loved needs the film filed
   * (`VibeRequired`), and a core is never moved off seen (`TasteError`). Any
   * refusal or failure leaves both as they were.
   */
  choose(film: MovieHandle, decide: (held: HeldFilm) => FilmWrite): Promise<void>;
};

/** A saved film as a press on its screen finds it: read under the film's lock. */
export type HeldFilm = {
  viewing: Viewing;
  /** The standing judgement, or `null` when nothing stands. */
  judgement: Judgement | null;
  /** Whether it is in at least one vibe. */
  filed: boolean;
  /** Whether a vibe is anchored on it. */
  core: boolean;
};

/**
 * What one press writes. Any of the three — a verdict and a viewing, or a
 * withdrawal and a viewing, are one press — and none of them is nothing.
 */
export type FilmWrite = {
  /** A verdict to say. */
  judgement?: Judgement;
  /** Take back the judgement that stands, if one does. */
  withdraw?: boolean;
  /** Where the film stands from now, if that is a change. */
  viewing?: Viewing;
};

/** Re-exported so a caller needs one import to work with what these return. */
export type { Genre, Vibe, Movie, MovieHandle, Viewing, Taste };

/**
 * Opens the store for one authenticated user.
 *
 * Takes the `AuthenticatedUser` rather than an id string, so that reaching this
 * function at all means having been through an authentication boundary. A bare
 * string could be anything a request body contained; this type only exists on the
 * far side of a verified token or a resolved session.
 *
 * A new user has no taste model and none is created for them: a first read
 * returns three empty lists rather than a dozen genres somebody else chose. What
 * a new user gets instead is the question — "what kind of movies do you like?" —
 * and everything that follows is theirs.
 */
export async function tasteStore(user: AuthenticatedUser): Promise<TasteStore> {
  const driver = await prepared();
  const { sqlTasteStore } = await import("./store/sql.ts");
  return sqlTasteStore(driver, user);
}

/**
 * The connection, with this schema known to be current — done once per process.
 *
 * A store is opened per request, and migrating on each one would spend several
 * round trips re-establishing something that cannot have changed since the last
 * request. Caching the promise rather than a flag means concurrent first requests
 * wait for one run instead of starting several.
 *
 * Running it at all is belt and braces: a deploy should run `npm run db:migrate`
 * in its own step, and an instance that comes up against an un-migrated database
 * should still work rather than serve errors until someone notices. In production
 * this checks and refuses instead of migrating — see `lib/db/migrate.ts`.
 *
 * A failure is forgotten rather than cached, so an instance that could not reach
 * the database on its first request is not broken for the rest of its life.
 */
let preparing: Promise<SqlDriver> | undefined;

function prepared(): Promise<SqlDriver> {
  preparing ??= (async () => {
    const driver = await database();
    const { TASTE_SCHEMA } = await import("./store/schema.ts");
    await prepareSchema(driver, TASTE_SCHEMA);
    return driver;
  })().catch((error: unknown) => {
    preparing = undefined;
    throw error;
  });
  return preparing;
}
