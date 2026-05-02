/**
 * Used by reconcile_leave_register_pool_transactions.js before pool strip/replay:
 * clears monthly-apply "locked" state by rejecting in-pipeline leaves that still count
 * toward the payroll-period cap, syncs stored apply fields, and zeros admin `lockedCredits`
 * on all FY slots for the employee (legacy admin lock is not used for pool carry; reconcile
 * clears it so replay matches pipeline-only locks via `monthlyApplyLocked` / sub-ledger).
 */

const mongoose = require('mongoose');
const Leave = require('../model/Leave');
const LeaveRegisterYear = require('../model/LeaveRegisterYear');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const leaveRegisterYearMonthlyApplyService = require('./leaveRegisterYearMonthlyApplyService');
const {
  PENDING_PIPELINE_STATUSES,
  sumCountedCapDaysForLeaveInPeriod,
} = require('./monthlyApplicationCapService');

function slotKey(pm, py) {
  return `${Number(py)}-${Number(pm)}`;
}

/**
 * @param {import('mongoose').Types.ObjectId|string} employeeId
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<{ dryRun: boolean, slotsScanned: number, leavesRejected: number, leaveIds: string[], syncPeriods: number, lockedCreditsSlotsCleared: number }>}
 */
async function clearPendingMonthlyCapLocksForEmployee(employeeId, options = {}) {
  const dryRun = !!options.dryRun;
  const eid =
    employeeId instanceof mongoose.Types.ObjectId
      ? employeeId
      : mongoose.Types.ObjectId.isValid(String(employeeId))
        ? new mongoose.Types.ObjectId(String(employeeId))
        : employeeId;

  const policy = await LeavePolicySettings.getSettings().catch(() => ({}));

  const docs = await LeaveRegisterYear.find({ employeeId: eid }).sort({ financialYearStart: 1 }).lean();

  const lockSlots = [];
  let legacyLockedMonthCount = 0;

  for (const d of docs) {
    for (const s of d.months || []) {
      if (Number(s.lockedCredits) > 0) legacyLockedMonthCount += 1;
      const lockedApply = Number(s.monthlyApplyLocked) || 0;
      const lockedAdm = Number(s.lockedCredits) || 0;
      if (lockedApply <= 0 && lockedAdm <= 0) continue;
      if (!s.payPeriodStart || !s.payPeriodEnd) continue;
      lockSlots.push({
        fyId: d._id,
        financialYear: d.financialYear,
        pm: Number(s.payrollCycleMonth),
        py: Number(s.payrollCycleYear),
        label: s.label || `${s.payrollCycleMonth}/${s.payrollCycleYear}`,
        start: new Date(s.payPeriodStart),
        end: new Date(s.payPeriodEnd),
      });
    }
  }

  const toReject = new Map();
  for (const w of lockSlots) {
    const leaves = await Leave.find({
      employeeId: eid,
      isActive: true,
      status: { $in: PENDING_PIPELINE_STATUSES },
      fromDate: { $lte: w.end },
      toDate: { $gte: w.start },
    })
      .select('_id status leaveType fromDate toDate splitStatus numberOfDays emp_no')
      .lean();

    for (const row of leaves) {
      const capDays = await sumCountedCapDaysForLeaveInPeriod(row, policy, w.start, w.end);
      if (capDays <= 0) continue;
      const idStr = String(row._id);
      if (!toReject.has(idStr)) {
        toReject.set(idStr, { id: row._id, status: row.status, emp_no: row.emp_no, capLabel: w.label });
      }
    }
  }

  if (dryRun) {
    return {
      dryRun: true,
      slotsScanned: lockSlots.length,
      leavesRejected: toReject.size,
      leaveIds: [...toReject.keys()],
      syncPeriods: 0,
      lockedCreditsSlotsCleared: legacyLockedMonthCount,
    };
  }

  let leavesRejected = 0;
  const leaveIds = [];

  for (const [, meta] of toReject) {
    const doc = await Leave.findById(meta.id);
    if (!doc || !doc.isActive) continue;
    if (!PENDING_PIPELINE_STATUSES.includes(String(doc.status))) continue;

    doc.status = 'rejected';
    if (doc.workflow && typeof doc.workflow === 'object') {
      doc.workflow.nextApproverRole = null;
      doc.workflow.nextApprover = null;
      doc.workflow.currentStepRole = null;
    }
    doc.markModified('status');
    doc.markModified('workflow');
    await doc.save();
    leavesRejected += 1;
    leaveIds.push(String(meta.id));
  }

  /** Sync any month that had pipeline lock windows and any month with legacy `lockedCredits` + pay bounds. */
  const syncByKey = new Map();
  const addSync = (pm, py, start, end) => {
    const k = slotKey(pm, py);
    if (syncByKey.has(k)) return;
    if (!start || !end) return;
    syncByKey.set(k, new Date((start.getTime() + end.getTime()) / 2));
  };
  for (const w of lockSlots) addSync(w.pm, w.py, w.start, w.end);
  for (const d of docs) {
    for (const s of d.months || []) {
      if (!(Number(s.lockedCredits) > 0)) continue;
      if (!s.payPeriodStart || !s.payPeriodEnd) continue;
      addSync(
        Number(s.payrollCycleMonth),
        Number(s.payrollCycleYear),
        new Date(s.payPeriodStart),
        new Date(s.payPeriodEnd)
      );
    }
  }

  for (const mid of syncByKey.values()) {
    try {
      await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(eid, mid);
    } catch {
      /* best-effort */
    }
  }

  let lockedCreditsSlotsCleared = 0;
  const allDocs = await LeaveRegisterYear.find({ employeeId: eid });
  for (const doc of allDocs) {
    let touched = false;
    for (let i = 0; i < (doc.months || []).length; i++) {
      if (Number(doc.months[i].lockedCredits) > 0) {
        doc.months[i].lockedCredits = 0;
        lockedCreditsSlotsCleared += 1;
        touched = true;
        doc.markModified(`months.${i}`);
      }
    }
    if (touched) {
      await doc.save();
    }
  }

  return {
    dryRun: false,
    slotsScanned: lockSlots.length,
    leavesRejected,
    leaveIds,
    syncPeriods: syncByKey.size,
    lockedCreditsSlotsCleared,
  };
}

module.exports = {
  clearPendingMonthlyCapLocksForEmployee,
};
