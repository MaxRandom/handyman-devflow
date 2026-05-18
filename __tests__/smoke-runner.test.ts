import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSmoke } from '../src/smoke-runner.js';

let workdir: string;
let evidenceDir: string;
beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'devflow-smoke-run-'));
  evidenceDir = join(workdir, 'evidence');
});
afterEach(() => rmSync(workdir, { recursive: true, force: true }));

describe('smoke-runner — real-condition execution (no spawn mocks)', () => {
  it('passes when the command exits 0 and stdout matches the regex', async () => {
    const r = await runSmoke({
      cwd: workdir,
      smoke: {
        command: 'echo "SMOKE OK" && true',
        expect_exit: 0,
        expect_stdout_match: 'SMOKE OK',
        timeout_seconds: 5,
      },
      evidenceDir,
      label: 'smoke',
    });
    expect(r.ok).toBe(true);
    expect(r.exit_code).toBe(0);
    expect(r.timed_out).toBe(false);
    const log = readFileSync(r.evidence_path, 'utf8');
    expect(log).toContain('SMOKE OK');
    expect(log).toContain('# exit_code: 0');
  });

  it('fails when the command exits non-zero', async () => {
    const r = await runSmoke({
      cwd: workdir,
      smoke: {
        command: 'echo "boot failed" && exit 7',
        expect_exit: 0,
        timeout_seconds: 5,
      },
      evidenceDir,
      label: 'smoke',
    });
    expect(r.ok).toBe(false);
    expect(r.exit_code).toBe(7);
    expect(r.errors.some((e) => /exit 7 did not match expect_exit 0/.test(e))).toBe(true);
  });

  it('fails when stdout does not match the expected regex', async () => {
    const r = await runSmoke({
      cwd: workdir,
      smoke: {
        command: 'echo "different output"',
        expect_exit: 0,
        expect_stdout_match: 'SMOKE OK',
        timeout_seconds: 5,
      },
      evidenceDir,
      label: 'smoke',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /did not match \/SMOKE OK\//.test(e))).toBe(true);
  });

  it('fails on timeout — the killed process is reported as timed_out', async () => {
    const r = await runSmoke({
      cwd: workdir,
      // Use `sleep 10` which exceeds the 1s timeout. The runner SIGTERMs then SIGKILLs.
      smoke: {
        command: 'sleep 10',
        expect_exit: 0,
        timeout_seconds: 1,
      },
      evidenceDir,
      label: 'smoke',
    });
    expect(r.ok).toBe(false);
    expect(r.timed_out).toBe(true);
    expect(r.errors.some((e) => /exceeded timeout of 1s/.test(e))).toBe(true);
  }, 10_000);

  it('writes evidence to <evidenceDir>/<label>.log with header metadata + stdout + stderr', async () => {
    const r = await runSmoke({
      cwd: workdir,
      smoke: {
        command: 'echo OUT1 && echo OUT2 1>&2 && true',
        expect_exit: 0,
        timeout_seconds: 5,
      },
      evidenceDir,
      label: 'impl-smoke',
    });
    expect(r.ok).toBe(true);
    expect(r.evidence_path).toBe(join(evidenceDir, 'impl-smoke.log'));
    const log = readFileSync(r.evidence_path, 'utf8');
    expect(log).toContain('## STDOUT');
    expect(log).toContain('OUT1');
    expect(log).toContain('## STDERR');
    expect(log).toContain('OUT2');
  });

  it('honors a non-zero expect_exit (some commands legitimately exit non-zero on success)', async () => {
    const r = await runSmoke({
      cwd: workdir,
      smoke: {
        command: 'exit 2',
        expect_exit: 2,
        timeout_seconds: 5,
      },
      evidenceDir,
      label: 'smoke',
    });
    expect(r.ok).toBe(true);
    expect(r.exit_code).toBe(2);
  });
});
