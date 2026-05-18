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

  it('fails when a row has a typo\'d verdict (PASSED, UNKLEAR, etc.) instead of silently skipping it', () => {
    const r = validateVerify(join(fixtures, '06-VERIFICATION.typo-verdict.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /invalid verdict/i.test(e))).toBe(true);
    expect(r.errors.some((e) => /UNKLEAR|PASSED/.test(e))).toBe(true);
  });

  it('fails an all-typo\'d table with an "invalid verdict" error, not a "no rows" error', () => {
    const r = validateVerify(join(fixtures, '06-VERIFICATION.all-typos.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /invalid verdict/i.test(e))).toBe(true);
    // Critically: should NOT report "No verification table rows found" — the rows DID match by shape.
    expect(r.errors.some((e) => /No verification table rows found/i.test(e))).toBe(false);
  });
});
