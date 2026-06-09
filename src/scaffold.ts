import { ScaffoldConfig, GenerationResult, ScanResult } from './types';
import { scan } from './scanner/index';
import { generate } from './generator/index';
import { writeFiles, checkE2eExists } from './writer/index';

export interface RunScaffoldOptions {
  skipAi?: boolean;
  verbose?: boolean;
  force?: boolean;
  dryRun?: boolean;
  /** Override the detected port (extracted from a baseUrl, for example). */
  portOverride?: number;
  onProgress?: (msg: string) => void;
}

/**
 * Core scaffold pipeline. Accepts an already-loaded config so both the CLI
 * (which reads .scaffold-config.yml) and the MCP server (which builds config
 * from tool params) can share the same logic.
 */
export async function runScaffold(
  repoRoot: string,
  config: ScaffoldConfig,
  options: RunScaffoldOptions = {}
): Promise<{ result: GenerationResult; scanResult: ScanResult }> {
  const {
    skipAi = false,
    verbose = false,
    force = false,
    dryRun = false,
    portOverride,
    onProgress = () => {},
  } = options;

  checkE2eExists(repoRoot, force);

  const scanResult = scan(repoRoot, config);
  if (portOverride != null && !isNaN(portOverride)) {
    scanResult.detectedPort = portOverride;
  }

  onProgress(`Framework: ${config.framework}`);
  onProgress(`Routes found: ${scanResult.routes.length}`);
  onProgress(`HTTP endpoints found: ${scanResult.httpCalls.length}`);
  onProgress(`Components found: ${scanResult.components.length}`);
  onProgress(`Base URL: http://localhost:${scanResult.detectedPort}`);

  const result = await generate(config, scanResult, skipAi, verbose, onProgress);

  if (!dryRun) {
    writeFiles(repoRoot, result.files, false);
  }

  return { result, scanResult };
}

/** Parse the port number from a URL string like "http://localhost:3000". */
export function parsePortFromUrl(baseUrl: string): number | undefined {
  try {
    const url = new URL(baseUrl);
    const port = parseInt(url.port, 10);
    return isNaN(port) ? undefined : port;
  } catch {
    return undefined;
  }
}
