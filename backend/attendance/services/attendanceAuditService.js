/**
 * Attendance audit checks for HR pre-payroll validation.
 * Mirrors logic from backend/scripts audit utilities (read-only).
 */

const mongoose = require('mongoose');
const MonthlyAttendanceSummary = require('../model/MonthlyAttendanceSummary');
const AttendanceDaily = require('../model/AttendanceDaily');
const Employee = require('../../employees/model/Employee');
const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
const LeaveRegisterYear = require('../../leaves/model/LeaveRegisterYear');
const Leave = require('../../leaves/model/Leave');
const OD = require('../../leaves/model/OD');
const Shift = require('../../shifts/model/Shift');
const Settings = require('../../settings/model/Settings');
const dateCycleService = require('../../leaves/services/dateCycleService');
const { extractISTComponents } = require('../../shared/utils/dateUtils');
const { payRegisterAllRowFromSummary } = require('../../shared/payRegisterAllRow');
const { computeLeaveTypeBreakdownFromDailyRecords } = require('../../pay-register/services/totalsCalculationService');
const { calculateMonthlySummary } = require('./summaryCalculationService');
const { getProcessingModeForEmployee } = require('./processingModeResolutionService');
const { mergeScopeWithEmployeeClauses, buildLeftDuringPeriodOrClause } = require('./attendanceEmployeeQuery');
const {
  calculateLateIn,
  calculateEarlyOut,
} = require('../../shifts/services/shiftDetectionService');

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

const SUMMARY_DIFF_FIELDS = [
  'totalDaysInMonth',
  'totalPresentDays',
  'totalPartialDays',
  'totalAbsentDays',
  'totalPayableShifts',
  'totalLeaves',
  'totalODs',
  'totalWeeklyOffs',
  'totalHolidays',
  'lateInCount',
  'totalLateInMinutes',
  'earlyOutCount',
  'totalEarlyOutMinutes',
];

const AUDIT_TYPES = [
  {
    code: 'leave_integrity',
    label: 'Leave totals integrity',
    description:
      'Flags monthly summaries where paid leaves exceed total leaves, or paid + LOP exceed total leave days.',
    severity: 'high',
  },
  {
    code: 'summary_vs_payregister',
    label: 'Summary vs pay register',
    description:
      'Compares monthly attendance summary with pay register totals. Expand any row for day-by-day Attendance vs Pay register grid with edit history.',
    severity: 'high',
  },
  {
    code: 'missing_summaries',
    label: 'Missing monthly summaries',
    description: 'Active employees in the pay period who have no stored monthly attendance summary.',
    severity: 'medium',
  },
  {
    code: 'period_totals_mismatch',
    label: 'Period day-count mismatch',
    description:
      'Present + WO + HOL + leave + OD + absent does not equal period days (Complete table Total column).',
    severity: 'medium',
  },
  {
    code: 'paid_lop_split',
    label: 'Paid / LOP split vs register cap',
    description:
      'Validates paid vs LOP leave split against leave register monthly pool (CL + CCL cap).',
    severity: 'high',
  },
  {
    code: 'summary_stale',
    label: 'Stored summary vs recalculation',
    description:
      'Re-runs monthly summary engine and compares with stored values (read-only; originals restored).',
    severity: 'high',
    slow: true,
  },
  {
    code: 'leave_od_conflict',
    label: 'Leave / OD vs attendance conflict',
    description:
      'Days with present/partial punches overlapping full-day leave or OD (should be resolved before payroll).',
    severity: 'high',
  },
  {
    code: 'late_early_grace',
    label: 'Late-in / early-out grace',
    description:
      'Attendance daily late/early flags vs configured shift and global grace periods.',
    severity: 'medium',
    slow: true,
  },
];

function pickSummaryFields(s) {
  const o = {};
  for (const k of SUMMARY_DIFF_FIELDS) o[k] = s?.[k];
  return o;
}

