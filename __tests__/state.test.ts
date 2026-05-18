import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadState, writeState, advancePhase, recordError,
  incrementVerifyAttempt, resetVerifyAttempts,
  ticketDir, statePath, PhaseSchema,
} from '../src/state.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'devflow-state-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('state', () => {
  it('ticketDir returns tickets/<id>', () => {
    expect(ticketDir(root, 'PROJ-1')).toBe(join(root, 'tickets', 'PROJ-1'));
  });

  it('writeState creates dir + file', () => {
    writeState(root, {
      ticket: 'PROJ-1',
      branch: 'feature/PROJ-1-x',
      phase: 'init',
      updated_at: new Date().toISOString(),
      last_error: null,
    });
    expect(readFileSync(statePath(root, 'PROJ-1'), 'utf8')).toContain('PROJ-1');
  });

  it('loadState round-trips', () => {
    writeState(root, {
      ticket: 'PROJ-1',
      branch: 'feature/PROJ-1-x',
      phase: 'plan-complete',
      updated_at: '2026-05-15T00:00:00.000Z',
      last_error: null,
    });
    const s = loadState(root, 'PROJ-1');
    expect(s.phase).toBe('plan-complete');
  });

  it('loadState throws if file missing', () => {
    expect(() => loadState(root, 'PROJ-99')).toThrow(/not found/);
  });

  it('advancePhase updates phase and updated_at', () => {
    writeState(root, {
      ticket: 'PROJ-1', branch: 'feature/PROJ-1-x',
      phase: 'intake-drafted',
      updated_at: '2026-01-01T00:00:00.000Z', last_error: null,
    });
    advancePhase(root, 'PROJ-1', 'intake-complete');
    const s = loadState(root, 'PROJ-1');
    expect(s.phase).toBe('intake-complete');
    expect(s.updated_at).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('recordError sets last_error', () => {
    writeState(root, {
      ticket: 'PROJ-1', branch: 'feature/PROJ-1-x',
      phase: 'intake-drafted',
      updated_at: new Date().toISOString(), last_error: null,
    });
    recordError(root, 'PROJ-1', 'validator failed: foo');
    expect(loadState(root, 'PROJ-1').last_error).toBe('validator failed: foo');
  });

  it('PhaseSchema rejects unknown phases', () => {
    expect(PhaseSchema.safeParse('bogus').success).toBe(false);
    expect(PhaseSchema.safeParse('plan-complete').success).toBe(true);
  });

  it('verify_attempts defaults to 0 for states written without the field (back-compat)', () => {
    // Write the JSON directly to simulate a legacy state.json with no verify_attempts.
    const root2 = mkdtempSync(join(tmpdir(), 'devflow-state-bc-'));
    try {
      const dir = ticketDir(root2, 'PROJ-7');
      const path = statePath(root2, 'PROJ-7');
      const fs = require('node:fs') as typeof import('node:fs');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path, JSON.stringify({
        ticket: 'PROJ-7',
        branch: 'feature/PROJ-7-x',
        phase: 'tests-complete',
        updated_at: new Date().toISOString(),
        last_error: null,
      }));
      const s = loadState(root2, 'PROJ-7');
      expect(s.verify_attempts).toBe(0);
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it('incrementVerifyAttempt bumps counter and returns new value', () => {
    writeState(root, {
      ticket: 'PROJ-1', branch: 'feature/PROJ-1-x',
      phase: 'tests-complete',
      updated_at: new Date().toISOString(), last_error: null,
      verify_attempts: 0,
    });
    expect(incrementVerifyAttempt(root, 'PROJ-1')).toBe(1);
    expect(incrementVerifyAttempt(root, 'PROJ-1')).toBe(2);
    expect(loadState(root, 'PROJ-1').verify_attempts).toBe(2);
  });

  it('resetVerifyAttempts zeros the counter (and is a no-op when already 0)', () => {
    writeState(root, {
      ticket: 'PROJ-1', branch: 'feature/PROJ-1-x',
      phase: 'verified',
      updated_at: new Date().toISOString(), last_error: null,
      verify_attempts: 3,
    });
    resetVerifyAttempts(root, 'PROJ-1');
    expect(loadState(root, 'PROJ-1').verify_attempts).toBe(0);
    // No-op when already 0 — should not throw.
    resetVerifyAttempts(root, 'PROJ-1');
    expect(loadState(root, 'PROJ-1').verify_attempts).toBe(0);
  });

  it('advancePhase preserves verify_attempts (the counter only resets on resetVerifyAttempts)', () => {
    writeState(root, {
      ticket: 'PROJ-1', branch: 'feature/PROJ-1-x',
      phase: 'tests-complete',
      updated_at: new Date().toISOString(), last_error: null,
      verify_attempts: 2,
    });
    advancePhase(root, 'PROJ-1', 'verified');
    expect(loadState(root, 'PROJ-1').verify_attempts).toBe(2);
  });
});
