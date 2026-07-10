/**
 * First Month Roster Initialization Service
 *
 * When an employee application is verified, if the employee's weekdayShiftSchedule
 * is enabled, this service generates PreScheduledShift entries for every day of the
 * employee's first pay cycle using the configured weekday pattern:
 *   - Days whose weekday maps to a shift  → shift entry
 *   - Days whose weekday maps to week-off → WO entry
 *   - Days with no mapping               → skipped (no roster entry)
 *
 * Holidays are intentionally NOT written here — the holiday module handles that
 * separately (consistent with rosterAutoFillService behaviour).
 */

'use strict';

const PreScheduledShift = require('../model/PreScheduledShift');
const Settings = require('../../settings/model/Settings');
const EmployeeApplicationFormSettings = require('../../employee-applications/model/EmployeeApplicationFormSettings');
const { hasConfiguredWeekdaySchedule } = require('../../shared/utils/weekdayShiftScheduleUtils');
const { getAllDatesInRange, extractISTComponents } = require('../../shared/utils/dateUtils');

/**
 * Return JS getDay() weekday index (0=Sun … 6=Sat) for a YYYY-MM-DD string.
 * Uses wall-clock Date constructor — intentionally consistent with rosterAutoFillService.
 */
function getWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Resolve the payroll cycle date range that CONTAINS the given dojStr.
 *
 * If DOJ falls in the start-half  (day >= cycleStartDay) → use that cycle's range.
 * If DOJ falls in the trailing-half (day < cycleStartDay) → use the cycle ending this month.
 *
 * Returns { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
 */
async function getFirstPayCycleForDoj(dojStr) {
  const startDaySetting = await Settings.findOne({ key: 'payroll_cycle_start_day' }).lean();
  const endDaySetting   = await Settings.findOne({ key: 'payroll_cycle_end_day' }).lean();

  const cycleStartDay = startDaySetting?.value != null
    ? parseInt(String(startDaySetting.value), 10) : 26;
  const cycleEndDay   = endDaySetting?.value != null
    ? parseInt(String(endDaySetting.value),  10) : 25;

  const pad = (n) => String(n).padStart(2, '0');
  const [dojYear, dojMonth, dojDay] = dojStr.split('-').map(Number);

  let startDate, endDate;

  if (cycleStartDay <= cycleEndDay) {
    // Cycle stays within the same calendar month (e.g. 1–31)
    startDate = `${dojYear}-${pad(dojMonth)}-${pad(cycleStartDay)}`;
    endDate   = `${dojYear}-${pad(dojMonth)}-${pad(cycleEndDay)}`;
  } else {
    // Cycle spans two months (e.g. 26th of prev → 25th of current)
    if (dojDay >= cycleStartDay) {
      // DOJ is in the start-half (e.g. DOJ on 28th, cycleStart=26)
      const endMonth = dojMonth === 12 ? 1       : dojMonth + 1;
      const endYear  = dojMonth === 12 ? dojYear + 1 : dojYear;
      startDate = `${dojYear}-${pad(dojMonth)}-${pad(cycleStartDay)}`;
      endDate   = `${endYear}-${pad(endMonth)}-${pad(cycleEndDay)}`;
    } else {
      // DOJ is in the tail-half (e.g. DOJ on 10th, cycleEnd=25)
      const startMonth = dojMonth === 1  ? 12 : dojMonth - 1;
      const startYear  = dojMonth === 1  ? dojYear - 1 : dojYear;
      startDate = `${startYear}-${pad(startMonth)}-${pad(cycleStartDay)}`;
      endDate   = `${dojYear}-${pad(dojMonth)}-${pad(cycleEndDay)}`;
    }
  }

  return { startDate, endDate };
}

/**
 * Generate the first pay-cycle roster for a newly verified employee.
 *
 * @param {Object}   employee    - Employee doc/lean object with emp_no, doj, weekdayShiftSchedule
 * @param {ObjectId} scheduledBy - Verifier's User _id (stored as scheduledBy on each entry)
 * @returns {Promise<{ created: number, skipped: number, cycleRange: object|null, message: string }>}
 */
async function generateFirstMonthRoster(employee, scheduledBy) {
  const tag = '[FirstMonthRoster]';

  const formSettings = await EmployeeApplicationFormSettings.findOne({ isActive: true })
    .select('weekdayShiftSchedule')
    .lean();

  if (!formSettings?.weekdayShiftSchedule?.isEnabled) {
    console.log(`${tag} Skipped for ${employee?.emp_no}: weekday shift schedule disabled org-wide.`);
    return { created: 0, skipped: 0, cycleRange: null, message: 'Weekday shift schedule disabled org-wide.' };
  }

  const schedule = Array.isArray(employee?.weekdayShiftSchedule?.schedule)
    ? employee.weekdayShiftSchedule.schedule
    : [];

  if (!hasConfiguredWeekdaySchedule({ schedule })) {
    console.log(`${tag} Skipped for ${employee?.emp_no}: schedule array is empty.`);
    return { created: 0, skipped: 0, cycleRange: null, message: 'Weekday shift schedule is empty.' };
  }

  if (!employee.doj) {
    console.log(`${tag} Skipped for ${employee?.emp_no}: no DOJ on employee record.`);
    return { created: 0, skipped: 0, cycleRange: null, message: 'Employee has no date of joining.' };
  }

  // Build fast weekday → { shiftId, isWeekOff } lookup
  const weekdayMap = new Map();
  for (const entry of schedule) {
    const wd = Number(entry.weekday);
    if (wd < 0 || wd > 6) continue;
    if (!entry.isWeekOff && !entry.shiftId) continue;
    weekdayMap.set(wd, {
      shiftId:   entry.shiftId   || null,
      isWeekOff: entry.isWeekOff || false,
    });
  }

  if (weekdayMap.size === 0) {
    console.log(`${tag} Skipped for ${employee?.emp_no}: no configured weekday entries.`);
    return { created: 0, skipped: 0, cycleRange: null, message: 'Weekday shift schedule has no assigned days.' };
  }

  const dojStr = extractISTComponents(employee.doj).dateStr;
  const empNo  = String(employee.emp_no || '').toUpperCase();

  const cycleRange = await getFirstPayCycleForDoj(dojStr);
  const { startDate, endDate } = cycleRange;

  console.log(
    `${tag} emp=${empNo} doj=${dojStr} cycle=${startDate}→${endDate} weekdayEntries=${weekdayMap.size}`
  );

  // All dates in cycle from DOJ onward (skip pre-joining days)
  const allDates = getAllDatesInRange(startDate, endDate);
  const dates    = allDates.filter((d) => d >= dojStr);

  let created = 0;
  let skipped = 0;

  for (const dateStr of dates) {
    const weekday = getWeekday(dateStr);
    const cell    = weekdayMap.get(weekday);

    // No mapping for this weekday → leave unscheduled
    if (!cell) continue;

    // Safety guard: skip if an entry already exists
    const existing = await PreScheduledShift.findOne({ employeeNumber: empNo, date: dateStr }).lean();
    if (existing) {
      skipped++;
      continue;
    }

    try {
      if (cell.isWeekOff) {
        await PreScheduledShift.create({
          employeeNumber: empNo,
          date:           dateStr,
          shiftId:        null,
          status:         'WO',
          notes:          'Week Off',
          scheduledBy,
        });
        created++;
      } else if (cell.shiftId) {
        await PreScheduledShift.create({
          employeeNumber: empNo,
          date:           dateStr,
          shiftId:        cell.shiftId,
          status:         null,
          notes:          null,
          scheduledBy,
        });
        created++;
      } else {
        // Entry present but neither WO nor a real shift — skip
        skipped++;
      }
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate key (race) — harmless
        skipped++;
      } else {
        console.error(`${tag} Failed to create entry for ${empNo} on ${dateStr}:`, err.message);
        skipped++;
      }
    }
  }

  console.log(
    `${tag} emp=${empNo}: created=${created} skipped=${skipped} cycle=${startDate}→${endDate}`
  );

  return {
    created,
    skipped,
    cycleRange,
    message: `First-month roster generated: ${created} entries created for cycle ${startDate}→${endDate}.`,
  };
}

module.exports = { generateFirstMonthRoster };
