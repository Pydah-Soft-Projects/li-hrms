/**
 * Sync Week Offs and Holidays from Shift Roster to Attendance Daily
 *
 * Reads PreScheduledShift entries with status WO or HOL for a pay cycle and
 * creates/updates AttendanceDaily with WEEK_OFF or HOLIDAY so attendance
 * reflects the roster. Does NOT override days where the employee has punches
 * (in-time / biometric) — those are left as-is.
 *
 * Usage (from backend folder):
 *   node scripts/sync_roster_wo_hol_to_attendance.js
 *   MONTH=2026-02 node scripts/sync_roster_wo_hol_to_attendance.js   # that month's payroll cycle
 *   PREVIOUS=1 node scripts/sync_roster_wo_hol_to_attendance.js      # previous month's cycle (default: current)
 *
 * Env:
 *   MONTH     - YYYY-MM for the calendar month whose payroll cycle to sync (default: current month)
 *   PREVIOUS  - if 1, use previous calendar month's cycle instead
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const { getPayrollDateRange } = require('../shared/utils/dateUtils');

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not set in .env');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    let monthStr = process.env.MONTH;
    if (process.env.PREVIOUS === '1') {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      monthStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
      console.log(`Using previous month's cycle: ${monthStr}\n`);
    }
    if (!monthStr || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr)) {
      const now = new Date();
      monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      console.log(`Using current month's cycle: ${monthStr}\n`);
    }

    const [year, monthNum] = monthStr.split('-').map(Number);
    const { startDate, endDate } = await getPayrollDateRange(year, monthNum);
    console.log(`Payroll cycle range: ${startDate} to ${endDate}\n`);

    const rosterEntries = await PreScheduledShift.find({
      date: { $gte: startDate, $lte: endDate },
      status: { $in: ['WO', 'HOL'] },
    })
      .select('employeeNumber date status')
      .lean();

    if (rosterEntries.length === 0) {
      console.log('No WO/HOL roster entries found in this range. Nothing to sync.');
      process.exit(0);
    }

    console.log(`Found ${rosterEntries.length} WO/HOL roster entries to sync to attendance.\n`);

    let created = 0;
    let updated = 0;
    let skippedHasPunches = 0;

    function hasPunches(daily) {
      if (!daily) return false;
      if (daily.totalWorkingHours > 0) return true;
      if (daily.shifts && daily.shifts.length > 0) {
        const hasInPunch = daily.shifts.some((s) => s && s.inTime);
        if (hasInPunch) return true;
      }
      return false;
    }

    for (const entry of rosterEntries) {
      const empNo = String(entry.employeeNumber || '').toUpperCase();
      const dateStr = String(entry.date || '').split('T')[0];
      if (!empNo || !dateStr) continue;

      const status = entry.status === 'WO' ? 'WEEK_OFF' : 'HOLIDAY';
      const updateFields = {
        status,
        shifts: [],
        totalWorkingHours: 0,
        totalOTHours: 0,
        notes: entry.status === 'WO' ? 'Week Off' : 'Holiday',
      };

      let daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dateStr });

      if (!daily) {
        daily = new AttendanceDaily({
          employeeNumber: empNo,
          date: dateStr,
          ...updateFields,
          source: [],
        });
        await daily.save();
        created++;
      } else {
        if (hasPunches(daily)) {
          skippedHasPunches++;
          continue;
        }
        daily.status = updateFields.status;
        daily.shifts = updateFields.shifts;
        daily.totalWorkingHours = updateFields.totalWorkingHours;
        daily.totalOTHours = updateFields.totalOTHours;
        daily.notes = updateFields.notes;
        // Avoid validation error: source enum only allows mssql|excel|manual|biometric-realtime
        if (daily.source && daily.source.includes('roster-sync')) {
          daily.source = daily.source.filter((s) => s !== 'roster-sync');
        }
        await daily.save();
        updated++;
      }
    }

    console.log('Done.');
    console.log(`  Created: ${created}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped (has punches): ${skippedHasPunches}`);
    console.log(`  Total synced: ${created + updated}`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
    process.exit(0);
  }
}

run();
