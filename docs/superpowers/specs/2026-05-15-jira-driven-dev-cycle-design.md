# Jira-driven Development Cycle — Design Spec

**Date:** 2026-05-15
**Owner:** Max Sysenko
**Status:** Design v2 — updated after market research scan
**Revision history:**
- v1 (2026-05-15): initial design.
- v1.1 (2026-05-15): added Mastra evaluation (section 11).
- v2 (2026-05-15): integrated landscape research — switched Jira/Bitbucket plumbing from custom TS clients to Atlassian MCP server; added operating modes (light/standard/epic); added evidence bundle to Phase 5; renamed Phase 6 verifier as the "judge gate" pattern; switched team-shared rules from CLAUDE.md to AGENTS.md; appended sections 12–14.

## 1. Problem

Teams using Jira (issue tracking) and Bitbucket/GitHub (code) need a repeatable, AI-assisted development cycle that:

1. Starts from a Jira ticket number.
2. Surfaces ambiguities and missing requirements *before* coding.
3. Implements the change against an existing TypeScript / Next.js / Nest.js codebase.
4. Produces tests (unit, integration, e2e) and captured evidence that they pass.
5. Performs a self-verification pass and a security review.
6. Opens a PR on whichever repo provider the team uses.

It must be **reliable** (the AI cannot skip steps or fake completion) and **provider-agnostic** (Bitbucket today, GitHub or GitLab tomorrow).

## 2. Non-goals

- Replacing CI. CI still runs on the server side; this flow runs on the developer's machine pre-PR.
- Auto-merging. Human review remains required.
- Generating Jira tickets. Tickets are created upstream by PM/QA.
- Building a custom AI runtime. The flow runs inside Claude Code (today) and is callable from any future LLM CLI that supports slash commands.

## 3. Core design principle

**Disk-state machine, not chat-state machine.**

The AI does not decide what step it is on. A `state.json` file on disk does. Each slash command:

1. Reads `state.json` and refuses to execute unless its declared precondition phase matches.
2. Re-reads the previous phase's artifact from disk and runs an external validator script (plain Node, no LLM) that exits non-zero if the artifact is malformed or incomplete.
3. Produces its own artifact (a markdown file) and only then advances `state.json` to the next phase.

This makes "the AI skipped a step" structurally impossible: the next command cannot run because its validator will refuse.

## 4. Repository layout

```
AGENTS.md                      # cross-vendor team rules (Codex/Cursor/Aider/Claude all read this)
CLAUDE.md                      # Anthropic-specific quirks ONLY; AGENTS.md is the source of truth
.dev-flow/
  config.yaml                  # stack + MCP server config (committed)
  validators/                  # one per phase, plain Node, exit non-zero on fail
    intake.js  research.js  plan.js
    implementation.js  test.js  verify.js  security.js
  tickets/<TICKET-ID>/         # per-ticket workspace
    state.json
    01-INTAKE.md
    02-RESEARCH.md
    03-PLAN.md
    04-IMPLEMENTATION.md
    05-TEST-EVIDENCE.md
    06-VERIFICATION.md
    07-SECURITY.md
    08-PR.md
    evidence/                  # raw artifacts: Playwright traces, screenshots, console logs
.claude/commands/task/         # slash command files (Markdown), team-shared
  start.md  research.md  plan.md  implement.md
  test.md   verify.md    security.md  pr.md  status.md
  reset.md                     # /task:reset --to <phase>
.mcp.json                      # MCP server registrations (Atlassian, GitHub, etc.)
```

**No custom Bitbucket / GitHub / Jira TypeScript clients.** All issue-tracker and repo-provider operations go through MCP servers (see section 6). This is a change from v1: the market scan confirmed Atlassian's official MCP server (60+ tools across Jira/Confluence/Bitbucket) and GitHub's official MCP server are the right primitives in 2026 — building bespoke clients duplicates work and rots fast as APIs evolve.

### Branch & commit policy (decided 2026-05-15)

