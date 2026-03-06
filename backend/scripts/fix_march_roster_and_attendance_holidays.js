/**
 * ============================================================
 * FIX MARCH ROSTER & ATTENDANCE HOLIDAYS
 * ============================================================
 *
 * Goal:
 * - For the March payroll period, remove HOL from roster and use
 *   previous month's non-holiday weekday shifts instead.
 * - For the same period, convert AttendanceDaily records that are
 *   in HOLIDAY state to ABSENT (do not touch days that are not HOLIDAY).
 *
 * Cycle definition (payroll 26th–25th):
 *   TARGET_MONTH = month in which the target cycle ENDS.
 *   Example: TARGET_MONTH=2026-03
 *     → Previous cycle: 26 Jan 2026 – 25 Feb 2026
 *     → Target cycle:   26 Feb 2026 – 25 Mar 2026
 *
 * Behaviour:
 * 1) Roster (PreScheduledShift)
 *    - Build template (empNo, weekday) -> { shiftId, status } from previous cycle (excluding HOL).
 *    - Rebuild the entire target cycle roster from that template: for every (employee, date)
 *      in the target cycle, set roster from the previous cycle's same weekday (WO or shift).
 *    - No HOL is written; wrong or missing roster rows are overwritten with the correct pattern.
 *
 * 2) AttendanceDaily
 *    - For all AttendanceDaily where date is in target cycle and status === 'HOLIDAY':
 *        * If the record has punches (in/out times) → do NOT touch it (leave as-is).
 *        * If the record has NO punches → set status = 'ABSENT' and payableShifts = 0 (remove holiday).
 *    - So only people who had holiday and did not work get set to ABSENT; people who worked (have punches) are left unchanged.
 *
 * Usage (from backend folder):
 *   TARGET_MONTH=2026-03 node scripts/fix_march_roster_and_attendance_holidays.js
 *
 * Optional: TARGET_MONTH=2026-03 - target payroll month (default: next month)
 * ============================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Settings = require('../settings/model/Settings');
const User = require('../users/model/User');
const { getAllDatesInRange } = require('../shared/utils/dateUtils');

function getWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay(); // 0 = Sun, 1 = Mon, ...
}

function resolveTargetMonth() {
  let monthStr = process.env.TARGET_MONTH;
  if (monthStr && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr)) return monthStr;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  monthStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  return monthStr;
}

/**
 * Get payroll cycle that ENDS in the given (year, month).
 * E.g. (2026, 3) with startDay=26, endDay=25 → 2026-02-26 to 2026-03-25.
 */
function getCycleEndingInMonth(year, monthNum, startDay, endDay) {
  const pad = (n) => String(n).padStart(2, '0');
  const prevMonth = monthNum === 1 ? 12 : monthNum - 1;
  const prevYear = monthNum === 1 ? year - 1 : year;
  const startDate = `${prevYear}-${pad(prevMonth)}-${pad(Math.min(startDay, 31))}`;
  const endDate = `${year}-${pad(monthNum)}-${pad(Math.min(endDay, 31))}`;
  return { startDate, endDate };
}

async function getTargetAndPreviousRanges(targetMonthStr) {
  const [targetYear, targetMonthNum] = targetMonthStr.split('-').map(Number);
  const startDaySetting = await Settings.findOne({ key: 'payroll_cycle_start_day' }).lean();
  const endDaySetting = await Settings.findOne({ key: 'payroll_cycle_end_day' }).lean();
  const startDay = startDaySetting != null && startDaySetting.value != null
    ? parseInt(String(startDaySetting.value), 10) : 26;
  const endDay = endDaySetting != null && endDaySetting.value != null
    ? parseInt(String(endDaySetting.value), 10) : 25;
  if (!startDaySetting || !endDaySetting) {
    console.log('(Using default cycle: startDay=26, endDay=25; no Settings found or value missing)\n');
  } else {
    console.log('Payroll cycle from Settings: startDay=', startDay, ', endDay=', endDay, '\n');
  }

  const targetRange = getCycleEndingInMonth(targetYear, targetMonthNum, startDay, endDay);
  const prevMonthNum = targetMonthNum === 1 ? 12 : targetMonthNum - 1;
  const prevYear = targetMonthNum === 1 ? targetYear - 1 : targetYear;
  const previousRange = getCycleEndingInMonth(prevYear, prevMonthNum, startDay, endDay);

  return { targetRange, previousRange };
}

