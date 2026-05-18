---
description: "Phase 1 — Intake. With a tracker configured: fetch the Jira ticket. Without one: take a freeform title and derive a local ticket id."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, mcp__atlassian__*
argument-hint: "<TICKET-KEY-or-freeform-title>"
---

# /handyman-devflow:start — Phase 1 (Intake)

You are running Phase 1 of the dev cycle. The argument `$1` is either:
- A tracker ticket key (e.g., `PROJ-123`) — when `tracker` is configured in `.dev-flow/config.yaml`.
- A freeform title (e.g., `"fix login button spinner"`) — when `tracker` is absent. The workflow runs in **local-ticket mode**.

If you are unsure about the overall flow, read `${CLAUDE_PLUGIN_ROOT}/templates/PROCESS.md`.

## Step 0. Detect tracker mode

```
TRACKER_TYPE="$(devflow config get tracker.type 2>/dev/null || echo NONE)"
```

- `TRACKER_TYPE != NONE` → **Tracker mode**: `$1` is the ticket key. `$TICKET=$1`.
- `TRACKER_TYPE == NONE` → **Local-ticket mode**: `$1` is the freeform title.
  Derive `$TICKET` from the title:
  ```
  TITLE_SLUG="$(devflow slug "$1")"
  TICKET="LOCAL-$(date -u +%Y%m%d)-$TITLE_SLUG"
  ```
  Cap to 60 chars total. This becomes both the ticket folder name AND the slug used in the branch.

## Precondition checks (HARD — abort if any fail)

1. **Working tree must be clean.** Run `git status --porcelain`. If output is non-empty, ABORT and tell the user: "Working tree is not clean — commit or stash before starting a new ticket."
2. **Ticket folder must not yet exist.** Run `test -d tickets/$TICKET && echo EXISTS || echo NEW`. If `EXISTS`, also check `cat tickets/$TICKET/state.json | jq -r .phase`. If `phase` is anything other than `init` or `intake-drafted`, ABORT and instruct the user: "Ticket already in progress at phase X — use /handyman-devflow:status."

## Actions

### 1. Source the ticket text

**Tracker mode:** use the Atlassian (or Linear) MCP tool `getJiraIssue` with key=`$TICKET`. Capture:
- Title
- Description
- Acceptance criteria (often in the description or a custom field)
- Labels
- Status
- Comments

**Local-ticket mode:** the user-supplied `$1` is the title. Source the body from one of:
- The user's argument itself (if it contains enough context to write an intake).
- An inline prompt to the user: "Local-ticket mode — paste the requirements / acceptance criteria / context for this work, or press Enter to proceed with just the title."

Skip every MCP call in this mode. Treat the `getJiraIssue` step as a no-op.

### 2. Compute branch name

- Slug = lowercase kebab of the title, max 60 chars. Compute via `devflow slug "<title>"`.
- Branch = expand the `provider.branch_pattern` (default `feature/{ticket}-{slug}`). Both modes work with the default pattern — local-ticket mode just expands `{ticket}` to e.g. `LOCAL-20260518-fix-login-button`.

### 3. Create feature branch

Read `${CLAUDE_PROJECT_DIR}/.dev-flow/config.yaml` for `provider.default_base` (typically `develop` or `main`).

Run:
```
git fetch origin
git checkout -b feature/$TICKET-<slug> origin/<default_base>
```

### 4. Build a lightweight codebase map

- `find apps services -maxdepth 3 -type d -not -path '*/node_modules/*' | head -40`
- `git log --since=30.days --pretty=format:'%h %s' | head -20`
- For each keyword in the title, `grep -l -r --include='*.ts' --include='*.tsx' "<keyword>" apps services | head -10`

### 5. Spawn the intake-analyst subagent

Use the Agent tool with `subagent_type: intake-analyst`. Pass:
- The ticket text (title, description, acceptance criteria, comments) — from MCP in tracker mode, from the user's input in local-ticket mode.
- A flag/note indicating which mode is active.
- The codebase map from Step 4 (paths + recent commits + keyword grep results).
- The contents of `AGENTS.md`.

The agent's system prompt handles both modes and produces the same three-section output (`Understood requirements` / `Open questions` / `Affected areas`).

Capture the agent's return value as the body of `01-INTAKE.md` (Step 6).

### 6. Write the artifact

Write `tickets/$TICKET/01-INTAKE.md`:

```markdown
# Intake — $TICKET

Source: <Jira PROJ-123 | local-ticket "fix login button">

<intake subagent output>
```

### 7. Write initial state.json

Write `tickets/$TICKET/state.json`:

```json
{
  "ticket": "$TICKET",
  "branch": "feature/$TICKET-<slug>",
  "phase": "intake-drafted",
  "updated_at": "<now ISO>",
  "last_error": null,
  "verify_attempts": 0
}
```

### 8. Append to journal

Run: `devflow journal "$TICKET" intake draft ok`

### 9. Commit atomically

```
git add tickets/$TICKET/
git commit -m "intake: $TICKET draft requirements + open questions"
```

### 10. Run the validator

Run: `devflow validate intake "$TICKET"`

If exit code 0:
- Update `state.json` to `"phase": "intake-complete"`.
- Commit: `git add tickets/$TICKET/state.json && git commit -m "intake: $TICKET requirements signed off"`.
- Tell the user: "Phase 1 complete. Next: /handyman-devflow:research."

If exit code != 0:
- Tell the user: "Phase 1 artifact draft saved BUT validator failed: <stderr>. Resolve the issues (typically: answer the [NEEDS-ANSWER] markers in tickets/$TICKET/01-INTAKE.md), then re-run /handyman-devflow:start $1."

## Tips for the user

- To answer `[NEEDS-ANSWER]` markers: edit the file in place, replacing the marker with the answer.
- **Tracker mode:** to post questions to Jira instead, ask me to use `addCommentToJiraIssue` with the questions, then paste the PM's reply back.
- **Local-ticket mode:** there is no PM — just edit the markers directly with the answers you choose.
- Re-running `/handyman-devflow:start` with the same argument is safe — it's idempotent once the ticket folder exists.
