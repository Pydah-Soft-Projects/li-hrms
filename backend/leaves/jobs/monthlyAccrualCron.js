/**
 * Monthly leave accrual cron (IST).
 *
 * Runs once per calendar day at 23:55 Asia/Kolkata. On the **last day of each payroll cycle**
 * only, it runs two steps in order for that cycle’s `(month, year)` label:
 *
 * 1) `accrualEngine.postMonthlyAccruals(month, year)`
 *    - Per active employee: EL credit when eligible (idempotent per cycle), CCL **EXPIRY** rows
 *      for comp-off past policy age, both via `leaveRegisterService` → `leaveRegisterYearLedgerService`.
 *    - CCL EXPIRY shrinks the current slot’s `compensatoryOffs` in the ledger layer so pool and
 *      balance stay aligned (see `leaveRegisterYearLedgerService.addTransaction`).
 *
 * 2) `monthlyPoolCarryForwardService.processPayrollCycleCarryForward(month, year)`
 *    - For each `LeaveRegisterYear` row that has that payroll month: compute unused CL/CCL/EL
 *      monthly apply pool after cap consumption; update **next** month’s slot totals and post
 *      transfer OUT/IN ledger rows.
 *    - **Correctness:** the next slot’s `compensatoryOffs` is increased here **before** the CCL
 *      `MONTHLY_POOL_TRANSFER_IN_CCL` credit is posted; `addTransaction` must **not** bump the slot
 *      again for that auto-type (handled in `leaveRegisterYearLedgerService`). That is what makes
 *      each cron run write correct pools — no per-run reconcile script is required after deploy.
 *
 * One-time DB backfill for rows created **before** that ledger fix: optional script
 * `scripts/reconcile_leave_register_ccl_double_transfer_in.js` (not invoked by this cron).
 */

const cron = require('node-cron');
const accrualEngine = require('../services/accrualEngine');
const dateCycleService = require('../services/dateCycleService');
const monthlyPoolCarryForwardService = require('../services/monthlyPoolCarryForwardService');

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
          const pool = await monthlyPoolCarryForwardService.processPayrollCycleCarryForward(month, year);
          if (
            pool.carriesPosted > 0 ||
            pool.forfeitsPosted > 0 ||
            pool.errors.length > 0
          ) {
            console.log(
              `[AccrualCron] Monthly pool carry: processed=${pool.processed}, carriesPosted=${pool.carriesPosted}, forfeitsPosted=${pool.forfeitsPosted}, carriedEmployees=${pool.carriedEmployees}, skipped=${pool.skipped}, errors=${pool.errors.length}`
            );
          }
          if (pool.errors.length > 0) {
            console.warn('[AccrualCron] Pool carry errors:', pool.errors.slice(0, 8));
          }
        } catch (poolErr) {
          console.error('[AccrualCron] Monthly pool carry-forward failed:', poolErr.message);
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
    `[AccrualCron] Scheduled: ${CRON_IST} (${TIMEZONE}) — on each payroll cycle end: EL accrual + CCL expiry, then monthly pool carry (CL/CCL/EL)`
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
