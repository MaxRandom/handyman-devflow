---
description: "One-time setup wizard for the dev-flow tool. Walks through Atlassian + Bitbucket + stack configuration, validates connectivity, writes .dev-flow/config.yaml. Idempotent — safe to re-run. Use --check for verification only."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, mcp__atlassian__*
argument-hint: "[--check]"
---

# /task:setup

Run this once when adopting the dev-flow tool, or when the team's Jira/Bitbucket setup changes. Idempotent — safe to re-run.

`--check` skips the wizard and just validates the existing config + MCP connectivity. Use after changing config by hand.

## Actions

### 1. Detect + install dependencies (auto)

This step ensures every dependency the dev-flow needs is present BEFORE the wizard runs. Each install asks confirmation only for system-level changes (Homebrew / curl).

**a. Verify `.dev-flow/` exists.**
- Run `test -d .dev-flow && echo OK || echo MISSING`. If MISSING: ABORT with "dev-flow not installed. See AGENTS.md."

**b. Install Node deps (no prompt — local to repo).**
- Run `test -d .dev-flow/node_modules && echo OK || echo MISSING`.
- If MISSING: run `cd .dev-flow && npm install` directly. Tell the user "Installing dev-flow Node dependencies..." and surface the output. Don't ask — it's a one-time local install with no side effects outside `.dev-flow/`.

**c. Check + install `uv` (prompt — system-level).**
- Run `command -v uv && echo OK || echo MISSING`.
- If MISSING: ask the user "Semble MCP needs `uv` (a fast Python toolchain). Install via Homebrew? (y/n)". 
- On `y` and macOS: run `brew install uv`.
- On `y` and Linux: run `curl -LsSf https://astral.sh/uv/install.sh | sh`.
- On `n`: warn "`codebase-researcher` will fall back to Grep-only mode. The dev-flow still works." Continue.

**d. Check `jq` (used by every slash command for state.json parsing).**
- Run `command -v jq && echo OK || echo MISSING`.
- If MISSING: ask "`jq` is used by slash commands to read state.json. Install via Homebrew? (y/n)". On `y`: `brew install jq` (macOS) or `apt-get install -y jq` (Linux, with `sudo` if needed — confirm). On `n`: warn "slash commands that parse state.json may fail. Install manually before proceeding."

**e. Prime Semble's Python cache (only if `uv` is installed).**
- Run `command -v uv >/dev/null && uvx --from "semble[mcp]" semble --help > /dev/null 2>&1 && echo PRIMED || echo SKIPPED`.
- First invocation downloads the Semble Python wheel (~10-30s). Subsequent uses are instant. Don't ask — it's a cache warm-up.

**f. Ensure `.gitignore` covers dev-flow runtime dirs.**
- Verify `.gitignore` (root) includes `.dev-flow/node_modules/` and `.dev-flow/auth/`. If either is missing, append (then stage for the eventual config commit).

**g. Print a summary line.**
- `"Dependencies: Node ✅, uv ✅|⚠️ (skipped), jq ✅|⚠️, Semble cache ✅|⚠️."` The wizard proceeds even if optional deps are missing — they're warnings, not blockers.

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
[ -d .dev-flow/node_modules ] && echo "deps installed: yes" || echo "deps installed: no"
```

### 3. Run codebase-researcher in scan mode

Spawn the `codebase-researcher` subagent in SCAN mode (no intake doc — it's pre-ticket). Pass:

- A note that this is SETUP mode, not Phase 2: "You're characterizing the repo for `/task:setup`. There is no Jira ticket yet. Skip ticket-specific work. Produce a structured stack/areas/test-commands inventory the setup wizard will use to seed defaults."
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

a. Parse current `config.yaml` via the loader: `cd .dev-flow && npx tsx -e "import {loadConfig} from './src/config.js'; const c = loadConfig('config.yaml'); console.log('config.yaml: valid'); console.log(JSON.stringify(c, null, 2));"`

b. Test Jira connectivity via Atlassian MCP `getJiraIssue` with `<project_key>-1`. Report 200 or the error.

c. Print a one-line health summary: ✅ or ❌ for each: config schema, Jira reachable, Bitbucket reachable, default_base exists in `git branch`.

d. Exit. Do NOT proceed to wizard.

### 5. Spawn the setup-wizard subagent

Use the Agent tool with `subagent_type: setup-wizard`. Pass all the inputs gathered in Step 2 plus the current config (or "(missing)") plus the structured scan output from Step 3.

The wizard will return:
- A proposed YAML block
- A summary block

### 6. Confirm + write

Show the user the proposed YAML diff against the current config (use `diff` if both exist; otherwise just show the new content).

Ask: "Write this to `.dev-flow/config.yaml`? (y/n)"

If yes:
- Verify the YAML has zero `[NEEDS-ANSWER]` markers. If any remain, refuse and tell the user to re-run after answering.
- Validate the YAML parses against the schema: `cd .dev-flow && npx tsx -e "import {loadConfig} from './src/config.js'; ..."` against a temp file. If schema validation fails, refuse and surface the Zod error.
- Write `.dev-flow/config.yaml`.
- If `.gitignore` was updated, stage it too.
- Commit:
  ```
  git add .dev-flow/config.yaml .gitignore 2>/dev/null
  git commit -m "chore: configure dev-flow for this team (via /task:setup)"
  ```

If no:
- Print: "Aborted. No changes written."

### 7. Final connectivity test

After writing, re-run the `--check` validation flow (Step 4 a-c). Print results.

### 8. Tell the user what's next

Print:
```
Setup complete. Next steps:
- Sign in to Atlassian when prompted on first MCP call (browser OAuth).
- Run `/task:start <TICKET-KEY>` on a real Jira ticket to verify end-to-end.
- See `.dev-flow/PROCESS.md` for the full flow reference.
```
