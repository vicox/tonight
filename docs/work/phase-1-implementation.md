# Phase 1 — implementation plan

**Status:** approved and in progress. **Step 1 is complete and committed**: the evaluation
infrastructure and frozen baseline are now part of the repository. Steps 2–8 have not started. No
skill text, tool descriptions, or application code have been changed.
`recommendation-strategy.md` is the product specification and is not reopened here — where this
document appears to disagree with it, the strategy document wins and this one is wrong.

**Revision 3.** Revision 2 corrected four engineering defects: an unsafe intermediate state in
the step order, an incomplete acceptance gate, stop conditions that authorised shipping a weakened
Phase 1, and an unstated rollback order. Revision 3 corrects a fifth, in Step 8 alone: the
shipping gate was expressed entirely as prohibitions, so a run that simply never produced the new
behaviours could pass it. §9 records both sets of changes. **Steps 5 and 6 swapped places in
revision 2**; no step other than Step 8 changed in revision 3.

Written in English to match the rest of the repository.

---

## 1. What Phase 1 is, and what it must not become

Phase 1 delivers §10 Phase 1 of `recommendation-strategy.md`: the shape of an answer, P3, P4, P5,
the `get_taste` failure split, and the instruction reallocation of §9.3.

**Phase 1 is prompt-only.** The only three kinds of file that may change are:

1. **Prompt text** — `skills/tonight-recommend/SKILL.md`, and the prompt text that happens to be
   stored in code as tool descriptions in `web/lib/mcp/server.ts`.
2. **Test and evaluation infrastructure** — the two contract suites, and the new evaluation
   directory.
3. **Generated and documentary artefacts** — `web/lib/generated/project-instructions.ts`
   (regenerated, never hand-edited), `README.md`, and this document plus the strategy document.

**Anything else in a Phase 1 diff is scope creep and should be rejected in review**, however
reasonable it looks. In particular, no change may appear under:

```
web/app/**            web/components/**       web/lib/taste/**
web/lib/web/**        web/lib/db/**           web/lib/oauth/**
```

No schema change, no migration, no API route, no component, no store behaviour. If a Phase 1 rule
appears to require one, the rule has been misread: the recommendation runs entirely in the host
agent, and Tonight's contribution to it is text.

### 1.1 What the tests can and cannot prove

Stated here because it governs how every step below is reviewed.

- **`instructions.test.ts` and `test.sh` prove only that a rule is present in the text the agent
  is given.** They are deterministic, they are cheap, and they catch the failure this project has
  actually had — a rule disappearing behind a `full:` marker, or being edited away.
- **They prove nothing about whether a model follows the rule.** No assertion in either suite can.
- **The paired blind evaluation in Step 8 is the behavioural acceptance gate.** Acceptance
  criteria 1–6 of the strategy document are decided there and nowhere else. Criterion 7 — the
  budget — is the one the deterministic tests do settle.

A green suite after Step 7 means the instructions say what they should. It does not mean Phase 1
works.

### 1.2 Phase 1 ships whole, or it does not ship

Phase 1 is an approved specification, not a menu. **No step below may resolve a difficulty by
shipping less of it.** Where a rule will not fit, or cannot be written correctly, the
implementation stops and the blockage is escalated as a product decision — it is never resolved by
dropping the rule and recording a gap.

The one thing that is always permitted is **tightening the wording of a rule that still ships in
full**. Compressing prose is editing. Removing a rule is a change to an approved specification and
is out of this document's authority.

---

## 2. The instruction budget

### 2.1 Measured, today

The generated project instructions are **7,816 characters** against a **7,900** guard and a
**8,000** measured truncation point (`web/lib/instructions.test.ts`, `CAP` and `GUARD`). Roughly
eighty characters of headroom. By section:

| Section | Characters | Share |
| --- | ---: | ---: |
| Preamble and boundaries | ≈1,040 | 13% |
| **Recommending** | **≈1,730** | **22%** |
| What may be persisted | ≈1,040 | 13% |
| Films they tell you about | ≈2,880 | 37% |
| Model questions, memory, failures | ≈1,170 | 15% |

Tool descriptions, which are **not** capped, total ≈5,187 characters across the eleven tools.

### 2.2 Expected after Phase 1

| Movement | Characters |
| --- | ---: |
| Today | **7,816** |
| − the old `## Recommending` section, replaced wholesale | −1,730 |
| − net harvest relocated to tool descriptions (§2.3) | −675 |
| + the new `## Recommending` section (estimate) | +2,040 |
| + the failure split in `## When something fails` (estimate) | +260 |
| **Expected** | **≈7,711** |

**Phase 1 fits, with ≈190 characters of headroom.** The estimate is deliberately generous: the
skill is written telegraphically and the estimate is not. Step 7 measures rather than assumes.

Tool descriptions grow from ≈5,187 to ≈6,000. There is no length assertion anywhere in the
repository and no cap on this channel.

### 2.3 The harvest, itemised

