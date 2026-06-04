import * as fs from 'fs';
import * as path from 'path';
import { ScaffoldConfig, ScanResult } from '../types';
import { detectRoutes } from './routes';
import { detectHttpCalls } from './http-calls';
import { detectComponents } from './components';

function detectPort(repoRoot: string, framework: 'angular' | 'react'): number {
  if (framework === 'angular') {
    const angularJson = path.join(repoRoot, 'angular.json');
    if (fs.existsSync(angularJson)) {
      try {
        const json = JSON.parse(fs.readFileSync(angularJson, 'utf8'));
        const projects = Object.values(json.projects ?? {}) as Record<string, unknown>[];
        for (const project of projects) {
          const serve = (project as any)?.architect?.serve?.options?.port;
          if (serve) return serve;
        }
      } catch {}
    }
    return 4200;
  }
  return 3000;
}

export function scan(repoRoot: string, config: ScaffoldConfig): ScanResult {
  const routes = detectRoutes(repoRoot, config.framework);
  const httpCalls = detectHttpCalls(repoRoot, config.framework);
  const components = detectComponents(repoRoot, config.framework);
  const detectedPort = detectPort(repoRoot, config.framework);

  return {
    framework: config.framework,
    routes,
    httpCalls,
    components,
    detectedPort,
  };
}
