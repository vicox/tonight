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
CANONICAL="$SCRIPT_DIR/SKILL.md"
SKILLS_DIR="$(cd -P "$SCRIPT_DIR/.." && pwd -P)"
export CONTRACTS="file://$SCRIPT_DIR/contracts.mjs"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Every check below reads the *specification*. A `project:compact` block holds a
# shorter wording of a rule for one delivery target; it sits in the same file, so a
# plain grep would find a rule in either and a rule deleted from the canonical text
# would still appear to be there. Stripped once, here.
SKILL="$WORK/canonical.md"
python3 - "$CANONICAL" "$SKILL" <<'PYEOF'
import re, sys
block = re.compile(
    r"^[ \t]*<!--[ \t]*project:compact[ \t]*\r?\n.*?^[ \t]*project:compact[ \t]*-->[ \t]*\r?\n?",
    re.S | re.M,
)
open(sys.argv[2], "w", encoding="utf-8").write(
    block.sub("", open(sys.argv[1], encoding="utf-8").read())
)
PYEOF

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

# One bullet of the file, whitespace-collapsed: from its own marker up to the next.
# A rule that belongs to one branch of a decision must be read inside that branch —
# checked against the whole file, a rule moved from one branch to the other still
# matches, which is the one failure the branches exist to prevent.
cat > "$WORK/slice.py" <<'PYEOF'
import os, re, sys
flat = re.sub(r"\s+", " ", open(os.environ["SKILL"], encoding="utf-8").read())
start = flat.find(re.sub(r"\s+", " ", sys.argv[1]))
end = flat.find(re.sub(r"\s+", " ", sys.argv[2]), start + 1)
print(flat[start:end] if start >= 0 and end > start else "")
PYEOF

slice_of() { SKILL="$SKILL" python3 "$WORK/slice.py" "$1" "$2"; }
# Count of matches for an extended regex inside a slice.
in_slice() { printf '%s' "$1" | grep -ciE "$2"; }

# Is the retry written as one obligation covering both failure branches?
#
# The definition is `contracts.mjs`, which `web/lib/instructions.test.ts` imports
# too. Stated twice — once here in grep and once there in a regex literal — this
# rule diverged immediately: one side covered `whichever` and only one word order.
shared_retry_in() {
    node --input-type=module -e '
import { readFileSync } from "node:fs";
const { sharedRetry } = await import(process.env.CONTRACTS);
const found = sharedRetry(readFileSync(process.argv[1], "utf8"));
console.log(found ? `shared: ${found}` : "none");
' "$1"
}

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
        'Discovery is the default' \
        'what they have written is where you explore from')" "True"

echo
echo "--- ask a film question, or none at all ---"

check "a sufficient request is answered rather than interrogated" \
    "$(order_check 'ask **one' \
        'question about films')" "True"
check "the good and bad questions are shown side by side" \
    "$(order_check 'question about films' \
        'More clever mystery, or more action?' \
        'What genres do you like?')" "True"
check "the database question is named as the wrong one" \
    "$(grep -c 'What Genres should I save?' "$SKILL")" "1"
check "nobody has to understand the data model to get a film" \
    "$(order_check 'never make somebody learn Genres and Mixes to get a film')" "True"

echo
echo "--- the tool-orchestration boundary ---"

check "Tonight holds the taste model and nothing else" \
    "$(order_check 'Tonight holds the taste model and nothing else' \
        'No catalogue, no lookup' \
        'nothing about it was ever fetched')" "True"
check "film knowledge and film tools sit beside Tonight, not inside it" \
    "$(order_check 'your own film knowledge and tools sit beside it' \
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
    "$(order_check 'A **Genre** is a reusable component of what they like' \
        'a **Mix** is Genres plus what the')" "True"
check "a mix is read as its own instruction plus its genres" \
    "$(order_check '**its own instruction plus the instructions of its Genres**' \
        'plus the instructions of its Genres' \
        'in that order')" "True"
check "only an exclusion is mode-dependent; everything else is evidence either way" \
    "$(order_check '**An exclusion written into a Genre' \
        'binds only when they asked for their taste' \
        'an exclusion they wrote for one idea is not a rule over every evening' \
        'Everything else in the model is evidence either way')" "True"

