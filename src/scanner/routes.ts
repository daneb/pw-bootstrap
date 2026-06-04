import * as fs from 'fs';
import * as path from 'path';
import { DetectedRoute } from '../types';

function findFilesRecursive(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      results.push(...findFilesRecursive(full, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function extractAngularRoutes(repoRoot: string): DetectedRoute[] {
  const routes: DetectedRoute[] = [];
  const seen = new Set<string>();

  const tsFiles = findFilesRecursive(path.join(repoRoot, 'src'), '.ts');

  for (const file of tsFiles) {
    const content = fs.readFileSync(file, 'utf8');

    // Match path: 'some/path' or path: "some/path" inside route definitions
    const pathMatches = content.matchAll(/path\s*:\s*['"`]([^'"`]*)['"`]/g);
    for (const match of pathMatches) {
      const routePath = match[1];
      if (!seen.has(routePath)) {
        seen.add(routePath);
        routes.push({
          path: routePath === '' ? '/' : `/${routePath}`,
          isParameterized: routePath.includes(':'),
        });
      }
    }
  }

  // Ensure root route exists
  if (!seen.has('') && !seen.has('/')) {
    routes.unshift({ path: '/', isParameterized: false });
  }

  return routes;
}

export function detectRoutes(repoRoot: string, framework: 'angular' | 'react'): DetectedRoute[] {
  if (framework === 'angular') {
    return extractAngularRoutes(repoRoot);
  }
  // React support deferred to Phase 2
  return [{ path: '/', isParameterized: false }];
}
