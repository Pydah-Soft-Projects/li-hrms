/**
 * Basic Pay Calculation Service
 * Handles basic pay, per day calculation, payable amount, and incentive
 */

/**
 * Calculate basic pay components
 * @param {Object} employee - Employee object with gross_salary
 * @param {Object} attendanceSummary - MonthlyAttendanceSummary object
 * @returns {Object} Basic pay calculation result
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

  // 1. Earned Salary for "Physical/Credit" days
  // Includes Present, OD, Paid Leaves, and Holidays/Weekoffs
  const physicalUnits = totalPresentDays + totalODDays + totalPaidLeaveDays + totalWeeklyOffs + totalHolidays;
  const basePayForWork = physicalUnits * perDayBasicPay;

  // 2. Extra Days Pay (Incentive for system-added or manually uploaded units)
  const incentive = manualExtraDays * perDayBasicPay;

  // Final payable amount (Sum of both)
  const payableAmount = basePayForWork + incentive;

  return {
    basicPay,
    perDayBasicPay: Math.round(perDayBasicPay * 100) / 100,
    payableAmount: Math.round(payableAmount * 100) / 100,
    incentive: Math.round(incentive * 100) / 100,
    basePayForWork: Math.round(basePayForWork * 100) / 100,
    totalDaysInMonth,
    totalPayableShifts: physicalUnits + manualExtraDays,
    incentiveDays: manualExtraDays,
    physicalUnits
  };
}

module.exports = {
  calculateBasicPay,
};