function diffSummary(stored, recalc) {
  const d = {};
  for (const k of SUMMARY_DIFF_FIELDS) {
    const va = stored?.[k];
    const vb = recalc?.[k];
    if (typeof va === 'number' && typeof vb === 'number') {
      if (Math.abs(va - vb) > 0.009) {
        d[k] = { stored: va, recalc: vb, delta: round2(vb - va) };
      }
    } else if (va !== vb) {
      d[k] = { stored: va, recalc: vb };
    }
  }
  return d;
}

function parseMonth(monthStr) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthStr || ''))) {
    throw new Error('Month must be in YYYY-MM format');
  }
  const [year, monthNumber] = String(monthStr).split('-').map(Number);
  return { monthStr: String(monthStr), year, monthNumber };
}

async function resolvePeriod(monthStr) {
  const { year, monthNumber } = parseMonth(monthStr);
  const period = await dateCycleService.getPayrollCycleForMonth(year, monthNumber);
  const startDateStr = extractISTComponents(period.startDate).dateStr;
  const endDateStr = extractISTComponents(period.endDate).dateStr;
  return { year, monthNumber, startDateStr, endDateStr };
}

function buildEmployeeFilter({ scopeFilter, divisionIds, departmentIds, empNos }) {
  const extra = [];
  if (divisionIds?.length) {
    extra.push({ division_id: { $in: divisionIds.map((id) => new mongoose.Types.ObjectId(String(id))) } });
  }
  if (departmentIds?.length) {
    extra.push({ department_id: { $in: departmentIds.map((id) => new mongoose.Types.ObjectId(String(id))) } });
  }
  if (empNos?.length) {
    extra.push({ emp_no: { $in: empNos.map((e) => String(e).trim().toUpperCase()) } });
  }
  return mergeScopeWithEmployeeClauses(scopeFilter, extra);
}

async function getScopedEmployees(ctx) {
  const { startDateStr, endDateStr } = ctx;
  const filter = buildEmployeeFilter(ctx);
  const leftClause = buildLeftDuringPeriodOrClause(startDateStr, endDateStr);
  const query = mergeScopeWithEmployeeClauses(filter, [leftClause]);
  return Employee.find(query)
    .select('_id emp_no employee_name division_id department_id')
    .populate('division_id', 'name')
    .populate('department_id', 'name')
    .lean();
}

async function getScopedSummaries(ctx) {
  const { monthStr } = ctx;
  const employees = await getScopedEmployees(ctx);
  const empIds = employees.map((e) => e._id);
  const empById = new Map(employees.map((e) => [String(e._id), e]));
  if (!empIds.length) return { employees, summaries: [], empById };

  const summaries = await MonthlyAttendanceSummary.find({
    month: monthStr,
    employeeId: { $in: empIds },
  }).lean();

  return { employees, summaries, empById };
}

function rowBase(emp, extra = {}) {
  return {
    employeeId: String(emp?._id || extra.employeeId || ''),
    emp_no: emp?.emp_no || extra.emp_no || '',
    employee_name: emp?.employee_name || extra.employee_name || '',
    division: emp?.division_id?.name || extra.division || '',
    department: emp?.department_id?.name || extra.department || '',
    ...extra,
  };
}

async function auditLeaveIntegrity(ctx, { onlyMismatches, limit }) {
  const { summaries, empById } = await getScopedSummaries(ctx);
  const rows = [];
  for (const s of summaries) {
    const totalLeaves = round2(s.totalLeaves);
    const paid = round2(s.totalPaidLeaves);
    const lop = round2(s.totalLopLeaves);
    const issues = [];
    if (paid > totalLeaves + 0.01) issues.push('paid_exceeds_total');
    if (round2(paid + lop) > totalLeaves + 0.01) issues.push('paid_lop_exceeds_total');
    if (!issues.length) continue;
    const emp = empById.get(String(s.employeeId));
    rows.push(
      rowBase(emp, {
        totalLeaves,
        totalPaidLeaves: paid,
        totalLopLeaves: lop,
        issues,
        message: issues.join(', '),
      })
    );
  }
  const filtered = onlyMismatches ? rows : rows;
  return {
    checked: summaries.length,
    flagged: rows.length,
    rows: filtered.slice(0, limit || 500),
  };
}

