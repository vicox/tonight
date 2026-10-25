import type { SqlDriver, Transaction } from "../../db/driver.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import {
  standing,
  stateVerdict,
  VerdictError,
  withdrawVerdict,
  type Act,
  filmKey,
  type Film,
  type Identified,
  type Standing,
} from "../model.ts";
import type { VerdictStore } from "../store.ts";
import { VERDICTS_SCHEMA } from "./schema.ts";

export { VERDICTS_SCHEMA };

/**
 * The verdict store against Postgres.
 *
 * Bound to one user before it is returned, in the same way and for the same
 * reason as the taste and episode stores: there is no method here that takes a
 * user, and no statement that reads or writes a row without `user_id = $1`, so
 * reaching somebody else's verdicts is not something a caller can express.
 *
 * ## Why rows are rebuilt through the model
 *
 * A row is a row until something says what it means, and `assemble` says it by
 * handing the columns back to the same constructors a caller would have used.
 * That gives one definition of a valid claim rather than two, and it means a row
 * a migration or a repair script wrote by hand gets no shorter route to being
 * believed than one this store inserted. A row that cannot be rebuilt is an
 * error here, not a half-claim passed upwards.
 *
 * It also settles the timestamp. The model canonicalises to UTC; Postgres hands
 * back a `Date`; converting and revalidating means what comes out of the
 * database is what would have gone in, rather than a second spelling of it.
 *
 * ## What is deliberately not here
 *
 * No query resolves which verdict stands. Standing depends on scope layering and
 * on an ordering rule with its own contracts, and both live in the model. A view
 * or a `WHERE superseded IS NULL` here would be a second implementation of a
 * rule that already has one, free to drift from it in exactly the cases nobody
 * tests. This reads acts.
 */
export function sqlVerdictStore(driver: SqlDriver, user: AuthenticatedUser): VerdictStore {
  const owner = user.id;

  /**
   * Every act this user has performed, in a stable read order.
   *
   * Named apart from the surface because two entries use it: `acts` hands it
   * over whole, and `standing` groups it by film before asking the model what
   * each film's history means. One statement rather than two keeps those two
   * from ever disagreeing about which rows exist.
   *
   * `title, year` keeps a film's acts together for that grouping; `said_at, seq,
   * id` is the same stable tiebreak `history` uses. None of it is the answer —
   * the model orders by the instant the user spoke.
   */
  const everything = async (): Promise<Identified<Act>[]> => {
    const rows = await driver.query<ActRow>(
      `SELECT id, said, title, year, occasion, said_at,
              told, about, judgement, because, seq
         FROM tonight_verdict_acts
        WHERE user_id = $1
        ORDER BY title, year, said_at, seq, id`,
      [owner],
    );
    return rows.map(assemble);
  };

  return {
    async say(act: Act): Promise<Identified<Act>> {
      return writeAct(driver, owner, act);
    },

    async history(film: Film): Promise<Identified<Act>[]> {
      // Filtered in memory rather than matched in SQL, because which acts are
      // one film's is `filmKey`'s answer and it has to be the same answer here
      // as in `standing`. A `WHERE title = $2` matched exactly and split
      // `Black Bag` from `black bag`; a `WHERE lower(title) = lower($2)` would
      // fold under Postgres' collation while everything else folds under
      // JavaScript's, which is the same disagreement one layer down.
      //
      // One statement, one rule. The log belongs to one person and `standing`
      // already reads all of it.
      const named = namedFilm(film);
      const wanted = filmKey(named);
      return (await everything()).filter((act) => filmKey(act.film) === wanted);
    },

    acts: everything,

    async standing(): Promise<Standing[]> {
      // One read, grouped in memory rather than in SQL. Which claim stands, and
      // how an evening layers over the global base, is the model's rule and has
      // contracts on it; resolving it a second time here in SQL would be a
      // second implementation free to drift from the one that is tested.
      //
      // The read itself is `acts`, so the complete set and the projection of it
      // cannot disagree about which rows exist: there is one statement, and this
      // adds only the grouping the model needs.
      const films = new Map<string, Act[]>();
      for (const act of await everything()) {
        const key = filmKey(act.film);
        films.set(key, [...(films.get(key) ?? []), act]);
      }
      return [...films.values()].flatMap((acts) => standing(acts));
    },

    async forget(ref: string): Promise<void> {
      // Both halves of the key, and that is the whole of the authorisation: a
      // reference belonging to somebody else matches no row here, so it cannot
      // delete one and cannot report that it exists. The statement is the same
      // either way and so is the answer.
      //
      // Nothing is returned. Telling a caller whether a row went would answer
      // "does this act exist" for any reference they cared to try.
      await driver.query(
        `DELETE FROM tonight_verdict_acts
               WHERE user_id = $1 AND id = $2`,
        [owner, ref],
      );
    },
  };
}

