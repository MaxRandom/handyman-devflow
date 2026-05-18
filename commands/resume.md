---
description: "Resume an interrupted ticket — clears the last_error blocker and re-enters the autopilot drive loop from current state.json."
allowed-tools: Bash, Read, Write, SlashCommand
argument-hint: "[<TICKET>] [--retry-verify]"
---

# /handyman-devflow:resume

Use this after a context reset, a session crash, or any blocker the autopilot surfaced ("⏸ Autopilot paused: ..."). The command:

1. Identifies the ticket (from `$1` if given, otherwise the current branch).
2. Shows you the current state (`phase`, `last_error`, `verify_attempts`).
3. Clears `last_error` — invoking `/resume` IS the human-in-the-loop confirmation that the blocker is resolved. If you haven't actually fixed it, the next phase will fail again and re-set `last_error`. No harm done.
4. (Optional) Resets `verify_attempts` to 0 when `--retry-verify` is passed — use this after fixing the implementation following a verify-cap exhaustion.
5. Re-enters the autopilot drive loop. If `workflow.autopilot: false`, prints the next manual command instead.

This is distinct from `/handyman-devflow:start`:
- `/start <arg>` begins a NEW ticket (intake + autopilot).
- `/start` (no arg) also resumes — kept as a convenience alias. Prefer `/resume` for clarity.

## Step 0. Parse args + locate the ticket

```
ARG=""
RETRY_VERIFY=false
for a in "$@"; do
  case "$a" in
    --retry-verify) RETRY_VERIFY=true ;;
    *) [ -z "$ARG" ] && ARG="$a" ;;
  esac
done

if [ -n "$ARG" ]; then
  TICKET="$ARG"
  # Switch to the matching branch if not already on it.
  EXPECTED_BRANCH="$(jq -r .branch "tickets/$TICKET/state.json" 2>/dev/null)"
  CURRENT_BRANCH="$(git branch --show-current)"
  if [ -n "$EXPECTED_BRANCH" ] && [ "$EXPECTED_BRANCH" != "$CURRENT_BRANCH" ]; then
    echo "Switching to $EXPECTED_BRANCH (ticket's recorded branch)…"
    git checkout "$EXPECTED_BRANCH"
  fi
else
  # Derive ticket from current branch's state.json. We trust the on-disk state,
  # not the branch name — branch names can drift if the user manually checked
  # out a different ref.
  BRANCH="$(git branch --show-current)"
  TICKET="$(find tickets -mindepth 2 -maxdepth 2 -name state.json -exec jq -r 'select(.branch == "'"$BRANCH"'") | .ticket' {} \; | head -1)"
  if [ -z "$TICKET" ]; then
    echo "No ticket found for branch $BRANCH. Pass a TICKET arg or run /handyman-devflow:start to begin one."
    exit 1
  fi
fi
```

## Step 1. Show current state

```
echo "Resuming ticket: $TICKET"
devflow state get "$TICKET"
```

This prints the full state.json — phase, last_error, verify_attempts, updated_at — so the user sees exactly what they're resuming from.

## Step 2. Working tree must be clean

```
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: working tree is not clean. Commit or stash before resuming — every phase command expects a clean tree as a precondition."
  exit 1
fi
```

## Step 3. Clear the blocker

```
CLEARED="$(devflow state clear-error "$TICKET")"
if [ -n "$CLEARED" ]; then
  echo "Cleared last_error: $CLEARED"
fi
```

## Step 4. Optionally reset the verify counter

```
if [ "$RETRY_VERIFY" = "true" ]; then
  devflow state reset-verify-attempts "$TICKET"
  echo "Reset verify_attempts to 0 (--retry-verify)"
fi
```

Commit the state mutation so the audit trail records the resume:

```
if ! git diff --quiet "tickets/$TICKET/state.json" 2>/dev/null; then
  git add "tickets/$TICKET/state.json"
  git commit -m "resume: $TICKET — clear blocker$([ "$RETRY_VERIFY" = "true" ] && echo " + reset verify_attempts")"
fi
```

## Step 5. Drive

If `workflow.autopilot` is false:
- Read the next phase via `devflow auto next "$TICKET"`.
- Tell the user the matching slash command to invoke (e.g., "Next: /handyman-devflow:plan"). Exit.

Otherwise enter the drive loop — identical to the one in `/handyman-devflow:start`:

```
while true; do
  DECISION="$(devflow auto next "$TICKET")"
  case "$DECISION" in
    DONE)
      echo "✅ Cycle complete — PR opened. See tickets/$TICKET/08-PR.md."
      break
      ;;
    BLOCKED:*)
      REASON="${DECISION#BLOCKED:}"
      echo "⏸  Autopilot paused: $REASON"
      echo "    Resolve the blocker, then re-run /handyman-devflow:resume (with --retry-verify if needed)."
      break
      ;;
    RUN:*)
      NEXT="${DECISION#RUN:}"
      # Invoke /handyman-devflow:$NEXT via the SlashCommand tool. Each per-phase
      # command does its own work, advances state, commits, and exits. Control
      # returns here and the loop re-evaluates.
      ;;
  esac
done
```

## Behavior notes

- **Idempotent.** Running `/resume` repeatedly on a clean state is a no-op apart from re-entering the drive loop.
- **Loop safety.** Same guarantee as `/start`: every per-phase command either advances state OR sets `last_error`. The drive terminates in O(N) iterations or earlier on a blocker.
- **Verify cap stuck at the limit.** If `/resume` blocks immediately with "verify exhausted N attempts", you either need to (a) raise `workflow.verify_max_attempts` in `.dev-flow/config.yaml` and re-run /resume, or (b) re-run with `--retry-verify` to reset the counter to 0 and try again with a fresh budget.
- **Mid-phase crash.** If the previous session crashed inside (say) /implement before it could advance state, `phase` is still at `plan-complete` and `last_error` may or may not be set. `/resume` clears any error and the drive loop re-runs `/implement` from scratch. Atomic per-task commits in /implement mean already-done tasks are skipped on the retry.

## Tips

- After fixing a smoke failure: just `/handyman-devflow:resume`. The autopilot will re-run /implement, which re-runs lint + typecheck + smoke before advancing.
- After answering `[NEEDS-ANSWER]` markers: `/handyman-devflow:resume`. It re-validates intake, then drives the rest.
- After raising `workflow.verify_max_attempts`: `/handyman-devflow:resume`. The counter is preserved; the new budget is what's left.
- After deciding the current verify exhaustion was a flake and you want a fresh budget: `/handyman-devflow:resume --retry-verify`.
