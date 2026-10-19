# Plan — Tonight as an installable ChatGPT plugin ZIP

Status: plan READY (review round 2), implemented · branch `tonight-chatgpt-plugin` · 2026-10-20

Revision 2 addresses review round 1. `name` and `displayName` are now treated as separate fields.
The option of keeping `tonight-ios-test` as the name, with `Tonight` as the display name, is
stated. The plan no longer assumes ChatGPT picks an update target by name: choosing a target is
left to the user and called unverified.

## Goal

Produce one ZIP that ChatGPT accepts as a plugin named **Tonight**. It packages the existing
`tonight-recommend` skill, unchanged, and *references* the separately installed Tonight MCP
connector instead of bundling it. The package follows Inbox Labeler's merged ChatGPT plugin
(`vicox/inbox-labeler` `main`, d21449b, whose tree is identical to the reviewed `e8076af`):
`chatgpt-plugin/.codex-plugin/plugin.json`, `chatgpt-plugin/.app.json`, `build.sh`, `test.sh`,
with the skills copied in at build time.

The user's existing test plugin, `tonight-ios-test`, is what this package supersedes. The new one
is called simply **Tonight**.

Out of scope: any change to `SKILL.md`, the MCP server, the website or its setup walkthrough, the
generated project instructions, icons and screenshots, directory submission, and anything in the
user's ChatGPT account, `~/.claude` or `~/.codex`. Nothing is uninstalled or deleted.

## Separate install paths

The plugin is a third way to use Tonight, beside the two that exist. It replaces neither.

| Path | What the host gets | Changed here |
| --- | --- | --- |
| Any skill-reading host | `skills/tonight-recommend/SKILL.md` | no |
| ChatGPT project (the `/setup` walkthrough) | connector + the generated projection `web/lib/generated/project-instructions.ts` | no |
| **ChatGPT plugin (new)** | `SKILL.md`, byte-identical, + a reference to the connector | added |

A plugin is a host that reads skills, so it carries the specification itself rather than a
projection. The README's rule, that `SKILL.md` is the only file anybody edits, holds: the build
copies it and the test proves the copy is byte-identical.

## What exists in the user's ChatGPT account

This session is denied `~/.codex`. The reviewer read it, read-only, on 2026-10-20. Everything below
is quoted from that report. None of it is inferred.

| Cached object | Name / display name | App reference | Notes |
| --- | --- | --- | --- |
| `plugins/cache/created-by-me-remote/tonight-ios-test/1.0.0/` (remote id `Plugin_e60d2c129dc88191907450adff068a57`) | `tonight-ios-test` / `tonight-ios-test` | key `tonight` → `asdk_app_6a989ba64af0819199e46bf257f8ad5a`, `required: true` | The uploaded test plugin. Author "Workspace upload", category `Other`. Ships a root `plugin.json` (`$schema` agent-plugins.org, `extensions.com.openai.apps`) and the normalized `.codex-plugin/plugin.json`. Its one skill, `tonight-recommend`, is an older 8,297-byte `SKILL.md` (sha256 `61f73ec7…`), not today's 39,497-byte one (`c39b1c81…`). |
| `plugins/cache/created-by-me-remote/dev-6a989ba64af0819199e46bf257f8ad5a/1.0.0/` (remote id `plugin_asdk_app_6a989ba64af0819199e46bf257f8ad5a`) | `dev-6a98…` / **`Tonight`** | key `dev-6a98…` → `asdk_app_6a989ba64af0819199e46bf257f8ad5a` | The plugin ChatGPT generated for the connector itself. No skills. |
| `cache/remote_plugin_catalog/27c076f5b482b822.json` | `tonight` / `tonight` (remote id `Plugin_d28f8db4300881919bd46a3ecb5d9a50`, v1.0.0) | none (`app_ids: []`, `app_manifest: null`) | A separate private upload with the `tonight-recommend` skill and no app. Not cached locally. |
| `cache/codex_apps_tools/b6c8…json`, `.codex-global-state.json` | connector `Tonight` | `connector_id` `asdk_app_6a989ba64af0819199e46bf257f8ad5a` | Tools such as `tonight.correct_episode`, i.e. Tonight's MCP tools. |

So the connector's app ID is **`asdk_app_6a989ba64af0819199e46bf257f8ad5a`**, and four independent
caches agree on it. Its ChatGPT display name is already `Tonight`. No cache maps it explicitly to
`https://tonight.movie/mcp`. The tie is the tool names, which are Tonight's own.

## Evidence on the package format

