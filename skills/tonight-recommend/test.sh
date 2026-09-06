#!/usr/bin/env bash
# Tonight recommend-skill contract tests.
#
#   ./test.sh
#
# Markdown *contract regression* tests: they catch deletion and edit of an
# explicit contract rule, not every sentence that could contradict one.
#
# The rules this suite exists for: there is no setup phase, an empty taste model
# is answered with a film question rather than onboarding, Tonight holds no film
# catalogue and never chooses, what gets written down is what the user said and
# never what the agent concluded, and nothing is inferred from silence or from
# what was recommended.
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

echo "--- one skill, and the removed ones stay removed ---"

check "recommend is the only skill" \
    "$(ls -1 "$SKILLS_DIR" | sort | tr '\n' ' ')" "tonight-recommend "
check "no setup skill directory has come back" \
    "$([ -e "$SKILLS_DIR/tonight-setup" ] && echo present || echo absent)" "absent"
check "no manage skill directory has come back" \
    "$([ -e "$SKILLS_DIR/tonight-manage" ] && echo present || echo absent)" "absent"
check "and nothing points at either of them" \
    "$(grep -ciE 'tonight-setup|tonight-manage' "$SKILL")" "0"

echo
echo "--- frontmatter ---"

check "the file opens with the YAML delimiter, no leading blank line" \
    "$(sed -n '1p' "$SKILL")" "---"
check "the name is the skill own name" \
    "$(sed -n '2p' "$SKILL")" "name: tonight-recommend"
check "there is a description, and the block closes on line 4" \
    "$(sed -n '3p' "$SKILL" | cut -c1-12)|$(sed -n '4p' "$SKILL")" "description:|---"

# The frontmatter is what a host reads to decide whether this skill applies, so
# all three ways into the conversation have to be visible in it. Keyword-level on
# purpose: the sentence may be reworded freely, the three entry points may not
# quietly drop to two.
entry_points="$(sed -n '3p' "$SKILL" | grep -oiE 'watch|inspect|chang' \
    | tr '[:upper:]' '[:lower:]' | sort -u | tr '\n' ' ')"
check "the description is discoverable for watching, inspecting and changing" \
    "$entry_points" "chang inspect watch "

echo
echo "--- there is no setup phase ---"

check "the skill states its single job as the watching question" \
    "$(order_check 'Answer *"what do you want to watch tonight?"*' 'what do you want to watch tonight?')" "True"
check "setup is ruled out, and the model grows from real conversations instead" \
    "$(order_check 'There is no setup' \
        'wants a film, not a configuration' \
        'accumulates from real conversations rather than something')" "True"
check "the loop is stated: want to watch, recommend, the model grows" \
    "$(order_check 'want to watch' 'recommend' 'the model grows' \
        'better context next time')" "True"
check "an empty model is context missing, not a reason to stop" \
    "$(order_check 'never a reason to stop' \
        'Read the model first with `get_taste`' \
        'context, not a prerequisite')" "True"

echo
echo "--- ask a film question, or none at all ---"

check "a sufficient request is answered rather than interrogated" \
    "$(order_check 'Enough said already? Recommend' \
        'One question about films')" "True"
check "the good and bad questions are shown side by side" \
    "$(order_check 'One question about films' \
        'More clever mystery, or more action?' \
        'What genres do you like?')" "True"
check "the database question is named as the wrong one" \
    "$(grep -c 'What Genres should I save?' "$SKILL")" "1"
check "nobody has to understand the data model to get a film" \
    "$(order_check 'Never make somebody understand Genres and Mixes to get a film')" "True"

echo
echo "--- the tool-orchestration boundary ---"

check "Tonight holds the taste model and nothing else" \
    "$(order_check 'Tonight holds the taste model and nothing else' \
        'No catalogue and no lookup' \
        'nothing about it was ever fetched')" "True"
