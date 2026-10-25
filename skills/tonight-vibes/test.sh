#!/usr/bin/env bash
# Tonight vibes-skill contract tests.
#
#   ./test.sh
#
# Markdown *contract regression* tests, in the same form as tonight-recommend's:
# they catch deletion and edit of an explicit contract rule, not every sentence that
# could contradict one.
#
# The rules below are asserted against this file, which the canonical plugin ships
# byte for byte. There is no other rendering of it.
#
# Prints one line per check and exits non-zero if any of them fails.

set -u

SCRIPT_DIR="$(cd -P "$(dirname "$0")" && pwd -P)"
SKILL="$SCRIPT_DIR/SKILL.md"
SKILLS_DIR="$(cd -P "$SCRIPT_DIR/.." && pwd -P)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

check() {
    if [ "$2" = "$3" ]; then
        pass=$((pass + 1)); printf 'PASS  %s\n' "$1"
    else
        fail=$((fail + 1))
        printf 'FAIL  %s\n      got:    %s\n      wanted: %s\n' "$1" "$2" "$3"
    fi
}

# Every marker must appear, in the order given, in the whitespace-collapsed file.
cat > "$WORK/order.py" <<'PYEOF'
import os, re, sys
flat = re.sub(r"\s+", " ", open(os.environ["SKILL"], encoding="utf-8").read())
start = 0
for marker in sys.argv[1:]:
    index = flat.find(re.sub(r"\s+", " ", marker), start)
    if index < 0:
        print("OUT OF ORDER OR MISSING: %s" % marker)
        raise SystemExit
    start = index + 1
print(True)
PYEOF

order_check() { SKILL="$SKILL" python3 "$WORK/order.py" "$@"; }

echo "--- the second skill, and only the second ---"

check "recommend and vibes are the skills" \
    "$(ls -1 "$SKILLS_DIR" | sort | tr '\n' ' ')" "tonight-recommend tonight-vibes "
check "nothing points at the removed setup or manage skills" \
    "$(grep -ciE 'tonight-setup|tonight-manage' "$SKILL")" "0"

echo
echo "--- frontmatter ---"

check "the file opens with the YAML delimiter, no leading blank line" \
    "$(sed -n '1p' "$SKILL")" "---"
check "the name is the skill own name" \
    "$(sed -n '2p' "$SKILL")" "name: tonight-vibes"
check "there is a description, and the block closes on line 4" \
    "$(sed -n '3p' "$SKILL" | cut -c1-12)|$(sed -n '4p' "$SKILL")" "description:|---"
# Selection is ChatGPT's, over the name and this line. It has to reach the four ways
# into this skill, and it has to send a request for a film elsewhere: the split is by
# concern, never by intent, and recommend stays the entry point.
entry_points="$(sed -n '3p' "$SKILL" | grep -oiE 'film worked|kept|love|go through' \
    | tr '[:upper:]' '[:lower:]' | sort -u | tr '\n' ' ')"
check "the description is discoverable for verdicts, keeping, first films and going through" \
    "$entry_points" "film worked go through kept love "
check "and it does not claim a request for a film" \
    "$(sed -n '3p' "$SKILL" | grep -c 'Choosing a film to watch is not this skill')" "1"

echo
echo "--- plugin-only, and not a second copy of recommend ---"

check "nothing here is marked for a projection" \
    "$(grep -cE 'full:(start|end)|project:compact' "$SKILL")" "0"
# R3-1 of the M5 plan: how a Vibe is read is recommend's, so a conversation that only
# recommends keeps it. Restated here, the two would be free to drift apart.
check "the reading rule is recommend's and is not restated here" \
    "$(grep -ciE 'its own instruction plus the instructions of its Genres' "$SKILL")" "0"
check "there is still no setup" \
    "$(order_check 'There is still no setup')" "True"
check "and no onboarding vocabulary" \
    "$(grep -ciE 'onboarding|starter set|starter definition|first-run setup' "$SKILL")" "0"

echo
echo "--- two rules that hold everywhere ---"

