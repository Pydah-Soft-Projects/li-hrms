/**
 * When actual attendance (punches) shows physical presence for a full or half day,
 * adjust approved leave/OD so summary contributions come only from valid non-conflicting halves.
 *
 * Scope (current):
 * - Leave: single-day rows are auto-reconciled (reject/narrow). Multi-day is skipped.
 * - OD: single-day full/half-day rows are auto-reconciled (reject/narrow). Multi-day/hours are skipped.
 */

const Settings = require('../../settings/model/Settings');
const Leave = require('../model/Leave');
const OD = require('../model/OD');
const leaveRegisterService = require('./leaveRegisterService');
const leaveRegisterYearMonthlyApplyService = require('./leaveRegisterYearMonthlyApplyService');
const { assertEmployeeDateRequestsEditable } = require('../../shared/services/payrollRequestLockService');
const { extractISTComponents, createISTDate } = require('../../shared/utils/dateUtils');
const { isEsiLeaveType } = require('../../overtime/services/esiLeaveOtService');

const REMARK_PREFIX = '[Auto attendance reconciliation]';

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

/**
 * Raw attendance half credits (aligned with summaryCalculationService before OD "dayPresent" net).
 * @param {import('mongoose').Document} daily - AttendanceDaily
 * @param {Array} ods - approved OD lean docs for that calendar day
 */
function computeRawAttendanceHalfCredits(daily, ods) {
  let attFirst = 0;
  let attSecond = 0;
  if (!daily) return { attFirst, attSecond };

  const st = String(daily.status || '').toUpperCase();
  if (st === 'HOLIDAY' || st === 'WEEK_OFF') {
    return { attFirst, attSecond };
  }

  const dayOds = Array.isArray(ods) ? ods : [];
  if (st === 'PRESENT') {
    attFirst = 0.5;
    attSecond = 0.5;
  } else if (st === 'HALF_DAY') {
    const eo = Number(daily.totalEarlyOutMinutes) || 0;
    const li = Number(daily.totalLateInMinutes) || 0;
    if (eo > li) attFirst = 0.5;
    else if (li > eo) attSecond = 0.5;
    else attFirst = 0.5;
  } else if (st === 'OD' && dayOds.length > 0) {
    const halfOd = dayOds.find(
      (o) =>
        o &&
        o.isHalfDay &&
        o.odType_extended === 'half_day' &&
        (o.halfDayType === 'first_half' || o.halfDayType === 'second_half')
    );
    if (halfOd) {
      const shifts = Array.isArray(daily.shifts) ? daily.shifts : [];
      const hasIn = shifts.some((s) => s && s.inTime) || !!daily.inTime;
      const hasOut = shifts.some((s) => s && s.outTime) || !!daily.outTime;
      if (halfOd.halfDayType === 'second_half' && hasIn) attFirst = 0.5;
      else if (halfOd.halfDayType === 'first_half' && hasOut) attSecond = 0.5;
    }
  }
  // PARTIAL / ABSENT / incomplete: no raw half credits (do not auto-adjust leave in v1)

  return { attFirst, attSecond };
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

  const keepHalfType = mode === 'narrow_second' ? 'second_half' : mode === 'narrow_first' ? 'first_half' : null;
  const keepNumber = mode === 'reject' ? 0 : 0.5;

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
    leave.fromDate = createISTDate(dateStr, '00:00');
    leave.toDate = createISTDate(dateStr, '23:59');
    leave.isHalfDay = true;
    leave.halfDayType = keepHalfType;
    leave.numberOfDays = keepNumber;
    addWorkflowHistory(leave, 'status_changed', `${REMARK_PREFIX} System updated — ${detail}`);
    appendRemark(leave, `${dateStr}: ${detail}`);
    await leave.save();
    await leaveRegisterService.addLeaveDebit(leave, null);
    toSync.push(leave);
  }

  if (hasBefore) {
    const b = new Leave({
      ...base,
      fromDate: createISTDate(beforeFrom, '00:00'),
      toDate: createISTDate(beforeTo, '23:59'),
      isHalfDay: false,
      halfDayType: null,
      numberOfDays: daysInclusive(createISTDate(beforeFrom), createISTDate(beforeTo)),
      splitStatus: null,
      remarks: `${String(base.remarks || '').trim()}${base.remarks ? '\n' : ''}${REMARK_PREFIX} ${dateStr}: System split preserved prior days (${beforeFrom}..${beforeTo}).`,
    });
    await b.save();
    await leaveRegisterService.addLeaveDebit(b, null);
    toSync.push(b);
  }

  if (hasAfter) {
    const a = new Leave({
      ...base,
      fromDate: createISTDate(afterFrom, '00:00'),
      toDate: createISTDate(afterTo, '23:59'),
      isHalfDay: false,
      halfDayType: null,
      numberOfDays: daysInclusive(createISTDate(afterFrom), createISTDate(afterTo)),
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
async function runLeaveAttendanceReconciliation(employee, dateStr, daily) {
  // Bulk re-save scripts set SKIP_LEAVE_ATTENDANCE_RECONCILIATION=1 to avoid mass leave changes
  if (process.env.SKIP_LEAVE_ATTENDANCE_RECONCILIATION === '1') {
    return { ran: false, reason: 'skipped_by_env' };
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
  const { attFirst, attSecond } = computeRawAttendanceHalfCredits(daily, ods);
  const { p1, p2 } = physicalMask(attFirst, attSecond);
  const physTotal = p1 + p2;
  if (physTotal < 0.5 - 1e-6) {
    return { ran: true, reason: 'no_physical_coverage' };
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
    .select('fromDate toDate isHalfDay halfDayType numberOfDays leaveType leaveNature status splitStatus remarks')
    .lean();

  const { syncPayRegisterFromLeave, syncPayRegisterFromOD } = require('../../pay-register/services/autoSyncService');
  const results = [];

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

    const { l1, l2 } = leaveHalfMask(l);

    if (l.isHalfDay) {
      const onFirst = l1 > 0;
      const physConflicts = (onFirst && p1 >= 0.5) || (!onFirst && p2 >= 0.5);
      if (!physConflicts) {
        results.push({ leaveId: l._id, action: 'none', reason: 'no_conflict_half_leave' });
        continue;
      }
      const leave = await Leave.findById(l._id);
      if (!leave || leave.status !== 'approved') continue;

      const detail = 'Half-day leave auto-rejected: attendance supersedes this half.';
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

    if (!l.isHalfDay && Number(l.numberOfDays) >= 1 - 1e-6) {
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

module.exports = {
  runLeaveAttendanceReconciliation,
  computeRawAttendanceHalfCredits,
  /** tests / diagnostics */
  _REMARK_PREFIX: REMARK_PREFIX,
};