check "film knowledge and film tools sit beside Tonight, not inside it" \
    "$(order_check 'your film knowledge and film tools sit beside it' \
        'sit beside it')" "True"
check "never look in Tonight for films to recommend, and never write the model elsewhere" \
    "$(order_check 'Never look in Tonight for films to recommend' \
        'Never write a Genre, a Mix or a Movie anywhere but Tonight' \
        'no Tonight tool that takes a taste and returns films')" "True"
check "there is no Tonight tool that chooses films, and none is planned" \
    "$(order_check 'The choosing is yours' \
        'no Tonight tool that takes a taste and returns films' \
        'not going to be one')" "True"

echo
echo "--- a Mix is the recommendation idea ---"

check "genre and mix are defined as component and combination" \
    "$(order_check '**Genre** — one reusable component of what they like' \
        '**Mix** — their Genres plus what the')" "True"
check "a mix is read as its own instruction plus its genres" \
    "$(order_check 'Read a Mix as' \
        'own instruction plus the instructions of its Genres' \
        'in that order')" "True"
check "an exclusion outranks a preference" \
    "$(order_check 'rules out' 'counts as much as what it asks for' \
        'worse than none')" "True"
check "the idea leads the answer, and the model is not printed at the user" \
    "$(order_check 'the idea first, named the way a Mix is named' \
        'Never print the taste model while' \
        'No field names')" "True"

echo
echo "--- a Mix is named, not labelled ---"

# The distinguishing product idea. A Genre is named for what it is and a Mix for
# what it feels like, and the failure is always in the same direction: a helpful
# assistant restating the ingredients. Both halves are pinned — the rule, and
# examples of each kind — because the rule alone reads as a matter of taste until
# `Popcorn Chaos` and `Funny action` are sitting next to each other.
check "the two kinds of name are distinguished, in that order" \
    "$(order_check 'A Mix name is evocative, not descriptive' \
        'A **Genre** is named for what it is' \
        'A **Mix** is named for what it *feels* like')" "True"
check "evocative names are shown, not just asked for" \
    "$(order_check 'Space Tension' 'Popcorn Chaos' 'Quiet Dread')" "True"
check "descriptive names are shown as the failure they are" \
    "$(order_check '`Funny action`' '**not Mix names**' 'it has been' 'labelled')" "True"
check "the test for a name is stated as a test" \
    "$(order_check 'if knowing only the Genres already tells you' \
        'the name is doing no work')" "True"
check "naming is the assistant's to do, and may not widen the idea" \
    "$(order_check 'Proposing a name is yours' \
        'Name the thing they said' 'Never name a bigger thing')" "True"

echo
echo "--- the model grows from what was said ---"

check "the idea just used is the Mix, and its parts are the Genres" \
    "$(order_check 'The idea you just used' '**is** a Mix' \
        'Writing them down is how Tonight gets better at this')" "True"
check "a Genre is reused before it is created, and near-duplicates are called out" \
    "$(order_check 'Reuse a Genre before you create one' \
        'A near-duplicate splits one taste in two' \
        'do not add `Slow-paced`')" "True"
check "a Mix is the opposite case: reused when it fits, proposed when it does not" \
    "$(order_check 'A Mix is the opposite case' \
        'Reuse one when it genuinely covers the evening' \
        'Never stretch a Mix' 'instruction to avoid a second Mix')" "True"
check "a Mix has to say something its Genres do not" \
    "$(order_check 'if I knew only its Genres, what would I get wrong' \
        'it is not a Mix')" "True"
check "the write constraints that would otherwise fail a call are stated" \
    "$(order_check 'A Genre always needs an instruction' \
        'a Mix needs at least one existing Genre' \
        'a Mix is built from Genres only')" "True"

echo
echo "--- persistence: expressed, never inferred ---"

check "the rule names both routes in, and rules inference out" \
    "$(order_check 'durable taste they express or confirm' \
        'Never persist what you conclude alone')" "True"
