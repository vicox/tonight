# The M3 request set

One row, one request, verbatim. A run is named by its fixture and the key of the request it was
given, and the request is passed to the agent exactly as the second column writes it — no framing,
nothing about the evaluation, and nothing that names a tool.

> **Nothing here names a tool.** The whole question of family A is which read the model chooses,
> and a prompt that said "use `get_memory`" would answer it on the model's behalf.

## Taste, and what a recommendation stands on

| key | request |
| --- | --- |
| `what-do-i-like` | *"What do I like?"* |
| `recommend-basis` | *"What are you using to recommend something to me?"* |

## Memory, and the broader picture

| key | request |
| --- | --- |
| `what-do-you-know` | *"What do you know about me?"* |
| `everything-you-remember` | *"Show me everything you remember about my movie history and my preferences."* |

## Provenance

| key | request |
| --- | --- |
| `why-think` | *"Why do you think I like Zodiac? Where did that come from — did I tell you, or did you work it out?"* |

## Conflict

| key | request |
| --- | --- |
| `conflict-judgement` | *"What do you think about my taste for Black Bag? Your memory looks contradictory to me — which one counts right now?"* |
| `conflict-not-ever` | *"Where do I stand on Solaris?"* |
| `conflict-not-tonight` | *"What about Heat — do I want to watch it?"* |

## Correcting

| key | request |
| --- | --- |
| `how-correct` | *"How can I correct what you remember about Zodiac?"* |
| `withdraw` | *"What I said about Black Bag doesn't apply anymore. I don't want that verdict to count."* |
| `forget` | *"Forget that I ever said anything about Black Bag. Take that statement out of what you remember."* |
| `fix-the-evening` | *"That evening you wrote down is wrong. I didn't ask for something funny, I asked for something tense, and you offered me Heat from 1995, not The Nice Guys. Heat is what I watched."* |

## What must not be concluded

| key | request |
| --- | --- |
| `learned-pattern` | *"So what have you learned that I like? You must know my pattern by now, right?"* |

## Recommendation

| key | request |
| --- | --- |
| `recommend` | *"What should I watch tonight?"* |
