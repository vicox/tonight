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
check "a film anchors one Vibe at most; anchoring moves it, and another Vibe's core is refused" \
    "$(order_check 'A film anchors one Vibe at most, because it is in one' \
        'moves the film into the Vibe it now anchors — say so' \
        'A film that already anchors another Vibe is refused')" "True"
check "one film anchoring two Vibes is gone" \
    "$(grep -ciE 'may anchor two Vibes|one evening described twice' "$SKILL")" "0"

echo
echo "--- one idea, said three ways ---"

check "constructing a vibe means reading the genres own instructions, not their names" \
    "$(order_check 'instructions** — not their names, which
are labels and say almost nothing' \
        'A Genre whose name looks at home under a Vibe can still mean' \
        'only its instruction shows' 'it. Two ideas, one object.')" "True"
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
    "$(order_check 'anything no Genre covers, a new one' 'as *Which Genres, and how many* says')" "True"
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
check "a Vibe name is described as a shelf, not shown by example" \
    "$(order_check 'A **Vibe** is named for what it *feels* like' \
        'The name of a shelf in a good video' 'a list they would go back to')" "True"
check "a name that restates the Genres is the failure it is" \
    "$(order_check 'A name that lists the Genres, or puts a quality in front of one' \
        '**not a Vibe name**' 'it has been' 'labelled')" "True"
# The skill states the naming rule and names no Vibe or Genre to show it.
check "no example Vibe or Genre names survive" \
    "$(grep -ciE 'Space Tension|Popcorn Chaos|Quiet Dread|Funny action|Slow burn|Slapstick|Clever thriller|Practical effects' "$SKILL")" "0"
check "the test for a name is pointed at, not restated" \
    "$(order_check '`create_vibe` carries the test for that in its own description' \
        'at the moment a name is being chosen')" "True"
check "a name may not widen the idea" \
    "$(order_check 'must not do is widen the idea' \
        'Name the thing they said' 'Never name a bigger thing')" "True"

echo
echo "--- a statement about a film is a verdict first ---"

check "however it is phrased, it is a verdict first, and only then about Vibes" \
    "$(order_check 'however it is phrased, a' 'statement about how a film worked for them is **a verdict first**' \
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
        'never a claim about the kind of viewer they are')" "True"

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
echo "--- discover the Vibe first; recognize the connection second ---"

# docs/work/discover-vibe-first. The evening a film was for them is found first, from the film and
# their words, and only then compared with their Vibes — a Vibe of theirs is the recommendation only
# where it is that same evening, never a neighbour, a warm one, or one that merely exists.
check "the flow discovers the evening before it considers their Vibes" \
    "$(order_check 'disliked / taking back a positive' \
        'discover — the evening it was for them, from the film and their words; no Vibe weighed yet' \
        'consider — get_taste')" "True"
check "one rule, before the vibe_required offer, for every flow that finds a film its Vibe" \
    "$(order_check '### The verdict' \
        '### Discover the Vibe first; recognize the connection second' \
        "Wherever a film's Vibe is found with them — a liked or loved answered \`vibe_required\`, one already kept, a film they ask you to keep — the evening comes before their Vibes" \
        '### When a liked or loved needs a Vibe')" "True"
check "blind: the first pass is the film as it was for them, before any Vibe is weighed" \
    "$(order_check '**First, the film as it was for them.**' \
        'Before you weigh any Vibe of theirs, settle what kind of evening this film was' \
        'This pass is yours and stands on its own' \
        "it does not start from their Vibes' names or Genres, and it is not a search for the nearest one" \
        '**Then, the connection.** Only now read their Vibes')" "True"
check "grounded in their words — all of this conversation's — and no reason is needed" \
    "$(order_check 'grounded in what they said about it — everything they said in this conversation, not only the last sentence' \
        'Their words lead where they gave any' \
        'where they gave none, the film and what they have liked are enough, and nobody is asked why')" "True"
check "a real connection: the same evening, read in its sentence, Genres and core, in their words" \
    "$(order_check '**Then, the connection.**' \
        "each one's sentence, its Genres' instructions and its core" \
        'ask whether one of them **is** that evening' \
        'already said in their words and embodied by the film that anchors it' \
        'recognition rather than argument' \
        'the same evening said another way is that evening, and a new Vibe beside it would split one evening in two')" "True"
check "a detail true of the core alone is the refit's to weigh, not a missing connection" \
    "$(order_check 'A detail of the sentence true of its core alone does not undo a connection' \
        '*Filing it in one of their Vibes* weighs that')" "True"
# Code review 1: a shared surface or a Vibe just talked about is no evidence either way — never a
# fit on its own, and never a reason to rule out the Vibe that is the evening.
check "neighbour: only a shared Genre, name, setting, period, maker or cast is never where it goes" \
    "$(order_check '**A neighbour is not the evening.**' \
        'A Vibe the film shares only a Genre, a word of the name, a setting, a period, a maker or a cast with is a neighbour' \
        'a neighbour is never where the film goes' \
        'What they share proves nothing either way: the Vibe that is its evening may share them too')" "True"
