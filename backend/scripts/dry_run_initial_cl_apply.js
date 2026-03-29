/**
 * Dry-run the same initial CL apply path as POST /leaves/initial-cl-sync/apply:
 * org-gated monthly pool carry + policy grid + approved usage debits — NO LeaveRegisterYear write.
 *
 * Usage (from backend/):
 *   node scripts/dry_run_initial_cl_apply.js
 *   $env:EMP_NO="1234"; node scripts/dry_run_initial_cl_apply.js
 *
 * Requires MongoDB (MONGODB_URI or MONGO_URI in .env).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

require('../departments/model/Department');
require('../departments/model/Division');
require('../employees/model/Employee');
require('../leaves/model/Leave');
require('../settings/model/LeavePolicySettings');

const { createISTDate, getTodayISTDateString } = require('../shared/utils/dateUtils');
const LeavePolicySettings = require('../settings/model/LeavePolicySettings');
const Employee = require('../employees/model/Employee');
const Leave = require('../leaves/model/Leave');
const dateCycleService = require('../leaves/services/dateCycleService');
const leaveRegisterYearService = require('../leaves/services/leaveRegisterYearService');
const { CAP_COUNT_STATUSES } = require('../leaves/services/monthlyApplicationCapService');
const {
  getOrgFirstLeavePeriodIndexForFY,
  syncEmployeeCLFromPolicy,
} = require('../leaves/services/annualCLResetService');

async function orgLeavePresenceTable(effectiveDate) {
  const fy = await dateCycleService.getFinancialYearForDate(effectiveDate);
  const cycles = await leaveRegisterYearService.getTwelvePayrollCyclesForFY(fy.startDate, fy.endDate);
  const rows = [];
  for (let i = 0; i < cycles.length; i++) {
    const c = cycles[i];
    if (!c?.startDate || !c?.endDate) {
      rows.push({ i, label: '—', hasOrgLeave: false });
      continue;
    }
    const start = new Date(c.startDate);
    const end = new Date(c.endDate);
    const exists = await Leave.exists({
      isActive: { $ne: false },
      status: { $in: CAP_COUNT_STATUSES },
      fromDate: { $lte: end },
      toDate: { $gte: start },
    });
    const label = `${c.month}/${c.year}`;
    rows.push({ i, label, hasOrgLeave: !!exists });
  }
  return { fyName: fy.name, rows };
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  console.log('Connecting:', uri.replace(/:[^:@]+@/, ':****@'));
  await mongoose.connect(uri);
  console.log('Connected.\n');

  const effectiveDate = createISTDate(getTodayISTDateString());
  const settings = await LeavePolicySettings.getSettings();

  const orgFirstIdx = await getOrgFirstLeavePeriodIndexForFY(effectiveDate);
  const table = await orgLeavePresenceTable(effectiveDate);

  console.log('=== FINANCIAL YEAR (for effective date) ===');
  console.log('FY:', table.fyName);
  console.log('Effective (IST date):', getTodayISTDateString());
  console.log('\n=== ORG-LEVEL LEAVE PRESENCE (any employee, CAP_COUNT_STATUSES) ===');
  for (const r of table.rows) {
    console.log(`  slot ${r.i}  ${String(r.label).padEnd(12)}  ${r.hasOrgLeave ? 'HAS leave' : 'no leave'}`);
  }
  console.log('\norgFirstLeavePeriodIndex (first slot with org leave):', orgFirstIdx);
  console.log(
    'Interpretation:',
    orgFirstIdx < 0
      ? 'No org leave in any FY slot → org-gated pool carry will NOT run (carryTransfersCreated stays 0).'
      : `Pool carry may run FROM slot index ${orgFirstIdx} onward (only closed periods, not current).`
  );

  let emp = null;
  if (process.env.EMP_NO) {
    emp = await Employee.findOne({ is_active: true, emp_no: String(process.env.EMP_NO).trim() })
      .select('_id emp_no employee_name department_id division_id doj is_active compensatoryOffs')
      .populate('department_id', 'name')
      .populate('division_id', 'name');
  }
  if (!emp) {
    emp = await Employee.findOne({ is_active: true })
      .select('_id emp_no employee_name department_id division_id doj is_active compensatoryOffs')
      .populate('department_id', 'name')
      .populate('division_id', 'name');
  }
  if (!emp) {
    console.error('\nNo active employee found.');
    process.exit(1);
  }

  console.log('\n=== DRY RUN syncEmployeeCLFromPolicy (no persist) ===');
  console.log('Employee:', emp.emp_no, emp.employee_name);

  const clSyncOptions = {
    creditAllPayrollMonths: true,
    includeApprovedClUsageDebits: true,
    carryUnusedClToNextMonth: false,
    disableInitialLedgerCarryForward: true,
    orgGatedMonthlyPoolCarryForward: true,
    orgFirstLeavePeriodIndex: orgFirstIdx,
    dryRunSkipPersist: true,
  };

  const res = await syncEmployeeCLFromPolicy(emp, settings, effectiveDate, clSyncOptions);

  if (!res.success) {
    console.error('Sync failed:', res.error);
    process.exit(1);
  }

  console.log('\n--- Summary ---');
  console.log('carryTransfersCreated (edges i→i+1 with any CL/CCL/EL unused moved):', res.carryTransfersCreated);
  console.log('approvedUsageDebitCount:', res.approvedUsageDebitCount);
  console.log('cclCreditsFromOD:', res.cclCreditsFromOD);
  console.log('lockedSlotsUpdated:', res.lockedSlotsUpdated);
  console.log('newBalance (pool):', res.newBalance);
  console.log('syncPeriodLabel:', res.syncPeriodLabel);

  console.log('\n--- Pool transfer OUT lines (should only start at slot >= org first; sources ended before as-of) ---');
  if (!res.poolTransferOuts || res.poolTransferOuts.length === 0) {
    console.log('  (none)');
  } else {
    for (const p of res.poolTransferOuts) {
      console.log(
        `  slot ${p.slotIndex} ${p.fromLabel}  ${p.leaveType}  ${p.days} d  ${p.autoGeneratedType}`
      );
    }
  }

  console.log('\n--- Month slot summary (endedOnOrBeforeAsOf = can be SOURCE of carry out) ---');
  for (const m of res.monthSlotSummary || []) {
    const endFlag = m.endedOnOrBeforeAsOf === null ? '?' : m.endedOnOrBeforeAsOf ? 'closed' : 'OPEN(current/future)';
    console.log(
      `  [${m.i}] ${String(m.label).padEnd(14)} cl=${m.clCredits} ccl=${m.compensatoryOffs} el=${m.elCredits} lk=${m.lockedCredits}  ${endFlag}`
    );
  }

  console.log('\n=== INTENDED BEHAVIOUR CHECK ===');
  const outs = res.poolTransferOuts || [];
  const badSource = outs.filter((p) => p.slotIndex < orgFirstIdx && orgFirstIdx >= 0);
  if (badSource.length) {
    console.log('FAIL: transfer OUT from slot before org first leave index:', badSource);
  } else if (orgFirstIdx >= 0 && outs.length === 0 && res.carryTransfersCreated === 0) {
    console.log(
      'OK: org gate allows carry from index',
      orgFirstIdx,
      'but no transfers — normal if no closed-period unused pool or policy disables CL/CCL/EL roll.'
    );
  } else if (orgFirstIdx < 0 && outs.length === 0) {
    console.log('OK: no org leave in FY → no pool carry (as designed).');
  } else {
    console.log('OK: transfers (if any) respect minSourcePeriodIndex >=', orgFirstIdx >= 0 ? orgFirstIdx : 'n/a');
  }

  await mongoose.disconnect();
  console.log('\nDone (no database writes).');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
