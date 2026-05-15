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

## Conventions (when working on the tool itself)

- **Branch naming:** `feature/<TICKET>-<title-slug>` if you're using the tool to develop the tool (dogfooding). For ordinary maintenance, conventional `feature/<short-name>` is fine.
- **Commit messages:** lowercase prefix + concise summary. Use phase prefixes (`intake:`, `research:`, `plan:`, `implement:`, `verify:`, `security:`, `pr:`) only when running the dev cycle; otherwise use `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- **Trunk:** `main`. (Not `develop` — that's a placeholder default in `.dev-flow/config.yaml` for tool consumers.)
- **PRs:** all changes go through PRs unless trivial.

## Dev cycle (dogfooding)

If you use the tool on itself: see `.dev-flow/PROCESS.md` for the full flow. Quick reference:

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

`.dev-flow/config.yaml` ships with placeholder values (`workspace: handyman-team`, `project_key: PROJ`, areas pointing at fictional `apps/web` etc.). These are EXAMPLES for tool consumers. Before using the tool on a real ticket — either dogfooding here, or in a consumer repo — edit `config.yaml` to point at the real Atlassian workspace + project key + repo layout.

## What NOT to do

- Don't commit secrets. `.dev-flow/auth/` is gitignored.
- Don't push to `main` directly. Always via PR.
- Don't hand-edit `state.json` — use `/task:reset`.
- Don't skip phases. The slash commands enforce order via validators.
