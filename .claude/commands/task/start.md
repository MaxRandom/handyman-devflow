---
description: "Phase 1 — Intake. Fetch Jira ticket, draft requirements, surface open questions, create feature branch."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, mcp__atlassian__*
argument-hint: "<TICKET>"
---

# /task:start — Phase 1 (Intake)

You are running Phase 1 of the dev cycle for ticket **$1**.

If you are unsure about the overall flow, read `.dev-flow/PROCESS.md`.

## Precondition checks (HARD — abort if any fail)

1. **Working tree must be clean.** Run `git status --porcelain`. If output is non-empty, ABORT and tell the user: "Working tree is not clean — commit or stash before starting a new ticket."
2. **Ticket folder must not yet exist.** Run `test -d tickets/$1 && echo EXISTS || echo NEW`. If `EXISTS`, also check `cat tickets/$1/state.json | jq -r .phase`. If `phase` is anything other than `init` or `intake-drafted`, ABORT and instruct the user: "Ticket already in progress at phase X — use /task:status."

## Actions

### 1. Fetch the Jira ticket

Use the Atlassian MCP tool `getJiraIssue` with key=`$1`. Capture:
- Title
- Description
- Acceptance criteria (often in the description or a custom field)
- Labels
- Status
- Comments

### 2. Compute branch name

- Slug = lowercase kebab of the Jira title, max 60 chars (use `cd .dev-flow && npx tsx -e "import {slugify} from './src/utils/slug.js'; console.log(slugify(process.argv[1]))" "<title>"`).
- Branch = `feature/$1-<slug>`.

### 3. Create feature branch

Read `.dev-flow/config.yaml` for `provider.default_base` (typically `develop`).

Run:
```
git fetch origin
git checkout -b feature/$1-<slug> origin/<default_base>
```

### 4. Build a lightweight codebase map

- `find apps services -maxdepth 3 -type d -not -path '*/node_modules/*' | head -40`
- `git log --since=30.days --pretty=format:'%h %s' | head -20`
- For each keyword in the ticket title, `grep -l -r --include='*.ts' --include='*.tsx' "<keyword>" apps services | head -10`

### 5. Spawn an intake subagent

Use the Agent tool with subagent_type=general-purpose. Provide the agent with:
- The Jira ticket text
- The codebase map (paths + recent commits + keyword hits)
- The team's `AGENTS.md`

Ask the subagent to produce three sections:

```
## Understood requirements
- bullet 1 (testable: contains a verb + measurable outcome)
- bullet 2
...

## Open questions
- [NEEDS-ANSWER] question 1
- [NEEDS-ANSWER] question 2
(or "(none)" if intake is genuinely unambiguous)

## Affected areas
- exact/file/path.tsx — reasoning
- exact/file/path.ts — reasoning
```

### 6. Write the artifact

Write `tickets/$1/01-INTAKE.md`:

```markdown
# Intake — $1

<intake subagent output>
```

### 7. Write initial state.json

Write `tickets/$1/state.json`:

```json
{
  "ticket": "$1",
  "branch": "feature/$1-<slug>",
  "phase": "intake-drafted",
  "updated_at": "<now ISO>",
  "last_error": null
}
```

### 8. Append to journal

Run: `cd .dev-flow && npx tsx -e "import {append} from './src/journal.js'; append('..', '$1', { phase: 'intake', step: 'draft', status: 'ok' })"`

### 9. Commit atomically

```
git add tickets/$1/
git commit -m "intake: $1 draft requirements + open questions"
```

### 10. Run the validator

Run: `cd .dev-flow && npx tsx src/validators/intake.ts $1`

If exit code 0:
- Update `state.json` to `"phase": "intake-complete"`.
- Commit: `git add tickets/$1/state.json && git commit -m "intake: $1 requirements signed off"`.
- Tell the user: "Phase 1 complete. Next: /task:research."

If exit code != 0:
- Tell the user: "Phase 1 artifact draft saved BUT validator failed: <stderr>. Resolve the issues (typically: answer the [NEEDS-ANSWER] markers in tickets/$1/01-INTAKE.md), then re-run /task:start $1."

## Tips for the user

- To answer [NEEDS-ANSWER] markers: edit the file in place, replacing the marker with the answer.
- To post questions to Jira instead: ask me to use `addCommentToJiraIssue` with the questions, then paste the PM's reply back.
- Re-run `/task:start $1` is safe — it's idempotent once the ticket folder exists.
