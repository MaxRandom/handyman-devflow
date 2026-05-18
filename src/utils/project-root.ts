import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function findProjectRoot(start: string = process.cwd()): string {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, '.dev-flow', 'config.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Project root (containing .dev-flow/config.yaml) not found from ${start}`);
    }
    dir = parent;
  }
}
