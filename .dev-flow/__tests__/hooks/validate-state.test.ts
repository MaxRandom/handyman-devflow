import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findStateFiles, validateStateFile } from '../../hooks/validate-state.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'devflow-stop-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeState(ticket: string, body: object): string {
  const dir = join(root, 'tickets', ticket);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'state.json');
  writeFileSync(path, JSON.stringify(body, null, 2));
  return path;
}

const validBody = (ticket: string) => ({
  ticket,
  branch: `feature/${ticket}-x`,
  phase: 'intake-complete',
  updated_at: new Date().toISOString(),
  last_error: null,
});

describe('validate-state', () => {
  it('findStateFiles returns empty when tickets dir does not exist', () => {
    expect(findStateFiles(root)).toEqual([]);
  });

  it('findStateFiles finds all state.json files under tickets/*', () => {
    writeState('PROJ-1', validBody('PROJ-1'));
    writeState('PROJ-2', validBody('PROJ-2'));
    expect(findStateFiles(root)).toHaveLength(2);
  });

  it('validateStateFile returns null for a valid state', () => {
    const path = writeState('PROJ-1', validBody('PROJ-1'));
    expect(validateStateFile(path)).toBeNull();
  });

  it('validateStateFile flags invalid JSON', () => {
    const dir = join(root, 'tickets', 'PROJ-1');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'state.json');
    writeFileSync(path, '{ not valid json');
    const w = validateStateFile(path);
    expect(w?.reason).toMatch(/invalid JSON/);
  });

  it('validateStateFile flags schema violations', () => {
    const path = writeState('PROJ-1', { ticket: 'PROJ-1', phase: 'bogus-phase' });
    const w = validateStateFile(path);
    expect(w?.reason).toMatch(/schema violation/);
  });
});
