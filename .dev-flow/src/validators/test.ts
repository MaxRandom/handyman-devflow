import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { ticketDir } from '../state.js';

const REQUIRED_LAYERS = ['Unit', 'E2E'];
const OPTIONAL_LAYERS = ['Integration'];

export function validateTestEvidence(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  for (const layer of REQUIRED_LAYERS) {
    const layerRe = new RegExp(`^##\\s+${layer}\\s*$`, 'mi');
    if (!layerRe.test(text)) {
      errors.push(`Missing required layer section: ## ${layer}`);
      continue;
    }
    const block = sectionBlock(text, layer);
    if (/^###\s+Result:\s*FAIL/mi.test(block)) {
      errors.push(`${layer} Result is FAIL`);
    } else if (!/^###\s+Result:\s*PASS/mi.test(block)) {
      errors.push(`${layer} missing Result: PASS marker`);
    }
    if (!/```[\s\S]*?```/m.test(block)) {
      errors.push(`${layer} missing raw output code block`);
    }
    if (layer === 'E2E') {
      if (!/evidence\/[\w\-/.]+/.test(block)) {
        errors.push(`E2E missing evidence/ artifact reference (trace or screenshot)`);
      }
    }
  }

  for (const layer of OPTIONAL_LAYERS) {
    const layerRe = new RegExp(`^##\\s+${layer}\\s*$`, 'mi');
    if (!layerRe.test(text)) continue;
    const block = sectionBlock(text, layer);
    if (/^###\s+Result:\s*FAIL/mi.test(block)) errors.push(`${layer} Result is FAIL`);
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

function sectionBlock(text: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'mi');
  const m = text.match(re);
  if (!m) return '';
  const after = text.slice(m.index! + m[0].length);
  const next = after.search(/^##\s+/m);
  return next === -1 ? after : after.slice(0, next);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx test.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(process.cwd(), ticket), '05-TEST-EVIDENCE.md');
  const r = validateTestEvidence(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
