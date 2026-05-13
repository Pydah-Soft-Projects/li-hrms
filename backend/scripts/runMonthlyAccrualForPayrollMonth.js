/**
 * Run leave accrual (EL + CCL expiry in engine) for an explicit payroll month/year.
 * Same logic as POST /api/leaves/accrual/run-monthly with body { month, year }.
 *
 * Usage:
 *   node scripts/runMonthlyAccrualForPayrollMonth.js <month 1-12> <year>
 *   node scripts/runMonthlyAccrualForPayrollMonth.js 4 2026
 *   node scripts/runMonthlyAccrualForPayrollMonth.js 4 2026 Civil
 *   node scripts/runMonthlyAccrualForPayrollMonth.js 4 2026 --dept=CIVIL
 *
 * Optional department filters active employees by department (name substring or code).
 * When a department is set, end-of-cycle pool carry is skipped (it is global); run pool carry separately if needed.
 *
 * Flags:
 *   --dept=<nameOrCode>   department (alternative to 3rd positional argument)
 *   --pool-carry          also run monthly pool carry (default: off when --dept is used; on when no dept)
 */
const mongoose = require('mongoose');
require('dotenv').config();

require('../departments/model/Department');

const accrualEngine = require('../leaves/services/accrualEngine');
const monthlyPoolCarryForwardService = require('../leaves/services/monthlyPoolCarryForwardService');
const { resolveDepartmentFromCli } = require('./lib/resolveDepartmentFromCli');

function parseArgs(argv) {
  const positional = [];
  let deptToken = null;
  let poolCarryExplicit = null;
  for (const a of argv) {
    if (a.startsWith('--dept=')) deptToken = a.slice('--dept='.length).trim();
    else if (a === '--pool-carry') poolCarryExplicit = true;
    else if (a === '--no-pool-carry') poolCarryExplicit = false;
    else if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  const month = Number(positional[0]);
  const year = Number(positional[1]);
  if (positional[2] && !deptToken) deptToken = positional[2];
  return { month, year, deptToken, poolCarryExplicit };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const { month, year, deptToken, poolCarryExplicit } = opts;
  if (!month || month < 1 || month > 12 || !year) {
    console.error(
      'Usage: node scripts/runMonthlyAccrualForPayrollMonth.js <month 1-12> <year> [departmentNameOrCode] [--dept=name] [--pool-carry|--no-pool-carry]'
    );
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  let departmentId = null;
  if (deptToken) {
    const d = await resolveDepartmentFromCli(deptToken);
    departmentId = d._id;
    console.log(`[Accrual] Department scope: ${d.name}${d.code ? ` (${d.code})` : ''}`);
  }

  const runPoolCarry =
    poolCarryExplicit === true ? true : poolCarryExplicit === false ? false : !departmentId;

  console.log(
    `[Accrual] Connected. Running postMonthlyAccruals for payroll month ${month}/${year}${
      departmentId ? ' (single department)' : ''
    }...`
  );

  const results = await accrualEngine.postMonthlyAccruals(month, year, {
    departmentId: departmentId || undefined,
  });
  console.log(
    `[Accrual] Done: processed=${results.processed}, elCredits=${results.elCredits}, expiredCCLs=${results.expiredCCLs}, errors=${(results.errors || []).length}`
  );
  if (results.errors && results.errors.length) {
    console.warn('[Accrual] First errors:', results.errors.slice(0, 8));
  }

  if (!runPoolCarry) {
    console.log('[PoolCarry] Skipped (department-scoped run, or --no-pool-carry). Run without --dept or pass --pool-carry to include.');
  } else {
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