function sumBreakdownDays(dailyRecords) {
  const breakdown = computeLeaveTypeBreakdownFromDailyRecords(dailyRecords || []);
  return breakdown.reduce((s, r) => s + (Number(r.days) || 0), 0);
}

function badLeaveTypeLabels(dailyRecords) {
  const bad = { paid: 0, lop: 0 };
  if (!Array.isArray(dailyRecords)) return bad;
  for (const dr of dailyRecords) {
    const check = (lt) => {
      const x = String(lt || '').toLowerCase();
      if (x === 'paid') bad.paid += 1;
      else if (x === 'lop') bad.lop += 1;
    };
    check(dr.leaveType);
    check(dr.firstHalf?.leaveType);
    check(dr.secondHalf?.leaveType);
  }
  return bad;
}

async function auditSummaryVsPayregister(ctx, { onlyMismatches, limit }) {
  const { monthStr } = ctx;
  const { employees, summaries, empById } = await getScopedSummaries(ctx);
  const masByEmp = new Map(summaries.map((s) => [String(s.employeeId), s]));
  const empIds = employees.map((e) => e._id);

  const registers = await PayRegisterSummary.find({
    month: monthStr,
    employeeId: { $in: empIds },
  })
    .select('employeeId emp_no totals dailyRecords summaryLocked')
    .lean();

  const rows = [];
  const seenEmp = new Set();

  for (const pr of registers) {
    const sid = String(pr.employeeId);
    seenEmp.add(sid);
    const mas = masByEmp.get(sid);
    const tl = Number(pr.totals?.totalLeaveDays) || 0;
    const gridSum = sumBreakdownDays(pr.dailyRecords);
    const masLeaves = mas != null ? Number(mas.totalLeaves) || 0 : null;
    const d1 = Math.abs(tl - gridSum);
    const d2 = mas != null ? Math.abs(tl - masLeaves) : null;
    const bad = badLeaveTypeLabels(pr.dailyRecords);
    const hasBad = bad.paid + bad.lop > 0;
    const flag = d1 > 0.051 || (d2 != null && d2 > 0.051) || hasBad || mas == null;
    if (onlyMismatches && !flag) continue;

    const emp = empById.get(sid);
    rows.push(
      rowBase(emp, {
        employeeId: sid,
        hasMonthlySummary: !!mas,
        mas_totalLeaves: masLeaves,
        pr_totalLeaveDays: round2(tl),
        breakdownSumFromGrid: round2(gridSum),
        abs_pr_minus_grid: round2(d1),
        abs_pr_minus_mas: d2 == null ? null : round2(d2),
        halfRowsWith_leaveType_paid_or_lop: bad,
        summaryLocked: !!pr.summaryLocked,
        flagged: flag,
      })
    );
  }

  for (const s of summaries) {
    const sid = String(s.employeeId);
    if (seenEmp.has(sid)) continue;
    const emp = empById.get(sid);
    rows.push(
      rowBase(emp, {
        employeeId: String(s.employeeId),
        hasMonthlySummary: true,
        mas_totalLeaves: round2(s.totalLeaves),
        note: 'Monthly summary exists but no pay register row for this month',
        flagged: true,
      })
    );
  }

  return {
    checked: registers.length + (summaries.length - seenEmp.size),
    flagged: rows.filter((r) => r.flagged !== false).length,
    rows: rows.slice(0, limit || 500),
  };
}

async function auditMissingSummaries(ctx, { onlyMismatches, limit }) {
  const { monthStr } = ctx;
  const employees = await getScopedEmployees(ctx);
  const empIds = employees.map((e) => e._id);
  const existing = await MonthlyAttendanceSummary.find({
    month: monthStr,
    employeeId: { $in: empIds },
  })
    .select('employeeId')
    .lean();
  const hasSummary = new Set(existing.map((s) => String(s.employeeId)));

  const rows = [];
  for (const emp of employees) {
    if (hasSummary.has(String(emp._id))) continue;
    rows.push(rowBase(emp, { message: 'No monthly summary for this pay period' }));
  }

  return {
    checked: employees.length,
    flagged: rows.length,
    rows: (onlyMismatches ? rows : rows).slice(0, limit || 500),
  };
}

