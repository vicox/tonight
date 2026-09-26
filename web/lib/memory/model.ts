import type { Episode, Recorded } from "../episodes/model.ts";
import { filmKey } from "../films/identity.ts";
import type { Movie, MovieHandle, Taste, Viewing, Written } from "../taste/model.ts";
import {
  current,
  spoken,
  supersession,
  type Act,
  type Film,
  type Identified,
  type Scope,
  type Told,
  type Verdict,
} from "../verdicts/model.ts";

/**
 * Everything Tonight holds about one person, arranged so it can be explained.
 *
 * This is M3's whole subject: *"what do you think you know about me?"* has to
 * have a complete, honest answer, and everything in that answer has to be
 * correctable from where it is shown. Nothing here is new knowledge. Every
 * entry is a root that already exists in the taste model, the verdict history
 * or the episode record, carried across unchanged and placed.
 *
 * ## Why two places and not one list
 *
 * Because *"I know you dislike this"* and *"I remember you watched this"* are
 * different claims, and a reader that meets them in one list will treat them as
 * one kind of thing. Tonight's central promise is that only what somebody said
 * counts as evidence about them; a memory view that quietly flattened an evening
 * in beside a verdict would undo that promise at the exact moment the user
 * looked at it.
 *
 * So:
 *
 * - **held** — what Tonight currently holds as knowledge about them, and can
 *   act on. Genres, Vibes, Movies with what is known about watching them, and
 *   the verdicts that stand.
 * - **remembered** — what Tonight remembers happening: evenings, and the things
 *   they said that no longer stand. True, and not evidence.
 *
 * ## Nothing here decides anything
 *
 * Not one rule. This file is placement: which store a root came from, and what
 * the verdict model already says became of it.
 *
 * There used to be a third section and a rule to go with it, because a Movie
 * carried an opinion and a Verdict carried an opinion and something had to say
 * which governed. Only Verdicts carry opinions now, so there is no second
 * opinion to rank against and nothing left to resolve. A Movie says the film is
 * theirs and whether they watched it; what they thought of it is in one place.
 */

/* ------------------------------------------------------------- provenance */

/**
 * How a root came to be, using only what its own store actually recorded.
 *
 * Deliberately three shapes rather than one with a shared `when`. The three
 * stores know genuinely different things about time, and a single field would
 * force two of them to imply something nobody wrote down:
 *
 * - a Genre knows when its **row** was written and last changed;
 * - a verdict knows when the user **spoke**, because the model made that part
 *   of the claim;
 * - an episode knows when Tonight **wrote the evening down**, which is not when
 *   the evening happened, and nobody ever asked when it did.
 *
 * Collapsing those into `when` would make the first and third read as the
 * second, which is the difference between a record and a memory of a
 * conversation.
 */
export type Saved = {
  kind: "saved";
  /**
   * When Tonight wrote the row, or `null` where persistence does not know.
   *
   * A storage time. It is **not** when the user decided this, said it, or first
   * meant it. `null` survives as `null`: a film saved before Tonight recorded
   * creation times has no known moment, and a value there would be
   * indistinguishable from a real one.
   */
  savedAt: string | null;
  /** When the row last changed. Also a storage time. Never null. */
  changedAt: string;
};

/** What became of something they said. */
export type Became = "current" | "superseded" | "withdrawn";

export type Said = {
  kind: "said";
  /** Always the user. Nothing else may state a verdict, and nothing else does. */
  claimant: "user";
  /** When they spoke. The one time in this file that is a person's, not a row's. */
  saidAt: string;
  scope: Scope;
  /**
   * How they came to say it. Absent on a withdrawal, which asserts nothing and
   * so was neither volunteered nor confirmed.
   */
  told?: Told;
  /**
   * What became of it. Absent on a withdrawal: a withdrawal is not something
   * that had a fate, it is the fate something else had.
   */
  became?: Became;
};

export type Evening = {
  kind: "evening";
  /**
   * When Tonight wrote the evening down.
   *
   * Not when the evening was. Only the user could say that and nobody asked, so
   * there is no field here for it and none is inferred from this one.
   */
  recordedAt: string;
};

/* ----------------------------------------------------------------- handles */