Only rules that are **tool-local** move. The criterion is already written into the repository, in
the doc comment of `web/lib/mcp/tools.test.ts:342`: *"A client can discover these tools and call
them without ever loading the Tonight skill, so anything that must be true whenever the tool is
called belongs in its description."*

| Rule | New home | ≈Chars |
| --- | --- | ---: |
| The Mix naming test — *"if I knew only its Genres, what would I get wrong?"* | `create_mix` (already there; the skill keeps a pointer) | 200 |
| *"A Genre always needs an instruction… a Mix needs at least one existing Genre… built from Genres only"* | `create_genre`, `create_mix` | 130 |
| *"Write every Genre and Mix instruction in the user's first person"* | the four Genre/Mix write tools | 65 |
| The sentence → state mapping, in full | the shared `movieState` schema description | 300 |
| *"Never reword their instruction"*, *"record a score or star rating"* | `update_genre`, `update_mix`, `create_movie`, `update_movie` | 100 |
| **Gross** | | **795** |
| Pointers left behind in the skill | | −120 |
| **Net** | | **≈675** |

**What does not move**, because it spans more than one call or must be read before any call is
made: consent (*"Never persist what you conclude alone"*), the two-requests split for writing a
Movie, the classification ladder, the Mix proposal flow, *"propose while saving, not while
recommending"*, *"A recommendation is not a saved Movie"*, *"A film in no Mix is legitimate"*.

### 2.4 The discovery: Phase 2, not Phase 3, is the next cap collision

`recommendation-strategy.md` §9.3 states that the budget runs out at Phase 3. **Re-deriving it
against the real numbers during this planning exercise shows that it runs out at Phase 2.**

```
after Phase 1              ≈7,711
+ Phase 2, "Why now"       ≈  600
                           ───────
                           ≈8,311      over the 8,000 cap, and 411 over the guard
```

Phase 1 is unaffected and does not change. The consequence is for what comes next:

> **Unresolved decision §11.1 of the strategy document — the second delivery channel — must be
> settled before Phase 2 is written, not before Phase 3.**

Step 7 records the measured post-Phase-1 figure in the strategy document so that the decision is
taken against a number rather than an estimate.

---

## 3. Files expected to change

| File | Kind | Why it changes |
| --- | --- | --- |
| `skills/tonight-recommend/SKILL.md` | prompt | Source of truth. `## Recommending` rewritten; relocated rules removed and pointed at; `## When something fails` extended; new rationale added inside `full:` blocks, which costs no budget |
| `web/lib/generated/project-instructions.ts` | generated | The pasted text. Only ever via `npm run sync:instructions`; committed, never hand-edited |
| `web/lib/mcp/server.ts` | prompt stored in code | Receives the relocated tool-local rules: `create_genre`, `update_genre`, `create_mix`, `update_mix`, `create_movie`, `update_movie`, and the shared `movieState` schema description |
| `web/lib/mcp/tools.test.ts` | test | The relocated rules need a contract in their new home, in the shape of the existing test at line 342 |
| `web/lib/instructions.test.ts` | test | Five tests rewritten, one extended, ~10 coverage-list entries repointed or removed |
| `skills/tonight-recommend/test.sh` | test | ~8 `order_check` blocks; this suite reads `SKILL.md`, so relocated rules must stop being looked for here |
| `README.md` | documentation | §9.3 of the strategy: restate *"none serves product guidance either"* as *"a tool description carries the rules for using that tool, and nothing else"* |
| `docs/work/recommendation-strategy.md` | documentation | Status line, and the measured budget figure from Step 7 |
| `docs/work/phase-1-implementation.md` | documentation | This file: status line on completion |
| `skills/tonight-recommend/evaluation/**` | data + documentation | New. Fixtures, prompts, rubric, runbook, results |

Explicitly **not** changed: `web/lib/instructions.ts` (a re-export), `web/lib/taste/**`,
`web/app/**`, `web/components/**`, `web/lib/worked-examples.ts`.

---

## 4. The eight steps

Grouped so the separation is visible. Every step is independently reviewable and independently
revertable.

```
  Steps 1–3   baseline, infrastructure, rule relocation      no intended behaviour change
  Step  4     the recommendation answer form                 behaviour change
  Step  5     get_taste failure behaviour                    behaviour change
  Step  6     P3 / P5 taste semantics                        behaviour change
  Step  7     budget and documentation gate                  no behaviour change
  Step  8     paired blind evaluation                        the acceptance gate
```

Steps 4, 5 and 6 are each a behavioural change and are **never** combined: they fail differently,
they are reviewed against different acceptance criteria, and a combined diff makes a regression in
one indistinguishable from a regression in another.

### 4.1 The sequencing invariant

> **No change may make `get_taste` mandatory on an ordinary recommendation until the failure
> fallback of strategy §10.1.1 is merged.**