# R3. The retained candidate proved the two halves can be satisfied one at a time:
# runs that used the model by narrating the exclusion, and runs that stayed silent
# about it and showed no model influence at all. Both are pinned, together.
check "a non-binding exclusion is not mentioned either" \
    "$(order_check 'one that does not bind is **not mentioned either**' \
        'not raised, not contrasted with, not waived out loud' \
        'no part in tonight')" "True"
check "and the positive preference that shaped it is recognisable in the answer" \
    "$(order_check 'the positive preference that shaped' \
        'the answer is recognisable in it')" "True"
# Recognisable, not named: a proper name is one technique, and a paraphrase the
# user would recognise is enough. A closed list would forbid the paraphrase and
# would also have omitted `liked`.
check "naming a stored object is offered as one way, not required" \
    "$(order_check 'Naming the Mix, the Genre or a film they liked or loved is one' \
        'way to do that and not the only one' \
        'a paraphrase they would recognise as their own is enough')" "True"
check "and the visibility rule is about positive evidence, not any mention" \
    "$(order_check 'the positive preference that shaped')" "True"
check "the two failures are named as one rule, from opposite ends" \
    "$(order_check 'Using' 'the model silently and narrating an exclusion instead are the same failure')" "True"
# The silence is about the exclusion, never about the model.
check "the silence was not widened to the whole model" \
    "$(grep -ciE 'never mention (the|their|stored) (model|taste)' "$SKILL")" "0"
check "and an instruction is still a constraint, not a preference to trade off" \
    "$(order_check 'worse than none')" "True"

echo
echo "--- a Mix is evidence; its films calibrate ---"

# Step 6, adopting P5. The rule replaced here said a Genre or Mix existing is not
# evidence they like it, and that film states are what make one trustworthy. That is a
# gate: no states, no weight — and it denies the product's own loop, since the Mix
# written in last night's conversation is exactly the one tonight's answer should use.
check "a matching Mix is a reason the recommendation fits" \
    "$(order_check 'a Mix that matches is a reason' 'the recommendation fits')" "True"
check "and it counts from the moment it exists, with nothing under it" \
    "$(order_check 'counts from' 'the moment it exists' \
        'nothing under it yet says as much about what' \
        'they like as one with ten films under it')" "True"
check "a Genre is thinner than a Mix, and a Genre name alone justifies nothing" \
    "$(order_check 'A Genre is an ingredient and' \
        'thinner on its own' \
        'justified only by a Genre name is justified by a label')" "True"
check "states calibrate the evidence rather than deciding whether it counts" \
    "$(order_check 'Movie states calibrate that evidence. They never decide whether it counts')" "True"
check "the four states keep their meanings" \
    "$(order_check '`loved`' 'strengthens it' '`liked` strengthens it more weakly' \
        '`disliked` weakens something similar' 'negative sign, not a ban')" "True"
check "absence of experience is never evidence against" \
    "$(order_check '`not_seen` and `null` are absence of experience, never evidence' \
        'against' '`seen` says they have watched it and nothing more')" "True"
check "an empty Mix changes how you speak, not whether you use it" \
    "$(order_check 'less confidence about specifics and just as' \
        'much about intent' \
        'never whether you use it' \
        'Say how sure you are')" "True"

# R4. A Mix with nothing under it says what they meant, and nothing about what they
# made of any film. The rule is about that missing verdict, not about how warmly a
# match may be described: two sweeps failed on the wording while the behaviour —
# claiming a film was settled for somebody who had never rated one — was what mattered.
check "the doubt lands on the film's fit, not on what they meant" \
    "$(order_check 'put the doubt where it belongs' \
        '**what' \
        'they meant is not in question, and no particular film has been confirmed to fit it yet**')" "True"
check "describing how well a film answers the Mix stays allowed" \
    "$(order_check 'say how well a film answers what the Mix asks for as plainly as it deserves' \
        'you can both see it')" "True"
check "what is refused is a verdict they have not given" \
    "$(order_check 'What you may not say is that' \
        'like it, or that it is confirmed, proven or settled for them')" "True"
check "and only a Movie state carries that verdict" \
    "$(order_check 'only a Movie state carries' \
        'their verdict, and there is none yet')" "True"
