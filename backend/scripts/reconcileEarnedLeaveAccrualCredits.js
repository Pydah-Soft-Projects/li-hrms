/**
 * Compare auto EL accrual (EARNED_LEAVE credits) for a payroll month to what
 * earnedLeaveService.calculateEarnedLeave says under current policy; fix mismatches.
 *
 * Skips employees who already have a PAYROLL_USE EL debit for that month unless --force.
 *
 * Usage:
 *   node scripts/reconcileEarnedLeaveAccrualCredits.js <month 1-12> <year> [departmentNameOrCode]
 *   node scripts/reconcileEarnedLeaveAccrualCredits.js 4 2026 --dept=Civil
 *   node scripts/reconcileEarnedLeaveAccrualCredits.js 4 2026 --dry-run
 *   node scripts/reconcileEarnedLeaveAccrualCredits.js 4 2026 civil --force
 */

const mongoose = require('mongoose');
require('dotenv').config();

require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const earnedLeaveService = require('../leaves/services/earnedLeaveService');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');
const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');
const dateCycleService = require('../leaves/services/dateCycleService');
const { resolveDepartmentFromCli } = require('./lib/resolveDepartmentFromCli');

function roundHalf(x) {
  const n = Number(x) || 0;
  if (n <= 0) return 0;
  return Math.round(n * 2) / 2;
}

function parseArgs(argv) {
  const positional = [];
  let deptToken = null;
  let dryRun = false;
  let force = false;
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true;
    else if (a === '--force') force = true;
    else if (a.startsWith('--dept=')) deptToken = a.slice('--dept='.length).trim();
    else if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  const month = Number(positional[0]);
  const year = Number(positional[1]);
  if (positional[2] && !deptToken) deptToken = positional[2];
  return { month, year, deptToken, dryRun, force };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const { month, year, deptToken, dryRun, force } = opts;
  if (!month || month < 1 || month > 12 || !year) {
    console.error(
      'Usage: node scripts/reconcileEarnedLeaveAccrualCredits.js <month> <year> [deptNameOrCode] [--dept=name] [--dry-run] [--force]'
    );
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);
  console.log(`[EL reconcile] Connected. Payroll month ${month}/${year}${dryRun ? ' (dry-run)' : ''}`);

  let departmentId = null;
  if (deptToken) {
    const d = await resolveDepartmentFromCli(deptToken);
    departmentId = d._id;
    console.log(`[EL reconcile] Department filter: ${d.name}${d.code ? ` (${d.code})` : ''}`);
  }

  const cycleTargetDate = new Date(year, month - 1, 15);
  const cycleInfo = await dateCycleService.getPayrollCycleForDate(cycleTargetDate);
  const cycleStart = cycleInfo.startDate;
  const cycleEnd = cycleInfo.endDate;
  const monthYYYYMM = `${year}-${String(month).padStart(2, '0')}`;

  const empQuery = { is_active: true };
  if (departmentId) empQuery.department_id = departmentId;

  const summary = {
    scanned: 0,
    ok: 0,
    wouldFix: 0,
    fixed: 0,
    skippedPayrollLocked: 0,
    errors: [],
  };

  const cursor = Employee.find(empQuery).cursor();
  for await (const emp of cursor) {
    summary.scanned += 1;
    try {
      if (!force) {
        const payrollDebit = await leaveRegisterYearLedgerService.findExistingPayrollElDebitForPayrollMonth(
          emp._id,
          monthYYYYMM
        );
        if (payrollDebit) {
          summary.skippedPayrollLocked += 1;
          continue;
        }
      }

      const calc = await earnedLeaveService.calculateEarnedLeave(emp._id, month, year, cycleStart, cycleEnd);
      const expected =
        calc.eligible && Number(calc.elEarned) > 0 ? roundHalf(Number(calc.elEarned)) : 0;

      const { total: actual, count: autoCreditCount } =
        await leaveRegisterYearLedgerService.getEarnedLeaveAutoCreditTotalForPayrollCycle(emp._id, month, year);

      const shapeOk =
        expected === actual &&
        (expected === 0 ? autoCreditCount === 0 : autoCreditCount === 1);

      if (shapeOk) {
        summary.ok += 1;
        continue;
      }

      summary.wouldFix += 1;
      if (expected === actual && autoCreditCount > 1) {
        console.log(
          `[EL reconcile] ${emp.emp_no}: duplicate auto EL credits (total ${actual} OK) — collapsing to one row`
        );
      } else {
        console.log(
          `[EL reconcile] ${emp.emp_no} ${emp.employee_name || ''}: expected=${expected} actual=${actual} (auto rows=${autoCreditCount})`
        );
      }

      if (dryRun) continue;

      await leaveRegisterYearLedgerService.removeEarnedLeaveAutoCreditsForPayrollCycle(emp._id, month, year);
      if (expected > 0) {
        await leaveRegisterService.addEarnedLeaveCredit(
          emp._id,
          expected,
          month,
          year,
          calc.calculationBreakdown,
          cycleEnd
        );
      }
      summary.fixed += 1;
    } catch (err) {
      summary.errors.push({ empNo: emp.emp_no, error: err.message });
    }
  }

  console.log('[EL reconcile] Summary:', JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('[EL reconcile] Failed:', e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
