/**
 * Read-only audit: Development dept — March OT/EL vs global, sample pay (OT formula).
 * Usage: node scripts/auditDevelopmentMarchOtElPay.js [year=2026] [month=3]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Department = require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const DepartmentSettings = require('../departments/model/DepartmentSettings');
const LeavePolicySettings = require('../settings/model/LeavePolicySettings');
const OvertimeSettings = require('../overtime/model/OvertimeSettings');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const { getMergedOtConfig } = require('../overtime/services/otConfigResolver');
const { resolveEffectiveEarnedLeave } = require('../leaves/services/earnedLeavePolicyResolver');
const { calculateEarnedLeave } = require('../leaves/services/earnedLeaveService');
const otPayService = require('../payroll/services/otPayService');

const year = parseInt(process.argv[2] || '2026', 10);
const month = parseInt(process.argv[3] || '3', 10);
const monthStr = `${year}-${String(month).padStart(2, '0')}`;

function pickOt(g, m) {
  return {
    recognitionMode: m.recognitionMode ?? g.recognitionMode,
    thresholdHours: m.thresholdHours ?? g.thresholdHours,
    minOTHours: m.minOTHours ?? g.minOTHours,
    defaultWorkingHoursPerDay: m.defaultWorkingHoursPerDay ?? g.defaultWorkingHoursPerDay,
    workingHoursPerDay: m.workingHoursPerDay,
    groupWorkingHours: m.groupWorkingHours,
    otHourRangesDeptLen: Array.isArray(m.otHourRanges) ? m.otHourRanges.length : 0,
    otHourRangesGlobalLen: Array.isArray(g.otHourRanges) ? g.otHourRanges.length : 0,
    multiplier: m.otMultiplier ?? g.multiplier,
    otPayPerHourDept: m.otPayPerHour,
    payPerHourGlobal: g.payPerHour,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log(JSON.stringify({ ok: false, error: 'MONGODB_URI missing' }));
    process.exit(1);
  }
  await mongoose.connect(uri);

  const dept =
    (await Department.findOne({ name: /^development$/i }).lean()) ||
    (await Department.findOne({ name: /development/i }).lean());
  if (!dept) {
    console.log(JSON.stringify({ ok: false, error: 'No department named like Development' }));
    await mongoose.disconnect();
    process.exit(0);
  }

  const deptId = dept._id.toString();
  const globalOt = await OvertimeSettings.getActiveSettings().then((d) => d?.toObject?.() || d || {});
  const globalLeave = await LeavePolicySettings.getSettings().then((d) => d?.toObject?.() || d || {});
  const deptSettingsDoc = await DepartmentSettings.getByDeptAndDiv(dept._id, null);
  const deptDoc = deptSettingsDoc ? deptSettingsDoc.toObject() : null;
  const deptLeaves = deptDoc?.leaves || {};
  const deptOt = deptDoc?.ot || {};

  const merged = await getMergedOtConfig(deptId, null);
  const effectiveEl = resolveEffectiveEarnedLeave(globalLeave.earnedLeave, deptLeaves);

  const otDiffFromGlobal = {
    recognitionMode: merged.recognitionMode !== globalOt.recognitionMode ? { global: globalOt.recognitionMode, merged: merged.recognitionMode } : null,
    thresholdHours: merged.thresholdHours !== globalOt.thresholdHours ? { global: globalOt.thresholdHours, merged: merged.thresholdHours } : null,
    minOTHours: merged.minOTHours !== globalOt.minOTHours ? { global: globalOt.minOTHours, merged: merged.minOTHours } : null,
    defaultWorkingHoursPerDay:
      merged.defaultWorkingHoursPerDay !== globalOt.defaultWorkingHoursPerDay
        ? { global: globalOt.defaultWorkingHoursPerDay, merged: merged.defaultWorkingHoursPerDay }
        : null,
    otHourRangesLength:
      (merged.otHourRanges || []).length !== (globalOt.otHourRanges || []).length
        ? { global: (globalOt.otHourRanges || []).length, merged: (merged.otHourRanges || []).length }
        : null,
    multiplier: merged.multiplier !== globalOt.multiplier ? { global: globalOt.multiplier, merged: merged.multiplier } : null,
  };

  const employees = await Employee.find({
    department_id: dept._id,
    is_active: true,
  })
    .select('_id emp_no name division_id gross_salary salaries dynamicFields employee_group_id')
    .limit(12)
    .lean();

  const rows = [];
  for (const emp of employees) {
    const eid = emp._id;
    let el = null;
    let elErr = null;
    try {
      el = await calculateEarnedLeave(eid, month, year);
    } catch (e) {
      elErr = e.message;
    }
    const summary = await MonthlyAttendanceSummary.findOne({
      employeeId: eid,
      month: monthStr,
    })
      .select('totalPayableShifts totalWeeklyOffs totalHolidays totalDaysInMonth totalPresentDays startDate endDate')
      .lean();

    let otPay = null;
    try {
      otPay = await otPayService.calculateOTPay(10, deptId, emp.division_id || null, {
        employee: emp,
        totalDaysInMonth: summary?.totalDaysInMonth || 30,
      });
    } catch (e) {
      otPay = { error: e.message };
    }

    rows.push({
      emp_no: emp.emp_no,
      name: emp.name,
      division_id: emp.division_id ? String(emp.division_id) : null,
      monthlySummary: summary || null,
      el: elErr
        ? { error: elErr }
        : {
            eligible: el.eligible,
            elEarned: el.elEarned,
            earningType: el.earningType,
            attendanceDays: el.attendanceDays,
            breakdownType: el.calculationBreakdown?.[0]?.type,
            creditDays: el.calculationBreakdown?.[0]?.creditDays,
            effectiveDays: el.calculationBreakdown?.[0]?.effectiveDays,
          },
      otPaySample10h: otPay?.error ? otPay : { otPay: otPay.otPay, otPayPerHour: otPay.otPayPerHour, formula: otPay.formula, minOTHours: otPay.minOTHours },
    });
  }

  const out = {
    ok: true,
    department: { id: deptId, name: dept.name, code: dept.code },
    period: { year, month, monthStr },
    ot: {
      usesDepartmentMerge: true,
      mergedSnapshot: {
        recognitionMode: merged.recognitionMode,
        thresholdHours: merged.thresholdHours,
        minOTHours: merged.minOTHours,
        defaultWorkingHoursPerDay: merged.defaultWorkingHoursPerDay,
        workingHoursPerDay: merged.workingHoursPerDay,
        groupWorkingHoursCount: (merged.groupWorkingHours || []).length,
        otHourRangesCount: (merged.otHourRanges || []).length,
        multiplier: merged.multiplier,
        autoCreateOtRequest: merged.autoCreateOtRequest,
      },
      departmentRawStored: pickOt(globalOt, deptOt),
      differsFromGlobalWhere: Object.fromEntries(Object.entries(otDiffFromGlobal).filter(([, v]) => v)),
    },
    el: {
      usesDepartmentMerge: true,
      effectivePolicy: {
        enabled: effectiveEl.enabled,
        earningType: effectiveEl.earningType,
        maxELPerMonth: effectiveEl.attendanceRules?.maxELPerMonth,
        daysPerEL: effectiveEl.attendanceRules?.daysPerEL,
        rangesCount: (effectiveEl.attendanceRules?.attendanceRanges || []).length,
      },
      globalEarnedLeaveSnapshot: {
        enabled: globalLeave.earnedLeave?.enabled,
        earningType: globalLeave.earnedLeave?.earningType,
        rangesCount: (globalLeave.earnedLeave?.attendanceRules?.attendanceRanges || []).length,
      },
      departmentEarnedLeaveOverride: deptLeaves.earnedLeave || null,
    },
    employeesSampled: employees.length,
    rows,
  };

  console.log(JSON.stringify(out, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message, stack: e.stack }));
  mongoose.disconnect().finally(() => process.exit(1));
});
