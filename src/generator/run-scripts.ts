export function generateRunScript(port: number): string {
  return `#!/bin/bash
set -e

# Always run from the repo root (parent of the e2e/ directory)
cd "$(dirname "$0")/.."

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18 or higher is required. Found: $(node -v 2>/dev/null || echo 'not installed')"
  exit 1
fi

# Check app is running
BASE_URL="http://localhost:${port}"
echo "Checking app is running on $BASE_URL..."
if ! curl -s --max-time 5 "$BASE_URL" > /dev/null 2>&1; then
  echo "Error: App does not appear to be running on $BASE_URL"
  echo "Start your app first, then re-run this script."
  exit 1
fi
echo "App is running on $BASE_URL"

echo ""
echo "Installing Playwright dependencies..."
npm install --save-dev @playwright/test

echo "Installing Playwright browsers..."
npx playwright install chromium

echo ""
echo "Running smoke tests..."
npx playwright test --config=e2e/playwright.config.ts --grep @smoke --reporter=list

echo ""
echo "Running workflow tests..."
npx playwright test --config=e2e/playwright.config.ts --grep @workflow --reporter=list
`;
}
