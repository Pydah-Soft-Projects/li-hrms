const Loan = require('../../loans/model/Loan');
const {
  setNextPaymentDateFromInstallmentsPaid,
  isRepaymentDueForPayrollMonth,
} = require('../../loans/services/loanHistoryRepairService');
const { getDueInstallmentAmount } = require('../../loans/services/loanInstallmentScheduleService');

/**
 * Loan & Advance Processing Service
 * Handles EMI deductions and salary advance adjustments
 */

/**
 * Get active loans for an employee
 * @param {String} employeeId - Employee ID
 * @returns {Array} Array of active loan documents
 */
async function filterLoansForPayrollMonth(loans, payrollMonth) {
  if (!payrollMonth) return loans;
  const out = [];
  for (const loan of loans) {
    if (await isRepaymentDueForPayrollMonth(loan, payrollMonth)) out.push(loan);
  }
  return out;
}

async function getActiveLoans(employeeId, payrollMonth = null) {
  try {
    const loans = await Loan.find({
      employeeId,
      requestType: 'loan',
      status: { $in: ['active', 'disbursed'] },
      'repayment.remainingBalance': { $gt: 0 },
      'loanConfig.emiAmount': { $gt: 0 },
    }).select(
      '_id loanConfig repayment advanceConfig requestType duration approvals.final.firstDeductionPayrollMonth'
    );

    return filterLoansForPayrollMonth(loans, payrollMonth);
  } catch (error) {
    console.error('Error fetching active loans:', error);
    return [];
  }
}

/**
 * Get active salary advances for an employee
 * @param {String} employeeId - Employee ID
 * @returns {Array} Array of active advance documents
 */
async function getActiveAdvances(employeeId, payrollMonth = null) {
  try {
    const advances = await Loan.find({
      employeeId,
      requestType: 'salary_advance',
      status: { $in: ['active', 'disbursed'] },
      'repayment.remainingBalance': { $gt: 0 },
    }).select(
      '_id repayment amount advanceConfig requestType duration approvals.final.firstDeductionPayrollMonth'
    );

    return filterLoansForPayrollMonth(advances, payrollMonth);
  } catch (error) {
    console.error('Error fetching active advances:', error);
    return [];
  }
}

/**
 * Calculate total EMI for active loans
 * @param {String} employeeId - Employee ID
 * @returns {Object} EMI calculation result
 */
async function calculateTotalEMI(employeeId, payrollMonth = null) {
  try {
    const loans = await getActiveLoans(employeeId, payrollMonth);

    let totalEMI = 0;
    const emiBreakdown = [];

    for (const loan of loans) {
      const emiAmount = getDueInstallmentAmount(loan);
      if (emiAmount > 0) {
        totalEMI += emiAmount;
        emiBreakdown.push({
          loanId: loan._id,
          emiAmount: Math.round(emiAmount * 100) / 100,
          scheduledEmi: Number(loan.loanConfig?.emiAmount) || emiAmount,
          installmentNumber: (Number(loan.repayment?.installmentsPaid) || 0) + 1,
        });
      }
    }

    const remainingBalance = loans.reduce((sum, loan) => sum + (loan.repayment?.remainingBalance || 0), 0);

    return {
      totalEMI: Math.round(totalEMI * 100) / 100,
      emiBreakdown,
      loanCount: loans.length,
      remainingBalance: Math.round(remainingBalance * 100) / 100,
    };
  } catch (error) {
    console.error('Error calculating total EMI:', error);
    return {
      totalEMI: 0,
      emiBreakdown: [],
      loanCount: 0,
      remainingBalance: 0,
    };
  }
}

/**
 * Process salary advance deduction
 * @param {String} employeeId - Employee ID
 * @param {Number} payableAmount - Payable amount before advance
 * @returns {Object} Advance processing result
 */
