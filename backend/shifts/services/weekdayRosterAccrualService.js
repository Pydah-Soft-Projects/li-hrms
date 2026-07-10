/**
 * Weekday Roster Accrual Service
 *
 * Generates PreScheduledShift entries for the NEXT payroll cycle for every
 * active employee whose `weekdayShiftSchedule.isEnabled === true` and whose
 * schedule array contains at least one real shift or week-off entry.
 *
 * Designed to run automatically on the last night of every pay cycle
 * (23:55 IST on the cycle end date) so the next cycle's roster is ready
 * the moment the new period starts.
 *
 * Rules
 * -----
 * • Employees WITHOUT weekdayShiftSchedule are skipped entirely.
 * • Org-level form settings toggle must be enabled (no per-employee isEnabled flag).
 * • For each day in the next cycle, we look up the day's weekday index and apply
 *   the configured shift or week-off.
 * • Days with no entry in the schedule are left unscheduled (no roster entry).
 * • Holidays are NOT written — the holiday module owns those entries.
 * • Employees whose DOJ is after the next cycle's end date are skipped (not yet
 *   joining in that period).
 * • Employees whose DOJ falls WITHIN the next cycle are only rostered from DOJ
 *   onward (same behaviour as firstMonthRosterService).
 * • Idempotent: uses insertMany with ordered:false + duplicate-key (11000) skip,
 *   so re-running never creates double entries.
 */

'use strict';

const PreScheduledShift                = require('../model/PreScheduledShift');
const Employee                         = require('../../employees/model/Employee');
const EmployeeApplicationFormSettings  = require('../../employee-applications/model/EmployeeApplicationFormSettings');
const Settings          = require('../../settings/model/Settings');
const { hasConfiguredWeekdaySchedule } = require('../../shared/utils/weekdayShiftScheduleUtils');
const {
  getAllDatesInRange,
  extractISTComponents,
} = require('../../shared/utils/dateUtils');

