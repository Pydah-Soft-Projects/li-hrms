/**
 * Reconcile leave register DEBIT rows with approved LeaveSplit rows.
 * Default: dry run. Pass --apply to persist.
 *
 * Usage:
 *   node scripts/reconcile_split_register_debits.js
 *   node scripts/reconcile_split_register_debits.js --apply
 *   node scripts/reconcile_split_register_debits.js --empNo 7005
 *   node scripts/reconcile_split_register_debits.js --fy 2026 --apply
 *   node scripts/reconcile_split_register_debits.js --limit 5 --apply
 */
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');

const Employee = require('../employees/model/Employee');
const {
  findMismatchedSplitLeaves,
  syncLeaveRegisterFromSplits,
} = require('../leaves/services/leaveRegisterSplitSyncService');

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

function parseLimit() {
  const v = parseArg('limit');
  if (v == null) return 0;
  return Math.max(0, parseInt(v, 10) || 0);
}

async function main() {
  const apply = hasFlag('apply');
  const dryRun = !apply;
  const fyFilter = parseArg('fy') || null;
  const empNo = parseArg('empNo') || null;
  const limit = parseLimit();

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing');

  await mongoose.connect(uri);

  let plans = await findMismatchedSplitLeaves({ fyFilter, empNo });
  if (limit > 0) plans = plans.slice(0, limit);

  const empIds = [...new Set(plans.map((p) => String(p.employeeId)))];
  const emps = await Employee.find({ _id: { $in: empIds } })
    .select('_id emp_no employee_name is_active')
    .lean();
  const empMap = new Map(emps.map((e) => [String(e._id), e]));

  const results = [];
  for (const plan of plans) {
    const emp = empMap.get(String(plan.employeeId));
    const entry = {
      emp_no: plan.emp_no,
      employee_name: emp?.employee_name || null,
      is_active: emp?.is_active,
      leaveId: plan.leaveId,
      fromDate: plan.fromDate,
      toDate: plan.toDate,
      before: {
        registerDebits: plan.registerDebits,
        approvedByType: plan.approvedByType,
        typeDiffs: plan.typeDiffs,
      },
      plannedDebits: plan.plannedDebits,
    };

    if (dryRun) {
      entry.action = 'dry_run';
      entry.wouldRemoveRegisterDebits = plan.registerDebits;
      entry.wouldPostDebits = plan.plannedDebits;
    } else {
      try {
        const syncResult = await syncLeaveRegisterFromSplits(
          { _id: plan.leaveId },
          { dryRun: false }
        );
        entry.action = 'applied';
        entry.syncResult = {
          posted: syncResult.posted,
          reverseMode: syncResult.reverseResult?.mode,
          removedCount: syncResult.reverseResult?.removedCount,
        };
      } catch (err) {
        entry.action = 'error';
        entry.error = err.message || String(err);
      }
    }

    results.push(entry);
  }

  const byEmployee = new Map();
  for (const r of results) {
    const k = String(r.emp_no);
    if (!byEmployee.has(k)) {
      byEmployee.set(k, {
        emp_no: r.emp_no,
        employee_name: r.employee_name,
        is_active: r.is_active,
        leaves: [],
      });
    }
    byEmployee.get(k).leaves.push(r);
  }

  const summary = {
    mode: dryRun ? 'dry_run' : 'apply',
    scannedAt: new Date().toISOString(),
    fyFilter,
    empNoFilter: empNo,
    mismatchedLeavesFound: plans.length,
    affectedEmployees: byEmployee.size,
    employees: [...byEmployee.values()],
    results,
  };

  console.log(JSON.stringify(summary, null, 2));

  const suffix = dryRun ? 'dry_run' : 'applied';
  const jsonPath = path.join(__dirname, `_reconcile_split_register_debits_${suffix}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  console.error(`Written: ${jsonPath}`);

  if (dryRun) {
    console.error('\nDry run only — no changes made. Re-run with --apply to persist fixes.');
  } else if (plans.length > 0) {
    console.error('\nRebuilding monthly pool transfers for affected employees...');
    const { execSync } = require('child_process');
    const rebuildArgs = ['scripts/rebuild_transfers_after_split_reconcile.js', '--apply'];
    if (fyFilter) rebuildArgs.push('--fy', fyFilter);
    if (empNo) rebuildArgs.push('--empNo', empNo);
    execSync(`node ${rebuildArgs.map((a) => JSON.stringify(a)).join(' ')}`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    });
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