check "noticing is free, writing needs a yes, and a no leaves nothing" \
    "$(order_check '**Noticing is free; writing needs a yes.**' \
        'nothing is written' 'until they agree' \
        'no pending offer, no' 'note that you asked, no record that they declined')" "True"
check "their words, never yours" \
    "$(order_check '**Their words, never yours.**' \
        'Nothing you concluded becomes either')" "True"

echo
echo "--- a Vibe and its core ---"

check "a Vibe is a name, an instruction, Genres, exactly one core and further films" \
    "$(order_check 'A Vibe is a **name**, an **instruction**, one or more **Genres**, exactly one **core** film')" "True"
check "the core is a member, replaced but never cleared, and the old one stays" \
    "$(order_check 'It is always one of its films' \
        'the film it replaces stays in the Vibe' 'and it is never cleared')" "True"
check "membership carries no opinion" \
    "$(order_check 'Being in a Vibe carries' 'no opinion')" "True"
check "a Vibe from before cores is complete and anchored only by choice" \
    "$(order_check 'reads `core: null`' 'complete and usable as it is' \
        'anchored only when somebody chooses its core')" "True"
check "what may be a core" \
    "$(order_check 'A film **they have seen and stand behind**' \
        'a standing `liked` or `loved`' 'or one they' 'name themselves')" "True"
check "and what never may" \
    "$(order_check 'Never a film you offered only as an illustration' \
        'never' 'one they said they have not seen' 'disliked or do not want recommended')" "True"
check "nothing in Tonight checks it, so the choice is yours" \
    "$(order_check 'nothing in Tonight checks it' 'choosing' 'the right one is yours')" "True"
check "one film anchoring two Vibes is allowed and worth noticing" \
    "$(order_check 'One film may anchor two Vibes' 'one evening described twice')" "True"

echo
echo "--- one idea, said three ways ---"

check "constructing a vibe means reading the genres own instructions, not their names" \
    "$(order_check 'instructions** — not their names, which
are labels and say almost nothing' \
        '`Slapstick` under `Quiet Dread` looks defensible until you
read what Slapstick means to this person')" "True"
check "the vibe's sentence must add meaning and contradict none" \
    "$(order_check 'must **add** what the Genres do not say and **contradict** nothing they do' \
        'a sentence that only restates the
Genres has added nothing' \
        'one that goes against them has made the Genres wrong')" "True"
check "coherent is not derived" \
    "$(order_check '**Coherent is not derived.**' \
        'The Genres hold the idea in place; they never produce it' \
        'can
these three be one thing a person meant?')" "True"
# The store holds a Vibe to one Genre or more and checks nothing else; which ones and
# how many is a judgement, stated once here and pointed at from the keep flow.
check "their Genres are read by instruction and reused before any is created" \
    "$(order_check '**Which Genres, and how many.**' 'Start from the Genres they already have' \
        "read each one's instruction and reuse the ones that genuinely hold part of the idea" \
        'Create a Genre only for a part none of theirs covers')" "True"
check "a new Genre is part of the offer, because a yes covers only what was shown" \
    "$(order_check 'a new one is part of the offer — named, with what it would mean' \
        'because a yes covers only the meaning they were shown')" "True"
check "two Genres is the usual shape, a third is conditional, one is enough when it is all" \
    "$(order_check 'Two meaningful, distinct Genres is the usual shape' \
        'a third when it holds a part of the idea the other two do not' \
        'one when one already holds all of it' 'Never filler to hit a number')" "True"
check "the old two-or-three wording is gone" \
    "$(grep -c 'two or three strong' "$SKILL")" "0"
check "the keep flow points at the one statement of it" \
    "$(order_check 'one for anything no Genre covers' 'as *Which Genres, and how many* says')" "True"
check "the judgement is the model's, not the store's" \
    "$(order_check 'None of this is checked anywhere' \
        'whether the
parts mean one thing is a judgement, and it is yours')" "True"
# M5: how many films a Vibe holds is still no part of coherence; the core is.
check "how many films it holds is no part of coherence" \
    "$(order_check '**How many films it holds has no part in
it**' 'with only its core is as coherent as one with ten')" "True"
check "but the core has to embody the one idea" \
    "$(order_check '**The core
does:** it has to embody that one idea')" "True"

