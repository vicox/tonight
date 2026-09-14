# The request set

One line each, said the way somebody says them. A prompt is identified by its id, and each
fixture names the prompts it is run with.

Nothing here mentions Tonight, Genres, Mixes or the taste model — except where the request is
*about* the model, which is what `taste-explicit` and `taste-explicit-named-mix` are for. A prompt
that explains the product to the agent is not a prompt a user would say.

| id | Said | Used by |
| --- | --- | --- |
| `plain` | *"What should I watch tonight?"* | 01, 02, 03, 04, 08 |
| `constrained` | *"Something funny, and under two hours."* | 01 |
| `taste-explicit` | *"Based on my taste, what would I like?"* | 02, 03, 04, 07 |
| `taste-explicit-named-mix` | *"Something for a Quiet Dread night."* | 05 |
| `unrelated-plain` | *"Tonight I want something really gruesome — proper nasty horror, the more brutal the better."* | 06 |

## Why these five

`plain` is the product's central question and the one every acceptance criterion about the shape
of an answer is decided on.

`constrained` exists so the empty-model fixture is asked something with a constraint in it: an
answer to *"under two hours"* that is not under two hours is a constraint-compliance failure with
nothing to do with taste.

`taste-explicit` is the request that makes exclusions bind. It is deliberately not a named Mix, so
that the agent has to decide what in the model is relevant.

`taste-explicit-named-mix` names the Mix that carries the exclusion. This is the half of the
AC3 pair where the exclusion must bind.

`unrelated-plain` is the other half, and it is the most important prompt in the set. It asks for
**exactly what the stored exclusion rules out** — *"nothing gory, and nothing with torture in
it"* — in a context that exclusion has nothing to do with.

That collision is the whole design. Asked for a comedy, the prompt could prove nothing: a comedy
recommendation contains no gore whether the exclusion bound or not, so a silent global filter and
correct non-binding produce the same answer and the run cannot tell them apart. Asked for gore,
they produce different answers:

| | The answer looks like |
| --- | --- |
| **Correctly not binding** | brutal horror, by name, no hedging, no mention of the exclusion or of `Quiet Dread` — and taste evidence still informs it |
| **Silently a global filter** | something softer than was asked for, a caveat, a refusal, or a reference to what they said they did not want |

Tonight's own words bind absolutely, and tonight's words ask for gore. The exclusion was written
for `Quiet Dread` evenings; it is not a rule over every evening.

## Not evaluated in Phase 1

**Follow-up turns.** Refining a recommendation across several turns is Phase 5 of the strategy,
and no acceptance criterion of Phase 1 depends on it. Every prompt here is a first turn, and the
run ends with the agent's first complete answer.

**Anything needing a film or search tool.** Where the host has such tools their answers are
recorded as part of the transcript, but no criterion in the Phase 1 rubric requires one. The
*unsupported claims* criterion is about claims made **without** evidence, which is testable with
no tool present at all — and is in fact easier to fail that way.
