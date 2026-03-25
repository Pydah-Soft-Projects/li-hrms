/**
 * Monthly leave accrual cron (IST).
 * Creates leave register entries and EL-related data at the END of each payroll cycle.
 *
 * Goal: run EL accruals (and CCL expiry) so that:
 * - Leave register has CREDIT transactions for the completed cycle (month, year).
 * - EL is available when payroll runs for that period.
 *
 * Strategy:
 * - Schedule a light job every day at 00:10 IST.
 * - For each run, resolve today's payroll cycle via dateCycleService.
 * - Only when today is the LAST DAY of that payroll cycle do we trigger
 *   accrualEngine.postMonthlyAccruals(month, year) for that cycle.
 * - That posts EL credits (and CCL expiry) to the leave register for the cycle
 *   that just ended, so "next month" views and payroll see correct balances.
 */

const cron = require('node-cron');
const accrualEngine = require('../services/accrualEngine');
const dateCycleService = require('../services/dateCycleService');
const monthlyClScheduledCreditService = require('../services/monthlyClScheduledCreditService');

const CRON_IST = '55 23 * * *'; // 23:55 every day
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

        try {
          const clForfeit = await monthlyClScheduledCreditService.forfeitUnusedScheduledClIfNeeded(month, year);
          if (clForfeit.forfeitsPosted > 0 || clForfeit.errors.length > 0) {
            console.log(
              `[AccrualCron] CL monthly scheduled forfeit: yearDocs=${clForfeit.processed}, posted=${clForfeit.forfeitsPosted}, skipped=${clForfeit.skipped}, errors=${clForfeit.errors.length}`
            );
          }
          if (clForfeit.errors.length > 0) {
            console.warn('[AccrualCron] CL forfeit errors:', clForfeit.errors.slice(0, 5));
          }
        } catch (forfeitErr) {
          console.error('[AccrualCron] CL scheduled forfeit failed:', forfeitErr.message);
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