Inbox Labeler's plan, `docs/chatgpt-plugin-plan.md` in that repo, records the OpenAI sources:
plugin-creator spec, curated plugins, plugin build docs and agents-API plugin docs. They are not
repeated here. Re-read today for this plan:

| Source | What it settles |
| --- | --- |
| developers.openai.com/plugins/deploy/submission-errors | `interface.category` must be one of `Productivity`, `Creativity`, `Developer Tools`, `Business & Operations`, `Data & Analytics`, `Communication`, `Education & Research`, `Security`, `Finance`, `Healthcare`, `Travel`, **`Entertainment`**, `Other`. `name` is ≤64 characters of `[A-Za-z0-9_-]`, starting with a letter or digit. `version` is required semver. **`plugin_name_mismatch`**: "The package name in an update must match the existing plugin name." **`plugin_version_unchanged`**: "A new release must use a different manifest `version`." `skill_identity_too_long`: `plugin-name:skill-name` ≤64 characters. App ID prefixes and ZIP layout rules are as in Inbox Labeler's plan. |
| `openai/skills` plugin-creator `plugin-json-spec.md` (re-read) | Unchanged since Inbox Labeler: same field set, `defaultPrompt` ≤3 entries, ≤128 characters each. |
| tonight.movie/privacy, tonight.movie/terms (fetched) | Both live: "Privacy Policy — Tonight", "Terms of Use — Tonight". |

## Decisions

1. **Same layout as Inbox Labeler.** The manifest goes at `.codex-plugin/plugin.json`, with no root
   `plugin.json`. The connector is referenced through `.app.json` only, with no `.mcp.json`. The ZIP holds
   one top-level folder, `tonight/`. Inbox Labeler's Decisions 1 and 2 give the reasons, and the
   test-plugin's root `plugin.json` does not change them: ChatGPT normalizes either form to
   `.codex-plugin/plugin.json` (`manifest_normalized`).
2. **`name: "tonight"`, `displayName: "Tonight"`.** The two fields do different jobs. `name` is
   the package's identity and the namespace of its skills. `displayName` is what ChatGPT shows.
   The user asked for the plugin to be called Tonight. Inbox Labeler names its package after the
   product, kebab-cased, so both fields follow from that.
   - **Considered: keep `name: "tonight-ios-test"` and change only `displayName` to `Tonight`.**
     It would show *Tonight*, and it is the only name that could be uploaded as an update of the
     test plugin, because an update must carry the existing plugin's name
     (`plugin_name_mismatch`). It is not chosen, because the test name would stay the package's
     permanent identity, and the skill's namespace would be
     `tonight-ios-test:tonight-recommend`. The user can still choose it at upload time. It is a
     one-field change to the manifest.
   - **The name `tonight` is already used** by a private plugin in the account, `Plugin_d28f…`, at
     v1.0.0, with the skill and no app. The documentation says only that an update must match the
     existing plugin's name. It does not say how an upload chooses its target, or what happens to
     a new upload whose name is already taken. Whether this ZIP is uploaded as a new plugin or as
     an update of that one is therefore the user's choice, made in ChatGPT's own UI. Neither
     outcome is assumed here, and nothing is deleted on the user's behalf.
3. **`version: "1.1.0"`, not Inbox Labeler's `0.1.0`.** Both existing Tonight uploads carry
   `1.0.0`. A version above that cannot hit `plugin_version_unchanged`, whichever way the user
   installs it, and it does not read as a downgrade of either one.
4. **The app ID is the real one.** It is `asdk_app_6a989ba64af0819199e46bf257f8ad5a`, under the
   key `tonight-mcp`, which mirrors `inbox-labeler-mcp`, with `required: true`. The placeholder
   path from Inbox Labeler stays in `build.sh` for a deployment with a different connector:
   `REPLACE_WITH_TONIGHT_MCP_APP_ID` warns, and any other ID must match
   `^(asdk_app_|connector_|templated_apps_)[A-Za-z0-9][A-Za-z0-9_-]*$`.
5. **Copy each skill's `SKILL.md` only.** Inbox Labeler copies each skill folder minus `test.sh`.
   For those skills that leaves exactly `SKILL.md`. Tonight's skill folder also holds
   `contracts.mjs` (imported by `test.sh` and `web/lib/instructions.test.ts`) and `evaluation/`
   (32 tracked files of evaluation harness, fixtures, rubrics and prompts, plus git-ignored
   `results/` directories that can hold thousands of run transcripts). `SKILL.md` references none
   of them. Shipping them would put test machinery and evaluation prompts in front of ChatGPT as
   skill resources. So the build copies `skills/<name>/SKILL.md` alone, which gives the same
   outcome as Inbox Labeler: the runtime skill and nothing else. The test enforces it.
