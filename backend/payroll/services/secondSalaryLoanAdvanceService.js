const Loan = require('../../loans/model/Loan');
const { isRepaymentDueForPayrollMonth } = require('../../loans/services/loanHistoryRepairService');

async function filterForPayrollMonth(loans, payrollMonth) {
    if (!payrollMonth) return loans;
    const out = [];
    for (const loan of loans) {
        if (await isRepaymentDueForPayrollMonth(loan, payrollMonth)) out.push(loan);
    }
    return out;
}

/**
 * Second Salary Loan & Advance Processing Service
 * Handles EMI deductions and salary advance adjustments for 2nd Salary cycle
 */

/**
 * Get active loans for an employee
 */
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
        return filterForPayrollMonth(loans, payrollMonth);
    } catch (error) {
        console.error('Error fetching active loans for second salary:', error);
        return [];
    }
}

/**
 * Get active salary advances for an employee
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
        return filterForPayrollMonth(advances, payrollMonth);
    } catch (error) {
        console.error('Error fetching active advances for second salary:', error);
        return [];
    }
}

/**
 * Calculate total EMI
 */
async function calculateTotalEMI(employeeId, payrollMonth = null) {
    try {
        const loans = await getActiveLoans(employeeId, payrollMonth);
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

        return {
            totalEMI: Math.round(totalEMI * 100) / 100,
            emiBreakdown,
            loanCount: loans.length,
        };
    } catch (error) {
        console.error('Error calculating second salary total EMI:', error);
        return { totalEMI: 0, emiBreakdown: [], loanCount: 0 };
    }
}

/**
 * Process salary advance deduction
 */
async function processSalaryAdvance(employeeId, payableAmount, payrollMonth = null) {
    try {
        const advances = await getActiveAdvances(employeeId, payrollMonth);

        if (advances.length === 0) {
            return { advanceDeduction: 0, advanceBreakdown: [], totalAdvanceBalance: 0 };
        }

        const totalAdvanceBalance = advances.reduce(
            (sum, advance) => sum + (advance.repayment?.remainingBalance || 0),
            0
        );

        let advanceDeduction = 0;
        const advanceBreakdown = [];

        if (totalAdvanceBalance > payableAmount) {
            advanceDeduction = payableAmount;
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
        console.error('Error processing second salary advance:', error);
        return { advanceDeduction: 0, advanceBreakdown: [], totalAdvanceBalance: 0 };
    }
}

/**
 * Combined helper for 2nd Salary — same order as main payroll (advance first, EMI from remainder).
 */
async function calculateLoanAdvance(employeeId, month, payableAmount = 0) {
    const main = require('./loanAdvanceService');
    return main.calculateLoanAdvance(employeeId, month, payableAmount);
}

module.exports = {
    getActiveLoans,
    getActiveAdvances,
    calculateTotalEMI,
    calculateLoanAdvance,
    processSalaryAdvance,
};
