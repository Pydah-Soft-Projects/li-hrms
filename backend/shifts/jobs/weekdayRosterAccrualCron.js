/**
 * Weekday Roster Accrual Cron
 *
 * Runs at 23:55 IST every calendar day.
 * On the payroll cycle END date only, generates PreScheduledShift entries
 * for the NEXT pay cycle for every active employee whose weekdayShiftSchedule
 * is enabled and non-empty.
 *
 * Employees with no weekdayShiftSchedule configured are skipped entirely.
 * Holidays are NOT written — the holiday module handles those separately.
 */

'use strict';

const cron = require('node-cron');
const { generateNextCycleRoster } = require('../services/weekdayRosterAccrualService');
const Settings = require('../../settings/model/Settings');
const User     = require('../../users/model/User');
const { getTodayISTDateString } = require('../../shared/utils/dateUtils');

const CRON_IST = '55 23 * * *';   // 23:55 every day in IST
const TIMEZONE = 'Asia/Kolkata';
const TAG      = '[WeekdayRosterAccrualCron]';

let scheduledTask = null;

/**
 * Resolve today's payroll cycle end date in IST.
 * Returns YYYY-MM-DD string.
 */
async function getTodaysCycleEndDate() {
  const startDaySetting = await Settings.findOne({ key: 'payroll_cycle_start_day' }).lean();
  const endDaySetting   = await Settings.findOne({ key: 'payroll_cycle_end_day' }).lean();

  const cycleStartDay = startDaySetting?.value != null
    ? parseInt(String(startDaySetting.value), 10) : 26;
  const cycleEndDay   = endDaySetting?.value != null
    ? parseInt(String(endDaySetting.value),   10) : 25;

  const pad    = (n) => String(n).padStart(2, '0');
  const todayStr = getTodayISTDateString();                // YYYY-MM-DD in IST
  const [y, m]   = todayStr.split('-').map(Number);

  // Build the cycle-end date for the cycle that contains today
  let cycleEndStr;
  if (cycleStartDay <= cycleEndDay) {
    // Cycle within same calendar month (e.g. 1–31)
    cycleEndStr = `${y}-${pad(m)}-${pad(cycleEndDay)}`;
  } else {
    // Cross-month cycle (e.g. 26 → 25)
    // If today's day <= cycleEndDay  → end is this month
    // If today's day >= cycleStartDay → end is next month
    const todayDay = parseInt(todayStr.split('-')[2], 10);
    if (todayDay <= cycleEndDay) {
      cycleEndStr = `${y}-${pad(m)}-${pad(cycleEndDay)}`;
    } else {
      const nextMonth = m === 12 ? 1      : m + 1;
      const nextYear  = m === 12 ? y + 1  : y;
      cycleEndStr = `${nextYear}-${pad(nextMonth)}-${pad(cycleEndDay)}`;
    }
  }

  return { todayStr, cycleEndStr };
}

/**
 * Resolve a system-level User _id to use as scheduledBy.
 * Prefers the first active super_admin; falls back to any active user.
 */
async function resolveSystemUserId() {
  const su = await User.findOne({ role: 'super_admin' }).select('_id').lean();
  if (su) return su._id;
  const any = await User.findOne({}).select('_id').lean();
  return any ? any._id : null;
}

// ---------------------------------------------------------------------------

function startWeekdayRosterAccrualCron() {
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule(
    CRON_IST,
    async () => {
      try {
        const { todayStr, cycleEndStr } = await getTodaysCycleEndDate();

        // Only run on the actual cycle end date
        if (todayStr !== cycleEndStr) {
          return; // silent — not the end date today
        }

        console.log(
          `${TAG} Payroll cycle end date reached (${cycleEndStr}). Generating next-cycle weekday roster…`
        );

        const systemUserId = await resolveSystemUserId();
        if (!systemUserId) {
          console.error(`${TAG} No user found in DB — cannot set scheduledBy. Aborting.`);
          return;
        }

        const result = await generateNextCycleRoster({
          refDateStr:   todayStr,
          systemUserId,
        });

        console.log(
          `${TAG} Complete — nextCycle=${result.cycleRange?.startDate}→${result.cycleRange?.endDate} ` +
          `employees=${result.employees} created=${result.created} skipped=${result.skipped} ` +
          `errors=${result.errors.length}`
        );

        if (result.errors.length > 0) {
          console.warn(`${TAG} Errors (first 5):`, result.errors.slice(0, 5));
        }
      } catch (err) {
        console.error(`${TAG} Unhandled error:`, err.message);
      }
    },
    { timezone: TIMEZONE }
  );

  console.log(
    `${TAG} Scheduled: ${CRON_IST} (${TIMEZONE}) — runs on each payroll cycle end date to seed the next cycle's shift roster`
  );

  return scheduledTask;
}

function stopWeekdayRosterAccrualCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log(`${TAG} Stopped`);
  }
}

module.exports = { startWeekdayRosterAccrualCron, stopWeekdayRosterAccrualCron };
