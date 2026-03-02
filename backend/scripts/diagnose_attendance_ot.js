/**
 * Diagnose OT calculation for a specific employee and date
 * Usage: node scripts/diagnose_attendance_ot.js <emp_no> <date>
 * Example: node scripts/diagnose_attendance_ot.js 1448 2026-02-25
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const empNo = process.argv[2]?.toUpperCase();
const date = process.argv[3];

if (!empNo || !date) {
  console.log('Usage: node scripts/diagnose_attendance_ot.js <emp_no> <date>');
  console.log('Example: node scripts/diagnose_attendance_ot.js 1448 2026-02-25');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const AttendanceDaily = require('../attendance/model/AttendanceDaily');
  const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
  const Shift = require('../shifts/model/Shift');
  const OT = require('../overtime/model/OT');

  const record = await AttendanceDaily.findOne({ employeeNumber: empNo, date })
    .populate('shifts.shiftId');

  if (!record) {
    console.log(`\nNo attendance record for ${empNo} on ${date}`);
    process.exit(0);
  }

  const rawLogs = await AttendanceRawLog.find({ employeeNumber: empNo, date })
    .sort({ timestamp: 1 })
    .lean();

  const emp = await require('../employees/model/Employee').findOne({ emp_no: empNo }).select('_id').lean();
  const approvedOT = emp
    ? await OT.findOne({
        employeeId: emp._id,
        date,
        status: 'approved',
        isActive: true,
      }).lean()
    : null;

  console.log('\n=== ATTENDANCE OT DIAGNOSIS ===\n');
  console.log(`Employee: ${empNo} | Date: ${date}\n`);

  console.log('--- RAW PUNCHES ---');
  if (rawLogs.length === 0) {
    console.log('  (No raw logs in AttendanceRawLog - may have come from Atlas sync)\n');
  } else {
    rawLogs.forEach((l, i) => {
      const t = new Date(l.timestamp);
      console.log(`  ${i + 1}. ${t.toLocaleTimeString('en-IN')} | type: ${l.type || 'null'}`);
    });
    console.log('');
  }

  console.log('--- SHIFTS (from record) ---');
  (record.shifts || []).forEach((s, i) => {
    const sh = s.shiftId;
    const name = sh?.name || s.shiftName || 'N/A';
    const duration = sh?.duration ?? s.expectedHours ?? 'N/A';
    const start = s.shiftStartTime || sh?.startTime || '-';
    const end = s.shiftEndTime || sh?.endTime || '-';
    console.log(`  Shift ${i + 1}: ${name}`);
    console.log(`    startTime: ${start}, endTime: ${end}, duration: ${duration} hrs`);
    console.log(`    inTime: ${s.inTime ? new Date(s.inTime).toLocaleTimeString() : '-'}`);
    console.log(`    outTime: ${s.outTime ? new Date(s.outTime).toLocaleTimeString() : '-'}`);
    console.log(`    workingHours: ${s.workingHours ?? '-'}`);
    console.log(`    expectedHours: ${s.expectedHours ?? '-'}`);
    console.log(`    extraHours: ${s.extraHours ?? 0}`);
    console.log(`    otHours: ${s.otHours ?? 0}`);
    console.log(`    lateInMinutes: ${s.lateInMinutes ?? 0}`);
    console.log(`    earlyOutMinutes: ${s.earlyOutMinutes ?? 0}`);
  });
  console.log('');

  console.log('--- DAILY TOTALS ---');
  console.log(`  totalWorkingHours: ${record.totalWorkingHours ?? 0}`);
  console.log(`  totalExpectedHours: ${record.totalExpectedHours ?? 0}`);
  console.log(`  otHours (stored):   ${record.otHours ?? 0}`);
  console.log(`  totalOTHours:       ${record.totalOTHours ?? 0}`);
  console.log(`  extraHours:         ${record.extraHours ?? 0}`);
  console.log(`  totalLateInMinutes: ${record.totalLateInMinutes ?? 0}`);
  console.log(`  totalEarlyOutMinutes: ${record.totalEarlyOutMinutes ?? 0}`);
  console.log('');

  if (approvedOT) {
    console.log('--- APPROVED OT REQUEST (OT model) ---');
    console.log(`  otHours: ${approvedOT.otHours ?? 0}`);
    console.log('  (Monthly summary / Pay Register use this, not attendance.otHours)');
    console.log('');
  }

  // OT formula check
  const totalWork = record.totalWorkingHours ?? 0;
  const expected = record.totalExpectedHours ?? 0;
  const expectedOT = totalWork > expected ? Math.round((totalWork - expected) * 100) / 100 : 0;
  console.log('--- OT FORMULA CHECK ---');
  console.log(`  workingHours - expectedHours = ${totalWork} - ${expected} = ${expectedOT}`);
  console.log(`  Stored otHours: ${record.otHours ?? 0}`);
  if (Math.abs((record.otHours ?? 0) - expectedOT) > 0.01) {
    console.log(`  ⚠️  Mismatch! Stored OT differs from (working - expected).`);
  }
  console.log('');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
