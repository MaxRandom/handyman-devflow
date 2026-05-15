import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

export function validatePlan(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  if (!/^##\s+Test plan\s*$/mi.test(text)) {
    errors.push('Missing section: ## Test plan');
  }

  const taskHeadings = [...text.matchAll(/^###\s+Task\s+\d+:.*$/gm)];
  if (taskHeadings.length === 0) {
    errors.push('Plan must define at least one ### Task N: ... heading');
  }

  for (const m of taskHeadings) {
    const after = text.slice(m.index! + m[0].length);
    const nextHeading = after.search(/^(##\s+|###\s+)/m);
    const block = nextHeading === -1 ? after : after.slice(0, nextHeading);
    if (!/\*\*Acceptance criteria:\*\*/i.test(block)) {
      errors.push(`Task is missing **Acceptance criteria:** — ${m[0]}`);
    }
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx plan.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '03-PLAN.md');
  const r = validatePlan(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