async function processSalaryAdvance(employeeId, payableAmount, payrollMonth = null) {
  try {
    const advances = await getActiveAdvances(employeeId, payrollMonth);

    if (advances.length === 0) {
      return {
        advanceDeduction: 0,
        advanceBreakdown: [],
        totalAdvanceBalance: 0,
      };
    }

    // Calculate total advance balance
    const totalAdvanceBalance = advances.reduce(
      (sum, advance) => sum + (advance.repayment?.remainingBalance || 0),
      0
    );

    let advanceDeduction = 0;
    const advanceBreakdown = [];

    if (totalAdvanceBalance > payableAmount) {
      // Advance > Payable: Deduct entire payable amount, carry forward remainder
      advanceDeduction = payableAmount;
      const remainingAdvance = totalAdvanceBalance - payableAmount;

      // Distribute deduction proportionally across advances
      for (const advance of advances) {
        const advanceBalance = advance.repayment?.remainingBalance || 0;
        const proportion = advanceBalance / totalAdvanceBalance;
        const deductedAmount = payableAmount * proportion;
        const carriedForward = advanceBalance - deductedAmount;

        advanceBreakdown.push({
          advanceId: advance._id,
          advanceAmount: Math.round(deductedAmount * 100) / 100,
          carriedForward: Math.round(carriedForward * 100) / 100,
        });
      }
    } else {
      // Advance <= Payable: Deduct entire advance, clear all advances
      advanceDeduction = totalAdvanceBalance;

      for (const advance of advances) {
        const advanceBalance = advance.repayment?.remainingBalance || 0;

        advanceBreakdown.push({
          advanceId: advance._id,
          advanceAmount: Math.round(advanceBalance * 100) / 100,
          carriedForward: 0,
        });
      }
    }

    return {
      advanceDeduction: Math.round(advanceDeduction * 100) / 100,
      advanceBreakdown,
      totalAdvanceBalance: Math.round(totalAdvanceBalance * 100) / 100,
    };
  } catch (error) {
    console.error('Error processing salary advance:', error);
    return {
      advanceDeduction: 0,
      advanceBreakdown: [],
      totalAdvanceBalance: 0,
    };
  }
}

/**
 * Canonical idempotency: one EMI per loan per payroll month, regardless of regular vs 2nd-salary batch
 * (avoids duplicate keys payroll_settle:<PayrollRecordId>:emi vs payroll_settle:ss:<SecondSalaryRecordId>:emi).
 */
function buildCanonicalEmiSettlementKey(month, loanId) {
  const m = month != null ? String(month).trim() : '';
  const id = loanId != null ? String(loanId) : '';
  if (!m || !id) return null;
  return `payroll_month:${m}:emi:${id}`;
}

/** Legacy key (per payroll/second-salary document id). */
function buildLegacyEmiSettlementKey(payrollSettlementId) {
  if (payrollSettlementId == null || payrollSettlementId === '') return null;
  return `payroll_settle:${String(payrollSettlementId)}:emi`;
}

function isEmiAlreadySettledForMonth(loan, month, loanId, payrollSettlementId) {
  const txs = loan.transactions || [];
  const monthStr = month != null ? String(month).trim() : '';
  const canon = buildCanonicalEmiSettlementKey(month, loanId);
  const legacy = buildLegacyEmiSettlementKey(payrollSettlementId);
  for (const t of txs) {
    if (canon && t.payrollSettlementKey === canon) return true;
    if (legacy && t.payrollSettlementKey === legacy) return true;
  }
  if (monthStr) {
    for (const t of txs) {
      if (
        t.transactionType === 'emi_payment'
        && String(t.payrollCycle || '').trim() === monthStr
        && t.payrollSettlementKey
      ) {
        return true;
      }
    }
  }
  return false;
}

function emiSettlementKeyToStore(month, loanId, payrollSettlementId) {
  return buildCanonicalEmiSettlementKey(month, loanId) || buildLegacyEmiSettlementKey(payrollSettlementId);
}

function buildCanonicalAdvanceSettlementKey(month, advanceId) {
  const m = month != null ? String(month).trim() : '';
  const id = advanceId != null ? String(advanceId) : '';
  if (!m || !id) return null;
  return `payroll_month:${m}:adv:${id}`;
}

function buildLegacyAdvanceSettlementKey(payrollSettlementId, advanceId) {
  if (payrollSettlementId == null || payrollSettlementId === '' || !advanceId) return null;
  return `payroll_settle:${String(payrollSettlementId)}:adv:${String(advanceId)}`;
}

