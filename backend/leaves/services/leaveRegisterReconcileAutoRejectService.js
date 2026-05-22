/**
 * Auto-reject stale pending **Leave** applications in payroll periods that have already ended.
 * OD, Permission, and OT are not touched (separate workflows).
 * Runs as part of leave-register transfer reconcile (--apply) so register + leave apps stay aligned.
 */

const { autoRejectPendingRequestsForPayrollPeriods } = require('../../shared/services/payrollBatchAutoRejectService');
const { isPayrollPeriodEndedOnOrBeforeAsOf } = require('./payrollPeriodDateUtils');

function monthKey(slot) {
  return `${Number(slot?.payrollCycleMonth)}/${Number(slot?.payrollCycleYear)}`;
}

/**
 * Build employee payroll windows for ended slots from FY opening through target opening (inclusive).
 */
function collectEndedPayrollPeriodsForReconcile(employeeId, orderedSlotRefs, targetIdx, asOf = new Date()) {
  const periods = [];
  if (!employeeId || !Array.isArray(orderedSlotRefs) || targetIdx < 0) return periods;

  for (let p = 0; p <= targetIdx; p++) {
    const slot = orderedSlotRefs[p]?.slot;
    if (!slot?.payPeriodStart || !slot?.payPeriodEnd) continue;
    if (!isPayrollPeriodEndedOnOrBeforeAsOf(slot.payPeriodEnd, asOf)) continue;
    periods.push({
      employeeId,
      startDate: slot.payPeriodStart,
      endDate: slot.payPeriodEnd,
      label: slot.label || monthKey(slot),
      payrollCycleMonth: slot.payrollCycleMonth,
      payrollCycleYear: slot.payrollCycleYear,
    });
  }
  return periods;
}

/** Reject non-final Leave applications overlapping ended payroll periods only. */
async function autoRejectStalePendingForRegisterReconcile(
  employeeId,
  orderedSlotRefs,
  targetIdx,
  options = {}
) {
  const asOf = options.asOf instanceof Date ? options.asOf : new Date();
  const dryRun = options.dryRun === true;
  const userId = options.userId ?? null;
  const periods = collectEndedPayrollPeriodsForReconcile(employeeId, orderedSlotRefs, targetIdx, asOf);

  if (!periods.length) {
    return {
      dryRun,
      skipped: true,
      reason: 'no_ended_payroll_periods_in_scope',
      periodsInScope: [],
      leaveRejected: 0,
      odRejected: 0,
      permissionRejected: 0,
      otRejected: 0,
      rejected: [],
    };
  }

  const periodLabels = periods.map((p) => p.label).join(', ');
  const reason =
    options.reason ||
    `Auto-rejected: payroll period closed (leave register reconcile${periodLabels ? ` — ${periodLabels}` : ''})`;

  const summary = await autoRejectPendingRequestsForPayrollPeriods(periods, userId, reason, {
    dryRun,
    leaveOnly: true,
  });

  return {
    ...summary,
    skipped: false,
    periodsInScope: periods.map((p) => ({
      label: p.label,
      payrollCycleMonth: p.payrollCycleMonth,
      payrollCycleYear: p.payrollCycleYear,
      startDate: p.startDate,
      endDate: p.endDate,
    })),
  };
}

module.exports = {
  collectEndedPayrollPeriodsForReconcile,
  autoRejectStalePendingForRegisterReconcile,
};
