import type { SqlDriver } from "../../db/driver.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import { withdrawVerdict, type Film } from "../model.ts";
import { askAbout, retired, type Question, type QuestionStore } from "../questions.ts";
import { QUESTIONS_SCHEMA } from "./schema.ts";

export { QUESTIONS_SCHEMA };

/**
 * The question store against Postgres.
 *
 * Bound to one user before it is returned, in the same way and for the same
 * reason as every other store here: there is no method that takes a user, and no
 * statement that reads or writes a row without `user_id = $1`.
 *
 * Every row goes out through `askAbout`, which validates it with the verdict
 * model — so a row a migration or a repair script wrote by hand is held to the
 * same shape as one this store inserted, and a malformed one is an error rather
 * than a half-question passed upwards.
 *
 * ## When the clock may write
 *
 * `pending` takes the instant to judge against and writes nothing: a retired
 * question is simply absent from its answer. Reading must not be a way for time
 * to change the database behind somebody's back, and a row left behind costs
 * nothing because nothing treats a row as the answer.
 *
 * `opportunity` and `close` are called on purpose, so they may write — and
 * `opportunity` is where a retired question is actually removed. There is no
 * timer here and nothing that runs by itself: every write traces to a caller
 * that decided to make one.
 *
 * ## What is not here
 *
 * No answer, in any form. Closing a question says it is no longer
 * pending; it says nothing about what the user thinks, and there is nowhere here
 * for what they think to go. That is `lib/verdicts/store.ts`, and it takes a
 * claim the user actually made.
 */
export function sqlQuestionStore(driver: SqlDriver, user: AuthenticatedUser): QuestionStore {
  const owner = user.id;

  return {
    async open(question: Question): Promise<Question> {
      // Revalidated rather than trusted: `open` is a boundary, and the model is
      // where a film and an instant are defined.
      const checked = askAbout(question.film, question.since);

      // The insert does nothing where a question is already open, and the read
      // that follows returns whichever row stands — the original one, with the
      // instant it first arose. Doing it this way rather than read-then-write
      // means two concurrent openings cannot both decide they are the first.
      await driver.query(
        `INSERT INTO tonight_verdict_questions (user_id, title, year, since)
              VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, title, year) DO NOTHING`,
        [owner, checked.film.title, checked.film.year, checked.since],
      );
      const [row] = await driver.query<QuestionRow>(
        `SELECT title, year, since, opportunities
           FROM tonight_verdict_questions
          WHERE user_id = $1 AND title = $2 AND year = $3`,
        [owner, checked.film.title, checked.film.year],
      );
      if (!row) throw new Error("The question was not written down.");
      return assemble(row);
    },

    async pending(now: unknown): Promise<Question[]> {
      const rows = await driver.query<QuestionRow>(
        `SELECT title, year, since, opportunities
           FROM tonight_verdict_questions
          WHERE user_id = $1
          ORDER BY since, id`,
        [owner],
      );
      return rows.map(assemble).filter((question) => !retired(question, now));
    },

    async opportunity(film: Film, now: unknown): Promise<Question | null> {
      const named = namedFilm(film);
      return driver.transaction(async (tx) => {
        // Locked before it is read: two interactions reporting a chance at once
        // would otherwise each count against the state the other found, and one
        // of the three would go missing.
        const [row] = await tx.query<QuestionRow>(
          `SELECT title, year, since, opportunities
             FROM tonight_verdict_questions
            WHERE user_id = $1 AND title = $2 AND year = $3
              FOR UPDATE`,
          [owner, named.title, named.year],
        );
        // Nothing waiting is not an error. A caller reporting a chance to ask
        // about a film nobody has a question about has described the world
        // correctly, and the answer is that there is nothing to age.
        if (!row) return null;

        const counted = askAbout(
          { title: row.title, year: row.year },
          moment(row.since),
          row.opportunities + 1,
        );
        if (retired(counted, now)) {
          // Out of chances, or out of time. Removing the question is the whole
          // of retiring it: no verdict is written, nothing is concluded, and the
          // user is left exactly as unasked as they were.
          await tx.query(
            `DELETE FROM tonight_verdict_questions
                   WHERE user_id = $1 AND title = $2 AND year = $3`,
            [owner, named.title, named.year],
          );
          return null;
        }
        await tx.query(
          `UPDATE tonight_verdict_questions SET opportunities = $4
                 WHERE user_id = $1 AND title = $2 AND year = $3`,
          [owner, named.title, named.year, counted.opportunities],
        );
        return counted;
      });
    },

    async close(film: Film): Promise<void> {
      const named = namedFilm(film);
      // Closing what was never open is not an error: the state afterwards is the
      // state that was asked for, and reporting otherwise would make a caller
      // track whether it had already closed something.
      await driver.query(
        `DELETE FROM tonight_verdict_questions
               WHERE user_id = $1 AND title = $2 AND year = $3`,
        [owner, named.title, named.year],
      );
    },
  };
}

type QuestionRow = {
  title: string;
  year: number;
  since: Date | string;
  opportunities: number;
};

/** A row, rebuilt through the model so it cannot mean more than a question. */
function assemble(row: QuestionRow): Question {
  return askAbout({ title: row.title, year: row.year }, moment(row.since), row.opportunities);
}

/**
 * The film, trimmed and checked the way the model checks one.
 *
 * The model validates a film as part of validating an act and exports no checker
 * of its own, so this builds the smallest act there is and keeps only its
 * subject. Duplicating the rules would give a malformed film two definitions and
 * let a close quietly match nothing where an open would have been refused.
 */
function namedFilm(film: Film): Film {
  return withdrawVerdict(film, EPOCH).film;
}

const EPOCH = "1970-01-01T00:00:00.000Z";

const moment = (value: Date | string): string =>
  (value instanceof Date ? value : new Date(value)).toISOString();
