import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlan } from '../../src/validators/plan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/plan', () => {
  it('passes a complete plan', () => {
    expect(validatePlan(join(fixtures, '03-PLAN.good.md')).ok).toBe(true);
  });

  it('fails when a task lacks acceptance criteria', () => {
    const r = validatePlan(join(fixtures, '03-PLAN.no-criteria.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /acceptance criteria/i.test(e))).toBe(true);
  });

  it('fails when ## Test plan is missing', () => {
    const r = validatePlan(join(fixtures, '03-PLAN.no-test-plan.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /test plan/i.test(e))).toBe(true);
  });
});
