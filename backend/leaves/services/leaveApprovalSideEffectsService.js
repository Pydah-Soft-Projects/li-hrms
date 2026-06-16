/**
 * Deferred side effects after leave status / ledger changes.
 * Heavy work (monthly summary, pay register rebuild, ESI OT) runs once per save,
 * off the HTTP request path, with in-tick deduplication.
 */

const pendingByLeaveId = new Map();

const FINAL_HEAVY_STATUSES = new Set(['approved', 'rejected', 'cancelled']);

function serializeLeaveForSideEffects(leave) {
  if (!leave) return null;
  const plain = typeof leave.toObject === 'function' ? leave.toObject() : { ...leave };
  return {
    _id: plain._id,
    employeeId: plain.employeeId,
    emp_no: plain.emp_no,
    fromDate: plain.fromDate,
    toDate: plain.toDate,
    status: plain.status,
    leaveType: plain.leaveType,
    isActive: plain.isActive,
  };
}

function mergeOptions(existing = {}, incoming = {}) {
  const out = { ...existing, ...incoming };
  if (existing.esiOptions || incoming.esiOptions) {
    out.esiOptions = { ...(existing.esiOptions || {}), ...(incoming.esiOptions || {}) };
  }
  const extra = [
    ...(existing.extraLeaveSnapshots || []),
    ...(incoming.extraLeaveSnapshots || []),
  ];
  if (extra.length) {
    out.extraLeaveSnapshots = extra.map(serializeLeaveForSideEffects).filter(Boolean);
  }
  if (existing.forceHeavyRefresh || incoming.forceHeavyRefresh) {
    out.forceHeavyRefresh = true;
  }
  return out;
}

function shouldRunHeavyEffects(leave, options = {}) {
  if (options.forceHeavyRefresh) return true;
  return FINAL_HEAVY_STATUSES.has(String(leave?.status || ''));
}

/**
 * Schedule background side effects (deduped per leave id within the same event loop tick).
 */
function scheduleLeaveStatusSideEffects(leave, options = {}) {
  const snap = serializeLeaveForSideEffects(leave);
  if (!snap?._id) return;

  const leaveId = String(snap._id);
  let entry = pendingByLeaveId.get(leaveId);
  if (!entry) {
    entry = { snap, options: {}, timerScheduled: false };
    pendingByLeaveId.set(leaveId, entry);
  }
  entry.snap = snap;
  entry.options = mergeOptions(entry.options, options);

  if (entry.timerScheduled) return;
  entry.timerScheduled = true;

  setImmediate(async () => {
    const current = pendingByLeaveId.get(leaveId);
    pendingByLeaveId.delete(leaveId);
    if (!current) return;
    try {
      await runLeaveStatusSideEffects(current.snap, current.options);
    } catch (err) {
      console.error(`[leaveSideEffects] failed for leave ${leaveId}:`, err?.message || err);
    }
  });
}

/**
 * Run monthly summary + pay register + ESI updates once.
 */
async function runLeaveStatusSideEffects(leaveSnap, options = {}) {
  if (!shouldRunHeavyEffects(leaveSnap, options)) {
    return { skipped: true, reason: 'intermediate_status' };
  }

  const { recalculateOnLeaveApproval } = require('../../attendance/services/summaryCalculationService');
  const { syncPayRegisterFromLeave } = require('../../pay-register/services/autoSyncService');
  const { syncEsiLeaveOtForLeave, isEsiLeaveType } = require('../../overtime/services/esiLeaveOtService');

  const snapshots = [];
  const seen = new Set();
  const pushSnap = (snap) => {
    const s = serializeLeaveForSideEffects(snap);
    if (!s?._id) return;
    const key = `${s._id}|${s.fromDate}|${s.toDate}|${s.status}`;
    if (seen.has(key)) return;
    seen.add(key);
    snapshots.push(s);
  };

  for (const extra of options.extraLeaveSnapshots || []) {
    pushSnap(extra);
  }
  pushSnap(leaveSnap);

  for (const snap of snapshots) {
    await recalculateOnLeaveApproval(snap);
  }

  await syncPayRegisterFromLeave(leaveSnap);

  if (isEsiLeaveType(leaveSnap.leaveType)) {
    await syncEsiLeaveOtForLeave(leaveSnap, options.esiOptions || {});
  }

  return { ok: true };
}

module.exports = {
  scheduleLeaveStatusSideEffects,
  runLeaveStatusSideEffects,
  serializeLeaveForSideEffects,
};
