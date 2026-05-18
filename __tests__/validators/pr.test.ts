import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePR } from '../../src/validators/pr.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/pr', () => {
  it('passes with URL + transition succeeded', () => {
    expect(validatePR(join(fixtures, '08-PR.good.md')).ok).toBe(true);
  });

  it('fails when PR URL is missing', () => {
    const r = validatePR(join(fixtures, '08-PR.no-url.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /URL/i.test(e))).toBe(true);
  });
});
