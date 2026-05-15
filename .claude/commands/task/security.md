---
description: "Phase 7 — Security review (npm audit + semgrep + manual diff scan for OWASP top-10)."
allowed-tools: Bash, Read, Write, Glob, Grep, Agent
---

# /task:security — Phase 7

> **Shell environment:** all shell commands assume bash. Run `set -o pipefail` if combining commands.

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
cd .dev-flow && npx tsx src/journal-cli.ts $TICKET security review ok
cd ..
git add tickets/$TICKET/07-SECURITY.md tickets/$TICKET/.journal.jsonl
git commit -m "security: $TICKET review (<N> findings, <M> waived)"
```

### 7. Run validator

`cd .dev-flow && npx tsx src/validators/security.ts $TICKET`

If exit 0:
- Advance state to `security-reviewed`. Commit state.json.
- Tell user: "Phase 7 complete. Next: /task:pr."

If exit != 0:
- Surface findings. Resolve or waive each, then re-run.
