# Changelog

## [0.1.0] — 2026-05-18

Initial public release. Packaged the dev-flow as a Claude Code plugin.

### Added

- 8-phase dev cycle slash commands (`/handyman-devflow:start` through `/handyman-devflow:pr`)
- 3 helper slash commands (`status`, `reset`, `setup`)
- 7 named subagents
- 3 skills (judge-gate, owasp-top-10, bitbucket-pr-body)
- 3 hooks (auto-journal, block-trunk-push, validate-state)
- Bundled Semble MCP server for semantic code search
- Plugin dependencies on `superpowers` and `atlassian`
- Per-phase validators in Node + Zod (76 vitest tests, all passing)
- Setup wizard that auto-installs dependencies, runs codebase scan, and validates Atlassian connectivity

### Architecture

- Disk-state machine (state.json keyed by ticket) — phases cannot be skipped
- Atomic per-phase commits on the feature branch
- Fresh-context judge gate at Phase 6
- Evidence bundle (Playwright traces, screenshots) at Phase 5
- Plugin scripts use `${CLAUDE_PLUGIN_ROOT}` (read-only install dir) and `${CLAUDE_PLUGIN_DATA}` (persistent for npm deps)
- Per-repo state lives at `${CLAUDE_PROJECT_DIR}/.dev-flow/`