echo
echo "--- a Vibe is named, not labelled ---"

check "the two kinds of name are distinguished, in that order" \
    "$(order_check 'A Vibe name is evocative, not descriptive' \
        'A **Genre** is named for what it is' \
        'A **Vibe** is named for what it *feels* like')" "True"
check "evocative names are shown, not just asked for" \
    "$(order_check 'Space Tension' 'Popcorn Chaos' 'Quiet Dread')" "True"
check "descriptive names are shown as the failure they are" \
    "$(order_check '`Funny action`' '**not Vibe names**' 'it has been' 'labelled')" "True"
check "the test for a name is pointed at, not restated" \
    "$(order_check '`create_vibe` carries the test for that in its own description' \
        'at the moment a name is being chosen')" "True"
check "a name may not widen the idea" \
    "$(order_check 'must not do is widen the idea' \
        'Name the thing they said' 'Never name a bigger thing')" "True"

echo
echo "--- a statement about a film is a verdict first ---"

check "however it is phrased, it is a verdict first, and only then about Vibes" \
    "$(order_check 'However it is' 'phrased, a statement about how a film worked for them is **a verdict first**' \
        'only then a' 'question about their Vibes')" "True"
check "the verdict needs no yes, because they said it" \
    "$(order_check 'record_verdict — their words' 'needs no yes: they said it')" "True"
check "their words go in because, unedited" \
    "$(order_check '**Their words go in `because`, unedited**' 'only where they gave a reason')" "True"
check "loved only when their words carry it, and never stronger" \
    "$(order_check '**`loved` only when their words carry it**' \
        'A clearly positive statement otherwise is `liked`' \
        'Never a stronger judgement than the' 'one they gave')" "True"
check "lukewarm words write nothing unless one light question settles them" \
    "$(order_check '**Lukewarm or ambiguous words write nothing**' \
        'unless one light' 'question settles them' '`confirmed`')" "True"
check "watching is not an opinion" \
    "$(order_check '**Watching is not an opinion.**' 'never a' 'verdict')" "True"
check "when or how a film worked stays their reason and is stored nowhere else" \
    "$(order_check 'is part of their reason and stays in `because`' \
        'never an occasion, a daypart or an' 'attention level stored anywhere else' \
        'you like low-attention films')" "True"

echo
echo "--- which way it points ---"

check "a positive verdict considers their Vibes" \
    "$(order_check 'liked / loved' 'consider their Vibes')" "True"
check "positive but declining more of the kind stops" \
    "$(order_check 'liked, but they want no more of the kind' 'stop')" "True"
check "negative evidence leads to tension at most once" \
    "$(order_check 'disliked / taking back a positive' 'tension, at most once')" "True"
check "a no or a new subject leaves nothing and is not offered again" \
    "$(order_check 'no / new subject' 'nothing written, nothing remembered, not offered again today')" "True"
check "a partial yes writes exactly the agreed part" \
    "$(order_check 'part of it' 'write exactly the part agreed, with their changes')" "True"

echo
echo "--- what to consider, and the asking budget ---"

check "membership in one Vibe or several, and a partial yes writes the agreed part" \
    "$(order_check 'A further film in a Vibe whose instruction it fits' \
        'one Vibe, or several' 'A partial yes' 'writes exactly the part that was agreed')" "True"
check "a new core only when it embodies the instruction better, named against the old one" \
    "$(order_check '**A new core for a Vibe**' \
        'embodies the instruction better than the current' 'named against it' \
        'Palm Springs stays in it')" "True"
check "a Vibe with no core may be anchored by new evidence" \
    "$(order_check '**An anchor for a Vibe with no core yet**')" "True"
check "at most one new Vibe, only when their words carry a how, when or why" \
    "$(order_check '**A new Vibe**, at most one, anchored on this film' \
        'only when their words carry a *how*' \
        'A bare *"loved it"* considers existing Vibes only')" "True"
check "when nothing fits, nothing more is said" \
    "$(order_check 'When nothing fits, stop and say nothing more about it')" "True"
