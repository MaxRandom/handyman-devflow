import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

const REQUIRED_SECTIONS = ['Understood requirements', 'Open questions', 'Affected areas'];

export function validateIntake(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    const re = new RegExp(`^##\\s+${section}\\s*$`, 'mi');
    if (!re.test(text)) errors.push(`Missing section: ## ${section}`);
  }

  const needsAnswerMatches = text.match(/\[NEEDS-ANSWER[^\]]*\]/g);
  if (needsAnswerMatches && needsAnswerMatches.length > 0) {
    errors.push(`Unresolved [NEEDS-ANSWER] markers: ${needsAnswerMatches.length}`);
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx intake.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '01-INTAKE.md');
  const r = validateIntake(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
