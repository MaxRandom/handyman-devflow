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

### 2. Spawn the judge subagent

This is the most important subagent — its context must be FRESH. Use the Agent tool with subagent_type=general-purpose.

Provide ONLY:
- Contents of `tickets/$TICKET/01-INTAKE.md`
- Contents of `/tmp/$TICKET.diff`
- Contents of `tickets/$TICKET/05-TEST-EVIDENCE.md`
- A list of evidence file paths under `tickets/$TICKET/evidence/`

Do NOT include 02-RESEARCH.md, 03-PLAN.md, or 04-IMPLEMENTATION.md — those would bias the judge toward the implementer's framing.

Ask the subagent:

> "For each acceptance criterion in the Understood requirements section of INTAKE.md, judge whether the diff + test evidence demonstrates the criterion is met. Output a markdown table: `| # | Acceptance criterion | Verdict | Evidence |`. Verdict ∈ {PASS, FAIL, UNCLEAR}. Evidence must cite a file:line, a test name, or an evidence/ artifact path. Be skeptical — if the diff doesn't clearly satisfy the criterion, mark UNCLEAR. Do not assume things you can't see."

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
