import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

interface Row { severity: string; subject: string; status: string; reason: string; }

const ROW_RE = /^\|\s*(\w+)\s*\|\s*([^|]+?)\s*\|\s*(\w+)\s*\|\s*([^|]*?)\s*\|/gm;

export function validateSecurity(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  const rows: Row[] = [...text.matchAll(ROW_RE)]
    .map((m) => ({ severity: m[1]!.toLowerCase(), subject: m[2]!, status: m[3]!.toLowerCase(), reason: (m[4] ?? '').trim() }))
    .filter((r) => ['low', 'moderate', 'high', 'critical'].includes(r.severity));

  for (const r of rows) {
    if ((r.severity === 'high' || r.severity === 'critical') && r.status === 'open') {
      errors.push(`Open ${r.severity} finding: ${r.subject}`);
    }
    if (r.status === 'waived' && r.reason === '') {
      errors.push(`Waived finding has no reason: ${r.subject}`);
    }
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx security.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '07-SECURITY.md');
  const r = validateSecurity(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
