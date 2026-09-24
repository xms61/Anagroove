import { defineConfig, devices } from '@playwright/test';

// Smoke test against the production build and an offline fixture catalog (scripts/tests/e2e/server.ts).
// `npm run build` first. PLAYWRIGHT_CHANNEL=msedge|chrome uses an installed browser instead of
// the downloaded Chromium (`npx playwright install chromium`).
const port = Number(process.env.E2E_PORT) || 3101;

export default defineConfig({
  testDir: 'scripts/tests/e2e',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
  ],
  webServer: {
    command: 'node scripts/tests/e2e/server.ts',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { E2E_PORT: String(port) },
  },
});
