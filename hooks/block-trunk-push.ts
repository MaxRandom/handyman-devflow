// .dev-flow/hooks/block-trunk-push.ts
import { readFileSync } from 'node:fs';

export interface BashHookInput {
  tool_name?: string;
  tool_input?: { command?: string };
}

export interface BlockDecision {
  block: boolean;
  reason?: string;
}

const TRUNK_PUSH_RE = /\bgit\s+push\b[^|;&]*\borigin\s+(main|master|develop)\b/;
const FORCE_PUSH_RE = /\bgit\s+push\b[^|;&]*\s(?:--force|-f)\b/;
const FORCE_LEASE_RE = /\bgit\s+push\b[^|;&]*\s--force-with-lease\b/;

export function shouldBlock(input: BashHookInput): BlockDecision {
  if (input.tool_name !== 'Bash') return { block: false };
  const cmd = input.tool_input?.command ?? '';

  if (TRUNK_PUSH_RE.test(cmd)) {
    return {
      block: true,
      reason: `Direct push to trunk is forbidden by policy. Open a PR via /task:pr instead. Command: ${cmd}`,
    };
  }
  if (FORCE_PUSH_RE.test(cmd) && !FORCE_LEASE_RE.test(cmd)) {
    return {
      block: true,
      reason: `Force-push without --force-with-lease is forbidden. Use --force-with-lease for safer force-pushes. Command: ${cmd}`,
    };
  }
  return { block: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw = '';
  process.stdin.on('data', (chunk) => { raw += chunk.toString(); });
  process.stdin.on('end', () => {
    let input: BashHookInput;
    try { input = JSON.parse(raw); } catch { process.exit(0); }
    const decision = shouldBlock(input);
    if (decision.block) {
      console.error(decision.reason);
      process.exit(2); // exit 2 blocks the tool call
    }
    process.exit(0);
  });
}
