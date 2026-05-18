import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const FrameworkArea = z.object({
  path: z.string(),
  framework: z.string().optional(),
});

const SmokeTest = z.object({
  command: z.string().min(1, 'stack.smoke_test.command must be a non-empty shell command — see templates/config.yaml.example for project-type guidance'),
  expect_exit: z.number().int().default(0),
  expect_stdout_match: z.string().optional(),
  timeout_seconds: z.number().int().positive().default(60),
});

export type SmokeTestConfig = z.infer<typeof SmokeTest>;

export const ConfigSchema = z.object({
  provider: z.object({
    type: z.enum(['bitbucket', 'github', 'gitlab']),
    mcp_server: z.string(),
    workspace: z.string(),
    repo: z.string(),
    branch_pattern: z.string().default('feature/{ticket}-{slug}'),
    default_base: z.string().default('develop'),
    default_reviewers: z.array(z.string()).default([]),
    default_labels: z.array(z.string()).default([]),
  }),
  // Tracker is OPTIONAL. Omit when there is no Jira/Linear ticket — solo work,
  // experimental scripts, OSS projects without an issue tracker, etc. In that
  // mode `/handyman-devflow:start` accepts a freeform title; the workflow
  // generates a local ticket id (slug-based) and skips all MCP calls.
  tracker: z.object({
    type: z.enum(['jira', 'linear']),
    mcp_server: z.string(),
    base_url: z.string().url(),
    project_key: z.string(),
    pr_transition: z.string().default('In Review'),
  }).optional(),
  stack: z.object({
    package_manager: z.enum(['npm', 'pnpm', 'yarn', 'bun']).default('pnpm'),
    test_commands: z.object({
      unit: z.string(),
      integration: z.string().optional(),
      e2e: z.string().optional(),
      lint: z.string(),
      typecheck: z.string(),
    }),
    smoke_test: SmokeTest,
    e2e_output_dir: z.string().default('test-results'),
    areas: z.record(z.string(), FrameworkArea),
  }),
  workflow: z.object({
    verify_max_attempts: z.number().int().positive().default(3),
    // When true (the default), `/handyman-devflow:start` runs the WHOLE flow:
    // it executes Phase 1, then chains through research → plan → implement →
    // test → verify → security → PR, stopping only on a blocker (validator
    // failure, smoke failure, verify-loop exhaustion, security finding, or
    // open [NEEDS-ANSWER] markers requiring human input). Set to false to
    // recover the legacy per-phase manual flow.
    autopilot: z.boolean().default(true),
  }).default({ verify_max_attempts: 3, autopilot: true }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path: string): Config {
  const raw = readFileSync(path, 'utf8');
  const parsed = parseYaml(raw);
  return ConfigSchema.parse(parsed);
}
