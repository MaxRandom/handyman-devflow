# Dev Cycle Process

## Phase order
1. **Intake** (`/task:start <TICKET>`) — fetch ticket, draft requirements, surface open questions, create feature branch.
2. **Research** (`/task:research`) — analyze codebase, document patterns to follow.
3. **Plan** (`/task:plan`) — produce ordered task list + test plan.
4. **Implement** (`/task:implement`) — execute plan tasks with atomic commits.
5. **Test** (`/task:test`) — run unit/integration/e2e, capture evidence bundle.
6. **Verify** (`/task:verify`) — fresh-context judge subagent reviews against acceptance criteria.
7. **Security** (`/task:security`) — npm audit + semgrep + diff review.
8. **PR** (`/task:pr`) — push branch, open PR, transition Jira ticket, post link.

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
- `implementation-complete`
- `tests-complete`
- `verified`
- `security-reviewed`
- `pr-opened`

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
