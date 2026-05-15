import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { findProjectRoot } from '../utils/project-root.js';
import { ticketDir } from '../state.js';

const PATH_RE = /`[^`\s]+\.[a-zA-Z0-9]+`|`[^`\s]+\/[^`\s]+`/g;

function extractSection(text: string, heading: string): string {
  const headingRe = new RegExp(`^##\\s+${heading}\\s*$`, 'mi');
  const m = headingRe.exec(text);
  if (!m) return '';
  const after = text.slice(m.index + m[0].length);
  const nextHeading = after.search(/^##\s+/m);
  return nextHeading === -1 ? after : after.slice(0, nextHeading);
}

export function validateResearch(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  const sectionMissing = !/^##\s+Patterns to follow\s*$/mi.test(text);
  if (sectionMissing) {
    errors.push('Missing section: ## Patterns to follow');
  } else {
    const patternsBlock = extractSection(text, 'Patterns to follow');
    const matches = patternsBlock.match(PATH_RE);
    if (!matches || matches.length === 0) {
      errors.push('Patterns section must cite at least one file path (e.g. `apps/web/foo.ts`)');
    }
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx research.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(findProjectRoot(), ticket), '02-RESEARCH.md');
  const r = validateResearch(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
