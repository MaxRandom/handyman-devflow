import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateResearch } from '../../src/validators/research.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/research', () => {
  it('passes when patterns section cites real-looking paths', () => {
    const r = validateResearch(join(fixtures, '02-RESEARCH.good.md'));
    expect(r.ok).toBe(true);
  });

  it('fails when ## Patterns to follow is missing', () => {
    const r = validateResearch(join(fixtures, '02-RESEARCH.missing.md'));
    expect(r.ok).toBe(false);
  });

  it('fails when patterns section has no file paths', () => {
    const r = validateResearch(join(fixtures, '02-RESEARCH.no-paths.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /file path/i.test(e))).toBe(true);
  });
});