- **One feature branch per ticket**, named `feature/<TICKET>-<title-slug>` (e.g. `feature/PROJ-123-fix-login-button`).
- **The feature branch is created in Phase 1 (intake)**, not Phase 4. This keeps artifacts and code on the same branch from the start — cross-machine resumability is `git fetch && git checkout feature/PROJ-123-...` with no manual file copying.
- **Each phase produces exactly one atomic commit** on the feature branch (the artifact for that phase). Phase 4 additionally produces one commit per implementation task. Commit messages follow `<phase>: <TICKET> <one-line summary>` (e.g. `intake: PROJ-123 draft requirements + open questions`).
- **`tickets/<TICKET>/` is NOT committed to `main`/`develop`.** It lives only on feature branches, and is merged into the trunk via the PR like any other change. Old ticket folders accumulate on the trunk over time as a paper trail; quarterly archive job moves anything older than N months into `.dev-flow/archive/<year>/<quarter>/`.
- **Working tree must be clean** to start Phase 1. The slash command refuses if `git status` is non-empty.

## 5. Phases

Each phase has: a slash command, a precondition, an artifact, a validator, and an exit gate.

### 5.1 Phase 1 — Intake (`/task:start <TICKET>`)

**Precondition:** No existing `tickets/<TICKET>/state.json`, OR `state.phase == "init"`. Working tree must be clean (`git status` empty); refuse otherwise.

**Actions:**
1. Read `.dev-flow/config.yaml` to learn provider + stack.
2. Use the Atlassian MCP server to fetch the ticket (title, description, acceptance criteria, attachments, comments).
3. Compute branch name: `feature/<TICKET>-<slug(title)>` per `config.yaml.provider.branch_pattern`. Slugify the Jira title to lowercase kebab-case, max 60 chars.
4. **Create the feature branch from the configured base** (`git checkout -b feature/<TICKET>-<slug> origin/<default_base>`).
5. Auto-detect repo provider from `.git/config` if not pre-set.
6. Build a lightweight codebase map (top-level packages, recently touched areas, files matching keywords from the ticket).
7. Spawn a subagent with `{ ticket, codebase_map, existing_patterns }`. Ask it to produce three sections:
   - **Understood requirements** — restated as testable bullet points
   - **Open questions** — each tagged `[NEEDS-ANSWER]`
   - **Affected areas** — file paths, with reasoning
8. Write `tickets/<TICKET>/01-INTAKE.md` and `tickets/<TICKET>/state.json`. Set `state.phase = "intake-drafted"`, `state.branch = "feature/..."`.
9. **Commit atomically:** `git add tickets/<TICKET>/ && git commit -m "intake: <TICKET> draft requirements + open questions"`.

**Validator (`intake.js`):** parses `01-INTAKE.md`; passes only when all three sections are present, every Understood requirement is testable (contains a verb + measurable outcome), and the file contains zero `[NEEDS-ANSWER]` markers.

**Exit gate:** developer answers each `[NEEDS-ANSWER]` inline (replacing the marker), then re-runs `/task:start <TICKET>` (idempotent: detects existing state, re-runs the validator, on pass advances state to `"intake-complete"` and amends/adds a commit `"intake: <TICKET> requirements signed off"`). Alternative path: developer posts the questions to Jira as a comment via the MCP server and pastes the PM's answers back.

### 5.2 Phase 2 — Research (`/task:research`)

**Precondition:** `state.phase == "intake-complete"`. Currently on `state.branch`. Working tree clean.

**Actions:** Read `01-INTAKE.md`. Explore the codebase against the affected areas: which modules implement similar features, which patterns are used, what conventions exist. Identify reuse opportunities and integration points. Write `02-RESEARCH.md`. **Commit atomically:** `git add tickets/<TICKET>/02-RESEARCH.md && git commit -m "research: <TICKET> codebase analysis"`.

**Validator:** every "Affected area" path from intake is referenced; the file contains a `## Patterns to follow` section citing real files; no claims without file paths.

### 5.3 Phase 3 — Plan (`/task:plan`)

**Precondition:** `state.phase == "research-complete"`. Currently on `state.branch`. Working tree clean.

**Actions:** Produce a step-by-step implementation plan: ordered tasks (each with file paths + acceptance criteria), test plan (unit + integration + e2e flows), rollback note. Branch is already created (Phase 1) so no branch decision here. Write `03-PLAN.md`. **Commit atomically:** `git add tickets/<TICKET>/03-PLAN.md && git commit -m "plan: <TICKET> implementation plan"`.