This is why Step 5 is the failure behaviour and Step 6 is the taste semantics, and it is the
correction to the defect revision 1 contained. In revision 1 the order was reversed, which created
a window — between merging the semantics and merging the fallback — in which the shipped
instructions said *"read the taste model on every recommendation"* while `## When something
fails` still said *"report the error verbatim and stop"*. In that window a store outage would
have taken down **every** recommendation, including the plain requests that need no taste data
and work perfectly well today. A window like that is not hypothetical: it is one review cycle, one
weekend, or one partial revert wide.

The fallback rule is safe to merge first. It describes what to do *if* a `get_taste` read was
attempted and failed — a situation today's instructions already permit, since an ordinary request
may read the model for context. Merged ahead of the semantics, it is correct and dormant; merged
after, it is a repair for damage already shipped.

---

### Steps 1–3 — baseline, infrastructure, rule relocation

No intended behaviour change in any of the three. If the evaluation in Step 8 shows a behaviour
difference attributable to Steps 2 or 3, that is a defect in the relocation, not a finding about
the product.

---

#### Step 1 — Evaluation scaffold and baseline capture

**This step must complete before any recommendation prompt changes.** A baseline captured after
an edit is not a baseline, and the paired comparison in Step 8 has nothing to compare against.

**Objective.** Build the fixtures, prompts, rubric and runbook of strategy §10.7 — extended to
eight fixtures so that every acceptance criterion is covered (§8.1) — and record the output of the
**current, unmodified** instructions against them.

**Files.**

```
skills/tonight-recommend/evaluation/README.md          the runbook
skills/tonight-recommend/evaluation/fixtures/*.json    the eight taste models and conditions
skills/tonight-recommend/evaluation/prompts.md         the request set
skills/tonight-recommend/evaluation/rubric.md          the seven criteria
skills/tonight-recommend/evaluation/results/baseline/  the recorded runs
```

**Behaviour change.** None. Nothing the agent reads is touched.

**Tests.** None — this step *is* test infrastructure. The existing suites must remain green and
unmodified.

Each prompt is run several times per fixture. These systems are nondeterministic and a rule
violation that appears in one run of five is a violation at a rate users will meet.

The two failure fixtures are produced by configuration rather than code: point the host's
connector at an endpoint that errors, or present an expired bearer token, so that `get_taste`
fails in a way the agent can see. **No product code is modified to simulate a failure.**

**Review checkpoint.** Are all eight fixtures present, including the exclusion **pair** and both
failure conditions? Was every baseline run recorded before any prompt file was modified? Is the
rubric the seven criteria, with *false personalization* scored separately from *unsupported
claims*? Does every acceptance criterion appear in the matrix of §8.1 with at least one fixture
against it?

**Stop condition.** If any prompt file has already been modified when the baseline is captured,
the baseline is contaminated: discard it, revert, and restart the step. If the fixtures cannot be
run against a real MCP host, or if either failure condition cannot be produced by configuration,
**stop and resolve that before Step 2** — without a complete baseline, Phase 1 has no acceptance
gate and must not proceed.

---

#### Step 2 — Tool-local rules into tool descriptions

Additive only. Nothing is removed from the skill in this step, so every rule temporarily exists in
two places. That is deliberate: it splits the relocation into two small, safe reviews and means no
moment exists in which a rule is absent from both homes. See §7 for what that implies for
rollback.

**Objective.** Add the §2.3 rules to the descriptions of the tools they govern, and give each one
a contract test in its new home.

**Files.** `web/lib/mcp/server.ts`, `web/lib/mcp/tools.test.ts`.

**Behaviour change.** None intended. A host reading tool descriptions sees rules it previously
only saw via the skill.

**Tests.** New assertions in `tools.test.ts`, following the existing test at line 342. Every other
test in the repository must pass **unchanged** — if one fails, something was reworded rather than
copied.

**Review checkpoint.** Is every added rule genuinely tool-local by §9.1 of the strategy — true
whenever *this* call is made, and readable without reference to another call? Does any added
sentence describe orchestration, consent, classification, or the recommend-versus-configure
boundary? Those belong in the skill and must not appear here.

**Stop condition.** If a rule cannot be stated tool-locally without referring to another call, it
is not tool-local: leave it in the skill, remove it from the §2.3 harvest, and carry the smaller
figure into Step 7. The rule still ships in full — only its route changes — so this is not a
weakening. If the reduced harvest later puts the total over the guard, Step 7's stop condition
governs.

---

#### Step 3 — Remove the relocated rules from the skill

**Objective.** Remove exactly what Step 2 added elsewhere, leave a pointer where the skill still
needs to refer to it, regenerate the project instructions, and repoint both contract suites.

**Files.** `skills/tonight-recommend/SKILL.md`,
`web/lib/generated/project-instructions.ts` (regenerated),
`web/lib/instructions.test.ts`, `skills/tonight-recommend/test.sh`.

**Behaviour change.** None intended. This is a relocation; the same rules reach the agent by a
different route, and by a route that arrives with the tools rather than before them.

**Tests.**

- `instructions.test.ts:100` — the sentence → state mapping, including its proximity assertion
  (`to - from < 500`) — moves to `tools.test.ts`.
