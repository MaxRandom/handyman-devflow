import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

const URL_RE = /\*\*URL:\*\*\s+(https?:\/\/\S+)/i;
const TRANSITION_RE = /\*\*Jira transition:\*\*[^\n]*succeeded/i;

export function validatePR(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  if (!URL_RE.test(text)) errors.push('Missing **URL:** <pr-url> line');
  if (!TRANSITION_RE.test(text)) errors.push('Missing or unsuccessful **Jira transition:** line');

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx pr.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '08-PR.md');
  const r = validatePR(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
