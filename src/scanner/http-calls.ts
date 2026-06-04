import * as fs from 'fs';
import * as path from 'path';
import { DetectedHttpCall } from '../types';

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

function extractAngularHttpCalls(repoRoot: string): DetectedHttpCall[] {
  const calls: DetectedHttpCall[] = [];
  // Match both conventional .service.ts and Angular CLI generated plain .ts service files
  const allTs = findFilesRecursive(path.join(repoRoot, 'src'), '.ts');
  const serviceFiles = allTs.filter(f =>
    f.endsWith('.service.ts') || (f.includes('/services/') && f.endsWith('.ts'))
  );

  const methodPattern = /this\.http\.(get|post|put|delete|patch)\s*\(\s*(['"`]([^'"`]+)['"`]|[a-zA-Z_$][a-zA-Z0-9_$.]*)/g;

  for (const file of serviceFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.matchAll(methodPattern);
    for (const match of matches) {
      const method = match[1].toUpperCase();
      const urlLiteral = match[3];
      const urlVar = match[2];
      const isDynamic = !urlLiteral;
      calls.push({
        method,
        url: urlLiteral ?? urlVar,
        file: path.relative(repoRoot, file),
        isDynamic,
      });
    }
  }

  return calls;
}

export function detectHttpCalls(repoRoot: string, framework: 'angular' | 'react'): DetectedHttpCall[] {
  if (framework === 'angular') {
    return extractAngularHttpCalls(repoRoot);
  }
  return [];
}
