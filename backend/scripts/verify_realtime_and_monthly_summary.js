/**
 * Verify real-time flow, post-save hook chain, and monthly summary inclusion
 *
 * 1. Uses real AttendanceDaily records (prefer biometric-realtime source)
 * 2. Triggers recalculateOnAttendanceUpdate for each and checks MonthlyAttendanceSummary
 * 3. Verifies totalPresentDays and totalPayableShifts include daily records + OD-only (0.5/1)
 *
 * Usage (from backend folder):
 *   node scripts/verify_realtime_and_monthly_summary.js
 *   EMP_NO=2067 node scripts/verify_realtime_and_monthly_summary.js
 *   LIMIT=3 node scripts/verify_realtime_and_monthly_summary.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const OD = require('../leaves/model/OD');
const Employee = require('../employees/model/Employee');
const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');

const LIMIT = parseInt(process.env.LIMIT || '5', 10);
const EMP_NO_FILTER = process.env.EMP_NO ? String(process.env.EMP_NO).toUpperCase().trim() : null;

async function getPayrollPeriodForDate(dateStr) {
  const baseDate = createISTDate(dateStr);
  const periodInfo = await dateCycleService.getPeriodInfo(baseDate);
  const { year, month: monthNumber } = periodInfo.payrollCycle;
  return { year, monthNumber };
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    // 1. Find recent AttendanceDaily (prefer real-time source)
    const query = { date: { $gte: '2025-01-01' } };
    if (EMP_NO_FILTER) query.employeeNumber = EMP_NO_FILTER;
    const dailies = await AttendanceDaily.find(query)
      .sort({ date: -1, updatedAt: -1 })
      .limit(LIMIT * 2)
      .select('employeeNumber date status payableShifts source shifts totalWorkingHours')
      .lean();

    const withRealtime = dailies.filter((d) => Array.isArray(d.source) && d.source.includes('biometric-realtime'));
    const sample = (withRealtime.length >= LIMIT ? withRealtime : dailies).slice(0, LIMIT);

    if (sample.length === 0) {
      console.log('No AttendanceDaily records found. Create some via real-time sync or seed.');
      process.exit(0);
    }

    console.log(`--- Sample of ${sample.length} daily record(s) ---`);
    sample.forEach((d) => {
      console.log(`  ${d.employeeNumber} | ${d.date} | status=${d.status} | payable=${d.payableShifts} | source=${(d.source || []).join(',') || 'none'}`);
    });
    console.log('');

    const reported = new Set();
    for (const daily of sample) {
      const empNo = (daily.employeeNumber && String(daily.employeeNumber).trim()) ? String(daily.employeeNumber).toUpperCase() : daily.employeeNumber;
      const date = daily.date;
      const key = `${empNo}|${date}`;
      if (reported.has(key)) continue;
      reported.add(key);

      const employee = await Employee.findOne({ emp_no: empNo }).select('_id emp_no').lean();
      if (!employee) {
        console.log(`  Skip ${empNo} ${date}: employee not found`);
        continue;
      }

      const { year, monthNumber } = await getPayrollPeriodForDate(date);
      const monthStr = `${year}-${String(monthNumber).padStart(2, '0')}`;

      const summaryBefore = await MonthlyAttendanceSummary.findOne({
        employeeId: employee._id,
        month: monthStr,
      }).lean();

      console.log(`--- Recalc for ${empNo} on ${date} (month ${monthStr}) ---`);
      console.log(`  Summary before: totalPresentDays=${summaryBefore?.totalPresentDays ?? 'N/A'}, totalPayableShifts=${summaryBefore?.totalPayableShifts ?? 'N/A'}`);

      await recalculateOnAttendanceUpdate(empNo, date);

      const summaryAfter = await MonthlyAttendanceSummary.findOne({
        employeeId: employee._id,
        month: monthStr,
      }).lean();

      console.log(`  Summary after:  totalPresentDays=${summaryAfter?.totalPresentDays ?? 'N/A'}, totalPayableShifts=${summaryAfter?.totalPayableShifts ?? 'N/A'}`);

      const approvedODs = await OD.find({
        employeeId: employee._id,
        status: 'approved',
        isActive: true,
        fromDate: { $lte: new Date(`${date}T23:59:59.999+05:30`) },
        toDate: { $gte: new Date(`${date}T00:00:00+05:30`) },
      }).select('odType_extended isHalfDay fromDate toDate').lean();

      if (approvedODs.length > 0) {
        console.log(`  Approved ODs for this date: ${approvedODs.length} (included in monthly aggregates if no daily record for OD-only days)`);
      }
      console.log('');
    }

    // 2. Verify hook chain (documentation)
    console.log('--- Hook chain ---');
    console.log('  Real-time: POST /api/attendance/internal/sync -> processMultiShiftAttendance -> AttendanceDaily.save()');
    console.log('  Post-save (AttendanceDaily): setImmediate -> recalculateOnAttendanceUpdate(emp_no, date)');
    console.log('  recalculateOnAttendanceUpdate -> getPeriodInfo(date) -> calculateMonthlySummary(employeeId, emp_no, year, month)');
    console.log('  calculateMonthlySummary:');
    console.log('    - Loads all AttendanceDaily for that employee in payroll period (fresh from DB)');
    console.log('    - totalPresentDays = sum from daily status (PRESENT/PARTIAL=1, HALF_DAY=0.5)');
    console.log('    - totalPayableShifts = sum of daily payableShifts');
    console.log('    - Adds OD-only days: for approved half/full-day OD on dates with no attendance record, adds 0.5 or 1 to both totalPresentDays and totalPayableShifts');
    console.log('    - Saves MonthlyAttendanceSummary');
    console.log('');

    // 3. Spot-check one month: manual sum vs summary (using same payroll period as calculateMonthlySummary)
    const one = sample[0];
    const empNoOne = (one.employeeNumber && String(one.employeeNumber).trim()) ? String(one.employeeNumber).toUpperCase() : one.employeeNumber;
    const { year, monthNumber } = await getPayrollPeriodForDate(one.date);
    const monthStr = `${year}-${String(monthNumber).padStart(2, '0')}`;
    const anchorDateStr = `${year}-${String(monthNumber).padStart(2, '0')}-15`;
    const periodInfo = await dateCycleService.getPeriodInfo(createISTDate(anchorDateStr));
    const startDateStr = extractISTComponents(periodInfo.payrollCycle.startDate).dateStr;
    const endDateStr = extractISTComponents(periodInfo.payrollCycle.endDate).dateStr;
    const emp = await Employee.findOne({ emp_no: empNoOne }).select('_id').lean();
    if (emp) {
      const allDailies = await AttendanceDaily.find({
        employeeNumber: empNoOne,
        date: { $gte: startDateStr, $lte: endDateStr },
      }).select('date status payableShifts').lean();
      let manualPresent = 0;
      let manualPayable = 0;
      const datesSet = new Set();
      for (const r of allDailies) {
        datesSet.add(r.date);
        if (r.status === 'PRESENT' || r.status === 'PARTIAL') manualPresent += 1;
        else if (r.status === 'HALF_DAY') manualPresent += 0.5;
        manualPayable += Number(r.payableShifts ?? 0);
      }
      const ods = await OD.find({
        employeeId: emp._id,
        status: 'approved',
        isActive: true,
        odType_extended: { $ne: 'hours' },
        fromDate: { $lte: createISTDate(endDateStr, '23:59') },
        toDate: { $gte: createISTDate(startDateStr, '00:00') },
      }).select('fromDate toDate isHalfDay').lean();
      let odOnlyPresent = 0;
      let odOnlyPayable = 0;
      for (const od of ods) {
        const fromStr = extractISTComponents(od.fromDate).dateStr;
        const toStr = extractISTComponents(od.toDate).dateStr;
        const contrib = od.isHalfDay ? 0.5 : 1;
        let d = new Date(fromStr + 'T12:00:00');
        const end = new Date(toStr + 'T12:00:00');
        while (d <= end) {
          const ds = extractISTComponents(d).dateStr;
          if (ds >= startDateStr && ds <= endDateStr && !datesSet.has(ds)) {
            odOnlyPresent += contrib;
            odOnlyPayable += contrib;
          }
          d.setDate(d.getDate() + 1);
        }
      }
      const expectedPresent = Math.round((manualPresent + odOnlyPresent) * 10) / 10;
      const expectedPayable = Math.round((manualPayable + odOnlyPayable) * 100) / 100;
      const summary = await MonthlyAttendanceSummary.findOne({ employeeId: emp._id, month: monthStr }).lean();
      console.log('--- Consistency check (one month, payroll period) ---');
      console.log(`  Employee ${empNoOne}, period ${startDateStr}..${endDateStr}`);
      console.log(`  From dailies: present=${manualPresent}, payable=${manualPayable}`);
      console.log(`  OD-only add:  present=${odOnlyPresent}, payable=${odOnlyPayable}`);
      console.log(`  Expected:     totalPresentDays=${expectedPresent}, totalPayableShifts=${expectedPayable}`);
      console.log(`  Summary:      totalPresentDays=${summary?.totalPresentDays ?? 'N/A'}, totalPayableShifts=${summary?.totalPayableShifts ?? 'N/A'}`);
      const ok = summary && Math.abs((summary.totalPresentDays || 0) - expectedPresent) < 0.01 && Math.abs((summary.totalPayableShifts || 0) - expectedPayable) < 0.01;
      console.log(ok ? '  Match: YES' : '  Match: NO (re-run recalc or check OD/date range)');
    }

    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
