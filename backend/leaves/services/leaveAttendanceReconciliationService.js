/**
 * When actual attendance (punches) shows physical presence for a full or half day,
 * adjust approved leave/OD so summary contributions come only from valid non-conflicting halves.
 *
 * Scope (current):
 * - Leave: single-day rows are auto-reconciled (reject/narrow). Multi-day is skipped.
 * - OD: single-day full/half-day rows are auto-reconciled (reject/narrow). Multi-day/hours are skipped.
 * - Single-shift PARTIAL: IN-only → first-half presence; OUT-only (no IN) → second-half presence.
 */

const Settings = require('../../settings/model/Settings');
const Leave = require('../model/Leave');
const OD = require('../model/OD');
const leaveRegisterService = require('./leaveRegisterService');
const leaveRegisterYearMonthlyApplyService = require('./leaveRegisterYearMonthlyApplyService');
const { assertEmployeeDateRequestsEditable } = require('../../shared/services/payrollRequestLockService');
const { extractISTComponents, createISTDate } = require('../../shared/utils/dateUtils');
const { isEsiLeaveType } = require('../../overtime/services/esiLeaveOtService');
const {
  computeRawAttendanceHalfCredits,
} = require('../../attendance/utils/attendanceHalfPresence');
const {
  leaveHalfMaskForDate,
  buildLeaveDocumentFieldsForSpan,
} = require('../../shared/utils/leaveDayRangeUtils');

const LEAVE_BOUNDARY_SELECT =
  'fromDate toDate isHalfDay halfDayType fromIsHalfDay fromHalfDayType toIsHalfDay toHalfDayType numberOfDays leaveType leaveNature status splitStatus remarks workflow';
const {
  getRosterHalfHolidayForEmployeeDate,
  isFullDayOdRequest,
  isHalfDayOdRequest,
  halfDayTypeFromOd,
  applyNarrowFieldsToOdDoc,
  NARROW_REMARK,
  REJECT_SAME_HALF_REMARK,
  isFullDayLeaveRequest,
  isHalfDayLeaveRequest,
  halfDayTypeFromLeave,
  applyNarrowFieldsToLeaveDoc,
  LEAVE_NARROW_REMARK,
  LEAVE_REJECT_SAME_HALF_REMARK,
} = require('./odHalfHolidayRosterService');

const REMARK_PREFIX = '[Auto attendance reconciliation]';
const HALF_HOL_OD_TAG = '[Half-holiday OD reconcile]';
const HALF_HOL_LEAVE_TAG = '[Half-holiday leave reconcile]';

const LEAVE_ACTIVE_STATUSES = [
  'pending',
  'reporting_manager_approved',
  'hod_approved',
  'manager_approved',
  'hr_approved',
  'principal_approved',
  'approved',
];

