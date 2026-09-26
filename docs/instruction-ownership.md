# Instruction ownership

**Put each instruction at the narrowest layer responsible for the decision it governs.**

Tonight tells a model what to do from four places. Which one a rule goes in is decided when the
rule is written, and it follows from who owns the decision — never from how much room is left.

| Layer | Carries | Because |
| --- | --- | --- |
| **Skill**, and its projections | semantics and behavioural invariants applied generally, independent of any one call | they have to hold while reading, recommending and writing alike |
| **Tool description or argument** | guidance that matters because *this* operation is about to happen | it is read at the moment the decision is made |
| **Store and model code** | what can be decided mechanically | a rule a machine can check is not one anybody should have to remember |
| **Full-skill and in-file prose** | reasoning, worked cases, maintenance context | a maintainer needs the why; a runtime does not |

## A worked example

The Vibe coherence rule, split across all four.

*A Vibe's name, its instruction and the instructions of its Genres are one idea* is a fact about
the object — as true when reading one as when writing one — so it is in the skill. *Read the
Genres' instructions before you write the sentence* is advice to somebody mid-write, so it is
`create_vibe`'s; *replacing the Genres changes what the Vibe means* is `update_vibe`'s, for the
same reason. *A Vibe has at least one Genre, and each must exist* is checkable, so the store
decides it and the tools state it as a precondition rather than asking for judgement. The
reasoning, and the case that shows the rule failing, are full-skill only.

Nothing about that split is particular to Vibes. The same four questions are asked of a rule
about Movies, Episodes, Verdicts, recommendation behaviour, or anything added later.

## What follows

- **One authoritative home**, plus only the cross-layer sentence the model needs to stay
  coherent. Do not repeat a rule in a broader layer for visibility — two copies drift, and the
  broader one gets read as the real one.
- **Never weaken an unrelated invariant to make room for a misplaced one.** A rule that will not
  fit is usually in the wrong layer rather than too long.
- **Semantic judgement is not deterministic validation.** That persistence is involved is no
  reason to move a judgement into the store: it will accept what it cannot check, and should.
  Moving one there produces a validator that is wrong in both directions.
- **This is not a token budget.** Given unlimited instruction space, operation-specific guidance
  would still belong with the operation, and a semantic fact needed away from a tool would still
  belong in the skill. Placement follows ownership of the decision, never size.

The failure this exists to prevent is the reverse reasoning: *the skill is full, so this rule
goes in a tool description.* That produces a correct-looking result for the wrong reason, and the
next rule — the one that genuinely was universal — gets misplaced by the same argument.
