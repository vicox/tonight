#!/usr/bin/env bash
# Tonight ChatGPT plugin tests.
#
#   ./test.sh
#
# Checks the manifest and the app reference against the rules OpenAI documents for
# plugin packages, then builds the ZIP and checks what is in it. None of this proves
# ChatGPT accepts the upload, only that the package has the documented shape.
#
# Prints one line per check and exits non-zero if any of them fails.

set -u

SCRIPT_DIR="$(cd -P "$(dirname "$0")" && pwd -P)"
ROOT="$(dirname "$SCRIPT_DIR")"
MANIFEST="$SCRIPT_DIR/.codex-plugin/plugin.json"
APPS="$SCRIPT_DIR/.app.json"
PLACEHOLDER=REPLACE_WITH_TONIGHT_MCP_APP_ID
# The Tonight connector as ChatGPT registered it, read from the user's cached plugins.
APP_ID=asdk_app_6a989ba64af0819199e46bf257f8ad5a
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

# Evaluates a Python expression over a JSON file, bound to d.
cat > "$WORK/json.py" <<'PYEOF'
import json, re, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
print(eval(sys.argv[2], {"d": d, "re": re, "PLACEHOLDER": sys.argv[3]}))
PYEOF

q() { python3 -I "$WORK/json.py" "$1" "$2" "$PLACEHOLDER"; }

echo "--- manifest ---"

check "name is tonight" "$(q "$MANIFEST" 'd["name"]')" "tonight"
check "displayName is Tonight" "$(q "$MANIFEST" 'd["interface"]["displayName"]')" "Tonight"
check "version is a semantic version" \
    "$(q "$MANIFEST" 'bool(re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", d["version"]))')" "True"
check "category is one OpenAI documents" \
    "$(q "$MANIFEST" 'd["interface"]["category"] in ("Productivity", "Creativity", "Developer Tools",
        "Business & Operations", "Data & Analytics", "Communication", "Education & Research",
        "Security", "Finance", "Healthcare", "Travel", "Entertainment", "Other")')" "True"
check "skills points at ./skills/" "$(q "$MANIFEST" 'd["skills"]')" "./skills/"
check "apps points at ./.app.json" "$(q "$MANIFEST" 'd["apps"]')" "./.app.json"
check "no mcpServers: the app is referenced, not bundled" "$(q "$MANIFEST" '"mcpServers" in d')" "False"
check "every manifest path starts with ./ and has no .. segment" \
    "$(q "$MANIFEST" 'all(p.startswith("./") and ".." not in p.split("/")
        for p in [d[k] for k in ("skills", "apps", "hooks", "mcpServers") if k in d]
        + [d["interface"][k] for k in ("composerIcon", "logo") if k in d["interface"]]
        + d["interface"].get("screenshots", []))')" "True"
check "defaultPrompt has at most 3 entries of at most 128 characters" \
    "$(q "$MANIFEST" '(len(d["interface"]["defaultPrompt"]) <= 3
        and all(len(p) <= 128 for p in d["interface"]["defaultPrompt"]))')" "True"

echo
echo "--- app reference ---"

check "exactly one app, tonight-mcp" "$(q "$APPS" 'sorted(d["apps"])')" "['tonight-mcp']"
check "the app is required" "$(q "$APPS" 'd["apps"]["tonight-mcp"].get("required")')" "True"
check "the id is the Tonight connector's app ID" "$(q "$APPS" 'd["apps"]["tonight-mcp"]["id"]')" "$APP_ID"

echo
echo "--- package ---"

ZIP="$WORK/out/tonight.zip"
bash "$SCRIPT_DIR/build.sh" "$ZIP" >/dev/null 2>"$WORK/build.err"
check "the build succeeds" "$?" "0"
unzip -Z1 "$ZIP" | grep -v '/$' > "$WORK/files"
mkdir "$WORK/x" && unzip -q "$ZIP" -d "$WORK/x"
PKG="$WORK/x/tonight"

check "every entry is under the one top-level folder tonight/" \
    "$(unzip -Z1 "$ZIP" | grep -vc '^tonight/')" "0"
check "the manifest is tonight/.codex-plugin/plugin.json" \
    "$(grep -cx 'tonight/\.codex-plugin/plugin\.json' "$WORK/files")" "1"
check "the app reference is tonight/.app.json" \
    "$(grep -cx 'tonight/\.app\.json' "$WORK/files")" "1"
