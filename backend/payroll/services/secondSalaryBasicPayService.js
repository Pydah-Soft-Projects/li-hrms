/**
 * Second Salary Basic Pay Calculation Service
 * Handles basic pay, per day calculation, payable amount, and incentive for 2nd Salary
 */

/**
 * Compute basic-pay components and the payable amount for an employee's second salary.
 *
 * @param {Object} employee - Employee record containing compensation data; must include `second_salary` (numeric) used as the base pay.
 * @param {Object} attendanceSummary - Attendance summary that must include `totalDaysInMonth` (numeric) and may include `totalPayableShifts`, `totalPaidLeaveDays`, `totalWeeklyOffs`, `totalHolidays`, and `extraDays`.
 * @returns {Object} An object containing calculated pay fields:
 *  - `basicPay` (number): the employee's `second_salary`.
 *  - `perDayBasicPay` (number): per-day rate derived from `basicPay` and `totalDaysInMonth`, rounded to 2 decimals.
 *  - `payableAmount` (number): total amount payable (base pay for capped paid days plus incentive), rounded to 2 decimals.
 *  - `incentive` (number): payment for days beyond the month's cap, rounded to 2 decimals.
 *  - `basePayForWork` (number): payment for the capped paid days, rounded to 2 decimals.
 *  - `totalDaysInMonth` (number): echoed from `attendanceSummary`.
 *  - `totalPaidDays` (number): paid days after capping at `totalDaysInMonth`.
 *  - `extraDays` (number): days beyond `totalDaysInMonth`, rounded to 2 decimals.
 *  - `calculatedPaidDays` (number): raw paid days before capping (sum of payable shifts, paid leaves, weekly offs, and holidays).
 *  - `physicalUnits` (number): same as `calculatedPaidDays`, the aggregated units used to compute paid days.
 */
function calculateBasicPay(employee, attendanceSummary) {
    // Validate inputs
    if (!employee || !employee.second_salary) {
        throw new Error('Employee or second_salary is missing');
    }

    if (!attendanceSummary || !attendanceSummary.totalDaysInMonth) {
        throw new Error('Attendance summary or totalDaysInMonth is missing');
    }

    // Use second_salary as the base for 2nd salary calculation
    const basicPay = employee.second_salary || 0;
    const totalDaysInMonth = attendanceSummary.totalDaysInMonth;
    const totalPresentDays = attendanceSummary.totalPresentDays || 0;
    const totalODDays = attendanceSummary.totalODDays || 0;
    const totalPaidLeaveDays = attendanceSummary.totalPaidLeaveDays || 0;
    const totalWeeklyOffs = attendanceSummary.totalWeeklyOffs || 0;
    const totalHolidays = attendanceSummary.totalHolidays || 0;
    const manualExtraDays = attendanceSummary.extraDays || 0;

    // Calculate per day basic pay
    const perDayBasicPay = totalDaysInMonth > 0 ? basicPay / totalDaysInMonth : 0;

    // 1. Calculate Total Paid Days (User Formula)
    // Formula: Calculated Paid Days = Payable Shifts + Paid Leaves + Holidays + Weekly Offs
    // Note: To mimic Regular Payroll exactly, we add these components
    const physicalUnits = (attendanceSummary.totalPayableShifts || 0) +
        (attendanceSummary.totalPaidLeaveDays || 0) +
        (attendanceSummary.totalWeeklyOffs || 0) +
        (attendanceSummary.totalHolidays || 0);

    const rawTotalDays = physicalUnits;

    let totalPaidDays = rawTotalDays;
    let extraDays = 0;

    // 2. Capping Logic (User Request)
    if (rawTotalDays > totalDaysInMonth) {
        extraDays = rawTotalDays - totalDaysInMonth;
        totalPaidDays = totalDaysInMonth;
    } else {
        extraDays = 0;
        totalPaidDays = rawTotalDays;
    }

    // 3. Base Pay Calculation (User Formula)
    const basePayForWork = totalPaidDays * perDayBasicPay;

    // 4. Extra Days Pay (Incentive)
    const incentive = extraDays * perDayBasicPay;

    // Final payable amount (Sum of both)
    const payableAmount = basePayForWork + incentive;

    return {
        basicPay,
        perDayBasicPay: Math.round(perDayBasicPay * 100) / 100,
        payableAmount: Math.round(payableAmount * 100) / 100,
        incentive: Math.round(incentive * 100) / 100,
        basePayForWork: Math.round(basePayForWork * 100) / 100,
        totalDaysInMonth,
        totalPaidDays,
        extraDays: Math.round(extraDays * 100) / 100,
        calculatedPaidDays: rawTotalDays,
        physicalUnits
    };
}

module.exports = {
    calculateBasicPay,
};