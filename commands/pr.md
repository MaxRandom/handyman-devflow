---
description: "Phase 8 — Push branch, open Bitbucket PR via Atlassian MCP, transition Jira ticket."
allowed-tools: Bash, Read, Write, mcp__atlassian__*
---

# /handyman-devflow:pr — Phase 8

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` == `security-reviewed`.
3. `devflow validate security "$TICKET"` exit 0.

## Actions

### 1. Push the branch

```
git push -u origin $(git branch --show-current)
```

### 2. Read config for PR settings

Parse `${CLAUDE_PROJECT_DIR}/.dev-flow/config.yaml`:
- `provider.workspace`, `provider.repo`, `provider.default_base`
- `provider.default_reviewers`, `provider.default_labels`
- `tracker.pr_transition`

### 3. Compose PR body

Read `tickets/$TICKET/01-INTAKE.md`, `03-PLAN.md`, `05-TEST-EVIDENCE.md`, `06-VERIFICATION.md`, `07-SECURITY.md`. Build the PR body:

```markdown
## $TICKET — <intake title>

### Intent (from intake)
<Understood requirements section, verbatim>

### Implementation summary (from plan)
<task list — one line per task>

### Test results (from evidence)
- Unit: PASS (<count>)
- Integration: PASS (<count>) | SKIPPED
- E2E: PASS (<count>) — trace: tickets/$TICKET/evidence/...

### Verification (judge-gate)
<Verification table from 06>

### Security
- Dependency findings: <N total, M open=0, K waived>
- Static analysis: <N total, M open=0, K waived>
- Manual review: <N findings, M open=0, K waived>

### Artifacts
Full audit trail in `tickets/$TICKET/`.
```

### 4. Open the PR

Call Atlassian MCP `bitbucketPullRequest.create` with:
- workspace, repo, source branch, destination = default_base
- title: `$TICKET: <ticket title>`
- body: <composed body>
- reviewers: default_reviewers
- (close source branch on merge: depends on team convention)

Capture the returned PR URL.

### 5. Transition Jira ticket

Call Atlassian MCP `transitionJiraIssue` with key=$TICKET, transition=`tracker.pr_transition`.

Call `addCommentToJiraIssue` with body: `PR opened: <PR URL>`.

### 6. Write 08-PR.md

```markdown
# PR — $TICKET

**URL:** <PR URL>
**Jira transition:** <from-status> → <to-status> (succeeded)
**Opened at:** <ISO timestamp>

## Summary
<one-paragraph summary, same as PR body intent>
```

### 7. Commit + push

```
devflow journal "$TICKET" pr open ok
git add tickets/$TICKET/08-PR.md tickets/$TICKET/.journal.jsonl
git commit -m "pr: $TICKET opened"
git push
```

### 8. Run validator

`devflow validate pr "$TICKET"`

If exit 0:
- Advance state to `pr-opened`. Commit + push state.json.
- Tell user: "Phase 8 complete. PR open at <URL>. Cycle done."

If exit != 0:
- Surface issue (typically: PR URL not captured, or Jira transition failed).
