# Technical Specification: Playwright Scaffold Bootstrap Tool

**Version:** 1.0  
**Status:** Ready for implementation  
**Target:** Claude Code  
**Platform:** Windows (PowerShell) and macOS (zsh/bash)  
**Scope:** Flow 1 — Bootstrap only. No GitHub Actions. Runs locally.

---

## 1. Overview

A CLI tool that reads a `.scaffold-config.yml` file from a target Angular or React SPA repository and generates a complete, runnable Playwright test scaffold. The tool runs locally on developer machines. It calls Azure OpenAI as the AI subagent for generation tasks.

The output is a set of files written directly into the target repository. The developer reviews and commits them manually.

**One command. One config file. Working tests.**

---

## 2. What the Tool Does

1. Reads `.scaffold-config.yml` from the target repo root
2. Scans the repo — detects routes, HTTP service calls, component structure
3. Reads OpenAPI spec if path is provided in config
4. Calls Azure OpenAI to generate MSW handlers (high-confidence from spec, stubs from static analysis)
5. Calls Azure OpenAI to generate `playwright.config.ts` and one smoke test per detected route
6. Calls Azure OpenAI to generate workflow tests from `critical_workflows` in config
7. Generates a local run script (`run-tests.ps1` for Windows, `run-tests.sh` for macOS)
8. Generates a `README-TESTS.md` explaining the scaffold and how to run it
9. Generates a `testability-report.md` flagging fragile selectors, missing testids, and stub handler gaps
10. Writes all files into the target repo under `e2e/`
11. Prints a summary of what was generated with confidence scores

---

## 3. Config File Specification

The tool reads `.scaffold-config.yml` from the root of the target repository.

### Schema

```yaml
# .scaffold-config.yml
# Place this file in the root of your Angular or React SPA repository
# before running the scaffold tool.

framework: angular                        # Required. angular | react
ci_platform: azure-devops                 # Required. azure-devops | github-actions | jenkins | none
openapi_spec: ./docs/api-spec.json        # Optional. Path to OpenAPI spec file relative to repo root
scaffold_testids: false                   # Optional. Default false. Generates testid PR separately (v2)
testid_convention: "{component}-{element}-{action}"  # Optional. Used in testability report recommendations
azure_openai_endpoint: https://YOUR_ENDPOINT.openai.azure.com/  # Required. Your Azure OpenAI endpoint
azure_openai_deployment: gpt-4o           # Required. Your deployment name
critical_workflows:                       # Required. At least 1. Plain English descriptions.
  - "User logs in and views the dashboard"
  - "User searches for a client record"
  - "User exports a report"
```

### Validation Rules

- `framework` must be `angular` or `react`. Fail fast with clear error if missing or invalid.
- `critical_workflows` must have at least one entry. Fail fast if empty or missing.
- `azure_openai_endpoint` and `azure_openai_deployment` must be present. Fail fast if missing.
- `openapi_spec` path must exist if provided. Warn but continue if file not found.
- `ci_platform: none` is valid — skip CI pipeline YAML generation.

---

## 4. Authentication

Azure OpenAI authentication uses the `AZURE_OPENAI_API_KEY` environment variable.

The tool must:
1. Check for `AZURE_OPENAI_API_KEY` in environment on startup
2. If missing, print a clear error message explaining how to set it
3. Never prompt for or accept the key as a CLI argument
4. Never write the key to any file

### Error message when key is missing

```
Error: AZURE_OPENAI_API_KEY environment variable is not set.

Windows (PowerShell):
  $env:AZURE_OPENAI_API_KEY = "your-key-here"

macOS / Linux:
  export AZURE_OPENAI_API_KEY="your-key-here"

Then re-run the scaffold tool.
```

---

## 5. CLI Interface

### Installation

```bash
# macOS / Linux
npm install -g @cib/scaffold-tool

# Windows (PowerShell)
npm install -g @cib/scaffold-tool
```

### Usage

```bash
# Run from the root of the target SPA repository
scaffold-bootstrap

# Or point at a specific repo path
scaffold-bootstrap --repo ./path/to/my-spa

# Dry run — show what would be generated without writing files
scaffold-bootstrap --dry-run

# Skip AI generation — scaffold structure only with empty test stubs
scaffold-bootstrap --no-ai

# Verbose output
scaffold-bootstrap --verbose
```

