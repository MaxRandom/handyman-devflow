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
  smoke_test:
    command: "pnpm build && node dist/cli.js --help"
    expect_exit: 0
    expect_stdout_match: "Usage:"
    timeout_seconds: 60
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

  it('e2e_output_dir defaults to "test-results" when not specified', () => {
    const cfg = loadConfig(tmpConfig(validYaml));
    expect(cfg.stack.e2e_output_dir).toBe('test-results');
  });

  it('e2e_output_dir honors explicit value', () => {
    const yaml = validYaml.replace(
      'areas:',
      'e2e_output_dir: "playwright-out"\n  areas:'
    );
    const cfg = loadConfig(tmpConfig(yaml))
    expect(cfg.stack.e2e_output_dir).toBe('playwright-out');
  });

  it('rejects a config with no smoke_test — the real-condition floor is mandatory', () => {
    const yaml = validYaml.replace(/  smoke_test:[\s\S]*?timeout_seconds: 60\n/, '');
    expect(() => loadConfig(tmpConfig(yaml))).toThrow(/smoke_test/);
  });

  it('rejects an empty smoke_test.command', () => {
    const yaml = validYaml.replace('command: "pnpm build && node dist/cli.js --help"', 'command: ""');
    expect(() => loadConfig(tmpConfig(yaml))).toThrow(/non-empty shell command/);
  });

  it('smoke_test.expect_exit defaults to 0 and timeout_seconds to 60', () => {
    const yaml = validYaml
      .replace('    expect_exit: 0\n', '')
      .replace('    timeout_seconds: 60\n', '');
    const cfg = loadConfig(tmpConfig(yaml));
    expect(cfg.stack.smoke_test.expect_exit).toBe(0);
    expect(cfg.stack.smoke_test.timeout_seconds).toBe(60);
  });

  it('e2e test_command is optional (project without an e2e suite is still valid)', () => {
    const yaml = validYaml.replace('    e2e: "pnpm test:e2e"\n', '');
    const cfg = loadConfig(tmpConfig(yaml));
    expect(cfg.stack.test_commands.e2e).toBeUndefined();
    expect(cfg.stack.smoke_test.command).toContain('pnpm build');
  });

  it('workflow.verify_max_attempts defaults to 3 when omitted', () => {
    const cfg = loadConfig(tmpConfig(validYaml));
    expect(cfg.workflow.verify_max_attempts).toBe(3);
  });

  it('workflow.verify_max_attempts honors explicit value', () => {
    const yaml = validYaml + '\nworkflow:\n  verify_max_attempts: 5\n';
    const cfg = loadConfig(tmpConfig(yaml));
    expect(cfg.workflow.verify_max_attempts).toBe(5);
  });

  it('rejects a non-positive workflow.verify_max_attempts', () => {
    const yaml = validYaml + '\nworkflow:\n  verify_max_attempts: 0\n';
    expect(() => loadConfig(tmpConfig(yaml))).toThrow();
  });

  it('tracker block is OPTIONAL — config parses with the entire tracker section omitted (local-ticket mode)', () => {
    const yaml = validYaml.replace(/tracker:[\s\S]*?pr_transition:[^\n]*\n/, '');
    const cfg = loadConfig(tmpConfig(yaml));
    expect(cfg.tracker).toBeUndefined();
    // Everything else still parses normally — smoke_test, provider, stack, workflow.
    expect(cfg.stack.smoke_test.command).toContain('pnpm build');
    expect(cfg.workflow.verify_max_attempts).toBe(3);
  });

  it('tracker block parses when present (tracker mode still works)', () => {
    const cfg = loadConfig(tmpConfig(validYaml));
    expect(cfg.tracker?.type).toBe('jira');
    expect(cfg.tracker?.project_key).toBe('PROJ');
  });
});
