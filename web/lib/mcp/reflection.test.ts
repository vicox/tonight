import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";

import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/migrate.ts";
import { embeddedDriver } from "../db/pglite.ts";
import { sqlEpisodeStore, EPISODES_SCHEMA } from "../episodes/store/sql.ts";
import type { AuthenticatedUser } from "../identity.ts";
import { REFLECTION_SCHEMA, sqlReflectionStore } from "../reflection/store/sql.ts";
import { sqlTasteStore, TASTE_SCHEMA } from "../taste/store/sql.ts";
import { QUESTIONS_SCHEMA, sqlQuestionStore } from "../verdicts/questions/sql.ts";
import { sqlVerdictStore, VERDICTS_SCHEMA } from "../verdicts/store/sql.ts";
import { tonightMcpServer } from "./server.ts";

/**
 * The lifecycle as an agent meets it.
 *
 * Five tools, and the one property that matters across all of them: until
 * somebody says yes, nothing the user owns moves and nothing a recommendation
 * reads changes. The store tests prove the mechanism; these prove the surface,
 * and in particular that `get_taste` — what a recommendation stands on — cannot
 * see any of this.
 */

const asUser = (id: string): AuthenticatedUser => ({ id }) as AuthenticatedUser;

type Tool = {
  description?: string;
  handler: (args: Record<string, unknown>) => Promise<{
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  }>;
};

const TARGET = {
  kind: "genre" as const,
  name: "Restrained Thriller",
  instruction: "Tension carried by what is withheld rather than what is shown.",
};

