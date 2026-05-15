import { simpleGit, type SimpleGit } from 'simple-git';

const git = (cwd: string): SimpleGit => simpleGit({ baseDir: cwd });

export async function isCleanWorkingTree(cwd: string): Promise<boolean> {
  const status = await git(cwd).status();
  return status.isClean();
}

export async function currentBranch(cwd: string): Promise<string> {
  const status = await git(cwd).status();
  return status.current ?? '';
}

export async function createFeatureBranch(
  cwd: string,
  branch: string,
  base: string,
): Promise<void> {
  const branches = await git(cwd).branchLocal();
  if (branches.all.includes(branch)) {
    throw new Error(`Branch '${branch}' already exists`);
  }
  await git(cwd).checkoutBranch(branch, base);
}

export async function commit(
  cwd: string,
  paths: string[],
  message: string,
): Promise<void> {
  await git(cwd).add(paths);
  await git(cwd).commit(message);
}

export async function pushBranch(
  cwd: string,
  branch: string,
  setUpstream = true,
): Promise<void> {
  if (setUpstream) {
    await git(cwd).push(['-u', 'origin', branch]);
  } else {
    await git(cwd).push('origin', branch);
  }
}

export async function diffAgainst(cwd: string, base: string): Promise<string> {
  return git(cwd).diff([`${base}...HEAD`]);
}
