import type { Metadata } from "next";
import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { LegalLinks } from "@/components/legal";
import { PROJECT_INSTRUCTIONS, PROJECT_INSTRUCTIONS_VERSION } from "@/lib/instructions";
import { PREREQUISITES, setupSteps, type SetupStep } from "@/lib/setup-steps";
import { mcpEndpoint } from "@/lib/web/setup";

/**
 * The walkthrough at length: every step, what it should look like, and what going
 * wrong looks like.
 *
 * Complete in text. Screenshots of a beta interface age without anybody editing
 * them, so when they arrive they will supplement these steps rather than carry
 * them — and a page of empty placeholders would help nobody in the meantime.
 */

export const metadata: Metadata = {
  title: "Setup — Tonight",
  description: "Connect Tonight to ChatGPT, step by step.",
};

/**
 * Rendered per request, not at build time.
 *
 * The MCP address is derived from `PUBLIC_ORIGIN`, and a production build runs
 * with none of the deployment's environment set — prerendering this would bake in
 * whatever the build host happened to have, which is nothing.
 */
export const dynamic = "force-dynamic";

export default function Setup() {
  const endpoint = mcpEndpoint();
  const steps = endpoint ? setupSteps(endpoint) : [];

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-10 border-b border-rule pb-5">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Link href="/" className="font-display text-[22px] leading-none hover:text-ink-soft">
            Tonight
          </Link>
          <p className="text-[12.5px] text-ink-faint">Setup</p>
        </div>
      </header>

      <section className="text-[14px] leading-[1.65] text-ink-soft">
        <h1 className="font-display text-[28px] leading-tight text-ink">
          Connecting Tonight to ChatGPT
        </h1>
        <p className="mt-4">
          Tonight keeps a taste model that belongs to you. Your assistant reads it, finds you
          something to watch, and — when you say something worth keeping — writes it back. These
          four steps are what puts the two in touch.
        </p>
        <p className="mt-3">
          Written for ChatGPT, because that is the one we illustrate. Tonight speaks MCP and any
          host that does can be pointed at the same address.
        </p>
      </section>

      <Prerequisites />

      {endpoint === null ? (
        <p className="mt-10 rounded-xl border border-rule bg-screen px-5 py-4 text-[13.5px] leading-relaxed text-ink-soft">
          Tonight&rsquo;s address cannot be shown just now, so these steps would be missing the
          one thing you need to carry across. Try again in a moment.
        </p>
      ) : (
        <ol className="mt-10 flex flex-col gap-10">
          {steps.map((step, index) => (
            <Step
              key={step.title}
              step={step}
              ordinal={index + 1}
              endpoint={endpoint}
            />
          ))}
        </ol>
      )}

      <section className="mt-14 border-t border-rule pt-6 text-[13.5px] leading-relaxed text-ink-soft">
        <h2 className="font-display text-[17px] text-ink">Once it works</h2>
        <p className="mt-3">
          Nothing else to set up. Ask for a film when you want one, and the taste model grows out
          of what you tell it — never out of what it concluded about you. Signing in to this
          website is optional: it is where you look at what has accumulated, and where you can
          change it by hand if you would rather.
        </p>
      </section>

      <footer className="mt-14 border-t border-rule pt-5">
        <LegalLinks />
      </footer>
    </main>
  );
}

/**
 * What somebody needs before step 1, when we can say what that is.
 *
 * Renders nothing while `PREREQUISITES` is empty. The requirement is real —
 * writing is gated more tightly than reading, and Tonight is writing — but what
 * exactly it is has to come from trying it on real accounts rather than from
 * second-hand reporting. See Q2 in `docs/work/chatgpt-companion-redesign.md`.
 */
function Prerequisites() {
  if (PREREQUISITES.length === 0) return null;

  return (
    <section className="mt-8 rounded-xl border border-beam-dim bg-beam-dim/10 px-5 py-4">
      <h2 className="text-[13px] tracking-[0.09em] text-ink uppercase">Before you start</h2>
      <ul className="mt-3 flex flex-col gap-1.5 text-[13.5px] leading-relaxed text-ink-soft">
        {PREREQUISITES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

function Step({
  step,
  ordinal,
  endpoint,
}: {
  step: SetupStep;
  ordinal: number;
  endpoint: string;
}) {
  return (
    <li>
      <h2 className="flex items-baseline gap-3 font-display text-[20px] leading-tight text-ink">
        <span aria-hidden="true" className="text-[13px] text-ink-faint tabular-nums">
          {ordinal}
        </span>
        {step.title}
      </h2>

      <div className="mt-3 flex flex-col gap-3 text-[13.5px] leading-relaxed text-ink-soft">
        {step.detail.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      {step.copyable === "endpoint" && (
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <code className="min-w-0 truncate rounded-md border border-rule bg-night px-3 py-2 font-mono text-[12.5px] text-ink">
            {endpoint}
          </code>
          <CopyButton text={endpoint}>Copy address</CopyButton>
        </div>
      )}

      {step.copyable === "instructions" && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <CopyButton text={PROJECT_INSTRUCTIONS} tone="primary" copied="Copied — now paste it">
            Copy project instructions
          </CopyButton>
          <p className="text-[12px] text-ink-faint">Version {PROJECT_INSTRUCTIONS_VERSION}</p>
        </div>
      )}

      <p className="mt-4 border-l-2 border-beam-dim pl-4 text-[13px] leading-relaxed text-ink-soft">
        <span className="text-ink">You should see:</span> {step.confirms}
      </p>

      {step.trouble.length > 0 && (
        <dl className="mt-4 flex flex-col gap-3 text-[13px] leading-relaxed">
          {step.trouble.map((trouble) => (
            <div key={trouble.symptom}>
              <dt className="text-ink">{trouble.symptom}</dt>
              <dd className="mt-0.5 text-ink-soft">{trouble.meaning}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
