import { JUDGEMENT, VIEWING } from "./movie-mark";
import type { Viewing } from "@/lib/taste/model";
import type { Judgement } from "@/lib/verdicts/model";
import { CHOICES, isPressed, refusalSentence, type Choice, type Refusal } from "@/lib/web/choices";

/**
 * "What do you think?" — the five choices on a film's screen.
 *
 * One plain form posting to `/movie/choose`, the website's one write, with a
 * button per choice. No client code: the browser sends the form, the server keeps
 * the choice and answers with this page again, which draws what now stands. What
 * each choice means, and what pressing one that is already pressed does, is
 * `lib/web/choices.ts`.
 *
 * A button is pressed when its fact is what the film stands at — a verdict or the
 * film's viewing, each shown as stored — so two can be pressed at once: *Love it*
 * and *Not interested*, say. Pressing a pressed opinion takes it back.
 *
 * The icons are the marks' own, so a heart here is the heart a row and a card show
 * for the same verdict. Loved in pink and liked in blue when pressed, as on a card.
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
  return (
    <section aria-labelledby="what-do-you-think">
      <h3 id="what-do-you-think" className="font-display text-[20px] leading-tight text-ink">
        What do you think?
      </h3>
      <p id="choices-hint" className="sr-only">
        Pressing a chosen opinion again takes it back.
      </p>

      <form method="post" action="/movie/choose" className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="year" value={String(year)} />
        {from !== null && <input type="hidden" name="from" value={from} />}

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
                "inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-[13.5px]",
                "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam",
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

      {refused !== null && (
        <p role="alert" className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">
          {refusalSentence(refused)}
        </p>
      )}
    </section>
  );
}

const UNPRESSED = "border-rule text-ink-soft hover:border-ink-faint hover:text-ink";

/** The two with a colour of their own when pressed, as on a card. */
const PRESSED: Partial<Record<Choice["key"], string>> = {
  love: "border-loved bg-loved/10 text-loved",
  like: "border-liked bg-liked/10 text-liked",
};

/** The mark's own drawing of a choice: its icon, and whether it is filled. */
function drawn(choice: Choice) {
  const mark =
    choice.kind === "judgement"
      ? JUDGEMENT.choices.find((one) => one.value === choice.judgement)
      : VIEWING.choices.find((one) => one.value === choice.viewing);
  if (!mark) throw new Error(`no mark for ${choice.key}`);
  return mark;
}
