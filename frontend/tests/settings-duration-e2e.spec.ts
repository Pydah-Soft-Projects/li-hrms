import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

async function assertServersReachable(baseURL: string) {
  const origin = baseURL.replace(/\/$/, '');
  const healthUrl = process.env.PLAYWRIGHT_API_HEALTH || 'http://localhost:5000/health';
  let frontendOk = false;
  let backendOk = false;
  try {
    const fe = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(8000) });
    frontendOk = fe.ok || fe.status === 200;
  } catch {
    frontendOk = false;
  }
  try {
    const be = await fetch(healthUrl, { signal: AbortSignal.timeout(8000) });
    backendOk = be.ok;
  } catch {
    backendOk = false;
  }
  return { frontendOk, backendOk };
}

test.describe('Settings duration inputs E2E', () => {
  test.beforeAll(async ({}, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string;
    const { frontendOk, backendOk } = await assertServersReachable(baseURL || 'http://localhost:3000');
    if (!frontendOk || !backendOk) {
      test.skip(
        true,
        `Skipped: start backend (${backendOk ? 'up' : 'down'}) and frontend (${frontendOk ? 'up' : 'down'}) before npm run test:ui:e2e`
      );
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('global OT settings use 24h duration selectors for slabs', async ({ page }) => {
    await page.goto('/superadmin/settings?tab=ot');
    await expect(page.getByText('Ranges (HH:MM)')).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: '+ Add range' }).click();

    const hourSelects = page.locator('[data-duration-time="hours"]');
    const minuteSelects = page.locator('[data-duration-time="minutes"]');
    await expect(hourSelects.first()).toBeVisible();

    const firstHours = hourSelects.nth(0);
    const firstMinutes = minuteSelects.nth(0);
    const secondHours = hourSelects.nth(1);
    const secondMinutes = minuteSelects.nth(1);
    const thirdHours = hourSelects.nth(2);
    const thirdMinutes = minuteSelects.nth(2);

    await firstHours.selectOption('00');
    await firstMinutes.selectOption('30');
    await secondHours.selectOption('01');
    await secondMinutes.selectOption('00');
    await thirdHours.selectOption('01');
    await thirdMinutes.selectOption('00');

    await expect(firstHours).toHaveValue('00');
    await expect(firstMinutes).toHaveValue('30');
    await expect(secondHours).toHaveValue('01');
    await expect(secondMinutes).toHaveValue('00');
  });

  test('global permissions auto-edge uses 24h duration selectors', async ({ page }) => {
    await page.goto('/superadmin/settings?tab=permissions');
    await expect(page.getByText('Auto Late-In / Early-Out Permissions')).toBeVisible({ timeout: 20000 });

    const addButtons = page.getByRole('button', { name: 'Add' });
    await expect(addButtons.first()).toBeVisible();
    await addButtons.first().click();

    const hourSelects = page.locator('[data-duration-time="hours"]');
    await expect(hourSelects.first()).toBeVisible();

    await hourSelects.nth(0).selectOption('08');
    await page.locator('[data-duration-time="minutes"]').nth(0).selectOption('00');
    await expect(hourSelects.nth(0)).toHaveValue('08');

    await hourSelects.nth(3).selectOption('03');
    await page.locator('[data-duration-time="minutes"]').nth(3).selectOption('00');
    await expect(hourSelects.nth(3)).toHaveValue('03');
  });

  test('department OT settings use 24h duration selectors', async ({ page }) => {
    await page.goto('/superadmin/settings/departmental');
    await expect(page.getByText('Department settings', { exact: false }).or(page.getByRole('heading'))).toBeVisible({
      timeout: 20000,
    });

    const deptSelect = page.locator('select').filter({ has: page.locator('option') }).first();
    const optionCount = await deptSelect.locator('option').count();
    if (optionCount <= 1) {
      test.skip(true, 'No departments in DB — pick a department manually to test dept OT slabs');
      return;
    }
    await deptSelect.selectOption({ index: 1 });

    await page.getByRole('button', { name: /OT|Overtime/i }).first().click();
    await expect(page.getByText('Ranges (HH:MM)')).toBeVisible({ timeout: 15000 });

    const hourSelects = page.locator('[data-duration-time="hours"]');
    if ((await hourSelects.count()) === 0) {
      await page.getByRole('button', { name: '+ Add range' }).click();
    }
    const firstHours = hourSelects.first();
    await firstHours.selectOption('00');
    await page.locator('[data-duration-time="minutes"]').first().selectOption('45');
    await expect(firstHours).toHaveValue('00');
  });
});
