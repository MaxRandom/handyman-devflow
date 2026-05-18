# Verification — PROJ-123

| # | Acceptance criterion | Verdict | Evidence |
|---|----------------------|---------|----------|
| 1 | Login button must redirect to /dashboard on success | PASS | e2e/login.spec.ts:42 |
| 2 | Failed login must show inline error within 200ms | UNKLEAR | typo'd — should be UNCLEAR |
| 3 | Lockout triggers after 5 failed attempts in 60 seconds | PASSED | typo'd — should be PASS |
