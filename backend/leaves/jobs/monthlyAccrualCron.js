/**
 * Monthly leave accrual cron (IST).
 * Goal: run CL + EL accruals (and CCL expiry) at the END of each payroll cycle,
 * so that EL is available when payroll runs.
 *
 * Strategy:
 * - Schedule a light job every day at 00:10 IST.
 * - For each run, resolve today's payroll cycle via dateCycleService.
 * - Only when today is the LAST DAY of that payroll cycle do we trigger
 *   accrualEngine.postMonthlyAccruals for that cycle's (month, year).
 */

const cron = require('node-cron');
const accrualEngine = require('../services/accrualEngine');
const dateCycleService = require('../services/dateCycleService');

const CRON_IST = '10 0 * * *'; // 00:10 every day
const TIMEZONE = 'Asia/Kolkata';

let scheduledTask = null;

function startMonthlyAccrualCron() {
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule(
    CRON_IST,
    async () => {
      const now = new Date();
      try {
        const periodInfo = await dateCycleService.getPeriodInfo(now);
        const { payrollCycle } = periodInfo;
        const cycleEnd = payrollCycle.endDate;

        // Only run when "today" matches the payroll cycle end date.
        if (
          now.getFullYear() !== cycleEnd.getFullYear() ||
          now.getMonth() !== cycleEnd.getMonth() ||
          now.getDate() !== cycleEnd.getDate()
        ) {
          return;
        }

        const month = payrollCycle.month;
        const year = payrollCycle.year;
        console.log(
          `[AccrualCron] Running monthly accruals for payroll cycle ending ${cycleEnd.toISOString()} → month=${month}, year=${year}`
        );

        const results = await accrualEngine.postMonthlyAccruals(month, year);
        console.log(
          `[AccrualCron] Done: processed=${results.processed}, clCredits=${results.clCredits}, elCredits=${results.elCredits}, expiredCCLs=${results.expiredCCLs}`
        );
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

  console.log(
    `[AccrualCron] Scheduled: ${CRON_IST} (${TIMEZONE}) – daily check; CL/EL accrual + CCL expiry run only on payroll cycle end date`
  );
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
