import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ScaffoldConfig } from './types';

export function loadConfig(repoRoot: string): ScaffoldConfig {
  const configPath = path.join(repoRoot, '.scaffold-config.yml');

  if (!fs.existsSync(configPath)) {
    throw new Error(`.scaffold-config.yml not found in ${repoRoot}. Create this file first. See README for template.`);
  }

  const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;

  if (!raw.framework || !['angular', 'react'].includes(raw.framework as string)) {
    throw new Error(`framework must be 'angular' or 'react'. Got: '${raw.framework}'`);
  }

  if (!raw.critical_workflows || !Array.isArray(raw.critical_workflows) || raw.critical_workflows.length === 0) {
    throw new Error(`critical_workflows must have at least one entry in .scaffold-config.yml`);
  }

  const provider = (raw.provider as string) ?? 'azure';

  if (provider === 'azure') {
    if (!raw.azure_openai_endpoint) {
      throw new Error(`azure_openai_endpoint is required in .scaffold-config.yml when provider is 'azure'`);
    }
    if (!raw.azure_openai_deployment) {
      throw new Error(`azure_openai_deployment is required in .scaffold-config.yml when provider is 'azure'`);
    }
  } else if (provider === 'deepseek') {
    raw.deepseek_model = raw.deepseek_model ?? 'deepseek-chat';
  } else {
    throw new Error(`provider must be 'azure' or 'deepseek'. Got: '${provider}'`);
  }

  raw.provider = provider;

  if (raw.openapi_spec && !fs.existsSync(path.join(repoRoot, raw.openapi_spec as string))) {
    console.warn(`Warning: openapi_spec path not found: ${raw.openapi_spec}. Falling back to static analysis.`);
    raw.openapi_spec = undefined;
  }

  return raw as unknown as ScaffoldConfig;
}

export function buildConfigFromParams(params: {
  framework: 'angular' | 'react';
  suiteName: string;
  openapiSpec?: string;
  repoRoot?: string;
}): ScaffoldConfig {
  // Try to load existing config for provider/credential settings
  let existing: Partial<ScaffoldConfig> = {};
  if (params.repoRoot) {
    const configPath = path.join(params.repoRoot, '.scaffold-config.yml');
    if (fs.existsSync(configPath)) {
      try {
        existing = yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<ScaffoldConfig>;
      } catch { /* ignore malformed config */ }
    }
  }

  // Auto-detect provider from environment if not in existing config
  let provider: 'azure' | 'deepseek' = (existing.provider as 'azure' | 'deepseek') ?? 'deepseek';
  if (!existing.provider) {
    if (process.env.DEEPSEEK_API_KEY) {
      provider = 'deepseek';
    } else if (process.env.AZURE_OPENAI_API_KEY) {
      provider = 'azure';
    }
  }

  return {
    ...existing,
    framework: params.framework,
    ci_platform: existing.ci_platform ?? 'none',
    critical_workflows: [params.suiteName],
    openapi_spec: params.openapiSpec,
    provider,
    deepseek_model: existing.deepseek_model ?? 'deepseek-chat',
    azure_openai_endpoint: existing.azure_openai_endpoint ?? process.env.AZURE_OPENAI_ENDPOINT,
    azure_openai_deployment: existing.azure_openai_deployment ?? process.env.AZURE_OPENAI_DEPLOYMENT,
  } as ScaffoldConfig;
}
