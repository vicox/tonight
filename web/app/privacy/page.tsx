import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalPage, OperatorAddress } from "@/components/legal";
import { operator } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — Tonight",
  description: "What the hosted Tonight closed beta processes, and what it does not.",
};

export default function Privacy() {
  // Without a named operator this is not a privacy policy, so it is not served.
  const op = operator();
  if (!op) notFound();

  return (
    <LegalPage title="Privacy Policy">
      <section>
        <h2>Who is responsible</h2>
        <p>
          Tonight is operated by a private individual, not a company. The controller within the
          meaning of the GDPR is:
        </p>
        <OperatorAddress operator={op} />
        <p>
          For any question about this policy or your data, including a request to delete it, write to{" "}
          <a href={`mailto:${op.email}`}>{op.email}</a>.
        </p>
      </section>

      <section>
        <h2>What this policy covers</h2>
        <p>
          Tonight is currently a <strong>free, invitation-only closed beta</strong>. Access is limited
          to a list of e-mail addresses configured by the operator; any other Google account is refused
          after signing in, and receives nothing from us. If no list is configured, the hosted service
          admits <strong>nobody</strong> rather than everybody — it refuses every sign-in until the
          operator has named the invited addresses.
        </p>
        <p>
          This policy covers the hosted service at tonight.movie — its web pages including the
          signed-in view of your taste model at <code>/</code>, the endpoints that page writes through
          under <code>/api</code>, the website&rsquo;s own sign-in endpoints under <code>/auth</code>,
          the endpoints an MCP client is authorized through under <code>/oauth</code>, and the MCP
          endpoint at <code>/mcp</code>.
        </p>
        <p>
          <strong>It does not cover the assistant you connect Tonight to.</strong> Tonight is a store
          for your taste model and a small set of operations on it; it does not choose films. That
          happens in whatever MCP client you use — Claude, ChatGPT or another — which brings its own
          knowledge of films and whatever other tools it has. That assistant is a separate service with
          its own privacy policy, and what you type into it is governed by that policy rather than this
          one. Tonight does not send your taste model anywhere on its own initiative. What it does is
          answer: an assistant you have authorized may <strong>request</strong> your taste model
          through the MCP endpoint, and Tonight returns <strong>all</strong> of it — every genre and
          mix with its instruction, and every film you have saved with its year, its IMDb id if it
          has one, and whether you watched and liked it. That is more than this website shows you at
          a glance. The signed-in page is organised around your mixes: it lists a film under each
          mix it belongs to, so a film you have saved that is in no mix does not appear there,
          while the MCP endpoint returns it like any other. What that assistant then does with what
          it receives happens in that service, not here, and the operator has no control over it.
        </p>
      </section>

      <section>
        <h2>Signing in with Google</h2>
        <p>
          Signing in redirects you to Google. We request exactly two scopes, <code>openid</code> and{" "}
          <code>email</code>. We do not request <code>profile</code>, so we receive no name and no
          picture.
        </p>
        <p>
          <strong>Received, and only for the moment of signing in.</strong> Google&rsquo;s token
          response, the identity token inside it, and a Google access token that comes with that
          response. The Google access token is <strong>not used and not stored</strong> — the hosted
          service holds no Google permission that it could be used for. The identity token is validated
          and then discarded; it is not stored either.
        </p>
        <p>
          <strong>Used.</strong> The identity token&rsquo;s signature, issuer, audience and expiry are
          checked against Google&rsquo;s published keys, and a value we generated for this one sign-in
          (a nonce) must match, so that a token issued for a different session cannot be replayed into
          yours. From its contents we use three things: the <strong>subject</strong>, Google&rsquo;s
          stable and opaque identifier for your account; your <strong>e-mail address</strong>; and{" "}
          <strong>whether Google verified that address</strong> — if it has not, the sign-in is refused.
        </p>
        <p>
          <strong>Stored.</strong> The subject, as your user key, prefixed to record which provider it
          came from. It survives you changing your e-mail address, which is exactly why it is used
          instead of the address. If you signed in on this website rather than from an MCP client, your
          e-mail address is stored as well, on that browser session and only there — see{" "}
          <strong>What we store</strong> below.
        </p>
        <p>
          <strong>Where your e-mail address goes.</strong> It is used to check whether you are on the
          invitation list. It is never contained in any token we issue and never visible to an MCP
          client. When an <strong>MCP client</strong> is authorized, that is all that happens to it: it
          is checked and discarded, and not written to the database. When <strong>you sign in to this
          website</strong>, it is additionally written to the row that represents your browser session,
          because the site shows you which Google account the taste model belongs to and because the
          invitation list is re-checked against it on every page you load. It is held for as long as
          that session is, and goes when the session does.
        </p>
        <p>
          The <strong>invitation list itself</strong> is a list of addresses the operator entered
          deliberately, and it remains stored in the hosting provider&rsquo;s environment configuration
          for as long as the beta uses it. Your address is not kept there because you signed in; it is
          kept because the operator invited you.
        </p>
        <p>
          Google itself learns that your account signed in to Tonight, when, and from which IP address
          — your browser contacts Google directly. That processing is Google&rsquo;s own and is
          described in Google&rsquo;s privacy policy.
        </p>
        <p>
          Legal basis: the operator relies on Art. 6(1)(b) GDPR — providing the service you asked to
          use.
        </p>
      </section>

      <section>
        <h2>What we store</h2>
        <p>
          <strong>Your taste model.</strong> This is the product, and it is all of it. For each{" "}
          <strong>genre</strong>: its name, the free-text <code>instruction</code> in which you say
          what that genre means to you, and the times it was created and last changed. For each{" "}
          <strong>mix</strong>: the same three, plus which of your genres it is built from and the
          order you gave them in. Instructions are stored as you wrote them, apart from surrounding
          whitespace. Names have surrounding whitespace removed too, and runs of spaces inside them
          collapsed to one, so that the name you see is the name a mix refers to.
        </p>
        <p>
          <strong>Films you tell it about.</strong> A film is in Tonight only because you or an
          assistant acting for you put it there. For each one: the title and release year you gave,
          an optional IMDb title id, whether you have watched it, whether you liked it, and which
          of your mixes it is in. Watched and liked each hold three answers
          — yes, no, and nothing said — and nothing said is what a film starts as. Neither is
          guessed from anything: being recommended a film records nothing, and neither does saving
          one.
        </p>
        <p>
          <strong>What is deliberately not stored.</strong> Tonight keeps no record of what was
          recommended to you, no list of films you were shown, no scored or star ratings, and no
          behavioural profile of any kind. Nor does it keep a film catalogue: no film exists here
          until you name one, and nothing about it — not a poster, not a runtime, not a cast — is
          ever looked up from a movie database. The IMDb id you may give a film is stored as a
          pointer and never followed.
        </p>
        <p>
          <strong>A state, never a history.</strong> A film in Tonight says whether you have
          watched it, not when, how often, or in what order. There are no timestamps on it and no
          event log behind it, so no viewing timeline exists to be reconstructed. Liked and
          disliked are the two things you can say about a film, and they are not a rating scale:
          there is no score, no stars and no average of anything.
        </p>
        <p>
          <strong>Nothing you do changes your taste model except changing it.</strong> Tonight draws no
          conclusions from how you use it and writes nothing back from a recommendation: your genres
          and mixes change only through the operations that change them — by you on this website, or
          by an assistant you have asked to make a change. What a recommendation itself looks like is
          not ours to promise: it is produced by the assistant you connect, from your taste model
          together with its own knowledge, its own context and whatever other tools it has.
        </p>
        <p>
          <strong>Sign-in and connection data.</strong> For each MCP client that registers itself: its
          identifier, the redirect addresses it names, the name it gives for itself, when it
          registered, and when an authorization was last started for it. For a sign-in in progress: the
          client it belongs to, the scope and resource requested, an expiry time, and hashed values
          that bind the flow to the browser it started in. For an issued grant: the user it belongs to,
          its scope and resource, an expiry time, and — for refresh tokens — which family it belongs
          to, whether an individual token has been spent, and whether the family has been revoked.
        </p>
        <p>
          <strong>Your browser session.</strong> If you sign in on this website, one row per signed-in
          browser: your user key, the e-mail address Google verified, when the session began and when
          it expires. Nothing else — no name, no picture, no Google token, no record of which pages you
          looked at. While a sign-in is in progress there is also a short-lived row holding only the
          values that tie it together: a one-time value we require in Google&rsquo;s reply, a proof key
          for the exchange with Google, an expiry time, and a hash of the cookie that ties the sign-in
          to the browser that started it. An MCP client&rsquo;s authorization in progress holds the
          same kind of values.
        </p>
        <p>
          Authorization codes, refresh tokens, session cookies and the browser bindings are stored{" "}
          <strong>only as hashes</strong>; the values themselves are held by your client or your
          browser, not by us. Tonight&rsquo;s own access tokens, which only MCP clients get, are signed
          and <strong>not stored on the server at all</strong> — which is also why a browser session is
          stored: so that signing out can end it, rather than only asking your browser to forget it.
        </p>
        <p>
          <strong>Rate-limit counters.</strong> The three endpoints that anyone can call — client
          registration, an MCP client&rsquo;s authorization request, and this website&rsquo;s sign-in —
          are counted per caller, so that a stranger cannot fill the database with requests. Where the
          hosting platform has established the caller&rsquo;s IP address, the caller is identified by a
          keyed one-way hash of it; the address itself is not written to our database. Where it has
          not, the request is counted in a single shared counter and no address is involved at all.
        </p>
        <p>
          Legal basis: the operator relies on Art. 6(1)(b) GDPR for the taste model and the sign-in
          data, and on Art. 6(1)(f) GDPR for the rate-limit counters, the legitimate interest being to
          keep the service available and to prevent abuse.
        </p>
      </section>

      <section>
        <h2>What your instructions may reveal</h2>
        <p>
          A genre and a mix each carry an <code>instruction</code> — free text in which you describe
          what that part of your taste means to you. It is the heart of the product and it is stored as
          you wrote it.
        </p>
        <p>
          What somebody likes in films can say more about them than they intend. A description of the
          kind of film you mean is enough, and it does not need to be about you.{" "}
          <strong>
            Please do not put special categories of personal data in it — anything about health,
            religious or political beliefs, sexual orientation or the like — and do not put other
            people&rsquo;s personal details in it.
          </strong>{" "}
          The operator has no way to prevent what you type, which is why it is asked for here.
        </p>
      </section>

      <section>
        <h2>What we do not do</h2>
        <ul>
          <li>No analytics, no tracking, no profiling, no advertising, no newsletter.</li>
          <li>
            <strong>No AI provider.</strong> Tonight contains no language model and calls no model
            provider&rsquo;s API. Interpreting what you like, naming a mix and choosing films all
            happen in the assistant you connect, not here — which reaches your genres, mixes and
            films by asking for them, as described above.
          </li>
          <li>
            <strong>No movie database.</strong> Tonight queries no film catalogue or search
            service and has no integration with one. The films it holds are the ones you told it
            about, in the words you used; nothing is fetched about any of them, including from
            IMDb.
          </li>
          <li>
            No third-party scripts. The fonts are served from this domain, so your browser makes no
            request to Google Fonts.
          </li>
          <li>No payments, and therefore no payment data.</li>
          <li>We do not sell your data and do not pass it on for anyone else&rsquo;s purposes.</li>
        </ul>
        <p>
          The only outbound requests the hosted service makes are to Google, while you are signing in:
          exchanging the authorization code, and fetching the public keys an identity token is verified
          against.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          <strong>Four kinds of cookie</strong>, and every one of them holds a random value and nothing
          else. There is no information inside a cookie — no address, no name, no identifier of yours —
          only a value that has to match a stored record for the request to mean anything. We consider
          all four strictly necessary within the meaning of § 25(2) TDDDG, being required to provide the
          sign-in and the signed-in pages you asked for, and accordingly no consent banner is shown.
        </p>
        <p>
          On the hosted service all four are <code>HttpOnly</code> (no script can read them),{" "}
          <code>Secure</code> (sent only over HTTPS), <code>Path=/</code>, carry no <code>Domain</code>,
          and are named with the <code>__Host-</code> prefix — which is what tells your browser to
          refuse a cookie of the same name set by anything but this exact site. On a developer&rsquo;s
          own machine the prefix and <code>Secure</code> are dropped, because a browser rejects a{" "}
          <code>Secure</code> cookie over plain <code>http</code>; nothing else about them differs.
        </p>
        <ul>
          <li>
            <strong>
              <code>__Host-tn_consent_…</code> — one per authorization attempt by an MCP client.
            </strong>{" "}
            Set when the approval page is shown and removed as soon as you answer it. It ties your
            approval to the browser the page was shown in, which is what stops someone else&rsquo;s
            website from submitting an approval on your behalf. <code>SameSite=Strict</code>, ten
            minutes.
          </li>
          <li>
            <strong>
              <code>__Host-tn_provider_…</code> — one per approved authorization, for the trip to
              Google.
            </strong>{" "}
            Set when you approve an MCP client and removed when you come back from Google. It ties the
            rest of that authorization to the same browser, so an approval given in your browser cannot
            be completed in someone else&rsquo;s. <code>SameSite=Lax</code>, ten minutes.
          </li>
          <li>
            <strong>
              <code>__Host-tn_login_…</code> — one per sign-in to this website.
            </strong>{" "}
            Set when you press sign in and removed when you come back from Google. It ties the sign-in
            to the browser that started it. <code>SameSite=Lax</code>, ten minutes.
          </li>
          <li>
            <strong>
              <code>__Host-tn_session</code> — your signed-in session.
            </strong>{" "}
            Set when a sign-in completes and removed when you sign out. It is what the site reads to
            know whose taste model to show. <code>SameSite=Lax</code>, seven days.
          </li>
        </ul>
        <p>
          The first three carry, in their name, a short one-way digest of a value belonging to the flow
          they are part of. That is only so two of them can be in progress at once without interfering;
          the digest identifies the flow, never you, and it is not what makes a request authentic — the
          value <em>inside</em> the cookie is, and it is compared against a stored hash.
        </p>
        <p>
          We set no other cookies, and we use no local storage, session storage or IndexedDB in your
          browser.
        </p>
      </section>

      <section>
        <h2>Service providers</h2>
        <p>
          We use two providers, and treat both as processors under Art. 28 GDPR on the data processing
          terms they provide:
        </p>
        <ul>
          <li>
            <strong>Vercel</strong> — hosting. As the hosting layer it receives the connection and
            request data of every visit, including your IP address, and keeps platform logs of its own.
          </li>
          <li>
            <strong>Neon</strong> — the PostgreSQL database. Neon receives database connections from
            the application and stores the records described above. It does not receive your
            browser&rsquo;s connection, and therefore not your IP address by that route.
          </li>
        </ul>
        <p>
          Which regions these run in are deployment settings the operator configures in the
          providers&rsquo; dashboards; they are not established by the published source code.{" "}
          <strong>
            Processing may take place outside the European Union, in particular in the United States.
          </strong>{" "}
          Both providers belong to groups with entities outside the EU and use subprocessors of their
          own; their documentation describes this and the safeguards they apply, including standard
          contractual clauses.
        </p>
        <p>
          Our own application writes no request logs and stores no IP address in clear text.{" "}
          <strong>That is not the same as saying no IP address is processed.</strong> As with any
          hosted service, the hosting layer necessarily sees it.
        </p>
      </section>

      <section>
        <h2>How long we keep things</h2>
        <p>
          The periods below are <strong>validity periods</strong> — how long a record can still be
          used. They are not a promise that it has been physically removed at that moment:
        </p>
        <ul>
          <li>a sign-in in progress, either kind, is valid for ten minutes</li>
          <li>
            a signed-in browser session is valid for seven days from the moment you signed in. Access
            stops the moment the session is no longer valid: when you sign out, when you sign in again
            in that browser, when the seven days pass, or when the invitation list no longer admits
            your address — which is re-checked on <em>every</em> request the session makes, so a change
            by the operator reaches you on your next page load. <strong>The stored row is a separate
            question.</strong> Signing out, signing in again, and a request that finds your address
            removed from a list that still names other people each delete it there and then. But a
            session whose browser simply never comes back, and a session refused because the list has
            been emptied or misconfigured altogether, are refused without the row necessarily being
            removed at that moment — it stops working immediately either way, and is deleted later, in
            the opportunistic way described below
          </li>
          <li>an authorization code is valid for sixty seconds, and is deleted when it is used</li>
          <li>
            a Tonight access token is valid for one hour, and is not stored on the server at all
          </li>
          <li>a refresh token, and the family it belongs to, is valid for thirty days</li>
          <li>
            a client registration becomes eligible for deletion ninety days after it was last used —
            see below, which sets out what &ldquo;last used&rdquo; means and when the deletion
            actually happens
          </li>
          <li>
            rate-limit counters are kept in windows — ten minutes for sign-ins, ten minutes for an
            MCP client&rsquo;s authorization requests, an hour for client registrations — and a
            counter row becomes eligible for removal about a day after it was last written
          </li>
        </ul>
        <p>
          Expired rows are cleaned up opportunistically, as a side effect of later requests, rather
          than by a scheduled job. An expired record is unusable from the moment it expires, but may
          remain physically present in the database for some time after that.
        </p>
        <p>
          <strong>A client registration</strong> also records <strong>when it was last used</strong>.
          It is set to the moment of registration when the client registers, and refreshed each time
          an authorization is started for it — starting one is the only thing counted as use; a client
          being looked up is not. So a client that registered and was never authorized still carries a
          time, its registration time, and its clock runs from there. That timestamp exists so a
          registration nobody ever came back for can be cleaned up rather than kept for ever.
        </p>
        <p>
          A registration becomes <strong>eligible for deletion</strong> once ninety days have passed
          since it was last used. Deletion itself is opportunistic rather than scheduled: eligible
          registrations are removed the next time any client registers, so a row may remain for some
          time after it became eligible. A client that is still in use never becomes eligible, and one
          that has lapsed registers itself again the next time it is used.
        </p>
        <p>
          <strong>Your taste model</strong> — your genres, your mixes, and the films you saved
          along with their watched and liked state — is subject to a policy of the operator rather
          than a rule in the software: it is{" "}
          <strong>intended to be kept until the closed beta ends</strong>, and the operator will delete
          it then, or earlier on a valid request. The application does not delete it by itself, and
          performs no automatic deletion at the end of the beta.
        </p>
        <p>
          Our providers operate backups and point-in-time recovery of their own, on terms they document
          and we do not set. Deleting data here therefore does not necessarily remove it from a
          provider&rsquo;s backups at the same moment. For how long a copy may persist there, their own
          documentation is the authority; we make no promise of our own about it.
        </p>
      </section>

      <section>
        <h2>Deleting your data</h2>
        <p>
          You can delete any mix yourself at any time, on this website or through your assistant, and
          any genre no mix is built from. A genre a mix does refer to stays until that mix does not:
          take it out of the mix, or delete the mix, and the genre can go. Films are managed through
          your assistant rather than on this website — ask it to change or forget one and it does so
          there and then; the signed-in page shows them but has no controls for them. To have your
          account and everything belonging to it removed, write to{" "}
          <a href={`mailto:${op.email}`}>{op.email}</a>. During this beta, deleting an account is
          carried out by hand rather than by a button in the product. We act without undue delay and,
          as a rule, within one month.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          Where applicable and subject to the statutory conditions, you have the right to access your
          data (Art. 15 GDPR), to have it corrected (Art. 16) or erased (Art. 17), to have its
          processing restricted (Art. 18), to receive it in a portable form (Art. 20), and to object to
          processing based on legitimate interests (Art. 21).
        </p>
        <p>
          You may also lodge a complaint with a supervisory authority (Art. 77 GDPR), in particular in
          the Member State of your habitual residence, your place of work, or the place of the alleged
          infringement.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          Tonight is a beta and changes while it runs. If what we process changes, this page changes
          with it, and the date at the top says when it last did.
        </p>
      </section>
    </LegalPage>
  );
}
