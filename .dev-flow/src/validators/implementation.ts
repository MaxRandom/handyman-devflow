import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { findProjectRoot } from '../utils/project-root.js';
import { ticketDir } from '../state.js';

export interface ImplArgs {
  cwd: string;
  base: string;
  planTaskIds: string[];
  lintCmd: string;
  typecheckCmd: string;
}

export async function validateImplementation(args: ImplArgs): Promise<ValidatorResult> {
  const errors: string[] = [];
  const git = simpleGit({ baseDir: args.cwd });
  const log = await git.log({ from: args.base, to: 'HEAD' });
  const commitMessages = log.all.map((c) => `${c.message}\n${c.body ?? ''}`);

  for (const id of args.planTaskIds) {
    const re = new RegExp(`Plan-Task:\\s*${id}\\b`, 'm');
    const matched = commitMessages.some((m) => re.test(m));
    if (!matched) errors.push(`No commit found with trailer Plan-Task: ${id}`);
  }

  try {
    execSync(args.lintCmd, { cwd: args.cwd, stdio: 'pipe' });
  } catch {
    errors.push(`lint command failed: ${args.lintCmd}`);
  }
  try {
    execSync(args.typecheckCmd, { cwd: args.cwd, stdio: 'pipe' });
  } catch {
    errors.push(`typecheck command failed: ${args.typecheckCmd}`);
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx implementation.ts <TICKET>'); process.exit(2); }
  const root = findProjectRoot();
  const dir = ticketDir(root, ticket);
  const planPath = join(dir, '03-PLAN.md');
  if (!existsSync(planPath)) { console.error('03-PLAN.md missing'); process.exit(2); }
  const planText = readFileSync(planPath, 'utf8');
  const ids = [...planText.matchAll(/^###\s+Task\s+(\d+):/gm)].map((m) => m[1]!);
  const lintCmd = process.env.LINT_CMD ?? 'pnpm lint';
  const typecheckCmd = process.env.TYPECHECK_CMD ?? 'pnpm typecheck';
  const base = process.env.BASE_BRANCH ?? 'develop';
  validateImplementation({ cwd: root, base, planTaskIds: ids, lintCmd, typecheckCmd })
    .then((r) => { console.log(JSON.stringify(r)); process.exit(r.ok ? 0 : 1); });
}