async function main() {
  const targetMonth = resolveTargetMonth();
  console.log('\n--- Fix Roster & Attendance HOL for', targetMonth, '---\n');

  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not set in .env');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.\n');

    const { targetRange, previousRange } = await getTargetAndPreviousRanges(targetMonth);

    console.log('Previous cycle (template):', previousRange.startDate, 'to', previousRange.endDate);
    console.log('Target cycle (to fix)    :', targetRange.startDate, 'to', targetRange.endDate, '\n');

    const employees = await Employee.find({ is_active: true, leftDate: null })
      .select('emp_no')
      .lean();
    const empNos = employees.map((e) => String(e.emp_no || '').toUpperCase()).filter(Boolean);
    if (empNos.length === 0) {
      console.log('No active employees found. Nothing to do.');
      return;
    }
    console.log('Employees in scope:', empNos.length);

    // Match roster whether employeeNumber is stored upper or lower case
    const empNoSet = new Set(empNos);
    const empNoList = [...new Set([...empNos, ...empNos.map((e) => e.toLowerCase())])];

    // 1) Build template map from previous cycle: (empNo, weekday) -> { shiftId, status }
    const templateQuery = {
      employeeNumber: { $in: empNoList },
      date: { $gte: previousRange.startDate, $lte: previousRange.endDate },
    };
    const prevRowsInScope = await PreScheduledShift.find(templateQuery)
      .select('employeeNumber date shiftId status')
      .lean();
    console.log('PreScheduledShift in previous cycle (in scope):', prevRowsInScope.length);

    const templateMap = new Map();
    for (const r of prevRowsInScope) {
      if (r.status === 'HOL') continue; // ignore holidays from template
      const empNo = String(r.employeeNumber || '').trim().toUpperCase();
      if (!empNo) continue;
      const weekday = getWeekday(r.date);
      const key = `${empNo}|${weekday}`;
      if (!templateMap.has(key)) {
        templateMap.set(key, {
          shiftId: r.shiftId || null,
          status: r.status || null,
        });
      }
    }
    console.log('Template keys (emp+weekday) from previous cycle, excluding HOL:', templateMap.size);

    if (templateMap.size === 0) {
      console.log('No template data from previous cycle; cannot rebuild target roster. Fill previous cycle roster first.');
    } else {
      const superAdmin = await User.findOne({ role: 'super_admin' }).select('_id').lean();
      const scheduledBy = superAdmin?._id;
      if (!scheduledBy) {
        console.log('No super_admin user found; roster updates require scheduledBy. Skipping roster rebuild.');
      } else {
        // 2) Rebuild entire target cycle roster from previous-cycle template (by weekday). No HOL.
        const targetDates = getAllDatesInRange(targetRange.startDate, targetRange.endDate);
        let rosterUpserted = 0;
        let rosterSkippedNoTemplate = 0;

        for (const empNo of empNos) {
          for (const dateStr of targetDates) {
            const weekday = getWeekday(dateStr);
            const key = `${empNo}|${weekday}`;
            const tpl = templateMap.get(key);
            if (!tpl) {
              rosterSkippedNoTemplate++;
              continue;
            }
            const payload = {
              date: dateStr,
              scheduledBy,
            };
            if (tpl.status === 'WO') {
              payload.shiftId = null;
              payload.status = 'WO';
              payload.notes = 'Week Off';
            } else if (tpl.shiftId) {
              payload.shiftId = tpl.shiftId;
              payload.status = null;
              payload.notes = null;
            } else {
              rosterSkippedNoTemplate++;
              continue;
            }
            await PreScheduledShift.findOneAndUpdate(
              { employeeNumber: empNo, date: dateStr },
              { $set: payload },
              { upsert: true }
            );
            rosterUpserted++;
          }
        }

        console.log('\nRoster rebuild in target cycle:');
        console.log('  Upserted (from previous cycle template):', rosterUpserted);
        console.log('  Skipped (no template for that weekday):  ', rosterSkippedNoTemplate);
      }
    }

    // 3) Fix AttendanceDaily: set ABSENT only for HOLIDAY records that have NO punches; leave records with punches unchanged
    const dailyFilter = {
      date: { $gte: targetRange.startDate, $lte: targetRange.endDate },
      status: 'HOLIDAY',
    };
    const holidayDailies = await AttendanceDaily.find(dailyFilter)
      .select('_id employeeNumber date shifts status payableShifts')
      .lean();
    const totalDailiesInRange = await AttendanceDaily.countDocuments({
      date: { $gte: targetRange.startDate, $lte: targetRange.endDate },
    });

    function hasPunches(d) {
      const shifts = d && d.shifts;
      if (!Array.isArray(shifts) || shifts.length === 0) return false;
      return shifts.some((s) => s && s.inTime);
    }

    console.log('\nAttendanceDaily in target cycle (total):', totalDailiesInRange, '| with status=HOLIDAY:', holidayDailies.length);

    let dailyUpdated = 0;
    let dailySkippedPunches = 0;
    for (const d of holidayDailies) {
      if (hasPunches(d)) {
        dailySkippedPunches++;
        continue; // do not touch: they have punches (worked that day)
      }
      await AttendanceDaily.findByIdAndUpdate(d._id, {
        $set: { status: 'ABSENT', payableShifts: 0 },
      });
      dailyUpdated++;
    }

    console.log('AttendanceDaily set to ABSENT (no punches):', dailyUpdated);
    console.log('AttendanceDaily left unchanged (had punches):', dailySkippedPunches);
    if (dailyUpdated === 0 && holidayDailies.length === 0) {
      console.log('\n[Attendance] No AttendanceDaily with status=HOLIDAY in target cycle (or all had punches and were left unchanged).');
    }
    console.log('\nDone.\n');
  } catch (err) {
    console.error('Error in fix_march_roster_and_attendance_holidays:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.\n');
    process.exit(0);
  }
}

main();

