import * as fs from 'fs';
import * as path from 'path';
import { GeneratedFile } from './types';

function toPascalCase(s: string): string {
  return s
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (c: string) => c.toUpperCase());
}

function toKebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function buildPageObject(className: string, routePath: string): string {
  return `import { Page } from '@playwright/test';

export class ${className}Page {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('${routePath}');
  }
}
`;
}

function buildSpec(slug: string, className: string): string {
  return `import { test, expect } from '@playwright/test';
import { ${className}Page } from '../pages/${className}Page';

test.describe('${slug}', () => {
  test('should load @smoke', async ({ page }) => {
    const p = new ${className}Page(page);
    await p.goto();
    await expect(page).toHaveTitle(/.+/);
  });
});
`;
}

/**
 * Generate a Page Object + spec pair for the given page name.
 * Files are written into repoRoot/e2e/pages/ and repoRoot/e2e/tests/.
 *
 * Throws if the e2e/ directory does not exist (scaffold must run first).
 */
export function addTestPage(name: string, repoRoot: string): GeneratedFile[] {
  const e2eDir = path.join(repoRoot, 'e2e');
  if (!fs.existsSync(e2eDir)) {
    throw new Error(
      `e2e/ directory not found in ${repoRoot}. Run scaffold_playwright first to initialise the test scaffold.`
    );
  }

  const slug = toKebabCase(name);
  const className = toPascalCase(name);
  const routePath = `/${slug}`;

  const files: GeneratedFile[] = [
    {
      path: `e2e/pages/${className}Page.ts`,
      content: buildPageObject(className, routePath),
    },
    {
      path: `e2e/tests/${slug}.spec.ts`,
      content: buildSpec(slug, className),
    },
  ];

  for (const file of files) {
    const fullPath = path.join(repoRoot, file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf8');
  }

  return files;
}
