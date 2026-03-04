/**
 * Fetch MonthlyAttendanceSummary and AttendanceDaily for employee 272
 * for the pay cycle 26 Jan - 25 Feb (or current config's cycle for that period).
 *
 * Usage (from backend): node scripts/get_emp_272_summary_and_dailies.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const Employee = require('../employees/model/Employee');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');

const EMP_NO = '272';
const CYCLE_START = '2026-01-26';
const CYCLE_END = '2026-02-25';

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    const empNoNorm = String(EMP_NO).toUpperCase().trim();
    const employee = await Employee.findOne({ emp_no: empNoNorm }).select('_id emp_no employee_name').lean();
    if (!employee) {
      console.log('Employee not found for emp_no:', EMP_NO);
      process.exit(1);
    }
    console.log('Employee:', employee.employee_name || employee.emp_no, `(${employee.emp_no})\n`);

    const midDate = createISTDate('2026-02-15');
    const periodInfo = await dateCycleService.getPeriodInfo(midDate);
    const { startDate, endDate, month, year } = periodInfo.payrollCycle;
    const startDateStr = extractISTComponents(startDate).dateStr;
    const endDateStr = extractISTComponents(endDate).dateStr;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    console.log('Pay cycle (from dateCycleService for mid-cycle date):', startDateStr, '..', endDateStr, `(month key: ${monthStr})\n`);

    const summary = await MonthlyAttendanceSummary.findOne({
      employeeId: employee._id,
      month: monthStr,
    }).lean();

    console.log('--- MonthlyAttendanceSummary ---');
    if (!summary) {
      console.log('(none found for this month)\n');
    } else {
      console.log(JSON.stringify({
        month: summary.month,
        monthName: summary.monthName,
        totalPresentDays: summary.totalPresentDays,
        totalPayableShifts: summary.totalPayableShifts,
        totalLeaves: summary.totalLeaves,
        totalODs: summary.totalODs,
        totalOTHours: summary.totalOTHours,
        totalExtraHours: summary.totalExtraHours,
        totalLateInMinutes: summary.totalLateInMinutes,
        totalEarlyOutMinutes: summary.totalEarlyOutMinutes,
        lastCalculatedAt: summary.lastCalculatedAt,
      }, null, 2));
      console.log('');
    }

    const dailies = await AttendanceDaily.find({
      employeeNumber: empNoNorm,
      date: { $gte: startDateStr, $lte: endDateStr },
    })
      .sort({ date: 1 })
      .select('date status payableShifts totalWorkingHours odHours odDetails shifts totalLateInMinutes totalEarlyOutMinutes')
      .lean();

    console.log('--- AttendanceDaily (', startDateStr, '..', endDateStr, ') ---');
    console.log('Count:', dailies.length, '\n');
    dailies.forEach((d) => {
      const shiftSummary = (d.shifts || []).map((s) => ({
        name: s.shiftId?.name || s.shiftName,
        status: s.status,
        payableShift: s.payableShift,
        workingHours: s.workingHours,
        punchHours: s.punchHours,
        odHours: s.odHours,
        isLateIn: s.isLateIn,
        lateInMinutes: s.lateInMinutes,
        isEarlyOut: s.isEarlyOut,
        earlyOutMinutes: s.earlyOutMinutes,
      }));
      console.log({
        date: d.date,
        status: d.status,
        payableShifts: d.payableShifts,
        totalWorkingHours: d.totalWorkingHours,
        odHours: d.odHours,
        odDetails: d.odDetails ? { odStartTime: d.odDetails.odStartTime, odEndTime: d.odDetails.odEndTime, durationHours: d.odDetails.durationHours } : null,
        totalLateInMinutes: d.totalLateInMinutes,
        totalEarlyOutMinutes: d.totalEarlyOutMinutes,
        shifts: shiftSummary,
      });
      console.log('');
    });

    console.log('Done.');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
