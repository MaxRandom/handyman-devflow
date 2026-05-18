import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateVerify } from '../../src/validators/verify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/verify', () => {
  it('passes when all rows are PASS', () => {
    const r = validateVerify(join(fixtures, '06-VERIFICATION.good.md'));
    expect(r.ok).toBe(true);
  });

  it('fails when any row is UNCLEAR or FAIL', () => {
    const r = validateVerify(join(fixtures, '06-VERIFICATION.unclear.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /UNCLEAR/.test(e))).toBe(true);
  });
});
