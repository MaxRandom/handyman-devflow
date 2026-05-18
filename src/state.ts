import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

export const PhaseSchema = z.enum([
  'init',
  'intake-drafted',
  'intake-complete',
  'research-complete',
  'plan-complete',
  'implementation-complete',
  'tests-complete',
  'verified',
  'security-reviewed',
  'pr-opened',
]);

export type Phase = z.infer<typeof PhaseSchema>;

export const StateSchema = z.object({
  ticket: z.string(),
  branch: z.string(),
  phase: PhaseSchema,
  updated_at: z.string().datetime(),
  last_error: z.string().nullable(),
  // Count of times the verify phase auto-looped back to implement because the
  // judge returned FAIL/UNCLEAR. Bounded by stack.workflow.verify_max_attempts.
  // Optional for backward compatibility — defaults to 0 on read.
  verify_attempts: z.number().int().nonnegative().default(0),
});

export type State = z.infer<typeof StateSchema>;

export function ticketDir(root: string, ticket: string): string {
  return join(root, 'tickets', ticket);
}

export function statePath(root: string, ticket: string): string {
  return join(ticketDir(root, ticket), 'state.json');
}

export function writeState(root: string, state: State): void {
  StateSchema.parse(state);
  const path = statePath(root, state.ticket);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

export function loadState(root: string, ticket: string): State {
  const path = statePath(root, ticket);
  if (!existsSync(path)) throw new Error(`state.json not found for ${ticket} at ${path}`);
  return StateSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function advancePhase(root: string, ticket: string, to: Phase): void {
  const s = loadState(root, ticket);
  writeState(root, {
    ...s,
    phase: to,
    updated_at: new Date().toISOString(),
    last_error: null,
  });
}

export function recordError(root: string, ticket: string, error: string): void {
  const s = loadState(root, ticket);
  writeState(root, { ...s, last_error: error, updated_at: new Date().toISOString() });
}

// Verify-loop bookkeeping. The verify slash command increments on FAIL/UNCLEAR
// and rewinds phase to `plan-complete` (so /implement can replay with the
// failing rows as context). On a clean verify PASS, the count resets to 0.
export function incrementVerifyAttempt(root: string, ticket: string): number {
  const s = loadState(root, ticket);
  const next = s.verify_attempts + 1;
  writeState(root, { ...s, verify_attempts: next, updated_at: new Date().toISOString() });
  return next;
}

export function resetVerifyAttempts(root: string, ticket: string): void {
  const s = loadState(root, ticket);
  if (s.verify_attempts === 0) return;
  writeState(root, { ...s, verify_attempts: 0, updated_at: new Date().toISOString() });
}
