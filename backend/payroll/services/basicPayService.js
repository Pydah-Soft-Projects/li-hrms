/**
 * Basic Pay Calculation Service
 * Handles basic pay, per day calculation, payable amount, and incentive
 */

/**
 * Compute an employee's basic-pay breakdown and payable amount for a month.
 *
 * @param {Object} employee - Employee record containing compensation fields.
 * @param {number} employee.gross_salary - Employee's gross monthly salary; required.
 * @param {Object} attendanceSummary - Monthly attendance summary used for calculations.
 * @param {number} attendanceSummary.totalDaysInMonth - Total days in the month; required.
 * @param {number} [attendanceSummary.totalPayableShifts=0] - Payable shifts (includes present + OD).
 * @param {number} [attendanceSummary.totalPaidLeaveDays=0] - Paid leave days.
 * @param {number} [attendanceSummary.totalWeeklyOffs=0] - Weekly offs counted as payable.
 * @param {number} [attendanceSummary.totalHolidays=0] - Holidays counted as payable.
 * @param {number} [attendanceSummary.extraDays=0] - Manual extra days (not added to calculated paid days).
 * @returns {Object} An object containing computed pay components and day counts.
 * @returns {number} returns.basicPay - The gross monthly basic pay (from employee.gross_salary).
 * @returns {number} returns.perDayBasicPay - Daily basic pay rounded to 2 decimals.
 * @returns {number} returns.payableAmount - Total payable amount (base pay + incentive) rounded to 2 decimals.
 * @returns {number} returns.incentive - Pay for extra days beyond the month's cap, rounded to 2 decimals.
 * @returns {number} returns.basePayForWork - Pay for capped paid days, rounded to 2 decimals.
 * @returns {number} returns.totalDaysInMonth - The input totalDaysInMonth.
 * @returns {number} returns.totalPaidDays - Number of days considered for base pay after capping to month length.
 * @returns {number} returns.extraDays - Number of days exceeding the month's total, rounded to 2 decimals.
 * @returns {number} returns.calculatedPaidDays - Raw calculated paid days before capping (physical units).
 * @returns {number} returns.physicalUnits - Sum of payable shifts, paid leaves, weekly offs, and holidays.
 * @throws {Error} If `employee` or `employee.gross_salary` is missing.
 * @throws {Error} If `attendanceSummary` or `attendanceSummary.totalDaysInMonth` is missing.
 */
function calculateBasicPay(employee, attendanceSummary) {
  // Validate inputs
  if (!employee || !employee.gross_salary) {
    throw new Error('Employee or gross_salary is missing');
  }

  if (!attendanceSummary || !attendanceSummary.totalDaysInMonth) {
    throw new Error('Attendance summary or totalDaysInMonth is missing');
  }

  const basicPay = employee.gross_salary || 0;
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
  // Note: totalPayableShifts already includes Present Days + OD Days from attendance processing
  // We add Paid Leaves, Holidays, and Weekly Offs to get the complete calculation
  const physicalUnits = (attendanceSummary.totalPayableShifts || 0) +
    (attendanceSummary.totalPaidLeaveDays || 0) +
    (attendanceSummary.totalWeeklyOffs || 0) +
    (attendanceSummary.totalHolidays || 0);

  const rawTotalDays = physicalUnits;

  let totalPaidDays = rawTotalDays;
  let extraDays = 0;

  // 2. Capping Logic (User Request)
  // If Calculated Paid Days <= Total Days in Month: Total Paid Days = Calculated Paid Days, Extra Days = 0
  // If Calculated Paid Days > Total Days in Month: Extra Days = Calculated Paid Days - Total Days, Total Paid Days = Total Days (Capped)
  if (rawTotalDays > totalDaysInMonth) {
    extraDays = rawTotalDays - totalDaysInMonth;
    totalPaidDays = totalDaysInMonth;
  } else {
    extraDays = 0;
    totalPaidDays = rawTotalDays;
  }

  // 3. Base Pay Calculation (User Formula)
  // Base Pay = Total Paid Days * Daily Rate (Always capped at month's max days)
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
