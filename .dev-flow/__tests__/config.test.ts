import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, ConfigSchema } from '../src/config.js';

const validYaml = `
provider:
  type: bitbucket
  mcp_server: atlassian
  workspace: t
  repo: r
  branch_pattern: "feature/{ticket}-{slug}"
  default_base: develop
  default_reviewers: []
  default_labels: []
tracker:
  type: jira
  mcp_server: atlassian
  base_url: https://t.atlassian.net
  project_key: PROJ
  pr_transition: "In Review"
stack:
  package_manager: pnpm
  test_commands:
    unit: "pnpm test"
    integration: "pnpm test:integration"
    e2e: "pnpm test:e2e"
    lint: "pnpm lint"
    typecheck: "pnpm typecheck"
  areas:
    frontend: { path: "apps/web", framework: nextjs }
    backend:  { path: "apps/api", framework: nestjs }
    services: { path: "services/*" }
    e2e:      { path: "e2e", framework: playwright }
`;

function tmpConfig(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'devflow-config-'));
  const path = join(dir, 'config.yaml');
  writeFileSync(path, yaml);
  return path;
}

describe('config', () => {
  it('parses a valid config', () => {
    const cfg = loadConfig(tmpConfig(validYaml));
    expect(cfg.provider.type).toBe('bitbucket');
    expect(cfg.tracker.project_key).toBe('PROJ');
    expect(cfg.stack.areas.frontend.framework).toBe('nextjs');
  });

  it('rejects missing provider', () => {
    const yaml = validYaml.replace(/provider:[\s\S]*?tracker:/, 'tracker:');
    expect(() => loadConfig(tmpConfig(yaml))).toThrow(/provider/);
  });

  it('rejects unknown provider type', () => {
    const yaml = validYaml.replace('type: bitbucket', 'type: svn');
    expect(() => loadConfig(tmpConfig(yaml))).toThrow();
  });

  it('schema accepts both bitbucket and github', () => {
    expect(ConfigSchema.shape.provider.shape.type.options).toContain('bitbucket');
    expect(ConfigSchema.shape.provider.shape.type.options).toContain('github');
  });
});
