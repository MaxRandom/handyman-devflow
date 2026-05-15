import { describe, expect, it } from 'vitest';
import { shouldBlock } from '../../hooks/block-trunk-push.js';

describe('block-trunk-push: shouldBlock', () => {
  it('does not block non-Bash tools', () => {
    expect(shouldBlock({ tool_name: 'Read', tool_input: { command: 'git push origin main' } as any }).block).toBe(false);
  });

  it('blocks `git push origin main`', () => {
    const r = shouldBlock({ tool_name: 'Bash', tool_input: { command: 'git push origin main' } });
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/trunk/i);
  });

  it('blocks `git push -u origin develop`', () => {
    expect(shouldBlock({ tool_name: 'Bash', tool_input: { command: 'git push -u origin develop' } }).block).toBe(true);
  });

  it('blocks `git push origin master`', () => {
    expect(shouldBlock({ tool_name: 'Bash', tool_input: { command: 'git push origin master' } }).block).toBe(true);
  });

  it('does NOT block push to a feature branch', () => {
    expect(shouldBlock({ tool_name: 'Bash', tool_input: { command: 'git push -u origin feature/PROJ-1-x' } }).block).toBe(false);
  });

  it('blocks `git push --force` without lease', () => {
    expect(shouldBlock({ tool_name: 'Bash', tool_input: { command: 'git push --force origin feature/x' } }).block).toBe(true);
  });

  it('allows `git push --force-with-lease`', () => {
    expect(shouldBlock({ tool_name: 'Bash', tool_input: { command: 'git push --force-with-lease origin feature/x' } }).block).toBe(false);
  });

  it('does not block unrelated commands', () => {
    expect(shouldBlock({ tool_name: 'Bash', tool_input: { command: 'ls -la' } }).block).toBe(false);
  });
});