async function auditPeriodTotalsMismatch(ctx, { onlyMismatches, limit }) {
  const { summaries, empById } = await getScopedSummaries(ctx);
  const rows = [];

  for (const s of summaries) {
    const emp = empById.get(String(s.employeeId));
    const pm = emp ? await getProcessingModeForEmployee(emp) : null;
    const mode = pm?.mode || 'multi_shift';
    const prRow = payRegisterAllRowFromSummary(s, mode);
    const periodDays = round2(Number(s.totalDaysInMonth) || 0);
    const summed = round2(prRow.totalDaysSummed);
    const delta = round2(summed - periodDays);
    if (onlyMismatches && Math.abs(delta) <= 0.051) continue;

    rows.push(
      rowBase(emp, {
        processingMode: mode,
        totalDaysInMonth: periodDays,
        totalDaysSummed: summed,
        delta,
        breakdown: {
          present: prRow.present,
          weekOffs: prRow.weekOffs,
          holidays: prRow.holidays,
          totalLeaves: prRow.totalLeaves,
          od: prRow.od,
          absent: prRow.absent,
        },
        flagged: Math.abs(delta) > 0.051,
      })
    );
  }

  return {
    checked: summaries.length,
    flagged: rows.filter((r) => r.flagged).length,
    rows: rows.slice(0, limit || 500),
  };
}

async function auditPaidLopSplit(ctx, { onlyMismatches, limit }) {
  const { monthStr, year, monthNumber } = ctx;
  const { summaries, empById } = await getScopedSummaries(ctx);
  const rows = [];

  for (const s of summaries) {
    const totalLeaves = round2(s.totalLeaves);
    if (totalLeaves <= 0) continue;

    const employeeId = s.employeeId;
    const refDate = new Date(year, monthNumber - 1, 1);
    const fy = await dateCycleService.getFinancialYearForDate(refDate);
    const register = await LeaveRegisterYear.findOne({ employeeId, financialYear: fy.name }).lean();
    const slot = register?.months?.find(
      (m) => Number(m.payrollCycleMonth) === monthNumber && Number(m.payrollCycleYear) === year
    );
    if (!slot) continue;

    const clScheduled = Number(slot.clCredits) || 0;
    const clTxnCredits = (Array.isArray(slot.transactions) ? slot.transactions : [])
      .filter(
        (t) =>
          String(t.leaveType || '').toUpperCase() === 'CL' &&
          String(t.transactionType || '').toUpperCase() === 'CREDIT'
      )
      .reduce((sum, t) => sum + (Number(t.days) || 0), 0);
    const effectiveCl = Math.max(clScheduled, clTxnCredits);
    const cap = round2(effectiveCl + (Number(slot.compensatoryOffs) || 0));
    const expectedPaid = round2(Math.min(totalLeaves, cap));
    const expectedLop = round2(Math.max(0, totalLeaves - expectedPaid));
    const gotPaid = round2(s.totalPaidLeaves);
    const gotLop = round2(s.totalLopLeaves);
    const ok = Math.abs(gotPaid - expectedPaid) < 0.001 && Math.abs(gotLop - expectedLop) < 0.001;
    if (onlyMismatches && ok) continue;

    rows.push(
      rowBase(empById.get(String(employeeId)), {
        totalLeaves,
        registerCap: cap,
        expectedPaid,
        expectedLop,
        gotPaid,
        gotLop,
        flagged: !ok,
      })
    );
  }

  return {
    checked: summaries.length,
    flagged: rows.filter((r) => r.flagged).length,
    rows: rows.slice(0, limit || 500),
  };
}