function isAdvanceAlreadySettledForMonth(advanceRecord, month, advanceId, payrollSettlementId) {
  const txs = advanceRecord.transactions || [];
  const monthStr = month != null ? String(month).trim() : '';
  const canon = buildCanonicalAdvanceSettlementKey(month, advanceId);
  const legacy = buildLegacyAdvanceSettlementKey(payrollSettlementId, advanceId);
  for (const t of txs) {
    if (canon && t.payrollSettlementKey === canon) return true;
    if (legacy && t.payrollSettlementKey === legacy) return true;
  }
  if (monthStr) {
    for (const t of txs) {
      if (
        t.transactionType === 'advance_deduction'
        && String(t.payrollCycle || '').trim() === monthStr
        && t.payrollSettlementKey
      ) {
        return true;
      }
    }
  }
  return false;
}

function advanceSettlementKeyToStore(month, advanceId, payrollSettlementId) {
  return buildCanonicalAdvanceSettlementKey(month, advanceId)
    || buildLegacyAdvanceSettlementKey(payrollSettlementId, advanceId);
}

/**
 * Update loan records after EMI deduction
 * @param {Array} emiBreakdown - EMI breakdown array
 * @param {String} month - Month in YYYY-MM format
 * @param {String} userId - User ID who processed
 * @param {string|null|undefined} payrollSettlementId - PayrollRecord or SecondSalaryRecord id for idempotency
 * @returns {Promise} Update result
 */
