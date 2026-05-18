import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';
import { findProjectRoot } from '../utils/project-root.js';

interface Row { severity: string; subject: string; status: string; reason: string; }

const ALLOWED_STATUSES = ['open', 'resolved', 'waived'] as const;
const ROW_RE = /^\|\s*(\w+)\s*\|\s*([^|]+?)\s*\|\s*(\w+)\s*\|\s*([^|]*?)\s*\|/gm;

export function validateSecurity(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  const rows: Row[] = [...text.matchAll(ROW_RE)]
    .map((m) => ({ severity: m[1]!.toLowerCase(), subject: m[2]!, status: m[3]!.toLowerCase(), reason: (m[4] ?? '').trim() }))
    .filter((r) => ['low', 'moderate', 'high', 'critical'].includes(r.severity));

  for (const r of rows) {
    if (!ALLOWED_STATUSES.includes(r.status as typeof ALLOWED_STATUSES[number])) {
      errors.push(`Row has invalid status (${r.status}) — must be one of ${ALLOWED_STATUSES.join('/')}: ${r.subject}`);
      continue;
    }
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
  const path = join(ticketDir(findProjectRoot(), ticket), '07-SECURITY.md');
  const r = validateSecurity(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
