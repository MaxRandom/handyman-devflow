import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

const PATH_RE = /`[^`\s]+\.[a-zA-Z0-9]+`|`[^`\s]+\/[^`\s]+`/g;

export function validateResearch(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  if (!/^##\s+Patterns to follow\s*$/mi.test(text)) {
    errors.push('Missing section: ## Patterns to follow');
  }

  const patternsBlock = text.split(/^##\s+Patterns to follow\s*$/mi)[1] ?? '';
  const matches = patternsBlock.match(PATH_RE);
  if (!matches || matches.length === 0) {
    errors.push('Patterns section must cite at least one file path (e.g. `apps/web/foo.ts`)');
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx research.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '02-RESEARCH.md');
  const r = validateResearch(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
