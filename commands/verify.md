---
description: "Phase 6 — Judge gate. Fresh-context subagent verifies acceptance criteria against diff + test evidence."
allowed-tools: Bash, Read, Write, Agent
---

# /task:verify — Phase 6 (Judge Gate)

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` == `tests-complete`.
3. `cd .dev-flow && npx tsx src/validators/test.ts $TICKET` exit 0.

## Actions

### 1. Capture the diff

```
git diff develop...HEAD > /tmp/$TICKET.diff
```

### 2. Spawn the judge-reviewer subagent

Use the Agent tool with `subagent_type: judge-reviewer`. **Pass ONLY:**
- The full content of `tickets/$TICKET/01-INTAKE.md`
- The diff from Step 1 (`/tmp/$TICKET.diff`)
- The full content of `tickets/$TICKET/05-TEST-EVIDENCE.md`
- A list of file paths under `tickets/$TICKET/evidence/`

**Do NOT pass** `02-RESEARCH.md`, `03-PLAN.md`, or `04-IMPLEMENTATION.md`. The judge must NOT see the implementer's framing. The agent's system prompt enforces this discipline; if you accidentally pass forbidden inputs, the agent will refuse and ask you to re-spawn it.

Capture the agent's return value (a verdict table + optional Notes) as the body of `06-VERIFICATION.md`.

### 3. Write the artifact

Write `tickets/$TICKET/06-VERIFICATION.md`:

```markdown
# Verification — $TICKET

(judge subagent output — table)

## Notes
<any concerns the judge raised that aren't in the table>
```

### 4. Commit

```
cd .dev-flow && npx tsx src/journal-cli.ts $TICKET verify judge ok
cd ..
git add tickets/$TICKET/06-VERIFICATION.md tickets/$TICKET/.journal.jsonl
git commit -m "verify: $TICKET judge-gate review"
```

### 5. Run validator

`cd .dev-flow && npx tsx src/validators/verify.ts $TICKET`

If exit 0:
- Advance state to `verified`. Commit state.json.
- Tell user: "Phase 6 complete. Next: /task:security."

If exit != 0 (any FAIL or UNCLEAR row):
- Surface the failing rows.
- Tell user: "Address the failing/unclear criteria — usually means going back to /task:implement to add tests or strengthen behavior. Use /task:reset --to plan-complete to rewind."
