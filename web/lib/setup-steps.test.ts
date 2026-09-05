import assert from "node:assert/strict";
import test from "node:test";

import { SERVER_VERSION } from "./mcp/identity.ts";
import { PREREQUISITES, UNVALIDATED, VALIDATED, setupSteps } from "./setup-steps.ts";

/**
 * The setup guide's contract with the two open spikes.
 *
 * Q1 and Q2 are questions about somebody else's product, so nothing here can
 * answer them. What it can do is stop the answers being invented: the pages must
 * not claim a prerequisite nobody verified, and must not call the walkthrough
 * finished while the claims in it are guesses.
 */

const STEPS = setupSteps("https://tonight.movie/mcp");

test("nothing is claimed about eligibility until Q2 has been run", () => {
  // The two go together. A prerequisite is exactly the kind of sentence somebody
  // acts on before doing anything else, so publishing one we have not verified is
  // worse than publishing none — and the notice is what says so out loud.
  if (!VALIDATED.connector) {
    assert.deepEqual([...PREREQUISITES], [], "prerequisites were written before Q2 answered them");
    assert.equal(UNVALIDATED, true, "the pages would stop saying the guide is unverified");
  }
});

test("the guide names no ChatGPT plan anywhere while Q2 is open", () => {
  if (VALIDATED.connector) return;

  const prose = STEPS.flatMap((step) => [
    step.title,
    step.summary,
    step.confirms,
    ...step.detail,
    ...step.trouble.flatMap((trouble) => [trouble.symptom, trouble.meaning]),
  ]).join("\n");

  // Read second-hand and never confirmed. A plan named here is a plan somebody
  // will choose a subscription on.
  for (const plan of ["Plus", "Pro", "Business", "Enterprise", "Edu", "Team"]) {
    assert.doesNotMatch(
      prose,
      new RegExp(`\\b${plan}\\b`),
      `the guide names the ${plan} plan, which Q2 has not established`,
    );
  }
});

test("the connection check asks for something only a tool call can produce", () => {
  const last = STEPS[STEPS.length - 1];
  const said = [last.confirms, ...last.detail].join("\n");

  // An assistant with no connector answers "what do you know about my taste?"
  // just as fluently as one with it, and on a new account both say "nothing yet".
  // So the check names a tool and a value the server decides.
  assert.match(said, /get_server_info/, "the check does not name a tool to call");
  assert.ok(said.includes(SERVER_VERSION), "the check does not name the version to expect");

  // And the guide has to say why the softer question is not the test, or somebody
  // will substitute it back in.
  assert.match(last.confirms, /taste/i, "nothing warns against the fabricable check");
});

test("every step says how it can fail, or has nothing to say", () => {
  for (const step of STEPS) {
    assert.ok(step.confirms.length > 0, `${step.title}: no way to tell it worked`);
    for (const trouble of step.trouble) {
      assert.ok(trouble.symptom.length > 0 && trouble.meaning.length > 0, step.title);
    }
  }
});
