const mongoose = require('mongoose');
const { getPromotionPayrollContext } = require('./promotionPayrollCycleContextService');
const { fetchAttendanceDataForEmployeeMonths } = require('../../payroll/services/attendanceRangeDataService');
const ArrearsService = require('../../arrears/services/arrearsService');

function compareYm(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Prorated salary difference from effective payroll month through the last closed pay month
 * (same as promotions UI: respects payroll cycle + batch completion; excludes the open pay run).
 *
 * @param {import('mongoose').Document} promotionDoc - PromotionTransferRequest (not necessarily populated)
 * @returns {Promise<{ totalAmount: number; startLabel: string; endLabel: string; skipped: boolean; reason?: string }>}
 */
async function computePromotionArrearAmount(promotionDoc) {
  const empId = promotionDoc.employeeId?._id || promotionDoc.employeeId;
  if (!empId) {
    return { totalAmount: 0, startLabel: '', endLabel: '', skipped: true, reason: 'missing_employee' };
  }

  const y = parseInt(promotionDoc.effectivePayrollYear, 10);
  const m = parseInt(promotionDoc.effectivePayrollMonth, 10);
  if (!y || m < 1 || m > 12) {
    return { totalAmount: 0, startLabel: '', endLabel: '', skipped: true, reason: 'missing_effective_month' };
  }

  const prevG = Number(promotionDoc.previousGrossSalary);
  const nextG = Number(promotionDoc.newGrossSalary);
  if (!Number.isFinite(prevG) || !Number.isFinite(nextG)) {
    return { totalAmount: 0, startLabel: '', endLabel: '', skipped: true, reason: 'missing_salary_values' };
  }
  if (nextG <= prevG) {
    return { totalAmount: 0, startLabel: '', endLabel: '', skipped: true, reason: 'not_a_raise' };
  }

  const startLabel = `${y}-${String(m).padStart(2, '0')}`;
  let arrearEnd;
  try {
    const ctx = await getPromotionPayrollContext();
    arrearEnd = ctx.arrearProrationEndLabel;
  } catch (e) {
    return { totalAmount: 0, startLabel, endLabel: '', skipped: true, reason: `payroll_context_error:${e.message}` };
  }
  const endLabel = arrearEnd;

  if (compareYm(startLabel, endLabel) > 0) {
    return {
      totalAmount: 0,
      startLabel,
      endLabel,
      skipped: true,
      reason: 'effective_month_after_current_cycle',
    };
  }

  const rows = await fetchAttendanceDataForEmployeeMonths(empId, startLabel, endLabel);
  let sum = 0;
  for (const r of rows) {
    const totalDays = Number(r.totalDaysInMonth) || 0;
    const paidDays = Number(r.attendance?.totalPaidDays) || 0;
    if (totalDays <= 0) continue;
    const proratedPrev = (prevG / totalDays) * paidDays;
    const proratedNext = (nextG / totalDays) * paidDays;
    sum += proratedNext - proratedPrev;
  }

  const totalAmount = Math.round(sum * 100) / 100;
  return { totalAmount, startLabel, endLabel, skipped: false };
}

/**
 * After a promotion request is fully approved, create payroll-ready direct arrears (non-blocking for caller on soft skips).
 *
 * @param {import('mongoose').Document} promotionDoc - saved PromotionTransferRequest
 * @param {import('mongoose').Types.ObjectId|string} approverUserId
 * @returns {Promise<{ ok: boolean; skipped?: boolean; message?: string; arrearsId?: string; warning?: string }>}
 */
async function createDirectArrearForApprovedPromotion(promotionDoc, approverUserId) {
  if (!promotionDoc || !['promotion', 'increment'].includes(promotionDoc.requestType)) {
    return { ok: true, skipped: true, message: 'not_promotion_or_increment' };
  }

  const empId = promotionDoc.employeeId?._id || promotionDoc.employeeId;
  if (!empId || !mongoose.Types.ObjectId.isValid(empId)) {
    return { ok: false, warning: 'Promotion approved but arrears skipped: invalid employee reference' };
  }

  const computed = await computePromotionArrearAmount(promotionDoc);
  if (computed.skipped) {
    return {
      ok: true,
      skipped: true,
      message: computed.reason || 'skipped',
    };
  }

  if (!Number.isFinite(computed.totalAmount) || computed.totalAmount < 0.01) {
    return {
      ok: true,
      skipped: true,
      message: 'amount_below_threshold',
    };
  }

  const empNo = promotionDoc.emp_no || '';
  const reason = `Promotion arrears (ref ${String(promotionDoc._id)}): emp ${empNo}, effective ${computed.startLabel}–${computed.endLabel}, gross ${promotionDoc.previousGrossSalary} → ${promotionDoc.newGrossSalary}`;

  try {
    const result = await ArrearsService.createAutoApprovedDirectArrearFromPromotion({
      employeeId: empId,
      promotionTransferRequestId: promotionDoc._id,
      totalAmount: computed.totalAmount,
      reason,
      createdByUserId: approverUserId,
    });
    if (result.skipped && result.existing) {
      return { ok: true, skipped: true, message: 'already_exists', arrearsId: String(result.existing._id) };
    }
    return { ok: true, arrearsId: String(result.arrears._id) };
  } catch (err) {
    console.error('[promotionArrearService] createDirectArrearForApprovedPromotion:', err.message);
    return {
      ok: false,
      warning: `Promotion applied but arrears could not be created: ${err.message}`,
    };
  }
}

module.exports = {
  computePromotionArrearAmount,
  createDirectArrearForApprovedPromotion,
};
