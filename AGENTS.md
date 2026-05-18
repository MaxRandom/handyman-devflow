# AGENTS.md — Handyman

Cross-vendor team rules. Read by Claude Code, Codex CLI, Cursor, Aider, Copilot, Goose, and any other agent CLI.

## What this repo is

**Handyman is the source repo of a Jira-driven AI dev cycle tool, packaged as a Claude Code plugin (`handyman-devflow`).** The tool itself orchestrates a `intake → research → plan → implement → test → verify → security → PR` flow on top of Jira + Bitbucket (Atlassian Cloud), using slash commands inside Claude Code.

This repo contains the tool's source — not a product application. There is no `apps/web`, no `apps/api`, no Playwright e2e suite. If you came here looking for a Next.js + Nest.js stack, you're in the wrong place.

## Plugin distribution

This repo is both the source of the `handyman-devflow` plugin AND a self-hosted marketplace (`.claude-plugin/marketplace.json`). End users install via:

```
/plugin marketplace add MaxRandom/handyman-devflow
/plugin install handyman-devflow@handyman-marketplace
```

When the plugin is installed, plugin source lives at `${CLAUDE_PLUGIN_ROOT}` (read-only) and node_modules live at `${CLAUDE_PLUGIN_DATA}/node_modules` (symlinked into PLUGIN_ROOT by `scripts/ensure-deps.sh` on SessionStart). Per-repo state — the user's team config and ticket folders — lives at `${CLAUDE_PROJECT_DIR}/.dev-flow/`, created by the `/handyman-devflow:setup` wizard on first run.