6. **Manifest text comes from text that already exists.**
   - `description` is adapted from the skill's own `description`.
   - `shortDescription` is the README tagline.
   - `longDescription` is the README's opening paragraph, plus where the model lives. The README's
     em dash becomes a comma.
   - The three `defaultPrompt`s are the first three worked examples from
     `web/lib/worked-examples.ts`.
   - `category` is `Entertainment`, from the documented list.
   - `capabilities` is `["Read", "Write"]`, because Tonight writes, like Inbox Labeler.
7. **Leave out the optional extras,** as Inbox Labeler does: icons, screenshots, `brandColor`,
   hooks, `agents/openai.yaml`, `marketplace.json`.

## Files

```
chatgpt-plugin/
├── .codex-plugin/plugin.json   manifest (below)
├── .app.json                   reference to the Tonight connector
├── build.sh                    assembles dist/tonight.zip
├── test.sh                     checks the sources and the built ZIP
└── dist/                       build output, git-ignored
```

Edits elsewhere:

- `.gitignore` gains `chatgpt-plugin/dist/`.
- `README.md` gains a short `### The ChatGPT plugin` subsection under *The skill*, after *One
  specification, several projections*. It covers what the plugin carries, how to build it, and
  that it needs the connector and changes no other path. *Running it* gains
  `bash chatgpt-plugin/test.sh` beside the skill contract test.
- This plan.

### `.codex-plugin/plugin.json`

```json
{
  "name": "tonight",
  "version": "1.1.0",
  "description": "Find a film to watch tonight, using and growing the taste model you own in the Tonight app.",
  "author": {
    "name": "Georg Schmidl",
    "url": "https://github.com/vicox"
  },
  "homepage": "https://tonight.movie",
  "repository": "https://github.com/vicox/tonight",
  "license": "MIT",
  "keywords": ["movies", "films", "recommendations", "taste"],
  "skills": "./skills/",
  "apps": "./.app.json",
  "interface": {
    "displayName": "Tonight",
    "shortDescription": "Build your taste. Find your movie.",
    "longDescription": "Tonight is a personal movie recommender in which you own the recommender. Instead of a profile that watches what you do and never shows you what it concluded, you write down what you like, and you can read it, edit it and delete it at any time. Your Genres, Vibes, Movies and Verdicts live in the Tonight app.",
    "developerName": "Georg Schmidl",
    "category": "Entertainment",
    "capabilities": ["Read", "Write"],
    "websiteURL": "https://tonight.movie",
    "privacyPolicyURL": "https://tonight.movie/privacy",
    "termsOfServiceURL": "https://tonight.movie/terms",
    "defaultPrompt": [
      "I want something ridiculously fun tonight.",
      "Give me a clever mystery where nobody tells the truth.",
      "I want smart sci-fi that keeps me on edge."
    ]
  }
}
```

### `.app.json`

```json
{
  "apps": {
    "tonight-mcp": {
      "id": "asdk_app_6a989ba64af0819199e46bf257f8ad5a",
      "required": true
    }
  }
}
```

### `build.sh`

This is Inbox Labeler's `build.sh` with `NAME=tonight`, the key `tonight-mcp` and the placeholder
`REPLACE_WITH_TONIGHT_MCP_APP_ID`. The one change is the skill loop, which creates
`$pkg/skills/<name>/` and copies `SKILL.md` into it instead of `cp -R` followed by removing
`test.sh`. Everything else is kept as it is:

- an optional absolute or relative output path, defaulting to `chatgpt-plugin/dist/tonight.zip`;
- staging in `mktemp -d`, removed on exit;
- the app ID checked with `python3 -I` before anything is staged;
- `zip -qrX` into a fresh file in the staging dir, excluding `*.DS_Store`;
- `mv -f` over the output, so nothing survives from a previous archive;
- printing the ZIP path.

### `test.sh`

This is Inbox Labeler's `test.sh` with the names substituted. It covers the manifest, the app
reference, the package, a fresh rebuild over a stale archive, and app ID validation on a temp
copy. The source `.app.json` is never edited. Changes:

- **Skill contents.** Instead of "no `test.sh`", it checks that every packaged file under
  `tonight/skills/` is some `tonight/skills/<name>/SKILL.md`. In particular no `contracts.mjs`, no
  `evaluation/` and no `test.sh` are packaged.
