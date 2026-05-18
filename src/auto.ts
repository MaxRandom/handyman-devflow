// src/auto.ts — pure state-machine derivation for the autopilot.
//
// Given the current ticket state + config, `nextPhase` returns one of:
//   { kind: 'run', command: '<phase-slug>' }  — invoke the corresponding slash command
//   { kind: 'done' }                          — cycle complete, no further action
//   { kind: 'blocked', reason: string }       — pause and surface to the human
//
// The autopilot's outer loop (in commands/start.md) calls this between phases
// to decide what to do next. Keeping the logic in TypeScript (and pure) means
// it's unit-testable and the slash command stays a thin recipe.

import type { State } from './state.js';
import type { Config } from './config.js';

export type NextPhaseDecision =
  | { kind: 'run'; command: PhaseCommand }
  | { kind: 'done' }
  | { kind: 'blocked'; reason: string };

export type PhaseCommand =
  | 'start'
  | 'research'
  | 'plan'
  | 'implement'
  | 'test'
  | 'verify'
  | 'security'
  | 'pr';

export function nextPhase(state: State, config: Config): NextPhaseDecision {
  // Any phase that records a hard error pauses the autopilot. The verify loop
  // does NOT set last_error on its inner retries — it only sets it when the
  // retry cap exhausts. So a non-null last_error always means human input.
  if (state.last_error !== null) {
    return { kind: 'blocked', reason: `last_error set: ${state.last_error}` };
  }

  // The verify-loop attempts counter is a separate guard. If a slash command
  // resets phase to plan-complete without clearing the counter AND the counter
  // is at the cap, we're stuck: nothing left to retry.
  if (
    state.phase === 'plan-complete' &&
    state.verify_attempts >= config.workflow.verify_max_attempts
  ) {
    return {
      kind: 'blocked',
      reason: `verify exhausted ${state.verify_attempts} attempts (cap = ${config.workflow.verify_max_attempts})`,
    };
  }

  switch (state.phase) {
    case 'init':
    case 'intake-drafted':
      // The intake artifact exists but the validator isn't satisfied yet
      // ([NEEDS-ANSWER] markers, missing sections). Human input needed.
      return state.phase === 'init'
        ? { kind: 'run', command: 'start' }
        : { kind: 'blocked', reason: '01-INTAKE.md draft has unanswered questions or fails the validator — answer the [NEEDS-ANSWER] markers and re-run /handyman-devflow:start' };

    case 'intake-complete':
      return { kind: 'run', command: 'research' };

    case 'research-complete':
      return { kind: 'run', command: 'plan' };

    case 'plan-complete':
      return { kind: 'run', command: 'implement' };

    case 'implementation-complete':
      return { kind: 'run', command: 'test' };

    case 'tests-complete':
      return { kind: 'run', command: 'verify' };

    case 'verified':
      return { kind: 'run', command: 'security' };

    case 'security-reviewed':
      return { kind: 'run', command: 'pr' };

    case 'pr-opened':
      return { kind: 'done' };

    default: {
      // Exhaustiveness check — TS will complain if a new phase is added without
      // a case above.
      const _exhaustive: never = state.phase;
      void _exhaustive;
      return { kind: 'blocked', reason: `unknown phase: ${(state as State).phase}` };
    }
  }
}

// Render a decision as a single-line, machine-parseable string for the CLI.
// Format:
//   RUN:<command>
//   DONE
//   BLOCKED:<reason>
export function renderDecision(decision: NextPhaseDecision): string {
  if (decision.kind === 'run') return `RUN:${decision.command}`;
  if (decision.kind === 'done') return 'DONE';
  return `BLOCKED:${decision.reason}`;
}
