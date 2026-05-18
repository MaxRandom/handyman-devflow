---
description: "Phase 7 — Security review (npm audit + semgrep + manual diff scan for OWASP top-10)."
allowed-tools: Bash, Read, Write, Glob, Grep, Agent
---

# /handyman-devflow:security — Phase 7

> **Shell environment:** all shell commands assume bash. Run `set -o pipefail` if combining commands.

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` == `verified`.
3. `devflow validate verify "$TICKET"` exit 0.

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

### 3. Manual diff review via security-auditor

Use the Agent tool with `subagent_type: security-auditor`. Pass:
- The diff (`git diff "$(devflow config get provider.default_base)...HEAD"`)
- The output of `pnpm audit --json` from Step 1 (or `npm audit --json` if not pnpm)
- The output of semgrep from Step 2 if it ran

The agent's system prompt handles the output format (three subsections: Dependency findings / Static analysis findings / Manual diff review, each as a markdown table with severity/location/status/reason). The agent walks the OWASP top-10 + secrets + prompt injection.

Capture the agent's return value as the body of `07-SECURITY.md`.

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
devflow journal "$TICKET" security review ok
git add tickets/$TICKET/07-SECURITY.md tickets/$TICKET/.journal.jsonl
git commit -m "security: $TICKET review (<N> findings, <M> waived)"
```

### 7. Run validator

`devflow validate security "$TICKET"`

If exit 0:
- Advance state to `security-reviewed`. Commit state.json.
- Tell user: "Phase 7 complete. Next: /handyman-devflow:pr."

If exit != 0:
- Surface findings. Resolve or waive each, then re-run.
