const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
const PayrollRecord = require('../model/PayrollRecord');

function getMonthsInRange(startMonth, endMonth) {
  const [startYear, startM] = startMonth.split('-').map(Number);
  const [endYear, endM] = endMonth.split('-').map(Number);
  const months = [];
  let y = startYear;
  let m = startM;
  while (y < endYear || (y === endYear && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/**
 * Same row shape as GET /api/payroll/attendance-range (pay register first, payroll record fallback).
 */
async function fetchAttendanceDataForEmployeeMonths(employeeId, startMonth, endMonth) {
  const months = getMonthsInRange(startMonth, endMonth);
  if (months.length === 0) return [];

  const payRegisters = await PayRegisterSummary.find({
    employeeId,
    month: { $in: months },
  })
    .select(
      'month totalDaysInMonth totals.totalPayableShifts totals.totalPresentDays totals.totalPaidLeaveDays totals.totalWeeklyOffs totals.totalHolidays'
    )
    .lean();

  const payrollRecords = await PayrollRecord.find({
    employeeId,
    month: { $in: months },
  })
    .select('month totalDaysInMonth attendance.totalPaidDays')
    .lean();

  const byMonthPR = Object.fromEntries((payRegisters || []).map((r) => [r.month, r]));
  const byMonthPayroll = Object.fromEntries((payrollRecords || []).map((r) => [r.month, r]));

  return months.map((month) => {
    const pr = byMonthPR[month];
    const payroll = byMonthPayroll[month];
    let totalDaysInMonth = 0;
    let totalPaidDays = 0;

    if (pr) {
      totalDaysInMonth = Number(pr.totalDaysInMonth) || 0;
      const tot = pr.totals || {};
      const payable = tot.totalPayableShifts;
      totalPaidDays = Number.isFinite(payable)
        ? payable
        : (Number(tot.totalPresentDays) || 0) +
          (Number(tot.totalPaidLeaveDays) || 0) +
          (Number(tot.totalWeeklyOffs) || 0) +
          (Number(tot.totalHolidays) || 0);
    } else if (payroll) {
      totalDaysInMonth = Number(payroll.totalDaysInMonth) || 0;
      totalPaidDays = Number(payroll.attendance?.totalPaidDays) || 0;
    }
    if (totalDaysInMonth <= 0) {
      const [yy, mm] = month.split('-').map(Number);
      totalDaysInMonth = new Date(yy, mm, 0).getDate();
    }

    return {
      month,
      totalDaysInMonth: Number(totalDaysInMonth),
      attendance: { totalPaidDays: Number(totalPaidDays) },
    };
  });
}

module.exports = {
  getMonthsInRange,
  fetchAttendanceDataForEmployeeMonths,
};
