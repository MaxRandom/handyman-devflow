# AGENTS.md — Handyman

Cross-vendor team rules. Read by Claude Code, Codex CLI, Cursor, Aider, Copilot, Goose, and any other agent CLI.

## What this repo is

**Handyman is the source repo of a Jira-driven AI dev cycle tool.** The tool itself orchestrates a `intake → research → plan → implement → test → verify → security → PR` flow on top of Jira + Bitbucket (Atlassian Cloud), using slash commands inside Claude Code.

This repo contains the tool's source — not a product application. There is no `apps/web`, no `apps/api`, no Playwright e2e suite. If you came here looking for a Next.js + Nest.js stack, you're in the wrong place.

## Stack
- Node 20+ (ESM)
- TypeScript via `tsx` (no compile step; source runs directly)
- Zod for schema validation
- `yaml` for config parsing
- `vitest` for unit tests
- `simple-git` for git operations
- npm as the package manager (the **tool itself**; the tool generates configs targeting pnpm for tools' end-users)

## Commands

Run from `.dev-flow/`:

- Install: `cd .dev-flow && npm install`
- Unit tests: `cd .dev-flow && npm test`
- Watch tests: `cd .dev-flow && npm run test:watch`
- Run a validator directly: `cd .dev-flow && npx tsx src/validators/<phase>.ts <TICKET>`
- Slugify a string: `cd .dev-flow && npx tsx src/utils/slug-cli.ts "<text>"`
- Append to a ticket's journal: `cd .dev-flow && npx tsx src/journal-cli.ts <TICKET> <PHASE> <STEP> <STATUS>`

There is no `dev` server, no lint script yet, no typecheck script yet. (These are tracked as v1.1 hardening items.)

## Repo layout

```
.dev-flow/                 # the tool's source + tests
  src/
    config.ts              # Zod schema + YAML loader for team configs
    state.ts               # state.json schema + I/O + advancePhase / recordError
    journal.ts             # append-only per-ticket step log
    journal-cli.ts         # CLI wrapper for slash commands
    utils/
      validator-result.ts  # { ok, errors } shape
      slug.ts + slug-cli.ts
      git.ts
      project-root.ts      # resolves repo root by finding .dev-flow/config.yaml
    validators/
      intake.ts research.ts plan.ts implementation.ts
      test.ts verify.ts security.ts pr.ts
  __tests__/               # vitest unit tests
  fixtures/                # sample artifacts for validator tests
  config.yaml              # example config (placeholder values — see below)
  PROCESS.md               # human-readable flow reference

.claude/commands/task/     # slash commands the team-shared Claude Code invokes
  start.md research.md plan.md implement.md
  test.md verify.md security.md pr.md
  status.md reset.md

.mcp.json                  # Atlassian Rovo MCP Server registration
docs/superpowers/          # design spec + implementation plan for this tool
```

## Multi-agent infrastructure

The dev-flow uses Claude Code's built-in multi-agent primitives:

### Named subagents (`.claude/agents/`)

Each is a focused, reusable subagent with its own system prompt and tool allowance. Spawn by name from a slash command via the Agent tool's `subagent_type`:

| Subagent | Used by | Role |
|---|---|---|
| `intake-analyst` | `/task:start` | Surfaces ambiguities, drafts testable requirements, marks open questions with `[NEEDS-ANSWER]` |
| `codebase-researcher` | `/task:research` | Maps existing patterns and integration points, citing real file paths |
| `task-planner` | `/task:plan` | Produces ordered task list with acceptance criteria + test plan |
| `tdd-implementer` | (optional, per-task in `/task:implement`) | Executes one plan task with strict RED-GREEN-REFACTOR discipline |
| `judge-reviewer` | `/task:verify` | Phase 6 judge gate. Strictly fresh-context — never sees plan/research/implementation |
| `security-auditor` | `/task:security` | OWASP top-10 review of code diffs |
| `setup-wizard` | `/task:setup` | One-time configuration wizard. Detects repo state, asks Socratic questions, validates against Atlassian MCP, returns a complete config.yaml |

When updating an agent's behavior, edit the agent file itself rather than the slash command. The slash command's job is to wire inputs/outputs and enforce the state machine; the agent's job is to do the work.

### Skills (`.claude/skills/`)

Reusable prompt fragments that any agent (or you, in conversation) can pull in. Claude Code auto-loads a skill when its `description` matches the current task.

| Skill | Used by |
|---|---|
| `clarifying-questions` | `intake-analyst` (and any agent surfacing ambiguities) |
| `tdd-discipline` | `tdd-implementer` (and any code-writing context) |
| `judge-gate` | `judge-reviewer` (and any verification context) |
| `owasp-top-10` | `security-auditor` (and any security-review context) |
| `bitbucket-pr-body` | `/task:pr` (and any PR-composition context) |

Skills are intentionally cross-cutting — they're not tied to one phase. If you find yourself re-explaining a pattern in multiple agents, it probably wants to be a skill.

### Hooks (`.claude/settings.json`)

Deterministic event handlers that run on tool/lifecycle events. They run shell commands, not LLM calls — so they're cheap, fast, and predictable. Currently registered:

| Event | Matcher | Hook script | Purpose |
|---|---|---|---|
| `PostToolUse` | `Write` | `npx tsx .dev-flow/hooks/auto-journal.ts` | When an agent writes to `tickets/<TICKET>/...`, append a journal entry automatically |
| `PreToolUse` | `Bash` | `npx tsx .dev-flow/hooks/block-trunk-push.ts` | Refuse `git push origin main\|master\|develop` and unsafe force-pushes (exit 2 blocks) |
| `Stop` | (any) | `npx tsx .dev-flow/hooks/validate-state.ts` | Walk all `tickets/*/state.json` files; warn on stderr if any are malformed |

Each hook has a pure function tested in `.dev-flow/__tests__/hooks/`. The CLI wrapper at the bottom of each hook file reads stdin JSON, calls the function, and exits with the right code. The hooks use `npx tsx` because the dev-flow's source is TypeScript; if you ever switch to plain Node, drop the `npx tsx` wrapper.

### MCP servers (`.mcp.json`)

External tool providers exposed to all agents (subject to each agent's `tools:` allowance).

| Server | What it provides | Used by |
|---|---|---|
| `atlassian` | Jira read/write (issues, transitions, comments) + Bitbucket Cloud (branches, PRs, pipelines). Auth: OAuth 2.1 via existing Atlassian Cloud SSO on first call. | `/task:start`, `/task:pr`, `setup-wizard` |
| `semble` | Semantic code search ([MinishLab/semble](https://github.com/MinishLab/semble)). CPU-only, no API keys. Auto-indexes the current repo. ~98% lower token cost than grep+read for "find similar features" queries. **Prerequisite:** `uv` installed (`brew install uv` or `curl -LsSf https://astral.sh/uv/install.sh \| sh`). | `codebase-researcher` |

To swap providers (e.g., Bitbucket → GitHub), edit `.mcp.json` and the affected slash commands' tool references.

### How to add a new agent / skill / hook

- **New agent:** drop a `.md` file in `.claude/agents/` with frontmatter (`name`, `description`, `tools`, `model`) and a system prompt body. Spawn it via `subagent_type: <name>` from a slash command or directly from a conversation.
- **New skill:** drop a `SKILL.md` in `.claude/skills/<skill-name>/` with frontmatter (`name`, `description`). Claude Code auto-loads it when the description matches the current task.
- **New hook:** drop a `.ts` file in `.dev-flow/hooks/`, expose a pure function for testability, add a CLI wrapper at the bottom, register in `.claude/settings.json`. Tests in `.dev-flow/__tests__/hooks/`.

## Conventions (when working on the tool itself)

- **Branch naming:** `feature/<TICKET>-<title-slug>` if you're using the tool to develop the tool (dogfooding). For ordinary maintenance, conventional `feature/<short-name>` is fine.
- **Commit messages:** lowercase prefix + concise summary. Use phase prefixes (`intake:`, `research:`, `plan:`, `implement:`, `verify:`, `security:`, `pr:`) only when running the dev cycle; otherwise use `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- **Trunk:** `main`. (Not `develop` — that's a placeholder default in `.dev-flow/config.yaml` for tool consumers.)
- **PRs:** all changes go through PRs unless trivial.

## Dev cycle (dogfooding)

If you use the tool on itself: see `.dev-flow/PROCESS.md` for the full flow. Quick reference:

- `/task:setup` — one-time configuration wizard (run before first use). `--check` for verification only.
- `/task:start <TICKET>` — Phase 1 (intake)
- `/task:research` — Phase 2
- `/task:plan` — Phase 3
- `/task:implement` — Phase 4
- `/task:test` — Phase 5
- `/task:verify` — Phase 6
- `/task:security` — Phase 7
- `/task:pr` — Phase 8
- `/task:status` — read-only state inspection
- `/task:reset --to <phase>` — rewind state.phase (does not delete artifacts)

The validators in `.dev-flow/src/validators/` are pure Node — they refuse to advance phases when artifacts are malformed.

## Configuration

`.dev-flow/config.yaml` ships with placeholder values (`workspace: handyman-team`, `project_key: PROJ`, areas pointing at fictional `apps/web` etc.). These are EXAMPLES for tool consumers. Before using the tool on a real ticket — either dogfooding here, or in a consumer repo — run `/task:setup` to configure interactively. The wizard auto-detects what it can (git remote, package manager, test scripts, directory layout) and asks for the rest (Atlassian project key, reviewers). It validates against the live Atlassian MCP before writing.

For minor edits to an already-working config, edit `config.yaml` directly, then run `/task:setup --check` to validate.

## What NOT to do

- Don't commit secrets. `.dev-flow/auth/` is gitignored.
- Don't push to `main` directly. Always via PR.
- Don't hand-edit `state.json` — use `/task:reset`.
- Don't skip phases. The slash commands enforce order via validators.
