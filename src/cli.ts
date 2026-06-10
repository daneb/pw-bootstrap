#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import ora from 'ora';
import { loadConfig } from './config';
import { runScaffold } from './scaffold';
import { CliOptions } from './types';

const program = new Command();

program
  .name('pw-scaffold')
  .description('Generate a complete Playwright test scaffold for Angular or React SPAs.\nProviders: Azure OpenAI (AZURE_OPENAI_API_KEY), DeepSeek (DEEPSEEK_API_KEY), or Ollama (OLLAMA_MODEL=qwen2.5-coder:32b)')
  .version('1.0.0')
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
  const config = loadConfig(repoRoot);
  console.log(`✓ Config loaded — framework: ${config.framework}, ci: ${config.ci_platform}`);

  const spinner = ora('Scanning repository...').start();

  const { result, scanResult } = await runScaffold(repoRoot, config, {
    skipAi: opts.skipAi ?? false,
    verbose: opts.verbose,
    force: opts.force,
    dryRun: opts.dryRun,
    onProgress: (msg) => {
      spinner.stop();
      console.log(`  → ${msg}`);
    },
  });

  spinner.succeed('Scanning repository... done');

  console.log('');

  if (opts.dryRun) {
    console.log('\nDry run — files that would be written:');
    for (const file of result.files) {
      console.log(`  ${file.path}`);
    }
  } else {
    const writeSpinner = ora(`Writing files to e2e/...`).start();
    writeSpinner.succeed(`Writing files to e2e/... done (${result.files.length} files)`);
    console.log('✓ Generated .github/workflows/playwright.yml');
  }

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

  void scanResult; // used via onProgress callbacks above
}

main().catch((err) => {
  if (opts.verbose) {
    console.error(err);
  } else {
    console.error(`\nError: ${err.message ?? err}`);
  }
  process.exit(1);
});
