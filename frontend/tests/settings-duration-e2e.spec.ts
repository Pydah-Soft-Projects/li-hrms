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

  test('global OT settings use 24h text duration inputs for slabs', async ({ page }) => {
    await page.goto('/superadmin/settings?tab=ot');
    await expect(page.getByText('Ranges (HH:MM)')).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: '+ Add range' }).click();

    const durationInputs = page.locator('input[title*="24-hour"]');
    await expect(durationInputs.first()).toBeVisible();
    await expect(durationInputs.first()).toHaveAttribute('type', 'text');

    const first = durationInputs.nth(0);
    const second = durationInputs.nth(1);
    const third = durationInputs.nth(2);

    await first.fill('00:30');
    await first.blur();
    await second.fill('01:00');
    await second.blur();
    await third.fill('01:00');
    await third.blur();

    await expect(first).toHaveValue('00:30');
    await expect(second).toHaveValue('01:00');
    await expect(third).toHaveValue('01:00');
  });

  test('global permissions auto-edge uses 24h duration fields', async ({ page }) => {
    await page.goto('/superadmin/settings?tab=permissions');
    await expect(page.getByText('Auto Late-In / Early-Out Permissions')).toBeVisible({ timeout: 20000 });

    const addButtons = page.getByRole('button', { name: 'Add' });
    await expect(addButtons.first()).toBeVisible();
    await addButtons.first().click();

    const durationInputs = page.locator('input[title*="24-hour"]');
    await expect(durationInputs.first()).toBeVisible();

    const minShift = durationInputs.nth(0);
    await minShift.fill('08:00');
    await minShift.blur();
    await expect(minShift).toHaveValue('08:00');

    const allowed = durationInputs.nth(3);
    await allowed.fill('03:00');
    await allowed.blur();
    await expect(allowed).toHaveValue('03:00');
  });

  test('department OT settings use 24h text inputs', async ({ page }) => {
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

    const durationInputs = page.locator('input[title*="24-hour"]');
    if ((await durationInputs.count()) === 0) {
      await page.getByRole('button', { name: '+ Add range' }).click();
    }
    const first = durationInputs.first();
    await expect(first).toHaveAttribute('type', 'text');
    await first.fill('00:45');
    await first.blur();
    await expect(first).toHaveValue('00:45');
  });
});