check "warm context: a Vibe the conversation was just about is weighed like any other, either way" \
    "$(order_check '**Warm decides nothing.**' \
        'A Vibe the conversation has just been about — one you read back, recommended from or offered — is weighed like any other' \
        'having come up neither makes it the evening nor rules it out')" "True"
check "a shared surface or a warm Vibe is never an exclusion" \
    "$(grep -ciE 'Warm is not the evening|makes that Vibe a neighbour, and' "$SKILL")" "0"
check "neither side preferred: never a Vibe for existing, never a new one for being new" \
    "$(order_check '**Neither side is preferred.**' \
        'A Vibe is never recommended because it exists, and a new one never because it is new' \
        'where the connection is real, that Vibe is the recommendation' \
        'where it is not, the evening you found is the new Vibe you recommend')" "True"
check "step 3's recommended Vibe is the evening found first, never reshaped toward theirs" \
    "$(order_check '3. **Otherwise one recommended new Vibe and two meaningfully different alternatives**' \
        'the recommended one the evening you found first, never reshaped toward a Vibe of theirs' \
        'three different evenings the film could stand for')" "True"
check "the kept path finds the evening first too" \
    "$(order_check 'After a positive verdict that was kept — the film is already in a Vibe — find the evening it was for them first, as *Discover the Vibe first* says, then read the model')" "True"
check "an existing Vibe is no longer first" \
    "$(grep -ciE 'An existing Vibe first|an existing one where it fits' "$SKILL")" "0"
check "the rule names no film or Vibe of its evaluation" \
    "$(grep -cE '\bMoon\b|Interstellar|Guardians|All Is Lost|Alone With It|Zero-G Popcorn|Sam Rockwell' "$SKILL")" "0"

echo
echo "--- what to consider, and the asking budget ---"

check "a kept film moves only to a Vibe it fits better, never for a shared Genre, offered as a move" \
    "$(order_check '**A move to a Vibe whose instruction it fits better**' \
        'never because the two share a Genre' 'a move takes it out of the one it is in' \
        'A partial yes' 'writes exactly the part that was agreed')" "True"
check "membership in several Vibes is gone" \
    "$(grep -ciE 'one Vibe, or several' "$SKILL")" "0"
check "a new core only when it embodies the instruction better, named against the old one" \
    "$(order_check '**A new core for a Vibe**' \
        'embodies the instruction better than the current' 'named against it' \
        'the film that anchors it now' 'that the current one stays in it')" "True"
check "a Vibe with no core may be anchored by new evidence" \
    "$(order_check '**An anchor for a Vibe with no core yet**')" "True"
# §21: a new Vibe comes from the film, their Vibes and their history — never from asking why.
check "at most one new Vibe, only when the film points to an evening none of theirs holds" \
    "$(order_check '**A new Vibe**, at most one, anchored on this film' \
        'only when the film points to an evening' 'none of their Vibes holds' \
        'read from the film itself, their other films and verdicts, and' \
        'anything they said about it, never by asking them why')" "True"
check "a bare loved may lead to new Vibes, and nobody is asked why" \
    "$(order_check 'A bare *"loved it"* may lead to new Vibes too' \
        'the film, their Vibes and what they have liked are' 'enough to propose from, and nobody is asked why')" "True"
check "no new Vibe waits on a reason they gave" \
    "$(grep -ciE 'their words carry a \*how\*|learn the why|no reason was given|considers existing Vibes only|Their pick says why|reasons the film may have worked' "$SKILL")" "0"
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
# Skill compliance: recommend calls record_verdict first, and this skill once read as offering
# the Vibe before it. The verdict is called first here too; vibe_required is its expected answer.
check "record_verdict comes first here too, even for a film in no Vibe, as recommend says" \
    "$(order_check 'statement about how a film worked for them is **a verdict first**' \
        '**`record_verdict` comes first, in the turn they say it, before' \
        'anything else — even for a film you can see is in no Vibe**, as **tonight-recommend** says' \
        'for a film in none that call answers `vibe_required`' \
        'never by filing it first')" "True"
check "no Vibe is offered before the verdict is recorded" \
    "$(grep -ciE 'the Vibe comes before the|that offer comes first and the verdict|in no Vibe, its Vibe first' "$SKILL")" "0"
check "the table: in no Vibe, answered vibe_required, the offer, then record_verdict again" \
    "$(sed -n '/### What each kind of statement writes/,/^## /p' "$SKILL" \
        | grep -c 'in no Vibe, answered `vibe_required`: ')" "2"
check "vibe_required is expected: no apology, no error, and no filing of your own" \
    "$(order_check '**Until the film is filed, the verdict is not saved, so never say it is.**' \
        '**That answer is expected, not a failure**' \
        'apologise for nothing and' 'report no error' \
        'Nor is it a reason to file the film yourself' \
        'nothing is filed or created without their yes, not even in a Vibe that fits' \
        'Then, in this conversation, one offer')" "True"
# Discover the Vibe first: step 1 is no longer "an existing Vibe first" — the evening is found
# first, and a Vibe of theirs is read, core included, for whether it is that evening.
check "step 1: one of their Vibes where it is that evening, read by its instructions and core" \
    "$(order_check '1. **One of their Vibes, where it is that evening.**' \
        'With the evening found first, read' \
        "each Vibe's instruction, its Genres' instructions and its core, not the names" \
        'as *Discover the Vibe first* says')" "True"
