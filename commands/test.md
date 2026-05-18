---
description: "Phase 5 — Run unit/integration/e2e, capture evidence bundle (Playwright traces, screenshots)."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /handyman-devflow:test — Phase 5

> **Shell environment:** all shell commands in this file assume bash with `set -o pipefail`. The harness's Bash tool defaults to bash on macOS and Linux. Run `set -o pipefail` once at the start of any shell block that uses `${PIPESTATUS[*]}`.

Determine ticket from current branch: `git branch --show-current` → `$TICKET`.

## Precondition checks (HARD)

1. `git status --porcelain` empty.
2. `cat tickets/$TICKET/state.json | jq -r .phase` == `implementation-complete`.
3. `devflow validate implementation "$TICKET"` exit 0.

## Actions

### 1. Detect changed areas

```
git diff --name-only develop...HEAD | sort -u
```

Map each path to an area in `${CLAUDE_PROJECT_DIR}/.dev-flow/config.yaml.stack.areas`. If any path falls under multiple areas, OR if the diff crosses a service boundary, mark "cross-boundary" — this forces the full e2e suite.

### 2. Create evidence directory

```
EVIDENCE_DIR="tickets/$TICKET/evidence/$(date -u +%Y-%m-%dT%H-%M-%S)"
mkdir -p "$EVIDENCE_DIR"
```

### 3. Run unit tests

```
pnpm test 2>&1 | tee "$EVIDENCE_DIR/unit.log"
UNIT_EXIT=${PIPESTATUS[0]}
```

### 4. Run integration tests (if affected)

If any backend area changed:
```
pnpm test:integration 2>&1 | tee "$EVIDENCE_DIR/integration.log"
INT_EXIT=${PIPESTATUS[0]}
```

### 5. Run e2e tests

For e2e, configure Playwright to write traces + screenshots into `$EVIDENCE_DIR`:
```
PLAYWRIGHT_TRACES_DIR="$EVIDENCE_DIR" pnpm test:e2e --trace on --screenshot only-on-failure 2>&1 | tee "$EVIDENCE_DIR/e2e.log"
E2E_EXIT=${PIPESTATUS[0]}
mv test-results/* "$EVIDENCE_DIR/" 2>/dev/null || true
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
devflow journal "$TICKET" test capture ok
git add tickets/$TICKET/05-TEST-EVIDENCE.md tickets/$TICKET/evidence/ tickets/$TICKET/.journal.jsonl
git commit -m "test: $TICKET evidence bundle"
```

### 8. Run validator

`devflow validate test "$TICKET"`

If exit 0:
- Advance state to `tests-complete`. Commit state.json.
- Tell user: "Phase 5 complete. Next: /handyman-devflow:verify."

If exit != 0:
- Surface validator output. Common: a layer is FAIL — fix the test, re-run /handyman-devflow:test.