# None of the rejected mechanisms may come back with it.
check "no Mix is graded as provisional" \
    "$(grep -ciE 'aspirational|untested|unproven|provisional' "$SKILL")" "0"

# The gate, in every form the strategy rejects.
check "the pre-P5 gate is gone" \
    "$(grep -ciE 'A Genre or Mix existing is not evidence|What makes one trustworthy is the film' "$SKILL")" "0"
check "and no word grades a Mix as provisional" \
    "$(grep -ciE 'aspirational|untested|unproven|provisional' "$SKILL")" "0"

# P3's replaced half: nothing persisted used to bind, which meant the model was not
# read at all unless somebody asked for it.
check "the model is read on every recommendation" \
    "$(order_check 'Read `get_taste`' 'either way')" "True"
check "the pre-P3 rule is gone" \
    "$(grep -ciE 'Nothing.{0,3}persisted binds|nothing in it is a criterion unless they asked|must never become a filter' "$SKILL")" "0"
check "the idea leads the answer, and the model is not printed at the user" \
    "$(order_check 'Never print the taste model while' \
        'One idea for the evening, in a line' \
        'No field names')" "True"

echo
echo "--- the answer has a lead, and the rest are directions ---"

# Step 4 of `docs/work/phase-1-implementation.md`. The shape is the product: a list of
# equal candidates hands the decision back to the person who could not make it. Pinned
# as semantics rather than prose — what must survive is that there is exactly one lead,
# that it is named as the lead, that the rest are directions ordered by distance, and
# that the set is two or three of them rather than a menu.
check "the answer is a thesis, then a lead, then directions, in that order" \
    "$(order_check 'One idea for the evening, in a line' \
        'one lead, named as such' \
        'directions')" "True"
check "the lead is committed to out loud, not merely placed first" \
    "$(order_check 'one lead, named as such' "*\"I'd start with X\"*")" "True"
check "and the worked example commits to one, rather than listing equals" \
    "$(order_check "I'd start with *Knives Out*" 'If you want it colder' \
        'If you want one room')" "True"
check "there are two or three directions, and the count is stated" \
    "$(order_check 'two or three' 'directions')" "True"
check "a direction is defined against the runner-up it is not" \
    "$(order_check 'another way out, never a' 'runner-up')" "True"
check "the order is distance, and quality is ruled out by name" \
    "$(order_check 'distance from the lead' 'not quality')" "True"
check "each direction is opened by the condition under which it wins" \
    "$(order_check 'opened by when it wins')" "True"
check "the close is one or the other, never both" \
    "$(order_check 'one question' 'one lever' 'never both')" "True"

# The old form. "Three to six" is a menu, and a menu is what the shape exists to replace.
check "no film count from the old form survives anywhere" \
    "$(grep -ciE 'three to six|six films|3 to 6' "$SKILL")" "0"

echo
echo "--- unseen by default, and a stretch is anchored ---"

# P4 and P10. `not_seen` is deliberately absent from the list: it means they told
# Tonight they have not seen it, which is a reason to offer it, not a reason not to.
check "the target is what they have not seen or judged" \
    "$(order_check 'Lead with what they have not seen or judged' \
        '`seen`, `liked`, `loved` and `disliked` each' \
        'rule a Movie out as new')" "True"
check "and never restated as whatever Tonight has not heard of" \
    "$(grep -ciE 'told Tonight nothing about|Tonight (has )?(knows|heard) nothing about' "$SKILL")" "0"
# The positive half. Absence from the list is not enough: `not_seen` has to be named and
# said to stay available, or a reader may still treat a film Tonight knows of as spent.
check "not_seen is named, and named as still eligible" \
    "$(order_check 'rule a Movie out as new' '`not_seen` does not' \
        'so it stays on the table')" "True"
check "and nothing in that sentence rules a not_seen film out" \
    "$(sed -n '/rule a Movie out as new/,/`loved` one is a/p' "$SKILL" \
        | grep -ciE 'never (offer|present|suggest)|not (offered|presented|eligible)')" "0"
check "a loved film is spent as a reason rather than suggested again" \
    "$(order_check '`loved` one is a **reason**, not a suggestion')" "True"
