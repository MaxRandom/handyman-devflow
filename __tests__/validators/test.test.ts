import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTestEvidence } from '../../src/validators/test.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/test (test-evidence)', () => {
  it('passes when every layer has Result: PASS and a raw block (e2e has trace path)', () => {
    const r = validateTestEvidence(join(fixtures, '05-TEST-EVIDENCE.good.md'));
    expect(r.ok).toBe(true);
  });

  it('fails when any layer is FAIL', () => {
    const r = validateTestEvidence(join(fixtures, '05-TEST-EVIDENCE.fail.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /unit.*FAIL/i.test(e))).toBe(true);
  });
});
