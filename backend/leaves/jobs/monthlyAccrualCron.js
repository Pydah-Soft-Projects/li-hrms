/**
 * Monthly leave accrual cron (IST).
 * Runs at 00:10 IST on the 1st of every month and posts CL + EL accruals
 * (and CCL expiry) for the previous month.
 */

const cron = require('node-cron');
const accrualEngine = require('../services/accrualEngine');

const CRON_IST = '10 0 1 * *'; // 00:10 on 1st of every month
const TIMEZONE = 'Asia/Kolkata';

let scheduledTask = null;

function startMonthlyAccrualCron() {
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule(
    CRON_IST,
    async () => {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      const month = prev.getMonth() + 1;
      const year = prev.getFullYear();
      console.log(`[AccrualCron] Running monthly accruals for ${month}/${year} (IST 00:10 on 1st)`);
      try {
        const results = await accrualEngine.postMonthlyAccruals(month, year);
        console.log(`[AccrualCron] Done: processed=${results.processed}, clCredits=${results.clCredits}, elCredits=${results.elCredits}, expiredCCLs=${results.expiredCCLs}`);
        if (results.errors && results.errors.length > 0) {
          console.warn('[AccrualCron] Errors:', results.errors.slice(0, 5));
        }
      } catch (err) {
        console.error('[AccrualCron] Failed:', err.message);
      }
    },
    {
      timezone: TIMEZONE,
    }
  );

  console.log(`[AccrualCron] Scheduled: ${CRON_IST} (${TIMEZONE}) – monthly CL/EL accrual + CCL expiry`);
  return scheduledTask;
}

function stopMonthlyAccrualCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[AccrualCron] Stopped');
  }
}

module.exports = {
  startMonthlyAccrualCron,
  stopMonthlyAccrualCron,
};
