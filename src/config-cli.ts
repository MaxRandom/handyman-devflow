// src/config-cli.ts — CLI wrapper for reading config.yaml values by dotted path
import { loadConfig } from './config.js';
import { findProjectRoot } from './utils/project-root.js';
import { join } from 'node:path';

export function getConfigValue(configPath: string, dottedPath: string): unknown {
  const config = loadConfig(configPath);
  return dottedPath.split('.').reduce<unknown>((obj, key) => {
    if (obj && typeof obj === 'object' && key in (obj as Record<string, unknown>)) {
      return (obj as Record<string, unknown>)[key];
    }
    return undefined;
  }, config);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const dottedPath = process.argv[3];

  if (cmd !== 'get' || !dottedPath) {
    console.error('Usage: tsx config-cli.ts get <dotted.path>');
    console.error('Example: tsx config-cli.ts get provider.default_base');
    process.exit(2);
  }

  let root: string;
  try {
    root = findProjectRoot();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const configPath = join(root, '.dev-flow', 'config.yaml');
  let value: unknown;
  try {
    value = getConfigValue(configPath, dottedPath);
  } catch (e) {
    console.error(`Error loading config from ${configPath}: ${(e as Error).message}`);
    process.exit(1);
  }

  if (value === undefined) {
    console.error(`Config path not found: ${dottedPath}`);
    process.exit(1);
  }
  if (typeof value === 'object' && value !== null) {
    process.stdout.write(JSON.stringify(value));
  } else {
    process.stdout.write(String(value));
  }
}