### Flags

| Flag | Description | Default |
|---|---|---|
| `--repo <path>` | Path to target SPA repository | Current directory |
| `--dry-run` | Print planned output without writing files | false |
| `--no-ai` | Generate stub structure without AI calls | false |
| `--verbose` | Print detailed progress for each step | false |
| `--force` | Overwrite existing `e2e/` directory if present | false |

### Guard: existing e2e directory

If `e2e/` already exists in the target repo and `--force` is not passed:

```
Warning: e2e/ directory already exists in this repository.
Use --force to overwrite, or delete e2e/ manually before running.
Aborting.
```

---

## 6. Repo Scanning

### 6.1 Framework Detection (fallback if config omitted)

Even if `framework` is in config, the scanner should verify and warn if mismatch detected.

**Angular detection:**
- Presence of `angular.json` in repo root
- Presence of `@angular/core` in `package.json` dependencies

**React detection:**
- Presence of `react` in `package.json` dependencies
- Presence of `react-scripts` or `vite` with React plugin

### 6.2 Route Detection

**Angular:**
- Scan for `RouterModule.forRoot(routes)` or `provideRouter(routes)` pattern
- Parse `Routes` array to extract path strings
- Handle lazy-loaded routes — extract path even if component is lazy
- Recurse into feature module route files referenced from root routes

**React:**
- Scan for `react-router-dom` usage
- Parse `<Route path="...">` and `createBrowserRouter` patterns
- Handle nested routes — build full path strings

**Output:** Array of route path strings. Example: `['/', '/login', '/dashboard', '/clients', '/clients/:id', '/reports']`

### 6.3 HTTP Service Call Detection

**Angular:**
- Scan all `.service.ts` files
- Find `HttpClient` method calls: `.get(`, `.post(`, `.put(`, `.delete(`, `.patch(`
- Extract URL string or template literal. If variable, record variable name and note as dynamic.
- Record HTTP method and file location

**React:**
- Scan all `.ts`, `.tsx`, `.js`, `.jsx` files
- Find `fetch(`, `axios.get(`, `axios.post(`, `useQuery(`, `useMutation(` patterns
- Extract URL patterns where possible

**Output:** Array of `{ method, url, file, isDynamic }` objects.

### 6.4 Component Discovery

**Angular:**
- Find all `*.component.ts` files
- Extract component selector and template file path

**React:**
- Find all `*.tsx` and `*.jsx` files exporting a default function or component

**Output:** Array of `{ name, file, templateFile }` objects. Used for testid report.

### 6.5 OpenAPI Spec Parsing

If `openapi_spec` path is provided and file exists:
- Parse JSON or YAML
- Extract all paths, HTTP methods, and response schemas
- Build map of `endpoint → response shape` for MSW handler generation
- Note: use `js-yaml` for YAML parsing, `JSON.parse` for JSON

---

## 7. AI Generation

All AI calls use the Azure OpenAI Chat Completions API.

### 7.1 API Call Pattern

```typescript
const response = await fetch(
  `${config.azure_openai_endpoint}openai/deployments/${config.azure_openai_deployment}/chat/completions?api-version=2024-02-01`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.AZURE_OPENAI_API_KEY,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 4000,
    }),
  }
);
```

Use `temperature: 0.2` for all generation calls. Low temperature — we want consistent, deterministic code output not creative variation.

### 7.2 Retry Logic

- Retry on 429 (rate limit) and 5xx errors
- Maximum 3 retries with exponential backoff: 2s, 4s, 8s
- Fail with clear error message after 3 retries

### 7.3 Generation Tasks

Each task is a separate AI call. Do not combine tasks into one call.

---

#### Task 1: MSW Handler Generation

**When:** Always. Two variants based on OpenAPI presence.

**System prompt:**
```
You are a senior frontend engineer generating Mock Service Worker (MSW) handlers for Playwright tests.
Generate only valid TypeScript code. No explanations. No markdown fences. Output the file content only.
Use msw version 2.x syntax (http.get, http.post etc from 'msw').
```

