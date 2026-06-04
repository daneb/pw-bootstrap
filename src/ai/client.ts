import { ScaffoldConfig } from '../types';

const API_VERSION = '2024-02-01';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callAzureOpenAI(
  config: ScaffoldConfig,
  systemPrompt: string,
  userPrompt: string,
  verbose = false
): Promise<string> {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) {
    console.error(`
Error: AZURE_OPENAI_API_KEY environment variable is not set.

macOS / Linux:
  export AZURE_OPENAI_API_KEY="your-key-here"

Windows (PowerShell):
  $env:AZURE_OPENAI_API_KEY = "your-key-here"

Then re-run the scaffold tool.`);
    process.exit(1);
  }

  const url = `${config.azure_openai_endpoint}openai/deployments/${config.azure_openai_deployment}/chat/completions?api-version=${API_VERSION}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
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
      });

      if (response.status === 429 || response.status >= 500) {
        const waitMs = Math.pow(2, attempt) * 1000;
        console.log(`  Azure OpenAI rate limit hit. Retrying in ${waitMs / 1000}s... (attempt ${attempt}/3)`);
        await sleep(waitMs);
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        console.error(`Error: Azure OpenAI authentication failed. Check your AZURE_OPENAI_API_KEY and endpoint.`);
        process.exit(1);
      }

      if (!response.ok) {
        throw new Error(`Azure OpenAI returned ${response.status}: ${await response.text()}`);
      }

      const json = await response.json() as { choices: { message: { content: string } }[] };
      return json.choices[0].message.content.trim();
    } catch (err) {
      if (attempt === 3) {
        console.error(`Error: Azure OpenAI call failed after 3 attempts.`);
        if (verbose) console.error(err);
        process.exit(1);
      }
      const waitMs = Math.pow(2, attempt) * 1000;
      await sleep(waitMs);
    }
  }

  throw new Error('Unreachable');
}
