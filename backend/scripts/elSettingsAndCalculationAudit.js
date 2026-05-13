/**
 * Shows where EL-related settings live (global vs department merge), the resolved policy,
 * attendance credit-day basis, then compares:
 *   - previewElEarnedAfterPolicy  (same math as calculateEarnedLeave after resolution; no probation gate)
 *   - calculateEarnedLeave        (full service: probation, disabled, etc.)
 *
 * Usage (from backend/):
 *   node scripts/elSettingsAndCalculationAudit.js --emp=2144 --month=4 --year=2026
 *   node scripts/elSettingsAndCalculationAudit.js --department=Development --month=3 --year=2026 --limit=5
 */

const mongoose = require('mongoose');
require('dotenv').config();

require('../departments/model/Department');
require('../employees/model/Employee');

const LeavePolicySettings = require('../settings/model/LeavePolicySettings');
const DepartmentSettings = require('../departments/model/DepartmentSettings');
const Department = require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const dateCycleService = require('../leaves/services/dateCycleService');
const { resolveEffectiveEarnedLeave } = require('../leaves/services/earnedLeavePolicyResolver');
const earnedLeaveService = require('../leaves/services/earnedLeaveService');

function parseArgs() {
  const o = { emp: null, department: null, month: 4, year: 2026, limit: 5 };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--emp=')) o.emp = a.slice('--emp='.length).trim();
    else if (a.startsWith('--department=')) o.department = a.slice('--department='.length).trim();
    else if (a.startsWith('--month=')) o.month = Number(a.split('=')[1]) || o.month;
    else if (a.startsWith('--year=')) o.year = Number(a.split('=')[1]) || o.year;
    else if (a.startsWith('--limit=')) o.limit = Math.max(1, Math.min(50, Number(a.split('=')[1]) || o.limit));
  }
  return o;
}

function trimGlobalEarnedLeave(g) {
  if (!g) return null;
  return {
    enabled: g.enabled,
    earningType: g.earningType,
    useAsPaidInPayroll: g.useAsPaidInPayroll,
    attendanceRules: g.attendanceRules,
    fixedRules: g.fixedRules,
  };
}

function trimLeaves(leaves) {
  if (!leaves) return null;
  const { earnedLeave, elEarningType, leavesPerDay, paidLeavesCount, ...rest } = leaves;
  return {
    ...rest,
    leavesPerDay,
    paidLeavesCount,
    elEarningType,
    earnedLeave: earnedLeave
      ? {
          enabled: earnedLeave.enabled,
          earningType: earnedLeave.earningType,
          useAsPaidInPayroll: earnedLeave.useAsPaidInPayroll,
          attendanceRules: earnedLeave.attendanceRules,
          fixedRules: earnedLeave.fixedRules,
        }
      : undefined,
  };
}

async function findDepartment(q) {
  const esc = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Department.findOne({
    $or: [{ code: new RegExp(`^${esc}$`, 'i') }, { name: new RegExp(esc, 'i') }],
  })
    .select('_id name code')
    .lean();
}

async function resolveEmployees(opts) {
  if (opts.emp) {
    const token = opts.emp.trim();
    let e = null;
    if (mongoose.Types.ObjectId.isValid(token) && String(new mongoose.Types.ObjectId(token)) === token) {
      e = await Employee.findById(token).lean();
    }
    if (!e) {
      e = await Employee.findOne({ emp_no: new RegExp(`^${esc(token)}$`, 'i') }).lean();
    }
    if (!e) throw new Error(`No employee for --emp=${opts.emp} (try emp_no or _id)`);
    return [e];
  }
  if (!opts.department) {
    throw new Error('Provide --emp=... or --department=...');
  }
  const dept = await findDepartment(opts.department);
  if (!dept) throw new Error(`No department matching "${opts.department}"`);
  const list = await Employee.find({ is_active: true, department_id: dept._id })
    .select('_id emp_no employee_name department_id division_id doj')
    .sort({ emp_no: 1 })
    .limit(opts.limit)
    .lean();
  return { dept, employees: list };
}