const TAG = '[WeekdayRosterAccrual]';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** JS getDay() weekday index (0=Sun … 6=Sat) for a YYYY-MM-DD string. */
function getWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Resolve the payroll cycle that immediately follows the cycle containing `refDateStr`.
 *
 * Strategy: the current cycle ends on `cycleEndDay` of some month.  The next
 * cycle starts one calendar day later.
 *
 * Returns { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
 */
async function getNextCycleRange(refDateStr) {
  const startDaySetting = await Settings.findOne({ key: 'payroll_cycle_start_day' }).lean();
  const endDaySetting   = await Settings.findOne({ key: 'payroll_cycle_end_day' }).lean();

  const cycleStartDay = startDaySetting?.value != null
    ? parseInt(String(startDaySetting.value), 10) : 26;
  const cycleEndDay   = endDaySetting?.value != null
    ? parseInt(String(endDaySetting.value),   10) : 25;

  const pad = (n) => String(n).padStart(2, '0');
  const [refYear, refMonth, refDay] = refDateStr.split('-').map(Number);

  let nextStartDate, nextEndDate;

  if (cycleStartDay <= cycleEndDay) {
    // Cycle within same calendar month (e.g. 1–31)
    // Current cycle: cycleStartDay … cycleEndDay of refMonth/refYear
    // Next cycle:    cycleStartDay … cycleEndDay of following month
    const nextMonth = refMonth === 12 ? 1     : refMonth + 1;
    const nextYear  = refMonth === 12 ? refYear + 1 : refYear;
    nextStartDate = `${nextYear}-${pad(nextMonth)}-${pad(cycleStartDay)}`;
    nextEndDate   = `${nextYear}-${pad(nextMonth)}-${pad(cycleEndDay)}`;
  } else {
    // Cycle spans two months (e.g. 26th prev → 25th current)
    // Determine which half of the cross-month cycle refDateStr belongs to:
    //   start-half: day >= cycleStartDay  → current cycle is refMonth-cycleStartDay → nextMonth-cycleEndDay
    //   end-half:   day <= cycleEndDay    → current cycle is prevMonth-cycleStartDay → refMonth-cycleEndDay

    if (refDay >= cycleStartDay) {
      // We are in the START of the cycle (e.g. today is the 26th)
      // Current:  refMonth-cycleStartDay → (refMonth+1)-cycleEndDay
      // Next:     (refMonth+1)-cycleStartDay → (refMonth+2)-cycleEndDay
      const m1 = refMonth === 12 ? 1      : refMonth + 1;
      const y1 = refMonth === 12 ? refYear + 1 : refYear;
      const m2 = m1 === 12 ? 1  : m1 + 1;
      const y2 = m1 === 12 ? y1 + 1 : y1;
      nextStartDate = `${y1}-${pad(m1)}-${pad(cycleStartDay)}`;
      nextEndDate   = `${y2}-${pad(m2)}-${pad(cycleEndDay)}`;
    } else {
      // We are in the END of the cycle (e.g. today is the 25th = cycle end day)
      // Current:  (refMonth-1)-cycleStartDay → refMonth-cycleEndDay
      // Next:     refMonth-cycleStartDay     → (refMonth+1)-cycleEndDay
      const m2 = refMonth === 12 ? 1      : refMonth + 1;
      const y2 = refMonth === 12 ? refYear + 1 : refYear;
      nextStartDate = `${refYear}-${pad(refMonth)}-${pad(cycleStartDay)}`;
      nextEndDate   = `${y2}-${pad(m2)}-${pad(cycleEndDay)}`;
    }
  }

  return { startDate: nextStartDate, endDate: nextEndDate };
}

// ---------------------------------------------------------------------------
// Main service function
// ---------------------------------------------------------------------------

/**
 * Generate the next-cycle roster for all active employees that have
 * weekdayShiftSchedule enabled.
 *
 * @param {object}   opts
 * @param {string}   opts.refDateStr   - YYYY-MM-DD representing TODAY (the cycle-end date).
 * @param {ObjectId} opts.systemUserId - Used as `scheduledBy` on created entries.
 * @returns {Promise<{
 *   cycleRange:  { startDate: string, endDate: string },
 *   employees:   number,   // employees evaluated (have isEnabled=true + non-empty schedule)
 *   created:     number,
 *   skipped:     number,   // duplicates or days with no weekday mapping
 *   errors:      string[],
 * }>}
 */
async function generateNextCycleRoster({ refDateStr, systemUserId }) {
  const result = {
    cycleRange: null,
    employees:  0,
    created:    0,
    skipped:    0,
    errors:     [],
  };

  // ------------------------------------------------------------------
  // 1. Check global form settings toggle — if the feature is disabled
  //    org-wide, do nothing.
  // ------------------------------------------------------------------
  const formSettings = await EmployeeApplicationFormSettings.findOne({ isActive: true })
    .select('weekdayShiftSchedule')
    .lean();

  if (!formSettings?.weekdayShiftSchedule?.isEnabled) {
    console.log(`${TAG} weekdayShiftSchedule is disabled in form settings — skipping accrual.`);
    return result;
  }

  // ------------------------------------------------------------------
  // 2. Resolve the next payroll cycle date range
  // ------------------------------------------------------------------
  const cycleRange = await getNextCycleRange(refDateStr);
  result.cycleRange = cycleRange;
  const { startDate, endDate } = cycleRange;
  console.log(`${TAG} Next cycle: ${startDate} → ${endDate} (triggered on ${refDateStr})`);

  // ------------------------------------------------------------------
  // 3. Load all active employees with a canonical weekdayShiftSchedule.
  // ------------------------------------------------------------------
  const employees = await Employee.find({ is_active: true, leftDate: null })
    .select('emp_no doj weekdayShiftSchedule')
    .lean();

  const eligible = employees.filter((emp) => hasConfiguredWeekdaySchedule(emp.weekdayShiftSchedule));

  if (eligible.length === 0) {
    console.log(`${TAG} No employees with a configured weekday shift pattern — nothing to do.`);
    return result;
  }

  result.employees = eligible.length;
  console.log(`${TAG} Eligible employees: ${eligible.length}`);

  // Enumerate all dates in the next cycle once
  const allDates = getAllDatesInRange(startDate, endDate);

  // ------------------------------------------------------------------
  // 4. Build roster entries for each employee
  // ------------------------------------------------------------------
  const toInsert = [];

  for (const emp of eligible) {
    const empNo = String(emp.emp_no || '').toUpperCase();
    if (!empNo) continue;

    const schedule = Array.isArray(emp.weekdayShiftSchedule?.schedule)
      ? emp.weekdayShiftSchedule.schedule
      : [];

    // DOJ filter
    const dojStr = emp.doj ? extractISTComponents(emp.doj).dateStr : null;
    if (dojStr && dojStr > endDate) {
      console.log(`${TAG} Skipping ${empNo}: DOJ ${dojStr} is after next cycle end ${endDate}`);
      continue;
    }

    // Build weekday → { shiftId, isWeekOff } lookup map
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
      result.skipped++;
      continue;
    }

    for (const dateStr of allDates) {
      if (dojStr && dateStr < dojStr) continue;

      const wd   = getWeekday(dateStr);
      const cell = weekdayMap.get(wd);
      if (!cell) continue;

      if (cell.isWeekOff) {
        toInsert.push({
          employeeNumber: empNo,
          date:           dateStr,
          shiftId:        null,
          status:         'WO',
          notes:          'Week Off',
          scheduledBy:    systemUserId,
        });
      } else if (cell.shiftId) {
        toInsert.push({
          employeeNumber: empNo,
          date:           dateStr,
          shiftId:        cell.shiftId,
          status:         null,
          notes:          null,
          scheduledBy:    systemUserId,
        });
      }
    }
  }

  if (toInsert.length === 0) {
    console.log(`${TAG} No entries to insert (all weekdays unmapped or DOJ filters removed everything).`);
    return result;
  }

  // ------------------------------------------------------------------
  // 5. Bulk insert — ordered:false so a duplicate never aborts the batch
  // ------------------------------------------------------------------
  try {
    const insertResult = await PreScheduledShift.insertMany(toInsert, {
      ordered:   false,
      rawResult: true,
    });
    result.created = insertResult.insertedCount ?? toInsert.length;
  } catch (err) {
    if (err.code === 11000 || err.name === 'BulkWriteError') {
      const inserted = err.result?.nInserted ?? err.result?.result?.nInserted ?? 0;
      const dupes    = (err.writeErrors || err.result?.getWriteErrors?.() || []).length;
      result.created = inserted;
      result.skipped += dupes;
      console.log(`${TAG} Bulk insert partial: inserted=${inserted} duplicates=${dupes}`);
    } else {
      result.errors.push(err.message);
      console.error(`${TAG} Bulk insert failed:`, err.message);
    }
  }

  console.log(
    `${TAG} Done — employees=${result.employees} created=${result.created} skipped=${result.skipped} errors=${result.errors.length}`
  );
  return result;
}

module.exports = { generateNextCycleRoster };
