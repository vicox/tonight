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
# data and never chooses, what gets written down is what the user said and never
# what the agent concluded, and nothing is inferred from silence or from what was
# recommended.
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
    "$(order_check 'One job: answer' 'what do you want to watch tonight?')" "True"
check "setup is ruled out, and the model grows from real conversations instead" \
    "$(order_check 'There is no setup' \
        'wants a film, not a configuration' \
        'accumulates from real conversations rather than something')" "True"
check "the loop is stated: want to watch, recommend, the model grows" \
    "$(order_check 'want to watch' 'recommend' 'the model grows' \
        'better context next time')" "True"
check "an empty model is context missing, not a reason to stop" \
    "$(order_check 'Read the model first with `get_taste`' \
        'It is context, not a prerequisite' \
        'is **not** a reason to stop and set anything up')" "True"

echo
echo "--- ask a film question, or none at all ---"

check "a sufficient request is answered rather than interrogated" \
    "$(order_check 'If what they said is already enough, recommend' \
        'Asking anything before answering it wastes their time')" "True"
check "the good and bad questions are shown side by side" \
    "$(order_check 'ask one question about films' \
        'More clever mystery, or more action?' \
        'What genres do you like?')" "True"
check "the database question is named as the wrong one" \
    "$(grep -c 'What Genres should I save?' "$SKILL")" "1"
check "nobody has to understand the data model to get a film" \
    "$(order_check 'Never make somebody understand Genres and Mixes to get a film')" "True"

echo
echo "--- the tool-orchestration boundary ---"

check "Tonight holds the taste model and nothing else" \
    "$(order_check 'Two kinds of connection do different things' \
        'holds nothing else' \
        'no film catalogue, no lookup and no idea what a film is')" "True"
check "film knowledge and film tools sit beside Tonight, not inside it" \
    "$(order_check 'Whatever knowledge of films you bring' \
        'sit beside Tonight rather than inside it')" "True"
check "never look for films in Tonight, and never write the model elsewhere" \
    "$(order_check 'never look for films in Tonight' \
        'never write a Genre or a Mix anywhere but Tonight')" "True"
check "there is no Tonight tool that chooses films, and none is planned" \
    "$(order_check 'The choosing is yours' \
        'no Tonight tool that takes a taste and returns films' \
        'not going to be one')" "True"

echo
echo "--- a Mix is the recommendation idea ---"

check "genre and mix are defined as component and combination" \
    "$(order_check '| **Genre** | one reusable component' \
        '| **Mix** | one or more of their Genres, plus what the')" "True"
check "a mix is read as its own instruction plus its genres" \
    "$(order_check 'read a Mix as' 'its own instruction plus the instructions of the Genres' \
        'in that order')" "True"
check "an exclusion outranks a preference" \
    "$(order_check 'rules out' 'at least as carefully as what it asks for' \
        'worse than none')" "True"
check "the idea leads the answer, and the model is not printed at the user" \
    "$(order_check 'Lead with the idea, then the films' \
        'Do not print the taste model at them' \
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
    "$(order_check 'If knowing only the Genres already tells you the name' \
        'the name is doing no work')" "True"
check "naming is the assistant's to do, and may not widen the idea" \
    "$(order_check 'Proposing the name is yours to do' \
        'Name the thing they said' 'Never name a bigger thing')" "True"

echo
echo "--- the model grows from what was said ---"

check "the idea just used is the Mix, and its parts are the Genres" \
    "$(order_check 'The idea you just used' '**is** a Mix' \
        'that is how Tonight gets better at this without anybody configuring it')" "True"
check "reuse comes before create, and near-duplicates are called out" \
    "$(order_check 'Reuse before you create' \
        'do not add `Slow-paced`' 'A near-duplicate is worse than nothing')" "True"
check "a Mix has to say something its Genres do not" \
    "$(order_check 'if I knew only its Genres and not its instruction, what would I get wrong' \
        'it is not a Mix')" "True"
check "the write constraints that would otherwise fail a call are stated" \
    "$(order_check 'a Genre needs a name and an instruction' \
        'at least one Genre that already exists' \
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
    "$(order_check 'A conclusion they have confirmed' \
        'want me to remember the kind of thing' \
        'A yes makes the meaning theirs' \
        'a pattern is something to ask about, never something to assume')" "True"
check "a confirmation grounds only the meaning that was made plain" \
    "$(order_check 'only the meaning they could see themselves agreeing to' \
        'is enough' \
        'reaches further than that')" "True"
check "the asking is about taste, not about permission to write" \
    "$(order_check 'a question about their taste' \
        'somebody who has just said plainly what they like has already answered it')" "True"
check "it is explicitly not a save-confirmation dialog" \
    "$(order_check 'not the same as asking permission' \
        'would you like me to save this' \
        'The question is not whether they clicked save')" "True"
check "a standing preference and a one-night mood are told apart" \
    "$(order_check 'I love slow science fiction' 'A standing preference, stated plainly' \
        'Tonight I feel like slow science fiction' \
        'what they want now, not what they are like' \
        'ask nothing unless')" "True"
# The write-authorising section has to agree with the table: a request for
# tonight is usable immediately and persists nothing by itself.
check "a request for tonight leaves nothing behind on its own" \
    "$(order_check 'said this is how they are, or said yes when you asked' \
        'Wanting something tonight is not' \
        'leaves nothing behind')" "True"
check "a recommendation with no feedback persists nothing" \
    "$(order_check 'You recommended a film. They said nothing' '**nothing**')" "True"
check "silence, recommendations and patterns are all ruled out as evidence" \
    "$(order_check 'infer a preference from silence, from a film you recommended, or from a pattern')" "True"
check "the user own words are never reworded, nor widened into a claim about them" \
    "$(order_check 'reword an instruction they wrote' \
        'widen something specific into a claim about the person')" "True"
check "a suggested change is offered rather than made" \
    "$(order_check 'say so and let them decide' 'Editing it yourself is not' \
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
    "$(order_check '## Asked about the model directly' '**Do those.**' \
        '`get_taste`, `update_genre`, `update_mix`, `delete_genre`, `delete_mix`')" "True"
check "nobody is sent to the website for something the conversation can do" \
    "$(order_check 'Do not send somebody to the website for something you can do in the' \
        'is *a* management surface, not *the* one')" "True"
check "a read-back is answered by describing the model, which is otherwise discouraged" \
    "$(order_check 'while recommending' \
        'A read-back is the easy case' \
        'describing it is what was asked for')" "True"
check "an asked-for rename needs no ceremony, but a meaning change is still not silent" \
    "$(order_check 'changing what something *means* without being asked to' \
        'A rename they asked for is theirs and needs no ceremony')" "True"

echo
echo "--- nothing is remembered but the model ---"

check "no history of any kind is kept" \
    "$(order_check 'The taste model and nothing else' \
        'No watch history' 'no ratings, no film data')" "True"
check "the same film can come back, and nothing is learned automatically" \
    "$(order_check 'The same film can come back' 'Nothing is learned automatically')" "True"
check "a failed write is reported rather than claimed as a save" \
    "$(order_check 'Never claim something was stored when the tool refused')" "True"

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
