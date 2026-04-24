/**
 * When actual attendance (punches) shows presence for a full or half day, adjust approved
 * single-day leave so register debits match reality: full reject, or narrow full-day to one half.
 *
 * Scope (v1): one calendar day per leave (fromDate and toDate same); not split_approved; not ESI.
 * Multi-day and split-approval leaves are skipped.
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

  const { syncPayRegisterFromLeave } = require('../../pay-register/services/autoSyncService');
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
    if (!isSingleCalendarDayLeave(l)) {
      results.push({ leaveId: l._id, action: 'skip', reason: 'multi_day' });
      continue;
    }
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

  return { ran: true, results };
}

module.exports = {
  runLeaveAttendanceReconciliation,
  computeRawAttendanceHalfCredits,
  /** tests / diagnostics */
  _REMARK_PREFIX: REMARK_PREFIX,
};
