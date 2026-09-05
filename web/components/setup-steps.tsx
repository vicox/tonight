import Link from "next/link";

import { CopyButton } from "./copy-button";
import { PREREQUISITES, UNVALIDATED, type SetupStep } from "@/lib/setup-steps";

/**
 * The four steps, compactly: the whole shape of connecting Tonight, readable
 * standing up.
 *
 * The long version is `/setup`, which renders the same data its own way. This one
 * is a list of imperatives with the two things somebody has to carry across —
 * Tonight's address and the project instructions — attached to the steps that
 * need them, because a setup guide that describes a copy is a setup guide people
 * get wrong.
 */
export function SetupSteps({
  steps,
  endpoint,
  instructions,
  version,
}: {
  steps: readonly SetupStep[];
  endpoint: string;
  instructions: string;
  version: string;
}) {
  return (
    <section>
      <h2 className="font-display text-[26px] leading-none">Connect it in four steps</h2>

      <Unverified />
      <Prerequisites />

      <ol className="mt-7 flex flex-col gap-5">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <Ordinal>{index + 1}</Ordinal>
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] text-ink">{step.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{step.summary}</p>

              {step.copyable === "endpoint" && (
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <code className="min-w-0 truncate rounded-md border border-rule bg-night px-3 py-2 font-mono text-[12.5px] text-ink">
                    {endpoint}
                  </code>
                  <CopyButton text={endpoint} copied="Copied">
                    Copy address
                  </CopyButton>
                </div>
              )}

              {step.copyable === "instructions" && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <CopyButton text={instructions} tone="primary" copied="Copied — now paste it">
                    Copy project instructions
                  </CopyButton>
                  <p className="text-[12px] text-ink-faint">Version {version}</p>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-[13px] text-ink-soft">
        <Link
          href="/setup"
          className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink-faint"
        >
          The longer version
        </Link>{" "}
        has every step at length, and what each failure looks like.
      </p>
    </section>
  );
}

/**
 * What somebody needs before step 1, when we can say what that is.
 *
 * Renders nothing while `PREREQUISITES` is empty, which is the current state and
 * the honest one: the requirement is real, but naming an unverified plan in the
 * first thing anybody reads would be worse than saying nothing. See Q2 in the
 * design document.
 */
function Prerequisites() {
  if (PREREQUISITES.length === 0) return null;

  return (
    <ul className="mt-5 flex flex-col gap-1.5 rounded-xl border border-beam-dim bg-beam-dim/10 px-5 py-4 text-[13px] leading-relaxed text-ink-soft">
      {PREREQUISITES.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/**
 * Said before the first step, while any of this is still untested.
 *
 * Short here and longer on `/setup`: somebody scanning the home page needs to
 * know these steps have not been walked end to end, not to read why.
 */
function Unverified() {
  if (!UNVALIDATED) return null;

  return (
    <p className="mt-5 rounded-xl border border-beam-dim bg-beam-dim/10 px-5 py-4 text-[13px] leading-relaxed text-ink-soft">
      <span className="text-ink">These steps have not been tested end to end yet.</span> They are
      right as far as we know, and two things in them are not yet confirmed: what a ChatGPT
      account has to be for Tonight to be able to write, and what the control that switches
      Tonight on in a project is called.{" "}
      <Link
        href="/setup"
        className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink-faint"
      >
        What that means for you
      </Link>
      .
    </p>
  );
}

/** The step's number, in the one place it is written down. */
function Ordinal({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-rule text-[11.5px] text-ink-faint tabular-nums"
    >
      {children}
    </span>
  );
}
