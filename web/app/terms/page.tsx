import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalPage } from "@/components/legal";
import { operator } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Use — Tonight",
  description: "The terms for the free, invitation-only Tonight closed beta.",
};

export default function Terms() {
  const op = operator();
  if (!op) notFound();

  return (
    <LegalPage title="Terms of Use">
      <section>
        <h2>What Tonight is right now</h2>
        <p>
          Tonight is a <strong>free closed beta</strong>, operated by a private individual. It is a
          test version, not a finished product, and nothing here is sold: there is no charge, no
          subscription and no paid plan.
        </p>
      </section>

      <section>
        <h2>What Tonight does, and what it does not</h2>
        <p>
          Tonight keeps a <strong>taste model that belongs to you</strong>: genres, each with an
          instruction saying what that genre means to you, mixes that combine them and say what the
          combination means, and the films you have told it about, each in whichever of your mixes
          you put it. It stores that model, enforces the rules over it, and makes it available to
          you on this website and to an assistant you connect over MCP.
        </p>
        <p>
          <strong>Tonight does not choose films for you.</strong> It contains no recommendation engine,
          no language model and no film database — the films it holds are the ones you put there,
          and nothing about them is looked up. Recommending happens in whatever MCP client you
          connect — it reads your genres and mixes and brings its own knowledge of films and whatever
          other tools it has. Anything it tells you about a film comes from it, not from Tonight, and
          the operator makes no promise that it is accurate, complete or up to date. That assistant is
          a separate service on its own terms.
        </p>
      </section>

      <section>
        <h2>Who may use it</h2>
        <p>
          Use is limited to people who have been invited. Access is granted per e-mail address, and the
          operator decides which addresses are on the list and may add or remove one at any time. With
          no list configured, the service admits nobody.
        </p>
        <p>
          Removing an address stops that account from signing in again, and closes the signed-in
          website to a browser that is already signed in as soon as it loads another page. Credentials
          already issued to an MCP client may remain usable until they expire or are revoked by hand —
          so for those, removal prevents future sign-in rather than ending every active connection at
          that instant.
        </p>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          There is no promise that the service is available, that it keeps working, or that it keeps
          working the same way. It may be unavailable, changed, or discontinued at any time and without
          notice — that is what a beta is. Please do not build anything on it that you cannot afford to
          lose, and do not treat it as the only place something is stored.
        </p>
        <p>Liability is governed by the applicable statutory provisions.</p>
      </section>

      <section>
        <h2>Your use of it</h2>
        <p>
          You are responsible for how you use Tonight and for what you put into it. Please do not use
          it unlawfully, do not attempt to reach another person&rsquo;s data, and do not try to disrupt
          or overload the service.
        </p>
      </section>

      <section>
        <h2>The instruction field</h2>
        <p>
          A genre and a mix each carry an <code>instruction</code> — free text in which you describe
          what it means to you. It is stored as you wrote it, apart from surrounding whitespace.
        </p>
        <p>
          <strong>
            Please do not put special categories of personal data in it — for example anything about
            health, religious or political beliefs or sexual orientation — and do not put other
            people&rsquo;s personal details in it.
          </strong>{" "}
          What somebody likes in films can say more about them than they intend; a description of the
          kind of film you mean is enough, and it does not need to be about you. The operator has no
          way to prevent what you type, which is why it is asked for here.
        </p>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          What is processed, and for how long, is described in the{" "}
          <a href="/privacy">Privacy Policy</a>. In short: Tonight stores your genres, your mixes,
          and the films you told it about — including whether you watched each and whether you
          liked it. What it does not store is a history: no record of what was recommended, no
          viewing timeline, and no profile built from how you use it. Everything you create —
          genres, mixes, and the films you saved with their watched and liked state — is intended
          to be kept until the closed beta ends and deleted by the operator then, or earlier on
          request.
        </p>
      </section>

      <section>
        <h2>Ending it</h2>
        <p>
          You can stop using Tonight whenever you like and ask for your data to be deleted. You can
          delete any mix yourself, and any genre no mix is built from — a genre a mix refers to stays
          until you take it out of that mix or delete the mix. For a film, the website lets you
          mark whether you watched and liked it; adding or removing one is done through your
          assistant, which does it on request. The operator may withdraw access at any time, in
          particular if these terms are not respected or when the closed beta ends.
        </p>
      </section>

      <section>
        <h2>Applicable law and contact</h2>
        <p>
          German law applies. If you are a consumer, the mandatory consumer protection rules of your
          country of residence remain unaffected.
        </p>
        <p>
          The operator is named in the <a href="/impressum">Impressum</a>. For anything about these
          terms, write to <a href={`mailto:${op.email}`}>{op.email}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