/**
 * How a caller names a root in order to change it.
 *
 * One shape per way an existing tool already takes it, and nothing appears here
 * that no tool accepts. That is the rule this file keeps: an identifier in a
 * payload is an invitation to use it, so a root whose handle is a database
 * column nobody can pass gets no handle at all rather than a decorative one.
 */
export type Handle =
  /** A Genre or a Vibe, by the name the user gave it. */
  | { by: "name"; name: string }
  /** A Movie, by the two halves of how a film is named. */
  | { by: "film"; title: string; year: number }
  /** One act in a verdict history, by the reference persistence assigned it. */
  | { by: "ref"; ref: string }
  /** One evening, by the id the episode store generated. */
  | { by: "id"; id: string };

/* ------------------------------------------------------------------- roots */

export type Placement = "held" | "remembered";

/** A genre the user wrote, and what it means to them. */
export type GenreRoot = {
  placement: "held";
  of: "genre";
  name: string;
  instruction: string;
  basis: Saved;
  handle: Handle;
};

/** A vibe: named genres, and what the user means by having combined them. */
export type VibeRoot = {
  placement: "held";
  of: "vibe";
  name: string;
  instruction: string;
  genres: readonly string[];
  films: readonly MovieHandle[];
  basis: Saved;
  handle: Handle;
};

/** A film they filed, and whether they have said they watched it. */
export type MovieRoot = {
  placement: "held";
  of: "movie";
  film: Film;
  /** `null` is never told, which is not the same as `unseen`. */
  viewing: Viewing | null;
  imdbId: string | null;
  vibes: readonly string[];
  basis: Saved;
  handle: Handle;
};

/**
 * One thing the user said about a film — a verdict, or taking one back.
 *
 * The act is carried in the verdict model's own shape rather than re-projected
 * into something this file invented. `spoken` takes off the two handles
 * persistence hangs on it; the reference comes back through `handle`, where it
 * means *"this is what you point at to forget this"* rather than being loose in
 * the claim.
 */
export type SaidRoot = {
  placement: Placement;
  of: "verdict";
  act: Act;
  basis: Said;
  handle: Handle;
};

/**
 * One evening, exactly as the episode store holds it.
 *
 * Always remembered, never held. An evening is something Tonight was part of,
 * not something the user told it about themselves — and the whole of M1 rests
 * on the difference: offering is not choosing, choosing is not watching,
 * watching is not finishing, and finishing is not liking. A memory view that let
 * an evening into `held` would make the last of those true by presentation.
 */
export type EveningRoot = {
  placement: "remembered";
  of: "evening";
  request: string;
  requestSource: Episode["requestSource"];
  offered: Episode["offered"];
  offeredSource: Episode["offeredSource"];
  chosen: Episode["chosen"];
  watched: Episode["watched"];
  finished: Episode["finished"];
  basis: Evening;
  handle: Handle;
};

export type HeldRoot = GenreRoot | VibeRoot | MovieRoot | SaidRoot;
export type RememberedRoot = SaidRoot | EveningRoot;
export type Root = HeldRoot | EveningRoot;

/* --------------------------------------------------------------- the rule */

export type Memory = {
  held: readonly HeldRoot[];
  remembered: readonly RememberedRoot[];
};

/** The roots, as the three stores already hand them over. */
export type Roots = {
  taste: Taste;
  /** Every act, from `VerdictStore.acts()` — current, superseded and withdrawn. */
  acts: readonly Identified<Act>[];
  episodes: readonly Recorded<Episode>[];
};

/* ----------------------------------------------------------------- compose */

/**
 * Arranges what Tonight holds. Reads, decides nothing new, writes nothing.
 *
 * Pure, and takes no user: the three inputs arrive from stores that are already
 * bound to one person, so there is no identifier here to get wrong and no way
 * for this function to reach a second user's rows.
 *
 * Every call derives the whole picture from the roots it is given. Nothing is
 * cached and nothing is stored, which is why a forgotten act simply is not here
 * the next time rather than having to be cleaned out of somewhere.
 */