check "asking has a budget: one offer, one new Vibe, no re-offer, no nagging" \
    "$(order_check '**Asking has a budget.**' 'At most one offer per statement' \
        'at most one new Vibe in it' 'is not offered again in this conversation' 'Never nag')" "True"
check "an owed answer comes first and whole, and an offer never displaces it" \
    "$(order_check '**When a film answer is owed**' 'the answer' 'comes first and whole' \
        'it never displaces the lead or the' 'directions' 'it waits for the next turn')" "True"
check "negative evidence never becomes membership" \
    "$(order_check '**Negative evidence never becomes membership.**' \
        '**the film is a core**' 'offer once to anchor that Vibe' \
        '**the film is a further film**' 'offer once to take it out, or say nothing' \
        '**the film is in no Vibe**' 'stop')" "True"
check "a turn-down never leads to Vibe talk" \
    "$(order_check '**A turn-down is not how a film worked for them**' \
        'never leads to any Vibe talk at all' \
        '`dont-want-to-see` on the film — a viewing, never evidence about their' 'taste' \
        '*"not tonight"* is about an evening, not the film, and is written nowhere')" "True"
check "no verdict reach or evening survives in the skill" \
    "$(grep -ciE 'not-ever|not-tonight' "$SKILL")" "0"

echo
echo "--- writing what they agreed ---"

check "a yes covers exactly what they were shown, and a failed step is reported" \
    "$(order_check 'A yes is the whole of the permission, and covers exactly what they were shown' \
        'if one fails, stop, say what was and was not written' \
        'never claim a write that did' 'not happen')" "True"
check "the write order: Genres, then the Vibe with its core or a core change, then films" \
    "$(order_check '`create_genre` for any new Genre' \
        '`create_vibe` with its name, instruction, Genres and **core**' \
        '`update_vibe` with the core. The film it replaces stays' \
        '`update_movie` with the Vibes it is in now plus the agreed ones' \
        'One short sentence saying what was written')" "True"
check "what is never written" \
    "$(order_check '**Never written:**' 'a film you named only as an illustration' \
        'a paraphrase of their reason' 'a' 'stronger judgement than theirs' \
        'an occasion, daypart or attention field anywhere' \
        'a Vibe, a' 'membership or a core without their yes' \
        'any record that an offer was made or turned down')" "True"
check "the worked cases include the opt-out and the not-tonight" \
    "$(order_check 'Good, but I don' 'they declined more of the kind' \
        'Not tonight — too long' 'nothing about Vibes')" "True"

echo
echo "--- keeping a film, and proposing a Vibe ---"

check "which Vibe a kept film goes in is a classification" \
    "$(order_check 'not *"may I save this?"* but *"what kind of night' \
        'Classify the film; do not fit it to what is there' 'Read the Genres and Vibes first')" "True"
check "a Vibe that genuinely fits is used, and nothing further is asked" \
    "$(order_check 'One genuinely fits' 'ask nothing further')" "True"
check "an existing Vibe is not a bucket, and its meaning is never widened to fit" \
    "$(order_check 'One nearly fits' 'not a bucket' \
        'Never stretch a Vibe to avoid making one' 'a different evening is a different Vibe')" "True"
check "with no good fit the film waits, and a Vibe is devised rather than asked for" \
    "$(order_check 'None fits' 'do not save the film yet' \
        'Reuse the Genres that genuinely fit' 'create' 'one for anything no Genre covers' \
        'Never ask which Vibe they want' 'that judgement is yours')" "True"
check "the write constraints point at the tools that state them" \
    "$(order_check "What a Vibe's name has to earn" \
        'arrive with `create_genre` and `create_vibe`')" "True"
check "the Vibe is proposed conversationally, named, explained and anchored, then asked about" \
    "$(order_check 'say what you noticed, name it, say what it means, name its core' \
        'Then ask' 'Shall I make it?')" "True"
check "the proposal names its Genres, and what a new one would mean" \
    "$(order_check 'name its core, name its Genres with what any new one would mean' \
        'make the idea concrete')" "True"
check "and the worked proposal does: one Genre of theirs, one new one with its meaning" \
    "$(order_check 'Reservoir Dogs is the one that says it best' \
        'It would be built on your Heist and one new Genre, Double-cross:' \
        'plots where nobody at the table is telling the truth' 'Shall I make it?')" "True"
