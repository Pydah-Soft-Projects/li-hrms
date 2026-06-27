const AttendanceDaily = require('../model/AttendanceDaily');
const AttendanceRawLog = require('../model/AttendanceRawLog');
const Leave = require('../../leaves/model/Leave');
const OD = require('../../leaves/model/OD');
const OT = require('../../overtime/model/OT');
const { getMergedOtConfig } = require('../../overtime/services/otConfigResolver');
const { applyOtHoursPolicy } = require('../../overtime/services/otHoursPolicyService');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../../shared/utils/dateUtils');
const { normalizeViewMode } = require('./monthlyAttendanceQueryService');
const dateCycleService = require('../../leaves/services/dateCycleService');
const { filterMonthlySummaryForEmploymentBounds } = require('./employmentBoundsSummaryFilter');
const { buildAttendanceLeaveInfoForDate } = require('../../shared/utils/leaveDayRangeUtils');

function getSegmentCumulativeExtraHours(record) {
  const shifts = Array.isArray(record?.shifts) ? record.shifts : [];
  if (!shifts.length) return 0;
  const total = shifts.reduce((sum, s) => sum + (Number(s?.extraHours) || 0), 0);
  return Math.round(total * 100) / 100;
}

const DAILY_SELECT_BY_TIER = {
  minimal:
    'employeeNumber date status totalLateInMinutes totalEarlyOutMinutes isEdited rosterFirstHalfNonWorking rosterSecondHalfNonWorking',
  compact:
    'employeeNumber date status totalWorkingHours totalLateInMinutes totalEarlyOutMinutes totalExpectedHours totalOTHours extraHours permissionHours permissionCount permissionDeduction payableShifts isEdited source policyMeta rosterFirstHalfNonWorking rosterSecondHalfNonWorking shifts',
  full:
    'employeeNumber date status shifts totalWorkingHours totalLateInMinutes totalEarlyOutMinutes totalExpectedHours totalOTHours extraHours permissionHours permissionCount permissionDeduction notes earlyOutDeduction isEdited editHistory policyMeta payableShifts rosterFirstHalfNonWorking rosterSecondHalfNonWorking source',
};

function normalizeEmpNoKey(empNo) {
  return String(empNo || '').trim().toUpperCase();
}

function buildSummaryLookupMaps(summaries) {
  const byEmployeeId = new Map();
  const byEmpNo = new Map();
  for (const row of summaries || []) {
    if (row?.employeeId) byEmployeeId.set(String(row.employeeId), row);
    const key = normalizeEmpNoKey(row?.emp_no);
    if (key) byEmpNo.set(key, row);
  }
  return { byEmployeeId, byEmpNo };
}

function resolveStoredSummary(emp, lookup) {
  if (!emp) return null;
  return lookup.byEmployeeId.get(String(emp._id)) || lookup.byEmpNo.get(normalizeEmpNoKey(emp.emp_no)) || null;
}

function toListSummary(summary, employee, includeContributingDates) {
  if (!summary) return null;
  const filtered = filterMonthlySummaryForEmploymentBounds(summary, employee);
  if (!filtered) return null;
  if (includeContributingDates) return filtered;
  if (!filtered.contributingDates) return filtered;
  const { contributingDates, ...rest } =
    typeof filtered.toObject === 'function' ? filtered.toObject() : { ...filtered };
  return rest;
}

function compactLeaveInfo(leaveInfo) {
  if (!leaveInfo) return null;
  return {
    leaveId: leaveInfo.leaveId,
    leaveType: leaveInfo.leaveType,
    leaveNature: leaveInfo.leaveNature,
    isHalfDay: leaveInfo.isHalfDay,
    halfDayType: leaveInfo.halfDayType,
    numberOfDays: leaveInfo.numberOfDays,
    segmentDaysOnDate: leaveInfo.segmentDaysOnDate,
    purpose: leaveInfo.purpose,
  };
}

function compactOdInfo(odInfo, full = false) {
  if (!odInfo) return null;
  const base = {
    odId: odInfo.odId,
    odType: odInfo.odType,
    odType_extended: odInfo.odType_extended,
    isHalfDay: odInfo.isHalfDay,
    halfDayType: odInfo.halfDayType,
    purpose: odInfo.purpose,
    reason: odInfo.reason,
    durationHours:
      odInfo.durationHours != null && !Number.isNaN(Number(odInfo.durationHours))
        ? Math.round(Number(odInfo.durationHours) * 100) / 100
        : odInfo.durationHours,
  };
  if (!full) return base;
  return {
    ...base,
    odStartTime: odInfo.odStartTime,
    odEndTime: odInfo.odEndTime,
    placeVisited: odInfo.placeVisited,
    photo: odInfo.photo,
  };
}

