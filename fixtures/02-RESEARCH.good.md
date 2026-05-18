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
