import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIntake } from '../../src/validators/intake.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/intake', () => {
  it('passes a well-formed intake', () => {
    const r = validateIntake(join(fixtures, '01-INTAKE.good.md'));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('fails when [NEEDS-ANSWER] markers remain', () => {
    const r = validateIntake(join(fixtures, '01-INTAKE.needs-answer.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /NEEDS-ANSWER/.test(e))).toBe(true);
  });

  it('fails when a required section is missing', () => {
    const r = validateIntake(join(fixtures, '01-INTAKE.missing-section.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Open questions/i.test(e))).toBe(true);
  });

  it('fails when file does not exist', () => {
    const r = validateIntake(join(fixtures, 'does-not-exist.md'));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/not found/);
  });
});
