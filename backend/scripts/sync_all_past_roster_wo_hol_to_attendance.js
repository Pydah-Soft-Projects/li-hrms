/**
 * Sync ALL past roster Week-Offs and Holidays to Attendance Daily
 *
 * Reads PreScheduledShift entries with status WO or HOL (optionally in a date range),
 * and creates/updates AttendanceDaily with WEEK_OFF or HOLIDAY.
 *
 * Rules (evaluated per day, not per employee):
 * - Each roster WO/HOL entry is one (employee, date). We decide only for that day.
 * - If no AttendanceDaily for that day → CREATE one with WEEK_OFF or HOLIDAY.
 * - If AttendanceDaily for that day has NO punches → UPDATE to WEEK_OFF or HOLIDAY.
 * - If AttendanceDaily for that day HAS punches (e.g. OD, biometric) → SKIP THAT DAY ONLY. Other WO/HOL days for the same employee are still synced. No data is removed or changed.
 *
 * Usage (from project root):
 *   node backend/scripts/sync_all_past_roster_wo_hol_to_attendance.js
 *
 * From backend folder:
 *   node scripts/sync_all_past_roster_wo_hol_to_attendance.js
 *
 * Env (optional):
 *   START_DATE  - YYYY-MM-DD  Start of date range (inclusive). Default: no start = all past.
 *   END_DATE    - YYYY-MM-DD  End of date range (inclusive). Default: today (only past dates).
 *   DRY_RUN=1   - If set, only log what would be done; do not write to DB.
 *
 * Examples:
 *   node scripts/sync_all_past_roster_wo_hol_to_attendance.js
 *     → Syncs all roster WO/HOL where date <= today.
 *   END_DATE=2025-12-31 node scripts/sync_all_past_roster_wo_hol_to_attendance.js
 *     → Syncs all roster WO/HOL with date <= 2025-12-31.
 *   START_DATE=2025-01-01 END_DATE=2025-06-30 node scripts/sync_all_past_roster_wo_hol_to_attendance.js
 *     → Syncs only roster WO/HOL in that range.
 *   DRY_RUN=1 node scripts/sync_all_past_roster_wo_hol_to_attendance.js
 *     → No DB writes; only prints counts and sample.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');

/** True only if this single day's record has punch/OD data (do not touch). Used per (employee, date) only. */
function hasPunches(daily) {
  if (!daily) return false;
  if (daily.totalWorkingHours > 0) return true;
  if (daily.shifts && daily.shifts.length > 0) {
    const hasInPunch = daily.shifts.some((s) => s && s.inTime);
    if (hasInPunch) return true;
  }
  return false;
}

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not set in .env');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    const dryRun = process.env.DRY_RUN === '1';
    if (dryRun) {
      console.log('DRY RUN: no data will be written.\n');
    }

    const endDate = process.env.END_DATE || todayString();
    const startDate = process.env.START_DATE || null;

    const dateQuery = { $lte: endDate };
    if (startDate) dateQuery.$gte = startDate;

    const rosterEntries = await PreScheduledShift.find({
      date: dateQuery,
      status: { $in: ['WO', 'HOL'] },
    })
      .select('employeeNumber date status')
      .sort({ date: 1 })
      .lean();

    if (rosterEntries.length === 0) {
      console.log('No WO/HOL roster entries found in the selected range. Nothing to sync.');
      process.exit(0);
    }

    console.log(`Date range: ${startDate || '(any past)'} to ${endDate}`);
    console.log(`Found ${rosterEntries.length} WO/HOL roster entries to process.\n`);

    let created = 0;
    let updated = 0;
    let skippedHasPunches = 0;
    let skippedOther = 0;

    const BATCH_SIZE = 500;
    for (let i = 0; i < rosterEntries.length; i += BATCH_SIZE) {
      const batch = rosterEntries.slice(i, i + BATCH_SIZE);
      for (const entry of batch) {
        const empNo = String(entry.employeeNumber || '').toUpperCase();
        const dateStr = String(entry.date || '').split('T')[0];
        if (!empNo || !dateStr) {
          skippedOther++;
          continue;
        }

        // Decide only for this (employee, date) day. Other days for same employee are independent.
        const status = entry.status === 'WO' ? 'WEEK_OFF' : 'HOLIDAY';
        const updateFields = {
          status,
          shifts: [],
          totalWorkingHours: 0,
          totalOTHours: 0,
          notes: entry.status === 'WO' ? 'Week Off' : 'Holiday',
        };

        let daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dateStr });

        // Skip only this day if it has punches (e.g. OD). Do not skip other WO/HOL days of this employee.
        if (hasPunches(daily)) {
          skippedHasPunches++;
          continue;
        }

        if (dryRun) {
          if (!daily) created++;
          else updated++;
          continue;
        }

        if (!daily) {
          daily = new AttendanceDaily({
            employeeNumber: empNo,
            date: dateStr,
            ...updateFields,
            source: ['roster-sync'],
          });
          await daily.save();
          created++;
        } else {
          daily.status = updateFields.status;
          daily.shifts = updateFields.shifts;
          daily.totalWorkingHours = updateFields.totalWorkingHours;
          daily.totalOTHours = updateFields.totalOTHours;
          daily.notes = updateFields.notes;
          if (!daily.source || !Array.isArray(daily.source)) daily.source = [];
          if (!daily.source.includes('roster-sync')) daily.source.push('roster-sync');
          await daily.save();
          updated++;
        }
      }
      if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= rosterEntries.length) {
        console.log(`  Processed ${Math.min(i + BATCH_SIZE, rosterEntries.length)} / ${rosterEntries.length} roster entries...`);
      }
    }

    console.log('\nDone.');
    console.log(`  Created: ${created}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped (that day only has punches – not touched): ${skippedHasPunches}`);
    if (skippedOther) console.log(`  Skipped (invalid entry): ${skippedOther}`);
    console.log(`  Total synced (created + updated): ${created + updated}`);
    if (dryRun) {
      console.log('\n(DRY RUN – no changes were written.)');
    }
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