describe("proposing, and the user deciding", () => {
  let driver: SqlDriver;
  let next = 0;

  before(async () => {
    driver = await embeddedDriver();
    for (const schema of [TASTE_SCHEMA, EPISODES_SCHEMA, VERDICTS_SCHEMA, QUESTIONS_SCHEMA, REFLECTION_SCHEMA]) {
      await migrate(driver, schema);
    }
  });

  after(async () => {
    await driver.close();
  });

  const someone = (): Record<string, Tool> => {
    const who = asUser(`google:m4-mcp-${String(++next)}`);
    return (
      tonightMcpServer({
        user: who,
        reference: "ref",
        store: sqlTasteStore(driver, who),
        episodes: sqlEpisodeStore(driver, who),
        verdicts: sqlVerdictStore(driver, who),
        questions: sqlQuestionStore(driver, who),
        reflection: sqlReflectionStore(driver, who),
      }) as unknown as { _registeredTools: Record<string, Tool> }
    )._registeredTools;
  };

  const ok = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown> = {}) => {
    const result = await tools[name]!.handler(args);
    assert.equal(result.isError, undefined, `${name} refused — ${JSON.stringify(result)}`);
    return result.structuredContent as Record<string, unknown>;
  };
  const refused = async (tools: Record<string, Tool>, name: string, args: Record<string, unknown>) => {
    const result = await tools[name]!.handler(args);
    assert.equal(result.isError, true, `${name} was allowed`);
    return result;
  };

  /* ------------------------------------------------------------ isolation */

  test("nothing Tonight thinks reaches what a recommendation stands on", async () => {
    const tools = someone();
    const before = JSON.stringify(await ok(tools, "get_taste"));

    const noticed = (await ok(tools, "record_observation", {
      noticed: "both films they loved withhold more than they show",
    })) as { observation: { ref: string } };
    assert.equal(JSON.stringify(await ok(tools, "get_taste")), before, "observing moved the taste model");

    await ok(tools, "propose_change", {
      from: noticed.observation.ref,
      noticed: "worth making a genre?",
      target: TARGET,
    });
    assert.equal(JSON.stringify(await ok(tools, "get_taste")), before, "proposing moved the taste model");

    // And reading it back is not deciding it, either.
    await ok(tools, "get_proposals");
    assert.equal(JSON.stringify(await ok(tools, "get_taste")), before, "reading a proposal moved the taste model");
  });

  test("nothing Tonight thinks reaches what it says the user told it", async () => {
    // `get_memory` answers *what do you know about me*. An observation is not
    // something they said, so it is excluded — the same line an open question
    // sits on, and the reason `get_proposals` exists at all.
    const tools = someone();
    const before = JSON.stringify(await ok(tools, "get_memory"));

    await ok(tools, "record_observation", { noticed: "they keep choosing quiet films" });
    await ok(tools, "propose_change", { noticed: "worth making a genre?", target: TARGET });

    assert.equal(JSON.stringify(await ok(tools, "get_memory")), before, "Tonight's own thinking reached get_memory");
  });

  /* ------------------------------------------------------------ the decision */

  test("accepting makes exactly the change that was offered", async () => {
    const tools = someone();
    const offered = (await ok(tools, "propose_change", {
      noticed: "worth making a genre?",
      target: TARGET,
    })) as { proposal: { ref: string } };

    const taste = (await ok(tools, "get_taste")) as { genres: { name: string }[] };
    assert.deepEqual(taste.genres, []);

    await ok(tools, "accept_proposal", { ref: offered.proposal.ref });

    const after = (await ok(tools, "get_taste")) as {
      genres: { name: string; instruction: string }[];
    };
    assert.equal(after.genres.length, 1);
    assert.equal(after.genres[0]!.name, TARGET.name);
    assert.equal(after.genres[0]!.instruction, TARGET.instruction);
  });

  test("rejecting makes no change, and the refusal is remembered", async () => {
    const tools = someone();
    const offered = (await ok(tools, "propose_change", {
      noticed: "worth making a genre?",
      target: TARGET,
    })) as { proposal: { ref: string } };

    await ok(tools, "reject_proposal", { ref: offered.proposal.ref });

    const taste = (await ok(tools, "get_taste")) as { genres: unknown[] };
    assert.deepEqual(taste.genres, [], "a refused proposal wrote a genre");

    const seen = (await ok(tools, "get_proposals")) as { proposals: { state: string }[] };
    assert.equal(seen.proposals[0]!.state, "rejected");
  });

  test("a decided proposal cannot be decided again", async () => {
    const tools = someone();
    const offered = (await ok(tools, "propose_change", {
      noticed: "worth making a genre?",
      target: TARGET,
    })) as { proposal: { ref: string } };

    await ok(tools, "reject_proposal", { ref: offered.proposal.ref });
    await refused(tools, "accept_proposal", { ref: offered.proposal.ref });
    await refused(tools, "reject_proposal", { ref: offered.proposal.ref });

    const taste = (await ok(tools, "get_taste")) as { genres: unknown[] };
    assert.deepEqual(taste.genres, []);
  });

  test("one user's thinking is not another's", async () => {
    const mine = someone();
    const theirs = someone();
    const offered = (await ok(theirs, "propose_change", {
      noticed: "theirs",
      target: TARGET,
    })) as { proposal: { ref: string } };

    await refused(mine, "accept_proposal", { ref: offered.proposal.ref });

    const seen = (await ok(mine, "get_proposals")) as { proposals: unknown[]; observations: unknown[] };
    assert.deepEqual(seen.proposals, []);
    assert.deepEqual(seen.observations, []);
    const still = (await ok(theirs, "get_proposals")) as { proposals: { state: string }[] };
    assert.equal(still.proposals[0]!.state, "pending", "a stranger's attempt decided their proposal");
  });

  /* ---------------------------------------------------------- the surface */

  test("the descriptions say that offering is not doing", async () => {
    const tools = someone();
    const propose = tools.propose_change!.description ?? "";
    const accept = tools.accept_proposal!.description ?? "";
    const reject = tools.reject_proposal!.description ?? "";
    const observe = tools.record_observation!.description ?? "";

    // The three ways a proposal wrongly becomes real, each refused where the
    // decision is made rather than only in the skill.
    assert.match(propose, /Proposing is not doing/u);
    assert.match(propose, /Showing it to them is not their\s+agreeing to it/u);
    assert.match(propose, /not answering is not their agreeing to it/u);
    assert.match(accept, /actually agreed\*\*, in words/u);
    assert.match(accept, /None of those is a yes/u);
    // An observation is never evidence, and never becomes evidence by ageing.
    assert.match(observe, /not evidence and never becomes evidence/u);
    assert.match(observe, /does not grow more true by surviving/u);
    // A no settles it.
    assert.match(reject, /A no settles it/u);
    assert.match(reject, /not answering is not a no either/u);
  });

  test("the descriptions say which evidence may found a reading", async () => {
    // M4's first behavioural rule, at the point a reading is written down. The
    // failure it prevents is the one an agent that reflects can reach for on
    // its own: reading its own output back until a guess looks like a finding.
    const observe = (someone().record_observation!.description ?? "");

    assert.match(observe, /\*\*Only what they established may found a reading\.\*\*/u);
    assert.match(observe, /Not a film you put\s+forward, not an evening that happened/u);
    assert.match(observe, /not something you noticed or offered before/u);
    assert.match(observe, /reading your own output back is how a guess comes to look like a finding/u);
    assert.match(observe, /And not an\s+absence: nothing follows from a film they have said nothing about/u);

    // And the pragmatic threshold, stated as judgement rather than as a number.
    assert.match(observe, /\*\*One thing is not a pattern\.\*\*/u);
    assert.match(observe, /a thread you\s+could say out loud and they would recognise/u);
    assert.match(observe, /Nothing is lost by not writing one/u);
    // No scoring crept in with it.
    for (const invented of [/confidence/iu, /\bscore\b/iu, /\bweight\b/iu, /threshold/iu]) {
      assert.doesNotMatch(observe, invented, `the observation rule invented a ${String(invented)}`);
    }
  });

  test("a proposal is a question, and never takes over the answer", async () => {
    const propose = someone().propose_change!.description ?? "";

    assert.match(propose, /\*\*Ask it as a question, because it is one\.\*\*/u);
    assert.match(propose, /something they can say no to without correcting you/u);
    assert.match(propose, /leaves them arguing\s+with their own taste model/u);

    // The recommendation is still the answer. This is the rule that stops
    // reflection becoming the main event the moment it is available.
    assert.match(propose, /\*\*And it never takes over the answer\.\*\*/u);
    assert.match(propose, /If they asked for a film, they get the film/u);
    assert.match(
      propose,
      /A recommendation that turned into a conversation about their taste model is a\s+recommendation they did not get/u,
    );
  });

  test("the reflection tools are five, and only the two decisions write", async () => {
    const tools = someone();
    const added = ["record_observation", "propose_change", "get_proposals", "accept_proposal", "reject_proposal"];
    for (const name of added) assert.ok(tools[name], `${name} is not registered`);
    assert.equal(Object.keys(tools).length, 27, "the tool surface is not 22 plus these five");

    const annotations = (name: string) =>
      (tools[name] as unknown as { annotations?: { readOnlyHint?: boolean } }).annotations;
    assert.equal(annotations("get_proposals")?.readOnlyHint, true);
    for (const writer of ["record_observation", "propose_change", "accept_proposal", "reject_proposal"]) {
      assert.equal(annotations(writer)?.readOnlyHint, false, `${writer} claims to be a read`);
    }
  });
});
