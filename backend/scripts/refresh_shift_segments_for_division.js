/**
 * Refresh shift half-segment metadata on AttendanceDaily for a division (default: PYDAH SOFT)
 * for the previous payroll period (April pay period when run in May).
 *
 * Per-record output: shows whether segment detection was invoked, how many segments
 * were produced, totalPayableShifts, and continuity warnings.
 *
 * Usage (from backend folder):
 *   node scripts/refresh_shift_segments_for_division.js
 *   DIVISION="PYDAH SOFT" MONTH=2026-04 node scripts/refresh_shift_segments_for_division.js
 *   DIVISION="PYDAH SOFT" MONTH=2026-04 LIMIT=20 node scripts/refresh_shift_segments_for_division.js
 *   DRY_RUN=1 ... (computes + logs but does not save)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

const Division = require('../departments/model/Division');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Shift = require('../shifts/model/Shift');
const Settings = require('../settings/model/Settings');

const { getPayrollDateRange } = require('../shared/utils/dateUtils');
const { getShiftSegmentAssignment } = require('../shifts/services/shiftHalfSegmentService');
const { refreshAttendanceShiftSegments } = require('../attendance/services/shiftSegmentAttendanceService');
const { pickDivisionShiftConfig, applyDivisionSegmentsToShift } = require('../shared/utils/divisionShiftSegments');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fmtTime(date) {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function resolvePreviousPayrollMonth(today = new Date()) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return { year: prevYear, monthNumber: prevMonth };
}

async function run() {
  const mongoURI =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    'mongodb://localhost:27017/hrms';

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoURI);
  console.log('Connected.\n');

  const divisionInput = (process.env.DIVISION || process.env.DIVISION_NAME || 'PYDAH SOFT').trim();
  const division = await Division.findOne({
    $or: [
      { name: new RegExp('^' + escapeRegex(divisionInput) + '$', 'i') },
      { code: divisionInput.toUpperCase() },
    ],
  }).select('_id name code shifts').lean();

  if (!division) {
    console.error('Division not found:', divisionInput);
    process.exit(1);
  }

  let year;
  let monthNumber;
  if (process.env.MONTH && /^\d{4}-\d{2}$/.test(process.env.MONTH)) {
    [year, monthNumber] = process.env.MONTH.split('-').map(Number);
  } else {
    ({ year, monthNumber } = resolvePreviousPayrollMonth());
  }

  const { startDate, endDate, totalDays } = await getPayrollDateRange(year, monthNumber);
  console.log(`Division: ${division.name} (${division._id})`);
  console.log(`Pay period: ${year}-${String(monthNumber).padStart(2, '0')} => ${startDate} .. ${endDate} (${totalDays} days)`);

  const generalConfig = (await Settings.getSettingsByCategory('general')) || {};
  const graceOpts = {
    globalLateInGrace: generalConfig.late_in_grace_time ?? null,
    globalEarlyOutGrace: generalConfig.early_out_grace_time ?? null,
  };

  const employees = await Employee.find({ division_id: division._id })
    .select('_id emp_no employee_name is_active')
    .lean();

  const empNos = employees
    .map((e) => String(e.emp_no || '').toUpperCase())
    .filter(Boolean);

  console.log(`Employees in division: ${employees.length}`);

  if (!empNos.length) {
    console.log('No employees with emp_no. Done.');
    await mongoose.disconnect();
    return;
  }

  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0;
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

  const query = {
    employeeNumber: { $in: empNos },
    date: { $gte: startDate, $lte: endDate },
  };
  const cursor = AttendanceDaily.find(query).cursor();

  let processed = 0;
  let withSegments = 0;
  let withoutSegments = 0;
  let updated = 0;
  let skippedLocked = 0;
  let errors = 0;

  const startedAt = Date.now();

  console.log('');
  console.log('Per-record results (invocation per shift row):');
  console.log('─'.repeat(120));

  for await (const daily of cursor) {
    processed += 1;
    if (limit && processed > limit) break;

    const empName = (employees.find((e) => String(e.emp_no || '').toUpperCase() === daily.employeeNumber) || {}).employee_name || daily.employeeNumber;

    const dailyPayable = typeof daily.payableShifts === 'number' ? daily.payableShifts : 0;
    const dailyStatus = daily.status || '-';

    if (!daily.shifts || !daily.shifts.length) {
      console.log(
        `[${processed.toString().padStart(4, ' ')}] ${daily.employeeNumber} ${daily.date} | ${dailyStatus.padEnd(8, ' ')} | dailyPayable=${dailyPayable} | NO SHIFTS ON ROW (segment detection NOT invoked) — ${empName}`
      );
      withoutSegments += 1;
      continue;
    }

    for (const shift of daily.shifts) {
      const shiftId = shift.shiftId;
      let shiftDef = null;
      if (shiftId) shiftDef = await Shift.findById(shiftId).lean();

      const inTime = shift.inTime ? new Date(shift.inTime) : null;
      const outTime = shift.outTime ? new Date(shift.outTime) : null;
      const rowPayable = typeof shift.payableShift === 'number' ? shift.payableShift : 0;
      const rowStatus = shift.status || '-';

      // Division is source of truth for segment definitions. Compute "effective shift" using division config.
      let effectiveShiftDef = shiftDef;
      if (shiftDef && division) {
        const employee = await Employee.findOne({ emp_no: daily.employeeNumber }).select('gender employee_group_id').lean();
        const row = await pickDivisionShiftConfig({
          division,
          shiftId: shiftDef._id,
          employeeGender: employee?.gender || null,
          employeeGroupId: employee?.employee_group_id || null,
        });
        effectiveShiftDef = applyDivisionSegmentsToShift(shiftDef, row);
      } else if (shiftDef) {
        effectiveShiftDef = applyDivisionSegmentsToShift(shiftDef, null);
      }

      const hasSegmentDef = !!(effectiveShiftDef && (effectiveShiftDef.firstHalf || effectiveShiftDef.secondHalf));

      if (!effectiveShiftDef || !hasSegmentDef || !inTime) {
        console.log(
          `[${processed.toString().padStart(4, ' ')}] ${daily.employeeNumber} ${daily.date} S${shift.shiftNumber || 1} | ${rowStatus.padEnd(8, ' ')} | ` +
          `${shift.shiftName || effectiveShiftDef?.name || 'NO-SHIFT-DEF'} | ` +
          `IN=${fmtTime(inTime)} OUT=${fmtTime(outTime)} | ` +
          `rowPayable=${rowPayable} dailyPayable=${dailyPayable} | ` +
          `segment detection: SKIPPED (${!effectiveShiftDef ? 'no shift def' : !hasSegmentDef ? 'no division first/second half config' : 'no in-time'})`
        );
        withoutSegments += 1;
        continue;
      }

      const seg = getShiftSegmentAssignment(effectiveShiftDef, daily.date, inTime, outTime, graceOpts);
      const segNames = (seg.shiftSegments || []).map(
        (s) => `${s.segmentName}:${s.present ? 'P' : 'A'}(pay=${s.payableShifts ?? 0})`
      );

      withSegments += 1;
      console.log(
        `[${processed.toString().padStart(4, ' ')}] ${daily.employeeNumber} ${daily.date} S${shift.shiftNumber || 1} | ${rowStatus.padEnd(8, ' ')} | ${effectiveShiftDef.name} ${effectiveShiftDef.startTime}-${effectiveShiftDef.endTime} | ` +
        `IN=${fmtTime(inTime)} OUT=${fmtTime(outTime)} | ` +
        `rowPayable=${rowPayable} dailyPayable=${dailyPayable} | ` +
        `segments=[${segNames.join(', ')}] segTotalPayable=${seg.totalPayableShifts} ` +
        (seg.continuityWarnings && seg.continuityWarnings.length ? `warnings=${JSON.stringify(seg.continuityWarnings)}` : '')
      );
    }

    if (dryRun) continue;

    try {
      const result = await refreshAttendanceShiftSegments(daily.employeeNumber, daily.date);
      if (result?.success) {
        updated += 1;
      } else if ((result?.message || '').toLowerCase().includes('locked')) {
        skippedLocked += 1;
      } else {
        errors += 1;
      }
    } catch (e) {
      errors += 1;
      console.error(`[refresh-error] ${daily.employeeNumber} ${daily.date}:`, e.message);
    }
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('─'.repeat(120));
  console.log('\nSummary');
  console.log('  Division:', division.name);
  console.log('  Pay period:', `${startDate} .. ${endDate}`);
  console.log('  Dailies processed:', processed - (limit && processed > limit ? 1 : 0));
  console.log('  Shift rows with segment detection invoked:', withSegments);
  console.log('  Shift rows segment detection NOT applicable:', withoutSegments);
  if (!dryRun) {
    console.log('  Dailies updated:', updated);
    console.log('  Skipped (locked / no shifts):', skippedLocked);
    console.log('  Errors:', errors);
  } else {
    console.log('  DRY RUN: no writes performed.');
  }
  console.log('  Elapsed:', elapsedSec, 's');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Script failed:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
