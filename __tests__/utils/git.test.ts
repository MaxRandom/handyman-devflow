import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { isCleanWorkingTree, currentBranch, createFeatureBranch, commit } from '../../src/utils/git.js';

let repo: string;

beforeEach(async () => {
  repo = mkdtempSync(join(tmpdir(), 'devflow-git-'));
  const git = simpleGit(repo);
  await git.init();
  await git.addConfig('user.email', 't@t.com');
  await git.addConfig('user.name', 'Test');
  writeFileSync(join(repo, 'README.md'), '# test\n');
  await git.add('.');
  await git.commit('initial');
  await git.checkoutLocalBranch('develop');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('git utils', () => {
  it('isCleanWorkingTree returns true on clean tree', async () => {
    expect(await isCleanWorkingTree(repo)).toBe(true);
  });

  it('isCleanWorkingTree returns false with untracked file', async () => {
    writeFileSync(join(repo, 'new.txt'), 'x');
    expect(await isCleanWorkingTree(repo)).toBe(false);
  });

  it('currentBranch returns the active branch', async () => {
    expect(await currentBranch(repo)).toBe('develop');
  });

  it('createFeatureBranch creates and switches to it', async () => {
    await createFeatureBranch(repo, 'feature/PROJ-1-test', 'develop');
    expect(await currentBranch(repo)).toBe('feature/PROJ-1-test');
  });

  it('createFeatureBranch refuses if branch exists', async () => {
    await createFeatureBranch(repo, 'feature/PROJ-1-test', 'develop');
    await expect(
      createFeatureBranch(repo, 'feature/PROJ-1-test', 'develop')
    ).rejects.toThrow(/already exists/);
  });

  it('commit stages and commits given paths', async () => {
    writeFileSync(join(repo, 'a.txt'), 'a');
    await commit(repo, ['a.txt'], 'feat: a');
    expect(await isCleanWorkingTree(repo)).toBe(true);
  });
});
