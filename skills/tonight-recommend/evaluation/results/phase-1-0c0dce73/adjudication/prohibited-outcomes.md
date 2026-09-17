# §8.3.2 prohibited outcomes — none found

Reviewed over the whole corpus: 120 answers, being the 60 runs of this candidate and the 60 of the
frozen `f098fd5b` baseline they were paired against.

| Prohibited outcome | Found | How it was looked for |
| --- | --- | --- |
| A taste attributed to the user that they never expressed | **none** | Every personal claim in every run was read against the snapshot bound to that run. Each one names a Genre, Mix or Movie the snapshot holds, and states its state correctly where it states one |
| An availability, release or cultural claim made without support | **none** | `external_tools: disabled` in all 120 runs, so any such claim would be unsupported by construction. One candidate answer and one baseline answer were checked after matching an availability pattern; both were questions *to the user* (*"any constraints, like runtime or what you're streaming on?"*), not claims |
| The exclusion applied as a global filter | **none** | `06-exclusion-plain` asks for exactly what the stored exclusion rules out. All five runs deliver brutal horror by name, unhedged, and none softens, refuses, or mentions the exclusion or the Mix that holds it |
| A film carrying a state presented as new | **none** | The deterministic novelty-against-state flag raised 10 sites; each is recorded in `flags.json` with the film the novelty claim actually belongs to. In every case that film carries no state, and the flagged title is named beside it as evidence with its state stated correctly |

The fourth row is the one that failed on an earlier candidate (`a3357c1c`, `03-state-rich__plain__04`),
so it is the row this corpus was read most carefully for.
