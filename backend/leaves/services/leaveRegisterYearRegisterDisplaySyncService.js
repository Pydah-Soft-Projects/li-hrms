/**
 * Persists per-payroll-slot register grid aggregates (CL / CCL / EL pool math) on LeaveRegisterYear.months[].registerDisplaySnapshot.
 * Uses the same computation as leave register API (getLeaveRegister → registerMonths) so stored numbers match the UI.
 */

const mongoose = require('mongoose');
const LeaveRegisterYear = require('../model/LeaveRegisterYear');

function scheduleRegisterDisplaySnapshotSync(employeeId, financialYear) {
  const fy = String(financialYear || '').trim();
  if (!employeeId || !fy) return;
  setImmediate(() => {
    try {
      syncRegisterDisplaySnapshotsForEmployeeFy(employeeId, fy).catch((e) => {
        console.warn('[registerDisplaySnapshot]', e?.message || e);
      });
    } catch (e) {
      console.warn('[registerDisplaySnapshot]', e?.message || e);
    }
  });
}

/**
 * @returns {{ ok: boolean, slotsUpdated?: number, reason?: string }}
 */
async function syncRegisterDisplaySnapshotsForEmployeeFy(employeeId, financialYear) {
  const fy = String(financialYear || '').trim();
  if (!employeeId || !fy) return { ok: false, reason: 'bad_args' };

  const leaveRegisterService = require('./leaveRegisterService');
  const eid = mongoose.Types.ObjectId.isValid(employeeId) ? new mongoose.Types.ObjectId(employeeId) : employeeId;

  let data;
  try {
    data = await leaveRegisterService.getLeaveRegister({ employeeId: eid, financialYear: fy }, null, null);
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }

  const row = Array.isArray(data) ? data[0] : data?.entries?.[0];
  const months = row?.registerMonths;
  if (!Array.isArray(months) || months.length === 0) {
    return { ok: false, reason: 'no_register_months' };
  }

  const doc = await LeaveRegisterYear.findOne({ employeeId: eid, financialYear: fy });
  if (!doc?.months?.length) {
    return { ok: false, reason: 'no_year_doc' };
  }

  const syncedAt = new Date();
  let slotsUpdated = 0;

  for (const rm of months) {
    const pm = Number(rm.month);
    const py = Number(rm.year);
    if (!Number.isFinite(pm) || !Number.isFinite(py)) continue;
    const idx = doc.months.findIndex(
      (s) => Number(s.payrollCycleMonth) === pm && Number(s.payrollCycleYear) === py
    );
    if (idx < 0) continue;

    const cl = rm.cl || {};
    const ccl = rm.ccl || {};
    const el = rm.el || {};

    doc.months[idx].registerDisplaySnapshot = {
      syncedAt,
      cl: {
        policyCr: rm.policyScheduledCl ?? null,
        scheduledTotal: rm.scheduledCl ?? null,
        transferIn: cl.transferIn ?? null,
        used: cl.used ?? null,
        locked: cl.locked ?? null,
        transferOut: cl.transferOut ?? null,
        poolBalance: cl.poolBalance ?? null,
      },
      ccl: {
        policyCr: rm.policyScheduledCco ?? null,
        scheduledTotal: rm.scheduledCco ?? null,
        transferIn: ccl.transferIn ?? null,
        used: ccl.used ?? null,
        locked: ccl.locked ?? null,
        transferOut: ccl.transferOut ?? null,
        poolBalance: ccl.poolBalance ?? null,
        ledgerBalance: rm.cclBalance ?? null,
      },
      el: {
        policyCr: rm.policyScheduledEl ?? null,
        scheduledTotal: rm.scheduledEl ?? null,
        transferIn: el.transferIn ?? null,
        used: el.used ?? null,
        locked: el.locked ?? null,
        transferOut: el.transferOut ?? null,
        poolBalance: el.poolBalance ?? null,
      },
    };
    doc.markModified(`months.${idx}.registerDisplaySnapshot`);
    slotsUpdated++;
  }

  doc.markModified('months');
  await doc.save();
  return { ok: true, slotsUpdated };
}

module.exports = {
  syncRegisterDisplaySnapshotsForEmployeeFy,
  scheduleRegisterDisplaySnapshotSync,
};