check "a proposed Vibe is shown as an idea: other films in it, other names for it" \
    "$(order_check 'make the idea concrete' \
        'three to five other films that would belong in it' \
        'two or three' 'names it could have instead')" "True"
check "those films illustrate the idea and are never part of the save" \
    "$(order_check 'Those films are illustration only' \
        'never written' 'never in the Vibe, never given a viewing or a verdict')" "True"
check "the core is not an illustration film, and is one they stand behind or are asked for" \
    "$(order_check '**The core is not one of them**' \
        'when they have seen it and stand behind it' \
        'ask which film is closest to what they mean')" "True"
check "only the kept film and the core are saved" \
    "$(order_check 'Only the' 'film they asked to keep, and the core, are being saved')" "True"
check "one yes creates the Vibe with its core and saves the film, with no second save question" \
    "$(order_check 'A yes is the whole of the permission' \
        'any Genre it needs, then the Vibe with its core, then the film' \
        'never' 'ask a second time')" "True"
check "a no settles it, and never becomes a film saved loose" \
    "$(order_check 'A no settles it' 'never saving the film loose')" "True"
check "proposing a Vibe belongs to saving, not to recommending" \
    "$(order_check 'Propose while saving, not' 'while recommending' \
        'a Vibe that genuinely fits needs none of this')" "True"
check "a film named in a proposal that they then speak about is a new statement" \
    "$(order_check 'oh, I loved that one' 'that is a new statement about a film')" "True"

echo
echo "--- a new user's first films ---"

check "there is still no setup, and the question is asked in one sentence" \
    "$(order_check 'There is still no setup' 'in one sentence' \
        'inside an answer if they asked' 'on its own if they did not' \
        'what two or three films they love')" "True"
check "each film they name is a loved, confirmed verdict" \
    "$(order_check '**Each film they name is a verdict**' '`loved`, `confirmed`' \
        'A user who stops here keeps their verdicts and nothing else')" "True"
check "seeds may be grouped, and the idea may come from the films themselves" \
    "$(order_check '**Then consider them together.**' \
        'one of' 'them its core and the other a further film' \
        'the idea may come from the films themselves')" "True"
check "the one offer that may hold several Vibes, drawn only from the films they named" \
    "$(order_check '**This is the one offer that may hold several Vibes**' \
        'drawn only from the' 'films they just named' \
        'each one' "s instruction is shown, because a yes covers only the meaning they were shown")" "True"
check "nothing is remembered as a stage they are in" \
    "$(order_check 'Nothing about this is remembered as a stage they are in')" "True"

echo
echo "--- going through their Vibes ---"

check "raised only when they ask, or a Vibe with no core is already the subject" \
    "$(order_check 'none of it is raised unprompted' 'they ask' \
        'a Vibe with no core is already the subject')" "True"
check "every item is an offer, and nothing is written without a yes" \
    "$(order_check 'each item an offer and nothing written without a yes')" "True"
check "anchor: candidates have a standing positive verdict, the runner-up is named" \
    "$(order_check '**Anchor.**' 'a standing `liked` or `loved`' 'name the runner-up' \
        'ask which film' 'embodies it')" "True"
check "weak, overlap and unfiled are each handled as offers" \
    "$(order_check '**Weak**' 'leave it as it is for now' \
        '**Overlap**' 'There is no merge tool' 'not atomic' \
        '**Films in no Vibe.**' 'One without is left alone and not mentioned')" "True"
check "a merge changes the surviving sentence only to words they give" \
    "$(order_check 'change the surviving sentence only to words they give you')" "True"
check "they can stop at any point" \
    "$(order_check 'They can stop at any point' 'later' 'is an answer')" "True"

echo
echo "--- the model grows from what was said ---"

check "the idea just used is the Vibe, and its parts are the Genres" \
    "$(order_check 'The idea you just used' '**is** a Vibe' \
        'Writing them down is how Tonight gets better at this')" "True"
check "a bare request for tonight leaves nothing behind" \
    "$(order_check 'Wanting something tonight' 'is not saying it' 'leaves nothing behind')" "True"
