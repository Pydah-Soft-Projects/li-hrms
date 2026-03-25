const mongoose = require('mongoose');
require('dotenv').config();

const accrualEngine = require('../leaves/services/accrualEngine');
const monthlyPoolCarryForwardService = require('../leaves/services/monthlyPoolCarryForwardService');
const dateCycleService = require('../leaves/services/dateCycleService');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const { extractISTComponents, createISTDate } = require('../shared/utils/dateUtils');

async function hasPoolCarryAlreadyRun(payrollCycleMonth, payrollCycleYear) {
  const doc = await LeaveRegisterYear.findOne({
    'months': {
      $elemMatch: {
        payrollCycleMonth,
        payrollCycleYear,
        poolCarryForwardOutAt: { $exists: true, $ne: null },
      },
    },
  })
    .lean();
  return !!doc;
}

async function runAccrualNow(payrollCycleMonth, payrollCycleYear) {
  // Prevent running twice if cron / previous manual run already completed.
  if (await hasPoolCarryAlreadyRun(payrollCycleMonth, payrollCycleYear)) {
    console.log(
      `[ManualAccrualTrigger] Skip: pool carry-forward already ran for ${payrollCycleMonth}/${payrollCycleYear}.`
    );
    return;
  }

  console.log(
    `[ManualAccrualTrigger] Running monthly accruals for payroll cycle ${payrollCycleMonth}/${payrollCycleYear}...`
  );
  const results = await accrualEngine.postMonthlyAccruals(payrollCycleMonth, payrollCycleYear);

  console.log(
    `[ManualAccrualTrigger] Accrual engine done: processed=${results.processed}, clCredits=${results.clCredits}, elCredits=${results.elCredits}, expiredCCLs=${results.expiredCCLs}`
  );

  console.log(`[ManualAccrualTrigger] Running pool carry-forward / forfeit for ${payrollCycleMonth}/${payrollCycleYear}...`);
  const pool = await monthlyPoolCarryForwardService.processPayrollCycleCarryForward(payrollCycleMonth, payrollCycleYear);

  console.log(
    `[ManualAccrualTrigger] Pool carry done: processed=${pool.processed}, carriesPosted=${pool.carriesPosted}, forfeitsPosted=${pool.forfeitsPosted}, carriedEmployees=${pool.carriedEmployees}, errors=${pool.errors.length}`
  );
}

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  const now = new Date();
  const periodInfo = await dateCycleService.getPeriodInfo(now);
  const { payrollCycle } = periodInfo;

  const nowIST = extractISTComponents(now).dateStr;
  const cycleEnd = payrollCycle.endDate;
  const cycleEndIST = extractISTComponents(cycleEnd).dateStr;

  if (nowIST !== cycleEndIST) {
    console.log(
      `[ManualAccrualTrigger] Not cycle-end day. Today(IST)=${nowIST}, cycleEnd(IST)=${cycleEndIST}. Nothing triggered.`
    );
    await mongoose.disconnect();
    return;
  }

  const runAt = createISTDate(cycleEndIST, '23:55');
  const delayMs = runAt.getTime() - now.getTime();

  console.log(
    JSON.stringify(
      {
        now: now.toISOString(),
        nowIST,
        payrollCycleMonth: payrollCycle.month,
        payrollCycleYear: payrollCycle.year,
        cycleEnd: cycleEnd.toISOString(),
        cycleEndIST,
        runAt: runAt.toISOString(),
        delayMinutes: Math.round(delayMs / 60000),
      },
      null,
      2
    )
  );

  const month = Number(payrollCycle.month);
  const year = Number(payrollCycle.year);

  if (delayMs <= 0) {
    await runAccrualNow(month, year);
    await mongoose.disconnect();
    return;
  }

  console.log(`[ManualAccrualTrigger] Waiting until 23:55 IST...`);
  setTimeout(async () => {
    try {
      await runAccrualNow(month, year);
    } catch (e) {
      console.error('[ManualAccrualTrigger] Failed:', e?.message || e);
    } finally {
      await mongoose.disconnect().catch(() => {});
      console.log('[ManualAccrualTrigger] Done.');
      process.exit(0);
    }
  }, delayMs);
}

main().catch(async (e) => {
  console.error('[ManualAccrualTrigger] Fatal:', e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

