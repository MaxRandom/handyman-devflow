// src/state-cli.ts — thin CLI on top of state.ts for slash commands.
//
// Usage:
//   tsx state-cli.ts get <TICKET> [<field>]
//   tsx state-cli.ts increment-verify-attempt <TICKET>
//   tsx state-cli.ts reset-verify-attempts <TICKET>
//
// `get <TICKET>` prints the full state as JSON. With a field name (e.g.
// `verify_attempts`), prints just that field's value.

import {
  loadState,
  incrementVerifyAttempt,
  resetVerifyAttempts,
  type State,
} from './state.js';
import { findProjectRoot } from './utils/project-root.js';

function usage(): never {
  console.error('Usage:');
  console.error('  tsx state-cli.ts get <TICKET> [<field>]');
  console.error('  tsx state-cli.ts increment-verify-attempt <TICKET>');
  console.error('  tsx state-cli.ts reset-verify-attempts <TICKET>');
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const ticket = process.argv[3];
  if (!cmd || !ticket) usage();
  const root = findProjectRoot();

  if (cmd === 'get') {
    const field = process.argv[4];
    const s = loadState(root, ticket);
    if (field) {
      const v = (s as unknown as Record<string, unknown>)[field];
      if (v === undefined) { console.error(`state field not found: ${field}`); process.exit(1); }
      process.stdout.write(typeof v === 'object' ? JSON.stringify(v) : String(v));
    } else {
      process.stdout.write(JSON.stringify(s satisfies State));
    }
    process.exit(0);
  }

  if (cmd === 'increment-verify-attempt') {
    const n = incrementVerifyAttempt(root, ticket);
    process.stdout.write(String(n));
    process.exit(0);
  }

  if (cmd === 'reset-verify-attempts') {
    resetVerifyAttempts(root, ticket);
    process.exit(0);
  }

  usage();
}
