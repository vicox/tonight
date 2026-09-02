#!/usr/bin/env bash
# Tonight manage-skill contract tests.
#
#   ./test.sh
#
# Markdown *contract regression* tests: they catch deletion and edit of an
# explicit contract rule, not every sentence that could contradict one.
#
# The rules this suite exists for: a Mix is not an intersection, Mixes reference
# Genres only, a rename never breaks a reference, a delete is refused rather than
# cascading, and nothing is written that the user has not agreed to.
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
    "$(sed -n '2p' "$SKILL")" "name: tonight-manage"
check "there is a description, and the block closes on line 4" \
    "$(sed -n '3p' "$SKILL" | cut -c1-12)|$(sed -n '4p' "$SKILL")" "description:|---"

echo
echo "--- one job, and the boundaries around it ---"

check "the skill states its single job, and that the watching request is not it" \
    "$(order_check 'One job: the taste model itself' \
        'This does not own' 'what should I watch?' \
        'is `tonight-recommend`' \
        'Naming a few films to' 'show what a Genre or Mix would mean' \
        'is a different thing and is')" "True"
check "the three skills and their division are named" \
    "$(order_check '| `tonight-setup` |' '| **manage** *(this one)*' '| `tonight-recommend` |')" "True"
check "Tonight holds the taste model; film knowledge is separate and the host owns it" \
    "$(order_check 'Two kinds of connection do different things' \
        'holds the taste model and nothing else' \
        'no catalogue, no lookup and no knowledge of films' \
        'Never look for films in Tonight')" "True"
check "identity is the session, never an argument" \
    "$(order_check 'Identity is the authenticated MCP session' \
        'never ask the user for an account id')" "True"

echo
echo "--- what the two objects are ---"

check "a genre is the user own meaning, not a database tag" \
    "$(order_check 'A Genre is not a movie-database tag' \
        'may mean opposite things by it')" "True"
check "a mix is not an intersection, and its instruction is the meaning" \
    "$(order_check 'A Mix is not an intersection' \
        'are its ingredients' 'Nothing computes a Mix')" "True"
check "mixes reference genres only, at least one, with no chaining" \
    "$(order_check 'Mixes reference Genres only' 'There is no chaining' \
        'cannot be built from another Mix' 'must name at least one Genre')" "True"

echo
echo "--- identity and reference integrity ---"

check "the name is the only identifier" \
    "$(order_check 'name is **the only identifier**' 'There is no separate id')" "True"
check "names are unique ignoring case, and lookups match either way" \
    "$(order_check 'Names are unique per kind, ignoring case' \
        'a create that collides is rejected')" "True"
check "a rename rewrites every mix in the same write" \
    "$(order_check 'Renaming a Genre rewrites every' \
        'in the same write' 'a rename can never leave a broken reference')" "True"
check "a delete is refused rather than cascading, and the user chooses" \
    "$(order_check 'cannot be deleted while a Mix is built from it' \
        'names the Mixes involved' 'Nothing is cleaned up automatically' \
        'Tell the user which choice they are making rather than picking for them')" "True"
check "replacing a mix genre list is stated as a replacement" \
    "$(order_check 'replaces** the stored list rather than adding to it' \
        'may never be empty')" "True"

echo
echo "--- reading before writing ---"

check "get_taste comes first and is the vocabulary to reuse" \
    "$(order_check 'Call `get_taste` first, always' 'it is your vocabulary' )" "True"
check "an instruction is always required, and the starter definitions are the setup skill" \
    "$(order_check 'Tonight supplies none of them' \
        'a Genre created without one is refused' \
        '`tonight-setup` carries starting definitions')" "True"

echo
echo "--- the user owns the model ---"

check "propose, then write" \
    "$(order_check '## The user owns the model' 'Propose, then write')" "True"
check "behaviour is evidence for a suggestion, never a silent edit" \
    "$(order_check 'Never edit an instruction because of how somebody reacted to a film' \
        'never a reason to make one' 'Tonight has no hidden profile')" "True"
check "nothing but the model is stored" \
    "$(order_check 'Tonight stores nothing but the model' \
        'No watch history' 'no film data')" "True"

echo
echo "--- what this skill leaves out ---"

check "no embedded model, no catalogue, no provider, no lookup tool" \
    "$(grep -ciE 'anthropic|openai|claude api|tmdb|themoviedb|find_movies|search_movies|poster' "$SKILL")" \
    "0"
check "the Tonight tool list is the eight state operations" \
    "$(grep -ciE 'get_genre_defaults' "$SKILL")" "0"

echo
printf '%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
