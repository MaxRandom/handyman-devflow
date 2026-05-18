---
description: "Show current dev-cycle state for the active ticket. Read-only."
allowed-tools: Bash, Read
---

# /handyman-devflow:status

Determine ticket from current branch: `git branch --show-current`.

If branch matches `feature/<TICKET>-...`, set `$TICKET = <TICKET>`. Otherwise tell the user: "Not on a feature branch — switch to one first."

Print:
```
Ticket:  $TICKET
Branch:  <branch name>
Phase:   <state.phase>
Updated: <state.updated_at>
Last error: <state.last_error or "(none)">
```

Map `state.phase` to next command:
- `init` / `intake-drafted` → `/handyman-devflow:start <TICKET>` (continue)
- `intake-complete` → `/handyman-devflow:research`
- `research-complete` → `/handyman-devflow:plan`
- `plan-complete` / `implementation-in-progress` → `/handyman-devflow:implement`
- `implementation-complete` → `/handyman-devflow:test`
- `tests-complete` → `/handyman-devflow:verify`
- `verified` → `/handyman-devflow:security`
- `security-reviewed` → `/handyman-devflow:pr`
- `pr-opened` → "Done."

Also run the validator for the CURRENT phase (whatever phase we're in, run the predecessor's validator) and print pass/fail to give the user a quick health check.

Do NOT mutate any state.
