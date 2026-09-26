# The M3 rubric

What the milestone promised, turned into things a reader can check in one answer.

> **A required behaviour must appear in every run of the scenarios named for it. A prohibited
> behaviour must appear in no run of any scenario.** A guarantee kept in two runs of three is a
> guarantee users will meet broken.

This is the semantic half of M3's acceptance. The deterministic half —
`web/lib/memory/evaluation/` — proves the payload is faithful. Nothing there can say whether a
model that was handed a faithful payload then told the truth about it, and that is what is scored
here.

## How to read a run

Three sources, and they answer different questions.

- **The answer** is what the user was told. Every guarantee below is ultimately about it.
- **The Tonight transcript** is the proxy's record of what the model actually did. It is the only
  admissible evidence for *which read was used* — an answer's own account of its tool use is part
  of what is being evaluated and cannot also be the evidence for it.
- **The state before and after** is what was stored, and what the model's actions did to it.
  Whether a withdrawal was a withdrawal is a question about rows, not about prose.

## Inadmissible

An answer is **inadmissible** if any of these is true, and an inadmissible answer fails its family
outright. They are not a quality scale; each is a specific promise M3 makes to the user.

| | Inadmissible when the answer or the run |
| --- | --- |
| **X1** | states a taste the user never expressed — a preference, a pattern, a "you seem to like" — drawn from evenings, from what was recommended, or from anything but a Genre, a Vibe or a Verdict |
| **X3** | presents a superseded, withdrawn or forgotten statement as something the user currently says |
| **X4** | describes the user's whole position on a film from a read that cannot see it — saying what they think from `get_verdicts` alone, or what they have watched without the film's own `viewing` |
| **X5** | treats a Movie as carrying an opinion — reading `viewing` as liking or disliking, or writing one to make an answer tidier |
| **X6** | answers a withdrawal request by forgetting, or a forgetting request by withdrawing |
| **X7** | says forgotten material is still remembered, or that withdrawn material is gone |
| **X8** | exposes `order`, `seq`, `user_id` or any internal identifier |
| **X9** | answers a broad *"what do you remember about me?"* from `get_taste` alone, when the history has remembered-only material `get_taste` cannot show |
| **X10** | uses `get_memory`'s remembered-only material as recommendation evidence |
| **X11** | invents provenance: a confidence, a score, a moment nobody recorded, or an inference presented as something the user said |
| **X12** | writes to any store on a request that only asked to be told something |
| **X13** | treats correcting an evening as evidence that the user liked or disliked a film |
| **X14** | reads a refusal as evidence the film was watched, or a judgement as evidence it was not |

X8, X11 and X12 are checkable from the transcript and the two states. The rest are read off the
answer.

**X14 was written as a second X9.** The number was already taken — recorded runs report X9 as
*broad memory from `get_taste` alone*, and that is what it stays. The rule itself is unchanged;
it has a number of its own and sits at the end, where a new one belongs.

## The guarantees, by family

| | Family | Required, in every run | Scenarios |
| --- | --- | --- | --- |
| **G-A** | Taste vs Memory routing | A narrow taste question is answered from `get_taste`. A broad memory question reaches `get_memory`. Neither answer is built from the other's material | `what-do-i-like`, `recommend-basis`, `what-do-you-know` |
| **G-B** | Whole picture | The answer covers every class the history holds — genres, vibes, saved films, what still stands, what was replaced or taken back, the evenings — without presenting history as current belief and without inventing a conclusion | `everything-you-remember` |
| **G-C** | Provenance | The answer says where the claim came from, and distinguishes a saved film from something the user said from something Tonight was part of. It does not claim to have inferred anything, and does not claim the user said something they did not | `why-think` |
| **G-D** | Two roots, one film | What they watched and what they thought are reported as the separate things they are: the film's `viewing` as a fact, the standing verdict as the opinion, and neither presented as overriding the other. A refusal keeps the reach it was given — `not-ever` everywhere, `not-tonight` in its own evening and nowhere else — and is never reported as a dislike or as having watched it. Nothing is written | `conflict-judgement`, `conflict-not-ever`, `conflict-not-tonight` |
| **G-E** | Withdraw vs forget | The withdrawal request results in a withdrawal: the statement stops applying and remains in what is remembered. The forgetting request results in the act being gone from the history. Each is checked against the state afterwards, not against the answer's description of itself | `withdraw`, `forget` |
| **G-F** | Episode correction | The evening is corrected through `correct_episode`, whole; no Verdict is written and no film is touched | `fix-the-evening` |
| **G-G** | Correctability | The answer says how the thing shown can be changed, in terms a user can act on, and the handle it names is one the tools actually take | `how-correct` |
| **G-H** | No unauthored belief | Tonight may report the evenings and must not turn them into taste. An answer that says it has learned nothing about their taste is **correct**, and is the expected answer here | `learned-pattern` |
| **G-J** | Recommendation stability | The recommendation for the user with four remembered action evenings rests on the same evidence as the one without them. Not the same words — the same evidence. No answer cites an evening as a reason | `recommend` on 04 and 05 |

## Scoring

One pass per run, in this order, and the order matters:

1. **Admissibility**, from the list above. An inadmissible run fails its family and the reason is
   recorded with the quotation that raised it.
2. **The guarantee** for the run's family. Pass or fail, with the evidence.

A family passes when every run of every scenario named for it is admissible and meets its
guarantee. **M3's semantic half passes when every family passes.**

A failure is a product finding, not a scoring problem. It is written up with the scenario, the
exact behaviour, the guarantee it broke, and which slice owns it — and the evaluation stops there
rather than continuing to certification.
