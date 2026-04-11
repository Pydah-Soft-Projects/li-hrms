/**
 * Preview EL that would accrue if March payroll-month accrual runs (no DB writes).
 * Uses resolveEffectiveEarnedLeave (global + department overrides) + calculateEarnedLeave.
 * Usage: node scripts/previewDevMarchElAccrual.js [year=2026] [month=3]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Department = require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const DepartmentSettings = require('../departments/model/DepartmentSettings');
const LeavePolicySettings = require('../settings/model/LeavePolicySettings');
const { resolveEffectiveEarnedLeave } = require('../leaves/services/earnedLeavePolicyResolver');
const { calculateEarnedLeave } = require('../leaves/services/earnedLeaveService');

const year = parseInt(process.argv[2] || '2026', 10);
const month = parseInt(process.argv[3] || '3', 10);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const dept =
    (await Department.findOne({ code: /^DEV$/i }).lean()) ||
    (await Department.findOne({ name: /development/i }).lean());
  if (!dept) {
    console.log(JSON.stringify({ error: 'Department not found' }));
    process.exit(0);
  }

  const policy = await LeavePolicySettings.getSettings().then((d) => d?.toObject?.() || d);
  const globalEl = policy?.earnedLeave || {};
  const deptDoc = await DepartmentSettings.getByDeptAndDiv(dept._id, null);
  const deptLeaves = deptDoc ? deptDoc.toObject()?.leaves : null;
  const effective = resolveEffectiveEarnedLeave(globalEl, deptLeaves);

  const emps = await Employee.find({ department_id: dept._id, is_active: true })
    .select('_id emp_no name')
    .sort({ emp_no: 1 })
    .lean();

  const rows = [];
  for (const e of emps) {
    const calc = await calculateEarnedLeave(e._id, month, year);
    rows.push({
      emp_no: e.emp_no,
      name: e.name,
      would_credit_el_days: calc.eligible ? calc.elEarned : 0,
      eligible: calc.eligible,
      reason_if_not: calc.eligible ? undefined : calc.reason,
      earningType: calc.earningType,
      breakdown: calc.calculationBreakdown,
      effective_days_used: calc.calculationBreakdown?.[0]?.effectiveDays ?? calc.attendanceDays,
    });
  }

  const globalSnapshot = {
    enabled: globalEl.enabled,
    earningType: globalEl.earningType,
    attendanceRules: {
      minDaysForFirstEL: globalEl.attendanceRules?.minDaysForFirstEL,
      daysPerEL: globalEl.attendanceRules?.daysPerEL,
      maxELPerMonth: globalEl.attendanceRules?.maxELPerMonth,
      rangesCount: (globalEl.attendanceRules?.attendanceRanges || []).length,
    },
  };

  const effectiveSnapshot = {
    enabled: effective.enabled,
    earningType: effective.earningType,
    attendanceRules: {
      minDaysForFirstEL: effective.attendanceRules?.minDaysForFirstEL,
      daysPerEL: effective.attendanceRules?.daysPerEL,
      maxELPerMonth: effective.attendanceRules?.maxELPerMonth,
      rangesCount: (effective.attendanceRules?.attendanceRanges || []).length,
      attendanceRanges: effective.attendanceRules?.attendanceRanges,
    },
  };

  console.log(
    JSON.stringify(
      {
        department: { name: dept.name, code: dept.code },
        accrual_month_input: { year, month },
        note:
          'Merged policy = global LeavePolicySettings.earnedLeave + DepartmentSettings.leaves (dept ranges replace global ranges when dept defines non-empty attendanceRanges).',
        global_earned_leave_policy: globalSnapshot,
        effective_policy_after_department_merge: effectiveSnapshot,
        department_only_override_snippet: deptLeaves?.earnedLeave || null,
        employees: rows,
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  mongoose.disconnect().finally(() => process.exit(1));
});