**Validator:** every task has acceptance criteria; a `## Test plan` section exists with named cases for each layer the diff is expected to touch.

### 5.4 Phase 4 — Implement (`/task:implement`)

**Precondition:** `state.phase == "plan-complete"`. Currently on `state.branch` (created in Phase 1).

**Actions:**
1. Execute plan tasks in order. For each task:
   - Make the code changes.
   - Run lint + typecheck. On failure, halt the loop, append a deviation note to `04-IMPLEMENTATION.md`, exit. Developer fixes; re-runs `/task:implement` (resumes from the last completed task).
   - Commit atomically: `git add <touched files> && git commit -m "feat: <TICKET> <task title>"`. Commit trailer includes `Plan-Task: <task-id>` for traceability.
2. After all plan tasks complete, append the commit log + any deviations to `04-IMPLEMENTATION.md`. **Commit atomically:** `git add tickets/<TICKET>/04-IMPLEMENTATION.md && git commit -m "implement: <TICKET> task log"`.

**Validator:** every PLAN task has at least one matching commit (matched by `Plan-Task:` trailer); final lint + typecheck exit zero.

### 5.5 Phase 5 — Test (`/task:test`)

**Precondition:** `state.phase == "implementation-complete"`.

**Actions:**
1. Detect which areas the diff touches (frontend / backend / specific service).
2. Run the test commands declared in `config.yaml.stack.test_commands` for those areas, plus the full e2e suite if the diff crosses a service boundary.
3. Capture stdout, exit codes, coverage summary, and for e2e: Playwright traces, screenshots, console logs, network HARs.
4. Write raw artifacts into `tickets/<TICKET>/evidence/` (timestamped subdirs per run). Embed summaries + relative links into `05-TEST-EVIDENCE.md`, one section per layer.
5. The PR body (Phase 8) embeds inline screenshot links and the trace-viewer URL pattern (e.g. `playwright show-trace evidence/<run>/trace.zip`).

**Validator:** every layer has a `### Result: PASS` marker AND a raw output block AND, for e2e, a screenshot or trace file path under `evidence/`. Any FAIL aborts.

After validator pass, **commit atomically:** `git add tickets/<TICKET>/05-TEST-EVIDENCE.md tickets/<TICKET>/evidence/ && git commit -m "test: <TICKET> evidence bundle"`.

**Pattern source:** ProofShot (`AmElmo/proofshot`) and Google Antigravity Artifacts. The 2026 market scan confirmed **no mainstream agent does evidence bundling well** — this is a differentiating piece of the flow, worth the investment.

### 5.6 Phase 6 — Verify (`/task:verify`) — "judge gate" pattern

**Precondition:** `state.phase == "tests-complete"`.

**Actions:** Spawn a **fresh subagent** with strictly: `01-INTAKE.md`, the diff (`git diff <base>...HEAD`), and `05-TEST-EVIDENCE.md` (including evidence bundle paths). The subagent has no memory of the implementation conversation — zero history bias, sees `// TODO: pick value` for what it is.

Ask it: for each acceptance criterion in INTAKE, does the diff + evidence demonstrate it? Output `06-VERIFICATION.md` with one row per criterion: `PASS / FAIL / UNCLEAR` + cited evidence (file:line or test name).

**Validator:** every intake acceptance criterion appears in the verification table; no `FAIL` or `UNCLEAR` rows remain.

After validator pass, **commit atomically:** `git add tickets/<TICKET>/06-VERIFICATION.md && git commit -m "verify: <TICKET> judge-gate review"`.

**Pattern source:** the **judge gate** pattern, formalized in 2026 (released as the `goalkeeper` Claude Code plugin). Anthropic Superpowers calls a lighter version of this `verification-before-completion` ("evidence before assertions, always"). The fresh-context discipline is what makes it work; do not reuse the implementing agent's context.

### 5.7 Phase 7 — Security (`/task:security`)

**Precondition:** `state.phase == "verified"`.

