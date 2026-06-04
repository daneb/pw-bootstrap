#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import ora from 'ora';
import { loadConfig } from './config';
import { scan } from './scanner/index';
import { generate } from './generator/index';
import { writeFiles, checkE2eExists } from './writer/index';
import { CliOptions } from './types';

const program = new Command();

program
  .name('scaffold-bootstrap')
  .description('Generate a complete Playwright test scaffold for Angular or React SPAs')
  .option('--repo <path>', 'Path to target SPA repository', '.')
  .option('--dry-run', 'Print planned output without writing files', false)
  .option('--skip-ai', 'Generate stub structure without AI calls', false)
  .option('--verbose', 'Print detailed progress', false)
  .option('--force', 'Overwrite existing e2e/ directory if present', false)
  .parse(process.argv);

const opts = program.opts<CliOptions>();
const repoRoot = path.resolve(opts.repo ?? '.');

console.log(`
CIB Scaffold Bootstrap
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

async function main() {
  // Load and validate config
  const config = loadConfig(repoRoot);
  console.log(`✓ Config loaded — framework: ${config.framework}, ci: ${config.ci_platform}`);

  // Guard existing e2e/
  checkE2eExists(repoRoot, opts.force);

  // Scan repo
  const spinner = ora('Scanning repository...').start();
  const scanResult = scan(repoRoot, config);
  spinner.succeed('Scanning repository... done');
  console.log(`  → Routes found: ${scanResult.routes.length}`);
  console.log(`  → HTTP endpoints found: ${scanResult.httpCalls.length}`);
  console.log(`  → Components found: ${scanResult.components.length}`);
  console.log(`  → Base URL: http://localhost:${scanResult.detectedPort}`);
  if (opts.skipAi) {
    console.log(`  → AI generation: disabled (--skip-ai)`);
  }

  console.log('');

  // Generate
  const result = await generate(
    config,
    scanResult,
    opts.skipAi ?? false,
    opts.verbose,
    (msg) => {
      console.log(`✓ ${msg}`);
    }
  );

  console.log('');

  // Write
  if (opts.dryRun) {
    writeFiles(repoRoot, result.files, true);
  } else {
    const writeSpinner = ora(`Writing files to e2e/...`).start();
    writeFiles(repoRoot, result.files, false);
    writeSpinner.succeed(`Writing files to e2e/... done (${result.files.length} files)`);
  }

  // Summary
  const avgWorkflow =
    result.summary.workflowConfidences.length > 0
      ? (result.summary.workflowConfidences.reduce((a, b) => a + b, 0) / result.summary.workflowConfidences.length).toFixed(2)
      : 'n/a';

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done. Scaffold generated.

Confidence summary:`);

  if (result.summary.smokeConfidence != null) {
    console.log(`  Smoke tests:      ${result.summary.smokeConfidence.toFixed(2)}`);
  }
  console.log(`  Workflow tests:   ${avgWorkflow}  (avg)`);

  if (!opts.dryRun) {
    console.log(`
Next step: Start your app, then run:
  macOS/Linux:  bash e2e/run-tests.sh
`);
  }
}

main().catch((err) => {
  if (opts.verbose) {
    console.error(err);
  } else {
    console.error(`\nError: ${err.message ?? err}`);
  }
  process.exit(1);
});
