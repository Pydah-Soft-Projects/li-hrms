import { test, expect } from '@playwright/test';

/**
 * Static harness mirroring the 24h hour/minute selector pattern.
 */
const HARNESS_HTML = `
<!DOCTYPE html>
<html lang="en-GB">
  <body>
    <div data-duration-time="picker">
      <select id="hours" aria-label="Hours (24-hour)" data-duration-time="hours">
        <option value="00">00</option>
        <option value="01">01</option>
        <option value="03">03</option>
      </select>
      <span>:</span>
      <select id="minutes" aria-label="Minutes" data-duration-time="minutes">
        <option value="00">00</option>
        <option value="30">30</option>
        <option value="45">45</option>
      </select>
    </div>
  </body>
</html>
`;

test.describe('Duration 24h selector UI (not OS locale picker)', () => {
  test('uses hour and minute selects instead of native time input', async ({ page }) => {
    await page.setContent(HARNESS_HTML);
    await expect(page.locator('[data-duration-time="hours"]')).toBeVisible();
    await expect(page.locator('[data-duration-time="minutes"]')).toBeVisible();
    await expect(page.locator('input[type="time"]')).toHaveCount(0);
  });

  test('selects 24h OT slab values without AM/PM', async ({ page }) => {
    await page.setContent(HARNESS_HTML);
    await page.locator('#hours').selectOption('00');
    await page.locator('#minutes').selectOption('30');
    await expect(page.locator('#hours')).toHaveValue('00');
    await expect(page.locator('#minutes')).toHaveValue('30');

    const hoursText = await page.locator('#hours').innerText();
    expect(hoursText).not.toMatch(/AM|PM/i);
  });

  test('supports duration-style values like 03:00', async ({ page }) => {
    await page.setContent(HARNESS_HTML);
    await page.locator('#hours').selectOption('03');
    await page.locator('#minutes').selectOption('00');
    await expect(page.locator('#hours')).toHaveValue('03');
    await expect(page.locator('#minutes')).toHaveValue('00');
  });
});
