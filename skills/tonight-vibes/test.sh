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
# A liked or loved is kept only for a film in a Vibe. Those two rules above are
# for a verdict that was kept; one answered vibe_required has a flow of its own.
check "considering what to offer is for a positive verdict that was kept" \
    "$(order_check '### What to consider, and what to offer' \
        'After a positive verdict that was kept — the film is already in a Vibe')" "True"
check "a liked or loved in no Vibe is not saved, and is never said to be" \
    "$(order_check '### When a liked or loved needs a Vibe' \
        '**nothing is written**' '`reason: "vibe_required"`' \
        '**Until the film is filed, the verdict is not saved, so never say it is.**')" "True"
# docs/work/vibe-hypotheses: three questions answered in one offer, not a ladder —
# where the film belongs is one question, and why it worked for them is another.
check "read by its instructions, three questions answered together in one offer" \
    "$(order_check "each Vibe's instruction and its Genres'" 'instructions, not the names' \
        'answer three questions in it, together rather than one after' 'another' \
        '1. **Where it belongs.** Every Vibe whose evening it is')" "True"
check "a minimal change to a Vibe's sentence only when needed, and only on a yes to the exact words" \
    "$(order_check '2. **A minimal change, only when needed, and only on their yes.**' \
        'exact new wording — the smallest change that covers it' \
        'only on their yes to those words' \
        'A minimal change is never a way to stretch a Vibe')" "True"
check "a minimal change never carries a reason the Vibe was not about" \
    "$(order_check 'A minimal change is never a way to stretch a Vibe' \
        'never a way to make a Vibe say a reason it was not about' \
        'that is a new Vibe beside it')" "True"
check "a new Vibe for the why: one recommended and two alternatives, beside where it belongs" \
    "$(order_check '3. **A new Vibe for the why.**' \
        'When their words carry a why none of their Vibes says' \
        'one recommended new Vibe and two meaningfully different alternatives' \
        '*Three hypotheses, chosen by title*' 'with this film as its core' \
        'Their pick says why they liked it' \
        '**This goes beside 1, never instead of it**' \
        'files the film where it belongs and anchors the new' 'and says so' \
        'so their pick covers both' 'a part of it writes that part')" "True"
check "a title, its number, or a plain yes for the recommended one is their yes" \
    "$(order_check 'A title they pick, its number, or a plain yes for the one you recommend is their yes' \
        'On their yes, write exactly what they agreed')" "True"
check "a no keeps an unsaved film unsaved, and a saved one keeps its captured viewing" \
    "$(order_check 'On a no, or a change of subject, the liked or loved stays unsaved' \
        'A film not saved yet stays unsaved; a saved one keeps the viewing their liked already moved')" "True"
check "a bare loved leads to new Vibes only when none of theirs fits" \
    "$(order_check 'A bare *"loved it"* may lead to new Vibes here, and only when none of theirs fits' \
        'the three' 'hypotheses are how you learn the why they did not give')" "True"
check "a Vibe is the evening, and their because keeps the why" \
    "$(order_check '**A liked or loved is kept only for a film in at least one of their' \
        'a Vibe is the kind of evening it belongs to, and their `because` keeps why it worked')" "True"

echo
echo "--- three hypotheses, chosen by title ---"

check "three hypotheses wherever a Vibe is learned from a film they liked" \
    "$(order_check '### Three hypotheses, chosen by title' \
        'a liked or loved answered' '`vibe_required`, a kept one whose words carry a why' \
        "or a new user's first" 'films' '**three hypotheses**, and they choose one by its title' \
        'This is how Tonight learns why a film worked for somebody')" "True"
check "genuinely distinct hypotheses, never names for one preference, grounded in their words" \
    "$(order_check '**Three different hypotheses about what they loved in that film**' \
        'one of them recommended' \
        'for any two, there is a film that fits one and not the other' \
        '**Never three names for one preference.**' \
        'readings of their words — none wider than what they said, and none ruling out what they did not rule out' \
        'three different reasons the film may have worked for them' \
        'None is a Vibe they already have')" "True"
# §12.9-§12.10: what the live runs found wanting, each said where it is acted on.
check "each reading keeps the subject of their reason, and none turns into a rule they never gave" \
    "$(order_check 'readings of their words — none wider than what they said, and none ruling out what they did not rule out' \
        '**Each keeps the subject of their reason**' \
        'what their sentence is about stays what every reading is about' \
        '*"the dialogue was so sharp"*' 'never the plot, the acting or being clever in general' \
        'no reading turns into a rule they never gave' \
        'None is a Vibe they already have: where the film already belongs is said beside the list, never as one of the three')" "True"
