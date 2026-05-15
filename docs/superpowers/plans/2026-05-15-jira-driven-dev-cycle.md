# Jira-driven Development Cycle — v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a gated, multi-phase, AI-assisted dev cycle that takes a Jira ticket from intake to a Bitbucket PR, with each phase producing a reviewable artifact committed atomically to a feature branch. v1 ships standard mode only against Atlassian (Jira + Bitbucket Cloud).

**Architecture:** Disk-state machine. A `state.json` file per ticket lives on a `feature/<TICKET>-<slug>` branch alongside per-phase markdown artifacts under `tickets/<TICKET>/`. Each phase is invoked by a slash command (`.claude/commands/task/*.md`). Each slash command's first action is a precondition check: read `state.json`, refuse to run if the previous phase isn't complete, run a Node validator script that exits non-zero if the prior artifact is malformed. Phases produce their artifact, commit atomically, then update `state.json`. Jira and Bitbucket access goes through the Atlassian Rovo MCP Server — no bespoke API clients.

**Tech Stack:**
- Node 20+ (ESM)
- TypeScript via `tsx` (no compile step; validators run as `tsx validators/intake.ts <args>`)
- `zod` for schema validation (config, state, validator results)
- `yaml` for config parsing
- `vitest` for tests
- `simple-git` for git operations (testable wrapper)
- Atlassian Rovo MCP Server (`https://mcp.atlassian.com/v1/mcp/authv2`) accessed via Claude Code's MCP client
- Claude Code slash commands (`.claude/commands/task/*.md`) as the orchestrator

**Spec reference:** [docs/superpowers/specs/2026-05-15-jira-driven-dev-cycle-design.md](../specs/2026-05-15-jira-driven-dev-cycle-design.md)

---

## File structure

```
AGENTS.md                           # cross-vendor team rules (NEW)
CLAUDE.md                           # Claude-specific quirks only (kept minimal)
.mcp.json                           # MCP server registrations (NEW)
.gitignore                          # node_modules, .dev-flow/auth/

.dev-flow/
  PROCESS.md                        # docs the slash commands reference
  config.yaml                       # team config
  package.json                      # local deps (vitest, tsx, zod, yaml, simple-git)
  tsconfig.json
  vitest.config.ts
  src/
    config.ts                       # config schema + loader
    state.ts                        # state.json schema + read/write
    journal.ts                      # append-only journal helper
    utils/
      slug.ts                       # title → kebab slug
      git.ts                        # git helpers (clean check, branch, commit)
      validator-result.ts           # shared { ok, errors } shape
    validators/
      intake.ts
      research.ts
      plan.ts
      implementation.ts
      test.ts
      verify.ts
      security.ts
      pr.ts
  __tests__/
    config.test.ts
    state.test.ts
    journal.test.ts
    utils/slug.test.ts
    utils/git.test.ts
    validators/intake.test.ts
    validators/research.test.ts
    validators/plan.test.ts
    validators/implementation.test.ts
    validators/test.test.ts
    validators/verify.test.ts
    validators/security.test.ts
    validators/pr.test.ts
  fixtures/                         # sample artifacts for tests
    01-INTAKE.good.md
    01-INTAKE.bad-needs-answer.md
    02-RESEARCH.good.md
    ... (one good + one bad per phase)

.claude/commands/task/
  start.md                          # /task:start  (Phase 1 — Intake)
  research.md                       # /task:research (Phase 2)
  plan.md                           # /task:plan (Phase 3)
  implement.md                      # /task:implement (Phase 4)
  test.md                           # /task:test (Phase 5)
  verify.md                         # /task:verify (Phase 6)
  security.md                       # /task:security (Phase 7)
  pr.md                             # /task:pr (Phase 8)
  status.md                         # /task:status (cross-cutting)
  reset.md                          # /task:reset (rewind to a phase)
```

**Responsibility map:**
- `src/config.ts` owns config parsing + Zod validation. Pure.
- `src/state.ts` owns state.json read/write + transitions. Pure (file I/O via injectable fs).
- `src/journal.ts` owns the append-only journal log per ticket.
- `src/utils/slug.ts`, `git.ts`, `validator-result.ts` are leaf utilities.
- `src/validators/*.ts` each own ONE phase's artifact validation. Each exports `default async function validate(args): Promise<ValidatorResult>` and is invokable as a CLI script (`tsx validators/X.ts <TICKET>`).
- Slash commands in `.claude/commands/task/` are markdown prompt files; they instruct Claude to run validators, do MCP calls, write artifacts, and commit.

---

## Task 1: Initialize `.dev-flow/` Node project

**Files:**
- Create: `.dev-flow/package.json`
- Create: `.dev-flow/tsconfig.json`
- Create: `.dev-flow/vitest.config.ts`
- Create: `.dev-flow/.gitignore`
- Create: `.gitignore` (root, append)

- [ ] **Step 1: Create `.dev-flow/package.json`**

```json
{
  "name": "@handyman/dev-flow",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "simple-git": "^3.25.0",
    "yaml": "^2.5.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `.dev-flow/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "__tests__/**/*"]
}
```

- [ ] **Step 3: Create `.dev-flow/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
```

- [ ] **Step 4: Create `.dev-flow/.gitignore`**

```
node_modules/
dist/
auth/
*.log
.vitest-cache/
```

- [ ] **Step 5: Append to root `.gitignore` (create if missing)**

```
.dev-flow/node_modules/
.dev-flow/dist/
.dev-flow/auth/
```

- [ ] **Step 6: Install dependencies**

Run: `cd .dev-flow && npm install`
Expected: `node_modules/` populated, no errors. `package-lock.json` created.

- [ ] **Step 7: Verify vitest works (empty test suite)**

Run: `cd .dev-flow && npm test`
Expected: `No test files found` (exit code 0 OK; we'll add tests next).

- [ ] **Step 8: Commit**

```bash
git add .dev-flow/package.json .dev-flow/package-lock.json .dev-flow/tsconfig.json .dev-flow/vitest.config.ts .dev-flow/.gitignore .gitignore
git commit -m "chore: initialize .dev-flow Node project (vitest, tsx, zod)"
```

---

## Task 2: Add `AGENTS.md` and trim `CLAUDE.md`

**Files:**
- Create: `AGENTS.md`
- Modify (or create empty): `CLAUDE.md`

- [ ] **Step 1: Create `AGENTS.md`**

```markdown
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
```

- [ ] **Step 2: Trim or stub `CLAUDE.md`**

If `CLAUDE.md` exists, replace its content with:

```markdown
# CLAUDE.md

Most rules live in [AGENTS.md](AGENTS.md). This file is for Claude-Code-specific quirks only.

(currently empty)
```

If it doesn't exist, create it with that content.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: add AGENTS.md as cross-vendor team rules; trim CLAUDE.md"
```

---

## Task 3: Add `.mcp.json` with Atlassian Rovo MCP Server

**Files:**
- Create: `.mcp.json`

- [ ] **Step 1: Create `.mcp.json`**

```jsonc
{
  "mcpServers": {
    "atlassian": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.atlassian.com/v1/mcp/authv2"
      ]
    }
  }
}
```

- [ ] **Step 2: Sanity check the file is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('.mcp.json','utf8'))"`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add .mcp.json
git commit -m "chore: register Atlassian Rovo MCP Server in .mcp.json"
```

- [ ] **Step 4: MANUAL — verify MCP connectivity**

In a Claude Code session in this repo, ask Claude: "Use the Atlassian MCP server to list the projects I have access to." Confirm OAuth flow opens in browser, you sign in, and Claude returns a project list. **This is a manual gate; do not proceed past Task 3 until OAuth works.**

---

## Task 4: Add `.dev-flow/PROCESS.md` (referenced by slash commands)

**Files:**
- Create: `.dev-flow/PROCESS.md`

- [ ] **Step 1: Create `.dev-flow/PROCESS.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add .dev-flow/PROCESS.md
git commit -m "docs: add .dev-flow/PROCESS.md as the dev-cycle reference"
```

---

## Task 5: Add example `.dev-flow/config.yaml`

**Files:**
- Create: `.dev-flow/config.yaml`

- [ ] **Step 1: Create `.dev-flow/config.yaml`**

```yaml
provider:
  type: bitbucket
  mcp_server: atlassian
  workspace: handyman-team
  repo: handyman
  branch_pattern: "feature/{ticket}-{slug}"
  default_base: develop
  default_reviewers: []
  default_labels: []

tracker:
  type: jira
  mcp_server: atlassian
  base_url: https://handyman-team.atlassian.net
  project_key: PROJ
  pr_transition: "In Review"

stack:
  package_manager: pnpm
  test_commands:
    unit: "pnpm test"
    integration: "pnpm test:integration"
    e2e: "pnpm test:e2e"
    lint: "pnpm lint"
    typecheck: "pnpm typecheck"
  areas:
    frontend: { path: "apps/web", framework: nextjs }
    backend:  { path: "apps/api", framework: nestjs }
    services: { path: "services/*" }
    e2e:      { path: "e2e", framework: playwright }
```

- [ ] **Step 2: Commit**

```bash
git add .dev-flow/config.yaml
git commit -m "chore: add example .dev-flow/config.yaml"
```

---

## Task 6: Implement `validator-result.ts` (shared shape)

**Files:**
- Create: `.dev-flow/src/utils/validator-result.ts`
- Test: `.dev-flow/__tests__/utils/validator-result.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// .dev-flow/__tests__/utils/validator-result.test.ts
import { describe, expect, it } from 'vitest';
import { ok, fail, ValidatorResultSchema } from '../../src/utils/validator-result.js';

