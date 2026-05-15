---
description: "Phase 3 — Produce ordered task list with acceptance criteria + test plan."
allowed-tools: Bash, Read, Glob, Grep, Write, Edit, Agent
---

# /task:plan — Phase 3

Determine ticket from current branch: `git branch --show-current` → extract `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` == `research-complete`.
3. `cd .dev-flow && npx tsx src/validators/research.ts $TICKET` exit 0.

## Actions

### 1. Spawn a planning subagent

Use the Agent tool. Provide the subagent with:
- `01-INTAKE.md`
- `02-RESEARCH.md`
- AGENTS.md

Ask the subagent to produce a plan in the following exact format:

````
## Tasks

### Task 1: <component or area> — <one-line goal>
**Acceptance criteria:** <one sentence; measurable; how we'll know this task is done>
**Files:** <comma-separated paths to be touched>

### Task 2: ...
**Acceptance criteria:** ...
**Files:** ...

(... as many tasks as needed, kept small/focused)

## Test plan

### Unit
- <test file or test name>: <what it asserts>

### Integration
- <test file or test name>: <what it asserts>
- (or "N/A" if not applicable)

### E2E
- <playwright spec>: <user journey assertion>

## Rollback note
<one-paragraph rollback strategy if this PR ships and breaks production>
````

### 2. Write the artifact + commit

```
write tickets/$TICKET/03-PLAN.md
cd .dev-flow && npx tsx src/journal-cli.ts $TICKET plan draft ok
cd ..
git add tickets/$TICKET/03-PLAN.md tickets/$TICKET/.journal.jsonl
git commit -m "plan: $TICKET implementation plan"
```

### 3. Run validator

`cd .dev-flow && npx tsx src/validators/plan.ts $TICKET`

If exit 0:
- Advance state to `plan-complete`.
- Commit state.json.
- Tell user: "Phase 3 complete. Next: /task:implement."

If exit != 0:
- Tell user the issues. Common: missing `**Acceptance criteria:**` per task, or missing `## Test plan`.