function slimShiftForTable(shift) {
  if (!shift) return null;
  const sid = shift.shiftId;
  const shiftMeta =
    sid && typeof sid === 'object'
      ? { _id: sid._id, name: sid.name, startTime: sid.startTime, endTime: sid.endTime, duration: sid.duration }
      : sid;
  return {
    _id: shift._id,
    shiftId: shiftMeta,
    inTime: shift.inTime,
    outTime: shift.outTime,
    status: shift.status,
    workingHours: shift.workingHours,
    otHours: shift.otHours,
    extraHours: shift.extraHours,
    earlyOutMinutes: shift.earlyOutMinutes,
    lateInMinutes: shift.lateInMinutes,
    payableShift: shift.payableShift,
    shiftSegments: shift.shiftSegments,
  };
}

async function loadOtConfigByDeptDiv(employees) {
  const cache = new Map();
  const keys = new Set();
  for (const emp of employees) {
    const deptId = emp.department_id?._id || emp.department_id || '';
    const divId = emp.division_id?._id || emp.division_id || '';
    keys.add(`${deptId}:${divId}`);
  }
  await Promise.all(
    [...keys].map(async (key) => {
      const sep = key.indexOf(':');
      const deptPart = key.slice(0, sep);
      const divPart = key.slice(sep + 1);
      cache.set(key, await getMergedOtConfig(deptPart || null, divPart || null));
    })
  );
  const byEmpNo = {};
  for (const emp of employees) {
    const empKey = normalizeEmpNoKey(emp.emp_no);
    if (!empKey) continue;
    const deptId = emp.department_id?._id || emp.department_id || '';
    const divId = emp.division_id?._id || emp.division_id || '';
    byEmpNo[empKey] = cache.get(`${deptId}:${divId}`) || null;
  }
  return byEmpNo;
}

function modeNeeds(mode) {
  const m = normalizeViewMode(mode);
  return {
    leaves: ['complete', 'present_absent', 'leaves', 'export'].includes(m),
    od: ['complete', 'present_absent', 'od', 'export'].includes(m),
    ot: ['complete', 'ot', 'export'].includes(m),
    otConfig: ['complete', 'ot', 'export'].includes(m),
    shifts: ['in_out', 'complete', 'export'].includes(m),
    tier:
      m === 'export'
        ? 'full'
        : m === 'in_out' || m === 'complete' || m === 'ot'
          ? 'compact'
          : 'minimal',
    fullCells: m === 'export',
  };
}

function resolveWorkedHoursForCompleteCell(record) {
  const hours = record?.totalWorkingHours;
  if (hours == null || Number(hours) <= 0) return null;
  return hours;
}

function resolveSandwichDisplayStatus(record) {
  const sandwich = record?.policyMeta?.sandwichRule;
  if (!sandwich?.applied) return null;
  if (sandwich.effect === 'strip_non_working_add_lop') return 'LEAVE';
  if (
    sandwich.effect === 'strip_non_working' ||
    String(sandwich.effect || '').includes('strip')
  ) {
    return 'ABSENT';
  }
  return null;
}

function resolveDayStatus(ctx) {
  const {
    dateStr,
    record,
    leaveInfo,
    odInfo,
    dojStr,
    leftDateStr,
    todayStr,
    isEsiLeaveDay,
    hasLeave,
    hasOD,
  } = ctx;
  const isBeforeJoining = dojStr && dateStr < dojStr;
  const isAfterResignation = leftDateStr && dateStr > leftDateStr;
  const isFutureDate = dateStr > todayStr;
  if (isBeforeJoining || isAfterResignation) return { status: '', skip: true };
  if (isFutureDate) return { status: '-' };
  if (isEsiLeaveDay) return { status: 'LEAVE' };
  const sandwichStatus = resolveSandwichDisplayStatus(record);
  if (sandwichStatus) return { status: sandwichStatus };
  if (record?.status) return { status: record.status };
  if (hasLeave) return { status: 'LEAVE' };
  if (hasOD) return { status: 'OD' };
  return { status: 'ABSENT' };
}