function daysInclusive(fromDate, toDate) {
  const fromStr = extractISTComponents(fromDate).dateStr;
  const toStr = extractISTComponents(toDate).dateStr;
  const a = createISTDate(fromStr, '00:00');
  const b = createISTDate(toStr, '00:00');
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function plusDays(dateStr, days) {
  const d = createISTDate(dateStr, '00:00');
  d.setDate(d.getDate() + days);
  return extractISTComponents(d).dateStr;
}

async function loadSettingEnabled() {
  try {
    const s = await Settings.findOne({ key: 'leave_attendance_reconciliation_enabled' }).lean();
    if (!s) return true;
    return s.value !== false;
  } catch {
    return true;
  }
}

/** General Settings → pause flag (same effect as SKIP_LEAVE_ATTENDANCE_RECONCILIATION=1 on scripts). */
async function loadSkipReconciliationFromSettings() {
  try {
    const s = await Settings.findOne({ key: 'skip_leave_attendance_reconciliation' }).lean();
    return s?.value === true;
  } catch {
    return false;
  }
}

function isSingleCalendarDayLeave(leave) {
  if (!leave?.fromDate || !leave?.toDate) return false;
  const a = extractISTComponents(leave.fromDate).dateStr;
  const b = extractISTComponents(leave.toDate).dateStr;
  return a === b;
}

function leaveHalfMask(leave) {
  if (leave.isHalfDay) {
    if (String(leave.halfDayType) === 'second_half') {
      return { l1: 0, l2: 0.5 };
    }
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

function appendRemark(leave, line) {
  const add = `${REMARK_PREFIX} ${line}`;
  const prev = String(leave.remarks || '').trim();
  if (prev.includes(add)) return;
  leave.remarks = prev ? `${prev}\n${add}` : add;
}

function appendOdRemark(od, line) {
  const add = `${REMARK_PREFIX} ${line}`;
  const prev = String(od.remarks || '').trim();
  if (prev.includes(add)) return;
  od.remarks = prev ? `${prev}\n${add}` : add;
}

function addWorkflowHistory(doc, action, comments) {
  if (!doc.workflow) return;
  doc.workflow.history = doc.workflow.history || [];
  doc.workflow.history.push({
    action,
    comments,
    timestamp: new Date(),
  });
}

async function splitAndAdjustMultiDayLeave({
  leave,
  dateStr,
  mode, // 'reject' | 'narrow_first' | 'narrow_second'
  detail,
  syncPayRegisterFromLeave,
}) {
  const originalFrom = extractISTComponents(leave.fromDate).dateStr;
  const originalTo = extractISTComponents(leave.toDate).dateStr;
  if (dateStr < originalFrom || dateStr > originalTo) {
    return { ok: false, reason: 'target_out_of_range' };
  }

  await leaveRegisterService.reverseLeaveDebit(leave, null);

  const beforeFrom = originalFrom;
  const beforeTo = plusDays(dateStr, -1);
  const afterFrom = plusDays(dateStr, 1);
  const afterTo = originalTo;
  const hasBefore = beforeFrom <= beforeTo;
  const hasAfter = afterFrom <= afterTo;

  const base = leave.toObject();
  delete base._id;
  delete base.__v;
  delete base.createdAt;
  delete base.updatedAt;

  const toSync = [];
  if (mode === 'reject') {
    leave.status = 'rejected';
    leave.workflow = leave.workflow || {};
    leave.workflow.isCompleted = true;
    leave.workflow.currentStepRole = null;
    leave.workflow.nextApprover = null;
    leave.workflow.nextApproverRole = null;
    addWorkflowHistory(leave, 'rejected', `${REMARK_PREFIX} System rejected — ${detail}`);
    appendRemark(leave, `${dateStr}: ${detail}`);
    await leave.save();
    toSync.push(leave);
  } else {
    const narrowMode = mode === 'narrow_second' ? 'narrow_second' : 'narrow_first';
    const spanFields = buildLeaveDocumentFieldsForSpan(leave, dateStr, dateStr, narrowMode);
    Object.assign(leave, spanFields);
    addWorkflowHistory(leave, 'status_changed', `${REMARK_PREFIX} System updated — ${detail}`);
    appendRemark(leave, `${dateStr}: ${detail}`);
    await leave.save();
    await leaveRegisterService.addLeaveDebit(leave, null);
    toSync.push(leave);
  }

  if (hasBefore) {
    const spanFields = buildLeaveDocumentFieldsForSpan(leave, beforeFrom, beforeTo);
    const b = new Leave({
      ...base,
      ...spanFields,
      splitStatus: null,
      remarks: `${String(base.remarks || '').trim()}${base.remarks ? '\n' : ''}${REMARK_PREFIX} ${dateStr}: System split preserved prior days (${beforeFrom}..${beforeTo}).`,
    });
    await b.save();
    await leaveRegisterService.addLeaveDebit(b, null);
    toSync.push(b);
  }

  if (hasAfter) {
    const spanFields = buildLeaveDocumentFieldsForSpan(leave, afterFrom, afterTo);
    const a = new Leave({
      ...base,
      ...spanFields,
      splitStatus: null,
      remarks: `${String(base.remarks || '').trim()}${base.remarks ? '\n' : ''}${REMARK_PREFIX} ${dateStr}: System split preserved later days (${afterFrom}..${afterTo}).`,
    });
    await a.save();
    await leaveRegisterService.addLeaveDebit(a, null);
    toSync.push(a);
  }

  for (const row of toSync) {
    try {
      await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(row.employeeId, row.fromDate);
    } catch (e) {
      console.warn('[leaveAttendanceReconciliation] monthlyApply sync', e?.message);
    }
    try {
      await syncPayRegisterFromLeave(row);
    } catch (e) {
      console.warn('[leaveAttendanceReconciliation] pay register sync', e?.message);
    }
  }
  return { ok: true };
}

async function splitAndAdjustMultiDayOD({
  od,
  dateStr,
  mode, // 'reject' | 'narrow_first' | 'narrow_second'
  detail,
  syncPayRegisterFromOD,
}) {
  const originalFrom = extractISTComponents(od.fromDate).dateStr;
  const originalTo = extractISTComponents(od.toDate).dateStr;
  if (dateStr < originalFrom || dateStr > originalTo) {
    return { ok: false, reason: 'target_out_of_range' };
  }
  const beforeFrom = originalFrom;
  const beforeTo = plusDays(dateStr, -1);
  const afterFrom = plusDays(dateStr, 1);
  const afterTo = originalTo;
  const hasBefore = beforeFrom <= beforeTo;
  const hasAfter = afterFrom <= afterTo;

  const base = od.toObject();
  delete base._id;
  delete base.__v;
  delete base.createdAt;
  delete base.updatedAt;

  const toSync = [];
  if (mode === 'reject') {
    od.status = 'rejected';
    od.workflow = od.workflow || {};
    od.workflow.isCompleted = true;
    od.workflow.currentStepRole = null;
    od.workflow.nextApprover = null;
    od.workflow.nextApproverRole = null;
    addWorkflowHistory(od, 'rejected', `${REMARK_PREFIX} System rejected — ${detail}`);
    appendOdRemark(od, `${dateStr}: ${detail}`);
    await od.save();
    toSync.push(od);
  } else {
    od.fromDate = createISTDate(dateStr, '00:00');
    od.toDate = createISTDate(dateStr, '23:59');
    od.isHalfDay = true;
    od.halfDayType = mode === 'narrow_second' ? 'second_half' : 'first_half';
    od.numberOfDays = 0.5;
    od.odType_extended = 'half_day';
    addWorkflowHistory(od, 'status_changed', `${REMARK_PREFIX} System updated — ${detail}`);
    appendOdRemark(od, `${dateStr}: ${detail}`);
    await od.save();
    toSync.push(od);
  }

  if (hasBefore) {
    const b = new OD({
      ...base,
      fromDate: createISTDate(beforeFrom, '00:00'),
      toDate: createISTDate(beforeTo, '23:59'),
      isHalfDay: false,
      halfDayType: null,
      numberOfDays: daysInclusive(createISTDate(beforeFrom), createISTDate(beforeTo)),
      odType_extended: 'full_day',
      remarks: `${String(base.remarks || '').trim()}${base.remarks ? '\n' : ''}${REMARK_PREFIX} ${dateStr}: System split preserved prior days (${beforeFrom}..${beforeTo}).`,
    });
    await b.save();
    toSync.push(b);
  }
  if (hasAfter) {
    const a = new OD({
      ...base,
      fromDate: createISTDate(afterFrom, '00:00'),
      toDate: createISTDate(afterTo, '23:59'),
      isHalfDay: false,
      halfDayType: null,
      numberOfDays: daysInclusive(createISTDate(afterFrom), createISTDate(afterTo)),
      odType_extended: 'full_day',
      remarks: `${String(base.remarks || '').trim()}${base.remarks ? '\n' : ''}${REMARK_PREFIX} ${dateStr}: System split preserved later days (${afterFrom}..${afterTo}).`,
    });
    await a.save();
    toSync.push(a);
  }

  for (const row of toSync) {
    try {
      await syncPayRegisterFromOD(row);
    } catch (e) {
      console.warn('[leaveAttendanceReconciliation] pay register OD sync', e?.message);
    }
  }
  return { ok: true };
}

async function findApprovedOdsForDate(employeeId, dateStr) {
  const start = createISTDate(dateStr, '00:00');
  const end = createISTDate(dateStr, '23:59');
  return OD.find({
    employeeId,
    status: 'approved',
    fromDate: { $lte: end },
    toDate: { $gte: start },
  })
    .select('isHalfDay halfDayType odType_extended fromDate toDate')
    .lean();
}

/**
 * @param {import('mongoose').Document} employee
 * @param {string} dateStr YYYY-MM-DD
 * @param {import('mongoose').Document} daily - AttendanceDaily
 */
async function reconcileHalfHolidayOdsForDate(employee, dateStr, syncPayRegisterFromOD, results) {
  const ctx = await getRosterHalfHolidayForEmployeeDate(employee.emp_no, dateStr);
  if (!ctx.hasHalfHoliday) return;

  const dayStart = createISTDate(dateStr, '00:00');
  const dayEnd = createISTDate(dateStr, '23:59');
  const ods = await OD.find({
    employeeId: employee._id,
    status: {
      $in: [
        'pending',
        'reporting_manager_approved',
        'hod_approved',
        'manager_approved',
        'hr_approved',
        'principal_approved',
        'approved',
      ],
    },
    isActive: { $ne: false },
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select('fromDate toDate isHalfDay halfDayType numberOfDays odType odType_extended status remarks workflow')
    .lean();

  for (const o of ods) {
    if (String(o.remarks || '').includes(HALF_HOL_OD_TAG)) {
      results.push({ odId: o._id, action: 'skip', reason: 'half_hol_already_reconciled' });
      continue;
    }
    if (String(o.odType_extended || '') === 'hours') continue;

    const fromStr = extractISTComponents(o.fromDate).dateStr;
    const toStr = extractISTComponents(o.toDate).dateStr;
    if (fromStr !== dateStr || toStr !== dateStr) continue;

    const od = await OD.findById(o._id);
    if (!od || ['rejected', 'cancelled', 'draft'].includes(String(od.status || ''))) continue;

    const payload = {
      isHalfDay: od.isHalfDay,
      halfDayType: od.halfDayType,
      odType_extended: od.odType_extended,
      numberOfDays: od.numberOfDays,
    };

    if (isHalfDayOdRequest(payload) && halfDayTypeFromOd(od) === ctx.holidayHalf) {
      const detail = REJECT_SAME_HALF_REMARK;
      if (String(od.status || '') !== 'approved') {
        results.push({ odId: od._id, action: 'skip', reason: 'half_hol_reject_only_when_approved' });
        continue;
      }
      od.status = 'rejected';
      if (od.workflow) {
        od.workflow.isCompleted = true;
        od.workflow.currentStepRole = null;
        od.workflow.nextApprover = null;
        od.workflow.nextApproverRole = null;
        addWorkflowHistory(
          od,
          'rejected',
          `${HALF_HOL_OD_TAG} System rejected — ${detail}`
        );
      }
      appendOdRemark(od, `${HALF_HOL_OD_TAG} ${dateStr}: ${detail}`);
      await od.save();
      try {
        await syncPayRegisterFromOD(od);
      } catch (e) {
        console.warn('[leaveAttendanceReconciliation] half-hol OD reject sync', e?.message);
      }
      results.push({ odId: od._id, action: 'rejected_od_half_holiday' });
      continue;
    }

    if (isFullDayOdRequest(payload)) {
      const detail = NARROW_REMARK;
      applyNarrowFieldsToOdDoc(od, ctx.workingHalf, `${HALF_HOL_OD_TAG} ${dateStr}: ${detail}`);
      if (od.workflow) {
        addWorkflowHistory(
          od,
          'status_changed',
          `${HALF_HOL_OD_TAG} System updated — ${detail}`
        );
      }
      await od.save();
      try {
        await syncPayRegisterFromOD(od);
      } catch (e) {
        console.warn('[leaveAttendanceReconciliation] half-hol OD narrow sync', e?.message);
      }
      results.push({ odId: od._id, action: 'narrowed_od_half_holiday' });
    }
  }
}

async function reconcileHalfHolidayLeavesForDate(employee, dateStr, syncPayRegisterFromLeave, results) {
  const ctx = await getRosterHalfHolidayForEmployeeDate(employee.emp_no, dateStr);
  if (!ctx.hasHalfHoliday) return;

  const dayStart = createISTDate(dateStr, '00:00');
  const dayEnd = createISTDate(dateStr, '23:59');
  const leaves = await Leave.find({
    employeeId: employee._id,
    status: { $in: LEAVE_ACTIVE_STATUSES },
    isActive: { $ne: false },
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select(LEAVE_BOUNDARY_SELECT)
    .lean();

  const narrowMode = ctx.workingHalf === 'second_half' ? 'narrow_second' : 'narrow_first';

  for (const l of leaves) {
    if (String(l.splitStatus || '') === 'split_approved') {
      results.push({ leaveId: l._id, action: 'skip', reason: 'split_approved' });
      continue;
    }
    if (isEsiLeaveType(l.leaveType)) continue;
    if (String(l.remarks || '').includes(HALF_HOL_LEAVE_TAG)) {
      results.push({ leaveId: l._id, action: 'skip', reason: 'half_hol_leave_already_reconciled' });
      continue;
    }

    const fromStr = extractISTComponents(l.fromDate).dateStr;
    const toStr = extractISTComponents(l.toDate).dateStr;
    if (fromStr !== dateStr || toStr !== dateStr) continue;

    const leave = await Leave.findById(l._id);
    if (!leave || ['rejected', 'cancelled', 'draft'].includes(String(leave.status || ''))) continue;

    const payload = {
      isHalfDay: leave.isHalfDay,
      halfDayType: leave.halfDayType,
      numberOfDays: leave.numberOfDays,
    };

    if (isHalfDayLeaveRequest(payload) && halfDayTypeFromLeave(leave) === ctx.holidayHalf) {
      const detail = LEAVE_REJECT_SAME_HALF_REMARK;
      if (String(leave.status || '') !== 'approved') {
        results.push({ leaveId: l._id, action: 'skip', reason: 'half_hol_leave_reject_only_when_approved' });
        continue;
      }
      try {
        await leaveRegisterService.reverseLeaveDebit(leave, null);
      } catch (e) {
        console.error('[leaveAttendanceReconciliation] half-hol leave reverse failed', e);
        results.push({ leaveId: l._id, action: 'error', error: e.message });
        continue;
      }
      leave.status = 'rejected';
      if (leave.workflow) {
        leave.workflow.isCompleted = true;
        leave.workflow.currentStepRole = null;
        leave.workflow.nextApprover = null;
        leave.workflow.nextApproverRole = null;
        addWorkflowHistory(
          leave,
          'rejected',
          `${HALF_HOL_LEAVE_TAG} System rejected — ${detail}`
        );
      }
      appendRemark(leave, `${HALF_HOL_LEAVE_TAG} ${dateStr}: ${detail}`);
      await leave.save();
      try {
        await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(
          leave.employeeId,
          leave.fromDate
        );
      } catch (e) {
        console.warn('[leaveAttendanceReconciliation] monthlyApply sync', e?.message);
      }
      try {
        await syncPayRegisterFromLeave(leave);
      } catch (e) {
        console.warn('[leaveAttendanceReconciliation] half-hol leave reject sync', e?.message);
      }
      results.push({ leaveId: l._id, action: 'rejected_leave_half_holiday' });
      continue;
    }

    if (!isFullDayLeaveRequest(payload)) continue;

    const detail = LEAVE_NARROW_REMARK;
    const isSingle = isSingleCalendarDayLeave(leave);
    if (!isSingle) {
      const splitRes = await splitAndAdjustMultiDayLeave({
        leave,
        dateStr,
        mode: narrowMode,
        detail: `${HALF_HOL_LEAVE_TAG} ${dateStr}: ${detail}`,
        syncPayRegisterFromLeave,
      });
      if (!splitRes.ok) {
        results.push({ leaveId: l._id, action: 'error', error: splitRes.reason });
      } else {
        results.push({ leaveId: l._id, action: 'split_narrowed_leave_half_holiday' });
      }
      continue;
    }

    const prevState = {
      isHalfDay: leave.isHalfDay,
      halfDayType: leave.halfDayType,
      numberOfDays: leave.numberOfDays,
    };
    const wasApproved = String(leave.status || '') === 'approved';
    if (wasApproved) {
      try {
        await leaveRegisterService.reverseLeaveDebit(leave, null);
      } catch (e) {
        console.error('[leaveAttendanceReconciliation] half-hol leave narrow reverse failed', e);
        results.push({ leaveId: l._id, action: 'error', error: e.message });
        continue;
      }
    }
    applyNarrowFieldsToLeaveDoc(leave, ctx.workingHalf, `${HALF_HOL_LEAVE_TAG} ${dateStr}: ${detail}`);
    if (leave.workflow) {
      addWorkflowHistory(
        leave,
        'status_changed',
        `${HALF_HOL_LEAVE_TAG} System updated — ${detail}`
      );
    }
    await leave.save();
    if (wasApproved) {
      try {
        await leaveRegisterService.addLeaveDebit(leave, null);
      } catch (e) {
        console.error('[leaveAttendanceReconciliation] half-hol leave narrow re-debit failed', e);
        leave.isHalfDay = prevState.isHalfDay;
        leave.halfDayType = prevState.halfDayType;
        leave.numberOfDays = prevState.numberOfDays;
        try {
          await leaveRegisterService.addLeaveDebit(leave, null);
        } catch (e2) {
          console.error('[leaveAttendanceReconciliation] half-hol leave narrow rollback failed', e2);
        }
        results.push({ leaveId: l._id, action: 'error', error: e.message });
        continue;
      }
    }
    try {
      await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(
        leave.employeeId,
        leave.fromDate
      );
    } catch (e) {
      console.warn('[leaveAttendanceReconciliation] monthlyApply sync', e?.message);
    }
    try {
      await syncPayRegisterFromLeave(leave);
    } catch (e) {
      console.warn('[leaveAttendanceReconciliation] half-hol leave narrow sync', e?.message);
    }
    results.push({ leaveId: l._id, action: 'narrowed_leave_half_holiday' });
  }
}

async function runLeaveAttendanceReconciliation(employee, dateStr, daily) {
  // Bulk re-save scripts may set SKIP_LEAVE_ATTENDANCE_RECONCILIATION=1; admins can also pause via General Settings.
  if (process.env.SKIP_LEAVE_ATTENDANCE_RECONCILIATION === '1') {
    return { ran: false, reason: 'skipped_by_env' };
  }
  if (await loadSkipReconciliationFromSettings()) {
    return { ran: false, reason: 'skipped_by_settings' };
  }
  const settingOk = await loadSettingEnabled();
  if (!settingOk) return { ran: false, reason: 'disabled_in_settings' };

  try {
    await assertEmployeeDateRequestsEditable(employee._id, dateStr, employee.emp_no);
  } catch {
    return { ran: false, reason: 'payroll_locked' };
  }

  if (!daily || !dateStr) return { ran: false, reason: 'no_daily' };

  const ods = await findApprovedOdsForDate(employee._id, dateStr);
  const { syncPayRegisterFromLeave, syncPayRegisterFromOD } = require('../../pay-register/services/autoSyncService');
  const results = [];

  await reconcileHalfHolidayOdsForDate(employee, dateStr, syncPayRegisterFromOD, results);
  await reconcileHalfHolidayLeavesForDate(employee, dateStr, syncPayRegisterFromLeave, results);

  const { getProcessingModeForEmployee } = require('../../attendance/services/processingModeResolutionService');
  const processingMode = (await getProcessingModeForEmployee(employee)).mode;
  const { attFirst, attSecond } = await computeRawAttendanceHalfCredits(daily, ods, {
    processingMode,
    dateStr,
  });
  const { p1, p2 } = physicalMask(attFirst, attSecond);
  const physTotal = p1 + p2;
  if (physTotal < 0.5 - 1e-6) {
    return { ran: true, reason: 'no_physical_coverage', results };
  }

  const dayStart = createISTDate(dateStr, '00:00');
  const dayEnd = createISTDate(dateStr, '23:59');
  const leaves = await Leave.find({
    employeeId: employee._id,
    status: 'approved',
    isActive: { $ne: false },
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select(LEAVE_BOUNDARY_SELECT)
    .lean();

  for (const l of leaves) {
    if (String(l.splitStatus || '') === 'split_approved') {
      results.push({ leaveId: l._id, action: 'skip', reason: 'split_approved' });
      continue;
    }
    if (isEsiLeaveType(l.leaveType)) {
      results.push({ leaveId: l._id, action: 'skip', reason: 'esi' });
      continue;
    }
    const isSingle = isSingleCalendarDayLeave(l);
    const tag = `${REMARK_PREFIX} ${dateStr}:`;
    if (String(l.remarks || '').includes(tag)) {
      results.push({ leaveId: l._id, action: 'skip', reason: 'already_reconciled' });
      continue;
    }

    const { l1, l2 } = leaveHalfMaskForDate(l, dateStr);
    const isFullDayLeaveOnDate = l1 >= 0.5 - 1e-6 && l2 >= 0.5 - 1e-6;
    const isHalfDayOnDate = !isFullDayLeaveOnDate && (l1 > 0 || l2 > 0);

    if (isHalfDayOnDate) {
      const onFirst = l1 > 0;
      const physConflicts = (onFirst && p1 >= 0.5) || (!onFirst && p2 >= 0.5);
      if (!physConflicts) {
        results.push({ leaveId: l._id, action: 'none', reason: 'no_conflict_half_leave' });
        continue;
      }
      const leave = await Leave.findById(l._id);
      if (!leave || leave.status !== 'approved') continue;

      const detail =
        'Half-day leave auto-rejected: same-half attendance is present, so system selected attendance over leave.';
      if (!isSingle) {
        const splitRes = await splitAndAdjustMultiDayLeave({
          leave,
          dateStr,
          mode: 'reject',
          detail,
          syncPayRegisterFromLeave,
        });
        if (!splitRes.ok) {
          results.push({ leaveId: l._id, action: 'error', error: splitRes.reason });
        } else {
          results.push({ leaveId: l._id, action: 'split_rejected_half' });
        }
        continue;
      }
      try {
        await leaveRegisterService.reverseLeaveDebit(leave, null);
      } catch (e) {
        console.error('[leaveAttendanceReconciliation] reverse failed', e);
        results.push({ leaveId: l._id, action: 'error', error: e.message });
        continue;
      }
      leave.status = 'rejected';
      if (leave.workflow) {
        leave.workflow.isCompleted = true;
        leave.workflow.currentStepRole = null;
        leave.workflow.nextApprover = null;
        leave.workflow.nextApproverRole = null;
        leave.workflow.history = leave.workflow.history || [];
        leave.workflow.history.push({
          action: 'rejected',
          comments: `${REMARK_PREFIX} System rejected — ${detail}`,
          timestamp: new Date(),
        });
      }
      appendRemark(leave, `${dateStr}: ${detail}`);
      await leave.save();

      try {
        await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(leave.employeeId, leave.fromDate);
      } catch (e) {
        console.warn('[leaveAttendanceReconciliation] monthlyApply sync', e?.message);
      }
      try {
        await syncPayRegisterFromLeave(leave);
      } catch (e) {
        console.warn('[leaveAttendanceReconciliation] pay register sync', e?.message);
      }
      results.push({ leaveId: l._id, action: 'rejected_half' });
      continue;
    }

    if (isFullDayLeaveOnDate) {
      if (p1 >= 0.5 && p2 >= 0.5) {
        const leave = await Leave.findById(l._id);
        if (!leave || leave.status !== 'approved') continue;
        const detail = 'Full-day leave auto-rejected: same-day full attendance (punches) supersedes leave.';
        if (!isSingle) {
          const splitRes = await splitAndAdjustMultiDayLeave({
            leave,
            dateStr,
            mode: 'reject',
            detail,
            syncPayRegisterFromLeave,
          });
          if (!splitRes.ok) {
            results.push({ leaveId: l._id, action: 'error', error: splitRes.reason });
          } else {
            results.push({ leaveId: l._id, action: 'split_rejected_full' });
          }
          continue;
        }
        try {
          await leaveRegisterService.reverseLeaveDebit(leave, null);
        } catch (e) {
          console.error('[leaveAttendanceReconciliation] reverse full failed', e);
          results.push({ leaveId: l._id, action: 'error', error: e.message });
          continue;
        }
        leave.status = 'rejected';
        if (leave.workflow) {
          leave.workflow.isCompleted = true;
          leave.workflow.currentStepRole = null;
          leave.workflow.nextApprover = null;
          leave.workflow.nextApproverRole = null;
          leave.workflow.history = leave.workflow.history || [];
          leave.workflow.history.push({
            action: 'rejected',
            comments: `${REMARK_PREFIX} System rejected — ${detail}`,
            timestamp: new Date(),
          });
        }
        appendRemark(leave, `${dateStr}: ${detail}`);
        await leave.save();
        try {
          await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(leave.employeeId, leave.fromDate);
        } catch (e) {
          console.warn('[leaveAttendanceReconciliation] monthlyApply sync', e?.message);
        }
        try {
          await syncPayRegisterFromLeave(leave);
        } catch (e) {
          console.warn('[leaveAttendanceReconciliation] pay register sync', e?.message);
        }
        results.push({ leaveId: l._id, action: 'rejected_full' });
        continue;
      }

      if (p1 >= 0.5 && p2 < 0.5) {
        const keepHalf = 'second_half';
        const leave = await Leave.findById(l._id);
        if (!leave || leave.status !== 'approved') continue;
        const detail =
          'Full-day leave narrowed to second half (0.5d): first half attendance supersedes leave; register debits adjusted.';
        if (!isSingle) {
          const splitRes = await splitAndAdjustMultiDayLeave({
            leave,
            dateStr,
            mode: 'narrow_second',
            detail,
            syncPayRegisterFromLeave,
          });
          if (!splitRes.ok) {
            results.push({ leaveId: l._id, action: 'error', error: splitRes.reason });
          } else {
            results.push({ leaveId: l._id, action: 'split_narrowed_second' });
          }
          continue;
        }
        const prevState = {
          isHalfDay: leave.isHalfDay,
          halfDayType: leave.halfDayType,
          numberOfDays: leave.numberOfDays,
        };
        try {
          await leaveRegisterService.reverseLeaveDebit(leave, null);
        } catch (e) {
          console.error('[leaveAttendanceReconciliation] reverse narrow failed', e);
          results.push({ leaveId: l._id, action: 'error', error: e.message });
          continue;
        }
        leave.isHalfDay = true;
        leave.halfDayType = keepHalf;
        leave.numberOfDays = 0.5;
        try {
          await leaveRegisterService.addLeaveDebit(leave, null);
        } catch (e) {
          console.error('[leaveAttendanceReconciliation] re-debit narrow failed', e);
          leave.isHalfDay = prevState.isHalfDay;
          leave.halfDayType = prevState.halfDayType;
          leave.numberOfDays = prevState.numberOfDays;
          try {
            await leaveRegisterService.addLeaveDebit(leave, null);
          } catch (e2) {
            console.error('[leaveAttendanceReconciliation] rollback re-debit failed', e2);
          }
          results.push({ leaveId: l._id, action: 'error', error: e.message });
          continue;
        }
        appendRemark(leave, `${dateStr}: ${detail}`);
        await leave.save();
        try {
          await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(leave.employeeId, leave.fromDate);
        } catch (e) {
          console.warn('[leaveAttendanceReconciliation] monthlyApply sync', e?.message);
        }
        try {
          await syncPayRegisterFromLeave(leave);
        } catch (e) {
          console.warn('[leaveAttendanceReconciliation] pay register sync', e?.message);
        }
        results.push({ leaveId: l._id, action: 'narrowed_second' });
        continue;
      }

      if (p2 >= 0.5 && p1 < 0.5) {
        const keepHalf = 'first_half';
        const leave = await Leave.findById(l._id);
        if (!leave || leave.status !== 'approved') continue;
        const detail =
          'Full-day leave narrowed to first half (0.5d): second half attendance supersedes leave; register debits adjusted.';
        if (!isSingle) {
          const splitRes = await splitAndAdjustMultiDayLeave({
            leave,
            dateStr,
            mode: 'narrow_first',
            detail,
            syncPayRegisterFromLeave,
          });
          if (!splitRes.ok) {
            results.push({ leaveId: l._id, action: 'error', error: splitRes.reason });
          } else {
            results.push({ leaveId: l._id, action: 'split_narrowed_first' });
          }
          continue;
        }
        const prevState = {
          isHalfDay: leave.isHalfDay,
          halfDayType: leave.halfDayType,
          numberOfDays: leave.numberOfDays,
        };
        try {
          await leaveRegisterService.reverseLeaveDebit(leave, null);
        } catch (e) {
          console.error('[leaveAttendanceReconciliation] reverse narrow failed', e);
          results.push({ leaveId: l._id, action: 'error', error: e.message });
          continue;
        }
        leave.isHalfDay = true;
        leave.halfDayType = keepHalf;
        leave.numberOfDays = 0.5;
        try {
          await leaveRegisterService.addLeaveDebit(leave, null);
        } catch (e) {
          console.error('[leaveAttendanceReconciliation] re-debit narrow failed', e);
          leave.isHalfDay = prevState.isHalfDay;
          leave.halfDayType = prevState.halfDayType;
          leave.numberOfDays = prevState.numberOfDays;
          try {
            await leaveRegisterService.addLeaveDebit(leave, null);
          } catch (e2) {
            console.error('[leaveAttendanceReconciliation] rollback re-debit failed', e2);
          }
          results.push({ leaveId: l._id, action: 'error', error: e.message });
          continue;
        }
        appendRemark(leave, `${dateStr}: ${detail}`);
        await leave.save();
        try {
          await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(leave.employeeId, leave.fromDate);
        } catch (e) {
          console.warn('[leaveAttendanceReconciliation] monthlyApply sync', e?.message);
        }
        try {
          await syncPayRegisterFromLeave(leave);
        } catch (e) {
          console.warn('[leaveAttendanceReconciliation] pay register sync', e?.message);
        }
        results.push({ leaveId: l._id, action: 'narrowed_first' });
        continue;
      }
    }

    results.push({ leaveId: l._id, action: 'none' });
  }

  const odsToAdjust = await OD.find({
    employeeId: employee._id,
    status: 'approved',
    isActive: { $ne: false },
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select('fromDate toDate isHalfDay halfDayType numberOfDays odType odType_extended status remarks workflow')
    .lean();

  for (const o of odsToAdjust) {
    const tag = `${REMARK_PREFIX} ${dateStr}:`;
    if (String(o.remarks || '').includes(tag)) {
      results.push({ odId: o._id, action: 'skip', reason: 'already_reconciled' });
      continue;
    }
    if (String(o.odType_extended || '') === 'hours') {
      results.push({ odId: o._id, action: 'skip', reason: 'od_hours' });
      continue;
    }
    const fromStr = extractISTComponents(o.fromDate).dateStr;
    const toStr = extractISTComponents(o.toDate).dateStr;
    const od = await OD.findById(o._id);
    if (!od || od.status !== 'approved') continue;
    const isSingleOd = fromStr === toStr;
    const isHalfOd = od.isHalfDay || String(od.odType_extended) === 'half_day' || Number(od.numberOfDays) < 1;

    if (isHalfOd) {
      const onFirst = String(od.halfDayType || 'first_half') !== 'second_half';
      const physConflicts = (onFirst && p1 >= 0.5) || (!onFirst && p2 >= 0.5);
      if (!physConflicts) {
        results.push({ odId: od._id, action: 'none', reason: 'no_conflict_half_od' });
        continue;
      }
      const detail = 'Half-day OD auto-rejected: attendance supersedes this half.';
      if (!isSingleOd) {
        const splitRes = await splitAndAdjustMultiDayOD({
          od,
          dateStr,
          mode: 'reject',
          detail,
          syncPayRegisterFromOD,
        });
        if (!splitRes.ok) {
          results.push({ odId: od._id, action: 'error', error: splitRes.reason });
        } else {
          results.push({ odId: od._id, action: 'split_rejected_od_half' });
        }
        continue;
      }
      od.status = 'rejected';
      if (od.workflow) {
        od.workflow.isCompleted = true;
        od.workflow.currentStepRole = null;
        od.workflow.nextApprover = null;
        od.workflow.nextApproverRole = null;
        od.workflow.history = od.workflow.history || [];
        od.workflow.history.push({
          action: 'rejected',
          comments: `${REMARK_PREFIX} System rejected — ${detail}`,
          timestamp: new Date(),
        });
      }
      appendOdRemark(od, `${dateStr}: ${detail}`);
      await od.save();
      try {
        await syncPayRegisterFromOD(od);
      } catch (e) {
        console.warn('[leaveAttendanceReconciliation] pay register OD sync', e?.message);
      }
      results.push({ odId: od._id, action: 'rejected_od_half' });
      continue;
    }

    if (p1 >= 0.5 && p2 >= 0.5) {
      const detail = 'Full-day OD auto-rejected: same-day full attendance (punches) supersedes OD.';
      if (!isSingleOd) {
        const splitRes = await splitAndAdjustMultiDayOD({
          od,
          dateStr,
          mode: 'reject',
          detail,
          syncPayRegisterFromOD,
        });
        if (!splitRes.ok) {
          results.push({ odId: od._id, action: 'error', error: splitRes.reason });
        } else {
          results.push({ odId: od._id, action: 'split_rejected_od_full' });
        }
        continue;
      }
      od.status = 'rejected';
      if (od.workflow) {
        od.workflow.isCompleted = true;
        od.workflow.currentStepRole = null;
        od.workflow.nextApprover = null;
        od.workflow.nextApproverRole = null;
        od.workflow.history = od.workflow.history || [];
        od.workflow.history.push({
          action: 'rejected',
          comments: `${REMARK_PREFIX} System rejected — ${detail}`,
          timestamp: new Date(),
        });
      }
      appendOdRemark(od, `${dateStr}: ${detail}`);
      await od.save();
      try {
        await syncPayRegisterFromOD(od);
      } catch (e) {
        console.warn('[leaveAttendanceReconciliation] pay register OD sync', e?.message);
      }
      results.push({ odId: od._id, action: 'rejected_od_full' });
      continue;
    }

    if (p1 >= 0.5 && p2 < 0.5) {
      const detail =
        'Full-day OD narrowed to second half (0.5d): first-half attendance supersedes OD.';
      if (!isSingleOd) {
        const splitRes = await splitAndAdjustMultiDayOD({
          od,
          dateStr,
          mode: 'narrow_second',
          detail,
          syncPayRegisterFromOD,
        });
        if (!splitRes.ok) {
          results.push({ odId: od._id, action: 'error', error: splitRes.reason });
        } else {
          results.push({ odId: od._id, action: 'split_narrowed_od_second' });
        }
        continue;
      }
      od.isHalfDay = true;
      od.halfDayType = 'second_half';
      od.numberOfDays = 0.5;
      od.odType_extended = 'half_day';
      appendOdRemark(od, `${dateStr}: ${detail}`);
      if (od.workflow) {
        od.workflow.history = od.workflow.history || [];
        od.workflow.history.push({
          action: 'status_changed',
          comments: `${REMARK_PREFIX} System updated — ${detail}`,
          timestamp: new Date(),
        });
      }
      await od.save();
      try {
        await syncPayRegisterFromOD(od);
      } catch (e) {
        console.warn('[leaveAttendanceReconciliation] pay register OD sync', e?.message);
      }
      results.push({ odId: od._id, action: 'narrowed_od_second' });
      continue;
    }

    if (p2 >= 0.5 && p1 < 0.5) {
      const detail =
        'Full-day OD narrowed to first half (0.5d): second-half attendance supersedes OD.';
      if (!isSingleOd) {
        const splitRes = await splitAndAdjustMultiDayOD({
          od,
          dateStr,
          mode: 'narrow_first',
          detail,
          syncPayRegisterFromOD,
        });
        if (!splitRes.ok) {
          results.push({ odId: od._id, action: 'error', error: splitRes.reason });
        } else {
          results.push({ odId: od._id, action: 'split_narrowed_od_first' });
        }
        continue;
      }
      od.isHalfDay = true;
      od.halfDayType = 'first_half';
      od.numberOfDays = 0.5;
      od.odType_extended = 'half_day';
      appendOdRemark(od, `${dateStr}: ${detail}`);
      if (od.workflow) {
        od.workflow.history = od.workflow.history || [];
        od.workflow.history.push({
          action: 'status_changed',
          comments: `${REMARK_PREFIX} System updated — ${detail}`,
          timestamp: new Date(),
        });
      }
      await od.save();
      try {
        await syncPayRegisterFromOD(od);
      } catch (e) {
        console.warn('[leaveAttendanceReconciliation] pay register OD sync', e?.message);
      }
      results.push({ odId: od._id, action: 'narrowed_od_first' });
      continue;
    }

    results.push({ odId: od._id, action: 'none' });
  }

  return { ran: true, results };
}

/**
 * Run leave/OD reconciliation for each AttendanceDaily in a payroll window.
 * Used before monthly summary aggregation (bulk recalc, calculateMonthlySummary).
 * @param {import('mongoose').Document} employee
 * @param {string} startDateStr YYYY-MM-DD
 * @param {string} endDateStr YYYY-MM-DD
 */
async function reconcileEmployeePayPeriodBeforeSummary(employee, startDateStr, endDateStr) {
  const empNoNorm =
    employee?.emp_no && String(employee.emp_no).trim()
      ? String(employee.emp_no).trim().toUpperCase()
      : '';
  if (!empNoNorm || !startDateStr || !endDateStr) return { daysProcessed: 0 };

  const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
  const dailies = await AttendanceDaily.find({
    employeeNumber: empNoNorm,
    date: { $gte: startDateStr, $lte: endDateStr },
  })
    .sort({ date: 1 })
    .lean();

  let daysProcessed = 0;
  for (const daily of dailies) {
    if (!daily?.date) continue;
    await runLeaveAttendanceReconciliation(employee, daily.date, daily);
    daysProcessed += 1;
  }
  return { daysProcessed };
}

module.exports = {
  runLeaveAttendanceReconciliation,
  reconcileEmployeePayPeriodBeforeSummary,
  computeRawAttendanceHalfCredits,
  /** tests / diagnostics */
  _REMARK_PREFIX: REMARK_PREFIX,
};
