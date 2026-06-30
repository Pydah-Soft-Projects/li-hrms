import { defineConfig, devices } from '@playwright/test';

/**
 * E2E settings tests — requires backend + frontend already running.
 *   Backend:  cd backend && npm start   (http://localhost:5000/health)
 *   Frontend: cd frontend && set NEXT_PUBLIC_API_URL=http://localhost:5000/api && npm run dev
 *   Credentials: PLAYWRIGHT_LOGIN_EMAIL / PLAYWRIGHT_LOGIN_PASSWORD (defaults: seed superadmin)
 * Run: npm run test:ui:e2e
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['settings-duration-e2e.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 90000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