function buildDailyCell(mode, ctx) {
  const needs = modeNeeds(mode);
  const {
    dateStr,
    record,
    leaveInfo,
    odInfo,
    hasLeave,
    hasOD,
    isEsiLeaveDay,
    isConflict,
    approvedOtForDate,
    mergedPolicyForEmp,
  } = ctx;
  const statusInfo = resolveDayStatus(ctx);
  if (statusInfo.skip) return null;

  const m = normalizeViewMode(mode);
  const status = statusInfo.status;
  const base = {
    date: dateStr,
    status,
    hasLeave,
    hasOD,
    isConflict: isEsiLeaveDay ? false : isConflict,
    isEsiLeaveDay,
  };

  if (m === 'present_absent') {
    return {
      ...base,
      isLateIn: (record?.totalLateInMinutes || 0) > 0,
      isEarlyOut: (record?.totalEarlyOutMinutes || 0) > 0,
      leaveInfo: hasLeave ? compactLeaveInfo(leaveInfo) : null,
      odInfo: hasOD ? compactOdInfo(odInfo) : null,
      isEdited: record?.isEdited || false,
    };
  }

  if (m === 'leaves') {
    return {
      ...base,
      leaveInfo: hasLeave ? compactLeaveInfo(leaveInfo) : null,
      hasLeave,
    };
  }

  if (m === 'od') {
    return {
      ...base,
      odInfo: hasOD ? compactOdInfo(odInfo) : null,
      hasOD,
    };
  }

  if (m === 'in_out') {
    const shifts = Array.isArray(record?.shifts) ? record.shifts.map(slimShiftForTable).filter(Boolean) : [];
    return {
      ...base,
      shifts,
      shiftId: shifts[0]?.shiftId || null,
      totalHours: record?.totalWorkingHours ?? null,
      isLateIn: (record?.totalLateInMinutes || 0) > 0,
      isEarlyOut: (record?.totalEarlyOutMinutes || 0) > 0,
    };
  }

  if (m === 'ot') {
    const segmentExtra = getSegmentCumulativeExtraHours(record);
    const slabPreview =
      !approvedOtForDate && segmentExtra > 0 && mergedPolicyForEmp
        ? applyOtHoursPolicy(segmentExtra, mergedPolicyForEmp)
        : null;
    return {
      ...base,
      otHours: approvedOtForDate?.considered ?? Math.max(record?.otHours || 0, record?.totalOTHours || 0),
      otActualHours: approvedOtForDate?.actual ?? 0,
      otSlabHours:
        approvedOtForDate?.considered ??
        (slabPreview?.eligible ? Number(slabPreview.finalHours) || 0 : 0),
      extraHours: record?.extraHours || 0,
    };
  }

  if (m === 'export') {
    const segmentExtra = getSegmentCumulativeExtraHours(record);
    const slabPreview =
      !approvedOtForDate && segmentExtra > 0 && mergedPolicyForEmp
        ? applyOtHoursPolicy(segmentExtra, mergedPolicyForEmp)
        : null;
    const shifts = Array.isArray(record?.shifts) ? record.shifts.map(slimShiftForTable).filter(Boolean) : [];
    return {
      ...base,
      totalHours: record?.totalWorkingHours ?? null,
      lateInMinutes: record?.totalLateInMinutes || 0,
      earlyOutMinutes: record?.totalEarlyOutMinutes || 0,
      isLateIn: (record?.totalLateInMinutes || 0) > 0,
      isEarlyOut: (record?.totalEarlyOutMinutes || 0) > 0,
      shiftId: shifts[0]?.shiftId || null,
      shifts,
      expectedHours: record?.totalExpectedHours || shifts[0]?.shiftId?.duration || 0,
      otHours: approvedOtForDate?.considered ?? Math.max(record?.otHours || 0, record?.totalOTHours || 0),
      otActualHours: approvedOtForDate?.actual ?? 0,
      otSlabHours:
        approvedOtForDate?.considered ??
        (slabPreview?.eligible ? Number(slabPreview.finalHours) || 0 : 0),
      extraHours: record?.extraHours || 0,
      payableShifts: record?.payableShifts || 0,
      permissionHours: record?.permissionHours || 0,
      permissionCount: record?.permissionCount || 0,
      permissionDeduction: record?.permissionDeduction || 0,
      leaveInfo: hasLeave ? leaveInfo : null,
      odInfo: hasOD ? compactOdInfo(odInfo, true) : null,
      isEdited: record?.isEdited || false,
      editHistory: record?.editHistory || [],
      source: record?.source || [],
      notes: record?.notes || '',
      rosterFirstHalfNonWorking: record?.rosterFirstHalfNonWorking || null,
      rosterSecondHalfNonWorking: record?.rosterSecondHalfNonWorking || null,
    };
  }

  // complete — at-a-glance day cell (shift, hours, late/early, edit flag) + summary inputs
  const shifts = Array.isArray(record?.shifts) ? record.shifts.map(slimShiftForTable).filter(Boolean) : [];
  const segmentExtra = getSegmentCumulativeExtraHours(record);
  const slabPreview =
    !approvedOtForDate && segmentExtra > 0 && mergedPolicyForEmp
      ? applyOtHoursPolicy(segmentExtra, mergedPolicyForEmp)
      : null;
  const sandwichApplied = !!record?.policyMeta?.sandwichRule?.applied;
  return {
    ...base,
    totalHours: resolveWorkedHoursForCompleteCell(record),
    lateInMinutes: record?.totalLateInMinutes || 0,
    earlyOutMinutes: record?.totalEarlyOutMinutes || 0,
    isLateIn: (record?.totalLateInMinutes || 0) > 0,
    isEarlyOut: (record?.totalEarlyOutMinutes || 0) > 0,
    shiftId: shifts[0]?.shiftId || null,
    shifts,
    expectedHours:
      record?.totalExpectedHours ||
      (shifts[0]?.shiftId && typeof shifts[0].shiftId === 'object' ? shifts[0].shiftId.duration : 0),
    leaveInfo: hasLeave ? compactLeaveInfo(leaveInfo) : null,
    odInfo: hasOD ? compactOdInfo(odInfo) : null,
    otHours: approvedOtForDate?.considered ?? Math.max(record?.otHours || 0, record?.totalOTHours || 0),
    otActualHours: approvedOtForDate?.actual ?? 0,
    otSlabHours:
      approvedOtForDate?.considered ??
      (slabPreview?.eligible ? Number(slabPreview.finalHours) || 0 : 0),
    extraHours: record?.extraHours || 0,
    permissionCount: record?.permissionCount || 0,
    payableShifts: record?.payableShifts || 0,
    isEdited: record?.isEdited || false,
    source: record?.source || [],
    policyMeta: record?.policyMeta || null,
    rosterFirstHalfNonWorking: sandwichApplied ? null : record?.rosterFirstHalfNonWorking || null,
    rosterSecondHalfNonWorking: sandwichApplied ? null : record?.rosterSecondHalfNonWorking || null,
  };
}

