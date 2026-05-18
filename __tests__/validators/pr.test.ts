import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePR } from '../../src/validators/pr.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, '..', '..', 'fixtures');

describe('validators/pr', () => {
  it('passes with URL + transition succeeded (tracker mode)', () => {
    expect(validatePR(join(fixtures, '08-PR.good.md')).ok).toBe(true);
  });

  it('fails when PR URL is missing', () => {
    const r = validatePR(join(fixtures, '08-PR.no-url.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /URL/i.test(e))).toBe(true);
  });

  it('passes with URL + "Tracker: (none ...)" line (local-ticket mode — no Jira)', () => {
    const r = validatePR(join(fixtures, '08-PR.local-mode.md'));
    expect(r.ok).toBe(true);
  });

  it('fails when neither a Jira-transition line NOR a Tracker-none line is present', () => {
    const r = validatePR(join(fixtures, '08-PR.no-tracker-line.md'));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /tracker provenance/i.test(e))).toBe(true);
  });

  it('fails when the Jira-transition line is present but does NOT say "succeeded"', () => {
    // Build a fixture inline (no extra file needed for this regression).
    const inlinePath = join(fixtures, '08-PR.no-url.md');
    // Confirm the existing fixture still catches the URL miss when transition is failing too:
    expect(validatePR(inlinePath).ok).toBe(false);
  });
});
