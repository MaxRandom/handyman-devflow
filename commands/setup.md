---
description: "One-time setup wizard for the handyman-devflow plugin. Walks through Atlassian + Bitbucket + stack configuration, validates connectivity, writes .dev-flow/config.yaml into the user's repo. Idempotent — safe to re-run. Use --check for verification only."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, mcp__atlassian__*
argument-hint: "[--check]"
---

# /handyman-devflow:setup

Run this once when adopting the `handyman-devflow` plugin, or when the team's Jira/Bitbucket setup changes. Idempotent — safe to re-run.

`--check` skips the wizard and just validates the existing config + MCP connectivity. Use after changing config by hand.

## Actions

### 1. Pre-flight: verify plugin dependencies + per-repo state

**a. Verify Superpowers plugin is installed (REQUIRED, both modes).**
- Check `${CLAUDE_PLUGIN_ROOT}/../superpowers` exists (`test -d "${CLAUDE_PLUGIN_ROOT}/../superpowers" && echo OK || echo MISSING`). If MISSING, ABORT: "`handyman-devflow` requires the `superpowers` plugin. Install with `/plugin marketplace add claude-plugins-official && /plugin install superpowers@claude-plugins-official`, then re-run `/handyman-devflow:setup`."

**b. Verify Atlassian plugin is installed — REQUIRED ONLY IN TRACKER MODE.**
- If the existing config has a `tracker:` block, OR the user hasn't run the wizard yet (we don't know which mode they'll pick), check `${CLAUDE_PLUGIN_ROOT}/../atlassian` exists. If MISSING, do NOT abort — instead WARN: "`atlassian` plugin not installed. Required only if you'll configure a Jira/Linear tracker. To install: `/plugin install atlassian@claude-plugins-official`. To skip (local-ticket mode), continue and answer 'n' to the tracker question."
- If the existing config has NO `tracker:` block (local-ticket mode), skip this check silently.

**c. Ensure per-repo `.dev-flow/` exists in the user's repo.**
- Check `${CLAUDE_PROJECT_DIR}/.dev-flow/config.yaml`. If missing:
  - `mkdir -p "${CLAUDE_PROJECT_DIR}/.dev-flow/tickets"`
  - `cp "${CLAUDE_PLUGIN_ROOT}/templates/config.yaml.example" "${CLAUDE_PROJECT_DIR}/.dev-flow/config.yaml"`
  - Tell the user: "Created `.dev-flow/config.yaml` from template — the wizard will help you fill in real values."

**d. Check + install `uv` (prompt — system-level).**
- Run `command -v uv && echo OK || echo MISSING`.
- If MISSING: ask the user "Semble MCP needs `uv` (a fast Python toolchain). Install via Homebrew? (y/n)".
- On `y` and macOS: run `brew install uv`.
- On `y` and Linux: run `curl -LsSf https://astral.sh/uv/install.sh | sh`.
- On `n`: warn "`codebase-researcher` will fall back to Grep-only mode. The dev-flow still works." Continue.

**e. Check `jq` (used by every slash command for state.json parsing).**
- Run `command -v jq && echo OK || echo MISSING`.
- If MISSING: ask "`jq` is used by slash commands to read state.json. Install via Homebrew? (y/n)". On `y`: `brew install jq` (macOS) or `apt-get install -y jq` (Linux, with `sudo` if needed — confirm). On `n`: warn "slash commands that parse state.json may fail. Install manually before proceeding."

**f. Prime Semble's Python cache (only if `uv` is installed).**
- Run `command -v uv >/dev/null && uvx --from "semble[mcp]" semble --help > /dev/null 2>&1 && echo PRIMED || echo SKIPPED`.
- First invocation downloads the Semble Python wheel (~10-30s). Subsequent uses are instant. Don't ask — it's a cache warm-up.

**g. Print pre-flight summary.**
- `"Plugins: superpowers ✅, atlassian ✅. Per-repo: .dev-flow/ ✅ (created|existing). System deps: uv ✅|⚠️, jq ✅|⚠️. Semble cache ✅|⚠️."` The wizard proceeds even if optional system deps are missing — they're warnings, not blockers. Plugin deps are blockers.

### 2. Detect repo state

Gather inputs for the wizard:

```
git remote -v 2>/dev/null
git branch -l
git branch --show-current
ls -la
ls -la apps/* 2>/dev/null
[ -f package.json ] && cat package.json
[ -f pnpm-lock.yaml ] && echo "lockfile: pnpm-lock.yaml"
[ -f yarn.lock ] && echo "lockfile: yarn.lock"
[ -f bun.lock ] && echo "lockfile: bun.lock"
[ -f bun.lockb ] && echo "lockfile: bun.lockb"
[ -f package-lock.json ] && echo "lockfile: package-lock.json"
```