# The second route into the model, and the reason it is not the first: a pattern
# the agent noticed may be put to the user, and their yes is what makes the
# meaning theirs. Pinned because the rule above it, read alone, forbids it.
check "a noticed pattern may be asked about, and never assumed" \
    "$(order_check 'want me to remember the kind of thing this is' \
        'A conclusion they have confirmed' \
        'a pattern to ask about, not a preference')" "True"
check "a confirmation grounds only the meaning that was made plain" \
    "$(order_check 'only the meaning they could see themselves agreeing to' \
        'reaches further than the last thing said')" "True"
check "the asking is about taste, not about permission to write" \
    "$(order_check 'asks about their taste' \
        'somebody who has just said plainly what they like has already answered it')" "True"
check "it is explicitly not a save-confirmation dialog" \
    "$(order_check 'it is not asking permission' \
        'would you like me to save this' \
        'The question is not whether they clicked save')" "True"
check "a standing preference and a one-night mood are told apart" \
    "$(order_check 'Tonight I feel like slow science fiction' \
        'what they want now, not what they are like' \
        'I love slow science fiction' \
        'A standing preference, stated plainly')" "True"
# The write-authorising section has to agree with the table: a request for
# tonight is usable immediately and persists nothing by itself.
check "both routes may create, and a bare request for tonight may not" \
    "$(order_check 'component they expressed or confirmed' \
        'Wanting something tonight is not saying it' \
        'leaves nothing behind')" "True"
check "a recommendation with no feedback persists nothing" \
    "$(order_check 'You recommended a film. They said nothing' '**nothing**')" "True"
check "silence, recommendations and patterns are all ruled out as evidence" \
    "$(order_check 'infer a preference from silence, from a film you recommended, or from a pattern')" "True"
check "the user own words are never reworded, nor widened into a claim about them" \
    "$(order_check 'reword their instruction' \
        'widen something specific into a claim about the person')" "True"
check "a suggested change is offered rather than made" \
    "$(order_check 'Say so and let them decide' 'Editing it yourself is not' \
        'The model is theirs')" "True"

echo
echo "--- explicit management is handled here, not redirected ---"

check "one skill does not mean one intent: a direct request is done, not deflected" \
    "$(order_check 'it is not the only thing you will be asked' \
        'rename my Sci-Fi genre to Spacey' \
        'do it and answer')" "True"
check "and the reverse is what must not happen" \
    "$(order_check 'a request for a film turning into a configuration session')" "True"
check "the CRUD tools are named as the way to do it" \
    "$(order_check '## Asked about the model directly' \
        '**do those**' \
        'call `get_taste` and say what is there in ordinary sentences')" "True"
check "nobody is sent to the website for something the conversation can do" \
    "$(order_check 'is *a* management surface, not *the* one' \
        'Do not send somebody to the website for something you can do in the')" "True"
check "a read-back is answered by describing the model, which is otherwise discouraged" \
    "$(order_check 'while recommending' \
        'A read-back is the easy case' \
        'describing it is what was asked for')" "True"
check "an asked-for rename needs no ceremony, but a meaning change is still not silent" \
    "$(order_check 'A rename they asked for needs no ceremony' \
        'Changing what something *means* unasked')" "True"

echo
echo "--- nothing is remembered but the model ---"

check "no history of any kind is kept" \
    "$(order_check 'The taste model and nothing else' \
        'no scored or star ratings' \
        'no watch history' \
        'never when')" "True"
check "a recommended film may return; a saved one is read rather than offered again" \
    "$(order_check 'a film you recommended can come back' \
        'nothing is learned automatically' \
        'A film they saved is different' \
        'Read its state')" "True"
check "a failed write is reported rather than claimed as a save" \
    "$(order_check 'Never claim something was stored when the tool refused')" "True"

echo
echo "--- a Movie is the user's own object ---"