**Actions:**
1. Run `npm audit --json` (or pnpm/yarn equivalent), filter to high/critical.
2. Run `semgrep` with the project's ruleset if configured; otherwise a default OWASP ruleset.
3. AI reviews the diff specifically for: SQL injection, XSS, missing authn/authz checks, secret exposure, prompt injection (if LLM code is touched), unsafe deserialization.
4. Write `07-SECURITY.md` with three sections: dependency findings, static analysis findings, manual diff review. Each finding has: severity, location, recommendation, status (`open` / `resolved` / `waived` with reason).

**Validator:** no `open` findings of severity high/critical remain; every `waived` finding has a non-empty reason.

After validator pass, **commit atomically:** `git add tickets/<TICKET>/07-SECURITY.md && git commit -m "security: <TICKET> review (<N> findings, <M> waived)"`.

### 5.8 Phase 8 — PR (`/task:pr`)

**Precondition:** `state.phase == "security-reviewed"`. Currently on `state.branch`.

**Actions:**
1. **Push the feature branch:** `git push -u origin feature/<TICKET>-<slug>`.
2. Use the Atlassian MCP server (`bitbucketPullRequest.create`) to open the PR. Title from the ticket; body auto-assembled from intake summary + plan summary + test evidence summary + verification table + security summary, with links to each artifact file (resolvable on Bitbucket once the branch is pushed).
3. Apply default reviewers and labels from `config.yaml`.
4. Use the Atlassian MCP server (`transitionJiraIssue` + `addCommentToJiraIssue`) to transition the Jira ticket (e.g. `In Progress → In Review`) and post the PR URL as a comment.
5. Write `tickets/<TICKET>/08-PR.md` with the PR URL and final summary. **Commit atomically and push:** `git add tickets/<TICKET>/08-PR.md && git commit -m "pr: <TICKET> opened" && git push`.

**Validator:** PR URL present; Jira transition succeeded.

### 5.9 Status (`/task:status`)

Cross-cutting helper. Reads `state.json`, prints current phase, what's blocking advancement (validator error if any), and the next command to run. No state mutation.

## 6. Provider integration via MCP (revised in v2)

**v1 proposed bespoke TypeScript adapter modules.** v2 replaces this with **MCP servers** — the universal protocol now adopted by Claude Code, Codex CLI, Cursor, Aider, Goose, and Copilot.

> **Important naming clarification:** "Atlassian Rovo MCP Server" and "Atlassian Rovo Dev" are two different products that share branding. We are adopting the **Rovo MCP Server** (the plumbing layer that exposes Jira/Bitbucket tools to any AI). We are explicitly **not** adopting Rovo Dev (the AI agent product that automates ticket→PR end-to-end) — that's the buy-vs-build decision in section 12.1, and we chose to build.

### Selected MCP servers

| Concern | MCP server | Notes |
| --- | --- | --- |
| Jira + Bitbucket Cloud (single server) | **Atlassian Rovo MCP Server** — official, GA Feb 2026 | Covers all 4 Jira ops (`getJiraIssue`, `addCommentToJiraIssue`, `transitionJiraIssue`, `editJiraIssue`) and all 5 Bitbucket Cloud ops (`bitbucketRepoContent.branch.create`, `bitbucketPullRequest.create/comment/get/comments/diff`) plus `bitbucketPipeline.run`. Endpoint: `https://mcp.atlassian.com/v1/mcp/authv2`. License: Apache-2.0 (client). Auth: OAuth 2.1 via existing Atlassian Cloud SSO. Maintained by Atlassian. |
| GitHub (when team migrates) | **GitHub MCP server** (official) | Drop-in replacement; slash commands swap server name in `.mcp.json`. |
| GitLab (future) | **GitLab MCP server** (community) | Same pattern. |
| Linear (if team switches from Jira) | **Linear MCP server** (official, `https://mcp.linear.app/mcp`) | OAuth, 25+ named tools. One-line swap in `.mcp.json`. |

**Fallback noted but not adopted:** `jellythomas/mcp-atlassian-with-bitbucket` (community, MIT, 136 tools) is a reasonable backup if the Rovo MCP Server lacks a specific capability we need later — but its bus factor is one maintainer. Avoid until needed.