**User prompt (with OpenAPI spec):**
```
Generate MSW handlers for the following API endpoints extracted from an OpenAPI spec.

Framework: {framework}
Endpoints:
{endpointList}

Requirements:
- Import from 'msw'
- Export a named array called 'handlers'
- Use realistic stub data matching the response schemas provided
- Include handlers for success responses only in v1
- Each handler must return HttpResponse.json({...})

Response schemas:
{schemaMap}
```

**User prompt (without OpenAPI spec):**
```
Generate MSW handlers for the following API endpoints detected via static analysis.
Response shapes are unknown — use minimal realistic stub data.

Framework: {framework}
Detected endpoints:
{endpointList}

Requirements:
- Import from 'msw'
- Export a named array called 'handlers'
- For GET endpoints returning lists, return an empty array []
- For GET endpoints returning objects, return a minimal object with likely fields inferred from the URL
- For POST/PUT, return { success: true }
- Add a comment above each handler: // STUB — response shape unknown, update with real data
```

**Confidence score:** 
- With OpenAPI spec: 0.85
- Without spec: 0.45

---

#### Task 2: Playwright Config Generation

**System prompt:**
```
You are a senior frontend engineer generating Playwright configuration files.
Generate only valid TypeScript. No explanations. No markdown fences. Output file content only.
```

**User prompt:**
```
Generate a playwright.config.ts for a {framework} SPA.

Requirements:
- Use @playwright/test
- baseURL: 'http://localhost:{port}' where port is {detectedPort} (default 4200 for Angular, 3000 for React)
- testDir: './e2e/tests'
- Single browser: chromium only in v1
- Screenshot on failure
- Video: retain-on-failure
- Reporter: list for local, junit for CI
- Set timeout: 30000
- Do not use webServer config — app is started manually
- Use fullyParallel: false for stability on first run
```

---

#### Task 3: Smoke Test Generation

Generate one test file per detected route. One AI call covering all routes.

**System prompt:**
```
You are a senior frontend engineer writing Playwright tests.
Generate only valid TypeScript using @playwright/test syntax. No explanations. No markdown fences.
Output a single test file covering all routes provided.
```

**User prompt:**
```
Generate Playwright smoke tests for a {framework} SPA with the following routes:

Routes:
{routeList}

Requirements:
- Import { test, expect } from '@playwright/test'
- One test per route
- Each test: navigate to route, assert page title exists, assert no console errors
- Use page.getByRole() and page.getByLabel() locators where possible
- Avoid CSS selectors unless no other option
- Add comment above fragile selectors: // FRAGILE — add data-testid to improve stability
- Group all tests in a single describe block named 'Smoke Tests'
- All tests tagged with @smoke
- Handle routes with params (e.g. /clients/:id) using a placeholder ID of '1'
```

---

#### Task 4: Workflow Test Generation

One AI call per `critical_workflow` entry.

**System prompt:**
```
You are a senior frontend engineer writing Playwright tests.
Generate only valid TypeScript using @playwright/test syntax. No explanations. No markdown fences.
Output a single test file for the workflow described.
```

**User prompt:**
```
Generate a Playwright test for the following user workflow in a {framework} SPA.

Workflow description: "{workflowDescription}"

Available routes: {routeList}
Available component selectors/names: {componentList}

Requirements:
- Import { test, expect } from '@playwright/test'
- Single test describing the full workflow
- Use page.getByRole(), page.getByLabel(), page.getByText() locators in preference order
- Add comment above fragile selectors: // FRAGILE — add data-testid to improve stability
- Add TODO comments where workflow steps are ambiguous: // TODO — verify this step against actual UI
- Use expect().toBeVisible() and expect().toHaveURL() assertions
- Tag test with @workflow
- Name the test file: {workflowSlug}.spec.ts
```

---

#### Task 5: MSW Browser Setup Generation

**System prompt:**
```
You are a senior frontend engineer. Generate setup files only. No explanations. No markdown fences.
```

**User prompt:**
```
Generate the MSW browser setup file for a {framework} SPA.

Requirements:
- File: e2e/msw/browser.ts
- Import { setupWorker } from 'msw/browser'
- Import handlers from './handlers'
- Export a worker instance
- Also generate the Playwright global setup file that starts the MSW worker before tests run
- Global setup file: e2e/global-setup.ts
```

---

### 7.4 Confidence Score Rules