- `instructions.test.ts:224` — *"in the user's first person"* — moves to `tools.test.ts`.
- `instructions.test.ts:367` — the coverage list loses the relocated entries.
- `test.sh:192` — *"the write constraints that would otherwise fail a call are stated"* — removed;
  it reads `SKILL.md` and the rules are no longer there.
- `test.sh:298–310` — the state-mapping checks — removed, replaced in `tools.test.ts`.
- **New:** an assertion that the relocated sentences no longer appear in `SKILL.md`, so the two
  homes cannot silently become two sources.

**Review checkpoint.** Record the measured instruction length; it should fall to ≈7,140. Did any
rule *disappear* rather than move — present in neither the skill nor a description? Walk the §2.3
table row by row and confirm each has exactly one home and one test.

**Stop condition.** If the measured length does not fall by roughly the harvest, something was
rewritten rather than relocated: revert and redo. If any rule is found in neither home, stop
immediately — that is the failure mode the whole two-step split exists to prevent, and §7 is how
it is avoided during a rollback as well.

---

### Step 4 — The recommendation answer form

**Objective.** Rewrite `## Recommending` for the shape of an answer: one thesis line, one leading
film named as the lead with *"I'd start with…"*, two or three directions ordered by distance from
the lead, and one question **or** one lever to close. Adopt P4 (unseen is the default target; a
`loved` film is a reason, never a suggestion) and P10 (every expansion carries a positive anchor).

**Files.** `skills/tonight-recommend/SKILL.md`, the regenerated module,
`web/lib/instructions.test.ts`, `skills/tonight-recommend/test.sh`.

**Behaviour change.** Yes, and the most visible of Phase 1. *"Three to six films"* becomes one
lead plus two or three directions. The presentation guidance that today sits behind `full:`
markers — and therefore never reaches a ChatGPT project — becomes normative and shipped.

**Tests.**

- New pins: a lead exists and is named as such; two to three directions; ordered by distance;
  no film carrying a state is offered as new; an expansion names something they like.
- `instructions.test.ts:367`: *"three to six films, for range as well as fit"* is removed from the
  coverage list and replaced.
- `test.sh:147` — *"the idea leads the answer"* — extended to require the lead.

Acceptance criteria touched: **1, 4, 5** — pinned as text here, decided in Step 8.

**Review checkpoint.** Does *"three to six"* survive anywhere? Is the lead named as the lead
rather than merely first? Are the directions introduced by the condition under which each wins,
so that a refusal is informative?

**Stop condition.** If the measured instruction length exceeds the 7,900 guard, tighten the
wording — answer-shape prose first, then the states list — while keeping every approved rule in
full. **If tightening cannot bring it under the guard without dropping a rule, stop here** and
escalate to §11.1 of the strategy document. The guard is not raised, and Phase 1 does not
continue with a rule removed.

---

### Step 5 — `get_taste` failure behaviour

Moved ahead of the taste semantics by the invariant in §4.1. This step is a **precondition** for
Step 6, not a follow-up to it.

**Objective.** Implement strategy §10.1.1: a taste-explicit request stops and reports; an ordinary
request falls back with disclosure in the first sentence, no personal claim of any kind, and an
offer to retry.

**Files.** `skills/tonight-recommend/SKILL.md` (`## When something fails`), the regenerated
module, `web/lib/instructions.test.ts`, `skills/tonight-recommend/test.sh`.

**Behaviour change.** Yes, and it supersedes the current rule, which stops in both cases. Merged
here it is correct and largely dormant — an ordinary request may already read the model for
context — and it is in place before Step 6 makes that read mandatory.

**Tests.**

- New pins for both branches, and for the prohibition on personal claims in the fallback branch.
- `instructions.test.ts:367`: *"report the error verbatim and stop"* is repointed rather than
  removed — it remains true of the taste-explicit branch.
- `test.sh:280` — the failure check — rewritten to require both branches.

Acceptance criterion touched: **6**.

**Review checkpoint.** Does the fallback branch forbid personal claims explicitly, rather than
merely omitting them? Is the disclosure required in the **first sentence**, so a reader cannot
mistake a generic answer for a personal one? Is this step merged and green before Step 6 is
opened?

**Stop condition.** If the fallback branch cannot be written so that it discloses the failure and
makes no claim about the user, **stop**. §10.1.1 is an approved rule; it is not satisfied by
reverting to stopping in both cases, and Step 6 must not be merged without it — doing so would
reintroduce exactly the unsafe state §4.1 exists to prevent. Escalate as a product decision.

---

### Step 6 — P3 and P5 taste semantics

Kept separate from Step 4 because it is the highest-risk semantic change in Phase 1 and because it
is the one a reviewer should read slowly. Gated on Step 5 by §4.1.

**Objective.** Adopt P3 — evidence informs every recommendation; only exclusions written into an
instruction are mode-dependent; what they said tonight binds absolutely. Adopt P5 — a declaration
counts from the moment it exists, and Movie states calibrate confidence rather than deciding
whether a Mix counts at all.