**Auth caveat to flag:** As of May 2026, Atlassian's Bitbucket tools on the Rovo MCP Server still use API-token auth under the hood for some operations; full OAuth-only Bitbucket is "in progress" per Atlassian. Practically: the developer may need to provide a Bitbucket API token alongside the Atlassian SSO during initial setup. Track this so we can drop the API token when Atlassian completes the migration.

**Endpoint sunset to track:** The older `https://mcp.atlassian.com/v1/sse` endpoint dies 30 Jun 2026. Use `/v1/mcp/authv2` from day one.

### Why MCP, not custom clients

1. **Maintenance cost.** Atlassian and GitHub maintain their own servers; we don't.
2. **Tool portability.** The same `.mcp.json` works in Claude Code, Codex CLI, Cursor, etc. The flow becomes tool-portable, not just Claude-Code-portable.
3. **Auth handled.** OAuth flows, token refresh, error handling — done.
4. **Slash commands stay simple.** Each phase's command body says "use the Atlassian MCP `getJiraIssue` tool"; no factory pattern, no adapter modules.

### What we still write ourselves

- **`config.yaml`** — declares which MCP servers to use for which concern, plus team conventions (branch names, default reviewers, Jira transition names).
- **Slash command bodies** — instruct the agent which MCP tools to call and what to do with the results.
- **Validators** — pure Node, no MCP.

### Provider switching (Bitbucket → GitHub example)

1. Update `.mcp.json`: replace Atlassian Bitbucket auth with GitHub MCP.
2. Update `.dev-flow/config.yaml`: change `provider.type: bitbucket` → `github`.
3. Slash commands referencing `bitbucket-create-pull-request` → `github-create-pull-request` (a small `provider_tool_map` in `config.yaml` lets us avoid editing slash command files for this swap).

No new TypeScript code. No factory pattern. Provider portability becomes a config exercise.

## 7. Configuration

```yaml
# .dev-flow/config.yaml
provider:
  type: bitbucket            # bitbucket | github | gitlab — drives which MCP tools to call
  mcp_server: atlassian      # name in .mcp.json
  workspace: my-team
  repo: handyman
  branch_pattern: "feature/{ticket}-{slug}"
  default_base: develop
  default_reviewers: [alice, bob]
  default_labels: [needs-review]

tracker:
  type: jira                 # jira | linear
  mcp_server: atlassian      # same server as provider for Atlassian; separate when using GitHub+Jira
  base_url: https://my-team.atlassian.net
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

modes:
  default: standard          # light | standard | epic (see section 13)
  light_triggers:
    labels: [trivial, typo, chore]
    max_lines_changed: 30
  epic_triggers:
    labels: [epic]
    min_acceptance_criteria: 5
```

```jsonc
// .mcp.json — committed to repo
{
  "mcpServers": {
    "atlassian": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.atlassian.com/v1/mcp/authv2"]
    },
    "github": {
      "command": "github-mcp-server",
      "args": ["--stdio"]
    }
  }
}
```

Secrets (Atlassian OAuth tokens, GitHub PAT, possibly a transitional Bitbucket API token) are managed by each MCP server's own auth flow; nothing is stored in this repo. The Atlassian server triggers an OAuth 2.1 browser flow on first use and caches tokens in the user's home directory.

## 8. Why a state machine, not one big slash command

| Loose single command | Gated state machine |
| --- | --- |
| AI controls flow → can skip steps | Disk + validators control flow → cannot skip |
| "Done" = AI assertion | "Done" = artifact present + validator passes |
| No paper trail | Each phase is a reviewable markdown file |
| Cannot pause / resume across machines | State on disk, committed |
| Hard to audit after the fact | Artifacts diffable, code-reviewable |
| Provider swap = rewrite | Provider swap = config edit |
| Self-verification can rationalize | Phase 6 spawns fresh subagent with no implementation memory |

## 9. Failure & recovery

- Any validator failure halts the flow and writes the validator's stderr into `state.json` under `last_error`. The developer fixes the artifact and re-runs the same phase command.
- A `/task:reset --to <phase>` helper rewinds `state.phase` (does not delete artifacts) for legitimate go-back cases.
- Phase 4 implementation deviations are captured in `04-IMPLEMENTATION.md`, not silently swallowed.

