/**
 * 1) Set DOJ to 2025-12-30 (IST) for employees with no date of joining.
 * 2) For the financial year that contains calendar year 2026 (anchor date), ensure LeaveRegisterYear
 *    exists for each affected *active* employee — if missing, run the same policy sync as initial CL apply.
 *
 * Usage (from backend/):
 *   node scripts/backfill_missing_doj_and_leave_register_2026.js --dry-run
 *   node scripts/backfill_missing_doj_and_leave_register_2026.js --apply
 *
 * Optional:
 *   --anchor=2026-06-15   IST calendar day used to resolve FY + sync effectiveDate (default 2026-06-15)
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

function parseArgs(argv) {
  let dryRun = true;
  let anchorYmd = '2026-06-15';
  for (const a of argv) {
    if (a === '--apply') dryRun = false;
    if (a === '--dry-run') dryRun = true;
    if (a.startsWith('--anchor=')) anchorYmd = a.slice('--anchor='.length).trim() || anchorYmd;
  }
  return { dryRun, anchorYmd };
}

const missingDojQuery = {
  $or: [{ doj: null }, { doj: { $exists: false } }],
};

async function main() {
  const { dryRun, anchorYmd } = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  const dojPlaceholder = createISTDate(DEFAULT_DOJ_IST);
  const effectiveDate = createISTDate(anchorYmd);
  const fyWrap = await dateCycleService.getFinancialYearForDate(effectiveDate);
  const fyName = fyWrap?.name || '(unknown)';
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

  console.log(
    `[backfill-doj-lr] dryRun=${dryRun} defaultDOJ=${DEFAULT_DOJ_IST} anchor=${anchorYmd} FY=${fyName} orgFirstLeavePeriodIndex=${orgFirstLeavePeriodIndex}`
  );

  const candidates = await Employee.find(missingDojQuery)
    .select('_id emp_no employee_name is_active doj')
    .lean();

  console.log(`[backfill-doj-lr] Employees with missing DOJ: ${candidates.length}`);

  const summary = {
    dojWouldUpdate: candidates.length,
    dojUpdated: 0,
    registerSkippedInactive: 0,
    registerAlreadyExists: 0,
    registerWouldSync: 0,
    registerCreated: 0,
    registerErrors: [],
    skippedNoEmpNo: 0,
  };

  if (!dryRun && candidates.length > 0) {
    const upd = await Employee.updateMany(missingDojQuery, { $set: { doj: dojPlaceholder } });
    summary.dojUpdated = upd.modifiedCount ?? 0;
    console.log(`[backfill-doj-lr] DOJ updateMany matched=${upd.matchedCount} modified=${upd.modifiedCount}`);
  }

  const ids = candidates.map((c) => c._id);

  for (const id of ids) {
    const lean = candidates.find((c) => String(c._id) === String(id));
    if (!lean?.emp_no || String(lean.emp_no).trim() === '') {
      summary.skippedNoEmpNo += 1;
      console.warn(`[backfill-doj-lr] skip register: missing emp_no employeeId=${id}`);
      continue;
    }
    if (!lean.is_active) {
      summary.registerSkippedInactive += 1;
      continue;
    }

    const existing = await LeaveRegisterYear.findOne({
      employeeId: id,
      financialYear: fyName,
    })
      .select('_id')
      .lean();
    if (existing) {
      summary.registerAlreadyExists += 1;
      continue;
    }

    if (dryRun) {
      console.log(
        `[backfill-doj-lr] DRY would sync register emp=${lean.emp_no} ${lean.employee_name || ''} FY=${fyName}`
      );
      summary.registerWouldSync += 1;
      continue;
    }

    try {
      const employee = await Employee.findById(id)
        .populate('department_id', 'name')
        .populate('division_id', 'name');
      if (!employee) continue;

      const syncResult = await syncEmployeeCLFromPolicy(employee, settings, effectiveDate, clSyncOptions);
      if (!syncResult.success) {
        summary.registerErrors.push({ employeeId: String(id), empNo: lean.emp_no, error: syncResult.error });
        console.error(`[backfill-doj-lr] sync failed emp=${lean.emp_no}: ${syncResult.error}`);
      } else {
        summary.registerCreated += 1;
        console.log(`[backfill-doj-lr] register OK emp=${lean.emp_no} FY=${fyName} newBalance=${syncResult.newBalance}`);
      }
    } catch (e) {
      summary.registerErrors.push({ employeeId: String(id), empNo: lean.emp_no, error: e.message });
      console.error(`[backfill-doj-lr] sync threw emp=${lean.emp_no}:`, e.message);
    }
  }

  console.log('[backfill-doj-lr] Summary:', JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('[backfill-doj-lr] Failed:', e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