- **Pinned values.** The app reference is checked for exactly the key `tonight-mcp`, `required`
  true, and the real ID `asdk_app_6a989ba64af0819199e46bf257f8ad5a`. The placeholder is no longer
  accepted from the source, because the real ID is known. The placeholder build is still tested on
  the temp copy.
- **Three more checks, each from a documented rule:**
  - `interface.category` is in the documented list;
  - `version` is semver;
  - `plugin-name:skill-name` is ≤64 characters for every skill.

Everything else, including the `check` helper, `PASS`/`FAIL` lines and non-zero exit on failure,
stays as it is.

## Steps

1. The plan is reviewed until READY. Nothing is implemented before that.
2. Add the two JSON files, `build.sh`, `test.sh` (mode 755, like `skills/tonight-recommend/test.sh`,
   if this session's `chmod` is allowed, otherwise 644 and run with `bash`), the `.gitignore`
   line, and the README lines.
3. This session cannot execute scripts; its permission mode denies `bash <script>`. So:
   - The delivered `chatgpt-plugin/dist/tonight.zip` is written by an inline `python3 -I -c`
     `zipfile` run that stages exactly what `build.sh` stages: the manifest, `.app.json` and
     `SKILL.md`, under `tonight/`.
   - The reviewer runs `bash chatgpt-plugin/test.sh`, which writes only to temp dirs, and
     `bash skills/tonight-recommend/test.sh` as a regression check. It also compares the
     delivered ZIP's entries and file bytes with a fresh `build.sh` output in a temp dir.
4. The implementation is reviewed until READY.

Nothing is committed, pushed or merged unless the user asks.

## Replacing the existing plugin: user action required

Nothing here touches ChatGPT, the deployed app or `~/.codex`. Installing is a manual upload of
`chatgpt-plugin/dist/tonight.zip` by the user. What to expect:

- **The connector stays as it is.** It is ChatGPT app `Tonight`,
  `asdk_app_6a989ba64af0819199e46bf257f8ad5a`, and the plugin requires it.
- **`tonight-ios-test` is not replaced by this ZIP.** Its name differs, so it cannot be uploaded
  as that plugin's update. It remains, still with the old 8 KB skill. Once the new plugin works,
  the user disables or uninstalls it in ChatGPT, if they want to. Until then two copies of
  `tonight-recommend`, old and new, are installed side by side. To update the test plugin in place
  instead, set `name` back to `tonight-ios-test` and rebuild (Decision 2).
- **The name `tonight` is already used by the private plugin `Plugin_d28f…`.** Whether to upload
  this ZIP as a new plugin or as an update of that one is the user's call in ChatGPT's UI.
  ChatGPT's handling of either is undocumented and untested. If it refuses the upload because of
  the name, do not delete the existing plugin to make room. Report it, and the name is
  reconsidered.
- **Verify the plugin can reach Tonight** the way `/setup` already does: ask ChatGPT to call
  `get_server_info` and report the version.

## Implementation notes

- **This session could run neither scripts nor `chmod`.** Its permission mode denies both.
  - `build.sh` and `test.sh` are mode 644. `test.sh` invokes the build through `bash`, and so does
    the README.
  - The delivered `chatgpt-plugin/dist/tonight.zip` was written by an inline `python3 -I -c`
    `zipfile` run. It holds the seven entries `zip -r` produces from `build.sh`'s staging dir:
    - four directories, mode 40755;
    - `tonight/.codex-plugin/plugin.json`, `tonight/.app.json` and
      `tonight/skills/tonight-recommend/SKILL.md`, each byte-identical to its source.
- **The reviewer ran the tests,** and the implementation review was READY in round 1:
  - `bash chatgpt-plugin/test.sh`: 34 passed, 0 failed.
  - `bash skills/tonight-recommend/test.sh`: 208 passed, 0 failed.
  - A fresh `build.sh` output and the delivered ZIP hold the same seven entries, and all three
    files are byte-identical. Only the entry order differs.
  - The scripts differ from Inbox Labeler's only where planned.

## Risks this plan does not resolve

- **Upload acceptance is untested.** The package follows the documented shape. No upload was
  observed. How ChatGPT chooses between a new plugin and an update, with the name `tonight`
  already in use, is undocumented.
- **The full skill in ChatGPT.** The plugin ships the 39 KB specification, including its
  `full:` rationale and `project:compact` blocks, as every skill-reading host gets it. How
  ChatGPT's plugin runtime loads a skill that size is not observed. `skill_bundle_too_large` is
  measured in MiB, so the documented limit is not near.
- **No icon.** ChatGPT shows its default until assets are added.
