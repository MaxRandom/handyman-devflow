---
description: "Phase 6 — Judge gate. Fresh-context subagent verifies acceptance criteria against diff + test evidence. Auto-loops back to /implement on FAIL/UNCLEAR (bounded by workflow.verify_max_attempts)."
allowed-tools: Bash, Read, Write, Agent
---

# /handyman-devflow:verify — Phase 6 (Judge Gate)

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` == `tests-complete`.
3. `devflow validate test "$TICKET"` exit 0.

## Actions

### 1. Capture the diff

```
git diff "$(devflow config get provider.default_base)...HEAD" > /tmp/$TICKET.diff
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

Attempt: <N> of <max>

(judge subagent output — table)

## Notes
<any concerns the judge raised that aren't in the table>
```

Replace `<N>` with `$(devflow state get $TICKET verify_attempts)` plus one (this run is the next attempt), and `<max>` with `$(devflow config get workflow.verify_max_attempts)`.

### 4. Commit

```
devflow journal "$TICKET" verify judge ok
git add tickets/$TICKET/06-VERIFICATION.md tickets/$TICKET/.journal.jsonl
git commit -m "verify: $TICKET judge-gate review"
```

### 5. Run validator

`devflow validate verify "$TICKET"`

### 6. Outcome — clean PASS

If exit 0 (all rows PASS):
- `devflow state reset-verify-attempts "$TICKET"`
- Advance state to `verified`. Commit state.json.
- Tell user: "Phase 6 complete. Next: /handyman-devflow:security."

### 6b. Outcome — FAIL/UNCLEAR (auto-loop)

If exit != 0 (any FAIL or UNCLEAR row):

```
ATTEMPTS=$(devflow state increment-verify-attempt "$TICKET")
MAX=$(devflow config get workflow.verify_max_attempts)
```

**If `ATTEMPTS < MAX`** — auto-loop back to implement:

a. Extract the failing rows from `06-VERIFICATION.md`. Build a remediation hint
   appended to `04-IMPLEMENTATION.md` under a `## Verify attempt $ATTEMPTS — failing rows` heading:

   ```markdown
   ## Verify attempt $ATTEMPTS — failing rows
   - Row N (FAIL): <criterion>  ← evidence: <judge's evidence>
   - Row M (UNCLEAR): <criterion>  ← evidence: <judge's evidence>
   ```

b. Rewind phase to `plan-complete` (keeping the artifacts in place — the
   implementer reads the remediation hints from 04-IMPLEMENTATION.md):

   ```
   # NB: we deliberately do NOT use /handyman-devflow:reset here because that
   # would clear the verify_attempts counter. Mutate the phase field directly:
   tmpfile=$(mktemp)
   jq '.phase = "plan-complete" | .last_error = "verify FAIL on attempt '"$ATTEMPTS"' — see 04-IMPLEMENTATION.md remediation block" | .updated_at = (now | todateiso8601)' \
     "tickets/$TICKET/state.json" > "$tmpfile" && mv "$tmpfile" "tickets/$TICKET/state.json"
   ```

c. Commit the state + remediation:
   ```
   git add tickets/$TICKET/04-IMPLEMENTATION.md tickets/$TICKET/state.json
   git commit -m "verify: $TICKET attempt $ATTEMPTS failed — looping back to implement"
   ```

d. Tell the user: "Verify attempt $ATTEMPTS of $MAX failed. Auto-looping back to implement with failing rows as remediation hints. Re-run /handyman-devflow:implement to retry."

**If `ATTEMPTS >= MAX`** — stop the loop, hand off to the human:

a. Tell the user: "Verify has failed $ATTEMPTS times — exceeding workflow.verify_max_attempts ($MAX). The auto-remediation loop is exhausted. Read tickets/$TICKET/06-VERIFICATION.md for the latest judge verdict. Either: (1) fix the acceptance criteria with /handyman-devflow:reset --to plan-complete and edit 03-PLAN.md, or (2) raise workflow.verify_max_attempts in .dev-flow/config.yaml and re-run /handyman-devflow:verify."

b. Do NOT auto-rewind phase. Leave state at `tests-complete` with `last_error` set so the user has full context.

c. Commit nothing further (the verification artifact is already committed in step 4).

## Why this loops

Verification has a real cost — it's not enough to surface the failure once and hope the user fixes it. The loop is bounded (default 3 attempts) so the system doesn't spin forever on intractable problems, but it WILL exhaust each attempt before giving up. The judge sees the same fresh-context inputs each time; only `04-IMPLEMENTATION.md` accumulates remediation hints across attempts, which is OK because the judge never sees that file.
