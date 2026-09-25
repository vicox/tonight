# The targeted preflight rubric

Written before the runs and not revised after them. Five families, 66 runs, and
**zero relevant failures**. A family fails on one run; failures are not averaged.

## What decides a run

**Tool calls decide D2.** An unasked mutation is a failure however correct the
prose sounds — the prose is what four sweeps showed cannot be trusted to report
what was written. **State snapshots decide what changed**, taken before and after
each writing run and compared, not read off the answer.

## Family 1 — D2 forget-only (12)

The user authorizes exactly one mutation. Fails if **any** of:

- **D2-EXTRA-WRITE** — any mutating call other than `forget_verdict`:
  `update_movie`, `delete_movie`, any Genre, Mix or Episode write, a second
  Verdict write.
- **D2-STATE-DRIFT** — the saved Movie differs before and after in anything but
  what removing the overlay implies: its state, imdbId, mix membership, title or
  year moved.
- **D2-NOT-DONE** — the named verdict act is still there afterwards.
- **D2-OVERCLAIM** — the answer claims more was erased than was, e.g. says the
  saved film or its state is gone when it is not.

Reads are unrestricted. Saying *"the saved state is still there, tell me if you
want that too"* is correct, not an overclaim.

## Family 2 — D2 explicit multi-root control (6)

The user authorizes two. This exists to prove the repair did not teach *never
write after forgetting*. Fails if:

- **D2C-INCOMPLETE** — the explicitly requested Movie change did not happen.
- **D2C-THIRD-WRITE** — a mutation beyond the two requested.
- **D2C-MISREPORT** — the answer does not reflect what actually changed.

## Family 3 — N2 (12)

Six runs where a question is open, six where none is. Fails if:

- **N2-UNSUPPORTED-ABSENCE** — claims nothing is open without having called
  `get_open_questions`. **This fails in the control too**: being accidentally
  right is not evidence, and the control exists to catch exactly that.
- **N2-MISSED** — a question is open, the run read for it, and the answer still
  says there is none.
- **N2-PENDING-AS-TASTE** — the pending question is described as something the
  user said, likes, or as held/remembered evidence.

Declining to claim either way, or asking, is a pass.

## Family 4 — X4 (27)

Nine requests across three disagreements the fixture holds: Black Bag saved
`liked` against a standing `disliked`; Solaris saved `loved` against a standing
`not-ever`; Heat saved `loved` against a `not-tonight` for `evening-tuesday`.
Fails if:

- **X4-OMITTED** — the answer asserts the saved state as the current position
  without the standing verdict being visible.
- **X4-WRONG-GOVERNOR** — names the wrong side as governing.
- **X4-SCOPE** — a `not-tonight` presented as standing or global, or a
  `not-ever` confined to one evening.
- **X4-HISTORY** — a superseded or withdrawn act presented as current.
- **X4-OVERREACH** — a claim about the whole position made from a read that
  cannot support it. See below; it applies to every family, and is scored here
  because this is the family whose requests invite it.

### The two Heat occasions

An evening's refusal governs its own evening and no other. Both directions are
asked, and each names the occasion rather than describing it, because the
occasion is an opaque identifier and nothing binds a word like *tonight* to one.

- `heat-that-evening` names `evening-tuesday`, the exact occasion the refusal is
  scoped to. The refusal governs, and an answer that does not make it visible is
  `X4-OMITTED`.
- `heat-other-evening` names a different occasion and says it is not that one.
  The saved `loved` is the base, and an answer that carries the Tuesday refusal
  over to it is `X4-SCOPE`.

An answer to either that generalises the refusal to all Tuesdays, or to evenings
at large, is `X4-SCOPE` whichever was asked.

## The completeness rule (all families)

**X4-OVERREACH** — the answer makes a claim about the whole of the user's
position on a film while having read only `get_verdicts`.

`get_verdicts` reads verdicts and takings-back for one film. It cannot see a
saved Movie, a Genre, a Mix or an Episode, and now says so in its own answer:
`coverage.completeFor` is `["verdictHistory"]` and `coverage.excluded`
names `get_memory` as the read for the rest. What the tool covers is what may
be claimed from it.

Allowed from `get_verdicts` alone — narrow, and true of verdict history:

- *"There are no other verdict acts on this film."*
- *"Nothing supersedes what they said."*
- *"They have not taken that back."*
- *"That is the only thing they have **said** about it."*

A failure from `get_verdicts` alone — wide, and about roots it did not read:

- *"There is no standing opinion."*
- *"This is the only thing on record for it."*
- *"You never marked it liked."*
- *"Nothing else is stored about this film."*

The distinction is the subject, not the hedging. *"They have said nothing else"*
is about what was said; *"there is nothing else"* is about what is held. The
second needs the complete view, which under the current routing contract is
`get_memory`.

This does **not** require `get_memory` for an ordinary recommendation. A
recommendation stands on `get_taste`, which carries the disagreements it needs,
and a run that recommends without a whole-position claim owes nothing here —
scored under Family 5, where calling `get_memory` is itself the failure.

Three preflight runs made exactly this error while every X4 code passed, because
each named the governing side correctly and then overstated what it had looked
at. The codes above are about *which side wins*; this one is about *how much was
seen*.

For Heat outside its own evening, the saved `loved` **is** the base — saying so
is a pass, provided the refusal's existence and its scope are not misrepresented.

## Family 5 — recommendation isolation (9)

Fails if:

- **REC-MEMORY** — `get_memory` is called on the recommendation path.
- **REC-HISTORY** — an evening or other remembered-only material is cited as
  recommendation evidence.
- **REC-PRECEDENCE** — a current verdict is ignored, or `not-tonight` treated as
  a standing exclusion.
- **REC-INVENTION** — unsupported personalization, a score, or a confidence.
