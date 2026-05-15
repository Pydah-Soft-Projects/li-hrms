/**
 * Leave register backfill for the FY that contains calendar year 2026 (from anchor date / settings).
 *
 * Step 1 — CHECK (default): list active employees with NO LeaveRegisterYear for that FY.
 * Step 2 — APPLY: after you review the list, create registers (same logic as initial CL sync apply).
 *
 * Optional DOJ fix (only employees with null/missing doj → 2025-12-30 IST):
 *   --fix-doj          with --check (report only) or --apply (update then sync)
 *
 * Usage (from backend/):
 *   node scripts/backfill_missing_doj_and_leave_register_2026.js --check
 *   node scripts/backfill_missing_doj_and_leave_register_2026.js --apply
 *   node scripts/backfill_missing_doj_and_leave_register_2026.js --apply --fix-doj
 *
 * Optional:
 *   --anchor=2026-06-15   resolve FY + sync effectiveDate (default 2026-06-15)
 *   --fy=2026             force financialYear name (default: from anchor + policy)
 *   --inactive            include inactive employees in check/apply
 */

const mongoose = require('mongoose');
require('dotenv').config();

require('../departments/model/Department');
require('../departments/model/Division');
const Employee = require('../employees/model/Employee');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const LeavePolicySettings = require('../settings/model/LeavePolicySettings');
const dateCycleService = require('../leaves/services/dateCycleService');
const {
  syncEmployeeCLFromPolicy,
  getOrgFirstLeavePeriodIndexForFY,
} = require('../leaves/services/annualCLResetService');
const { createISTDate } = require('../shared/utils/dateUtils');

const DEFAULT_DOJ_IST = '2025-12-30';

const missingDojQuery = {
  $or: [{ doj: null }, { doj: { $exists: false } }],
};

function parseArgs(argv) {
  let mode = 'check';
  let anchorYmd = '2026-06-15';
  let fyOverride = null;
  let fixDoj = false;
  let includeInactive = false;
  for (const a of argv) {
    if (a === '--check' || a === '--dry-run') mode = 'check';
    if (a === '--apply') mode = 'apply';
    if (a === '--fix-doj') fixDoj = true;
    if (a === '--inactive') includeInactive = true;
    if (a.startsWith('--anchor=')) anchorYmd = a.slice('--anchor='.length).trim() || anchorYmd;
    if (a.startsWith('--fy=')) fyOverride = a.slice('--fy='.length).trim() || null;
  }
  return { mode, anchorYmd, fyOverride, fixDoj, includeInactive };
}

async function findEmployeesMissingRegister(fyName, includeInactive) {
  const empQuery = includeInactive ? {} : { is_active: true };
  const employees = await Employee.find(empQuery)
    .select('_id emp_no employee_name is_active doj department_id division_id')
    .populate('department_id', 'name')
    .populate('division_id', 'name')
    .sort({ emp_no: 1 })
    .lean();

  const withRegister = await LeaveRegisterYear.distinct('employeeId', { financialYear: fyName });
  const hasRegister = new Set(withRegister.map((id) => String(id)));

  const missing = [];
  const noEmpNo = [];
  for (const emp of employees) {
    if (!emp.emp_no || String(emp.emp_no).trim() === '') {
      noEmpNo.push(emp);
      continue;
    }
    if (!hasRegister.has(String(emp._id))) {
      missing.push(emp);
    }
  }
  return { employees, missing, noEmpNo, withRegisterCount: withRegister.length };
}

function printMissingList(missing, fyName) {
  console.log(`\n--- Missing LeaveRegisterYear for FY "${fyName}" (${missing.length}) ---\n`);
  if (missing.length === 0) {
    console.log('(none — every in-scope employee already has a register for this FY)\n');
    return;
  }
  const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
  console.log(`${pad('emp_no', 12)} ${pad('name', 28)} ${pad('active', 6)} ${pad('doj', 12)} dept`);
  console.log('-'.repeat(80));
  for (const e of missing) {
    const dojStr = e.doj ? new Date(e.doj).toISOString().slice(0, 10) : '(none)';
    console.log(
      `${pad(e.emp_no, 12)} ${pad(e.employee_name, 28)} ${pad(e.is_active ? 'yes' : 'no', 6)} ${pad(dojStr, 12)} ${e.department_id?.name || ''}`
    );
  }
  console.log('');
}

