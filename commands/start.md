---
description: "Phase 1 (Intake) + autopilot — chains through research → plan → implement → test → verify → security → PR by default. Pass --manual to stop after intake."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, SlashCommand, mcp__atlassian__*
argument-hint: "<TICKET-KEY-or-freeform-title> [--manual] | (no args = resume current ticket)"
---

# /handyman-devflow:start — Phase 1 (Intake) + autopilot

This command is BOTH:
1. The entry point for a new ticket — pass a Jira key (tracker mode) or freeform title (local-ticket mode).
2. The resume point for an in-progress ticket — call with no argument and the autopilot picks up from `state.json`.

By default it chains every phase (`research → plan → implement → test → verify → security → pr`) until a blocker or completion. Set `workflow.autopilot: false` in `.dev-flow/config.yaml` for the legacy per-phase manual flow, or pass `--manual` for a one-off stop after Phase 1.

If you are unsure about the overall flow, read `${CLAUDE_PLUGIN_ROOT}/templates/PROCESS.md`.

## Step 0. Parse args + detect mode

```
ARG="$1"
MANUAL_FLAG=false
for a in "$@"; do [ "$a" = "--manual" ] && MANUAL_FLAG=true; done

TRACKER_TYPE="$(devflow config get tracker.type 2>/dev/null || echo NONE)"
AUTOPILOT_CFG="$(devflow config get workflow.autopilot 2>/dev/null || echo true)"
[ "$MANUAL_FLAG" = "true" ] && AUTOPILOT_CFG=false
```

**Resume vs new-ticket detection:**
- If `$ARG` is empty: read TICKET from current branch (`git branch --show-current`). The autopilot resumes from state.json.
- If `$ARG` is set AND `tickets/$ARG/state.json` exists (tracker mode) OR a ticket folder matching the derived id exists (local mode): warn "ticket exists at phase X — resuming" and set TICKET accordingly. Skip Step 1 (intake) and jump to Step 11 (autopilot drive).
- If `$ARG` is set AND no existing ticket: this is a NEW ticket.

For NEW ticket:
- **Tracker mode** (`TRACKER_TYPE != NONE`): `TICKET=$ARG`.
- **Local-ticket mode** (`TRACKER_TYPE == NONE`):
  ```
  TITLE_SLUG="$(devflow slug "$ARG")"
  TICKET="LOCAL-$(date -u +%Y%m%d)-$TITLE_SLUG"
  ```

## Precondition checks (HARD — abort if any fail) — NEW ticket only

1. **Working tree must be clean.** Run `git status --porcelain`. If output is non-empty, ABORT and tell the user: "Working tree is not clean — commit or stash before starting a new ticket."
2. **Ticket folder must not yet exist** (only checked when `$ARG` was treated as new). If `tickets/$TICKET/state.json` exists, instead treat this as a RESUME (jump to Step 11).

## Phase-1 actions (skip these when resuming)

### 1. Source the ticket text

**Tracker mode:** use the Atlassian (or Linear) MCP tool `getJiraIssue` with key=`$TICKET`. Capture: Title, Description, Acceptance criteria, Labels, Status, Comments.

**Local-ticket mode:** the user-supplied `$ARG` is the title. Source the body from one of:
- The user's argument itself (if it contains enough context to write an intake).
- An inline prompt to the user: "Local-ticket mode — paste the requirements / acceptance criteria / context for this work, or press Enter to proceed with just the title."

Skip every MCP call in this mode.

### 2. Compute branch name

- Slug = lowercase kebab of the title, max 60 chars. Compute via `devflow slug "<title>"`.
- Branch = expand `provider.branch_pattern` (default `feature/{ticket}-{slug}`).

### 3. Create feature branch

```
git fetch origin
git checkout -b feature/$TICKET-<slug> origin/$(devflow config get provider.default_base)
```

### 4. Build a lightweight codebase map

- `find apps services -maxdepth 3 -type d -not -path '*/node_modules/*' | head -40`
- `git log --since=30.days --pretty=format:'%h %s' | head -20`
- For each keyword in the title, `grep -l -r --include='*.ts' --include='*.tsx' "<keyword>" apps services | head -10`

### 5. Spawn the intake-analyst subagent

Use the Agent tool with `subagent_type: intake-analyst`. Pass:
- The ticket text (from MCP in tracker mode, from the user in local-ticket mode).
- A mode indicator (`tracker` or `local`).
- The codebase map from Step 4.
- The contents of `AGENTS.md`.

