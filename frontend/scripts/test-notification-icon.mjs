/**
 * One-off: verify HRMS notification icon/badge assets and show a test notification via sw.js paths.
 * Run: node scripts/test-notification-icon.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await context.grantPermissions(['notifications'], { origin: BASE });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Browser.grantPermissions', {
    origin: BASE,
    permissions: ['notifications'],
  });

  const result = await page.evaluate(async () => {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      throw new Error(`Notification permission: ${perm}`);
    }

    const swText = await (await fetch('/sw.js')).text();
    const iconMatch = swText.match(/icon:\s*'([^']+)'/);
    const badgeMatch = swText.match(/badge:\s*'([^']+)'/);
    if (!iconMatch || !badgeMatch) {
      throw new Error('Could not parse icon/badge paths from sw.js');
    }

    const icon = iconMatch[1];
    const badge = badgeMatch[1];

    const [iconRes, badgeRes] = await Promise.all([fetch(icon), fetch(badge)]);

    const iconBytes = (await iconRes.blob()).size;
    const badgeBytes = (await badgeRes.blob()).size;

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    await reg.update();

    const tag = `hrms-icon-test-${Date.now()}`;
    await reg.showNotification('HRMS — Icon Test', {
      body: 'If you see the HRMS logo, the notification icon is wired correctly.',
      icon,
      badge,
      tag,
      data: { url: '/' },
    });

    const notifications = await reg.getNotifications({ tag });
    const shown = notifications[0];
    const opts = shown || {};

    return {
      icon,
      badge,
      iconOk: iconRes.ok,
      badgeOk: badgeRes.ok,
      iconBytes,
      badgeBytes,
      notificationShown: Boolean(shown),
      notificationTitle: opts.title || null,
      notificationIcon: opts.icon || null,
      notificationBadge: opts.badge || null,
    };
  });

  console.log('\n=== HRMS Notification Icon Test ===\n');
  console.log('Service worker paths:');
  console.log(`  icon:  ${result.icon} (${result.iconOk ? 'OK' : 'FAIL'}, ${result.iconBytes} bytes)`);
  console.log(`  badge: ${result.badge} (${result.badgeOk ? 'OK' : 'FAIL'}, ${result.badgeBytes} bytes)`);
  console.log('\nBrowser notification:');
  console.log(`  shown: ${result.notificationShown}`);
  console.log(`  title: ${result.notificationTitle}`);
  console.log(`  icon:  ${result.notificationIcon}`);
  console.log(`  badge: ${result.notificationBadge}`);

  const pass =
    result.iconOk &&
    result.badgeOk &&
    result.notificationShown &&
    result.notificationIcon?.includes('notification-icon') &&
    result.notificationBadge?.includes('notification-badge');

  console.log(`\nResult: ${pass ? 'PASS — notification uses the HRMS icons' : 'FAIL'}\n`);

  await browser.close();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