describe('validator-result', () => {
  it('ok() returns { ok: true, errors: [] }', () => {
    expect(ok()).toEqual({ ok: true, errors: [] });
  });

  it('fail() returns { ok: false, errors: [...] }', () => {
    expect(fail('a', 'b')).toEqual({ ok: false, errors: ['a', 'b'] });
  });

  it('schema accepts ok shape', () => {
    expect(ValidatorResultSchema.safeParse({ ok: true, errors: [] }).success).toBe(true);
  });

  it('schema rejects bad shape', () => {
    expect(ValidatorResultSchema.safeParse({ ok: 'yes' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- utils/validator-result`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// .dev-flow/src/utils/validator-result.ts
import { z } from 'zod';

export const ValidatorResultSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.string()),
});

export type ValidatorResult = z.infer<typeof ValidatorResultSchema>;

export const ok = (): ValidatorResult => ({ ok: true, errors: [] });
export const fail = (...errors: string[]): ValidatorResult => ({ ok: false, errors });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- utils/validator-result`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add .dev-flow/src/utils/validator-result.ts .dev-flow/__tests__/utils/validator-result.test.ts
git commit -m "feat: add validator-result shared shape (ok/fail helpers + Zod schema)"
```

---

## Task 7: Implement `slug.ts` utility

**Files:**
- Create: `.dev-flow/src/utils/slug.ts`
- Test: `.dev-flow/__tests__/utils/slug.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// .dev-flow/__tests__/utils/slug.test.ts
import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/utils/slug.js';

describe('slugify', () => {
  it('lowercases', () => {
    expect(slugify('Fix Login')).toBe('fix-login');
  });

  it('replaces spaces and special chars with single hyphen', () => {
    expect(slugify('Fix the login button!!!')).toBe('fix-the-login-button');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('a   b   c')).toBe('a-b-c');
  });

  it('truncates to 60 chars at word boundary', () => {
    const long = 'a'.repeat(20) + ' ' + 'b'.repeat(20) + ' ' + 'c'.repeat(40);
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith('-')).toBe(false);
  });

  it('handles empty input', () => {
    expect(slugify('')).toBe('untitled');
  });

  it('strips diacritics', () => {
    expect(slugify('café')).toBe('cafe');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- utils/slug`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// .dev-flow/src/utils/slug.ts
const MAX_LEN = 60;

export function slugify(input: string): string {
  const stripped = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug === '') return 'untitled';
  if (slug.length <= MAX_LEN) return slug;

  const truncated = slug.slice(0, MAX_LEN);
  const lastHyphen = truncated.lastIndexOf('-');
  return lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- utils/slug`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add .dev-flow/src/utils/slug.ts .dev-flow/__tests__/utils/slug.test.ts
git commit -m "feat: add slugify utility for branch name derivation"
```

---

## Task 8: Implement `git.ts` helpers

**Files:**
- Create: `.dev-flow/src/utils/git.ts`
- Test: `.dev-flow/__tests__/utils/git.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// .dev-flow/__tests__/utils/git.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { isCleanWorkingTree, currentBranch, createFeatureBranch, commit } from '../../src/utils/git.js';

let repo: string;

beforeEach(async () => {
  repo = mkdtempSync(join(tmpdir(), 'devflow-git-'));
  const git = simpleGit(repo);
  await git.init();
  await git.addConfig('user.email', 't@t.com');
  await git.addConfig('user.name', 'Test');
  writeFileSync(join(repo, 'README.md'), '# test\n');
  await git.add('.');
  await git.commit('initial');
  await git.checkoutLocalBranch('develop');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('git utils', () => {
  it('isCleanWorkingTree returns true on clean tree', async () => {
    expect(await isCleanWorkingTree(repo)).toBe(true);
  });

  it('isCleanWorkingTree returns false with untracked file', async () => {
    writeFileSync(join(repo, 'new.txt'), 'x');
    expect(await isCleanWorkingTree(repo)).toBe(false);
  });

  it('currentBranch returns the active branch', async () => {
    expect(await currentBranch(repo)).toBe('develop');
  });

  it('createFeatureBranch creates and switches to it', async () => {
    await createFeatureBranch(repo, 'feature/PROJ-1-test', 'develop');
    expect(await currentBranch(repo)).toBe('feature/PROJ-1-test');
  });

  it('createFeatureBranch refuses if branch exists', async () => {
    await createFeatureBranch(repo, 'feature/PROJ-1-test', 'develop');
    await expect(
      createFeatureBranch(repo, 'feature/PROJ-1-test', 'develop')
    ).rejects.toThrow(/already exists/);
  });

  it('commit stages and commits given paths', async () => {
    writeFileSync(join(repo, 'a.txt'), 'a');
    await commit(repo, ['a.txt'], 'feat: a');
    expect(await isCleanWorkingTree(repo)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- utils/git`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// .dev-flow/src/utils/git.ts
import { simpleGit, type SimpleGit } from 'simple-git';

const git = (cwd: string): SimpleGit => simpleGit({ baseDir: cwd });

export async function isCleanWorkingTree(cwd: string): Promise<boolean> {
  const status = await git(cwd).status();
  return status.isClean();
}

export async function currentBranch(cwd: string): Promise<string> {
  const status = await git(cwd).status();
  return status.current ?? '';
}

export async function createFeatureBranch(
  cwd: string,
  branch: string,
  base: string,
): Promise<void> {
  const branches = await git(cwd).branchLocal();
  if (branches.all.includes(branch)) {
    throw new Error(`Branch '${branch}' already exists`);
  }
  await git(cwd).checkoutBranch(branch, base);
}

export async function commit(
  cwd: string,
  paths: string[],
  message: string,
): Promise<void> {
  await git(cwd).add(paths);
  await git(cwd).commit(message);
}

export async function pushBranch(
  cwd: string,
  branch: string,
  setUpstream = true,
): Promise<void> {
  if (setUpstream) {
    await git(cwd).push(['-u', 'origin', branch]);
  } else {
    await git(cwd).push('origin', branch);
  }
}

export async function diffAgainst(cwd: string, base: string): Promise<string> {
  return git(cwd).diff([`${base}...HEAD`]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- utils/git`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add .dev-flow/src/utils/git.ts .dev-flow/__tests__/utils/git.test.ts
git commit -m "feat: add git utility helpers (clean check, branch create, commit, push)"
```

---

## Task 9: Implement config schema + loader

**Files:**
- Create: `.dev-flow/src/config.ts`
- Test: `.dev-flow/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// .dev-flow/__tests__/config.test.ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, ConfigSchema } from '../src/config.js';

const validYaml = `
provider:
  type: bitbucket
  mcp_server: atlassian
  workspace: t
  repo: r
  branch_pattern: "feature/{ticket}-{slug}"
  default_base: develop
  default_reviewers: []
  default_labels: []
tracker:
  type: jira
  mcp_server: atlassian
  base_url: https://t.atlassian.net
  project_key: PROJ
  pr_transition: "In Review"
stack:
  package_manager: pnpm
  test_commands:
    unit: "pnpm test"
    integration: "pnpm test:integration"
    e2e: "pnpm test:e2e"
    lint: "pnpm lint"
    typecheck: "pnpm typecheck"
  areas:
    frontend: { path: "apps/web", framework: nextjs }
    backend:  { path: "apps/api", framework: nestjs }
    services: { path: "services/*" }
    e2e:      { path: "e2e", framework: playwright }
`;

function tmpConfig(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'devflow-config-'));
  const path = join(dir, 'config.yaml');
  writeFileSync(path, yaml);
  return path;
}

describe('config', () => {
  it('parses a valid config', () => {
    const cfg = loadConfig(tmpConfig(validYaml));
    expect(cfg.provider.type).toBe('bitbucket');
    expect(cfg.tracker.project_key).toBe('PROJ');
    expect(cfg.stack.areas.frontend.framework).toBe('nextjs');
  });

  it('rejects missing provider', () => {
    const yaml = validYaml.replace(/provider:[\s\S]*?tracker:/, 'tracker:');
    expect(() => loadConfig(tmpConfig(yaml))).toThrow(/provider/);
  });

  it('rejects unknown provider type', () => {
    const yaml = validYaml.replace('type: bitbucket', 'type: svn');
    expect(() => loadConfig(tmpConfig(yaml))).toThrow();
  });

  it('schema accepts both bitbucket and github', () => {
    expect(ConfigSchema.shape.provider.shape.type.options).toContain('bitbucket');
    expect(ConfigSchema.shape.provider.shape.type.options).toContain('github');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- config`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// .dev-flow/src/config.ts
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const FrameworkArea = z.object({
  path: z.string(),
  framework: z.string().optional(),
});

export const ConfigSchema = z.object({
  provider: z.object({
    type: z.enum(['bitbucket', 'github', 'gitlab']),
    mcp_server: z.string(),
    workspace: z.string(),
    repo: z.string(),
    branch_pattern: z.string().default('feature/{ticket}-{slug}'),
    default_base: z.string().default('develop'),
    default_reviewers: z.array(z.string()).default([]),
    default_labels: z.array(z.string()).default([]),
  }),
  tracker: z.object({
    type: z.enum(['jira', 'linear']),
    mcp_server: z.string(),
    base_url: z.string().url(),
    project_key: z.string(),
    pr_transition: z.string().default('In Review'),
  }),
  stack: z.object({
    package_manager: z.enum(['npm', 'pnpm', 'yarn', 'bun']).default('pnpm'),
    test_commands: z.object({
      unit: z.string(),
      integration: z.string().optional(),
      e2e: z.string(),
      lint: z.string(),
      typecheck: z.string(),
    }),
    areas: z.record(z.string(), FrameworkArea),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path: string): Config {
  const raw = readFileSync(path, 'utf8');
  const parsed = parseYaml(raw);
  return ConfigSchema.parse(parsed);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- config`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add .dev-flow/src/config.ts .dev-flow/__tests__/config.test.ts
git commit -m "feat: add config schema (Zod) + YAML loader"
```

---

## Task 10: Implement state schema + reader/writer

**Files:**
- Create: `.dev-flow/src/state.ts`
- Test: `.dev-flow/__tests__/state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// .dev-flow/__tests__/state.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadState, writeState, advancePhase, recordError,
  ticketDir, statePath, PhaseSchema,
} from '../src/state.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'devflow-state-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('state', () => {
  it('ticketDir returns tickets/<id>', () => {
    expect(ticketDir(root, 'PROJ-1')).toBe(join(root, 'tickets', 'PROJ-1'));
  });

  it('writeState creates dir + file', () => {
    writeState(root, {
      ticket: 'PROJ-1',
      branch: 'feature/PROJ-1-x',
      phase: 'init',
      updated_at: new Date().toISOString(),
      last_error: null,
    });
    expect(readFileSync(statePath(root, 'PROJ-1'), 'utf8')).toContain('PROJ-1');
  });

  it('loadState round-trips', () => {
    writeState(root, {
      ticket: 'PROJ-1',
      branch: 'feature/PROJ-1-x',
      phase: 'plan-complete',
      updated_at: '2026-05-15T00:00:00.000Z',
      last_error: null,
    });
    const s = loadState(root, 'PROJ-1');
    expect(s.phase).toBe('plan-complete');
  });

  it('loadState throws if file missing', () => {
    expect(() => loadState(root, 'PROJ-99')).toThrow(/not found/);
  });

  it('advancePhase updates phase and updated_at', () => {
    writeState(root, {
      ticket: 'PROJ-1', branch: 'feature/PROJ-1-x',
      phase: 'intake-drafted',
      updated_at: '2026-01-01T00:00:00.000Z', last_error: null,
    });
    advancePhase(root, 'PROJ-1', 'intake-complete');
    const s = loadState(root, 'PROJ-1');
    expect(s.phase).toBe('intake-complete');
    expect(s.updated_at).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('recordError sets last_error', () => {
    writeState(root, {
      ticket: 'PROJ-1', branch: 'feature/PROJ-1-x',
      phase: 'intake-drafted',
      updated_at: new Date().toISOString(), last_error: null,
    });
    recordError(root, 'PROJ-1', 'validator failed: foo');
    expect(loadState(root, 'PROJ-1').last_error).toBe('validator failed: foo');
  });

  it('PhaseSchema rejects unknown phases', () => {
    expect(PhaseSchema.safeParse('bogus').success).toBe(false);
    expect(PhaseSchema.safeParse('plan-complete').success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- state`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// .dev-flow/src/state.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

export const PhaseSchema = z.enum([
  'init',
  'intake-drafted',
  'intake-complete',
  'research-complete',
  'plan-complete',
  'implementation-complete',
  'tests-complete',
  'verified',
  'security-reviewed',
  'pr-opened',
]);

export type Phase = z.infer<typeof PhaseSchema>;

export const StateSchema = z.object({
  ticket: z.string(),
  branch: z.string(),
  phase: PhaseSchema,
  updated_at: z.string().datetime(),
  last_error: z.string().nullable(),
});

export type State = z.infer<typeof StateSchema>;

export function ticketDir(root: string, ticket: string): string {
  return join(root, 'tickets', ticket);
}

export function statePath(root: string, ticket: string): string {
  return join(ticketDir(root, ticket), 'state.json');
}

export function writeState(root: string, state: State): void {
  StateSchema.parse(state);
  const path = statePath(root, state.ticket);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

export function loadState(root: string, ticket: string): State {
  const path = statePath(root, ticket);
  if (!existsSync(path)) throw new Error(`state.json not found for ${ticket} at ${path}`);
  return StateSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function advancePhase(root: string, ticket: string, to: Phase): void {
  const s = loadState(root, ticket);
  writeState(root, {
    ...s,
    phase: to,
    updated_at: new Date().toISOString(),
    last_error: null,
  });
}

export function recordError(root: string, ticket: string, error: string): void {
  const s = loadState(root, ticket);
  writeState(root, { ...s, last_error: error, updated_at: new Date().toISOString() });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- state`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add .dev-flow/src/state.ts .dev-flow/__tests__/state.test.ts
git commit -m "feat: add state.json schema + read/write/advance helpers"
```

---

## Task 11: Implement journal helper

**Files:**
- Create: `.dev-flow/src/journal.ts`
- Test: `.dev-flow/__tests__/journal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// .dev-flow/__tests__/journal.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { append, journalPath, read } from '../src/journal.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'devflow-journal-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('journal', () => {
  it('append creates file with one JSONL line', () => {
    append(root, 'PROJ-1', { phase: 'intake', step: 'fetch-ticket', status: 'ok' });
    const raw = readFileSync(journalPath(root, 'PROJ-1'), 'utf8');
    expect(raw.trim().split('\n')).toHaveLength(1);
    const entry = JSON.parse(raw.trim());
    expect(entry.phase).toBe('intake');
    expect(entry.ts).toBeDefined();
  });

  it('append appends across calls', () => {
    append(root, 'PROJ-1', { phase: 'intake', step: 'a', status: 'ok' });
    append(root, 'PROJ-1', { phase: 'intake', step: 'b', status: 'ok' });
    expect(read(root, 'PROJ-1')).toHaveLength(2);
  });

  it('read returns empty array if no journal exists', () => {
    expect(read(root, 'PROJ-99')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- journal`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// .dev-flow/src/journal.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ticketDir } from './state.js';

export interface JournalEntry {
  phase: string;
  step: string;
  status: 'ok' | 'fail' | 'skip';
  details?: string;
  ts?: string;
}

export function journalPath(root: string, ticket: string): string {
  return join(ticketDir(root, ticket), '.journal.jsonl');
}

export function append(root: string, ticket: string, entry: JournalEntry): void {
  const path = journalPath(root, ticket);
  mkdirSync(dirname(path), { recursive: true });
  const enriched = { ...entry, ts: entry.ts ?? new Date().toISOString() };
  appendFileSync(path, JSON.stringify(enriched) + '\n');
}

export function read(root: string, ticket: string): JournalEntry[] {
  const path = journalPath(root, ticket);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- journal`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add .dev-flow/src/journal.ts .dev-flow/__tests__/journal.test.ts
git commit -m "feat: add append-only journal for per-ticket step log"
```

---

## Task 12: Implement intake validator (Phase 1)

**Files:**
- Create: `.dev-flow/src/validators/intake.ts`
- Create: `.dev-flow/fixtures/01-INTAKE.good.md`
- Create: `.dev-flow/fixtures/01-INTAKE.needs-answer.md`
- Create: `.dev-flow/fixtures/01-INTAKE.missing-section.md`
- Test: `.dev-flow/__tests__/validators/intake.test.ts`

- [ ] **Step 1: Create fixtures**

`.dev-flow/fixtures/01-INTAKE.good.md`:

```markdown
# Intake — PROJ-123

## Understood requirements
- Login button must redirect to /dashboard on success
- Failed login must show inline error within 200ms
- Lockout triggers after 5 failed attempts in 60 seconds

## Open questions

(none)

## Affected areas
- apps/web/components/LoginForm.tsx
- apps/api/auth/auth.controller.ts
- e2e/login.spec.ts
```

`.dev-flow/fixtures/01-INTAKE.needs-answer.md`:

```markdown
# Intake — PROJ-123

## Understood requirements
- Login button must redirect somewhere on success [NEEDS-ANSWER: where exactly?]

## Open questions
- What is the lockout policy? [NEEDS-ANSWER]

## Affected areas
- apps/web/components/LoginForm.tsx
```

`.dev-flow/fixtures/01-INTAKE.missing-section.md`:

```markdown
# Intake — PROJ-123

## Understood requirements
- Login button must redirect

## Affected areas
- apps/web/components/LoginForm.tsx
```

- [ ] **Step 2: Write the failing test**

```ts
// .dev-flow/__tests__/validators/intake.test.ts
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { validateIntake } from '../../src/validators/intake.js';

const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/intake', () => {
  it('passes a well-formed intake', () => {
    const r = validateIntake(join(fixtures, '01-INTAKE.good.md'));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('fails when [NEEDS-ANSWER] markers remain', () => {
    const r = validateIntake(join(fixtures, '01-INTAKE.needs-answer.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /NEEDS-ANSWER/.test(e))).toBe(true);
  });

  it('fails when a required section is missing', () => {
    const r = validateIntake(join(fixtures, '01-INTAKE.missing-section.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Open questions/i.test(e))).toBe(true);
  });

  it('fails when file does not exist', () => {
    const r = validateIntake(join(fixtures, 'does-not-exist.md'));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/not found/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- validators/intake`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// .dev-flow/src/validators/intake.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

const REQUIRED_SECTIONS = ['Understood requirements', 'Open questions', 'Affected areas'];

export function validateIntake(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    const re = new RegExp(`^##\\s+${section}\\s*$`, 'mi');
    if (!re.test(text)) errors.push(`Missing section: ## ${section}`);
  }

  const needsAnswerMatches = text.match(/\[NEEDS-ANSWER[^\]]*\]/g);
  if (needsAnswerMatches && needsAnswerMatches.length > 0) {
    errors.push(`Unresolved [NEEDS-ANSWER] markers: ${needsAnswerMatches.length}`);
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx intake.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '01-INTAKE.md');
  const r = validateIntake(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- validators/intake`
Expected: PASS, 4 tests.

- [ ] **Step 6: Verify CLI invocation works**

Run: `cd .dev-flow && npx tsx src/validators/intake.ts NONEXISTENT 2>&1; echo "exit=$?"`
Expected: JSON with `ok:false`, `errors:["File not found: ..."]`, `exit=1`.

- [ ] **Step 7: Commit**

```bash
git add .dev-flow/src/validators/intake.ts .dev-flow/__tests__/validators/intake.test.ts .dev-flow/fixtures/01-INTAKE.*.md
git commit -m "feat: intake validator (sections + [NEEDS-ANSWER] check)"
```

---

## Task 13: Implement research validator (Phase 2)

**Files:**
- Create: `.dev-flow/src/validators/research.ts`
- Create: `.dev-flow/fixtures/02-RESEARCH.good.md`
- Create: `.dev-flow/fixtures/02-RESEARCH.no-paths.md`
- Test: `.dev-flow/__tests__/validators/research.test.ts`

- [ ] **Step 1: Create fixtures**

`.dev-flow/fixtures/02-RESEARCH.good.md`:

```markdown
# Research — PROJ-123

## Existing implementation
LoginForm at `apps/web/components/LoginForm.tsx` uses controlled inputs with React Hook Form.

## Patterns to follow
- Form validation: `apps/web/components/SignupForm.tsx` (Zod resolver pattern)
- Inline error rendering: `apps/web/components/forms/FieldError.tsx`
- Auth state: `apps/api/auth/auth.service.ts`

## Integration points
- Backend endpoint: `apps/api/auth/auth.controller.ts` POST /auth/login
- Lockout state: `apps/api/auth/lockout.service.ts`
```

`.dev-flow/fixtures/02-RESEARCH.no-paths.md`:

```markdown
# Research — PROJ-123

## Existing implementation
The login uses some form library.

## Patterns to follow
- Forms generally use validation
- Errors are shown inline somewhere
```

- [ ] **Step 2: Write the failing test**

```ts
// .dev-flow/__tests__/validators/research.test.ts
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { validateResearch } from '../../src/validators/research.js';

const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/research', () => {
  it('passes when patterns section cites real-looking paths', () => {
    const r = validateResearch(join(fixtures, '02-RESEARCH.good.md'));
    expect(r.ok).toBe(true);
  });

  it('fails when ## Patterns to follow is missing', () => {
    const r = validateResearch(join(fixtures, '02-RESEARCH.missing.md'));
    expect(r.ok).toBe(false);
  });

  it('fails when patterns section has no file paths', () => {
    const r = validateResearch(join(fixtures, '02-RESEARCH.no-paths.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /file path/i.test(e))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- validators/research`
Expected: FAIL — module not found AND a fixture missing.

- [ ] **Step 4: Implement (and add the missing fixture)**

```ts
// .dev-flow/src/validators/research.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

const PATH_RE = /`[^`\s]+\.[a-zA-Z0-9]+`|`[^`\s]+\/[^`\s]+`/g;

export function validateResearch(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  if (!/^##\s+Patterns to follow\s*$/mi.test(text)) {
    errors.push('Missing section: ## Patterns to follow');
  }

  const patternsBlock = text.split(/^##\s+Patterns to follow\s*$/mi)[1] ?? '';
  const matches = patternsBlock.match(PATH_RE);
  if (!matches || matches.length === 0) {
    errors.push('Patterns section must cite at least one file path (e.g. `apps/web/foo.ts`)');
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx research.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '02-RESEARCH.md');
  const r = validateResearch(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
```

Also create the missing fixture `.dev-flow/fixtures/02-RESEARCH.missing.md`:

```markdown
# Research — PROJ-123

## Existing implementation
Stuff exists.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- validators/research`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add .dev-flow/src/validators/research.ts .dev-flow/__tests__/validators/research.test.ts .dev-flow/fixtures/02-RESEARCH.*.md
git commit -m "feat: research validator (patterns section must cite real file paths)"
```

---

## Task 14: Implement plan validator (Phase 3)

**Files:**
- Create: `.dev-flow/src/validators/plan.ts`
- Create: `.dev-flow/fixtures/03-PLAN.good.md`
- Create: `.dev-flow/fixtures/03-PLAN.no-criteria.md`
- Create: `.dev-flow/fixtures/03-PLAN.no-test-plan.md`
- Test: `.dev-flow/__tests__/validators/plan.test.ts`

- [ ] **Step 1: Create fixtures**

`.dev-flow/fixtures/03-PLAN.good.md`:

```markdown
# Plan — PROJ-123

## Tasks

### Task 1: LoginForm — wire up inline error display
**Acceptance criteria:** failed login shows inline error within 200ms; passes existing form validation tests.
**Files:** apps/web/components/LoginForm.tsx, apps/web/components/forms/FieldError.tsx

### Task 2: AuthController — return 401 with code on bad credentials
**Acceptance criteria:** POST /auth/login with wrong password returns 401 + body { code: "INVALID_CREDENTIALS" }.
**Files:** apps/api/auth/auth.controller.ts

## Test plan

### Unit
- LoginForm.test.tsx: renders inline error on submit-failure
- auth.controller.spec.ts: returns 401 on bad credentials

### Integration
- N/A

### E2E
- e2e/login.spec.ts: login fails → sees error within 200ms; lockout after 5 attempts
```

`.dev-flow/fixtures/03-PLAN.no-criteria.md`:

```markdown
# Plan — PROJ-123

## Tasks

### Task 1: LoginForm — wire up inline error display
**Files:** apps/web/components/LoginForm.tsx

## Test plan

### Unit
- something
```

`.dev-flow/fixtures/03-PLAN.no-test-plan.md`:

```markdown
# Plan — PROJ-123

## Tasks

### Task 1: LoginForm — wire up inline error display
**Acceptance criteria:** failed login shows inline error.
**Files:** apps/web/components/LoginForm.tsx
```

- [ ] **Step 2: Write the failing test**

```ts
// .dev-flow/__tests__/validators/plan.test.ts
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { validatePlan } from '../../src/validators/plan.js';

const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/plan', () => {
  it('passes a complete plan', () => {
    expect(validatePlan(join(fixtures, '03-PLAN.good.md')).ok).toBe(true);
  });

  it('fails when a task lacks acceptance criteria', () => {
    const r = validatePlan(join(fixtures, '03-PLAN.no-criteria.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /acceptance criteria/i.test(e))).toBe(true);
  });

  it('fails when ## Test plan is missing', () => {
    const r = validatePlan(join(fixtures, '03-PLAN.no-test-plan.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /test plan/i.test(e))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- validators/plan`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// .dev-flow/src/validators/plan.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

export function validatePlan(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  if (!/^##\s+Test plan\s*$/mi.test(text)) {
    errors.push('Missing section: ## Test plan');
  }

  const taskHeadings = [...text.matchAll(/^###\s+Task\s+\d+:.*$/gm)];
  if (taskHeadings.length === 0) {
    errors.push('Plan must define at least one ### Task N: ... heading');
  }

  for (const m of taskHeadings) {
    const after = text.slice(m.index! + m[0].length);
    const nextHeading = after.search(/^(##\s+|###\s+)/m);
    const block = nextHeading === -1 ? after : after.slice(0, nextHeading);
    if (!/\*\*Acceptance criteria:\*\*/i.test(block)) {
      errors.push(`Task is missing **Acceptance criteria:** — ${m[0]}`);
    }
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx plan.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '03-PLAN.md');
  const r = validatePlan(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- validators/plan`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add .dev-flow/src/validators/plan.ts .dev-flow/__tests__/validators/plan.test.ts .dev-flow/fixtures/03-PLAN.*.md
git commit -m "feat: plan validator (tasks must have acceptance criteria + test plan)"
```

---

## Task 15: Implement implementation validator (Phase 4)

**Files:**
- Create: `.dev-flow/src/validators/implementation.ts`
- Test: `.dev-flow/__tests__/validators/implementation.test.ts`

This validator differs from the others — it inspects git log + lint/typecheck exit codes rather than just parsing a markdown file.

- [ ] **Step 1: Write the failing test**

```ts
// .dev-flow/__tests__/validators/implementation.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { validateImplementation } from '../../src/validators/implementation.js';

let repo: string;

beforeEach(async () => {
  repo = mkdtempSync(join(tmpdir(), 'devflow-impl-'));
  const git = simpleGit(repo);
  await git.init();
  await git.addConfig('user.email', 't@t.com');
  await git.addConfig('user.name', 'Test');
  writeFileSync(join(repo, 'README.md'), '# r\n');
  await git.add('.');
  await git.commit('initial');
  await git.checkoutLocalBranch('develop');
  await git.checkoutLocalBranch('feature/PROJ-1-x');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('validators/implementation', () => {
  it('fails when no commits with Plan-Task trailers exist beyond base', async () => {
    const r = await validateImplementation({
      cwd: repo,
      base: 'develop',
      planTaskIds: ['1', '2'],
      lintCmd: 'true',
      typecheckCmd: 'true',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Plan-Task/.test(e))).toBe(true);
  });

  it('passes when each plan task has a matching trailer', async () => {
    const git = simpleGit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    await git.add('a.txt');
    await git.commit('feat: PROJ-1 do A\n\nPlan-Task: 1');
    writeFileSync(join(repo, 'b.txt'), 'b');
    await git.add('b.txt');
    await git.commit('feat: PROJ-1 do B\n\nPlan-Task: 2');

    const r = await validateImplementation({
      cwd: repo, base: 'develop',
      planTaskIds: ['1', '2'], lintCmd: 'true', typecheckCmd: 'true',
    });
    expect(r.ok).toBe(true);
  });

  it('fails if lintCmd exits non-zero', async () => {
    const git = simpleGit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    await git.add('a.txt');
    await git.commit('feat: PROJ-1 do A\n\nPlan-Task: 1');
    const r = await validateImplementation({
      cwd: repo, base: 'develop',
      planTaskIds: ['1'], lintCmd: 'false', typecheckCmd: 'true',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /lint/i.test(e))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- validators/implementation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// .dev-flow/src/validators/implementation.ts
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

export interface ImplArgs {
  cwd: string;
  base: string;
  planTaskIds: string[];
  lintCmd: string;
  typecheckCmd: string;
}

export async function validateImplementation(args: ImplArgs): Promise<ValidatorResult> {
  const errors: string[] = [];
  const git = simpleGit({ baseDir: args.cwd });
  const log = await git.log({ from: args.base, to: 'HEAD' });
  const commitMessages = log.all.map((c) => `${c.message}\n${c.body ?? ''}`);

  for (const id of args.planTaskIds) {
    const re = new RegExp(`Plan-Task:\\s*${id}\\b`, 'm');
    const matched = commitMessages.some((m) => re.test(m));
    if (!matched) errors.push(`No commit found with trailer Plan-Task: ${id}`);
  }

  try {
    execSync(args.lintCmd, { cwd: args.cwd, stdio: 'pipe' });
  } catch {
    errors.push(`lint command failed: ${args.lintCmd}`);
  }
  try {
    execSync(args.typecheckCmd, { cwd: args.cwd, stdio: 'pipe' });
  } catch {
    errors.push(`typecheck command failed: ${args.typecheckCmd}`);
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx implementation.ts <TICKET>'); process.exit(2); }
  const dir = ticketDir(process.cwd(), ticket);
  const planPath = join(dir, '03-PLAN.md');
  if (!existsSync(planPath)) { console.error('03-PLAN.md missing'); process.exit(2); }
  const planText = readFileSync(planPath, 'utf8');
  const ids = [...planText.matchAll(/^###\s+Task\s+(\d+):/gm)].map((m) => m[1]!);
  // Read commands from config — simplified inline; in real use, read .dev-flow/config.yaml
  const lintCmd = process.env.LINT_CMD ?? 'pnpm lint';
  const typecheckCmd = process.env.TYPECHECK_CMD ?? 'pnpm typecheck';
  const base = process.env.BASE_BRANCH ?? 'develop';
  validateImplementation({ cwd: process.cwd(), base, planTaskIds: ids, lintCmd, typecheckCmd })
    .then((r) => { console.log(JSON.stringify(r)); process.exit(r.ok ? 0 : 1); });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- validators/implementation`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add .dev-flow/src/validators/implementation.ts .dev-flow/__tests__/validators/implementation.test.ts
git commit -m "feat: implementation validator (Plan-Task trailers + lint + typecheck)"
```

---

## Task 16: Implement test-evidence validator (Phase 5)

**Files:**
- Create: `.dev-flow/src/validators/test.ts`
- Create: `.dev-flow/fixtures/05-TEST-EVIDENCE.good.md`
- Create: `.dev-flow/fixtures/05-TEST-EVIDENCE.fail.md`
- Test: `.dev-flow/__tests__/validators/test.test.ts`

- [ ] **Step 1: Create fixtures**

`.dev-flow/fixtures/05-TEST-EVIDENCE.good.md`:

```markdown
# Test Evidence — PROJ-123

## Unit
### Result: PASS
\`\`\`
$ pnpm test
... 142 passed ...
\`\`\`

## Integration
### Result: PASS
\`\`\`
$ pnpm test:integration
... 18 passed ...
\`\`\`

## E2E
### Result: PASS
\`\`\`
$ pnpm test:e2e
... 24 passed ...
\`\`\`
Trace: evidence/2026-05-15T14-23-00/trace.zip
Screenshot: evidence/2026-05-15T14-23-00/login-success.png
```

`.dev-flow/fixtures/05-TEST-EVIDENCE.fail.md`:

```markdown
# Test Evidence — PROJ-123

## Unit
### Result: FAIL
\`\`\`
$ pnpm test
... 1 failed ...
\`\`\`

## E2E
### Result: PASS
\`\`\`
$ pnpm test:e2e
... 24 passed ...
\`\`\`
Trace: evidence/2026-05-15/trace.zip
```

- [ ] **Step 2: Write the failing test**

```ts
// .dev-flow/__tests__/validators/test.test.ts
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { validateTestEvidence } from '../../src/validators/test.js';

const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/test (test-evidence)', () => {
  it('passes when every layer has Result: PASS and a raw block (e2e has trace path)', () => {
    const r = validateTestEvidence(join(fixtures, '05-TEST-EVIDENCE.good.md'));
    expect(r.ok).toBe(true);
  });

  it('fails when any layer is FAIL', () => {
    const r = validateTestEvidence(join(fixtures, '05-TEST-EVIDENCE.fail.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /unit.*FAIL/i.test(e))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- validators/test`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// .dev-flow/src/validators/test.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

const REQUIRED_LAYERS = ['Unit', 'E2E'];
const OPTIONAL_LAYERS = ['Integration'];

export function validateTestEvidence(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  for (const layer of REQUIRED_LAYERS) {
    const layerRe = new RegExp(`^##\\s+${layer}\\s*$`, 'mi');
    if (!layerRe.test(text)) {
      errors.push(`Missing required layer section: ## ${layer}`);
      continue;
    }
    const block = sectionBlock(text, layer);
    if (/^###\s+Result:\s*FAIL/mi.test(block)) {
      errors.push(`${layer} Result is FAIL`);
    } else if (!/^###\s+Result:\s*PASS/mi.test(block)) {
      errors.push(`${layer} missing Result: PASS marker`);
    }
    if (!/```[\s\S]*?```/m.test(block)) {
      errors.push(`${layer} missing raw output code block`);
    }
    if (layer === 'E2E') {
      if (!/evidence\/[\w\-/.]+/.test(block)) {
        errors.push(`E2E missing evidence/ artifact reference (trace or screenshot)`);
      }
    }
  }

  for (const layer of OPTIONAL_LAYERS) {
    const layerRe = new RegExp(`^##\\s+${layer}\\s*$`, 'mi');
    if (!layerRe.test(text)) continue;
    const block = sectionBlock(text, layer);
    if (/^###\s+Result:\s*FAIL/mi.test(block)) errors.push(`${layer} Result is FAIL`);
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

function sectionBlock(text: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'mi');
  const m = text.match(re);
  if (!m) return '';
  const after = text.slice(m.index! + m[0].length);
  const next = after.search(/^##\s+/m);
  return next === -1 ? after : after.slice(0, next);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx test.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '05-TEST-EVIDENCE.md');
  const r = validateTestEvidence(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- validators/test`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add .dev-flow/src/validators/test.ts .dev-flow/__tests__/validators/test.test.ts .dev-flow/fixtures/05-TEST-EVIDENCE.*.md
git commit -m "feat: test-evidence validator (per-layer PASS marker + e2e artifact path)"
```

---

## Task 17: Implement verify validator (Phase 6)

**Files:**
- Create: `.dev-flow/src/validators/verify.ts`
- Create: `.dev-flow/fixtures/06-VERIFICATION.good.md`
- Create: `.dev-flow/fixtures/06-VERIFICATION.unclear.md`
- Test: `.dev-flow/__tests__/validators/verify.test.ts`

- [ ] **Step 1: Create fixtures**

`.dev-flow/fixtures/06-VERIFICATION.good.md`:

```markdown
# Verification — PROJ-123

| # | Acceptance criterion | Verdict | Evidence |
|---|----------------------|---------|----------|
| 1 | Login button must redirect to /dashboard on success | PASS | e2e/login.spec.ts:42 |
| 2 | Failed login must show inline error within 200ms | PASS | LoginForm.test.tsx:18; e2e/login.spec.ts:67 |
| 3 | Lockout triggers after 5 failed attempts in 60 seconds | PASS | lockout.service.spec.ts:24; e2e/login.spec.ts:91 |
```

`.dev-flow/fixtures/06-VERIFICATION.unclear.md`:

```markdown
# Verification — PROJ-123

| # | Acceptance criterion | Verdict | Evidence |
|---|----------------------|---------|----------|
| 1 | Login button must redirect to /dashboard on success | PASS | e2e/login.spec.ts:42 |
| 2 | Failed login must show inline error within 200ms | UNCLEAR | could not find timing assertion |
```

- [ ] **Step 2: Write the failing test**

```ts
// .dev-flow/__tests__/validators/verify.test.ts
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { validateVerify } from '../../src/validators/verify.js';

const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/verify', () => {
  it('passes when all rows are PASS', () => {
    const r = validateVerify(join(fixtures, '06-VERIFICATION.good.md'));
    expect(r.ok).toBe(true);
  });

  it('fails when any row is UNCLEAR or FAIL', () => {
    const r = validateVerify(join(fixtures, '06-VERIFICATION.unclear.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /UNCLEAR/.test(e))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- validators/verify`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// .dev-flow/src/validators/verify.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

export function validateVerify(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  const rows = [...text.matchAll(/^\|\s*\d+\s*\|.*?\|\s*(PASS|FAIL|UNCLEAR)\s*\|.*?\|/gm)];
  if (rows.length === 0) {
    errors.push('No verification table rows found (expected | N | criterion | PASS/FAIL/UNCLEAR | evidence |)');
  }
  for (const row of rows) {
    const verdict = row[1];
    if (verdict !== 'PASS') errors.push(`Row has non-PASS verdict (${verdict}): ${row[0].slice(0, 80)}...`);
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx verify.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '06-VERIFICATION.md');
  const r = validateVerify(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- validators/verify`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add .dev-flow/src/validators/verify.ts .dev-flow/__tests__/validators/verify.test.ts .dev-flow/fixtures/06-VERIFICATION.*.md
git commit -m "feat: verify validator (judge-gate table — every row must be PASS)"
```

---

## Task 18: Implement security validator (Phase 7)

**Files:**
- Create: `.dev-flow/src/validators/security.ts`
- Create: `.dev-flow/fixtures/07-SECURITY.good.md`
- Create: `.dev-flow/fixtures/07-SECURITY.open.md`
- Create: `.dev-flow/fixtures/07-SECURITY.waived-no-reason.md`
- Test: `.dev-flow/__tests__/validators/security.test.ts`

- [ ] **Step 1: Create fixtures**

`.dev-flow/fixtures/07-SECURITY.good.md`:

```markdown
# Security — PROJ-123

## Dependency findings
| Severity | Package | Status | Reason |
|----------|---------|--------|--------|
| moderate | lodash@4.17.20 | resolved | upgraded to 4.17.21 |

## Static analysis findings
(none)

## Manual diff review
(none)
```

`.dev-flow/fixtures/07-SECURITY.open.md`:

```markdown
# Security — PROJ-123

## Dependency findings
| Severity | Package | Status | Reason |
|----------|---------|--------|--------|
| critical | xss-lib@1.0.0 | open |  |

## Static analysis findings
(none)

## Manual diff review
(none)
```

`.dev-flow/fixtures/07-SECURITY.waived-no-reason.md`:

```markdown
# Security — PROJ-123

## Dependency findings
| Severity | Package | Status | Reason |
|----------|---------|--------|--------|
| high | foo@1.0.0 | waived |  |

## Static analysis findings
(none)

## Manual diff review
(none)
```

- [ ] **Step 2: Write the failing test**

```ts
// .dev-flow/__tests__/validators/security.test.ts
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { validateSecurity } from '../../src/validators/security.js';

const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/security', () => {
  it('passes when no open high/critical findings remain and waivers have reasons', () => {
    expect(validateSecurity(join(fixtures, '07-SECURITY.good.md')).ok).toBe(true);
  });

  it('fails when any high/critical finding is open', () => {
    const r = validateSecurity(join(fixtures, '07-SECURITY.open.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /open.*critical/i.test(e))).toBe(true);
  });

  it('fails when a waiver has no reason', () => {
    const r = validateSecurity(join(fixtures, '07-SECURITY.waived-no-reason.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /reason/i.test(e))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- validators/security`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// .dev-flow/src/validators/security.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

interface Row { severity: string; subject: string; status: string; reason: string; }

const ROW_RE = /^\|\s*(\w+)\s*\|\s*([^|]+?)\s*\|\s*(\w+)\s*\|\s*([^|]*?)\s*\|/gm;

export function validateSecurity(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  const rows: Row[] = [...text.matchAll(ROW_RE)]
    .map((m) => ({ severity: m[1]!.toLowerCase(), subject: m[2]!, status: m[3]!.toLowerCase(), reason: (m[4] ?? '').trim() }))
    .filter((r) => ['low', 'moderate', 'high', 'critical'].includes(r.severity));

  for (const r of rows) {
    if ((r.severity === 'high' || r.severity === 'critical') && r.status === 'open') {
      errors.push(`Open ${r.severity} finding: ${r.subject}`);
    }
    if (r.status === 'waived' && r.reason === '') {
      errors.push(`Waived finding has no reason: ${r.subject}`);
    }
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx security.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '07-SECURITY.md');
  const r = validateSecurity(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- validators/security`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add .dev-flow/src/validators/security.ts .dev-flow/__tests__/validators/security.test.ts .dev-flow/fixtures/07-SECURITY.*.md
git commit -m "feat: security validator (no open high/critical, waivers need reasons)"
```

---

## Task 19: Implement PR validator (Phase 8)

**Files:**
- Create: `.dev-flow/src/validators/pr.ts`
- Create: `.dev-flow/fixtures/08-PR.good.md`
- Create: `.dev-flow/fixtures/08-PR.no-url.md`
- Test: `.dev-flow/__tests__/validators/pr.test.ts`

- [ ] **Step 1: Create fixtures**

`.dev-flow/fixtures/08-PR.good.md`:

```markdown
# PR — PROJ-123

**URL:** https://bitbucket.org/handyman-team/handyman/pull-requests/4421
**Jira transition:** In Progress → In Review (succeeded)
**Opened at:** 2026-05-15T14:30:00.000Z

## Summary
Wired up inline error display on the login form, added 401 response code, and lockout after 5 failed attempts.
```

`.dev-flow/fixtures/08-PR.no-url.md`:

```markdown
# PR — PROJ-123

**Jira transition:** In Progress → In Review (succeeded)
```

- [ ] **Step 2: Write the failing test**

```ts
// .dev-flow/__tests__/validators/pr.test.ts
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { validatePR } from '../../src/validators/pr.js';

const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/pr', () => {
  it('passes with URL + transition succeeded', () => {
    expect(validatePR(join(fixtures, '08-PR.good.md')).ok).toBe(true);
  });

  it('fails when PR URL is missing', () => {
    const r = validatePR(join(fixtures, '08-PR.no-url.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /URL/i.test(e))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd .dev-flow && npm test -- validators/pr`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// .dev-flow/src/validators/pr.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

const URL_RE = /\*\*URL:\*\*\s+(https?:\/\/\S+)/i;
const TRANSITION_RE = /\*\*Jira transition:\*\*[^\n]*succeeded/i;

export function validatePR(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  if (!URL_RE.test(text)) errors.push('Missing **URL:** <pr-url> line');
  if (!TRANSITION_RE.test(text)) errors.push('Missing or unsuccessful **Jira transition:** line');

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx pr.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '08-PR.md');
  const r = validatePR(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .dev-flow && npm test -- validators/pr`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add .dev-flow/src/validators/pr.ts .dev-flow/__tests__/validators/pr.test.ts .dev-flow/fixtures/08-PR.*.md
git commit -m "feat: pr validator (URL present + Jira transition succeeded)"
```

---

## Task 20: Slash command — `/task:start` (Phase 1 — Intake)

**Files:**
- Create: `.claude/commands/task/start.md`

This is the most complex slash command — it establishes the patterns the others will follow.

- [ ] **Step 1: Create `.claude/commands/task/start.md`**

```markdown
---
description: "Phase 1 — Intake. Fetch Jira ticket, draft requirements, surface open questions, create feature branch."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, mcp__atlassian__*
argument-hint: "<TICKET>"
---

# /task:start — Phase 1 (Intake)

You are running Phase 1 of the dev cycle for ticket **$1**.

If you are unsure about the overall flow, read `.dev-flow/PROCESS.md`.

## Precondition checks (HARD — abort if any fail)

1. **Working tree must be clean.** Run `git status --porcelain`. If output is non-empty, ABORT and tell the user: "Working tree is not clean — commit or stash before starting a new ticket."
2. **Ticket folder must not yet exist.** Run `test -d tickets/$1 && echo EXISTS || echo NEW`. If `EXISTS`, also check `cat tickets/$1/state.json | jq -r .phase`. If `phase` is anything other than `init` or `intake-drafted`, ABORT and instruct the user: "Ticket already in progress at phase X — use /task:status."

## Actions

### 1. Fetch the Jira ticket

Use the Atlassian MCP tool `getJiraIssue` with key=`$1`. Capture:
- Title
- Description
- Acceptance criteria (often in the description or a custom field)
- Labels
- Status
- Comments

### 2. Compute branch name

- Slug = lowercase kebab of the Jira title, max 60 chars (use `cd .dev-flow && npx tsx -e "import {slugify} from './src/utils/slug.js'; console.log(slugify(process.argv[1]))" "<title>"`).
- Branch = `feature/$1-<slug>`.

### 3. Create feature branch

Read `.dev-flow/config.yaml` for `provider.default_base` (typically `develop`).

Run:
```
git fetch origin
git checkout -b feature/$1-<slug> origin/<default_base>
```

### 4. Build a lightweight codebase map

- `find apps services -maxdepth 3 -type d -not -path '*/node_modules/*' | head -40`
- `git log --since=30.days --pretty=format:'%h %s' | head -20`
- For each keyword in the ticket title, `grep -l -r --include='*.ts' --include='*.tsx' "<keyword>" apps services | head -10`

### 5. Spawn an intake subagent

Use the Agent tool with subagent_type=general-purpose. Provide the agent with:
- The Jira ticket text
- The codebase map (paths + recent commits + keyword hits)
- The team's `AGENTS.md`

Ask the subagent to produce three sections:

```
## Understood requirements
- bullet 1 (testable: contains a verb + measurable outcome)
- bullet 2
...

## Open questions
- [NEEDS-ANSWER] question 1
- [NEEDS-ANSWER] question 2
(or "(none)" if intake is genuinely unambiguous)

## Affected areas
- exact/file/path.tsx — reasoning
- exact/file/path.ts — reasoning
```

### 6. Write the artifact

Write `tickets/$1/01-INTAKE.md`:

```markdown
# Intake — $1

<intake subagent output>
```

### 7. Write initial state.json

Write `tickets/$1/state.json`:

```json
{
  "ticket": "$1",
  "branch": "feature/$1-<slug>",
  "phase": "intake-drafted",
  "updated_at": "<now ISO>",
  "last_error": null
}
```

### 8. Append to journal

Run: `cd .dev-flow && npx tsx -e "import {append} from './src/journal.js'; append('..', '$1', { phase: 'intake', step: 'draft', status: 'ok' })"`

### 9. Commit atomically

```
git add tickets/$1/
git commit -m "intake: $1 draft requirements + open questions"
```

### 10. Run the validator

Run: `cd .dev-flow && npx tsx src/validators/intake.ts $1`

If exit code 0:
- Update `state.json` to `"phase": "intake-complete"`.
- Commit: `git add tickets/$1/state.json && git commit -m "intake: $1 requirements signed off"`.
- Tell the user: "Phase 1 complete. Next: /task:research."

If exit code != 0:
- Tell the user: "Phase 1 artifact draft saved BUT validator failed: <stderr>. Resolve the issues (typically: answer the [NEEDS-ANSWER] markers in tickets/$1/01-INTAKE.md), then re-run /task:start $1."

## Tips for the user

- To answer [NEEDS-ANSWER] markers: edit the file in place, replacing the marker with the answer.
- To post questions to Jira instead: ask me to use `addCommentToJiraIssue` with the questions, then paste the PM's reply back.
- Re-run `/task:start $1` is safe — it's idempotent once the ticket folder exists.
```

- [ ] **Step 2: Sanity check the file**

Run: `head -5 .claude/commands/task/start.md`
Expected: shows YAML frontmatter with `description:`, `allowed-tools:`, `argument-hint:`.

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/task/start.md
git commit -m "feat: /task:start slash command (Phase 1 — Intake)"
```

---

## Task 21: Slash command — `/task:research` (Phase 2)

**Files:**
- Create: `.claude/commands/task/research.md`

- [ ] **Step 1: Create `.claude/commands/task/research.md`**

```markdown
---
description: "Phase 2 — Research the codebase against the intake's affected areas. Document patterns to follow."
allowed-tools: Bash, Read, Glob, Grep, Write, Edit, Agent
---

# /task:research — Phase 2

Determine ticket from current branch: `git branch --show-current` → extract `<TICKET>` from `feature/<TICKET>-...`. Refer to it as `$TICKET` below.

## Precondition checks (HARD)

1. `git status --porcelain` → must be empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` → must be `intake-complete`. Otherwise ABORT with the next-expected hint.
3. `cd .dev-flow && npx tsx src/validators/intake.ts $TICKET` → exit code must be 0. Otherwise ABORT with stderr.

## Actions

### 1. Read the intake

Read `tickets/$TICKET/01-INTAKE.md`. Extract the **Affected areas** list.

### 2. Spawn a research subagent

Use the Agent tool. Provide the subagent with:
- `01-INTAKE.md` content
- A read of each "Affected area" file (use Glob/Read)
- The repo's AGENTS.md
- Output of: `find apps services -name 'package.json' | xargs grep -l <keywords>` (for similar features)

Ask the subagent to produce:

```
## Existing implementation
<what's already there relevant to this ticket>

## Patterns to follow
- `path/to/example.ts` — pattern description (Zod resolver, error boundary, etc.)
- `path/to/another.ts` — pattern description

## Integration points
- Backend endpoint: `path` METHOD /url
- State store: `path`
- Test fixtures: `path`
```

The patterns section MUST cite real file paths in backticks. The validator enforces this.

### 3. Write the artifact

Write `tickets/$TICKET/02-RESEARCH.md`:

```markdown
# Research — $TICKET

<research subagent output>
```

### 4. Append journal + commit

```
cd .dev-flow && npx tsx -e "import {append} from './src/journal.js'; append('..', '$TICKET', { phase: 'research', step: 'analyze', status: 'ok' })"
cd ..
git add tickets/$TICKET/02-RESEARCH.md tickets/$TICKET/.journal.jsonl
git commit -m "research: $TICKET codebase analysis"
```

### 5. Run validator

`cd .dev-flow && npx tsx src/validators/research.ts $TICKET`

If exit code 0:
- Advance state: `cd .dev-flow && npx tsx -e "import {advancePhase} from './src/state.js'; advancePhase('..', '$TICKET', 'research-complete')"`
- Commit state: `git add tickets/$TICKET/state.json && git commit -m "research: $TICKET signed off"`
- Tell user: "Phase 2 complete. Next: /task:plan."

If exit code != 0:
- Tell user the validator output. Common fix: cite real file paths in `## Patterns to follow`.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/task/research.md
git commit -m "feat: /task:research slash command (Phase 2)"
```

---

## Task 22: Slash command — `/task:plan` (Phase 3)

**Files:**
- Create: `.claude/commands/task/plan.md`

- [ ] **Step 1: Create `.claude/commands/task/plan.md`**

```markdown
---
description: "Phase 3 — Produce ordered task list with acceptance criteria + test plan."
allowed-tools: Bash, Read, Glob, Grep, Write, Edit, Agent
---

# /task:plan — Phase 3

Determine ticket from current branch: `git branch --show-current` → extract `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` == `research-complete`.
3. `cd .dev-flow && npx tsx src/validators/research.ts $TICKET` exit 0.

## Actions

### 1. Spawn a planning subagent

Use the Agent tool. Provide the subagent with:
- `01-INTAKE.md`
- `02-RESEARCH.md`
- AGENTS.md

Ask the subagent to produce a plan in the following exact format:

````
## Tasks

### Task 1: <component or area> — <one-line goal>
**Acceptance criteria:** <one sentence; measurable; how we'll know this task is done>
**Files:** <comma-separated paths to be touched>

### Task 2: ...
**Acceptance criteria:** ...
**Files:** ...

(... as many tasks as needed, kept small/focused)

## Test plan

### Unit
- <test file or test name>: <what it asserts>

### Integration
- <test file or test name>: <what it asserts>
- (or "N/A" if not applicable)

### E2E
- <playwright spec>: <user journey assertion>

## Rollback note
<one-paragraph rollback strategy if this PR ships and breaks production>
````

### 2. Write the artifact + commit

```
write tickets/$TICKET/03-PLAN.md
cd .dev-flow && npx tsx -e "import {append} from './src/journal.js'; append('..', '$TICKET', { phase: 'plan', step: 'draft', status: 'ok' })"
cd ..
git add tickets/$TICKET/03-PLAN.md tickets/$TICKET/.journal.jsonl
git commit -m "plan: $TICKET implementation plan"
```

### 3. Run validator

`cd .dev-flow && npx tsx src/validators/plan.ts $TICKET`

If exit 0:
- Advance state to `plan-complete`.
- Commit state.json.
- Tell user: "Phase 3 complete. Next: /task:implement."

If exit != 0:
- Tell user the issues. Common: missing `**Acceptance criteria:**` per task, or missing `## Test plan`.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/task/plan.md
git commit -m "feat: /task:plan slash command (Phase 3)"
```

---

## Task 23: Slash command — `/task:implement` (Phase 4)

**Files:**
- Create: `.claude/commands/task/implement.md`

- [ ] **Step 1: Create `.claude/commands/task/implement.md`**

```markdown
---
description: "Phase 4 — Execute plan tasks with atomic per-task commits + lint/typecheck after each."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# /task:implement — Phase 4

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` ∈ {`plan-complete`, `implementation-in-progress`}. (Resumable mid-flow; the second value is set by this command itself when paused.)
3. `cd .dev-flow && npx tsx src/validators/plan.ts $TICKET` exit 0.

## Actions

### 1. Read the plan

Parse `tickets/$TICKET/03-PLAN.md` to extract task IDs and titles. Look at `tickets/$TICKET/04-IMPLEMENTATION.md` if it exists — skip already-completed tasks.

### 2. Execute each remaining task in order

For each task:

a. Mark "started" in journal:
```
cd .dev-flow && npx tsx -e "import {append} from './src/journal.js'; append('..', '$TICKET', { phase: 'implement', step: 'task-N-start', status: 'ok', details: '<task title>' })"
cd ..
```

b. Make the code changes (use Edit/Write tools, follow patterns from `02-RESEARCH.md`).

c. Run lint + typecheck (commands from `.dev-flow/config.yaml.stack.test_commands`):
```
pnpm lint
pnpm typecheck
```

If either fails:
- Append a deviation note to `tickets/$TICKET/04-IMPLEMENTATION.md` (create if missing).
- Update state to `implementation-in-progress` with `last_error` set.
- Commit any partial work: `git add -A && git commit -m "implement: $TICKET WIP — <task> (lint/typecheck failed)"`
- Tell the user: "Implementation paused — fix the lint/typecheck issue and re-run /task:implement."
- EXIT.

d. Atomic commit:
```
git add <files-touched-by-this-task>
git commit -m "feat: $TICKET <task title>" -m "Plan-Task: <task-id>"
```

e. Mark "done" in journal.

### 3. After all tasks done — write 04-IMPLEMENTATION.md

```markdown
# Implementation log — $TICKET

## Commits (chronological)
- <sha7> feat: $TICKET <task 1 title>
- <sha7> feat: $TICKET <task 2 title>
...

## Deviations
(none) | <list deviations from plan with reasoning>
```

Atomic commit:
```
git add tickets/$TICKET/04-IMPLEMENTATION.md tickets/$TICKET/.journal.jsonl
git commit -m "implement: $TICKET task log"
```

### 4. Run validator

```
cd .dev-flow && \
  PLAN_TASK_IDS="$(grep -oP '^### Task \K\d+' ../tickets/$TICKET/03-PLAN.md | tr '\n' ',')" \
  LINT_CMD="pnpm lint" TYPECHECK_CMD="pnpm typecheck" BASE_BRANCH="develop" \
  npx tsx src/validators/implementation.ts $TICKET
```

If exit 0:
- Advance state to `implementation-complete`.
- Commit state.json.
- Tell user: "Phase 4 complete. Next: /task:test."

If exit != 0:
- Surface validator output. Most common: a plan task has no commit with the matching `Plan-Task:` trailer.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/task/implement.md
git commit -m "feat: /task:implement slash command (Phase 4)"
```

---

## Task 24: Slash command — `/task:test` (Phase 5)

**Files:**
- Create: `.claude/commands/task/test.md`

- [ ] **Step 1: Create `.claude/commands/task/test.md`**

```markdown
---
description: "Phase 5 — Run unit/integration/e2e, capture evidence bundle (Playwright traces, screenshots)."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /task:test — Phase 5

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` == `implementation-complete`.
3. `cd .dev-flow && npx tsx src/validators/implementation.ts $TICKET` exit 0.

## Actions

### 1. Detect changed areas

```
git diff --name-only develop...HEAD | sort -u
```

Map each path to an area in `.dev-flow/config.yaml.stack.areas`. If any path falls under multiple areas, OR if the diff crosses a service boundary, mark "cross-boundary" — this forces the full e2e suite.

### 2. Create evidence directory

```
mkdir -p tickets/$TICKET/evidence/$(date -u +%Y-%m-%dT%H-%M-%S)
EVIDENCE_DIR=tickets/$TICKET/evidence/$(ls -1 tickets/$TICKET/evidence | tail -1)
```

### 3. Run unit tests

```
pnpm test 2>&1 | tee $EVIDENCE_DIR/unit.log
UNIT_EXIT=${PIPESTATUS[0]}
```

### 4. Run integration tests (if affected)

If any backend area changed:
```
pnpm test:integration 2>&1 | tee $EVIDENCE_DIR/integration.log
INT_EXIT=${PIPESTATUS[0]}
```

### 5. Run e2e tests

For e2e, configure Playwright to write traces + screenshots into `$EVIDENCE_DIR`:
```
PLAYWRIGHT_TRACES_DIR=$EVIDENCE_DIR pnpm test:e2e --trace on --screenshot only-on-failure 2>&1 | tee $EVIDENCE_DIR/e2e.log
E2E_EXIT=${PIPESTATUS[0]}
mv test-results/* $EVIDENCE_DIR/ 2>/dev/null || true
```

### 6. Write `tickets/$TICKET/05-TEST-EVIDENCE.md`

```markdown
# Test Evidence — $TICKET

Run: $EVIDENCE_DIR

## Unit
### Result: <PASS if UNIT_EXIT==0 else FAIL>
\`\`\`
<last 50 lines of unit.log>
\`\`\`

## Integration
### Result: <PASS|FAIL|SKIPPED>
\`\`\`
<last 50 lines of integration.log or "(skipped — no backend changes)">
\`\`\`

## E2E
### Result: <PASS|FAIL>
\`\`\`
<last 50 lines of e2e.log>
\`\`\`
Trace: $EVIDENCE_DIR/trace.zip
Screenshots: $EVIDENCE_DIR/*.png
```

### 7. Commit

```
git add tickets/$TICKET/05-TEST-EVIDENCE.md tickets/$TICKET/evidence/
git commit -m "test: $TICKET evidence bundle"
```

### 8. Run validator

`cd .dev-flow && npx tsx src/validators/test.ts $TICKET`

If exit 0:
- Advance state to `tests-complete`. Commit state.json.
- Tell user: "Phase 5 complete. Next: /task:verify."

If exit != 0:
- Surface validator output. Common: a layer is FAIL — fix the test, re-run /task:test.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/task/test.md
git commit -m "feat: /task:test slash command (Phase 5 — evidence bundle)"
```

---

## Task 25: Slash command — `/task:verify` (Phase 6)

**Files:**
- Create: `.claude/commands/task/verify.md`

- [ ] **Step 1: Create `.claude/commands/task/verify.md`**

```markdown
---
description: "Phase 6 — Judge gate. Fresh-context subagent verifies acceptance criteria against diff + test evidence."
allowed-tools: Bash, Read, Write, Agent
---

# /task:verify — Phase 6 (Judge Gate)

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` == `tests-complete`.
3. `cd .dev-flow && npx tsx src/validators/test.ts $TICKET` exit 0.

## Actions

### 1. Capture the diff

```
git diff develop...HEAD > /tmp/$TICKET.diff
```

### 2. Spawn the judge subagent

This is the most important subagent — its context must be FRESH. Use the Agent tool with subagent_type=general-purpose.

Provide ONLY:
- Contents of `tickets/$TICKET/01-INTAKE.md`
- Contents of `/tmp/$TICKET.diff`
- Contents of `tickets/$TICKET/05-TEST-EVIDENCE.md`
- A list of evidence file paths under `tickets/$TICKET/evidence/`

Do NOT include 02-RESEARCH.md, 03-PLAN.md, or 04-IMPLEMENTATION.md — those would bias the judge toward the implementer's framing.

Ask the subagent:

> "For each acceptance criterion in the Understood requirements section of INTAKE.md, judge whether the diff + test evidence demonstrates the criterion is met. Output a markdown table: `| # | Acceptance criterion | Verdict | Evidence |`. Verdict ∈ {PASS, FAIL, UNCLEAR}. Evidence must cite a file:line, a test name, or an evidence/ artifact path. Be skeptical — if the diff doesn't clearly satisfy the criterion, mark UNCLEAR. Do not assume things you can't see."

### 3. Write the artifact

Write `tickets/$TICKET/06-VERIFICATION.md`:

```markdown
# Verification — $TICKET

(judge subagent output — table)

## Notes
<any concerns the judge raised that aren't in the table>
```

### 4. Commit

```
git add tickets/$TICKET/06-VERIFICATION.md
git commit -m "verify: $TICKET judge-gate review"
```

### 5. Run validator

`cd .dev-flow && npx tsx src/validators/verify.ts $TICKET`

If exit 0:
- Advance state to `verified`. Commit state.json.
- Tell user: "Phase 6 complete. Next: /task:security."

If exit != 0 (any FAIL or UNCLEAR row):
- Surface the failing rows.
- Tell user: "Address the failing/unclear criteria — usually means going back to /task:implement to add tests or strengthen behavior. Use /task:reset --to plan-complete to rewind."
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/task/verify.md
git commit -m "feat: /task:verify slash command (Phase 6 — judge gate)"
```

---

## Task 26: Slash command — `/task:security` (Phase 7)

**Files:**
- Create: `.claude/commands/task/security.md`

- [ ] **Step 1: Create `.claude/commands/task/security.md`**

```markdown
---
description: "Phase 7 — Security review (npm audit + semgrep + manual diff scan for OWASP top-10)."
allowed-tools: Bash, Read, Write, Glob, Grep, Agent
---

# /task:security — Phase 7

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` == `verified`.
3. `cd .dev-flow && npx tsx src/validators/verify.ts $TICKET` exit 0.

## Actions

### 1. Dependency audit

```
pnpm audit --json > /tmp/$TICKET.audit.json 2>&1 || true
```

Parse with jq, filter to high/critical:
```
jq '.advisories | to_entries | map(select(.value.severity == "high" or .value.severity == "critical"))' /tmp/$TICKET.audit.json
```

### 2. Static analysis (if semgrep available)

```
which semgrep && semgrep --config=auto --json --output=/tmp/$TICKET.semgrep.json . || echo "semgrep not installed — skipping"
```

### 3. Manual diff review (subagent)

Spawn a subagent with the diff (`git diff develop...HEAD`). Ask it:

> "Review this diff for OWASP top-10 vulnerabilities: SQL injection, XSS, broken authentication, missing authorization checks, secret exposure (hardcoded keys, tokens), unsafe deserialization, SSRF, prompt injection (if LLM code is touched), insecure direct object references, security misconfiguration. For each finding, give: severity (low/moderate/high/critical), location (file:line), and recommendation. Be specific — do not flag generic concerns. If nothing concerning, say so."

### 4. Write `tickets/$TICKET/07-SECURITY.md`

```markdown
# Security — $TICKET

## Dependency findings

| Severity | Package | Status | Reason |
|----------|---------|--------|--------|
<one row per high/critical from npm audit; status=open initially>

## Static analysis findings

| Severity | Location | Status | Reason |
|----------|----------|--------|--------|
<one row per semgrep finding; or "(none)" if clean>

## Manual diff review

| Severity | Location | Status | Reason |
|----------|----------|--------|--------|
<one row per subagent finding; or "(none)">
```

### 5. Resolution / waiver loop

For every `open` row of severity `high` or `critical`:
- If the developer fixes it, mark `resolved` and add a one-line `Reason`.
- If the developer waives it (e.g., not exploitable in our context), mark `waived` and add a non-empty `Reason`.

The validator REFUSES to advance if any `open` high/critical remains, or if any `waived` row has empty Reason.

### 6. Commit

```
git add tickets/$TICKET/07-SECURITY.md
git commit -m "security: $TICKET review (<N> findings, <M> waived)"
```

### 7. Run validator

`cd .dev-flow && npx tsx src/validators/security.ts $TICKET`

If exit 0:
- Advance state to `security-reviewed`. Commit state.json.
- Tell user: "Phase 7 complete. Next: /task:pr."

If exit != 0:
- Surface findings. Resolve or waive each, then re-run.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/task/security.md
git commit -m "feat: /task:security slash command (Phase 7)"
```

---

## Task 27: Slash command — `/task:pr` (Phase 8)

**Files:**
- Create: `.claude/commands/task/pr.md`

- [ ] **Step 1: Create `.claude/commands/task/pr.md`**

```markdown
---
description: "Phase 8 — Push branch, open Bitbucket PR via Atlassian MCP, transition Jira ticket."
allowed-tools: Bash, Read, Write, mcp__atlassian__*
---

# /task:pr — Phase 8

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` == `security-reviewed`.
3. `cd .dev-flow && npx tsx src/validators/security.ts $TICKET` exit 0.

## Actions

### 1. Push the branch

```
git push -u origin $(git branch --show-current)
```

### 2. Read config for PR settings

Parse `.dev-flow/config.yaml`:
- `provider.workspace`, `provider.repo`, `provider.default_base`
- `provider.default_reviewers`, `provider.default_labels`
- `tracker.pr_transition`

### 3. Compose PR body

Read `tickets/$TICKET/01-INTAKE.md`, `03-PLAN.md`, `05-TEST-EVIDENCE.md`, `06-VERIFICATION.md`, `07-SECURITY.md`. Build the PR body:

```markdown
## $TICKET — <intake title>

### Intent (from intake)
<Understood requirements section, verbatim>

### Implementation summary (from plan)
<task list — one line per task>

### Test results (from evidence)
- Unit: PASS (<count>)
- Integration: PASS (<count>) | SKIPPED
- E2E: PASS (<count>) — trace: tickets/$TICKET/evidence/...

### Verification (judge-gate)
<Verification table from 06>

### Security
- Dependency findings: <N total, M open=0, K waived>
- Static analysis: <N total, M open=0, K waived>
- Manual review: <N findings, M open=0, K waived>

### Artifacts
Full audit trail in `tickets/$TICKET/`.
```

### 4. Open the PR

Call Atlassian MCP `bitbucketPullRequest.create` with:
- workspace, repo, source branch, destination = default_base
- title: `$TICKET: <ticket title>`
- body: <composed body>
- reviewers: default_reviewers
- (close source branch on merge: depends on team convention)

Capture the returned PR URL.

### 5. Transition Jira ticket

Call Atlassian MCP `transitionJiraIssue` with key=$TICKET, transition=`tracker.pr_transition`.

Call `addCommentToJiraIssue` with body: `PR opened: <PR URL>`.

### 6. Write 08-PR.md

```markdown
# PR — $TICKET

**URL:** <PR URL>
**Jira transition:** <from-status> → <to-status> (succeeded)
**Opened at:** <ISO timestamp>

## Summary
<one-paragraph summary, same as PR body intent>
```

### 7. Commit + push

```
git add tickets/$TICKET/08-PR.md
git commit -m "pr: $TICKET opened"
git push
```

### 8. Run validator

`cd .dev-flow && npx tsx src/validators/pr.ts $TICKET`

If exit 0:
- Advance state to `pr-opened`. Commit + push state.json.
- Tell user: "Phase 8 complete. PR open at <URL>. Cycle done."

If exit != 0:
- Surface issue (typically: PR URL not captured, or Jira transition failed).
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/task/pr.md
git commit -m "feat: /task:pr slash command (Phase 8)"
```

---

## Task 28: Slash commands — `/task:status` and `/task:reset`

**Files:**
- Create: `.claude/commands/task/status.md`
- Create: `.claude/commands/task/reset.md`

- [ ] **Step 1: Create `.claude/commands/task/status.md`**

```markdown
---
description: "Show current dev-cycle state for the active ticket. Read-only."
allowed-tools: Bash, Read
---

# /task:status

Determine ticket from current branch: `git branch --show-current`.

If branch matches `feature/<TICKET>-...`, set `$TICKET = <TICKET>`. Otherwise tell the user: "Not on a feature branch — switch to one first."

Print:
```
Ticket:  $TICKET
Branch:  <branch name>
Phase:   <state.phase>
Updated: <state.updated_at>
Last error: <state.last_error or "(none)">
```

Map `state.phase` to next command:
- `init` / `intake-drafted` → `/task:start <TICKET>` (continue)
- `intake-complete` → `/task:research`
- `research-complete` → `/task:plan`
- `plan-complete` / `implementation-in-progress` → `/task:implement`
- `implementation-complete` → `/task:test`
- `tests-complete` → `/task:verify`
- `verified` → `/task:security`
- `security-reviewed` → `/task:pr`
- `pr-opened` → "Done."

Also run the validator for the CURRENT phase (whatever phase we're in, run the predecessor's validator) and print pass/fail to give the user a quick health check.

Do NOT mutate any state.
```

- [ ] **Step 2: Create `.claude/commands/task/reset.md`**

```markdown
---
description: "Rewind state.phase to a prior phase. Does not delete artifacts."
allowed-tools: Bash, Read, Write
argument-hint: "--to <phase>"
---

# /task:reset

Usage: `/task:reset --to <phase>`

Valid phases: `init`, `intake-complete`, `research-complete`, `plan-complete`, `implementation-complete`, `tests-complete`, `verified`, `security-reviewed`.

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Actions

1. Read `tickets/$TICKET/state.json`.
2. Confirm with the user: "About to rewind state.phase from <current> to <target>. Artifacts will NOT be deleted; you'll just be allowed to re-run from <target>'s next phase. Proceed? (yes/no)"
3. If yes, update state.phase, set last_error=null, update updated_at.
4. Append journal entry: `{ phase: 'reset', step: 'rewind', status: 'ok', details: '<from> -> <to>' }`.
5. Commit:
```
git add tickets/$TICKET/state.json tickets/$TICKET/.journal.jsonl
git commit -m "reset: $TICKET rewind <from> -> <to>"
```
6. Print the next command to run based on the new phase.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/task/status.md .claude/commands/task/reset.md
git commit -m "feat: /task:status (read-only state) and /task:reset (rewind phase)"
```

---

## Task 29: End-to-end smoke test against a throwaway ticket

This is a manual gate, not automated tests. It validates the whole flow.

- [ ] **Step 1: Pre-flight checklist**

Verify in a clean Claude Code session in this repo:
- `cd .dev-flow && npm test` → all tests pass.
- `.mcp.json` has the Atlassian server registered.
- `AGENTS.md` is at repo root.
- `.dev-flow/PROCESS.md` exists.
- `.dev-flow/config.yaml` matches the team's actual Jira project + Bitbucket workspace.

- [ ] **Step 2: Create a throwaway Jira ticket**

In Jira, create a trivial ticket in the configured project. Title: "TEST: dev-flow smoke test — add hello.txt". Description: "Add a file `hello.txt` at repo root containing the word `hi`. Acceptance: the file exists on the feature branch and the PR is opened against develop."

Note the ticket key (e.g. `PROJ-9999`).

- [ ] **Step 3: Run Phase 1**

In Claude Code: `/task:start PROJ-9999`
- Verify branch `feature/PROJ-9999-test-dev-flow-smoke-test-add-hello-txt` is created.
- Verify `tickets/PROJ-9999/01-INTAKE.md` is committed.
- Verify Claude either has zero `[NEEDS-ANSWER]` markers or surfaces a question worth asking.
- If markers present, answer them inline, re-run `/task:start PROJ-9999`.

- [ ] **Step 4: Run Phase 2**

`/task:research`
- Verify `02-RESEARCH.md` is committed with file paths cited.

- [ ] **Step 5: Run Phase 3**

`/task:plan`
- Verify `03-PLAN.md` lists at least one task with acceptance criteria + a test plan.

- [ ] **Step 6: Run Phase 4**

`/task:implement`
- Verify `hello.txt` is created and committed with `Plan-Task:` trailer.
- Verify lint + typecheck pass.
- Verify `04-IMPLEMENTATION.md` is committed.

- [ ] **Step 7: Run Phase 5**

`/task:test`
- (For this trivial ticket there's no real test to add; the existing test suite should still pass.)
- Verify `05-TEST-EVIDENCE.md` and `evidence/` are committed.

- [ ] **Step 8: Run Phase 6**

`/task:verify`
- Verify `06-VERIFICATION.md` table has all PASS rows.

- [ ] **Step 9: Run Phase 7**

`/task:security`
- Verify `07-SECURITY.md` is committed; (none) findings expected for this trivial diff.

- [ ] **Step 10: Run Phase 8**

`/task:pr`
- Verify branch is pushed.
- Verify PR is opened on Bitbucket.
- Verify Jira ticket transitions to "In Review" and a comment with the PR URL is posted.
- Verify `08-PR.md` has the PR URL.

- [ ] **Step 11: Cleanup**

After verifying the PR landed correctly:
- Decline / close the PR on Bitbucket.
- Delete the feature branch: `git branch -D feature/PROJ-9999-... && git push origin --delete feature/PROJ-9999-...`
- Move Jira ticket to Done or delete it.

- [ ] **Step 12: Document any rough edges**

In `docs/superpowers/plans/`, create `2026-05-15-dev-flow-pilot-notes.md` listing anything that needed manual fixup. This becomes the punch list for the next iteration before wider team rollout.

---

## Self-review checklist (run before declaring v1 done)

- [ ] All 8 validators have unit tests covering the happy path + at least 2 failure modes.
- [ ] All 10 slash commands exist and have YAML frontmatter (description, allowed-tools).
- [ ] `AGENTS.md` exists at repo root and references `.dev-flow/PROCESS.md`.
- [ ] `.mcp.json` registers `atlassian` MCP server with the `/v1/mcp/authv2` endpoint.
- [ ] `.dev-flow/config.yaml` is filled in for the actual team (workspace, project_key, etc.).
- [ ] Smoke test from Task 29 passes end-to-end.
- [ ] All commits on the feature branch follow `<phase>: <TICKET> <summary>` convention.
- [ ] No bespoke Jira/Bitbucket TS clients exist anywhere in the codebase.
