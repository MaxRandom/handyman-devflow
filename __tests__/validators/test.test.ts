import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTestEvidence } from '../../src/validators/test.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/test (test-evidence)', () => {
  it('passes when every required layer (Unit, Smoke) has Result: PASS with raw block + smoke evidence path', () => {
    const r = validateTestEvidence(join(fixtures, '05-TEST-EVIDENCE.good.md'));
    expect(r.ok).toBe(true);
  });

  it('fails when any layer is FAIL', () => {
    const r = validateTestEvidence(join(fixtures, '05-TEST-EVIDENCE.fail.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /unit.*FAIL/i.test(e))).toBe(true);
  });

  it('fails when the Smoke section is missing — the universal real-condition floor cannot be skipped', () => {
    const r = validateTestEvidence(join(fixtures, '05-TEST-EVIDENCE.no-smoke.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Missing required layer section: ## Smoke/i.test(e))).toBe(true);
  });

  it('fails when Smoke Result is FAIL', () => {
    const r = validateTestEvidence(join(fixtures, '05-TEST-EVIDENCE.smoke-fail.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Smoke Result is FAIL/.test(e))).toBe(true);
  });

  it('passes when E2E is SKIPPED but Smoke is PASS — projects without an e2e suite are still valid as long as the smoke runs', () => {
    const r = validateTestEvidence(join(fixtures, '05-TEST-EVIDENCE.e2e-skipped-smoke-ok.md'));
    expect(r.ok).toBe(true);
  });
});
