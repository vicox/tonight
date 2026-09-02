#!/usr/bin/env bash
# Tonight recommend-skill contract tests.
#
#   ./test.sh
#
# Markdown *contract regression* tests: they catch deletion and edit of an
# explicit contract rule, not every sentence that could contradict one.
#
# The rules this suite exists for: the taste model is the brief, Tonight holds no
# film data and never chooses, nothing is remembered, and the only write this
# skill may make is a Mix the user has just said yes to.
#
# Prints one line per check and exits non-zero if any of them fails.
set -u

SCRIPT_DIR="$(cd -P "$(dirname "$0")" && pwd -P)"
SKILL="$SCRIPT_DIR/SKILL.md"
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

echo "--- frontmatter ---"

check "the file opens with the YAML delimiter, no leading blank line" \
    "$(sed -n '1p' "$SKILL")" "---"
check "the name is the skill own name" \
    "$(sed -n '2p' "$SKILL")" "name: tonight-recommend"
check "there is a description, and the block closes on line 4" \
    "$(sed -n '3p' "$SKILL" | cut -c1-12)|$(sed -n '4p' "$SKILL")" "description:|---"

echo
echo "--- one job, and the boundaries around it ---"

check "the skill states its single job" \
    "$(order_check 'One job: answer' 'what should I watch tonight?' 'Nothing else.')" "True"
check "the three skills and their division are named" \
    "$(order_check '| `tonight-setup` |' '| `tonight-manage` |' '| **recommend** *(this one)*')" "True"

echo
echo "--- the tool-orchestration boundary ---"

check "Tonight holds the taste model and nothing else" \
    "$(order_check 'Two kinds of connection do different things' \
        'holds the user' 'taste model' \
        'no film catalogue, no lookup and no idea what a film is')" "True"
check "film knowledge and film tools sit beside Tonight, not inside it" \
    "$(order_check 'Whatever knowledge of films you bring' \
        'film-data or search tools happen to be available in' \
        'sit beside Tonight rather than inside it')" "True"
check "the separation is drawn as a diagram, with Tonight holding only the model" \
    "$(order_check 'Tonight MCP' 'the user' 'Genres and Mixes' \
        'whatever film tools you have')" "True"
check "never look for films in Tonight, and never write the model elsewhere" \
    "$(order_check 'never look for films in Tonight' \
        'never write a Genre or a Mix anywhere but Tonight')" "True"
check "there is no Tonight tool that chooses films, and none is planned" \
    "$(order_check 'The choosing is yours' \
        'no Tonight tool that takes a taste and returns films' \
        'not going to be one')" "True"

echo
echo "--- the taste model is the brief ---"

check "get_taste comes first, and a failure stops the run" \
    "$(order_check '## Step one: read the model' 'Call `get_taste`' \
        'If `get_taste` fails, report the error verbatim and stop')" "True"
check "an empty model is offered setup rather than guessed at" \
    "$(order_check 'An empty model is not an error' 'tonight-setup' \
        'guessing would be inventing a taste they never described')" "True"
check "a mix is read as its own instruction plus its genres" \
    "$(order_check 'For a Mix' 'plus** the instructions of every Genre it is built from' \
        'alone throws away half of what it means')" "True"
check "an exclusion outranks a preference" \
    "$(order_check 'read what they **rule out** at least as carefully' \
        'A recommendation that contradicts an instruction is worse than no' )" "True"
check "acclaim is not a substitute for what this person said" \
    "$(order_check 'Do not substitute a general sense of what is acclaimed or popular')" "True"

echo
echo "--- choosing, and being accurate about it ---"

check "film tools are used when they help, and their absence is said out loud" \
    "$(order_check 'use the film-data or search tools available to you' \
        'this skill does not care which ones you have' \
        'If you have no such tool and the request needs one, say so rather than guessing')" "True"
check "the connection between the model and the answer is shown" \
    "$(order_check 'Say at the top what you recommended *for*' \
        'That connection is the product')" "True"

echo
echo "--- nothing is remembered ---"

check "Tonight stores the taste model and nothing else" \
    "$(order_check 'Tonight stores the taste model and nothing else' \
        'No watch history' 'no film data')" "True"
check "the same film can come back, and nothing is learned automatically" \
    "$(order_check 'The same film can come back' 'Nothing is learned automatically' \
        'Never say' 'noted for next time')" "True"

echo
echo "--- the one write, and its limits ---"

check "a discovered combination is offered, never saved" \
    "$(order_check 'Offer it. Do not save it' \
        'only if' 'they say yes in so many words, call `create_mix`' \
        'the single write this skill may make')" "True"
check "a reaction to a film never edits the model" \
    "$(order_check 'Never adjust a Genre or Mix because of how somebody reacted to a film' \
        'never a reason to edit anything yourself')" "True"

echo
echo "--- what this skill leaves out ---"

check "no embedded model, no catalogue, no provider, no lookup tool" \
    "$(grep -ciE 'anthropic|openai|claude api|tmdb|themoviedb|find_movies|search_movies' "$SKILL")" \
    "0"
check "no genre CRUD: modelling belongs to tonight-manage" \
    "$(grep -ciE 'create_genre|update_genre|delete_genre|update_mix|delete_mix' "$SKILL")" "0"

echo
printf '%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
