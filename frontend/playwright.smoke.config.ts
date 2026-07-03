import { defineConfig, devices } from '@playwright/test';

/**
 * Fast smoke tests — no servers required.
 * Run: npm run test:ui:smoke
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['duration-time-helpers.spec.ts', 'duration-time-input-ui.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  timeout: 30000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
