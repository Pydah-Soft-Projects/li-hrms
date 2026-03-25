const mongoose = require('mongoose');
require('dotenv').config();

const accrualEngine = require('../leaves/services/accrualEngine');
const monthlyPoolCarryForwardService = require('../leaves/services/monthlyPoolCarryForwardService');
const dateCycleService = require('../leaves/services/dateCycleService');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  const now = new Date();
  const periodInfo = await dateCycleService.getPeriodInfo(now);
  const { payrollCycle } = periodInfo;

  const month = Number(payrollCycle.month);
  const year = Number(payrollCycle.year);

  console.log(`[ManualAccrualNow] Running now for payroll cycle ${month}/${year}...`);
  const results = await accrualEngine.postMonthlyAccruals(month, year);
  console.log(
    `[ManualAccrualNow] Accrual engine done: processed=${results.processed}, clCredits=${results.clCredits}, elCredits=${results.elCredits}, expiredCCLs=${results.expiredCCLs}`
  );

  console.log(`[ManualAccrualNow] Running pool carry-forward / forfeit for ${month}/${year}...`);
  const pool = await monthlyPoolCarryForwardService.processPayrollCycleCarryForward(month, year);
  console.log(
    `[ManualAccrualNow] Pool carry done: processed=${pool.processed}, carriesPosted=${pool.carriesPosted}, forfeitsPosted=${pool.forfeitsPosted}, carriedEmployees=${pool.carriedEmployees}, errors=${pool.errors.length}`
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('[ManualAccrualNow] Failed:', e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