# AC4. A run offered `The Vanishing` — stored `seen` — as a direction while saying in the
# same clause that it was on the list and unseen. Being in the model reads as novelty
# unless the rule says which of the two answers "have they seen it", so it says so.
check "membership in the model is not evidence they have not seen it" \
    "$(order_check 'rule a Movie out as new' \
        'Being in the model is never evidence they have not seen it' \
        'the state is')" "True"
check "a stateful film is ruled out of being called new, not only of being offered" \
    "$(order_check 'Being in the model is never evidence' \
        'never called new, unseen or not yet watched' \
        'never offered as one')" "True"
check "and the contradiction that was observed is named as one" \
    "$(order_check \
        "it's on your list and you haven't seen it" 'is a contradiction')" "True"
check "a stretch is anchored in something they like, and an absence is not a reason" \
    "$(order_check 'Anchor a stretch in something they like' \
        'an absence shows where to look, never why')" "True"
check "a stretch is marked as one" \
    "$(order_check 'an absence shows where to look, never why' 'say it is one')" "True"

# The guard that must survive the rewrite verbatim: a film request is not a
# configuration session, and nobody has to learn the data model to get a film.
# R1 of `docs/work/phase-1-repairs.md`. Three of five empty-model runs and one
# ordinary failure fallback asked a clarifying question instead of recommending.
# The licence was the shared one in this section, which outranked `answer anyway`
# in the failure branch — so the repair belongs here, not in either branch.
check "an ordinary request is answered with a film, not only a question" \
    "$(order_check 'they asked for a film and the answer is one' \
        'ask **one question about films**' \
        'in the answer, never instead of it')" "True"
check "and an empty model is not an exemption from it" \
    "$(order_check '**An empty model is not' \
        'an exception**' \
        'not a reason to interview them' \
        'always a film worth leading with')" "True"
check "the question survives; only its power to replace the answer is gone" \
    "$(grep -c 'ask \*\*one question about films\*\*' "$SKILL")" "1"

check "the recommendation-against-configuration guard survived the rewrite" \
    "$(order_check 'ask **one question about films**' \
        'never *"what genres do you like?"*' \
        'never make somebody learn Genres and Mixes' \
        'Never print the taste model while recommending')" "True"

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
check "the test for a name is pointed at, not restated" \
    "$(order_check '`create_mix` carries the test for that in its own description' \
        'at the moment a name is being chosen')" "True"
check "naming is the assistant's to do, and may not widen the idea" \
    "$(order_check 'Proposing the name is yours' \
        'Name the thing they said' 'Never name a bigger thing')" "True"

echo
echo "--- the model grows from what was said ---"

check "the idea just used is the Mix, and its parts are the Genres" \
    "$(order_check 'The idea you just used' '**is** a Mix' \
        'Writing them down is how Tonight gets better at this')" "True"
check "a Genre is reused before it is created, and near-duplicates are called out" \
    "$(order_check 'Reuse the Genres that genuinely fit' \
        'create one for anything no Genre covers' \
        'do not add `Slow-paced`')" "True"
check "a Mix is reused when it fits and made new when it does not" \
    "$(order_check 'One genuinely fits' \
        'Never stretch a Mix to avoid making one' \
        'a different evening is a different Mix')" "True"
check "the write constraints point at the tools that state them" \
    "$(order_check "What a Mix's name has to earn" \
        'arrive with `create_genre` and `create_mix`')" "True"

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
    "$(order_check 'only the meaning they could agree to' \
        'reaches further than the last thing said')" "True"
check "the asking is about taste, not about permission to write" \
    "$(order_check 'Asking that is not asking permission' \
        'somebody who has just said plainly what they like has already answered it')" "True"
check "it is explicitly not a save-confirmation dialog" \
    "$(order_check 'is not asking permission' \
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
    "$(order_check 'create one for anything no Genre covers' \
        'Wanting something tonight is not saying it' \
        'leaves nothing behind')" "True"
check "a recommendation with no feedback persists nothing" \
    "$(order_check 'You recommended a film. They said nothing' '**nothing**')" "True"
check "silence, recommendations and patterns are all ruled out as evidence" \
    "$(order_check 'infer a preference from silence, from a film you recommended, or from a pattern')" "True"
check "the user own words are never widened into a claim about them" \
    "$(order_check 'widen something specific into a claim about the person')" "True"
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
        'call `get_taste` and answer in ordinary sentences')" "True"
