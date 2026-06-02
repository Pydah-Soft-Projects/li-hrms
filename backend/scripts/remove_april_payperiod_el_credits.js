/**
 * Remove auto EL accrual credits (CREDIT + EARNED_LEAVE) posted for one payroll month only.
 * Default target: April pay period (payroll month 4).
 *
 * Does NOT remove manual EL credits, PAYROLL_USE debits, or re-post accrual.
 * After removal, EL ledger balances are recalculated and Employee.paidLeaves is synced.
 *
 * Usage (from backend/):
 *   node scripts/remove_april_payperiod_el_credits.js --dry-run
 *   node scripts/remove_april_payperiod_el_credits.js --dry-run --year=2026
 *   node scripts/remove_april_payperiod_el_credits.js --apply --year=2026
 *   node scripts/remove_april_payperiod_el_credits.js --apply --year=2026 --dept=Civil
 *   node scripts/remove_april_payperiod_el_credits.js --apply --month=4 --year=2026
 */

const mongoose = require('mongoose');
require('dotenv').config();

require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');
const { resolveDepartmentFromCli } = require('./lib/resolveDepartmentFromCli');

const APRIL_PAYROLL_MONTH = 4;

function parseArgs(argv) {
  let dryRun = true;
  let month = APRIL_PAYROLL_MONTH;
  let year = new Date().getFullYear();
  let deptToken = null;
  let includeInactive = false;

  for (const a of argv) {
    if (a === '--apply') dryRun = false;
    else if (a === '--dry-run' || a === '--check') dryRun = true;
    else if (a === '--inactive') includeInactive = true;
    else if (a.startsWith('--year=')) year = Number(a.slice('--year='.length));
    else if (a.startsWith('--month=')) month = Number(a.slice('--month='.length));
    else if (a.startsWith('--dept=')) deptToken = a.slice('--dept='.length).trim();
    else if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}`);
    else if (!deptToken) deptToken = a;
  }

  return { dryRun, month, year, deptToken, includeInactive };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const { dryRun, month, year, deptToken, includeInactive } = opts;
  if (!month || month < 1 || month > 12 || !year) {
    console.error('Invalid --month or --year');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);
  console.log(
    `[Remove EL credits] Connected. Payroll month ${month}/${year}${dryRun ? ' (dry-run — no writes)' : ' (APPLY)'}`
  );

  let departmentId = null;
  if (deptToken) {
    const d = await resolveDepartmentFromCli(deptToken);
    departmentId = d._id;
    console.log(`[Remove EL credits] Department: ${d.name}${d.code ? ` (${d.code})` : ''}`);
  }

  const empQuery = includeInactive ? {} : { is_active: true };
  if (departmentId) empQuery.department_id = departmentId;

  const summary = {
    scanned: 0,
    noAprilElCredit: 0,
    wouldRemove: 0,
    removed: 0,
    totalDaysWouldRemove: 0,
    totalDaysRemoved: 0,
    employees: [],
    errors: [],
  };

  const cursor = Employee.find(empQuery).select('_id emp_no employee_name paidLeaves').cursor();
  for await (const emp of cursor) {
    summary.scanned += 1;
    try {
      const { total, count } = await leaveRegisterYearLedgerService.getEarnedLeaveAutoCreditTotalForPayrollCycle(
        emp._id,
        month,
        year
      );
      if (!total || count === 0) {
        summary.noAprilElCredit += 1;
        continue;
      }

      const paidLeavesBefore = Number(emp.paidLeaves) || 0;
      summary.wouldRemove += 1;
      summary.totalDaysWouldRemove += total;

      const row = {
        empNo: emp.emp_no,
        name: emp.employee_name || '',
        aprilElDays: total,
        autoCreditRows: count,
        paidLeavesBefore,
        paidLeavesAfter: dryRun ? paidLeavesBefore - total : null,
        action: dryRun ? 'would_remove' : 'removed',
      };

      if (dryRun) {
        console.log(
          `[Remove EL credits] WOULD REMOVE ${emp.emp_no} ${row.name}: ${total} day(s) (${count} row(s)); paidLeaves ${paidLeavesBefore} → ~${paidLeavesBefore - total}`
        );
        summary.employees.push(row);
        continue;
      }

      const result = await leaveRegisterYearLedgerService.removeEarnedLeaveAutoCreditsForPayrollCycle(
        emp._id,
        month,
        year
      );
      const refreshed = await Employee.findById(emp._id).select('paidLeaves').lean();
      row.paidLeavesAfter = Number(refreshed?.paidLeaves) || 0;
      row.removedRows = result.removedCount;
      row.removedDays = result.previousTotal;

      summary.removed += 1;
      summary.totalDaysRemoved += result.previousTotal;
      summary.employees.push(row);

      console.log(
        `[Remove EL credits] REMOVED ${emp.emp_no} ${row.name}: ${result.previousTotal} day(s) (${result.removedCount} row(s)); paidLeaves ${paidLeavesBefore} → ${row.paidLeavesAfter}`
      );
    } catch (err) {
      summary.errors.push({ empNo: emp.emp_no, error: err.message });
      console.error(`[Remove EL credits] ERROR ${emp.emp_no}: ${err.message}`);
    }
  }

  console.log('[Remove EL credits] Summary:', JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('[Remove EL credits] Failed:', e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