async function auditSummaryStale(ctx, { onlyMismatches, limit }) {
  const { monthStr, year, monthNumber } = ctx;
  const { summaries, empById } = await getScopedSummaries(ctx);
  const cap = Math.min(limit || 100, summaries.length);
  const toProcess = summaries.slice(0, cap);

  const rows = [];
  let unchanged = 0;
  let failed = 0;

  for (const s of toProcess) {
    const stored = pickSummaryFields(s);
    const snap = { ...s };
    try {
      const emp = empById.get(String(s.employeeId));
      const pm = emp ? await getProcessingModeForEmployee(emp) : null;
      const fresh = await calculateMonthlySummary(s.employeeId, s.emp_no, year, monthNumber);
      const recalc = pickSummaryFields(fresh);
      const diff = diffSummary(stored, recalc);

      await MonthlyAttendanceSummary.updateOne(
        { _id: snap._id },
        {
          $set: (() => {
            const { _id, __v, ...rest } = snap;
            return rest;
          })(),
        }
      );

      if (Object.keys(diff).length) {
        rows.push(
          rowBase(emp, {
            processingMode: pm?.mode || 'unknown',
            diff,
            stored,
            recalc,
            flagged: true,
          })
        );
      } else {
        unchanged += 1;
        if (!onlyMismatches) {
          rows.push(rowBase(emp, { flagged: false, message: 'Stored matches recalculation' }));
        }
      }
    } catch (err) {
      failed += 1;
      rows.push(
        rowBase(empById.get(String(s.employeeId)), {
          flagged: true,
          error: err.message,
        })
      );
    }
  }

  return {
    checked: toProcess.length,
    flagged: rows.filter((r) => r.flagged).length,
    unchanged,
    failed,
    truncated: summaries.length > cap,
    totalInScope: summaries.length,
    rows: rows.slice(0, limit || 500),
    note: 'Original summary documents were restored after each recalculation.',
  };
}

function odIsConflictEligible(od) {
  const ext = String(od.odType_extended || od.odTypeExtended || '').toLowerCase();
  if (ext === 'hours') return false;
  if (ext === 'half_day' || od.isHalfDay) return false;
  return true;
}

function leaveCoversDate(leave, dateStr) {
  const from = leave.fromDate || leave.startDate;
  const to = leave.toDate || leave.endDate;
  if (!from || !to) return false;
  const start = typeof from === 'string' ? from.slice(0, 10) : extractISTComponents(from).dateStr;
  const end = typeof to === 'string' ? to.slice(0, 10) : extractISTComponents(to).dateStr;
  return dateStr >= start && dateStr <= end;
}

async function auditLeaveOdConflict(ctx, { onlyMismatches, limit }) {
  const { startDateStr, endDateStr } = ctx;
  const employees = await getScopedEmployees(ctx);
  const empNos = employees.map((e) => String(e.emp_no).trim().toUpperCase()).filter(Boolean);
  const empByNo = new Map(employees.map((e) => [String(e.emp_no).trim().toUpperCase(), e]));
  if (!empNos.length) return { checked: 0, flagged: 0, rows: [] };

  const dailies = await AttendanceDaily.find({
    employeeNumber: { $in: empNos },
    date: { $gte: startDateStr, $lte: endDateStr },
    status: { $in: ['PRESENT', 'PARTIAL'] },
  })
    .select('employeeNumber date status inTime')
    .lean();

  const empIds = employees.map((e) => e._id);
  const [leaves, ods] = await Promise.all([
    Leave.find({
      employeeId: { $in: empIds },
      status: 'approved',
      isActive: { $ne: false },
    })
      .select('employeeId fromDate toDate startDate endDate leaveType')
      .lean(),
    OD.find({
      employeeId: { $in: empIds },
      status: 'approved',
      isActive: { $ne: false },
    })
      .select('employeeId fromDate toDate startDate endDate odType_extended isHalfDay')
      .lean(),
  ]);

  const leavesByEmp = new Map();
  for (const l of leaves) {
    const k = String(l.employeeId);
    if (!leavesByEmp.has(k)) leavesByEmp.set(k, []);
    leavesByEmp.get(k).push(l);
  }
  const odsByEmp = new Map();
  for (const o of ods) {
    const k = String(o.employeeId);
    if (!odsByEmp.has(k)) odsByEmp.set(k, []);
    odsByEmp.get(k).push(o);
  }

  const rows = [];
  for (const d of dailies) {
    const empNo = String(d.employeeNumber).trim().toUpperCase();
    const emp = empByNo.get(empNo);
    if (!emp) continue;
    const empId = String(emp._id);
    const dateStr = d.date;
    const empLeaves = leavesByEmp.get(empId) || [];
    const empOds = odsByEmp.get(empId) || [];
    const hasLeave = empLeaves.some((l) => leaveCoversDate(l, dateStr));
    const hasOd = empOds.some((o) => odIsConflictEligible(o) && leaveCoversDate(o, dateStr));
    if (!hasLeave && !hasOd) continue;

    rows.push(
      rowBase(emp, {
        date: dateStr,
        status: d.status,
        hasLeave,
        hasOD: hasOd,
        message: 'Present/partial attendance overlaps full-day leave or OD',
        flagged: true,
      })
    );
  }

  return {
    checked: dailies.length,
    flagged: rows.length,
    rows: rows.slice(0, limit || 500),
  };
}

