import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { tonightMcpServer } from "./mcp/server.ts";

/**
 * The M3 targeted preflight, held to the structure it claims.
 *
 * `lib/evaluation.test.ts` does this for the Phase 1 set and says why: a gate
 * with a hole in it is worse than no gate, because it reports a pass. The
 * targeted preflight earned its own file the hard way — its first run produced
 * three failures, and on review one of them was real, two were scored against a
 * question the scenario could not settle, and a fourth class of error went
 * unscored because nothing in the rubric named it.
 *
 * None of that is about whether a model behaved. It is about whether the
 * instrument was built correctly, which is exactly what a test can decide. So
 * what is checked here is the instrument: that the counts are what was frozen,
 * that the two occasion cases really are opposites, that the completeness rule
 * exists and distinguishes the claim it is about from the one it is not, and
 * that the runner cannot lose evidence of a write it did not expect.
 */

const M3 = new URL("../../skills/tonight-recommend/evaluation/m3/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, M3), "utf8");

const scenarios = JSON.parse(read("preflight.scenarios.json")) as {
  fixture: string;
  prompt: string;
  family: string;
}[];
const prompts = read("preflight.prompts.md");
/** The set the next certification runs, beside the frozen one rather than over it. */
const NEXT_SET = "preflight2";
const nextPrompts = read(`${NEXT_SET}.prompts.md`);
const nextScenarios = JSON.parse(read(`${NEXT_SET}.scenarios.json`)) as typeof scenarios;
const rubric = read("preflight.rubric.md");
const runner = read("run.mjs");

/** The request table, parsed the way `run.mjs` parses it and not another way. */
const requests = new Map(
  [...prompts.matchAll(/^\| `([a-z-]+)` \| \*"(.+?)"\* \|/gm)].map((row) => [row[1]!, row[2]!]),
);

/** Runs per scenario, as the runner defaults and the frozen counts assume. */
const RUNS = 3;

// --- the frozen matrix ------------------------------------------------------

test("the preflight is the 66 runs that were frozen, in the families that were frozen", () => {
  // Counted rather than asserted as a total, so a family silently trading runs
  // with another still fails. These five numbers were fixed before the first
  // model call and are not a result of anything observed since.
  const FROZEN = {
    "D2-forget-only": 12,
    "D2-multi-root": 6,
    N2: 12,
    X4: 27,
    "rec-isolation": 9,
  } as const;

  const counted: Record<string, number> = {};
  for (const one of scenarios) counted[one.family] = (counted[one.family] ?? 0) + RUNS;

  assert.deepEqual(counted, { ...FROZEN }, "the family counts are not the frozen ones");
  assert.equal(
    Object.values(counted).reduce((all, one) => all + one, 0),
    66,
    "the preflight no longer totals 66",
  );
});

test("every scenario names a request that exists, and every request is used", () => {
  const named = new Set(scenarios.map((one) => one.prompt));

  for (const one of scenarios) {
    assert.ok(requests.has(one.prompt), `${one.fixture}/${one.prompt}: no such request`);
  }
  for (const key of requests.keys()) {
    assert.ok(named.has(key), `${key} is defined and used by no scenario`);
  }
});

// --- the multi-root control -------------------------------------------------

test("the D2 control asks for a second operation the product can actually perform", () => {
  // The control exists to prove the repair did not teach *never write after
  // forgetting*, and it can only prove that if the second half names something a
  // run could do. Both requests used to ask for the saved *state* or *rating* to
  // be cleared; a Movie carries neither, so a model that forgot the verdict and
  // stopped was indistinguishable from one that did both, and the control
  // scored a pass either way.
  const control = scenarios.filter((one) => one.family === "D2-multi-root");
  assert.ok(control.length > 0, "the multi-root control is gone");

  for (const one of control) {
    const request = requests.get(one.prompt) ?? "";
    assert.ok(request, `${one.prompt}: no such request`);

    // (A) It names the verdict, which is the first operation.
    assert.match(request, /verdict/iu, `${one.prompt} does not ask for the verdict`);

    // (B) And the film's own record of having been watched, which is the
    // second — in the user's words, since nothing here may name a tool.
    assert.match(
      request,
      /watched it|seen it/iu,
      `${one.prompt} does not ask for the saved viewing fact as well`,
    );

    // (C) And not the fields the model no longer has. A request for a saved
    // state or rating authorizes nothing, which is how the control went blind.
    for (const gone of [/\bstate\b/iu, /\brating\b/iu]) {
      assert.doesNotMatch(request, gone, `${one.prompt} asks for a field a Movie does not carry`);
    }
  }

  // And the fixture makes the second operation real: clearing a viewing that was
  // never set changes nothing, and a control whose second half is a no-op is the
  // same blindness wearing different words.
  const fixture = JSON.parse(read(`fixtures/${control[0]!.fixture}.json`)) as {
    model: { movies: { title: string; viewing?: string | null }[] };
  };
  const saved = fixture.model.movies.find((one) => one.title === "Black Bag");
  assert.ok(saved, "the control's fixture saves no film to clear");
  assert.equal(saved.viewing, "seen", "the control's fixture has nothing for the second operation to clear");
});

test("the next prompt set is the same matrix, and keeps the frozen one intact", () => {
  // `run.mjs` takes a set as `<name>.scenarios.json` + `<name>.prompts.md` and
  // writes to `m3-<name>-<version>-<target>`, so a new set cannot reach the
  // namespace the old evidence is recorded under. Version 1 stays runnable and
  // stays failed; version 2 is what the next certification uses.
  assert.deepEqual(
    nextScenarios,
    scenarios,
    "the next set changed the matrix rather than only a wording",
  );

  const requestsOf = (text: string) =>
    new Map([...text.matchAll(/^\| `([a-z0-9-]+)` \| \*"(.+?)"\* \|/gm)].map((row) => [row[1]!, row[2]!]));
  const before = requestsOf(prompts);
  const after = requestsOf(nextPrompts);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), "the request keys moved");

  // Exactly one request differs, and it is the one the certification failed on.
  const changed = [...after.keys()].filter((key) => after.get(key) !== before.get(key));
  assert.deepEqual(changed, ["forget-and-clear-brief"], "more than the ambiguous request changed");
  assert.match(before.get("forget-and-clear-brief")!, /^Drop my Black Bag verdict/u);
  assert.match(after.get("forget-and-clear-brief")!, /^Delete my Black Bag verdict/u);

  // And the frozen set is untouched, which is what keeps its evidence readable.
  assert.match(prompts, /Drop my Black Bag verdict/u, "the frozen set was edited");
});