check "near-duplicate Genres are called out" \
    "$(order_check 'do not add `Slow-paced`')" "True"
check "one conversation should not produce eight Genres" \
    "$(order_check 'One conversation should not produce eight Genres')" "True"

echo
echo "--- what lives only on the tools ---"

# The same relocations tonight-recommend's test.sh holds: a rule read at the moment
# of a call lives in that tool's description, and two homes for one rule drift apart.
check "the instruction's voice lives only on the tool" \
    "$(grep -ciE 'first person' "$SKILL")" "0"
check "the rewording prohibition lives only on the update tools" \
    "$(grep -ciE 'reword' "$SKILL")" "0"
check "the write invariants live only on the create tools" \
    "$(grep -ciE 'always needs an instruction|at least one existing Genre|built from Genres only|built from another Vibe|no chaining' "$SKILL")" \
    "0"
vibe_name_rule='what would I get wrong|already tells you the name|the instruction test'
vibe_name_rule="$vibe_name_rule|ask for it by name|can ask for it|by name in a month"
vibe_name_rule="$vibe_name_rule|a month later|ask for the Vibe by|doing no work"
vibe_name_rule="$vibe_name_rule|adds? (nothing|something|anything) to its Genres"
vibe_name_rule="$vibe_name_rule|(beyond|more than) its Genres|pair of Genres"
vibe_name_rule="$vibe_name_rule|earns? its( own)? name"
check "the Vibe naming test lives only on create_vibe" \
    "$(grep -ciE "$vibe_name_rule" "$SKILL")" "0"
check "the score prohibition lives only on the viewing field" \
    "$(grep -ciE 'score or star rating|never a score' "$SKILL")" "0"

echo
echo "--- M6: a film they have not seen never anchors a Vibe ---"

# docs/work/m6/PLAN.md §2.2, and M7's My List. The store refuses a core whose
# saved viewing is anything but seen; it reads that raw fact alone, so the skill
# says what follows when a standing judgement disagrees with it, and that a
# viewing is never written to get past the refusal.
check "the one check Tonight makes is named, and the rest is still a judgement" \
    "$(order_check 'nothing in Tonight checks it — with the one exception below' \
        '**A film whose saved viewing is not `seen` is refused as a core.**' \
        'it checks that saved fact alone')" "True"
check "a film they have not seen may sit in a Vibe, and never anchors it" \
    "$(order_check 'A film they have not seen may still sit in a Vibe' \
        'a candidate for that kind of evening' 'never anchors it')" "True"
check "a core the anchoring saves is saved as seen" \
    "$(order_check '**A core that is not saved yet is saved as `seen`**')" "True"
check "a liked or loved does not override the list: ask once, and write only on a yes" \
    "$(order_check '**A standing `liked` or `loved` does not override `want-to-see` or `dont-want-to-see`.**' \
        'only they can settle two things they said that' 'disagree' \
        'ask once whether they have seen it' 'On a yes, record' '`seen` with `update_movie`, then anchor' \
        'On a no, or no answer, write nothing')" "True"
check "a viewing is never changed to get past the refusal" \
    "$(order_check '**Never change a viewing to get past the refusal**' \
        'not on the strength of a verdict' 'A viewing is written only when they said it')" "True"
check "stop suggesting it is dont-want-to-see, never disliked, and no Vibe talk" \
    "$(order_check '*"Stop suggesting it."*' \
        '`dont-want-to-see` on the film — never `disliked`, which says they watched it' 'nothing about Vibes')" "True"
check "not tonight writes nothing" \
    "$(order_check '*"Not tonight — too long."*' 'nothing — it is about an evening, not the film' 'nothing about Vibes')" "True"
check "going through Vibes re-anchors a core not seen like a missing one" \
    "$(order_check '**Anchor.**' 'A Vibe whose core reads anything' 'but `seen` is anchored again in the same way, as one with no core')" "True"
check "don't recommend it again is a viewing, not a verdict" \
    "$(order_check '*"Stop suggesting it."*' '*"Don'"'"'t recommend it again."*' \
        '`dont-want-to-see` on the film — a viewing, not a verdict')" "True"

echo
printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
