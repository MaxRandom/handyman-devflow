import { append } from './journal.js';
import { findProjectRoot } from './utils/project-root.js';

const [ticket, phase, step, status, ...rest] = process.argv.slice(2);
if (!ticket || !phase || !step || !status) {
  console.error('Usage: tsx journal-cli.ts <TICKET> <PHASE> <STEP> <STATUS> [details...]');
  process.exit(2);
}
const details = rest.length > 0 ? rest.join(' ') : undefined;
append(findProjectRoot(), ticket, { phase, step, status: status as 'ok' | 'fail' | 'skip', details });
console.log('journaled');