check "a minimal change to a Vibe's sentence only when needed, and only on a yes to the exact words" \
    "$(order_check '2. **A minimal change, only when needed, and only on their yes.**' \
        'exact new wording — the smallest change that covers it' \
        'only on their yes to those words' \
        'A minimal change is never a way to stretch a Vibe')" "True"
check "otherwise one recommended Vibe and two meaningfully different alternatives, each an evening" \
    "$(order_check '3. **Otherwise one recommended new Vibe and two meaningfully different alternatives**' \
        'three different evenings the film could stand for, not three names for one idea' \
        'read' 'from the film itself, their Vibes and what they have liked, and from anything they said about' \
        'with this' 'film as its core' 'Their pick says which evening it is for them')" "True"
# §20: the fit model, said as judgement and never as a number; a rewording keeps its core.
check "how well a film fits: core wholly, a member on its own, a partial one not at all" \
    "$(order_check '**How well a film fits is a judgement, never a number.**' \
        'The core fits its Vibe wholly' 'A further film fits it well enough to belong there on its own' \
        'A film that only partly fits is not added' \
        'neither is a film that does not meaningfully fit')" "True"
check "a film is in one Vibe at most, and a shared Genre never puts it there" \
    "$(order_check '**A film is in one Vibe at most**' \
        'Two Vibes that share a Genre are still two evenings' \
        '**a Genre a film shares with a Vibe never puts it there**' \
        "it fits the Vibe's instruction" \
        'so it is offered as a move, and written only on their yes')" "True"
check "fit is never scored" \
    "$(grep -ciE '[0-9] ?%|percent|fit score|scored fit' "$SKILL")" "0"
check "a minimal change keeps its core fitting wholly" \
    "$(order_check '2. **A minimal change' 'the smallest change that covers it, and one its core still fits wholly')" "True"
# §20: where both a rewording and a new Vibe make sense, both — one recommended in a line, their
# choice, nothing written first; a film is in one Vibe, so the new one holds it alone.
check "when both make sense: both in one offer, one recommended in a line, they choose" \
    "$(order_check '**When both make sense.**' 'If the film only partly fits a Vibe' \
        'both a minimal change to it and' 'a new Vibe would make sense, offer both in the one offer' \
        'the exact new wording, as 2 says, and a new' 'Vibe as 3 offers one' \
        'which then is in that new Vibe alone' \
        'Say in one line which you would choose and why, and let them choose' \
        'a reply that does not make clear which they chose is asked about once, before anything is written' \
        "A film that fits well, its Vibe's sentence true of it and of the core, is proposed for filing, as 1 says, with its two alternatives and no new wording")" "True"
# Skill compliance: an existing Vibe that fits is the recommendation, never offered alone and never
# beside a bare "or a new one" — two concrete alternatives, as step 3's new Vibe always had.
check "an existing Vibe that fits is the recommendation, with two concrete alternatives beside it" \
    "$(order_check '1. **One of their Vibes, where it is that evening.**' 'If one is that evening, it is your recommendation: propose' 'filing the film' \
        '**Two concrete alternatives, always.**' \
        'an existing Vibe as 1 has it, the same Vibe with a new wording as 2 has it, or a new Vibe as 3 has it' \
        'comes with two meaningfully different alternatives beside it' \
        'never a bare *"or I can make a new one"*' \
        'Each is concrete: another of their Vibes the film fits, or a new Vibe — a name, a sentence and its Genres, any new Genre'"'"'s meaning shown, with this film as its core' \
        'Say in one line which you recommend and why' \
        'a reply that does not make clear which they chose is asked about once, before anything is written' \
        '**When both make sense.**')" "True"
check "a fitting Vibe is no longer offered with nothing beside it" \
    "$(grep -c 'with nothing more offered' "$SKILL")" "0"
# Vibe refit: a film filed in one of their Vibes never led to a new wording when it fitted
# confidently — the trigger read "does not yet say what makes it fit", which a confident fit
# answers — and a loved film never led to a core offer where the core was only liked. Both are
# weighed every time, inside the one offer, and nothing is written without a yes.
check "step 1 weighs the Vibe's sentence and core for the film, every time, inside the one offer" \
    "$(order_check '1. **One of their Vibes, where it is that evening.**' \
        'If one is that evening, it is your recommendation: propose' 'filing the film' \
        "and, every time, weigh that Vibe's sentence and its core for this film" \
        'as *Filing it in one of their Vibes* says, inside the same offer')" "True"
check "step 2's trigger is a part of the sentence true of the core but not of this film" \
    "$(order_check '2. **A minimal change, only when needed, and only on their yes.**' \
        "a part of the Vibe's sentence is true of its core but not of this film" \
        'exact new wording — the smallest change that covers it')" "True"
check "the old trigger a confident fit read as covered is gone" \
    "$(grep -ciE 'just does not yet say what makes it fit' "$SKILL")" "0"
