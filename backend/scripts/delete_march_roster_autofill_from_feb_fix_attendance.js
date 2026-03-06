/**
 * ============================================================
 * DELETE MARCH ROSTER → AUTO-FILL FROM FEB → REMOVE HOLIDAY FROM ATTENDANCE
 * ============================================================
 *
 * 1) Delete ALL shift roster (PreScheduledShift) for the March payroll period
 *    (cycle ending in March, e.g. 26 Feb 2026 – 25 Mar 2026).
 *
 * 2) Auto-fill that period from the February period (previous cycle:
 *    26 Jan – 25 Feb) using the same logic as "Auto Fill Next Cycle"
 *    (by weekday, no HOL in roster).
 *
 * 3) For attendance (AttendanceDaily) in the March period: remove holiday
 *    – set status = ABSENT and payableShifts = 0 for records with
 *    status = HOLIDAY and no punches; leave records with punches unchanged.
 *
 * Usage (from backend folder):
 *   TARGET_MONTH=2026-03 node scripts/delete_march_roster_autofill_from_feb_fix_attendance.js
 *
 * TARGET_MONTH = month in which the target cycle ENDS (optional).
 *   Default: 2026-03 → March period 26 Feb–25 Mar, template Feb period 26 Jan–25 Feb.
 *   Set TARGET_MONTH=YYYY-MM to run for another month.
 * ============================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Settings = require('../settings/model/Settings');
const User = require('../users/model/User');
const { autoFillNextCycleFromPrevious } = require('../shifts/services/rosterAutoFillService');

// March period = 26 Feb–25 Mar. Default target month when not set or invalid.
const DEFAULT_TARGET_MONTH = '2026-03';

function resolveTargetMonth() {
  let monthStr = (process.env.TARGET_MONTH || '').trim();
  if (monthStr && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr)) return monthStr;
  return DEFAULT_TARGET_MONTH;
}

/** Cycle that ENDS in (year, month). E.g. (2026, 3) with 26/25 → 2026-02-26 to 2026-03-25 */
function getCycleEndingInMonth(year, monthNum, startDay, endDay) {
  const pad = (n) => String(n).padStart(2, '0');
  const prevMonth = monthNum === 1 ? 12 : monthNum - 1;
  const prevYear = monthNum === 1 ? year - 1 : year;
  const startDate = `${prevYear}-${pad(prevMonth)}-${pad(Math.min(startDay, 31))}`;
  const endDate = `${year}-${pad(monthNum)}-${pad(Math.min(endDay, 31))}`;
  return { startDate, endDate };
}

async function getMarchCycleRange(targetMonthStr) {
  const [targetYear, targetMonthNum] = targetMonthStr.split('-').map(Number);
  const startDaySetting = await Settings.findOne({ key: 'payroll_cycle_start_day' }).lean();
  const endDaySetting = await Settings.findOne({ key: 'payroll_cycle_end_day' }).lean();
  const startDay = startDaySetting?.value != null ? parseInt(String(startDaySetting.value), 10) : 26;
  const endDay = endDaySetting?.value != null ? parseInt(String(endDaySetting.value), 10) : 25;
  return getCycleEndingInMonth(targetYear, targetMonthNum, startDay, endDay);
}

function hasPunches(d) {
  const shifts = d?.shifts;
  if (!Array.isArray(shifts) || shifts.length === 0) return false;
  return shifts.some((s) => s && s.inTime);
}

async function main() {
  const targetMonth = resolveTargetMonth();
  console.log('\n--- Delete roster → Auto-fill from previous cycle → Fix attendance ---\n');
  console.log('TARGET_MONTH (cycle ends in this month):', targetMonth);
  if (!(process.env.TARGET_MONTH || '').trim()) {
    console.log('(Using default: March period 26 Feb–25 Mar. Set TARGET_MONTH=YYYY-MM to change.)\n');
  }

  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not set in .env');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.\n');

    const { startDate: marchStart, endDate: marchEnd } = await getMarchCycleRange(targetMonth);
    console.log('Target period (roster + attendance):', marchStart, 'to', marchEnd, '\n');

    // ----- 1) Delete ALL shift roster for March period -----
    const deleteResult = await PreScheduledShift.deleteMany({
      date: { $gte: marchStart, $lte: marchEnd },
    });
    console.log('[1] Deleted PreScheduledShift in March period:', deleteResult.deletedCount);

    // ----- 2) Auto-fill March from February -----
    const superAdmin = await User.findOne({ role: 'super_admin' }).select('_id').lean();
    if (!superAdmin?._id) {
      throw new Error('No super_admin user found. Create one to run auto-fill.');
    }
    const fillResult = await autoFillNextCycleFromPrevious({
      targetMonth,
      scheduledBy: superAdmin._id,
    });
    console.log('[2] Auto-fill from previous cycle:', fillResult.message);
    console.log('    Feb period (template):  ', fillResult.previousRange?.startDate, '–', fillResult.previousRange?.endDate);
    console.log('    March period (filled): ', fillResult.nextRange?.startDate, '–', fillResult.nextRange?.endDate);
    console.log('    Filled:', fillResult.filled, 'roster entries');

    // ----- 3) Remove holiday from attendance in March period -----
    const holidayDailies = await AttendanceDaily.find({
      date: { $gte: marchStart, $lte: marchEnd },
      status: 'HOLIDAY',
    })
      .select('_id shifts status payableShifts')
      .lean();

    let dailyUpdated = 0;
    let dailySkippedPunches = 0;
    for (const d of holidayDailies) {
      if (hasPunches(d)) {
        dailySkippedPunches++;
        continue;
      }
      await AttendanceDaily.findByIdAndUpdate(d._id, {
        $set: { status: 'ABSENT', payableShifts: 0 },
      });
      dailyUpdated++;
    }
    console.log('\n[3] Attendance: HOLIDAY → ABSENT in March period');
    console.log('    Updated (no punches):', dailyUpdated);
    console.log('    Left unchanged (had punches):', dailySkippedPunches);

    console.log('\nDone.\n');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.\n');
    process.exit(0);
  }
}

main();
