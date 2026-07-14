/**
 * Side-by-side attendance monthly view vs pay register — matches attendance page display.
 */

const mongoose = require('mongoose');
const Employee = require('../../employees/model/Employee');
const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
const AttendanceDaily = require('../model/AttendanceDaily');
const { getMonthlyTableViewData } = require('./attendanceViewService');
const { getProcessingModeForEmployee } = require('./processingModeResolutionService');
const { payRegisterAllRowFromSummary } = require('../../shared/payRegisterAllRow');
const { getBaseDisplayStatus, buildSplitCellStatus } = require('../utils/pdfDayCellText');
const { resolvePeriod } = require('./attendanceAuditService');
const { getAllDatesInRange } = require('../../shared/utils/dateUtils');
const {
  mergeScopeWithEmployeeClauses,
  buildLeftDuringPeriodOrClause,
} = require('./attendanceEmployeeQuery');
const { parseQueryIdList } = require('../../pay-register/services/payRegisterEmployeeFilter');

const PR_STATUS_SHORT = {
  present: 'P',
  absent: 'A',
  leave: 'L',
  od: 'OD',
  holiday: 'H',
  week_off: 'WO',
  partial: 'PT',
  blank: '-',
};

/** Attendance half codes → pay-register half equivalent (P/PT/HD = worked = present). */
const HALF_EQUIV = {
  P: 'P',
  PT: 'P',
  HD: 'P',
  L: 'L',
  LL: 'L',
  OD: 'OD',
  H: 'H',
  WO: 'WO',
  A: 'A',
  '-': '-',
};

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

