const Loan = require('../../loans/model/Loan');

/**
 * Second Salary Loan & Advance Processing Service
 * Handles EMI deductions and salary advance adjustments for 2nd Salary cycle
 */

/**
 * Get active loans for an employee
 */
async function getActiveLoans(employeeId) {
    try {
        // Current limitation: same loans as regular payroll
        // In a future update, we could add 'deductFrom' field to Loan model
        return await Loan.find({
            employeeId,
            requestType: 'loan',
            status: 'active',
            'repayment.remainingBalance': { $gt: 0 },
            'loanConfig.emiAmount': { $gt: 0 },
        }).select('_id loanConfig repayment');
    } catch (error) {
        console.error('Error fetching active loans for second salary:', error);
        return [];
    }
}

/**
 * Get active salary advances for an employee
 */
async function getActiveAdvances(employeeId) {
    try {
        return await Loan.find({
            employeeId,
            requestType: 'salary_advance',
            status: 'active',
            'repayment.remainingBalance': { $gt: 0 },
        }).select('_id repayment amount');
    } catch (error) {
        console.error('Error fetching active advances for second salary:', error);
        return [];
    }
}

/**
 * Calculate total EMI
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
async function processSalaryAdvance(employeeId, payableAmount) {
    try {
        const advances = await getActiveAdvances(employeeId);

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

                advanceBreakdown.push({
                    advanceId: advance._id,
                    advanceAmount: Math.round(deductedAmount * 100) / 100,
                    carriedForward: 0,
                    _originalBalance: advanceBalance,
                });
            }
            let sumAllocated = advanceBreakdown.reduce((s, e) => s + e.advanceAmount, 0);
            const diff = Math.round((advanceDeduction - sumAllocated) * 100) / 100;
            if (advanceBreakdown.length > 0 && diff !== 0) {
                const last = advanceBreakdown[advanceBreakdown.length - 1];
                last.advanceAmount = Math.round((last.advanceAmount + diff) * 100) / 100;
            }
            advanceBreakdown.forEach(e => {
                if (e._originalBalance !== undefined) {
                    e.carriedForward = Math.round((e._originalBalance - e.advanceAmount) * 100) / 100;
                    delete e._originalBalance;
                }
            });
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
 * Combined helper for 2nd Salary
 */
async function calculateLoanAdvance(employeeId, month, payableAmount = 0) {
    // TODO: use month for loan/advance period filtering when needed
    // IMPORTANT: For many implementations, loans are only deducted from the main salary.
    // We provide the functionality here to match "full calculation", but it can be
    // disabled by simply not calling it in calculationService if desired.
    const loanResult = await calculateTotalEMI(employeeId);
    const advanceResult = await processSalaryAdvance(employeeId, payableAmount);

    return {
        totalEMI: loanResult.totalEMI || 0,
        emiBreakdown: loanResult.emiBreakdown || [],
        loanCount: loanResult.loanCount || 0,
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
};
