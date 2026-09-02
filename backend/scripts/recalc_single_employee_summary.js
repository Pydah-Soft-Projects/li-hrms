/**
 * Recalculate MonthlyAttendanceSummary for one employee.
 * Usage: node scripts/recalc_single_employee_summary.js 2004 2026-08
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { calculateMonthlySummaryByEmpNo } = require('../attendance/services/summaryCalculationService');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');

const empNo = process.argv[2] || '2004';
const month = process.argv[3] || '2026-08';

function snapshot(summary) {
  if (!summary) return null;
  return {
    month: summary.month,
    totalPresentDays: summary.totalPresentDays,
    totalODDays: summary.totalODs,
    totalAbsentDays: summary.totalAbsentDays,
    totalPayableShifts: summary.totalPayableShifts,
    contributingAbsent: summary.contributingDates?.absent || [],
    contributingODs: summary.contributingDates?.ods || [],
  };
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Recalculating summary for emp_no=${empNo}, month=${month}...`);

    const before = await MonthlyAttendanceSummary.findOne({ emp_no: empNo, month }).lean();
    console.log('\n=== BEFORE ===');
    console.log(JSON.stringify(snapshot(before), null, 2));

    const result = await calculateMonthlySummaryByEmpNo(empNo, month);
    console.log('\n=== RECALC RESULT (returned doc) ===');
    console.log(JSON.stringify(snapshot(result), null, 2));

    const after = await MonthlyAttendanceSummary.findOne({ emp_no: empNo, month }).lean();
    console.log('\n=== AFTER (stored) ===');
    console.log(JSON.stringify(snapshot(after), null, 2));

    await mongoose.disconnect();
    console.log('\nDone.');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
    try {
      await mongoose.disconnect();
    } catch (_) {}
  }
})();
