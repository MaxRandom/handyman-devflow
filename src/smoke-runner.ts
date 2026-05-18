// src/smoke-runner.ts — universal real-condition runner.
//
// Reads stack.smoke_test from config.yaml, executes the command with timeout,
// captures stdout+stderr into an evidence file, and verifies exit code +
// optional stdout regex match. Exits 0 on success, 1 on failure, 2 on misuse.
//
// Used by:
//   - /handyman-devflow:implement (end-of-phase check)
//   - /handyman-devflow:test      (evidence bundle)
//
// CLI:
//   tsx src/smoke-runner.ts <TICKET> [--evidence-dir <dir>]
//
// Outputs JSON to stdout in the validator-result shape, with extra fields:
//   { ok, errors, evidence_path, exit_code, duration_ms }

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadConfig, type SmokeTestConfig } from './config.js';
import { findProjectRoot } from './utils/project-root.js';
import { ticketDir } from './state.js';

export interface SmokeResult {
  ok: boolean;
  errors: string[];
  evidence_path: string;
  exit_code: number | null;
  duration_ms: number;
  timed_out: boolean;
}

export interface RunSmokeArgs {
  cwd: string;
  smoke: SmokeTestConfig;
  evidenceDir: string;
  label?: string;
}

export async function runSmoke(args: RunSmokeArgs): Promise<SmokeResult> {
  const { cwd, smoke, evidenceDir, label = 'smoke' } = args;
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, `${label}.log`);

  const errors: string[] = [];
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  let timedOut = false;
  const started = Date.now();

  await new Promise<void>((resolve) => {
    const child = spawn('bash', ['-c', smoke.command], { cwd, env: process.env });
    const timer = setTimeout(() => {
      timedOut = true;
      // Try graceful, then hard.
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 2_000);
    }, smoke.timeout_seconds * 1_000);

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('close', (code) => { clearTimeout(timer); exitCode = code; resolve(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      stderr += `\n[spawn error] ${(err as Error).message}\n`;
      exitCode = -1;
      resolve();
    });
  });

  const duration = Date.now() - started;
  const header =
    `# Smoke test evidence\n` +
    `# command: ${smoke.command}\n` +
    `# cwd: ${cwd}\n` +
    `# exit_code: ${exitCode}\n` +
    `# expect_exit: ${smoke.expect_exit}\n` +
    (smoke.expect_stdout_match ? `# expect_stdout_match: ${smoke.expect_stdout_match}\n` : '') +
    `# timeout_seconds: ${smoke.timeout_seconds}\n` +
    `# timed_out: ${timedOut}\n` +
    `# duration_ms: ${duration}\n` +
    `# ---\n`;
  const combined = `${header}\n## STDOUT\n${stdout}\n## STDERR\n${stderr}\n`;
  writeFileSync(evidencePath, combined);

  if (timedOut) {
    errors.push(`smoke command exceeded timeout of ${smoke.timeout_seconds}s — see ${evidencePath}`);
  }
  if (exitCode !== smoke.expect_exit && !timedOut) {
    errors.push(
      `smoke command exit ${exitCode} did not match expect_exit ${smoke.expect_exit} — see ${evidencePath}`
    );
  }
  if (smoke.expect_stdout_match) {
    let re: RegExp | null = null;
    try { re = new RegExp(smoke.expect_stdout_match); }
    catch (e) { errors.push(`expect_stdout_match is not a valid regex: ${(e as Error).message}`); }
    if (re && !re.test(stdout)) {
      errors.push(
        `smoke stdout did not match /${smoke.expect_stdout_match}/ — see ${evidencePath}`
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    evidence_path: evidencePath,
    exit_code: exitCode,
    duration_ms: duration,
    timed_out: timedOut,
  };
}

function parseArgs(argv: string[]): { ticket: string; evidenceDir?: string; label?: string } {
  const ticket = argv[2];
  if (!ticket || ticket.startsWith('--')) {
    throw new Error('Usage: tsx smoke-runner.ts <TICKET> [--evidence-dir <dir>] [--label <name>]');
  }
  let evidenceDir: string | undefined;
  let label: string | undefined;
  for (let i = 3; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--evidence-dir') { evidenceDir = argv[++i]; }
    else if (flag === '--label') { label = argv[++i]; }
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return { ticket, evidenceDir, label };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let parsed: { ticket: string; evidenceDir?: string; label?: string };
  try { parsed = parseArgs(process.argv); }
  catch (e) { console.error((e as Error).message); process.exit(2); }
  const root = findProjectRoot();
  const configPath = join(root, '.dev-flow', 'config.yaml');
  if (!existsSync(configPath)) {
    console.error(`config not found at ${configPath} — run /handyman-devflow:setup first`);
    process.exit(2);
  }
  const cfg = loadConfig(configPath);
  const evidenceDir =
    parsed.evidenceDir ?? join(ticketDir(root, parsed.ticket), 'evidence', 'smoke');
  // mkdirSync ensures parent dirs (handles nested evidence/<run>/smoke paths)
  mkdirSync(dirname(evidenceDir), { recursive: true });
  runSmoke({
    cwd: root,
    smoke: cfg.stack.smoke_test,
    evidenceDir,
    label: parsed.label ?? 'smoke',
  }).then((result) => {
    console.log(JSON.stringify(result));
    process.exit(result.ok ? 0 : 1);
  });
}