Attach a confidence score to every generated file. Write score as a comment in the file header and include in `testability-report.md`.

| Condition | Score |
|---|---|
| MSW handlers generated from OpenAPI spec | 0.85 |
| MSW handlers generated from static analysis | 0.45 |
| Smoke tests with detected routes | 0.75 |
| Smoke tests on route with no components found | 0.50 |
| Workflow tests with clear route mapping | 0.80 |
| Workflow tests where route is ambiguous | 0.55 |

---

## 8. Output File Structure

All files written to `{repoRoot}/e2e/`.

```
e2e/
├── tests/
│   ├── smoke/
│   │   └── smoke.spec.ts              # All smoke tests (one per route)
│   └── workflows/
│       ├── user-logs-in.spec.ts       # One file per critical_workflow
│       ├── user-searches-client.spec.ts
│       └── user-exports-report.spec.ts
├── msw/
│   ├── browser.ts                     # MSW worker setup
│   └── handlers.ts                    # All MSW handlers
├── global-setup.ts                    # Playwright global setup
├── playwright.config.ts               # Playwright configuration
├── run-tests.sh                       # macOS/Linux local run script
├── run-tests.ps1                      # Windows local run script
├── README-TESTS.md                    # How to run, what was generated
└── testability-report.md              # Fragile selectors, gaps, recommendations
```

---

## 9. Local Run Scripts

### run-tests.sh (macOS / Linux)

```bash
#!/bin/bash
set -e

echo "Installing Playwright dependencies..."
npm install --save-dev @playwright/test msw

echo "Installing Playwright browsers..."
npx playwright install chromium

echo "Running smoke tests..."
npx playwright test e2e/tests/smoke --reporter=list

echo "Running workflow tests..."
npx playwright test e2e/tests/workflows --reporter=list
```

### run-tests.ps1 (Windows PowerShell)

```powershell
$ErrorActionPreference = "Stop"

Write-Host "Installing Playwright dependencies..."
npm install --save-dev @playwright/test msw

Write-Host "Installing Playwright browsers..."
npx playwright install chromium

Write-Host "Running smoke tests..."
npx playwright test e2e/tests/smoke --reporter=list

Write-Host "Running workflow tests..."
npx playwright test e2e/tests/workflows --reporter=list
```

Both scripts must:
- Check Node.js version >= 18 and fail with clear message if not
- Check that the app is running on the expected port before running tests
- Print the baseURL being tested against at the start

---

## 10. README-TESTS.md Template

Generate this file with actual values substituted from the scan and config.

```markdown
# Playwright Test Scaffold

Generated by CIB Scaffold Bootstrap Tool on {date}.

## What was generated

| File | Description | Confidence |
|---|---|---|
| e2e/tests/smoke/smoke.spec.ts | {routeCount} smoke tests covering all detected routes | {score} |
| e2e/tests/workflows/*.spec.ts | {workflowCount} workflow tests from your config | {score} |
| e2e/msw/handlers.ts | MSW mock handlers for {handlerCount} endpoints | {score} |
| e2e/playwright.config.ts | Playwright configuration | — |

## How to run locally

### Prerequisites
- Node.js 18 or higher
- The app must be running locally on port {port}
- Start your app first: `{startCommand}`

### macOS / Linux
```bash
bash e2e/run-tests.sh
```

### Windows (PowerShell)
```powershell
./e2e/run-tests.ps1
```

## Review before trusting these tests

- Tests marked `// FRAGILE` use unstable selectors. Review these first.
- MSW handlers marked `// STUB` return placeholder data. Update with real shapes.
- Tests with `// TODO` need manual verification against your actual UI.
- See `e2e/testability-report.md` for a full list of gaps and recommendations.

## Next steps

1. Run the tests and check which pass on first run
2. Fix any failures — see testability-report.md for guidance
3. Add `data-testid` attributes where flagged as FRAGILE
4. Update STUB handlers with real response shapes
5. Commit the `e2e/` directory and wire into your CI pipeline
```

---

## 11. Testability Report

Generate `e2e/testability-report.md` summarising the quality of what was generated.

### Sections

**1. Summary**
- Framework detected
- Routes found: N
- HTTP endpoints found: N
- OpenAPI spec used: yes/no
- Tests generated: N smoke + N workflow
- Overall confidence: average score

**2. MSW Handler Quality**
- List each handler with confidence score
- Flag stub handlers with recommended action
- If no spec: recommendation to add OpenAPI spec

**3. Fragile Selectors**
- List every generated selector marked `// FRAGILE`
- For each: file, line reference, suggested testid name using convention from config
- Count: N of N selectors are fragile

