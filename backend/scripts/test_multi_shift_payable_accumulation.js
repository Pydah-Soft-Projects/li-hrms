/**
 * End-to-end multi-shift payable test on REAL pay register data.
 *
 * Usage:
 *   node scripts/test_multi_shift_payable_accumulation.js [EMP_NO] [YYYY-MM]
 *
 * Example:
 *   node scripts/test_multi_shift_payable_accumulation.js 1823 2026-05
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const Shift = require('../shifts/model/Shift');
const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const AttendanceSettings = require('../attendance/model/AttendanceSettings');
const { calculateTotals } = require('../pay-register/services/totalsCalculationService');
const { applyShiftSelectionToDailyRecord } = require('../pay-register/services/payRegisterShiftUtils');

const EMP_NO = String(process.argv[2] || '').trim().toUpperCase();
const MONTH = process.argv[3] || '2026-05';

function sumPayableFromRecords(records) {
  let t = 0;
  for (const r of records || []) {
    if (r.status === 'blank') continue;
    const h1 = r.firstHalf?.status;
    const h2 = r.secondHalf?.status;
    if (h1 === 'present' || h1 === 'od') t += (Number(r.payableShifts) || 1) / 2;
    if (h2 === 'present' || h2 === 'od') t += (Number(r.payableShifts) || 1) / 2;
  }
  return Math.round(t * 100) / 100;
}

async function simulateEditDay(pr, date, shiftSelections, shiftById) {
  const dr = pr.dailyRecords.find((r) => r.date === date);
  if (!dr) throw new Error(`No daily record for ${date}`);

  const beforePayable = Number(dr.payableShifts) || 0;
  const beforeTotal = sumPayableFromRecords(pr.dailyRecords);

  await applyShiftSelectionToDailyRecord(dr, { shiftSelections });

  const afterPayable = Number(dr.payableShifts) || 0;
  pr.markModified('dailyRecords');
  pr.totals = calculateTotals(pr.dailyRecords, pr.contributingDates || {});
  pr.recalculateTotals();
  const afterTotal = pr.totals.totalPayableShifts;

  return {
    date,
    beforePayable,
    afterPayable,
    beforeTotal,
    afterTotal,
    deltaDay: afterPayable - beforePayable,
    deltaTotal: afterTotal - beforeTotal,
  };
}

async function main() {
  if (!EMP_NO) {
    console.log('Usage: node scripts/test_multi_shift_payable_accumulation.js EMP_NO [YYYY-MM]');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const settings = await AttendanceSettings.getSettings();
  const mode = settings?.processingMode?.mode || 'multi_shift';
  console.log('\n=== Multi-shift payable accumulation test ===');
  console.log('Attendance processingMode:', mode);
  if (mode !== 'multi_shift') {
    console.warn('WARNING: system is NOT in multi_shift mode — enable multi_shift in Attendance Settings for production behavior.');
  }

  const emp = await Employee.findOne({ emp_no: EMP_NO }).select('_id emp_no employee_name').lean();
  if (!emp) {
    console.error('Employee not found:', EMP_NO);
    process.exit(1);
  }

  const shifts = await Shift.find({ isActive: { $ne: false } })
    .select('name payableShifts')
    .sort({ payableShifts: 1 })
    .limit(10)
    .lean();
  if (shifts.length < 2) {
    console.error('Need at least 2 active shifts in DB');
    process.exit(1);
  }
  const shiftById = new Map(shifts.map((s) => [String(s._id), s]));
  const s1 = shifts[0];
  const s2 = shifts.find((s) => Number(s.payableShifts) > Number(s1.payableShifts)) || shifts[1];
  console.log('Using shifts:', s1.name, `payable=${s1.payableShifts}`, '|', s2.name, `payable=${s2.payableShifts}`);

  const pr = await PayRegisterSummary.findOne({ employeeId: emp._id, month: MONTH });
  if (!pr) {
    console.error('No pay register for', EMP_NO, MONTH);
    process.exit(1);
  }

  const baselineTotal = pr.totals?.totalPayableShifts ?? sumPayableFromRecords(pr.dailyRecords);
  console.log('\nEmployee:', emp.employee_name, EMP_NO, MONTH);
  console.log('Baseline totalPayableShifts (from stored grid):', baselineTotal);

  const isFullPresentDay = (r) =>
    (r.firstHalf?.status === 'present' || r.firstHalf?.status === 'od') &&
    (r.secondHalf?.status === 'present' || r.secondHalf?.status === 'od');

  const presentDays = (pr.dailyRecords || []).filter(
    (r) => r.firstHalf?.status === 'present' || r.secondHalf?.status === 'present' || r.status === 'present'
  );
  const fullPresentDays = presentDays.filter(isFullPresentDay);
  if (presentDays.length === 0) {
    console.log('No present days in pay register to test — pick another employee/month.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const testDay = (fullPresentDays[0] || presentDays[0]).date;
  console.log('Test day:', testDay, 'stored payableShifts:', presentDays[0].payableShifts);

  const editSelections = [
    { shiftId: s1._id, isHalf: false },
    { shiftId: s2._id, isHalf: false },
  ];
  const expectedDayPayable = (Number(s1.payableShifts) || 1) + (Number(s2.payableShifts) || 1);

  const result = await simulateEditDay(pr, testDay, editSelections, shiftById);

  console.log('\n--- After simulated multi-shift edit ---');
  console.log('Day payableShifts:', result.beforePayable, '→', result.afterPayable, `(expected ~${expectedDayPayable})`);
  console.log('Month totalPayableShifts:', result.beforeTotal, '→', result.afterTotal);
  console.log('Delta day payable:', result.deltaDay);
  console.log('Delta month payable:', result.deltaTotal);

  const expectedMonthDelta = result.afterPayable - result.beforePayable;
  const pass =
    Math.abs(result.afterPayable - expectedDayPayable) < 0.01 &&
    Math.abs(result.deltaTotal - expectedMonthDelta) < 0.01;

  console.log('\nRESULT:', pass ? 'PASS — multi-shift edit accumulates payable correctly' : 'FAIL');

  await mongoose.disconnect();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