function sortShifts(shifts) {
  return [...(shifts || [])].sort((a, b) => {
    const n = (a.shiftNumber || 0) - (b.shiftNumber || 0);
    if (n !== 0) return n;
    return new Date(a.inTime || 0) - new Date(b.inTime || 0);
  });
}

function numOrZero(v) {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function minutesDiffer(stored, expected, tolerance = 0.5) {
  return Math.abs(numOrZero(stored) - numOrZero(expected)) > tolerance;
}

function boolDiffer(stored, expected) {
  return Boolean(stored) !== Boolean(expected);
}

function computeExpectedGrace(shift, dateStr, generalConfig, splitIdx, shiftGraceById) {
  const globalLateInGrace = generalConfig.late_in_grace_time ?? null;
  const globalEarlyOutGrace = generalConfig.early_out_grace_time ?? null;
  const shiftId = shift.shiftId?._id || shift.shiftId;
  const shiftGrace =
    shift.shiftId?.gracePeriod ??
    (shiftId ? shiftGraceById.get(String(shiftId)) : null) ??
    15;
  const startTime = shift.shiftStartTime;
  const endTime = shift.shiftEndTime;

  let expectedLateInMinutes = null;
  let expectedIsLateIn = false;
  if (shift.inTime && startTime && splitIdx === 0) {
    const late = calculateLateIn(shift.inTime, startTime, shiftGrace, dateStr, globalLateInGrace);
    if (late > 0) {
      expectedLateInMinutes = late;
      expectedIsLateIn = true;
    }
  }

  let expectedEarlyOutMinutes = null;
  let expectedIsEarlyOut = false;
  const status = String(shift.status || '').toUpperCase();
  if (shift.outTime && endTime && startTime && status !== 'HALF_DAY') {
    const early = calculateEarlyOut(
      shift.outTime,
      endTime,
      startTime,
      dateStr,
      globalEarlyOutGrace,
      shiftGrace
    );
    if (early != null && early > 0) {
      expectedEarlyOutMinutes = early;
      expectedIsEarlyOut = true;
    }
  }

  return {
    expectedLateInMinutes,
    expectedIsLateIn,
    expectedEarlyOutMinutes,
    expectedIsEarlyOut,
  };
}

function auditDailyGrace(daily, generalConfig, shiftGraceById) {
  const issues = [];
  const sorted = sortShifts(daily.shifts);
  sorted.forEach((shift, splitIdx) => {
    if (!shift.inTime && !shift.outTime) return;
    if (!shift.shiftStartTime || !shift.shiftEndTime) return;
    const exp = computeExpectedGrace(shift, daily.date, generalConfig, splitIdx, shiftGraceById);
    if (
      minutesDiffer(shift.lateInMinutes, exp.expectedLateInMinutes) ||
      boolDiffer(shift.isLateIn, exp.expectedIsLateIn) ||
      minutesDiffer(shift.earlyOutMinutes, exp.expectedEarlyOutMinutes) ||
      boolDiffer(shift.isEarlyOut, exp.expectedIsEarlyOut)
    ) {
      issues.push({
        shiftNumber: shift.shiftNumber || splitIdx + 1,
        shiftName: shift.shiftName || '-',
        stored: {
          isLateIn: shift.isLateIn,
          lateInMinutes: shift.lateInMinutes,
          isEarlyOut: shift.isEarlyOut,
          earlyOutMinutes: shift.earlyOutMinutes,
        },
        expected: {
          isLateIn: exp.expectedIsLateIn,
          lateInMinutes: exp.expectedLateInMinutes,
          isEarlyOut: exp.expectedIsEarlyOut,
          earlyOutMinutes: exp.expectedEarlyOutMinutes,
        },
      });
    }
  });
  return issues;
}

async function auditLateEarlyGrace(ctx, { onlyMismatches, limit }) {
  const { startDateStr, endDateStr } = ctx;
  const employees = await getScopedEmployees(ctx);
  const empNos = employees.map((e) => String(e.emp_no).trim().toUpperCase()).filter(Boolean);
  const empByNo = new Map(employees.map((e) => [String(e.emp_no).trim().toUpperCase(), e]));
  if (!empNos.length) return { checked: 0, flagged: 0, rows: [] };

  const settingsDoc = await Settings.findOne({}).lean();
  const generalConfig = settingsDoc?.attendance_settings || settingsDoc?.attendanceSettings || {};
  const shifts = await Shift.find({ isActive: { $ne: false } }).select('_id gracePeriod').lean();
  const shiftGraceById = new Map(shifts.map((s) => [String(s._id), s.gracePeriod]));

  const dailies = await AttendanceDaily.find({
    employeeNumber: { $in: empNos },
    date: { $gte: startDateStr, $lte: endDateStr },
    $or: [{ 'shifts.0': { $exists: true } }, { inTime: { $ne: null } }],
  })
    .select('employeeNumber date shifts inTime outTime')
    .lean();

  const cap = Math.min(dailies.length, limit || 2000);
  const rows = [];
  for (let i = 0; i < cap; i += 1) {
    const daily = dailies[i];
    const issues = auditDailyGrace(daily, generalConfig, shiftGraceById);
    if (!issues.length) {
      if (!onlyMismatches) continue;
      continue;
    }
    const emp = empByNo.get(String(daily.employeeNumber).trim().toUpperCase());
    rows.push(
      rowBase(emp, {
        date: daily.date,
        issueCount: issues.length,
        shiftIssues: issues,
        flagged: true,
      })
    );
    if (rows.length >= (limit || 500)) break;
  }

  return {
    checked: cap,
    flagged: rows.length,
    totalDailies: dailies.length,
    truncated: dailies.length > cap,
    rows,
  };
}

const RUNNERS = {
  leave_integrity: auditLeaveIntegrity,
  summary_vs_payregister: auditSummaryVsPayregister,
  missing_summaries: auditMissingSummaries,
  period_totals_mismatch: auditPeriodTotalsMismatch,
  paid_lop_split: auditPaidLopSplit,
  summary_stale: auditSummaryStale,
  leave_od_conflict: auditLeaveOdConflict,
  late_early_grace: auditLateEarlyGrace,
};

async function runAttendanceAudit(options) {
  const {
    type,
    month,
    divisionIds = [],
    departmentIds = [],
    empNos = [],
    onlyMismatches = true,
    limit = 500,
    scopeFilter = {},
  } = options;

  const auditMeta = AUDIT_TYPES.find((t) => t.code === type);
  if (!auditMeta) {
    throw new Error(`Unknown audit type: ${type}`);
  }

  const period = await resolvePeriod(month);
  const ctx = {
    ...period,
    scopeFilter,
    divisionIds,
    departmentIds,
    empNos,
  };

  const runner = RUNNERS[type];
  const result = await runner(ctx, { onlyMismatches, limit });

  return {
    auditType: type,
    label: auditMeta.label,
    month,
    period: { start: period.startDateStr, end: period.endDateStr },
    onlyMismatches,
    ...result,
  };
}

module.exports = {
  AUDIT_TYPES,
  runAttendanceAudit,
  resolvePeriod,
};