**Files.** `skills/tonight-recommend/SKILL.md`, the regenerated module,
`web/lib/instructions.test.ts`, `skills/tonight-recommend/test.sh`.

**Behaviour change.** Yes. `get_taste` is read on every recommendation rather than only on a
taste-explicit request. A Mix created yesterday with nothing under it shapes tonight's answer. An
exclusion inside a Mix instruction binds a taste-explicit request and does not bind an unrelated
plain one.

**Tests.**

- `instructions.test.ts:142` — *"an ordinary request is Discovery, and the model does not bound
  it"* — **rewritten, not deleted.** Six entries pinning *"Nothing persisted binds"* and
  *"nothing in it is a criterion unless they asked"* are replaced by the P3 split.
- `instructions.test.ts:177` — *"what counts as taste evidence"* — extended. *"What makes one
  trustworthy is the film states under it"* is replaced: states calibrate, they do not gate.
- `instructions.test.ts:198` — the no-arithmetic assertion — must still pass; P5 is qualitative
  and must not acquire a threshold or a count.
- `test.sh:144` — *"an exclusion outranks a preference"* — rewritten to the P3 split.

Acceptance criteria touched: **2, 3** — pinned as text here, decided in Step 8.

**Review checkpoint.** **Is Step 5 merged?** Is the guard *"a request for a film must never become
a configuration session"* preserved **verbatim**? Was the Discovery test rewritten deliberately
rather than deleted for being inconvenient? Does anything in the new text classify a Mix as
counting or not counting — including any word like *aspirational*, *untested* or *weak* applied to
a Mix?

**Stop condition.** If Step 5 is not merged and green, this step does not open: §4.1. If the
configuration-drift guard has been reworded to fit the new text, revert and rewrite around it. If
the new wording makes a Mix's weight depend on a state count in any form, the P5 regression the
strategy document exists to prevent has been reintroduced: stop and rewrite.

---

### Step 7 — Budget and documentation gate

**Objective.** Measure, record, and bring the documentation into line with what was built.

**Files.** `README.md`, `docs/work/recommendation-strategy.md`,
`docs/work/phase-1-implementation.md`.

**Behaviour change.** None.

**Tests.** The existing budget test in `instructions.test.ts` is the gate. Full suite, typecheck,
lint, build, `git diff --check`.

**Review checkpoint.** Is the measured length under 7,900, and is the number written into the
strategy document rather than left as an estimate? Does the README sentence now say what the code
actually does? Does the Phase 2 finding of §2.4 appear where whoever writes Phase 2 will find it?

**Stop condition.** Hard stop at ≥7,900. The guard is not raised. Tightening the wording of rules
that still ship in full is the only remedy; **if that is exhausted, Phase 1 stops and the blockage
is escalated to §11.1 of the strategy document as a product decision.** Phase 1 does not ship with
an approved rule removed, and no rule is recorded as a "known gap" to get past this gate.

---

### Step 8 — Paired blind evaluation

**This is the complete behavioural acceptance gate.** Acceptance criteria 1–6 are decided here and
nowhere else. A green contract suite after Step 7 means the instructions say the right things; it
says nothing about whether a model does them.

**Objective.** Run the Step 1 fixtures and prompts against the new instructions, pair each output
with its recorded baseline, strip every marker of which is which, shuffle, and score against the
rubric. Repeat each pair several times.

**Files.** `skills/tonight-recommend/evaluation/results/**` only.

**Behaviour change.** None — this step measures, it does not edit.

**Tests.** The rubric's seven criteria: fit; constraint compliance; decisiveness; justified
personalization; discovery quality; unsupported claims; false personalization.

#### 8.1 Coverage — every acceptance criterion has a fixture

The gate is complete only if every approved criterion is exercised. Two fixtures beyond strategy
§10.7's original six exist for this reason.

| AC | What it claims | Fixture | Primary criteria |
| --- | --- | --- | --- |
| **1** | One lead, named as such, plus two or three directions | every fixture that produces a recommendation | decisiveness, fit |
| **2** | A state-free Mix shapes the answer; fit hedged more than intent | **new Mix, no Movie states** | justified personalization, fit |
| **3** | An exclusion binds a taste-explicit request, and not an unrelated plain one | **the exclusion pair** — same model, two requests | constraint compliance |
| **4** | No film carrying a state is presented as new | **state-rich**, **contradictory** | constraint compliance, false personalization |
| **5** | Every expansion carries a positive anchor | **state-rich**, **empty** | discovery quality, false personalization |
| **6** | Both `get_taste` failure branches behave as specified | **failure, taste-explicit** and **failure, ordinary** | unsupported claims, false personalization |

The eight fixtures: empty model; new Mix with no Movie states; state-rich; contradictory (a
`disliked` film under a Mix whose instruction it matches); exclusion asked taste-explicitly; the
same model asked an unrelated plain question; `get_taste` failing on a taste-explicit request;
`get_taste` failing on an ordinary request.

