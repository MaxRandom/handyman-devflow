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
git diff --name-only "$(devflow config get provider.default_base)...HEAD" | sort -u
```

Map each path to an area in `${CLAUDE_PROJECT_DIR}/.dev-flow/config.yaml.stack.areas`. If any path falls under multiple areas, OR if the diff crosses a service boundary, mark "cross-boundary" — this forces the full e2e suite.

### 2. Create evidence directory

```
EVIDENCE_DIR="tickets/$TICKET/evidence/$(date -u +%Y-%m-%dT%H-%M-%S)"
mkdir -p "$EVIDENCE_DIR"
```

### 3. Run unit tests

```
$(devflow config get stack.test_commands.unit) 2>&1 | tee "$EVIDENCE_DIR/unit.log"
UNIT_EXIT=${PIPESTATUS[0]}
```

### 4. Run integration tests (if affected)

If any backend area changed:
```
$(devflow config get stack.test_commands.integration) 2>&1 | tee "$EVIDENCE_DIR/integration.log"
INT_EXIT=${PIPESTATUS[0]}
```
(If `stack.test_commands.integration` is unset in `.dev-flow/config.yaml`, `devflow config get` exits 1 and the integration step is skipped — integration is optional per the validator.)

### 5. Run e2e tests (if configured)

Skip this step if `stack.test_commands.e2e` is unset in `.dev-flow/config.yaml` — the Smoke layer in step 6 is the real-condition floor and is always required.

Note: this step reads `stack.e2e_output_dir` from config (default `test-results`, Playwright's default). Override in `.dev-flow/config.yaml` if your `playwright.config.ts` sets `outputDir` to something else.

For e2e, configure Playwright to write traces + screenshots into `$EVIDENCE_DIR`:
```
E2E_CMD="$(devflow config get stack.test_commands.e2e 2>/dev/null || true)"
if [ -n "$E2E_CMD" ]; then
  PLAYWRIGHT_TRACES_DIR="$EVIDENCE_DIR" $E2E_CMD --trace on --screenshot only-on-failure 2>&1 | tee "$EVIDENCE_DIR/e2e.log"
  E2E_EXIT=${PIPESTATUS[0]}
  E2E_OUTPUT_DIR="$(devflow config get stack.e2e_output_dir)"
  if [ -d "$E2E_OUTPUT_DIR" ]; then
    mv "$E2E_OUTPUT_DIR"/* "$EVIDENCE_DIR/" 2>/dev/null || true
  else
    echo "Note: e2e output dir '$E2E_OUTPUT_DIR' not found — Playwright produced no artifacts, or check your playwright.config.ts outputDir." >&2
  fi
else
  E2E_EXIT="SKIPPED"
fi
```

### 5b. Run real-condition smoke test (MANDATORY — never skipped)

The smoke test actually runs the built artifact and proves it does something
observable. It runs regardless of project type (web, desktop, CLI, library)
and regardless of whether e2e tests exist.

```
devflow smoke "$TICKET" --evidence-dir "$EVIDENCE_DIR" --label smoke
SMOKE_EXIT=$?
```

The smoke runner writes `$EVIDENCE_DIR/smoke.log` containing the command, exit
code, timeout status, stdout, and stderr.

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
### Result: <PASS|FAIL|SKIPPED>
\`\`\`
<last 50 lines of e2e.log, or "(skipped — no stack.test_commands.e2e configured)">
\`\`\`
Trace: $EVIDENCE_DIR/trace.zip (if e2e ran)
Screenshots: $EVIDENCE_DIR/*.png (if e2e ran)

## Smoke
### Result: <PASS if SMOKE_EXIT==0 else FAIL>
\`\`\`
<last 50 lines of smoke.log — exit code, expected exit, stdout/stderr tail>
\`\`\`
Evidence: $EVIDENCE_DIR/smoke.log
```

**MANDATORY:** the `## Smoke` section must be present and `PASS`. If the smoke
failed, do NOT advance phase — fix the artifact, then re-run the test phase.

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
