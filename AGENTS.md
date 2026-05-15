# AGENTS.md — Handyman repo

Cross-vendor team rules. Read by Claude Code, Codex CLI, Cursor, Aider, Copilot, Goose, etc.

## Stack
- Frontend: Next.js (apps/web)
- Backend: Nest.js (apps/api)
- Services: TypeScript microservices (services/*)
- E2E: Playwright (e2e/)
- Package manager: pnpm

## Commands
- Install: `pnpm install`
- Dev: `pnpm dev`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Unit tests: `pnpm test`
- Integration tests: `pnpm test:integration`
- E2E tests: `pnpm test:e2e`

## Conventions
- Branch naming: `feature/<JIRA-KEY>-<title-slug>` (e.g. `feature/PROJ-123-fix-login-button`).
- Commit messages: `<type>: <JIRA-KEY> <summary>`. Types: feat, fix, chore, docs, refactor, test, intake, research, plan, implement, verify, security, pr.
- Every PR includes the full `tickets/<JIRA-KEY>/` artifact chain.
- Trunk: `develop`. PRs target `develop` unless explicitly stated.

## Dev cycle
This repo uses a structured AI dev cycle. See `.dev-flow/PROCESS.md` for the full flow. Quick reference:
- `/task:start <JIRA-KEY>` — Phase 1 (intake)
- `/task:research` — Phase 2
- `/task:plan` — Phase 3
- `/task:implement` — Phase 4
- `/task:test` — Phase 5
- `/task:verify` — Phase 6
- `/task:security` — Phase 7
- `/task:pr` — Phase 8
- `/task:status` — show current state, blocking issue, next step
- `/task:reset --to <phase>` — rewind state (does not delete artifacts)

Validators in `.dev-flow/src/validators/` are pure Node — they refuse to advance phases when artifacts are malformed.

## What NOT to do
- Do not commit secrets. `.dev-flow/auth/` is gitignored.
- Do not push to `develop` directly. Always via PR.
- Do not hand-edit `state.json` — use `/task:reset`.
- Do not skip phases. The slash commands enforce order via validators.