For AC6 the two failure fixtures are scored against their own expectations: the taste-explicit run
must stop and report; the ordinary run must disclose in its first sentence, recommend without any
personal claim, and offer to retry. The baseline for both is today's behaviour — stopping — which
is what makes the comparison legible.

#### 8.2 A correction after evaluation invalidates the evaluation

**Any prompt change made in response to Step 8 requires a complete re-run of Step 8**, not a
re-check of the case that failed — and a complete re-run means both halves of the gate in §8.3,
not only the one that failed.

Instruction text does not have local effects. A sentence added to fix a failure in the exclusion
pair can change decisiveness in the empty-model fixture, and nothing about the edit will say so.
A partial re-run would confirm the repair and hide its cost.

The correction itself is a new, separately reviewed change against whichever of Steps 4, 5 or 6
owns the rule, and it re-enters the sequence there — including that step's own review checkpoint
and stop condition.

#### 8.3 The shipping gate

> **Phase 1 may ship only if both of the following hold:**
>
> 1. **Every required AC1–AC6 behavioural outcome passes** (§8.3.1), and
> 2. **the paired evaluation meets the comparative quality threshold** (§8.3.2).
>
> **Any failed acceptance criterion is a hard stop.** It is not offset by an improvement
> elsewhere, not averaged into a score, and not carried as a known gap (§1.2).

The two halves answer different questions and neither substitutes for the other. §8.3.1 asks
*"does Phase 1 do what it was approved to do?"* — it requires **positive evidence** that each new
behaviour actually occurs. §8.3.2 asks *"and is the result at least as good as what we had?"* —
it is a comparison, and a comparison cannot detect a required behaviour that is simply absent from
both sides.

Revision 2 had only the second half, expressed as prohibitions. A run in which no film ever led,
no expansion was ever anchored and the state-free Mix was ignored would have violated none of
them, and would have shipped on *"not worse than baseline"*. That is the defect this section
exists to close.

##### 8.3.1 Required behavioural outcomes

**A required behaviour must appear in every run of the fixtures named. A prohibited behaviour must
appear in no run of any fixture.** The asymmetry in wording is deliberate and the standard is the
same one the strategy sets for violations: a required behaviour missing from one run in five is
missing at a rate users will meet.

| AC | Required evidence | Fixtures it must appear in | Passes when |
| --- | --- | --- | --- |
| **1** | A single film leads, is **named** as the lead, and is followed by two or three alternative directions, each introduced by the condition under which it wins | every fixture that produces a recommendation — including the **ordinary failure** fallback, which still recommends | every such run |
| **2** | The state-free Mix visibly shapes the answer: its instruction or its idea is used, and the language about **fit** is more tentative than the language about **intent** | **new Mix, no Movie states** | every run |
| **3a** | Taste evidence informs an **ordinary** request: the answer draws on something in the model without being asked to | **state-rich**, **new Mix**, **exclusion — plain request** | every run |
| **3b** | A Mix exclusion **binds** the taste-explicit request, and **does not bind and is not mentioned** in the unrelated plain request | **the exclusion pair**, both halves | every run of both halves |
| **4** | No film carrying a state is offered as new, in a fixture that gave the model a real opportunity to do so — see the construction rule below | **state-rich**, **contradictory** | no run offers one; and the opportunity exists |
| **5** | Every expansion recommendation names something the user positively likes as its anchor | **state-rich**, **empty** | every expansion in every run |
| **6a** | The taste-explicit failure run **stops**, reports the failure in the tool's own words, and offers to retry | **failure, taste-explicit** | every run |
| **6b** | The ordinary failure run **discloses in its first sentence**, recommends in the shape of AC1, makes **no** personal claim, and offers to retry | **failure, ordinary** | every run |

**The construction rule for AC4.** A prohibition is only verified if the fixture gave the model a
chance to break it. The **state-rich** and **contradictory** fixtures must therefore contain
stated films that are plausible leads for the prompts used — a film the model would naturally
reach for, marked `loved` or `seen`. A fixture in which no stated film is a candidate satisfies
AC4 trivially and does not verify it. The same reasoning applies to AC5's anchor requirement: the
**empty** fixture is included precisely because it is the case where an unanchored expansion is
most tempting.

**AC1 in the ordinary failure branch.** The fallback still recommends, so it still owes the
approved shape. A disclosed, unpersonalised answer that degenerates into a list is a failure of
AC1, not an exemption from it.

##### 8.3.2 The comparative quality threshold

The paired blind comparison against the Step 1 baseline remains, unchanged in method, as an
**additional** gate. It blocks shipping when:

1. The new instructions score **worse than the baseline on fit**, or
2. worse than the baseline on **constraint compliance**, or
3. any of the following prohibited outcomes appears in **any** run:
   - a taste attributed to the user that they never expressed (**false personalization**);
   - an availability, release or cultural claim made without support (**unsupported claims**);
   - the exclusion applied as a global filter (also an AC3b failure);
   - a film carrying a state presented as new (also an AC4 failure).