### 3. Run codebase-researcher in scan mode

Spawn the `codebase-researcher` subagent in SCAN mode (no intake doc — it's pre-ticket). Pass:

- A note that this is SETUP mode, not Phase 2: "You're characterizing the repo for `/handyman-devflow:setup`. There is no Jira ticket yet. Skip ticket-specific work. Produce a structured stack/areas/test-commands inventory the setup wizard will use to seed defaults."
- Output of `git remote -v`
- Output of `git branch -l` and `git branch --show-current`
- Root directory listing: `ls -la`
- Contents of root `package.json` if it exists
- Contents of `apps/*/package.json` if any exist
- Lockfile presence detection from Step 1

The agent's system prompt now handles both Phase 2 mode (with intake) and SCAN mode (no intake). In SCAN mode it returns a structured inventory: detected frameworks, detected logical areas, detected test commands, detected trunk, notable conventions. Use Semble if available; fall back to Grep otherwise (silent fallback).

Capture the agent's return value. Pass it as additional input to the setup-wizard (Step 5).

If `codebase-researcher` fails (e.g., Semble unavailable AND Grep can't characterize anything), proceed with bare detection — the wizard will ask more questions instead of fewer.

### 4. If `--check` flag is present

Skip the wizard. Run validation only:

a. Parse current `config.yaml` via the loader: `npx tsx -e "import {loadConfig} from '${CLAUDE_PLUGIN_ROOT}/src/config.js'; const c = loadConfig('${CLAUDE_PROJECT_DIR}/.dev-flow/config.yaml'); console.log('config.yaml: valid'); console.log(JSON.stringify(c, null, 2));"`

b. **Tracker connectivity — only if a tracker is configured.**
   ```
   TRACKER_TYPE="$(devflow config get tracker.type 2>/dev/null || echo NONE)"
   if [ "$TRACKER_TYPE" != "NONE" ]; then
     # Test via Atlassian (or Linear) MCP `getJiraIssue` with `<project_key>-1`. Report 200 or the error.
     echo "Tracker: reachable | unreachable: <error>"
   else
     echo "Tracker: (none — local-ticket mode, no connectivity test)"
   fi
   ```

c. Print a one-line health summary: ✅ or ❌ for each: config schema, tracker reachable (or N/A in local mode), Bitbucket/GitHub reachable, default_base exists in `git branch`.

d. Exit. Do NOT proceed to wizard.

### 5. Spawn the setup-wizard subagent

Use the Agent tool with `subagent_type: setup-wizard`. Pass all the inputs gathered in Step 2 plus the current config (or "(missing)") plus the structured scan output from Step 3.

The wizard will return:
- A proposed YAML block
- A summary block

### 6. Confirm + write

Show the user the proposed YAML diff against the current config (use `diff` if both exist; otherwise just show the new content).

Ask: "Write this to `${CLAUDE_PROJECT_DIR}/.dev-flow/config.yaml`? (y/n)"

If yes:
- Verify the YAML has zero `[NEEDS-ANSWER]` markers. If any remain, refuse and tell the user to re-run after answering.
- Validate the YAML parses against the schema: `npx tsx -e "import {loadConfig} from '${CLAUDE_PLUGIN_ROOT}/src/config.js'; loadConfig('<temp-path>')"` against a temp file. If schema validation fails, refuse and surface the Zod error.
- Write `${CLAUDE_PROJECT_DIR}/.dev-flow/config.yaml`.
- If `.gitignore` was updated, stage it too.
- Commit:
  ```
  git add .dev-flow/config.yaml .gitignore 2>/dev/null
  git commit -m "chore: configure handyman-devflow for this team (via /handyman-devflow:setup)"
  ```

If no:
- Print: "Aborted. No changes written."

### 7. Final connectivity test

After writing, re-run the `--check` validation flow (Step 4 a-c). Print results.

### 8. Tell the user what's next

Print one of the two messages depending on whether a tracker is configured.

**Tracker configured:**
```
Setup complete. Next steps:
- Sign in to Atlassian when prompted on first MCP call (browser OAuth).
- Run `/handyman-devflow:start <TICKET-KEY>` on a real Jira ticket to verify end-to-end.
- See `${CLAUDE_PLUGIN_ROOT}/templates/PROCESS.md` for the full flow reference.
```

**No tracker (local-ticket mode):**
```
Setup complete (local-ticket mode — no Jira/Linear). Next steps:
- Run `/handyman-devflow:start "<short freeform title>"` to begin a ticket. The workflow generates a local id from the title slug and skips every MCP call.
- See `${CLAUDE_PLUGIN_ROOT}/templates/PROCESS.md` for the full flow reference.
```
