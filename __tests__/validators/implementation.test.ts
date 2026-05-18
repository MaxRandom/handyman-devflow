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

  it('fails if lintCmd exits non-zero', async () => {
    const git = simpleGit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    await git.add('a.txt');
    await git.commit('feat: PROJ-1 do A\n\nPlan-Task: 1');
    const r = await validateImplementation({
      cwd: repo, base: 'develop',
      planTaskIds: ['1'], lintCmd: 'false', typecheckCmd: 'true',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /lint/i.test(e))).toBe(true);
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
