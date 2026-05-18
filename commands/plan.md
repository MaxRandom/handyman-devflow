---
description: "Phase 3 — Produce ordered task list with acceptance criteria + test plan."
allowed-tools: Bash, Read, Glob, Grep, Write, Edit, Agent
---

# /handyman-devflow:plan — Phase 3

Determine ticket from current branch: `git branch --show-current` → extract `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` == `research-complete`.
3. `devflow validate research "$TICKET"` exit 0.

## Actions

### 1. Spawn the task-planner subagent

Use the Agent tool with `subagent_type: task-planner`. Pass:
- The full content of `tickets/$TICKET/01-INTAKE.md`
- The full content of `tickets/$TICKET/02-RESEARCH.md`
- The contents of `AGENTS.md`

The agent's system prompt handles the output format (Tasks with acceptance criteria + Files / Test plan / Rollback note). Each task is small and individually committable.

Capture the agent's return value as the body of `03-PLAN.md`.

### 2. Write the artifact + commit

```
write tickets/$TICKET/03-PLAN.md
devflow journal "$TICKET" plan draft ok
git add tickets/$TICKET/03-PLAN.md tickets/$TICKET/.journal.jsonl
git commit -m "plan: $TICKET implementation plan"
```

### 3. Run validator

`devflow validate plan "$TICKET"`

If exit 0:
- Advance state to `plan-complete`.
- Commit state.json.
- Tell user: "Phase 3 complete. Next: /handyman-devflow:implement."

If exit != 0:
- Tell user the issues. Common: missing `**Acceptance criteria:**` per task, or missing `## Test plan`.
