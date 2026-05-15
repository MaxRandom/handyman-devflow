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
