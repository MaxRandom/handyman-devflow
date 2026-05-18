import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { findProjectRoot } from '../utils/project-root.js';
import { ticketDir } from '../state.js';

// Required layers — must be present AND PASS.
// "Smoke" is the universal real-condition floor: every project, every phase
// run, no opt-out. "Unit" is the cheap correctness gate.
const REQUIRED_LAYERS = ['Unit', 'Smoke'] as const;
// Allowed but skippable. E2E may be SKIPPED when stack.test_commands.e2e is unset.
// Integration may be SKIPPED when no backend area changed.
const SKIPPABLE_LAYERS = ['Integration', 'E2E'] as const;

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
    const resultLine = matchResultLine(block);
    if (!resultLine) {
      errors.push(`${layer} missing Result: PASS|FAIL marker`);
      continue;
    }
    if (resultLine === 'FAIL') errors.push(`${layer} Result is FAIL`);
    else if (resultLine === 'SKIPPED') {
      errors.push(`${layer} Result is SKIPPED — this layer cannot be skipped (it is the real-condition floor)`);
    }
    else if (resultLine !== 'PASS') {
      errors.push(`${layer} invalid Result verdict (${resultLine}) — must be PASS|FAIL`);
    }
    if (!/```[\s\S]*?```/m.test(block)) {
      errors.push(`${layer} missing raw output code block`);
    }
    if (layer === 'Smoke') {
      // The smoke evidence path is mandatory — proves the smoke runner actually
      // wrote a log under tickets/<ticket>/evidence/.
      if (!/evidence\/[\w\-/.]+/.test(block)) {
        errors.push(`Smoke missing evidence/ artifact reference (smoke.log path)`);
      }
    }
  }

  for (const layer of SKIPPABLE_LAYERS) {
    const layerRe = new RegExp(`^##\\s+${layer}\\s*$`, 'mi');
    if (!layerRe.test(text)) continue;
    const block = sectionBlock(text, layer);
    const resultLine = matchResultLine(block);
    if (!resultLine) {
      errors.push(`${layer} present but missing Result: PASS|FAIL|SKIPPED marker`);
      continue;
    }
    if (resultLine === 'FAIL') errors.push(`${layer} Result is FAIL`);
    else if (resultLine !== 'PASS' && resultLine !== 'SKIPPED') {
      errors.push(`${layer} invalid Result verdict (${resultLine}) — must be PASS|FAIL|SKIPPED`);
    }
    if (layer === 'E2E' && resultLine === 'PASS') {
      if (!/evidence\/[\w\-/.]+/.test(block)) {
        errors.push(`E2E missing evidence/ artifact reference (trace or screenshot)`);
      }
    }
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

function matchResultLine(block: string): string | null {
  const m = block.match(/^###\s+Result:\s*([A-Za-z]+)/mi);
  return m ? m[1]!.toUpperCase() : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx test.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(findProjectRoot(), ticket), '05-TEST-EVIDENCE.md');
  const r = validateTestEvidence(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
