---
description: "Phase 4 — Execute plan tasks with atomic per-task commits + lint/typecheck after each."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# /handyman-devflow:implement — Phase 4

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` ∈ {`plan-complete`, `implementation-in-progress`}. (Resumable mid-flow; the second value is set by this command itself when paused.)
3. `devflow validate plan "$TICKET"` exit 0.

## Actions

### 1. Read the plan

Parse `tickets/$TICKET/03-PLAN.md` to extract task IDs and titles. Look at `tickets/$TICKET/04-IMPLEMENTATION.md` if it exists — skip already-completed tasks.

### 2. Execute each remaining task in order

For each task:

a. Mark "started" in journal:
```
devflow journal "$TICKET" implement task-N-start ok "<task title>"
```

b. Make the code changes (use Edit/Write tools, follow patterns from `02-RESEARCH.md`).

c. Run lint + typecheck (commands from `${CLAUDE_PROJECT_DIR}/.dev-flow/config.yaml.stack.test_commands`):
```
$(devflow config get stack.test_commands.lint)
$(devflow config get stack.test_commands.typecheck)
```

If either fails:
- Append a deviation note to `tickets/$TICKET/04-IMPLEMENTATION.md` (create if missing).
- Update state to `implementation-in-progress` with `last_error` set.
- Commit any partial work: `git add -A && git commit -m "implement: $TICKET WIP — <task> (lint/typecheck failed)"`
- Tell the user: "Implementation paused — fix the lint/typecheck issue and re-run /handyman-devflow:implement."
- EXIT.

d. Atomic commit:
```
git add <files-touched-by-this-task>
git commit -m "feat: $TICKET <task title>" -m "Plan-Task: <task-id>"
```

e. Mark "done" in journal:
```
devflow journal "$TICKET" implement task-N-done ok
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
LINT_CMD="$(devflow config get stack.test_commands.lint)" \
TYPECHECK_CMD="$(devflow config get stack.test_commands.typecheck)" \
BASE_BRANCH="$(devflow config get provider.default_base)" \
PLAN_TASK_IDS="$(sed -n -E 's/^### Task ([0-9]+):.*/\1/p' "${CLAUDE_PROJECT_DIR}/tickets/$TICKET/03-PLAN.md" | tr '\n' ',')" \
devflow validate implementation "$TICKET"
```

If exit != 0:
- Surface validator output. Most common: a plan task has no commit with the matching `Plan-Task:` trailer.
- STOP. Do not advance.

### 5. Real-condition smoke test (MANDATORY — never skipped)

Lint + typecheck pass on broken code all the time. The smoke test is the floor:
it actually runs the built artifact and proves the code does something
observable. There is no `--no-smoke` flag.

```
SMOKE_DIR="tickets/$TICKET/evidence/impl-smoke-$(date -u +%Y-%m-%dT%H-%M-%S)"
devflow smoke "$TICKET" --evidence-dir "$SMOKE_DIR" --label impl-smoke
SMOKE_EXIT=$?
```

If `SMOKE_EXIT != 0`:
- The smoke runner has already written failure evidence to `$SMOKE_DIR/impl-smoke.log` (exit code, stdout, stderr, timeout flag).
- Append a deviation note to `04-IMPLEMENTATION.md` referencing the evidence path AND the failing condition (exit mismatch / stdout regex / timeout).
- Set `last_error="smoke failed: <reason>"` in state.json (do NOT advance phase).
- Commit the evidence + deviation: `git add tickets/$TICKET/evidence/ tickets/$TICKET/04-IMPLEMENTATION.md tickets/$TICKET/state.json && git commit -m "implement: $TICKET smoke failed — see $SMOKE_DIR"`
- Tell the user: "Phase 4 paused — the artifact does not run cleanly under real conditions. Read `$SMOKE_DIR/impl-smoke.log`, fix, then re-run /handyman-devflow:implement."
- EXIT. **Do NOT advance state.**

If `SMOKE_EXIT == 0`:
- Commit the evidence: `git add tickets/$TICKET/evidence/ && (git diff --cached --quiet || git commit -m "implement: $TICKET smoke ok")`

### 6. Advance state

- Advance state to `implementation-complete`.
- Commit state.json.
- Tell user: "Phase 4 complete (lint, typecheck, AND smoke all green). Next: /handyman-devflow:test."