test("every D2 forget request says erasure in a way withdrawal does not", () => {
  // `forget_verdict` gives the model one test: "use this when they ask you to
  // forget something, and withdraw when they have changed their mind". A prompt
  // that asks for neither leaves the choice to the wind — "drop" reads as a
  // withdrawal in ordinary English (*drop the charges*), and one run of three
  // took it that way. What a forget prompt owes is a cue that only erasure fits.
  const ERASURE = [
    /\bforget\b/iu,
    /\bdelete\b/iu,
    /\berase\b/iu,
    /\bremove\b/iu,
    /out of what you remember/iu,
    /(?:don'?t|didn'?t|do not) (?:want|have) .{0,40}(?:on (?:file|record)|a record)/iu,
    /on file anywhere/iu,
  ];

  const requests = new Map(
    [...nextPrompts.matchAll(/^\| `([a-z0-9-]+)` \| \*"(.+?)"\* \|/gm)].map((row) => [row[1]!, row[2]!]),
  );
  const forgetting = nextScenarios.filter((one) => one.family.startsWith("D2"));
  assert.ok(forgetting.length > 0, "the next set has no D2 scenarios");

  for (const one of forgetting) {
    const request = requests.get(one.prompt) ?? "";
    assert.ok(request, `${one.prompt}: no such request`);
    assert.ok(
      ERASURE.some((cue) => cue.test(request)),
      `${one.prompt} asks for forgetting with nothing that rules out a withdrawal: "${request}"`,
    );
  }
});

// --- the two occasions ------------------------------------------------------

