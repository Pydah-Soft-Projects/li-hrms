/**
 * Run leave accrual (EL + CCL expiry in engine) for an explicit payroll month/year.
 * Same logic as POST /api/leaves/accrual/run-monthly with body { month, year }.
 *
 * Usage: node scripts/runMonthlyAccrualForPayrollMonth.js <month 1-12> <year>
 * Example: node scripts/runMonthlyAccrualForPayrollMonth.js 3 2026
 */
const mongoose = require('mongoose');
require('dotenv').config();

// Register models used by pool carry / employee payload (standalone script).
require('../departments/model/Department');

const accrualEngine = require('../leaves/services/accrualEngine');
const monthlyPoolCarryForwardService = require('../leaves/services/monthlyPoolCarryForwardService');

async function main() {
  const month = Number(process.argv[2]);
  const year = Number(process.argv[3]);
  if (!month || month < 1 || month > 12 || !year) {
    console.error('Usage: node scripts/runMonthlyAccrualForPayrollMonth.js <month 1-12> <year>');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);
  console.log(`[Accrual] Connected. Running postMonthlyAccruals for payroll month ${month}/${year}...`);

  const results = await accrualEngine.postMonthlyAccruals(month, year);
  console.log(
    `[Accrual] Done: processed=${results.processed}, elCredits=${results.elCredits}, expiredCCLs=${results.expiredCCLs}, errors=${(results.errors || []).length}`
  );
  if (results.errors && results.errors.length) {
    console.warn('[Accrual] First errors:', results.errors.slice(0, 8));
  }

  try {
    const pool = await monthlyPoolCarryForwardService.processPayrollCycleCarryForward(month, year);
    console.log(
      `[PoolCarry] processed=${pool.processed}, carriesPosted=${pool.carriesPosted}, forfeitsPosted=${pool.forfeitsPosted}, skipped=${pool.skipped}, errors=${(pool.errors || []).length}`
    );
    if (pool.errors && pool.errors.length) {
      console.warn('[PoolCarry] First errors:', pool.errors.slice(0, 5));
    }
  } catch (e) {
    console.warn('[PoolCarry] Skipped or failed:', e.message);
  }

  await mongoose.disconnect();
  console.log('[Accrual] Disconnected.');
}

main().catch(async (e) => {
  console.error('[Accrual] Failed:', e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
