// src/auto-cli.ts — thin CLI that prints the autopilot's next decision.
//
// Usage:
//   tsx auto-cli.ts next <TICKET>
//
// Stdout is a single line in one of three shapes (see auto.ts `renderDecision`):
//   RUN:<command>       — invoke /handyman-devflow:<command> next
//   DONE                — cycle complete (pr-opened)
//   BLOCKED:<reason>    — pause; surface reason to the human
//
// Exit code:
//   0 — RUN or DONE (autopilot continues or finishes cleanly)
//   1 — BLOCKED (caller should print the reason and stop chaining)
//   2 — misuse (bad args, config or state missing)

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadState } from './state.js';
import { loadConfig } from './config.js';
import { findProjectRoot } from './utils/project-root.js';
import { nextPhase, renderDecision } from './auto.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const ticket = process.argv[3];
  if (cmd !== 'next' || !ticket) {
    console.error('Usage: tsx auto-cli.ts next <TICKET>');
    process.exit(2);
  }

  let root: string;
  try { root = findProjectRoot(); }
  catch (e) { console.error((e as Error).message); process.exit(2); }

  const configPath = join(root, '.dev-flow', 'config.yaml');
  if (!existsSync(configPath)) {
    console.error(`config not found at ${configPath} — run /handyman-devflow:setup first`);
    process.exit(2);
  }
  const config = loadConfig(configPath);

  let state;
  try { state = loadState(root, ticket); }
  catch (e) { console.error((e as Error).message); process.exit(2); }

  const decision = nextPhase(state, config);
  process.stdout.write(renderDecision(decision));
  process.exit(decision.kind === 'blocked' ? 1 : 0);
}
