const Loan = require('../../loans/model/Loan');

/**
 * Second Salary Loan & Advance Processing Service
 * Handles EMI deductions and salary advance adjustments for 2nd Salary cycle
 */

/**
 * Retrieve active loan records for an employee that are eligible for EMI deductions.
 * @param {string|ObjectId} employeeId - Employee identifier to filter loans.
 * @returns {Array<Object>} An array of loan documents (selected fields: `_id`, `loanConfig`, `repayment`). Returns an empty array on error or if no matching loans are found.
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
 * Retrieve active salary advances for an employee that have a remaining balance.
 *
 * Returns only the selected fields for each advance: `_id`, `repayment`, and `amount`.
 *
 * @param {string|object} employeeId - Employee identifier used to filter advances.
 * @returns {Array<object>} An array of advance documents containing `_id`, `repayment`, and `amount`. */
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
 * Compute the total monthly EMI and a per-loan breakdown for an employee's active loans.
 * @param {string|Object} employeeId - Identifier of the employee whose active loans are evaluated.
 * @returns {{totalEMI: number, emiBreakdown: Array<{loanId: any, emiAmount: number}>, loanCount: number}} An object with:
 *  - totalEMI: rounded sum of EMI amounts,
 *  - emiBreakdown: array of entries with `loanId` and rounded `emiAmount`,
 *  - loanCount: number of loans considered.
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
 * Calculate how much to deduct from an employee's active salary advances for a given payable amount and provide a per-advance breakdown.
 * @param {string} employeeId - Identifier of the employee whose active advances will be processed.
 * @param {number} payableAmount - Amount available to apply toward outstanding advances.
 * @returns {{advanceDeduction: number, advanceBreakdown: Array<{advanceId: any, advanceAmount: number, carriedForward: number}>, totalAdvanceBalance: number}} advanceDeduction is the total amount deducted from advances; advanceBreakdown is an array of objects for each advance containing `advanceId`, `advanceAmount` (deducted from that advance, rounded to two decimals), and `carriedForward` (remaining balance after deduction, rounded to two decimals); totalAdvanceBalance is the sum of remaining balances before deductions (rounded to two decimals).
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
 * Calculate combined loan EMI and salary-advance deductions for an employee for a payroll run.
 *
 * Computes total EMI summary from active loans and determines advance deductions (and breakdown)
 * based on the provided payable amount.
 *
 * @param {string} employeeId - Employee identifier to fetch loans and advances for.
 * @param {string} month - Payroll month identifier used for contextual calculations (may be unused by this implementation).
 * @param {number} [payableAmount=0] - Amount available in the current payroll to apply toward salary-advance deductions.
 * @returns {Object} Aggregated loan and advance calculation results.
 * @returns {number} returns.totalEMI - Sum of EMI amounts to be deducted from salary.
 * @returns {Array<Object>} returns.emiBreakdown - List of EMI entries with `{ loanId: string, emiAmount: number }`.
 * @returns {number} returns.loanCount - Number of active loans considered.
 * @returns {number} returns.advanceDeduction - Total amount deducted towards salary advances from the payable amount.
 * @returns {Array<Object>} returns.advanceBreakdown - List of advance entries with `{ advanceId: string, advanceAmount: number, carriedForward: number }`.
 * @returns {number} returns.totalAdvanceBalance - Combined remaining balance of active advances prior to deduction.
 */
async function calculateLoanAdvance(employeeId, month, payableAmount = 0) {
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