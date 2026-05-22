/**
 * For one division + payroll month, print each employee:
 * - Raw MonthlyAttendanceSummary: presentDays, payableShifts, weeklyOffs, holidays
 * - EL credit-day basis (what feeds range bands): effectiveDays + notes
 * - Expected EL from policy ranges (accumulateAttendanceRangeEl)
 * - calculateEarnedLeave() output (service EL + eligibility)
 * - Optional: already has EARNED_LEAVE credit this cycle (accrual would skip posting)
 *
 * Usage (from backend/):
 *   node scripts/report_el_inputs_vs_service_division.js
 *   node scripts/report_el_inputs_vs_service_division.js --division=PYDAHSOFT --department=Development --month=4 --year=2026 --limit=100
 *   node scripts/report_el_inputs_vs_service_division.js --department=all   # all departments in division (default dept filter off)
 */

const mongoose = require('mongoose');
require('dotenv').config();

require('../departments/model/Department');
require('../departments/model/Division');
require('../departments/model/Designation');
require('../employees/model/Employee');

const LeavePolicySettings = require('../settings/model/LeavePolicySettings');
const DepartmentSettings = require('../departments/model/DepartmentSettings');
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const dateCycleService = require('../leaves/services/dateCycleService');
const { resolveEffectiveEarnedLeave } = require('../leaves/services/earnedLeavePolicyResolver');
const { accumulateAttendanceRangeEl } = require('../leaves/services/earnedLeaveRangeAccumulation');
const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');
const {
  calculateEarnedLeave,
  getAttendanceData,
} = require('../leaves/services/earnedLeaveService');

function parseArgs() {
  const out = {
    divisionKey: 'PYDAHSOFT',
    departmentKey: 'Development',
    departmentAll: false,
    month: 4,
    year: 2026,
    limit: 200,
  };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--division=')) out.divisionKey = a.split('=')[1].trim();
    else if (a.startsWith('--department=')) {
      const v = a.split('=').slice(1).join('=').trim();
      if (!v || /^all$/i.test(v) || v === '*') {
        out.departmentAll = true;
      } else {
        out.departmentKey = v;
      }
    } else if (a.startsWith('--month=')) out.month = Math.max(1, Math.min(12, Number(a.split('=')[1]) || 4));
    else if (a.startsWith('--year=')) out.year = Number(a.split('=')[1]) || 2026;
    else if (a.startsWith('--limit=')) out.limit = Math.max(1, Math.min(2000, Number(a.split('=')[1]) || 200));
  }
  return out;
}

async function findDivision(q) {
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Division.findOne({
    $or: [{ code: new RegExp(`^${esc}$`, 'i') }, { name: new RegExp(esc, 'i') }],
  })
    .select('_id name code')
    .lean();
}

async function findDepartment(q) {
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Department.findOne({
    $or: [{ code: new RegExp(`^${esc}$`, 'i') }, { name: new RegExp(esc, 'i') }],
  })
    .select('_id name code')
    .lean();
}

function expectedElFromPolicy(effectiveEL, effectiveDays) {
  const rules = effectiveEL.attendanceRules || {};
  const ranges = rules.attendanceRanges;
  if (Array.isArray(ranges) && ranges.length > 0) {
    const { elEarned } = accumulateAttendanceRangeEl(ranges, effectiveDays, rules.maxELPerMonth);
    return elEarned;
  }
  const minF = Number(rules.minDaysForFirstEL) || 20;
  const dpe = Number(rules.daysPerEL) || 20;
  const cap = Number(rules.maxELPerMonth) || 2;
  if (effectiveDays >= minF) {
    const raw = Math.floor(effectiveDays / dpe);
    return Math.min(raw, cap);
  }
  return 0;
}

