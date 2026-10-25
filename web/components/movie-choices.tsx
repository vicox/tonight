import { Check } from "lucide-react";

import { JUDGEMENT, VIEWING } from "./movie-mark";
import type { Viewing } from "@/lib/taste/model";
import type { Judgement } from "@/lib/verdicts/model";
import {
  CHOICES,
  WHEN,
  asksWhen,
  isPressed,
  refusalSentence,
  type Choice,
  type Refusal,
} from "@/lib/web/choices";

/**
 * "What do you think?" — a film's five answers — and, while the film is seen,
 * "When did you see it?" — its two.
 *
 * Plain forms posting to `/movie/choose`, the website's one write, with a button
 * per answer. No client code: the browser sends the form, the server keeps the
 * answer and answers with this page again, which draws what now stands — the
 * second question included, which appears once an opinion makes the film seen
 * and goes once *Want to see* or *Not interested* says it is not. What each
 * answer means, and what pressing one that is already pressed does, is
 * `lib/web/choices.ts`.
 *
 * A top button is pressed when its fact is what the film stands at — a verdict
 * or the film's viewing, each shown as stored. Pressing a pressed opinion takes
 * it back. The icons are the marks' own, so a heart here is the heart a row and a
 * card show for the same verdict. Loved in pink and liked in blue when pressed,
 * as on a card.
 *
 * The two below carry no mark: the one that stands is green with a check, the
 * other is plain. They, and their heading, are drawn a step smaller and quieter
 * than the five above — the same kind of control, answering a follow-up.
 */
export function MovieChoices({
  title,
  year,
  viewing,
  judgement,
  from,
  refused,
}: {
  title: string;
  year: number;
  viewing: Viewing;
  judgement: Judgement | null;
  /** The vibe the film's screen was reached through, kept for the way back. */
  from: string | null;
  /** Why the last press was not kept, when it was not. */
  refused: Refusal | null;
}) {
  const film = (
    <>
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="year" value={String(year)} />
      {from !== null && <input type="hidden" name="from" value={from} />}
    </>
  );

  return (
    <section aria-labelledby="what-do-you-think">
      <h3 id="what-do-you-think" className="font-display text-[20px] leading-tight text-ink">
        What do you think?
      </h3>
      <p id="choices-hint" className="sr-only">
        Pressing a chosen opinion again takes it back.
      </p>

      <form method="post" action="/movie/choose" className="mt-4 flex flex-wrap gap-2">
        {film}
        {CHOICES.map((choice) => {
          const pressed = isPressed(choice, viewing, judgement);
          const { icon: Icon, filled } = drawn(choice);
          return (
            <button
              key={choice.key}
              type="submit"
              name="choice"
              value={choice.key}
              aria-pressed={pressed}
              aria-describedby="choices-hint"
              className={[
                PILL,
                pressed ? PRESSED[choice.key] ?? "border-ink-soft bg-ink/10 text-ink" : UNPRESSED,
              ].join(" ")}
            >
              <Icon
                aria-hidden="true"
                size={15}
                strokeWidth={1.75}
                fill={pressed && filled === true ? "currentColor" : "none"}
              />
              {choice.label}
            </button>
          );
        })}
      </form>

      {asksWhen(viewing) && (
        <>
          <h3 id="when-did-you-see-it" className="mt-8 font-display text-[17px] leading-tight text-ink-soft">
            When did you see it?
          </h3>
          <form
            method="post"
            action="/movie/choose"
            aria-labelledby="when-did-you-see-it"
            className="mt-3 flex flex-wrap gap-2"
          >
            {film}
            {WHEN.map((choice) => {
              const pressed = isPressed(choice, viewing, judgement);
              return (
                <button
                  key={choice.key}
                  type="submit"
                  name="choice"
                  value={choice.key}
                  aria-pressed={pressed}
                  className={[SMALL_PILL, pressed ? SEEN : UNPRESSED].join(" ")}
                >
                  {pressed && <Check aria-hidden="true" size={12} strokeWidth={2} />}
                  {choice.label}
                </button>
              );
            })}
          </form>
        </>
      )}

      {refused !== null && (
        <p role="alert" className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">
          {refusalSentence(refused)}
        </p>
      )}
    </section>
  );
}

const PILL = [
  "inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-[13.5px]",
  "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam",
].join(" ");

/**
 * The two below: a top pill about a fifth smaller — type, padding and check — so
 * the second question reads as following the first rather than as its equal.
 * Only the drawing shrinks: an invisible ring, 4px on every side, keeps the area
 * that takes a press about as large as a top pill's, and half the 8px gap between
 * the two, so neither reaches into the other.
 */
const SMALL_PILL = [
  "relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-[13px] py-[6.5px] text-[11px]",
  "after:absolute after:-inset-1 after:rounded-full",
  "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam",
].join(" ");

const UNPRESSED = "border-rule text-ink-soft hover:border-ink-faint hover:text-ink";

/** The two at the top with a colour of their own when pressed, as on a card. */
const PRESSED: Partial<Record<Choice["key"], string>> = {
  love: "border-loved bg-loved/10 text-loved",
  like: "border-liked bg-liked/10 text-liked",
};

/** When they saw it, as it stands: green, with the check that is its only mark. */
const SEEN = "border-seen bg-seen/10 text-seen";

/** The mark's own drawing of a top answer: its icon, and whether it is filled. */
function drawn(choice: Choice) {
  const mark =
    choice.kind === "judgement"
      ? JUDGEMENT.choices.find((one) => one.value === choice.judgement)
      : VIEWING.choices.find((one) => one.value === choice.viewing);
  if (!mark) throw new Error(`no mark for ${choice.key}`);
  return mark;
}
