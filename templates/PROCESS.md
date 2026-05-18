# Dev Cycle Process

## Tracker mode vs local-ticket mode

The workflow supports two modes, switched by whether `.dev-flow/config.yaml` contains a `tracker:` block.

- **Tracker mode** (`tracker:` present) — Phase 1 fetches the ticket from Jira/Linear via MCP, Phase 8 transitions the ticket and posts a comment with the PR URL.
- **Local-ticket mode** (no `tracker:` block) — Phase 1 accepts a freeform title (`/handyman-devflow:start "fix login spinner"`) and derives a local ticket id like `LOCAL-20260518-fix-login-spinner`. Every MCP call to the tracker is skipped. The PR artifact records `**Tracker:** (none — local-ticket mode, no transition performed)` instead of a Jira-transition line.

All other phases (research, plan, implement, test, verify, security) behave identically in both modes.

## Autopilot (default)

`workflow.autopilot: true` (the default) makes `/handyman-devflow:start` chain every phase end-to-end:

```
/handyman-devflow:start PROJ-123        # tracker mode
/handyman-devflow:start "fix login spinner"   # local-ticket mode
/handyman-devflow:start                 # resume current ticket from state.json
```

Internally the start command's outer loop calls `devflow auto next <TICKET>` between phases. That returns one of:

- `RUN:<phase>` — invoke `/handyman-devflow:<phase>` next (research → plan → implement → test → verify → security → pr)
- `DONE` — `state.phase` is `pr-opened`; cycle complete
- `BLOCKED:<reason>` — autopilot paused, human input required

**Blockers that pause the autopilot:**
- Intake validator fails (`[NEEDS-ANSWER]` markers present, missing sections)
- Phase 4 smoke failed (`state.last_error = "smoke failed: ..."`)
- Phase 6 verify exhausted `workflow.verify_max_attempts` retries
- Phase 7 security found `Status: open` findings
- Any phase validator returns non-zero

The verify *inner* loop (FAIL/UNCLEAR → rewind to plan-complete → retry implement → test → verify) does NOT trip the autopilot blocker — it sets `last_error = null` and lets the outer drive re-run the phases until either PASS or the cap exhausts.

To opt out: set `workflow.autopilot: false` in `.dev-flow/config.yaml`, or pass `--manual` to `/start` for a one-shot stop after Phase 1.

### Resuming after an interruption

When a session crashes, the context resets, or the autopilot pauses on a blocker, use `/handyman-devflow:resume`:

```
/handyman-devflow:resume                  # resume current branch's ticket
/handyman-devflow:resume PROJ-123         # switch branch + resume
/handyman-devflow:resume --retry-verify   # also reset verify_attempts to 0 (fresh budget)
```