check "nothing besides the manifest, the app reference and skills/" \
    "$(grep -v -e '^tonight/skills/' -e '^tonight/\.codex-plugin/plugin\.json$' \
        -e '^tonight/\.app\.json$' "$WORK/files" | wc -l | tr -d ' ')" "0"
check "the manifest and app reference are the sources, unchanged" \
    "$(cmp -s "$MANIFEST" "$PKG/.codex-plugin/plugin.json" && cmp -s "$APPS" "$PKG/.app.json" && echo same)" "same"
check "one SKILL.md for each folder under skills/" \
    "$(grep '^tonight/skills/[^/]*/SKILL\.md$' "$WORK/files" | cut -d/ -f3 | sort | tr '\n' ' ')" \
    "$(cd "$ROOT/skills" && ls -1d */ | tr -d / | sort | tr '\n' ' ')"
check "no file directly under skills/" "$(grep -c '^tonight/skills/[^/]*$' "$WORK/files")" "0"
check "no skill folder name starts with ." "$(grep -c '^tonight/skills/\.' "$WORK/files")" "0"
check "a skill ships its SKILL.md and nothing else: no tests, contracts or evaluation" \
    "$(grep '^tonight/skills/' "$WORK/files" | grep -vc '^tonight/skills/[^/]*/SKILL\.md$')" "0"
check "no .DS_Store" "$(grep -c '\.DS_Store$' "$WORK/files")" "0"

for dir in "$ROOT"/skills/*/; do
    skill="$(basename "$dir")"
    check "$skill/SKILL.md is the source, unchanged" \
        "$(cmp -s "$dir/SKILL.md" "$PKG/skills/$skill/SKILL.md" && echo same)" "same"
    check "$skill frontmatter name is its folder name" \
        "$(sed -n '2,/^---$/s/^name: *//p' "$PKG/skills/$skill/SKILL.md")" "$skill"
    identity="$(q "$MANIFEST" 'd["name"]'):$skill"
    check "$identity is at most 64 characters" "$([ "${#identity}" -le 64 ] && echo yes)" "yes"
done

echo
echo "--- fresh rebuild ---"

mkdir -p "$WORK/seed/tonight" "$WORK/fresh"
echo stale > "$WORK/seed/tonight/stale.txt"
(cd "$WORK/seed" && zip -q "$WORK/fresh/tonight.zip" tonight/stale.txt)
check "the seeded output holds a stale entry" \
    "$(unzip -Z1 "$WORK/fresh/tonight.zip" | grep -c 'stale\.txt')" "1"
bash "$SCRIPT_DIR/build.sh" "$WORK/fresh/tonight.zip" >/dev/null 2>&1
check "rebuilding over it leaves no stale entry" \
    "$(unzip -Z1 "$WORK/fresh/tonight.zip" | grep -c 'stale\.txt')" "0"

echo
echo "--- app ID validation ---"

# A copy, so the source .app.json is never edited.
COPY="$WORK/copy"
mkdir "$COPY"
cp -R "$SCRIPT_DIR" "$COPY/chatgpt-plugin"
rm -rf "$COPY/chatgpt-plugin/dist"
ln -s "$ROOT/skills" "$COPY/skills"

set_id() {
    python3 -I -c 'import json, sys
d = json.load(open(sys.argv[1]))
d["apps"]["tonight-mcp"]["id"] = sys.argv[2]
json.dump(d, open(sys.argv[1], "w"))' "$COPY/chatgpt-plugin/.app.json" "$1"
}
build_copy() {
    rm -f "$COPY/out.zip"
    bash "$COPY/chatgpt-plugin/build.sh" "$COPY/out.zip" >/dev/null 2>"$COPY/err"
    echo $?
}

set_id plugin_asdk_app_abc
check "a plugin_ ID from the browser URL is refused" "$(build_copy)" "1"
check "and no ZIP is written" "$([ -e "$COPY/out.zip" ] && echo written || echo none)" "none"

set_id asdk_app_abc123
check "a registered app ID builds" "$(build_copy)" "0"
check "without the placeholder warning" "$(grep -c placeholder "$COPY/err")" "0"

set_id "$PLACEHOLDER"
check "the placeholder still builds" "$(build_copy)" "0"
check "with the placeholder warning" "$(grep -c placeholder "$COPY/err")" "1"

echo
printf '%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
