/**
 * Preview EL accrual for March (or args): all DEV employees + 10 employees from other departments.
 * Shows merged policy + credit days + would_credit — verify cumulative + dept overrides.
 *
 * Usage: node scripts/previewElAccrualMarchDevVsOthers.js [year=2026] [month=3]
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

async function deptSettingsLean(deptId) {
  const doc = await DepartmentSettings.getByDeptAndDiv(deptId, null);
  return doc ? doc.toObject() : null;
}

function policyDigest(effective, deptLeaves) {
  const ar = effective.attendanceRules?.attendanceRanges || [];
  const deptAr =
    deptLeaves?.earnedLeave?.attendanceRules?.attendanceRanges ||
    deptLeaves?.earnedLeave?.attendanceRanges ||
    [];
  const deptHasRanges = Array.isArray(deptAr) && deptAr.length > 0;
  return {
    rangesSource: deptHasRanges ? 'department' : 'global',
    maxELPerMonth: effective.attendanceRules?.maxELPerMonth,
    rangesCount: ar.length,
    rangeMins: ar.map((r) => r.minDays),
    earningType: effective.earningType,
  };
}

async function previewRow(emp, deptName, globalEl) {
  const ds = await deptSettingsLean(emp.department_id);
  const leaves = ds?.leaves || null;
  const effective = resolveEffectiveEarnedLeave(globalEl, leaves);
  let calc;
  let err;
  try {
    calc = await calculateEarnedLeave(emp._id, month, year);
  } catch (e) {
    err = e.message;
  }
  const b0 = calc?.calculationBreakdown?.[0];
  return {
    emp_no: emp.emp_no,
    employee_name: emp.name || emp.employee_name,
    department: deptName,
    policy: policyDigest(effective, leaves),
    creditDays: b0?.creditDays,
    effectiveDays: b0?.effectiveDays,
    payableShifts: b0?.payableShifts,
    weeklyOffs: b0?.weeklyOffs,
    holidays: b0?.holidays,
    would_credit_el_days: err ? null : calc?.eligible ? calc.elEarned : 0,
    eligible: calc?.eligible,
    error: err,
    triggered_ranges: b0?.ranges,
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const globalPolicy = await LeavePolicySettings.getSettings().then((d) => d?.toObject?.() || d);
  const globalEl = globalPolicy?.earnedLeave || {};

  const devDept =
    (await Department.findOne({ code: /^DEV$/i }).lean()) ||
    (await Department.findOne({ name: /development/i }).lean());

  if (!devDept) {
    console.log(JSON.stringify({ error: 'Development department not found' }));
    await mongoose.disconnect();
    process.exit(0);
  }

  const devEmps = await Employee.find({ department_id: devDept._id, is_active: true })
    .select('_id emp_no name employee_name department_id')
    .sort({ emp_no: 1 })
    .lean();

  const otherEmps = await Employee.find({
    department_id: { $ne: devDept._id },
    is_active: true,
  })
    .select('_id emp_no name employee_name department_id')
    .sort({ emp_no: 1 })
    .limit(10)
    .lean();

  const deptCache = new Map();
  async function deptNameFor(id) {
    const k = String(id);
    if (deptCache.has(k)) return deptCache.get(k);
    const d = await Department.findById(id).select('name code').lean();
    const n = d ? `${d.name} (${d.code || '—'})` : String(id);
    deptCache.set(k, n);
    return n;
  }

  const development = [];
  for (const e of devEmps) {
    development.push(await previewRow(e, await deptNameFor(e.department_id), globalEl));
  }

  const other_departments_sample = [];
  for (const e of otherEmps) {
    other_departments_sample.push(await previewRow(e, await deptNameFor(e.department_id), globalEl));
  }

  const summary = {
    development_employee_count: development.length,
    development_would_credit_total_el_days: development.reduce((s, r) => s + (Number(r.would_credit_el_days) || 0), 0),
    other_sample_size: other_departments_sample.length,
    other_sample_would_credit_total_el_days: other_departments_sample.reduce(
      (s, r) => s + (Number(r.would_credit_el_days) || 0),
      0
    ),
    note:
      'would_credit_el_days = calculateEarnedLeave (monthly summary credit days, cumulative range stacking, merged dept+global policy). Not posted until accrual job runs.',
  };

  console.log(
    JSON.stringify(
      {
        ok: true,
        period: { year, month },
        global_earned_leave_brief: {
          maxELPerMonth: globalEl.attendanceRules?.maxELPerMonth,
          rangesCount: (globalEl.attendanceRules?.attendanceRanges || []).length,
        },
        summary,
        development_employees: development,
        other_departments_sample_10: other_departments_sample,
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
