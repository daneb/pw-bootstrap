import { ScaffoldConfig, ScanResult, GeneratedFile, GenerationResult } from '../types';
import { callAI } from '../ai/client';
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
  testDir: './tests',
  fullyParallel: false,
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: 'http://localhost:${scan.detectedPort}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['html'], ['github']],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
`;
}

function generateGithubWorkflow(suiteName: string): string {
  return `name: ${suiteName}

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    name: Playwright (\${{ matrix.shard }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1/4, 2/4, 3/4, 4/4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: Run Playwright tests
        run: npx playwright test --shard=\${{ matrix.shard }} --reporter=blob
        env:
          CI: true
      - name: Upload blob report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: blob-report-\${{ strategy.job-index }}
          path: blob-report/
          retention-days: 1

  merge-reports:
    needs: test
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Download blob reports
        uses: actions/download-artifact@v4
        with:
          pattern: blob-report-*
          merge-multiple: true
          path: blob-reports/
      - name: Merge into HTML report
        run: npx playwright merge-reports --reporter=html,github ./blob-reports
      - name: Upload HTML report
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
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
    playwrightConfig = await callAI(
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
    smokeContent = await callAI(
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
      workflowContent = await callAI(
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

  // GitHub Actions workflow
  const suiteName = config.critical_workflows[0] ?? 'playwright';
  files.push({ path: '.github/workflows/playwright.yml', content: generateGithubWorkflow(suiteName) });

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