check "the refit rule: whenever a liked or loved is offered for a Vibe, both parts of the one offer" \
    "$(order_check '### Filing it in one of their Vibes: its sentence and its core' \
        'Whenever a film they liked or loved is offered for one of their Vibes' \
        'the recommendation as 1 has it, that Vibe as an alternative, or a move for a kept one' \
        'before you make the offer, every time' \
        'both are parts of the one offer: never an offer of their own, never made after it, and never written without their yes' \
        '### What to consider, and what to offer')" "True"
check "the sentence, part by part: true of both stays, and a film arriving is no reason" \
    "$(order_check '**Its sentence, for both films.**' \
        "Read the Vibe's sentence part by part against its core and against this film" \
        '**Every part true of both** → it stays as it is, and nothing about it is offered' \
        'A film arriving is never a reason on its own to change their sentence')" "True"
check "a part true of the core alone is loosened or dropped; what the evening is about is not" \
    "$(order_check '**A part true of the core alone**' \
        'a place, a time, a detail only that one film has' \
        'while this film belongs to the same evening without it → the exact new wording, as 2 says' \
        'that part loosened or dropped, the smallest change that makes the sentence true of both' \
        'the rest in their words as they wrote it' \
        '**The part it lacks is what the evening is about** → it is not that evening, and it is not filed there: go on to 3')" "True"
check "a new wording only takes away: never the new film's, never their reason, never wider" \
    "$(order_check 'A new wording only ever takes away what is true of the core alone' \
        'It never adds what is true of this film alone, and never their reason for liking it' \
        'that reason is theirs, in `because`, and a Vibe stretched to carry it loses it' \
        'never the two added together, so it never widens the Vibe beyond what it meant')" "True"
check "a new wording keeps the core whole, every film they stand behind, the name and Genres, and names no film" \
    "$(order_check 'It leaves the core fitting wholly, every film in it they liked or loved fitting still, and its name and Genres as they are' \
        'a change that needs another name or other Genres is another evening' \
        'It names no film')" "True"
check "a loved film is offered as the core where the core is only liked, named against the one that stays" \
    "$(order_check '**Its core, when this one is loved.**' \
        'When this film is `loved` and the Vibe'"'"'s core stands only `liked`' \
        'ask whether this film embodies the Vibe wholly' \
        'If it does, offer it as the core too, named against the current one' \
        'that they loved this one, and that the current one stays in it')" "True"
check "no core offer where the core is loved or has no verdict, for a liked film, or one needing a new wording" \
    "$(order_check '**Its core, when this one is loved.**' \
        'Not when the core is loved or has no verdict of theirs' \
        'not when this film is only liked' \
        'not when it fits only with a new wording' \
        'a film the sentence has to change for does not embody it wholly')" "True"
check "loved is the reason to ask, never the answer, and a core never changes on a verdict alone" \
    "$(order_check 'Loved is the reason to ask, never the answer' \
        'a loved film that fits less fully than the core is not offered' \
        'a core never changes because of a verdict alone')" "True"
check "each part its own: a yes to part writes that part, and a turned-down part is not offered again" \
    "$(order_check 'A new wording and a new core are each a part of the offer, said as its own part' \
        'a yes to part of it writes that part alone' \
        'a yes only to filing it is not a yes to the core' \
        'Whatever they turn down stays as it is, and is not offered again in this conversation')" "True"
check "the offer shows a new core with the film that anchors it now, which stays" \
    "$(order_check 'A new wording, as 2 says, is shown exactly' \
        'and a new core is named with the film that anchors it now, which stays in it' \
        '**Exactly two films show each of the three**')" "True"
check "a film agreed as the core is filed by update_vibe, and the old core stays" \
    "$(order_check 'On their yes, write exactly what they agreed' \
        'A film they agreed should anchor one of their Vibes is filed by `update_vibe` with it as `core` instead' \
        'with its `core.viewing` if it is not saved yet' \
        'and the film that anchored it stays there')" "True"
check "the kept path: a move weighs its Vibe, and a loved film may be its Vibe's core" \
    "$(order_check '**A move to a Vibe whose instruction it fits better**' \
        "with that Vibe's sentence and core weighed for it as *Filing it in one of their Vibes* says" \
        '**A new core for a Vibe**' \
        'or, for a film they loved in a Vibe whose core stands only liked, when it embodies it wholly' \
        'as *Its core, when this one is loved* says')" "True"
check "a new wording or a new core is inside the one offer, never a second one" \
    "$(order_check '**Asking has a budget.**' \
        'A new wording or a new core goes inside that one offer, never in a second one after it')" "True"
check "writing: a core filed by its own call, a new wording before the film is filed under it" \
    "$(order_check '`update_vibe` with the core. The film it replaces stays' \
        'A film being filed as the core is filed by this call' \
        'so 3 writes nothing more for it' \
        '**a new wording** — `update_vibe` with exactly the sentence they agreed, before the film is filed under it' \
        'in the same call as a new core where there is one' \
        '`update_movie` with the one agreed Vibe')" "True"
check "the table: a loved film may be offered as the core of a Vibe whose core is only liked" \
    "$(sed -n '/### What each kind of statement writes/,/^## /p' "$SKILL" \
        | grep -c 'a Vibe whose core stands only liked may be offered this film as its core')" "1"
