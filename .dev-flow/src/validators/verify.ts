import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

export function validateVerify(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  const rows = [...text.matchAll(/^\|\s*\d+\s*\|.*?\|\s*(PASS|FAIL|UNCLEAR)\s*\|.*?\|/gm)];
  if (rows.length === 0) {
    errors.push('No verification table rows found (expected | N | criterion | PASS/FAIL/UNCLEAR | evidence |)');
  }
  for (const row of rows) {
    const verdict = row[1];
    if (verdict !== 'PASS') errors.push(`Row has non-PASS verdict (${verdict}): ${row[0].slice(0, 80)}...`);
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx verify.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '06-VERIFICATION.md');
  const r = validateVerify(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