/**
 * Appends one act for one user, on whatever connection it is handed.
 *
 * What `say` does, and exported for the one caller that has to do it inside a
 * transaction of its own: the taste store, which writes a liked or loved in the
 * same transaction as it confirms the film is filed (`sayFiled`), and any other
 * act in the same transaction as it confirms the film is saved (`saySaved`).
 * Everything about the act
 * is still decided here — it is rebuilt through the model's constructors, and
 * inserted the one way this module inserts — so a second writer adds no second
 * definition of what may be written.
 *
 * `seq` is deliberately absent from the column list: it is allocated by the
 * sequence behind its default, so nothing a caller sends can choose or forge a
 * place in the order. So are `occasion`, `reach` and `reason`, which only a
 * refusal ever filled and which the schema now holds empty.
 */
export async function writeAct(sql: Transaction, owner: string, act: Act): Promise<Identified<Act>> {
  // Revalidated rather than trusted. This is a boundary — an act can reach it
  // from a request body as easily as from a constructor — and the model is
  // where "valid" is defined.
  const checked = check(act);
  const judgement = checked.said === "verdict" ? checked.assertion : null;
  const [row] = await sql.query<ActRow>(
    `INSERT INTO tonight_verdict_acts
            (user_id, said, title, year, said_at, told, about, judgement, because)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, said, title, year, occasion, said_at,
                 told, about, judgement, because, seq`,
    [
      owner,
      checked.said,
      checked.film.title,
      checked.film.year,
      checked.at,
      checked.said === "verdict" ? checked.told : null,
      judgement?.about ?? null,
      judgement?.judgement ?? null,
      judgement?.because ?? null,
    ],
  );
  if (!row) throw new VerdictError("What they said was not written down.");
  return assemble(row);
}

/**
 * What stands about these films, on whatever connection it is handed.
 *
 * `standing`, narrowed to a few films and run inside a caller's transaction:
 * the taste store asks it while it holds those films, before taking one out of
 * its last vibe. Exported from here rather than written there because which
 * verdict stands is this module's rule — the rows are rebuilt by `assemble`
 * and resolved by the model's `standing`, exactly as `standing` above resolves
 * them — and a second implementation in the taste store would be free to
 * disagree.
 *
 * The year narrows the read; `filmKey` decides which acts are one film's.
 */
export async function standingWithin(
  sql: Transaction,
  owner: string,
  films: readonly Film[],
): Promise<Standing[]> {
  const wanted = new Set(films.map(filmKey));
  if (!wanted.size) return [];

  const rows = await sql.query<ActRow>(
    `SELECT id, said, title, year, occasion, said_at,
            told, about, judgement, because, seq
       FROM tonight_verdict_acts
      WHERE user_id = $1 AND year = ANY($2::int[])`,
    [owner, [...new Set(films.map((film) => film.year))]],
  );

  const byFilm = new Map<string, Act[]>();
  for (const act of rows.map(assemble)) {
    const key = filmKey(act.film);
    if (wanted.has(key)) byFilm.set(key, [...(byFilm.get(key) ?? []), act]);
  }
  return [...byFilm.values()].flatMap((acts) => standing(acts));
}

type ActRow = {
  /** The row's own identity, and the reference a caller forgets an act by. */
  id: string;
  said: string;
  title: string;
  year: number;
  /** Always null since v3. Read so a row that is not is refused rather than widened. */
  occasion: string | null;
  said_at: Date | string;
  told: string | null;
  about: string | null;
  judgement: string | null;
  because: string | null;
  /** The order this table accepted the act in. Null on rows predating v2. */
  seq: number | null;
};

