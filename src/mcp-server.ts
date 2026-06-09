#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import { buildConfigFromParams } from './config';
import { runScaffold, parsePortFromUrl } from './scaffold';
import { addTestPage } from './addPage';

const server = new Server(
  { name: 'pw-scaffold', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'scaffold_playwright',
      description:
        'Bootstrap a complete Playwright e2e test scaffold (playwright.config.ts, smoke tests, workflow tests, run script) in the current workspace. Runs non-interactively using the provided parameters.',
      inputSchema: {
        type: 'object',
        properties: {
          framework: {
            type: 'string',
            enum: ['react', 'angular'],
            description: 'Frontend framework of the target app.',
          },
          baseUrl: {
            type: 'string',
            description: 'Base URL where the app runs locally, e.g. "http://localhost:3000".',
          },
          suiteName: {
            type: 'string',
            description: 'Name for the primary workflow test suite, e.g. "checkout-flow".',
          },
          openapiSpec: {
            type: 'string',
            description: 'Optional path or URL to an OpenAPI spec file for richer test generation.',
          },
        },
        required: ['framework', 'baseUrl', 'suiteName'],
      },
    },
    {
      name: 'add_test_page',
      description:
        'Add a new Page Object Model class and a companion spec file to an existing Playwright scaffold. The scaffold must already exist (run scaffold_playwright first).',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Page name in any casing, e.g. "checkout" or "UserProfile". Used to derive file names and class name.',
          },
        },
        required: ['name'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'scaffold_playwright') {
      const { framework, baseUrl, suiteName, openapiSpec } = args as {
        framework: 'react' | 'angular';
        baseUrl: string;
        suiteName: string;
        openapiSpec?: string;
      };

      const repoRoot = process.cwd();
      const config = buildConfigFromParams({ framework, suiteName, openapiSpec, repoRoot });
      const portOverride = parsePortFromUrl(baseUrl);

      const lines: string[] = [];
      const { result } = await runScaffold(repoRoot, config, {
        portOverride,
        onProgress: (msg) => lines.push(msg),
      });

      const filePaths = result.files.map((f) => `  ${f.path}`).join('\n');
      const avgConf =
        result.summary.workflowConfidences.length > 0
          ? (result.summary.workflowConfidences.reduce((a, b) => a + b, 0) / result.summary.workflowConfidences.length).toFixed(2)
          : 'n/a';

      return {
        content: [
          {
            type: 'text',
            text: [
              `Scaffold generated successfully in ${path.resolve(repoRoot)}/e2e/`,
              '',
              'Files written:',
              filePaths,
              '',
              `Smoke confidence: ${result.summary.smokeConfidence?.toFixed(2) ?? 'n/a'}`,
              `Workflow confidence (avg): ${avgConf}`,
              '',
              'Next step: start the app, then run:  bash e2e/run-tests.sh',
            ].join('\n'),
          },
        ],
      };
    }

    if (name === 'add_test_page') {
      const { name: pageName } = args as { name: string };
      const repoRoot = process.cwd();

      const files = addTestPage(pageName, repoRoot);
      const filePaths = files.map((f) => `  ${f.path}`).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: [
              `Page added successfully:`,
              filePaths,
              '',
              'Page Object and spec stub are ready. Update the goto() path and add your assertions.',
            ].join('\n'),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server fatal error:', err);
  process.exit(1);
});
