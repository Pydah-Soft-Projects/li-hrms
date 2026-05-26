/**
 * Diagnose May 2026 partial-policy, present double-count, and leave-reconciliation gaps.
 * Usage: node scripts/diag_may_partial_recon_issues.js
 *        EMP_LIST=925,931,1715,1962,1730 node scripts/diag_may_partial_recon_issues.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const Leave = require('../leaves/model/Leave');
const OD = require('../leaves/model/OD');
const AttendanceSettings = require('../attendance/model/AttendanceSettings');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const {
  computeRawAttendanceHalfCreditsSync,
} = require('../attendance/utils/attendanceHalfPresence');
const { _REMARK_PREFIX: REMARK_PREFIX } = require('../leaves/services/leaveAttendanceReconciliationService');

const EMP_LIST = (process.env.EMP_LIST || '925,931,1715,1962,1730')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MONTH = process.env.MONTH || '2026-05';

function leaveHalfMask(leave) {
  if (leave.isHalfDay) {
    if (String(leave.halfDayType) === 'second_half') return { l1: 0, l2: 0.5 };
    return { l1: 0.5, l2: 0 };
  }
  return { l1: 0.5, l2: 0.5 };
}

function physicalMask(attFirst, attSecond) {
  return {
    p1: attFirst >= 0.5 - 1e-6 ? 0.5 : 0,
    p2: attSecond >= 0.5 - 1e-6 ? 0.5 : 0,
  };
}

function wouldReconConflict(leave, p1, p2) {
  const { l1, l2 } = leaveHalfMask(leave);
  if (leave.isHalfDay) {
    const onFirst = l1 > 0;
    return (onFirst && p1 >= 0.5) || (!onFirst && p2 >= 0.5);
  }
  if (Number(leave.numberOfDays) >= 1 - 1e-6) {
    if (p1 >= 0.5 && p2 >= 0.5) return 'reject_full';
    if (p1 >= 0.5 && p2 < 0.5) return 'narrow_second';
    if (p2 >= 0.5 && p1 < 0.5) return 'narrow_first';
    return false;
  }
  return false;
}

async function findApprovedOds(employeeId, dateStr) {
  const start = createISTDate(dateStr, '00:00');
  const end = createISTDate(dateStr, '23:59');
  return OD.find({
    employeeId,
    status: 'approved',
    fromDate: { $lte: end },
    toDate: { $gte: start },
  })
    .select('isHalfDay halfDayType odType_extended numberOfDays')
    .lean();
}

async function findApprovedLeaves(employeeId, dateStr) {
  const start = createISTDate(dateStr, '00:00');
  const end = createISTDate(dateStr, '23:59');
  return Leave.find({
    employeeId,
    status: 'approved',
    isActive: { $ne: false },
    fromDate: { $lte: end },
    toDate: { $gte: start },
  })
    .select('fromDate toDate isHalfDay halfDayType numberOfDays leaveType leaveNature status remarks splitStatus')
    .lean();
}

function simulateDay(daily, leaves, ods, processingMode, partialDaysContributeToPayableShifts) {
  const att = computeRawAttendanceHalfCreditsSync(daily, ods, { processingMode });
  let attFirst = att.attFirst;
  let attSecond = att.attSecond;
  let odFirst = 0;
  let odSecond = 0;
  let hasFullDayOd = false;
  for (const od of ods) {
    const odDays = Number(od.numberOfDays) || 0;
    const isFull =
      (!od.isHalfDay && String(od.odType_extended || '') !== 'hours') ||
      od.odType_extended === 'full_day' ||
      odDays >= 1 - 1e-6;
    if (isFull) {
      odFirst = 0.5;
      odSecond = 0.5;
      hasFullDayOd = true;
    } else if (od.halfDayType === 'first_half') odFirst = 0.5;
    else if (od.halfDayType === 'second_half') odSecond = 0.5;
    else odFirst = 0.5;
  }
  if (hasFullDayOd) {
    attFirst = 0;
    attSecond = 0;
  }

  let leaveContrib = 0;
  let lopFromLeaves = 0;
  for (const l of leaves) {
    const unit = l.isHalfDay ? 0.5 : 1;
    leaveContrib += unit;
    const nature = (l.leaveNature || '').toLowerCase();
    if (nature === 'lop' || nature === 'without_pay') lopFromLeaves += unit;
  }
  leaveContrib = Math.min(1, leaveContrib);
  lopFromLeaves = Math.min(1, lopFromLeaves);

  const dayPresent = Math.min(Math.max(0, attFirst - odFirst) + Math.max(0, attSecond - odSecond), 1);
  const mergedDailyCredit = Math.min(Math.max(attFirst, odFirst) + Math.max(attSecond, odSecond), 1);
  const isPartialDay = daily && String(daily.status) === 'PARTIAL';
  const usePartialPolicy =
    processingMode === 'single_shift' &&
    isPartialDay &&
    !hasFullDayOd &&
    leaveContrib < 0.999;

  let mergedForPayable = mergedDailyCredit;
  if (usePartialPolicy && partialDaysContributeToPayableShifts) {
    mergedForPayable = Math.max(mergedForPayable, 0.5);
  }
  let dayPayable = mergedForPayable;
  if (daily && Number.isFinite(Number(daily.payableShifts))) {
    dayPayable = Math.max(dayPayable, Number(daily.payableShifts));
  }
  dayPayable = Math.min(dayPayable, 1);

  const punchLeave = Math.min(1, mergedDailyCredit + leaveContrib);
  let partialLopPortion = 0;
  if (usePartialPolicy) {
    if (partialDaysContributeToPayableShifts) {
      partialLopPortion = Math.round(Math.max(0, 1 - Math.max(punchLeave, 0.5)) * 100) / 100;
    } else {
      partialLopPortion = Math.round(Math.max(0, 1 - punchLeave) * 100) / 100;
    }
  }

  const totalLopDay = lopFromLeaves + partialLopPortion;
  return {
    attFirst,
    attSecond,
    odFirst,
    odSecond,
    leaveContrib,
    lopFromLeaves,
    dayPresent,
    mergedDailyCredit,
    usePartialPolicy,
    partialLopPortion,
    dayPayable,
    totalLopDay,
    status: daily?.status,
    policyMeta: daily?.policyMeta?.partialDayRule,
  };
}

async function scanAllEmployees(year, monthNumber, startStr, endStr, processingMode, partialFlag) {
  const emps = await Employee.find({ is_active: { $ne: false } })
    .select('emp_no employee_name')
    .lean();
  const issues = {
    partial_lop_ge_1: [],
    partial_plus_od_present_inflate: [],
    leave_on_present_not_reconciled: [],
    partial_policy_when_half_covered: [],
  };

  for (const emp of emps) {
    const empNo = String(emp.emp_no || '').trim().toUpperCase();
    if (!empNo) continue;
    const dates = getAllDatesInRange(startStr, endStr);
    for (const dStr of dates) {
      const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dStr }).lean();
      if (!daily) continue;
      const leaves = await findApprovedLeaves(emp._id, dStr);
      const ods = await findApprovedOds(emp._id, dStr);
      const sim = simulateDay(daily, leaves, ods, processingMode, partialFlag);
      const { p1, p2 } = physicalMask(sim.attFirst, sim.attSecond);

      if (sim.usePartialPolicy && sim.partialLopPortion >= 0.999) {
        issues.partial_lop_ge_1.push({ empNo, date: dStr, ...sim });
      } else if (sim.usePartialPolicy && sim.totalLopDay >= 0.999 && sim.lopFromLeaves < 0.5) {
        issues.partial_lop_ge_1.push({
          empNo,
          date: dStr,
          note: 'total LOP ~1 incl policy',
          ...sim,
        });
      }

      const halfOd = ods.some((o) => o.isHalfDay);
      if (
        String(daily.status) === 'PARTIAL' &&
        halfOd &&
        sim.dayPresent >= 0.5 &&
        sim.mergedDailyCredit >= 0.999 &&
        sim.dayPresent > 0.5 + 1e-6
      ) {
        issues.partial_plus_od_present_inflate.push({ empNo, date: dStr, ...sim });
      }

      if (
        String(daily.status) === 'PARTIAL' &&
        (halfOd || sim.leaveContrib >= 0.5) &&
        sim.usePartialPolicy &&
        sim.partialLopPortion > 0
      ) {
        issues.partial_policy_when_half_covered.push({ empNo, date: dStr, ...sim });
      }

      if (p1 + p2 >= 0.5 && leaves.length) {
        for (const l of leaves) {
          const conflict = wouldReconConflict(l, p1, p2);
          const tag = `${REMARK_PREFIX} ${dStr}:`;
          const already = String(l.remarks || '').includes(tag);
          if (conflict && !already && l.status === 'approved') {
            issues.leave_on_present_not_reconciled.push({
              empNo,
              date: dStr,
              leaveType: l.leaveType,
              isHalfDay: l.isHalfDay,
              halfDayType: l.halfDayType,
              conflict,
              att: { attFirst: sim.attFirst, attSecond: sim.attSecond },
              p1,
              p2,
              dailyStatus: daily.status,
            });
          }
        }
      }
    }
  }
  return issues;
}

async function diagEmployee(emp, startStr, endStr, processingMode, partialFlag, summary) {
  const empNo = String(emp.emp_no).trim().toUpperCase();
  console.log(`\n${'='.repeat(72)}\n${empNo} — ${emp.employee_name || ''}\n${'='.repeat(72)}`);
  if (summary) {
    console.log('Monthly summary:', {
      present: summary.totalPresentDays,
      payable: summary.totalPayableShifts,
      partial: summary.totalPartialDays,
      lop: summary.totalLopLeaveDays,
      leave: summary.totalLeaveDays,
      overlap: summary.totalPartialPresentPayableOverlap,
    });
    const cd = summary.contributingDates || {};
    console.log('contributingDates.lopLeaves:', cd.lopLeaves || []);
    console.log('contributingDates.partial:', cd.partial || []);
    console.log('contributingDates.present:', cd.present || []);
    console.log('contributingDates.leaves:', cd.leaves || []);
  }

  const dates = getAllDatesInRange(startStr, endStr);
  for (const dStr of dates) {
    const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dStr }).lean();
    if (!daily) continue;
    const leaves = await findApprovedLeaves(emp._id, dStr);
    const ods = await findApprovedOds(emp._id, dStr);
    const st = String(daily.status || '');
    if (
      st !== 'PARTIAL' &&
      st !== 'PRESENT' &&
      st !== 'HALF_DAY' &&
      st !== 'OD' &&
      leaves.length === 0 &&
      ods.length === 0
    ) {
      continue;
    }
    const sim = simulateDay(daily, leaves, ods, processingMode, partialFlag);
    const interesting =
      st === 'PARTIAL' ||
      leaves.length > 0 ||
      ods.length > 0 ||
      sim.partialLopPortion > 0 ||
      sim.totalLopDay >= 0.5;
    if (!interesting) continue;

    const { p1, p2 } = physicalMask(sim.attFirst, sim.attSecond);
    const reconHints = leaves.map((l) => ({
      type: l.leaveType,
      half: l.isHalfDay,
      halfDayType: l.halfDayType,
      wouldConflict: wouldReconConflict(l, p1, p2),
      reconciledRemark: String(l.remarks || '').includes(`${REMARK_PREFIX} ${dStr}:`),
      status: l.status,
    }));

    console.log(`\n  ${dStr} status=${st} payableShifts=${daily.payableShifts}`);
    console.log('    sim:', sim);
    if (daily.policyMeta?.partialDayRule?.applied) {
      console.log('    policyMeta:', daily.policyMeta.partialDayRule);
    }
    if (leaves.length) console.log('    leaves:', reconHints);
    if (ods.length) console.log('    ods:', ods.map((o) => ({ half: o.isHalfDay, halfDayType: o.halfDayType })));
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const [year, monthNumber] = MONTH.split('-').map(Number);
  const anchor = createISTDate(`${MONTH}-15`, '12:00');
  const { payrollCycle } = await dateCycleService.getPeriodInfo(anchor);
  const startStr = extractISTComponents(payrollCycle.startDate).dateStr;
  const endStr = extractISTComponents(payrollCycle.endDate).dateStr;
  const attSettings = await AttendanceSettings.getSettings();
  const processingMode = AttendanceSettings.getProcessingMode(attSettings).mode;
  const partialFlag = attSettings?.featureFlags?.partialDaysContributeToPayableShifts === true;

  console.log('May payroll period:', startStr, '→', endStr);
  console.log('processingMode:', processingMode, '| partialDaysContributeToPayableShifts:', partialFlag);

  for (const empNo of EMP_LIST) {
    const emp = await Employee.findOne({
      $or: [{ emp_no: empNo }, { emp_no: String(empNo) }],
    }).lean();
    if (!emp) {
      console.log('Employee not found:', empNo);
      continue;
    }
    const summary = await MonthlyAttendanceSummary.findOne({
      employeeId: emp._id,
      year: payrollCycle.year,
      month: payrollCycle.month,
    }).lean();
    await diagEmployee(emp, startStr, endStr, processingMode, partialFlag, summary);
  }

  console.log('\n\n######## SCAN ALL EMPLOYEES (May period) ########\n');
  const issues = await scanAllEmployees(
    payrollCycle.year,
    payrollCycle.month,
    startStr,
    endStr,
    processingMode,
    partialFlag
  );

  console.log('\n--- Partial policy LOP >= 1 (or total LOP ~1 from policy) ---');
  console.log('count:', issues.partial_lop_ge_1.length);
  for (const r of issues.partial_lop_ge_1.slice(0, 50)) {
    console.log(`  ${r.empNo} ${r.date} policyLop=${r.partialLopPortion} totalLop=${r.totalLopDay} leaveContrib=${r.leaveContrib}`);
  }

  console.log('\n--- Partial + half OD but dayPresent > 0.5 (present inflation) ---');
  console.log('count:', issues.partial_plus_od_present_inflate.length);
  for (const r of issues.partial_plus_od_present_inflate) {
    console.log(`  ${r.empNo} ${r.date} dayPresent=${r.dayPresent}`);
  }

  console.log('\n--- Partial policy LOP>0 when OD/leave already covers other half ---');
  console.log('count:', issues.partial_policy_when_half_covered.length);
  for (const r of issues.partial_policy_when_half_covered.slice(0, 80)) {
    console.log(
      `  ${r.empNo} ${r.date} partialLop=${r.partialLopPortion} merged=${r.mergedDailyCredit} leave=${r.leaveContrib}`
    );
  }

  console.log('\n--- Approved leave conflicts attendance but NOT reconciled (remark missing) ---');
  console.log('count:', issues.leave_on_present_not_reconciled.length);
  const byEmp = {};
  for (const r of issues.leave_on_present_not_reconciled) {
    byEmp[r.empNo] = byEmp[r.empNo] || [];
    byEmp[r.empNo].push(r);
  }
  for (const [empNo, rows] of Object.entries(byEmp).sort()) {
    console.log(`  ${empNo}: ${rows.length} day(s)`);
    for (const r of rows.slice(0, 5)) {
      console.log(`    ${r.date} ${r.leaveType} conflict=${r.conflict} daily=${r.dailyStatus}`);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