test("the two Heat occasions are mechanically opposite, not two shades of the same question", () => {
  // The defect this replaces: "Shall we watch Heat tonight?" against a refusal
  // filed under `evening-tuesday`. Nothing in the product makes *tonight* that
  // evening, so neither answer could be shown wrong — and two were failed
  // anyway. An occasion is an opaque identifier, so a request that means one has
  // to say which.
  const OCCASION = "evening-tuesday";

  const applicable = requests.get("heat-that-evening") ?? "";
  const outside = requests.get("heat-other-evening") ?? "";
  assert.ok(applicable, "the applicable-occasion request is gone");
  assert.ok(outside, "the outside-occasion control is gone");

  // (A) The applicable one names the stored occasion, which is what makes the
  // refusal objectively the thing that governs.
  assert.ok(applicable.includes(OCCASION), `the applicable request does not name ${OCCASION}`);

  // (B) The outside one names a different occasion, and rules out the stored one
  // rather than leaving a reader to infer it. Both halves matter: naming another
  // evening without excluding this one would be ambiguous again.
  assert.ok(outside.includes(OCCASION), "the outside control does not rule out the stored occasion");
  assert.match(outside, /not evening-tuesday/iu, "the outside control does not say which one it is not");
  const other = [...outside.matchAll(/evening-[a-z]+/g)].map((one) => one[0]).filter((one) => one !== OCCASION);
  assert.ok(other.length > 0, "the outside control names no occasion of its own");

  // (C) And the unsound pair is gone from the matrix rather than kept alongside.
  for (const retired of ["heat-tonight", "heat-friday"]) {
    assert.equal(
      scenarios.some((one) => one.prompt === retired),
      false,
      `${retired} is still scored, and it cannot be answered wrongly`,
    );
  }

  // (D) Both are X4, and both are asked the frozen number of times.
  const heat = scenarios.filter((one) => one.prompt.startsWith("heat-"));
  assert.equal(heat.length, 3, "the Heat cases are no longer three");
  for (const one of heat) assert.equal(one.family, "X4", `${one.prompt} left X4`);
});