## 10. Rollout plan (v1 = standard mode only)

1. Add `AGENTS.md` at repo root with team rules; reduce existing `CLAUDE.md` (if any) to Anthropic-specific quirks.
2. Register Atlassian Rovo MCP Server in `.mcp.json` using the `/v1/mcp/authv2` endpoint; trigger OAuth on first use; verify Jira read + Bitbucket branch-create + PR-create work end-to-end against a throwaway test ticket.
3. Write `.dev-flow/config.yaml` schema + loader (Node, with Zod validation).
4. Implement Phase 1–8 validators (plain Node, no LLM).
5. Implement slash command files for all 8 phases + `/task:status` + `/task:reset` (standard mode only).
6. Pilot on one real ticket end-to-end with a senior engineer driving.
7. Iterate on validators + slash command prompts based on pilot findings.
8. Roll out to wider team.
9. (v1.5+) Add light mode, epic mode, GitHub MCP support — only after standard flow proves out.

## 11. Considered alternative: Mastra Workflows

Mastra (https://mastra.ai) provides a TypeScript workflow engine with first-class suspend/resume, persistent snapshots (LibSQL/SQLite/Postgres), Zod-validated step I/O, agent/tool primitives, and observability. Evaluated on 2026-05-15.

**Why we are not adopting it as the backbone:**

1. **Two sources of truth.** Our phase artifacts (markdown files) are the deliverable humans review. Mastra's snapshot is opaque internal state. They can drift.
2. **No first-class gate primitive.** Mastra has no declarative "this step refuses unless predicate holds" — it's still hand-rolled in the step body. So the framework does not reduce the validator code we have to write.
3. **Suspend semantics mismatch.** Mastra `suspend()` assumes another process will call `.resume(data)`. Our pattern is "finish the phase, write the artifact, exit; the next slash command starts a fresh process two hours later." That's not suspend — it's just sequential script invocation.
4. **One-shot process friction.** Each slash command spawns a fresh Node process; we would have to instantiate `Mastra`, derive a `runId` from the ticket, look up the suspended run, re-import the same workflow object so step references match, then resume. Workable, but a fight against the documented patterns.
5. **Claude Code is already the agent harness.** Inside Claude Code, the slash command markdown body IS the orchestrator and has Bash / Read / Write / Edit / Agent tools natively. Wrapping that in a workflow framework adds an indirection without adding capability.
6. **Unused features.** Mastra's value-add primitives (`.parallel()`, `.branch()`, `.dountil()`, retries) are largely unexercised by a sequential, human-gated flow.

**What we are borrowing from Mastra:** the Zod-schema-per-step idea. Validators in `.dev-flow/validators/*.js` will declare each artifact's required shape via Zod, giving us declarative parsing without adopting the runtime.

**When to revisit:** if the flow ever needs to run server-side (webhook-triggered, multi-developer dashboard, programmatic API), Mastra becomes the right answer. Phase artifacts and provider adapters would port cleanly into Mastra steps at that point.

## 12. Wider market evaluation (May 2026)

After the Mastra evaluation in section 11, we did a four-axis market scan: autonomous SWE agents, ticket-to-PR products, spec-driven methodology, and durable workflow runtimes. Key findings that shaped v2:

### 12.1 Buy vs. build — decided: build

The closest existing product, given the Atlassian stack, is **Atlassian Rovo Dev** (the AI agent — distinct from the Rovo MCP Server we ARE adopting; see section 6 naming clarification). Rovo Dev is GA, ~$20/user/mo, runs inside Jira tickets, and has a plan-before-code approval gate. The honest case for buying it was real.

**Decision (2026-05-15): build.** The case for still building wins on six points:

1. **Test evidence as a deliverable is unsolved across the entire industry** — confirmed by the scan. ProofShot and Google Antigravity Artifacts are the only serious efforts; Rovo, Devin, Copilot Coding Agent, Cursor Background Agents all leave evidence to CI logs. Our `evidence/` bundle is differentiated work.
2. **Phase artifacts as committed paper trail** — Rovo produces a PR; we produce 8 reviewable markdown files in git history. Auditable in a way no SaaS agent matches.
3. **Stack-aware test orchestration** — generic agents don't know that the Next.js + Nest.js + services + e2e topology means "if the diff crosses a service boundary, run the full e2e suite." Our `config.yaml` encodes this.
4. **Custom Definition-of-Done per ticket type** — security review depth, verification rigor, light/standard/epic mode shaping. Generic agents have one knob.
5. **Provider portability if the team leaves Bitbucket** — Rovo Dev locks you into Atlassian; our flow is provider-agnostic by construction.
6. **Already running inside Claude Code, which the team uses** — zero new tool to adopt.

**What we DO use from Atlassian:** the Rovo MCP Server (section 6) for Jira/Bitbucket plumbing only. Atlassian maintains the API client; we maintain the workflow. Best of both worlds.

### 12.2 Convergent industry pattern (validated four ways)

`brainstorm → spec → plan → tasks → TDD-implement → fresh-subagent verify → judge gate → PR with evidence` is the consensus loop in 2026. GitHub Spec-Kit, Anthropic Superpowers, GSD, Kiro, Tessl, AWS Antigravity, Cursor Plan Mode, Copilot Plan Agent, Rovo Dev all implement variants. **Our design is not speculative** — it's the consensus shape with our team's stack baked in.

### 12.3 What the market does NOT do well

- **Clarifying questions before code.** Most agents go straight to implementation. The exceptions: GitHub Copilot Plan Agent (Apr 2026), Rovo Dev's plan step. Building our own clarifying-loop is justified.
- **E2E test evidence in PRs.** No mainstream agent does this. Industry-wide gap.
- **Phase-by-phase reviewable artifacts.** Most produce one PR; we produce a chain of files.
- **Right-sized ceremony.** Birgitta Böckeler (Thoughtworks) named the pain: SDD overhead is wrong-sized for both bug fixes and large epics. Hence section 13's operating modes.

### 12.4 What we're adopting from the market

| From | What we're adopting |
| --- | --- |
| GitHub Spec-Kit | Per-ticket directory layout; checklists embedded in artifacts as machine-readable hooks |
| AGENTS.md (Linux Foundation Agentic AI Foundation) | Cross-vendor team rules file at repo root; reserves CLAUDE.md for Anthropic quirks only |
| Anthropic Superpowers | `verification-before-completion` discipline at every phase boundary; `brainstorming` style for intake; `subagent-driven-development` for parallel tasks |
| GSD | Fresh-context subagent per phase; main thread stays at 30-40% utilization |
| Atlassian MCP | All Jira/Bitbucket plumbing — no bespoke clients |
| ProofShot / Antigravity Artifacts | Evidence bundle in `evidence/` linked from PR |
| `goalkeeper` plugin | Judge gate framing for Phase 6 |

### 12.5 Tools deliberately not adopted

| Tool | Why not |
| --- | --- |
| Mastra Workflows | Section 11 — wrong runtime shape for laptop slash commands |
| Cloudflare Workflows | Workers can't shell exec (`git`, `npm test`) — structurally disqualified |
| LangGraph / Inngest / Temporal / Restate / Trigger.dev | Earn their keep server-side; our laptop case beats them with ~200 lines |
| n8n / Windmill / Activepieces | Visual builders fight a linear dev workflow; n8n's exec node is sandbox-disabled by default |
| Devin / Factory Droids / Cosine Genie | Full-stack SaaS agents; we lose paper-trail control and pay $200+/seat |
| Sweep AI | Pivoted away from issue-to-PR; not viable in 2026 |
| Cursor Background Agents / Bugbot | GitHub-only as of April 2026; no Bitbucket support |
| GitHub Copilot Coding Agent | GitHub-only despite the new Jira-binding preview; Bitbucket constraint kills it |

## 13. Operating modes — v1 ships standard only

Birgitta Böckeler's 2025 critique is real: 8 phases of ceremony for a typo-fix is overkill, and 8 phases for a multi-week epic is under-scoped. Three modes were considered. **Decision (2026-05-15): v1 ships standard only.** Light and epic modes are deferred to v1.5+ once the standard flow has been piloted on real tickets.

### Standard mode (the only mode in v1)

The 8-phase flow described in section 5. For: the median ticket — one feature, one developer, 1–3 days of work.

### Light mode — DEFERRED to v1.5+

Sketch (for v1.5 planning, not v1 scope): collapse Phases 1–3 into a single `LIGHT-INTENT.md` for tickets labeled `trivial`/`typo`/`chore` or where diff stays under ~30 lines. Phases 4–8 unchanged. Skip security review unless dependencies change. Validator escalates to standard mode if the diff grows past the threshold mid-flow.

### Epic mode — DEFERRED to v1.5+

Sketch (for v1.5 planning, not v1 scope): Phase 1 decomposes the epic into sub-tickets, each running the full standard flow under `tickets/<EPIC>/sub/<SUB-TICKET>/`. Epic PR is a meta-PR or per-sub-ticket PRs depending on team preference. Decomposition requires human approval before any sub-ticket starts.

## 14. Patterns borrowed from the durable-runtime ecosystem

We rejected adopting any runtime (section 11, section 12.5) but the patterns are worth copying into the bespoke state machine:

| Pattern | Source | Implementation in our flow |
| --- | --- | --- |
| Checkpointer per `runId` | LangGraph SQLite checkpointer | `state.json` keyed by ticket ID; `/task:status <TICKET>` re-hydrates from any machine |
| Idempotency keys for external calls | Inngest `step.run("name", fn)` | Every Jira/Bitbucket MCP call keyed by `<TICKET>:<phase>:<action>` so retries don't double-create comments or PRs |
| Pure orchestrator + named activities | Temporal | Phase logic = pure decisions from state; side effects (`git`, `npm test`, MCP calls) are explicitly named, retried, logged separately |
| `ctx.run("name", fn)` journaling | Restate | Append-only log per ticket: `tickets/<TICKET>/.journal.jsonl` with `{phase, step, status, ts, exit_code}` — free observability and replay-skip |
| Fresh subagents per phase | Claude Code `Agent` tool, GSD pattern | Phase 6 verifier and Phase 7 security review use fresh-context subagents; Phase 2 research can too if the codebase is large |
| `interrupt()` → resume marker | LangGraph human-in-loop | Phases that need human input write `WAITING_FOR_HUMAN` into `state.json`; the next slash-command invocation reads the marker and resumes — explicit, no magic |
| Atomic-commit-per-task discipline | Aider | Phase 4 commits after each plan task, not after the whole phase; deviations logged in `04-IMPLEMENTATION.md` |
| Cumulative-diff sandbox | Plandex | Phase 4 work happens on a feature branch (already in spec); treated as sandbox until Phase 5 tests pass |

## 15. Open design choices

### Resolved (2026-05-15)

- ~~**Where do per-ticket folders live?**~~ → **Resolved: feature branch only.** `tickets/<TICKET>/` is created on the feature branch in Phase 1, committed atomically per phase, and merges into the trunk via the PR. Quarterly archive job moves old folders to `.dev-flow/archive/<year>/<quarter>/` to keep the trunk tidy.
- ~~**Branch naming convention?**~~ → **Resolved: `feature/<TICKET>-<title-slug>`** (e.g. `feature/PROJ-123-fix-login-button`). Slug = lowercase kebab-case of Jira ticket title, max 60 chars.
- ~~**Operating modes?**~~ → **Resolved: standard only for v1.** Light/epic deferred to v1.5+.
- ~~**Buy vs build?**~~ → **Resolved: build.** Use Atlassian Rovo MCP Server for plumbing only.

### Still open

- **Subagent for Phase 6 verification** — confirm the team is comfortable spending the tokens for a fresh-context verification pass. Alternative: checklist-only validator (cheaper, weaker). Recommendation: keep the subagent; the gate is the value.
- **Security tooling** — assumes `npm audit` + optional `semgrep`. If your team uses Snyk or another tool, swap it inside `validators/security.js`.
- **Should `AGENTS.md` reference this dev-flow** so non-Claude tools (Codex CLI, Cursor) can run the same flow? Yes in principle, but each tool has its own slash-command system — probably means writing per-tool wrappers later. Out of scope for v1.