async function main() {
  const { mode, anchorYmd, fyOverride, fixDoj, includeInactive } = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  const effectiveDate = createISTDate(anchorYmd);
  const fyWrap = await dateCycleService.getFinancialYearForDate(effectiveDate);
  const fyName = fyOverride || fyWrap?.name || '(unknown)';
  const settings = await LeavePolicySettings.getSettings();
  const orgFirstLeavePeriodIndex = await getOrgFirstLeavePeriodIndexForFY(effectiveDate);

  const clSyncOptions = {
    creditAllPayrollMonths: true,
    includeApprovedClUsageDebits: true,
    carryUnusedClToNextMonth: false,
    disableInitialLedgerCarryForward: true,
    orgGatedMonthlyPoolCarryForward: true,
    orgFirstLeavePeriodIndex,
  };

  const scopeLabel = includeInactive ? 'all employees' : 'active employees only';
  console.log(`[leave-register] mode=${mode} FY="${fyName}" anchor=${anchorYmd} scope=${scopeLabel}`);
  if (fyWrap?.startDate && fyWrap?.endDate) {
    console.log(
      `[leave-register] FY window: ${new Date(fyWrap.startDate).toISOString().slice(0, 10)} → ${new Date(fyWrap.endDate).toISOString().slice(0, 10)}`
    );
  }

  const { employees, missing, noEmpNo, withRegisterCount } = await findEmployeesMissingRegister(
    fyName,
    includeInactive
  );

  console.log(`[leave-register] Employees in scope: ${employees.length}`);
  console.log(`[leave-register] Already have register for FY "${fyName}": ${withRegisterCount}`);
  console.log(`[leave-register] Missing register: ${missing.length}`);
  if (noEmpNo.length) {
    console.log(`[leave-register] Skipped (no emp_no): ${noEmpNo.length}`);
  }

  printMissingList(missing, fyName);

  const summary = {
    mode,
    financialYear: fyName,
    employeesInScope: employees.length,
    alreadyHaveRegister: withRegisterCount,
    missingRegister: missing.length,
    skippedNoEmpNo: noEmpNo.length,
    dojFixed: 0,
    registersCreated: 0,
    registerErrors: [],
  };

  if (mode === 'check') {
    if (missing.length > 0) {
      console.log('Next step: review the list above, then run:');
      console.log('  node scripts/backfill_missing_doj_and_leave_register_2026.js --apply');
      if (fixDoj) {
        console.log('  (with --fix-doj to set missing DOJ to 2025-12-30 before creating registers)');
      }
    }
    console.log('[leave-register] Summary:', JSON.stringify(summary, null, 2));
    await mongoose.disconnect();
    return;
  }

  // --- APPLY ---
  if (fixDoj) {
    const missingDojCount = await Employee.countDocuments(missingDojQuery);
    summary.missingDojBeforeFix = missingDojCount;
    if (missingDojCount > 0) {
      const upd = await Employee.updateMany(missingDojQuery, {
        $set: { doj: createISTDate(DEFAULT_DOJ_IST) },
      });
      summary.dojFixed = upd.modifiedCount ?? 0;
      console.log(`[leave-register] DOJ set to ${DEFAULT_DOJ_IST} for ${summary.dojFixed} employee(s)`);
    }
  }

  if (missing.length === 0) {
    console.log('[leave-register] Nothing to create.');
    console.log('[leave-register] Summary:', JSON.stringify(summary, null, 2));
    await mongoose.disconnect();
    return;
  }

  console.log(`[leave-register] Creating ${missing.length} leave register(s)…\n`);

  for (const lean of missing) {
    try {
      const employee = await Employee.findById(lean._id)
        .populate('department_id', 'name')
        .populate('division_id', 'name');
      if (!employee) {
        summary.registerErrors.push({ empNo: lean.emp_no, error: 'Employee not found' });
        continue;
      }

      const syncResult = await syncEmployeeCLFromPolicy(employee, settings, effectiveDate, clSyncOptions);
      if (!syncResult.success) {
        summary.registerErrors.push({ empNo: lean.emp_no, error: syncResult.error || 'sync failed' });
        console.error(`  FAIL ${lean.emp_no}: ${syncResult.error}`);
      } else {
        summary.registersCreated += 1;
        console.log(`  OK   ${lean.emp_no} ${lean.employee_name || ''} balance=${syncResult.newBalance}`);
      }
    } catch (e) {
      summary.registerErrors.push({ empNo: lean.emp_no, error: e.message });
      console.error(`  FAIL ${lean.emp_no}: ${e.message}`);
    }
  }

  console.log('\n[leave-register] Summary:', JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('[leave-register] Failed:', e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
