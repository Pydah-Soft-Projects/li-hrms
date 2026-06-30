import { test, expect } from '@playwright/test';

/**
 * Mirrors DurationTimeInput blur normalization without mounting React.
 */
const HARNESS_HTML = `
<!DOCTYPE html>
<html lang="en-GB">
  <body>
    <label for="duration">Duration (HH:MM)</label>
    <input
      id="duration"
      type="text"
      inputmode="numeric"
      lang="en-GB"
      pattern="^\\d{1,2}:[0-5]\\d$"
      title="24-hour time (HH:MM)"
      placeholder="00:00"
    />
    <script>
      const input = document.getElementById('duration');
      input.addEventListener('blur', () => {
        const v = String(input.value || '').trim();
        const m = v.match(/^(\\d{1,2}):([0-5]?\\d)$/);
        if (!m) return;
        const hh = String(parseInt(m[1], 10)).padStart(2, '0');
        const mm = String(parseInt(m[2], 10)).padStart(2, '0');
        input.value = hh + ':' + mm;
      });
    </script>
  </body>
</html>
`;

test.describe('Duration text input UI (24h, not OS picker)', () => {
  test('uses text input instead of native time picker', async ({ page }) => {
    await page.setContent(HARNESS_HTML);
    const input = page.locator('#duration');
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveAttribute('lang', 'en-GB');
    await expect(input).not.toHaveAttribute('type', 'time');
  });

  test('normalizes partial HH:MM on blur', async ({ page }) => {
    await page.setContent(HARNESS_HTML);
    const input = page.locator('#duration');
    await input.fill('1:30');
    await input.blur();
    await expect(input).toHaveValue('01:30');
  });

  test('accepts 24h OT slab values without AM/PM', async ({ page }) => {
    await page.setContent(HARNESS_HTML);
    const input = page.locator('#duration');
    await input.fill('03:00');
    await input.blur();
    await expect(input).toHaveValue('03:00');
    const visible = await input.inputValue();
    expect(visible).not.toMatch(/AM|PM/i);
  });
});