function esc(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function auditOne(e, globalPolicy, month, year, cycleStart, cycleEnd) {
  const deptSettings = await DepartmentSettings.getByDeptAndDiv(e.department_id, e.division_id);
  const effectiveEL = resolveEffectiveEarnedLeave(globalPolicy.earnedLeave, deptSettings?.leaves);
  const earningType = effectiveEL.earningType;

  let attendanceData = null;
  let attErr = '';
  try {
    attendanceData = await earnedLeaveService.getAttendanceData(
      e._id,
      month,
      year,
      e,
      cycleStart,
      cycleEnd,
      effectiveEL.attendanceRules || {}
    );
  } catch (err) {
    attErr = err.message || String(err);
  }

  const preview = earnedLeaveService.previewElEarnedAfterPolicy(
    effectiveEL,
    earningType,
    attendanceData,
    deptSettings
  );

  const full = await earnedLeaveService.calculateEarnedLeave(e._id, month, year, cycleStart, cycleEnd);

  const previewDays = Number(preview.elEarned) || 0;
  const serviceDays = full.eligible ? Number(full.elEarned) || 0 : 0;
  const coreMatch =
    full.eligible && Math.round(previewDays * 100) === Math.round(serviceDays * 100);

  return {
    emp_no: e.emp_no,
    name: e.employee_name,
    settingsPlacement: {
      note:
        'A) LeavePolicySettings (Mongo) — global defaults. B) DepartmentSettings.getByDeptAndDiv — merged dept default + division-wide + dept+div (see model). C) resolveEffectiveEarnedLeave — department leaves.earnedLeave overrides global earnedLeave field-by-field.',
      globalEarnedLeave: trimGlobalEarnedLeave(globalPolicy.earnedLeave),
      mergedDepartmentLeavesSlice: trimLeaves(deptSettings?.leaves),
      mergedDocHadKeys: deptSettings ? Object.keys(deptSettings) : [],
    },
    resolvedEffectiveEL: effectiveEL,
    attendanceSummary: attendanceData
      ? {
          monthKey: `${year}-${String(month).padStart(2, '0')}`,
          totalDays: attendanceData.totalDays,
          payableShifts: attendanceData.payableShifts,
          weeklyOffs: attendanceData.weeklyOffs,
          holidays: attendanceData.holidays,
          presentDays: attendanceData.presentDays,
          effectiveDays: attendanceData.effectiveDays,
          elCreditBasisDescription: attendanceData.elCreditBasisDescription,
        }
      : { error: attErr },
    previewAfterPolicyNoGates: preview,
    fullServiceCalculateEarnedLeave: {
      eligible: full.eligible,
      elEarned: full.elEarned,
      earningType: full.earningType,
      reason: full.reason || null,
      calculationBreakdown: full.calculationBreakdown,
    },
    comparison: {
      previewElDays_policyAndAttendanceOnly: previewDays,
      serviceElDays_whenEligible: serviceDays,
      coreMathMatchesServiceWhenEligible: coreMatch,
      note: full.eligible
        ? coreMatch
          ? 'Preview and service EL days match.'
          : 'Mismatch: investigate earningType branch or rounding inside service.'
        : `Service not eligible (${full.reason || 'n/a'}); preview still shows policy+attendance days if EL enabled in policy.`,
    },
  };
}

async function main() {
  const opts = parseArgs();
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  const mid = new Date(opts.year, opts.month - 1, 15);
  const cycleInfo = await dateCycleService.getPayrollCycleForDate(mid);
  const globalPolicy = await LeavePolicySettings.getSettings();

  console.log('=== EL settings + calculation audit ===\n');
  console.log(
    `Payroll cycle label: ${cycleInfo.month}/${cycleInfo.year}  (script month/year args: ${opts.month}/${opts.year})`
  );
  console.log(
    `Cycle dates: ${cycleInfo.startDate?.toISOString?.().slice(0, 10)} → ${cycleInfo.endDate?.toISOString?.().slice(0, 10)}\n`
  );

  let employees;
  let deptLabel = '';
  if (opts.emp) {
    employees = await resolveEmployees(opts);
  } else {
    const { dept, employees: list } = await resolveEmployees(opts);
    employees = list;
    deptLabel = `${dept.name} (${dept.code || 'no code'})`;
    console.log(`Department filter: ${deptLabel}\n`);
  }

  for (const e of employees) {
    console.log('\n' + '='.repeat(72));
    console.log(`Employee ${e.emp_no} — ${e.employee_name || ''}`);
    console.log('='.repeat(72));
    const out = await auditOne(e, globalPolicy, opts.month, opts.year, cycleInfo.startDate, cycleInfo.endDate);
    console.log(JSON.stringify(out, null, 2));
  }

  console.log('\nDone.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