check "nobody is sent to the website for something the conversation can do" \
    "$(order_check 'is *a* management surface, not *the* one' \
        'Do not send somebody to the website for something you can do in the')" "True"
check "a read-back is answered by describing the model, which is otherwise discouraged" \
    "$(order_check 'while recommending' \
        'A read-back is the easy case' \
        'describing it is what was asked for')" "True"
check "an asked-for rename needs no ceremony, but a meaning change is still not silent" \
    "$(order_check 'A rename needs no ceremony' \
        'changing what something *means* unasked')" "True"

echo
echo "--- nothing is remembered but the model ---"

# M1 records evenings as fact, so the old claim that no history is kept became
# untrue. What had to survive is the part that was never about storage: an
# evening is history and not taste, and nothing is concluded from it.
check "an evening is recorded as fact, and unknown stays unknown" \
    "$(order_check 'An evening is recorded as fact' \
        'Everything else stays **unknown**' \
        'unknown is an answer rather than a gap')" "True"
check "no link of the chain implies the next" \
    "$(order_check 'offering a film is not choosing it, choosing is not watching, watching is' \
        'not finishing, and finishing is not liking' \
        'None of those follows from the one before')" "True"
check "the record is history and not taste" \
    "$(order_check 'That record is history, not taste' \
        'Nothing is learned from it automatically')" "True"
check "a recommended film may return, and a saved one is the exception" \
    "$(order_check 'a film you recommended can come back' \
        'A film they saved is different' \
        'its state is evidence')" "True"
# And the targeting rule it used to restate is not duplicated back into this section.
check "what a state means for recommending is stated once, under Recommending" \
    "$(grep -ciE 'anything but .not_seen. and .null.|do not offer it as new' "$SKILL")" "0"
check "a failed write is reported rather than claimed as a save" \
    "$(order_check 'Never claim something was stored when the tool refused')" "True"

echo
echo "--- a taste read that fails costs what it actually costs ---"

# Step 5 of `docs/work/phase-1-implementation.md`, implementing strategy 10.1.1. The
# split is by what was asked, not by what broke: an outage removes personalisation, it
# does not remove the ability to be useful about films.
#
# Each branch is read on its own. Checked against the whole section, a rule that moved
# from one branch to the other still matches — so "stop" landing in the ordinary branch,
# or both retry offers sitting in one of them, would pass. That is the failure these
# slices exist to catch, and it is the reason neither branch is asserted globally.
taste_branch="$(slice_of '`get_taste` fails on a taste question' \
    '`get_taste` fails on an ordinary request')"
ordinary_branch="$(slice_of '`get_taste` fails on an ordinary request' '**A write fails**')"

check "the two branches exist and are told apart by what was asked" \
    "$(order_check '`get_taste` fails on a taste question' \
        '`get_taste` fails on an ordinary request')" "True"
check "and each one is found as its own bullet" \
    "$([ -n "$taste_branch" ] && [ -n "$ordinary_branch" ] && echo both || echo missing)" "both"

# --- the taste-explicit branch, read alone ---
check "the taste branch stops" \
    "$(in_slice "$taste_branch" 'stop\.')" "1"
check "the taste branch reports the failure in the tool's own words" \
    "$(in_slice "$taste_branch" "report the failure in the tool's own words")" "1"
check "the taste branch offers to retry" \
    "$(in_slice "$taste_branch" 'offer to retry')" "1"
# R2 moved the retry out of a clause covering both branches and into each of them.
# Two local retries *plus* a shared one would reinstate the factoring the retained
# candidate showed to be less reliable, and every positive check above would still
# pass — so the shared form is asserted gone, in the section and in both wordings.
check "no retry sits above the branches" \
    "$(in_slice "$(slice_of '## When something fails' '`get_taste` fails on a taste question')" 'retry')" "0"
check "and the retry is never stated as one shared obligation" \
    "$(shared_retry_in "$SKILL")" "none"
# Stopping *is* the no-recommendation rule here. What must not appear is any instruction
# to answer anyway, which would make the branch indistinguishable from the other one.
check "the taste branch never recommends from taste it could not read" \
    "$(in_slice "$taste_branch" 'recommend anyway|answer anyway|recommend well')" "0"