async function updateLoanRecordsAfterEMI(emiBreakdown, month, userId, payrollSettlementId = null) {
  try {
    for (const emi of emiBreakdown) {
      const loan = await Loan.findById(emi.loanId);

      if (!loan) {
        continue;
      }

      const loanIdStr = emi.loanId != null ? String(emi.loanId) : '';
      if (isEmiAlreadySettledForMonth(loan, month, loanIdStr, payrollSettlementId)) {
        continue;
      }

      // Update repayment
      loan.repayment.totalPaid = (loan.repayment.totalPaid || 0) + emi.emiAmount;
      loan.repayment.installmentsPaid = (loan.repayment.installmentsPaid || 0) + 1;
      loan.repayment.lastPaymentDate = new Date();

      const totalAmount = loan.loanConfig?.totalAmount || loan.amount;
      loan.repayment.remainingBalance = Math.max(0, totalAmount - loan.repayment.totalPaid);

      if (loan.repayment.remainingBalance <= 0) {
        loan.status = 'completed';
        loan.repayment.remainingBalance = 0;
      } else if (loan.status === 'disbursed') {
        loan.status = 'active';
      }

      if (loan.repayment.remainingBalance > 0) {
        await setNextPaymentDateFromInstallmentsPaid(loan);
      } else {
        loan.repayment.nextPaymentDate = null;
      }

      // Add transaction log
      const tx = {
        transactionType: 'emi_payment',
        amount: emi.emiAmount,
        transactionDate: new Date(),
        payrollCycle: month,
        processedBy: userId,
        remarks: `EMI deducted from payroll for ${month}`,
      };
      const txKey = emiSettlementKeyToStore(month, loanIdStr, payrollSettlementId);
      if (txKey) tx.payrollSettlementKey = txKey;
      loan.transactions.push(tx);

      await loan.save();
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating loan records after EMI:', error);
    throw error;
  }
}

/**
 * Update advance records after deduction
 * @param {Array} advanceBreakdown - Advance breakdown array
 * @param {String} month - Month in YYYY-MM format
 * @param {String} userId - User ID who processed
 * @param {string|null|undefined} payrollSettlementId - PayrollRecord or SecondSalaryRecord id for idempotency
 * @returns {Promise} Update result
 */
async function updateAdvanceRecordsAfterDeduction(advanceBreakdown, month, userId, payrollSettlementId = null) {
  try {
    for (const advance of advanceBreakdown) {
      const advanceRecord = await Loan.findById(advance.advanceId);

      if (!advanceRecord) {
        continue;
      }

      const advanceIdStr = advance.advanceId != null ? String(advance.advanceId) : '';
      if (isAdvanceAlreadySettledForMonth(advanceRecord, month, advanceIdStr, payrollSettlementId)) {
        continue;
      }

      if (!advanceRecord.repayment) {
        advanceRecord.repayment = {
          totalPaid: 0,
          remainingBalance: advanceRecord.amount,
          installmentsPaid: 0,
          totalInstallments: advanceRecord.duration,
        };
      }

      // Update repayment
      advanceRecord.repayment.totalPaid = (advanceRecord.repayment.totalPaid || 0) + advance.advanceAmount;
      advanceRecord.repayment.remainingBalance = advance.carriedForward;

      if (advance.carriedForward > 0) {
        advanceRecord.repayment.installmentsPaid = (advanceRecord.repayment.installmentsPaid || 0) + 1;
      } else {
        advanceRecord.repayment.installmentsPaid = advanceRecord.duration;
      }

      // If fully paid, mark as completed
      if (advance.carriedForward === 0) {
        advanceRecord.status = 'completed';
        advanceRecord.repayment.remainingBalance = 0;
        advanceRecord.repayment.nextPaymentDate = null;
      } else {
        if (advanceRecord.status === 'disbursed') {
          advanceRecord.status = 'active';
        }
        if (!advanceRecord.advanceConfig) advanceRecord.advanceConfig = {};
        if (!advanceRecord.advanceConfig.deductionStartCycle) {
          advanceRecord.advanceConfig.deductionStartCycle = month;
        }
        await setNextPaymentDateFromInstallmentsPaid(advanceRecord);
      }

      const tx = {
        transactionType: 'advance_deduction',
        amount: advance.advanceAmount,
        transactionDate: new Date(),
        payrollCycle: month,
        processedBy: userId,
        remarks: `Advance deducted from payroll for ${month}`,
      };
      const advKey = advanceSettlementKeyToStore(month, advanceIdStr, payrollSettlementId);
      if (advKey) tx.payrollSettlementKey = advKey;
      advanceRecord.transactions.push(tx);

      await advanceRecord.save();
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating advance records after deduction:', error);
    throw error;
  }
}

/**
 * Cap scheduled EMI breakdown to a maximum deductible amount (proportional split).
 */
function capEmiBreakdownToAmount(emiBreakdown, maxAmount) {
  const list = Array.isArray(emiBreakdown) ? emiBreakdown : [];
  const cap = Math.max(0, Number(maxAmount) || 0);
  const scheduledTotal = list.reduce((sum, item) => sum + (Number(item.emiAmount) || 0), 0);
  if (scheduledTotal <= 0) {
    return { totalEMI: 0, scheduledTotalEMI: 0, emiBreakdown: [] };
  }
  if (scheduledTotal <= cap) {
    return {
      totalEMI: Math.round(scheduledTotal * 100) / 100,
      scheduledTotalEMI: Math.round(scheduledTotal * 100) / 100,
      emiBreakdown: list.map((item) => ({
        ...item,
        scheduledEmi: Number(item.emiAmount) || 0,
        emiCarriedForward: 0,
      })),
    };
  }
  const ratio = cap / scheduledTotal;
  const capped = list.map((item) => {
    const scheduledEmi = Number(item.emiAmount) || 0;
    const deducted = Math.round(scheduledEmi * ratio * 100) / 100;
    return {
      ...item,
      emiAmount: deducted,
      scheduledEmi,
      emiCarriedForward: Math.round((scheduledEmi - deducted) * 100) / 100,
    };
  });
  let totalEMI = capped.reduce((sum, item) => sum + (Number(item.emiAmount) || 0), 0);
  const diff = cap - totalEMI;
  if (Math.abs(diff) > 0.001 && capped.length > 0) {
    capped[capped.length - 1].emiAmount = Math.round((capped[capped.length - 1].emiAmount + diff) * 100) / 100;
    capped[capped.length - 1].emiCarriedForward = Math.round(
      (capped[capped.length - 1].scheduledEmi - capped[capped.length - 1].emiAmount) * 100
    ) / 100;
    totalEMI = cap;
  }
  return {
    totalEMI: Math.round(totalEMI * 100) / 100,
    scheduledTotalEMI: Math.round(scheduledTotal * 100) / 100,
    emiBreakdown: capped,
  };
}

/**
 * Raw loan/advance amounts for dynamic payroll when no payable cap column is configured.
 * Returns full scheduled EMI and full advance balance due — no pool capping.
 */
async function calculateLoanAdvanceUncapped(employeeId, month) {
  const loanResult = await calculateTotalEMI(employeeId, month);
  const advanceResult = await processSalaryAdvance(employeeId, Number.MAX_SAFE_INTEGER, month);

  return {
    totalEMI: loanResult.totalEMI,
    scheduledTotalEMI: loanResult.totalEMI,
    emiBreakdown: loanResult.emiBreakdown || [],
    loanCount: loanResult.loanCount || 0,
    remainingBalance: loanResult.remainingBalance ?? 0,
    advanceDeduction: advanceResult.advanceDeduction || 0,
    advanceBreakdown: advanceResult.advanceBreakdown || [],
    totalAdvanceBalance: advanceResult.totalAdvanceBalance || 0,
  };
}

/**
 * Combined helper used by payroll (with payable pool cap).
 * Order: (1) salary advance from payable pool, (2) loan EMI from remainder (capped).
 * Salary advance deducted = payable >= advanceDue ? advanceDue : payable
 * Loan EMI deducted = (payable − advanceDeducted) >= emiDue ? emiDue : (payable − advanceDeducted)
 */
async function calculateLoanAdvance(employeeId, month, payableAmount = 0) {
  const payablePool = Math.max(0, Number(payableAmount) || 0);

  // 1. Salary advance first — deduct only up to payable pool
  const advanceResult = await processSalaryAdvance(employeeId, payablePool, month);
  const advanceDeduction = advanceResult.advanceDeduction || 0;
  const remainingAfterAdvance = Math.max(0, payablePool - advanceDeduction);

  // 2. Loan EMI from whatever remains in the payable pool
  const loanResult = await calculateTotalEMI(employeeId, month);
  const capped = capEmiBreakdownToAmount(loanResult.emiBreakdown || [], remainingAfterAdvance);

  return {
    payablePool: Math.round(payablePool * 100) / 100,
    remainingAfterAdvance: Math.round(remainingAfterAdvance * 100) / 100,
    totalEMI: capped.totalEMI,
    scheduledTotalEMI: capped.scheduledTotalEMI,
    emiBreakdown: capped.emiBreakdown,
    loanCount: loanResult.loanCount || 0,
    remainingBalance: loanResult.remainingBalance ?? 0,
    advanceDeduction,
    advanceBreakdown: advanceResult.advanceBreakdown || [],
    totalAdvanceBalance: advanceResult.totalAdvanceBalance || 0,
  };
}

function numPayroll(v) {
  const n = typeof v === 'number' && !Number.isNaN(v) ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Other deduction lines that count toward "payable before advance" (exclude statutory / loan / manual duplicates). */
function sumOtherDeductionsForAdvancePayable(record) {
  const raw = Array.isArray(record?.deductions?.otherDeductions) ? record.deductions.otherDeductions : [];
  return raw
    .filter((d) => {
      if (!d) return false;
      const name = String(d.name || '').trim().toUpperCase();
      if (name === 'MANUAL DEDUCTION') return false;
      if (name === 'ATTENDANCE DEDUCTION (LATE/EARLY)') return false;
      if (name === 'ABSENT LOP DEDUCTION') return false;
      if (name === 'EPF' || name === 'ESI' || name === 'PROFESSION TAX' || name === 'SALARY ADVANCE') return false;
      return true;
    })
    .reduce((sum, d) => sum + numPayroll(d.amount), 0);
}

/**
 * Payable pool for loan/advance recovery from an in-progress payroll record (dynamic engine).
 * gross − attendance − permission − statutory − filtered other (EMI is NOT subtracted here;
 * salary advance runs first, then EMI from remainder inside calculateLoanAdvance).
 */
async function computePayableBeforeAdvanceFromPayrollRecord(record, employeeId, employee) {
  let gross = numPayroll(record?.earnings?.grossSalary);
  if (gross <= 0) {
    const earned = numPayroll(record?.earnings?.payableAmount ?? record?.earnings?.earnedSalary);
    const ot = numPayroll(record?.earnings?.otPay);
    const allowances = numPayroll(record?.earnings?.totalAllowances);
    gross = earned + ot + allowances;
  }
  if (gross <= 0) {
    gross = numPayroll(employee?.gross_salary);
  }
  const att = numPayroll(record?.deductions?.attendanceDeduction);
  const perm = numPayroll(record?.deductions?.permissionDeduction);
  const stat = numPayroll(record?.deductions?.statutoryCumulative);
  const other = sumOtherDeductionsForAdvancePayable(record);
  return Math.max(0, gross - att - perm - stat - other);
}

function mergeLoanAdvanceIntoPayrollRecord(record, loanAdvanceResult, meta = {}) {
  if (!record || !loanAdvanceResult) return;
  if (!record.loanAdvance) record.loanAdvance = {};
  record.loanAdvance.totalEMI = loanAdvanceResult.totalEMI ?? 0;
  record.loanAdvance.scheduledTotalEMI = loanAdvanceResult.scheduledTotalEMI ?? loanAdvanceResult.totalEMI ?? 0;
  record.loanAdvance.advanceDeduction = loanAdvanceResult.advanceDeduction ?? 0;
  record.loanAdvance.remainingBalance = loanAdvanceResult.remainingBalance ?? 0;
  record.loanAdvance.emiBreakdown = Array.isArray(loanAdvanceResult.emiBreakdown) ? loanAdvanceResult.emiBreakdown : [];
  record.loanAdvance.advanceBreakdown = Array.isArray(loanAdvanceResult.advanceBreakdown) ? loanAdvanceResult.advanceBreakdown : [];
  if (loanAdvanceResult.payablePool != null) {
    record.loanAdvance.payablePool = loanAdvanceResult.payablePool;
  }
  if (loanAdvanceResult.remainingAfterAdvance != null) {
    record.loanAdvance.remainingAfterAdvance = loanAdvanceResult.remainingAfterAdvance;
  }
  if (meta.payableBeforeAdvance != null) {
    record.loanAdvance.payableBeforeAdvance = meta.payableBeforeAdvance;
  }
  if (meta.payableSource) {
    record.loanAdvance.payableSource = meta.payableSource;
  }
  if (meta.payableColumnHeader) {
    record.loanAdvance.payableColumnHeader = meta.payableColumnHeader;
  }
}

/**
 * Dynamic payroll: compute loan EMI, advance, balances and write onto payroll record.
 * - No payable cap column configured → full scheduled EMI and advance (uncapped), as before.
 * - Column configured → cap pool = column value; advance first, then EMI from remainder.
 */
async function applyDynamicPayrollLoanAdvance(record, employeeId, month, employee, options = {}) {
  const payableColumnHeader =
    options.payableColumnHeader != null ? String(options.payableColumnHeader).trim() : '';
  const useColumnCap = payableColumnHeader.length > 0;

  let result;
  let meta = {};

  if (useColumnCap) {
    const payable = Math.max(0, Number(options.payableAmountFromColumn) || 0);
    result = await calculateLoanAdvance(employeeId, month, payable);
    meta = {
      payableBeforeAdvance: payable,
      payableSource: 'config_column',
      payableColumnHeader,
    };
  } else {
    result = await calculateLoanAdvanceUncapped(employeeId, month);
    meta = { payableSource: 'uncapped' };
  }

  mergeLoanAdvanceIntoPayrollRecord(record, result, meta);
  if (record.loanAdvance) {
    if (result.payablePool != null) record.loanAdvance.payablePool = result.payablePool;
    if (result.remainingAfterAdvance != null) record.loanAdvance.remainingAfterAdvance = result.remainingAfterAdvance;
    record.loanAdvance.scheduledTotalEMI = result.scheduledTotalEMI ?? result.totalEMI ?? 0;
  }
}

module.exports = {
  getActiveLoans,
  getActiveAdvances,
  calculateTotalEMI,
  calculateLoanAdvance,
  processSalaryAdvance,
  updateLoanRecordsAfterEMI,
  updateAdvanceRecordsAfterDeduction,
  applyDynamicPayrollLoanAdvance,
};

