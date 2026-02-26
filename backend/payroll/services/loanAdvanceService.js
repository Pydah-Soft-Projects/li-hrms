const Loan = require('../../loans/model/Loan');
const { extractISTComponents, createISTDate } = require('../../shared/utils/dateUtils');

/**
 * Loan & Advance Processing Service
 * Handles EMI deductions and salary advance adjustments
 */

/**
 * Get active loans for an employee
 * @param {String} employeeId - Employee ID
 * @returns {Array} Array of active loan documents
 */
async function getActiveLoans(employeeId) {
  try {
    const loans = await Loan.find({
      employeeId,
      requestType: 'loan',
      status: 'active',
      'repayment.remainingBalance': { $gt: 0 },
      'loanConfig.emiAmount': { $gt: 0 },
    }).select('_id loanConfig repayment');

    return loans;
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
async function getActiveAdvances(employeeId) {
  try {
    const advances = await Loan.find({
      employeeId,
      requestType: 'salary_advance',
      status: 'active',
      'repayment.remainingBalance': { $gt: 0 },
    }).select('_id repayment amount');

    return advances;
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
async function calculateTotalEMI(employeeId) {
  try {
    const loans = await getActiveLoans(employeeId);

    let totalEMI = 0;
    const emiBreakdown = [];

    for (const loan of loans) {
      const emiAmount = loan.loanConfig?.emiAmount || 0;
      if (emiAmount > 0) {
        totalEMI += emiAmount;
        emiBreakdown.push({
          loanId: loan._id,
          emiAmount: Math.round(emiAmount * 100) / 100,
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
async function processSalaryAdvance(employeeId, payableAmount) {
  try {
    const advances = await getActiveAdvances(employeeId);

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
 * Update loan records after EMI deduction
 * @param {Array} emiBreakdown - EMI breakdown array
 * @param {String} month - Month in YYYY-MM format
 * @param {String} userId - User ID who processed
 * @returns {Promise} Update result
 */
async function updateLoanRecordsAfterEMI(emiBreakdown, month, userId) {
  try {
    for (const emi of emiBreakdown) {
      const loan = await Loan.findById(emi.loanId);

      if (!loan) {
        continue;
      }

      // Update repayment
      loan.repayment.totalPaid = (loan.repayment.totalPaid || 0) + emi.emiAmount;
      loan.repayment.installmentsPaid = (loan.repayment.installmentsPaid || 0) + 1;
      loan.repayment.lastPaymentDate = new Date();

      // Calculate next payment date (next month) - robust in IST
      const { year, month } = extractISTComponents(new Date());
      const nextMonthFirstDay = createISTDate(`${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`);
      loan.repayment.nextPaymentDate = nextMonthFirstDay;

      // Add transaction log
      loan.transactions.push({
        transactionType: 'emi_payment',
        amount: emi.emiAmount,
        transactionDate: new Date(),
        payrollCycle: month,
        processedBy: userId,
        remarks: `EMI deducted from payroll for ${month}`,
      });

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
 * @returns {Promise} Update result
 */
async function updateAdvanceRecordsAfterDeduction(advanceBreakdown, month, userId) {
  try {
    for (const advance of advanceBreakdown) {
      const advanceRecord = await Loan.findById(advance.advanceId);

      if (!advanceRecord) {
        continue;
      }

      // Update repayment
      advanceRecord.repayment.totalPaid = (advanceRecord.repayment.totalPaid || 0) + advance.advanceAmount;
      advanceRecord.repayment.remainingBalance = advance.carriedForward;

      // If fully paid, mark as completed
      if (advance.carriedForward === 0) {
        advanceRecord.status = 'completed';
        advanceRecord.repayment.remainingBalance = 0;
      }

      // Add transaction log
      advanceRecord.transactions.push({
        transactionType: 'advance_deduction',
        amount: advance.advanceAmount,
        transactionDate: new Date(),
        payrollCycle: month,
        processedBy: userId,
        remarks: `Advance deducted from payroll for ${month}`,
      });

      await advanceRecord.save();
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating advance records after deduction:', error);
    throw error;
  }
}

/**
 * Combined helper used by payroll: returns both loan EMI and advance deductions.
 * - totalEMI / emiBreakdown from active loans
 * - advanceDeduction / advanceBreakdown from active advances relative to payableAmount
 */
async function calculateLoanAdvance(employeeId, month, payableAmount = 0) {
  const loanResult = await calculateTotalEMI(employeeId);
  const advanceResult = await processSalaryAdvance(employeeId, payableAmount);

  return {
    totalEMI: loanResult.totalEMI || 0,
    emiBreakdown: loanResult.emiBreakdown || [],
    loanCount: loanResult.loanCount || 0,
    remainingBalance: loanResult.remainingBalance ?? 0,
    advanceDeduction: advanceResult.advanceDeduction || 0,
    advanceBreakdown: advanceResult.advanceBreakdown || [],
    totalAdvanceBalance: advanceResult.totalAdvanceBalance || 0,
  };
}

module.exports = {
  getActiveLoans,
  getActiveAdvances,
  calculateTotalEMI,
  calculateLoanAdvance,
  processSalaryAdvance,
  updateLoanRecordsAfterEMI,
  updateAdvanceRecordsAfterDeduction,
};

