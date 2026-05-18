import { describe, expect, it } from 'vitest';
import { nextPhase, renderDecision } from '../src/auto.js';
import type { State } from '../src/state.js';
import type { Config } from '../src/config.js';

// Minimal config stub — only the fields nextPhase reads.
const cfg = (overrides?: Partial<Config['workflow']>): Config => ({
  workflow: { verify_max_attempts: 3, autopilot: true, ...overrides },
} as unknown as Config);

const baseState = (overrides: Partial<State> = {}): State => ({
  ticket: 'PROJ-1',
  branch: 'feature/PROJ-1-x',
  phase: 'init',
  updated_at: '2026-05-18T00:00:00.000Z',
  last_error: null,
  verify_attempts: 0,
  ...overrides,
});

describe('auto.nextPhase — phase-to-command mapping', () => {
  it('init → run start', () => {
    expect(nextPhase(baseState({ phase: 'init' }), cfg())).toEqual({ kind: 'run', command: 'start' });
  });

  it('intake-drafted → blocked (validator hasn\'t passed; needs human input)', () => {
    const d = nextPhase(baseState({ phase: 'intake-drafted' }), cfg());
    expect(d.kind).toBe('blocked');
    expect(d.kind === 'blocked' && /NEEDS-ANSWER/.test(d.reason)).toBe(true);
  });

  it('intake-complete → run research', () => {
    expect(nextPhase(baseState({ phase: 'intake-complete' }), cfg())).toEqual({ kind: 'run', command: 'research' });
  });

  it('research-complete → run plan', () => {
    expect(nextPhase(baseState({ phase: 'research-complete' }), cfg())).toEqual({ kind: 'run', command: 'plan' });
  });

  it('plan-complete → run implement', () => {
    expect(nextPhase(baseState({ phase: 'plan-complete' }), cfg())).toEqual({ kind: 'run', command: 'implement' });
  });

  it('implementation-complete → run test', () => {
    expect(nextPhase(baseState({ phase: 'implementation-complete' }), cfg())).toEqual({ kind: 'run', command: 'test' });
  });

  it('tests-complete → run verify', () => {
    expect(nextPhase(baseState({ phase: 'tests-complete' }), cfg())).toEqual({ kind: 'run', command: 'verify' });
  });

  it('verified → run security', () => {
    expect(nextPhase(baseState({ phase: 'verified' }), cfg())).toEqual({ kind: 'run', command: 'security' });
  });

  it('security-reviewed → run pr', () => {
    expect(nextPhase(baseState({ phase: 'security-reviewed' }), cfg())).toEqual({ kind: 'run', command: 'pr' });
  });

  it('pr-opened → done (cycle finished)', () => {
    expect(nextPhase(baseState({ phase: 'pr-opened' }), cfg())).toEqual({ kind: 'done' });
  });
});

describe('auto.nextPhase — blocker rules', () => {
  it('any non-null last_error blocks regardless of phase', () => {
    const d = nextPhase(
      baseState({ phase: 'implementation-complete', last_error: 'smoke failed: exit 7' }),
      cfg(),
    );
    expect(d.kind).toBe('blocked');
    expect(d.kind === 'blocked' && /smoke failed/.test(d.reason)).toBe(true);
  });

  it('plan-complete + verify_attempts >= cap blocks (loop exhausted)', () => {
    const d = nextPhase(
      baseState({ phase: 'plan-complete', verify_attempts: 3 }),
      cfg({ verify_max_attempts: 3 }),
    );
    expect(d.kind).toBe('blocked');
    expect(d.kind === 'blocked' && /exhausted 3 attempts/.test(d.reason)).toBe(true);
  });

  it('plan-complete + verify_attempts BELOW cap continues to implement (the loop is healthy)', () => {
    const d = nextPhase(
      baseState({ phase: 'plan-complete', verify_attempts: 2 }),
      cfg({ verify_max_attempts: 3 }),
    );
    expect(d).toEqual({ kind: 'run', command: 'implement' });
  });

  it('verify cap of 1 means a single failure exhausts the loop', () => {
    const d = nextPhase(
      baseState({ phase: 'plan-complete', verify_attempts: 1 }),
      cfg({ verify_max_attempts: 1 }),
    );
    expect(d.kind).toBe('blocked');
  });
});

describe('auto.renderDecision — CLI line format', () => {
  it('renders RUN:<command>', () => {
    expect(renderDecision({ kind: 'run', command: 'plan' })).toBe('RUN:plan');
  });

  it('renders DONE', () => {
    expect(renderDecision({ kind: 'done' })).toBe('DONE');
  });

  it('renders BLOCKED:<reason>', () => {
    expect(renderDecision({ kind: 'blocked', reason: 'smoke failed' })).toBe('BLOCKED:smoke failed');
  });
});