async function main() {
  const opts = parseArgs();
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  const div = await findDivision(opts.divisionKey);
  if (!div) {
    console.error(`No division matching "${opts.divisionKey}".`);
    process.exit(1);
  }

  let dept = null;
  if (!opts.departmentAll) {
    dept = await findDepartment(opts.departmentKey);
    if (!dept) {
      console.error(`No department matching "${opts.departmentKey}". Use --department=all for whole division.`);
      process.exit(1);
    }
  }

  const globalPolicy = await LeavePolicySettings.getSettings();
  const fy = await dateCycleService.getFinancialYearForDate(new Date(opts.year, opts.month - 1, 15));

  const empQuery = { division_id: div._id, is_active: true };
  if (dept) empQuery.department_id = dept._id;

  const emps = await Employee.find(empQuery)
    .select('_id emp_no employee_name department_id division_id doj')
    .sort({ emp_no: 1 })
    .limit(opts.limit)
    .lean();

  const mid = new Date(opts.year, opts.month - 1, 15);
  const cycleInfo = await dateCycleService.getPayrollCycleForDate(mid);

  console.log(`Division: ${div.name} (${div.code})   Payroll cycle label: ${cycleInfo.month}/${cycleInfo.year}`);
  console.log(
    dept
      ? `Department: ${dept.name} (${dept.code || 'n/a'})`
      : 'Department: (all departments in division)'
  );
  console.log(
    `Period (approx): ${cycleInfo.startDate?.toISOString?.().slice(0, 10)} → ${cycleInfo.endDate?.toISOString?.().slice(0, 10)}`
  );
  console.log(`FY name (ledger): ${fy.name}\n`);

  const rows = [];

  for (const e of emps) {
    const deptSettings = await DepartmentSettings.getByDeptAndDiv(e.department_id, e.division_id);
    const effectiveEL = resolveEffectiveEarnedLeave(globalPolicy.earnedLeave, deptSettings?.leaves);

    let attendanceData = null;
    let calc = null;
    let errMsg = '';
    try {
      attendanceData = await getAttendanceData(
        e._id,
        opts.month,
        opts.year,
        e,
        cycleInfo.startDate,
        cycleInfo.endDate,
        effectiveEL.attendanceRules || {}
      );
      calc = await calculateEarnedLeave(e._id, opts.month, opts.year, cycleInfo.startDate, cycleInfo.endDate);
    } catch (err) {
      errMsg = err.message || String(err);
    }

    const effectiveDays = attendanceData ? attendanceData.effectiveDays : null;
    const expected =
      attendanceData != null ? expectedElFromPolicy(effectiveEL, effectiveDays) : null;

    let alreadyCredited = false;
    try {
      alreadyCredited = await leaveRegisterYearLedgerService.hasEarnedLeaveCreditInMonth(
        e._id,
        fy.name,
        cycleInfo.month,
        cycleInfo.year
      );
    } catch {
      alreadyCredited = false;
    }

    rows.push({
      emp_no: e.emp_no,
      presentDays: attendanceData?.presentDays ?? '',
      payableShifts: attendanceData?.payableShifts ?? '',
      woHol: attendanceData != null ? `${attendanceData.weeklyOffs}+${attendanceData.holidays}` : '',
      effectiveDays_el_input: effectiveDays ?? '',
      expected_el_ranges: expected != null ? expected : '',
      service_elEarned: calc && calc.elEarned != null ? calc.elEarned : '',
      eligible: calc ? !!calc.eligible : false,
      reason: calc && !calc.eligible ? String(calc.reason || '').slice(0, 60) : errMsg.slice(0, 80),
      already_EL_credit_slot: alreadyCredited ? 'yes' : 'no',
      basis_note: attendanceData?.elCreditBasisDescription ? String(attendanceData.elCreditBasisDescription).slice(0, 70) : '',
    });
  }

  console.table(rows);
  console.log(`
Columns:
  presentDays / payableShifts — from MonthlyAttendanceSummary (${opts.year}-${String(opts.month).padStart(2, '0')}).
  woHol — weeklyOffs + holidays (shown as "w+h").
  effectiveDays_el_input — min(period days, policy basis); this number is compared to each range Min days for EL.
  expected_el_ranges — EL from your cumulative bands + Max EL/month cap (same math as service when eligible).
  service_elEarned — calculateEarnedLeave() result (still 0 if probation / EL disabled / etc.).
  already_EL_credit_slot — LeaveRegisterYear already has auto EARNED_LEAVE CREDIT for this payroll month (batch would skip posting).
`);

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
