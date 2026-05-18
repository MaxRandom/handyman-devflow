import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfigValue } from '../src/config-cli.js';

function tmpConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), 'devflow-cfgcli-'));
  const path = join(dir, 'config.yaml');
  writeFileSync(path, `
provider:
  type: github
  mcp_server: atlassian
  workspace: w
  repo: r
  branch_pattern: "feature/{ticket}-{slug}"
  default_base: main
  default_reviewers: [alice, bob]
  default_labels: []
tracker:
  type: jira
  mcp_server: atlassian
  base_url: https://t.atlassian.net
  project_key: PROJ
  pr_transition: "In Review"
stack:
  package_manager: yarn
  test_commands:
    unit: "yarn test"
    e2e: "yarn e2e"
    lint: "yarn lint"
    typecheck: "yarn typecheck"
  areas:
    frontend: { path: "apps/web", framework: nextjs }
`);
  return path;
}

describe('config-cli.getConfigValue', () => {
  it('returns a scalar by dotted path', () => {
    expect(getConfigValue(tmpConfig(), 'provider.default_base')).toBe('main');
  });

  it('returns a nested test command', () => {
    expect(getConfigValue(tmpConfig(), 'stack.test_commands.lint')).toBe('yarn lint');
  });

  it('returns an array', () => {
    expect(getConfigValue(tmpConfig(), 'provider.default_reviewers')).toEqual(['alice', 'bob']);
  });

  it('returns an object', () => {
    const v = getConfigValue(tmpConfig(), 'stack.areas.frontend');
    expect(v).toEqual({ path: 'apps/web', framework: 'nextjs' });
  });

  it('returns undefined for missing path', () => {
    expect(getConfigValue(tmpConfig(), 'provider.nonexistent')).toBeUndefined();
  });

  it('returns undefined for path through a scalar', () => {
    expect(getConfigValue(tmpConfig(), 'provider.default_base.length')).toBeUndefined();
  });
});
