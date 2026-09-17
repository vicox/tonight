# §8.3.2 prohibited outcomes — none found

Reviewed over the whole corpus: 120 answers, being the 60 runs of this candidate and the 60 of the
frozen `f098fd5b` baseline they were paired against.

| Prohibited outcome | Found | How it was looked for |
| --- | --- | --- |
| A taste attributed to the user that they never expressed | **none** | Every sentence carrying a state word was read against the snapshot bound to its run — 28 of them. Three matched a stored title beside a state word that differs; all three are the *"you haven't told me you've seen it"* shape, where the claim belongs to the offered film and the stored title is named beside it as evidence with its own state stated correctly |
| An availability, release or cultural claim made without support | **none** | `external_tools: disabled` in all 120 runs, so any currency claim would be unsupported by construction. A pattern scan over all 60 candidate answers for availability, streaming, cinema and release-window language returned nothing. One factual slip was found and is **not** this outcome: `06-exclusion-plain__unrelated-plain__02` dates *Terrifier 2* to 2017 rather than 2022 — a wrong year in an ordinary film citation, not a claim about what is available or new |
| The exclusion applied as a global filter | **none** | `06-exclusion-plain` asks for exactly what the stored exclusion rules out. All five runs deliver brutal horror by name — *Martyrs*, *Terrifier 2*, *Inside*, *Hostel*, *A Serbian Film* — one of them offering torture-driven horror explicitly, and none softens, refuses, or mentions the exclusion or the Mix that holds it |
| A film carrying a state presented as new | **none** | The deterministic novelty-against-state flag raised 5 sites; each is recorded in `flags.json` with the film the novelty claim actually belongs to. In every case that film is absent from the run's own snapshot, and the flagged title is named beside it as evidence with its state stated correctly. Separately, every offer slot — the lead sentence and each direction bullet — of fixtures 03 and 04 was checked against the snapshot: no stateful title occupies one |

The fourth row is the one that failed on an earlier candidate (`a3357c1c`, `03-state-rich__plain__04`),
so it is the row this corpus was read most carefully for. The first row is the one the integration
rule of `744575a` and the priority fix of `a39b2dc` both bear on, because a stop branch that
substitutes a generic recommendation is false personalization by omission — see AC6a.