**4. Missing Testid Coverage**
- List components found with no testid attributes
- For each: file path, count of interactive elements found
- Recommendation: run testid scaffold (v2 feature) or add manually

**5. Route Coverage Gaps**
- List routes that had low confidence test generation
- Note any routes with params that need real IDs substituted

**6. Recommended Next Steps**
- Ordered list of actions from highest to lowest impact

---

## 12. Error Handling

All errors must be human-readable. No stack traces shown to user by default (use `--verbose` to see stack trace).

### Error catalogue

| Error | Message | Exit code |
|---|---|---|
| Config file not found | `scaffold-config.yml not found in {path}. Create this file first. See README for template.` | 1 |
| Invalid framework | `framework must be 'angular' or 'react'. Got: '{value}'` | 1 |
| No workflows defined | `critical_workflows must have at least one entry in scaffold-config.yml` | 1 |
| Missing Azure endpoint | `azure_openai_endpoint is required in scaffold-config.yml` | 1 |
| Missing API key env var | (see Section 4) | 1 |
| OpenAPI spec not found | `Warning: openapi_spec path not found: {path}. Falling back to static analysis.` | 0 (warn, continue) |
| Azure OpenAI rate limit | `Azure OpenAI rate limit hit. Retrying in {n}s... (attempt {n}/3)` | — |
| Azure OpenAI auth failure | `Azure OpenAI authentication failed. Check your AZURE_OPENAI_API_KEY and endpoint.` | 1 |
| e2e/ already exists | (see Section 5) | 1 |
| Framework not detected | `Could not detect framework from package.json. Set 'framework' explicitly in scaffold-config.yml` | 1 |

---

## 13. Progress Output

Print clear progress to stdout during execution. Always show this — not just in verbose mode.

```
CIB Scaffold Bootstrap
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Config loaded — framework: angular, ci: azure-devops
✓ Scanning repository...
  → Routes found: 8
  → HTTP endpoints found: 14
  → Components found: 23
  → OpenAPI spec: found (./docs/api-spec.json)

✓ Generating MSW handlers (14 endpoints)... done [0.85]
✓ Generating Playwright config... done
✓ Generating smoke tests (8 routes)... done [0.75]
✓ Generating workflow tests (3 workflows)...
  → user-logs-in... done [0.80]
  → user-searches-client... done [0.78]
  → user-exports-report... done [0.72]
✓ Generating run scripts...
✓ Generating README-TESTS.md...
✓ Generating testability-report.md...

✓ Writing files to e2e/...
  → 12 files written

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done. Scaffold generated in 23s.

Confidence summary:
  MSW handlers:     0.85  (spec used)
  Smoke tests:      0.75
  Workflow tests:   0.77  (avg)

⚠  6 fragile selectors — see e2e/testability-report.md
⚠  3 stub handlers need real response shapes

Next step: Start your app, then run:
  macOS/Linux:  bash e2e/run-tests.sh
  Windows:      ./e2e/run-tests.ps1
```

---

## 14. Technology Stack

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Node.js 18+ | Cross-platform, available on dev machines, async/await native |
| Language | TypeScript | Type safety, better AI tooling support |
| Config parsing | `js-yaml` | YAML config file |
| OpenAPI parsing | `@apidevtools/swagger-parser` | Validates and resolves $refs |
| AST parsing (Angular) | `@angular-eslint/template-parser` or regex | Extract routes from template files |
| AST parsing (React) | `@babel/parser` | Parse JSX route definitions |
| HTTP client | Native `fetch` (Node 18+) | No extra dependency for Azure OpenAI calls |
| CLI framework | `commander` | Flags and help text |
| File system | `fs/promises` | Async file operations |
| Progress output | `ora` | Spinner for AI calls |
| Cross-platform paths | `path` (Node built-in) | Windows/macOS path handling |