# Vibe offer copy: after a liked, the reply explained how Tonight stores a liked and gave three
# options heavy with Genres. The offer is short and in their terms, and none of it is a report.
check "the offer is said briefly: an acknowledgement, and nothing about how Tonight keeps things" \
    "$(order_check '**Two concrete alternatives, always.**' '**When both make sense.**' \
        '**Said briefly, in their terms.**' \
        'This offer, and a new Vibe offered for a kept one, is a few short lines' \
        'never a report on how Tonight works' \
        '**A brief, natural acknowledgement** of what they said opens it, and nothing about how Tonight keeps things' \
        'never that the liked is saved before it is, and never why it is not yet' \
        'are yours to act on, not theirs to read' \
        'is said in a few plain words' \
        'On their yes, write exactly what they agreed')" "True"
check "the recommendation first, then two alternatives, each a name and a short sentence" \
    "$(order_check '**Said briefly, in their terms.**' \
        '**The recommendation first, plainly said to be the one you recommend**' \
        'Each is its name and what it means in a short sentence — for a new Vibe,' \
        'the sentence written on a yes, with its Genres named in passing: one of theirs by its name alone, a new one with its meaning in a short phrase, the meaning its instruction is written with' \
        'A new wording, as 2 says, is shown exactly' \
        '**Exactly two films show each of the three**' \
        '**No Genre explained at length**, no films listed beyond those, and no other names for one' \
        '**One simple question** closes it' \
        'with the question about when folded in where it is owed')" "True"
# Vibe discovery: every Vibe in the offer is shown by exactly two films that set it apart — the
# recommended one and both alternatives, up front — named and never written.
check "each of the three shows exactly two films that set it apart, by title and year alone" \
    "$(order_check '**The recommendation first, plainly said to be the one you recommend**' \
        '**Exactly two films show each of the three**, the recommended one and both alternatives' \
        'title and year and nothing more' \
        'for each, two other films that say at once what sets that evening apart from the two beside it' \
        'the most representative you can name' \
        'six films in all, none shown for two of them' \
        'For one of their Vibes, films it already holds may be among its two' \
        'and no other film is said to be in it')" "True"
check "those films are illustration: never written, filed, a core, a viewing or a verdict" \
    "$(order_check '**Exactly two films show each of the three**' \
        '**They are illustration only**, like every film named to show an idea' \
        'never written, never filed, never made a core, never given a viewing or a verdict' \
        'any more they ask for are named on the same terms')" "True"
check "a film named to show an option is never written" \
    "$(order_check '**Never written:**' 'a film you named only as an illustration')" "True"
check "the old ban on any illustration film in the offer is gone" \
    "$(grep -c 'no films listed to illustrate an option' "$SKILL")" "0"
check "films for the recommended one alone, and none for an alternative until asked, are gone" \
    "$(grep -ciE 'Two or three films show the recommended one|The alternatives name none|show the recommended Vibe that way' "$SKILL")" "0"
# Posters are the host's to give: looked up with its own film or image tools for every film in
# the offer, never invented, and the film's title and year alone wherever none came back.
check "each film's poster from the host's own tools, all three alike, never invented" \
    "$(order_check '**One simple question** closes it' \
        '**Laid out to be taken in on a phone, with their posters.**' \
        "Where the host has its own film or image tools, look up each of the six films with them and show its poster beside it" \
        'all three options alike, as a card where the host can show one' \
        'A poster is only one those tools returned for that film, that title and year' \
        'never one you made, generated, or guessed or built a link to' \
        "A new user's first films keep the offer their own section gives them")" "True"
check "with no poster returned, or no such tools, the title and year alone, and nothing said" \
    "$(order_check '**Laid out to be taken in on a phone, with their posters.**' \
        'A film they return none for, and every film on a host with no such tools, is shown by its title and year alone' \
        'and nothing is said about it — never promise a poster, and never explain a missing one')" "True"
# Behavior runs: an alternative laid out as a name and a sentence alone lost its Genres, which a
# yes needs to have been shown — the layout keeps them, in passing, on every line, and its films.
check "without a card, plain Markdown: each option its Genres and two films, nothing wide" \
    "$(order_check '**Laid out to be taken in on a phone, with their posters.**' \
        'Without a card, the same lines in plain Markdown read as well' \
        "the recommended Vibe's name in bold, its sentence and its Genres in passing, its two films in italics with their years" \
        'each alternative one line, its name in bold, its sentence and its Genres in passing, its two films in italics with their years' \
        'No table, no headings, nothing to scroll sideways')" "True"
check "no layout line drops an alternative's Genres" \
    "$(grep -c 'its name in bold and its sentence\.' "$SKILL")" "0"
check "a new user's first films keep their own offer, illustration films and all" \
    "$(order_check '**Said briefly, in their terms.**' \
        "A new user's first films keep the offer their own section gives them" \
        "## A new user's first films" 'and exactly two illustration films')" "True"
# Code review 1: whenever Tonight proposes Vibes, each is shown with its two films and posters —
# the offer after a liked, a film they keep, and a new user's first films alike.
check "every Vibe proposed anywhere is shown with its two films and posters, the same way" \
    "$(order_check '**Laid out to be taken in on a phone, with their posters.**' \
        "A new user's first films keep the offer their own section gives them" \
        'Every Vibe proposed anywhere — here, for a film they keep, or from a new user' \
        'is shown with its two films this way')" "True"
