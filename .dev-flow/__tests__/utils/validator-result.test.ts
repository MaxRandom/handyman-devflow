import { describe, expect, it } from 'vitest';
import { ok, fail, ValidatorResultSchema } from '../../src/utils/validator-result.js';

describe('validator-result', () => {
  it('ok() returns { ok: true, errors: [] }', () => {
    expect(ok()).toEqual({ ok: true, errors: [] });
  });

  it('fail() returns { ok: false, errors: [...] }', () => {
    expect(fail('a', 'b')).toEqual({ ok: false, errors: ['a', 'b'] });
  });

  it('schema accepts ok shape', () => {
    expect(ValidatorResultSchema.safeParse({ ok: true, errors: [] }).success).toBe(true);
  });

  it('schema rejects bad shape', () => {
    expect(ValidatorResultSchema.safeParse({ ok: 'yes' }).success).toBe(false);
  });
});
