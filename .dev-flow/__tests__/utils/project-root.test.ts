import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findProjectRoot } from '../../src/utils/project-root.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'devflow-root-'));
  mkdirSync(join(root, '.dev-flow'), { recursive: true });
  writeFileSync(join(root, '.dev-flow', 'config.yaml'), 'provider:\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('findProjectRoot', () => {
  it('returns the directory containing .dev-flow/config.yaml', () => {
    expect(findProjectRoot(root)).toBe(root);
  });

  it('walks up to find the marker', () => {
    const sub = join(root, 'a', 'b', 'c');
    mkdirSync(sub, { recursive: true });
    expect(findProjectRoot(sub)).toBe(root);
  });

  it('throws if marker not found', () => {
    const orphan = mkdtempSync(join(tmpdir(), 'devflow-orphan-'));
    expect(() => findProjectRoot(orphan)).toThrow(/not found/);
    rmSync(orphan, { recursive: true });
  });
});