A regression on **decisiveness** or **discovery quality** is a finding to fix by returning to the
owning step — it is not, on its own, a comparative stop, because those are the dimensions Phase 1
is trying to move and the baseline is expected to lose on them.

**Review checkpoint.** Was the scoring genuinely blind — outputs shuffled and unlabelled? Were the
runs repeated? Does the matrix in §8.1 have a result in every row, and does **every row of §8.3.1
have a pass**? Did the exclusion pair behave in opposite directions? Did the state-free Mix
demonstrably shape its answer? Were both failure fixtures run, and did the ordinary branch keep
the approved shape while making no personal claim? Do the AC4 and AC5 fixtures actually create the
opportunity the construction rule requires?

**Stop condition.** Phase 1 does not ship unless **both** halves of §8.3 are satisfied. Concretely,
it stops when:

1. **Any row of §8.3.1 fails or has no result** — a required behaviour that is absent is a failed
   criterion, not a neutral outcome.
2. Any prohibited outcome of §8.3.2 appears in any run.
3. The new instructions score worse than the baseline on fit or on constraint compliance.
4. A fixture for AC4 or AC5 does not meet the construction rule, so its pass is untested rather
   than earned.

A stop here returns the work to whichever of Steps 4, 5 or 6 owns the rule that failed. After any
correction, §8.2 applies: the whole of Step 8 is run again, both halves of the gate included.

---

## 5. Risks and mitigations

Ordered by what would cost most if it happened.

| Risk | Mitigation |
| --- | --- |
| **An unsafe intermediate state.** A mandatory `get_taste` ships before its fallback, and an outage takes down every recommendation | The invariant in §4.1, the step order it produces, and Step 6's opening condition. Rollback order in §7 protects the same property in reverse |
| **An exclusion becomes a permanent filter.** The most expensive semantic failure available in Phase 1 | The fixture **pair** in Step 1: one model, two requests, opposite expectations. Step 8 stop condition 1 |
| **False personalization.** A taste attributed to somebody who never expressed it | Its own rubric criterion, scored separately from unsupported claims because a user is far less able to catch it. Step 8 stop condition 2 |
| **Configuration drift.** P3 loosens the boundary; a film request turns into a model session | The guard sentence is carried over **verbatim** and is an explicit Step 6 review point and stop condition |
| **Budget regression.** Overrun truncates silently — nothing errors, and the missing half is invisible | Guard stays at 7,900; Step 7 is a hard gate; the only remedy is tightening wording, and exhausting it stops Phase 1 rather than shrinking it (§1.2) |
| **Two sources for one rule.** A relocated rule drifts between its two homes | Steps 2 and 3 are separate, and Step 3 adds an assertion that the relocated sentences are gone from the skill |
| **A rule lost in relocation or rollback.** Present in neither home, and nothing fails | Step 3's row-by-row walk of the §2.3 table, its stop condition, and the reverse-order rollback rule in §7 |
| **A rule hidden behind a `full:` marker.** It never reaches a ChatGPT project and no test notices | `instructions.test.ts:367` is built for this; every new Phase 1 rule gets an entry in it |
| **Nondeterminism.** A violation appears in one run of five and is dismissed as noise | Repeated runs are part of the method, and one violation in five counts as a violation |
| **A repair that quietly breaks something else.** A fix for one fixture regresses another | §8.2: any correction invalidates the evaluation and requires a complete re-run |
| **Tool-description growth.** More text per session, and a host might truncate | +800 on ≈5,187 is not near any limit; no length assertion exists; `tools.test.ts:310` (eleven tools) stays green |
| **Backward compatibility.** Somebody has already pasted the old instructions | Nothing breaks: the MCP schema and answers are unchanged, and old and new instructions call the same tools. The regenerated version digest beside the copy button is the intended signal; nothing reaches into anybody's project |

---

## 6. Acceptance criteria, and where each is decided

From `recommendation-strategy.md` §10, Phase 1.

| # | Criterion | Pinned as text in | Decided in |
| --- | --- | --- | --- |
| 1 | One lead, named as such, plus two or three directions | Step 4 | Step 8 |
| 2 | A state-free Mix shapes the answer; fit is hedged more than intent | Step 6 | Step 8 |
| 3 | An exclusion binds a taste-explicit request and not an unrelated plain one | Step 6 | Step 8 |
| 4 | No film carrying a state is presented as new | Step 4 | Step 8 |
| 5 | Every expansion carries a positive anchor | Step 4 | Step 8 |
| 6 | Both `get_taste` failure branches behave as specified | Step 5 | Step 8 |
| 7 | The generated instructions stay under the 7,900 guard | — | **Step 7** |

Criterion 7 is the only one a deterministic test settles. That asymmetry is the point of §1.1, and
§8.1 is what makes the other six actually reachable.

---

## 7. Rollback

Every step is revertable on its own, with two ordering constraints that are not optional.

> **Revert in reverse merge order.** A rollback that skips a step, or takes them out of order, can
> recreate exactly the states the forward order exists to avoid.

**Steps 2 and 3 — reverse order, always.**

