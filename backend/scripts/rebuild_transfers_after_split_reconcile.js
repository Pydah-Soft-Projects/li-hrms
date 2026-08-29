/**
 * Rebuild monthly CL/CCL/EL pool transfers after split-register reconcile.
 * Run AFTER reconcile_split_register_debits.js --apply
 *
 * Usage:
 *   node scripts/rebuild_transfers_after_split_reconcile.js --fy 2026
 *   node scripts/rebuild_transfers_after_split_reconcile.js --fy 2026 --apply
 *   node scripts/rebuild_transfers_after_split_reconcile.js --empNo 7005 --apply
 */
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');

const Leave = require('../leaves/model/Leave');
const Employee = require('../employees/model/Employee');
const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');
const { reconcileEmployeeFromDate } = require('../leaves/services/monthlyTransferReconciliationService');

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function parseArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] != null && !String(process.argv[i + 1]).startsWith('--')) {
    return process.argv[i + 1];
  }
  return undefined;
}

function leaveOverlapsFy(leave, fyFilter) {
  if (!fyFilter) return true;
  const fromY = new Date(leave.fromDate).getFullYear();
  const toY = new Date(leave.toDate).getFullYear();
  return fromY === Number(fyFilter) || toY === Number(fyFilter);
}

async function main() {
  const apply = hasFlag('apply');
  const fyFilter = parseArg('fy') || '2026';
  const empNoFilter = parseArg('empNo') || null;

  await mongoose.connect(process.env.MONGODB_URI);

  let leaves = await Leave.find({
    splitStatus: 'split_approved',
    isActive: { $ne: false },
  })
    .select('_id emp_no employeeId fromDate toDate')
    .lean();

  if (fyFilter) leaves = leaves.filter((l) => leaveOverlapsFy(l, fyFilter));
  if (empNoFilter) leaves = leaves.filter((l) => String(l.emp_no) === String(empNoFilter));

  const byEmp = new Map();
  for (const l of leaves) {
    const k = String(l.emp_no);
    if (!byEmp.has(k)) {
      byEmp.set(k, { emp_no: k, employeeId: l.employeeId, earliestFrom: new Date(l.fromDate) });
    } else {
      const cur = byEmp.get(k);
      if (new Date(l.fromDate) < cur.earliestFrom) cur.earliestFrom = new Date(l.fromDate);
    }
  }

  const results = [];
  for (const row of [...byEmp.values()].sort((a, b) => String(a.emp_no).localeCompare(String(b.emp_no)))) {
    const emp = await Employee.findById(row.employeeId).select('_id emp_no employee_name casualLeaves compensatoryOffs paidLeaves').lean();
    if (!emp) {
      results.push({ emp_no: row.emp_no, status: 'employee_not_found' });
      continue;
    }

    const before = {
      casualLeaves: emp.casualLeaves,
      compensatoryOffs: emp.compensatoryOffs,
      paidLeaves: emp.paidLeaves,
    };

    if (!apply) {
      const preview = await reconcileEmployeeFromDate({
        employeeId: emp._id,
        fromDate: row.earliestFrom,
        apply: false,
      });
      results.push({
        emp_no: emp.emp_no,
        employee_name: emp.employee_name,
        fromDate: row.earliestFrom,
        action: 'dry_run',
        preview,
        balancesBefore: before,
      });
      continue;
    }

    const rebuilt = await reconcileEmployeeFromDate({
      employeeId: emp._id,
      fromDate: row.earliestFrom,
      apply: true,
    });

    for (const lt of ['CL', 'CCL', 'EL']) {
      try {
        await leaveRegisterYearLedgerService.recalculateRegisterBalances(emp._id, lt, row.earliestFrom);
      } catch (e) {
        console.warn(`[recalc ${emp.emp_no} ${lt}]`, e?.message || e);
      }
    }

    const afterEmp = await Employee.findById(emp._id).select('casualLeaves compensatoryOffs paidLeaves').lean();
    results.push({
      emp_no: emp.emp_no,
      employee_name: emp.employee_name,
      fromDate: row.earliestFrom,
      action: 'applied',
      rebuilt,
      balancesBefore: before,
      balancesAfter: {
        casualLeaves: afterEmp?.casualLeaves,
        compensatoryOffs: afterEmp?.compensatoryOffs,
        paidLeaves: afterEmp?.paidLeaves,
      },
    });
  }

  const summary = {
    mode: apply ? 'apply' : 'dry_run',
    financialYear: fyFilter,
    empNoFilter,
    employeeCount: results.length,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));
  const outPath = path.join(
    __dirname,
    apply ? '_rebuild_transfers_after_split_applied.json' : '_rebuild_transfers_after_split_dry_run.json'
  );
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.error(`Written: ${outPath}`);

  if (!apply) {
    console.error('\nDry run only. Re-run with --apply to rebuild transfers on this database.');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