### package.json entry point

```json
{
  "name": "@cib/scaffold-tool",
  "version": "1.0.0",
  "bin": {
    "scaffold-bootstrap": "./dist/cli.js"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## 15. Project Structure

```
scaffold-tool/
├── src/
│   ├── cli.ts                  # Entry point — parse flags, orchestrate
│   ├── config.ts               # Load and validate .scaffold-config.yml
│   ├── scanner/
│   │   ├── index.ts            # Scanner orchestrator
│   │   ├── routes.ts           # Route detection (Angular + React)
│   │   ├── http-calls.ts       # HTTP service call detection
│   │   ├── components.ts       # Component discovery
│   │   └── openapi.ts          # OpenAPI spec parsing
│   ├── generator/
│   │   ├── index.ts            # Generator orchestrator
│   │   ├── msw.ts              # MSW handler generation
│   │   ├── playwright-config.ts
│   │   ├── smoke-tests.ts
│   │   ├── workflow-tests.ts
│   │   ├── run-scripts.ts      # Shell and PowerShell run scripts
│   │   └── reports.ts          # README and testability report
│   ├── ai/
│   │   ├── client.ts           # Azure OpenAI client with retry logic
│   │   └── prompts.ts          # All prompt templates
│   ├── writer/
│   │   └── index.ts            # Write output files to e2e/ directory
│   └── types.ts                # Shared TypeScript interfaces
├── tests/
│   ├── scanner/                # Unit tests for each scanner module
│   ├── generator/              # Unit tests for generators (mock AI calls)
│   └── fixtures/               # Sample Angular and React repos for testing
├── .scaffold-config.example.yml
├── package.json
├── tsconfig.json
└── README.md
```

---

## 16. Testing the Tool Itself

The tool must have its own tests. Do not build this without tests.

### Scanner tests
- Unit test route detection against fixture Angular and React projects
- Unit test HTTP call detection against sample service files
- Test OpenAPI parser against a sample spec

### Generator tests
- Mock the Azure OpenAI client
- Assert correct prompt is sent for each generation task
- Assert output files have expected structure

### Integration test
- One end-to-end test using a minimal fixture Angular SPA
- Runs with `--no-ai` flag to avoid real API calls
- Asserts all expected files are created in the right locations
- Asserts testability report contains expected sections

### Fixture projects
- `tests/fixtures/angular-minimal/` — bare Angular SPA with 3 routes, 2 services
- `tests/fixtures/react-minimal/` — bare React SPA with 3 routes, 2 fetch calls

---

## 17. Out of Scope for This Build

The following are explicitly not part of this spec:

- Testid scaffolding (Flow 2) — separate spec
- PR-triggered test generation (Flow 3) — requires GitHub Actions
- Failure insights report (Flow 4) — requires GitHub Actions
- CI pipeline YAML generation — deferred, teams run locally first
- Runtime app crawling — v2
- Network traffic recording for MSW — v2
- GUI or web interface — CLI only
- Authentication flows in generated tests — too app-specific for v1
- Test parallelisation configuration — single worker in v1 for stability

---

## 18. Definition of Done

The build is complete when:

- [ ] `scaffold-bootstrap` command runs on macOS and Windows without errors
- [ ] Reads and validates `.scaffold-config.yml` correctly
- [ ] Scanner correctly detects routes in both Angular and React fixture projects
- [ ] Scanner correctly detects HTTP calls in Angular services and React fetch/axios patterns
- [ ] All 5 AI generation tasks execute and write output files
- [ ] `--dry-run` flag prints planned output without writing files
- [ ] `--no-ai` flag generates stub structure without any API calls
- [ ] All output files written to `e2e/` directory with correct structure
- [ ] `run-tests.sh` and `run-tests.ps1` are executable and correct
- [ ] `README-TESTS.md` contains correct values substituted from scan
- [ ] `testability-report.md` contains all required sections
- [ ] Progress output is clear and shows confidence scores
- [ ] All error messages are human-readable with no raw stack traces
- [ ] All scanner unit tests pass
- [ ] All generator unit tests pass (with mocked AI)
- [ ] Integration test passes against fixture projects with `--no-ai`
- [ ] Tool installs globally via `npm install -g` on both platforms

---

*End of specification.*
