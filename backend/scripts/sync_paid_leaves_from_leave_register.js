/**
 * Align Employee.paidLeaves (profile EL balance) with LeaveRegisterYear EL ledger.
 * Use after initial sync / EL reset when profile still shows stale values (e.g. 4) but register is 0.
 *
 * Usage (from backend/):
 *   node scripts/sync_paid_leaves_from_leave_register.js --check
 *   node scripts/sync_paid_leaves_from_leave_register.js --apply
 *   node scripts/sync_paid_leaves_from_leave_register.js --apply --dept="Power Plant"
 *   node scripts/sync_paid_leaves_from_leave_register.js --apply --recalc
 *
 * --recalc  run recalculateRegisterBalances(EL) before reading ledger (fixes closing balances on slots)
 */

const mongoose = require('mongoose');
require('dotenv').config();

require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');
const { resolveDepartmentFromCli } = require('./lib/resolveDepartmentFromCli');
const { getElBalanceForPayroll } = require('../payroll/services/elUsedInPayrollHelper');

function parseArgs(argv) {
  const positional = [];
  let dryRun = true;
  let deptToken = null;
  let includeInactive = false;
  let recalc = false;
  for (const a of argv) {
    if (a === '--apply') dryRun = false;
    else if (a === '--check' || a === '--dry-run') dryRun = true;
    else if (a === '--inactive') includeInactive = true;
    else if (a === '--recalc') recalc = true;
    else if (a.startsWith('--dept=')) deptToken = a.slice('--dept='.length).trim();
    else if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  if (positional[0] && !deptToken) deptToken = positional[0];
  return { dryRun, deptToken, includeInactive, recalc };
}

async function main() {
  const { dryRun, deptToken, includeInactive, recalc } = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  let deptLabel = 'all departments';
  const empQuery = includeInactive ? {} : { is_active: true };
  if (deptToken) {
    const d = await resolveDepartmentFromCli(deptToken);
    empQuery.department_id = d._id;
    deptLabel = `${d.name}${d.code ? ` (${d.code})` : ''}`;
  }

  console.log(`[sync-paidLeaves] mode=${dryRun ? 'CHECK' : 'APPLY'} dept=${deptLabel} recalc=${recalc}`);

  const employees = await Employee.find(empQuery)
    .select('_id emp_no employee_name paidLeaves department_id')
    .sort({ emp_no: 1 })
    .lean();

  const summary = {
    scanned: employees.length,
    noRegister: 0,
    alreadyAligned: 0,
    wouldUpdate: 0,
    updated: 0,
    errors: [],
  };

  const mismatches = [];

  for (const emp of employees) {
    try {
      const hasYearDoc = await LeaveRegisterYear.exists({ employeeId: emp._id });
      if (!hasYearDoc) {
        summary.noRegister += 1;
        continue;
      }

      if (recalc && !dryRun) {
        await leaveRegisterYearLedgerService.recalculateRegisterBalances(emp._id, 'EL', null);
      }

      const profileEl = Math.max(0, Number(emp.paidLeaves) || 0);
      const ledgerEl = await getElBalanceForPayroll(emp._id, emp);

      if (Math.abs(profileEl - ledgerEl) < 0.001) {
        summary.alreadyAligned += 1;
        continue;
      }

      summary.wouldUpdate += 1;
      mismatches.push({
        empNo: emp.emp_no,
        name: emp.employee_name,
        profileEl,
        ledgerEl,
      });

      if (!dryRun) {
        await Employee.updateOne({ _id: emp._id }, { $set: { paidLeaves: ledgerEl } });
        summary.updated += 1;
      }
    } catch (e) {
      summary.errors.push({ empNo: emp.emp_no, error: e.message });
    }
  }

  if (mismatches.length) {
    console.log(`\n--- Profile paidLeaves ≠ ledger EL (${mismatches.length}) ---\n`);
    const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
    console.log(`${pad('emp_no', 10)} ${pad('name', 28)} ${pad('profile', 8)} ${pad('ledger', 8)}`);
    console.log('-'.repeat(58));
    for (const r of mismatches.slice(0, 200)) {
      console.log(`${pad(r.empNo, 10)} ${pad(r.name, 28)} ${pad(r.profileEl, 8)} ${pad(r.ledgerEl, 8)}`);
    }
    if (mismatches.length > 200) {
      console.log(`... and ${mismatches.length - 200} more`);
    }
    console.log('');
  }

  console.log('[sync-paidLeaves] Summary:', JSON.stringify(summary, null, 2));
  if (dryRun && summary.wouldUpdate > 0) {
    console.log('\nTo apply: node scripts/sync_paid_leaves_from_leave_register.js --apply');
    if (deptToken) console.log(`  (add --dept=${deptToken} if needed)`);
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('[sync-paidLeaves] Failed:', e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
