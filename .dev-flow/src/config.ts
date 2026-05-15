import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const FrameworkArea = z.object({
  path: z.string(),
  framework: z.string().optional(),
});

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
  tracker: z.object({
    type: z.enum(['jira', 'linear']),
    mcp_server: z.string(),
    base_url: z.string().url(),
    project_key: z.string(),
    pr_transition: z.string().default('In Review'),
  }),
  stack: z.object({
    package_manager: z.enum(['npm', 'pnpm', 'yarn', 'bun']).default('pnpm'),
    test_commands: z.object({
      unit: z.string(),
      integration: z.string().optional(),
      e2e: z.string(),
      lint: z.string(),
      typecheck: z.string(),
    }),
    areas: z.record(z.string(), FrameworkArea),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(path: string): Config {
  const raw = readFileSync(path, 'utf8');
  const parsed = parseYaml(raw);
  return ConfigSchema.parse(parsed);
}
