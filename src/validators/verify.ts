import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';
import { findProjectRoot } from '../utils/project-root.js';

const ALLOWED_VERDICTS = ['PASS', 'FAIL', 'UNCLEAR'] as const;
// Match any numbered row (criterion + verdict + evidence cells). Verdict cell is captured as ANY word; we validate against the allow-list separately.
const ROW_RE = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([A-Za-z][A-Za-z_-]*)\s*\|\s*([^|]*?)\s*\|/gm;

export function validateVerify(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  const rows = [...text.matchAll(ROW_RE)];
  if (rows.length === 0) {
    errors.push('No verification table rows found (expected | N | criterion | PASS/FAIL/UNCLEAR | evidence |)');
  }
  for (const row of rows) {
    const rowNum = row[1]!;
    const criterion = row[2]!;
    const verdict = row[3]!;
    if (!ALLOWED_VERDICTS.includes(verdict as typeof ALLOWED_VERDICTS[number])) {
      errors.push(`Row ${rowNum} has invalid verdict (${verdict}) — must be one of ${ALLOWED_VERDICTS.join('/')}: ${criterion.slice(0, 60)}`);
      continue;
    }
    if (verdict !== 'PASS') {
      errors.push(`Row ${rowNum} has non-PASS verdict (${verdict}): ${criterion.slice(0, 60)}`);
    }
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx verify.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(findProjectRoot(), ticket), '06-VERIFICATION.md');
  const r = validateVerify(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
