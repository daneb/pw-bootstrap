import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ScaffoldConfig } from './types';

export function loadConfig(repoRoot: string): ScaffoldConfig {
  const configPath = path.join(repoRoot, '.scaffold-config.yml');

  if (!fs.existsSync(configPath)) {
    console.error(`Error: .scaffold-config.yml not found in ${repoRoot}. Create this file first. See README for template.`);
    process.exit(1);
  }

  const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;

  if (!raw.framework || !['angular', 'react'].includes(raw.framework as string)) {
    console.error(`Error: framework must be 'angular' or 'react'. Got: '${raw.framework}'`);
    process.exit(1);
  }

  if (!raw.critical_workflows || !Array.isArray(raw.critical_workflows) || raw.critical_workflows.length === 0) {
    console.error(`Error: critical_workflows must have at least one entry in .scaffold-config.yml`);
    process.exit(1);
  }

  // Default provider to azure for backwards compatibility
  const provider = (raw.provider as string) ?? 'azure';

  if (provider === 'azure') {
    if (!raw.azure_openai_endpoint) {
      console.error(`Error: azure_openai_endpoint is required in .scaffold-config.yml when provider is 'azure'`);
      process.exit(1);
    }
    if (!raw.azure_openai_deployment) {
      console.error(`Error: azure_openai_deployment is required in .scaffold-config.yml when provider is 'azure'`);
      process.exit(1);
    }
  } else if (provider === 'deepseek') {
    // No config-level keys required — just DEEPSEEK_API_KEY env var, checked at call time
    raw.deepseek_model = raw.deepseek_model ?? 'deepseek-chat';
  } else {
    console.error(`Error: provider must be 'azure' or 'deepseek'. Got: '${provider}'`);
    process.exit(1);
  }

  raw.provider = provider;

  if (raw.openapi_spec && !fs.existsSync(path.join(repoRoot, raw.openapi_spec as string))) {
    console.warn(`Warning: openapi_spec path not found: ${raw.openapi_spec}. Falling back to static analysis.`);
    raw.openapi_spec = undefined;
  }

  return raw as unknown as ScaffoldConfig;
}
