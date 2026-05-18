# Test Evidence — PROJ-123

## Unit
### Result: PASS
```
$ pnpm test
... 142 passed ...
```

## E2E
### Result: SKIPPED
```
(skipped — no stack.test_commands.e2e configured)
```

## Smoke
### Result: FAIL
```
$ pnpm build && node dist/cli.js --help
exit 127, expect 0 — see evidence/2026-05-15T14-23-00/smoke.log
```
Evidence: evidence/2026-05-15T14-23-00/smoke.log
