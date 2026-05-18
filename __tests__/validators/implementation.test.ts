import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { validateImplementation } from '../../src/validators/implementation.js';

let repo: string;

beforeEach(async () => {
  repo = mkdtempSync(join(tmpdir(), 'devflow-impl-'));
  const git = simpleGit(repo);
  await git.init();
  await git.addConfig('user.email', 't@t.com');
  await git.addConfig('user.name', 'Test');
  writeFileSync(join(repo, 'README.md'), '# r\n');
  await git.add('.');
  await git.commit('initial');
  await git.checkoutLocalBranch('develop');
  await git.checkoutLocalBranch('feature/PROJ-1-x');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('validators/implementation', () => {
  it('fails when no commits with Plan-Task trailers exist beyond base', async () => {
    const r = await validateImplementation({
      cwd: repo,
      base: 'develop',
      planTaskIds: ['1', '2'],
      lintCmd: 'true',
      typecheckCmd: 'true',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Plan-Task/.test(e))).toBe(true);
  });

  it('passes when each plan task has a matching trailer', async () => {
    const git = simpleGit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    await git.add('a.txt');
    await git.commit('feat: PROJ-1 do A\n\nPlan-Task: 1');
    writeFileSync(join(repo, 'b.txt'), 'b');
    await git.add('b.txt');
    await git.commit('feat: PROJ-1 do B\n\nPlan-Task: 2');

    const r = await validateImplementation({
      cwd: repo, base: 'develop',
      planTaskIds: ['1', '2'], lintCmd: 'true', typecheckCmd: 'true',
    });
    expect(r.ok).toBe(true);
  });

  it('fails if lintCmd exits non-zero AND surfaces the command output (stderr/stdout tail)', async () => {
    const git = simpleGit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    await git.add('a.txt');
    await git.commit('feat: PROJ-1 do A\n\nPlan-Task: 1');
    const r = await validateImplementation({
      cwd: repo, base: 'develop',
      planTaskIds: ['1'],
      lintCmd: 'sh -c "echo ERROR_FROM_LINT_STDERR >&2; echo lint_output_line; exit 7"',
      typecheckCmd: 'true',
    });
    expect(r.ok).toBe(false);
    const lintError = r.errors.find((e) => /lint/i.test(e));
    expect(lintError).toBeDefined();
    expect(lintError).toMatch(/ERROR_FROM_LINT_STDERR/);
    expect(lintError).toMatch(/lint_output_line/);
  });

  it('truncates lint output to last 30 lines and notes the truncation', async () => {
    const git = simpleGit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    await git.add('a.txt');
    await git.commit('feat: PROJ-1 do A\n\nPlan-Task: 1');
    // Produce 50 lines of output, then fail.
    const cmd = "sh -c 'for i in $(seq 1 50); do echo line_$i; done; exit 1'";
    const r = await validateImplementation({
      cwd: repo, base: 'develop',
      planTaskIds: ['1'], lintCmd: cmd, typecheckCmd: 'true',
    });
    expect(r.ok).toBe(false);
    const lintError = r.errors.find((e) => /lint/i.test(e))!;
    expect(lintError).toMatch(/truncated to last 30 of 50/);
    expect(lintError).toMatch(/line_50/);   // last line present
    expect(lintError).not.toMatch(/line_1\b/); // first lines dropped
  });

  it('fails if typecheckCmd exits non-zero (mirrors lint behavior)', async () => {
    const git = simpleGit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    await git.add('a.txt');
    await git.commit('feat: PROJ-1 do A\n\nPlan-Task: 1');
    const r = await validateImplementation({
      cwd: repo, base: 'develop',
      planTaskIds: ['1'], lintCmd: 'true', typecheckCmd: 'false',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /typecheck/i.test(e))).toBe(true);
  });

  it('does not match Plan-Task: 1 against a commit that has Plan-Task: 11 (regression for substring disambiguation)', async () => {
    const git = simpleGit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    await git.add('a.txt');
    await git.commit('feat: PROJ-1 do task eleven\n\nPlan-Task: 11');
    const r = await validateImplementation({
      cwd: repo, base: 'develop',
      planTaskIds: ['1'], lintCmd: 'true', typecheckCmd: 'true',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Plan-Task: 1\b/.test(e))).toBe(true);
  });
});
