import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSecurity } from '../../src/validators/security.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/security', () => {
  it('passes when no open high/critical findings remain and waivers have reasons', () => {
    expect(validateSecurity(join(fixtures, '07-SECURITY.good.md')).ok).toBe(true);
  });

  it('fails when any high/critical finding is open', () => {
    const r = validateSecurity(join(fixtures, '07-SECURITY.open.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /open.*critical/i.test(e))).toBe(true);
  });

  it('fails when a waiver has no reason', () => {
    const r = validateSecurity(join(fixtures, '07-SECURITY.waived-no-reason.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /reason/i.test(e))).toBe(true);
  });

  it('fails when a row has a typo\'d status (waaived, oepn) instead of silently skipping it', () => {
    const r = validateSecurity(join(fixtures, '07-SECURITY.typo-status.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /invalid status/i.test(e))).toBe(true);
    expect(r.errors.some((e) => /waaived|oepn/.test(e))).toBe(true);
  });
});
