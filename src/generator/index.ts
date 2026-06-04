import { ScaffoldConfig, ScanResult, GeneratedFile, GenerationResult } from '../types';
import { callAzureOpenAI } from '../ai/client';
import {
  SYSTEM_SMOKE,
  SYSTEM_WORKFLOW,
  SYSTEM_PLAYWRIGHT_CONFIG,
  buildSmokePrompt,
  buildWorkflowPrompt,
  buildPlaywrightConfigPrompt,
} from '../ai/prompts';
import { generateRunScript } from './run-scripts';
import { generateReadme } from './reports';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function stubSmokeTests(scan: ScanResult): string {
  const tests = scan.routes.map((r) => {
    const path = r.isParameterized ? r.path.replace(/:([^/]+)/g, '1') : r.path;
    return `  test('smoke: ${r.path} @smoke', async ({ page }) => {
    await page.goto('${path}');
    await expect(page).toHaveTitle(/.+/);
  });`;
  }).join('\n\n');

  return `import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
${tests}
});
`;
}

function stubWorkflowTest(workflow: string): string {
  return `import { test, expect } from '@playwright/test';

test('${workflow} @workflow', async ({ page }) => {
  // TODO — verify this step against actual UI
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
`;
}

function stubPlaywrightConfig(scan: ScanResult): string {
  return `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:${scan.detectedPort}',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['list'], ['junit', { outputFile: 'test-results/results.xml' }]],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
`;
}

export async function generate(
  config: ScaffoldConfig,
  scan: ScanResult,
  noAi: boolean,
  verbose: boolean,
  onProgress: (msg: string) => void
): Promise<GenerationResult> {
  const files: GeneratedFile[] = [];
  const workflowConfidences: number[] = [];

  // Playwright config
  onProgress('Generating Playwright config...');
  let playwrightConfig: string;
  if (noAi) {
    playwrightConfig = stubPlaywrightConfig(scan);
  } else {
    playwrightConfig = await callAzureOpenAI(
      config,
      SYSTEM_PLAYWRIGHT_CONFIG,
      buildPlaywrightConfigPrompt(config.framework, scan.detectedPort),
      verbose
    );
  }
  files.push({ path: 'e2e/playwright.config.ts', content: playwrightConfig });

  // Smoke tests
  onProgress(`Generating smoke tests (${scan.routes.length} routes)...`);
  let smokeContent: string;
  let smokeConfidence: number;
  if (noAi) {
    smokeContent = stubSmokeTests(scan);
    smokeConfidence = 0.5;
  } else {
    smokeContent = await callAzureOpenAI(
      config,
      SYSTEM_SMOKE,
      buildSmokePrompt(config.framework, scan.routes),
      verbose
    );
    smokeConfidence = scan.routes.length > 0 ? 0.75 : 0.5;
  }
  files.push({ path: 'e2e/tests/smoke/smoke.spec.ts', content: smokeContent, confidence: smokeConfidence });

  // Workflow tests
  onProgress(`Generating workflow tests (${config.critical_workflows.length} workflows)...`);
  for (const workflow of config.critical_workflows) {
    const slug = slugify(workflow);
    let workflowContent: string;
    let workflowConfidence: number;

    if (noAi) {
      workflowContent = stubWorkflowTest(workflow);
      workflowConfidence = 0.5;
    } else {
      onProgress(`  → ${slug}...`);
      workflowContent = await callAzureOpenAI(
        config,
        SYSTEM_WORKFLOW,
        buildWorkflowPrompt(config.framework, workflow, scan.routes, scan.components),
        verbose
      );
      workflowConfidence = 0.75;
    }

    workflowConfidences.push(workflowConfidence);
    files.push({
      path: `e2e/tests/workflows/${slug}.spec.ts`,
      content: workflowContent,
      confidence: workflowConfidence,
    });
  }

  // Run script (macOS only in Phase 1)
  files.push({ path: 'e2e/run-tests.sh', content: generateRunScript(scan.detectedPort) });

  // README
  files.push({
    path: 'e2e/README-TESTS.md',
    content: generateReadme(config, scan, files, smokeConfidence, workflowConfidences),
  });

  return {
    files,
    summary: {
      smokeConfidence,
      workflowConfidences,
    },
  };
}
