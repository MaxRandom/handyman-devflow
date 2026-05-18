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

function runCommand(cmd: string, cwd: string): { ok: true } | { ok: false; output: string } {
  try {
    execSync(cmd, { cwd, stdio: 'pipe' });
    return { ok: true };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const stdout = e.stdout?.toString('utf8') ?? '';
    const stderr = e.stderr?.toString('utf8') ?? '';
    const combined = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
    const lines = combined.split('\n');
    const tail = lines.length > 30 ? lines.slice(-30) : lines;
    const trimmedNotice = lines.length > 30 ? `[truncated to last 30 of ${lines.length} lines]\n` : '';
    return { ok: false, output: trimmedNotice + tail.join('\n') };
  }
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

  const lintResult = runCommand(args.lintCmd, args.cwd);
  if (!lintResult.ok) {
    errors.push(`lint command failed: ${args.lintCmd}\n${lintResult.output}`);
  }
  const typecheckResult = runCommand(args.typecheckCmd, args.cwd);
  if (!typecheckResult.ok) {
    errors.push(`typecheck command failed: ${args.typecheckCmd}\n${typecheckResult.output}`);
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
