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
