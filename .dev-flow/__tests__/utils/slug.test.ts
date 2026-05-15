import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/utils/slug.js';

describe('slugify', () => {
  it('lowercases', () => {
    expect(slugify('Fix Login')).toBe('fix-login');
  });

  it('replaces spaces and special chars with single hyphen', () => {
    expect(slugify('Fix the login button!!!')).toBe('fix-the-login-button');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('a   b   c')).toBe('a-b-c');
  });

  it('truncates to 60 chars at word boundary', () => {
    const long = 'a'.repeat(20) + ' ' + 'b'.repeat(20) + ' ' + 'c'.repeat(40);
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith('-')).toBe(false);
  });

  it('handles empty input', () => {
    expect(slugify('')).toBe('untitled');
  });

  it('strips diacritics', () => {
    expect(slugify('café')).toBe('cafe');
  });
});
