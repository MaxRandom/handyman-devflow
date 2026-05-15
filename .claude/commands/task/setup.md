---
description: "One-time setup wizard for the dev-flow tool. Walks through Atlassian + Bitbucket + stack configuration, validates connectivity, writes .dev-flow/config.yaml. Idempotent — safe to re-run. Use --check for verification only."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, mcp__atlassian__*
argument-hint: "[--check]"
---

# /task:setup

Run this once when adopting the dev-flow tool, or when the team's Jira/Bitbucket setup changes. Idempotent — safe to re-run.

`--check` skips the wizard and just validates the existing config + MCP connectivity. Use after changing config by hand.

## Actions

### 1. Pre-flight

- Check if `.dev-flow/` exists. If not, ABORT: "dev-flow not installed. See AGENTS.md."
- Check if `.dev-flow/node_modules/` exists. If not, prompt: "Dev-flow dependencies not installed. Run `cd .dev-flow && npm install`? (y/n)" — if yes, run it.
- Check if `.dev-flow/config.yaml` exists. If not, treat as "(missing)".
- Check if `.gitignore` (root) includes `.dev-flow/node_modules/` and `.dev-flow/auth/`. If missing, append them and stage for commit.

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

### 3. If `--check` flag is present

Skip the wizard. Run validation only:

a. Parse current `config.yaml` via the loader: `cd .dev-flow && npx tsx -e "import {loadConfig} from './src/config.js'; const c = loadConfig('config.yaml'); console.log('config.yaml: valid'); console.log(JSON.stringify(c, null, 2));"`

b. Test Jira connectivity via Atlassian MCP `getJiraIssue` with `<project_key>-1`. Report 200 or the error.

c. Print a one-line health summary: ✅ or ❌ for each: config schema, Jira reachable, Bitbucket reachable, default_base exists in `git branch`.

d. Exit. Do NOT proceed to wizard.

### 4. Spawn the setup-wizard subagent

Use the Agent tool with `subagent_type: setup-wizard`. Pass all the inputs gathered in Step 2 plus the current config (or "(missing)").

The wizard will return:
- A proposed YAML block
- A summary block

### 5. Confirm + write

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

### 6. Final connectivity test

After writing, re-run the `--check` validation flow (Step 3 a-c). Print results.

### 7. Tell the user what's next

Print:
```
Setup complete. Next steps:
- Sign in to Atlassian when prompted on first MCP call (browser OAuth).
- Run `/task:start <TICKET-KEY>` on a real Jira ticket to verify end-to-end.
- See `.dev-flow/PROCESS.md` for the full flow reference.
```
