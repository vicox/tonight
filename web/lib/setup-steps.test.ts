import assert from "node:assert/strict";
import test from "node:test";

import { SERVER_VERSION } from "./mcp/identity.ts";
import { setupSteps } from "./setup-steps.ts";

/**
 * What the setup guide has to keep saying.
 *
 * It used to hold one more thing: while the walkthrough was still unverified, no
 * prerequisite could be published and no ChatGPT plan named anywhere in it. Both
 * questions have since been answered by running the walkthrough on a real
 * account, so those two assertions were removed rather than left passing
 * vacuously. The rule they encoded outlives them and is written where it applies
 * — see `PREREQUISITES` — but it is about where a sentence came from, which no
 * test can see.
 */

const STEPS = setupSteps("https://tonight.movie/mcp");

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
