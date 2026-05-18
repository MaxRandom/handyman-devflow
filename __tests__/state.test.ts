import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadState, writeState, advancePhase, recordError,
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
});