# The shape is said abstractly: no reply to copy, so nothing quoted inside it.
check "the offer's shape quotes no example reply" \
    "$(sed -n '/^\*\*Said briefly, in their terms\.\*\*/,/^On their yes, write/p' "$SKILL" | grep -c '"')" "0"
# docs/work/vibe-hypotheses §17: the workflow fixes kept from the live runs, said without
# any of the hypothesis machinery — no second question about when, the viewing a liked moved.
check "a yes that says nothing about when is seen-before, and when is never asked again" \
    "$(order_check 'On their yes, write exactly what they agreed' \
        '**A yes that does not say when is them not saying**' \
        'if nothing they said in this conversation placed it either, the film is written `seen-before` with it' \
        'timing they did give stands, and a seen viewing already stored is kept' \
        'and when is never asked again')" "True"
check "a no keeps an unsaved film unsaved, and a saved one keeps its captured viewing" \
    "$(order_check 'On a no, or a change of subject, the liked or loved stays unsaved' \
        'A film not saved yet stays unsaved; a saved one keeps the viewing their liked already moved')" "True"
check "a liked said now moves a want-to-see film before anything is offered or asked" \
    "$(order_check '**A liked or loved they tell you now is them telling you they watched it.**' \
        '**Write it before you offer or ask anything, and never ask about when first**' \
        'their answer, if they give one, corrects it')" "True"
# §17: the one change to 1.9.1 — a kept one's single new Vibe is offered the way step 3
# already offered one: a recommended Vibe and two meaningfully different alternatives.
check "a kept one's new Vibe is offered as step 3 offers one" \
    "$(order_check '**A new Vibe**, at most one, anchored on this film' \
        'none of their Vibes holds' \
        'Offer it as step 3 of *When a liked or loved needs a Vibe* does: one recommended new Vibe and two meaningfully different alternatives, three different evenings the film could stand for')" "True"
# §18: Flash offered one Vibe with other names for it. The kept path says what step 3 says.
check "a kept one's two alternatives are other evenings, not other names for one idea" \
    "$(order_check 'Offer it as step 3 of *When a liked or' \
        'three different evenings the film could stand for, not three names for one idea')" "True"
check "a kept one: both where a new wording of its Vibe would hold that evening too; a new Vibe moves it" \
    "$(order_check 'not three names for one idea' \
        'minimal change to the Vibe it is in would hold that evening too — one its core still fits wholly' \
        '— offer both, as *When both make sense* says' \
        'the new Vibe anchored on it takes it out of the Vibe it is in: say so in the offer' \
        'A film that anchors the Vibe it is in cannot anchor a new one' \
        'so offer no new Vibe on it')" "True"
check "a kept film no longer stays in its Vibe whatever is chosen" \
    "$(grep -ciE 'stays in that Vibe either way' "$SKILL")" "0"
check "none of the hypothesis, title or ranking machinery is back" \
    "$(grep -ciE 'three hypotheses|chosen by title|my pick|titles lead|facet|ranks them|subject of their reason|readings of their words|beside 1' "$SKILL")" "0"
# The skill names no film, Vibe or Genre from the evaluation's scenarios, or any other —
# except main's worked proposal (§24), pinned below.
check "no scenario film or Vibe survives anywhere in the skill" \
    "$(grep -ciE 'Bloom|Champagne|Blueprints|Masterminds|Paterson|Logan Lucky|Knives Out|Palm Springs|Groundhog|dialogue was so sharp|stupid thing|Dawn of the Dead|Shaun of the Dead|Hot Fuzz|Laugh Till It Hurts|Smooth Operators' "$SKILL")" "0"
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
check "a merge deletes into the Vibe that stays, which moves every film, the core included" \
    "$(order_check '**Overlap**' 'delete the other with `delete_vibe` and `move_to` naming the one that' \
        'which moves every film in it there — its core included, as an ordinary film — in the' \
        'Without `move_to` it refuses to leave a liked or loved film in no Vibe' \
        'a core cannot leave its Vibe any other way')" "True"
check "asking has a budget: one offer, one new Vibe, no re-offer, no nagging" \
    "$(order_check '**Asking has a budget.**' 'At most one offer per statement' \
        'at most one new Vibe in it' 'is not offered again in this conversation' 'Never nag')" "True"
check "the budget: a vibe_required offer or a kept one's new Vibe is one offer, of which they pick one" \
    "$(order_check '**Asking has a budget.**' \
        'a `vibe_required` offer, or a new Vibe for a kept one, is still one offer: its recommended Vibe and' \
        'two alternatives, of which they pick one' \
        'and so is one that offers both, as *When both make' 'sense* says')" "True"
check "an owed answer comes first and whole, and an offer never displaces it" \
    "$(order_check '**When a film answer is owed**' 'the answer' 'comes first and whole' \
        'it never displaces the lead or the' 'directions' 'it waits for the next turn')" "True"