/**
 * Get attendance data for calendar view (Single Employee)
 */
exports.getCalendarViewData = async (employee, year, month) => {
  const targetYear = parseInt(year);
  const targetMonth = parseInt(month);

  // Resolve the payroll period using dateCycleService
  // Use 15th of the month as anchor to find the period that covers/ends in this month
  const anchorDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-15`;
  const periodInfo = await dateCycleService.getPeriodInfo(new Date(anchorDateStr));
  
  const startDateStr = extractISTComponents(periodInfo.payrollCycle.startDate).dateStr;
  const endDateStr = extractISTComponents(periodInfo.payrollCycle.endDate).dateStr;

  // Fetch attendance records for the month
  const records = await AttendanceDaily.find({
    employeeNumber: employee.emp_no,
    date: { $gte: startDateStr, $lte: endDateStr },
  })
    .populate('shifts.shiftId', 'name startTime endTime duration payableShifts')
    .sort({ date: 1 });

  const approvedOtRows = await OT.find({
    employeeId: employee._id,
    date: { $gte: startDateStr, $lte: endDateStr },
    status: 'approved',
    isActive: true,
  })
    .select('date otHours rawOtHours computedOtHours')
    .lean();
  const approvedOtByDate = new Map(
    (approvedOtRows || []).map((ot) => [
      String(ot.date),
      {
        considered: Number(ot.computedOtHours ?? ot.otHours) || 0,
        actual: Number(ot.rawOtHours ?? ot.otHours) || 0,
      },
    ])
  );

  const mergedPolicy = await getMergedOtConfig(
    employee.department_id?._id || employee.department_id || null,
    employee.division_id?._id || employee.division_id || null
  );

  // Fetch approved leaves and ODs
  const startDateObj = periodInfo.payrollCycle.startDate;
  const endDateObj = periodInfo.payrollCycle.endDate;

  const approvedLeaves = await Leave.find({
    employeeId: employee._id,
    status: 'approved',
    $or: [
      { fromDate: { $lte: endDateObj }, toDate: { $gte: startDateObj } },
    ],
    isActive: true,
  })
    .populate('approvals.final.approvedBy', 'name email')
    .populate('approvals.hr.approvedBy', 'name email')
    .populate('approvals.hod.approvedBy', 'name email')
    .populate('appliedBy', 'name email');

  const approvedODs = await OD.find({
    employeeId: employee._id,
    status: 'approved',
    $or: [
      { fromDate: { $lte: endDateObj }, toDate: { $gte: startDateObj } },
    ],
    isActive: true,
  })
    .populate('approvals.final.approvedBy', 'name email')
    .populate('approvals.hr.approvedBy', 'name email')
    .populate('approvals.hod.approvedBy', 'name email')
    .populate('appliedBy', 'name email');

  // Create maps for leaves and ODs by date (IST calendar days — do not use server local getDate/setHours on UTC-stored Dates)
  const leaveMap = {};
  approvedLeaves.forEach(leave => {
    const leaveRangeStart = extractISTComponents(leave.fromDate).dateStr;
    const leaveRangeEnd = extractISTComponents(leave.toDate).dateStr;
    const leaveDays = getAllDatesInRange(leaveRangeStart, leaveRangeEnd);

    for (const dateStr of leaveDays) {
      if (dateStr >= startDateStr && dateStr <= endDateStr) {
        let approvedBy = null;
        let approvedAt = null;
        if (leave.approvals?.final?.status === 'approved' && leave.approvals.final.approvedBy) {
          approvedBy = leave.approvals.final.approvedBy;
          approvedAt = leave.approvals.final.approvedAt;
        } else if (leave.approvals?.hr?.status === 'approved' && leave.approvals.hr.approvedBy) {
          approvedBy = leave.approvals.hr.approvedBy;
          approvedAt = leave.approvals.hr.approvedAt;
        } else if (leave.approvals?.hod?.status === 'approved' && leave.approvals.hod.approvedBy) {
          approvedBy = leave.approvals.hod.approvedBy;
          approvedAt = leave.approvals.hod.approvedAt;
        }

        const entry = buildAttendanceLeaveInfoForDate(leave, dateStr, {
          approvedBy: approvedBy ? {
            name: approvedBy.name || approvedBy.email,
            email: approvedBy.email,
          } : null,
          approvedAt,
        });
        if (entry) leaveMap[dateStr] = entry;
      }
    }
  });

  const odMap = {};
  approvedODs.forEach(od => {
    const odRangeStart = extractISTComponents(od.fromDate).dateStr;
    const odRangeEnd = extractISTComponents(od.toDate).dateStr;
    const odDays = getAllDatesInRange(odRangeStart, odRangeEnd);

    let dayCounter = 1;
    for (const dateStr of odDays) {
      if (dateStr >= startDateStr && dateStr <= endDateStr) {
        let approvedBy = null;
        let approvedAt = null;
        if (od.approvals?.final?.status === 'approved' && od.approvals.final.approvedBy) {
          approvedBy = od.approvals.final.approvedBy;
          approvedAt = od.approvals.final.approvedAt;
        } else if (od.approvals?.hr?.status === 'approved' && od.approvals.hr.approvedBy) {
          approvedBy = od.approvals.hr.approvedBy;
          approvedAt = od.approvals.hr.approvedAt;
        } else if (od.approvals?.hod?.status === 'approved' && od.approvals.hod.approvedBy) {
          approvedBy = od.approvals.hod.approvedBy;
          approvedAt = od.approvals.hod.approvedAt;
        }

        odMap[dateStr] = {
          odId: od._id,
          odType: od.odType,
          odType_extended: od.odType_extended,
          isHalfDay: od.isHalfDay,
          halfDayType: od.halfDayType,
          purpose: od.purpose,
          placeVisited: od.placeVisited,
          fromDate: od.fromDate,
          toDate: od.toDate,
          numberOfDays: od.numberOfDays,
          durationHours: od.durationHours,
          odStartTime: od.odStartTime,
          odEndTime: od.odEndTime,
          reason: od.purpose,
          purpose: od.purpose,
          photo: od.photoEvidence?.url,
          photoEvidence: od.photoEvidence,
          geoLocation: od.geoLocation,
          dayInOD: dayCounter,
          appliedAt: od.appliedAt || od.createdAt,
          approvedBy: approvedBy ? {
            name: approvedBy.name || approvedBy.email,
            email: approvedBy.email
          } : null,
          approvedAt: approvedAt,
        };
      }
      dayCounter++;
    }
  });

  const dojStr = employee.doj ? extractISTComponents(employee.doj).dateStr : null;
  const leftDateStr = employee.leftDate ? extractISTComponents(employee.leftDate).dateStr : null;

  // Create merged attendance map
  const attendanceMap = {};
  records.forEach(record => {
    // Boundary check for display
    if (dojStr && record.date < dojStr) return;
    if (leftDateStr && record.date > leftDateStr) return;

    const hasLeave = !!leaveMap[record.date];
    const isEsiLeaveDay =
      hasLeave &&
      String(leaveMap[record.date]?.leaveType || '').trim().toUpperCase() === 'ESI' &&
      !leaveMap[record.date]?.isHalfDay;
    const odInfo = odMap[record.date];
    const hasOD = !!odInfo;
    const hasAttendance = record.status === 'PRESENT' || record.status === 'PARTIAL';
    const odIsHourBased = odInfo?.odType_extended === 'hours';
    const odIsHalfDay = odInfo?.odType_extended === 'half_day' || odInfo?.isHalfDay;
    const isConflict = (hasLeave || (hasOD && !odIsHourBased && !odIsHalfDay)) && hasAttendance;

    const approvedOtForDate = approvedOtByDate.get(String(record.date));
    const segmentExtra = getSegmentCumulativeExtraHours(record);
    const slabPreview = segmentExtra > 0 ? applyOtHoursPolicy(segmentExtra, mergedPolicy) : null;
    attendanceMap[record.date] = {
      date: record.date,
      // Map from first/last shift for display, or use shifts array in frontend
      // inTime and outTime are now provided within the shifts array for multi-shift support
      totalHours: record.totalWorkingHours, // Use aggregate
      status: isEsiLeaveDay ? 'LEAVE' : record.status,
      payableShifts: record.payableShifts || 0,
      shiftId: record.shifts && record.shifts.length > 0 ? record.shifts[0].shiftId : null,
      shiftName: record.shifts && record.shifts.length > 0 && record.shifts[0].shiftId ? record.shifts[0].shiftId.name : null,
      isLateIn: record.totalLateInMinutes > 0,
      isEarlyOut: record.totalEarlyOutMinutes > 0,
      lateInMinutes: record.totalLateInMinutes || 0,
      earlyOutMinutes: record.totalEarlyOutMinutes || 0,
      earlyOutDeduction: record.earlyOutDeduction || null,
      expectedHours: record.totalExpectedHours || (record.shifts && record.shifts.length > 0 && record.shifts[0].shiftId ? record.shifts[0].shiftId.duration : null),
      otHours: approvedOtForDate?.considered ?? Math.max(record.otHours || 0, record.totalOTHours || 0),
      otActualHours: approvedOtForDate?.actual ?? 0,
      otSlabHours: approvedOtForDate?.considered ?? (slabPreview?.eligible ? Number(slabPreview.finalHours) || 0 : 0),
      extraHours: record.extraHours || 0,
      permissionHours: record.permissionHours || 0,
      permissionCount: record.permissionCount || 0,
      permissionDeduction: record.permissionDeduction || 0,
      hasLeave: hasLeave,
      leaveInfo: leaveMap[record.date] || null,
      hasOD: hasOD,
      odInfo: odMap[record.date] || null,
      isConflict: isEsiLeaveDay ? false : isConflict,
      isEsiLeaveDay,
      isEdited: record.isEdited || false,
      editHistory: record.editHistory || [],
      source: record.source || [],
      shifts: record.shifts || [],
      policyMeta: record.policyMeta || null,
      rosterFirstHalfNonWorking: record.rosterFirstHalfNonWorking || null,
      rosterSecondHalfNonWorking: record.rosterSecondHalfNonWorking || null,
      notes: record.notes || '',
    };
  });

  // Fill in missing dates with Leave/OD info (ONLY if within employment period)
  Object.keys(leaveMap).forEach(dateStr => {
    if (dojStr && dateStr < dojStr) return;
    if (leftDateStr && dateStr > leftDateStr) return;

    if (!attendanceMap[dateStr]) {
      attendanceMap[dateStr] = {
        date: dateStr,
        status: 'LEAVE',
        hasLeave: true,
        leaveInfo: leaveMap[dateStr],
        hasOD: !!odMap[dateStr],
        odInfo: odMap[dateStr] || null,
        isConflict: false,
      };
    }
  });

  Object.keys(odMap).forEach(dateStr => {
    if (!attendanceMap[dateStr]) {
      attendanceMap[dateStr] = {
        date: dateStr,
        status: 'OD',
        hasLeave: !!leaveMap[dateStr],
        leaveInfo: leaveMap[dateStr] || null,
        hasOD: true,
        odInfo: odMap[dateStr],
        isConflict: false,
      };
    }
  });

  return attendanceMap;
};

/**
 * Get attendance data for table view (Multiple Employees)
 * @param {object[]} employees
 * @param {number|string} year
 * @param {number|string} month
 * @param {string} [startQueryDate]
 * @param {string} [endQueryDate]
 * @param {{ mode?: string, includeContributingDates?: boolean }} [options]
 */
exports.getMonthlyTableViewData = async (
  employees,
  year,
  month,
  startQueryDate,
  endQueryDate,
  options = {}
) => {
  const targetYear = parseInt(year, 10);
  const targetMonth = parseInt(month, 10);
  const mode = normalizeViewMode(options.mode);
  const includeContributingDates = Boolean(options.includeContributingDates);
  const needs = modeNeeds(mode);

  let startDate = startQueryDate;
  let endDateStr = endQueryDate;
  if (!startDate || !endDateStr) {
    const { getPayrollPeriodForMonth } = require('../../shared/utils/payrollPeriodCache');
    const period = await getPayrollPeriodForMonth(targetYear, targetMonth, dateCycleService);
    if (!startDate) startDate = period.startDateStr;
    if (!endDateStr) endDateStr = period.endDateStr;
  }

  const startYmd =
    typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(startDate).trim())
      ? String(startDate).trim()
      : extractISTComponents(startDate).dateStr;
  const endYmd =
    typeof endDateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(endDateStr).trim())
      ? String(endDateStr).trim()
      : extractISTComponents(endDateStr).dateStr;

  const startDateObj = createISTDate(startYmd, '00:00');
  const endDateObj = createISTDate(endYmd, '23:59');
  const datesInRange = getAllDatesInRange(startYmd, endYmd);

  const empNos = employees.map((e) => e.emp_no);
  const empIds = employees.map((e) => e._id);
  const empIdToNo = new Map(employees.map((e) => [String(e._id), e.emp_no]));
  const monthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
  const MonthlyAttendanceSummary = require('../model/MonthlyAttendanceSummary');

  const dailySelect = DAILY_SELECT_BY_TIER[needs.tier] || DAILY_SELECT_BY_TIER.minimal;
  let attendanceQuery = AttendanceDaily.find({
    employeeNumber: { $in: empNos },
    date: { $gte: startYmd, $lte: endYmd },
  })
    .select(dailySelect)
    .sort({ employeeNumber: 1, date: 1 })
    .lean();

  if (needs.shifts) {
    attendanceQuery = attendanceQuery.populate(
      'shifts.shiftId',
      'name startTime endTime duration payableShifts'
    );
  }

  const parallelTasks = [
    attendanceQuery,
    needs.ot
      ? OT.find({
          employeeId: { $in: empIds },
          date: { $gte: startYmd, $lte: endYmd },
          status: 'approved',
          isActive: true,
        })
          .select('employeeId employeeNumber date otHours rawOtHours computedOtHours')
          .lean()
      : Promise.resolve([]),
    needs.leaves
      ? Leave.find({
          employeeId: { $in: empIds },
          status: 'approved',
          $or: [{ fromDate: { $lte: endDateObj }, toDate: { $gte: startDateObj } }],
          isActive: true,
        })
          .select(
            'employeeId fromDate toDate leaveType leaveNature purpose isHalfDay halfDayType fromIsHalfDay fromHalfDayType toIsHalfDay toHalfDayType numberOfDays'
          )
          .lean()
      : Promise.resolve([]),
    needs.od
      ? OD.find({
          employeeId: { $in: empIds },
          status: 'approved',
          $or: [{ fromDate: { $lte: endDateObj }, toDate: { $gte: startDateObj } }],
          isActive: true,
        })
          .select(
            'employeeId fromDate toDate odType odType_extended isHalfDay halfDayType odStartTime odEndTime durationHours purpose placeVisited photoEvidence'
          )
          .lean()
      : Promise.resolve([]),
    MonthlyAttendanceSummary.find({
      employeeId: { $in: empIds },
      month: monthStr,
    }).lean(),
    needs.otConfig ? loadOtConfigByDeptDiv(employees) : Promise.resolve({}),
  ];

  const [
    attendanceRecords,
    approvedOTs,
    allLeaves,
    allODs,
    preCalculatedSummaries,
    employeePolicyMap,
  ] = await Promise.all(parallelTasks);

  const leaveMapByEmployee = {};
  allLeaves.forEach((leave) => {
    const empNo = empIdToNo.get(String(leave.employeeId));
    if (!empNo) return;
    if (!leaveMapByEmployee[empNo]) leaveMapByEmployee[empNo] = {};
    const leaveRangeStart = extractISTComponents(leave.fromDate).dateStr;
    const leaveRangeEnd = extractISTComponents(leave.toDate).dateStr;
    for (const dateStr of getAllDatesInRange(leaveRangeStart, leaveRangeEnd)) {
      if (dateStr >= startYmd && dateStr <= endYmd) {
        const entry = buildAttendanceLeaveInfoForDate(leave, dateStr);
        if (entry) leaveMapByEmployee[empNo][dateStr] = entry;
      }
    }
  });

  const odMapByEmployee = {};
  allODs.forEach((od) => {
    const empNo = empIdToNo.get(String(od.employeeId));
    if (!empNo) return;
    if (!odMapByEmployee[empNo]) odMapByEmployee[empNo] = {};
    const odRangeStart = extractISTComponents(od.fromDate).dateStr;
    const odRangeEnd = extractISTComponents(od.toDate).dateStr;
    for (const dateStr of getAllDatesInRange(odRangeStart, odRangeEnd)) {
      if (dateStr >= startYmd && dateStr <= endYmd) {
        odMapByEmployee[empNo][dateStr] = compactOdInfo(
          {
            odId: od._id,
            odType: od.odType,
            odType_extended: od.odType_extended,
            isHalfDay: od.isHalfDay,
            halfDayType: od.halfDayType,
            odStartTime: od.odStartTime,
            odEndTime: od.odEndTime,
            durationHours: od.durationHours,
            placeVisited: od.placeVisited,
            reason: od.purpose,
            purpose: od.purpose,
            photo: od.photoEvidence?.url,
          },
          needs.fullCells
        );
      }
    }
  });

  const attendanceMap = {};
  attendanceRecords.forEach((record) => {
    if (!attendanceMap[record.employeeNumber]) attendanceMap[record.employeeNumber] = {};
    attendanceMap[record.employeeNumber][record.date] = record;
  });

  const approvedOtMap = {};
  approvedOTs.forEach((ot) => {
    const empNo = normalizeEmpNoKey(ot.employeeNumber);
    if (!empNo) return;
    if (!approvedOtMap[empNo]) approvedOtMap[empNo] = {};
    approvedOtMap[empNo][ot.date] = {
      considered: Number(ot.computedOtHours ?? ot.otHours) || 0,
      actual: Number(ot.rawOtHours ?? ot.otHours) || 0,
    };
  });

  const summaryLookup = buildSummaryLookupMaps(preCalculatedSummaries);
  const todayStr = extractISTComponents(new Date()).dateStr;

  return employees.map((emp) => {
    const dojStr = emp.doj ? extractISTComponents(emp.doj).dateStr : null;
    const leftDateStr = emp.leftDate ? extractISTComponents(emp.leftDate).dateStr : null;
    const empNoKey = normalizeEmpNoKey(emp.emp_no);
    const mergedPolicyForEmp = employeePolicyMap[empNoKey] || null;
    const dailyAttendance = {};

    for (const dateStr of datesInRange) {
      const record = attendanceMap[emp.emp_no]?.[dateStr] || null;
      const leaveInfo = leaveMapByEmployee[emp.emp_no]?.[dateStr] || null;
      const odInfo = odMapByEmployee[emp.emp_no]?.[dateStr] || null;
      const hasLeave = !!leaveInfo;
      const isEsiLeaveDay =
        hasLeave &&
        String(leaveInfo?.leaveType || '').trim().toUpperCase() === 'ESI' &&
        !leaveInfo?.isHalfDay;
      const hasOD = !!odInfo;
      const hasAttendance = !!record && (record.status === 'PRESENT' || record.status === 'PARTIAL');
      const odIsHourBased = odInfo?.odType_extended === 'hours';
      const odIsHalfDay = odInfo?.odType_extended === 'half_day' || odInfo?.isHalfDay;
      const isConflict = (hasLeave || (hasOD && !odIsHourBased && !odIsHalfDay)) && hasAttendance;

      const cell = buildDailyCell(mode, {
        dateStr,
        record,
        leaveInfo,
        odInfo,
        hasLeave,
        hasOD,
        isEsiLeaveDay,
        isConflict,
        dojStr,
        leftDateStr,
        todayStr,
        approvedOtForDate: approvedOtMap[empNoKey]?.[dateStr] || null,
        mergedPolicyForEmp,
      });

      if (cell) dailyAttendance[dateStr] = cell;
    }

    const rawSummary = resolveStoredSummary(emp, summaryLookup);
    const summaryForClient = toListSummary(rawSummary, emp, includeContributingDates);

    return {
      _id: emp._id,
      employee: emp,
      dailyAttendance,
      presentDays: rawSummary?.totalPresentDays || 0,
      payableShifts: rawSummary?.totalPayableShifts || 0,
      summary: summaryForClient,
    };
  });
};

/** Contributing dates only — for summary-column highlights after list load. */
exports.getMonthlySummaryContributions = async (employeeId, year, month) => {
  const MonthlyAttendanceSummary = require('../model/MonthlyAttendanceSummary');
  const Employee = require('../../employees/model/Employee');
  const targetYear = parseInt(year, 10);
  const targetMonth = parseInt(month, 10);
  const monthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

  const [employee, summary] = await Promise.all([
    Employee.findById(employeeId)
      .select('emp_no doj leftDate')
      .lean(),
    MonthlyAttendanceSummary.findOne({ employeeId, month: monthStr }).lean(),
  ]);

  if (!employee) return null;
  if (!summary) return { contributingDates: null };

  const filtered = filterMonthlySummaryForEmploymentBounds(summary, employee);
  return {
    contributingDates: filtered?.contributingDates || null,
    emp_no: employee.emp_no,
    month: monthStr,
  };
};
