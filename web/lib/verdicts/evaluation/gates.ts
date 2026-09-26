import { BASELINE, TUESDAY, WEDNESDAY, type Step, type Trajectory } from "./trajectories.ts";

/**
 * The M2 gates: is what the user said the only thing that counts, and does it
 * still count the way they said it?
 *
 * ## Why all ten are deterministic
 *
 * M1's gates say it for that milestone and the reasoning carries: Phase 1's
 * subject was a model's prose, where *"is this a good lead"* cannot be settled by
 * a rule, so it went to a blind judge. M2's subject is what recommendation work
 * is handed — whether a withdrawn verdict is still standing, whether an evening's
 * refusal leaked past the evening, whether the words the user used survived. Each
 * of those is a fact about a payload, and giving a fact to a judge would turn it
 * into an opinion.
 *
 * The one thing here that is genuinely semantic — whether a model, holding a
 * faithful payload, *writes* about the user in a way that honours it — is not
 * gated here at all. It is not a property of this code, it needs a sweep to
 * observe, and pretending to decide it with a regular expression would be the
 * worst of both: a semantic claim with a syntactic proof. See `LIMITS`.
 *
 * ## Why so much of this is paired, and compared at every step
 *
 * Self-confirmation is M2's central risk and it is invisible in a single run.
 * *Recommended, watched, finished* leaves a payload that looks perfectly
 * reasonable on its own — the only way to see that Tonight concluded something
 * is to hold it beside the same user with the same taste and no evening at all,
 * and find a difference.
 *
 * End states are not enough either. A system that concluded something from
 * *chosen* and happened to unlearn it by *finished* would pass a gate that only
 * looked at the end. So the influence trajectories are prefixes of one another
 * and gate 7 compares the evidence after every single step.
 *
 * ## What the gates read
 *
 * Everything comes from the public tool surface — `get_taste` and `get_verdicts`
 * — because what an agent would be handed is the question here, not which rows
 * exist.
 */

/* --------------------------------------------------------------- the shapes */

/** One current claim, in the shape `get_taste` hands to recommendation work. */
export type Standing = {
  title: string;
  year: number;
  judgement?: string;
  because?: string;
  rejected?: string;
  reason?: string;
  occasion?: string;
  told: string;
};


/** The taste model as `get_taste` returns it, with verdicts folded in. */
export type Taste = {
  genres: { name: string; instruction: string }[];
  mixes: { name: string; instruction: string; genres: string[] }[];
  movies: { title: string; year: number; viewing: string | null }[];
  verdicts?: Standing[];
};

/** One answer from `get_verdicts`. */
export type Asked = { current: unknown | null; superseded: unknown[]; history: unknown[] };

/** What one trajectory left behind, read back through the public tools. */
export type Observed = {
  trajectory: Trajectory;
  /** The taste model before the trajectory ran, and after it finished. */
  before: Taste;
  after: Taste;
  /**
   * The taste model at the start and after every step.
   *
   * What makes gate 7 a claim about the whole path rather than its end: a
   * trajectory is only invariant if it was invariant at every point along it.
   */
  checkpoints: Taste[];
  /** `get_verdicts` per film the trajectory touched, keyed by `title (year)`. */
  asked: Record<string, Asked>;
  /** `get_verdicts` asked about an occasion, keyed by `title (year) @ occasion`. */
  askedAt: Record<string, Asked>;
};

/** What a second user could see or do to the first user's claims. */
export type Crossing = {
  /** Verdicts of the first user's that showed up in the second user's taste. */
  leakedVerdicts: Standing[];
  /** The second user's `get_verdicts` about the first user's film. */
  asked: Asked;
  /** Whether the first user's claim was still exactly as it was afterwards. */
  intact: boolean;
  /** What the second user's own writes about the same film left the first user with. */
  stillMine: Standing[];
};

/**
 * The tool surface, as gate 8 needs to see it.
 *
 * `sources` is the text of the modules M2 added. Reading source in a gate is
 * unusual and deliberate: "Tonight never gets in touch on its own" is a claim
 * about what the code *cannot* do, and no sequence of calls can demonstrate the
 * absence of a thing that would happen when nobody is calling.
 */
export type Surface = { tools: string[]; sources: Record<string, string> };

export type World = {
  seen: Record<string, Observed>;
  crossing: Crossing;
  surface: Surface;
};

export type Failure = { gate: string; trajectory: string; detail: string };
export type Gate = (world: World) => Failure[];

