import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type ValidatorResult } from '../utils/validator-result.js';
import { findProjectRoot } from '../utils/project-root.js';
import { ticketDir } from '../state.js';

const URL_RE = /\*\*URL:\*\*\s+(https?:\/\/\S+)/i;
// In tracker mode the artifact must claim the Jira transition succeeded.
const TRANSITION_OK_RE = /\*\*Jira transition:\*\*[^\n]*succeeded/i;
const TRANSITION_PRESENT_RE = /\*\*Jira transition:\*\*/i;
// In local-ticket mode the artifact instead records that no tracker is configured.
const TRACKER_NONE_RE = /\*\*Tracker:\*\*[^\n]*\(\s*none[\s\S]*?\)/i;

export function validatePR(filePath: string): ValidatorResult {
  if (!existsSync(filePath)) return fail(`File not found: ${filePath}`);
  const text = readFileSync(filePath, 'utf8');
  const errors: string[] = [];

  if (!URL_RE.test(text)) errors.push('Missing **URL:** <pr-url> line');

  // Either a successful Jira transition OR an explicit local-ticket marker must be present.
  // This keeps the validator strict about provenance while supporting the tracker-optional flow.
  const hasTransitionLine = TRANSITION_PRESENT_RE.test(text);
  const hasTrackerNone = TRACKER_NONE_RE.test(text);
  if (!hasTransitionLine && !hasTrackerNone) {
    errors.push(
      'Missing tracker provenance line — expected either "**Jira transition:** ... succeeded" (tracker mode) or "**Tracker:** (none — ...)" (local-ticket mode)'
    );
  } else if (hasTransitionLine && !TRANSITION_OK_RE.test(text)) {
    errors.push('**Jira transition:** line present but does not say "succeeded"');
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ticket = process.argv[2];
  if (!ticket) { console.error('Usage: tsx pr.ts <TICKET>'); process.exit(2); }
  const path = join(ticketDir(findProjectRoot(), ticket), '08-PR.md');
  const r = validatePR(path);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
