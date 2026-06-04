import * as fs from 'fs';
import * as path from 'path';
import { DetectedComponent } from '../types';

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

export function detectComponents(repoRoot: string, framework: 'angular' | 'react'): DetectedComponent[] {
  const components: DetectedComponent[] = [];

  if (framework === 'angular') {
    // Match both .component.ts and Angular CLI generated plain .ts component files
    const allTs = findFilesRecursive(path.join(repoRoot, 'src'), '.ts');
    const componentFiles = allTs.filter(f =>
      f.endsWith('.component.ts') || (f.includes('/pages/') && f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    );
    for (const file of componentFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const selectorMatch = content.match(/selector\s*:\s*['"`]([^'"`]+)['"`]/);
      const classMatch = content.match(/export\s+class\s+(\w+(?:Component)?)/);
      if (classMatch) {
        components.push({
          name: classMatch[1],
          file: path.relative(repoRoot, file),
          selector: selectorMatch?.[1],
        });
      }
    }
  }

  return components;
}