# §13.3-§13.4: readings slid from the people in a reason to a plan or to skill in general,
# and a new Genre carried the widening its reading's sentence did not.
check "readings may differ about the subject, never swap it — people stay the people" \
    "$(order_check '**Each keeps the subject of their reason**' \
        'The three may read differently what they loved' 'about that subject, never swap it for another' \
        'when their reason is about people' 'every reading is about those people, never a plan or a' \
        'trick on its own, and never being good at things in general unless their words said so')" "True"
check "a new Genre made for a reading stays inside their reason, and may still cover more films" \
    "$(order_check '**Each is a whole Vibe**' \
        '**A new Genre made for a reading stays inside their reason**' \
        'it may hold more films than the reading — an ingredient does' \
        'but never a subject or a quality their words did not carry' \
        'is the reading widened by another route')" "True"
check "a Genre is not held narrower than an ingredient can be" \
    "$(grep -ciE 'no broader than that reading' "$SKILL")" "0"
check "the grounding rule names no film and no reason from the evaluation" \
    "$(sed -n '/### Three hypotheses, chosen by title/,/### What to consider, and what to offer/p' "$SKILL" | grep -ciE 'clever characters|Brothers Bloom|Masterminds')" "0"
check "a new Genre's meaning is shown as the words it will be written as, and written word for word" \
    "$(order_check '**Each is a whole Vibe**' \
        'shown as the *"I like…"* sentence it will be written as, word for word' \
        '`create_genre` for any new Genre in the agreed idea, with the instruction they were shown, word for word')" "True"
check "a pick that says nothing about when is seen-before, and when is never asked again" \
    "$(order_check '**Their pick is their yes.**' '**exactly as it was shown**' \
        '**A pick that does not say when they' 'watched it is them not saying**' \
        'if nothing they said in this conversation placed it either, the' \
        'film is written `seen-before` with it' \
        'timing they did give stands (*"last night"* is' '`seen-now`), and a seen viewing already stored is kept' \
        'and when is never asked again')" "True"
check "a liked said now moves a want-to-see film before anything is offered or asked" \
    "$(order_check '**A liked or loved they tell you now is them telling you they watched it.**' \
        '**Write it before you offer or ask anything, and never ask about when first**' \
        'their answer, if they give one, corrects it')" "True"
check "each hypothesis is a whole Vibe with this film as its core" \
    "$(order_check '**Each is a whole Vibe**: a name, an *"I like…"* sentence, its Genres' \
        'and this film as its core')" "True"
check "the titles lead: numbered, the title alone in bold, nothing else bold, no other names" \
    "$(order_check '**The titles lead.**' 'A numbered list, the recommended one first' \
        'each item starts with its title in bold — the title alone' 'never inside it' \
        'Nothing else in the offer is bold at the start of a line' \
        'tells it apart from the other two' 'No other names for any of them')" "True"
check "their pick is their yes to what was shown, written exactly as shown, never asked again" \
    "$(order_check '**Their pick is their yes.**' \
        'A title, its number, or a plain yes for the one you recommend' \
        'shown beside the title, whether or not they read them' \
        'except on first films, where it accepts its own list and no other' \
        '**exactly as it was shown**' 'never ask again' \
        'show the exact new words, and write on their yes to those')" "True"
check "only the pick is written, nothing records the others, and they are not their taste" \
    "$(order_check '**Only the one they pick is written.**' \
        'no Vibe, and no Genre only they needed' 'nothing records that they were offered' \
        'A hypothesis they did not pick is not their taste' \
        'what a recommendation reads is what was written')" "True"
check "a no writes nothing further, and what was written stays" \
    "$(order_check '**A no writes nothing further.**' 'What was already written stays' \
        'Only a liked still refused is not kept')" "True"
check "first films: one list per Vibe, one written per list, a pick accepts its list only" \
    "$(order_check '**First films** offer one such list for each Vibe' \
        'One per list is written' \
        'A title they pick accepts that list only — a list they pick nothing from gets nothing' \
        'a plain yes takes the recommended one, first in every list')" "True"
check "the kept path offers its one new Vibe as three hypotheses, and the film stays where it is" \
    "$(order_check '**A new Vibe**, at most one, anchored on this film' \
        'It is offered as three hypotheses' 'the film stays in the Vibes it is already in')" "True"
check "the keep flow's proposal is not how a liked film's Vibe is offered" \
    "$(order_check 'This proposal is for keeping a film' \
        'three hypotheses chosen by title, never one idea under other names')" "True"
check "the worked case: a liked whose evening they have and whose reason they do not" \
    "$(order_check '*"I liked The Brothers Bloom because clever characters do smart things."*' \
        'it goes there too, and three hypotheses by title, *Masterminds & Misdirection* recommended' \
        'both Vibes on its list' '`record_verdict` again')" "True"
