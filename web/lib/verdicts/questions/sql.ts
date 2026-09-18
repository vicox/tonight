import type { SqlDriver } from "../../db/driver.ts";
import type { AuthenticatedUser } from "../../identity.ts";
import { withdrawVerdict, type Film } from "../model.ts";
import { askAbout, type Question, type QuestionStore } from "../questions.ts";
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
 * ## What is not here
 *
 * No expiry. The plan says an unanswered question *"expires quietly"* and never
 * says after what, and the difference between a rule counted in sessions and one
 * counted in days is a decision about the product rather than a number to pick.
 * So the lifetime is left unimplemented and reported rather than guessed: a
 * store that retired questions on a schedule nobody approved would be making
 * that decision silently.
 *
 * No answer either, in any form. Closing a question says it is no longer
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
        `SELECT title, year, since
           FROM tonight_verdict_questions
          WHERE user_id = $1 AND title = $2 AND year = $3`,
        [owner, checked.film.title, checked.film.year],
      );
      if (!row) throw new Error("The question was not written down.");
      return assemble(row);
    },

    async pending(): Promise<Question[]> {
      const rows = await driver.query<QuestionRow>(
        `SELECT title, year, since
           FROM tonight_verdict_questions
          WHERE user_id = $1
          ORDER BY since, id`,
        [owner],
      );
      return rows.map(assemble);
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

type QuestionRow = { title: string; year: number; since: Date | string };

/** A row, rebuilt through the model so it cannot mean more than a question. */
function assemble(row: QuestionRow): Question {
  return askAbout({ title: row.title, year: row.year }, moment(row.since));
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