/* ------------------------------------------------------- shared expectations */

export const filmKey = (film: { title: string; year: number }): string =>
  `${film.title} (${String(film.year)})`;

/** Object comparison that does not depend on key order or array order. */
const canon = (value: unknown): string => JSON.stringify(sorted(value));

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, held]) => [key, sorted(held)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

const asSet = (values: readonly unknown[]): string =>
  JSON.stringify([...values].map(canon).sort());

/**
 * The taste model without Tonight's own timestamps.
 *
 * `createdAt` and `updatedAt` are when a row was written, not anything the user
 * said, and two otherwise identical users differ by a millisecond. Comparing
 * them would be comparing clocks; the gates are about whether anything the user
 * did *not* say changed what recommendation work sees.
 */
export const comparable = (model: unknown): string =>
  JSON.stringify(model, (key, held: unknown) =>
    key === "createdAt" || key === "updatedAt" ? null : held,
  );

/** Everything in the taste model that is not a verdict. */
const besideVerdicts = (taste: Taste) => ({
  genres: taste.genres,
  mixes: taste.mixes,
  movies: taste.movies,
});

/**
 * What should be standing at the end of a trajectory, worked out from its steps.
 *
 * A deliberately naive replay: the last thing said in a scope stands there, and
 * taking it back leaves that scope empty. That is the rule in the words the
 * architecture uses, written out independently of `model.ts` — which resolves
 * the same question through ordering, supersession and scope layering. Two
 * implementations is the point. A gate that called `standing()` to decide what
 * `standing()` should say would agree with every bug it has.
 */
export function expectedStanding(steps: readonly Step[]): Standing[] {
  const held = new Map<string, Map<string, Standing>>();

  // Everybody starts with the baseline opinion standing, so what a trajectory
  // should end with is that plus whatever it said itself. A gate asking whether
  // a trajectory said anything is asking whether it said anything *beyond* this.
  for (const one of BASELINE.said) {
    held.set(
      filmKey(one.film),
      new Map([
        [
          "everywhere",
          { title: one.film.title, year: one.film.year, judgement: one.judgement, told: one.told },
        ],
      ]),
    );
  }

  for (const step of steps) {
    if (step.act !== "verdict" && step.act !== "withdraw") continue;
    const film = filmKey(step.film);
    const scope = step.occasion ?? "everywhere";
    const scopes = held.get(film) ?? new Map<string, Standing>();
    held.set(film, scopes);

    if (step.act === "withdraw") {
      scopes.delete(scope);
      continue;
    }
    scopes.set(scope, {
      title: step.film.title,
      year: step.film.year,
      ...(step.judgement === undefined ? {} : { judgement: step.judgement }),
      ...(step.because === undefined ? {} : { because: step.because }),
      ...(step.reach === undefined ? {} : { rejected: step.reach }),
      ...(step.reason === undefined ? {} : { reason: step.reason }),
      ...(scope === "everywhere" ? {} : { occasion: scope }),
      told: step.told,
    });
  }

  return [...held.values()].flatMap((scopes) => [...scopes.values()]);
}

type VerdictStep = Extract<Step, { act: "verdict" }>;

/** Every verdict step in a trajectory, in the order it was said. */
const verdictSteps = (steps: readonly Step[]): VerdictStep[] =>
  steps.filter((step): step is VerdictStep => step.act === "verdict");

/**
 * The step that produced a standing claim: same film, same scope, last said.
 *
 * Identity matters here rather than membership. Asking only whether some step in
 * the trajectory said a thing would let a reason attach to the wrong film and
 * still pass, which is precisely how a system would come to believe something
 * about a film the user never said it about.
 */
function sourceOf(said: readonly VerdictStep[], held: Standing): VerdictStep | undefined {
  return [...said]
    .reverse()
    .find(
      (step) =>
        step.film.title === held.title &&
        step.film.year === held.year &&
        (step.occasion ?? "everywhere") === (held.occasion ?? "everywhere"),
    );
}

/**
 * One claim as the trajectory said it: everything that makes it that claim.
 *
 * Film *and year*, scope, what it asserts, and the words — each field present
 * even when empty, so that absence is compared as strictly as presence and a
 * reason cannot move between a global judgement and an evening's refusal for
 * the same film without the signature changing.
 */
function claimSaid(step: VerdictStep) {
  return {
    title: step.film.title,
    year: step.film.year,
    scope: step.occasion ?? "everywhere",
    about: step.judgement === undefined ? "rejection" : "judgement",
    judgement: step.judgement ?? null,
    reach: step.reach ?? null,
    because: step.because ?? null,
    reason: step.reason ?? null,
  };
}

/** The same claim as the history recorded it, read into the same shape. */
type VerdictAct = {
  said: string;
  film: { title: string; year: number };
  scope: "everywhere" | { occasion: string };
  assertion:
    | { about: "judgement"; judgement: string; because: string | null }
    | { about: "rejection"; rejection: { reach: string; reason: string | null } };
};

const isVerdictAct = (act: unknown): act is VerdictAct =>
  typeof act === "object" && act !== null && (act as { said?: string }).said === "verdict";

function claimRecorded(act: VerdictAct) {
  const judgement = act.assertion.about === "judgement" ? act.assertion : undefined;
  const rejection = act.assertion.about === "rejection" ? act.assertion.rejection : undefined;
  return {
    title: act.film.title,
    year: act.film.year,
    scope: act.scope === "everywhere" ? "everywhere" : act.scope.occasion,
    about: act.assertion.about,
    judgement: judgement?.judgement ?? null,
    reach: rejection?.reach ?? null,
    because: judgement?.because ?? null,
    reason: rejection?.reason ?? null,
  };
}

function failer(gate: string, where: string) {
  const failures: Failure[] = [];
  const record = (detail: string) => {
    failures.push({ gate, trajectory: where, detail });
  };
  record.failures = failures;
  return record;
}

const need = (world: World, name: string): Observed => {
  const observed = world.seen[name];
  if (!observed) throw new Error(`the gates need trajectory ${name} and it was not run`);
  return observed;
};

/* ------------------------------------------------------------------ gate 1 */

/**
 * Self-confirmation: Tonight's own behaviour is not evidence about the user.
 *
 * The hard gate of M2, and the reason the whole milestone exists. A film Tonight
 * put forward, that the user chose, watched and finished, must leave the taste
 * model in exactly the state it would have been in if none of that had happened.
 * The positive control is the third trajectory: the same evening plus the user
 * actually saying something, which must differ — otherwise this gate would pass
 * just as well against a system that ignores verdicts altogether.
 */
export function selfConfirmation(world: World): Failure[] {
  const fail = failer("self-confirmation", "self-*");
  const lived = need(world, "self-recommended-and-watched");
  const quiet = need(world, "self-nothing-happened");
  const spoke = need(world, "self-and-they-said-so");

  if (comparable(lived.after) !== comparable(quiet.after)) {
    fail("a recommended, chosen, watched and finished evening changed what recommendation work sees");
  }
  if (comparable(lived.after) !== comparable(lived.before)) {
    fail("an evening moved the taste model between the start and end of the trajectory");
  }
  if (asSet(lived.after.verdicts ?? []) !== asSet(expectedStanding([]))) {
    fail(`an evening produced a verdict: ${JSON.stringify(lived.after.verdicts)}`);
  }

  // The control. Without this, "nothing changed" would also be true of a system
  // that had stopped listening.
  if (comparable(spoke.after) === comparable(lived.after)) {
    fail("the user saying they loved it changed nothing — verdicts are not reaching the answer");
  }
  if (asSet(spoke.after.verdicts ?? []) !== asSet(expectedStanding(spoke.trajectory.steps))) {
    fail(`what they said did not arrive as said: ${JSON.stringify(spoke.after.verdicts)}`);
  }
  // And what they said moved nothing else: the same films, in the same states.
  if (comparable(spoke.after.movies) !== comparable(lived.after.movies)) {
    fail("a verdict rewrote the saved films beside it");
  }
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 2 */

/**
 * Withdrawal: taking it back leaves silence, and silence is not an opinion.
 *
 * The comparison is against a user who never spoke at all, because that is the
 * claim: *"the way it was before they spoke"*. A withdrawal must not leave a
 * neutral verdict, a tombstone, or — worst and most plausible — the opposite of
 * what was withdrawn. And the saved film is untouched: a verdict operation
 * reaches the verdict store and nothing else.
 */
export function withdrawal(world: World): Failure[] {
  const fail = failer("withdrawal", "withdrawal-*");
  const took = need(world, "withdrawal-leaves-silence");
  const never = need(world, "withdrawal-control");

  if (comparable(took.after) !== comparable(never.after)) {
    fail("a withdrawn verdict left something behind that never saying it would not have");
  }
  if (asSet(took.after.verdicts ?? []) !== asSet(expectedStanding([]))) {
    fail(`a withdrawal left a standing verdict: ${JSON.stringify(took.after.verdicts)}`);
  }

  const asked = took.asked[filmKey({ title: "Prisoners", year: 2013 })];
  if (asked && asked.current !== null) {
    fail(`get_verdicts still answers with a current verdict after a withdrawal: ${JSON.stringify(asked.current)}`);
  }
  if (asked && asked.history.length !== 2) {
    fail(`the history should keep both acts; it holds ${String(asked.history.length)}`);
  }

  // The saved film is exactly as it was. Withdrawing an opinion is not a way to
  // change a fact about watching, and there is no opinion left underneath for it
  // to reveal — a withdrawal leaves silence.
  const movie = took.after.movies.find((held) => held.title === "Prisoners");
  if (movie?.viewing !== "seen") {
    fail(`withdrawing a verdict changed the saved film: viewing is ${String(movie?.viewing)}, not "seen"`);
  }
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 3 */

/**
 * Correction: the new verdict stands alone, and the old one stops counting.
 *
 * Two failures matter and they fail in opposite directions. The old claim
 * lingering beside the new one means recommendation work reads a contradiction;
 * the old claim being *edited into* the new one means the history stops being a
 * record. Both must be false: one standing verdict, two acts in the history.
 */
export function correction(world: World): Failure[] {
  const fail = failer("correction", "correction-supersedes");
  const seen = need(world, "correction-supersedes");
  const said = verdictSteps(seen.trajectory.steps);
  const latest = said.at(-1);
  const displaced = said.at(0);

  const standing = seen.after.verdicts ?? [];
  // About the corrected film, rather than the whole payload: everybody carries
  // the baseline opinion about another film, and a count over all of them would
  // be answering a different question.
  const about = standing.filter((held) => filmKey(held) === filmKey(said[0]!.film));
  if (about.length !== 1) {
    fail(`a corrected verdict should leave exactly one standing claim; there are ${String(about.length)}`);
  }
  if (asSet(standing) !== asSet(expectedStanding(seen.trajectory.steps))) {
    fail(`what stands is not the latest thing they said: ${JSON.stringify(standing)}`);
  }
  if (about.some((held) => held.judgement === displaced?.judgement)) {
    fail("the superseded judgement is still standing");
  }
  if (displaced?.because !== undefined && about.some((held) => held.because === displaced.because)) {
    fail("the superseded reason was carried forward onto the verdict that replaced it");
  }

  const asked = seen.asked[filmKey(said[0]!.film)];
  if (asked) {
    if (asked.history.length !== said.length) {
      fail(`the history should hold all ${String(said.length)} acts; it holds ${String(asked.history.length)}`);
    }
    if (asked.superseded.length !== said.length - 1) {
      fail(`${String(said.length - 1)} verdict(s) should be marked superseded; ${String(asked.superseded.length)} are`);
    }
    const current = asked.current as { assertion?: { judgement?: string } } | null;
    if (current?.assertion?.judgement !== latest?.judgement) {
      fail(`get_verdicts answers with ${String(current?.assertion?.judgement)}, not the ${String(latest?.judgement)} they last said`);
    }
  }
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 4 */

/**
 * Scope: a refusal reaches exactly as far as the user aimed it.
 *
 * Three leaks are being ruled out and they are different mistakes. A
 * `not-tonight` that shows up globally turns *"not in the mood for it"* into
 * *"does not like it"*. A `not-ever` that stops applying inside an occasion lets
 * a film they refused for good be offered on a Tuesday. And either of them
 * spreading to a **category** — a genre instruction, a mix, a neighbouring film
 * — turns one refusal into a theory about the user, which is the version of this
 * failure a payload of films alone could never show. That is why every user in
 * this evaluation starts with genres and a mix: a generalisation has to land
 * somewhere, and without somewhere to land there is nothing to catch.
 */
export function scope(world: World): Failure[] {
  const evening = need(world, "not-tonight-one-evening");
  const forGood = need(world, "not-ever-one-film");
  const prisoners = filmKey({ title: "Prisoners", year: 2013 });

  /* --- an evening's refusal lives in that evening ------------------------- */

  const fail = failer("scope", "not-tonight-one-evening");
  const standing = evening.after.verdicts ?? [];
  if (asSet(standing) !== asSet(expectedStanding(evening.trajectory.steps))) {
    fail(`the scoped picture is wrong: ${JSON.stringify(standing)}`);
  }
  // About this film: the baseline opinion is about another one, and counting it
  // here would answer a different question.
  const mine = standing.filter((held) => filmKey(held) === prisoners);
  const global = mine.filter((held) => held.occasion === undefined);
  if (global.length !== 1 || global[0]?.judgement !== "loved") {
    fail(`the global claim should still be the "loved" they gave; it is ${JSON.stringify(global)}`);
  }
  if (global.some((held) => held.rejected !== undefined)) {
    fail("an evening's refusal reached the global picture");
  }
  const local = mine.filter((held) => held.occasion !== undefined);
  if (local.length !== 1 || local[0]?.rejected !== "not-tonight") {
    fail(`the evening's refusal should stand in its own evening only; it is ${JSON.stringify(local)}`);
  }

  // Asked about an unrelated evening, the base shows through untouched.
  const elsewhere = evening.askedAt[`${prisoners} @ ${WEDNESDAY}`];
  const there = elsewhere?.current as { assertion?: { about?: string; judgement?: string } } | null;
  if (there?.assertion?.about !== "judgement" || there.assertion.judgement !== "loved") {
    fail(`another evening sees ${JSON.stringify(there?.assertion)} rather than the global claim`);
  }
  // And asked about its own evening, the refusal is what applies.
  const inside = evening.askedAt[`${prisoners} @ ${TUESDAY}`];
  const here = inside?.current as { assertion?: { about?: string } } | null;
  if (here?.assertion?.about !== "rejection") {
    fail(`the evening it was refused in sees ${JSON.stringify(here?.assertion)} rather than the refusal`);
  }

  /* --- a permanent refusal holds everywhere, and only for that film -------- */

  const forever = failer("scope", "not-ever-one-film");

  // It stands, globally, exactly as they said it. Without this the trajectory
  // would pass just as well against a store that dropped the refusal entirely.
  if (asSet(forGood.after.verdicts ?? []) !== asSet(expectedStanding(forGood.trajectory.steps))) {
    forever(`the "not-ever" did not arrive as said: ${JSON.stringify(forGood.after.verdicts)}`);
  }
  // And it is still what applies inside any evening asked about — a permanent
  // refusal that went quiet on a Tuesday would be offered on a Tuesday.
  for (const occasion of [TUESDAY, WEDNESDAY]) {
    const asked = forGood.askedAt[`${prisoners} @ ${occasion}`];
    const applies = asked?.current as {
      assertion?: { about?: string; rejection?: { reach?: string } };
    } | null;
    if (applies?.assertion?.about !== "rejection" || applies.assertion.rejection?.reach !== "not-ever") {
      forever(`inside ${occasion} the permanent refusal reads as ${JSON.stringify(applies?.assertion)}`);
    }
  }

  nothingElseMoved(evening, fail);
  nothingElseMoved(forGood, forever);
  return [...fail.failures, ...forever.failures];
}

/**
 * A refusal changed nothing outside the claim it is.
 *
 * The same standard for both reaches, because the generalising failure does not
 * care how far the refusal was aimed: *"too long for tonight"* becoming a note
 * on the Slow Burn genre is the same mistake as *"never again"* becoming one,
 * and the evening's version is the likelier of the two — it is the one that
 * sounds like a preference. Genres, mixes and every unrelated film are compared
 * before and after, and each is named separately so a failure says what moved
 * rather than that something did.
 */
function nothingElseMoved(observed: Observed, fail: (detail: string) => void): void {
  if (comparable(besideVerdicts(observed.after)) !== comparable(besideVerdicts(observed.before))) {
    fail("a refusal changed something in the taste model that is not a verdict");
  }
  if (comparable(observed.after.genres) !== comparable(observed.before.genres)) {
    fail(`a refusal reached the genres: ${JSON.stringify(observed.after.genres)}`);
  }
  if (comparable(observed.after.mixes) !== comparable(observed.before.mixes)) {
    fail(`a refusal reached the mixes: ${JSON.stringify(observed.after.mixes)}`);
  }
  for (const movie of observed.after.movies) {
    const was = observed.before.movies.find(
      (held) => held.title === movie.title && held.year === movie.year,
    );
    if (was?.viewing !== movie.viewing) {
      fail(`a refusal moved ${movie.title} from ${String(was?.viewing)} to ${String(movie.viewing)}`);
    }
  }

  // No category-level generalisation: every standing claim is about a film they
  // actually spoke about, and none of them is a genre or a mix wearing a film's
  // shape.
  // The baseline opinion is something they said too — everybody said it — so it
  // belongs in what may legitimately stand. Leaving it out would make the
  // baseline itself read as a claim nobody made.
  const spokenAbout = new Set([
    ...BASELINE.said.map((one) => filmKey(one.film)),
    ...verdictSteps(observed.trajectory.steps).map((step) => filmKey(step.film)),
  ]);
  const categories = new Set([
    ...observed.after.genres.map((genre) => genre.name),
    ...observed.after.mixes.map((mix) => mix.name),
  ]);
  for (const held of observed.after.verdicts ?? []) {
    if (!spokenAbout.has(filmKey(held))) {
      fail(`a claim appeared about ${filmKey(held)}, which they never spoke about`);
    }
    if (categories.has(held.title)) {
      fail(`a refusal generalised into the category ${held.title}`);
    }
  }
}

/* ------------------------------------------------------------------ gate 5 */

/**
 * Reason fidelity: their words arrive on the claim they belong to, or not at all.
 *
 * Byte-for-byte, matched by film, scope and what the claim asserts — not merely
 * present somewhere in the payload. Membership is not fidelity: a genuine reason
 * moved onto a film the user gave none for is an invented claim with their name
 * on it, and it would pass any check that only asked whether the words were
 * theirs. So absence is compared as strictly as presence.
 *
 * What this gate does **not** attempt is whether a model, given a faithful
 * payload, then strengthens or generalises the reason when it answers. That is
 * a property of generated prose and belongs to the Step 8 cycle; see `LIMITS`.
 */
export function reasonFidelity(world: World): Failure[] {
  const failures: Failure[] = [];

  for (const observed of Object.values(world.seen)) {
    const fail = failer("reason-fidelity", observed.trajectory.name);
    // The baseline opinion is a statement like any other — everybody made it —
    // so it is one of the statements a standing claim may be traced back to.
    // It carries no reason, which is exactly the case this gate cares most
    // about: a reason appearing on it would be words nobody said.
    const said = [
      ...BASELINE.said.map((one) => ({
        act: "verdict" as const,
        film: one.film,
        told: one.told,
        judgement: one.judgement,
      })),
      ...verdictSteps(observed.trajectory.steps),
    ];
    const standing = observed.after.verdicts ?? [];

    for (const held of standing) {
      const step = sourceOf(said, held);
      if (!step) {
        fail(`a claim about ${filmKey(held)} has no statement behind it at all`);
        continue;
      }
      // Same assertion, or the words below are being compared across a judgement
      // and a refusal, which are different claims that happen to share a film.
      if ((step.judgement ?? null) !== (held.judgement ?? null)) {
        fail(`${filmKey(held)} was said as ${String(step.judgement)} and stands as ${String(held.judgement)}`);
      }
      if ((step.reach ?? null) !== (held.rejected ?? null)) {
        fail(`${filmKey(held)} was refused as ${String(step.reach)} and stands as ${String(held.rejected)}`);
      }
      // Presence and absence, compared alike.
      if ((step.because ?? null) !== (held.because ?? null)) {
        fail(
          `${filmKey(held)} was given ${JSON.stringify(step.because ?? null)} as a reason and carries ` +
            `${JSON.stringify(held.because ?? null)}`,
        );
      }
      if ((step.reason ?? null) !== (held.reason ?? null)) {
        fail(
          `${filmKey(held)} was refused with ${JSON.stringify(step.reason ?? null)} and carries ` +
            `${JSON.stringify(held.reason ?? null)}`,
        );
      }
    }

    // Everything that should stand did arrive; a reason cannot be preserved on a
    // claim that went missing.
    for (const expected of expectedStanding(observed.trajectory.steps)) {
      const arrived = standing.find(
        (held) => filmKey(held) === filmKey(expected) && held.occasion === expected.occasion,
      );
      if (!arrived) fail(`${filmKey(expected)} should be standing and is not`);
    }

    // And the history holds exactly the acts they performed — including a
    // verdict since replaced, where a moved reason would never be noticed from
    // the current claim. Compared as a multiset of full claims rather than as a
    // search for the words, because a film can carry a global judgement and a
    // scoped refusal at once: asking only whether the words are somewhere in
    // this film's history would let them slide between the two.
    for (const [film, asked] of Object.entries(observed.asked)) {
      const performed = said.filter((step) => filmKey(step.film) === film).map(claimSaid);
      const recorded = asked.history.filter(isVerdictAct).map(claimRecorded);
      if (asSet(performed) !== asSet(recorded)) {
        fail(
          `the history of ${film} is not what they said — recorded ${JSON.stringify(recorded)}, ` +
            `said ${JSON.stringify(performed)}`,
        );
      }
    }
    failures.push(...fail.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate 6 */

/**
 * Provenance texture: how they came to say it is kept, and it stays qualitative.
 *
 * `volunteered` and `confirmed` are different evidence and the difference must
 * survive to the reader. What must *not* appear is the obvious next step — a
 * number. A confidence, a weight, a score: any of them turns *"they said so when
 * asked"* into arithmetic that can be summed across films, and that is the
 * mechanism by which a system starts to know things nobody told it.
 */
export function provenanceTexture(world: World): Failure[] {
  const failures: Failure[] = [];
  const numeric = /"(confidence|score|weight|strength|certainty|probability|rating|count)"\s*:\s*-?\d/i;

  for (const observed of Object.values(world.seen)) {
    const fail = failer("provenance-texture", observed.trajectory.name);
    const said = verdictSteps(observed.trajectory.steps);

    for (const held of observed.after.verdicts ?? []) {
      if (held.told !== "volunteered" && held.told !== "confirmed") {
        fail(`a standing verdict says it was told as ${JSON.stringify(held.told)}`);
      }
      // The standing verdict is the last one said in that scope, so a corrected
      // claim is checked against the correction rather than what it replaced.
      const source = sourceOf(said, held);
      if (source && held.told !== source.told) {
        fail(`${held.title} was ${source.told} and arrives as ${held.told}`);
      }
      for (const [key, value] of Object.entries(held)) {
        if (key !== "year" && typeof value === "number") {
          fail(`a standing verdict carries a number: ${key} = ${String(value)}`);
        }
      }
    }
    if (numeric.test(JSON.stringify(observed.after.verdicts ?? []))) {
      fail("a standing verdict has been scored");
    }
    failures.push(...fail.failures);
  }
  return failures;
}

/* ------------------------------------------------------------------ gate 7 */

/**
 * Non-influence: what Tonight did, and what it is waiting on, carry no weight.
 *
 * Zero, not small. The architecture's list is explicit — a recommendation, a
 * repeated recommendation, a film chosen, watched or finished, the episode
 * history at large, and a film Tonight asked about and never heard back on —
 * none of it contributes to what recommendation work is handed.
 *
 * Every one of those is compared against the same baseline, and **at every step
 * rather than at the end**. A system that concluded something from *chosen* and
 * unlearned it by *finished* is still a system that concluded something.
 */
const MUST_NOT_MOVE = [
  "influence-recommended-once",
  "influence-recommended-again",
  "influence-chosen",
  "influence-watched",
  "influence-finished",
  "asked-and-never-answered",
] as const;

export function nonInfluence(world: World): Failure[] {
  const failures: Failure[] = [];
  const control = need(world, "influence-baseline");
  const baseline = comparable(control.after);

  for (const name of ["influence-baseline", ...MUST_NOT_MOVE]) {
    const seen = need(world, name);
    const fail = failer("non-influence", name);

    seen.checkpoints.forEach((taste, at) => {
      if (comparable(taste) !== baseline) {
        const where = at === 0 ? "before anything happened" : `after step ${String(at)}`;
        fail(`recommendation-active evidence moved ${where}: ${comparable(taste).slice(0, 240)}`);
      }
    });
    if (asSet(seen.after.verdicts ?? []) !== asSet(expectedStanding([]))) {
      fail(`a verdict appeared out of nothing the user said: ${JSON.stringify(seen.after.verdicts)}`);
    }
    failures.push(...fail.failures);
  }

  const waiting = need(world, "asked-and-never-answered");
  const fail = failer("non-influence", "asked-and-never-answered");

  // A supplementary check, and deliberately the weaker one: the pair above is
  // what proves non-influence, because a state can change the answer without
  // ever naming itself. This only catches the blunt version.
  const payload = JSON.stringify(waiting.after);
  for (const word of ["episode", "offered", "recordedat"]) {
    if (payload.toLowerCase().includes(word)) {
      fail(`"${word}" reached the taste model: ${payload.slice(0, 200)}`);
    }
  }

  return [...failures, ...fail.failures];
}

/* ------------------------------------------------------------------ gate 8 */

/**
 * No outbound initiation: Tonight never gets in touch on its own.
 *
 * Half of this cannot be shown by calling things. The claim is about what
 * happens when nobody is calling, so the absence is proved from the code: no
 * timer, no schedule, no transport, anywhere in what M2 added.
 *
 * The behavioural half used to live here too: there was state that a reading
 * could spend, so the gate read the open questions twice and compared. There is
 * no such state now, and the behavioural claim it leaves behind — that a film
 * Tonight offered and heard nothing back about produces nothing — is gate 7's,
 * over the `asked-and-never-answered` trajectory.
 */
export function noOutbound(world: World): Failure[] {
  const fail = failer("no-outbound", "asked-and-never-answered");

  for (const name of world.surface.tools) {
    if (/notify|remind|send|email|push|schedule|announce/i.test(name)) {
      fail(`the tool surface offers ${name}, which reaches out rather than answering`);
    }
  }

  const outbound =
    /\b(fetch|XMLHttpRequest|WebSocket|setInterval|setTimeout|cron|nodemailer|sendmail|webhook|https?\.request)\b/;
  for (const [file, text] of Object.entries(world.surface.sources)) {
    const offending = text
      .split("\n")
      .map((line, at) => ({ line, at: at + 1 }))
      // Prose about what Tonight does not do is not a way of doing it. Only code
      // can reach out, so comment lines are read past.
      .filter(({ line }) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .filter(({ line }) => outbound.test(line));
    for (const { at } of offending) {
      fail(`${file}:${String(at)} can act while nobody is here`);
    }
  }
  return fail.failures;
}

/* ------------------------------------------------------------------ gate 9 */

export function isolation(world: World): Failure[] {
  const fail = failer("isolation", "crossing");
  const { crossing } = world;

  if (crossing.leakedVerdicts.length > 0) {
    fail(`another user's verdicts were visible: ${JSON.stringify(crossing.leakedVerdicts)}`);
  }
  if (crossing.asked.current !== null || crossing.asked.history.length > 0) {
    fail(`get_verdicts answered across users: ${JSON.stringify(crossing.asked)}`);
  }
  if (!crossing.intact) {
    fail("another user's activity changed what the owner had said");
  }
  if (crossing.stillMine.length !== 1) {
    fail(`the owner should be left with exactly their own claim; they have ${JSON.stringify(crossing.stillMine)}`);
  }
  return fail.failures;
}

/* ------------------------------------------------------------------- the set */

/**
 * The gates, each registered under the name its failures carry.
 *
 * Paired rather than listed, so that mutation coverage can be derived from this
 * registry instead of from a second list somebody has to remember to update. A
 * gate added here with no mutation behind it fails the coverage contract.
 */
export const GATES: readonly { name: string; check: Gate }[] = [
  { name: "self-confirmation", check: selfConfirmation },
  { name: "withdrawal", check: withdrawal },
  { name: "correction", check: correction },
  { name: "scope", check: scope },
  { name: "reason-fidelity", check: reasonFidelity },
  { name: "provenance-texture", check: provenanceTexture },
  { name: "non-influence", check: nonInfluence },
  { name: "no-outbound", check: noOutbound },
  { name: "isolation", check: isolation },
];

/** Runs every gate. Empty means M2 passes. */
export function gate(world: World): Failure[] {
  return GATES.flatMap(({ check }) => check(world));
}

/**
 * What M2's gates deliberately do not cover.
 *
 * Written down rather than left to be found, and each line is a claim about
 * where the proof would have to come from — not an apology.
 */
export const LIMITS = [
  "whether a model, handed a faithful payload, writes about the user faithfully — strengthening or generalising a reason as it answers — is semantic and needs a blind sweep; deciding it here with a pattern would make an opinion look like a fact",
  "the gates prove what recommendation work is handed, not what a host model then does with it — that is the Step 8 cycle's subject and the instructions are its object",
  "M2 has no Observation and Tonight persists nothing it thought of by itself: the only acts are verdicts and withdrawals, so an empty verdict history is the whole of 'nothing was concluded' rather than a list of shapes to exclude",
] as const;

export type { Step, Trajectory };
