---
description: "Phase 4 — Execute plan tasks with atomic per-task commits + lint/typecheck after each."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# /task:implement — Phase 4

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` ∈ {`plan-complete`, `implementation-in-progress`}. (Resumable mid-flow; the second value is set by this command itself when paused.)
3. `cd .dev-flow && npx tsx src/validators/plan.ts $TICKET` exit 0.

## Actions

### 1. Read the plan

Parse `tickets/$TICKET/03-PLAN.md` to extract task IDs and titles. Look at `tickets/$TICKET/04-IMPLEMENTATION.md` if it exists — skip already-completed tasks.

### 2. Execute each remaining task in order

For each task:

a. Mark "started" in journal:
```
cd .dev-flow && npx tsx src/journal-cli.ts $TICKET implement task-N-start ok "<task title>"
cd ..
```

b. Make the code changes (use Edit/Write tools, follow patterns from `02-RESEARCH.md`).

c. Run lint + typecheck (commands from `.dev-flow/config.yaml.stack.test_commands`):
```
pnpm lint
pnpm typecheck
```

If either fails:
- Append a deviation note to `tickets/$TICKET/04-IMPLEMENTATION.md` (create if missing).
- Update state to `implementation-in-progress` with `last_error` set.
- Commit any partial work: `git add -A && git commit -m "implement: $TICKET WIP — <task> (lint/typecheck failed)"`
- Tell the user: "Implementation paused — fix the lint/typecheck issue and re-run /task:implement."
- EXIT.

d. Atomic commit:
```
git add <files-touched-by-this-task>
git commit -m "feat: $TICKET <task title>" -m "Plan-Task: <task-id>"
```

e. Mark "done" in journal:
```
cd .dev-flow && npx tsx src/journal-cli.ts $TICKET implement task-N-done ok
cd ..
```

### 3. After all tasks done — write 04-IMPLEMENTATION.md

```markdown
# Implementation log — $TICKET

## Commits (chronological)
- <sha7> feat: $TICKET <task 1 title>
- <sha7> feat: $TICKET <task 2 title>
...

## Deviations
(none) | <list deviations from plan with reasoning>
```

Atomic commit:
```
git add tickets/$TICKET/04-IMPLEMENTATION.md tickets/$TICKET/.journal.jsonl
git commit -m "implement: $TICKET task log"
```

### 4. Run validator

```
cd .dev-flow && \
  PLAN_TASK_IDS="$(sed -n -E 's/^### Task ([0-9]+):.*/\1/p' ../tickets/$TICKET/03-PLAN.md | tr '\n' ',')" \
  LINT_CMD="pnpm lint" TYPECHECK_CMD="pnpm typecheck" BASE_BRANCH="develop" \
  npx tsx src/validators/implementation.ts $TICKET
```

If exit 0:
- Advance state to `implementation-complete`.
- Commit state.json.
- Tell user: "Phase 4 complete. Next: /task:test."

If exit != 0:
- Surface validator output. Most common: a plan task has no commit with the matching `Plan-Task:` trailer.
