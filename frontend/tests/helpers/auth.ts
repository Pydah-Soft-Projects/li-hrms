import type { Page } from '@playwright/test';

export function getPlaywrightCredentials() {
  return {
    email: process.env.PLAYWRIGHT_LOGIN_EMAIL || 'tejaa@hrms.com',
    password: process.env.PLAYWRIGHT_LOGIN_PASSWORD || 'Admin@123',
  };
}

export async function loginAsAdmin(page: Page) {
  const { email, password } = getPlaywrightCredentials();
  await page.goto('/login');
  await page.waitForSelector('#identifier', { state: 'visible', timeout: 20000 });
  await page.fill('#identifier', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 });
}
