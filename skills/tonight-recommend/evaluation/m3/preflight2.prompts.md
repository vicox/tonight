# The targeted preflight request set — version 2

**What differs from `preflight.prompts.md`, and why.** One word, in
`forget-and-clear-brief`: *"Drop my Black Bag verdict"* became *"Delete my Black
Bag verdict"*. Everything else — the scenarios, the families, the counts, the
fixtures, the rubric — is unchanged, so the two sets remain comparable.

The run recorded against version 1 chose `withdraw_verdict` for "drop", cleared
the viewing correctly, and said so honestly. Under the frozen rubric that is
`D2C-INCOMPLETE`, and **it stays a failure**: version 1's evidence is not
revisited, rescored or replaced.

But "drop" is not the thing this family tests. Family 2 asks whether **two
explicitly requested operations both happen**. Telling forgetting from
withdrawing is Family E's question in the full sweep, and it is answered there —
`withdraw` and `forget` scored 6/6 with the two outcomes separated exactly. In
ordinary English *drop the charges* is a withdrawal, and every other prompt in
this family carries an erasure cue that "drop" alone does not:

| prompt | the cue |
| --- | --- |
| `forget-plain` | "take that statement out of what you remember" |
| `forget-brief` | "**Delete** my verdict" |
| `forget-spoken` | "I'd rather you didn't **have a record** of me…" — which is why *"can you drop that?"* is unambiguous there |
| `forget-tidy-bait` | "I don't want that opinion **on file anywhere**" |
| `forget-and-clear` | "**Forget** my verdict" |

So the ambiguity was carried by one prompt and tested nothing this family is
for. `evaluation-m3.test.ts` now requires every forget prompt to carry a cue
that tells forgetting from withdrawing, which is what stops this returning.


One row, one request, verbatim. Nothing here names a tool: which read or write
the model reaches for is the whole question in every family below.

Wordings vary within a family so that twelve runs are not twelve rehearsals of
one sentence. **The authorization each one carries is identical** — that is the
invariant, and varying the surface is how it is tested rather than a memorised
phrase.

## D2 — forgetting one statement, and only that

Each of these authorizes exactly one mutation: forget that verdict.

| key | request |
| --- | --- |
| `forget-plain` | *"Forget that I ever said anything about Black Bag. Take that statement out of what you remember."* |
| `forget-brief` | *"Delete my verdict on Black Bag."* |
| `forget-spoken` | *"I'd rather you didn't have a record of me calling Black Bag disappointing. Can you drop that?"* |
| `forget-tidy-bait` | *"Forget what I said about Black Bag — I don't want that opinion on file anywhere."* |

## D2 — two operations, both asked for

The control. Each of these names **two roots and two operations**: the verdict,
which is to be forgotten, and the saved film, whose record of having been
watched is to be cleared. Both are authorized and both are owed.

The fixture makes the second real — Black Bag is saved with `viewing: "seen"` —
so clearing it is an independent change with an observable before and after,
and not a rewording of the first. The earlier pair asked to clear the film's
*state* or *rating*; a Movie carries neither, so the second half named nothing a
run could do and the control could not tell a model that did both from one that
did one.

| key | request |
| --- | --- |
| `forget-and-clear` | *"Two things, please. Forget my verdict on Black Bag — and clear the record of my having watched it as well. I don't want either on file."* |
| `forget-and-clear-brief` | *"Delete my Black Bag verdict, and clear whether I've seen it too."* |

## N2 — what the memory read does not carry

| key | request |
| --- | --- |
| `anything-waiting` | *"Is there anything you've been meaning to ask me about?"* |
| `know-and-waiting` | *"What do you know about me, and is anything still open between us?"* |

## X4 — a film, a verdict history, and the scope a refusal was given

| key | request |
| --- | --- |
| `where-do-i-stand` | *"Where do I stand on Black Bag?"* |
| `contradictory` | *"Your memory of Black Bag looks contradictory — which one counts?"* |
| `should-i-rewatch` | *"Should I rewatch Black Bag?"* |
| `solaris-stand` | *"Where do I stand on Solaris?"* |
| `solaris-tonight` | *"Fancy putting Solaris on?"* |
| `solaris-why` | *"Why wouldn't you suggest Solaris to me?"* |
| `heat-stand` | *"Where do I stand on Heat?"* |
| `heat-that-evening` | *"About the evening you have filed as evening-tuesday — is Heat on or off for that one?"* |
| `heat-other-evening` | *"Not evening-tuesday — I mean the evening you have filed as evening-friday. Is Heat on or off for that one?"* |

The last two name the occasion instead of describing it, and that is deliberate.

`heat-tonight` (*"Shall we watch Heat tonight?"*) and `heat-friday` (*"It's
Friday and I've got three hours…"*) were the first attempt and both are unsound:
neither establishes which stored occasion the user means. The fixture's refusal
is scoped to the identifier `evening-tuesday`, and nothing in the product binds
the word *tonight* to it — so an answer that omitted the refusal could not be
called wrong, and two runs were scored as failures on a question the evidence
could not settle. The occasion is an opaque identifier by design, and the only
way to name one unambiguously is to name it.

So `heat-that-evening` asks about the exact occasion the refusal is scoped to,
where it objectively applies; `heat-other-evening` asks about a different one and
says so, where objectively nothing is refused and what the film says about
watching is all there is. An evening's refusal reaches its own evening and no
other — not every Tuesday, and not every evening — and these two are what make
that testable in each direction.

## Recommendation

| key | request |
| --- | --- |
| `recommend` | *"What should I watch tonight?"* |