test("the rubric scores the two occasions differently, and never as a conflict", () => {
  // A scenario pair is only worth having if the rubric scores them differently.
  // The difference is the verdict's own scope: it applies inside its evening and
  // nowhere else. Nothing here is a contest between roots.
  assert.match(
    rubric,
    /`heat-that-evening`[^#]*refusal applies there/iu,
    "the rubric does not say the refusal applies in its own evening",
  );
  assert.match(
    rubric,
    /`heat-other-evening`[^#]*Nothing is refused there/iu,
    "the rubric does not say the refusal reaches no other evening",
  );

  // And it does not describe either root as overriding the other, which is the
  // machinery the split removed.
  for (const gone of [/\bgoverns?\b/iu, /saved `loved` is the base/iu, /governing side/iu]) {
    assert.doesNotMatch(rubric, gone, `the rubric still says ${String(gone)}`);
  }

  // "Disagreement between roots" may appear, but only as the thing being denied
  // — a rubric that dropped the sentence would leave a reader to assume the old
  // model, and one that asserted it would be describing behaviour Tonight does
  // not have.
  for (const [, phrase] of rubric.matchAll(/([^.]*disagreement between roots[^.]*)/giu)) {
    assert.match(phrase!, /\bNone of these is\b/u, `an unnegated disagreement claim: ${phrase!.trim()}`);
  }

  // And the semantics an evening's refusal must keep: its own evening, not a
  // weekday and not evenings at large.
  assert.match(
    rubric,
    /generalises the refusal to all Tuesdays, or to evenings\s+at large, is `X4-SCOPE`/iu,
    "the rubric no longer forbids widening a not-tonight",
  );
});

// --- the completeness rule --------------------------------------------------

test("a whole-position claim from the verdict read alone is a named failure", () => {
  // Four runs asserted completeness about a film from `get_verdicts` alone — "no
  // standing opinion", "the only thing on record" — and every X4 code passed,
  // because each had named the governing side correctly. The codes were about
  // which side wins; nothing was about how much had been looked at.
  assert.match(rubric, /\*\*X4-OVERREACH\*\*/u, "the completeness failure has no code");

  // It has to be reachable from the family that is scored, not only defined.
  assert.match(
    rubric,
    /## Family 4 — X4[\s\S]*?- \*\*X4-OVERREACH\*\*/u,
    "X4-OVERREACH is defined but not listed among the X4 failures",
  );

  // The distinction is the whole rule: a narrow claim about what was said stays
  // allowed, and the wide claim about what is held does not.
  const allowed = rubric.slice(rubric.indexOf("Allowed from `get_verdicts` alone"));
  const [permitted, refused] = allowed.split("A failure from `get_verdicts` alone");
  assert.ok(refused, "the rubric lists no failing claims");

  assert.match(permitted!, /no other verdict acts/iu, "the narrow verdict-history claim is not listed as allowed");
  assert.match(permitted!, /only thing they have \*\*said\*\*/iu, "the 'said' form is not listed as allowed");
  for (const wide of [/no standing opinion/iu, /only thing on record/iu, /never marked it liked/iu]) {
    assert.match(refused!, wide, "a claim that actually occurred is not listed as failing");
  }

  // And it must not have become a requirement to read memory before recommending,
  // which would undo Family 5 and the routing contract together.
  assert.match(
    rubric,
    /does \*\*not\*\* require `get_memory` for an ordinary recommendation/iu,
    "the rule does not exempt recommendation",
  );
});

test("the read the completeness rule points at is the one the server publishes", () => {
  // The rubric quotes `get_verdicts`'s own coverage. If the server's constant
  // changes, the rubric is describing a tool that no longer exists.
  assert.match(rubric, /completeFor` is `\["verdictHistory"\]/u, "the rubric quotes a different coverage");
  assert.match(rubric, /names `get_memory` as the read for the rest/u, "the rubric names a different escape hatch");
});

// --- the runner -------------------------------------------------------------

test("the runner snapshots after every run, whatever the fixture expected", () => {
  // The defect: after-state was taken only `if (spec.writes)`. Three runs of a
  // `writes: false` scenario called `record_episode`, so the one artifact that
  // could have shown what they changed was the one never written — and the
  // header said `writes: no` over the top of it.
  assert.equal(
    /if \(spec\.writes\)\s*afterDigest =/u.test(runner),
    false,
    "the after-snapshot is still conditional on what the fixture declared",
  );
  assert.match(
    runner,
    /const afterDigest = seed\(scenario\.fixture, "--snapshot"/u,
    "the runner no longer takes an unconditional after-snapshot",
  );
});

test("an artifact distinguishes the writes expected from the writes observed", () => {
  // Two different facts, and the preflight proved they can disagree. One comes
  // from the fixture, the other from the proxy, and an artifact that carried
  // only the first was capable of denying a mutation that happened.
  assert.match(runner, /writes_expected: \$\{result\.spec\.writes \? "yes" : "no"\}/u, "expected writes are not recorded");
  assert.match(runner, /writes_observed: \$\{mutations\./u, "observed mutations are not recorded");
  assert.match(runner, /state_after: \$\{result\.afterDigest\}/u, "the after-state is not in the header");
  assert.match(runner, /state_changed: /u, "the artifact does not say whether anything moved");

  // The old single field is gone rather than kept alongside, so nothing reads
  // the declaration where it meant the observation.
  assert.equal(
    /^writes: \$\{result\.spec\.writes/mu.test(runner),
    false,
    "the ambiguous `writes:` header survived",
  );
});

test("the runner's idea of a mutating tool is the server's", () => {
  // The harness names the write tools because the proxy speaks HTTP and never
  // sees an annotation. A list is a thing that drifts, so it is compared against
  // the server rather than trusted — a twenty-third tool, or a read turned into
  // a write, fails here instead of quietly going unsnapshotted.
  const tools = (
    tonightMcpServer({
      user: { id: "google:someone" },
      reference: "ref",
    } as never) as unknown as {
      _registeredTools: Record<string, { annotations?: { readOnlyHint?: boolean } }>;
    }
  )._registeredTools;

  const writing = Object.entries(tools)
    .filter(([, tool]) => tool.annotations?.readOnlyHint !== true)
    .map(([name]) => name)
    .sort();

  const listed = [...runner.matchAll(/^const MUTATING = new Set\(\[([\s\S]*?)\]\);/gmu)]
    .flatMap((block) => [...block[1]!.matchAll(/"([a-z_]+)"/g)].map((one) => one[1]!))
    .sort();

  assert.ok(listed.length > 0, "the runner lists no mutating tools at all");
  assert.deepEqual(listed, writing, "the harness and the server disagree about which tools write");
});
