import { DetectedRoute, DetectedComponent, DetectedHttpCall } from '../types';

export const SYSTEM_SMOKE = `You are a senior frontend engineer writing Playwright tests.
Generate only valid TypeScript using @playwright/test syntax. No explanations. No markdown fences.
Output a single test file covering all routes provided.`;

export const SYSTEM_WORKFLOW = `You are a senior frontend engineer writing Playwright tests.
Generate only valid TypeScript using @playwright/test syntax. No explanations. No markdown fences.
Output a single test file for the workflow described.`;

export const SYSTEM_PLAYWRIGHT_CONFIG = `You are a senior frontend engineer generating Playwright configuration files.
Generate only valid TypeScript. No explanations. No markdown fences. Output file content only.`;

export function buildSmokePrompt(
  framework: string,
  routes: DetectedRoute[]
): string {
  const routeList = routes.map((r) => r.path).join('\n');
  return `Generate Playwright smoke tests for a ${framework} SPA with the following routes:

Routes:
${routeList}

Requirements:
- Import { test, expect } from '@playwright/test'
- One test per route
- Each test: navigate to route, assert page title exists, assert no console errors
- Use page.getByRole() and page.getByLabel() locators where possible
- Avoid CSS selectors unless no other option
- Add comment above fragile selectors: // FRAGILE — add data-testid to improve stability
- Group all tests in a single describe block named 'Smoke Tests'
- All tests tagged with @smoke
- Handle routes with params (e.g. /clients/:id) using a placeholder ID of '1'`;
}

export function buildWorkflowPrompt(
  framework: string,
  workflow: string,
  routes: DetectedRoute[],
  components: DetectedComponent[]
): string {
  const routeList = routes.map((r) => r.path).join(', ');
  const componentList = components.map((c) => c.selector ?? c.name).join(', ');
  return `Generate a Playwright test for the following user workflow in a ${framework} SPA.

Workflow description: "${workflow}"

Available routes: ${routeList}
Available component selectors/names: ${componentList || 'none detected'}

Requirements:
- Import { test, expect } from '@playwright/test'
- Single test describing the full workflow
- Use page.getByRole(), page.getByLabel(), page.getByText() locators in preference order
- Add comment above fragile selectors: // FRAGILE — add data-testid to improve stability
- Add TODO comments where workflow steps are ambiguous: // TODO — verify this step against actual UI
- Use expect().toBeVisible() and expect().toHaveURL() assertions
- Tag test with @workflow`;
}

export function buildPlaywrightConfigPrompt(framework: string, port: number): string {
  return `Generate a playwright.config.ts for a ${framework} SPA.

Requirements:
- Use @playwright/test
- baseURL: 'http://localhost:${port}'
- testDir: './e2e/tests'
- Single browser: chromium only
- Screenshot on failure
- Video: retain-on-failure
- Reporter: list for local, junit for CI
- Set timeout: 30000
- Do not use webServer config — app is started manually
- Use fullyParallel: false for stability on first run`;
}