export function compose({ taste, acts, episodes }: Roots): Memory {
  const held: HeldRoot[] = [];
  const remembered: RememberedRoot[] = [];

  for (const genre of taste.genres) {
    held.push({
      placement: "held",
      of: "genre",
      name: genre.name,
      instruction: genre.instruction,
      basis: savedAs(genre),
      handle: { by: "name", name: genre.name },
    });
  }

  for (const vibe of taste.vibes) {
    held.push({
      placement: "held",
      of: "vibe",
      name: vibe.name,
      instruction: vibe.instruction,
      genres: vibe.genres,
      films: vibe.movies,
      basis: savedAs(vibe),
      handle: { by: "name", name: vibe.name },
    });
  }

  for (const movie of taste.movies) {
    held.push(movieRoot(movie));
  }

  // Verdict acts, placed by what the verdict model says became of them. The
  // model is asked rather than re-derived: which claim stands, and what
  // displaced what, has contracts on it there, and a second answer here would
  // be free to disagree with the one the recommendation path uses.
  for (const line of byFilm(acts)) {
    for (const root of placed(line)) {
      (root.placement === "held" ? held : remembered).push(root);
    }
  }

  for (const episode of episodes) {
    remembered.push({
      placement: "remembered",
      of: "evening",
      request: episode.request,
      requestSource: episode.requestSource,
      offered: episode.offered,
      offeredSource: episode.offeredSource,
      chosen: episode.chosen,
      watched: episode.watched,
      finished: episode.finished,
      basis: { kind: "evening", recordedAt: episode.recordedAt },
      handle: { by: "id", id: episode.id },
    });
  }

  return { held, remembered };
}

/* ------------------------------------------------------------- the pieces */

const savedAs = (row: Written<unknown>): Saved => ({
  kind: "saved",
  savedAt: row.createdAt,
  changedAt: row.updatedAt,
});

const movieRoot = (movie: Written<Movie>): MovieRoot => ({
  placement: "held",
  of: "movie",
  film: { title: movie.title, year: movie.year },
  viewing: movie.viewing,
  imdbId: movie.imdbId,
  vibes: movie.vibes,
  basis: savedAs(movie),
  handle: { by: "film", title: movie.title, year: movie.year },
});

/** The acts, grouped so each film's history can be resolved on its own. */
function byFilm(acts: readonly Identified<Act>[]): Identified<Act>[][] {
  const films = new Map<string, Identified<Act>[]>();
  for (const act of acts) {
    // The one canonical naming, the same one the verdict store resolves by and
    // the same one the conflicts below join on. Three groupings of the same acts
    // that disagreed would put a film in two histories here and one there.
    const key = filmKey(act.film);
    films.set(key, [...(films.get(key) ?? []), act]);
  }
  return [...films.values()];
}

/**
 * One film's acts, each placed by what became of it.
 *
 * Current in every scope it stands in — the global claim and any evening that
 * holds one of its own — is held. Everything else is remembered: verdicts that a
 * later verdict displaced, verdicts that were taken back, and the takings-back
 * themselves, which are things the user did and so things they can see.
 */
function placed(line: readonly Identified<Act>[]): SaidRoot[] {
  const standing = new Set(
    everyScope(line)
      .map((scope) => (current(line, scope) as Identified<Verdict> | null)?.ref)
      .filter((ref): ref is string => ref !== undefined),
  );
  const displaced = new Map(
    supersession(line).map(({ verdict, by }) => [
      (verdict as Identified<Verdict>).ref,
      by.said === "withdrawal" ? ("withdrawn" as const) : ("superseded" as const),
    ]),
  );

  return line.map((act) => {
    const held = standing.has(act.ref);
    return {
      placement: held ? ("held" as const) : ("remembered" as const),
      of: "verdict" as const,
      act: spoken(act),
      basis: {
        kind: "said" as const,
        claimant: "user" as const,
        saidAt: act.at,
        scope: act.scope,
        ...(act.said === "verdict" ? { told: act.told } : {}),
        ...(act.said === "verdict"
          ? { became: held ? ("current" as const) : (displaced.get(act.ref) ?? ("withdrawn" as const)) }
          : {}),
      },
      handle: { by: "ref", ref: act.ref },
    };
  });
}

/** Everywhere, and each evening this film's history names. */
function everyScope(line: readonly Act[]): Scope[] {
  const occasions = new Set(
    line.flatMap((act) => (act.scope === "everywhere" ? [] : [act.scope.occasion])),
  );
  return ["everywhere", ...[...occasions].map((occasion) => ({ occasion }))];
}