# --- the ordinary-request branch, read alone ---
# R2. The branch names the shape obligation itself, so it cannot degrade into a
# disclosure, a question, or a bare list. R1 stays the source of the rule.
check "the ordinary branch owes the approved answer shape, and says so" \
    "$(in_slice "$ordinary_branch" 'in the shape above')" "1"
check "and spells out what that means here" \
    "$(in_slice "$ordinary_branch" 'then lead and give directions as usual')" "1"
check "the ordinary branch still recommends" \
    "$(in_slice "$ordinary_branch" 'recommend anyway')" "1"
check "the ordinary branch discloses in the first sentence" \
    "$(in_slice "$ordinary_branch" 'first sentence')" "1"
check "the ordinary branch says the model could not be read" \
    "$(in_slice "$ordinary_branch" 'their model could not be read')" "1"
check "the ordinary branch says the answer is not based on it" \
    "$(in_slice "$ordinary_branch" 'what follows is not based on it')" "1"
check "the ordinary branch forbids a personal claim rather than omitting one" \
    "$(in_slice "$ordinary_branch" 'claim \*\*nothing\*\* about them')" "1"
check "the ordinary branch offers to retry" \
    "$(in_slice "$ordinary_branch" 'offer to retry')" "1"
# And it does not stop: the whole point of the split is that this branch answers.
check "the ordinary branch does not stop as well" \
    "$(in_slice "$ordinary_branch" 'stop\.|stop instead|stop as well')" "0"
check "and it does not carry the other branch's error-reporting rule" \
    "$(in_slice "$ordinary_branch" "report the failure in the tool's own words")" "0"

# The rule this supersedes stopped in both cases, so it must not survive beside them.
check "the old stop-in-both-cases rule is gone" \
    "$(grep -ciE 'report the error verbatim|Never recommend from a model you' "$SKILL")" "0"

echo
echo "--- a Movie is the user's own object ---"

check "a Movie is theirs, by either of the two ways one comes to exist" \
    "$(order_check 'asked for it to be kept, or said something about it' \
        'A Movie is theirs, the same way a Genre or a Mix is' \
        'never an entry from a catalogue')" "True"
check "a Movie is named by its title and its year" \
    "$(order_check 'Title and year name it')" "True"
check "the three Movie tools are the way a direct request is done" \
    "$(order_check 'Two requests write a Movie, and they differ' \
        'The tools are `create_movie`, `update_movie` and `delete_movie`')" "True"
check "a recommendation is not persistence, for a film as for a Genre" \
    "$(order_check 'A recommendation is not a saved Movie' \
        'Naming three films writes nothing down')" "True"
check "which sentence means which state points at the tool that states it" \
    "$(order_check 'Which sentence means which state is in' \
        '`create_movie`')" "True"
check "an opinion is never asked for twice" \
    "$(order_check 'already say they saw it' \
        'never ask for a state their sentence gave you')" "True"
check "the handle is settled before a write, and asking which film is not ceremony" \
    "$(order_check 'Settle title and year first' \
        'resolves *which film*' \
        'not permission')" "True"

check "keeping a film and recording a remark about one are different requests" \
    "$(order_check 'Two requests write a Movie, and they differ')" "True"
check "a film the user asks to keep goes into a Mix, and they need not know that" \
    "$(order_check 'Keeping a film goes into a Mix' \
        'Never write a Movie this way without at least one Mix')" "True"
check "watched and liked are recorded without inventing a Mix for them" \
    "$(order_check 'Recording what they said does not' \
        'leave Mixes alone' \
        'Never invent a Mix, or ask for one, to record' \
        'A later request to keep it takes a Mix')" "True"
check "a Mix that genuinely fits is used, and nothing further is asked" \
    "$(order_check 'One genuinely fits' \
        'ask nothing further')" "True"
check "an existing Mix is not a bucket, and its meaning is never widened to fit" \
    "$(order_check 'One nearly fits' \
        'not a bucket' \
        'a different evening is a different Mix')" "True"
check "with no good fit the film waits, and a Mix is devised rather than asked for" \
    "$(order_check 'None fits' \
        'do not save the film yet' \
        'Never ask which Mix they want' \
        'that judgement is yours')" "True"
check "the Mix is proposed conversationally, named and explained, then asked about" \
    "$(order_check 'say what you noticed, name it, say what it means' \
        'Then ask' \
        'Shall I make it?')" "True"
