import { database } from "../db.ts";
import type { SqlDriver } from "../db/driver.ts";
import { prepareSchema } from "../db/migrate.ts";
import type { AuthenticatedUser } from "../identity.ts";
import type { Genre, Mix, Movie, MovieHandle, MovieState, Taste } from "./model.ts";

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
 * here and no `where`: `createMix` is a thing Tonight does, and what SQL it takes
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
 * carries every mix reference with it; see the schema for why that is one
 * statement rather than several.
 */
export type GenreChanges = { name?: unknown; instruction?: unknown };

/** What creating a mix is given. Both fields are the caller's, as a genre's are. */
export type MixDraft = { name: unknown; instruction: unknown; genres: unknown };

/**
 * What updating a mix may change.
 *
 * Passing `genres` replaces the list rather than adding to it, which is why this
 * is not simply a partial mix: "these are its genres now" has to be
 * distinguishable from not mentioning them.
 */
export type MixChanges = { name?: unknown; instruction?: unknown; genres?: unknown };

/**
 * What creating a movie is given.
 *
 * `title` and `year` are required because together they are how a movie is
 * addressed. Everything else is optional, and `state` is optional in the sense
 * that matters: leaving it out records that nothing was said, not that they have
 * not seen it.
 */
export type MovieDraft = {
  title: unknown;
  year: unknown;
  imdbId?: unknown;
  state?: unknown;
  mixes?: unknown;
};

/**
 * What updating a movie may change.
 *
 * `undefined` means leave it alone; `null` is a value the caller can set. The
 * distinction carries the whole of the state semantics — omitting `state` keeps
 * what was there, passing `null` says Tonight no longer knows — so these are
 * `unknown` rather than typed optionals, and the domain decides.
 *
 * Passing `mixes` replaces the filing exactly, `[]` included. Omitting it leaves
 * the relation rows untouched: not re-derived, not re-resolved, not rewritten.
 */
export type MovieChanges = {
  title?: unknown;
  year?: unknown;
  imdbId?: unknown;
  state?: unknown;
  mixes?: unknown;
};

export type TasteStore = {
  /**
   * The whole model — genres, mixes and movies — from one database snapshot.
   *
   * The only read there is. Everything that shows a taste model shows all of it —
   * a mix is unreadable without the genres under it — so a per-object read would
   * be an interface nobody wants and a second way for the parts to disagree.
   */
  taste(): Promise<Taste>;

  createGenre(draft: GenreDraft): Promise<Genre>;
  /** Applies changes, rewriting every mix that names this genre when it is renamed. */
  updateGenre(name: string, changes: GenreChanges): Promise<Genre>;
  /** Removes a genre. Refused while any mix is built from it. */
  deleteGenre(name: string): Promise<Genre>;

  createMix(draft: MixDraft): Promise<Mix>;
  updateMix(name: string, changes: MixChanges): Promise<Mix>;
  /** Removes a mix. Always allowed: nothing is built from a mix. */
  deleteMix(name: string): Promise<Mix>;

  createMovie(draft: MovieDraft): Promise<Movie>;
  /**
   * Applies changes, addressed by the movie's current title and year.
   *
   * Changing either leaves the object it is: the filings point at an id, so a
   * retitled movie is still in the same mixes and no relation row is written.
   */
  updateMovie(title: string, year: number, changes: MovieChanges): Promise<Movie>;
  /** Removes a movie. Always allowed: its filings go with it, the mixes stay. */
  deleteMovie(title: string, year: number): Promise<Movie>;
};

/** Re-exported so a caller needs one import to work with what these return. */
export type { Genre, Mix, Movie, MovieHandle, MovieState, Taste };

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