function normToken(cell) {
  return String(cell || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function toPrHalfEquiv(code) {
  const c = normToken(code);
  return HALF_EQUIV[c] || c;
}

function getAttendanceHalves(record) {
  if (!record) return { first: 'A', second: 'A' };
  const st = String(record.status || '');
  if (st === '' || st === '-') return { first: st || '-', second: st || '-' };
  const split = buildSplitCellStatus(record);
  if (split) return { first: split.top, second: split.bottom };
  const cell = getBaseDisplayStatus(record);
  return { first: cell, second: cell };
}

function getPayRegisterHalves(dr) {
  if (!dr) return { first: 'A', second: 'A' };
  if (dr.firstHalf || dr.secondHalf) {
    const first = PR_STATUS_SHORT[String(dr.firstHalf?.status || '').toLowerCase()] || '-';
    const second = PR_STATUS_SHORT[String(dr.secondHalf?.status || '').toLowerCase()] || '-';
    return { first, second };
  }
  const cell = PR_STATUS_SHORT[String(dr.status || '').toLowerCase()] || 'A';
  return { first: cell, second: cell };
}

function formatAttendanceDayCell(record) {
  const { first, second } = getAttendanceHalves(record);
  if (first === second) return first;
  return `${first}/${second}`;
}

function formatPayRegisterDayCell(dr) {
  const { first, second } = getPayRegisterHalves(dr);
  if (first === second) return first;
  return `${first}/${second}`;
}

function halvesMismatch(attHalves, prHalves) {
  const a1 = toPrHalfEquiv(attHalves.first);
  const a2 = toPrHalfEquiv(attHalves.second);
  const p1 = toPrHalfEquiv(prHalves.first);
  const p2 = toPrHalfEquiv(prHalves.second);
  if (a1 === p1 && a2 === p2) return false;
  const absentish = new Set(['A', '-', '']);
  if (absentish.has(a1) && absentish.has(p1) && absentish.has(a2) && absentish.has(p2)) return false;
  return true;
}

function mapAttendanceEdits(record) {
  if (!record) return [];
  const edits = [];
  if (record.isEdited) {
    edits.push({ source: 'attendance', type: 'manual', label: 'Manually edited day' });
  }
  for (const h of record.editHistory || []) {
    edits.push({
      source: 'attendance',
      type: h.action || 'edit',
      label: h.action || 'Edit',
      details: h.details || null,
      by: h.modifiedByName || null,
      at: h.modifiedAt || null,
    });
  }
  return edits;
}

function mapPayRegisterEditsForDate(editHistory, dateStr) {
  if (!Array.isArray(editHistory)) return [];
  return editHistory
    .filter((e) => e && e.date === dateStr)
    .map((e) => ({
      source: 'pay_register',
      type: e.field || 'edit',
      label: e.field || 'Field edit',
      oldValue: e.oldValue,
      newValue: e.newValue,
      by: e.editedByName || null,
      role: e.editedByRole || null,
      at: e.editedAt || null,
      remarks: e.remarks || null,
    }));
}

function buildAttendanceSummaryColumns(summary, processingMode) {
  const prRow = payRegisterAllRowFromSummary(summary, processingMode);
  const s = summary || {};
  if (processingMode === 'single_shift') {
    return {
      present: prRow.present,
      weekOffs: prRow.weekOffs,
      holidays: prRow.holidays,
      paidLeaves: prRow.paidLeaves,
      lop: prRow.dedLop,
      od: prRow.od,
      absent: prRow.absent,
      totalDaysSummed: prRow.totalDaysSummed,
      periodDays: round2(s.totalDaysInMonth),
      lates: prRow.lates,
      dedAbsent: prRow.dedAbsent,
      attDed: prRow.attDed,
      paidDays: prRow.paidDays,
      payableShifts: round2(s.totalPayableShifts),
    };
  }
  return {
    present: round2(s.totalPresentDays),
    weekOffs: round2(s.totalWeeklyOffs),
    holidays: round2(s.totalHolidays),
    leaves: round2(s.totalLeaves),
    paidLeaves: round2(s.totalPaidLeaves),
    lop: round2(s.totalLopLeaves),
    od: round2(s.totalODs),
    absent: round2(s.totalAbsentDays),
    partial: round2(s.totalPartialDays),
    totalDaysSummed: prRow.totalDaysSummed,
    periodDays: round2(s.totalDaysInMonth),
    lates: prRow.lates,
    attDed: prRow.attDed,
    payableShifts: round2(s.totalPayableShifts),
    otHours: round2(s.totalOTHours),
    extraHours: round2(s.totalExtraHours),
    permissions: Number(s.totalPermissionCount) || 0,
    permissionDeductionDays: round2(s.totalPermissionDeductionDays),
  };
}

function buildPayRegisterSummaryColumns(totals, prDoc, processingMode) {
  const t = totals || {};
  const present = round2(
    t.totalPresentDays ?? (Number(t.presentDays) || 0) + (Number(t.presentHalfDays) || 0) * 0.5
  );
  const absent = round2(
    t.totalAbsentDays ?? (Number(t.absentDays) || 0) + (Number(t.absentHalfDays) || 0) * 0.5
  );
  const leaves = round2(
    t.totalLeaveDays != null
      ? Number(t.totalLeaveDays)
      : (Number(t.totalPaidLeaveDays) || 0) +
          (Number(t.totalUnpaidLeaveDays) || 0) +
          (Number(t.paidLeaveDays) || 0) +
          (Number(t.unpaidLeaveDays) || 0)
  );
  const paidLeaves = round2(t.totalPaidLeaveDays ?? t.paidLeaveDays);
  const lop = round2(t.totalLopDays ?? t.lopDays);
  const od = round2(t.totalODDays ?? t.odDays);
  const weekOffs = round2(t.totalWeeklyOffs);
  const holidays = round2(t.totalHolidays);
  const lates = (Number(t.lateCount) || 0) + (Number(t.earlyOutCount) || 0);
  const attDed = round2(prDoc?.totalAttendanceDeductionDays);
  const payableShifts = round2(t.totalPayableShifts);
  const totalDaysSummed = round2(present + weekOffs + holidays + leaves + od + absent);
  const paidDays = Math.max(0, round2(present + weekOffs + holidays + od + paidLeaves - attDed));

  if (processingMode === 'single_shift') {
    return {
      present,
      weekOffs,
      holidays,
      paidLeaves,
      lop,
      od,
      absent,
      totalDaysSummed,
      periodDays: round2(prDoc?.totalDaysInMonth),
      lates,
      dedAbsent: absent,
      attDed,
      paidDays,
      payableShifts,
    };
  }
  return {
    present,
    weekOffs,
    holidays,
    leaves,
    paidLeaves,
    lop,
    od,
    absent,
    partial: 0,
    totalDaysSummed,
    periodDays: round2(prDoc?.totalDaysInMonth),
    lates,
    attDed,
    payableShifts,
    otHours: round2(t.totalOTHours),
    extraHours: 0,
    permissions: Number(prDoc?.totalPermissionCount) || 0,
    permissionDeductionDays: round2(prDoc?.totalPermissionDeductionDays),
  };
}

function summaryKeysForMode(mode) {
  if (mode === 'single_shift') {
    return [
      'present',
      'weekOffs',
      'holidays',
      'paidLeaves',
      'lop',
      'od',
      'absent',
      'totalDaysSummed',
      'periodDays',
      'lates',
      'attDed',
      'paidDays',
    ];
  }
  return [
    'present',
    'weekOffs',
    'holidays',
    'leaves',
    'paidLeaves',
    'lop',
    'od',
    'absent',
    'partial',
    'totalDaysSummed',
    'periodDays',
    'lates',
    'attDed',
    'payableShifts',
  ];
}

function summaryFieldDiffs(attCols, prCols, processingMode) {
  const keys = summaryKeysForMode(processingMode);
  const diffs = [];
  for (const k of keys) {
    const a = round2(attCols[k]);
    const p = round2(prCols[k]);
    if (Math.abs(a - p) > 0.009) {
      diffs.push({ field: k, attendance: a, payRegister: p, delta: round2(p - a) });
    }
  }
  return diffs;
}

function buildComparePayload({
  employee,
  monthlyRow,
  payRegister,
  dailies,
  processingMode,
  startDateStr,
  endDateStr,
  monthStr,
}) {
  const dailyAttendance = monthlyRow?.dailyAttendance || {};
  const summary = monthlyRow?.summary || null;
  const dates = getAllDatesInRange(startDateStr, endDateStr);
  const prByDate = new Map((payRegister?.dailyRecords || []).map((d) => [d.date, d]));
  const dailyEditByDate = new Map((dailies || []).map((d) => [d.date, d]));

  const dayComparisons = dates.map((dateStr) => {
    const attRecord = dailyAttendance[dateStr] || null;
    const prRecord = prByDate.get(dateStr) || null;
    const attHalves = getAttendanceHalves(attRecord);
    const prHalves = getPayRegisterHalves(prRecord);
    const attendanceEdits = mapAttendanceEdits(attRecord || dailyEditByDate.get(dateStr));
    const payRegisterEdits = mapPayRegisterEditsForDate(payRegister?.editHistory, dateStr);
    return {
      date: dateStr,
      attendanceCell: formatAttendanceDayCell(attRecord),
      payRegisterCell: formatPayRegisterDayCell(prRecord),
      attendanceHalves: attHalves,
      payRegisterHalves: prHalves,
      mismatch: halvesMismatch(attHalves, prHalves),
      isConflict: Boolean(attRecord?.isConflict),
      attendanceEdits,
      payRegisterEdits,
      hasEdits: attendanceEdits.length > 0 || payRegisterEdits.length > 0,
    };
  });

  const attendanceSummary = buildAttendanceSummaryColumns(summary, processingMode);
  const payRegisterSummary = buildPayRegisterSummaryColumns(payRegister?.totals, payRegister, processingMode);
  const summaryDiffs = summaryFieldDiffs(attendanceSummary, payRegisterSummary, processingMode);

  const payRegisterEditsAll = (payRegister?.editHistory || []).map((e) => ({
    source: 'pay_register',
    date: e.date,
    field: e.field,
    oldValue: e.oldValue,
    newValue: e.newValue,
    by: e.editedByName || null,
    role: e.editedByRole || null,
    at: e.editedAt || null,
    remarks: e.remarks || null,
  }));

  const attendanceEditsAll = (dailies || [])
    .filter((d) => d.isEdited || (d.editHistory && d.editHistory.length))
    .map((d) => ({
      date: d.date,
      isEdited: Boolean(d.isEdited),
      edits: mapAttendanceEdits(d),
    }));

  const mismatchDayCount = dayComparisons.filter((d) => d.mismatch).length;
  const editDayCount = dayComparisons.filter((d) => d.hasEdits).length;
  const flagged =
    !payRegister ||
    summaryDiffs.length > 0 ||
    mismatchDayCount > 0 ||
    editDayCount > 0 ||
    dayComparisons.some((d) => d.isConflict);

  return {
    employee: {
      _id: String(employee._id),
      emp_no: employee.emp_no,
      employee_name: employee.employee_name,
      division: employee.division_id?.name || '',
      department: employee.department_id?.name || '',
      designation: employee.designation_id?.name || employee.designation_id?.title || '',
    },
    month: monthStr,
    period: { start: startDateStr, end: endDateStr },
    processingMode,
    hasPayRegister: Boolean(payRegister),
    summaryLocked: Boolean(payRegister?.summaryLocked),
    dates,
    dayComparisons,
    mismatchDayCount,
    editDayCount,
    rows: {
      attendance: {
        label: 'Attendance (monthly view)',
        summary: attendanceSummary,
        edits: attendanceEditsAll,
      },
      payRegister: {
        label: 'Pay register',
        summary: payRegisterSummary,
        edits: payRegisterEditsAll,
        lastEditedAt: payRegister?.lastEditedAt || null,
      },
    },
    summaryDiffs,
    flagged,
  };
}

function buildEmployeeScopeFilter({ scopeFilter, divisionIds, departmentIds, empNos, startDateStr, endDateStr }) {
  const extra = [];
  if (divisionIds?.length) {
    extra.push({
      division_id: { $in: divisionIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
    });
  }
  if (departmentIds?.length) {
    extra.push({
      department_id: { $in: departmentIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
    });
  }
  if (empNos?.length) {
    extra.push({ emp_no: { $in: empNos.map((e) => String(e).trim().toUpperCase()) } });
  }
  const leftClause = buildLeftDuringPeriodOrClause(startDateStr, endDateStr);
  return mergeScopeWithEmployeeClauses(mergeScopeWithEmployeeClauses(scopeFilter, extra), [leftClause]);
}

async function getEmployeeAuditCompare(employeeId, monthStr, scopeFilter = {}) {
  const { year, monthNumber, startDateStr, endDateStr } = await resolvePeriod(monthStr);

  const employee = await Employee.findOne({ ...scopeFilter, _id: employeeId })
    .select('_id emp_no employee_name division_id department_id designation_id')
    .populate('division_id', 'name')
    .populate('department_id', 'name')
    .populate('designation_id', 'name title')
    .lean();

  if (!employee) throw new Error('Employee not found or access denied');

  const [monthlyRows, payRegister, dailies, processingMode] = await Promise.all([
    getMonthlyTableViewData([employee], year, monthNumber, startDateStr, endDateStr, {
      mode: 'complete',
      includeContributingDates: true,
    }),
    PayRegisterSummary.findOne({ employeeId: employee._id, month: monthStr })
      .select(
        'dailyRecords totals editHistory totalDaysInMonth summaryLocked lastEditedAt totalAttendanceDeductionDays totalPermissionCount totalPermissionDeductionDays'
      )
      .lean(),
    AttendanceDaily.find({
      employeeNumber: String(employee.emp_no).trim().toUpperCase(),
      date: { $gte: startDateStr, $lte: endDateStr },
    })
      .select('date isEdited editHistory status')
      .lean(),
    getProcessingModeForEmployee(employee).then((pm) => pm?.mode || 'multi_shift'),
  ]);

  return buildComparePayload({
    employee,
    monthlyRow: monthlyRows?.[0] || null,
    payRegister,
    dailies,
    processingMode,
    startDateStr,
    endDateStr,
    monthStr,
  });
}

async function getAttendanceAuditOverview(options) {
  const {
    month: monthStr,
    scopeFilter = {},
    divisionIds = [],
    departmentIds = [],
    empNos = [],
    onlyIssues = true,
    limit = 50,
    page = 1,
  } = options;

  const { year, monthNumber, startDateStr, endDateStr } = await resolvePeriod(monthStr);
  const filter = buildEmployeeScopeFilter({
    scopeFilter,
    divisionIds,
    departmentIds,
    empNos,
    startDateStr,
    endDateStr,
  });

  const employees = await Employee.find(filter)
    .select('_id emp_no employee_name division_id department_id designation_id')
    .populate('division_id', 'name')
    .populate('department_id', 'name')
    .populate('designation_id', 'name title')
    .sort({ emp_no: 1 })
    .lean();

  if (!employees.length) {
    return {
      month: monthStr,
      period: { start: startDateStr, end: endDateStr },
      total: 0,
      shown: 0,
      flagged: 0,
      employees: [],
    };
  }

  const empIds = employees.map((e) => e._id);
  const empNosList = employees.map((e) => String(e.emp_no).trim().toUpperCase());

  // ── Parallel fetch: monthly data + pay registers + edited dailies + processing modes ──
  const [monthlyRows, payRegisters, dailies, processingModes] = await Promise.all([
    getMonthlyTableViewData(employees, year, monthNumber, startDateStr, endDateStr, {
      mode: 'complete',
      includeContributingDates: true,
    }),
    PayRegisterSummary.find({ month: monthStr, employeeId: { $in: empIds } })
      .select(
        'employeeId dailyRecords totals editHistory totalDaysInMonth summaryLocked lastEditedAt totalAttendanceDeductionDays totalPermissionCount totalPermissionDeductionDays'
      )
      .lean(),
    AttendanceDaily.find({
      employeeNumber: { $in: empNosList },
      date: { $gte: startDateStr, $lte: endDateStr },
      $or: [{ isEdited: true }, { 'editHistory.0': { $exists: true } }],
    })
      .select('employeeNumber date isEdited editHistory status')
      .lean(),
    // Resolve processing mode for ALL employees in parallel instead of serially
    Promise.all(employees.map((emp) => getProcessingModeForEmployee(emp))),
  ]);

  const prByEmp = new Map(payRegisters.map((p) => [String(p.employeeId), p]));
  const monthlyByEmp = new Map(monthlyRows.map((r) => [String(r.employee._id), r]));

  const dailiesByEmpNo = new Map();
  for (const d of dailies) {
    const k = String(d.employeeNumber).trim().toUpperCase();
    if (!dailiesByEmpNo.has(k)) dailiesByEmpNo.set(k, []);
    dailiesByEmpNo.get(k).push(d);
  }

  const compares = [];
  let flaggedCount = 0;

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const eid = String(emp._id);
    const processingMode = processingModes[i]?.mode || 'multi_shift';
    const payload = buildComparePayload({
      employee: emp,
      monthlyRow: monthlyByEmp.get(eid) || null,
      payRegister: prByEmp.get(eid) || null,
      dailies: dailiesByEmpNo.get(String(emp.emp_no).trim().toUpperCase()) || [],
      processingMode,
      startDateStr,
      endDateStr,
      monthStr,
    });
    if (payload.flagged) flaggedCount += 1;
    if (!onlyIssues || payload.flagged) compares.push(payload);
  }

  compares.sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    return String(a.employee.emp_no).localeCompare(String(b.employee.emp_no), 'en');
  });

  const cap = Math.max(parseInt(String(limit), 10) || 50, 1);
  const totalFiltered = compares.length;
  const totalPages = Math.ceil(totalFiltered / cap);
  const startIndex = (page - 1) * cap;
  const paginatedCompares = compares.slice(startIndex, startIndex + cap);

  return {
    month: monthStr,
    period: { start: startDateStr, end: endDateStr },
    total: employees.length,
    totalFiltered,
    flagged: flaggedCount,
    shown: paginatedCompares.length,
    page,
    totalPages,
    limit: cap,
    onlyIssues,
    employees: paginatedCompares,
  };
}

function parseOverviewQuery(query) {
  const divisionIds = parseQueryIdList(query.divisionIds ?? query.division);
  const departmentIds = parseQueryIdList(query.departmentIds ?? query.department);
  const empNos = query.empNos
    ? String(query.empNos)
        .split(/[,;\s]+/)
        .map((e) => e.trim().toUpperCase())
        .filter(Boolean)
    : [];
  const onlyIssues = query.onlyIssues !== '0' && query.onlyIssues !== 'false';
  const limit = parseInt(String(query.limit || 50), 10) || 50;
  const page = parseInt(String(query.page || 1), 10) || 1;
  return { divisionIds, departmentIds, empNos, onlyIssues, limit, page };
}

module.exports = {
  getEmployeeAuditCompare,
  getAttendanceAuditOverview,
  parseOverviewQuery,
  summaryKeysForMode,
};
