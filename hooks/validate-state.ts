// .dev-flow/hooks/validate-state.ts
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { StateSchema } from '../src/state.js';

export interface StopHookInput {
  cwd?: string;
}

export interface ValidationWarning {
  path: string;
  reason: string;
}

export function findStateFiles(root: string): string[] {
  const ticketsDir = join(root, 'tickets');
  if (!existsSync(ticketsDir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(ticketsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(ticketsDir, entry.name, 'state.json');
    if (existsSync(candidate)) out.push(candidate);
  }
  return out;
}

export function validateStateFile(path: string): ValidationWarning | null {
  let raw: string;
  try { raw = readFileSync(path, 'utf8'); } catch (e) {
    return { path, reason: `unreadable: ${(e as Error).message}` };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch (e) {
    return { path, reason: `invalid JSON: ${(e as Error).message}` };
  }
  const result = StateSchema.safeParse(parsed);
  if (!result.success) {
    return { path, reason: `schema violation: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw = '';
  process.stdin.on('data', (chunk) => { raw += chunk.toString(); });
  process.stdin.on('end', () => {
    let input: StopHookInput;
    try { input = JSON.parse(raw); } catch { process.exit(0); }
    const cwd = input.cwd ?? process.cwd();
    const warnings: ValidationWarning[] = [];
    for (const file of findStateFiles(cwd)) {
      const w = validateStateFile(file);
      if (w) warnings.push(w);
    }
    if (warnings.length > 0) {
      console.error(`state.json validation warnings (${warnings.length}):`);
      for (const w of warnings) console.error(`  - ${w.path}: ${w.reason}`);
    }
    process.exit(0);
  });
}