check "a Movie is theirs, by either of the two ways one comes to exist" \
    "$(order_check 'asked for it to be kept, or said something about it' \
        'A Movie is theirs, the same way a Genre or a Mix is' \
        'never an entry from a catalogue')" "True"
check "a Movie is named by its title and its year" \
    "$(order_check 'Title and year name it')" "True"
check "the three Movie tools are the way a direct request is done" \
    "$(order_check '`create_movie`, `update_movie`, `delete_movie`' \
        'Two requests write a Movie, and they differ')" "True"
check "a recommendation is not persistence, for a film as for a Genre" \
    "$(order_check 'A recommendation is not a saved Movie' \
        'Naming three films writes nothing down')" "True"
check "state is written only from what was expressed or confirmed" \
    "$(order_check 'Take the state from what they said, at its most specific')" "True"
check "nothing said is null and never false" \
    "$(order_check 'Nothing said is `null`, never `not_seen`' \
        'saving a film never makes it `not_seen`')" "True"
check "the clearest thing they said wins, and an opinion already means they saw it" \
    "$(order_check '*"loved it"* → `loved`' \
        'The last three already say they saw it' \
        'never ask for a state their sentence gave you')" "True"
check "the handle is settled before a write, and asking which film is not ceremony" \
    "$(order_check 'Settle title and year first' \
        'resolves *which film*' \
        'not permission')" "True"

check "keeping a film and recording a remark about one are different requests" \
    "$(order_check 'Two requests write a Movie, and they differ')" "True"
check "a film the user asks to keep goes into a Mix, and they need not know that" \
    "$(order_check 'Keeping a film goes into a Mix' \
        'Never write a Movie this way without at least one Mix' \
        'Nobody has to know that rule exists')" "True"
check "watched and liked are recorded without inventing a Mix for them" \
    "$(order_check 'Recording what they said does not' \
        'leave the Mixes alone' \
        'Never invent a Mix, or ask for one, to record' \
        'A later request to keep it takes a Mix')" "True"
check "a Mix that genuinely fits is used, and nothing further is asked" \
    "$(order_check 'Genuinely fits one they have' \
        'ask nothing further')" "True"
check "an existing Mix is not a bucket, and its meaning is never widened to fit" \
    "$(order_check 'Nearly fits' \
        'an existing Mix is not a bucket' \
        'a different evening is a different Mix')" "True"
check "with no good fit the film waits, and a Mix is devised rather than asked for" \
    "$(order_check 'None fits' \
        'do not save the film yet' \
        'Never ask them which Mix they want' \
        'that judgement is yours')" "True"
check "the Mix is proposed conversationally, named and explained, then asked about" \
    "$(order_check 'what you noticed, the name, what it means, then ask' \
        'Shall I make it?')" "True"
check "one yes creates the Mix and saves the film, with no second save question" \
    "$(order_check 'A yes is the whole of the permission' \
        'create any Genre it needs, then the Mix' \
        'Never ask a second time')" "True"
check "a no settles it, and never becomes a film saved loose" \
    "$(order_check 'A no settles it' \
        'never saving the film loose')" "True"
check "proposing a Mix belongs to saving, not to recommending" \
    "$(order_check 'Propose while saving, not while recommending')" "True"
check "a film in no Mix is a legitimate state, listed and left alone" \
    "$(order_check 'A film in no Mix is legitimate' \
        'website lists them under **Other movies**' \
        'Do not sort them' \
        'when they ask you to **keep** a film')" "True"

echo
echo "--- what this skill leaves out ---"

check "no embedded model, no catalogue, no provider, no lookup tool" \
    "$(grep -ciE 'anthropic|openai|claude api|tmdb|themoviedb|find_movies|search_movies' "$SKILL")" \
    "0"
check "no starter genres and no onboarding vocabulary" \
    "$(grep -ciE 'starter definition|starter set|onboarding|first-run setup|get_genre_defaults' "$SKILL")" \
    "0"

echo
printf '%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