| | State of the relocated rules |
| --- | --- |
| After Step 2 | in the skill **and** in the tool descriptions — safe, temporarily duplicated |
| After Step 3 | in the tool descriptions only — the intended end state |
| Revert 3, then 2 | back in the skill, then out of the descriptions — **safe at every moment** |
| Revert 2 first, while 3 stands | **in neither place.** The rules are gone from the agent entirely, every contract test still passes, and nothing says so |

The last row is the failure the two-step split exists to prevent, and it is just as reachable
backwards as forwards. Reverting Step 2 while Step 3 stands is prohibited.

**Steps 5 and 6 — reverse order, for the same reason as §4.1.**

Reverting Step 5 while Step 6 stands leaves a mandatory `get_taste` with no fallback — the unsafe
intermediate state, arrived at from the other direction. If both are being backed out, revert
Step 6 first.

**Steps 1, 4, 7 and 8** carry no ordering constraint of their own beyond reverse merge order.
Reverting Step 1 discards the baseline and therefore the ability to run Step 8; if that happens,
Step 1 is redone before any further prompt change, since a baseline captured against modified
instructions is not a baseline.

---

## 8. Verification outside the test suites

Phase 1 changes no user interface, and no browser scenario is invented for it. What is worth
checking in a browser is the pipeline that produces the artefact:

1. `/setup` shows the **new** `PROJECT_INSTRUCTIONS_VERSION` beside the copy button.
2. The copy button hands over the complete new text, and its last line carries the same version.
3. That version line is the migration path for anybody holding an older paste — they can see that
   theirs is old, which is the most a pasted copy can offer.

Everything else is Step 8, in a real MCP host, against real tools.

---

## 9. What changed in revision 2

Four engineering defects, all found in review of revision 1. None of them is a change to the
approved product specification, and no step's objective, files, tests or review checkpoint changed
except as listed here.

1. **An unsafe intermediate state in the step order.** Revision 1 made `get_taste` mandatory in
   Step 5 and added the fallback in Step 6, leaving a window in which an outage would have taken
   down every recommendation, including the plain ones that need no taste data. **Steps 5 and 6
   are swapped**, the reason is stated as an invariant in §4.1, Step 6 now opens only once Step 5
   is merged, and §7 protects the same property during a rollback. This is the only change to the
   sequence.
2. **An incomplete acceptance gate.** Revision 1 had six fixtures and no way to verify AC6
   behaviourally. §8.1 adds **two failure fixtures** — taste-explicit and ordinary — produced by
   configuration rather than by touching product code, and adds a matrix that maps every
   acceptance criterion to at least one fixture and its criteria. §8.2 adds the rule that **any
   prompt correction after evaluation requires a complete re-run**, because instruction text has
   no local effects. Step 8's stop conditions gain the failure branches and an empty matrix row.
3. **Stop conditions that authorised shipping a weakened Phase 1.** Three of them did: Step 4's
   budget ladder, Step 7's *"ships without whichever rule is cheapest to lose"*, and Step 5's
   *"do not ship the fallback: fall back to stopping in both cases"*. All three are removed. §1.2
   states the governing rule — Phase 1 ships whole or stops — and draws the line the ladder had
   blurred: **tightening the wording of a rule that still ships is editing; removing a rule is a
   change to an approved specification and is outside this document's authority.**
4. **Rollback was unstated.** §7 is new. Steps 2 and 3 must be reverted in reverse order, with the
   table showing why the forbidden order leaves the relocated rules in neither home while every
   test still passes; Steps 5 and 6 carry the same constraint for the reason in §4.1.

### 9.1 Revision 3 — the Step 8 shipping gate

One defect, in Step 8 and nowhere else.

**The shipping conditions did not require Phase 1's new behaviours to occur.** Revision 2 mapped
fixtures to AC1–AC6 in §8.1, but every shipping condition beneath it was a prohibition — *"does
not ship if X appears"* — plus a comparison against the baseline. An evaluation in which no film
ever led, no expansion was ever anchored, and the state-free Mix was ignored would have violated
none of those conditions, and *"not worse than baseline"* would have let it ship. A comparison
cannot detect a required behaviour that is absent from both sides of it.

**§8.3 is new** and states the gate as a conjunction: Phase 1 may ship only if every required
AC1–AC6 outcome passes **and** the paired evaluation meets the comparative threshold. §8.3.1 is
the required positive evidence, per criterion, per fixture, with the standard that a required
behaviour must appear in **every** run just as a prohibited one must appear in none. §8.3.2 keeps
the paired comparison and the prohibited outcomes, explicitly as an **additional** gate rather
than a substitute. Two consequences were drawn out while writing it: the ordinary failure branch
still owes the AC1 shape, and a prohibition such as AC4 is only verified if the fixture gave the
model a real opportunity to break it — otherwise it passes trivially.

Step 8's review checkpoint and stop condition were rewritten to point at §8.3. **No other step,
no acceptance criterion, no fixture, no budget figure and no file in §3 changed.**
