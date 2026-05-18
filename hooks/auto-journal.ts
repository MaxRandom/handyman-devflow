// .dev-flow/hooks/auto-journal.ts
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, relative, isAbsolute, join } from 'node:path';

export interface HookInput {
  tool_name?: string;
  tool_input?: { file_path?: string };
  cwd?: string;
}

export interface JournalAction {
  ticket: string;
  filename: string;
}

export function deriveJournalAction(input: HookInput): JournalAction | null {
  if (input.tool_name !== 'Write') return null;
  const filePath = input.tool_input?.file_path;
  if (!filePath) return null;
  const cwd = input.cwd ?? process.cwd();

  // Normalize to a relative path under cwd
  const rel = isAbsolute(filePath) ? relative(cwd, filePath) : filePath;
  const m = rel.match(/^tickets\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { ticket: m[1]!, filename: basename(m[2]!) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw = '';
  process.stdin.on('data', (chunk) => { raw += chunk.toString(); });
  process.stdin.on('end', () => {
    let input: HookInput;
    try { input = JSON.parse(raw); } catch { process.exit(0); }
    const action = deriveJournalAction(input);
    if (!action) { process.exit(0); }
    const cwd = input.cwd ?? process.cwd();
    const result = spawnSync('npx', [
      'tsx', 'src/journal-cli.ts',
      action.ticket, 'auto', `wrote-${action.filename}`, 'ok',
    ], { cwd: join(cwd, '.dev-flow'), encoding: 'utf8' });
    if (result.status !== 0) {
      // Don't fail the hook on journal errors — just log.
      console.error(`auto-journal: failed to record write of ${action.filename} for ${action.ticket}: ${result.stderr}`);
    }
    process.exit(0);
  });
}