check "a proposed Mix is shown as an idea: other films in it, other names for it" \
    "$(order_check 'make the idea concrete' \
        'three to five other films that would belong in it' \
        'two or three names it could have instead')" "True"
check "those films illustrate the idea and are never part of the save" \
    "$(order_check 'Those films are illustration only' \
        'never written, never in the Mix' \
        'never given a state, nothing to classify' \
        'Only the film they asked to keep is being saved')" "True"
check "a Mix that already fits is still saved without any of that" \
    "$(order_check 'One genuinely fits' \
        'ask nothing further' \
        'a Mix that genuinely fits needs none of this')" "True"
check "one yes creates the Mix and saves the film, with no second save question" \
    "$(order_check 'A yes is the whole of the permission' \
        'any Genre it needs, then the Mix' \
        'never ask a second time')" "True"
check "a no settles it, and never becomes a film saved loose" \
    "$(order_check 'A no settles it' \
        'never saving the film loose')" "True"
check "proposing a Mix belongs to saving, not to recommending" \
    "$(order_check 'Propose while saving, not while recommending')" "True"
check "a film in no Mix is a legitimate state, listed and left alone" \
    "$(order_check 'A film in no Mix is legitimate' \
        'lists them under **Other movies**' \
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

# Relocated to the tool descriptions, where they are read at the moment of the
# call. Two homes for one rule is how the two drift apart, so the skill has to
# stop saying these — and `lib/mcp/tools.test.ts` is what holds their new home.
#
# Matched on the idea rather than on the sentence that was removed. The first
# version of these checks named the exact wording, and the same rules were still
# being stated a second way inside the full-skill blocks — which ship to a host
# that loads the whole skill and are invisible to every assertion over the
# generated text. A check that only knows one phrasing cannot see a paraphrase.
check "the sentence-to-state readings live only on the tool" \
    "$(grep -ciE '"seen it"\* → |"it was good"\* → |"loved it"\* → |at its most specific' "$SKILL")" \
    "0"
check "null against not_seen lives only on the tool" \
    "$(grep -ciE 'never makes it `not_seen`|nothing said is `null`|absence is never not_seen' "$SKILL")" \
    "0"
check "the instruction's voice lives only on the tool" \
    "$(grep -ciE 'first person' "$SKILL")" "0"
check "the rewording prohibition lives only on the update tools" \
    "$(grep -ciE 'reword' "$SKILL")" "0"
check "the write invariants live only on the create tools" \
    "$(grep -ciE 'always needs an instruction|at least one existing Genre|built from Genres only|built from another Mix|no chaining' "$SKILL")" \
    "0"
# The criterion has two halves, and each has a home on the tool: `create_mix` asks
# whether they would ask for it by name in a month, `mixName` asks whether knowing the
# Genres already gives you the name. The skill restated both in its own words, so the
# pattern covers the idea rather than the sentence.
#
# What the skill may still say is deliberately outside it: that a Mix name is evocative
# and a Genre name descriptive, the examples of each, and that a labelled Mix is "the
# Genres said again in one line".
mix_name_rule='what would I get wrong|already tells you the name|the instruction test'
mix_name_rule="$mix_name_rule|ask for it by name|can ask for it|by name in a month"
mix_name_rule="$mix_name_rule|a month later|ask for the Mix by|doing no work"
mix_name_rule="$mix_name_rule|adds? (nothing|something|anything) to its Genres"
mix_name_rule="$mix_name_rule|(beyond|more than) its Genres|pair of Genres"
mix_name_rule="$mix_name_rule|earns? its( own)? name"
check "the Mix naming test lives only on create_mix" \
    "$(grep -ciE "$mix_name_rule" "$SKILL")" "0"
check "the score prohibition lives only on the state field" \
    "$(grep -ciE 'score or star rating|never a score' "$SKILL")" "0"

# And the two the Step 2 review sent back: they are conversation, not a field
# invariant, and the skill is their only home.
check "asking before calling stays in the skill" \
    "$(order_check 'never ask for a state their sentence gave you')" "True"
check "how a rewording is agreed to stays in the skill" \
    "$(order_check 'Say so and let them decide')" "True"

echo
printf '%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
