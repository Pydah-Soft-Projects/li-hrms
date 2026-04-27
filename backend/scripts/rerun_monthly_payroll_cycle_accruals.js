/**
 * Manually re-run the same end-of-cycle jobs as monthlyAccrualCron for given payroll cycle(s).
 *
 * For each (payrollCycleMonth, payrollCycleYear):
 *   1) accrualEngine.postMonthlyAccruals(month, year)
 *      — EL auto-credit (idempotent if already posted), CCL expiry for that cycle
 *   2) monthlyPoolCarryForwardService.processPayrollCycleCarryForward(month, year)
 *      — unused monthly apply pool CL/CCL/EL → next slot (skips employees where
 *        that closing slot already has poolCarryForwardOutAt set)
 *
 * Usage:
 *   node scripts/rerun_monthly_payroll_cycle_accruals.js --month 5 --year 2026
 *   node scripts/rerun_monthly_payroll_cycle_accruals.js --month 5 --year 2026 --from-previous
 *     (runs April 2026 then May 2026 — use when you want May refreshed after re-running April close)
 *
 * Options:
 *   --month <1-12>     Payroll cycle month label (required unless CLOSING_MONTH env set)
 *   --year <yyyy>     Payroll cycle year (required unless YEAR env set)
 *   --from-previous   Also run month-1 for the same pipeline first (Dec → previous calendar year)
 *   --accrual-only    Only postMonthlyAccruals
 *   --carry-only      Only processPayrollCycleCarryForward
 *
 * Requires MONGODB_URI in .env. Pool carry skips employees whose closing slot already has
 * `poolCarryForwardOutAt` (no duplicate transfers). Re-running the same month before that
 * guard is set can post duplicate MONTHLY_POOL_TRANSFER_* rows — avoid unless you know
 * the prior run failed part-way.
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Pool carry calls leaveRegisterService.addTransaction → Employee payload needs populated refs.
require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');

const accrualEngine = require('../leaves/services/accrualEngine');
const monthlyPoolCarryForwardService = require('../leaves/services/monthlyPoolCarryForwardService');

function parseFlag(name) {
  return process.argv.includes(`--${name}`);
}

function parseArg(name) {
  const key = name.replace(/^--/, '');
  const idx = process.argv.findIndex((a) => a === `--${key}`);
  if (idx >= 0 && process.argv[idx + 1] != null && !String(process.argv[idx + 1]).startsWith('--')) {
    return process.argv[idx + 1];
  }
  return undefined;
}

function prevCycle(m, y) {
  const month = Number(m);
  const year = Number(y);
  if (!Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month <= 1) return { month: 12, year: year - 1 };
  return { month: month - 1, year };
}

async function runOneCycle(month, year, { accrual, carry }) {
  const pm = Number(month);
  const py = Number(year);
  const label = `${pm}/${py}`;
  const out = { label, accrual: null, carry: null };

  if (accrual) {
    out.accrual = await accrualEngine.postMonthlyAccruals(pm, py);
  }
  if (carry) {
    out.carry = await monthlyPoolCarryForwardService.processPayrollCycleCarryForward(pm, py);
  }
  return out;
}

async function main() {
  const monthRaw = parseArg('month') || process.env.CLOSING_MONTH || process.env.MONTH;
  const yearRaw = parseArg('year') || process.env.YEAR;
  const fromPrevious = parseFlag('from-previous');
  const accrualOnly = parseFlag('accrual-only');
  const carryOnly = parseFlag('carry-only');

  const accrual = !carryOnly;
  const carry = !accrualOnly;

  if (!monthRaw || !yearRaw) {
    console.error('Missing --month and --year (or CLOSING_MONTH / YEAR env). Example: --month 5 --year 2026');
    process.exit(1);
  }

  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!Number.isFinite(month) || month < 1 || month > 12 || !Number.isFinite(year) || year < 2000) {
    console.error('Invalid --month or --year');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[rerun_monthly_payroll_cycle_accruals] Connected:', uri.replace(/\/\/.*@/, '//***@'));

  const steps = [];
  if (fromPrevious) {
    const p = prevCycle(month, year);
    if (!p) throw new Error('prevCycle failed');
    steps.push(p);
  }
  steps.push({ month, year });

  const results = [];
  for (const s of steps) {
    console.log(`\n--- Running payroll cycle ${s.month}/${s.year} ---`);
    const r = await runOneCycle(s.month, s.year, { accrual, carry });
    results.push(r);
    console.log(JSON.stringify(r, null, 2));
  }

  console.log('\n[rerun_monthly_payroll_cycle_accruals] Done.');
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
