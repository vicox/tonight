import type { Episode, Recorded } from "../episodes/model.ts";
import { filmKey } from "../films/identity.ts";
import type { Movie, MovieHandle, MovieState, Taste, Written } from "../taste/model.ts";
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
 * ## Why three places and not one list
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
 *   act on. Genres, Mixes, Movies, and the verdicts that stand.
 * - **operative** — only the places where two held roots disagree about one
 *   film, naming both and saying which governs. Not a copy of everything held.
 * - **remembered** — what Tonight remembers happening: evenings, and the things
 *   they said that no longer stand. True, and not evidence.
 *
 * ## Nothing here decides anything new
 *
 * There is exactly one rule in this file, `PRECEDENCE`, and it is not this
 * file's rule — it is the one the instructions already give the model, written
 * out so an explanation cannot drift from the behaviour it explains. Everything
 * else is placement: which store a root came from, and what the verdict model
 * already says became of it.
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
  /** A Genre or a Mix, by the name the user gave it. */
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

/** A mix: named genres, and what the user means by having combined them. */
export type MixRoot = {
  placement: "held";
  of: "mix";
  name: string;
  instruction: string;
  genres: readonly string[];
  films: readonly MovieHandle[];
  basis: Saved;
  handle: Handle;
};

/** A film they filed, and the state they filed it under. */
export type MovieRoot = {
  placement: "held";
  of: "movie";
  film: Film;
  /** `null` is never told, which is not the same as `not_seen`. */
  state: MovieState | null;
  imdbId: string | null;
  mixes: readonly string[];
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

export type HeldRoot = GenreRoot | MixRoot | MovieRoot | SaidRoot;
export type RememberedRoot = SaidRoot | EveningRoot;
export type Root = HeldRoot | EveningRoot;

/* --------------------------------------------------------------- the rule */

/**
 * The one rule this file applies, and it is not this file's rule.
 *
 * `SKILL.md` already tells the model this, and `get_taste` already hands over a
 * Movie state and a verdict side by side without resolving them. So the
 * resolution lives in the instructions, and M3 has to describe the same
 * resolution or it will explain behaviour Tonight does not have.
 *
 * Written as a string so a contract can hold it against the instruction text.
 * If somebody changes the wording there, that contract fails and this constant
 * has to be looked at — which is the whole point of it being here rather than
 * reimplemented in prose a second time.
 */
export const PRECEDENCE = "A verdict outranks a disagreeing state";

/**
 * A film two held roots disagree about, and which of them governs.
 *
 * Only a disagreement earns an entry. Two roots that say the same thing are not
 * a conflict and listing them would turn `operative` into a second copy of
 * `held` — which is exactly what it must not be, because then a reader would
 * have two places to look for one fact and no way to tell which was authoritative.
 *
 * The saved state is named as well as the verdict, and it is **not** removed
 * from `held`. It is still stored, the user can still see and correct it, and
 * it applies again by itself the moment the verdict is withdrawn or forgotten —
 * because this whole structure is recomputed from roots every time and there is
 * nowhere for a stale resolution to live.
 */
export type Conflict = {
  film: Film;
  /**
   * Where the governing claim applies, exactly as the claim says it.
   *
   * `"everywhere"` for a judgement or a `not-ever`; one evening for a
   * `not-tonight`, which governs there and leaves the saved preference as the
   * base everywhere else — including underneath it, in that same evening, if the
   * refusal is taken back.
   */
  where: Scope;
  /** The Movie root, still stored and still in `held`. */
  saved: { state: MovieState; handle: Handle };
  /** The verdict that governs, and how to take it back. */
  governing: { act: Verdict; handle: Handle };
  /** The rule being applied, verbatim. */
  because: typeof PRECEDENCE;
};

export type Memory = {
  held: readonly HeldRoot[];
  operative: readonly Conflict[];
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

  for (const mix of taste.mixes) {
    held.push({
      placement: "held",
      of: "mix",
      name: mix.name,
      instruction: mix.instruction,
      genres: mix.genres,
      films: mix.movies,
      basis: savedAs(mix),
      handle: { by: "name", name: mix.name },
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

  return { held, operative: conflicts(held), remembered };
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
  state: movie.state,
  imdbId: movie.imdbId,
  mixes: movie.mixes,
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

/**
 * Where two held roots disagree about one film, and where the disagreement runs.
 *
 * A conflict is claimed only where the two roots actually pull recommendation in
 * different directions, and it is always reported with the scope the governing
 * claim has. That scope is the whole difference between *"you never want to see
 * this"* and *"not on a Tuesday"*, and flattening it would turn an evening's
 * mood into a standing fact about the person.
 *
 * Three disagreements exist:
 *
 * - a **judgement** unlike the saved state. Judgements are global by
 *   construction, so this governs everywhere.
 * - **`not-ever`** against a film they filed as liked or loved. The refusal is
 *   global and governs the film everywhere.
 * - **`not-tonight`** against a film they filed as liked or loved. It governs in
 *   its own evening and nowhere else; the saved preference is still the base
 *   everywhere including, underneath, in that evening.
 *
 * What is deliberately **not** a conflict:
 *
 * - `seen`, `not_seen` and `null`. The first is explicitly non-evaluative and
 *   the other two are the absence of experience, so a verdict beside them adds
 *   an opinion rather than contradicting one.
 * - A refusal against a film they filed as `disliked`. Both point the same way,
 *   and a system that called that a contradiction would be inventing one.
 *
 * A refusal is never turned into a rating. `governing.act` is the verdict
 * itself, rejection and all, so a reader can say what they said rather than a
 * translation of it — and nothing here reaches any other film.
 */
function conflicts(held: readonly HeldRoot[]): Conflict[] {
  const rated = new Map<string, MovieRoot>();
  for (const root of held) {
    if (root.of === "movie" && evaluative(root.state)) rated.set(filmKey(root.film), root);
  }

  const found: Conflict[] = [];
  for (const root of held) {
    if (root.of !== "verdict" || root.act.said !== "verdict") continue;
    const saved = rated.get(filmKey(root.act.film));
    if (!saved || !disagrees(saved.state, root.act)) continue;

    found.push({
      film: root.act.film,
      // The governing claim's own scope, never widened. A `not-tonight` says
      // where it applies and this carries that word for word.
      where: root.act.scope,
      saved: { state: saved.state as MovieState, handle: saved.handle },
      governing: { act: root.act, handle: root.handle },
      because: PRECEDENCE,
    });
  }
  return found;
}

/** Whether a Movie state says how they felt, rather than whether they watched. */
const evaluative = (state: MovieState | null): boolean =>
  state === "liked" || state === "loved" || state === "disliked";

/** Whether what they said pulls against how the film is filed. */
function disagrees(state: MovieState | null, verdict: Verdict): boolean {
  if (verdict.assertion.about === "judgement") {
    return verdict.assertion.judgement !== state;
  }
  // A refusal is not a rating, so it can only disagree with a liking. Against
  // `disliked` it says the same thing twice.
  return state === "liked" || state === "loved";
}