## Stack
- Node 20+ (ESM)
- TypeScript via `tsx` (no compile step; source runs directly)
- Zod for schema validation
- `yaml` for config parsing
- `vitest` for unit tests
- `simple-git` for git operations
- npm as the package manager (the **tool itself**; the tool generates configs targeting pnpm for tools' end-users)

## Commands

Run from the repo root:

- Install: `npm install`
- Unit tests: `npm test`
- Watch tests: `npm run test:watch`
- Run a validator directly (plugin dev from CLI): `npx tsx src/validators/<phase>.ts <TICKET>`
- Slugify a string (plugin dev from CLI): `npx tsx src/utils/slug-cli.ts "<text>"`
- Append to a ticket's journal (plugin dev from CLI): `npx tsx src/journal-cli.ts <TICKET> <PHASE> <STEP> <STATUS>`

When running INSIDE Claude Code with the plugin installed, slash commands invoke the `bin/devflow` wrapper instead of `npx tsx` directly. Equivalent forms:

- `devflow validate <phase> <TICKET>`
- `devflow journal <TICKET> <PHASE> <STEP> <STATUS> [details]`
- `devflow slug "<text>"`

The wrapper resolves `${CLAUDE_PLUGIN_ROOT}` and exec's the corresponding `tsx` script. It's PATH-injected by Claude Code (`${CLAUDE_PLUGIN_ROOT}/bin/` is auto-prepended for installed plugins).

There is no `dev` server, no lint script yet, no typecheck script yet. (These are tracked as v1.1 hardening items.)

## Repo layout

```
.claude-plugin/
  plugin.json              # plugin manifest (dependencies, metadata)
  marketplace.json         # self-hosted marketplace registration
.mcp.json                  # Semble MCP (Atlassian comes from the atlassian plugin dependency)

agents/                    # 7 named subagents
commands/                  # 11 slash commands (/handyman-devflow:*)
skills/                    # 3 skills (judge-gate, owasp-top-10, bitbucket-pr-body)
hooks/
  hooks.json               # registration of the 3 hooks
  auto-journal.ts          # PostToolUse:Write
  block-trunk-push.ts      # PreToolUse:Bash
  validate-state.ts        # Stop
scripts/
  ensure-deps.sh           # SessionStart: symlinks ${CLAUDE_PLUGIN_DATA}/node_modules
bin/
  devflow                  # bash wrapper for slash commands (validate|journal|slug)

src/                       # plugin's Node tooling
  config.ts                # Zod schema + YAML loader for team configs
  state.ts                 # state.json schema + I/O + advancePhase / recordError
  journal.ts               # append-only per-ticket step log
  journal-cli.ts           # CLI wrapper for slash commands
  utils/
    validator-result.ts    # { ok, errors } shape
    slug.ts + slug-cli.ts
    git.ts
    project-root.ts        # resolves repo root by finding .dev-flow/config.yaml
  validators/
    intake.ts research.ts plan.ts implementation.ts
    test.ts verify.ts security.ts pr.ts

__tests__/                 # vitest unit tests
fixtures/                  # sample artifacts for validator tests
templates/
  config.yaml.example      # template copied into the user's .dev-flow/ by setup
  PROCESS.md               # human-readable flow reference

docs/superpowers/          # design spec + implementation plan for this tool

README.md                  # end-user install + overview
CHANGELOG.md               # release notes
AGENTS.md                  # this file
```

## Multi-agent infrastructure

The dev-flow uses Claude Code's built-in multi-agent primitives:

### Named subagents (`agents/`)

Each is a focused, reusable subagent with its own system prompt and tool allowance. Spawn by name from a slash command via the Agent tool's `subagent_type`:

| Subagent | Used by | Role |
|---|---|---|
| `intake-analyst` | `/handyman-devflow:start` | Surfaces ambiguities, drafts testable requirements, marks open questions with `[NEEDS-ANSWER]` |
| `codebase-researcher` | `/handyman-devflow:research` | Maps existing patterns and integration points, citing real file paths |
| `task-planner` | `/handyman-devflow:plan` | Produces ordered task list with acceptance criteria + test plan |
| `tdd-implementer` | (optional, per-task in `/handyman-devflow:implement`) | Executes one plan task with strict RED-GREEN-REFACTOR discipline |
| `judge-reviewer` | `/handyman-devflow:verify` | Phase 6 judge gate. Strictly fresh-context — never sees plan/research/implementation |
| `security-auditor` | `/handyman-devflow:security` | OWASP top-10 review of code diffs |
| `setup-wizard` | `/handyman-devflow:setup` | One-time configuration wizard. Detects repo state, asks Socratic questions, validates against Atlassian MCP, returns a complete config.yaml |

When updating an agent's behavior, edit the agent file itself rather than the slash command. The slash command's job is to wire inputs/outputs and enforce the state machine; the agent's job is to do the work.

### Skills (`skills/`)

Reusable prompt fragments that any agent (or you, in conversation) can pull in. Claude Code auto-loads a skill when its `description` matches the current task.

| Skill | Used by | Source |
|---|---|---|
| `clarifying-questions` | `intake-analyst` (and any agent surfacing ambiguities) | delegated to `superpowers` plugin |
| `tdd-discipline` | `tdd-implementer` (and any code-writing context) | delegated to `superpowers` plugin |
| `judge-gate` | `judge-reviewer` (and any verification context) | this plugin (`skills/judge-gate`) |
| `owasp-top-10` | `security-auditor` (and any security-review context) | this plugin (`skills/owasp-top-10`) |
| `bitbucket-pr-body` | `/handyman-devflow:pr` (and any PR-composition context) | this plugin (`skills/bitbucket-pr-body`) |

Skills are intentionally cross-cutting — they're not tied to one phase. If you find yourself re-explaining a pattern in multiple agents, it probably wants to be a skill.

### Hooks (`hooks/hooks.json`)

Deterministic event handlers that run on tool/lifecycle events. They run shell commands, not LLM calls — so they're cheap, fast, and predictable. Currently registered:

| Event | Matcher | Hook script | Purpose |
|---|---|---|---|
| `SessionStart` | (any) | `bash "${CLAUDE_PLUGIN_ROOT}/scripts/ensure-deps.sh"` | Symlink `${CLAUDE_PLUGIN_DATA}/node_modules` into the plugin install dir; run `npm install` if needed |
| `PostToolUse` | `Write` | `npx tsx "${CLAUDE_PLUGIN_ROOT}/hooks/auto-journal.ts"` | When an agent writes to `tickets/<TICKET>/...`, append a journal entry automatically |
| `PreToolUse` | `Bash` | `npx tsx "${CLAUDE_PLUGIN_ROOT}/hooks/block-trunk-push.ts"` | Refuse `git push origin main\|master\|develop` and unsafe force-pushes (exit 2 blocks) |
| `Stop` | (any) | `npx tsx "${CLAUDE_PLUGIN_ROOT}/hooks/validate-state.ts"` | Walk all `tickets/*/state.json` files; warn on stderr if any are malformed |

Each hook has a pure function tested in `__tests__/hooks/`. The CLI wrapper at the bottom of each hook file reads stdin JSON, calls the function, and exits with the right code. The hooks use `npx tsx` because the source is TypeScript; if you ever switch to plain Node, drop the `npx tsx` wrapper.

### MCP servers

External tool providers exposed to all agents (subject to each agent's `tools:` allowance).

| Server | What it provides | Used by | Source |
|---|---|---|---|
| `atlassian` | Jira read/write (issues, transitions, comments) + Bitbucket Cloud (branches, PRs, pipelines). Auth: OAuth 2.1 via existing Atlassian Cloud SSO on first call. | `/handyman-devflow:start`, `/handyman-devflow:pr`, `setup-wizard` | `atlassian` plugin dependency (not bundled here) |
| `semble` | Semantic code search ([MinishLab/semble](https://github.com/MinishLab/semble)). CPU-only, no API keys. Auto-indexes the current repo. ~98% lower token cost than grep+read for "find similar features" queries. **Prerequisite:** `uv` installed (`brew install uv` or `curl -LsSf https://astral.sh/uv/install.sh \| sh`). | `codebase-researcher` | this plugin's `.mcp.json` |

To swap providers (e.g., Bitbucket → GitHub), swap the upstream plugin dependency and update the affected slash commands' tool references.

### How to add a new agent / skill / hook

- **New agent:** drop a `.md` file in `agents/` with frontmatter (`name`, `description`, `tools`, `model`) and a system prompt body. Spawn it via `subagent_type: <name>` from a slash command or directly from a conversation.
- **New skill:** drop a `SKILL.md` in `skills/<skill-name>/` with frontmatter (`name`, `description`). Claude Code auto-loads it when the description matches the current task.
- **New hook:** drop a `.ts` file in `hooks/`, expose a pure function for testability, add a CLI wrapper at the bottom, register in `hooks/hooks.json`. Tests in `__tests__/hooks/`.

## Conventions (when working on the tool itself)

- **Branch naming:** `feature/<TICKET>-<title-slug>` if you're using the tool to develop the tool (dogfooding). For ordinary maintenance, conventional `feature/<short-name>` is fine.
- **Commit messages:** lowercase prefix + concise summary. Use phase prefixes (`intake:`, `research:`, `plan:`, `implement:`, `verify:`, `security:`, `pr:`) only when running the dev cycle; otherwise use `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- **Trunk:** `main`. (Not `develop` — that's a placeholder default in `templates/config.yaml.example` for tool consumers.)
- **PRs:** all changes go through PRs unless trivial.

## Dev cycle (dogfooding)

If you use the tool on itself: see `templates/PROCESS.md` for the full flow. Quick reference:

- `/handyman-devflow:setup` — one-time configuration wizard (run before first use). `--check` for verification only.
- `/handyman-devflow:start <TICKET>` — Phase 1 (intake)
- `/handyman-devflow:research` — Phase 2
- `/handyman-devflow:plan` — Phase 3
- `/handyman-devflow:implement` — Phase 4
- `/handyman-devflow:test` — Phase 5
- `/handyman-devflow:verify` — Phase 6
- `/handyman-devflow:security` — Phase 7
- `/handyman-devflow:pr` — Phase 8
- `/handyman-devflow:status` — read-only state inspection
- `/handyman-devflow:reset --to <phase>` — rewind state.phase (does not delete artifacts)

The validators in `src/validators/` are pure Node — they refuse to advance phases when artifacts are malformed.

## Configuration

`templates/config.yaml.example` ships with placeholder values (`workspace: handyman-team`, `project_key: PROJ`, areas pointing at fictional `apps/web` etc.). These are EXAMPLES for tool consumers. The `/handyman-devflow:setup` wizard copies this template into the user's repo at `${CLAUDE_PROJECT_DIR}/.dev-flow/config.yaml` on first run. Before using the tool on a real ticket — either dogfooding here, or in a consumer repo — run `/handyman-devflow:setup` to configure interactively. The wizard auto-detects what it can (git remote, package manager, test scripts, directory layout) and asks for the rest (Atlassian project key, reviewers). It validates against the live Atlassian MCP before writing.

For minor edits to an already-working config, edit `.dev-flow/config.yaml` directly, then run `/handyman-devflow:setup --check` to validate.

## What NOT to do

- Don't commit secrets. `.dev-flow/auth/` is gitignored.
- Don't push to `main` directly. Always via PR.
- Don't hand-edit `state.json` — use `/handyman-devflow:reset`.
- Don't skip phases. The slash commands enforce order via validators.
