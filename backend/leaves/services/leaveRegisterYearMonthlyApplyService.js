/**
 * Persists monthly apply ceiling & consumption on LeaveRegisterYear.months[] so UIs read stored values.
 * Ceiling = min(scheduled pool, policy cap); consumption = cap-counting leaves (pending + approved).
 */

const LeaveRegisterYear = require('../model/LeaveRegisterYear');
const Leave = require('../model/Leave');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const dateCycleService = require('./dateCycleService');
const {
  CAP_COUNT_STATUSES,
  countedDaysForLeave,
  computeScheduledPoolApplyCeiling,
} = require('./monthlyApplicationCapService');

function findSlotIndex(months, pcMonth, pcYear) {
  if (!Array.isArray(months)) return -1;
  return months.findIndex(
    (m) =>
      Number(m.payrollCycleMonth) === Number(pcMonth) &&
      Number(m.payrollCycleYear) === Number(pcYear)
  );
}

/**
 * Recompute and save monthlyApply* fields on the payroll slot that contains fromDate.
 */
async function syncStoredMonthApplyFieldsForEmployeeDate(employeeId, fromDate) {
  if (!employeeId || !fromDate) return { ok: false, reason: 'bad_args' };
  const policy = await LeavePolicySettings.getSettings().catch(() => ({}));
  const periodInfo = await dateCycleService.getPeriodInfo(fromDate);
  const { startDate: start, endDate: end } = periodInfo.payrollCycle;
  const pc = periodInfo.payrollCycle;
  const fy = await dateCycleService.getFinancialYearForDate(fromDate);

  const doc = await LeaveRegisterYear.findOne({
    employeeId,
    financialYear: fy.name,
  });
  if (!doc || !doc.months?.length) return { ok: false, reason: 'no_year_doc' };

  const idx = findSlotIndex(doc.months, pc.month, pc.year);
  if (idx < 0) return { ok: false, reason: 'no_slot' };

  const slot = doc.months[idx];
  const scheduled = {
    clCredits: slot.clCredits,
    compensatoryOffs: slot.compensatoryOffs,
    elCredits: slot.elCredits,
  };
  const ceilingRaw = computeScheduledPoolApplyCeiling(scheduled, policy);
  if (ceilingRaw != null && Number.isFinite(ceilingRaw)) {
    slot.monthlyApplyCeiling = Math.max(0, ceilingRaw);
  }

  const leaves = await Leave.find({
    employeeId,
    isActive: true,
    status: { $in: CAP_COUNT_STATUSES },
    fromDate: { $gte: start, $lte: end },
  })
    .select('leaveType numberOfDays status')
    .lean();

  let consumed = 0;
  let locked = 0;
  let approvedSum = 0;
  for (const l of leaves) {
    const d = countedDaysForLeave(l, policy);
    if (d <= 0) continue;
    consumed += d;
    if (String(l.status) === 'approved') approvedSum += d;
    else locked += d;
  }

  slot.monthlyApplyConsumed = consumed;
  slot.monthlyApplyLocked = locked;
  slot.monthlyApplyApproved = approvedSum;
  slot.monthlyApplySyncedAt = new Date();

  doc.markModified(`months.${idx}`);
  await doc.save();
  return {
    ok: true,
    ceiling: slot.monthlyApplyCeiling,
    consumed,
    locked,
    approvedSum,
  };
}

/**
 * Context for leave apply UI (CL): stored slot caps + FY balances.
 * @param {boolean} [options.refresh] - force sync before read
 */
async function getApplyPeriodContextForEmployee(employeeId, fromDate, options = {}) {
  const { refresh = false } = options;
  if (!employeeId || !fromDate) {
    return { ok: false, error: 'employeeId and fromDate required' };
  }

  if (refresh) {
    await syncStoredMonthApplyFieldsForEmployeeDate(employeeId, fromDate);
  }

  const policy = await LeavePolicySettings.getSettings().catch(() => ({}));
  const periodInfo = await dateCycleService.getPeriodInfo(fromDate);
  const start = periodInfo.payrollCycle.startDate;
  const end = periodInfo.payrollCycle.endDate;
  const pc = periodInfo.payrollCycle;
  const fy = await dateCycleService.getFinancialYearForDate(fromDate);

  let doc = await LeaveRegisterYear.findOne({
    employeeId,
    financialYear: fy.name,
  }).lean();

  if (!doc?.months?.length) {
    return {
      ok: true,
      hasYearDoc: false,
      financialYear: fy.name,
      payrollCycle: { start, end, month: pc.month, year: pc.year },
    };
  }

  const idx = findSlotIndex(doc.months, pc.month, pc.year);
  if (idx < 0) {
    return {
      ok: true,
      hasYearDoc: true,
      hasSlot: false,
      financialYear: fy.name,
      payrollCycle: { start, end, month: pc.month, year: pc.year },
      balances: {
        cl: doc.casualBalance,
        ccl: doc.compensatoryOffBalance,
        el: doc.earnedLeaveBalance,
      },
    };
  }

  const slot = doc.months[idx];
  let needsSync =
    refresh ||
    slot.monthlyApplyCeiling == null ||
    slot.monthlyApplyConsumed == null;

  if (needsSync) {
    await syncStoredMonthApplyFieldsForEmployeeDate(employeeId, fromDate);
    doc = await LeaveRegisterYear.findOne({
      employeeId,
      financialYear: fy.name,
    }).lean();
  }

  const slotFresh = doc.months[idx];
  const ceiling = slotFresh.monthlyApplyCeiling;
  const consumed = slotFresh.monthlyApplyConsumed;
  const locked = slotFresh.monthlyApplyLocked;
  const approvedSum = slotFresh.monthlyApplyApproved;

  const remaining =
    ceiling != null && consumed != null
      ? Math.max(0, Number(ceiling) - Number(consumed))
      : null;

  const includeEL =
    !!policy?.earnedLeave?.enabled &&
    !!policy?.monthlyLeaveApplicationCap?.includeEL &&
    policy?.earnedLeave?.useAsPaidInPayroll === false;

  return {
    ok: true,
    hasYearDoc: true,
    hasSlot: true,
    financialYear: fy.name,
    payrollLabel: slotFresh.label,
    payrollCycle: { start, end, month: pc.month, year: pc.year },
    scheduledCl: Number(slotFresh.clCredits) || 0,
    scheduledCcl: Number(slotFresh.compensatoryOffs) || 0,
    scheduledEl: includeEL ? Number(slotFresh.elCredits) || 0 : null,
    monthlyApplyCeiling: ceiling,
    monthlyApplyConsumed: consumed,
    monthlyApplyLocked: locked,
    monthlyApplyApproved: approvedSum,
    monthlyApplyRemaining: remaining,
    monthlyApplySyncedAt: slotFresh.monthlyApplySyncedAt || null,
    balances: {
      cl: doc.casualBalance,
      ccl: doc.compensatoryOffBalance,
      el: includeEL ? doc.earnedLeaveBalance : null,
    },
    includeELInMonthlyPool: includeEL,
  };
}

function scheduleSyncMonthApply(employeeId, fromDate) {
  if (!employeeId || !fromDate) return;
  setImmediate(() => {
    syncStoredMonthApplyFieldsForEmployeeDate(employeeId, fromDate).catch((e) => {
      console.warn('[monthlyApply sync]', e?.message || e);
    });
  });
}

module.exports = {
  syncStoredMonthApplyFieldsForEmployeeDate,
  getApplyPeriodContextForEmployee,
  scheduleSyncMonthApply,
};