Capture the agent's return value as the body of `01-INTAKE.md`.

### 6. Write the artifact

Write `tickets/$TICKET/01-INTAKE.md`:

```markdown
# Intake — $TICKET

Source: <Jira PROJ-123 | local-ticket "fix login spinner">

<intake subagent output>
```

### 7. Write initial state.json

```json
{
  "ticket": "$TICKET",
  "branch": "feature/$TICKET-<slug>",
  "phase": "intake-drafted",
  "updated_at": "<now ISO>",
  "last_error": null,
  "verify_attempts": 0
}
```

### 8. Journal + commit

```
devflow journal "$TICKET" intake draft ok
git add tickets/$TICKET/
git commit -m "intake: $TICKET draft requirements + open questions"
```

### 9. Run the intake validator

```
devflow validate intake "$TICKET"
INTAKE_EXIT=$?
```

If `INTAKE_EXIT == 0`:
- Update state.json to `"phase": "intake-complete"`.
- Commit: `git add tickets/$TICKET/state.json && git commit -m "intake: $TICKET requirements signed off"`.
- Proceed to Step 11 (autopilot drive).

If `INTAKE_EXIT != 0`:
- The artifact has `[NEEDS-ANSWER]` markers or missing sections.
- Tell the user: "Phase 1 paused — answer the [NEEDS-ANSWER] markers in `tickets/$TICKET/01-INTAKE.md`, then re-run `/handyman-devflow:start` (no args) to resume."
- STOP. (The autopilot can't proceed past intake without a clean validator.)

## Step 11. Autopilot drive (the default)

If `AUTOPILOT_CFG != true`:
- Print "Phase 1 complete. Autopilot off — next: /handyman-devflow:research."
- STOP.

Otherwise enter the drive loop. Each iteration:

```
DECISION="$(devflow auto next "$TICKET")"
case "$DECISION" in
  DONE)
    echo "✅ Cycle complete — PR opened. See tickets/$TICKET/08-PR.md."
    exit
    ;;
  BLOCKED:*)
    REASON="${DECISION#BLOCKED:}"
    echo "⏸  Autopilot paused: $REASON"
    echo "    See tickets/$TICKET/ for current artifacts and state.json."
    echo "    Resolve the blocker, then re-run /handyman-devflow:start (no args) to resume."
    exit
    ;;
  RUN:*)
    NEXT="${DECISION#RUN:}"
    # NEXT is one of: research | plan | implement | test | verify | security | pr
    # Invoke the corresponding slash command using the SlashCommand tool:
    #   /handyman-devflow:$NEXT
    # Wait for it to complete before re-reading the decision.
    ;;
esac
```

**How to invoke the next phase:** use the SlashCommand tool to call `/handyman-devflow:<NEXT>`. Each per-phase command does its own work, advances state.json, commits, and exits. Control returns here and the loop re-evaluates.

**Blockers the autopilot will surface:**
- `intake-drafted` with `[NEEDS-ANSWER]` markers → human answers, re-run /start
- Smoke test failed in `/implement` → `state.last_error = "smoke failed: ..."`, the user fixes the artifact and re-runs /start
- Verify max attempts exhausted → `last_error = "verify exhausted N attempts"`, state stays at `tests-complete`
- Security finding `Status: open` → validator fails the security phase, last_error set
- Any phase validator returns non-zero → last_error set
- Working tree dirty mid-flow (rare — slash commands enforce clean trees as preconditions)

**Loop safety:** every per-phase command either advances state (forward progress) OR sets `last_error` (blocker). The loop terminates in O(N) iterations under healthy conditions, or earlier on a blocker. There is no scenario where it spins forever because `last_error != null` is itself a blocker.

## Tips for the user

- To answer `[NEEDS-ANSWER]` markers: edit `01-INTAKE.md` in place, replacing the marker with the answer, then re-run `/handyman-devflow:start` (no args) to resume the autopilot.
- To recover from a blocker (e.g., smoke failure): inspect the evidence file the blocker mentions, fix the code, re-run `/handyman-devflow:start` (no args). The autopilot will pick up from the current state.
- To run a single phase manually (e.g., re-run `/test` after a flake): invoke that phase command directly. The autopilot will continue chaining from the new state on the next `/start` invocation.
- To disable chaining permanently: set `workflow.autopilot: false` in `.dev-flow/config.yaml`. To disable for one run: pass `--manual`.
