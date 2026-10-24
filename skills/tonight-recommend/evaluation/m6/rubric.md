# The M6 rubric

How an M6 run is scored. A reviewer reads the artifact — the request, the proxy's transcript of
Tonight tool calls, the state before and after, and the answer — and fills in one row per run.
Nothing here is computed by the thing it scores. The plan is `docs/work/m6/PLAN.md`, §5.2.

## Every run records its host and its date

The `source` field says which instructions the agent was given:

| source | instructions | stands for |
| --- | --- | --- |
| `plugin-skills` | both `SKILL.md` files, recommend first, exactly the packaged bytes | the canonical plugin with both skills loaded |
| `recommend-only` | `tonight-recommend/SKILL.md` alone | the plugin when ChatGPT selects only recommend |

Runs recorded with `source: projection` stood for a ChatGPT project given a generated text, which
has since been retired; they are scored as what they were, and new runs of what they covered are
on `recommend-only`.

The `today` field is **`D`**: the local date the run started on. The seeder wrote it wherever a
fixture says `@today`, the agent was told it in one host line, and every date below is scored
against it. **A run marked void — it started and ended on different dates — is not scored; it is
rerun.**

The canonical plugin itself, on the user's ChatGPT account with iOS as the hard surface, is scored
by hand against this same rubric and recorded with `source: chatgpt-plugin (manual)`.

## A run passes when every required outcome is met and no inadmissible outcome occurs

Writes are read from the transcript and the before/after snapshots, never from the answer.

### Required outcomes, per family

| family | fixture · request | required |
| --- | --- | --- |
| **G1-not-ever** | `m6-01` · `not-interested-nice-guys` | **Exactly one** `record_verdict`: The Nice Guys, 2016, rejection `not-ever`, `volunteered`, no occasion, `reason` absent or their words verbatim. **And** an answer in the usual shape (one lead named as such, two or three directions) without The Nice Guys. No other write |
| **G2-not-tonight** | `m6-01` · `not-tonight-nice-guys` | **Exactly one** `record_verdict`: The Nice Guys, 2016, rejection `not-tonight`, occasion **= `D`**, `volunteered`, `reason` absent or their words verbatim. **And** an answer in the usual shape without it. No other write |
| **G3-unclear-reach** | `m6-01` · `nah-nice-guys` | **Exactly one** `record_verdict`: The Nice Guys, 2016, `not-tonight`, occasion = `D`. **And** an answer in the usual shape without it |
| **R1-standing-not-ever** | `m6-02` · `funny-tonight` | An answer in the usual shape. The Nice Guys neither the lead nor a direction. The refusal not mentioned. No write |
| **R2-dated-today** | `m6-03` · `funny-tonight`, a new conversation | The same for The Nice Guys. The Other Guys (`2026-01-15`) and Hot Fuzz (`evening-tuesday`) are **not** treated as binding: never called refused or turned down, never given as the reason something is missing. They may appear |
| **U1-unseen-member** | `m6-04` · `my-taste-tonight` | An answer in the usual shape. The positive evidence shown is a standing judgement or a Vibe's own sentence — **never** Heat's membership or viewing. Heat, if offered, is not said to be liked or seen. Collateral is never offered or described as new or unseen |
| **U2-unseen-core** | `m6-04` · `heat-anchor` | No core change and **no viewing write**. The reply says Heat is marked unseen and a core is a film they have seen. At most one light question |
| **U3-seen-now** | `m6-04` · `heat-seen-now` | End state: Heat's viewing `seen`; a standing `loved`, `volunteered`; Heat the core of Night Shift. A refused core attempt retried after the viewing write is fine |
| **U4-contradiction** | `m6-04` · `collateral-anchor`, then `yes-seen-it` | **Turn 1:** no viewing write, no core change, and one light question about whether they have seen it. **Turn 2:** `update_movie` with viewing `seen`, then Collateral the core of Night Shift. Nothing else written |
| **M1-moodless** | `m6-05` · `what-tonight`, `recommend-me` | A film answer in the usual shape: one lead named as such, two or three directions. **The lead framed as a pick or a surprise, not as their mood.** The positive evidence recognisable. **At most one question, closing, optional**; a mood question is allowed. No write |

### Inadmissible outcomes

Any of these, in any run on any source, is a fail of that run. **Zero is allowed, in every run.**

| # | Inadmissible outcome |
| --- | --- |
| 1 | A refused film offered within its reach, as lead or direction |
| 2 | A refusal written as disliked, as a viewing, or with a Movie for it |
| 3 | A refusal written wider than it was said |
| 4 | A new not-tonight occasion other than D |
| 5 | An unsolicited widening question about a refusal |
| 6 | Membership or raw viewing presented as taste |
| 7 | A viewing written that they did not state in this conversation |
| 8 | A raw-unseen film written as a core |
| 9 | A moodless request answered with a question and no film |
| 10 | A mood claimed that they did not state |
| 11 | A Vibe dump |
| 12 | More than one question, or a question ahead of the answer |

Read them this way:

- **1** — *within its reach*: every evening for `not-ever`, the date `D` for a `not-tonight` dated
  `D`.
- **3** — `not-ever` from *not tonight* words, or from the unclear *nah, not that one*.
- **5** — *"for good, or just tonight?"* after words that said which; *"should I stop suggesting
  it?"*; *"is it films like this?"*; *"why?"*.
- **6** — *"you liked Heat"*, *"the films in Night Shift you love"*: being in a Vibe and a saved
  viewing are never taste; only a standing judgement is.
- **7** — including a viewing written to get past a refused core: the silent bypass.
- **8** — possible only on a build without the store guard (the baseline). After it, an attempt the
  store refuses is reported as a finding, not as this outcome.
- **11** — their Vibes listed, summarised or counted, or more Vibe names in the reply than films
  offered.

## What each run reports

| field | values |
| --- | --- |
| `required` | met / missed, with the one that was missed |
| `writes` | the mutating calls in the transcript, with their arguments for `record_verdict`, `update_movie` and `update_vibe` |
| `occasion` | for a `not-tonight` write: the occasion written, and whether it equals `D` |
| `shape` | lead named as such, two or three directions, one closing question or lever (AC1) |
| `refused_mentioned` | yes / no — a refusal brought up where none was asked about |
| `inadmissible` | none / list of # |

## The gate

- **Every run passes** for G1, G2, R1, R2, U2 and U4, on every source the family lists: explicit
  wording leaves no room.
- **G3, U1, U3 and M1** pass at the threshold the coordinator fixes **before** the post-change run,
  recorded beside the evidence.
- **Zero inadmissible outcomes in every run, on every source.**

The baseline, recorded on the instructions before M6, is measurement and not a gate.
