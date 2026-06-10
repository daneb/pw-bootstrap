import { ScaffoldConfig } from '../types';

const AZURE_API_VERSION = '2024-02-01';

function stripFences(content: string): string {
  return content
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const OLLAMA_BASE_URL = 'http://localhost:11434/v1';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRequest(config: ScaffoldConfig, systemPrompt: string, userPrompt: string): { url: string; headers: Record<string, string>; body: string } {
  const provider = config.provider ?? 'azure';

  if (provider === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error(
        'DEEPSEEK_API_KEY environment variable is not set.\n\n' +
        'macOS / Linux:  export DEEPSEEK_API_KEY="your-key-here"\n' +
        'Windows (PowerShell):  $env:DEEPSEEK_API_KEY = "your-key-here"'
      );
    }

    return {
      url: `${DEEPSEEK_BASE_URL}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.deepseek_model ?? 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    };
  }

  if (provider === 'ollama') {
    const model = config.ollama_model ?? process.env.OLLAMA_MODEL;
    if (!model) {
      throw new Error('OLLAMA_MODEL environment variable is not set.');
    }

    return {
      url: `${OLLAMA_BASE_URL}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ollama',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    };
  }

  // Azure OpenAI
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'AZURE_OPENAI_API_KEY environment variable is not set.\n\n' +
      'macOS / Linux:  export AZURE_OPENAI_API_KEY="your-key-here"\n' +
      'Windows (PowerShell):  $env:AZURE_OPENAI_API_KEY = "your-key-here"'
    );
  }

  return {
    url: `${config.azure_openai_endpoint}openai/deployments/${config.azure_openai_deployment}/chat/completions?api-version=${AZURE_API_VERSION}`,
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    }),
  };
}

export async function callAI(
  config: ScaffoldConfig,
  systemPrompt: string,
  userPrompt: string,
  verbose = false
): Promise<string> {
  const { url, headers, body } = buildRequest(config, systemPrompt, userPrompt);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { method: 'POST', headers, body });

      if (response.status === 429 || response.status >= 500) {
        const waitMs = Math.pow(2, attempt) * 1000;
        console.log(`  Rate limit or server error. Retrying in ${waitMs / 1000}s... (attempt ${attempt}/3)`);
        await sleep(waitMs);
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        const p = config.provider ?? 'azure';
        const keyName = p === 'deepseek' ? 'DEEPSEEK_API_KEY' : p === 'ollama' ? 'OLLAMA_MODEL (and confirm Ollama is running)' : 'AZURE_OPENAI_API_KEY';
        throw new Error(`Authentication failed. Check your ${keyName} and endpoint.`);
      }

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${await response.text()}`);
      }

      const json = await response.json() as { choices: { message: { content: string } }[] };
      return stripFences(json.choices[0].message.content.trim());
    } catch (err) {
      if (attempt === 3) {
        throw new Error(`AI call failed after 3 attempts: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (verbose) console.error(`Attempt ${attempt} failed:`, err);
      const waitMs = Math.pow(2, attempt) * 1000;
      await sleep(waitMs);
    }
  }

  throw new Error('Unreachable');
}
