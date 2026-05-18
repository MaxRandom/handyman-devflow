# Changelog

## [0.1.1] — 2026-05-18

Hardening pass against the v1 reviewers' backlog. 14 new tests (76 → 90), all passing.

### Fixed

- **verify validator** silently dropped typo'd verdicts (`PASSED`, `UNKLEAR`) instead of flagging them. Row regex now captures any verdict word and validates against an explicit allow-list, producing `Row N has invalid verdict (X)` errors with row number + criterion snippet.
- **security validator** silently accepted typo'd statuses (`oepn`, `waaived`), bypassing the empty-reason check. Status now validated against `{open, resolved, waived}` allow-list.
- **implementation validator** swallowed lint/typecheck output via `stdio: 'pipe'` with a bare catch. Now captures stderr + stdout and surfaces the last 30 lines (with a truncation notice) on failure.
- **slash commands** hardcoded `develop` as base branch and `pnpm test`/`pnpm lint`/`pnpm typecheck` as runners, ignoring `.dev-flow/config.yaml`. Added `devflow config get <dotted.path>` subcommand backed by `src/config-cli.ts`; `test.md`, `verify.md`, `security.md`, `implement.md` now query config.
- **test.md** hardcoded Playwright's default `test-results/` output dir, silently producing no evidence when teams override `outputDir` in `playwright.config.ts`. Added `stack.e2e_output_dir` config field (default `test-results`); slash command reads it and prints a useful stderr note when the dir is missing.

### Added

- `bin/devflow config get <dotted.path>` — reads any value from `.dev-flow/config.yaml` via dotted path. Stdout is the raw value (no newline) for clean `$(...)` substitution.
- `stack.e2e_output_dir` config field (optional, default `test-results`).
- 14 new regression tests:
  - 2 in `verify.test.ts` (typo'd verdict, all-typos)
  - 1 in `security.test.ts` (typo'd status)
  - 2 in `implementation.test.ts` (typecheck failure, Plan-Task substring disambiguation)
  - 1 + 1 strengthened in `implementation.test.ts` (stderr surfacing, 30-line truncation)
  - 6 in `config-cli.test.ts` (scalar/nested/array/object/missing/traversal-through-scalar)
  - 2 in `config.test.ts` (e2e_output_dir default, e2e_output_dir override)

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
