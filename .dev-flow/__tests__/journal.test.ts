import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { append, journalPath, read } from '../src/journal.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'devflow-journal-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('journal', () => {
  it('append creates file with one JSONL line', () => {
    append(root, 'PROJ-1', { phase: 'intake', step: 'fetch-ticket', status: 'ok' });
    const raw = readFileSync(journalPath(root, 'PROJ-1'), 'utf8');
    expect(raw.trim().split('\n')).toHaveLength(1);
    const entry = JSON.parse(raw.trim());
    expect(entry.phase).toBe('intake');
    expect(entry.ts).toBeDefined();
  });

  it('append appends across calls', () => {
    append(root, 'PROJ-1', { phase: 'intake', step: 'a', status: 'ok' });
    append(root, 'PROJ-1', { phase: 'intake', step: 'b', status: 'ok' });
    expect(read(root, 'PROJ-1')).toHaveLength(2);
  });

  it('read returns empty array if no journal exists', () => {
    expect(read(root, 'PROJ-99')).toEqual([]);
  });
});