check "on a yes the film is filed, then the same verdict is recorded again" \
    "$(order_check 'On their yes, write exactly what they agreed' \
        'then call' '`record_verdict` again with `retry.arguments`' \
        'then say in one short sentence what was saved')" "True"
check "on a no it stays unsaved, and nothing is written in its place" \
    "$(order_check 'On a no, or a change of subject, the liked or loved stays unsaved' \
        'say so once, and write' 'nothing in its place' \
        'no `disliked`, no viewing they did not state, and no record that you asked')" "True"
check "the flow branches on whether a liked or loved was kept" \
    "$(order_check 'liked / loved, kept' 'consider their Vibes' \
        'liked / loved, answered vibe_required' 'find its Vibe, then record it again')" "True"
check "writing what they agreed ends by recording each refused verdict again" \
    "$(order_check '### Writing what they agreed' \
        'Every liked or loved that was answered `vibe_required`' \
        '`retry.arguments`, now that its film is filed' \
        'One short sentence saying what was written')" "True"
check "a merge moves its films before it deletes" \
    "$(order_check '**Overlap**' 'move the films with `update_movie`' \
        'films first, because it refuses to leave a liked or loved film in no Vibe')" "True"
check "asking has a budget: one offer, one new Vibe, no re-offer, no nagging" \
    "$(order_check '**Asking has a budget.**' 'At most one offer per statement' \
        'at most one new Vibe in it' 'is not offered again in this conversation' 'Never nag')" "True"
check "the budget shows three hypotheses and writes one, on both paths; first films hold several" \
    "$(order_check '**Asking has a budget.**' \
        'an offer may show three hypotheses, and only the one they pick is written' \
        '`vibe_required` and on a kept one alike' \
        'First films are the one offer that may hold several')" "True"
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
        '*"not tonight"* is about an evening, not the film: never a viewing or a verdict, at most a pass on that evening')" "True"
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
        'any record that a Vibe offer was made or turned down')" "True"
check "a hypothesis they did not pick is never written, nor a Genre only it needed" \
    "$(order_check '**Never written:**' 'a hypothesis they did not pick, or a Genre only it needed')" "True"
check "the pick is written as shown: its Genres only, and a new core keeps its other Vibe" \
    "$(order_check '`create_genre` for any new Genre' 'of the hypothesis they picked, and of no other' \
        '`create_vibe` with its name, instruction, Genres and **core**, exactly as they were shown' \
        'That includes the new core when it also belongs to a Vibe they have' \
        'so a Vibe left out of it is a Vibe the film leaves')" "True"
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
check "each film they name is a loved, confirmed verdict, kept once its film has a Vibe" \
    "$(order_check '**Each film they name is a verdict**' '`loved`, `confirmed`' \
        'for somebody new every one is answered' '`vibe_required` and nothing is saved yet' \
        'A user who stops here keeps nothing positive')" "True"
check "each first-films Vibe comes with two meaningfully different alternatives" \
    "$(order_check '**This is the one offer that may hold several Vibes**' \
        'two meaningfully different alternatives beside it' \
        'not other names for one')" "True"
check "each first-films Vibe is three hypotheses chosen by title, one written per list" \
    "$(order_check '**This is the one offer that may hold several Vibes**' \
        'is offered as three hypotheses chosen by title' \
        '**One yes covers the offer**, taking the first of each list' \
        'a title they pick takes that one for its list and accepts no other list' \
        'at most one is written per list')" "True"
check "a no to the first-films offer saves nothing positive, and a yes is followed by the verdicts" \
    "$(order_check 'a no saves nothing positive' \
        'each loved is recorded again once its film is filed')" "True"
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
# saved viewing is anything but seen — now or before; it reads that raw fact
# alone, so the skill says what follows when a standing judgement disagrees with
# it, and that a viewing is never written to get past the refusal.
check "the one check Tonight makes is named, and the rest is still a judgement" \
    "$(order_check 'nothing in Tonight checks it — with the one exception below' \
        '**A film whose saved viewing is neither `seen-now` nor `seen-before` is refused as a core.**' \
        'it checks that saved fact alone')" "True"
check "a film they have not seen may sit in a Vibe, and never anchors it" \
    "$(order_check 'A film they have not seen may still sit in a Vibe' \
        'a candidate for that kind of evening' 'never anchors it')" "True"
# Seen now and seen before: a core the anchoring saves is saved as the value read
# from what they said, by the one rule the recommend skill states — with any
# question about when folded into the Vibe's own — and seen-before left out.
check "a core the anchoring saves is saved as its core.viewing, by the rule, seen-before without" \
    "$(order_check '**A core that is not saved yet is saved as its `core.viewing`**' \
        '`seen-now` or `seen-before`, read from what they said by the viewing rule in' \
        '**tonight-recommend**' \
        'a question about when folded into the one you are putting about the Vibe' \
        'Left out, it is `seen-before`' \
        'A saved film keeps its own viewing')" "True"