What it does:
1. Identifies the ticket (`$1` or the current branch's recorded `state.json`).
2. Prints the current state.
3. Clears `last_error` — invoking `/resume` is the human confirmation that the blocker is resolved.
4. With `--retry-verify`, resets `verify_attempts` to 0.
5. Commits the state mutation and re-enters the autopilot drive loop.

The drive loop is identical to `/start`'s — so resuming a half-done ticket and starting a fresh one share the same state-machine logic.

## Phase order
1. **Intake** (`/task:start <TICKET-KEY-or-freeform-title>`) — fetch ticket (tracker mode) OR derive local id from title (local-ticket mode), draft requirements, surface open questions, create feature branch.
2. **Research** (`/task:research`) — analyze codebase, document patterns to follow.
3. **Plan** (`/task:plan`) — produce ordered task list + test plan.
4. **Implement** (`/task:implement`) — execute plan tasks with atomic commits, lint + typecheck, then **mandatory real-condition smoke test** (`stack.smoke_test`).
5. **Test** (`/task:test`) — run unit/integration/e2e plus **mandatory smoke**; capture full evidence bundle.
6. **Verify** (`/task:verify`) — fresh-context judge subagent reviews against acceptance criteria. **Auto-loops back to /implement on FAIL/UNCLEAR**, bounded by `workflow.verify_max_attempts` (default 3).
7. **Security** (`/task:security`) — npm audit + semgrep + diff review.
8. **PR** (`/task:pr`) — push branch, open PR, transition Jira ticket, post link.

## The verification floor

The workflow's core promise is that **no phase advances on assumption**. Every phase that ships code produces evidence:

- **Phase 4 (implement)** runs lint + typecheck AND the configured `stack.smoke_test` against the freshly built artifact. The smoke runner writes `tickets/<TICKET>/evidence/impl-smoke-*/impl-smoke.log` with command, exit code, stdout/stderr, and timeout flag. Smoke failure → phase paused, no advance.
- **Phase 5 (test)** runs unit + (optional) integration + (optional) e2e + **mandatory** smoke. The `05-TEST-EVIDENCE.md` artifact must contain `## Unit` and `## Smoke` sections with `Result: PASS`. The test validator rejects a missing or failing Smoke section.
- **Phase 6 (verify)** sees only the intake + diff + test evidence and judges acceptance criteria. On FAIL/UNCLEAR, the workflow auto-rewinds to `plan-complete`, appends failing rows as remediation hints to `04-IMPLEMENTATION.md`, and increments `state.verify_attempts`. The loop is bounded — once `verify_attempts >= workflow.verify_max_attempts`, control hands back to the human.

Smoke commands are project-type-specific (see `templates/config.yaml.example` for a catalog: web service, frontend, CLI, library, desktop). The principle is invariant: every project has a way to actually run the built thing.

Helpers: `/task:status` (no state change), `/task:reset --to <phase>` (rewind state.phase).

## Per-ticket workspace

Lives on the feature branch under `tickets/<TICKET>/`:

```
tickets/<TICKET>/
  state.json                  # current phase + branch + journal pointer
  01-INTAKE.md
  02-RESEARCH.md
  03-PLAN.md
  04-IMPLEMENTATION.md
  05-TEST-EVIDENCE.md
  06-VERIFICATION.md
  07-SECURITY.md
  08-PR.md
  evidence/                   # raw test artifacts (Playwright traces, screenshots)
  .journal.jsonl              # append-only log of every step
```

## state.json shape

```json
{
  "ticket": "PROJ-123",
  "branch": "feature/PROJ-123-fix-login-button",
  "phase": "intake-complete",
  "updated_at": "2026-05-15T14:23:00.000Z",
  "last_error": null
}
```

Valid `phase` values, in order:
- `init`
- `intake-drafted`     (Phase 1 wrote artifact, validator not yet passing)
- `intake-complete`    (Phase 1 validator passed)
- `research-complete`
- `plan-complete`
- `implementation-complete`  (lint + typecheck + smoke all passed)
- `tests-complete`           (Unit + Smoke layers green; E2E/Integration where applicable)
- `verified`                 (judge gate cleared; verify_attempts reset to 0)
- `security-reviewed`
- `pr-opened`

Additional state fields:
- `verify_attempts: number` — verify-loop bookkeeping. Bumped on FAIL/UNCLEAR; reset to 0 on a clean verified PASS.

## Validator contract

Every phase has a validator at `.dev-flow/src/validators/<phase>.ts`. Invoke as:

```
cd .dev-flow && npx tsx src/validators/<phase>.ts <TICKET>
```

Exit code 0 = artifact valid, advance phase. Non-zero = invalid; stderr explains why.

Validators return JSON on stdout:

```json
{ "ok": true, "errors": [] }
{ "ok": false, "errors": ["01-INTAKE.md still contains [NEEDS-ANSWER] markers (3 found)"] }
```

## Slash command precondition pattern

Every slash command starts with this guard:

1. Read `tickets/<TICKET>/state.json`. If missing or `phase` doesn't match the expected predecessor, ABORT with the `/task:<expected>` hint.
2. Run `git status --porcelain`. Non-empty → ABORT (working tree must be clean).
3. Run the prior phase's validator. Exit non-zero → ABORT with stderr.

Only after all three pass may the slash command do its work.

## Atomic commit pattern

Every phase produces ONE commit on the feature branch:

```
git add tickets/<TICKET>/<artifact-and-evidence>
git commit -m "<phase>: <TICKET> <summary>"
```

Phase 4 (implement) additionally commits per task in the plan, with `Plan-Task: <task-id>` trailer.

## Subagents and skills

Each phase that needs LLM judgment spawns a named subagent (defined in `.claude/agents/`). The subagent has isolated context — it doesn't see the orchestrator's history, just what the slash command passes in.

| Phase | Subagent | Notes |
|---|---|---|
| 1 Intake | `intake-analyst` | Sees ticket + codebase map + AGENTS.md |
| 2 Research | `codebase-researcher` | Sees intake + affected files + AGENTS.md |
| 3 Plan | `task-planner` | Sees intake + research + AGENTS.md |
| 4 Implement | (optionally `tdd-implementer` per task) | Per-task spawn enforces TDD discipline |
| 6 Verify | `judge-reviewer` | **STRICTLY** sees only intake + diff + test evidence (NOT plan/research/implementation — that would bias the judge) |
| 7 Security | `security-auditor` | Sees diff + npm audit output + semgrep output |

Subagents reference reusable skills (in `.claude/skills/`):

- `clarifying-questions` — Socratic ambiguity-finding pattern (intake-analyst)
- `tdd-discipline` — RED-GREEN-REFACTOR enforcement (tdd-implementer)
- `judge-gate` — fresh-context verification protocol (judge-reviewer)
- `owasp-top-10` — security review checklist (security-auditor)
- `bitbucket-pr-body` — PR body composition (Phase 8)

Hooks (in `.claude/settings.json`) provide deterministic safety rails outside the LLM loop:

- Writes to `tickets/<TICKET>/...` are auto-journaled.
- Direct pushes to trunk (`main`/`master`/`develop`) are blocked.
- On Stop, all `state.json` files are validated against the StateSchema.

If a hook fails or warns, it appears in stderr but does NOT modify the artifact chain. The slash command's atomic-commit + validator gate is still the source of truth for "did this phase complete."
