# handyman-devflow

A Claude Code plugin that runs a structured AI dev cycle on top of Jira + Bitbucket Cloud.

## What it does

Takes a ticket from intake to a PR via 8 gated phases — by default chained end-to-end in one `/handyman-devflow:start` invocation:

1. **Intake** (`/handyman-devflow:start <TICKET-or-title>`) — fetch ticket OR derive local id, surface ambiguities, draft requirements, create feature branch
2. **Research** (`/handyman-devflow:research`) — analyze the codebase against intake's affected areas
3. **Plan** (`/handyman-devflow:plan`) — produce ordered task list + test plan
4. **Implement** (`/handyman-devflow:implement`) — execute plan tasks with atomic per-task commits + lint/typecheck + **mandatory real-condition smoke test**
5. **Test** (`/handyman-devflow:test`) — run unit/integration/e2e + smoke, capture evidence bundle (Playwright traces, screenshots, smoke log)
6. **Verify** (`/handyman-devflow:verify`) — fresh-context judge subagent reviews against acceptance criteria; auto-loops back to /implement on FAIL/UNCLEAR up to `workflow.verify_max_attempts` times
7. **Security** (`/handyman-devflow:security`) — `npm audit` + semgrep + OWASP top-10 diff review
8. **PR** (`/handyman-devflow:pr`) — push branch, open PR via provider MCP; transitions Jira ticket only when a tracker is configured

By default `workflow.autopilot: true` chains phases 2–8 inside `/start`. The autopilot pauses only on a real blocker (validator failure, smoke failure, verify cap exhausted, security finding, intake `[NEEDS-ANSWER]` markers). To resume after fixing a blocker, re-run `/handyman-devflow:start` with no arguments.

Set `workflow.autopilot: false` to recover the legacy manual flow, or pass `--manual` for a one-shot stop after Phase 1.

Plus `/handyman-devflow:resume [<TICKET>] [--retry-verify]` (resume an interrupted ticket — clears the last_error blocker and re-enters the autopilot loop), `/handyman-devflow:status` (read-only state inspection), `/handyman-devflow:reset --to <phase>` (rewind state.phase), and `/handyman-devflow:setup` (one-time configuration wizard).

## Why

Each phase produces a reviewable markdown artifact (`tickets/<TICKET>/01-INTAKE.md` through `08-PR.md`) committed atomically to the feature branch. A state machine on disk (`tickets/<TICKET>/state.json`) and pure-Node validators (Zod-schema'd) refuse to advance phases when artifacts are malformed. The judge gate at Phase 6 spawns a **fresh-context** subagent that sees only the intake + diff + test evidence (not the plan/research/implementation), eliminating the bias toward the implementer's framing.

The plugin ships:
- 7 named subagents (intake-analyst, codebase-researcher, task-planner, tdd-implementer, judge-reviewer, security-auditor, setup-wizard)
- 3 reusable skills (judge-gate, owasp-top-10, bitbucket-pr-body) — others (clarifying-questions, tdd-discipline) are delegated to the `superpowers` plugin
- 3 hooks (auto-journal on Write to tickets/, block-trunk-push, validate-state on Stop)
- 1 bundled MCP server (Semble — semantic code search)
- Per-phase validators, state machine, journal, evidence-bundle support

## Install

This plugin depends on two others that live in the official Claude Code marketplace. Install them first, then handyman-devflow:

```
# 1. Add the official marketplace (skip if you already have it).
/plugin marketplace add claude-plugins-official

# 2. Install the two dependency plugins.
/plugin install superpowers@claude-plugins-official
/plugin install atlassian@claude-plugins-official     # only needed if you'll use Jira/Bitbucket

# 3. Add this marketplace and install handyman-devflow.
/plugin marketplace add MaxRandom/handyman-devflow
/plugin install handyman-devflow@handyman-marketplace

/reload-plugins
/handyman-devflow:setup
```

The setup wizard auto-installs missing system dependencies (`uv` for Semble, `jq` for state parsing), copies the config template into your repo's `.dev-flow/`, asks whether you want a ticket tracker (Jira/Linear) or local-ticket mode, asks for a project-type-matched smoke test command, and runs `codebase-researcher` to populate sensible defaults. It re-checks that `superpowers` and `atlassian` (if you opted into a tracker) are installed; if either is missing it surfaces the exact install command.

## Dependencies (install once, separately)

- **superpowers** (`@claude-plugins-official`, REQUIRED) — provides the `brainstorming`, `test-driven-development`, `verification-before-completion`, `subagent-driven-development`, `writing-plans`, and `systematic-debugging` skills the dev-flow delegates to.
- **atlassian** (`@claude-plugins-official`, REQUIRED only in tracker mode) — provides the MCP server for Jira + Bitbucket Cloud (OAuth via your existing Atlassian Cloud SSO). Skip if you'll run in local-ticket mode.

## Updating

The marketplace cache is a regular git clone — pulling new commits is enough for most updates. From a clone of this repo:

```bash
./scripts/reinstall.sh             # fast: git pull the cached marketplace, then /reload-plugins
./scripts/reinstall.sh --clean     # full: nuke cache + registry entries, re-add + reinstall
./scripts/reinstall.sh --dry-run   # preview without changing anything
./scripts/reinstall.sh --help      # docs
```

The fast path takes ~1 second and only needs `/reload-plugins` in Claude Code afterward. Use `--clean` when the schema changes (e.g., `marketplace.json` owner field added, dependencies declaration removed) or when the install gets stuck in an inconsistent state.

## System requirements

- Claude Code with plugin support (2026 build)
- Node 20+
- `uv` (for Semble — optional; agent silently falls back to grep if missing)
- `jq` (for state parsing in slash commands)
- macOS or Linux

## Per-repo state vs plugin assets

The plugin ships agents, commands, skills, validators, and hook scripts. Per-repo state lives in your repo at `.dev-flow/config.yaml` (team config) and `.dev-flow/tickets/<TICKET>/` (one folder per ticket, committed to the feature branch). The plugin's setup wizard creates the per-repo `.dev-flow/` on first run.

## Documentation

- `AGENTS.md` — cross-vendor team rules (read by Claude Code, Codex CLI, Cursor, Aider, etc.)
- `templates/PROCESS.md` — the full flow reference (shipped into your repo)
- `docs/superpowers/specs/2026-05-15-jira-driven-dev-cycle-design.md` — the design spec
- `docs/superpowers/plans/2026-05-15-jira-driven-dev-cycle.md` — the original implementation plan

## License

MIT. See `LICENSE`.