# Skill cleanup: "comes first" is the reply's order, never the calls' — record_verdict stays first.
check "first is about the reply, and record_verdict is still the turn's first call" \
    "$(order_check '**When a film answer is owed**' 'comes first and whole' \
        'First is about the reply — the answer before any offer — never about the calls: `record_verdict`' \
        "is still the turn's first" 'The offer may be the answer')" "True"
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
        '`update_movie` with the one agreed Vibe' \
        'One short sentence saying what was written')" "True"
check "what is never written" \
    "$(order_check '**Never written:**' 'a film you named only as an illustration' \
        'a paraphrase of their reason' 'a' 'stronger judgement than theirs' \
        'an occasion, daypart or attention field anywhere' \
        'a Vibe, a' 'membership or a core without their yes' \
        'any record that a Vibe offer was made or turned down')" "True"
# One Vibe per film: a new core is filed in its Vibe alone, moved from any other by the call that
# anchors it, and a further film's list names one Vibe — the dual-membership write is gone.
check "a core is filed in its Vibe alone, moved by the anchoring call, and another Vibe's core is refused" \
    "$(order_check 'Either way the core is filed in that Vibe alone' \
        'one filed in another Vibe is moved out of it' 'by the same call, and nothing more is written for it' \
        'One that anchors another Vibe is refused')" "True"
check "a further film is filed in one Vibe, and filing one filed elsewhere is an agreed move" \
    "$(order_check '3. Further films — `update_movie` with the one agreed Vibe' \
        'A film is in one Vibe at most, so the list names one' \
        'it is a move out of the Vibe it was in — agreed as a move')" "True"
check "no write lists a film in a new Vibe and the one it was in" \
    "$(grep -ciE 'lists the new Vibe and that one|the Vibes it is in now plus the agreed ones' "$SKILL")" "0"
check "the table includes the opt-out and the not-tonight" \
    "$(order_check 'They liked it, and want no more of the kind' 'they declined more of the kind' \
        'They turn it down for one evening, with a reason' 'nothing about Vibes')" "True"

echo
echo "--- keeping a film, and proposing a Vibe ---"

check "which Vibe a kept film goes in is a classification" \
    "$(order_check 'not *"may I save this?"* but *"what kind of night' \
        'Classify the film; do not fit it to what is there')" "True"
# Discover the Vibe first, in the saving flow: what kind of night it is comes first, from the film
# and their words, and their Genres and Vibes only then — for the one that is that night.
check "a kept film: its night first, from the film and their words, then the Vibes for that night" \
    "$(order_check 'Classify the film; do not fit it to what is there' \
        'Answer that question first, from the' 'film and anything they said about it, as *Discover the Vibe first* says' \
        'and only then read the' 'Genres and Vibes for the one that is that night' \
        '**One genuinely fits** — it is that night, not a neighbour → save it there')" "True"
check "the saving flow no longer reads the Genres and Vibes first" \
    "$(grep -ciE 'Read the Genres and Vibes first' "$SKILL")" "0"
check "a Vibe that genuinely fits is used, and nothing further is asked" \
    "$(order_check 'One genuinely fits' 'ask nothing further')" "True"
check "an existing Vibe is not a bucket, and its meaning is never widened to fit" \
    "$(order_check 'One nearly fits' 'not a bucket' \
        'Never stretch a Vibe to avoid making one' 'a different evening is a different Vibe')" "True"
check "with no good fit the film waits, and a Vibe is devised rather than asked for" \
    "$(order_check 'None fits' 'do not save the film yet' \
        'Reuse the Genres that genuinely fit and, for' 'anything no Genre covers, a new one' \
        'then propose a Vibe' 'over them, any new Genre part of what you propose' \
        '**Nothing is created before their yes.**' \
        'Never ask which Vibe they want' 'that judgement is yours')" "True"
# Skill cleanup: "create one … then propose" put a Genre write before the yes.
check "no Genre is created before the proposal" \
    "$(tr '\n' ' ' < "$SKILL" | grep -ciE 'create +one for +anything')" "0"
check "the write constraints point at the tools that state them" \
    "$(order_check "What a Vibe's name has to earn" \
        'arrive with `create_genre` and `create_vibe`')" "True"
# Code review 1: a film they keep gets the same offer as one they liked — one recommended Vibe
# and two alternatives, other evenings, each with its two films and their posters.
check "a kept film's proposal: one recommended Vibe and two alternatives, three evenings" \
    "$(order_check '**Proposing a new Vibe:** one recommended Vibe and two meaningfully different alternatives' \
        'three different evenings the film could stand for, not three names for one idea')" "True"
check "the Vibe is proposed conversationally, named, explained and anchored, then asked about" \
    "$(order_check 'Say what you' 'noticed; then, for each, name it, say what it means, name its core' \
        'Say in one line which you recommend and why, then ask which' \
        'closed by one question: which to make')" "True"
check "the proposal names its Genres, and what a new one would mean" \
    "$(order_check 'name its core, name its Genres with what any new one would mean' \
        'make it concrete')" "True"
check "each option is made concrete by exactly two films, shown as the offer after a liked shows them" \
    "$(order_check 'make it concrete with exactly two other films that would belong in it' \
        'shown as the offer after a liked shows them' \
        '*Said briefly, in their terms* and *Laid out to be taken in on a phone*' \
        "their posters where the host's own tools return them, title and year where they do not")" "True"