/**
 * An act, rebuilt through the model so a row cannot mean more than a claim.
 *
 * The write order is carried across as it was stored. It is not part of the
 * claim and no constructor takes one, so it is attached to the rebuilt act
 * rather than passed through — which is also why nothing a caller sends can
 * become one: `say` never names the column, and this is the only place a value
 * for it comes from.
 */
function assemble(row: ActRow): Identified<Act> {
  // Handed to the model as it is stored, so an evening a row should no longer
  // carry is refused there rather than read as everywhere.
  const scope = row.occasion === null ? "everywhere" : { occasion: row.occasion };
  const at = moment(row.said_at);
  // Two handles, and they are not the same kind of thing. `order` is how the
  // table breaks a tie inside one millisecond; `ref` is what somebody points at
  // to take one act back. See `Identified` in the model.
  const handles = { ref: row.id, ...(row.seq === null ? {} : { order: Number(row.seq) }) };
  if (row.said === "withdrawal") {
    return { ...withdrawVerdict({ title: row.title, year: row.year }, at, scope), ...handles };
  }
  if (row.said !== "verdict") throw new VerdictError(`No act is a ${row.said}.`);

  // The discriminant is read from the column that holds it, and anything but a
  // judgement is refused rather than read as one. The table's own constraints
  // keep it so, so this cannot disagree with them in practice — it is here so
  // that a row written by something that skipped those constraints fails
  // loudly instead of being guessed into the nearest valid shape.
  if (row.about !== "judgement") {
    throw new VerdictError(`No verdict is about a ${String(row.about)}.`);
  }
  const assertion = { about: "judgement", judgement: row.judgement, because: row.because };
  return { ...stateVerdict({ title: row.title, year: row.year }, assertion, row.told, at, scope), ...handles };
}

/**
 * The film, trimmed and checked the way the model checks one.
 *
 * The model validates a film as part of validating an act and exports no checker
 * of its own, so this builds the smallest act there is and keeps only its
 * subject. Duplicating the rules here instead would give a malformed film two
 * definitions and let a read quietly match nothing where a write would have been
 * refused.
 */
function namedFilm(film: Film): Film {
  return withdrawVerdict(film, EPOCH).film;
}

const EPOCH = "1970-01-01T00:00:00.000Z";

/**
 * One act, checked by rebuilding it.
 *
 * The model's constructors are the only definition of a valid claim, and going
 * through them here means a caller cannot write a shape the model would refuse
 * to read back.
 *
 * The claimant is checked rather than rebuilt, and that is the one facet that
 * has to be: a constructor *sets* it to the user, so rebuilding an act that
 * arrived claiming to be the agent's would silently relabel it as the user's
 * and write it down. Refusing is the only honest answer — the act is not one
 * this model has a shape for, and quietly making it into one is how an
 * Observation becomes a Verdict without anybody saying so.
 */
function check(act: Act): Act {
  if (act.claimant !== "user") {
    throw new VerdictError("Only the user states a verdict.");
  }
  if (act.said === "verdict") {
    return stateVerdict(act.film, act.assertion, act.told, act.at, act.scope);
  }
  if (act.said === "withdrawal") {
    // Refused rather than dropped. Rebuilding a withdrawal from three fields
    // would quietly discard whatever else arrived with it, and something that
    // turned up carrying a judgement is not a withdrawal with noise on it — it
    // is an object this model has no shape for, and normalising it into a valid
    // act would write down a claim nobody made.
    for (const facet of VERDICT_ONLY) {
      if (facet in act) {
        throw new VerdictError(`A withdrawal asserts nothing, so it has no ${facet}.`);
      }
    }
    return withdrawVerdict(act.film, act.at, act.scope);
  }
  throw new VerdictError("Each act says whether it is a verdict or a withdrawal.");
}

/**
 * The facets only a verdict has.
 *
 * `assertion` and `told` are the two the model's own act check names; the rest
 * are the fields an assertion is made of, which a hand-built object is as likely
 * to carry loose — and `reach` and `reason`, which a refusal was made of before
 * there were none. On a withdrawal any of them is a mistake worth reporting.
 */
const VERDICT_ONLY = ["assertion", "told", "judgement", "because", "reach", "reason"] as const;

const moment = (value: Date | string): string =>
  (value instanceof Date ? value : new Date(value)).toISOString();
