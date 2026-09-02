#!/usr/bin/env bash
# Tonight setup-skill contract tests.
#
#   ./test.sh
#
# Markdown *contract regression* tests, not natural-language semantic validators.
# They answer one question — "did someone remove or alter an explicit contract
# rule?" — by checking canonical wording, counts and document order. A
# contradictory sentence added alongside these markers would pass here; the tests
# catch deletion and edit of the contract, which is what regressions look like.
#
# The rule this suite exists for above all others: setup asks one question,
# proposes, and writes only after the user agrees.
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
    "$(sed -n '2p' "$SKILL")" "name: tonight-setup"
check "there is a description, and the block closes on line 4" \
    "$(sed -n '3p' "$SKILL" | cut -c1-12)|$(sed -n '4p' "$SKILL")" "description:|---"

echo
echo "--- one job, and the boundaries around it ---"

check "the skill states its single job" \
    "$(order_check 'One job:' 'creating their first **Genres**' 'Nothing else.')" "True"
check "the three skills and their division are named" \
    "$(order_check '| **setup** *(this one)*' '| `tonight-manage` |' '| `tonight-recommend` |')" "True"
check "it never recommends and never creates a mix" \
    "$(order_check 'This never recommends a film** and never creates a Mix')" "True"
check "identity is the session, never an argument" \
    "$(order_check 'Identity is the authenticated MCP session' \
        'never ask the user for an account id')" "True"

echo
echo "--- step zero: look before you write ---"

check "get_taste comes first and is the only source of truth" \
    "$(order_check '## Step zero: look before you write' 'Call `get_taste` first' \
        '`get_taste` is the only source of truth for this decision')" "True"
check "an existing model stops the skill rather than being merged into" \
    "$(order_check 'It returns genres or mixes' 'Stop, and create nothing' \
        'Do not overwrite, reset, delete or quietly merge')" "True"
check "an empty model is normal, and a failed call stops" \
    "$(order_check 'It returns two empty lists' 'normal starting state, not an error' \
        'The call fails' 'Report the error verbatim and stop')" "True"

echo
echo "--- one question, then interpretation ---"

check "the question is asked once, without a questionnaire" \
    "$(order_check 'What kind of movies do you like?' 'One question' \
        'Do not follow it with a questionnaire')" "True"
check "a bare name takes Tonight own wording; nuance is written from what they said" \
    "$(order_check 'A bare name' 'Tonight has its own wording for the common ones' \
        'A name with nuance' 'is a genre whose instruction is')" "True"
check "an exclusion goes into the instruction of the genre it belongs to" \
    "$(order_check 'carry the exclusion into the instruction of the genre it belongs to')" "True"
check "the starter definitions live here, and are starting points rather than a closed list" \
    "$(order_check '## Starter definitions for bare Genre names' \
        'propose the Action definition below as its meaning' \
        'They are starting points, not a list to choose from' \
        'The user is not restricted to these' \
        'Custom Genres are entirely ordinary')" "True"
check "user nuance overrides a starter definition rather than being appended to it" \
    "$(order_check 'User nuance overrides the starter definition, always' \
        'the instruction is theirs and you write it from what they said' \
        'do not append their nuance to it as an afterthought')" "True"
check "the sixteen starter definitions are all present" \
    "$(grep -cE '^\| `(Action|Adventure|Animation|Comedy|Crime|Documentary|Drama|Fantasy|Horror|Musical|Mystery|Romance|Sci-Fi|Thriller|War|Western)` \|' "$SKILL")" \
    "16"
check "every genre is created with an instruction, there being no shorter form" \
    "$(order_check 'Every genre is created with an instruction' \
        'requires one and Tonight fills in nothing on your behalf')" "True"

echo
echo "--- the user owns the model ---"

check "the whole set is reviewed before anything is created" \
    "$(order_check 'Show the whole proposed set before creating any of it' \
        'Nothing is written until they say yes')" "True"
check "a partial set is reported as a partial set" \
    "$(order_check 'Never claim setup succeeded unless every agreed genre was created' \
        'A partial set is a partial set')" "True"

echo
echo "--- what this skill leaves out ---"

check "no embedded model, no catalogue, no provider" \
    "$(grep -ciE 'anthropic|openai|claude api|tmdb|themoviedb|movie database|poster|find_movies|search_movies' "$SKILL")" \
    "0"
check "no mix tools and no recommending" \
    "$(grep -ciE 'create_mix|update_mix|delete_mix' "$SKILL")" "0"
check "setup guidance is not fetched from the MCP at run time" \
    "$(grep -ciE 'get_genre_defaults' "$SKILL")" "0"

echo
printf '%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