check "one film may anchor all three, and a reply that does not say which is asked about once" \
    "$(order_check '**The core is not one of them**' \
        'One film may anchor all three, since only the one they pick is written' \
        'Their pick is what is written, and a reply that does not make clear which they chose is asked about once, before anything is written' \
        '**A no settles it**')" "True"
# §24: main's worked proposal is kept, the one example: it shows a new Genre named with its
# meaning — now as one recommended Vibe and two alternatives, two films each.
check "the worked proposal shows a new Genre with its meaning, and three Vibes with two films each" \
    "$(order_check 'Proposed, that sounds like:' '**Everybody Has' \
        'one new Genre, Double-cross: plots where nobody at the table is telling the truth' \
        'The Sting (1973), Before the Devil Knows' \
        '**The Job Goes Wrong**' 'Dog Day Afternoon (1975), Good Time (2017)' \
        '**Pressure Cooker**' '12 Angry Men (1957), The Hateful Eight (2015)' \
        'Which shall I make?"*' 'Said briefly, laid out as the offer after a liked is')" "True"
check "the worked proposal is the only one" \
    "$(grep -c 'Proposed, that sounds like' "$SKILL")" "1"
# The keep flow's other names are gone: its alternatives are other Vibes, as everywhere.
check "a kept film's alternatives are other evenings, never other names" \
    "$(order_check 'The alternatives are there because an evening is easier to judge against another evening than on its own' \
        'other Vibes, other evenings the film could stand for — never other names for the same one, here as wherever a Vibe is proposed')" "True"
check "three to five films and other names for a kept film's Vibe are gone" \
    "$(grep -ciE 'three to five other films|names it could have instead|The alternative names are there|with its other names' "$SKILL")" "0"
# §22: first films are left to their own section, as on main — not listed beside step 3's
# single-film offer, where Flash read them as one offer to pick one Vibe from.
check "first films are not listed beside step 3's single-film offer" \
    "$(grep -c 'or first films' "$SKILL")" "0"
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
    "$(order_check 'then say something about one, that is a new statement about a film')" "True"

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
# §23: main's wording for the alternatives, restored; "other evenings those films could stand
# for" was read as one offer of three evenings to pick one from.
check "each first-films Vibe comes with two meaningfully different alternatives, main's wording" \
    "$(order_check '**This is the one offer that may hold several Vibes**' \
        'two meaningfully different alternatives' 'beside it' \
        'other reasons those films may have worked, not other names for one')" "True"
# Code review 1: each first-films Vibe is recommended with its two alternatives, each of the three
# with exactly two films shown as the offer after a liked shows them.
check "first films: each Vibe recommended with two alternatives, two films each, with posters" \
    "$(order_check '**This is the one offer that may hold several Vibes**' \
        'each one recommended with two meaningfully different alternatives' \
        'each of the three an instruction, its Genres, its core, and exactly two illustration films' \
        'shown as the offer after a liked shows them' \
        "their posters where the host's own tools return them, title and year where they do not")" "True"
check "three or four illustration films for a first-films Vibe are gone" \
    "$(grep -c 'three or four illustration films' "$SKILL")" "0"
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
    "$(order_check 'Never add a Genre whose meaning one of theirs already' 'has, under a different name')" "True"
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
        '`create_movie` with `viewing` `seen-now` or `seen-before` and its Vibe' \
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
check "asking not to be offered it again is dont-want-to-see, never disliked, and no Vibe talk" \
    "$(order_check 'They ask not to be offered it again' \
        '`dont-want-to-see` on the film — a viewing, not a verdict, and never `disliked`, which says they watched it' 'nothing about Vibes')" "True"
check "not tonight is at most a pass on that evening, with their reason" \
    "$(order_check 'They turn it down for one evening, with a reason' 'at most a pass on that evening, their reason with it — it is about an evening, not the film' 'nothing about Vibes')" "True"
# M9: the attribution rule, whole, where Vibes meet a watched film — the update
# on an unambiguous reference, the new evening of their own, and no evening at
# all when it is unclear. Code review 1: the first half alone was not the rule.
check "a watch last night is a viewing, never a verdict" \
    "$(order_check '**Watching is not an opinion.**' \
        'Saying they watched it is a viewing, never a verdict.')" "True"
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
    "$(order_check 'They say they watched it recently' \
        '`started` on a recorded evening only when they referred to it' \
        'a new evening of their own when they named none you recorded' \
        'no evening when it is unclear')" "True"
check "the old route to a viewing or an evening is gone" \
    "$(grep -ciE 'a viewing or an evening|written nowhere' "$SKILL")" "0"
check "going through Vibes re-anchors a core not seen like a missing one" \
    "$(order_check '**Anchor.**' 'A Vibe whose core reads anything' 'but `seen-now` or `seen-before` is anchored again in the same way, as one with no core')" "True"
check "a recent watch is seen-now in the table" \
    "$(order_check 'They say they watched it recently' 'a viewing, `seen-now`')" "True"
# The table describes what was said rather than quoting it: no example sentence in its first column.
check "the table quotes no example sentence" \
    "$(sed -n '/### What each kind of statement writes/,/^## /p' "$SKILL" | grep -c '^| \*"')" "0"

echo
printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