check "a liked or loved does not override the list: ask once, and write only on a yes" \
    "$(order_check '**A standing `liked` or `loved` does not override `want-to-see` or `dont-want-to-see`.**' \
        'only they can settle two things they said that' 'disagree' \
        'ask once whether they have seen it and, if so, recently or a while ago — one question' \
        'On a yes, record `seen-now` or `seen-before` with `update_movie`' 'then anchor' \
        'On a no, or no answer, write nothing')" "True"
check "filing a liked film not saved yet: when is asked inside the Vibe's question" \
    "$(order_check 'filed by `create_vibe` with it as core and its `core.viewing`' \
        '`create_movie` with `viewing` `seen-now` or `seen-before` and its Vibes' \
        'liking it says they watched it, not when' \
        'that question goes into the one you put about the Vibe')" "True"
check "no bare seen is written anywhere in the skill" \
    "$(grep -cE '`seen`|viewing: seen\b' "$SKILL")" "0"
# docs/work/vibe-hypotheses: a liked said now is their word that they watched it,
# captured in the turn they say it; a standing one still does not move the list.
check "a liked said now moves a want-to-see film to seen, in that turn, and says what it stored" \
    "$(order_check '**A standing `liked` or `loved` does not override `want-to-see` or `dont-want-to-see`.**' \
        '**A liked or loved they tell you now is them telling you they watched it.**' \
        '`want-to-see` moves to `seen-now` or `seen-before` in the same turn' \
        '`seen-before` when nothing they said places it recently' 'and you say what you stored' \
        'not a verdict standing in for it' \
        'A `dont-want-to-see` film is still the one question above' \
        '**Never change a viewing to get past the refusal**')" "True"
check "a viewing is never changed to get past the refusal" \
    "$(order_check '**Never change a viewing to get past the refusal**' \
        'not on the strength of a verdict' 'A viewing is written only when they said it')" "True"
check "stop suggesting it is dont-want-to-see, never disliked, and no Vibe talk" \
    "$(order_check '*"Stop suggesting it."*' \
        '`dont-want-to-see` on the film — never `disliked`, which says they watched it' 'nothing about Vibes')" "True"
check "not tonight is at most a pass on that evening, with their reason" \
    "$(order_check '*"Not tonight — too long."*' 'at most a pass on that evening, *"too long"* as its reason — it is about an evening, not the film' 'nothing about Vibes')" "True"
# M9: the attribution rule, whole, where Vibes meet a watched film — the update
# on an unambiguous reference, the new evening of their own, and no evening at
# all when it is unclear. Code review 1: the first half alone was not the rule.
check "a watch last night is a viewing, never a verdict" \
    "$(order_check '**Watching is not an opinion.**' \
        '*"I watched it last night"* is a viewing, never a verdict.')" "True"
check "attribution (i): an evening is updated only on an unambiguous reference, never by title or recency" \
    "$(order_check '**Watching is not an opinion.**' \
        'it **updates** a recorded evening — `started` on that film — only when they unambiguously referred to that evening' \
        'A title that matches, or the evening being recent, is never the reference')" "True"
check "attribution (ii): an evening of their own naming no recorded evening creates a new evening" \
    "$(order_check '**Watching is not an opinion.**' \
        'an evening of their own watching that names no evening you recorded **creates a new** evening with no request' \
        'never attaches to an existing one')" "True"
check "attribution (iii): an ambiguous reference writes to no evening, and nothing is asked to file it" \
    "$(order_check '**Watching is not an opinion.**' \
        'a statement that might be about a recorded evening but does not say so' \
        'writes to **no** evening, and no question is asked in order to file it')" "True"
check "the table row carries all three routes" \
    "$(order_check '*"I watched it last night."*' \
        '`started` on a recorded evening only when they referred to it' \
        'a new evening of their own when they named none you recorded' \
        'no evening when it is unclear')" "True"
check "the old route to a viewing or an evening is gone" \
    "$(grep -ciE 'a viewing or an evening|written nowhere' "$SKILL")" "0"
check "going through Vibes re-anchors a core not seen like a missing one" \
    "$(order_check '**Anchor.**' 'A Vibe whose core reads anything' 'but `seen-now` or `seen-before` is anchored again in the same way, as one with no core')" "True"
check "a watch last night is seen-now in the table" \
    "$(order_check '*"I watched it last night."*' 'a viewing, `seen-now`')" "True"
check "don't recommend it again is a viewing, not a verdict" \
    "$(order_check '*"Stop suggesting it."*' '*"Don'"'"'t recommend it again."*' \
        '`dont-want-to-see` on the film — a viewing, not a verdict')" "True"

echo
printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
